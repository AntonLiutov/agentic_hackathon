from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.include_router(health_router)


@app.get("/api/meta")
async def get_meta() -> dict[str, object]:
    return {
        "app": settings.app_name,
        "environment": settings.app_env,
        "api_port": settings.api_port,
    }
