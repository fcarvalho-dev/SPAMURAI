import json
from dataclasses import dataclass

import anthropic
import structlog

from core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

CATEGORIES = {
    "streaming": "Netflix, Spotify, Prime, Disney+, etc.",
    "ecommerce": "Lojas, marketplace, confirmações de compra",
    "financial": "Bancos, cartão, investimentos, notas fiscais — IMPORTANTE",
    "social": "Redes sociais, notificações de interação",
    "professional": "LinkedIn, Glassdoor, vagas de emprego",
    "newsletter": "Newsletters, blogs, conteúdo editorial",
    "spam": "Marketing agressivo, phishing suspeito, lixo",
    "transactional": "Confirmações de cadastro, senhas, recibos",
    "government": "Governo, impostos, documentos oficiais — IMPORTANTE",
    "personal": "Emails de pessoas reais — PRIORIDADE ALTA",
    "other": "Não se encaixa nas categorias acima",
}


@dataclass
class SenderClassification:
    domain: str
    category: str
    is_important: bool
    suggested_folder: str | None
    can_unsubscribe: bool


async def classify_senders(
    senders: list[dict],  # [{ domain, display_name, count, sample_subjects }]
) -> dict[str, SenderClassification]:
    """
    Classifica remetentes em batch — muito mais barato que classificar emails individuais.
    2-5k remetentes únicos em vez de 90k emails.
    """
    if not senders:
        return {}

    # Manda só o mínimo necessário — não body de emails
    payload = [
        {
            "domain": s["domain"],
            "name": s.get("display_name", ""),
            "count": s["count"],
            # Trunca subjects para não vazar dados pessoais para a API
            "subjects": [subj[:60] for subj in s.get("sample_subjects", [])[:3]],
        }
        for s in senders
    ]

    prompt = f"""Classifique esses remetentes de email nas categorias disponíveis.

CATEGORIAS DISPONÍVEIS:
{json.dumps(CATEGORIES, ensure_ascii=False, indent=2)}

REMETENTES:
{json.dumps(payload, ensure_ascii=False)}

Retorne APENAS JSON válido, sem markdown, sem explicações:
{{
  "classifications": [
    {{
      "domain": "netflix.com",
      "category": "streaming",
      "is_important": false,
      "suggested_folder": "Streaming",
      "can_unsubscribe": true
    }}
  ]
}}

Regras:
- financial e government são SEMPRE is_important: true
- personal (emails de pessoas) são SEMPRE is_important: true  
- spam: can_unsubscribe: true se parecer marketing, false se parecer phishing
- suggested_folder: nome da pasta em português, null se não precisar de pasta"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text if response.content else ""
        data = json.loads(text)

        result = {}
        for item in data.get("classifications", []):
            domain = item["domain"]
            result[domain] = SenderClassification(
                domain=domain,
                category=item.get("category", "other"),
                is_important=item.get("is_important", False),
                suggested_folder=item.get("suggested_folder"),
                can_unsubscribe=item.get("can_unsubscribe", False),
            )

        return result

    except json.JSONDecodeError:
        logger.error("ai_classification_json_error")
        raise ValueError("AI returned invalid JSON")
    except anthropic.APIError as e:
        logger.error("ai_classification_api_error", status=e.status_code)
        raise


async def generate_organization_plan(
    sender_classifications: list[dict],
) -> dict:
    """
    Gera plano de organização de pastas baseado nas classificações.
    Retorna preview para o usuário aprovar antes de executar.
    """
    prompt = f"""Crie um plano de organização de pastas para Gmail baseado nessas classificações de remetentes.

REMETENTES CLASSIFICADOS:
{json.dumps(sender_classifications, ensure_ascii=False)}

Retorne APENAS JSON válido:
{{
  "folders": [
    {{
      "name": "Streaming",
      "color": "#1DB954",
      "domains": ["netflix.com", "spotify.com"],
      "action": "label",
      "email_count": 847
    }}
  ],
  "to_delete": [
    {{
      "domain": "spam-site.com",
      "reason": "Spam identificado",
      "email_count": 234
    }}
  ],
  "to_unsubscribe": ["newsletter.com"],
  "summary": "Serão criadas X pastas, Y emails movidos, Z excluídos"
}}"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text if response.content else ""
    return json.loads(text)
