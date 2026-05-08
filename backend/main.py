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
from routers import ai_chat, auth, gmail, plans, rules, subscriptions

logger = structlog.get_logger()
settings = get_settings()

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Gmail AI Agent",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# httpOnly session cookie — stores user_id only, never the OAuth token
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.app_secret_key,
    session_cookie="gmail_agent_session",
    max_age=8 * 60 * 60,
    https_only=settings.is_production,
    same_site="lax",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

if settings.is_production:
    from urllib.parse import urlparse
    allowed_hosts = [urlparse(settings.backend_url).hostname]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)


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

    from models.schema import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("startup_complete", env=settings.app_env)


@app.on_event("shutdown")
async def shutdown():
    await app.state.db_engine.dispose()


app.include_router(auth.router)
app.include_router(gmail.router)
app.include_router(ai_chat.router, prefix="/ai")
app.include_router(rules.router, prefix="/rules", tags=["rules"])
app.include_router(subscriptions.router, prefix="", tags=["subscriptions"])
app.include_router(plans.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
