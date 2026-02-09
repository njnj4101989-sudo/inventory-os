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
- Git: pushed to https://github.com/njnj4101989-sudo/inventory-os

### Session 4 continued — Documentation + SKU pattern update
- Expanded STEP6 §6.4 with detailed 6B plan (11 tasks, ~45 files, dependency graph, file lists)
- Updated SKU pattern: `[PRODUCT]-[COLOR]-[SIZE]` → `DesignNo-Color-Size` (e.g. `101-Red-M`)
  - Updated: STEP1, STEP2, STEP4 (30+ references), seed_data.py, sku_service.py, skus.py
  - Zero old pattern references remaining (verified)
- Decision: Start Phase 6B (Web Frontend) with mock data layer

### Session 5 (2026-02-08) — 8 tasks completed (6B-1 through 6B-8)
- Completed: 6B-1 (Project setup — 9 files, Vite 6.4 + React 18 + Tailwind 3.4)
  - `package.json` — React 18, Vite, Tailwind, Axios, React Router 6
  - `vite.config.js` — dev :5173, proxy /api → :8000
  - `tailwind.config.js` — blue-600 primary theme
  - `postcss.config.js`, `index.html`, `.env.example`, `.env`
  - `src/index.css`, `src/main.jsx`, `src/App.jsx`
  - Verified: `npm run dev` → Vite ready in 902ms, 0 vulnerabilities
- Completed: 6B-2 (API client + mock layer — 13 files)
  - `src/api/client.js` — Axios instance, JWT interceptor, 401 auto-refresh with queue
  - `src/api/mock.js` — Full mock store: 5 users, 2 suppliers, 4 rolls, 3 SKUs, 3 batches, 3 orders, 2 invoices, dashboard stats
  - 11 API modules: auth, users, roles, suppliers, rolls, skus, batches, inventory, orders, invoices, dashboard
  - Mock switch: `VITE_USE_MOCK=true` (default) — set `false` to hit real backend
  - Fix: exported `PERMISSIONS` const from mock.js
- Completed: 6B-3 (Auth context + hooks — 3 files + main.jsx update)
  - `src/context/AuthContext.jsx` — Provider: user, token, role, permissions, login/logout, localStorage persistence
  - `src/hooks/useAuth.js` — Consumer hook with context guard
  - `src/hooks/useApi.js` — Generic { data, loading, error, refetch }, immediate/deferred modes
  - Updated `main.jsx` — AuthProvider wrapping App
- Completed: 6B-4 (Layout components — 3 files)
  - `src/components/layout/Sidebar.jsx` — Role-filtered nav (Admin 11, Supervisor 7, Billing 4), collapsible, SVG icons
  - `src/components/layout/Header.jsx` — User name, color-coded role badge, logout button, sticky
  - `src/components/layout/Layout.jsx` — Sidebar + Header + Outlet shell with transition
- Completed: 6B-5 (Routes + protection — 15 files)
  - `src/routes/routes.js` — 12-route config with requiredRoles[], React.lazy code-splitting
  - `src/routes/ProtectedRoute.jsx` — Auth guard: no auth → /login, wrong role → /dashboard
  - `src/pages/LoginPage.jsx` — Full login form with error display, mock hint
  - 11 placeholder page files (Dashboard through Reports)
  - Updated `App.jsx` — Suspense + public /login + protected Layout shell + role-guarded routes
- Completed: 6B-6 (Common components — 7 files)
  - `DataTable.jsx` — Sortable columns, row click, skeleton loading, empty state
  - `Modal.jsx` — Overlay dialog, Escape/backdrop close, title, body, footer actions, wide mode
  - `StatusBadge.jsx` — 15 color mappings (batch/order/invoice/generic statuses)
  - `SearchInput.jsx` — Debounced (300ms), search icon, clear button
  - `Pagination.jsx` — Prev/Next, 5 visible page numbers with ellipsis
  - `LoadingSpinner.jsx` — sm/md/lg, optional text
  - `ErrorAlert.jsx` — Red banner, warning icon, dismissible
- Completed: 6B-7 (Admin pages — 2 files replaced from placeholder)
  - `DashboardPage.jsx` — 4 summary cards (rolls, batches, orders, revenue) + batch pipeline (5-stage) + inventory/revenue panels
  - `UsersPage.jsx` — DataTable (6 cols) + search + pagination + create/edit modal (5 fields, role dropdown)
- Completed: 6B-8 (Supervisor pages — 4 files replaced from placeholder)
  - `SuppliersPage.jsx` — DataTable (6 cols) + search + create/edit modal (4 fields)
  - `RollsPage.jsx` — DataTable (8 cols, remaining with progress bar) + stock-in modal (7 fields, supplier dropdown)
  - `SKUsPage.jsx` — DataTable (7 cols, stock avail/reserved) + create/edit modal (6 fields, size dropdown)
  - `BatchesPage.jsx` — DataTable (7 cols) + status filter tabs + create modal (SKU, dynamic rolls) + assign modal (tailor dropdown)

### Session 6 (2026-02-08) — 3 tasks completed (6B-9 through 6B-11)
- Completed: 6B-9 (Billing pages — 3 files replaced from placeholder)
  - `OrdersPage.jsx` — DataTable (7 cols), status filter + search, create order modal (customer + dynamic SKU items), detail modal with Ship/Cancel
  - `InvoicesPage.jsx` — DataTable (8 cols), status filter, detail modal with line items breakdown, Mark as Paid + Download PDF
  - `ReportsPage.jsx` — Tailor Performance table (5 cols, color-coded rejection rate) + Inventory Movement table (8 cols, green/red)
- Completed: 6B-10 (Detail pages — 2 files replaced from placeholder)
  - `BatchDetailPage.jsx` — Back nav, status badge, 4 summary cards, 5-step visual timeline, rolls used table, details section
  - `InventoryPage.jsx` — DataTable (6 cols), low-stock toggle, SKU search, events modal, Adjust Stock modal, Reconcile button
- Completed: 6B-11 (Form components — 5 files created + 5 pages refactored)
  - `components/forms/UserForm.jsx` — username, password, full_name, role select, phone
  - `components/forms/RollForm.jsx` — fabric_type, color, total_length, unit, cost_per_unit, supplier select, notes
  - `components/forms/SKUForm.jsx` — product_type, product_name, color, size select, base_price, description
  - `components/forms/BatchForm.jsx` — SKU select, dynamic rolls (pieces_cut + length_used), notes
  - `components/forms/OrderForm.jsx` — customer_name, customer_phone, source, dynamic items (sku + qty + price)
  - Updated: UsersPage, RollsPage, SKUsPage, BatchesPage, OrdersPage — replaced inline forms with extracted components
  - Cleaned up dead code: removed unused helper functions from all 5 pages

### PHASE 6B COMPLETE — All 11 tasks done
- Build verified: 126 modules, 0 errors, 4.52s
- ~55 frontend files created
- All 11 pages implemented (no more placeholders)
- 5 reusable form components extracted
- Next: Phase 6C (Mobile App) or Phase 6D (Infra/Docker)

### Session 7 (2026-02-08) — Bug fixes + feature enhancements (first testing round)
- **Fix: Reservation expiry background task** — `expire_stale_reservations()` was a stub raising `NotImplementedError`
  - Implemented: queries active reservations past `expires_at`, sets status → `expired`, decrements `reserved_qty` on `InventoryState`
  - Task runs every 15 min via asyncio loop — no longer crashes on startup
- **Clarification: Batch assignment flow** — confirmed web-based Supervisor assignment (T2) is correct per STEP3 §3.4
  - QR scanning is for Tailor (T3: start work) and Checker (T5: inspect) — Phase 6C mobile
- **Feature: Unified Users & Roles page** (was showing same data on both tabs)
  - Removed separate `/roles` route, merged into single "Users & Roles" sidebar item
  - Sub-tabs: Users (existing table + CRUD) | Roles (new card layout)
  - Role cards: color-coded per role, show user count + permission count + permission pills
  - Role CRUD: create with custom name + permissions checklist, edit alias (display_name), delete (guarded — blocks if users assigned)
  - Backend: added `display_name` (nullable) to Role model, full CRUD endpoints (GET/POST/PATCH/DELETE)
  - Frontend: `roleDisplayName` in AuthContext, Header shows alias, UserForm dropdown shows alias
  - 12 files touched for this feature
- **Feature: Supplier invoice tracking on Rolls**
  - Added `supplier_invoice_no` (String 50) + `supplier_invoice_date` (Date) to Roll model/schema
  - RollForm: new row with invoice no. text input + date picker
  - RollsPage: 2 new table columns (Invoice No., Invoice Date)
  - Both fields nullable — invoice may arrive later
- **Feature: SKU pattern upgrade** — `DesignNo-Color-Size` → `ProductType-DesignNo-Color-Size`
  - New format: `BLS-101-Red-M` (Blouse, Design 101, Red, Medium)
  - Prevents conflicts when new product types share design numbers (e.g. `KRT-101-Red-M` vs `BLS-101-Red-M`)
  - SKUForm: new Design No. field, 5 product types (BLS/KRT/SAR/DRS/OTH), live SKU code preview, code-forming fields disabled on edit
  - Updated: all mock data, seed data, API mock code gen, design docs (STEP1, STEP2, STEP4)
  - Zero old pattern remnants in active code (verified)
- **Git:** `c789538` — 27 files changed, 711 insertions, 155 deletions
- **Build:** 126 modules, 0 errors
- **Next:** Continue testing, more bug fixes, or Phase 6C/6D

### Session 8 (2026-02-08) — LOT entity + weight-based roll overhaul
- **Root cause:** Real business tracks rolls by WEIGHT (kg), not LENGTH (meters). Client's manual register showed:
  - Rolls tracked by weight, palla weight measured per roll
  - Palla = one cutting layer; `num_pallas = floor(roll_weight / palla_weight)`
  - Size pattern per palla: `{L:2, XL:6, XXL:6, 3XL:4}` = 18 pieces/palla
  - Total pieces = total_pallas × pieces_per_palla
  - LOT groups multiple rolls for cutting → batches are carved from lots
- **New entity: LOT** (sits between Rolls and Batches)
  - `Lot` model: lot_code, sku_id, lot_date, design_no, standard_palla_weight, default_size_pattern (JSON), pieces_per_palla, total_pallas, total_pieces, total_weight, status, notes
  - `LotRoll` join model: lot_id, roll_id, palla_weight, num_pallas, weight_used, waste_weight, size_pattern (JSON nullable), pieces_from_roll
  - LOT-XXXX code generator, lot_manage permission (admin + supervisor)
  - Schemas: LotRollInput, LotRollBrief, LotBrief, LotCreate, LotUpdate, LotResponse
  - Service: LotService (6 methods), API router: 4 endpoints
- **Roll model → weight-based:**
  - `total_length` → `total_weight`, `remaining_length` → `remaining_weight` (Numeric 10,3)
  - `unit` defaults to "kg", `total_length` kept as optional nullable field
  - RollForm: weight input, cost per kg, optional length field
  - RollsPage columns: total_weight, remaining_weight with kg display
- **Batch model updated:**
  - Added `lot_id` FK, `piece_count`, `color_breakdown` (JSON)
  - BatchForm: lot selector → shows lot summary → piece count input (removed roll inputs)
  - BatchesPage: lot column, lot-based creation flow
  - BatchDetailPage: "Lot Info" section replaces old "Rolls Used" table
- **Frontend: New LotsPage** (largest page — 12.45 kB built)
  - DataTable: lot_code, design_no, SKU, pallas, pieces, weight, status, date
  - Detail modal: summary cards + per-roll breakdown table
  - Create modal: SKU select, design no, lot date, palla weight, size pattern editor (L/XL/XXL/3XL), roll selector, per-roll palla weight, live auto-calculations
- **Mock data overhaul:**
  - 6 weight-based rolls (4 consumed, 2 available)
  - 1 sample lot (LOT-0001, Design 702, 4 rolls, 24 pallas, 432 pieces)
  - Batches reference lots with piece_count + color_breakdown
  - New `lots.js` API module
- **Files created:** 5 (lot.py model, lot.py schema, lot_service.py, lots.py route, lots.js API)
- **Files modified:** ~20 (roll.py, batch.py, sku.py, __init__.py, permissions.py, code_generator.py, router.py, services/__init__.py, mock.js, rolls.js, batches.js, RollForm, RollsPage, BatchForm, BatchesPage, BatchDetailPage, LotsPage, routes.js, Sidebar.jsx)
- **Build:** 128 modules, 0 errors, 8.88s

### Session 9 (2026-02-09) — UI polish, roll detail/edit, LOT SKU removal
- **Fix: Lot create form — size pattern alignment**
  - Size pattern inputs were cramped in a 2-col grid with palla weight
  - Extracted into a dedicated bordered card (`bg-gray-50`) with 4-col grid, proper labels, total pill badge
  - Palla weight moved to its own row with `max-w-xs`
- **Fix: Modal scroll overflow (global)**
  - All modals now cap at `max-h-[90vh]` with `flex flex-col`
  - Body area scrolls with `overflow-y-auto`, header + footer stay pinned
  - Applies to all modals (lots, rolls, batches, orders, etc.)
- **Feature: Roll row click → detail modal**
  - Click any roll row to open detail modal with 3 summary cards (weight, remaining, stock %) + 12-field read-only detail list
- **Feature: Roll edit (unused only)**
  - Unused rolls (remaining = total weight) show "Edit Roll" button in detail modal
  - Click "Edit Roll" → switches to RollForm edit mode with Save/Cancel
  - Used rolls show amber warning: "This roll cannot be edited" with contextual reason (fully consumed vs partially used)
  - Added `updateRoll()` to `rolls.js` API module (mock + `PATCH /rolls/:id`)
- **Fix: Remove SKU from Lot entity**
  - A lot produces multiple sizes → multiple SKUs. Single SKU at lot level was incorrect
  - Backend: `sku_id` made nullable in Lot model + optional in LotCreate/LotResponse schemas
  - Frontend: removed SKU column from lots table, removed SKU selector from create form
  - Lot create form now: Design No. + Lot Date → Palla Weight → Size Pattern → Rolls → Notes
  - Cleaned mock data (removed sku from LOT-0001)
- **Files modified:** 9 (lot.py model, lot.py schema, lots.js, mock.js, rolls.js, Modal.jsx, LotsPage.jsx, RollsPage.jsx, guardian.md)
- **Build:** 128 modules, 0 errors
- **Git:** committed + pushed
- **Next:** Continue testing, Phase 6C (Mobile App) or Phase 6D (Infra/Docker)

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
│   ├── STEP1–STEP6 .md files     ← Design blueprints
├── backend/                       ← FastAPI backend (Phase 6A ✅ + Session 8 LOT entity)
│   ├── app/
│   │   ├── config.py, database.py, main.py, dependencies.py
│   │   ├── models/    (17 ORM models — added Lot, LotRoll)
│   │   ├── schemas/   (15 Pydantic schemas — added lot.py)
│   │   ├── services/  (13 service classes — added LotService)
│   │   ├── api/       (14 routers, 50 endpoints — added lots.py)
│   │   ├── core/      (security, permissions, exceptions, code_gen)
│   │   └── tasks/     (reservation_expiry, backup_sync)
│   ├── migrations/, seeds/, Dockerfile
│   ├── requirements.txt, alembic.ini
├── frontend/                      ← React app (Phase 6B ✅ + Session 7-8 updates)
│   ├── package.json, vite.config.js, tailwind.config.js
│   ├── postcss.config.js, index.html, .env, .env.example
│   └── src/
│       ├── main.jsx, App.jsx, index.css
│       ├── api/           (14 files — client + mock + 12 modules, added lots.js)
│       ├── context/       (AuthContext.jsx)
│       ├── hooks/         (useAuth.js, useApi.js)
│       ├── components/
│       │   ├── layout/    (Sidebar, Header, Layout)
│       │   ├── common/    (DataTable, Modal, StatusBadge, SearchInput, Pagination, Spinner, Alert)
│       │   └── forms/     (UserForm, RollForm, SKUForm, BatchForm, OrderForm)
│       ├── pages/         (LoginPage + 12 feature pages — added LotsPage)
│       └── routes/        (routes.js, ProtectedRoute.jsx)
└── mobile/                        ← Android/Kotlin (Phase 6C, future)
```
