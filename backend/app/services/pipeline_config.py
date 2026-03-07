"""
PipelineConfig service — loads tenant-specific pipeline configuration
from workflow_templates.definition, with hardcoded fallback defaults.
"""

import copy
import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.pipeline_defaults import DEFAULT_PIPELINE_DEFINITION
from app.services.workflow_templates import get_active_template

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """Resolved pipeline configuration with all fields guaranteed populated."""

    pipeline_stages: list[dict] = field(default_factory=list)
    status_values: list[dict] = field(default_factory=list)
    status_to_stage: dict[str, str] = field(default_factory=dict)
    status_colors: dict[str, str] = field(default_factory=dict)
    transitions: dict[str, str] = field(default_factory=dict)
    status_rank: list[str] = field(default_factory=list)
    operation_tasks: list[dict] = field(default_factory=list)
    approval_rules: list[dict] = field(default_factory=list)
    file_categories: list[dict] = field(default_factory=list)
    role_mappings: dict[str, str] = field(default_factory=dict)
    workflow_stages: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "pipeline": {"stages": self.pipeline_stages},
            "statuses": {
                "values": self.status_values,
                "status_to_stage": self.status_to_stage,
                "transitions": self.transitions,
                "rank": self.status_rank,
            },
            "operation_tasks": self.operation_tasks,
            "approval_rules": self.approval_rules,
            "file_categories": self.file_categories,
            "role_mappings": self.role_mappings,
            "workflow_stages": self.workflow_stages,
        }


def _deep_get(d: dict, *keys, default=None):
    """Safely traverse nested dict keys."""
    current = d
    for k in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(k)
        if current is None:
            return default
    return current


def _resolve_config(definition: dict) -> PipelineConfig:
    """Build PipelineConfig from a definition dict, falling back to defaults."""
    defaults = DEFAULT_PIPELINE_DEFINITION

    pipeline_stages = (
        _deep_get(definition, "pipeline", "stages")
        or copy.deepcopy(_deep_get(defaults, "pipeline", "stages", default=[]))
    )

    status_values = (
        _deep_get(definition, "statuses", "values")
        or copy.deepcopy(_deep_get(defaults, "statuses", "values", default=[]))
    )

    status_to_stage = (
        _deep_get(definition, "statuses", "status_to_stage")
        or copy.deepcopy(_deep_get(defaults, "statuses", "status_to_stage", default={}))
    )

    transitions = (
        _deep_get(definition, "statuses", "transitions")
        or copy.deepcopy(_deep_get(defaults, "statuses", "transitions", default={}))
    )

    status_rank = (
        _deep_get(definition, "statuses", "rank")
        or copy.deepcopy(_deep_get(defaults, "statuses", "rank", default=[]))
    )

    operation_tasks = (
        definition.get("operation_tasks")
        or copy.deepcopy(defaults.get("operation_tasks", []))
    )

    approval_rules = (
        definition.get("approval_rules")
        or copy.deepcopy(defaults.get("approval_rules", []))
    )

    file_categories = (
        definition.get("file_categories")
        or copy.deepcopy(defaults.get("file_categories", []))
    )

    role_mappings = (
        definition.get("role_mappings")
        or copy.deepcopy(defaults.get("role_mappings", {}))
    )

    # workflow_stages: check definition.workflow_stages, then definition.stages (WorkflowTab key), then defaults
    workflow_stages = (
        definition.get("workflow_stages")
        or definition.get("stages")
        or copy.deepcopy(defaults.get("workflow_stages", []))
    )

    # Build status_colors lookup from status_values
    status_colors = {s["key"]: s.get("color", "") for s in status_values}

    return PipelineConfig(
        pipeline_stages=pipeline_stages,
        status_values=status_values,
        status_to_stage=status_to_stage,
        status_colors=status_colors,
        transitions=transitions,
        status_rank=status_rank,
        operation_tasks=operation_tasks,
        approval_rules=approval_rules,
        file_categories=file_categories,
        role_mappings=role_mappings,
        workflow_stages=workflow_stages,
    )


# In-memory per-request cache (no global state to avoid stale data)
_DEFAULT_CONFIG: PipelineConfig | None = None


def get_default_config() -> PipelineConfig:
    """Return config built from hardcoded defaults (no DB hit)."""
    global _DEFAULT_CONFIG
    if _DEFAULT_CONFIG is None:
        _DEFAULT_CONFIG = _resolve_config({})
    return _DEFAULT_CONFIG


async def get_pipeline_config(
    db: AsyncSession,
    tenant_id: Optional[str] = None,
) -> PipelineConfig:
    """Load tenant pipeline config from DB, fallback to defaults on any field."""
    try:
        template = await get_active_template(db, tenant_id)
        if template and template.get("definition"):
            definition = template["definition"]
            if isinstance(definition, str):
                import json
                definition = json.loads(definition)
            return _resolve_config(definition)
    except Exception:
        logger.warning("Failed to load pipeline config for tenant %s, using defaults", tenant_id, exc_info=True)

    return get_default_config()
