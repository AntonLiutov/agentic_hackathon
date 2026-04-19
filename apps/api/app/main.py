from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.attachments import router as attachments_router
from app.api.routes.auth import router as auth_router
from app.api.routes.blocks import router as blocks_router
from app.api.routes.dms import router as dms_router
from app.api.routes.friends import router as friends_router
from app.api.routes.health import router as health_router
from app.api.routes.messages import router as messages_router
from app.api.routes.presence import router as presence_router
from app.api.routes.realtime import router as realtime_router
from app.api.routes.rooms import router as rooms_router
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
    {
        "name": "auth",
        "description": "Registration, login, session bootstrap, and logout endpoints.",
    },
    {
        "name": "rooms",
        "description": "Room creation, catalog discovery, membership, and invitations.",
    },
    {
        "name": "direct-messages",
        "description": "One-to-one direct message discovery and conversation bootstrap.",
    },
    {
        "name": "friends",
        "description": "Friendship graph and friend-request lifecycle endpoints.",
    },
    {
        "name": "blocks",
        "description": "User-to-user blocking and frozen direct-message relationship controls.",
    },
    {
        "name": "messages",
        "description": "Shared room and direct-message message lifecycle endpoints.",
    },
    {
        "name": "attachments",
        "description": "Attachment upload, rendering, and file download endpoints.",
    },
    {
        "name": "realtime",
        "description": "Authenticated WebSocket delivery for live conversation updates.",
    },
    {
        "name": "presence",
        "description": "Multi-tab user presence heartbeat and low-latency presence updates.",
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(attachments_router)
app.include_router(blocks_router)
app.include_router(dms_router)
app.include_router(friends_router)
app.include_router(health_router)
app.include_router(messages_router)
app.include_router(presence_router)
app.include_router(realtime_router)
app.include_router(rooms_router)


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
