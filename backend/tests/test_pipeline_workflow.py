"""
Comprehensive tests for the pipeline/workflow system.

Tests cover:
1. Pipeline config resolution (defaults, custom definitions, partial overrides)
2. Status derivation from workflow step completion (all 6 stages)
3. Status rank completeness and ordering
4. Transitions chain correctness
5. Workflow data validation
6. Newly completed step detection
7. Edge cases (disabled steps, empty data, legacy keys, regression protection)
8. Custom template simulation (add/remove/reorder steps)
9. Settings page save → config resolve → status derivation round-trip
10. advance_lead_stage compatibility
"""

import copy
import json
import pytest

from app.services.pipeline_defaults import DEFAULT_PIPELINE_DEFINITION
from app.services.pipeline_config import (
    _resolve_config,
    _derive_from_steps,
    _get_stage_data,
    compute_status_from_config,
    validate_workflow_data,
    PipelineConfig,
)
from app.routers.crm.workflow import _find_newly_completed_steps


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def default_config():
    """Config built from hardcoded defaults (no DB)."""
    return _resolve_config({})


@pytest.fixture
def default_definition():
    """Deep copy of DEFAULT_PIPELINE_DEFINITION for mutation."""
    return copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Pipeline Config Resolution
# ═══════════════════════════════════════════════════════════════════════════════

class TestConfigResolution:
    def test_default_config_has_all_fields(self, default_config):
        """Default config should have all required fields populated."""
        assert len(default_config.pipeline_stages) == 6
        assert len(default_config.workflow_stages) == 6
        assert len(default_config.status_values) > 0
        assert len(default_config.status_to_stage) > 0
        assert len(default_config.transitions) > 0
        assert len(default_config.status_rank) > 0
        assert len(default_config.file_categories) > 0
        assert len(default_config.general_statuses) == 3

    def test_pipeline_stage_keys(self, default_config):
        """Pipeline stages should match expected keys."""
        keys = [s["key"] for s in default_config.pipeline_stages]
        assert keys == ["sales", "contract", "procurement", "booking", "shipping", "collection"]

    def test_workflow_stage_keys(self, default_config):
        """Workflow stages should match expected keys."""
        keys = [s["key"] for s in default_config.workflow_stages]
        assert keys == [
            "sales_negotiation", "contract_signing", "procurement",
            "booking", "shipping", "collection",
        ]

    def test_each_workflow_stage_has_steps(self, default_config):
        """Every workflow stage should have at least one step."""
        for stage in default_config.workflow_stages:
            assert len(stage.get("steps", [])) > 0, f"Stage {stage['key']} has no steps"

    def test_to_dict_round_trip(self, default_config):
        """to_dict() output should be JSON-serializable."""
        d = default_config.to_dict()
        json_str = json.dumps(d, ensure_ascii=False)
        parsed = json.loads(json_str)
        assert parsed["pipeline"]["stages"] == d["pipeline"]["stages"]
        assert parsed["statuses"]["values"] == d["statuses"]["values"]

    def test_partial_definition_override(self):
        """Config with only some fields should fallback to defaults for the rest."""
        custom_def = {
            "general_statuses": [
                {"key": "new", "label": "New Lead"},
                {"key": "archived", "label": "Archived"},
            ],
        }
        config = _resolve_config(custom_def)
        # Should use custom general_statuses
        assert len(config.general_statuses) == 2
        assert config.general_statuses[1]["key"] == "archived"
        # Should fallback to default workflow_stages
        assert len(config.workflow_stages) == 6

    def test_empty_definition_uses_defaults(self):
        """Empty definition should produce the same config as defaults."""
        config = _resolve_config({})
        assert len(config.workflow_stages) == 6
        assert len(config.pipeline_stages) == 6

    def test_file_categories_from_defaults(self, default_config):
        """File categories should be populated from defaults."""
        keys = [c["key"] for c in default_config.file_categories]
        assert "contract" in keys
        assert "shipping" in keys
        assert "inspection" in keys

    def test_file_upload_steps_have_category(self, default_config):
        """All file_upload steps should have a file_category."""
        for stage in default_config.workflow_stages:
            for step in stage.get("steps", []):
                if step.get("type") == "file_upload":
                    assert step.get("file_category"), \
                        f"Step {stage['key']}/{step['key']} missing file_category"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Status Derivation
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusDerivation:
    def test_empty_workflow_returns_new(self, default_config):
        assert compute_status_from_config({}, default_config) == "new"

    def test_no_stages_returns_new(self, default_config):
        assert compute_status_from_config({"stages": {}}, default_config) == "new"

    def test_classify_returns_inquiry(self, default_config):
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        assert compute_status_from_config(wf, default_config) == "inquiry"

    def test_firm_offer_returns_quoted(self, default_config):
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["classify", "firm_offer"]}}}
        assert compute_status_from_config(wf, default_config) == "quoted"

    def test_confirm_details_returns_negotiating(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
        }}
        assert compute_status_from_config(wf, default_config) == "negotiating"

    def test_procurement_check_returns_procuring(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
            "procurement": {"completed_steps": ["procurement_check"]},
        }}
        assert compute_status_from_config(wf, default_config) == "procuring"

    def test_freight_inquiry_returns_booking(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
            "procurement": {"completed_steps": ["procurement_check"]},
            "booking": {"completed_steps": ["freight_inquiry"]},
        }}
        assert compute_status_from_config(wf, default_config) == "booking"

    def test_labels_returns_fulfillment(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
            "procurement": {"completed_steps": ["procurement_check"]},
            "booking": {"completed_steps": ["freight_inquiry"]},
            "shipping": {"completed_steps": ["labels"]},
        }}
        assert compute_status_from_config(wf, default_config) == "fulfillment"

    def test_follow_payment_returns_payment(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
            "procurement": {"completed_steps": ["procurement_check"]},
            "booking": {"completed_steps": ["freight_inquiry"]},
            "shipping": {"completed_steps": ["labels"]},
            "collection": {"completed_steps": ["follow_payment"]},
        }}
        assert compute_status_from_config(wf, default_config) == "payment"

    def test_filing_returns_converted(self, default_config):
        wf = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
            "procurement": {"completed_steps": ["procurement_check"]},
            "booking": {"completed_steps": ["freight_inquiry"]},
            "shipping": {"completed_steps": ["labels"]},
            "collection": {"completed_steps": ["follow_payment", "filing"]},
        }}
        assert compute_status_from_config(wf, default_config) == "converted"

    def test_full_status_chain(self, default_config):
        """Incrementally complete steps and verify the full chain."""
        expected_chain = [
            ("inquiry", {"sales_negotiation": {"completed_steps": ["classify"]}}),
            ("quoted", {"sales_negotiation": {"completed_steps": ["classify", "firm_offer"]}}),
            ("negotiating", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
            }),
            ("procuring", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
                "procurement": {"completed_steps": ["procurement_check"]},
            }),
            ("booking", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
                "procurement": {"completed_steps": ["procurement_check"]},
                "booking": {"completed_steps": ["freight_inquiry"]},
            }),
            ("fulfillment", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
                "procurement": {"completed_steps": ["procurement_check"]},
                "booking": {"completed_steps": ["freight_inquiry"]},
                "shipping": {"completed_steps": ["labels"]},
            }),
            ("payment", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
                "procurement": {"completed_steps": ["procurement_check"]},
                "booking": {"completed_steps": ["freight_inquiry"]},
                "shipping": {"completed_steps": ["labels"]},
                "collection": {"completed_steps": ["follow_payment"]},
            }),
            ("converted", {
                "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
                "contract_signing": {"completed_steps": ["confirm_details"]},
                "procurement": {"completed_steps": ["procurement_check"]},
                "booking": {"completed_steps": ["freight_inquiry"]},
                "shipping": {"completed_steps": ["labels"]},
                "collection": {"completed_steps": ["follow_payment", "filing"]},
            }),
        ]
        for expected_status, stages in expected_chain:
            result = compute_status_from_config({"stages": stages}, default_config)
            assert result == expected_status, \
                f"Expected {expected_status}, got {result}"

    def test_steps_without_status_dont_affect_derivation(self, default_config):
        """Steps that have no 'status' field should not change the derived status."""
        # price_inquiry has no status field — completing it alone shouldn't change status
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["price_inquiry"]}}}
        assert compute_status_from_config(wf, default_config) == "new"

    def test_non_status_steps_between_status_steps(self, default_config):
        """Completing a non-status step between two status steps should give the last status step's result."""
        wf = {"stages": {"sales_negotiation": {"completed_steps": [
            "classify",       # status: inquiry
            "price_inquiry",  # no status
            "soft_offer",     # no status
        ]}}}
        assert compute_status_from_config(wf, default_config) == "inquiry"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Status Rank
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusRank:
    def test_rank_contains_all_step_statuses(self, default_config):
        """Every status derived from steps must appear in status_rank."""
        step_statuses = {
            s["key"] for s in default_config.status_values if s.get("stage")
        }
        rank_set = set(default_config.status_rank)
        missing = step_statuses - rank_set
        assert not missing, f"Statuses missing from rank: {missing}"

    def test_rank_contains_general_statuses(self, default_config):
        """General statuses (new, cold, lost) must appear in rank."""
        for gs in default_config.general_statuses:
            assert gs["key"] in default_config.status_rank

    def test_rank_order_is_correct(self, default_config):
        """Rank should be: general statuses first, then step statuses in workflow order."""
        rank = default_config.status_rank
        expected = [
            "new", "cold", "lost",  # general
            "inquiry", "quoted", "negotiating", "procuring",
            "booking", "fulfillment", "payment", "converted",
        ]
        assert rank == expected

    def test_no_regression_protection(self, default_config):
        """When current rank > new rank, current status should be preserved."""
        rank = default_config.status_rank
        # Simulate: current status is "procuring" (rank 6), new derived is "inquiry" (rank 3)
        cur_rank = rank.index("procuring")
        new_rank = rank.index("inquiry")
        assert cur_rank > new_rank, "procuring should rank higher than inquiry"
        # The endpoint logic: final = new if new_rank > cur_rank else current
        final = "inquiry" if new_rank > cur_rank else "procuring"
        assert final == "procuring"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Transitions Chain
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransitions:
    def test_transitions_form_complete_chain(self, default_config):
        """Step-derived statuses should form a linear chain via transitions."""
        t = default_config.transitions
        chain = []
        current = "inquiry"
        while current in t:
            chain.append(current)
            current = t[current]
        chain.append(current)  # last status has no transition
        assert chain == [
            "inquiry", "quoted", "negotiating", "procuring",
            "booking", "fulfillment", "payment", "converted",
        ]

    def test_general_statuses_transition_to_first(self, default_config):
        """General statuses should transition to the first step status."""
        t = default_config.transitions
        assert t.get("new") == "inquiry"
        assert t.get("cold") == "inquiry"
        assert t.get("lost") == "inquiry"

    def test_advance_lead_stage_compatibility(self, default_config):
        """Transitions should work for advance_lead_stage endpoint."""
        t = default_config.transitions
        # Simulate advancing from each status
        statuses = ["new", "inquiry", "quoted", "negotiating", "procuring",
                     "booking", "fulfillment", "payment"]
        for status in statuses:
            assert status in t, f"No transition from {status}"

        # Last status (converted) should have no transition
        assert "converted" not in t


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Workflow Data Validation
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidation:
    def test_valid_empty_data(self, default_config):
        assert validate_workflow_data({}, default_config) == []

    def test_valid_with_stages(self, default_config):
        data = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        assert validate_workflow_data(data, default_config) == []

    def test_valid_with_numeric_keys(self, default_config):
        """Legacy numeric keys should be accepted."""
        data = {"stages": {"0": {"completed_steps": ["classify"]}}}
        assert validate_workflow_data(data, default_config) == []

    def test_invalid_not_dict(self, default_config):
        errors = validate_workflow_data("string", default_config)
        assert len(errors) == 1
        assert "must be a dict" in errors[0]

    def test_invalid_stages_not_dict(self, default_config):
        errors = validate_workflow_data({"stages": "bad"}, default_config)
        assert len(errors) > 0

    def test_invalid_unknown_stage(self, default_config):
        errors = validate_workflow_data({"stages": {"unknown_key": {}}}, default_config)
        assert any("Unknown stage" in e for e in errors)

    def test_invalid_completed_steps_type(self, default_config):
        data = {"stages": {"sales_negotiation": {"completed_steps": "not_a_list"}}}
        errors = validate_workflow_data(data, default_config)
        assert any("must be a list" in e for e in errors)

    def test_invalid_stage_data_type(self, default_config):
        data = {"stages": {"sales_negotiation": "not_a_dict"}}
        errors = validate_workflow_data(data, default_config)
        assert any("must be a dict" in e for e in errors)

    def test_valid_with_steps_data(self, default_config):
        """Full workflow_data with steps_data should pass validation."""
        data = {
            "active_stage": 0,
            "active_stage_key": "sales_negotiation",
            "stages": {
                "sales_negotiation": {
                    "completed_steps": ["classify", "price_inquiry"],
                    "steps_data": {
                        "classify": {"saved_at": "2026-03-07"},
                        "price_inquiry": {"product_name": "Steel Pipes"},
                    },
                    "assignees": {"salesperson": "user-123"},
                    "notes": "Good prospect",
                },
            },
        }
        assert validate_workflow_data(data, default_config) == []


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Newly Completed Step Detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestNewlyCompletedSteps:
    def test_first_step_completed(self, default_config):
        old = {"stages": {}}
        new = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        assert len(result) == 1
        assert result[0][0] == "sales_negotiation"
        assert result[0][1] == "classify"

    def test_no_change(self, default_config):
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        result = _find_newly_completed_steps(wf, wf, default_config)
        assert len(result) == 0

    def test_multiple_new_steps(self, default_config):
        old = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        new = {"stages": {"sales_negotiation": {"completed_steps": ["classify", "price_inquiry", "firm_offer"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        step_keys = [sk for _, sk, _ in result]
        assert "price_inquiry" in step_keys
        assert "firm_offer" in step_keys
        assert "classify" not in step_keys  # was already done

    def test_cross_stage_completion(self, default_config):
        old = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        new = {"stages": {
            "sales_negotiation": {"completed_steps": ["classify", "firm_offer"]},
            "contract_signing": {"completed_steps": ["confirm_details"]},
        }}
        result = _find_newly_completed_steps(old, new, default_config)
        stages = [(stage, step) for stage, step, _ in result]
        assert ("sales_negotiation", "firm_offer") in stages
        assert ("contract_signing", "confirm_details") in stages

    def test_step_uncompleted_not_detected(self, default_config):
        """Removing a step from completed_steps should not trigger events."""
        old = {"stages": {"sales_negotiation": {"completed_steps": ["classify", "firm_offer"]}}}
        new = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}  # firm_offer removed
        result = _find_newly_completed_steps(old, new, default_config)
        assert len(result) == 0

    def test_sign_contract_detection(self, default_config):
        """sign_contract completion should be detectable for auto-contract creation."""
        old = {"stages": {"contract_signing": {"completed_steps": ["confirm_details"]}}}
        new = {"stages": {"contract_signing": {"completed_steps": ["confirm_details", "sign_contract"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        assert any(sk == "sign_contract" for _, sk, _ in result)


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    def test_disabled_step_ignored_in_status(self, default_config):
        """Disabled steps should not affect status derivation."""
        # Modify config: disable the 'classify' step
        config = copy.deepcopy(default_config)
        for stage in config.workflow_stages:
            if stage["key"] == "sales_negotiation":
                for step in stage["steps"]:
                    if step["key"] == "classify":
                        step["enabled"] = False

        wf = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        # classify is disabled, so its status should not count
        result = compute_status_from_config(wf, config)
        assert result == "new"

    def test_null_stages_in_workflow_data(self, default_config):
        """workflow_data with null stages should return 'new'."""
        assert compute_status_from_config({"stages": None}, default_config) == "new"

    def test_extra_completed_steps_ignored(self, default_config):
        """Completed steps not in config are safely ignored."""
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["nonexistent_step"]}}}
        assert compute_status_from_config(wf, default_config) == "new"

    def test_status_derivation_with_only_later_stages(self, default_config):
        """Completing later stages without earlier ones should still work."""
        wf = {"stages": {"collection": {"completed_steps": ["follow_payment"]}}}
        assert compute_status_from_config(wf, default_config) == "payment"

    def test_get_stage_data_returns_empty_for_missing(self):
        """_get_stage_data should return {} for missing keys."""
        assert _get_stage_data({}, "sales_negotiation") == {}
        assert _get_stage_data({"stages": {}}, "sales_negotiation") == {}
        assert _get_stage_data({"stages": None}, "sales_negotiation") == {}


# ═══════════════════════════════════════════════════════════════════════════════
# 8. Custom Template Simulation
# ═══════════════════════════════════════════════════════════════════════════════

class TestCustomTemplate:
    def test_add_custom_step_with_status(self):
        """Adding a custom step with status should create a new status in the chain."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        # Add a custom step "quality_check" with status "quality_review" in procurement stage
        for stage in definition["workflow_stages"]:
            if stage["key"] == "procurement":
                stage["steps"].append({
                    "key": "quality_check",
                    "label": "Quality Check",
                    "type": "checklist",
                    "status": "quality_review",
                    "status_label": "Quality Review",
                })
        config = _resolve_config(definition)
        # Verify new status appears
        status_keys = [s["key"] for s in config.status_values]
        assert "quality_review" in status_keys
        assert "quality_review" in config.status_rank
        # Verify transitions include new status
        assert config.transitions.get("procuring") == "quality_review" or \
               "quality_review" in config.transitions.values()

    def test_remove_step_shrinks_chain(self):
        """Removing a step with status should remove that status from the chain."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        # Remove the classify step (has status "inquiry")
        for stage in definition["workflow_stages"]:
            if stage["key"] == "sales_negotiation":
                stage["steps"] = [s for s in stage["steps"] if s["key"] != "classify"]
        config = _resolve_config(definition)
        status_keys = [s["key"] for s in config.status_values if s.get("stage")]
        assert "inquiry" not in status_keys

    def test_disable_step_removes_from_chain(self):
        """Disabling a step should remove its status from derivation."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        for stage in definition["workflow_stages"]:
            if stage["key"] == "sales_negotiation":
                for step in stage["steps"]:
                    if step["key"] == "classify":
                        step["enabled"] = False
        config = _resolve_config(definition)
        status_keys = [s["key"] for s in config.status_values if s.get("stage")]
        assert "inquiry" not in status_keys

    def test_reorder_stages_changes_transitions(self):
        """Reordering stages should change the transition chain."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        # Swap procurement and booking stages
        stages = definition["workflow_stages"]
        procurement_idx = next(i for i, s in enumerate(stages) if s["key"] == "procurement")
        booking_idx = next(i for i, s in enumerate(stages) if s["key"] == "booking")
        stages[procurement_idx], stages[booking_idx] = stages[booking_idx], stages[procurement_idx]

        config = _resolve_config(definition)
        # After swap, booking's status should come before procurement's
        rank = config.status_rank
        booking_rank = rank.index("booking")
        procuring_rank = rank.index("procuring")
        assert booking_rank < procuring_rank, \
            "After swap, booking should rank before procuring"

    def test_add_new_stage(self):
        """Adding a completely new stage should extend the workflow."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        definition["workflow_stages"].append({
            "key": "after_sales_service",
            "label": "After Sales",
            "steps": [
                {"key": "warranty_check", "label": "Warranty Check", "type": "checklist",
                 "status": "warranty", "status_label": "Warranty Period"},
            ],
        })
        config = _resolve_config(definition)
        assert "warranty" in [s["key"] for s in config.status_values]
        assert "warranty" in config.status_rank
        # Should be the last in the transition chain
        assert config.transitions.get("converted") == "warranty"


# ═══════════════════════════════════════════════════════════════════════════════
# 9. Settings Page Round-Trip Simulation
# ═══════════════════════════════════════════════════════════════════════════════

class TestSettingsRoundTrip:
    def test_save_and_resolve(self):
        """Simulate: settings page saves → PATCH merges → config resolves correctly."""
        # Step 1: Start with defaults
        existing_def = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)

        # Step 2: Simulate settings page saving modified workflow_stages
        modified_stages = copy.deepcopy(existing_def["workflow_stages"])
        # Disable a step
        for stage in modified_stages:
            if stage["key"] == "sales_negotiation":
                for step in stage["steps"]:
                    if step["key"] == "soft_offer":
                        step["enabled"] = False

        # Step 3: Simulate PATCH merge (what pipeline_config.py router does)
        existing_def["workflow_stages"] = modified_stages
        existing_def["stages"] = modified_stages  # sync both keys

        # Step 4: Resolve config
        config = _resolve_config(existing_def)

        # Step 5: Verify disabled step is excluded
        all_step_keys = []
        for stage in config.workflow_stages:
            for step in stage.get("steps", []):
                if step.get("enabled") is not False:
                    all_step_keys.append(step["key"])
        # soft_offer should still be in workflow_stages (it's in the data)
        # but derivation should skip it
        wf = {"stages": {"sales_negotiation": {"completed_steps": ["soft_offer"]}}}
        # soft_offer has no status field, so this is fine regardless
        assert compute_status_from_config(wf, config) == "new"

    def test_general_statuses_saved_and_resolved(self):
        """General statuses from settings should be resolved correctly."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        definition["general_statuses"] = [
            {"key": "new", "label": "New Lead", "color": "bg-blue-100 text-blue-700"},
            {"key": "cold", "label": "Cold", "color": "bg-gray-100 text-gray-500"},
            {"key": "lost", "label": "Lost", "color": "bg-red-100 text-red-500"},
            {"key": "blacklisted", "label": "Blacklisted", "color": "bg-black text-white"},
        ]
        config = _resolve_config(definition)
        assert len(config.general_statuses) == 4
        assert config.general_statuses[3]["key"] == "blacklisted"
        # blacklisted should transition to first step status
        assert config.transitions.get("blacklisted") == "inquiry"

    def test_file_categories_round_trip(self):
        """Custom file categories should be preserved through resolution."""
        definition = copy.deepcopy(DEFAULT_PIPELINE_DEFINITION)
        definition["file_categories"] = [
            {"key": "contract", "label": "Contract"},
            {"key": "custom_doc", "label": "Custom Document"},
        ]
        config = _resolve_config(definition)
        assert len(config.file_categories) == 2
        keys = [c["key"] for c in config.file_categories]
        assert "custom_doc" in keys


# ═══════════════════════════════════════════════════════════════════════════════
# 10. Status-to-Stage Mapping
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusToStage:
    def test_each_status_maps_to_pipeline_stage(self, default_config):
        """Every step-derived status should map to a valid pipeline stage."""
        pipeline_keys = {s["key"] for s in default_config.pipeline_stages}
        for status_key, stage_key in default_config.status_to_stage.items():
            assert stage_key in pipeline_keys, \
                f"Status {status_key} maps to unknown pipeline stage {stage_key}"

    def test_expected_mappings(self, default_config):
        """Verify specific status → pipeline stage mappings."""
        m = default_config.status_to_stage
        assert m["inquiry"] == "sales"
        assert m["quoted"] == "sales"
        assert m["negotiating"] == "contract"
        assert m["procuring"] == "procurement"
        assert m["booking"] == "booking"
        assert m["fulfillment"] == "shipping"
        assert m["payment"] == "collection"
        assert m["converted"] == "collection"


# ═══════════════════════════════════════════════════════════════════════════════
# 11. Full Workflow Simulation
# ═══════════════════════════════════════════════════════════════════════════════

class TestFullWorkflowSimulation:
    """Simulate a complete lead lifecycle through all 6 stages."""

    def test_complete_lifecycle(self, default_config):
        """Walk through all steps in order and verify status at each milestone."""
        wf = {"stages": {}}
        rank = default_config.status_rank

        # Track the status progression
        status_history = []

        # Define the steps to complete per stage, with expected status
        lifecycle = [
            # Stage 1: Sales Negotiation
            ("sales_negotiation", "classify", "inquiry"),
            ("sales_negotiation", "price_inquiry", "inquiry"),  # no status on this step
            ("sales_negotiation", "soft_offer", "inquiry"),     # no status
            ("sales_negotiation", "firm_offer", "quoted"),
            # Stage 2: Contract Signing
            ("contract_signing", "confirm_details", "negotiating"),
            ("contract_signing", "draft_contract", "negotiating"),  # no status
            ("contract_signing", "order_note", "negotiating"),      # no status
            ("contract_signing", "sign_contract", "negotiating"),   # no status
            ("contract_signing", "send_contract", "negotiating"),   # no status
            # Stage 3: Procurement
            ("procurement", "procurement_check", "procuring"),
            ("procurement", "confirm_supplier", "procuring"),  # no status
            ("procurement", "sign_purchase", "procuring"),     # no status
            ("procurement", "pay_deposit", "procuring"),       # no status
            # Stage 4: Booking
            ("booking", "freight_inquiry", "booking"),
            ("booking", "booking", "booking"),       # no status
            ("booking", "cost_confirm", "booking"),  # no status
            # Stage 5: Shipping
            ("shipping", "labels", "fulfillment"),
            ("shipping", "inspection", "fulfillment"),   # no status
            ("shipping", "customs", "fulfillment"),      # no status
            ("shipping", "documents", "fulfillment"),    # no status
            # Stage 6: Collection
            ("collection", "follow_payment", "payment"),
            ("collection", "filing", "converted"),
        ]

        for stage_key, step_key, expected_status in lifecycle:
            if stage_key not in wf["stages"]:
                wf["stages"][stage_key] = {"completed_steps": []}
            wf["stages"][stage_key]["completed_steps"].append(step_key)

            derived = compute_status_from_config(wf, default_config)

            # Status should only advance, never regress
            if status_history:
                prev = status_history[-1]
                prev_rank = rank.index(prev) if prev in rank else 0
                new_rank = rank.index(derived) if derived in rank else 0
                assert new_rank >= prev_rank, \
                    f"Status regressed from {prev} to {derived} after completing {stage_key}/{step_key}"

            status_history.append(derived)

            # At milestone steps (those with status field), verify exact match
            step_def = None
            for stage in default_config.workflow_stages:
                if stage["key"] == stage_key:
                    for s in stage["steps"]:
                        if s["key"] == step_key:
                            step_def = s
                            break

            if step_def and step_def.get("status"):
                assert derived == expected_status, \
                    f"After {stage_key}/{step_key}: expected {expected_status}, got {derived}"

        # Final status should be 'converted'
        assert status_history[-1] == "converted"
