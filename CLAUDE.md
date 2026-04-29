\# Gmail AI Agent



\## Stack

\- Backend: Python 3.12 + FastAPI + Celery + PostgreSQL

\- Frontend: Next.js 15 + Bun + Biome + TanStack Query

\- IA: Claude API (classificação de remetentes em batch)

\- Queue: Celery + Redis (scraping de 90k emails)



\## Estrutura

\- backend/core/security.py → AES-256-GCM, SSRF guard

\- backend/routers/gmail.py → bulk-delete em 2 passos obrigatórios

\- backend/services/gmail\_service.py → paginação + batch metadata

\- backend/workers/scraper.py → Celery task com SSE progress



\## Regras obrigatórias

\- dry\_run=True por padrão em TODA ação destrutiva

\- userId SEMPRE da sessão server-side, NUNCA do body/query

\- Nunca logar tokens, refresh\_token ou access\_token

\- Confirmar com usuário antes de qualquer delete



\## Comandos

\- Backend: uvicorn main:app --reload --port 8000

\- Worker: celery -A workers.scraper.celery\_app worker

\- Frontend: bun dev

\- Lint Python: ruff check . \&\& ruff format .

\- Lint JS: bun run check

