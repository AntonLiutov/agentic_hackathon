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
