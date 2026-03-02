import httpx
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class BridgeError(Exception):
    """Raised when bridge communication fails."""
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code

    @property
    def is_session_not_found(self) -> bool:
        return self.status_code == 404

    @property
    def is_connection_error(self) -> bool:
        return self.status_code == 502


class WABridgeClient:
    def __init__(self):
        self.base_url = settings.wa_bridge_url
        self.headers = {
            "X-Bridge-Secret": settings.wa_bridge_secret,
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, json: dict | None = None) -> dict:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(f"{self.base_url}{path}", json=json, headers=self.headers, timeout=30)
                resp.raise_for_status()
                return resp.json()
            except httpx.ConnectError as e:
                logger.error("Bridge POST %s connection failed: %s", path, e)
                raise BridgeError(f"WhatsApp bridge unavailable: {e}")
            except httpx.HTTPStatusError as e:
                logger.error("Bridge POST %s returned %s: %s", path, e.response.status_code, e.response.text[:200])
                raise BridgeError(f"Bridge error: {e.response.text[:200]}", e.response.status_code)
            except Exception as e:
                logger.error("Bridge POST %s failed: %s", path, e)
                raise BridgeError(f"Bridge communication failed: {e}")

    async def _get(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(f"{self.base_url}{path}", headers=self.headers, timeout=30)
                resp.raise_for_status()
                return resp.json()
            except httpx.ConnectError as e:
                logger.error("Bridge GET %s connection failed: %s", path, e)
                raise BridgeError(f"WhatsApp bridge unavailable: {e}")
            except httpx.HTTPStatusError as e:
                logger.error("Bridge GET %s returned %s", path, e.response.status_code)
                raise BridgeError(f"Bridge error: {e.response.text[:200]}", e.response.status_code)
            except Exception as e:
                logger.error("Bridge GET %s failed: %s", path, e)
                raise BridgeError(f"Bridge communication failed: {e}")

    async def _delete(self, path: str, json: dict | None = None) -> dict:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.request("DELETE", f"{self.base_url}{path}", json=json, headers=self.headers, timeout=30)
                resp.raise_for_status()
                return resp.json()
            except httpx.ConnectError as e:
                logger.error("Bridge DELETE %s connection failed: %s", path, e)
                raise BridgeError(f"WhatsApp bridge unavailable: {e}")
            except httpx.HTTPStatusError as e:
                logger.error("Bridge DELETE %s returned %s", path, e.response.status_code)
                raise BridgeError(f"Bridge error: {e.response.text[:200]}", e.response.status_code)
            except Exception as e:
                logger.error("Bridge DELETE %s failed: %s", path, e)
                raise BridgeError(f"Bridge communication failed: {e}")

    # ── Session management ──
    async def start_session(self, account_id: str, tenant_slug: str) -> dict:
        return await self._post(f"/sessions/{account_id}/start", {"tenant_slug": tenant_slug})

    async def get_qr(self, account_id: str) -> dict:
        return await self._get(f"/sessions/{account_id}/qr")

    async def get_status(self, account_id: str) -> dict:
        return await self._get(f"/sessions/{account_id}/status")

    async def close_session(self, account_id: str, logout: bool = True) -> dict:
        return await self._delete(f"/sessions/{account_id}", {"logout": logout})

    # ── Messaging ──
    async def send_message(
        self, account_id: str, jid: str, content: str, message_type: str = "text",
        media_url: Optional[str] = None, media_mime_type: Optional[str] = None,
        filename: Optional[str] = None, caption: Optional[str] = None,
        quoted_wa_key: Optional[dict] = None,
    ) -> dict:
        payload: dict = {"jid": jid, "content": content, "message_type": message_type}
        if media_url:
            payload["media_url"] = media_url
        if media_mime_type:
            payload["media_mime_type"] = media_mime_type
        if filename:
            payload["filename"] = filename
        if caption:
            payload["caption"] = caption
        if quoted_wa_key:
            payload["quoted_wa_key"] = quoted_wa_key
        return await self._post(f"/sessions/{account_id}/send", payload)

    # ── Read receipts ──
    async def mark_read(self, account_id: str, jid: str, message_ids: list[str]) -> dict:
        return await self._post(f"/sessions/{account_id}/read", {"jid": jid, "message_ids": message_ids})

    # ── Typing presence ──
    async def send_presence(self, account_id: str, jid: str, type: str) -> dict:
        return await self._post(f"/sessions/{account_id}/presence", {"jid": jid, "type": type})

    # ── Reactions ──
    async def send_reaction(self, account_id: str, jid: str, message_key: dict, emoji: str) -> dict:
        return await self._post(f"/sessions/{account_id}/react", {"jid": jid, "message_key": message_key, "emoji": emoji})

    # ── Forward ──
    async def forward_message(self, account_id: str, source_jid: str, target_jid: str, message_key: dict) -> dict:
        return await self._post(f"/sessions/{account_id}/forward", {
            "source_jid": source_jid, "target_jid": target_jid, "message_key": message_key,
        })

    # ── Delete (revoke) ──
    async def delete_message(self, account_id: str, jid: str, message_key: dict) -> dict:
        return await self._post(f"/sessions/{account_id}/delete-message", {"jid": jid, "message_key": message_key})

    # ── Edit ──
    async def edit_message(self, account_id: str, jid: str, message_key: dict, new_content: str) -> dict:
        return await self._post(f"/sessions/{account_id}/edit-message", {
            "jid": jid, "message_key": message_key, "new_content": new_content,
        })

    # ── Poll ──
    async def send_poll(self, account_id: str, jid: str, question: str, options: list[str], allow_multiple: bool = False) -> dict:
        return await self._post(f"/sessions/{account_id}/send-poll", {
            "jid": jid, "question": question, "options": options, "allow_multiple": allow_multiple,
        })

    # ── Check number ──
    async def check_number(self, account_id: str, phone_numbers: list[str]) -> dict:
        return await self._post(f"/sessions/{account_id}/check-number", {"phone_numbers": phone_numbers})

    # ── Presence ──
    async def subscribe_presence(self, account_id: str, jid: str) -> dict:
        return await self._post(f"/sessions/{account_id}/subscribe-presence", {"jid": jid})

    async def get_presence(self, account_id: str, jid: str) -> dict:
        return await self._get(f"/sessions/{account_id}/presence/{jid}")

    # ── Groups ──
    async def create_group(self, account_id: str, name: str, participants: list[str]) -> dict:
        return await self._post(f"/sessions/{account_id}/groups/create", {"name": name, "participants": participants})

    async def get_group_metadata(self, account_id: str, group_jid: str) -> dict:
        return await self._get(f"/sessions/{account_id}/groups/{group_jid}/metadata")

    async def add_group_participants(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/sessions/{account_id}/groups/{group_jid}/participants/add", {"participants": participants})

    async def remove_group_participants(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/sessions/{account_id}/groups/{group_jid}/participants/remove", {"participants": participants})

    # ── Disappearing messages ──
    async def set_disappearing(self, account_id: str, jid: str, duration: int) -> dict:
        return await self._post(f"/sessions/{account_id}/disappearing", {"jid": jid, "duration": duration})

    # ── Labels ──
    async def get_labels(self, account_id: str) -> dict:
        return await self._get(f"/sessions/{account_id}/labels")


wa_bridge = WABridgeClient()
