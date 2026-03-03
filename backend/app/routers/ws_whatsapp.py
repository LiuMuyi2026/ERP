"""WebSocket hub for real-time WhatsApp event broadcasting."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.deps import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections per tenant/user."""

    def __init__(self) -> None:
        # {tenant_slug: {user_id: [WebSocket]}}
        self._connections: dict[str, dict[str, list[WebSocket]]] = {}

    async def connect(self, ws: WebSocket, tenant_slug: str, user_id: str) -> None:
        await ws.accept()
        self._connections.setdefault(tenant_slug, {}).setdefault(user_id, []).append(ws)
        logger.info("WS connected: tenant=%s user=%s (total=%d)", tenant_slug, user_id,
                     len(self._connections[tenant_slug][user_id]))

    def disconnect(self, ws: WebSocket, tenant_slug: str, user_id: str) -> None:
        conns = self._connections.get(tenant_slug, {}).get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.get(tenant_slug, {}).pop(user_id, None)
        if not self._connections.get(tenant_slug):
            self._connections.pop(tenant_slug, None)
        logger.info("WS disconnected: tenant=%s user=%s", tenant_slug, user_id)

    async def broadcast(self, tenant_slug: str, event: dict[str, Any]) -> None:
        """Broadcast an event to all connected users in a tenant."""
        users = self._connections.get(tenant_slug, {})
        if not users:
            return
        payload = json.dumps(event)
        dead: list[tuple[str, WebSocket]] = []
        for uid, sockets in users.items():
            for ws in sockets:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append((uid, ws))
        for uid, ws in dead:
            self.disconnect(ws, tenant_slug, uid)

    async def send_to_user(self, tenant_slug: str, user_id: str, event: dict[str, Any]) -> None:
        """Send an event to a specific user in a tenant."""
        sockets = self._connections.get(tenant_slug, {}).get(user_id, [])
        if not sockets:
            return
        payload = json.dumps(event)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, tenant_slug, user_id)


# Singleton instance — imported by whatsapp.py webhook handlers
wa_ws_manager = ConnectionManager()


@router.websocket("/ws/whatsapp")
async def ws_whatsapp(ws: WebSocket, token: str = Query(...)):
    """Real-time WhatsApp event stream.

    Events sent to client:
      - new_message: {type, contact_id, message, unread_count}
      - message_status: {type, wa_message_id, status}
      - message_deleted: {type, wa_message_id}
      - connection_update: {type, account_id, status}
      - typing: {type, contact_id, participant, state}
    """
    # ── Auth ──
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        tenant_slug = payload.get("tenant_slug", "")
    except Exception:
        await ws.close(code=4001, reason="Unauthorized")
        return

    if not tenant_slug:
        await ws.close(code=4002, reason="Missing tenant")
        return

    await wa_ws_manager.connect(ws, tenant_slug, user_id)

    try:
        while True:
            # Keep connection alive — client may send pings or heartbeat
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WS whatsapp error: %s", exc)
    finally:
        wa_ws_manager.disconnect(ws, tenant_slug, user_id)
