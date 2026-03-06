from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from contextlib import asynccontextmanager
import logging
import os

from app.config import settings
from app.database import init_db, engine, AsyncSessionLocal

# Legacy routers (kept for backward compatibility during migration)
from app.routers import auth, platform, workspace, crm, hr, accounting, inventory, ai, integrations, admin, notifications, messages, orders, ai_providers, automation, ai_finder, whisper_ws, workflow_templates, whatsapp, ws_whatsapp, ws_messages, email

# New modular system
from app.core.registry import module_registry
from app.core.routes import router as core_router
from app.core.entity_registry import ENTITY_REGISTRY_DDL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Nexus ERP API...")
    await init_db()

    # Discover and register modular modules
    await module_registry.discover_modules()
    module_registry.register_events()
    module_registry.register_routes(app, prefix="/api/v2")

    # Install entity_registry table in all provisioned tenant schemas
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE"))
            slugs = [row[0] for row in result.fetchall()]
        for slug in slugs:
            async with AsyncSessionLocal() as session:
                await session.execute(text(f'SET search_path TO "tenant_{slug}", public'))
                for stmt in ENTITY_REGISTRY_DDL.strip().split(";"):
                    stmt = stmt.strip()
                    if stmt:
                        await session.execute(text(stmt))
                await session.commit()
                logger.info(f"Entity registry installed for tenant: {slug}")
    except Exception as e:
        logger.warning(f"Entity registry migration warning: {e}")

    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Nexus ERP API",
    version="2.0.0",
    description="Modular multi-tenant ERP with AI capabilities",
    lifespan=lifespan,
)

_cors_origins = settings.cors_origin_list
_cors_wildcard = "*" in _cors_origins
logger.info("CORS allow_origins: %s", _cors_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_wildcard else _cors_origins,
    allow_origin_regex=None if _cors_wildcard else r"^https://[a-z0-9-]+\.onrender\.com$",
    allow_credentials=not _cors_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.wa_bridge import BridgeError

@app.exception_handler(BridgeError)
async def bridge_error_handler(request: Request, exc: BridgeError):
    """Return proper HTTP error when WhatsApp bridge communication fails."""
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so the CORS middleware can still add headers."""
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Core routes (entity registry, module management) ─────────────────────
app.include_router(core_router, prefix="/api")

# ── Legacy routers (existing functionality preserved) ─────────────────────
app.include_router(auth.router, prefix="/api")
app.include_router(platform.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(crm.router, prefix="/api")
app.include_router(hr.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(ai_providers.router, prefix="/api")
app.include_router(automation.router, prefix="/api")
app.include_router(ai_finder.router, prefix="/api")
app.include_router(whisper_ws.router, prefix="/api")
app.include_router(workflow_templates.router, prefix="/api")
app.include_router(whatsapp.router, prefix="/api")
app.include_router(ws_whatsapp.router, prefix="/api")
app.include_router(ws_messages.router, prefix="/api")
app.include_router(email.router, prefix="/api")

# ── New modular routes (auto-discovered from app/modules/) ────────────────
# Registered in lifespan after discover_modules() — see above.


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

WA_MEDIA_DIR = os.path.abspath(os.path.join("data", "wa-media"))
os.makedirs(WA_MEDIA_DIR, exist_ok=True)
app.mount("/wa-media", StaticFiles(directory=WA_MEDIA_DIR), name="wa-media")


@app.get("/health")
async def health():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    status = "ok" if db_status == "ok" else "degraded"
    return {
        "status": status,
        "service": "nexus-erp-api",
        "database": db_status,
        "modules": module_registry.list_modules(),
    }


@app.get("/")
async def root():
    return {"message": "Nexus ERP API", "version": "2.0.0", "docs": "/docs"}
