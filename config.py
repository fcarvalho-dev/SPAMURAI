import secrets
from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Google OAuth
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str

    # Anthropic
    anthropic_api_key: str

    # Encryption — AES-256-GCM
    token_encryption_key: str

    # Database
    database_url: str

    # Redis
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str

    # App
    app_env: str = "development"
    app_secret_key: str
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # Rate limits
    gmail_requests_per_second: int = 10
    max_emails_per_scan: int = 5000

    @field_validator("token_encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if len(v) < 64:
            raise ValueError("TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
        try:
            bytes.fromhex(v)
        except ValueError:
            raise ValueError("TOKEN_ENCRYPTION_KEY must be valid hex")
        # Detecta chave placeholder/baixa entropia
        if len(set(v)) < 10:
            raise ValueError("TOKEN_ENCRYPTION_KEY has insufficient entropy")
        return v

    @field_validator("app_secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("APP_SECRET_KEY must be at least 32 chars")
        return v

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.app_env == "production":
            if "localhost" in self.frontend_url:
                raise ValueError("FRONTEND_URL cannot be localhost in production")
            if "localdev" in self.database_url:
                raise ValueError("DATABASE_URL uses dev credentials in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
