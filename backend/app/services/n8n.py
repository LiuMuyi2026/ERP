import httpx
from app.config import settings
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class N8NClient:
    def __init__(self):
        self.base_url = settings.n8n_api_url
        self.headers = {
            "X-N8N-API-KEY": settings.n8n_api_key,
            "Content-Type": "application/json",
        }

    async def create_credential(self, name: str, type: str, data: dict) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/credentials",
                json={"name": name, "type": type, "data": data},
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_workflow_from_template(self, template: dict, credential_id: str) -> dict:
        workflow = dict(template)
        for node in workflow.get("nodes", []):
            if node.get("credentials"):
                for cred_type in node["credentials"]:
                    node["credentials"][cred_type] = {"id": credential_id}
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/workflows",
                json=workflow, headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def activate_workflow(self, workflow_id: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{self.base_url}/api/v1/workflows/{workflow_id}",
                json={"active": True}, headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_executions(self, limit: int = 50) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/executions",
                params={"limit": limit}, headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def search_app_directory(self, query: str = "") -> list[dict]:
        """
        Search n8n node/app directory.
        Tries modern and legacy routes; falls back to empty list if unavailable.
        """
        q = (query or "").lower().strip()
        candidates = [
            "/api/v1/node-types",
            "/rest/node-types",
        ]
        async with httpx.AsyncClient() as client:
            for route in candidates:
                try:
                    resp = await client.get(
                        f"{self.base_url}{route}",
                        headers=self.headers,
                        timeout=15,
                    )
                    if resp.status_code >= 400:
                        continue
                    data = resp.json()
                    items = data if isinstance(data, list) else data.get("data", [])
                    normalized = []
                    for item in items:
                        name = item.get("displayName") or item.get("name") or "Unknown"
                        node_name = item.get("name") or ""
                        desc = item.get("description") or ""
                        searchable = f"{name} {node_name} {desc}".lower()
                        if q and q not in searchable:
                            continue
                        normalized.append(
                            {
                                "app_key": node_name or name.lower().replace(" ", "_"),
                                "name": name,
                                "description": desc,
                                "source": "n8n",
                                "category": item.get("group", ["General"])[0] if isinstance(item.get("group"), list) and item.get("group") else "General",
                                "capabilities": item.get("credentials", []),
                                "raw": item,
                            }
                        )
                    return normalized
                except Exception:
                    continue
        return []

    async def trigger_webhook(self, webhook_url: str, payload: dict, timeout_s: int = 20) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json=payload, timeout=timeout_s)
            text = resp.text[:500]
            return {"status_code": resp.status_code, "ok": resp.is_success, "response_text": text}


n8n_client = N8NClient()
