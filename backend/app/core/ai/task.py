"""
AI Task Pipeline — unified interface for all AI operations.

Replaces scattered `generate_text_for_tenant()` calls across routers
with a structured task-based approach that handles:
  - Model routing (pick cheapest model that fits)
  - Usage logging (all providers, not just Gemini)
  - Error handling with retries
  - Background execution via event bus
  - Structured output (text or JSON)
"""

import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai.router import ModelTier, model_router

logger = logging.getLogger(__name__)


class AITaskType(str, Enum):
    """Well-known AI task types for model routing."""
    # Fast tier
    CLASSIFY = "classify"
    EXTRACT = "extract"
    TAG = "tag"
    DETECT_INTENT = "detect_intent"
    FIX_GRAMMAR = "fix_grammar"

    # Standard tier
    SUMMARIZE = "summarize"
    TRANSLATE = "translate"
    REPLY_SUGGEST = "reply_suggest"
    REWRITE = "rewrite"
    CHAT = "chat"
    SHORTER = "shorter"
    LONGER = "longer"
    CHANGE_TONE = "change_tone"
    EXTRACT_ACTIONS = "extract_actions"
    LEAD_SCORE = "lead_score"
    ENRICH_PROFILE = "enrich_profile"

    # Pro tier
    STRATEGY = "strategy"
    GENERATE_REPORT = "generate_report"
    GENERATE_DOCUMENT = "generate_document"
    ANALYZE = "analyze"
    RESEARCH = "research"

    # Generic fallback
    CUSTOM = "custom"


@dataclass
class AITask:
    """A single AI task to execute."""
    task_type: str              # AITaskType value or custom string
    prompt: str
    system_instruction: str | None = None
    history: list[dict] | None = None
    context: str | None = None  # Pre-built context string
    output_format: str = "text"  # "text" or "json"

    # Execution context
    tenant_id: str | None = None
    user_id: str | None = None
    feature_name: str | None = None   # For usage logging
    entity_type: str | None = None    # e.g. "lead", "contract"
    entity_id: str | None = None      # Record being processed

    # Options
    model_override: str | None = None  # Force specific model
    temperature: float = 0.2
    max_retries: int = 1

    # Results (filled after execution)
    result_text: str = ""
    result_json: dict = field(default_factory=dict)
    model_used: str = ""
    tier_used: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    duration_ms: int = 0
    error: str | None = None


class AITaskRunner:
    """Executes AI tasks through the unified pipeline."""

    async def run(
        self,
        task_type: str,
        prompt: str,
        *,
        db: AsyncSession,
        tenant_id: str | UUID | None = None,
        user_id: str | None = None,
        system_instruction: str | None = None,
        context: str | None = None,
        history: list[dict] | None = None,
        output_format: str = "text",
        feature_name: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        model_override: str | None = None,
    ) -> AITask:
        """Execute an AI task and return the completed task with results."""
        task = AITask(
            task_type=task_type,
            prompt=prompt,
            system_instruction=system_instruction,
            context=context,
            history=history,
            output_format=output_format,
            tenant_id=str(tenant_id) if tenant_id else None,
            user_id=user_id,
            feature_name=feature_name or task_type,
            entity_type=entity_type,
            entity_id=entity_id,
            model_override=model_override,
        )

        # Build full prompt with context
        full_prompt = self._build_prompt(task)

        # Resolve provider config
        from app.services.ai.provider import _resolve_config
        cfg = await _resolve_config(db, tenant_id)

        # Route to best model
        if model_override:
            task.model_used = model_override
            task.tier_used = "override"
            cfg = {**cfg, "model": model_override}
        else:
            choice = model_router.select(task_type, cfg["provider"], cfg["model"])
            task.model_used = choice.model
            task.tier_used = choice.tier.value
            cfg = {**cfg, "model": choice.model}

        # Execute
        start = time.monotonic()
        try:
            if output_format == "json":
                from app.services.ai.provider import _dispatch_json
                task.result_json = await _dispatch_json(cfg, full_prompt, system_instruction)
                task.result_text = json.dumps(task.result_json, ensure_ascii=False)
            else:
                from app.services.ai.provider import _dispatch_text
                task.result_text = await _dispatch_text(cfg, full_prompt, system_instruction, history)
        except Exception as e:
            task.error = str(e)
            logger.error("AI task %s failed: %s", task_type, e)
        finally:
            task.duration_ms = int((time.monotonic() - start) * 1000)

        # Log usage
        await self._log_usage(db, task)

        return task

    async def stream(
        self,
        task_type: str,
        prompt: str,
        *,
        db: AsyncSession,
        tenant_id: str | UUID | None = None,
        user_id: str | None = None,
        system_instruction: str | None = None,
        context: str | None = None,
        history: list[dict] | None = None,
        feature_name: str | None = None,
        model_override: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream an AI task response."""
        task = AITask(
            task_type=task_type,
            prompt=prompt,
            system_instruction=system_instruction,
            context=context,
            history=history,
            tenant_id=str(tenant_id) if tenant_id else None,
            user_id=user_id,
            feature_name=feature_name or task_type,
        )

        full_prompt = self._build_prompt(task)

        from app.services.ai.provider import _resolve_config, stream_text_for_tenant
        cfg = await _resolve_config(db, tenant_id)

        if model_override:
            cfg = {**cfg, "model": model_override}
        else:
            choice = model_router.select(task_type, cfg["provider"], cfg["model"])
            cfg = {**cfg, "model": choice.model}

        async for chunk in stream_text_for_tenant(
            db, tenant_id, full_prompt,
            history=history,
            system_instruction=system_instruction,
        ):
            yield chunk

    async def enqueue(
        self,
        task_type: str,
        prompt: str,
        *,
        db: AsyncSession,
        tenant_id: str | UUID | None = None,
        user_id: str | None = None,
        system_instruction: str | None = None,
        context: str | None = None,
        output_format: str = "text",
        feature_name: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        callback_event: str | None = None,
    ) -> None:
        """Enqueue an AI task to run in background (fire-and-forget).

        Optionally emits a callback event with the result when done.
        """
        import asyncio
        from app.core.events import events

        async def _run():
            try:
                result = await self.run(
                    task_type, prompt,
                    db=db, tenant_id=tenant_id, user_id=user_id,
                    system_instruction=system_instruction,
                    context=context, output_format=output_format,
                    feature_name=feature_name,
                    entity_type=entity_type, entity_id=entity_id,
                )
                if callback_event:
                    await events.emit(callback_event, {
                        "task": result,
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                    })
            except Exception:
                logger.exception("Background AI task %s failed", task_type)

        asyncio.create_task(_run())

    def _build_prompt(self, task: AITask) -> str:
        """Combine context + prompt into final prompt."""
        parts = []
        if task.context:
            parts.append(task.context)
        parts.append(task.prompt)
        return "\n\n".join(parts)

    async def _log_usage(self, db: AsyncSession, task: AITask) -> None:
        """Log AI usage for all providers (not just Gemini)."""
        if not task.tenant_id:
            return
        try:
            await db.execute(
                text("""
                    INSERT INTO platform.ai_usage_logs
                    (tenant_id, user_id, model_name, feature_name,
                     prompt_tokens, completion_tokens, total_tokens)
                    VALUES (:tid, :uid, :model, :feat, :pt, :ct, :tt)
                """),
                {
                    "tid": task.tenant_id,
                    "uid": task.user_id,
                    "model": task.model_used,
                    "feat": task.feature_name or task.task_type,
                    "pt": task.prompt_tokens,
                    "ct": task.completion_tokens,
                    "tt": task.prompt_tokens + task.completion_tokens,
                },
            )
            await db.commit()
        except Exception:
            logger.debug("Failed to log AI usage for task %s", task.task_type)


# Global singleton
ai = AITaskRunner()
