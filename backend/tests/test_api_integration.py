"""
API-level integration tests for CRM workflow endpoints.

Tests the full HTTP → auth → validation → status derivation → response chain
using FastAPI's TestClient with mocked DB dependencies.
"""

import json
import uuid
from collections import namedtuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from jose import jwt

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

SECRET = "dev-secret-key-change-in-production-32chars"
ALGORITHM = "HS256"
TENANT_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
LEAD_ID = str(uuid.uuid4())


def make_token(role="tenant_admin", tenant_slug="demo"):
    return jwt.encode(
        {"sub": USER_ID, "role": role, "tenant_id": TENANT_ID, "tenant_slug": tenant_slug},
        SECRET, algorithm=ALGORITHM,
    )


AUTH_HEADER = {"Authorization": f"Bearer {make_token()}"}
USER_HEADER = {"Authorization": f"Bearer {make_token(role='user')}"}


class FakeRow:
    """A row with both attribute and _mapping dict access, mimicking SQLAlchemy Row."""

    def __init__(self, data: dict):
        self.__dict__["_data"] = data
        self.__dict__["_mapping"] = data

    def __getattr__(self, name):
        if name in self.__dict__:
            return self.__dict__[name]
        return self.__dict__["_data"].get(name)


TenantRow = FakeRow({"is_active": True, "schema_provisioned": True})


class FakeResult:
    """Mocks a SQLAlchemy result with fetchone/fetchall/scalar."""

    def __init__(self, rows=None, scalar_val=None, row_count=None):
        self._rows = rows or []
        self._scalar = scalar_val
        self._row_count = row_count

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def scalar(self):
        return self._scalar

    @property
    def rowcount(self):
        if self._row_count is not None:
            return self._row_count
        return len(self._rows) if self._rows else 1


class FakeDB:
    """Async mock DB session that records executed queries."""

    def __init__(self, responses=None):
        self._responses = responses or []
        self._call_idx = 0
        self.executed = []

    async def execute(self, stmt, params=None):
        query = str(stmt) if hasattr(stmt, "text") else str(stmt)
        self.executed.append((query, params))
        if self._call_idx < len(self._responses):
            result = self._responses[self._call_idx]
            self._call_idx += 1
            return result
        return FakeResult()

    async def commit(self):
        pass

    async def rollback(self):
        pass


def get_test_app():
    """Create a fresh FastAPI app with just the CRM router for testing."""
    from fastapi import FastAPI
    from app.routers.crm import router
    app = FastAPI()
    app.include_router(router, prefix="/api")
    return app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def default_config():
    from app.services.pipeline_config import get_default_config
    return get_default_config()


# ---------------------------------------------------------------------------
# Test: Pipeline Config GET endpoint
# ---------------------------------------------------------------------------

class TestPipelineConfigEndpoint:
    """Test GET /api/pipeline-config returns valid config."""

    def test_get_config_returns_all_fields(self):
        from fastapi import FastAPI
        from app.routers.pipeline_config import router
        from app.deps import get_current_user_with_tenant

        app = FastAPI()
        app.include_router(router, prefix="/api")

        db = FakeDB([
            FakeResult([TenantRow]),   # tenant check
            FakeResult(),              # SET search_path
            FakeResult(),              # get_active_template returns None
        ])

        async def override_auth():
            return {"sub": USER_ID, "role": "tenant_admin", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[get_current_user_with_tenant] = override_auth

        with TestClient(app) as client:
            r = client.get("/api/pipeline-config", headers=AUTH_HEADER)
            assert r.status_code == 200
            data = r.json()
            assert "pipeline" in data
            assert "statuses" in data
            assert "workflow_stages" in data
            assert "general_statuses" in data
            assert "file_categories" in data
            assert len(data["pipeline"]["stages"]) == 6
            assert len(data["workflow_stages"]) > 0
            # Status rank should include general + step-derived
            assert "new" in data["statuses"]["rank"]
            assert "inquiry" in data["statuses"]["rank"]

    def test_get_config_with_custom_definition(self):
        from fastapi import FastAPI
        from app.routers.pipeline_config import router
        from app.deps import get_current_user_with_tenant
        from app.services.pipeline_defaults import DEFAULT_PIPELINE_DEFINITION

        app = FastAPI()
        app.include_router(router, prefix="/api")

        custom_def = dict(DEFAULT_PIPELINE_DEFINITION)
        custom_def["general_statuses"] = [
            {"key": "new", "label": "New"},
            {"key": "archived", "label": "Archived"},
        ]

        db = FakeDB()

        async def override_auth():
            return {"sub": USER_ID, "role": "tenant_admin", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[get_current_user_with_tenant] = override_auth

        with patch("app.routers.pipeline_config.get_pipeline_config") as mock_config:
            from app.services.pipeline_config import _resolve_config
            mock_config.return_value = _resolve_config(custom_def)

            with TestClient(app) as client:
                r = client.get("/api/pipeline-config", headers=AUTH_HEADER)
                assert r.status_code == 200
                data = r.json()
                general = data["general_statuses"]
                assert len(general) == 2
                assert general[0]["key"] == "new"
                assert general[1]["key"] == "archived"


# ---------------------------------------------------------------------------
# Test: Pipeline Config PATCH endpoint
# ---------------------------------------------------------------------------

class TestPipelineConfigPatch:
    """Test PATCH /api/pipeline-config saves and resolves correctly."""

    def test_patch_workflow_stages(self):
        from fastapi import FastAPI
        from app.routers.pipeline_config import router
        from app.deps import require_admin_with_tenant

        app = FastAPI()
        app.include_router(router, prefix="/api")

        template_row = FakeRow({
            "id": str(uuid.uuid4()),
            "slug": "default-demo",
            "definition": json.dumps({"pipeline": {"stages": []}}),
        })
        db = FakeDB([
            FakeResult([template_row]),  # SELECT existing template
            FakeResult(),                # UPDATE
            FakeResult(),                # get_active_template for response
        ])

        async def override_admin():
            return {"sub": USER_ID, "role": "tenant_admin", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[require_admin_with_tenant] = override_admin

        with patch("app.routers.pipeline_config.get_pipeline_config") as mock_config:
            from app.services.pipeline_config import get_default_config
            mock_config.return_value = get_default_config()

            with TestClient(app) as client:
                r = client.patch("/api/pipeline-config", headers=AUTH_HEADER,
                                 json={"workflow_stages": [{"key": "test_stage", "label": "Test", "steps": []}]})
                assert r.status_code == 200

                # Verify UPDATE was called with the right definition
                update_calls = [c for c in db.executed if "UPDATE" in str(c[0])]
                assert len(update_calls) >= 1

    def test_patch_requires_admin(self):
        from fastapi import FastAPI
        from app.routers.pipeline_config import router
        from app.deps import require_admin_with_tenant
        from fastapi import HTTPException

        app = FastAPI()
        app.include_router(router, prefix="/api")

        async def override_non_admin():
            raise HTTPException(status_code=403, detail="Tenant admin access required")

        app.dependency_overrides[require_admin_with_tenant] = override_non_admin

        with TestClient(app) as client:
            r = client.patch("/api/pipeline-config", headers=USER_HEADER,
                             json={"workflow_stages": []})
            assert r.status_code == 403


# ---------------------------------------------------------------------------
# Test: Workflow GET endpoint
# ---------------------------------------------------------------------------

class TestWorkflowGet:
    """Test GET /api/crm/leads/{lead_id}/workflow."""

    def test_get_workflow_returns_data(self):
        from app.deps import get_current_user_with_tenant

        app = get_test_app()

        workflow_data = {
            "stages": {
                "sales_negotiation": {
                    "completed_steps": ["classify", "price_inquiry"],
                    "assignees": {},
                    "notes": "",
                    "meta": {},
                    "steps_data": {},
                }
            }
        }

        lead_row = FakeRow({
            "workflow_data": workflow_data,
            "email": "test@example.com",
            "company": "Test Corp",
            "workflow_template_slug": None,
            "workflow_version": 0,
        })

        db = FakeDB([
            FakeResult([lead_row]),     # SELECT lead
            FakeResult(),               # is_returning check
            FakeResult(),               # get_effective_template
        ])

        async def override_auth():
            return {"sub": USER_ID, "role": "user", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[get_current_user_with_tenant] = override_auth

        with TestClient(app) as client:
            r = client.get(f"/api/crm/leads/{LEAD_ID}/workflow", headers=USER_HEADER)
            assert r.status_code == 200
            data = r.json()
            assert "workflow_data" in data
            assert "template" in data
            assert data["workflow_data"]["stages"]["sales_negotiation"]["completed_steps"] == ["classify", "price_inquiry"]

    def test_get_workflow_404_for_missing_lead(self):
        from app.deps import get_current_user_with_tenant

        app = get_test_app()

        db = FakeDB([
            FakeResult(),  # No lead found
        ])

        async def override_auth():
            return {"sub": USER_ID, "role": "user", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[get_current_user_with_tenant] = override_auth

        with TestClient(app) as client:
            r = client.get(f"/api/crm/leads/{LEAD_ID}/workflow", headers=USER_HEADER)
            assert r.status_code == 404


# ---------------------------------------------------------------------------
# Test: Workflow PATCH endpoint — validation
# ---------------------------------------------------------------------------

class TestWorkflowPatchValidation:
    """Test PATCH /api/crm/leads/{lead_id}/workflow validation."""

    def _make_app_with_lead(self, current_status="new", workflow_data=None, workflow_version=0):
        from app.deps import get_current_user_with_tenant

        app = get_test_app()

        lead_row = FakeRow({
            "status": current_status,
            "workflow_data": workflow_data or {},
            "workflow_template_slug": None,
            "workflow_version": workflow_version,
        })

        db = FakeDB([
            FakeResult([lead_row]),     # SELECT lead (cur_row)
            FakeResult(row_count=1),    # UPDATE leads
            FakeResult(),               # get_effective_template
        ])

        async def override_auth():
            return {"sub": USER_ID, "role": "user", "tenant_id": TENANT_ID,
                    "tenant_slug": "demo", "db": db}

        app.dependency_overrides[get_current_user_with_tenant] = override_auth
        return app, db

    def test_valid_workflow_data_accepted(self):
        app, db = self._make_app_with_lead()

        with patch("app.routers.crm.workflow.get_pipeline_config") as mock_cfg:
            from app.services.pipeline_config import get_default_config
            mock_cfg.return_value = get_default_config()

            with TestClient(app) as client:
                r = client.patch(
                    f"/api/crm/leads/{LEAD_ID}/workflow",
                    headers=USER_HEADER,
                    json={"stages": {"sales_negotiation": {"completed_steps": ["classify"], "assignees": {}, "notes": "", "meta": {}, "steps_data": {}}}},
                )
                assert r.status_code == 200

    def test_invalid_stages_type_rejected(self):
        app, db = self._make_app_with_lead()

        with patch("app.routers.crm.workflow.get_pipeline_config") as mock_cfg:
            from app.services.pipeline_config import get_default_config
            mock_cfg.return_value = get_default_config()

            with TestClient(app) as client:
                r = client.patch(
                    f"/api/crm/leads/{LEAD_ID}/workflow",
                    headers=USER_HEADER,
                    json={"stages": "not_a_dict"},
                )
                assert r.status_code == 422

    def test_invalid_completed_steps_type_rejected(self):
        app, db = self._make_app_with_lead()

        with patch("app.routers.crm.workflow.get_pipeline_config") as mock_cfg:
            from app.services.pipeline_config import get_default_config
            mock_cfg.return_value = get_default_config()

            with TestClient(app) as client:
                r = client.patch(
                    f"/api/crm/leads/{LEAD_ID}/workflow",
                    headers=USER_HEADER,
                    json={"stages": {"sales_negotiation": {"completed_steps": "not_a_list"}}},
                )
                assert r.status_code == 422

    def test_unknown_stage_key_rejected(self):
        app, db = self._make_app_with_lead()

        with patch("app.routers.crm.workflow.get_pipeline_config") as mock_cfg:
            from app.services.pipeline_config import get_default_config
            mock_cfg.return_value = get_default_config()

            with TestClient(app) as client:
                r = client.patch(
                    f"/api/crm/leads/{LEAD_ID}/workflow",
                    headers=USER_HEADER,
                    json={"stages": {"totally_fake_stage": {"completed_steps": []}}},
                )
                assert r.status_code == 422


# ---------------------------------------------------------------------------
# Test: Workflow PATCH endpoint — status derivation
# ---------------------------------------------------------------------------

class TestWorkflowPatchStatus:
    """Test that PATCH /api/crm/leads/{lead_id}/workflow correctly derives status."""

    def test_status_advances_on_step_completion(self, default_config):
        """When classify step is completed, status should advance from 'new' to at least 'inquiry'."""
        from app.services.pipeline_config import compute_status_from_config

        workflow = {
            "stages": {
                "sales_negotiation": {
                    "completed_steps": ["classify"],
                    "assignees": {},
                    "notes": "",
                    "meta": {},
                    "steps_data": {},
                }
            }
        }
        status = compute_status_from_config(workflow, default_config)
        assert status == "inquiry"

    def test_status_advances_through_all_stages(self, default_config):
        """Full workflow completion should reach 'converted'."""
        from app.services.pipeline_config import compute_status_from_config

        all_steps = {}
        for stage in default_config.workflow_stages:
            all_steps[stage["key"]] = {
                "completed_steps": [s["key"] for s in stage["steps"]],
                "assignees": {},
                "notes": "",
                "meta": {},
                "steps_data": {},
            }

        workflow = {"stages": all_steps}
        status = compute_status_from_config(workflow, default_config)
        assert status == "converted"

    def test_status_never_regresses(self, default_config):
        """Status rank should be monotonically non-decreasing."""
        from app.services.pipeline_config import compute_status_from_config

        rank = default_config.status_rank
        prev_rank_idx = 0

        for stage in default_config.workflow_stages:
            cumulative_steps = []
            for step in stage["steps"]:
                cumulative_steps.append(step["key"])
                workflow = {"stages": {stage["key"]: {"completed_steps": cumulative_steps}}}
                status = compute_status_from_config(workflow, default_config)
                if status in rank:
                    idx = rank.index(status)
                    assert idx >= prev_rank_idx, f"Status regressed: {status} (rank {idx}) < prev rank {prev_rank_idx}"
                    prev_rank_idx = idx


# ---------------------------------------------------------------------------
# Test: Newly completed step detection
# ---------------------------------------------------------------------------

class TestNewlyCompletedDetection:
    """Test _find_newly_completed_steps in API context."""

    def test_detection_via_import(self, default_config):
        from app.routers.crm.workflow import _find_newly_completed_steps

        old = {}
        new = {"stages": {"sales_negotiation": {"completed_steps": ["classify", "price_inquiry"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        keys = [step_key for _, step_key, _ in result]
        assert "classify" in keys
        assert "price_inquiry" in keys

    def test_already_completed_not_detected(self, default_config):
        from app.routers.crm.workflow import _find_newly_completed_steps

        old = {"stages": {"sales_negotiation": {"completed_steps": ["classify"]}}}
        new = {"stages": {"sales_negotiation": {"completed_steps": ["classify", "price_inquiry"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        keys = [step_key for _, step_key, _ in result]
        assert "classify" not in keys
        assert "price_inquiry" in keys

    def test_sign_contract_triggers_detection(self, default_config):
        from app.routers.crm.workflow import _find_newly_completed_steps

        old = {"stages": {"contract_signing": {"completed_steps": ["confirm_details"]}}}
        new = {"stages": {"contract_signing": {"completed_steps": ["confirm_details", "sign_contract"]}}}
        result = _find_newly_completed_steps(old, new, default_config)
        sign_found = any(sk == "sign_contract" for _, sk, _ in result)
        assert sign_found


# ---------------------------------------------------------------------------
# Test: Config-driven transitions correctness
# ---------------------------------------------------------------------------

class TestTransitionsAPI:
    """Verify the transitions chain works end-to-end."""

    def test_transitions_cover_all_step_statuses(self, default_config):
        """Every step-derived status (except the last) should have a transition."""
        step_statuses = []
        for stage in default_config.workflow_stages:
            for step in stage.get("steps", []):
                s = step.get("status")
                if s and s not in step_statuses:
                    step_statuses.append(s)

        for s in step_statuses[:-1]:
            assert s in default_config.transitions, f"Missing transition from '{s}'"
            assert default_config.transitions[s] in step_statuses, \
                f"Transition from '{s}' → '{default_config.transitions[s]}' is not a valid status"

    def test_general_statuses_transition_into_chain(self, default_config):
        """General statuses (new, cold, lost) should transition to the first step status."""
        step_statuses = []
        for stage in default_config.workflow_stages:
            for step in stage.get("steps", []):
                s = step.get("status")
                if s and s not in step_statuses:
                    step_statuses.append(s)

        first_status = step_statuses[0] if step_statuses else None
        for gs in default_config.general_statuses:
            if gs["key"] in default_config.transitions:
                assert default_config.transitions[gs["key"]] == first_status


# ---------------------------------------------------------------------------
# Test: Workflow data validation edge cases
# ---------------------------------------------------------------------------

class TestValidationEdgeCases:
    """Test validation with various edge cases."""

    def test_empty_body_is_valid(self, default_config):
        from app.services.pipeline_config import validate_workflow_data
        assert validate_workflow_data({}, default_config) == []

    def test_none_stages_is_valid(self, default_config):
        from app.services.pipeline_config import validate_workflow_data
        assert validate_workflow_data({"stages": None}, default_config) == []

    def test_numeric_keys_allowed(self, default_config):
        from app.services.pipeline_config import validate_workflow_data
        errors = validate_workflow_data({"stages": {"0": {"completed_steps": []}}}, default_config)
        assert errors == []

    def test_multiple_errors_reported(self, default_config):
        from app.services.pipeline_config import validate_workflow_data
        errors = validate_workflow_data({
            "stages": {
                "fake_stage_1": {"completed_steps": []},
                "fake_stage_2": {"completed_steps": "bad"},
            }
        }, default_config)
        assert len(errors) >= 2

    def test_extra_data_in_stage_is_allowed(self, default_config):
        from app.services.pipeline_config import validate_workflow_data
        errors = validate_workflow_data({
            "stages": {
                "sales_negotiation": {
                    "completed_steps": ["classify"],
                    "assignees": {"salesperson": "user-1"},
                    "notes": "some notes",
                    "meta": {},
                    "steps_data": {"classify": {"files": []}},
                }
            }
        }, default_config)
        assert errors == []


# ---------------------------------------------------------------------------
# Test: Config round-trip (save → resolve → verify)
# ---------------------------------------------------------------------------

class TestConfigRoundTrip:
    """Test saving custom config and re-resolving it."""

    def test_custom_stages_survive_round_trip(self):
        from app.services.pipeline_config import _resolve_config

        custom_definition = {
            "workflow_stages": [
                {
                    "key": "alpha",
                    "label": "Alpha Phase",
                    "steps": [
                        {"key": "step_a", "label": "Step A", "status": "started", "status_label": "Started"},
                        {"key": "step_b", "label": "Step B", "status": "midway", "status_label": "Midway"},
                    ],
                },
                {
                    "key": "beta",
                    "label": "Beta Phase",
                    "steps": [
                        {"key": "step_c", "label": "Step C", "status": "completed", "status_label": "Completed"},
                    ],
                },
            ],
            "general_statuses": [
                {"key": "new", "label": "New"},
                {"key": "archived", "label": "Archived"},
            ],
        }

        config = _resolve_config(custom_definition)

        # Verify workflow stages preserved
        assert len(config.workflow_stages) == 2
        assert config.workflow_stages[0]["key"] == "alpha"
        assert len(config.workflow_stages[0]["steps"]) == 2

        # Verify status derivation works with custom config
        from app.services.pipeline_config import compute_status_from_config
        workflow = {"stages": {"alpha": {"completed_steps": ["step_a"]}}}
        assert compute_status_from_config(workflow, config) == "started"

        workflow2 = {"stages": {"beta": {"completed_steps": ["step_c"]}, "alpha": {"completed_steps": ["step_a", "step_b"]}}}
        assert compute_status_from_config(workflow2, config) == "completed"

        # Verify transitions chain
        assert config.transitions.get("started") == "midway"
        assert config.transitions.get("midway") == "completed"

        # Verify rank includes general + step-derived
        assert "new" in config.status_rank
        assert "archived" in config.status_rank
        assert "started" in config.status_rank
        assert "completed" in config.status_rank

    def test_to_dict_and_re_resolve(self):
        from app.services.pipeline_config import _resolve_config, get_default_config

        config1 = get_default_config()
        d = config1.to_dict()

        # Simulate saving to DB and re-loading
        config2 = _resolve_config(d)

        assert config2.workflow_stages == config1.workflow_stages
        assert config2.general_statuses == config1.general_statuses
        assert config2.file_categories == config1.file_categories


# ---------------------------------------------------------------------------
# Test: Auth middleware
# ---------------------------------------------------------------------------

class TestAuthMiddleware:
    """Test authentication requirements on endpoints."""

    def test_unauthenticated_request_rejected(self):
        app = get_test_app()
        with TestClient(app) as client:
            r = client.get(f"/api/crm/leads/{LEAD_ID}/workflow")
            assert r.status_code in (401, 403)

    def test_invalid_token_rejected(self):
        app = get_test_app()
        with TestClient(app) as client:
            r = client.get(f"/api/crm/leads/{LEAD_ID}/workflow",
                           headers={"Authorization": "Bearer invalid_token_here"})
            assert r.status_code in (401, 403)

    def test_expired_token_rejected(self):
        import time
        token = jwt.encode(
            {"sub": USER_ID, "role": "user", "tenant_id": TENANT_ID,
             "tenant_slug": "demo", "exp": int(time.time()) - 3600},
            SECRET, algorithm=ALGORITHM,
        )
        app = get_test_app()
        with TestClient(app) as client:
            r = client.get(f"/api/crm/leads/{LEAD_ID}/workflow",
                           headers={"Authorization": f"Bearer {token}"})
            assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Test: Status-to-stage mapping consistency
# ---------------------------------------------------------------------------

class TestStatusStageConsistency:
    """Verify status_to_stage mapping is consistent with pipeline stages."""

    def test_all_mapped_stages_exist_in_pipeline(self, default_config):
        pipeline_keys = {s["key"] for s in default_config.pipeline_stages}
        for status, stage in default_config.status_to_stage.items():
            assert stage in pipeline_keys, \
                f"Status '{status}' maps to stage '{stage}' which is not in pipeline stages"

    def test_all_step_statuses_are_mapped(self, default_config):
        for stage in default_config.workflow_stages:
            for step in stage.get("steps", []):
                s = step.get("status")
                if s:
                    assert s in default_config.status_to_stage, \
                        f"Step status '{s}' not found in status_to_stage mapping"

    def test_rank_covers_all_statuses(self, default_config):
        all_statuses = set()
        for s in default_config.status_values:
            all_statuses.add(s["key"])
        for s in default_config.general_statuses:
            all_statuses.add(s["key"])

        rank_set = set(default_config.status_rank)
        for s in all_statuses:
            assert s in rank_set, f"Status '{s}' missing from status_rank"
