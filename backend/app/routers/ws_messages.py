"""WebSocket hub for real-time internal messaging events."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.deps import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manages per-tenant/per-user websocket connections."""

    def __init__(self) -> None:
        # {tenant_slug: {user_id: [WebSocket]}}
        self._connections: dict[str, dict[str, list[WebSocket]]] = {}

    async def connect(self, ws: WebSocket, tenant_slug: str, user_id: str) -> None:
        await ws.accept()
        self._connections.setdefault(tenant_slug, {}).setdefault(user_id, []).append(ws)
        logger.info(
            "WS messages connected: tenant=%s user=%s (total=%d)",
            tenant_slug,
            user_id,
            len(self._connections[tenant_slug][user_id]),
        )

    def disconnect(self, ws: WebSocket, tenant_slug: str, user_id: str) -> None:
        conns = self._connections.get(tenant_slug, {}).get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.get(tenant_slug, {}).pop(user_id, None)
        if not self._connections.get(tenant_slug):
            self._connections.pop(tenant_slug, None)
        logger.info("WS messages disconnected: tenant=%s user=%s", tenant_slug, user_id)

    async def send_to_user(self, tenant_slug: str, user_id: str, event: dict[str, Any]) -> None:
        sockets = self._connections.get(tenant_slug, {}).get(user_id, [])
        if not sockets:
            return
        payload = json.dumps(event, default=str)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, tenant_slug, user_id)


messages_ws_manager = ConnectionManager()


@router.websocket("/ws/messages")
async def ws_messages(ws: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        tenant_slug = payload.get("tenant_slug", "")
    except Exception:
        await ws.close(code=4001, reason="Unauthorized")
        return

    if not user_id or not tenant_slug:
        await ws.close(code=4002, reason="Missing auth context")
        return

    await messages_ws_manager.connect(ws, tenant_slug, user_id)

    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS messages error: %s", exc)
    finally:
        messages_ws_manager.disconnect(ws, tenant_slug, user_id)
