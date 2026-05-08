import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from core.plans import require_feature
from models.schema import AutoRule, User
from routers.gmail import get_current_user, get_current_user_and_token

logger = structlog.get_logger()
router = APIRouter()

class CreateRuleRequest(BaseModel):
    name: str
    condition_type: str
    condition_value: str
    action_type: str
    is_active: bool = True


@router.get("")
async def list_rules(request: Request, auth=Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(AutoRule)
            .where(AutoRule.user_id == user_id)
            .order_by(AutoRule.created_at.desc())
        )
        rules = result.scalars().all()
        
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "condition_type": r.condition_type,
            "condition_value": r.condition_value,
            "action_type": r.action_type,
            "is_active": r.is_active,
            "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rules
    ]


@router.post("")
async def create_rule(
    body: CreateRuleRequest,
    request: Request,
    auth=Depends(get_current_user_and_token),
    current_user: User = Depends(get_current_user),
):
    require_feature(current_user.plan, "auto_rules")
    user_id = auth["user_id"]
    async with request.app.state.db_session() as session:
        rule = AutoRule(
            user_id=user_id,
            name=body.name,
            condition_type=body.condition_type,
            condition_value=body.condition_value,
            action_type=body.action_type,
            is_active=body.is_active,
        )
        session.add(rule)
        await session.commit()
        return {"id": str(rule.id)}


@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, request: Request, auth=Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(AutoRule).where(AutoRule.id == rule_id, AutoRule.user_id == user_id)
        )
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
            
        await session.delete(rule)
        await session.commit()
    return {"status": "success"}


@router.patch("/{rule_id}/toggle")
async def toggle_rule(rule_id: str, request: Request, auth=Depends(get_current_user_and_token)):
    user_id = auth["user_id"]
    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(AutoRule).where(AutoRule.id == rule_id, AutoRule.user_id == user_id)
        )
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
            
        rule.is_active = not rule.is_active
        await session.commit()
        
    return {"status": "success", "is_active": rule.is_active}
