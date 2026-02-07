# Inventory-OS

Full-stack textile inventory management system for garment manufacturing. Tracks the complete production pipeline from raw fabric rolls to finished goods and sales.

**Built for:** [drsblouse.com](https://drsblouse.com) — a textile/garment factory

## Production Flow

```
Fabric Rolls → Cutting → Batching → Tailoring → QC Check → Finished Goods → Orders → Invoicing
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    OFFICE LAN                         │
│                                                       │
│   ┌─────────────┐    ┌──────────────────────────┐    │
│   │  React Web  │◄──►│  FastAPI Edge Server      │    │
│   │  Dashboard  │    │  (Python 3.11 + SQLite)   │    │──► Supabase
│   └─────────────┘    │                            │    │    (Cloud Backup)
│                       │  46 REST API endpoints    │    │
│   ┌─────────────┐    │  JWT auth + RBAC           │    │
│   │ Android App │◄──►│  15 DB tables              │    │
│   │ (Tailor/QC) │    └──────────────────────────┘    │
│   └─────────────┘                                     │
└──────────────────────────────────────────────────────┘
```

**Local-first** — runs entirely on an office PC over LAN. Internet only needed for cloud backup and e-commerce API.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | FastAPI (async) | REST API, business logic |
| Database | SQLite (dev) / PostgreSQL (prod) | ACID-compliant storage |
| ORM | SQLAlchemy 2.0 (async) | Models, migrations (Alembic) |
| Auth | JWT (python-jose) + bcrypt | Access/refresh tokens, RBAC |
| Web Frontend | React + Vite + Tailwind | Admin, Supervisor, Billing dashboards |
| Mobile | Android (Kotlin) | Tailor & QC checker with QR scanning |
| Deployment | Docker Compose | Single-command deployment |

## Roles & Permissions

| Role | Access |
|------|--------|
| **Admin** | Full system access — users, settings, reports |
| **Supervisor** | Stock-in, cutting, batch creation, assignment, inventory |
| **Tailor** | View assigned batches, start/submit work (mobile) |
| **Checker** | QC inspection — approve/reject batches (mobile) |
| **Billing** | Orders, invoices, inventory view, reports |

## Project Structure

```
inventory-os/
├── Guardian/          # Design docs (Steps 1-6) + AI session memory
│   ├── STEP1_SYSTEM_OVERVIEW.md
│   ├── STEP2_DATA_MODEL.md
│   ├── STEP3_EVENT_CONTRACTS.md
│   ├── STEP4_API_CONTRACTS.md
│   ├── STEP5_FOLDER_STRUCTURE.md
│   └── STEP6_SCAFFOLD_PLAN.md
├── backend/           # FastAPI backend (Phase 6A — complete)
│   ├── app/
│   │   ├── api/       # 13 routers, 46 endpoints
│   │   ├── models/    # 15 SQLAlchemy ORM models
│   │   ├── schemas/   # 14 Pydantic request/response schemas
│   │   ├── services/  # 12 service classes (business logic)
│   │   ├── core/      # JWT, RBAC, exceptions, code generators
│   │   ├── tasks/     # Background: reservation expiry, backup sync
│   │   └── main.py    # App entry point
│   ├── migrations/    # Alembic DB migrations
│   ├── seeds/         # Dev seed data (roles, users, suppliers, SKUs)
│   └── Dockerfile
├── frontend/          # React web app (Phase 6B — planned)
└── mobile/            # Android app (Phase 6C — planned)
```

## Quick Start (Development)

```bash
# 1. Clone
git clone https://github.com/njnj4101989-sudo/inventory-os.git
cd inventory-os/backend

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# 3. Install dependencies
pip install -r requirements.txt

# 4. Setup environment
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac

# 5. Run migrations
alembic upgrade head

# 6. Seed development data
python -m seeds.seed_all

# 7. Start server
uvicorn app.main:app --reload
```

Server runs at `http://localhost:8000`
API docs at `http://localhost:8000/api/v1/docs`

### Test Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | test1234 | Admin |
| supervisor | test1234 | Supervisor |
| tailor1 | test1234 | Tailor |
| checker1 | test1234 | Checker |
| billing | test1234 | Billing |

## API Endpoints (46)

| Group | Endpoints | Auth |
|-------|-----------|------|
| Auth | POST login, refresh, logout | Public / JWT |
| Users | GET list, POST create, PATCH update | user_manage |
| Roles | GET list | role_manage |
| Suppliers | GET list, POST create, PATCH update | supplier_manage |
| Rolls | GET list, POST stock-in, GET detail | stock_in |
| SKUs | GET list, POST create, PATCH update | inventory_view |
| Batches | GET list, POST create/assign/start/submit/check, GET qr | batch_* |
| Inventory | GET list/events, POST adjust/reconcile | inventory_* |
| Orders | GET list, POST create/ship/cancel/return | order_manage |
| Invoices | GET list, PATCH pay, GET pdf | invoice_manage |
| Dashboard | GET summary, tailor-perf, movement | report_view |
| Mobile | GET my-batches, pending-checks, POST scan | tailor/checker |
| External | GET stock, POST reserve/confirm/release/return | API Key |
| Health | GET /api/v1/health | Public |

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 6A Backend Scaffold | Done | FastAPI server, models, routes, auth, seeds |
| 6B Web Frontend | Planned | React dashboard for Admin/Supervisor/Billing |
| 6C Mobile App | Planned | Android app for Tailor/Checker with QR scanning |
| 6D Infrastructure | Planned | Docker Compose, Nginx, backup scripts |

## Design Documents

All system design is documented in `Guardian/`:

1. **System Overview** — Architecture, tech stack, roles, production flow
2. **Data Model** — 15 tables, relationships, constraints, indexes
3. **Event Contracts** — 8 inventory events, 3 state machines, idempotency rules
4. **API Contracts** — 46 endpoints, request/response shapes, error codes
5. **Folder Structure** — ~144 files across backend, frontend, mobile, infra
6. **Scaffold Plan** — 4-phase build plan with dependency graphs

## License

Private — All rights reserved.
