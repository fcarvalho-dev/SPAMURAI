import asyncio
import uuid
from datetime import datetime

import structlog
from celery import Celery

from core.config import get_settings
from core.security import decrypt_token
from services.gmail_service import fetch_messages_metadata, paginate_all_messages

logger = structlog.get_logger()
settings = get_settings()

celery_app = Celery(
    "gmail_agent",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    task_acks_late=True,           # reprocess on crash
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # one heavy job per worker
    task_soft_time_limit=3600,
    task_time_limit=3900,
)

from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "apply-active-rules-every-24h": {
        "task": "workers.scraper.apply_auto_rules",
        "schedule": crontab(minute=0, hour=3),
    },
}


@celery_app.task(bind=True, name="workers.scraper.scan_inbox")
def scan_inbox(self, user_id: str, encrypted_token: str, scan_job_id: str):
    asyncio.run(_scan_inbox_async(self, user_id, encrypted_token, scan_job_id))


async def _scan_inbox_async(task, user_id: str, encrypted_token: str, scan_job_id: str):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        access_token = decrypt_token(encrypted_token)
    except ValueError:
        logger.error("scan_token_decrypt_failed", scan_job_id=scan_job_id)
        await _update_scan_status(async_session, scan_job_id, "failed", error="Token inválido")
        return

    await _update_scan_status(async_session, scan_job_id, "running", started_at=datetime.utcnow())
    logger.info("scan_started", user_id=user_id, scan_job_id=scan_job_id)

    indexed = 0

    async def progress_callback(current: int, estimated: int):
        nonlocal indexed
        indexed = current
        task.update_state(
            state="PROGRESS",
            meta={"current": current, "total": estimated, "scan_job_id": scan_job_id},
        )

    try:
        messages = await paginate_all_messages(
            access_token=access_token,
            max_results=settings.max_emails_per_scan,
            progress_callback=progress_callback,
        )

        # Process in chunks to bound memory usage
        chunk_size = 200
        chunks = [messages[i:i+chunk_size] for i in range(0, len(messages), chunk_size)]

        async with async_session() as session:
            for chunk in chunks:
                ids = [m["id"] for m in chunk]
                metas = await fetch_messages_metadata(access_token, ids)
                await _upsert_email_metadata(session, user_id, metas)
                await session.commit()
                indexed += len(metas)

            await _refresh_sender_summary(session, user_id)
            await session.commit()

        await _update_scan_status(
            async_session, scan_job_id, "done",
            total_indexed=indexed,
            completed_at=datetime.utcnow(),
        )
        logger.info("scan_completed", user_id=user_id, indexed=indexed)

    except Exception as e:
        logger.error("scan_failed", user_id=user_id, error=str(e))
        await _update_scan_status(async_session, scan_job_id, "failed", error=str(e))
        raise


async def _upsert_email_metadata(session, user_id: str, metas):
    from sqlalchemy.dialects.postgresql import insert
    from models.schema import EmailMetadata

    if not metas:
        return

    rows = [
        {
            "id": m.id,
            "user_id": user_id,
            "sender": m.sender,
            "sender_domain": m.sender_domain,
            "subject": m.subject,
            "date": m.date,
            "is_read": m.is_read,
            "gmail_category": m.gmail_category,
            "has_unsubscribe": m.has_unsubscribe,
            "unsubscribe_url": m.unsubscribe_url,
        }
        for m in metas
    ]

    stmt = insert(EmailMetadata).values(rows).on_conflict_do_update(
        index_elements=["id"],
        set_={"is_read": insert(EmailMetadata).excluded.is_read},
    )
    await session.execute(stmt)


async def _refresh_sender_summary(session, user_id: str):
    """Recalcula agregações por remetente a partir do cache local."""
    from sqlalchemy import text

    await session.execute(text("""
        INSERT INTO sender_summary (user_id, sender_domain, total_count, unread_count, oldest_email, newest_email, has_unsubscribe, updated_at)
        SELECT
            user_id,
            sender_domain,
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE is_read = false) as unread_count,
            MIN(date) as oldest_email,
            MAX(date) as newest_email,
            BOOL_OR(has_unsubscribe) as has_unsubscribe,
            NOW()
        FROM email_metadata
        WHERE user_id = :user_id
        GROUP BY user_id, sender_domain
        ON CONFLICT (user_id, sender_domain) DO UPDATE SET
            total_count = EXCLUDED.total_count,
            unread_count = EXCLUDED.unread_count,
            oldest_email = EXCLUDED.oldest_email,
            newest_email = EXCLUDED.newest_email,
            has_unsubscribe = EXCLUDED.has_unsubscribe,
            updated_at = NOW()
    """), {"user_id": user_id})


async def _update_scan_status(session_factory, scan_job_id: str, status: str, **kwargs):
    from models.schema import ScanJob
    from sqlalchemy import update

    async with session_factory() as session:
        stmt = (
            update(ScanJob)
            .where(ScanJob.id == scan_job_id)
            .values(status=status, **kwargs)
        )
        await session.execute(stmt)
        await session.commit()


@celery_app.task(name="workers.scraper.apply_auto_rules")
def apply_auto_rules(user_id: str = None):
    """Aplica todas as regras ativas de um usuário ou de todos se user_id for None."""
    asyncio.run(_apply_auto_rules_async(user_id))


async def _apply_auto_rules_async(target_user_id: str = None):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select, update
    from models.schema import AutoRule, User, ActionLog
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    from services.gmail_service import bulk_delete_by_query

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        query = select(AutoRule, User).join(User, AutoRule.user_id == User.id).where(AutoRule.is_active == True)
        if target_user_id:
            import uuid
            try:
                target_uuid = uuid.UUID(target_user_id)
                query = query.where(AutoRule.user_id == target_uuid)
            except ValueError:
                pass

        result = await session.execute(query)
        rows = result.all()

    if not rows:
        return

    user_rules: dict = {}
    for rule, user in rows:
        if user.id not in user_rules:
            user_rules[user.id] = {"user": user, "rules": []}
        user_rules[user.id]["rules"].append(rule)

    for user_id, data in user_rules.items():
        user = data["user"]
        rules = data["rules"]

        if not user.encrypted_refresh_token:
            continue

        try:
            refresh_token = decrypt_token(user.encrypted_refresh_token)
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
            )
            creds.refresh(GoogleRequest())
            access_token = creds.token
        except Exception as e:
            logger.error("failed_to_refresh_token_for_rules", user_id=str(user_id), error=str(e))
            continue

        for rule in rules:
            try:
                if rule.condition_type == "domain":
                    gmail_query = f"from:{rule.condition_value}"
                elif rule.condition_type == "category":
                    gmail_query = f"category:{rule.condition_value}"
                else:
                    gmail_query = rule.condition_value

                affected_count = 0

                if rule.action_type == "trash":
                    res = await bulk_delete_by_query(
                        access_token=access_token,
                        query=gmail_query,
                        dry_run=False,
                    )
                    affected_count = res.get("affected", 0)
                    logger.info("rule_applied_trash", rule_id=str(rule.id), user_id=str(user_id), query=gmail_query)
                elif rule.action_type == "mark_read":
                    logger.warning("mark_read_rule_not_implemented", rule_id=str(rule.id))
                else:
                    logger.warning("rule_action_not_supported", rule_id=str(rule.id), action=rule.action_type)

                async with async_session() as session:
                    session.add(ActionLog(
                        user_id=user_id,
                        action_type=f"auto_rule_{rule.action_type}",
                        target=rule.name,
                        gmail_query=gmail_query,
                        affected_count=affected_count,
                        status="done",
                        dry_run=False,
                        confirmed_at=datetime.utcnow(),
                        completed_at=datetime.utcnow(),
                    ))
                    await session.execute(
                        update(AutoRule)
                        .where(AutoRule.id == rule.id)
                        .values(last_run_at=datetime.utcnow())
                    )
                    await session.commit()

            except Exception as e:
                logger.error("failed_to_apply_rule", rule_id=str(rule.id), error=str(e))
