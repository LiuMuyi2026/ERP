# Nexus ERP

A multi-tenant ERP platform with AI capabilities, built with FastAPI + Next.js 14.

## Overview

Nexus ERP is a full-stack SaaS ERP system providing:
- **CRM** — Leads, contacts, companies, pipelines, deals
- **HR** — Employees, departments, leave requests
- **Accounting** — Invoices, chart of accounts, journal entries
- **Inventory** — Products, warehouses, stock movements
- **Workspace** — Notion-style pages, templates, collaborative notes
- **AI Assistant** — Gemini-powered chat, lead deduplication, company research
- **Automation** — n8n workflow integration, platform webhooks (WeChat, Feishu, DingTalk)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.11+, asyncpg, SQLAlchemy 2.0 async |
| Database | PostgreSQL 16+ (per-tenant schemas) |
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS |
| AI | Google Gemini 2.0 Flash / 1.5 Pro |
| Automation | n8n self-hosted |
| Editor | BlockNote (block-based rich text) |

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16+ running locally (or via Docker)

### 1. Clone & configure

```bash
git clone <repo>
cp .env.example .env
# Edit .env with your credentials
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

### 4. First-time setup

1. Register the first platform admin:
   ```bash
   curl -X POST http://localhost:8000/api/auth/register-platform-admin \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"StrongPass123","full_name":"Platform Admin"}'
   ```
2. Sign in at `http://localhost:3000/login` with Workspace left blank (platform admin login).
3. Go to `/platform` and create a tenant (for example slug `demo`).
4. Sign in again with Workspace set to your tenant slug.

### Test account (demo tenant)
- **Workspace:** `demo`
- **Email:** `1@1.com`
- **Password:** `1`

## Environment Variables

```env
# Auth
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=nexus
POSTGRES_PASSWORD=nexus_secret
POSTGRES_DB=nexus_platform

# AI
GEMINI_API_KEY=your-gemini-api-key

# n8n
N8N_API_URL=http://localhost:5678
N8N_API_KEY=

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Structure

```
nexus-erp/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app + lifespan
│       ├── config.py            # Pydantic settings
│       ├── database.py          # DB init + tenant migrations
│       ├── deps.py              # Auth dependencies
│       ├── routers/             # API route handlers
│       │   ├── auth.py
│       │   ├── crm.py
│       │   ├── hr.py
│       │   ├── accounting.py
│       │   ├── inventory.py
│       │   ├── workspace.py
│       │   ├── ai.py
│       │   ├── admin.py
│       │   ├── platform.py
│       │   └── integrations.py
│       └── services/
│           ├── auth.py          # Password + JWT
│           ├── tenant.py        # Schema DDL + migration
│           └── ai/
│               ├── gemini.py    # Gemini API wrapper
│               ├── deduplication.py
│               ├── lead_extractor.py
│               └── company_research.py
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       │   ├── login/
│       │   ├── platform/
│       │   └── [tenant]/
│       │       ├── layout.tsx   # Sidebar + command palette
│       │       ├── crm/
│       │       ├── hr/
│       │       ├── accounting/
│       │       ├── inventory/
│       │       ├── workspace/
│       │       │   └── [pageId]/
│       │       └── settings/
│       ├── components/
│       │   ├── layout/
│       │   │   └── Sidebar.tsx
│       │   ├── ui/
│       │   │   ├── CommandPalette.tsx
│       │   │   ├── NotionTable.tsx
│       │   │   └── SlideOver.tsx
│       │   ├── workspace/
│       │   │   └── TemplateGallery.tsx
│       │   └── editor/
│       │       └── BlockEditor.tsx
│       └── lib/
│           ├── api.ts           # Fetch wrapper
│           └── auth.ts          # Token utils
├── docs/                        # Documentation
├── docker/                      # Docker files
└── docker-compose.yml
```

## Docker Deployment

```bash
docker compose up -d
```

Services:
- `postgres` — PostgreSQL 16
- `backend` — FastAPI on port 8000
- `frontend` — Next.js on port 3000
- `n8n` — n8n automation on port 5678

## Render Deployment (Recommended)

This repo includes a ready-to-use Render blueprint at `render.yaml`.

### One-time setup

1. Push this repo to GitHub.
2. In Render, choose **New +** → **Blueprint**.
3. Select this repo and deploy `render.yaml`.
4. After the first deploy, open service variables and set:
   - `nexus-backend`:
     - `GEMINI_API_KEY` (required for AI features)
     - `CORS_ORIGINS` (set to your frontend Render domain + optional localhost)
     - `APP_BASE_URL` (set to your frontend Render domain)
   - `nexus-frontend`:
     - `NEXT_PUBLIC_API_URL` (set to your backend Render domain)
     - `NEXT_PUBLIC_APP_URL` (set to your frontend Render domain)

### Notes

- Backend uses `backend/Dockerfile.render`.
- Frontend uses `frontend/Dockerfile`.
- Whisper real-time transcription is optional and excluded from default deploy dependencies to keep image size small.

### Data repair (before strict FK migrations)

If a tenant has historical orphan rows (for example finance payment rows referencing deleted records), run:

```bash
cd backend
python scripts/cleanup_orphan_finance_rows.py        # audit only
python scripts/cleanup_orphan_finance_rows.py --apply
python scripts/check_tenant_schema_health.py         # migration preflight
python scripts/smoke_check_backend.py                # DB + platform + tenant smoke check
./scripts/run_smoke_checks.sh                        # run both checks in order
```

## Architecture

### Multi-tenancy
Each tenant gets an isolated PostgreSQL schema (`tenant_{slug}`). The `platform` schema holds global tables (admins, tenants). All tenant API calls set `search_path` to the tenant's schema via JWT claims.

### Authentication
JWT tokens embed `tenant_slug` and `sub` (user ID). The `get_current_user_with_tenant` dependency decodes the token, validates the slug, and sets the DB search path automatically.

### AI Integration
- **Chat**: Gemini streaming via Server-Sent Events
- **Deduplication**: pg_trgm similarity + Gemini disambiguation (with savepoint protection)
- **Company Research**: Gemini generates structured company profiles

## API Reference

See [docs/API.md](docs/API.md) for the full API reference.

## Development Guide

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture details, coding conventions, and known patterns.
