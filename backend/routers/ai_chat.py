from collections import Counter
import asyncio
import json
import uuid as uuid_mod
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.plans import require_feature
from models.schema import ActionLog, EmailMetadata, SenderSummary, Subscription, User
from routers.gmail import get_current_user, get_current_user_and_token
from services import ai_service, gmail_service

router = APIRouter()
logger = structlog.get_logger()


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    actions_taken: list[str]
    filter_action: dict[str, str] | None = None


TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_emails_by_sender",
            "description": "Lista emails de um remetente específico pelo domínio",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {"type": "string", "description": "domínio do remetente ex: netflix.com"},
                    "limit": {"type": "integer", "description": "máximo de emails a retornar", "default": 5},
                },
                "required": ["domain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_to_trash",
            "description": (
                "Move emails de um domínio para a lixeira. "
                "Chamar com confirm=false primeiro para preview, depois confirm=true para executar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {"type": "string", "description": "domínio do remetente"},
                    "confirm": {"type": "boolean", "description": "false=preview, true=executar de verdade"},
                },
                "required": ["domain", "confirm"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_emails_by_category",
            "description": "Lista remetentes de uma categoria específica",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": [
                            "spam", "newsletter", "streaming", "social", "financial",
                            "ecommerce", "transactional", "personal", "entertainment", "other",
                        ],
                    },
                },
                "required": ["category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_senders_by_keyword",
            "description": (
                "Busca remetentes pelo domínio ou nome. "
                "Usar para temas genéricos como jogos, banco, loja."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "palavra-chave para buscar"},
                },
                "required": ["keyword"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_inbox_summary",
            "description": "Retorna resumo completo da caixa de entrada com totais por categoria",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_subscriptions",
            "description": "Lista subscriptions registradas pelo usuário",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_subscription",
            "description": "Adiciona uma nova subscription (sender_domain, display_name optional)",
            "parameters": {
                "type": "object",
                "properties": {
                    "sender_domain": {"type": "string"},
                    "display_name": {"type": "string"},
                },
                "required": ["sender_domain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_subscription_alerts",
            "description": "Retorna alerts simples para as subscriptions do usuário",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_subscription",
            "description": "Deleta uma subscription pelo id",
            "parameters": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "filter_by_domain",
            "description": (
                "Filtra/abre a visualização da tabela para um domínio específico. "
                "Usar quando o usuário quer ver, filtrar ou focar nos emails de um remetente específico."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {"type": "string", "description": "domínio exato do remetente, ex: amazon.com.br"},
                },
                "required": ["domain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "filter_by_category",
            "description": (
                "Filtra a tabela de remetentes para mostrar apenas uma categoria. "
                "Usar quando o usuário quer ver todos os remetentes de uma categoria específica."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": [
                            "spam", "newsletter", "streaming", "social", "financial",
                            "ecommerce", "transactional", "personal", "entertainment", "other",
                        ],
                        "description": "categoria para filtrar na tabela",
                    },
                },
                "required": ["category"],
            },
        },
    },
]


async def execute_list_emails_by_sender(
    domain: str, limit: int, user_id: str, db: AsyncSession
) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(
        select(EmailMetadata.id, EmailMetadata.subject, EmailMetadata.sender, EmailMetadata.date)
        .where(EmailMetadata.user_id == uid)
        .where(EmailMetadata.sender_domain == domain.lower())
        .order_by(EmailMetadata.date.desc())
        .limit(limit)
    )
    emails = [
        {
            "message_id": r[0],
            "subject": r[1],
            "sender": r[2],
            "received_at": r[3].isoformat() if r[3] else None,
        }
        for r in result.fetchall()
    ]
    return {"emails": emails, "domain": domain, "count": len(emails)}


async def execute_list_by_category(
    category: str, user_id: str, db: AsyncSession
) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(
        select(
            SenderSummary.sender_domain,
            SenderSummary.display_name,
            SenderSummary.total_count,
            SenderSummary.unread_count,
        )
        .where(SenderSummary.user_id == uid)
        .where(SenderSummary.ai_category == category)
        .order_by(SenderSummary.total_count.desc())
    )
    senders_out = [
        {"domain": r[0], "display_name": r[1], "total": r[2], "unread": r[3]}
        for r in result.fetchall()
    ]
    return {"senders": senders_out, "category": category, "count": len(senders_out)}


async def execute_search_by_keyword(
    keyword: str, user_id: str, db: AsyncSession
) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    q = f"%{keyword}%"
    result = await db.execute(
        select(
            SenderSummary.sender_domain,
            SenderSummary.display_name,
            SenderSummary.ai_category,
            SenderSummary.total_count,
        )
        .where(SenderSummary.user_id == uid)
        .where(
            or_(
                SenderSummary.sender_domain.ilike(q),
                SenderSummary.display_name.ilike(q),
            )
        )
        .order_by(SenderSummary.total_count.desc())
    )
    senders_out = [
        {"domain": r[0], "display_name": r[1], "category": r[2], "total": r[3]}
        for r in result.fetchall()
    ]
    return {"senders": senders_out, "keyword": keyword, "count": len(senders_out)}


async def execute_get_inbox_summary(user_id: str, db: AsyncSession) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(select(SenderSummary).where(SenderSummary.user_id == uid))
    rows = result.scalars().all()
    total = sum(r.total_count for r in rows)
    top = [
        (r.sender_domain, r.total_count)
        for r in sorted(rows, key=lambda x: x.total_count, reverse=True)[:10]
    ]
    cats = Counter(r.ai_category for r in rows)
    return {"total_emails": total, "senders": len(rows), "top_senders": top, "categories": dict(cats)}


async def execute_move_to_trash(
    domain: str, confirm: bool, user_id: str, access_token: str, db: AsyncSession
) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(
        select(EmailMetadata.id)
        .where(EmailMetadata.user_id == uid)
        .where(EmailMetadata.sender_domain == domain.lower())
    )
    message_ids = [row[0] for row in result.fetchall()]

    logger.info("move_to_trash", domain=domain, confirm=confirm, found=len(message_ids))

    if not confirm:
        return {"preview": True, "count": len(message_ids), "domain": domain}

    if not message_ids:
        return {"moved": 0, "domain": domain}

    gmail = gmail_service._build_gmail(access_token)
    moved = 0
    for msg_id in message_ids:
        try:
            await asyncio.to_thread(
                lambda mid=msg_id: gmail.users().messages().trash(userId="me", id=mid).execute()
            )
            moved += 1
        except Exception as exc:
            logger.error("gmail_trash_failed", msg_id=msg_id, error=str(exc))

    await db.execute(
        delete(EmailMetadata)
        .where(EmailMetadata.user_id == uid)
        .where(EmailMetadata.sender_domain == domain.lower())
    )
    await db.execute(
        delete(SenderSummary)
        .where(SenderSummary.user_id == uid)
        .where(SenderSummary.sender_domain == domain.lower())
    )
    await db.commit()

    db.add(
        ActionLog(
            user_id=uid,
            action_type="move_to_trash_chat",
            target=domain,
            affected_count=moved,
            status="done",
            dry_run=False,
            confirmed_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
    )
    await db.commit()

    return {"moved": moved, "domain": domain}


async def execute_list_subscriptions(user_id: str, db: AsyncSession) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(select(Subscription).where(Subscription.user_id == uid))
    rows = result.scalars().all()
    out = [
        {"id": str(r.id), "domain": r.sender_domain, "display_name": r.display_name, "is_active": bool(r.is_active)}
        for r in rows
    ]
    return {"subscriptions": out, "count": len(out)}


async def execute_add_subscription(sender_domain: str, display_name: str | None, user_id: str, db: AsyncSession) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    sub = Subscription(user_id=uid, sender_domain=sender_domain.lower(), display_name=display_name)
    db.add(sub)
    try:
        await db.commit()
        await db.refresh(sub)
    except Exception as exc:
        await db.rollback()
        return {"error": str(exc)}
    return {"id": str(sub.id), "domain": sub.sender_domain, "display_name": sub.display_name}


async def execute_get_subscription_alerts(user_id: str, db: AsyncSession) -> dict[str, Any]:
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    subs_res = await db.execute(select(Subscription).where(Subscription.user_id == uid))
    subs = subs_res.scalars().all()
    senders_res = await db.execute(select(SenderSummary).where(SenderSummary.user_id == uid))
    senders = senders_res.scalars().all()
    senders_map = {s.sender_domain: s for s in senders}
    alerts = []
    for s in subs:
        info = senders_map.get(s.sender_domain)
        alerts.append({
            "subscription_id": str(s.id),
            "domain": s.sender_domain,
            "total": info.total_count if info else 0,
            "unread": info.unread_count if info else 0,
        })
    return {"alerts": alerts}


async def execute_delete_subscription(sub_id: str, user_id: str, db: AsyncSession) -> dict[str, Any]:
    sid = uuid_mod.UUID(sub_id) if isinstance(sub_id, str) else sub_id
    uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
    res = await db.execute(select(Subscription).where(Subscription.id == sid).where(Subscription.user_id == uid))
    sub = res.scalar_one_or_none()
    if not sub:
        return {"error": "not_found"}
    await db.execute(delete(Subscription).where(Subscription.id == sid))
    await db.commit()
    return {"deleted": True}


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    body: ChatRequest,
    request: Request,
    auth: dict[str, str] = Depends(get_current_user_and_token),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    require_feature(current_user.plan, "kenzo_chat")
    user_id: str = auth["user_id"]
    access_token: str = auth["access_token"]

    async with request.app.state.db_session() as session:
        result = await session.execute(
            select(SenderSummary).where(SenderSummary.user_id == user_id)
        )
        senders: list[SenderSummary] = result.scalars().all()

    total_emails = sum(s.total_count for s in senders)
    categories = Counter(s.ai_category for s in senders)
    senders_list = [
        {"domain": s.sender_domain, "category": s.ai_category, "total": s.total_count}
        for s in senders
    ]

    system_prompt = (
        "Você é o Kenzo, assistente inteligente do Spamurai — uma ferramenta de gerenciamento de caixa de entrada Gmail com IA.\n\n"
        "IDENTIDADE:\n"
        "- Seu nome é Kenzo\n"
        "- Você foi criado pelo Spamurai\n"
        "- Você é especialista em organização de emails e produtividade\n\n"
        "ESCOPO — você APENAS pode ajudar com:\n"
        "1. Gerenciar emails (listar, buscar, mover, excluir, marcar como lido)\n"
        "2. Classificar e organizar remetentes por categoria\n"
        "3. Criar e gerenciar regras automáticas\n"
        "4. Monitorar assinaturas e alertas de vencimento\n"
        "5. Explicar funcionalidades do Spamurai\n"
        "6. Sugerir ações para organizar o inbox do usuário\n"
        "7. Bate-papo natural e amigável RELACIONADO ao contexto de email e produtividade\n\n"
        "FORA DO ESCOPO — recuse educadamente:\n"
        "- Gerar código, scripts ou programas\n"
        "- Responder perguntas gerais (matemática, história, ciência, etc)\n"
        "- Gerar ou descrever imagens\n"
        "- Agir como assistente geral (ChatGPT, Claude, Gemini, etc)\n"
        "- Tirar dúvidas não relacionadas a email ou produtividade\n\n"
        "RESPOSTA PADRÃO FORA DO ESCOPO:\n"
        "'Sou o Kenzo, assistente do Spamurai! Posso te ajudar a organizar sua caixa de entrada, "
        "mover emails, criar regras automáticas e muito mais. O que posso fazer pelo seu inbox hoje? 📬'\n\n"
        "PERSONALIDADE:\n"
        "- Tom amigável e direto\n"
        "- Pode responder cumprimentos naturalmente (oi, olá, bom dia, tudo bem)\n"
        "- Proativo em sugerir ações úteis baseadas no inbox\n"
        "- Nunca finge ser outro assistente\n"
        "- Se perguntado quem criou você: 'Fui criado pela equipe do Spamurai'\n\n"
        f"Dados do usuário:\n"
        f"Total de emails: {total_emails}\n"
        f"Remetentes: {len(senders)}\n"
        f"Categorias: {dict(categories)}\n\n"
        f"DADOS REAIS DA CAIXA (use SOMENTE estes domínios):\n"
        f"{json.dumps(senders_list, ensure_ascii=False)}\n\n"
        "REGRAS:\n"
        "- NUNCA inventar domínios — só usar o que as ferramentas retornam\n"
        "- Respostas curtas e diretas (máx 3 parágrafos)\n"
        "- Números em pt-BR (1.023 não 1023), datas em formato brasileiro\n"
        "- NUNCA mencione nomes de funções ou detalhes técnicos na resposta\n"
        "- Ao listar emails, mostrar no máximo 5 por vez\n"
        "- Para filtrar/mostrar/focar em remetente específico: usar filter_by_domain\n"
        "- Para filtrar por categoria (spam, newsletter, etc.): usar filter_by_category\n\n"
        "FLUXO DE EXCLUSÃO:\n"
        "1. Chamar move_to_trash(confirm=false) para mostrar preview\n"
        "2. Perguntar UMA VEZ: 'Confirma mover X emails de domain.com para lixeira?'\n"
        "3. Se usuário confirmar: chamar move_to_trash(confirm=true)\n"
        "4. NUNCA pedir confirmação mais de uma vez\n"
    )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for m in body.history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": body.message})

    OFF_SCOPE_KEYWORDS = [
        "receita", "código", "programa", "calcul", "histór", "geograf",
        "traduz", "escreva um texto", "me ajude com", "explique o que é",
        "como funciona o", "o que é python", "javascript", "matemática"
    ]
    if any(kw in body.message.lower() for kw in OFF_SCOPE_KEYWORDS):
        logger.info(f"possible_off_scope_message: {body.message[:50]}")

    try:
        resp = ai_service.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1000,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")

    response_message = resp.choices[0].message
    tool_calls = response_message.tool_calls

    if not tool_calls:
        return ChatResponse(
            response=response_message.content or "",
            actions_taken=[],
            filter_action=None,
        )

    messages.append({
        "role": "assistant",
        "content": response_message.content or "",
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            }
            for tc in tool_calls
        ],
    })

    actions_taken: list[str] = []
    filter_action: dict[str, str] | None = None

    async with request.app.state.db_session() as db:
        for tc in tool_calls:
            fn_name = tc.function.name
            try:
                args: dict[str, Any] = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            result: dict[str, Any] = {}

            if fn_name == "list_emails_by_sender":
                domain: str = args.get("domain", "")
                result = await execute_list_emails_by_sender(
                    domain=domain,
                    limit=int(args.get("limit", 5)),
                    user_id=user_id,
                    db=db,
                )
                filter_action = {"type": "domain", "value": domain}

            elif fn_name == "move_to_trash":
                domain = args.get("domain", "")
                confirm = bool(args.get("confirm", False))
                result = await execute_move_to_trash(
                    domain=domain,
                    confirm=confirm,
                    user_id=user_id,
                    access_token=access_token,
                    db=db,
                )
                if confirm and result.get("moved", 0) > 0:
                    actions_taken.append(
                        f"{result['moved']} emails de {domain} movidos para lixeira"
                    )
                filter_action = {"type": "domain", "value": domain}

            elif fn_name == "list_emails_by_category":
                category: str = args.get("category", "other")
                result = await execute_list_by_category(
                    category=category, user_id=user_id, db=db
                )
                filter_action = {"type": "category", "value": category}

            elif fn_name == "search_senders_by_keyword":
                keyword: str = args.get("keyword", "")
                result = await execute_search_by_keyword(
                    keyword=keyword, user_id=user_id, db=db
                )
                if result.get("senders"):
                    filter_action = {"type": "domain", "value": result["senders"][0]["domain"]}

            elif fn_name == "get_inbox_summary":
                result = await execute_get_inbox_summary(user_id=user_id, db=db)

            elif fn_name == "list_subscriptions":
                result = await execute_list_subscriptions(user_id=user_id, db=db)

            elif fn_name == "add_subscription":
                sender_domain = args.get("sender_domain")
                display_name = args.get("display_name")
                result = await execute_add_subscription(sender_domain, display_name, user_id, db)
                if result.get("id"):
                    actions_taken.append(f"Subscribed to {result.get('domain')}")

            elif fn_name == "get_subscription_alerts":
                result = await execute_get_subscription_alerts(user_id=user_id, db=db)

            elif fn_name == "delete_subscription":
                sub_id = args.get("id")
                result = await execute_delete_subscription(sub_id, user_id, db)
                if result.get("deleted"):
                    actions_taken.append("Deleted subscription")

            elif fn_name == "filter_by_domain":
                domain = args.get("domain", "")
                filter_action = {"type": "domain", "value": domain}
                uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
                row = (await db.execute(
                    select(SenderSummary.total_count, SenderSummary.unread_count, SenderSummary.display_name)
                    .where(SenderSummary.user_id == uid)
                    .where(SenderSummary.sender_domain == domain.lower())
                )).fetchone()
                result = {
                    "filtered": True,
                    "domain": domain,
                    "display_name": row[2] if row else None,
                    "total": row[0] if row else 0,
                    "unread": row[1] if row else 0,
                    "found": row is not None,
                }

            elif fn_name == "filter_by_category":
                category = args.get("category", "other")
                filter_action = {"type": "category", "value": category}
                uid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
                sender_count = (await db.execute(
                    select(func.count()).select_from(SenderSummary)
                    .where(SenderSummary.user_id == uid)
                    .where(SenderSummary.ai_category == category)
                )).scalar() or 0
                result = {
                    "filtered": True,
                    "category": category,
                    "sender_count": sender_count,
                }

            else:
                result = {"error": "unknown_tool", "name": fn_name}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

    try:
        final_resp = ai_service.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=1000,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")

    return ChatResponse(
        response=final_resp.choices[0].message.content or "",
        actions_taken=actions_taken,
        filter_action=filter_action,
    )
