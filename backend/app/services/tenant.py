import re

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

TENANT_SCHEMA_DDL = [
    """CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        plain_password VARCHAR(255),
        full_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'tenant_user',
        avatar_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        is_admin BOOLEAN DEFAULT FALSE,
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) DEFAULT 'personal',
        visibility VARCHAR(20) DEFAULT 'private',
        owner_id UUID NOT NULL,
        icon VARCHAR(50),
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        parent_page_id UUID,
        title VARCHAR(500) DEFAULT 'Untitled',
        content JSONB DEFAULT '{}',
        position FLOAT DEFAULT 0.0,
        icon VARCHAR(50),
        cover_emoji VARCHAR(50),
        is_archived BOOLEAN DEFAULT FALSE,
        is_template BOOLEAN DEFAULT FALSE,
        template_category VARCHAR(100),
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsapp VARCHAR(50),
        company VARCHAR(255),
        title VARCHAR(255),
        source VARCHAR(100),
        status VARCHAR(50) DEFAULT 'new',
        follow_up_status VARCHAR(50) DEFAULT 'pending',
        ai_summary TEXT,
        duplicate_of UUID,
        custom_fields JSONB DEFAULT '{}',
        assigned_to UUID,
        last_contacted_at TIMESTAMPTZ,
        is_cold BOOLEAN DEFAULT FALSE,
        cold_lead_reason TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_template_slug VARCHAR(255) DEFAULT 'default'",
    "UPDATE leads SET workflow_template_slug = 'default' WHERE workflow_template_slug IS NULL",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS familiarity_stage VARCHAR(50) DEFAULT 'new'",
    # Migrate existing status → familiarity_stage for old rows
    "UPDATE leads SET familiarity_stage = status WHERE familiarity_stage = 'new' AND status IN ('replied','quoted','engaged','qualified','negotiating','converted')",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS contract_value NUMERIC(19,4) DEFAULT 0",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD'",
    "CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)",
    "CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)",
    "CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp)",
    """CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsapp VARCHAR(50),
        wechat VARCHAR(100),
        feishu VARCHAR(100),
        company_id UUID,
        title VARCHAR(255),
        channel_ids JSONB DEFAULT '{}',
        custom_fields JSONB DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id UUID,
        lead_id UUID,
        type VARCHAR(50) NOT NULL, -- 'email', 'whatsapp', 'call', 'meeting'
        direction VARCHAR(10) DEFAULT 'outbound', -- 'inbound', 'outbound'
        content TEXT,
        metadata JSONB DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50),
        size BIGINT,
        contact_id UUID,
        company_id UUID,
        deal_id UUID,
        category VARCHAR(50), -- 'contract', 'invoice', 'shipping', 'other'
        metadata JSONB DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        website VARCHAR(500),
        industry VARCHAR(100),
        size VARCHAR(50),
        ai_research JSONB DEFAULT '{}',
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS crm_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        owner_id UUID,
        industry VARCHAR(100),
        country VARCHAR(100),
        credit_level VARCHAR(50) DEFAULT 'normal',
        status VARCHAR(30) DEFAULT 'active',
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS crm_contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_no VARCHAR(120) UNIQUE NOT NULL,
        account_id UUID,
        lead_id UUID,
        order_id UUID,
        contract_amount NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(10) DEFAULT 'USD',
        payment_method VARCHAR(50),
        incoterm VARCHAR(20),
        sign_date DATE,
        eta DATE,
        status VARCHAR(50) DEFAULT 'draft',
        risk_level VARCHAR(20) DEFAULT 'normal',
        sales_owner_id UUID,
        remarks TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS crm_receivables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id UUID NOT NULL,
        due_date DATE,
        amount NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(10) DEFAULT 'USD',
        received_amount NUMERIC(19,4) DEFAULT 0.0,
        status VARCHAR(30) DEFAULT 'open',
        payment_proof_url VARCHAR(1000),
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_crm_contracts_order_id ON crm_contracts(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_crm_receivables_contract_id ON crm_receivables(contract_id)",
    # ── crm_receivables extensions ──
    "ALTER TABLE crm_receivables ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(120)",
    "ALTER TABLE crm_receivables ADD COLUMN IF NOT EXISTS lead_id UUID",
    "ALTER TABLE crm_receivables ADD COLUMN IF NOT EXISTS assigned_to UUID",
    # ── crm_receivable_payments (batch payment records) ──
    """CREATE TABLE IF NOT EXISTS crm_receivable_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receivable_id UUID NOT NULL,
        amount NUMERIC(19,4) NOT NULL,
        payment_date DATE DEFAULT CURRENT_DATE,
        payment_proof_url VARCHAR(1000),
        payment_proof_name VARCHAR(500),
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_crm_receivable_payments_rid ON crm_receivable_payments(receivable_id)",
    # ── crm_payables (symmetric to crm_receivables) ──
    """CREATE TABLE IF NOT EXISTS crm_payables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id UUID NOT NULL,
        due_date DATE,
        amount NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(10) DEFAULT 'USD',
        paid_amount NUMERIC(19,4) DEFAULT 0.0,
        status VARCHAR(30) DEFAULT 'unpaid',
        payment_proof_url VARCHAR(1000),
        notes TEXT,
        invoice_no VARCHAR(120),
        supplier_name VARCHAR(255),
        assigned_to UUID,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_crm_payables_contract_id ON crm_payables(contract_id)",
    # ── crm_payable_payments (symmetric to crm_receivable_payments) ──
    """CREATE TABLE IF NOT EXISTS crm_payable_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payable_id UUID NOT NULL,
        amount NUMERIC(19,4) NOT NULL,
        payment_date DATE DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50),
        reference_no VARCHAR(120),
        payment_proof_url VARCHAR(1000),
        payment_proof_name VARCHAR(500),
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_crm_payable_payments_pid ON crm_payable_payments(payable_id)",
    "DO $$ BEGIN ALTER TABLE crm_receivables ADD CONSTRAINT fk_receivables_contract FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_receivable_payments ADD CONSTRAINT fk_receivable_payments_receivable FOREIGN KEY (receivable_id) REFERENCES crm_receivables(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_payables ADD CONSTRAINT fk_payables_contract FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_payable_payments ADD CONSTRAINT fk_payable_payments_payable FOREIGN KEY (payable_id) REFERENCES crm_payables(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    """CREATE TABLE IF NOT EXISTS pipelines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        stages JSONB DEFAULT '[]',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS deals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        pipeline_id UUID NOT NULL,
        stage VARCHAR(100) NOT NULL,
        value NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        contact_id UUID,
        company_id UUID,
        assigned_to UUID,
        close_date TIMESTAMPTZ,
        custom_fields JSONB DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        parent_id UUID,
        manager_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        employee_number VARCHAR(50) UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        department_id UUID,
        manager_id UUID,
        title VARCHAR(255),
        employment_type VARCHAR(50) DEFAULT 'full_time',
        start_date DATE,
        end_date DATE,
        salary NUMERIC(19,4),
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'active',
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS leave_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL,
        leave_type VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days NUMERIC(7,2),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        approved_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS payroll_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        total_gross NUMERIC(19,4) DEFAULT 0.0,
        total_net NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        lines JSONB DEFAULT '[]',
        processed_by UUID,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id UUID NOT NULL,
        subject VARCHAR(500),
        items JSONB DEFAULT '[]', -- [{product_id, quantity, target_price}]
        requirements TEXT,
        status VARCHAR(50) DEFAULT 'open', -- 'open', 'quoted', 'closed'
        priority VARCHAR(20) DEFAULT 'medium',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS quotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inquiry_id UUID,
        contact_id UUID NOT NULL,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        items JSONB DEFAULT '[]', -- [{product_id, qty, unit_cost, margin, price}]
        currency VARCHAR(3) DEFAULT 'USD',
        exchange_rate NUMERIC(19,4) DEFAULT 1.0,
        incoterms VARCHAR(20), -- FOB, CIF, EXW, etc.
        port_of_loading VARCHAR(255),
        port_of_destination VARCHAR(255),
        total_amount NUMERIC(19,4) DEFAULT 0.0,
        expiry_date DATE,
        status VARCHAR(50) DEFAULT 'draft',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS shipments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        deal_id UUID,
        contract_number VARCHAR(100),
        vessel_name VARCHAR(255),
        voyage_number VARCHAR(100),
        container_number VARCHAR(100),
        seal_number VARCHAR(100),
        bl_number VARCHAR(100), -- 提单号
        etd DATE, -- 预计启运时间
        eta DATE, -- 预计到达时间
        atd DATE, -- 实际启运时间
        ata DATE, -- 实际到达时间
        shipping_line VARCHAR(255),
        forwarder_info TEXT,
        status VARCHAR(50) DEFAULT 'booking', -- 'booking', 'shipped', 'in_transit', 'arrived', 'delivered'
        documents JSONB DEFAULT '[]', -- 关联单证列表
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(50),
        parent_id UUID,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) DEFAULT 'receivable',
        contact_id UUID,
        company_id UUID,
        issue_date DATE NOT NULL,
        due_date DATE,
        status VARCHAR(50) DEFAULT 'draft',
        subtotal NUMERIC(19,4) DEFAULT 0.0,
        tax_rate NUMERIC(19,4) DEFAULT 0.0,
        tax_amount NUMERIC(19,4) DEFAULT 0.0,
        total NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS invoice_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL,
        description VARCHAR(500) NOT NULL,
        quantity NUMERIC(19,4) DEFAULT 1.0,
        unit_price NUMERIC(19,4) DEFAULT 0.0,
        amount NUMERIC(19,4) DEFAULT 0.0,
        account_id UUID,
        tax_rate NUMERIC(19,4) DEFAULT 0.0
    )""",
    """CREATE TABLE IF NOT EXISTS journal_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_number VARCHAR(50) UNIQUE,
        date DATE NOT NULL,
        description TEXT,
        lines JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'draft',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        address TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        rating VARCHAR(50),
        company_info TEXT,
        contact_person VARCHAR(100),
        contact_info VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)",
    "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(100)",
    """CREATE TABLE IF NOT EXISTS supplier_quotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        material VARCHAR(255),
        spec VARCHAR(500),
        quantity NUMERIC(19,4),
        unit_price NUMERIC(19,4),
        delivery_period VARCHAR(100),
        payment_method VARCHAR(100),
        special_requirements TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_supplier_quotations_supplier_id ON supplier_quotations(supplier_id)",
    """CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        unit VARCHAR(50) DEFAULT 'each',
        cost_price NUMERIC(19,4) DEFAULT 0.0,
        sell_price NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        current_stock NUMERIC(19,4) DEFAULT 0.0,
        reorder_point NUMERIC(19,4) DEFAULT 0.0,
        warehouse_id UUID,
        is_active BOOLEAN DEFAULT TRUE,
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS purchase_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        po_number VARCHAR(50) UNIQUE NOT NULL,
        vendor_company_id UUID,
        status VARCHAR(50) DEFAULT 'draft',
        order_date TIMESTAMPTZ DEFAULT NOW(),
        expected_date TIMESTAMPTZ,
        lines JSONB DEFAULT '[]',
        total NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        warehouse_id UUID,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        warehouse_id UUID,
        movement_type VARCHAR(50),
        quantity NUMERIC(19,4) NOT NULL,
        reference_type VARCHAR(50),
        reference_id UUID,
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS ai_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title VARCHAR(500),
        messages JSONB DEFAULT '[]',
        context_module VARCHAR(50),
        context_record_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS ai_tools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        trigger VARCHAR(50),
        slash_command VARCHAR(100),
        icon VARCHAR(10),
        prompt_template TEXT,
        output_mode VARCHAR(50) DEFAULT 'sidebar',
        is_active BOOLEAN DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        user_email VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id UUID,
        changes JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS integration_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform VARCHAR(50) NOT NULL UNIQUE,
        credential_data JSONB DEFAULT '{}',
        n8n_credential_id VARCHAR(255),
        webhook_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS integration_oauth_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        platform VARCHAR(50) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE (user_id, platform)
    )""",
    """CREATE TABLE IF NOT EXISTS user_ai_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE,
        style_preference VARCHAR(100) DEFAULT 'professional',
        custom_instructions TEXT,
        common_tasks JSONB DEFAULT '[]',
        learned_context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS integration_app_directory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_key VARCHAR(120) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        source VARCHAR(30) DEFAULT 'curated',
        category VARCHAR(80),
        description TEXT,
        capabilities JSONB DEFAULT '[]',
        docs_url VARCHAR(1000),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS integration_feature_flags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feature_key VARCHAR(120) UNIQUE NOT NULL,
        feature_name VARCHAR(255) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        admin_only BOOLEAN DEFAULT FALSE,
        settings JSONB DEFAULT '{}',
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS integration_link_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        source_module VARCHAR(80) NOT NULL,
        source_event VARCHAR(120) NOT NULL,
        target_app_key VARCHAR(120) NOT NULL,
        target_action VARCHAR(120) NOT NULL,
        mapping_config JSONB DEFAULT '{}',
        ai_enabled BOOLEAN DEFAULT FALSE,
        ai_instruction TEXT,
        automation_mode VARCHAR(30) DEFAULT 'manual',
        n8n_webhook_url VARCHAR(1000),
        is_active BOOLEAN DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_integration_link_templates_source ON integration_link_templates(source_module, source_event)",
    """CREATE TABLE IF NOT EXISTS integration_link_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL,
        trigger_source VARCHAR(120),
        input_payload JSONB DEFAULT '{}',
        transformed_payload JSONB DEFAULT '{}',
        ai_output JSONB DEFAULT '{}',
        target_status VARCHAR(30) DEFAULT 'pending',
        target_response TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_integration_link_runs_template_id ON integration_link_runs(template_id)",
    """CREATE TABLE IF NOT EXISTS export_flow_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_no VARCHAR(120) UNIQUE NOT NULL,
        customer_name VARCHAR(255),
        sale_amount_usd NUMERIC(19,4) DEFAULT 0.0,
        sale_amount_cny NUMERIC(19,4) DEFAULT 0.0,
        payment_method VARCHAR(50),
        incoterm VARCHAR(20),
        destination_type VARCHAR(30) DEFAULT 'port',
        needs_factory_inspection BOOLEAN DEFAULT TRUE,
        needs_statutory_inspection BOOLEAN DEFAULT FALSE,
        shipping_conditions_met BOOLEAN DEFAULT FALSE,
        outstanding_receivable_usd NUMERIC(19,4) DEFAULT 0.0,
        outstanding_receivable_cny NUMERIC(19,4) DEFAULT 0.0,
        tail_payment_date DATE,
        delivery_notice_date DATE,
        godad_billing_date DATE,
        stage VARCHAR(50) DEFAULT 'pre_shipment',
        remarks TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS export_flow_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL,
        code VARCHAR(80) NOT NULL,
        title VARCHAR(255) NOT NULL,
        owner_role VARCHAR(80),
        assignee_name VARCHAR(120),
        status VARCHAR(20) DEFAULT 'pending',
        planned_date DATE,
        completed_at TIMESTAMPTZ,
        requires_attachment BOOLEAN DEFAULT FALSE,
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_tasks_order_id ON export_flow_tasks(order_id)",
    """CREATE TABLE IF NOT EXISTS export_flow_docs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL,
        task_id UUID,
        doc_type VARCHAR(80) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(1000) NOT NULL,
        source VARCHAR(30) DEFAULT 'other',
        uploaded_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_docs_order_id ON export_flow_docs(order_id)",
    """CREATE TABLE IF NOT EXISTS export_flow_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        required_approver VARCHAR(120),
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        requested_by UUID,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        decided_by UUID,
        decided_at TIMESTAMPTZ,
        decision_notes TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_approvals_order_id ON export_flow_approvals(order_id)",
    """CREATE TABLE IF NOT EXISTS export_flow_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL,
        task_id UUID,
        task_code VARCHAR(80) NOT NULL,
        resource_type VARCHAR(80) NOT NULL,
        resource_id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_links_order_id ON export_flow_links(order_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_export_flow_links_order_task_resource ON export_flow_links(order_id, task_code, resource_type)",

    # ── Lead Files ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS lead_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(1000) NOT NULL,
        file_type VARCHAR(50),
        file_size BIGINT DEFAULT 0,
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        tags JSONB DEFAULT '[]',
        uploaded_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_lead_files_lead ON lead_files(lead_id)",
    "CREATE INDEX IF NOT EXISTS idx_lead_files_category ON lead_files(category)",

    """CREATE TABLE IF NOT EXISTS lead_file_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES lead_files(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        can_view BOOLEAN DEFAULT TRUE,
        can_download BOOLEAN DEFAULT FALSE,
        granted_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE(file_id, user_id)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_lead_file_perms_file ON lead_file_permissions(file_id)",
    "CREATE INDEX IF NOT EXISTS idx_lead_file_perms_user ON lead_file_permissions(user_id)",

    # ── WhatsApp tables ──────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS whatsapp_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL,
        owner_employee_id UUID,
        wa_jid VARCHAR(50),
        phone_number VARCHAR(50),
        display_name VARCHAR(255),
        profile_pic_url VARCHAR(1000),
        label VARCHAR(100),
        status VARCHAR(30) DEFAULT 'disconnected',
        session_data TEXT,
        last_seen_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_accounts_owner ON whatsapp_accounts(owner_user_id)",

    """CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_account_id UUID NOT NULL,
        wa_jid VARCHAR(50) NOT NULL,
        phone_number VARCHAR(50),
        display_name VARCHAR(255),
        push_name VARCHAR(255),
        profile_pic_url VARCHAR(1000),
        lead_id UUID,
        contact_id UUID,
        is_group BOOLEAN DEFAULT FALSE,
        last_message_at TIMESTAMPTZ,
        unread_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE(wa_account_id, wa_jid)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_account ON whatsapp_contacts(wa_account_id)",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_lead ON whatsapp_contacts(lead_id)",

    """CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_account_id UUID NOT NULL,
        wa_contact_id UUID NOT NULL,
        wa_message_id VARCHAR(120),
        direction VARCHAR(10) NOT NULL,
        message_type VARCHAR(30) DEFAULT 'text',
        content TEXT,
        media_url VARCHAR(1000),
        media_mime_type VARCHAR(100),
        status VARCHAR(20) DEFAULT 'sent',
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_contact ON whatsapp_messages(wa_contact_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_account ON whatsapp_messages(wa_account_id, timestamp DESC)",

    # ── Customer acquisition requests ────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS customer_acquisition_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_lead_id UUID NOT NULL,
        requested_by UUID NOT NULL,
        current_owner_id UUID NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        decided_by UUID,
        decided_at TIMESTAMPTZ,
        decision_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_acq_req_status ON customer_acquisition_requests(status)",
    "CREATE INDEX IF NOT EXISTS idx_acq_req_owner ON customer_acquisition_requests(current_owner_id)",
]


TENANT_MIGRATION_DDL = [
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private'",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS cover_emoji VARCHAR(10)",
    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE",
    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_category VARCHAR(100)",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50)",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50) DEFAULT 'pending'",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_template_slug VARCHAR(255) DEFAULT 'default'",
    "UPDATE leads SET workflow_template_slug = 'default' WHERE workflow_template_slug IS NULL",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50)",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wechat VARCHAR(100)",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS feishu VARCHAR(100)",
    "CREATE TABLE IF NOT EXISTS inquiries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contact_id UUID NOT NULL, subject VARCHAR(500), items JSONB DEFAULT '[]', status VARCHAR(50) DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS quotations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contact_id UUID NOT NULL, quote_number VARCHAR(50) UNIQUE NOT NULL, items JSONB DEFAULT '[]', currency VARCHAR(3) DEFAULT 'USD', total_amount FLOAT DEFAULT 0.0, status VARCHAR(50) DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS shipments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deal_id UUID, vessel_name VARCHAR(255), container_number VARCHAR(100), etd DATE, eta DATE, status VARCHAR(50) DEFAULT 'booking', created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS integration_app_directory (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_key VARCHAR(120) UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, source VARCHAR(30) DEFAULT 'curated', category VARCHAR(80), description TEXT, capabilities JSONB DEFAULT '[]', docs_url VARCHAR(1000), is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS integration_feature_flags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), feature_key VARCHAR(120) UNIQUE NOT NULL, feature_name VARCHAR(255) NOT NULL, enabled BOOLEAN DEFAULT TRUE, admin_only BOOLEAN DEFAULT FALSE, settings JSONB DEFAULT '{}', updated_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS integration_link_templates (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, description TEXT, source_module VARCHAR(80) NOT NULL, source_event VARCHAR(120) NOT NULL, target_app_key VARCHAR(120) NOT NULL, target_action VARCHAR(120) NOT NULL, mapping_config JSONB DEFAULT '{}', ai_enabled BOOLEAN DEFAULT FALSE, ai_instruction TEXT, automation_mode VARCHAR(30) DEFAULT 'manual', n8n_webhook_url VARCHAR(1000), is_active BOOLEAN DEFAULT TRUE, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS integration_link_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), template_id UUID NOT NULL, trigger_source VARCHAR(120), input_payload JSONB DEFAULT '{}', transformed_payload JSONB DEFAULT '{}', ai_output JSONB DEFAULT '{}', target_status VARCHAR(30) DEFAULT 'pending', target_response TEXT, started_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ)",
    "CREATE INDEX IF NOT EXISTS idx_integration_link_templates_source ON integration_link_templates(source_module, source_event)",
    "CREATE INDEX IF NOT EXISTS idx_integration_link_runs_template_id ON integration_link_runs(template_id)",
    "CREATE TABLE IF NOT EXISTS crm_accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, owner_id UUID, industry VARCHAR(100), country VARCHAR(100), credit_level VARCHAR(50) DEFAULT 'normal', status VARCHAR(30) DEFAULT 'active', notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS crm_contracts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_no VARCHAR(120) UNIQUE NOT NULL, account_id UUID, lead_id UUID, order_id UUID, contract_amount FLOAT DEFAULT 0.0, currency VARCHAR(10) DEFAULT 'USD', payment_method VARCHAR(50), incoterm VARCHAR(20), sign_date DATE, eta DATE, status VARCHAR(50) DEFAULT 'draft', risk_level VARCHAR(20) DEFAULT 'normal', sales_owner_id UUID, remarks TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS crm_receivables (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_id UUID NOT NULL, due_date DATE, amount FLOAT DEFAULT 0.0, currency VARCHAR(10) DEFAULT 'USD', received_amount FLOAT DEFAULT 0.0, status VARCHAR(30) DEFAULT 'open', payment_proof_url VARCHAR(1000), notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE INDEX IF NOT EXISTS idx_crm_contracts_order_id ON crm_contracts(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_crm_receivables_contract_id ON crm_receivables(contract_id)",
    "CREATE TABLE IF NOT EXISTS export_flow_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_no VARCHAR(120) UNIQUE NOT NULL, customer_name VARCHAR(255), sale_amount_usd FLOAT DEFAULT 0.0, sale_amount_cny FLOAT DEFAULT 0.0, payment_method VARCHAR(50), incoterm VARCHAR(20), destination_type VARCHAR(30) DEFAULT 'port', needs_factory_inspection BOOLEAN DEFAULT TRUE, needs_statutory_inspection BOOLEAN DEFAULT FALSE, shipping_conditions_met BOOLEAN DEFAULT FALSE, outstanding_receivable_usd FLOAT DEFAULT 0.0, outstanding_receivable_cny FLOAT DEFAULT 0.0, stage VARCHAR(50) DEFAULT 'pre_shipment', remarks TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS export_flow_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL, code VARCHAR(80) NOT NULL, title VARCHAR(255) NOT NULL, owner_role VARCHAR(80), assignee_name VARCHAR(120), status VARCHAR(20) DEFAULT 'pending', planned_date DATE, completed_at TIMESTAMPTZ, requires_attachment BOOLEAN DEFAULT FALSE, notes TEXT, metadata JSONB DEFAULT '{}', created_by UUID, updated_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS export_flow_docs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL, task_id UUID, doc_type VARCHAR(80) NOT NULL, file_name VARCHAR(255) NOT NULL, file_url VARCHAR(1000) NOT NULL, source VARCHAR(30) DEFAULT 'other', uploaded_by UUID, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS export_flow_approvals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL, action VARCHAR(50) NOT NULL, required_approver VARCHAR(120), reason TEXT, status VARCHAR(20) DEFAULT 'pending', requested_by UUID, requested_at TIMESTAMPTZ DEFAULT NOW(), decided_by UUID, decided_at TIMESTAMPTZ, decision_notes TEXT)",
    "CREATE TABLE IF NOT EXISTS export_flow_links (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL, task_id UUID, task_code VARCHAR(80) NOT NULL, resource_type VARCHAR(80) NOT NULL, resource_id UUID NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_tasks_order_id ON export_flow_tasks(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_docs_order_id ON export_flow_docs(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_approvals_order_id ON export_flow_approvals(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_export_flow_links_order_id ON export_flow_links(order_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_export_flow_links_order_task_resource ON export_flow_links(order_id, task_code, resource_type)",
    "ALTER TABLE export_flow_orders ADD COLUMN IF NOT EXISTS tail_payment_date DATE",
    "ALTER TABLE export_flow_orders ADD COLUMN IF NOT EXISTS delivery_notice_date DATE",
    "ALTER TABLE export_flow_orders ADD COLUMN IF NOT EXISTS godad_billing_date DATE",
    "CREATE TABLE IF NOT EXISTS user_ai_profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL UNIQUE, style_preference VARCHAR(100) DEFAULT 'professional', custom_instructions TEXT, common_tasks JSONB DEFAULT '[]', learned_context JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE TABLE IF NOT EXISTS integration_oauth_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, platform VARCHAR(50) NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ, UNIQUE (user_id, platform))",
    # ── RBAC: positions (职务) ──────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS positions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL, description TEXT, is_builtin BOOLEAN DEFAULT FALSE, sort_order INT DEFAULT 99, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_name ON positions(name)",
    # ── RBAC: app-level permissions per position / department / user ───────────
    "CREATE TABLE IF NOT EXISTS app_permissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app VARCHAR(50) NOT NULL, target_type VARCHAR(20) NOT NULL, target_id UUID NOT NULL, permission VARCHAR(20) NOT NULL DEFAULT 'view', updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(app, target_type, target_id))",
    # ── users: is_admin flag, position_id link ────────────────────────────────
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
    "ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_id UUID",
    # Seed built-in positions (ignore duplicate errors)
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('总经理','公司最高管理者', TRUE, 1) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('业务经理','管理业务团队', TRUE, 2) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('业务主管','带领业务小组', TRUE, 3) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('业务员','负责客户开发与跟进', TRUE, 4) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('单证员','负责单据与报关', TRUE, 5) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('出纳员','负责资金收付', TRUE, 6) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('财务','财务核算与报表', TRUE, 7) ON CONFLICT (name) DO NOTHING",
    # ── 站内信 ────────────────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, title VARCHAR(255) NOT NULL, body TEXT, type VARCHAR(50) DEFAULT 'system', is_read BOOLEAN DEFAULT FALSE, link VARCHAR(500), sender_id UUID, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)",
    """CREATE TABLE IF NOT EXISTS user_email_smtp (
        user_id UUID PRIMARY KEY,
        email_enabled BOOLEAN DEFAULT FALSE,
        smtp_host VARCHAR(255),
        smtp_port INTEGER DEFAULT 587,
        smtp_username VARCHAR(255),
        smtp_password TEXT,
        smtp_from_email VARCHAR(255),
        smtp_from_name VARCHAR(255) DEFAULT 'Nexus ERP',
        smtp_use_tls BOOLEAN DEFAULT TRUE,
        smtp_use_ssl BOOLEAN DEFAULT FALSE,
        smtp_timeout_seconds INTEGER DEFAULT 20,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )""",
    """CREATE TABLE IF NOT EXISTS user_email_smtp (
        user_id UUID PRIMARY KEY,
        email_enabled BOOLEAN DEFAULT FALSE,
        smtp_host VARCHAR(255),
        smtp_port INTEGER DEFAULT 587,
        smtp_username VARCHAR(255),
        smtp_password TEXT,
        smtp_from_email VARCHAR(255),
        smtp_from_name VARCHAR(255) DEFAULT 'Nexus ERP',
        smtp_use_tls BOOLEAN DEFAULT TRUE,
        smtp_use_ssl BOOLEAN DEFAULT FALSE,
        smtp_timeout_seconds INTEGER DEFAULT 20,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )""",
    "CREATE TABLE IF NOT EXISTS user_notification_prefs (user_id UUID PRIMARY KEY, email_mentions BOOLEAN DEFAULT TRUE, email_updates BOOLEAN DEFAULT FALSE, email_weekly BOOLEAN DEFAULT TRUE, push_mentions BOOLEAN DEFAULT TRUE, push_comments BOOLEAN DEFAULT FALSE, browser_alerts BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS notification_email_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), notification_id UUID, user_id UUID NOT NULL, email VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, status VARCHAR(30) NOT NULL, error TEXT, sent_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_notification_email_logs_user ON notification_email_logs(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_notification_email_logs_sent_at ON notification_email_logs(sent_at)",
    """CREATE TABLE IF NOT EXISTS workflow_action_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL,
        action_key VARCHAR(120) NOT NULL,
        step_key VARCHAR(120),
        payload JSONB DEFAULT '{}',
        result JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )""",
    # Direct Messages
    "CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), from_user_id UUID NOT NULL, to_user_id UUID NOT NULL, content TEXT NOT NULL, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user_id, is_read)",
    "CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_user_id, to_user_id, created_at)",
    # Supply chain: suppliers + supplier_quotations
    "CREATE TABLE IF NOT EXISTS suppliers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, rating VARCHAR(50), company_info TEXT, contact_person VARCHAR(100), contact_info VARCHAR(255), supplier_type VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)",
    "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(100)",
    "CREATE TABLE IF NOT EXISTS supplier_quotations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id UUID NOT NULL, product_name VARCHAR(255) NOT NULL, material VARCHAR(255), spec VARCHAR(500), quantity FLOAT, unit_price FLOAT, delivery_period VARCHAR(100), payment_method VARCHAR(100), special_requirements TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_supplier_quotations_supplier_id ON supplier_quotations(supplier_id)",
    # Cold lead fields
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_cold BOOLEAN DEFAULT FALSE",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS cold_lead_reason TEXT",
    # Workflow data for 诺钢 business process
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS workflow_data JSONB DEFAULT '{}'",
    # Extra positions
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('采购员','负责向供应商询价采购', TRUE, 8) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('采购经理','管理采购团队', TRUE, 9) ON CONFLICT (name) DO NOTHING",
    "INSERT INTO positions (name, description, is_builtin, sort_order) VALUES ('风控经理','负责风险控制与监督', TRUE, 10) ON CONFLICT (name) DO NOTHING",
    # purchase_orders extended columns
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS product_name VARCHAR(255)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS specs VARCHAR(500)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quantity VARCHAR(100)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS unit_price FLOAT DEFAULT 0.0",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_file_url VARCHAR(1000)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_file_name VARCHAR(255)",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS lead_id UUID",
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_company_id)",
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_lead ON purchase_orders(lead_id)",
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)",
    # ── FLOAT → NUMERIC(19,4) migration for monetary fields ─────────────────
    "ALTER TABLE crm_contracts ALTER COLUMN contract_amount TYPE NUMERIC(19,4)",
    "ALTER TABLE crm_receivables ALTER COLUMN amount TYPE NUMERIC(19,4)",
    "ALTER TABLE crm_receivables ALTER COLUMN received_amount TYPE NUMERIC(19,4)",
    "ALTER TABLE deals ALTER COLUMN value TYPE NUMERIC(19,4)",
    "ALTER TABLE invoices ALTER COLUMN subtotal TYPE NUMERIC(19,4)",
    "ALTER TABLE invoices ALTER COLUMN tax_rate TYPE NUMERIC(19,4)",
    "ALTER TABLE invoices ALTER COLUMN tax_amount TYPE NUMERIC(19,4)",
    "ALTER TABLE invoices ALTER COLUMN total TYPE NUMERIC(19,4)",
    "ALTER TABLE invoice_line_items ALTER COLUMN quantity TYPE NUMERIC(19,4)",
    "ALTER TABLE invoice_line_items ALTER COLUMN unit_price TYPE NUMERIC(19,4)",
    "ALTER TABLE invoice_line_items ALTER COLUMN amount TYPE NUMERIC(19,4)",
    "ALTER TABLE invoice_line_items ALTER COLUMN tax_rate TYPE NUMERIC(19,4)",
    "ALTER TABLE products ALTER COLUMN cost_price TYPE NUMERIC(19,4)",
    "ALTER TABLE products ALTER COLUMN sell_price TYPE NUMERIC(19,4)",
    "ALTER TABLE purchase_orders ALTER COLUMN total TYPE NUMERIC(19,4)",
    "ALTER TABLE purchase_orders ALTER COLUMN unit_price TYPE NUMERIC(19,4)",
    "ALTER TABLE payroll_runs ALTER COLUMN total_gross TYPE NUMERIC(19,4)",
    "ALTER TABLE payroll_runs ALTER COLUMN total_net TYPE NUMERIC(19,4)",
    "ALTER TABLE quotations ALTER COLUMN total_amount TYPE NUMERIC(19,4)",
    "ALTER TABLE export_flow_orders ALTER COLUMN sale_amount_usd TYPE NUMERIC(19,4)",
    "ALTER TABLE export_flow_orders ALTER COLUMN sale_amount_cny TYPE NUMERIC(19,4)",
    "ALTER TABLE export_flow_orders ALTER COLUMN outstanding_receivable_usd TYPE NUMERIC(19,4)",
    "ALTER TABLE export_flow_orders ALTER COLUMN outstanding_receivable_cny TYPE NUMERIC(19,4)",
    "ALTER TABLE supplier_quotations ALTER COLUMN quantity TYPE NUMERIC(19,4)",
    "ALTER TABLE supplier_quotations ALTER COLUMN unit_price TYPE NUMERIC(19,4)",
    "ALTER TABLE stock_movements ALTER COLUMN quantity TYPE NUMERIC(19,4)",
    "ALTER TABLE leave_requests ALTER COLUMN days TYPE NUMERIC(7,2)",
    "ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT",
    "ALTER TABLE employees ALTER COLUMN salary TYPE NUMERIC(19,4)",
    # ── Orphan cleanup before enforcing FK constraints ───────────────────────
    "DELETE FROM crm_receivable_payments p WHERE NOT EXISTS (SELECT 1 FROM crm_receivables r WHERE r.id = p.receivable_id)",
    "DELETE FROM crm_payable_payments p WHERE NOT EXISTS (SELECT 1 FROM crm_payables y WHERE y.id = p.payable_id)",
    "DELETE FROM crm_receivables r WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = r.contract_id)",
    "DELETE FROM crm_payables p WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = p.contract_id)",
    # ── Foreign key constraints (DO NOTHING friendly) ───────────────────────
    "DO $$ BEGIN ALTER TABLE contacts ADD CONSTRAINT fk_contacts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE deals ADD CONSTRAINT fk_deals_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE deals ADD CONSTRAINT fk_deals_pipeline FOREIGN KEY (pipeline_id) REFERENCES pipelines(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE invoice_line_items ADD CONSTRAINT fk_line_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE employees ADD CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE employees ADD CONSTRAINT fk_employees_manager FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_receivables ADD CONSTRAINT fk_receivables_contract FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE export_flow_tasks ADD CONSTRAINT fk_flow_tasks_order FOREIGN KEY (order_id) REFERENCES export_flow_orders(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE supplier_quotations ADD CONSTRAINT fk_sq_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    # ── Missing indexes ─────────────────────────────────────────────────────
    "CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id)",
    "CREATE INDEX IF NOT EXISTS idx_deals_pipeline_id ON deals(pipeline_id)",
    "CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id)",
    "CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id)",
    "CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id)",
    # ── Workspace ordering ──────────────────────────────────────────────────
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS position FLOAT DEFAULT 0.0",
    # ── AI Automations ──────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS workspace_automations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '新规则',
        description TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        trigger_type VARCHAR(50) NOT NULL DEFAULT 'mention',
        trigger_config JSONB DEFAULT '{}',
        action_type VARCHAR(50) NOT NULL DEFAULT 'summarize',
        action_config JSONB DEFAULT '{}',
        last_run_at TIMESTAMPTZ,
        last_result TEXT,
        run_count INTEGER DEFAULT 0,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_ws_automations_workspace ON workspace_automations(workspace_id)",
    # ── Hand-drawn icon migration: widen icon columns from VARCHAR(10) to VARCHAR(50) ──
    "ALTER TABLE workspaces ALTER COLUMN icon TYPE VARCHAR(50)",
    "ALTER TABLE pages ALTER COLUMN icon TYPE VARCHAR(50)",
    "ALTER TABLE pages ALTER COLUMN cover_emoji TYPE VARCHAR(50)",
    # ── Page comments ────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS page_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID NOT NULL,
        block_id VARCHAR(100),
        selected_text TEXT NOT NULL,
        comment_text TEXT NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_page_comments_page_id ON page_comments(page_id)",
    # ── Invoice payments ─────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS invoice_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL,
        amount NUMERIC(19,4) NOT NULL,
        payment_date DATE DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50),
        reference_no VARCHAR(120),
        payment_proof_url VARCHAR(1000),
        payment_proof_name VARCHAR(500),
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id)",
    "DO $$ BEGIN ALTER TABLE invoice_payments ADD CONSTRAINT fk_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    # ── Expense reports ──────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS expense_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_number VARCHAR(50) UNIQUE,
        employee_id UUID,
        employee_name VARCHAR(255),
        submit_date DATE,
        total_amount NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        category VARCHAR(50),
        status VARCHAR(30) DEFAULT 'draft',
        approved_by UUID,
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        paid_date DATE,
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    # ── Expense items ────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS expense_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id UUID NOT NULL,
        expense_date DATE,
        category VARCHAR(50),
        description VARCHAR(500),
        amount NUMERIC(19,4) DEFAULT 0.0,
        currency VARCHAR(3) DEFAULT 'USD',
        receipt_url VARCHAR(1000),
        receipt_name VARCHAR(500),
        account_id UUID
    )""",
    "CREATE INDEX IF NOT EXISTS idx_expense_items_report_id ON expense_items(report_id)",
    "DO $$ BEGIN ALTER TABLE expense_items ADD CONSTRAINT fk_expense_items_report FOREIGN KEY (report_id) REFERENCES expense_reports(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    # ── Invoice columns for payment tracking ─────────────────────────────────
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(19,4) DEFAULT 0.0",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)",
    # ── crm_payables + crm_payable_payments (symmetric to receivables) ──
    "CREATE TABLE IF NOT EXISTS crm_payables (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_id UUID NOT NULL, due_date DATE, amount NUMERIC(19,4) DEFAULT 0.0, currency VARCHAR(10) DEFAULT 'USD', paid_amount NUMERIC(19,4) DEFAULT 0.0, status VARCHAR(30) DEFAULT 'unpaid', payment_proof_url VARCHAR(1000), notes TEXT, invoice_no VARCHAR(120), supplier_name VARCHAR(255), assigned_to UUID, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
    "CREATE INDEX IF NOT EXISTS idx_crm_payables_contract_id ON crm_payables(contract_id)",
    "CREATE TABLE IF NOT EXISTS crm_payable_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payable_id UUID NOT NULL, amount NUMERIC(19,4) NOT NULL, payment_date DATE DEFAULT CURRENT_DATE, payment_method VARCHAR(50), reference_no VARCHAR(120), payment_proof_url VARCHAR(1000), payment_proof_name VARCHAR(500), notes TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS idx_crm_payable_payments_pid ON crm_payable_payments(payable_id)",
    "DO $$ BEGIN ALTER TABLE crm_payables ADD CONSTRAINT fk_payables_contract FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_receivable_payments ADD CONSTRAINT fk_receivable_payments_receivable FOREIGN KEY (receivable_id) REFERENCES crm_receivables(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN ALTER TABLE crm_payable_payments ADD CONSTRAINT fk_payable_payments_payable FOREIGN KEY (payable_id) REFERENCES crm_payables(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    # ── Performance indexes ────────────────────────────────────────────────
    "CREATE INDEX IF NOT EXISTS idx_invoices_type_status ON invoices(type, status)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date)",
    "CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date)",
    "CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status)",
    "CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_id ON journal_entry_lines(entry_id)",
    "CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status)",
    "CREATE INDEX IF NOT EXISTS idx_crm_accounts_status ON crm_accounts(status)",
    # ── Lead Files ──────────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS lead_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(1000) NOT NULL,
        file_type VARCHAR(50),
        file_size BIGINT DEFAULT 0,
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        tags JSONB DEFAULT '[]',
        uploaded_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_lead_files_lead ON lead_files(lead_id)",
    "CREATE INDEX IF NOT EXISTS idx_lead_files_category ON lead_files(category)",
    """CREATE TABLE IF NOT EXISTS lead_file_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES lead_files(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        can_view BOOLEAN DEFAULT TRUE,
        can_download BOOLEAN DEFAULT FALSE,
        granted_by UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE(file_id, user_id)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_lead_file_perms_file ON lead_file_permissions(file_id)",
    "CREATE INDEX IF NOT EXISTS idx_lead_file_perms_user ON lead_file_permissions(user_id)",
    # ── Cross-module integration: PO→inventory, contract→inventory, GL posting ──
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS product_id UUID",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quantity_numeric NUMERIC(19,4) DEFAULT 0",
    """CREATE TABLE IF NOT EXISTS contract_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
        product_id UUID,
        product_name VARCHAR(255),
        quantity NUMERIC(19,4) DEFAULT 0,
        unit_price NUMERIC(19,4) DEFAULT 0,
        amount NUMERIC(19,4) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_contract_line_items_contract ON contract_line_items(contract_id)",
    "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS total_debit NUMERIC(19,4) DEFAULT 0.0",
    "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS total_credit NUMERIC(19,4) DEFAULT 0.0",
    "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50)",
    "ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference_id UUID",
    "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS category VARCHAR(50)",
    "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS type VARCHAR(50)",

    # ── WhatsApp tables (migration for existing tenants) ─────────────────
    """CREATE TABLE IF NOT EXISTS whatsapp_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL,
        owner_employee_id UUID,
        wa_jid VARCHAR(50),
        phone_number VARCHAR(50),
        display_name VARCHAR(255),
        profile_pic_url VARCHAR(1000),
        label VARCHAR(100),
        status VARCHAR(30) DEFAULT 'disconnected',
        session_data TEXT,
        last_seen_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_accounts_owner ON whatsapp_accounts(owner_user_id)",
    """CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_account_id UUID NOT NULL,
        wa_jid VARCHAR(50) NOT NULL,
        phone_number VARCHAR(50),
        display_name VARCHAR(255),
        push_name VARCHAR(255),
        profile_pic_url VARCHAR(1000),
        lead_id UUID,
        contact_id UUID,
        is_group BOOLEAN DEFAULT FALSE,
        last_message_at TIMESTAMPTZ,
        unread_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE(wa_account_id, wa_jid)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_account ON whatsapp_contacts(wa_account_id)",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_lead ON whatsapp_contacts(lead_id)",
    """CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_account_id UUID NOT NULL,
        wa_contact_id UUID NOT NULL,
        wa_message_id VARCHAR(120),
        direction VARCHAR(10) NOT NULL,
        message_type VARCHAR(30) DEFAULT 'text',
        content TEXT,
        media_url VARCHAR(1000),
        media_mime_type VARCHAR(100),
        status VARCHAR(20) DEFAULT 'sent',
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_contact ON whatsapp_messages(wa_contact_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_account ON whatsapp_messages(wa_account_id, timestamp DESC)",

    # ── Phase 2: Message operations ──────────────────────────────────────
    "ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID",
    "ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE",
    "ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE",
    "ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_message_id ON whatsapp_messages(wa_message_id)",

    # Reactions table
    """CREATE TABLE IF NOT EXISTS whatsapp_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_message_id UUID NOT NULL,
        reactor_jid VARCHAR(50) NOT NULL,
        emoji VARCHAR(20),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(wa_message_id, reactor_jid)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_wa_reactions_message ON whatsapp_reactions(wa_message_id)",

    # Polls tables
    """CREATE TABLE IF NOT EXISTS whatsapp_polls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_message_id UUID NOT NULL UNIQUE,
        question TEXT NOT NULL,
        options JSONB NOT NULL DEFAULT '[]',
        allow_multiple BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS whatsapp_poll_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        poll_id UUID NOT NULL,
        voter_jid VARCHAR(50) NOT NULL,
        selected_options JSONB NOT NULL DEFAULT '[]',
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(poll_id, voter_jid)
    )""",

    # ── Phase 3: Groups / Labels / History sync ──────────────────────────
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS group_metadata JSONB DEFAULT '{}'",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS disappearing_duration INTEGER DEFAULT 0",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS wa_labels JSONB DEFAULT '[]'",
    """CREATE TABLE IF NOT EXISTS whatsapp_labels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_account_id UUID NOT NULL,
        wa_label_id VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        color VARCHAR(20),
        UNIQUE(wa_account_id, wa_label_id)
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_unique_wa_id ON whatsapp_messages(wa_account_id, wa_message_id) WHERE wa_message_id IS NOT NULL",

    # ── Phase 4: CRM linkage & attribution ───────────────────────────────
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS account_id UUID",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_account_id ON whatsapp_contacts(account_id)",
    "ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS created_by UUID",

    # ── Phase 5: Customer acquisition requests ───────────────────────────
    """CREATE TABLE IF NOT EXISTS customer_acquisition_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_lead_id UUID NOT NULL,
        requested_by UUID NOT NULL,
        current_owner_id UUID NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        decided_by UUID,
        decided_at TIMESTAMPTZ,
        decision_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_acq_req_status ON customer_acquisition_requests(status)",
    "CREATE INDEX IF NOT EXISTS idx_acq_req_owner ON customer_acquisition_requests(current_owner_id)",
    # ── Phase 6: Bind WhatsApp info to users ─────────────────────────────
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_jid VARCHAR(50)",

    # ── Phase 7: WhatsApp Evolution API enhancements ─────────────────────
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE",

    """CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        media_url VARCHAR(1000),
        media_type VARCHAR(30),
        variables JSONB DEFAULT '[]',
        shortcut VARCHAR(50),
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )""",

    """CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        template_id UUID,
        message_content TEXT,
        media_url VARCHAR(1000),
        target_contacts JSONB DEFAULT '[]',
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status VARCHAR(30) DEFAULT 'draft',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
    )""",

    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE INDEX IF NOT EXISTS idx_wa_messages_content_trgm ON whatsapp_messages USING gin (content gin_trgm_ops)",

    # ── Phase 8: WhatsApp Evolution API Phase 4+5 ──────────────────────────
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS business_profile JSONB DEFAULT '{}'",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS has_catalog BOOLEAN DEFAULT FALSE",

    # ── Phase 9: WhatsApp pin/mute ───────────────────────────────────────
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE",

    # ── Phase 10: JID phone index for merge queries ──────────────────────
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_jid_phone ON whatsapp_contacts(SPLIT_PART(wa_jid, '@', 1))",

    # ── Phase 11: Emails table for full email send/receive ─────────────
    """CREATE TABLE IF NOT EXISTS emails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        direction VARCHAR(10) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(255),
        to_email VARCHAR(255) NOT NULL,
        to_name VARCHAR(255),
        cc TEXT,
        bcc TEXT,
        subject VARCHAR(500),
        body_text TEXT,
        body_html TEXT,
        attachments_json JSONB DEFAULT '[]',
        status VARCHAR(30) DEFAULT 'sent',
        error_message TEXT,
        message_id_header VARCHAR(500),
        in_reply_to VARCHAR(500),
        references_header TEXT,
        thread_id UUID,
        lead_id UUID,
        account_id UUID,
        sender_user_id UUID,
        is_read BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        smtp_config_source VARCHAR(30),
        webhook_provider VARCHAR(30),
        raw_headers JSONB DEFAULT '{}',
        received_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_emails_lead ON emails(lead_id)",
    "CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_email)",
    "CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email)",
    "CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id_header)",
    # Prevent duplicate inbound emails from webhook retries
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_unique_msg_id ON emails(message_id_header) WHERE message_id_header IS NOT NULL AND message_id_header != ''",

    # Add lead_id to messages table for customer linking
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS lead_id UUID",
    # Index for internal message queries
    "CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_user_id, to_user_id, created_at DESC)",

    # ── Phase 12: WhatsApp contact management (assigned_to + soft delete) ──
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS assigned_to UUID",
    "CREATE INDEX IF NOT EXISTS idx_wa_contacts_assigned ON whatsapp_contacts(assigned_to)",
    "ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE",
]


_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,98}[a-z0-9]$")
_RESERVED_SLUGS = {"public", "platform", "pg_catalog", "information_schema", "pg_toast"}


def _safe_schema_name(slug: str) -> str:
    if not slug or not _SLUG_RE.match(slug) or slug in _RESERVED_SLUGS:
        raise ValueError(f"Invalid tenant slug: {slug}")
    return f"tenant_{slug}"


def _quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


async def migrate_tenant_schema(slug: str, db: AsyncSession) -> None:
    schema_name = _safe_schema_name(slug)
    quoted = _quote_ident(schema_name)
    set_path = text(f"SET search_path TO {quoted}, public")
    await db.execute(set_path)
    for stmt in TENANT_MIGRATION_DDL:
        try:
            await db.execute(text(stmt))
            await db.commit()  # Commit each statement individually to avoid cascading failures
        except Exception as e:
            await db.rollback()  # Clear error state so next statement can run
            logger.warning("Tenant migration stmt skipped for %s (may be expected): %s", slug, e)
        # Re-set search_path after each commit/rollback in case the connection was recycled
        await db.execute(set_path)


async def provision_tenant_schema(slug: str, db: AsyncSession) -> None:
    schema_name = _safe_schema_name(slug)
    quoted = _quote_ident(schema_name)
    logger.info("Provisioning tenant schema: %s", schema_name)
    await db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {quoted}"))
    await db.execute(text(f"SET search_path TO {quoted}, public"))
    for stmt in TENANT_SCHEMA_DDL:
        await db.execute(text(stmt))
    logger.info("Tenant schema %s provisioned successfully", schema_name)
