import json
import logging
import uuid
from typing import Any, Callable, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ACTION_HANDLERS: dict[str, Callable[[str, dict, AsyncSession], Any]] = {}


def register_action(key: str):
    def decorator(fn: Callable[[str, dict, AsyncSession], Any]):
        ACTION_HANDLERS[key] = fn
        return fn
    return decorator


async def log_action(
    db: AsyncSession,
    lead_id: str,
    action_key: str,
    step_key: str,
    payload: dict,
    status: str,
    result: dict,
):
    await db.execute(
        text("""
            INSERT INTO workflow_action_logs
            (id, lead_id, action_key, step_key, payload, status, result)
            VALUES (:id, CAST(:lead_id AS uuid), :action_key, :step_key, CAST(:payload AS jsonb), :status, CAST(:result AS jsonb))
        """),
        {
            "id": str(uuid.uuid4()),
            "lead_id": lead_id,
            "action_key": action_key,
            "step_key": step_key,
            "payload": json.dumps(payload, ensure_ascii=False),
            "status": status,
            "result": json.dumps(result, ensure_ascii=False),
        },
    )


async def trigger_workflow_actions(
    db: AsyncSession,
    lead_id: str,
    template_definition: dict | None,
    old_workflow: dict,
    new_workflow: dict,
) -> None:
    if not template_definition:
        return
    stages = template_definition.get("stages", [])
    shadows = old_workflow or {}
    new = new_workflow or {}
    for stage_idx, stage in enumerate(stages):
        idx_key = str(stage_idx)
        old_stage = (shadows.get("stages", {}) or {}).get(idx_key, {})
        new_stage = (new.get("stages", {}) or {}).get(idx_key, {})
        old_steps = (old_stage.get("steps_data") or {})
        new_steps = (new_stage.get("steps_data") or {})
        completed_old = set(old_stage.get("completed_steps", []))
        completed_new = set(new_stage.get("completed_steps", []))
        for step in stage.get("steps", []):
            step_key = step.get("key")
            if not step_key:
                continue
            actions = step.get("actions", [])
            old_step = old_steps.get(step_key, {})
            new_step = new_steps.get(step_key, {})
            for action in actions:
                action_key = action.get("key")
                trigger = action.get("trigger", "on_complete")
                fired = False
                if trigger == "on_submit":
                    fired = bool(new_step.get("submitted")) and not bool(old_step.get("submitted"))
                elif trigger == "on_change":
                    fired = old_step != new_step
                else:  # default on_complete
                    fired = step_key in completed_new and step_key not in completed_old
                if not fired or not action_key:
                    continue
                payload = action.get("payload", {})
                handler = ACTION_HANDLERS.get(action_key)
                status = "pending"
                result = {"message": "action not implemented"}
                try:
                    if handler:
                        result = await handler(lead_id, {"step_key": step_key, **payload, "state": new_step}, db)
                        status = "success"
                    else:
                        status = "failed"
                        logger.warning("Workflow action %s has no handler", action_key)
                except Exception as exc:
                    status = "failed"
                    result = {"error": str(exc)}
                    logger.exception("Workflow action %s failed for lead %s", action_key, lead_id)
                await log_action(db, lead_id, action_key, step_key, payload, status, result)


@register_action("create_supply_chain_inquiry")
async def _create_supply_chain_inquiry(lead_id: str, args: dict, db: AsyncSession) -> dict:
    logger.info("Queued supply-chain inquiry for lead %s: %s", lead_id, args)
    return {"queued": True}


@register_action("notify_finance_payment")
async def _notify_finance_payment(lead_id: str, args: dict, db: AsyncSession) -> dict:
    logger.info("Notified finance for payment on lead %s: %s", lead_id, args)
    return {"notified": True}
