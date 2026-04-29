from urllib.parse import urlencode

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from core.config import get_settings
from core.security import constant_time_compare, encrypt_token

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

# Escopos mínimos necessários — principle of least privilege
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.modify",  # lê + labela + move + trash
    # NÃO incluir: https://mail.google.com/ (full access — desnecessário)
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
async def login(request: Request):
    """Inicia fluxo OAuth2. State gerado server-side e salvo na sessão."""
    import secrets

    flow = _build_flow()
    state = secrets.token_urlsafe(32)

    # State salvo na sessão httpOnly — protege contra CSRF
    request.session["oauth_state"] = state

    auth_url, _ = flow.authorization_url(
        state=state,
        access_type="offline",     # recebe refresh_token
        prompt="consent",           # força exibição de escopos ao usuário
        include_granted_scopes="true",
    )

    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def callback(request: Request, code: str, state: str):
    """
    Callback OAuth2.
    Valida state para prevenir CSRF antes de qualquer processamento.
    """
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import select
    from models.schema import User

    # Valida state — timing-safe comparison
    session_state = request.session.get("oauth_state")
    if not session_state or not constant_time_compare(state, session_state):
        logger.warning("oauth_state_mismatch", remote_addr=request.client.host)
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Limpa state da sessão após uso — não pode ser reusado
    del request.session["oauth_state"]

    flow = _build_flow()

    try:
        flow.fetch_token(code=code)
    except Exception:
        logger.error("oauth_token_fetch_failed")
        raise HTTPException(status_code=400, detail="Failed to fetch token")

    credentials = flow.credentials

    if not credentials.refresh_token:
        # Acontece se o usuário já autorizou antes — força revoke + re-auth
        logger.warning("oauth_no_refresh_token")
        raise HTTPException(
            status_code=400,
            detail="No refresh token received. Please revoke access and try again.",
        )

    # Busca info do usuário
    from googleapiclient.discovery import build
    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    email = user_info["email"]

    # Armazena refresh token CRIPTOGRAFADO
    encrypted_rt = encrypt_token(credentials.refresh_token)

    # Upsert do usuário no banco
    async with request.app.state.db_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            user.encrypted_refresh_token = encrypted_rt
            user.last_seen_at = __import__("datetime").datetime.utcnow()
        else:
            user = User(email=email, encrypted_refresh_token=encrypted_rt)
            session.add(user)

        await session.commit()
        await session.refresh(user)

    # Salva user_id na sessão — NOT o token
    request.session["user_id"] = str(user.id)
    request.session["user_email"] = email

    return RedirectResponse(url=f"{settings.frontend_url}/dashboard")


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "user_id": user_id,
        "email": request.session.get("user_email"),
    }
