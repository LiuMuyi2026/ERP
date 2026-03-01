from datetime import datetime
import json
import os
import uuid
from typing import Any, Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.deps import get_current_user_with_tenant, require_tenant_admin
from app.services.ai.provider import generate_json_for_tenant
from app.services.n8n import n8n_client
from app.utils.sql import build_update_clause

router = APIRouter(prefix="/integrations", tags=["integrations"])

NOTION_API_VERSION = "2022-06-28"

class AIProfileUpdate(BaseModel):
    style_preference: Optional[str] = None
    custom_instructions: Optional[str] = None

@router.get("/notion/auth-url")
async def get_notion_auth_url(ctx: dict = Depends(get_current_user_with_tenant)):
    client_id = os.getenv("NOTION_CLIENT_ID", "your-notion-client-id")
    redirect_uri = os.getenv("NOTION_REDIRECT_URI", "http://localhost:3000/integrations/notion/callback")
    return {
        "url": f"https://api.notion.com/v1/oauth/authorize?owner=user&client_id={client_id}&redirect_uri={redirect_uri}&response_type=code"
    }

@router.get("/notion/callback")
async def notion_callback(code: str, ctx: dict = Depends(get_current_user_with_tenant)):
    client_id = os.getenv("NOTION_CLIENT_ID", "your-notion-client-id")
    client_secret = os.getenv("NOTION_CLIENT_SECRET", "your-notion-client-secret")
    redirect_uri = os.getenv("NOTION_REDIRECT_URI", "http://localhost:3000/integrations/notion/callback")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.notion.com/v1/oauth/token",
            auth=(client_id, client_secret),
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri
            }
        )
        data = response.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data.get("error_description", "OAuth failed"))
        
        access_token = data["access_token"]
        
        # Save token to DB
        db = ctx["db"]
        await db.execute(
            text("""
                INSERT INTO integration_oauth_tokens (user_id, platform, access_token, metadata)
                VALUES (:uid, 'notion', :token, :meta)
                ON CONFLICT (user_id, platform) 
                DO UPDATE SET access_token = EXCLUDED.access_token, metadata = EXCLUDED.metadata, updated_at = NOW()
            """),
            {"uid": ctx["sub"], "token": access_token, "meta": json.dumps(data)}
        )
        await db.commit()
        return {"status": "success", "message": "Notion connected successfully"}

@router.get("/notion/search")
async def search_notion(query: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Get user's Notion token
    row = await db.execute(
        text("SELECT access_token FROM integration_oauth_tokens WHERE user_id = :uid AND platform = 'notion'"),
        {"uid": ctx["sub"]}
    )
    res = row.fetchone()
    if not res:
        raise HTTPException(status_code=401, detail="Notion not connected")
    
    token = res.access_token
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.notion.com/v1/search",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": NOTION_API_VERSION,
                "Content-Type": "application/json"
            },
            json={"query": query, "filter": {"property": "object", "value": "database"}}
        )
        return response.json()

@router.get("/ai/profile")
async def get_ai_profile(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(
        text("SELECT * FROM user_ai_profiles WHERE user_id = :uid"),
        {"uid": ctx["sub"]}
    )
    profile = row.fetchone()
    if not profile:
        # Auto-create default profile
        await db.execute(
            text("INSERT INTO user_ai_profiles (user_id) VALUES (:uid)"),
            {"uid": ctx["sub"]}
        )
        await db.commit()
        return {"style_preference": "professional", "custom_instructions": ""}
    return dict(profile._mapping)

_AI_PROFILE_FIELDS = {"style_preference", "custom_instructions"}


@router.patch("/ai/profile")
async def update_ai_profile(body: AIProfileUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no-op"}

    set_clause, params = build_update_clause(updates, _AI_PROFILE_FIELDS)
    if not set_clause:
        return {"status": "no-op"}
    params["uid"] = ctx["sub"]
    await db.execute(
        text(f"UPDATE user_ai_profiles SET {set_clause}, updated_at = NOW() WHERE user_id = :uid"),
        params,
    )
    await db.commit()
    return {"status": "updated"}

CRED_TYPE_MAP = {
    "wecom": "weComApi",
    "feishu": "feishuApi",
    "dingtalk": "dingTalkApi",
    "linkedin": "linkedInOAuth2Api",
    "whatsapp": "whatsAppTriggerApi",
}

CURATED_APP_DIRECTORY = [
    {
        "app_key": "n8n",
        "name": "n8n",
        "source": "curated",
        "category": "Automation",
        "description": "Workflow automation and agent orchestration",
        "capabilities": ["workflow", "webhook", "trigger", "ai-agent"],
        "docs_url": "https://docs.n8n.io",
    },
    {
        "app_key": "notion",
        "name": "Notion",
        "source": "curated",
        "category": "Knowledge",
        "description": "Knowledge base and docs collaboration",
        "capabilities": ["search", "database", "pages", "blocks"],
        "docs_url": "https://developers.notion.com",
    },
    {
        "app_key": "feishu",
        "name": "Feishu / Lark",
        "source": "curated",
        "category": "Messaging",
        "description": "Messaging and enterprise collaboration",
        "capabilities": ["messages", "bot", "group", "contacts"],
        "docs_url": "https://open.feishu.cn",
    },
    {
        "app_key": "wecom",
        "name": "WeCom",
        "source": "curated",
        "category": "Messaging",
        "description": "Enterprise WeChat integration",
        "capabilities": ["messages", "bot", "contacts", "webhook"],
        "docs_url": "https://developer.work.weixin.qq.com",
    },
    {
        "app_key": "dingtalk",
        "name": "DingTalk",
        "source": "curated",
        "category": "Messaging",
        "description": "Enterprise communication and automation",
        "capabilities": ["messages", "bot", "approval", "contacts"],
        "docs_url": "https://open.dingtalk.com",
    },
    {
        "app_key": "whatsapp",
        "name": "WhatsApp",
        "source": "curated",
        "category": "Messaging",
        "description": "Business messaging and customer support",
        "capabilities": ["messages", "template-message", "webhook"],
        "docs_url": "https://developers.facebook.com/docs/whatsapp",
    },
    {
        "app_key": "salesforce",
        "name": "Salesforce",
        "source": "curated",
        "category": "CRM",
        "description": "CRM and account lifecycle",
        "capabilities": ["accounts", "opportunities", "api"],
        "docs_url": "https://developer.salesforce.com",
    },
]

DEFAULT_FEATURE_FLAGS = [
    {"feature_key": "integration.directory", "feature_name": "应用目录检索", "enabled": True, "admin_only": False},
    {"feature_key": "integration.templates", "feature_name": "联动模板", "enabled": True, "admin_only": False},
    {"feature_key": "integration.templates.ai", "feature_name": "AI联动处理", "enabled": True, "admin_only": True},
    {"feature_key": "integration.n8n.catalog", "feature_name": "n8n连接目录", "enabled": True, "admin_only": False},
    {"feature_key": "integration.n8n.trigger", "feature_name": "n8n自动触发", "enabled": True, "admin_only": True},
]

TEMPLATE_CATALOG = {
    "triggers": [
        {
            "module": "crm",
            "event": "lead.created",
            "label": "Lead Created",
            "fields": ["lead.id", "lead.full_name", "lead.email", "lead.company", "lead.status", "lead.source"],
        },
        {
            "module": "crm",
            "event": "contract.created",
            "label": "Contract Created",
            "fields": ["contract.id", "contract.contract_no", "contract.amount", "contract.currency", "contract.payment_method"],
        },
        {
            "module": "operations",
            "event": "task.done",
            "label": "Operation Task Done",
            "fields": ["task.id", "task.code", "task.title", "task.owner_role", "order.contract_no"],
        },
        {
            "module": "accounting",
            "event": "invoice.paid",
            "label": "Invoice Paid",
            "fields": ["invoice.id", "invoice.invoice_number", "invoice.amount", "invoice.currency", "invoice.paid_at"],
        },
    ],
    "actions": [
        {
            "app_key": "feishu",
            "action": "send_message",
            "label": "Send Message",
            "target_fields": ["message.title", "message.body", "message.channel"],
        },
        {
            "app_key": "wecom",
            "action": "send_message",
            "label": "Send Message",
            "target_fields": ["message.title", "message.body", "message.user_id"],
        },
        {
            "app_key": "notion",
            "action": "create_page",
            "label": "Create Page",
            "target_fields": ["page.title", "page.content", "page.database_id"],
        },
        {
            "app_key": "n8n",
            "action": "trigger_webhook",
            "label": "Trigger Webhook",
            "target_fields": ["payload"],
        },
    ],
    "operators": ["eq", "ne", "contains", "not_contains", "gt", "gte", "lt", "lte", "exists", "not_exists"],
    "transforms": ["text", "number", "boolean", "lowercase", "uppercase", "trim"],
}


class IntegrationSetup(BaseModel):
    platform: str
    credentials: dict
    activate_workflows: list = Field(default_factory=list)


class FeatureFlagUpdate(BaseModel):
    enabled: bool
    admin_only: Optional[bool] = None
    settings: Optional[dict] = None


class LinkTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    source_module: str
    source_event: str
    target_app_key: str
    target_action: str
    mapping_config: dict = Field(default_factory=dict)
    ai_enabled: bool = False
    ai_instruction: Optional[str] = None
    automation_mode: str = "manual"
    n8n_webhook_url: Optional[str] = None


class LinkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source_module: Optional[str] = None
    source_event: Optional[str] = None
    target_app_key: Optional[str] = None
    target_action: Optional[str] = None
    mapping_config: Optional[dict] = None
    ai_enabled: Optional[bool] = None
    ai_instruction: Optional[str] = None
    automation_mode: Optional[str] = None
    n8n_webhook_url: Optional[str] = None
    is_active: Optional[bool] = None


class LinkTemplateRun(BaseModel):
    input_payload: dict = Field(default_factory=dict)
    trigger_source: str = "manual"


def get_value_by_path(payload: dict, path: str) -> Any:
    if not path:
        return None
    current: Any = payload
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def set_value_by_path(payload: dict, path: str, value: Any):
    if not path:
        return
    parts = path.split(".")
    current = payload
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def apply_transform(value: Any, transform: str) -> Any:
    if transform == "number":
        try:
            return float(value)
        except Exception:
            return 0
    if transform == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("1", "true", "yes", "y", "on")
    if transform == "lowercase":
        return str(value or "").lower()
    if transform == "uppercase":
        return str(value or "").upper()
    if transform == "trim":
        return str(value or "").strip()
    return str(value) if value is not None else ""


def matches_conditions(payload: dict, conditions: list[dict]) -> bool:
    for cond in conditions or []:
        path = cond.get("path", "")
        op = cond.get("operator", "eq")
        expected = cond.get("value")
        actual = get_value_by_path(payload, path)

        if op == "exists" and actual is None:
            return False
        if op == "not_exists" and actual is not None:
            return False
        if op == "eq" and not (actual == expected):
            return False
        if op == "ne" and not (actual != expected):
            return False
        if op == "contains" and str(expected) not in str(actual or ""):
            return False
        if op == "not_contains" and str(expected) in str(actual or ""):
            return False
        if op in ("gt", "gte", "lt", "lte"):
            try:
                a = float(actual)
                b = float(expected)
            except Exception:
                return False
            if op == "gt" and not (a > b):
                return False
            if op == "gte" and not (a >= b):
                return False
            if op == "lt" and not (a < b):
                return False
            if op == "lte" and not (a <= b):
                return False
    return True


def apply_no_code_mapping(payload: dict, mapping_config: dict) -> dict:
    # Notion-like no-code mapping model:
    # {
    #   conditions: [{path, operator, value}],
    #   field_mappings: [{target_path, source_path, transform, default_value}],
    #   constants: [{target_path, value}]
    # }
    result: dict = {}
    if not mapping_config:
        return dict(payload)

    conditions = mapping_config.get("conditions", [])
    if not matches_conditions(payload, conditions):
        return {"_skip": True, "_reason": "conditions_not_matched"}

    for item in mapping_config.get("constants", []):
        set_value_by_path(result, item.get("target_path", ""), item.get("value"))

    for item in mapping_config.get("field_mappings", []):
        source_path = item.get("source_path", "")
        target_path = item.get("target_path", "")
        transform = item.get("transform", "text")
        default_value = item.get("default_value")
        raw = get_value_by_path(payload, source_path)
        value = raw if raw not in (None, "") else default_value
        value = apply_transform(value, transform)
        set_value_by_path(result, target_path, value)

    if not result:
        return dict(payload)
    return result


async def ensure_seed_data(db):
    for app in CURATED_APP_DIRECTORY:
        await db.execute(
            text(
                """
                INSERT INTO integration_app_directory (id, app_key, name, source, category, description, capabilities, docs_url, is_active)
                VALUES (:id, :app_key, :name, :source, :category, :description, CAST(:capabilities AS JSONB), :docs_url, TRUE)
                ON CONFLICT (app_key) DO UPDATE
                SET name = EXCLUDED.name,
                    source = EXCLUDED.source,
                    category = EXCLUDED.category,
                    description = EXCLUDED.description,
                    capabilities = EXCLUDED.capabilities,
                    docs_url = EXCLUDED.docs_url,
                    updated_at = NOW()
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "app_key": app["app_key"],
                "name": app["name"],
                "source": app["source"],
                "category": app["category"],
                "description": app["description"],
                "capabilities": json.dumps(app["capabilities"]),
                "docs_url": app["docs_url"],
            },
        )

    for ff in DEFAULT_FEATURE_FLAGS:
        await db.execute(
            text(
                """
                INSERT INTO integration_feature_flags (id, feature_key, feature_name, enabled, admin_only)
                VALUES (:id, :feature_key, :feature_name, :enabled, :admin_only)
                ON CONFLICT (feature_key) DO NOTHING
                """
            ),
            {"id": str(uuid.uuid4()), **ff},
        )


async def feature_enabled(db, feature_key: str) -> bool:
    row = await db.execute(text("SELECT enabled FROM integration_feature_flags WHERE feature_key = :k"), {"k": feature_key})
    v = row.fetchone()
    return bool(v.enabled) if v else False


@router.get("/configs")
async def list_configs(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await ensure_seed_data(db)
    result = await db.execute(text("SELECT id, platform, is_active, webhook_url, created_at FROM integration_configs"))
    await db.commit()
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/setup")
async def setup_integration(body: IntegrationSetup, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    cred_type = CRED_TYPE_MAP.get(body.platform)
    if not cred_type:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {body.platform}")

    n8n_cred_id = None
    try:
        n8n_cred = await n8n_client.create_credential(
            name=f"{body.platform}_{ctx['tenant_slug']}",
            type=cred_type,
            data=body.credentials,
        )
        n8n_cred_id = n8n_cred.get("id")
    except Exception:
        pass

    config_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO integration_configs (id, platform, credential_data, n8n_credential_id, is_active)
            VALUES (:id, :platform, CAST(:cred AS JSONB), :n8n_id, TRUE)
            ON CONFLICT (platform)
            DO UPDATE SET credential_data = CAST(:cred AS JSONB), n8n_credential_id = :n8n_id, updated_at = NOW()
            """
        ),
        {"id": config_id, "platform": body.platform, "cred": json.dumps(body.credentials), "n8n_id": n8n_cred_id},
    )
    await db.commit()

    activated_workflows = []
    for template_name in body.activate_workflows:
        template_path = f"/app/app/workflows/templates/{body.platform}_{template_name}.json"
        if os.path.exists(template_path):
            try:
                with open(template_path) as f:
                    template = json.load(f)
                wf = await n8n_client.create_workflow_from_template(template, n8n_cred_id)
                if wf.get("id"):
                    await n8n_client.activate_workflow(wf["id"])
                    activated_workflows.append({"name": template_name, "id": wf["id"]})
            except Exception:
                pass

    return {
        "config_id": config_id,
        "platform": body.platform,
        "n8n_credential_id": n8n_cred_id,
        "activated_workflows": activated_workflows,
    }


@router.get("/directory/apps")
async def search_apps(
    q: Optional[str] = None,
    include_n8n: bool = True,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    await ensure_seed_data(db)

    params = {}
    where = ["is_active = TRUE"]
    if q:
        where.append("(name ILIKE :q OR app_key ILIKE :q OR description ILIKE :q)")
        params["q"] = f"%{q}%"

    rows = await db.execute(
        text(
            f"SELECT id, app_key, name, source, category, description, capabilities, docs_url FROM integration_app_directory WHERE {' AND '.join(where)} ORDER BY source, name"
        ),
        params,
    )
    apps = [dict(r._mapping) for r in rows.fetchall()]

    if include_n8n and await feature_enabled(db, "integration.n8n.catalog"):
        n8n_apps = await n8n_client.search_app_directory(q or "")
        existing = {a["app_key"] for a in apps}
        for app in n8n_apps:
            if app["app_key"] not in existing:
                apps.append(app)

    await db.commit()
    return apps


@router.get("/feature-flags")
async def list_feature_flags(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await ensure_seed_data(db)
    rows = await db.execute(text("SELECT * FROM integration_feature_flags ORDER BY feature_name"))
    await db.commit()
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/template-catalog")
async def template_catalog(ctx: dict = Depends(get_current_user_with_tenant)):
    return TEMPLATE_CATALOG


@router.patch("/feature-flags/{feature_key}")
async def update_feature_flag(
    feature_key: str,
    body: FeatureFlagUpdate,
    ctx: dict = Depends(get_current_user_with_tenant),
    _: dict = Depends(require_tenant_admin),
):
    db = ctx["db"]
    updates = {"enabled": body.enabled, "updated_by": ctx["sub"], "updated_at": datetime.utcnow()}
    set_parts = ["enabled = :enabled", "updated_by = :updated_by", "updated_at = :updated_at"]
    if body.admin_only is not None:
        updates["admin_only"] = body.admin_only
        set_parts.append("admin_only = :admin_only")
    if body.settings is not None:
        updates["settings"] = json.dumps(body.settings)
        set_parts.append("settings = CAST(:settings AS JSONB)")
    updates["feature_key"] = feature_key

    await db.execute(
        text(f"UPDATE integration_feature_flags SET {', '.join(set_parts)} WHERE feature_key = :feature_key"),
        updates,
    )
    await db.commit()
    return {"status": "updated", "feature_key": feature_key}


@router.get("/templates")
async def list_templates(
    q: Optional[str] = None,
    source_module: Optional[str] = None,
    active_only: bool = False,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    where = ["1=1"]
    params: dict = {}
    if q:
        where.append("(name ILIKE :q OR description ILIKE :q OR source_event ILIKE :q)")
        params["q"] = f"%{q}%"
    if source_module:
        where.append("source_module = :source_module")
        params["source_module"] = source_module
    if active_only:
        where.append("is_active = TRUE")

    rows = await db.execute(
        text(f"SELECT * FROM integration_link_templates WHERE {' AND '.join(where)} ORDER BY created_at DESC"),
        params,
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/templates")
async def create_template(
    body: LinkTemplateCreate,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    if not await feature_enabled(db, "integration.templates"):
        raise HTTPException(status_code=403, detail="Template feature disabled by admin")

    if body.ai_enabled and not await feature_enabled(db, "integration.templates.ai"):
        raise HTTPException(status_code=403, detail="AI template feature disabled by admin")

    template_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO integration_link_templates (
                id, name, description, source_module, source_event,
                target_app_key, target_action, mapping_config,
                ai_enabled, ai_instruction, automation_mode, n8n_webhook_url,
                is_active, created_by
            ) VALUES (
                :id, :name, :description, :source_module, :source_event,
                :target_app_key, :target_action, CAST(:mapping_config AS JSONB),
                :ai_enabled, :ai_instruction, :automation_mode, :n8n_webhook_url,
                TRUE, :created_by
            )
            """
        ),
        {
            "id": template_id,
            "name": body.name,
            "description": body.description,
            "source_module": body.source_module,
            "source_event": body.source_event,
            "target_app_key": body.target_app_key,
            "target_action": body.target_action,
            "mapping_config": json.dumps(body.mapping_config),
            "ai_enabled": body.ai_enabled,
            "ai_instruction": body.ai_instruction,
            "automation_mode": body.automation_mode,
            "n8n_webhook_url": body.n8n_webhook_url,
            "created_by": ctx["sub"],
        },
    )
    await db.commit()
    return {"id": template_id}


_TEMPLATE_UPDATE_FIELDS = {"name", "description", "source_module", "target_module", "mapping_config", "is_active"}


@router.patch("/templates/{template_id}")
async def update_template(template_id: str, body: LinkTemplateUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"status": "no changes"}
    payload = {k: v for k, v in payload.items() if k in _TEMPLATE_UPDATE_FIELDS}
    if not payload:
        return {"status": "no changes"}

    set_parts = []
    params: dict = {"id": template_id, "updated_at": datetime.utcnow()}
    for k, v in payload.items():
        if k == "mapping_config":
            params[k] = json.dumps(v)
            set_parts.append("mapping_config = CAST(:mapping_config AS JSONB)")
        else:
            params[k] = v
            set_parts.append(f"{k} = :{k}")
    set_parts.append("updated_at = :updated_at")

    await ctx["db"].execute(text(f"UPDATE integration_link_templates SET {', '.join(set_parts)} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "updated"}


@router.post("/templates/{template_id}/run-preview")
async def run_template_preview(template_id: str, body: LinkTemplateRun, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("SELECT * FROM integration_link_templates WHERE id = :id"), {"id": template_id})
    tpl = row.fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if not tpl.is_active:
        raise HTTPException(status_code=400, detail="Template inactive")

    mapping = tpl.mapping_config if isinstance(tpl.mapping_config, dict) else {}
    transformed = apply_no_code_mapping(body.input_payload, mapping)
    ai_output = {}

    if tpl.ai_enabled:
        if not await feature_enabled(db, "integration.templates.ai"):
            raise HTTPException(status_code=403, detail="AI template feature disabled by admin")
        instruction = tpl.ai_instruction or "Transform the payload to a JSON object with actionable fields."
        ai_prompt = (
            "You are an automation transformer. Return strict JSON only.\n"
            f"Instruction:\n{instruction}\n\n"
            f"Input payload:\n{json.dumps(body.input_payload, ensure_ascii=False)}"
        )
        try:
            ai_output = await generate_json_for_tenant(db, ctx.get("tenant_id"), ai_prompt)
            if isinstance(ai_output, dict) and ai_output:
                transformed = ai_output
        except Exception:
            ai_output = {"error": "ai_transform_failed"}

    run_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO integration_link_runs (
                id, template_id, trigger_source, input_payload, transformed_payload, ai_output,
                target_status, target_response, finished_at
            ) VALUES (
                :id, :template_id, :trigger_source,
                CAST(:input_payload AS JSONB), CAST(:transformed_payload AS JSONB), CAST(:ai_output AS JSONB),
                :target_status, :target_response, :finished_at
            )
            """
        ),
        {
            "id": run_id,
            "template_id": template_id,
            "trigger_source": body.trigger_source,
            "input_payload": json.dumps(body.input_payload),
            "transformed_payload": json.dumps(transformed),
            "ai_output": json.dumps(ai_output),
            "target_status": "preview",
            "target_response": "preview-only",
            "finished_at": datetime.utcnow(),
        },
    )
    await db.commit()

    return {
        "run_id": run_id,
            "template": {
                "id": tpl.id,
                "name": tpl.name,
                "source_module": tpl.source_module,
                "source_event": tpl.source_event,
                "target_app_key": tpl.target_app_key,
                "target_action": tpl.target_action,
            },
            "mapping_config": mapping,
        "input_payload": body.input_payload,
        "transformed_payload": transformed,
        "ai_output": ai_output,
    }


@router.post("/templates/{template_id}/trigger")
async def trigger_template(template_id: str, body: LinkTemplateRun, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("SELECT * FROM integration_link_templates WHERE id = :id"), {"id": template_id})
    tpl = row.fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if not tpl.is_active:
        raise HTTPException(status_code=400, detail="Template inactive")

    mapping = tpl.mapping_config if isinstance(tpl.mapping_config, dict) else {}
    transformed = apply_no_code_mapping(body.input_payload, mapping)
    ai_output = {}

    if tpl.ai_enabled and await feature_enabled(db, "integration.templates.ai"):
        instruction = tpl.ai_instruction or "Transform the payload to a JSON object with actionable fields."
        ai_prompt = (
            "You are an automation transformer. Return strict JSON only.\n"
            f"Instruction:\n{instruction}\n\n"
            f"Input payload:\n{json.dumps(body.input_payload, ensure_ascii=False)}"
        )
        try:
            ai_output = await generate_json_for_tenant(db, ctx.get("tenant_id"), ai_prompt)
            if isinstance(ai_output, dict) and ai_output:
                transformed = ai_output
        except Exception:
            ai_output = {"error": "ai_transform_failed"}

    target_status = "skipped"
    target_response = ""

    if isinstance(transformed, dict) and transformed.get("_skip"):
        target_status = "skipped"
        target_response = transformed.get("_reason", "conditions_not_matched")
    elif tpl.automation_mode in ("auto", "n8n") and tpl.n8n_webhook_url and await feature_enabled(db, "integration.n8n.trigger"):
        response = await n8n_client.trigger_webhook(tpl.n8n_webhook_url, transformed)
        target_status = "success" if response.get("ok") else "failed"
        target_response = json.dumps(response, ensure_ascii=False)
    else:
        target_status = "queued"
        target_response = "Template triggered without webhook (manual mode)."

    run_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO integration_link_runs (
                id, template_id, trigger_source, input_payload, transformed_payload, ai_output,
                target_status, target_response, finished_at
            ) VALUES (
                :id, :template_id, :trigger_source,
                CAST(:input_payload AS JSONB), CAST(:transformed_payload AS JSONB), CAST(:ai_output AS JSONB),
                :target_status, :target_response, :finished_at
            )
            """
        ),
        {
            "id": run_id,
            "template_id": template_id,
            "trigger_source": body.trigger_source,
            "input_payload": json.dumps(body.input_payload),
            "transformed_payload": json.dumps(transformed),
            "ai_output": json.dumps(ai_output),
            "target_status": target_status,
            "target_response": target_response,
            "finished_at": datetime.utcnow(),
        },
    )
    await db.commit()
    return {
        "run_id": run_id,
        "target_status": target_status,
        "target_response": target_response,
        "transformed_payload": transformed,
    }


@router.get("/templates/{template_id}/runs")
async def list_template_runs(template_id: str, limit: int = 30, ctx: dict = Depends(get_current_user_with_tenant)):
    rows = await ctx["db"].execute(
        text("SELECT * FROM integration_link_runs WHERE template_id = :template_id ORDER BY started_at DESC LIMIT :limit"),
        {"template_id": template_id, "limit": limit},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/webhook/{platform}/{tenant_slug}")
async def integration_webhook(platform: str, tenant_slug: str, request: Request):
    payload = await request.json()
    from app.database import AsyncSessionLocal
    from app.utils.sql import safe_set_search_path as _safe_set_sp

    async with AsyncSessionLocal() as db:
        await _safe_set_sp(db, tenant_slug)
        msg_content = payload.get("message", {}).get("content", "")
        sender_info = payload.get("sender", {})
        if sender_info.get("name"):
            lead_id = str(uuid.uuid4())
            await db.execute(
                sql_text("INSERT INTO leads (id, full_name, email, phone, source, status, ai_summary) VALUES (:id, :name, :email, :phone, :source, 'new', :summary)"),
                {
                    "id": lead_id,
                    "name": sender_info.get("name", "Unknown"),
                    "email": sender_info.get("email"),
                    "phone": sender_info.get("phone"),
                    "source": platform,
                    "summary": msg_content[:500],
                },
            )
            await db.commit()
    return {"status": "received"}
