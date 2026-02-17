# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

---

## Document Directory (Lifetime Reference)

### All Project Documents
| Document | Purpose | When to Read |
|----------|---------|-------------|
| `CLAUDE.md` | Session log, project state, architecture | Every session start |
| `guardian.md` | Protocols, rules, coding standards | Before any coding |
| `API_REFERENCE.md` | **THE** single source of truth for API shapes | Before any frontend↔backend work |
| `STEP1_SYSTEM_OVERVIEW.md` | Role matrix, production flow, deployment | Architecture decisions |
| `STEP2_DATA_MODEL.md` | 20 tables, columns, types, FKs, indexes | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, state machine | Business logic coding |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions (v1.1) | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning next work |

### Quick Lookup by Task
| Need | Read This |
|------|-----------|
| **API response shapes (AUTHORITATIVE)** | `API_REFERENCE.md` — extracted from mock.js |
| Table columns, types, FKs | `STEP2_DATA_MODEL.md` |
| Event payloads, side effects | `STEP3_EVENT_CONTRACTS.md` |
| Endpoint paths, auth rules | `STEP4_API_CONTRACTS.md` |
| Role matrix (who sees what) | `STEP1_SYSTEM_OVERVIEW.md` §1.4 |
| Tailor/Checker mobile flows | `STEP1_SYSTEM_OVERVIEW.md` §1.5 |
| Batch state machine | `STEP3_EVENT_CONTRACTS.md` §3.4 |
| Inventory formula | `STEP3_EVENT_CONTRACTS.md` §3.1 |
| Error codes | `STEP4_API_CONTRACTS.md` §4.5 |

---

## Current State (Session 19 — 2026-02-17)

### What's Done
- **Phase 6A (Backend):** COMPLETE — 20 models, 16 schemas, 14 services (zero stubs), 15 routers, 71+ endpoints
- **Phase 6B (Frontend):** COMPLETE — 14 feature pages, 130 modules, 0 build errors
- **API_REFERENCE.md:** Created — authoritative contract for all 13 API modules, extracted from mock.js
- **Backend services:** All 14 fully implemented, gap audit done (Session 16), masters added (Session 17)
- **STEP docs:** Updated to v1.1 (Session 15) — reflect weight-based rolls, LOTs, master entities

### What's Fixed This Session (Session 19)
- **CRITICAL FIX:** `roll_service.py` `_to_response()` now matches API_REFERENCE.md §5 exactly:
  - `received_by` (flat UUID) → `received_by_user: { id, full_name }` (nested object)
  - Added `processing_logs[]` array to every roll response (was missing entirely)
  - `get_roll()`: removed duplicate manual processing query, uses relationship via `selectinload`
  - `get_roll()`: key renamed from `processing_history` → `processing_logs` (via `_to_response`)
  - All roll queries now load 3 relationships: `supplier`, `received_by_user`, `processing_logs`
  - `send_for_processing()` + `receive_from_processing()` now return full roll object (not just processing log)
- "Receive Back" button should now work end-to-end
- **NEW FILTER:** Rolls page → All Rolls tab now has 6 status pills:
  - `All | In Stock | Fresh (No Process) | Processed & Returned | In Processing | In Cutting`
  - "Fresh" = never sent for processing; "Processed & Returned" = came back from embroidery/dyeing/etc.
  - Client-side filtering on `processing_logs[]` array (backend sends `status=in_stock`, frontend sub-filters)

### NEXT SESSION START HERE (Session 20)
1. **TEST:** Restart backend → clear localStorage → login → test "Send for Processing" + "Receive Back" + new filter pills
2. Align remaining backend response shapes to `API_REFERENCE.md` (endpoint by endpoint)
3. Page overhauls remaining: SKUs, Lots, Batches, Orders, Invoices
4. Phase 6C (Mobile App) / Phase 6D (Infra/Docker)

### Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1, password: test1234
- **Real DB login:** admin/supervisor/billing/tailor1/checker1, password: test1234
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## Session History

### Phase 6A: Backend Scaffold (Sessions 1-4) — COMPLETE
- **Session 1:** Created 6 STEP design documents, started backend scaffold (6A-1, 6A-2)
- **Session 2:** 15 ORM models, Alembic migration, 14 Pydantic schemas, SQLite for dev
- **Session 3:** Core utilities (security, permissions, exceptions, code_gen), dependencies, 12 service stubs (55 methods), 13 API routers (46 endpoints)
- **Session 4:** main.py (CORS, lifespan), background tasks (reservation expiry, backup sync), seed scripts (roles, users, suppliers, SKUs), Dockerfile
- **Result:** 83+ files, 46 endpoints, 15 models, fully scaffolded

### Phase 6B: Frontend (Sessions 5-6) — COMPLETE
- **Session 5:** Vite+React+Tailwind setup, API client+mock layer (13 modules), auth context, layout (Sidebar/Header), routes+protection, 7 common components, admin pages (Dashboard, Users), supervisor pages (Suppliers, Rolls, SKUs, Batches)
- **Session 6:** Billing pages (Orders, Invoices, Reports), detail pages (BatchDetail, Inventory), 5 form components extracted
- **Result:** 55+ files, 126 modules, all 11 pages implemented, 0 errors

### Sessions 7-14: Feature Evolution + UI Overhaul
- **Session 7:** Reservation expiry fix, unified Users & Roles page, supplier invoice tracking, SKU pattern → `ProductType-DesignNo-Color-Size`
- **Session 8:** LOT entity (Lot→LotRoll→Roll), weight-based rolls (total_weight/remaining_weight), batch→lot FK, LotsPage
- **Session 9:** UI polish (modal scroll, size pattern layout), roll detail/edit modals, removed SKU from Lot entity
- **Session 10:** InventoryPage overhaul (KPIs, health bars, filters), ReportsPage rebuild (4 tabs: Production/Inventory/Financial/Tailor)
- **Session 11:** Supplier page upgrade (+6 fields, GST/PAN), Rolls page overhaul (invoice-wise stock-in, 3-tab layout, processing workflow)
- **Session 12:** Bug fixes (supplier form focus loss, roll→invoice navigation), roll detail redesign (extraWide modal, KPI bar)
- **Session 13:** Challan-style stock-in (full-page overlay, design groups, color×weight grid, keyboard-driven)
- **Session 14:** Invoice detail challan view, roll codes → `{Challan}-{Fabric3}-{Color5}-{Seq}`, filter toolbars

### Sessions 15-18: Backend Implementation + Integration
- **Session 15:** All 13 backend services fully implemented (65+ methods, zero stubs). STEP docs updated to v1.1
- **Session 16:** Frontend↔Backend gap audit — fixed 7 gaps (PATCH rolls, roll filtering, processing routes, dashboard endpoints, inventory filtering)
- **Session 17:** Master Data entities (ProductType, Color, Fabric) — 3 models, schemas, service, 12 API endpoints, MastersPage, dynamic dropdowns in forms
- **Session 18:** Created `API_REFERENCE.md` (single source of truth). Fixed 3 missing dashboard service methods (`get_inventory_summary`, `get_production_report`, `get_financial_report`). Fixed `get_inventory_movement` returning single object instead of array. Fixed `get_summary` missing `lots` key. Added favicon. Fixed MastersPage Modal prop mismatch (`isOpen`→`open`, `footer`→`actions`). Cleaned up all docs. Added Protocol 6 (Component Props) + Activation Protocol to guardian.md.
- **Session 19:** Fixed `roll_service.py` `_to_response()` — 5 mismatches with API_REFERENCE.md §5 (received_by→received_by_user nested, added processing_logs[], removed manual processing query, send/receive return full roll). Added "Fresh (No Process)" + "Processed & Returned" filter pills to RollsPage.

---

## SQLite → PostgreSQL Migration Checklist

**Current:** SQLite (dev) | **Target:** PostgreSQL / Supabase (production)

### 1. Change connection URL
```env
# FROM: DATABASE_URL=sqlite+aiosqlite:///./inventory_os.db
# TO:   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/inventory_os
```

### 2. Optional: JSON → JSONB (role.py, inventory_event.py)

### 3. Re-generate migration
```bash
rm inventory_os.db && rm migrations/versions/*.py
alembic revision --autogenerate -m "initial_schema"
alembic upgrade head
```

### 4. Supabase format
```
postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## Project Structure
```
inventory-os/
├── Guardian/                      ← Docs + protocols
│   ├── CLAUDE.md                  ← This session log
│   ├── guardian.md                ← Protocols + rules
│   ├── API_REFERENCE.md           ← Single source of truth for API shapes
│   ├── STEP1–STEP6 .md files     ← Design blueprints (v1.1)
│   ├── guardian_init.bat          ← CLI launcher
│   └── project-context.json      ← Auto-generated project snapshot
├── backend/                       ← FastAPI (Phase 6A + Sessions 7-18)
│   ├── app/
│   │   ├── config.py, database.py, main.py, dependencies.py
│   │   ├── models/    (20 ORM models incl. ProductType, Color, Fabric)
│   │   ├── schemas/   (16 Pydantic schemas incl. master.py)
│   │   ├── services/  (14 service classes incl. master_service.py)
│   │   ├── api/       (15 routers, 71+ endpoints incl. masters.py)
│   │   ├── core/      (security, permissions, exceptions, code_gen)
│   │   └── tasks/     (reservation_expiry, backup_sync)
│   ├── migrations/, seeds/, Dockerfile
│   └── requirements.txt, alembic.ini
├── frontend/                      ← React (Phase 6B + Sessions 7-18)
│   ├── package.json, vite.config.js, tailwind.config.js
│   └── src/
│       ├── api/           (15 files — client + mock + 13 modules)
│       ├── context/       (AuthContext.jsx)
│       ├── hooks/         (useAuth.js, useApi.js)
│       ├── components/
│       │   ├── layout/    (Sidebar, Header, Layout)
│       │   ├── common/    (DataTable, Modal, StatusBadge, SearchInput, Pagination, Spinner, Alert)
│       │   └── forms/     (UserForm, RollForm, SKUForm, BatchForm, OrderForm)
│       ├── pages/         (LoginPage + 14 feature pages incl. MastersPage)
│       └── routes/        (routes.js, ProtectedRoute.jsx)
└── mobile/                        ← Phase 6C (future)
```
