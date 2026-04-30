import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from starlette.middleware.sessions import SessionMiddleware

from core.config import get_settings
from routers import auth, gmail

logger = structlog.get_logger()
settings = get_settings()

# Rate limiter global
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Gmail AI Agent",
    # Desabilita docs em produção — expõe superfície desnecessária
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middlewares ──────────────────────────────────────────────────────────────

# Session — httpOnly cookie para armazenar user_id (nunca o token)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.app_secret_key,
    session_cookie="gmail_agent_session",
    max_age=8 * 60 * 60,   # 8h
    https_only=settings.is_production,
    same_site="lax",
)

# CORS — só o frontend autorizado
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,   # necessário para cookies de sessão
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
    # NÃO usar allow_origins=["*"] — quebraria cookies de sessão e é inseguro
)

# Trusted hosts — bloqueia Host header injection
if settings.is_production:
    from urllib.parse import urlparse
    allowed_hosts = [urlparse(settings.backend_url).hostname]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

# ─── Security headers middleware ──────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ─── Database ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    engine = create_async_engine(
        settings.database_url,
        pool_size=10,
        max_overflow=20,
        echo=not settings.is_production,
    )
    app.state.db_engine = engine
    app.state.db_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Cria tabelas se não existirem (usar Alembic em produção)
    from models.schema import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("startup_complete", env=settings.app_env)


@app.on_event("shutdown")
async def shutdown():
    await app.state.db_engine.dispose()


# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(gmail.router)


@app.get("/health")
async def health():
    return {"status": "ok"}

