# Nexus ERP — API Reference

Base URL: `http://localhost:8000/api`

All tenant API endpoints require:
- `Authorization: Bearer <token>` header
- Token obtained from `POST /api/auth/login` with `tenant_slug`

---

## Authentication

### POST /auth/login
Login for platform admins (no tenant_slug) or tenant users.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "tenant_slug": "demo"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "role": "tenant_admin",
  "tenant_slug": "demo"
}
```

### POST /auth/register-platform-admin
Register the first platform admin (only works if no admin exists).

**Body:** `{ "email", "password", "full_name" }`

### GET /auth/me
Returns the decoded JWT payload (current user info).

---

## Workspace

### POST /workspace/setup
Auto-creates default "Private" and "Team Space" workspaces if none exist.
Call on first login. Idempotent.

**Response:** `{ "status": "created" | "already_setup" }`

### GET /workspace/workspaces
Returns all workspaces where `owner_id = current_user` OR `visibility = 'team'`.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Private",
    "visibility": "private",
    "owner_id": "uuid",
    "icon": "🔒",
    "description": "Your personal notes and drafts"
  }
]
```

### POST /workspace/workspaces
Create a new workspace.

**Body:**
```json
{
  "name": "Engineering",
  "visibility": "team",
  "icon": "🔬",
  "description": "Engineering team notes"
}
```

### PATCH /workspace/workspaces/{id}
Update workspace name, visibility, icon, or description.

### DELETE /workspace/workspaces/{id}
Soft-delete (sets `is_active = FALSE`).

### GET /workspace/workspaces/{id}/pages
List non-archived, non-template pages in a workspace, ordered by position.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Meeting Notes",
    "icon": "📋",
    "cover_emoji": "🌊",
    "updated_at": "2026-02-20T00:00:00Z"
  }
]
```

### POST /workspace/pages
Create a blank page.

**Body:**
```json
{
  "workspace_id": "uuid",
  "title": "Untitled",
  "icon": "📄",
  "content": {}
}
```

### GET /workspace/pages/{id}
Get full page including content (JSONB).

### PATCH /workspace/pages/{id}
Update page fields. Pass only fields to change.

**Body (all optional):**
```json
{
  "title": "New Title",
  "icon": "🚀",
  "cover_emoji": "🌅",
  "content": {},
  "is_archived": false,
  "is_template": false,
  "template_category": "Meeting"
}
```

> To clear a field (e.g. remove cover emoji), pass `"cover_emoji": null`.

### DELETE /workspace/pages/{id}
Archive page (sets `is_archived = TRUE`).

### GET /workspace/templates
Returns built-in templates + user-created templates (pages marked as templates).

**Response:**
```json
[
  {
    "id": "tpl-meeting-notes",
    "title": "Meeting Notes",
    "icon": "📋",
    "category": "Meeting",
    "description": "Record agendas, discussion points and action items",
    "source": "builtin"
  }
]
```

Built-in template IDs:
- `tpl-meeting-notes` — Meeting Notes (Meeting)
- `tpl-project-brief` — Project Brief (Planning)
- `tpl-okr` — OKR Planning (Planning)
- `tpl-weekly-review` — Weekly Review (Personal)
- `tpl-product-spec` — Product Spec (Product)
- `tpl-1on1` — 1:1 Meeting (Meeting)
- `tpl-sprint-planning` — Sprint Planning (Engineering)
- `tpl-bug-report` — Bug Report (Engineering)
- `tpl-quarterly-report` — Quarterly Report (Business)
- `tpl-press-release` — Press Release (Marketing)

### POST /workspace/pages/{id}/save-as-template
Mark an existing page as a template.

**Query param:** `?category=Meeting` (default: `Custom`)

**Response:** `{ "status": "saved" }`

### POST /workspace/templates/{template_id}/use
Create a new page from a template (built-in or user-created).

**Body:**
```json
{
  "workspace_id": "uuid",
  "title": "Q1 Planning Meeting"
}
```

**Response:** `{ "id": "uuid", "title": "...", "workspace_id": "uuid" }`

---

## CRM

### GET /crm/leads
List leads. Supports `?status=new&source=website&search=alice&skip=0&limit=50`.

**Response:** Array of lead objects.

### POST /crm/leads
Create a lead with automatic duplicate detection (pg_trgm + Gemini).

**Body:**
```json
{
  "full_name": "Alice Chen",
  "email": "alice@acme.com",
  "phone": "+1-555-1234",
  "company": "Acme Corp",
  "title": "VP Sales",
  "source": "website",
  "status": "new"
}
```

**Response:** `{ "id": "uuid", "duplicate_check": { "is_duplicate": false, ... } }`

### PATCH /crm/leads/{id}
Update lead fields (full_name, email, phone, company, status, ai_summary).

### DELETE /crm/leads/{id}
Hard delete a lead.

### POST /crm/leads/{id}/convert
Convert lead to contact. Creates a contact record.

**Response:** `{ "contact_id": "uuid", "status": "converted" }`

### GET /crm/contacts
List contacts. Supports `?search=`.

### GET /crm/companies
List companies. Supports `?search=`.

### POST /crm/companies/{id}/research
Trigger AI-powered company research (Gemini generates profile data).

### GET /crm/pipelines
List sales pipelines.

### POST /crm/pipelines
Create pipeline with `{ "name": "...", "stages": [...] }`.

### GET /crm/deals
List deals. Supports `?pipeline_id=`.

### POST /crm/deals
Create deal with `{ "title", "pipeline_id", "stage", "value", "currency" }`.

---

## HR

### GET /hr/employees
List active employees. Supports `?department_id=&search=`.

### POST /hr/employees
Create employee. Auto-generates employee number (EMP0001, EMP0002, ...).

**Body:**
```json
{
  "full_name": "Jane Doe",
  "email": "jane@company.com",
  "department_id": "uuid",
  "title": "Software Engineer",
  "employment_type": "full_time",
  "start_date": "2025-01-15",
  "salary": 80000,
  "currency": "USD"
}
```

> `start_date` must be in ISO format (`YYYY-MM-DD`).

### GET /hr/departments
List all departments.

### POST /hr/departments
Create department with `name` query param.

### GET /hr/leave-requests
List leave requests. Supports `?employee_id=&status=`.

### POST /hr/leave-requests
Create leave request.

**Body:**
```json
{
  "employee_id": "uuid",
  "leave_type": "annual",
  "start_date": "2026-03-01",
  "end_date": "2026-03-05",
  "days": 5,
  "reason": "Vacation"
}
```

### PATCH /hr/leave-requests/{id}/approve
Approve a leave request (sets `status = 'approved'`).

---

## Accounting

### GET /accounting/invoices
List invoices. Supports `?type=receivable&status=draft`.

### POST /accounting/invoices
Create invoice. Invoice number is auto-generated (INV-00001, INV-00002, ...).

**Body:**
```json
{
  "type": "receivable",
  "contact_id": "uuid",
  "issue_date": "2026-02-20",
  "due_date": "2026-03-20",
  "currency": "USD",
  "tax_rate": 10.0,
  "notes": "Payment due in 30 days",
  "line_items": [
    {
      "description": "Consulting services",
      "quantity": 10,
      "unit_price": 150.0,
      "tax_rate": 10.0
    }
  ]
}
```

> `issue_date` and `due_date` must be in ISO format (`YYYY-MM-DD`).

### GET /accounting/invoices/{id}
Get invoice with line items.

### PATCH /accounting/invoices/{id}/status
Update invoice status (draft → sent → paid | cancelled).

**Query param:** `?status=paid`

### GET /accounting/accounts
List chart of accounts.

---

## Inventory

### GET /inventory/products
List products. Supports `?category=&low_stock=true&search=`.

### POST /inventory/products
Create product.

**Body:**
```json
{
  "sku": "SKU-001",
  "name": "Widget Pro",
  "category": "Electronics",
  "unit": "each",
  "cost_price": 10.0,
  "sell_price": 24.99,
  "currency": "USD",
  "current_stock": 100,
  "reorder_point": 20
}
```

### POST /inventory/products/{id}/adjust-stock
Adjust product stock (positive = add, negative = remove).

**Body:**
```json
{
  "quantity": 50,
  "notes": "Received shipment",
  "movement_type": "received"
}
```

### GET /inventory/warehouses
List warehouses.

### GET /inventory/stock-movements
List stock movements. Supports `?limit=100`.

---

## AI

### POST /ai/chat
Stream AI chat response (Server-Sent Events).

**Body:**
```json
{
  "message": "Summarize my CRM leads",
  "history": [],
  "context_module": "crm",
  "context_record_id": null
}
```

**Response:** `text/event-stream` — each chunk: `data: {"content": "..."}`

### GET /ai/conversations
List AI conversation history.

### GET /ai/tools
List configured AI tools.

### POST /ai/tools/{id}/execute
Execute an AI tool (streaming SSE response).

---

## Admin (tenant admin only)

### GET /admin/users
List all users in the tenant.

### POST /admin/users/invite
Invite a new user.

**Body:** `{ "email", "full_name", "role", "password" }`

### GET /admin/audit-logs
List audit logs. Supports `?resource_type=leads`.

### GET /admin/settings
Get tenant settings (name, logo, currency, locale, enabled modules).

### PATCH /admin/settings
Update tenant settings.

---

## Platform (platform admin only)

### GET /platform/tenants
List all tenants.

### POST /platform/tenants
Create a new tenant and provision its database schema.

**Body:** `{ "name", "slug", "primary_color" }`

### DELETE /platform/tenants/{id}
Disable a tenant (`is_active = FALSE`).

### POST /platform/tenants/{slug}/impersonate
Get an admin token for a tenant (for support purposes).

### GET /platform/health
System health check with tenant count.

---

## Error Responses

All errors return JSON:
```json
{ "detail": "Error message here" }
```

Common HTTP codes:
- `400` — Bad request / validation error
- `401` — Not authenticated
- `403` — Forbidden (insufficient role)
- `404` — Resource not found
- `500` — Internal server error
