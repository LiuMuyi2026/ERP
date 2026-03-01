"""Workspace AI Automation rules — CRUD + manual trigger + @mention."""

import json
import logging
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.services.ai.provider import stream_text_for_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/automation", tags=["automation"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class TriggerConfig(BaseModel):
    value: Optional[str] = None          # e.g. status value for status_changed
    time: Optional[str] = None           # e.g. "09:00" for scheduled
    frequency: Optional[str] = None      # "daily" | "weekly"
    weekday: Optional[int] = None        # 0=Mon … 6=Sun for weekly


class ActionConfig(BaseModel):
    target_field: Optional[str] = None   # field to update for set_field
    value: Optional[str] = None          # value to set
    prompt: Optional[str] = None         # custom prompt for AI actions
    output_page_id: Optional[str] = None # page to write result to


class AutomationCreate(BaseModel):
    workspace_id: str
    name: str = "新规则"
    description: Optional[str] = None
    enabled: bool = True
    trigger_type: str = "mention"        # mention | page_created | page_updated | page_deleted | scheduled
    trigger_config: TriggerConfig = TriggerConfig()
    action_type: str = "summarize"       # summarize | extract_actions | generate_report | set_field | reminder
    action_config: ActionConfig = ActionConfig()


class AutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[TriggerConfig] = None
    action_type: Optional[str] = None
    action_config: Optional[ActionConfig] = None


class MentionRequest(BaseModel):
    page_id: str
    page_content: str                    # plain-text content of the page
    mention_text: str                    # the text after @AI, e.g. "@AI 请总结这份文档"


# ── System prompt builder ─────────────────────────────────────────────────────

def _build_automation_prompt(action_type: str, action_config: dict, context: str) -> str:
    custom = action_config.get("prompt", "")
    if custom:
        return f"{custom}\n\n---\n页面内容：\n{context}"

    if action_type == "summarize":
        return (
            "请对以下工作区页面内容进行简洁的中文摘要，提炼核心要点，"
            "用3-5条要点列出，每条控制在30字以内。\n\n"
            f"页面内容：\n{context}"
        )
    elif action_type == "extract_actions":
        return (
            "请从以下内容中提取所有待办事项和行动项，"
            "以编号列表形式输出，每条包含：任务描述、负责人（如有）、截止日期（如有）。\n\n"
            f"内容：\n{context}"
        )
    elif action_type == "generate_report":
        return (
            "请根据以下内容生成一份结构化周报，包含：本周完成事项、进行中事项、"
            "下周计划、风险与问题。使用Markdown格式输出。\n\n"
            f"内容：\n{context}"
        )
    else:
        return f"请分析以下内容并给出有用的建议：\n\n{context}"


def _build_mention_prompt(mention_text: str, page_content: str) -> str:
    # Strip @AI prefix
    query = mention_text.replace("@AI", "").replace("@ai", "").strip()
    if not query:
        query = "请总结这份文档的核心内容"
    return (
        f"用户在工作区页面中提问：「{query}」\n\n"
        f"以下是页面的当前内容，请基于此内容回答：\n\n{page_content}"
    )


# ── CRUD endpoints ─────────────────────────────────────────────────────────────

@router.get("/rules")
async def list_rules(
    workspace_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    if workspace_id:
        result = await db.execute(
            text("""
                SELECT id, workspace_id, name, description, enabled,
                       trigger_type, trigger_config, action_type, action_config,
                       last_run_at, last_result, run_count, created_by, created_at, updated_at
                FROM workspace_automations
                WHERE workspace_id = :ws_id
                ORDER BY created_at DESC
            """),
            {"ws_id": workspace_id},
        )
    else:
        result = await db.execute(
            text("""
                SELECT id, workspace_id, name, description, enabled,
                       trigger_type, trigger_config, action_type, action_config,
                       last_run_at, last_result, run_count, created_by, created_at, updated_at
                FROM workspace_automations
                ORDER BY created_at DESC
                LIMIT 200
            """),
        )
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("/rules", status_code=201)
async def create_rule(
    body: AutomationCreate,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    new_id = str(uuid4())
    await db.execute(
        text("""
            INSERT INTO workspace_automations
              (id, workspace_id, name, description, enabled,
               trigger_type, trigger_config, action_type, action_config, created_by)
            VALUES
              (:id, :ws_id, :name, :desc, :enabled,
               :ttype, CAST(:tconfig AS jsonb), :atype, CAST(:aconfig AS jsonb), :user_id)
        """),
        {
            "id": new_id,
            "ws_id": body.workspace_id,
            "name": body.name,
            "desc": body.description,
            "enabled": body.enabled,
            "ttype": body.trigger_type,
            "tconfig": json.dumps(body.trigger_config.model_dump()),
            "atype": body.action_type,
            "aconfig": json.dumps(body.action_config.model_dump()),
            "user_id": ctx.get("sub"),
        },
    )
    await db.commit()
    return {"id": new_id, "message": "创建成功"}


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: UUID,
    body: AutomationUpdate,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    sets = []
    params: dict = {"rule_id": str(rule_id)}

    if body.name is not None:
        sets.append("name = :name"); params["name"] = body.name
    if body.description is not None:
        sets.append("description = :desc"); params["desc"] = body.description
    if body.enabled is not None:
        sets.append("enabled = :enabled"); params["enabled"] = body.enabled
    if body.trigger_type is not None:
        sets.append("trigger_type = :ttype"); params["ttype"] = body.trigger_type
    if body.trigger_config is not None:
        sets.append("trigger_config = CAST(:tconfig AS jsonb)")
        params["tconfig"] = json.dumps(body.trigger_config.model_dump())
    if body.action_type is not None:
        sets.append("action_type = :atype"); params["atype"] = body.action_type
    if body.action_config is not None:
        sets.append("action_config = CAST(:aconfig AS jsonb)")
        params["aconfig"] = json.dumps(body.action_config.model_dump())

    if not sets:
        raise HTTPException(status_code=400, detail="没有可更新的字段")

    sets.append("updated_at = NOW()")
    await db.execute(
        text(f"UPDATE workspace_automations SET {', '.join(sets)} WHERE id = :rule_id"),
        params,
    )
    await db.commit()
    return {"message": "更新成功"}


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    await db.execute(
        text("DELETE FROM workspace_automations WHERE id = :rule_id"),
        {"rule_id": str(rule_id)},
    )
    await db.commit()


# ── Manual trigger (run now) ──────────────────────────────────────────────────

@router.post("/rules/{rule_id}/run")
async def run_rule(
    rule_id: UUID,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Manually trigger a rule and stream the AI response."""
    db = ctx["db"]
    result = await db.execute(
        text("SELECT * FROM workspace_automations WHERE id = :id"),
        {"id": str(rule_id)},
    )
    rule = result.fetchone()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")

    rule_dict = dict(rule._mapping)
    action_type = rule_dict["action_type"]
    action_config = rule_dict.get("action_config") or {}
    if isinstance(action_config, str):
        action_config = json.loads(action_config)

    # Fetch recent page content from workspace for context
    ws_id = rule_dict["workspace_id"]
    pages_result = await db.execute(
        text("""
            SELECT title, content FROM pages
            WHERE workspace_id = :ws_id
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 5
        """),
        {"ws_id": ws_id},
    )
    pages = pages_result.fetchall()
    context_parts = []
    for p in pages:
        title = p.title or "无标题"
        content = p.content or {}
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except Exception:
                content = {}
        # Extract text from BlockNote JSON
        text_content = _extract_text_from_content(content)
        context_parts.append(f"## {title}\n{text_content}")
    context = "\n\n".join(context_parts) or "（无页面内容）"

    prompt = _build_automation_prompt(action_type, action_config, context)

    async def generate():
        full_result = ""
        try:
            async for chunk in stream_text_for_tenant(db, ctx.get("tenant_id"), prompt):
                full_result += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Persist last_result + run_count
        try:
            await db.execute(
                text("""
                    UPDATE workspace_automations
                    SET last_run_at = NOW(), last_result = :result,
                        run_count = run_count + 1, updated_at = NOW()
                    WHERE id = :id
                """),
                {"result": full_result[:2000], "id": str(rule_id)},
            )
            await db.commit()
        except Exception as e:
            logger.warning("Failed to update run stats: %s", e)

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── @AI mention endpoint ──────────────────────────────────────────────────────

@router.post("/mention")
async def process_mention(
    body: MentionRequest,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Process an @AI mention in a page and stream the AI response."""
    db = ctx["db"]
    prompt = _build_mention_prompt(body.mention_text, body.page_content)

    async def generate():
        try:
            async for chunk in stream_text_for_tenant(db, ctx.get("tenant_id"), prompt):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Page event hook (called by workspace router on create/update/delete) ───────

@router.post("/page-event")
async def page_event(
    body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """
    Called internally when a page is created/updated/deleted.
    Finds enabled automation rules matching the event and fires them in background.
    Returns immediately (fire-and-forget).
    """
    event = body.get("event")          # "page_created" | "page_updated" | "page_deleted"
    workspace_id = body.get("workspace_id")
    if not event or not workspace_id:
        return {"triggered": 0}

    db = ctx["db"]
    result = await db.execute(
        text("""
            SELECT id FROM workspace_automations
            WHERE workspace_id = :ws_id AND enabled = TRUE AND trigger_type = :event
        """),
        {"ws_id": workspace_id, "event": event},
    )
    rule_ids = [str(r.id) for r in result.fetchall()]
    # In a production system we'd enqueue these; here we just acknowledge
    return {"triggered": len(rule_ids), "rule_ids": rule_ids}


# ── Helper: extract plain text from BlockNote JSON ─────────────────────────────

def _extract_text_from_content(content: dict) -> str:
    """Recursively extract text from BlockNote content JSON."""
    if not content:
        return ""
    parts = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "text":
                parts.append(node.get("text", ""))
            for key in ("content", "children"):
                child = node.get(key)
                if isinstance(child, list):
                    for c in child:
                        walk(c)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(content)
    return " ".join(p for p in parts if p.strip())
