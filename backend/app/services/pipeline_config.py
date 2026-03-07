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
    general_statuses: list[dict] = field(default_factory=list)

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
            "general_statuses": self.general_statuses,
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


def _derive_from_steps(workflow_stages: list[dict], pipeline_stages: list[dict],
                       general_statuses: list[dict]) -> tuple[list[dict], dict, dict]:
    """Derive statuses, status_to_stage, and transitions from workflow step data."""
    # Build workflow→pipeline stage key mapping
    wf_keys = {s["key"] for s in workflow_stages}
    p2w: dict[str, str] = {}
    for ps in pipeline_stages:
        if ps["key"] in wf_keys:
            p2w[ps["key"]] = ps["key"]
    unmatched_p = [ps["key"] for ps in pipeline_stages if ps["key"] not in p2w]
    matched_w = set(p2w.values())
    unmatched_w = [ws["key"] for ws in workflow_stages if ws["key"] not in matched_w]
    for i in range(min(len(unmatched_p), len(unmatched_w))):
        p2w[unmatched_p[i]] = unmatched_w[i]
    w2p = {v: k for k, v in p2w.items()}

    # Collect statuses + transitions from step order
    status_values: list[dict] = []
    status_to_stage: dict[str, str] = {}
    seen_status_keys: set[str] = set()
    ordered_status_keys: list[str] = []

    for stage in workflow_stages:
        pipeline_key = w2p.get(stage["key"], stage["key"])
        for step in stage.get("steps", []):
            if step.get("enabled") == False:
                continue
            sk = step.get("status")
            if not sk or sk in seen_status_keys:
                continue
            seen_status_keys.add(sk)
            ordered_status_keys.append(sk)
            status_values.append({
                "key": sk,
                "label": step.get("status_label", sk),
                "color": "",
                "stage": pipeline_key,
            })
            status_to_stage[sk] = pipeline_key

    # Add general statuses (new, cold, lost, etc.)
    for gs in general_statuses:
        if gs["key"] not in seen_status_keys:
            status_values.append({**gs, "stage": None})

    # Build transitions: step order chain
    transitions: dict[str, str] = {}
    for i in range(len(ordered_status_keys) - 1):
        transitions[ordered_status_keys[i]] = ordered_status_keys[i + 1]
    # General statuses that should also advance into the chain (e.g. "new" → first status)
    if ordered_status_keys:
        for gs in general_statuses:
            if gs["key"] not in transitions and gs["key"] != ordered_status_keys[-1]:
                transitions[gs["key"]] = ordered_status_keys[0]

    return status_values, status_to_stage, transitions


def _resolve_config(definition: dict) -> PipelineConfig:
    """Build PipelineConfig from a definition dict, falling back to defaults."""
    defaults = DEFAULT_PIPELINE_DEFINITION

    pipeline_stages = (
        _deep_get(definition, "pipeline", "stages")
        or copy.deepcopy(_deep_get(defaults, "pipeline", "stages", default=[]))
    )

    # workflow_stages: check definition.workflow_stages, then definition.stages (WorkflowTab key), then defaults
    workflow_stages = (
        definition.get("workflow_stages")
        or definition.get("stages")
        or copy.deepcopy(defaults.get("workflow_stages", []))
    )

    general_statuses = (
        definition.get("general_statuses")
        or copy.deepcopy(defaults.get("general_statuses", []))
    )

    # Derive statuses, status_to_stage, transitions from step data
    status_values, status_to_stage, transitions = _derive_from_steps(
        workflow_stages, pipeline_stages, general_statuses
    )

    # Auto-generate status_rank from step-derived order + general statuses
    # This ensures rank is always complete and consistent with the workflow
    ordered_keys = [s["key"] for s in status_values if s.get("stage")]  # step-derived statuses in order
    general_keys = [gs["key"] for gs in general_statuses]
    status_rank = general_keys + ordered_keys

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
        general_statuses=general_statuses,
    )


def _get_stage_data(workflow_data: dict, key: str) -> dict:
    """Return stage data by key (preferred) or legacy numeric index fallback."""
    stages = workflow_data.get("stages", {}) or {}
    return stages.get(key) or {}


def compute_status_from_config(workflow_data: dict, config: PipelineConfig) -> str:
    """Derive the highest earned lead status from workflow step completion.

    Scans all workflow stages in order. For each enabled step that has a
    ``status`` field and is present in ``completed_steps``, records that status.
    Returns the *last* (furthest) matched status, or ``'new'`` if nothing matched.
    """
    last_status: str | None = None
    for stage_def in config.workflow_stages:
        stage_key = stage_def.get("key", "")
        stage_data = _get_stage_data(workflow_data, stage_key)
        done = set(stage_data.get("completed_steps", []))
        for step in stage_def.get("steps", []):
            if step.get("enabled") is False:
                continue
            step_status = step.get("status")
            if step_status and step["key"] in done:
                last_status = step_status
    return last_status or "new"


def validate_workflow_data(data: dict, config: PipelineConfig) -> list[str]:
    """Basic structural validation of workflow_data against config.

    Returns a list of error messages (empty = valid).
    """
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["workflow_data must be a dict"]

    stages = data.get("stages")
    if stages is not None and not isinstance(stages, dict):
        errors.append("stages must be a dict")
        return errors

    valid_stage_keys = {s["key"] for s in config.workflow_stages}
    for key, stage_data in (stages or {}).items():
        # Allow both string keys and legacy numeric indices
        if key not in valid_stage_keys and not key.isdigit():
            errors.append(f"Unknown stage key: {key}")
            continue
        if not isinstance(stage_data, dict):
            errors.append(f"Stage {key} data must be a dict")
            continue
        completed = stage_data.get("completed_steps")
        if completed is not None and not isinstance(completed, list):
            errors.append(f"completed_steps must be a list in stage {key}")

    return errors


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
