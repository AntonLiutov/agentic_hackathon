from app.core.config import get_settings


def test_settings_default_values() -> None:
    settings = get_settings()

    assert settings.app_name == "Agentic Chat API"
    assert settings.app_env in {"development", "docker"}
    assert settings.api_port == 8000
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.redis_url.startswith("redis://")
