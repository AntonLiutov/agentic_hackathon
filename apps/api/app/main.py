from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.core.config import get_settings
from app.core.lifespan import lifespan

settings = get_settings()

openapi_tags = [
    {
        "name": "health",
        "description": "Operational health and dependency connectivity checks.",
    },
    {
        "name": "system",
        "description": "Runtime metadata and service-level API information.",
    },
]

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    summary="Backend API for the Agentic Chat platform.",
    description=(
        "The Agentic Chat API powers authentication, conversations, messaging, presence, "
        "attachments, and administration for the classic web chat application."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=openapi_tags,
    lifespan=lifespan,
)

app.include_router(health_router)


@app.get(
    "/api/meta",
    tags=["system"],
    summary="Read runtime API metadata",
    description="Returns basic runtime information used for local verification and diagnostics.",
)
async def get_meta() -> dict[str, object]:
    return {
        "app": settings.app_name,
        "environment": settings.app_env,
        "api_port": settings.api_port,
        "cors_origins": settings.cors_origin_list,
    }
