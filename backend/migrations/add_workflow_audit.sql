-- Workflow audit log — tracks every step completion/uncompletion
CREATE TABLE IF NOT EXISTS crm_workflow_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    stage_key VARCHAR(100) NOT NULL,
    step_key VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'completed',  -- completed | uncompleted
    step_type VARCHAR(50),
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_workflow_log_lead ON crm_workflow_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_workflow_log_created ON crm_workflow_log(created_at);

-- Optimistic locking version column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_version INTEGER NOT NULL DEFAULT 0;
