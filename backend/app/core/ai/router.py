"""
Model Router — selects the right model tier based on task complexity.

Principle: use the cheapest model that can handle the job.
  - FAST:  classification, extraction, tagging (flash/haiku/mini)
  - STD:   summarization, reply generation, translation
  - PRO:   complex reasoning, strategy, report generation

The router doesn't override tenant config — it suggests a model tier,
and the provider layer picks the best available model for that tier.
"""

import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ModelTier(str, Enum):
    FAST = "fast"       # Cheapest, fastest — classification, extraction
    STANDARD = "std"    # Default — summarization, generation
    PRO = "pro"         # Most capable — complex reasoning, strategy


# Map each provider to its model per tier
TIER_MODELS: dict[str, dict[ModelTier, str]] = {
    "gemini": {
        ModelTier.FAST: "gemini-2.0-flash",
        ModelTier.STANDARD: "gemini-2.0-flash",
        ModelTier.PRO: "gemini-1.5-pro",
    },
    "openai": {
        ModelTier.FAST: "gpt-4.1-mini",
        ModelTier.STANDARD: "gpt-4.1-mini",
        ModelTier.PRO: "gpt-4.1",
    },
    "anthropic": {
        ModelTier.FAST: "claude-haiku-4-20250414",
        ModelTier.STANDARD: "claude-sonnet-4-20250514",
        ModelTier.PRO: "claude-sonnet-4-20250514",
    },
    "doubao": {
        ModelTier.FAST: "doubao-1.5-lite-32k",
        ModelTier.STANDARD: "doubao-1.5-pro-32k",
        ModelTier.PRO: "doubao-1.5-pro-32k",
    },
    "moonshot": {
        ModelTier.FAST: "moonshot-v1-8k",
        ModelTier.STANDARD: "moonshot-v1-8k",
        ModelTier.PRO: "moonshot-v1-32k",
    },
    "deepseek": {
        ModelTier.FAST: "deepseek-chat",
        ModelTier.STANDARD: "deepseek-chat",
        ModelTier.PRO: "deepseek-reasoner",
    },
    "zhipu": {
        ModelTier.FAST: "glm-4-flash",
        ModelTier.STANDARD: "glm-4-flash",
        ModelTier.PRO: "glm-4",
    },
}

# Task type → recommended tier
TASK_TIER_MAP: dict[str, ModelTier] = {
    # FAST tier — simple, structured output
    "classify": ModelTier.FAST,
    "extract": ModelTier.FAST,
    "tag": ModelTier.FAST,
    "detect_intent": ModelTier.FAST,
    "detect_language": ModelTier.FAST,
    "fix_grammar": ModelTier.FAST,

    # STANDARD tier — moderate complexity
    "summarize": ModelTier.STANDARD,
    "translate": ModelTier.STANDARD,
    "reply_suggest": ModelTier.STANDARD,
    "rewrite": ModelTier.STANDARD,
    "chat": ModelTier.STANDARD,
    "shorter": ModelTier.STANDARD,
    "longer": ModelTier.STANDARD,
    "change_tone": ModelTier.STANDARD,
    "continue_writing": ModelTier.STANDARD,
    "extract_actions": ModelTier.STANDARD,
    "explain": ModelTier.STANDARD,
    "lead_score": ModelTier.STANDARD,
    "enrich_profile": ModelTier.STANDARD,

    # PRO tier — complex reasoning
    "strategy": ModelTier.PRO,
    "generate_report": ModelTier.PRO,
    "generate_document": ModelTier.PRO,
    "analyze": ModelTier.PRO,
    "research": ModelTier.PRO,
    "plan_subtasks": ModelTier.PRO,
}


@dataclass
class ModelChoice:
    """Result of model routing."""
    tier: ModelTier
    model: str
    provider: str


class ModelRouter:
    """Selects the best model for a given task and provider."""

    def select(self, task_type: str, provider: str, default_model: str) -> ModelChoice:
        """Pick the right model tier for the task type.

        If the task type isn't recognized, uses the tenant's default model.
        """
        tier = TASK_TIER_MAP.get(task_type, ModelTier.STANDARD)
        provider_tiers = TIER_MODELS.get(provider, {})
        model = provider_tiers.get(tier, default_model)
        return ModelChoice(tier=tier, model=model, provider=provider)


# Singleton
model_router = ModelRouter()
