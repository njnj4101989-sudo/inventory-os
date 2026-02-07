# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

---

## Document Directory (Lifetime Reference)

These 6 documents are the **complete blueprint** for the entire project. Reference them at ANY phase of development.

### When Building BACKEND (Phase 6A):
| Need | Read This |
|------|-----------|
| Table columns, types, FKs, indexes | `STEP2_DATA_MODEL.md` |
| Event payloads, side effects, validation | `STEP3_EVENT_CONTRACTS.md` |
| Endpoint paths, request/response bodies, auth | `STEP4_API_CONTRACTS.md` |
| File placement, layer rules | `STEP5_FOLDER_STRUCTURE.md` §5.3 |

### When Building WEB FRONTEND (Phase 6B):
| Need | Read This |
|------|-----------|
| Role matrix (who sees what) | `STEP1_SYSTEM_OVERVIEW.md` §1.4 |
| API request/response shapes | `STEP4_API_CONTRACTS.md` §4.3 |
| Page list, component tree | `STEP5_FOLDER_STRUCTURE.md` §5.4 |

### When Building MOBILE APP (Phase 6C):
| Need | Read This |
|------|-----------|
| Tailor/Checker flows | `STEP1_SYSTEM_OVERVIEW.md` §1.5 |
| Batch state machine transitions | `STEP3_EVENT_CONTRACTS.md` §3.4 |
| Mobile API endpoints | `STEP4_API_CONTRACTS.md` §4.3.10 |
| Offline-first architecture | `STEP5_FOLDER_STRUCTURE.md` §5.5 |

### When Building INFRA (Phase 6D):
| Need | Read This |
|------|-----------|
| Deployment topology, Docker services | `STEP1_SYSTEM_OVERVIEW.md` §1.13 |
| External API (drsblouse.com) | `STEP4_API_CONTRACTS.md` §4.4 |
| Docker compose, nginx, scripts | `STEP5_FOLDER_STRUCTURE.md` §5.6 |

### When Debugging / Auditing:
| Need | Read This |
|------|-----------|
| Inventory formula (stock computation) | `STEP3_EVENT_CONTRACTS.md` §3.1 |
| Idempotency rules | `STEP3_EVENT_CONTRACTS.md` §3.2 |
| Concurrency / race conditions | `STEP3_EVENT_CONTRACTS.md` §3.9 |
| Error codes reference | `STEP4_API_CONTRACTS.md` §4.5 |

---

## Session History

### Session 1 (2026-02-07)
- Created all 6 design documents (Steps 1-6), all approved
- Started Phase 6A backend scaffold
- Completed: 6A-1 (project setup), 6A-2 (database setup)

### Session 2 (2026-02-07)
- Restructured root folder: moved backend/ to root, removed redundant docs/ subfolder
- Completed: 6A-3 (15 ORM models + __init__.py — all 15 tables from STEP2)
- Completed: 6A-4 (Alembic env.py + script.py.mako + initial migration — 15 tables verified)
- Switched to SQLite for dev (zero setup, old PC friendly)
- Completed: 6A-5 (14 Pydantic schema files — all imports verified, zero circular deps)
- **Session ended — state saved**

### Session 3 (2026-02-07) — 4 tasks completed (6A-6 through 6A-9)
- Completed: 6A-6 (Core utilities — 6 files, all imports + logic tests passed)
  - `core/__init__.py` — module marker
  - `core/security.py` — JWT create/verify (python-jose HS256), password hash/verify (passlib bcrypt)
  - `core/permissions.py` — RBAC matrix (15 perms × 5 roles), helpers (check, list, map)
  - `core/exceptions.py` — AppException base + 10 domain exceptions (STEP4 §4.5)
  - `core/error_handlers.py` — FastAPI global handlers + register_exception_handlers()
  - `core/code_generator.py` — async generators for ROLL/BATCH/ORD/INV/RES codes (SQLite-safe)
- Completed: 6A-7 (dependencies.py — get_current_user, require_permission, require_role)
  - `app/dependencies.py` — single import point for route auth deps
  - `get_current_user`: JWT verify → DB load (User + Role eagerly) → active check
  - `require_permission(perm)`: Depends factory, checks JWT claims permissions list
  - `require_role(*roles)`: Depends factory, checks JWT claims role field
  - Token type guard: rejects refresh tokens used as access tokens
  - Re-exports `get_db` from database.py for convenience
- Completed: 6A-8 (Service stubs — 13 files, 12 classes, 55 methods)
  - `services/__init__.py` — exports all 12 service classes
  - `auth_service.py` (3): login, refresh, logout
  - `user_service.py` (5): CRUD + soft-delete
  - `supplier_service.py` (4): CRUD
  - `roll_service.py` (4): stock_in, get_rolls, get_roll, consumption_history
  - `sku_service.py` (4): CRUD + auto-code
  - `batch_service.py` (8): create, assign, start, submit, check, get_qr + list/detail
  - `inventory_service.py` (6): create_event, adjust, reconcile, get_inventory/events
  - `order_service.py` (6): create, ship, cancel, return + list/detail
  - `invoice_service.py` (5): create, mark_paid, generate_pdf + list/detail
  - `reservation_service.py` (5): create, confirm, release, expire_stale, get_active
  - `dashboard_service.py` (3): summary, tailor_performance, inventory_movement
  - `qr_service.py` (2): generate_qr_base64, generate_batch_qr
- Completed: 6A-9 (API routes — 15 files, 13 sub-routers, 46 endpoints)
  - `api/__init__.py` — package marker
  - `api/router.py` — main aggregator (includes all 13 sub-routers)
  - `api/auth.py` (3): login, refresh, logout — public + JWT
  - `api/users.py` (3): list, create, update — user_manage
  - `api/roles.py` (1): list — role_manage
  - `api/suppliers.py` (3): list, create, update — supplier_manage
  - `api/rolls.py` (3): list, stock_in, detail — stock_in
  - `api/skus.py` (3): list, create, update — inventory_view / supplier_manage
  - `api/batches.py` (7): list, create, assign, start, submit, check, qr
  - `api/inventory.py` (4): list, events, adjust, reconcile
  - `api/orders.py` (5): list, create, ship, cancel, return — order_manage
  - `api/invoices.py` (3): list, pay, pdf — invoice_manage
  - `api/dashboard.py` (3): summary, tailor-perf, movement — report_view
  - `api/mobile.py` (3): my-batches, scan, pending-checks — tailor/checker
  - `api/external.py` (5): stock, reserve, confirm, release, return — X-API-Key
- Next: 6A-10 (main.py — FastAPI app entry, CORS, lifespan, error handlers)

### Session 4 (2026-02-08) — 6A-10 completed
- Completed: 6A-10 (main.py — FastAPI app, CORS, lifespan, error handlers, router mount)
  - `app/main.py` — lifespan (engine dispose), CORS from settings.cors_origins, docs at /api/v1/docs
  - Health check at `/api/v1/health`
  - Fixed: centralized `/api/v1` prefix in main.py (removed from all 13 sub-routers)
  - Verified: 46 business endpoints + 1 health + 3 docs = 50 routes, all paths correct
- Next: 6A-11 (Background tasks — reservation expiry, backup sync)
- Completed: 6A-11 (Background tasks — 3 files + main.py lifespan integration)
  - `app/tasks/__init__.py` — exports start/stop for both tasks
  - `app/tasks/reservation_expiry.py` — asyncio loop every 15 min, calls ReservationService.expire_stale_reservations()
  - `app/tasks/backup_sync.py` — asyncio loop every 24h (stub — real pg_dump is Phase 6D)
  - Updated `main.py` lifespan: spawns both tasks on startup, cancels on shutdown
- Completed: 6A-12 (Seed scripts — 4 files, all idempotent, tested end-to-end)
  - `seeds/seed_roles.py` — 5 roles (admin, supervisor, tailor, checker, billing) + permission maps
  - `seeds/seed_users.py` — 5 test users (1 per role, password: test1234)
  - `seeds/seed_data.py` — 2 suppliers + 3 SKUs (textile blouse products)
  - `seeds/seed_all.py` — runner: `python -m seeds.seed_all`
- Completed: 6A-13 (Dockerfile + .dockerignore — text blueprint, no Docker Desktop needed)

### PHASE 6A COMPLETE — All 13 tasks done
- 83+ backend files scaffolded
- 46 API endpoints registered + health check
- 15 ORM models, 14 schema files, 12 service stubs, 13 routers
- Background tasks (reservation expiry + backup sync)
- Seed scripts (roles, users, suppliers, SKUs)
- Dockerfile ready for future deployment
- Next decision: Phase 6B (Web Frontend) or implement service business logic

---

## SQLite → PostgreSQL Migration Checklist

**Current:** SQLite (dev) | **Target:** PostgreSQL / Supabase (production)

When ready to switch, make these changes:

### 1. Change connection URL (1 edit)
```env
# In .env or config.py:
# FROM: DATABASE_URL=sqlite+aiosqlite:///./inventory_os.db
# TO:   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/inventory_os
```

### 2. Optional: Upgrade JSON → JSONB for performance (2 files)
```
role.py:             JSON → JSONB  (add: from sqlalchemy.dialects.postgresql import JSONB)
inventory_event.py:  JSON → JSONB  (same import)
```
> JSON works fine on PostgreSQL too. JSONB is only needed if you query inside JSON fields.

### 3. server_default values (already cross-DB compatible, no change needed)
- `func.now()` → works on both SQLite and PostgreSQL
- `"1"` for booleans → works on both
- `"0"` for integers → works on both

### 4. Re-generate migration for PostgreSQL
```bash
# Delete SQLite DB and old migration
rm inventory_os.db
rm migrations/versions/*.py
# Generate fresh for PostgreSQL
alembic revision --autogenerate -m "initial_schema"
alembic upgrade head
```

### 5. For Supabase specifically
- Use Supabase connection string (find in Dashboard → Settings → Database)
- Format: `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

---

## Project Structure
```
inventory-os/                      ← PROJECT ROOT
├── Guardian/                      ← Docs + CLI launcher (this folder)
│   ├── CLAUDE.md                  ← This session log
│   ├── guardian.md                ← Protocols
│   ├── guardian_init.bat          ← CLI launcher
│   ├── STEP1_SYSTEM_OVERVIEW.md
│   ├── STEP2_DATA_MODEL.md
│   ├── STEP3_EVENT_CONTRACTS.md
│   ├── STEP4_API_CONTRACTS.md
│   ├── STEP5_FOLDER_STRUCTURE.md
│   └── STEP6_SCAFFOLD_PLAN.md
├── backend/                       ← FastAPI backend (at root level)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py              ← Pydantic BaseSettings from .env
│   │   ├── database.py            ← Async engine, session, Base model
│   │   └── models/                ← 15 ORM models (6A-3 ✅)
│   │       ├── __init__.py        ← Exports all 15 model classes
│   │       ├── role.py, user.py, supplier.py, roll.py
│   │       ├── sku.py, batch.py, batch_assignment.py
│   │       ├── batch_roll_consumption.py
│   │       ├── inventory_event.py, inventory_state.py
│   │       ├── reservation.py
│   │       ├── order.py, order_item.py
│   │       └── invoice.py, invoice_item.py
│   │   └── schemas/               ← 14 Pydantic schemas (6A-5 ✅)
│   │       ├── __init__.py        ← BaseSchema, PaginatedParams
│   │       ├── auth.py, role.py, user.py, supplier.py
│   │       ├── roll.py, sku.py, batch.py
│   │       ├── inventory.py, order.py, invoice.py
│   │       └── dashboard.py, mobile.py, external.py
│   │   └── core/                  ← Cross-cutting utilities (6A-6 ✅)
│   │       ├── __init__.py
│   │       ├── security.py        ← JWT + password hashing
│   │       ├── permissions.py     ← RBAC matrix + helpers
│   │       ├── exceptions.py      ← 10 domain exception classes
│   │       ├── error_handlers.py  ← Global FastAPI exception handlers
│   │       └── code_generator.py  ← Sequential code generators
│   ├── migrations/versions/       ← Initial migration (6A-4 ✅)
│   ├── seeds/                     ← Empty, awaiting 6A-12
│   ├── requirements.txt
│   └── alembic.ini
├── frontend/                      ← React (Phase 6B, future)
└── mobile/                        ← Android/Kotlin (Phase 6C, future)
```
