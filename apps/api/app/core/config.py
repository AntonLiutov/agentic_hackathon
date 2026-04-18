from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Agentic Chat API"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = Field(
        default="postgresql+psycopg://agentic:agentic@postgres:5432/agentic_chat"
    )
    redis_url: str = "redis://redis:6379/0"
    attachments_dir: str = "/data/attachments"
    cors_origins: str = "http://localhost:3000"
    alembic_config_path: str = "alembic.ini"
    session_cookie_name: str = "agentic_chat_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_ttl_seconds: int = 60 * 60 * 24 * 30
    session_secret_key: str = Field(default="dev-only-session-secret-change-me")
    password_hash_iterations: int = 600_000
    password_reset_token_ttl_seconds: int = 60 * 30
    password_reset_base_url: str = "http://localhost:3000/reset-password"
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "no-reply@agentic.chat"
    smtp_from_name: str = "Agentic Chat"
    presence_heartbeat_ttl_seconds: int = 75
    presence_afk_timeout_seconds: int = 60
    presence_sweep_interval_seconds: int = 10
    presence_sweep_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @computed_field
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
