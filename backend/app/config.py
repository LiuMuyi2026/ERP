from pydantic_settings import BaseSettings
from typing import Optional
import logging

logger = logging.getLogger(__name__)

_INSECURE_SECRET_KEYS = {
    "dev-secret-key-change-in-production-32chars",
    "change-me-in-production-32-chars-min",
}


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production-32chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "nexus"
    postgres_password: str = "nexus_secret"
    postgres_db: str = "nexus_platform"

    n8n_api_url: str = "http://localhost:5678"
    n8n_api_key: str = ""

    gemini_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    doubao_api_key: str = ""
    doubao_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"

    qcc_app_key: str = ""
    qcc_secret_key: str = ""

    whisper_model: str = "base"
    whisper_language: str = "zh"

    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,https://nexus-frontend-5thy.onrender.com"
    app_base_url: str = "http://localhost:3000"

    email_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Nexus ERP"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 20

    evo_api_url: str = ""
    evo_api_key: str = ""
    evo_webhook_secret: str = ""
    backend_public_url: str = ""  # e.g. https://nexus-backend-xxx.onrender.com

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()

if settings.secret_key in _INSECURE_SECRET_KEYS:
    logger.warning(
        "SECRET_KEY is using an insecure default value! "
        "Set a strong, unique SECRET_KEY in your .env file before deploying to production."
    )
