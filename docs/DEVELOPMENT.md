# Nexus ERP — Development Guide

## Architecture Overview

```
Browser (Next.js 14)
    ↕ REST / SSE
FastAPI (Python)
    ↕ asyncpg
PostgreSQL (per-tenant schemas)
    platform schema → global tables (admins, tenants)
    tenant_{slug}   → isolated tenant data
```

### Multi-tenant Schema Isolation

Every API request:
1. Decodes JWT to get `tenant_slug`
2. `get_current_user_with_tenant` dependency runs `SET search_path TO tenant_{slug}, public`
3. All SQL queries thereafter run in the tenant's schema automatically

New tenant provisioning (`POST /platform/tenants`) calls `provision_tenant_schema(slug, db)` which creates the schema and runs all `TENANT_SCHEMA_DDL` statements.

When the server starts (`init_db()`), it runs `TENANT_MIGRATION_DDL` against all existing tenant schemas to apply schema updates without dropping data.

---

## Coding Conventions

### Backend (FastAPI)

#### Route handlers
- All routes use `Depends(get_current_user_with_tenant)` for authenticated endpoints
- `ctx["db"]` = async SQLAlchemy session
- `ctx["sub"]` = user UUID string from JWT
- `ctx["tenant_slug"]` = tenant slug

#### Date fields
asyncpg requires `datetime.date` objects for `DATE` columns — **never pass strings**:

```python
# WRONG — asyncpg error: 'str' object has no attribute 'toordinal'
{"start_date": "2026-01-15"}

# CORRECT
from datetime import date as date_type

def parse_date(s: str | None) -> date_type | None:
    if not s: return None
    return date_type.fromisoformat(s)

{"start_date": parse_date(body.start_date)}
```

#### JSONB fields
asyncpg cannot auto-encode Python `dict` to JSONB in raw `text()` queries. Use `json.dumps()` + `CAST`:

```python
# WRONG — asyncpg DataError
{"content": {"blocks": []}}

# CORRECT
import json
{"content": json.dumps({"blocks": []})}
# SQL: CAST(:content AS JSONB)
```

#### Nullable parameter queries
asyncpg throws `AmbiguousParameterError` with patterns like `(:email IS NOT NULL AND email = :email)`. Build WHERE clauses dynamically instead:

```python
# WRONG
WHERE (:email IS NOT NULL AND email = :email)

# CORRECT
conditions = []
params = {}
if email:
    conditions.append("email = :email")
    params["email"] = email
```

#### Savepoints for optional queries
When a sub-query might fail but you want to continue, use savepoints to avoid leaving the transaction in an aborted state:

```python
try:
    await db.execute(text("SAVEPOINT my_check"))
    result = await db.execute(risky_query, params)
    await db.execute(text("RELEASE SAVEPOINT my_check"))
except Exception:
    try:
        await db.execute(text("ROLLBACK TO SAVEPOINT my_check"))
    except Exception:
        pass
    return default_value
```

---

### Frontend (Next.js 14)

#### API calls
Use `api.get`, `api.post`, `api.patch`, `api.delete` from `@/lib/api`:

```typescript
import { api } from '@/lib/api';

const leads = await api.get('/api/crm/leads');
const lead = await api.post('/api/crm/leads', { full_name: 'Alice' });
```

All requests automatically include the JWT from `localStorage.nexus_token`.

#### Auth
```typescript
import { login, logout, isAuthenticated, getCurrentUser } from '@/lib/auth';

await login(email, password, tenantSlug); // stores token in localStorage
logout();                                  // clears token + redirect
const user = getCurrentUser();             // reads from localStorage.nexus_user
```

#### Design Tokens (Notion color system)

Use CSS variables — never hardcode colors:

```css
--notion-bg: #FFFFFF          /* page background */
--notion-sidebar: #F7F6F3     /* sidebar/panel background */
--notion-hover: #EFEFEF       /* hover state */
--notion-active: #E9E9E7      /* selected/active state */
--notion-border: #E3E2E0      /* borders */
--notion-text: #37352F        /* primary text */
--notion-text-muted: #787774  /* secondary text */
--notion-accent: #2383E2      /* brand blue */
```

In JSX: `style={{ color: 'var(--notion-text)' }}`
In Tailwind: `bg-notion-sidebar text-notion-text` (mapped in tailwind.config.ts)

#### Reusable UI components

**`NotionTable<T>`** — Notion-style data table with sorting, inline edit, row actions:
```tsx
import NotionTable, { Column } from '@/components/ui/NotionTable';

const COLUMNS: Column<Lead>[] = [
  { key: 'full_name', label: 'Name' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'score', label: 'Score', render: v => `${v}/10` },
];

<NotionTable
  columns={COLUMNS}
  data={leads}
  statusColors={{ new: 'bg-blue-100 text-blue-700' }}
  onRowClick={lead => setSelected(lead)}
  onDelete={id => api.delete(`/api/crm/leads/${id}`)}
  onCreate={() => setShowCreate(true)}
  createLabel="+ New Lead"
/>
```

Column `type` options: `'text'` (default) | `'status'` | `'date'` | `'number'` | `'mono'`

**`SlideOver`** — Right-sliding detail panel:
```tsx
import SlideOver from '@/components/ui/SlideOver';

<SlideOver open={!!selected} onClose={() => setSelected(null)} title="Lead Detail">
  <div className="p-6">{/* content */}</div>
</SlideOver>
```

**`CommandPalette`** — Global ⌘K command palette:
```tsx
<CommandPalette open={open} onClose={() => setOpen(false)} tenant={tenant} />
```
Open via `⌘K` / `Ctrl+K` — handled in `[tenant]/layout.tsx`.

**`TemplateGallery`** — Template picker modal:
```tsx
<TemplateGallery
  open={showGallery}
  onClose={() => setShowGallery(false)}
  onSelect={(templateId, title) => createFromTemplate(templateId, title)}
/>
```

---

## Workspace Feature

### Data Model

```
workspaces
  id, name, visibility ('private'|'team'), owner_id, icon, description

pages
  id, workspace_id, parent_page_id, title, content (JSONB)
  icon, cover_emoji, position
  is_archived, is_template, template_category
  created_by, updated_by
```

### Template System

- **Built-in templates**: Python constants in `workspace.py` (`BUILTIN_TEMPLATES` list)
- **User templates**: Regular pages with `is_template = TRUE`
- Both returned together from `GET /workspace/templates`
- Template categories: Meeting, Planning, Product, Engineering, Business, Marketing, Personal, Custom

### Page Editor

The page editor at `[tenant]/workspace/[pageId]/page.tsx` provides:
- **Cover emoji** — click "Add cover" → emoji picker → `PATCH /workspace/pages/{id}` with `cover_emoji`
- **Page icon** — click "Add icon" or existing icon → emoji picker
- **Save as Template** — opens category picker → `POST /workspace/pages/{id}/save-as-template?category=Meeting`
- **Auto-save** — title saved on blur/Enter; content saved by `BlockEditor`

---

## Sidebar & Navigation

`Sidebar.tsx` provides:
- Workspace header with tenant name
- Search bar (triggers ⌘K command palette)
- Module navigation (Workspace, CRM, HR, Accounting, Inventory)
- Language selector (7 languages, persisted to `localStorage.nexus_ui_lang`)
- User menu with logout

Language codes: `en`, `zh-CN`, `zh-TW`, `ja`, `it`, `es`, `pt`

Language change broadcasts `nexus:lang-change` custom event for components to respond.

---

## Known Patterns & Gotchas

### asyncpg type strictness
asyncpg is stricter than psycopg2 about parameter types:
- `DATE` columns: must pass `datetime.date` objects
- `JSONB` columns: must pass JSON string + `CAST(:x AS JSONB)` in SQL
- Ambiguous `IS NOT NULL` checks: build WHERE clause dynamically

### Transaction state
If any SQL in a transaction fails (even in a caught exception), PostgreSQL marks the transaction as aborted. All subsequent queries fail with `InFailedSQLTransactionError`. Use savepoints for optional queries that might fail.

### Pydantic v2 `model_dump()`
Use `model_dump(exclude_unset=True)` when building update dicts so only explicitly-provided fields are included (including `null` values for clearing fields).

### CORS
Backend allows `http://localhost:3000` and `http://localhost:3001` plus wildcard `*`. Note: `allow_credentials=True` with `*` is technically invalid (browsers may reject it for cross-origin requests). Use explicit origin lists in production.

### Frontend dev server
Always start the frontend from the frontend directory:
```bash
cd frontend && node_modules/.bin/next dev --port 3000
```
Starting from the wrong directory causes `.next` to be written to the wrong location.

---

## Database Schema

### Platform schema (`platform.*`)
```sql
platform.platform_admins  -- Global admin accounts
platform.tenants          -- Tenant registry
```

### Tenant schema (`tenant_{slug}.*`)
```sql
users               -- Tenant user accounts
workspaces          -- Workspace containers
pages               -- Workspace pages (content + templates)
leads               -- CRM leads
contacts            -- CRM contacts
companies           -- CRM companies
pipelines           -- CRM pipelines
deals               -- CRM deals
departments         -- HR departments
employees           -- HR employees
leave_requests      -- HR leave management
payroll_runs        -- HR payroll
chart_of_accounts   -- Accounting COA
invoices            -- Accounting invoices
invoice_line_items  -- Invoice line items
journal_entries     -- Accounting journal
warehouses          -- Inventory warehouses
products            -- Inventory products
purchase_orders     -- Inventory POs
stock_movements     -- Inventory movements
ai_conversations    -- AI chat history
ai_tools            -- AI tool definitions
audit_logs          -- Action audit trail
integration_configs -- Platform webhooks config
```

### Schema evolution
Add new columns to `TENANT_SCHEMA_DDL` (for new tenants) **and** to `TENANT_MIGRATION_DDL` (for existing tenants):

```python
TENANT_MIGRATION_DDL = [
    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS cover_emoji VARCHAR(10)",
    # Add new migrations here
]
```

Migrations run automatically at server startup via `init_db()`.

---

## Deployment Checklist

- [ ] Set strong `SECRET_KEY` in `.env`
- [ ] Set `GEMINI_API_KEY`
- [ ] Configure PostgreSQL credentials
- [ ] Set `NEXT_PUBLIC_API_URL` to your backend URL
- [ ] Update CORS `allow_origins` in `main.py` with production domain
- [ ] Change default admin password after first login
- [ ] Configure n8n workflows for automation
