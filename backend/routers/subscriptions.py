from datetime import datetime
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy import insert, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.schema import Subscription, SenderSummary
from routers.gmail import get_current_user_and_token

router = APIRouter()


class SubscriptionIn(BaseModel):
    sender_domain: str
    display_name: str | None = None
    renewal_date: str | None = None  # ISO date string (optional)


class SubscriptionOut(BaseModel):
    id: str
    sender_domain: str
    display_name: str | None = None
    is_active: bool
    renewal_date: str | None = None
    created_at: str


@router.get("/subscriptions", response_model=list[SubscriptionOut])
async def list_subscriptions(request: Request, auth: dict[str, str] = Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

    async with request.app.state.db_session() as session:
        result = await session.execute(select(Subscription).where(Subscription.user_id == uid))
        rows = result.scalars().all()

    out = [
        SubscriptionOut(
            id=str(r.id),
            sender_domain=r.sender_domain,
            display_name=r.display_name,
            is_active=bool(r.is_active),
            renewal_date=r.renewal_date.isoformat() if r.renewal_date else None,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
    return out


@router.post("/subscriptions", response_model=SubscriptionOut)
async def create_subscription(body: SubscriptionIn, request: Request, auth: dict[str, str] = Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

    sub = Subscription(
        user_id=uid,
        sender_domain=body.sender_domain.lower(),
        display_name=body.display_name,
        renewal_date=datetime.fromisoformat(body.renewal_date) if body.renewal_date else None,
    )

    async with request.app.state.db_session() as session:
        session.add(sub)
        try:
            await session.commit()
            await session.refresh(sub)
        except Exception as exc:
            await session.rollback()
            raise HTTPException(status_code=400, detail=f"could not create subscription: {exc}")

    return SubscriptionOut(
        id=str(sub.id),
        sender_domain=sub.sender_domain,
        display_name=sub.display_name,
        is_active=bool(sub.is_active),
        renewal_date=sub.renewal_date.isoformat() if sub.renewal_date else None,
        created_at=sub.created_at.isoformat(),
    )


@router.delete("/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, request: Request, auth: dict[str, str] = Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

    sid = uuid_mod.UUID(sub_id) if isinstance(sub_id, str) else sub_id
    async with request.app.state.db_session() as session:
        result = await session.execute(select(Subscription).where(Subscription.id == sid).where(Subscription.user_id == uid))
        sub = result.scalar_one_or_none()
        if not sub:
            raise HTTPException(status_code=404, detail="subscription not found")
        await session.execute(delete(Subscription).where(Subscription.id == sid))
        await session.commit()

    return {"ok": True}


@router.get("/subscriptions/alerts")
async def get_subscription_alerts(request: Request, auth: dict[str, str] = Depends(get_current_user_and_token)) -> Any:
    """Return simple alerts for subscriptions: unread count and newest email date from SenderSummary."""
    user_id = auth["user_id"]
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

    async with request.app.state.db_session() as session:
        subs_res = await session.execute(select(Subscription).where(Subscription.user_id == uid))
        subs = subs_res.scalars().all()

        if not subs:
            return {"alerts": []}

        domains = [s.sender_domain for s in subs]
        senders_res = await session.execute(select(SenderSummary).where(SenderSummary.user_id == uid))
        senders = senders_res.scalars().all()

    senders_map = {s.sender_domain: s for s in senders}
    alerts = []
    for s in subs:
        info = senders_map.get(s.sender_domain)
        alerts.append(
            {
                "subscription_id": str(s.id),
                "domain": s.sender_domain,
                "display_name": s.display_name,
                "is_active": bool(s.is_active),
                "total": info.total_count if info else 0,
                "unread": info.unread_count if info else 0,
                "newest": info.newest_email.isoformat() if info and info.newest_email else None,
            }
        )

    return {"alerts": alerts}
