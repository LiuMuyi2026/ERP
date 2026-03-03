"""Evolution API client — replaces the old Baileys bridge."""

import httpx
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class BridgeError(Exception):
    """Raised when Evolution API communication fails."""
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
    """HTTP client for Evolution API."""

    def __init__(self):
        self.base_url = settings.evo_api_url.rstrip("/") if settings.evo_api_url else ""
        self.headers = {
            "apikey": settings.evo_api_key,
            "Content-Type": "application/json",
        }
        self.backend_url = settings.backend_public_url.rstrip("/") if settings.backend_public_url else ""

    async def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        if not self.base_url:
            raise BridgeError("EVO_API_URL is not configured")
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.request(
                    method, f"{self.base_url}{path}",
                    json=json, headers=self.headers, timeout=30,
                )
                resp.raise_for_status()
                try:
                    return resp.json()
                except Exception:
                    return {"ok": True}
            except httpx.ConnectError as e:
                logger.error("Evolution API %s %s connection failed: %s", method, path, e)
                raise BridgeError(f"Evolution API unavailable: {e}")
            except httpx.HTTPStatusError as e:
                body = e.response.text[:300]
                logger.error("Evolution API %s %s returned %s: %s", method, path, e.response.status_code, body)
                raise BridgeError(f"Evolution API error: {body}", e.response.status_code)
            except Exception as e:
                logger.error("Evolution API %s %s failed: %s", method, path, e)
                raise BridgeError(f"Evolution API communication failed: {e}")

    async def _post(self, path: str, json: dict | None = None) -> dict:
        return await self._request("POST", path, json)

    async def _get(self, path: str) -> dict:
        return await self._request("GET", path)

    async def _put(self, path: str, json: dict | None = None) -> dict:
        return await self._request("PUT", path, json)

    async def _delete(self, path: str, json: dict | None = None) -> dict:
        return await self._request("DELETE", path, json)

    # ── Session management ──

    async def start_session(self, account_id: str, tenant_slug: str) -> dict:
        """Create an Evolution instance and configure its webhook."""
        return await self._post("/instance/create", {
            "instanceName": account_id,
            "integration": "WHATSAPP-BAILEYS",
            "qrcode": True,
            "webhook": {
                "url": f"{self.backend_url}/api/whatsapp/evo-webhook",
                "enabled": True,
                "webhookByEvents": False,
                "events": [
                    "QRCODE_UPDATED",
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "MESSAGES_DELETE",
                    "CONNECTION_UPDATE",
                    "PRESENCE_UPDATE",
                    "GROUPS_UPSERT",
                    "GROUP_PARTICIPANTS_UPDATE",
                ],
                "headers": {
                    "X-Tenant-Slug": tenant_slug,
                },
            },
        })

    async def get_qr(self, account_id: str) -> dict:
        """Get the QR code for an instance. Returns base64 QR data."""
        result = await self._get(f"/instance/connect/{account_id}")
        # Normalize response to match old bridge format
        base64 = result.get("base64")
        code = result.get("code")
        return {
            "qr_data": base64 or code,
            "status": "pending_qr" if (base64 or code) else "connected",
        }

    async def get_status(self, account_id: str) -> dict:
        """Query connection state of an instance."""
        result = await self._get(f"/instance/connectionState/{account_id}")
        state = result.get("instance", {}).get("state", "close")
        status_map = {"open": "connected", "connecting": "pending_qr", "close": "disconnected"}
        return {"status": status_map.get(state, "disconnected"), "raw_state": state}

    async def close_session(self, account_id: str, logout: bool = True) -> dict:
        if logout:
            try:
                await self._delete(f"/instance/logout/{account_id}")
            except BridgeError:
                pass
        return await self._delete(f"/instance/delete/{account_id}")

    # ── Messaging ──

    async def send_message(
        self, account_id: str, jid: str, content: str, message_type: str = "text",
        media_url: Optional[str] = None, media_mime_type: Optional[str] = None,
        filename: Optional[str] = None, caption: Optional[str] = None,
        quoted_wa_key: Optional[dict] = None,
    ) -> dict:
        # Build quoted context if replying
        quoted = None
        if quoted_wa_key:
            quoted = {"key": quoted_wa_key}

        if message_type == "text" or (not media_url and not media_mime_type):
            payload: dict = {
                "number": jid,
                "text": content,
            }
            if quoted:
                payload["quoted"] = quoted
            result = await self._post(f"/message/sendText/{account_id}", payload)
        else:
            # Media message
            media_type_map = {
                "image": "image",
                "video": "video",
                "audio": "audio",
                "document": "document",
                "sticker": "sticker",
            }
            evo_media_type = media_type_map.get(message_type, "document")
            payload = {
                "number": jid,
                "mediatype": evo_media_type,
                "media": media_url,
                "mimetype": media_mime_type,
                "caption": caption or "",
                "fileName": filename or "",
            }
            if quoted:
                payload["quoted"] = quoted
            result = await self._post(f"/message/sendMedia/{account_id}", payload)

        # Normalize response
        key = result.get("key", {})
        return {
            "wa_message_id": key.get("id"),
            "wa_key": key,
            "status": "sent" if key.get("id") else "pending",
        }

    # ── Read receipts ──

    async def mark_read(self, account_id: str, jid: str, message_ids: list[str]) -> dict:
        keys = [{"remoteJid": jid, "id": mid} for mid in message_ids]
        return await self._post(f"/chat/markMessageAsRead/{account_id}", {
            "readMessages": keys,
        })

    # ── Typing presence ──

    async def send_presence(self, account_id: str, jid: str, type: str) -> dict:
        presence_map = {"composing": "composing", "paused": "paused", "recording": "recording"}
        return await self._post(f"/chat/updatePresence/{account_id}", {
            "number": jid,
            "presence": presence_map.get(type, "composing"),
        })

    # ── Reactions ──

    async def send_reaction(self, account_id: str, jid: str, message_key: dict, emoji: str) -> dict:
        return await self._post(f"/message/sendReaction/{account_id}", {
            "key": message_key,
            "reaction": emoji,
        })

    # ── Forward ──

    async def forward_message(self, account_id: str, source_jid: str, target_jid: str, message_key: dict) -> dict:
        # Evolution doesn't have a direct forward — re-send with quoted
        return await self._post(f"/message/sendText/{account_id}", {
            "number": target_jid,
            "text": "",
            "quoted": {"key": message_key},
        })

    # ── Delete (revoke) ──

    async def delete_message(self, account_id: str, jid: str, message_key: dict) -> dict:
        return await self._delete(f"/chat/deleteMessageForEveryone/{account_id}", {
            "key": message_key,
        })

    # ── Edit ──

    async def edit_message(self, account_id: str, jid: str, message_key: dict, new_content: str) -> dict:
        return await self._put(f"/message/editMessage/{account_id}", {
            "key": message_key,
            "text": new_content,
        })

    # ── Poll ──

    async def send_poll(self, account_id: str, jid: str, question: str, options: list[str], allow_multiple: bool = False) -> dict:
        result = await self._post(f"/message/sendPoll/{account_id}", {
            "number": jid,
            "name": question,
            "values": options,
            "selectableCount": 0 if allow_multiple else 1,
        })
        key = result.get("key", {})
        return {"wa_message_id": key.get("id"), "wa_key": key}

    # ── Check number ──

    async def check_number(self, account_id: str, phone_numbers: list[str]) -> dict:
        result = await self._post(f"/chat/whatsappNumbers/{account_id}", {
            "numbers": phone_numbers,
        })
        # Normalize to old bridge format
        results = []
        for item in result if isinstance(result, list) else result.get("result", result.get("data", [])):
            results.append({
                "number": item.get("number", ""),
                "jid": item.get("jid", ""),
                "exists": item.get("exists", False),
            })
        return {"results": results}

    # ── Presence ──

    async def subscribe_presence(self, account_id: str, jid: str) -> dict:
        return await self._post(f"/chat/updatePresence/{account_id}", {
            "number": jid,
            "presence": "composing",
        })

    async def get_presence(self, account_id: str, jid: str) -> dict:
        # Evolution doesn't have a dedicated get-presence — return unknown
        return {"jid": jid, "status": "unknown"}

    # ── Groups ──

    async def create_group(self, account_id: str, name: str, participants: list[str]) -> dict:
        return await self._post(f"/group/create/{account_id}", {
            "subject": name,
            "participants": participants,
        })

    async def get_group_metadata(self, account_id: str, group_jid: str) -> dict:
        return await self._get(f"/group/findGroupInfos/{account_id}?groupJid={group_jid}")

    async def add_group_participants(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/group/updateParticipant/{account_id}", {
            "groupJid": group_jid,
            "action": "add",
            "participants": participants,
        })

    async def remove_group_participants(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/group/updateParticipant/{account_id}", {
            "groupJid": group_jid,
            "action": "remove",
            "participants": participants,
        })

    # ── Disappearing messages ──

    async def set_disappearing(self, account_id: str, jid: str, duration: int) -> dict:
        return await self._post(f"/chat/updateSettings/{account_id}", {
            "number": jid,
            "ephemeralExpiration": duration,
        })

    # ── Labels ──

    async def get_labels(self, account_id: str) -> dict:
        return await self._get(f"/label/findLabels/{account_id}")

    async def handle_label(self, account_id: str, label_id: str, jid: str, action: str = "add") -> dict:
        return await self._post(f"/label/handleLabel/{account_id}", {
            "labelId": label_id, "number": jid, "action": action,
        })

    # ── Profile picture ──

    async def fetch_profile_picture(self, account_id: str, jid: str) -> dict:
        result = await self._post(f"/chat/fetchProfilePictureUrl/{account_id}", {"number": jid})
        return {"profile_pic_url": result.get("profilePictureUrl") or result.get("profilePicUrl")}

    # ── Interactive messages ──

    async def send_buttons(self, account_id: str, jid: str, title: str,
                           description: str, footer: str, buttons: list[dict]) -> dict:
        result = await self._post(f"/message/sendButtons/{account_id}", {
            "number": jid, "title": title, "description": description,
            "footer": footer, "buttons": buttons,
        })
        key = result.get("key", {})
        return {"wa_message_id": key.get("id"), "wa_key": key}

    async def send_list(self, account_id: str, jid: str, title: str, description: str,
                        button_text: str, footer: str, sections: list[dict]) -> dict:
        result = await self._post(f"/message/sendList/{account_id}", {
            "number": jid, "title": title, "description": description,
            "buttonText": button_text, "footerText": footer, "sections": sections,
        })
        key = result.get("key", {})
        return {"wa_message_id": key.get("id"), "wa_key": key}

    # ── Archive ──

    async def archive_chat(self, account_id: str, jid: str, archive: bool = True) -> dict:
        return await self._post(f"/chat/archiveChat/{account_id}", {
            "lastMessage": {"key": {"remoteJid": jid}}, "archive": archive,
        })

    # ── Block ──

    async def update_block_status(self, account_id: str, jid: str, action: str = "block") -> dict:
        return await self._post(f"/chat/updateBlockStatus/{account_id}", {
            "number": jid, "status": action,
        })

    # ── Profile management ──

    async def update_profile_name(self, account_id: str, name: str) -> dict:
        return await self._post(f"/chat/updateProfileName/{account_id}", {"name": name})

    async def update_profile_status(self, account_id: str, status: str) -> dict:
        return await self._post(f"/chat/updateProfileStatus/{account_id}", {"status": status})

    async def update_profile_picture(self, account_id: str, image_url: str) -> dict:
        return await self._put(f"/chat/updateProfilePicture/{account_id}", {"picture": image_url})

    async def fetch_privacy_settings(self, account_id: str) -> dict:
        return await self._get(f"/chat/fetchPrivacySettings/{account_id}")

    async def update_privacy_settings(self, account_id: str, settings: dict) -> dict:
        return await self._put(f"/chat/updatePrivacySettings/{account_id}", settings)

    # ── Group management (enhanced) ──

    async def fetch_invite_code(self, account_id: str, group_jid: str) -> dict:
        return await self._get(f"/group/inviteCode/{account_id}?groupJid={group_jid}")

    async def update_group_subject(self, account_id: str, group_jid: str, subject: str) -> dict:
        return await self._post(f"/group/updateGroupSubject/{account_id}", {
            "groupJid": group_jid, "subject": subject,
        })

    async def update_group_description(self, account_id: str, group_jid: str, description: str) -> dict:
        return await self._post(f"/group/updateGroupDescription/{account_id}", {
            "groupJid": group_jid, "description": description,
        })

    async def update_group_picture(self, account_id: str, group_jid: str, image_url: str) -> dict:
        return await self._put(f"/group/updateGroupPicture/{account_id}", {
            "groupJid": group_jid, "image": image_url,
        })

    async def promote_participant(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/group/updateParticipant/{account_id}", {
            "groupJid": group_jid, "action": "promote", "participants": participants,
        })

    async def demote_participant(self, account_id: str, group_jid: str, participants: list[str]) -> dict:
        return await self._post(f"/group/updateParticipant/{account_id}", {
            "groupJid": group_jid, "action": "demote", "participants": participants,
        })

    # ── WhatsApp Status / Stories ──

    async def send_status(self, account_id: str, status_type: str, content: str,
                          background_color: str = "#25D366", font: int = 1,
                          media_url: str = None, caption: str = None,
                          all_contacts: bool = True, jid_list: list[str] = None) -> dict:
        payload: dict = {"type": status_type, "allContacts": all_contacts}
        if status_type == "text":
            payload.update({"content": content, "backgroundColor": background_color, "font": font})
        else:
            payload.update({"content": media_url or content, "caption": caption or ""})
        if jid_list:
            payload["statusJidList"] = jid_list
        return await self._post(f"/message/sendStatus/{account_id}", payload)

    # ── OpenAI / Chatbot integration ──

    async def set_openai_creds(self, account_id: str, name: str, api_key: str) -> dict:
        return await self._post(f"/openai/creds/{account_id}", {
            "name": name, "apiKey": api_key,
        })

    async def create_openai_bot(self, account_id: str, config: dict) -> dict:
        return await self._post(f"/openai/create/{account_id}", config)

    async def update_openai_settings(self, account_id: str, settings: dict) -> dict:
        return await self._post(f"/openai/settings/{account_id}", settings)

    async def change_bot_status(self, account_id: str, jid: str, status: str) -> dict:
        return await self._post(f"/openai/changeStatus/{account_id}", {
            "remoteJid": jid, "status": status,
        })

    async def list_bot_sessions(self, account_id: str, bot_id: str) -> dict:
        return await self._get(f"/openai/fetchSessions/{bot_id}/{account_id}")


wa_bridge = WABridgeClient()
