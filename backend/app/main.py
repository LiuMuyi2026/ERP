from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from contextlib import asynccontextmanager
import logging
import os

import asyncio

from app.config import settings
from app.database import init_db, engine, AsyncSessionLocal
from app.routers import auth, platform, workspace, crm, hr, accounting, inventory, ai, integrations, admin, notifications, messages, orders, ai_providers, automation, ai_finder, whisper_ws, workflow_templates, whatsapp, ws_whatsapp, ws_messages, email

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _imap_sync_loop():
    """Background loop: sync IMAP-enabled tenants every 5 minutes."""
    from app.services.imap_sync import sync_tenant_imap
    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(text(
                    "SELECT slug, imap_host, imap_port, imap_username, imap_password, "
                    "imap_use_ssl, imap_mailbox, imap_last_sync_at "
                    "FROM platform.tenants WHERE imap_enabled = TRUE AND is_active = TRUE"
                ))
                tenants = result.fetchall()
            for t in tenants:
                try:
                    imap_config = {
                        "imap_host": t.imap_host,
                        "imap_port": t.imap_port,
                        "imap_username": t.imap_username,
                        "imap_password": t.imap_password,
                        "imap_use_ssl": t.imap_use_ssl,
                        "imap_mailbox": t.imap_mailbox,
                        "imap_last_sync_at": t.imap_last_sync_at,
                    }
                    async with AsyncSessionLocal() as db:
                        await sync_tenant_imap(t.slug, imap_config, db)
                except Exception as e:
                    logger.warning("IMAP sync error for %s: %s", t.slug, e)
        except Exception as e:
            logger.warning("IMAP sync loop error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Nexus ERP API...")
    await init_db()
    imap_task = asyncio.create_task(_imap_sync_loop())
    yield
    imap_task.cancel()
    logger.info("Shutting down...")


app = FastAPI(
    title="Nexus ERP API",
    version="1.0.0",
    description="Multi-tenant ERP with AI capabilities",
    lifespan=lifespan,
)

_cors_origins = settings.cors_origin_list
_cors_wildcard = "*" in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_wildcard else _cors_origins,
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
    return {"status": status, "service": "nexus-erp-api", "database": db_status}


@app.get("/")
async def root():
    return {"message": "Nexus ERP API", "docs": "/docs"}
