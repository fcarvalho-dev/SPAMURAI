import os
import secrets

os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow

from core.config import get_settings
from core.security import encrypt_token

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

_STATE_TTL = 600  # 10 minutes


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _store_state(state: str) -> None:
    async with _redis() as r:
        await r.setex(f"oauth_state:{state}", _STATE_TTL, "1")


async def _consume_state(state: str) -> bool:
    async with _redis() as r:
        key = f"oauth_state:{state}"
        exists = await r.exists(key)
        if exists:
            await r.delete(key)
            return True
        return False


SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://mail.google.com/",
]


def _build_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


@router.get("/login")
async def login():
    """Inicia fluxo OAuth2. State persistido no Redis — não depende de cookie."""
    flow = _build_flow()
    state = secrets.token_urlsafe(32)

    await _store_state(state)

    auth_url, _ = flow.authorization_url(
        state=state,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )

    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def callback(request: Request, code: str, state: str):
    """
    Callback OAuth2.
    Valida state para prevenir CSRF antes de qualquer processamento.
    """
    from sqlalchemy import select
    from models.schema import User

    if not await _consume_state(state):
        logger.warning("oauth_state_mismatch", remote_addr=request.client.host)
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    flow = _build_flow()

    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            flow.fetch_token(code=code)
        except Exception as e:
            if "Scope has changed" in str(e):
                pass
            else:
                logger.error("oauth_token_fetch_failed", error=str(e))
                raise HTTPException(
                    status_code=400, detail="Falha ao autenticar com Google. Tente novamente."
                )

    try:
        credentials = flow.credentials
    except ValueError:
        # Token not saved by the flow — reconstruct from oauth2session
        if hasattr(flow, "oauth2session") and flow.oauth2session.token:
            from google.oauth2.credentials import Credentials

            token = flow.oauth2session.token
            credentials = Credentials(
                token=token.get("access_token"),
                refresh_token=token.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
                scopes=token.get("scope", "").split()
                if isinstance(token.get("scope"), str)
                else token.get("scope", []),
            )
        else:
            raise HTTPException(status_code=400, detail="Falha ao obter credenciais do Google.")

    if not credentials.refresh_token:
        # User previously authorized — force revoke + re-auth to get a fresh refresh token
        logger.warning("oauth_no_refresh_token")
        raise HTTPException(
            status_code=400,
            detail="No refresh token received. Please revoke access and try again.",
        )

    from googleapiclient.discovery import build

    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    email = user_info["email"]
    name = user_info.get("name")
    picture_url = user_info.get("picture")

    encrypted_rt = encrypt_token(credentials.refresh_token)

    async with request.app.state.db_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            user.encrypted_refresh_token = encrypted_rt
            user.last_seen_at = __import__("datetime").datetime.utcnow()
            user.name = name
            user.picture_url = picture_url
        else:
            user = User(
                email=email,
                encrypted_refresh_token=encrypted_rt,
                name=name,
                picture_url=picture_url,
            )
            session.add(user)

        await session.commit()
        await session.refresh(user)

    # Store user_id in session — never the token
    request.session["user_id"] = str(user.id)
    request.session["user_email"] = email

    return RedirectResponse(url=f"{settings.frontend_url}/dashboard")


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/logout")
async def logout_get(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    import uuid as _uuid
    from sqlalchemy import select
    from models.schema import User

    async with request.app.state.db_session() as session:
        result = await session.execute(select(User).where(User.id == _uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "user_id": user_id,
        "email": user.email,
        "name": user.name,
        "picture_url": user.picture_url,
        "plan": user.plan,
        "billing_cycle": user.billing_cycle,
        "plan_started_at": user.plan_started_at.isoformat() if user.plan_started_at else None,
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
    }
