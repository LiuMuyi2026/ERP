"""
Core API routes — entity registry + module management.

These routes are always available (not part of any optional module).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.deps import get_current_user_with_tenant, require_admin_with_tenant
from app.core import entity_registry as er
from app.core.registry import module_registry

router = APIRouter(tags=["core"])


# ── Entity Registry ───────────────────────────────────────────────────────

@router.get("/entity-registry/search")
async def search_entities(
    q: str = Query(..., min_length=1),
    entity_type: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Search entities by name, phone, or email."""
    return await er.search_entities(ctx["db"], q, entity_type=entity_type, limit=limit)


@router.get("/entity-registry/by-uid/{uid}")
async def get_entity_by_uid(uid: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Look up entity by NexusUID."""
    entity = await er.lookup_by_uid(ctx["db"], uid)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.get("/entity-registry/by-phone/{phone}")
async def get_entity_by_phone(phone: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Look up entity by phone number (auto-normalizes)."""
    entity = await er.lookup_by_phone(ctx["db"], phone)
    if not entity:
        raise HTTPException(status_code=404, detail="No entity found for this phone")
    return entity


@router.get("/entity-registry/by-whatsapp/{jid}")
async def get_entity_by_whatsapp(jid: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Look up entity by WhatsApp JID."""
    entity = await er.lookup_by_whatsapp(ctx["db"], jid)
    if not entity:
        raise HTTPException(status_code=404, detail="No entity found for this WhatsApp JID")
    return entity


@router.get("/entity-registry/by-email/{email}")
async def get_entity_by_email(email: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Look up entity by email."""
    entity = await er.lookup_by_email(ctx["db"], email)
    if not entity:
        raise HTTPException(status_code=404, detail="No entity found for this email")
    return entity


# ── Module Management ──────────────────────────────────────────────────────

@router.get("/modules")
async def list_modules(ctx: dict = Depends(get_current_user_with_tenant)):
    """List all registered modules with their manifests."""
    return module_registry.list_modules()


@router.get("/modules/{slug}")
async def get_module(slug: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get a single module's manifest."""
    manifest = module_registry.get_manifest(slug)
    if not manifest:
        raise HTTPException(status_code=404, detail="Module not found")
    return manifest


@router.get("/modules/{slug}/menu")
async def get_module_menu(slug: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get a module's menu items."""
    manifest = module_registry.get_manifest(slug)
    if not manifest:
        raise HTTPException(status_code=404, detail="Module not found")
    return manifest.get("menu_items", [])


@router.get("/navigation/menu")
async def get_full_menu(ctx: dict = Depends(get_current_user_with_tenant)):
    """Get the complete navigation menu from all installed modules."""
    all_items = []
    for mod in module_registry.list_modules():
        if mod["installed"]:
            for item in mod.get("menu_items", []):
                all_items.append({
                    **item,
                    "module": mod["slug"],
                    "module_name": mod["name"],
                })
    all_items.sort(key=lambda x: x.get("sort", 99))
    return all_items
