from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthcheck() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "dependencies": {
            "database_url": settings.database_url,
            "redis_url": settings.redis_url,
        },
    }
