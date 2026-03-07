"""
AI Architecture Layer — unified pipeline, model routing, context, and event hooks.

Usage:
    from app.core.ai import ai, AITaskType

    # Fire-and-forget (runs in background after response)
    await ai.enqueue("classify", prompt="...", tenant_id=tid, db=db)

    # Inline (returns result directly)
    result = await ai.run("summarize", prompt="...", tenant_id=tid, db=db)

    # Streaming
    async for chunk in ai.stream("chat", prompt="...", tenant_id=tid, db=db):
        yield chunk
"""

from app.core.ai.task import AITaskType, AITask, ai
from app.core.ai.router import ModelRouter, model_router
from app.core.ai.context import ContextBuilder
from app.core.ai.hooks import register_ai_hooks

__all__ = [
    "AITaskType", "AITask", "ai",
    "ModelRouter", "model_router",
    "ContextBuilder",
    "register_ai_hooks",
]
