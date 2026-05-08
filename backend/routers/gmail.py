import uuid
import asyncio
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, update

from core.security import decrypt_token
from models.schema import ActionLog, EmailMetadata, PlanType, ScanJob, SenderSummary, User
from services import ai_service, gmail_service
from sqlalchemy import delete

logger = structlog.get_logger()
router = APIRouter(prefix="/gmail", tags=["gmail"])

FREE_DELETION_LIMIT = 50


class BulkDeleteRequest(BaseModel):
    sender_domain: str
    before_date: datetime | None = None
    dry_run: bool = True

    @field_validator("sender_domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        import re
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
    action_id: str


class OrganizeRequest(BaseModel):
    plan_id: str
    confirmed: bool


class EmailDetailResponse(BaseModel):
    message_id: str
    subject: str | None = None
    sender_email: str
    sender_domain: str
    received_at: datetime | None = None
    snippet: str | None = None
    body_html: str | None = None
    body_text: str | None = None
    has_attachment: bool = False


async def get_current_user(request: Request) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    async with request.app.state.db_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


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


@router.get("/senders")
async def get_senders(request: Request):
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


@router.post("/classify")
async def classify_senders_endpoint(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Classifica remetentes do usuário usando IA em batch. Atualiza ai_category em sender_summary."""
    user_id = str(current_user.id)

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(SenderSummary)
            .where(SenderSummary.user_id == user_id)
            .order_by(SenderSummary.total_count.desc())
        )
        senders_db = result.scalars().all()

    if not senders_db:
        return {"classified": 0}

    senders_payload = [
        {
            "domain": s.sender_domain,
            "display_name": s.display_name or s.sender_domain,
            "count": s.total_count,
            "sample_subjects": [],
        }
        for s in senders_db
    ]

    try:
        classifications = await ai_service.classify_senders(senders_payload)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI classification error: {e}")

    classified_count = 0
    async with request.app.state.db_session() as session:
        for domain, classification in classifications.items():
            await session.execute(
                update(SenderSummary)
                .where(
                    SenderSummary.user_id == user_id,
                    SenderSummary.sender_domain == domain,
                )
                .values(ai_category=classification.category)
            )
            classified_count += 1
        await session.commit()

    logger.info(
        "senders_classified",
        user_id=user_id,
        total_senders=len(senders_db),
        classified=classified_count,
    )

    return {"classified": classified_count}


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
    current_user: User = Depends(get_current_user),
):
    """
    PASSO 2: Executa a deleção após confirmação explícita do usuário.
    Requer action_id do preview — prova que o usuário viu o impacto.
    """
    user_id = auth["user_id"]

    if current_user.plan == PlanType.free:
        now = datetime.utcnow()
        needs_reset = (
            not current_user.deletions_month_reset
            or current_user.deletions_month_reset.year != now.year
            or current_user.deletions_month_reset.month != now.month
        )
        if needs_reset:
            async with request.app.state.db_session() as _s:
                await _s.execute(
                    update(User)
                    .where(User.id == current_user.id)
                    .values(deletions_this_month=0, deletions_month_reset=now)
                )
                await _s.commit()
            current_user.deletions_this_month = 0
            current_user.deletions_month_reset = now

        if current_user.deletions_this_month >= FREE_DELETION_LIMIT:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "deletion_limit_reached",
                    "message": f"Você atingiu o limite de {FREE_DELETION_LIMIT} exclusões mensais do plano Free. Faça upgrade para o Pro para exclusões ilimitadas.",
                    "upgrade_url": "/dashboard/settings?tab=plans",
                    "used": current_user.deletions_this_month,
                    "limit": FREE_DELETION_LIMIT,
                },
            )

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(ActionLog).where(
                ActionLog.id == body.action_id,
                ActionLog.user_id == user_id,  # IDOR guard
                ActionLog.status == "pending",
            )
        )
        action = result.scalar_one_or_none()

    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already executed")

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

        emails_deleted = exec_result.get("affected", 0)

        async with request.app.state.db_session() as session:
            await session.execute(
                update(ActionLog)
                .where(ActionLog.id == action.id)
                .values(status="done", completed_at=datetime.utcnow())
            )
            if current_user.plan == PlanType.free and emails_deleted > 0:
                await session.execute(
                    update(User)
                    .where(User.id == current_user.id)
                    .values(deletions_this_month=User.deletions_this_month + emails_deleted)
                )
            await session.commit()

        logger.info(
            "bulk_delete_executed",
            user_id=user_id,
            domain=action.target,
            affected=emails_deleted,
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


@router.get("/emails")
async def get_emails_by_domain(
    domain: str,
    request: Request,
    limit: int = 5,
    offset: int = 0,
):
    """Retorna emails paginados de um domínio com total para o accordion."""
    import re

    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", domain):
        raise HTTPException(status_code=422, detail="Invalid domain format")

    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    domain_lower = domain.lower()

    async with request.app.state.db_session() as session:
        total_result = await session.execute(
            select(func.count()).select_from(EmailMetadata).where(
                EmailMetadata.user_id == user_id,
                EmailMetadata.sender_domain == domain_lower,
            )
        )
        total = total_result.scalar_one()

        items_result = await session.execute(
            select(EmailMetadata)
            .where(
                EmailMetadata.user_id == user_id,
                EmailMetadata.sender_domain == domain_lower,
            )
            .order_by(EmailMetadata.date.desc())
            .limit(limit)
            .offset(offset)
        )
        emails = items_result.scalars().all()

    return {
        "items": [
            {
                "message_id": e.id,
                "subject": e.subject,
                "sender": e.sender,
                "received_at": e.date.isoformat() if e.date else None,
                "has_unsubscribe": e.has_unsubscribe,
            }
            for e in emails
        ],
        "total": total,
    }


@router.get("/email/{message_id}", response_model=EmailDetailResponse)
async def get_email_by_id(message_id: str, request: Request, auth=Depends(get_current_user_and_token)) -> EmailDetailResponse:
    user_id = auth["user_id"]

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(EmailMetadata).where(
                EmailMetadata.id == message_id,
                EmailMetadata.user_id == user_id,
            )
        )
        email: EmailMetadata | None = result.scalar_one_or_none()

    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    access_token = auth["access_token"]
    gmail = gmail_service._build_gmail(access_token)

    try:
        msg = await gmail_service._rate_limited_call(
            gmail.users().messages().get(userId="me", id=message_id, format="full").execute
        )
    except Exception as e:
        logger.error("gmail_get_message_failed", message_id=message_id, error=str(e))
        raise HTTPException(status_code=502, detail="Failed to fetch message from Gmail")

    headers = msg.get("payload", {}).get("headers", [])
    header_map = {h["name"].lower(): h["value"] for h in headers}
    subject = header_map.get("subject") or email.subject or "(sem assunto)"

    from email.utils import parseaddr, parsedate_to_datetime

    _, sender_email = parseaddr(header_map.get("from", ""))
    sender_email = sender_email.lower() if sender_email else ""

    try:
        received_at = parsedate_to_datetime(header_map.get("date", ""))
        if received_at is not None:
            received_at = received_at.replace(tzinfo=None)
    except Exception:
        received_at = email.date

    snippet = msg.get("snippet")

    import base64

    def decode_b64url(data: str) -> str:
        if not data:
            return ""
        data_str = data.replace("\n", "").replace("\r", "")
        padding = -len(data_str) % 4
        data_str += "=" * padding
        try:
            return base64.urlsafe_b64decode(data_str).decode("utf-8", errors="replace")
        except Exception:
            return ""

    body_html: str | None = None
    body_text: str | None = None
    has_attachment = False

    def walk_parts(part: dict):
        nonlocal body_html, body_text, has_attachment
        mime = part.get("mimeType", "")

        if part.get("filename") and part.get("filename").strip():
            has_attachment = True

        body = part.get("body", {})
        data = body.get("data")
        if data and mime:
            text = decode_b64url(data)
            if mime == "text/html":
                if not body_html:
                    body_html = text
            elif mime == "text/plain":
                if not body_text:
                    body_text = text

        for sub in part.get("parts", []) or []:
            walk_parts(sub)

    payload = msg.get("payload", {})
    if payload.get("body", {}) and payload.get("body", {}).get("data"):
        mime = payload.get("mimeType", "")
        data = payload.get("body", {}).get("data")
        if data:
            text = decode_b64url(data)
            if mime == "text/html":
                body_html = text
            elif mime == "text/plain":
                body_text = text

    for part in payload.get("parts", []) or []:
        walk_parts(part)

    return EmailDetailResponse(
        message_id=message_id,
        subject=subject,
        sender_email=sender_email,
        sender_domain=email.sender_domain,
        received_at=received_at,
        snippet=snippet,
        body_html=body_html,
        body_text=body_text,
        has_attachment=has_attachment,
    )


@router.post("/unsubscribe/{domain}")
async def unsubscribe_domain(domain: str, request: Request, auth=Depends(get_current_user_and_token)):
    """
    Attempts to unsubscribe from a sender domain.
    - If unsubscribe_url stored and starts with http: perform POST to that URL (SSRF-guarded)
    - If it's mailto: send an email via Gmail API messages.send()
    Updates SenderSummary.has_unsubscribe and records ActionLog of type 'unsub'.
    """
    user_id = auth["user_id"]
    access_token = auth["access_token"]

    import re
    if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", domain):
        raise HTTPException(status_code=422, detail="Invalid domain format")

    domain_lower = domain.lower()

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(EmailMetadata)
            .where(
                EmailMetadata.user_id == user_id,
                EmailMetadata.sender_domain == domain_lower,
                EmailMetadata.has_unsubscribe == True,
            )
            .limit(1)
        )
        email = result.scalar_one_or_none()

    if not email:
        async with request.app.state.db_session() as session:
            session.add(ActionLog(
                user_id=user_id,
                action_type="unsubscribe",
                target=domain_lower,
                gmail_query=None,
                affected_count=0,
                status="done",
                dry_run=True,
            ))
            await session.commit()
        raise HTTPException(status_code=404, detail="No unsubscribe information found for this domain")

    unsub_url = email.unsubscribe_url
    if not unsub_url:
        unsub_url = f"mailto:unsubscribe@{domain_lower}"

    async with request.app.state.db_session() as session:
        action = ActionLog(
            user_id=user_id,
            action_type="unsubscribe",
            target=domain_lower,
            gmail_query=None,
            affected_count=1,
            status="running",
            dry_run=False,
            confirmed_at=datetime.utcnow(),
        )
        session.add(action)
        await session.commit()

    try:
        if unsub_url.lower().startswith("http://") or unsub_url.lower().startswith("https://"):
            from core.security import safe_unsubscribe
            ok = await safe_unsubscribe(unsub_url)
            status = "success" if ok else "failed"

        elif unsub_url.lower().startswith("mailto:") or "@" in unsub_url:
            import base64
            from email.mime.text import MIMEText

            mailto_addr = unsub_url.replace("mailto:", "").split("?")[0].strip()
            msg = MIMEText("unsubscribe")
            msg["to"] = mailto_addr
            msg["subject"] = "unsubscribe"

            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
            gmail = gmail_service._build_gmail(access_token)
            await asyncio.to_thread(lambda: gmail.users().messages().send(userId="me", body={"raw": raw}).execute())
            status = "success"

        else:
            status = "failed"

        async with request.app.state.db_session() as session:
            await session.execute(
                update(SenderSummary)
                .where(SenderSummary.user_id == user_id, SenderSummary.sender_domain == domain_lower)
                .values(has_unsubscribe=True)
            )
            await session.execute(
                update(EmailMetadata)
                .where(EmailMetadata.user_id == user_id, EmailMetadata.sender_domain == domain_lower)
                .values(has_unsubscribe=True)
            )
            await session.execute(
                update(ActionLog)
                .where(ActionLog.id == action.id)
                .values(status=status, completed_at=datetime.utcnow())
            )
            await session.commit()

        return {"ok": status == "success", "status": status, "domain": domain_lower}

    except Exception as e:
        async with request.app.state.db_session() as session:
            await session.execute(
                update(ActionLog)
                .where(ActionLog.id == action.id)
                .values(status="failed", error=str(e))
            )
            await session.commit()
        logger.error("unsubscribe_failed", domain=domain_lower, error=str(e))
        raise HTTPException(status_code=502, detail="Unsubscribe failed")


@router.post("/mark-read/{domain}")
async def mark_read_domain(domain: str, request: Request, auth=Depends(get_current_user_and_token)):
    """Marks all unread messages from a domain as read and updates SenderSummary.unread_count."""
    user_id = auth["user_id"]
    access_token = auth["access_token"]

    import re
    if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", domain):
        raise HTTPException(status_code=422, detail="Invalid domain format")

    domain_lower = domain.lower()

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(EmailMetadata.id)
            .where(
                EmailMetadata.user_id == user_id,
                EmailMetadata.sender_domain == domain_lower,
                EmailMetadata.is_read == False,
            )
        )
        ids = [r[0] for r in result.all()]

    if not ids:
        return {"ok": True, "marked": 0}

    try:
        await gmail_service.mark_read(access_token, ids)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to mark messages read: {e}")

    async with request.app.state.db_session() as session:
        await session.execute(
            update(EmailMetadata)
            .where(EmailMetadata.user_id == user_id, EmailMetadata.id.in_(ids))
            .values(is_read=True)
        )
        unread_result = await session.execute(
            select(func.count()).select_from(EmailMetadata).where(
                EmailMetadata.user_id == user_id,
                EmailMetadata.sender_domain == domain_lower,
                EmailMetadata.is_read == False,
            )
        )
        remaining_unread = unread_result.scalar_one()
        await session.execute(
            update(SenderSummary)
            .where(SenderSummary.user_id == user_id, SenderSummary.sender_domain == domain_lower)
            .values(unread_count=remaining_unread)
        )
        await session.commit()

    return {"ok": True, "marked": len(ids)}


@router.get("/trash")
async def get_trash(
    request: Request,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    auth=Depends(get_current_user_and_token),
):
    """Retorna mensagens na lixeira (paginação simples)."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    access_token = auth["access_token"]
    gmail = gmail_service._build_gmail(access_token)

    maxreq = min(offset + limit, 500)
    try:
        result = await asyncio.to_thread(
            lambda: gmail.users()
            .messages()
            .list(userId="me", labelIds=["TRASH"], maxResults=maxreq)
            .execute()
        )
    except Exception as e:
        logger.error("gmail_list_trash_failed", error=str(e))
        raise HTTPException(status_code=502, detail="Failed to query Gmail")

    messages = result.get("messages", []) or []
    total = result.get("resultSizeEstimate", 0)

    paginated = messages[offset: offset + limit]

    items: list[dict] = []
    for msg in paginated:
        try:
            meta = await asyncio.to_thread(
                lambda mid=msg["id"]: gmail.users()
                .messages()
                .get(
                    userId="me",
                    id=mid,
                    format="metadata",
                    metadataHeaders=["From", "Subject", "Date"],
                )
                .execute()
            )
        except Exception as e:
            logger.warning("gmail_get_meta_failed", message_id=msg.get("id"), error=str(e))
            continue

        headers = {h["name"].lower(): h["value"] for h in meta.get("payload", {}).get("headers", [])}
        items.append(
            {
                "message_id": msg["id"],
                "subject": headers.get("subject", "(sem assunto)"),
                "sender": headers.get("from", ""),
                "date": headers.get("date", ""),
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/trash/count")
async def trash_count(request: Request, auth=Depends(get_current_user_and_token)):
    """Retorna estimativa do número de mensagens na lixeira (resultSizeEstimate)."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    access_token = auth["access_token"]
    gmail = gmail_service._build_gmail(access_token)
    try:
        res = await gmail_service._rate_limited_call(
            gmail.users().messages().list(userId="me", q="in:trash", maxResults=1).execute
        )
    except Exception as e:
        logger.error("gmail_trash_count_failed", error=str(e))
        raise HTTPException(status_code=502, detail="Failed to query Gmail")

    return {"total": res.get("resultSizeEstimate", 0)}


@router.post("/restore/{message_id}")
async def restore_message(message_id: str, request: Request, auth=Depends(get_current_user_and_token)):
    """Restaura (untrash) mensagem específica."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401)

    access_token = auth["access_token"]
    gmail = gmail_service._build_gmail(access_token)
    try:
        await gmail_service._rate_limited_call(
            gmail.users().messages().untrash(userId="me", id=message_id).execute
        )
    except Exception as e:
        logger.error("gmail_untrash_failed", message_id=message_id, error=str(e))
        raise HTTPException(status_code=502, detail="Failed to restore message")

    return {"ok": True, "message_id": message_id}


class EmptyTrashRequest(BaseModel):
    confirm: bool = False


@router.post("/empty-trash")
async def empty_trash(body: EmptyTrashRequest, request: Request, auth=Depends(get_current_user_and_token)):
    """Esvazia a lixeira permanentemente. confirm=True é obrigatório."""
    user_id = auth["user_id"]
    access_token = auth["access_token"]

    if not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmação necessária")

    gmail = gmail_service._build_gmail(access_token)

    all_ids: list[str] = []
    page_token = None
    while True:
        params: dict = {"userId": "me", "labelIds": ["TRASH"], "maxResults": 500}
        if page_token:
            params["pageToken"] = page_token
        try:
            res = await asyncio.to_thread(lambda p=params: gmail.users().messages().list(**p).execute())
        except Exception as e:
            logger.error("gmail_list_trash_failed", error=str(e))
            raise HTTPException(status_code=502, detail="Failed to list trash messages")

        msgs = res.get("messages", []) or []
        all_ids.extend([m["id"] for m in msgs])
        page_token = res.get("nextPageToken")
        if not page_token:
            break

    # Permanent delete requires gmail.modify scope or higher
    deleted = 0
    for msg_id in all_ids:
        try:
            await asyncio.to_thread(
                lambda mid=msg_id: gmail.users().messages().delete(userId="me", id=mid).execute()
            )
            deleted += 1
        except Exception as e:
            err_str = str(e)
            if "403" in err_str or "insufficient" in err_str.lower():
                raise HTTPException(
                    status_code=403,
                    detail="Permissão insuficiente. Faça logout e login novamente para liberar exclusão permanente.",
                )
            logger.warning("gmail_delete_msg_failed", message_id=msg_id, error=err_str)

    try:
        async with request.app.state.db_session() as session:
            session.add(ActionLog(
                user_id=user_id,
                action_type="empty_trash",
                target="trash",
                gmail_query=None,
                affected_count=deleted,
                status="done",
                dry_run=False,
                confirmed_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            ))
            if all_ids:
                await session.execute(delete(EmailMetadata).where(EmailMetadata.user_id == user_id, EmailMetadata.id.in_(all_ids)))
            await session.commit()
    except Exception:
        logger.warning("empty_trash_db_cleanup_failed")

    return {"ok": True, "deleted": deleted}
