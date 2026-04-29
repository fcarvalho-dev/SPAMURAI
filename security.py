import ipaddress
import socket
from base64 import b64decode, b64encode

import httpx
import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


# ─── Token Encryption (AES-256-GCM) ─────────────────────────────────────────

def _get_key() -> bytes:
    return bytes.fromhex(settings.token_encryption_key)


def encrypt_token(token: str) -> str:
    """Encrypts OAuth token for storage. Returns base64(nonce + ciphertext + tag)."""
    import os
    aesgcm = AESGCM(_get_key())
    nonce = os.urandom(12)  # 96-bit nonce — GCM requirement
    ciphertext = aesgcm.encrypt(nonce, token.encode(), None)
    return b64encode(nonce + ciphertext).decode()


def decrypt_token(stored: str) -> str:
    """Decrypts stored token. Raises ValueError on tampered data (GCM auth tag fails)."""
    try:
        raw = b64decode(stored.encode())
        nonce, ciphertext = raw[:12], raw[12:]
        aesgcm = AESGCM(_get_key())
        return aesgcm.decrypt(nonce, ciphertext, None).decode()
    except Exception:
        # Não logar o valor — apenas indicar falha
        logger.error("token_decryption_failed")
        raise ValueError("Invalid or tampered token")


# ─── SSRF Guard ──────────────────────────────────────────────────────────────

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_blocked_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in net for net in _BLOCKED_NETWORKS)
    except ValueError:
        return True  # IP inválido = bloquear


async def safe_unsubscribe(url: str) -> bool:
    """
    Executa unsubscribe com proteção SSRF.
    Resolve DNS manualmente antes do request para bloquear IPs internos.
    """
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)

        if parsed.scheme not in ("http", "https"):
            logger.warning("unsub_blocked_scheme", scheme=parsed.scheme)
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        # Resolve DNS e valida o IP resultante
        resolved_ip = socket.gethostbyname(hostname)
        if _is_blocked_ip(resolved_ip):
            logger.warning("unsub_blocked_ip", hostname=hostname, ip=resolved_ip)
            return False

        async with httpx.AsyncClient(
            timeout=5.0,
            follow_redirects=False,  # não seguir redirects — podem ir para internal
            max_redirects=0,
        ) as client:
            resp = await client.post(
                url,
                headers={"List-Unsubscribe": "One-Click"},
            )
            return resp.status_code in (200, 204)

    except Exception as e:
        # Logar sem a URL completa — pode conter tokens
        logger.error("unsub_failed", hostname=parsed.hostname if parsed else "unknown")
        return False


# ─── Timing-safe comparison ──────────────────────────────────────────────────

def constant_time_compare(a: str, b: str) -> bool:
    """Para comparação de tokens/secrets — evita timing attacks."""
    import hmac
    return hmac.compare_digest(a.encode(), b.encode())
