import asyncio
from dataclasses import dataclass
from datetime import datetime
from email.utils import parseaddr

import structlog
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# Gmail API: 250 units/user/second
# list=5 units, get=5 units, batchDelete=50 units, modify=5 units
_RATE_LIMITER = asyncio.Semaphore(settings.gmail_requests_per_second)


@dataclass
class EmailMeta:
    id: str
    sender: str
    sender_domain: str
    subject: str
    date: datetime
    is_read: bool
    gmail_category: str | None
    has_unsubscribe: bool
    unsubscribe_url: str | None


@dataclass
class SenderGroup:
    domain: str
    display_name: str
    total: int
    unread: int
    oldest: datetime
    newest: datetime
    has_unsubscribe: bool
    sample_subjects: list[str]


def _build_gmail(access_token: str):
    creds = Credentials(token=access_token)
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _parse_sender_domain(sender: str) -> str:
    _, email = parseaddr(sender)
    if "@" in email:
        return email.split("@")[1].lower()
    return email.lower()


def _extract_unsubscribe(headers: list[dict]) -> tuple[bool, str | None]:
    for h in headers:
        if h["name"].lower() == "list-unsubscribe":
            value = h["value"]
            # Prefere HTTPS sobre mailto
            import re
            urls = re.findall(r"<(https?://[^>]+)>", value)
            if urls:
                return True, urls[0]
            # fallback: mailto — registra mas não executa automaticamente
            mailto = re.findall(r"<(mailto:[^>]+)>", value)
            if mailto:
                return True, None  # tem unsubscribe mas é mailto
    return False, None


async def _rate_limited_call(fn, *args, **kwargs):
    async with _RATE_LIMITER:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))


async def paginate_all_messages(
    access_token: str,
    query: str = "",
    max_results: int | None = None,
    progress_callback=None,
) -> list[dict]:
    """
    Pagina todos os emails com nextPageToken.
    Necessário para volumes de 90k — Gmail API limita a 500 por request.
    """
    gmail = _build_gmail(access_token)
    messages = []
    page_token = None
    page = 0

    while True:
        params = {
            "userId": "me",
            "maxResults": 500,
            "fields": "messages(id,threadId),nextPageToken,resultSizeEstimate",
        }
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token

        try:
            result = await _rate_limited_call(
                gmail.users().messages().list(**params).execute
            )
        except HttpError as e:
            logger.error("gmail_list_failed", status=e.status_code)
            raise

        batch = result.get("messages", [])
        messages.extend(batch)
        page += 1

        if progress_callback:
            await progress_callback(len(messages), result.get("resultSizeEstimate", 0))

        if max_results and len(messages) >= max_results:
            messages = messages[:max_results]
            break

        page_token = result.get("nextPageToken")
        if not page_token:
            break

        # Backoff entre páginas para respeitar quota
        await asyncio.sleep(0.1)

    return messages


async def fetch_messages_metadata(
    access_token: str,
    message_ids: list[str],
) -> list[EmailMeta]:
    """
    Busca metadados de emails em batch (100 por request = padrão Gmail API).
    Só headers — não baixa body. Muito mais rápido para volumes grandes.
    """
    gmail = _build_gmail(access_token)
    results = []

    # Gmail batch: máx 100 por HTTP request
    chunk_size = 100
    chunks = [message_ids[i:i+chunk_size] for i in range(0, len(message_ids), chunk_size)]

    for chunk in chunks:
        batch_results = []

        def callback(request_id, response, exception):
            if exception:
                logger.warning("batch_fetch_error", request_id=request_id)
                return
            batch_results.append(response)

        batch = gmail.new_batch_http_request(callback=callback)
        for msg_id in chunk:
            batch.add(
                gmail.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="metadata",
                    metadataHeaders=["From", "Subject", "Date", "List-Unsubscribe"],
                )
            )

        await _rate_limited_call(batch.execute)

        for msg in batch_results:
            headers = msg.get("payload", {}).get("headers", [])
            header_map = {h["name"].lower(): h["value"] for h in headers}

            sender = header_map.get("from", "")
            has_unsub, unsub_url = _extract_unsubscribe(headers)

            try:
                from email.utils import parsedate_to_datetime
                date = parsedate_to_datetime(header_map.get("date", ""))
            except Exception:
                date = datetime.utcnow()

            results.append(EmailMeta(
                id=msg["id"],
                sender=sender,
                sender_domain=_parse_sender_domain(sender),
                subject=header_map.get("subject", "(sem assunto)"),
                date=date.replace(tzinfo=None),
                is_read="UNREAD" not in msg.get("labelIds", []),
                gmail_category=next(
                    (l.lower().replace("category_", "")
                     for l in msg.get("labelIds", [])
                     if l.startswith("CATEGORY_")),
                    None,
                ),
                has_unsubscribe=has_unsub,
                unsubscribe_url=unsub_url,
            ))

        await asyncio.sleep(0.05)

    return results


async def bulk_delete_by_query(
    access_token: str,
    query: str,
    dry_run: bool = True,
) -> dict:
    """
    Deleta emails por query Gmail.
    dry_run=True por padrão — NUNCA executar sem confirmação explícita.
    Move para trash (não delete permanente).
    """
    gmail = _build_gmail(access_token)

    messages = await paginate_all_messages(access_token, query=query)
    affected = len(messages)

    if dry_run:
        return {"affected": affected, "executed": False, "dry_run": True}

    ids = [m["id"] for m in messages]
    chunk_size = 1000  # batchDelete aceita até 1000

    for i in range(0, len(ids), chunk_size):
        chunk = ids[i:i+chunk_size]
        await _rate_limited_call(
            gmail.users().messages().batchModify(
                userId="me",
                body={"ids": chunk, "addLabelIds": ["TRASH"]},
            ).execute
        )
        await asyncio.sleep(0.2)

    logger.info("bulk_trash_done", query=query, count=affected)
    return {"affected": affected, "executed": True, "dry_run": False}


async def create_label(access_token: str, name: str, color: str | None = None) -> str:
    """Cria label/pasta no Gmail. Retorna o label ID."""
    gmail = _build_gmail(access_token)
    body: dict = {"name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show"}
    if color:
        body["color"] = {"backgroundColor": color, "textColor": "#ffffff"}

    result = await _rate_limited_call(
        gmail.users().labels().create(userId="me", body=body).execute
    )
    return result["id"]


async def move_to_label(access_token: str, message_ids: list[str], label_id: str) -> None:
    """Move emails para uma label/pasta específica."""
    gmail = _build_gmail(access_token)
    chunk_size = 1000

    for i in range(0, len(message_ids), chunk_size):
        chunk = message_ids[i:i+chunk_size]
        await _rate_limited_call(
            gmail.users().messages().batchModify(
                userId="me",
                body={"ids": chunk, "addLabelIds": [label_id]},
            ).execute
        )
        await asyncio.sleep(0.2)


async def mark_read(access_token: str, message_ids: list[str]) -> None:
    """Removes the UNREAD label from the given messages in batches."""
    if not message_ids:
        return
    gmail = _build_gmail(access_token)
    chunk_size = 1000
    for i in range(0, len(message_ids), chunk_size):
        chunk = message_ids[i:i+chunk_size]
        await _rate_limited_call(
            gmail.users().messages().batchModify(
                userId="me",
                body={"ids": chunk, "removeLabelIds": ["UNREAD"]},
            ).execute
        )
        await asyncio.sleep(0.2)

