import uuid
from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import decrypt_token
from models.schema import ActionLog, ScanJob, SenderSummary, User
from services import gmail_service

logger = structlog.get_logger()
router = APIRouter(prefix="/gmail", tags=["gmail"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class BulkDeleteRequest(BaseModel):
    sender_domain: str
    before_date: datetime | None = None
    dry_run: bool = True  # safe by default — SEMPRE confirmar antes

    @field_validator("sender_domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        import re
        # Bloqueia injection na query Gmail
        if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", v):
            raise ValueError("Invalid domain format")
        return v.lower()

    @field_validator("before_date")
    @classmethod
    def validate_past_date(cls, v: datetime | None) -> datetime | None:
        if v and v > datetime.utcnow():
            raise ValueError("before_date must be in the past")
        return v


class ExecuteActionRequest(BaseModel):
    action_id: str  # ID do ActionLog — confirma que usuário viu o preview


class OrganizeRequest(BaseModel):
    plan_id: str
    confirmed: bool


# ─── Dependencies ─────────────────────────────────────────────────────────────

async def get_current_user_and_token(request: Request):
    """
    Extrai user_id da sessão e decripta o access token.
    userId SEMPRE da sessão — nunca do body.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with request.app.state.db_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user or not user.encrypted_refresh_token:
        raise HTTPException(status_code=401, detail="No valid credentials")

    try:
        refresh_token = decrypt_token(user.encrypted_refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Troca refresh_token por access_token fresco
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    from core.config import get_settings

    settings = get_settings()
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )
    creds.refresh(GoogleRequest())

    return {"user_id": user_id, "access_token": creds.token}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/senders")
async def get_senders(request: Request):
    """Retorna agregação de remetentes do cache local (rápido)."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(SenderSummary)
            .where(SenderSummary.user_id == user_id)
            .order_by(SenderSummary.total_count.desc())
            .limit(200)
        )
        senders = result.scalars().all()

    return [
        {
            "domain": s.sender_domain,
            "display_name": s.display_name or s.sender_domain,
            "ai_category": s.ai_category,
            "total": s.total_count,
            "unread": s.unread_count,
            "oldest": s.oldest_email,
            "newest": s.newest_email,
            "has_unsubscribe": s.has_unsubscribe,
        }
        for s in senders
    ]


@router.post("/scan")
async def start_scan(request: Request, auth=Depends(get_current_user_and_token)):
    """
    Inicia scraping assíncrono do mailbox.
    Retorna scan_job_id para acompanhar progresso via SSE.
    """
    from workers.scraper import scan_inbox
    from core.security import encrypt_token

    user_id = auth["user_id"]
    scan_job_id = str(uuid.uuid4())

    async with request.app.state.db_session() as session:
        job = ScanJob(id=scan_job_id, user_id=user_id)
        session.add(job)
        await session.commit()

    # Encripta o access_token para passar ao worker — nunca em texto plano na fila
    encrypted_token = encrypt_token(auth["access_token"])

    scan_inbox.delay(
        user_id=user_id,
        encrypted_token=encrypted_token,
        scan_job_id=scan_job_id,
    )

    return {"scan_job_id": scan_job_id}


@router.get("/scan/{scan_job_id}/progress")
async def scan_progress(scan_job_id: str, request: Request):
    """SSE endpoint — frontend polling de progresso do scan."""
    from fastapi.responses import StreamingResponse
    import asyncio
    import json

    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    async def event_stream():
        while True:
            async with request.app.state.db_session() as session:
                result = await session.execute(
                    select(ScanJob).where(
                        ScanJob.id == scan_job_id,
                        ScanJob.user_id == user_id,  # IDOR guard
                    )
                )
                job = result.scalar_one_or_none()

            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            payload = {
                "status": job.status,
                "indexed": job.total_indexed,
                "total": job.total_estimated or 0,
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if job.status in ("done", "failed"):
                break

            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/bulk-delete/preview")
async def bulk_delete_preview(
    body: BulkDeleteRequest,
    request: Request,
    auth=Depends(get_current_user_and_token),
):
    """
    PASSO 1: Preview do que será deletado — obrigatório antes de executar.
    Cria um ActionLog com status 'pending' e dry_run=True.
    """
    user_id = auth["user_id"]

    query = f"from:{body.sender_domain}"
    if body.before_date:
        query += f" before:{body.before_date.strftime('%Y/%m/%d')}"

    result = await gmail_service.bulk_delete_by_query(
        access_token=auth["access_token"],
        query=query,
        dry_run=True,
    )

    # Cria log da ação pendente — usuário ainda não confirmou
    async with request.app.state.db_session() as session:
        action = ActionLog(
            user_id=user_id,
            action_type="bulk_delete",
            target=body.sender_domain,
            gmail_query=query,
            affected_count=result["affected"],
            status="pending",
            dry_run=True,
        )
        session.add(action)
        await session.commit()
        action_id = str(action.id)

    return {
        "action_id": action_id,
        "affected": result["affected"],
        "query": query,
        "message": f"Serão movidos {result['affected']} emails para a lixeira. Confirme para executar.",
    }


@router.post("/bulk-delete/execute")
async def bulk_delete_execute(
    body: ExecuteActionRequest,
    request: Request,
    auth=Depends(get_current_user_and_token),
):
    """
    PASSO 2: Executa a deleção após confirmação explícita do usuário.
    Requer action_id do preview — prova que o usuário viu o impacto.
    """
    user_id = auth["user_id"]

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(ActionLog).where(
                ActionLog.id == body.action_id,
                ActionLog.user_id == user_id,  # IDOR guard — dono da ação
                ActionLog.status == "pending",
            )
        )
        action = result.scalar_one_or_none()

    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already executed")

    # Marca como running
    async with request.app.state.db_session() as session:
        await session.execute(
            update(ActionLog)
            .where(ActionLog.id == action.id)
            .values(status="running", confirmed_at=datetime.utcnow(), dry_run=False)
        )
        await session.commit()

    try:
        exec_result = await gmail_service.bulk_delete_by_query(
            access_token=auth["access_token"],
            query=action.gmail_query,
            dry_run=False,
        )

        async with request.app.state.db_session() as session:
            await session.execute(
                update(ActionLog)
                .where(ActionLog.id == action.id)
                .values(status="done", completed_at=datetime.utcnow())
            )
            await session.commit()

        logger.info(
            "bulk_delete_executed",
            user_id=user_id,
            domain=action.target,
            affected=exec_result["affected"],
        )
        return exec_result

    except Exception as e:
        async with request.app.state.db_session() as session:
            await session.execute(
                update(ActionLog)
                .where(ActionLog.id == action.id)
                .values(status="failed", error=str(e))
            )
            await session.commit()
        raise HTTPException(status_code=500, detail="Delete operation failed")
