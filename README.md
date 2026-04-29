# Gmail AI Agent

Gerenciamento inteligente de inbox com IA. Organiza, limpa e prioriza emails em massa.

## Stack

- **Backend:** Python 3.12 + FastAPI + Celery + SQLAlchemy
- **Frontend:** Next.js 15 + TanStack Query + Tailwind CSS
- **IA:** Claude (Anthropic) — classificação em batch de remetentes
- **Queue:** Celery + Redis — scraping assíncrono de 90k emails
- **DB:** PostgreSQL
- **Tooling:** Ruff (Python) + Biome (JS) + Bun

## Setup local

### 1. Pré-requisitos

```bash
# Python 3.12+
python --version

# Bun
curl -fsSL https://bun.sh/install | bash

# Docker (para Redis + Postgres)
docker --version
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencher obrigatoriamente:
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — [Google Cloud Console](https://console.cloud.google.com/)
- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com/)
- `TOKEN_ENCRYPTION_KEY` — `openssl rand -hex 32`
- `APP_SECRET_KEY` — `openssl rand -hex 32`

### 3. Google OAuth setup

No Google Cloud Console:
1. Criar projeto
2. Ativar **Gmail API**
3. Configurar OAuth consent screen (External)
4. Criar credenciais OAuth 2.0 (Web application)
5. Adicionar redirect URI: `http://localhost:8000/auth/callback`
6. **Scopes necessários:** `gmail.modify` — NÃO solicitar `mail.google.com`

### 4. Infraestrutura local

```bash
docker-compose up -d
```

### 5. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# API
uvicorn main:app --reload --port 8000

# Worker Celery (terminal separado)
celery -A workers.scraper.celery_app worker --loglevel=info
```

### 6. Frontend

```bash
cd frontend
bun install
bun dev
```

Acesse: http://localhost:3000

## Segurança

- Refresh tokens armazenados com AES-256-GCM
- OAuth scope mínimo: `gmail.modify`
- CSRF protection via state parameter
- Proteção SSRF no unsubscribe
- Audit log de todas as ações destrutivas
- Rate limiting nas rotas de ação
- Dry-run obrigatório antes de qualquer delete

## Comandos úteis

```bash
# Gerar chave de criptografia
openssl rand -hex 32

# Lint Python
cd backend && ruff check . && ruff format --check .

# Lint + Format JS
cd frontend && bun run check

# Testes
cd backend && pytest
cd frontend && bun test

# Auditoria de segurança
cd backend && pip-audit -r requirements.txt
cd frontend && bun audit
```
