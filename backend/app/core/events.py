"""
Event bus for inter-module communication.

Modules emit events instead of importing each other directly.
This decouples modules and allows optional modules to react to
events without the emitter knowing about them.

Usage:
    from app.core.events import events

    # In module A (emitter):
    await events.emit("lead.created", {"uid": "NXS-CUS-A3F8", ...})

    # In module B (listener):
    @events.on("lead.created")
    async def on_lead_created(data: dict):
        ...
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

EventHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class EventBus:
    """Simple async event bus for in-process module communication."""

    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    def on(self, event_name: str):
        """Decorator to register an event handler."""
        def decorator(fn: EventHandler):
            self._handlers[event_name].append(fn)
            return fn
        return decorator

    def subscribe(self, event_name: str, handler: EventHandler):
        """Programmatically subscribe a handler."""
        self._handlers[event_name].append(handler)

    def unsubscribe(self, event_name: str, handler: EventHandler):
        """Remove a handler."""
        handlers = self._handlers.get(event_name, [])
        if handler in handlers:
            handlers.remove(handler)

    async def emit(self, event_name: str, data: dict[str, Any] | None = None):
        """Emit an event. All handlers run concurrently; failures are logged, not raised."""
        handlers = self._handlers.get(event_name, [])
        if not handlers:
            return

        data = data or {}
        data["_event"] = event_name

        tasks = []
        for handler in handlers:
            tasks.append(self._safe_call(handler, event_name, data))
        await asyncio.gather(*tasks)

    async def _safe_call(self, handler: EventHandler, event_name: str, data: dict):
        try:
            await handler(data)
        except Exception:
            logger.exception(
                "Event handler %s failed for event '%s'",
                handler.__qualname__,
                event_name,
            )

    def list_events(self) -> dict[str, int]:
        """Return registered event names and handler counts (for debugging)."""
        return {k: len(v) for k, v in self._handlers.items() if v}


# Global singleton
events = EventBus()
