"""
Module Registry — Auto-discovers and registers ERP modules.

Inspired by Odoo's addons loader. Each module has a __manifest__.py
that declares its metadata, dependencies, permissions, and menu items.

Usage:
    from app.core.registry import module_registry

    # During startup:
    await module_registry.discover_modules()
    module_registry.register_routes(app)

    # Runtime:
    module_registry.is_installed("crm")
    module_registry.get_manifest("crm")
"""

import importlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI

logger = logging.getLogger(__name__)

MODULES_PACKAGE = "app.modules"
MODULES_DIR = Path(__file__).parent.parent / "modules"


@dataclass
class ModuleInfo:
    """Loaded module metadata."""
    slug: str
    manifest: dict[str, Any]
    router: APIRouter | None = None
    models_module: Any = None
    service_module: Any = None
    events_module: Any = None
    seed_module: Any = None
    installed: bool = False


class ModuleRegistry:
    """Central registry for all ERP modules."""

    def __init__(self):
        self._modules: dict[str, ModuleInfo] = {}
        self._load_order: list[str] = []

    async def discover_modules(self):
        """Scan modules/ directory and load manifests."""
        if not MODULES_DIR.exists():
            logger.warning("Modules directory not found: %s", MODULES_DIR)
            return

        for path in sorted(MODULES_DIR.iterdir()):
            if not path.is_dir() or path.name.startswith("_"):
                continue

            manifest_path = path / "__manifest__.py"
            if not manifest_path.exists():
                # Also try loading from __init__.py MANIFEST
                init_path = path / "__init__.py"
                if init_path.exists():
                    logger.debug("Module %s has no __manifest__.py, skipping", path.name)
                continue

            try:
                # Import the manifest
                manifest_mod = importlib.import_module(
                    f"{MODULES_PACKAGE}.{path.name}.__manifest__"
                )
                manifest = getattr(manifest_mod, "MANIFEST", {})
                slug = manifest.get("slug", path.name)

                info = ModuleInfo(slug=slug, manifest=manifest)

                # Try loading sub-modules
                for sub_name in ("routes", "models", "service", "events", "seed"):
                    sub_path = path / f"{sub_name}.py"
                    if sub_path.exists():
                        try:
                            mod = importlib.import_module(
                                f"{MODULES_PACKAGE}.{path.name}.{sub_name}"
                            )
                            if sub_name == "routes":
                                info.router = getattr(mod, "router", None)
                            elif sub_name == "models":
                                info.models_module = mod
                            elif sub_name == "service":
                                info.service_module = mod
                            elif sub_name == "events":
                                info.events_module = mod
                            elif sub_name == "seed":
                                info.seed_module = mod
                        except Exception:
                            logger.exception("Failed to load %s.%s", path.name, sub_name)

                self._modules[slug] = info
                logger.info("Discovered module: %s (v%s)", slug, manifest.get("version", "?"))

            except Exception:
                logger.exception("Failed to load module manifest: %s", path.name)

        # Resolve dependency order
        self._resolve_load_order()

    def _resolve_load_order(self):
        """Topological sort modules by dependencies."""
        visited: set[str] = set()
        order: list[str] = []

        def visit(slug: str):
            if slug in visited:
                return
            visited.add(slug)
            info = self._modules.get(slug)
            if info:
                for dep in info.manifest.get("depends", []):
                    visit(dep)
            order.append(slug)

        for slug in self._modules:
            visit(slug)

        self._load_order = order

    def register_routes(self, app: FastAPI, prefix: str = "/api"):
        """Register all module routers with the FastAPI app."""
        for slug in self._load_order:
            info = self._modules.get(slug)
            if not info or not info.router:
                continue
            module_prefix = info.manifest.get("api_prefix", f"/{slug}")
            app.include_router(info.router, prefix=prefix + module_prefix)
            info.installed = True
            logger.info("Registered routes for module: %s -> %s%s", slug, prefix, module_prefix)

    async def install_schemas(self, db):
        """Run DDL for all modules (in dependency order)."""
        for slug in self._load_order:
            info = self._modules.get(slug)
            if not info or not info.models_module:
                continue
            create_tables = getattr(info.models_module, "create_tables", None)
            if create_tables:
                try:
                    await create_tables(db)
                    logger.info("Installed schema for module: %s", slug)
                except Exception:
                    logger.exception("Failed to install schema for module: %s", slug)

    async def seed_data(self, db):
        """Run seed data for all modules."""
        for slug in self._load_order:
            info = self._modules.get(slug)
            if not info or not info.seed_module:
                continue
            seed_fn = getattr(info.seed_module, "seed", None)
            if seed_fn:
                try:
                    await seed_fn(db)
                    logger.info("Seeded data for module: %s", slug)
                except Exception:
                    logger.exception("Failed to seed data for module: %s", slug)

    def register_events(self):
        """Register event handlers from all modules."""
        for slug in self._load_order:
            info = self._modules.get(slug)
            if not info or not info.events_module:
                continue
            register_fn = getattr(info.events_module, "register_handlers", None)
            if register_fn:
                try:
                    register_fn()
                    logger.info("Registered events for module: %s", slug)
                except Exception:
                    logger.exception("Failed to register events for module: %s", slug)

    # ── Query methods ─────────────────────────────────────────────────────────

    def is_installed(self, slug: str) -> bool:
        info = self._modules.get(slug)
        return info.installed if info else False

    def get_manifest(self, slug: str) -> dict | None:
        info = self._modules.get(slug)
        return info.manifest if info else None

    def get_module(self, slug: str) -> ModuleInfo | None:
        return self._modules.get(slug)

    def list_modules(self) -> list[dict]:
        """Return summary of all registered modules."""
        result = []
        for slug in self._load_order:
            info = self._modules[slug]
            m = info.manifest
            result.append({
                "slug": slug,
                "name": m.get("name", slug),
                "version": m.get("version", "0.0.0"),
                "description": m.get("description", ""),
                "icon": m.get("icon", ""),
                "depends": m.get("depends", []),
                "installed": info.installed,
                "has_routes": info.router is not None,
                "has_events": info.events_module is not None,
                "permissions": m.get("permissions", []),
                "menu_items": m.get("menu_items", []),
            })
        return result

    @property
    def modules(self) -> dict[str, ModuleInfo]:
        return self._modules


# Global singleton
module_registry = ModuleRegistry()
