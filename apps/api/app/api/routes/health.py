from fastapi import APIRouter, Request

from app.cache.redis import RedisManager
from app.core.config import Settings
from app.db.session import DatabaseManager

router = APIRouter(tags=["health"])


@router.get(
    "/healthz",
    summary="Check API health",
    description=(
        "Verifies that the API process is running and that database and Redis "
        "connectivity are available."
    ),
)
async def healthcheck(request: Request) -> dict[str, object]:
    settings: Settings = request.app.state.settings
    database: DatabaseManager = request.app.state.database
    redis: RedisManager = request.app.state.redis
    database_ok = await database.ping()
    redis_ok = await redis.ping()

    return {
        "status": "ok" if database_ok and redis_ok else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "dependencies": {
            "database": database_ok,
            "redis": redis_ok,
        },
    }
