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

## Current State (Session 20 — 2026-02-17)

### What's Done
- **Phase 6A (Backend):** COMPLETE — 20 models, 17 schemas, 14 services, 15 routers, 73+ endpoints
- **Phase 6B (Frontend):** COMPLETE — 14 feature pages, 130+ modules, 0 build errors
- **API_REFERENCE.md:** Authoritative contract for all 13 API modules + new edit-processing endpoint
- **Backend services:** All 14 fully implemented, gap audit done (Session 16), masters added (Session 17)
- **STEP docs:** Updated to v1.1 (Session 15) — reflect weight-based rolls, LOTs, master entities

### What's Built This Session (Session 20)

#### 1. "Processed & Returned" Enriched Table (Option A — Inline Summary + Expandable Rows)
- **New `PROCESSED_COLUMNS`** — 8 columns purpose-built for processed rolls:
  - Roll Code | Fabric/Color (combined) | Weight | Processes (color-coded pills: purple=Embroidery, sky=Digital Print, amber=Dyeing) | Total Cost | Wt. Change (red/green with %) | Days | Last Returned
- **DataTable enhanced** with expandable rows (`expandedRows`, `onToggleExpand`, `renderExpanded` props)
  - Chevron column with rotate animation, purple tint on expanded rows
  - Fully backward-compatible — existing DataTable usage unchanged
- **Expandable row content** — vertical timeline showing each processing step:
  - Numbered dots with process-type colors + connector lines
  - Each step: process pill + vendor + phone + dates + duration + weight before→after + cost + notes
  - Active (sent) steps: orange "In Progress" badge with pulse animation
  - Summary footer for multi-process rolls: total processes, days, net wt change, total cost
- Column swap: `rollStatusFilter === 'in_stock_processed'` → PROCESSED_COLUMNS with expand; all other filters → original ROLL_COLUMNS

#### 2. Edit Processing Log (Full Stack)
- **Problem:** No way to edit a processing log after creation — cost/vendor/notes often come later (challan reality)
- **Backend:** `UpdateProcessingLog` schema (all 9 fields optional) + `update_processing_log()` service method + `PATCH /rolls/{id}/processing/{pid}/edit` endpoint
- **Frontend API:** `updateProcessingLog()` with mock + real API support
- **Frontend UI:** Edit button on both:
  - Expandable timeline row in "Processed & Returned" table
  - Roll detail modal's Processing History cards
- **Edit modal:** Pre-filled with current values (process type, vendor, dates, weight, cost, notes), only sends changed fields (efficient PATCH)
- **Live refresh fix:** After edit, `detailRoll` state updates in-place from response — no need to close/reopen the modal

#### Files Changed
| File | Change |
|------|--------|
| `frontend/src/components/common/DataTable.jsx` | Added Fragment import, expandedRows/onToggleExpand/renderExpanded props, chevron column, expanded sub-row rendering |
| `frontend/src/pages/RollsPage.jsx` | PROCESSED_COLUMNS, PROCESS_COLORS, getProcessSummary helper, expandedRows state, toggleExpand, renderExpandedProcessRow, editProcLog state+handlers+modal, edit buttons on timeline+detail |
| `frontend/src/api/rolls.js` | Added `updateProcessingLog()` function |
| `backend/app/schemas/roll.py` | Added `UpdateProcessingLog` schema |
| `backend/app/services/roll_service.py` | Added `update_processing_log()` method |
| `backend/app/api/rolls.py` | Added `PATCH /{roll_id}/processing/{processing_id}/edit` endpoint |
| `Guardian/API_REFERENCE.md` | Documented new edit-processing endpoint |
| `Guardian/guardian.md` | Updated DataTable props in Protocol 6 |

### NEXT SESSION START HERE (Session 21)
**P0/P1 backend fixes — audit done, code read, relationships confirmed. Just need to write the fixes:**

#### P0 — Flat UUID → Nested Object (Appendix C violations)
1. **lot_service.py** `_to_response()` line 267: `created_by: "uuid"` → `created_by_user: { id, full_name }`
   - Relationship exists: `Lot.created_by_user` (confirmed in model)
   - Add `selectinload(Lot.created_by_user)` to `_get_or_404()` and `get_lots()` queries
2. **batch_service.py** `_to_response()` line 346: `created_by: "uuid"` → `created_by_user: { id, full_name }`
   - Relationship exists: `Batch.created_by_user` (confirmed in model)
   - Add `selectinload(Batch.created_by_user)` to `_get_or_404()` and `get_batches()` queries
3. **batch_service.py** `_to_response()` line 348: `assignment.tailor_id: "uuid"` → `assignment.tailor: { id, full_name }`
   - Need: `selectinload(Batch.assignments).selectinload(BatchAssignment.tailor)` in `_get_or_404()` and `get_batches()`
4. **inventory_service.py** `_event_to_response()` line 299: `performed_by: "uuid"` → `performed_by: { id, full_name }`
   - Relationship exists: `InventoryEvent.performed_by_user` (confirmed in model)
   - Add `selectinload(InventoryEvent.performed_by_user)` to `get_events()` query

#### P1 — Missing Fields
5. **inventory_service.py** `_state_to_response()` line 277-281: `sku` object missing `base_price`
   - Just add `"base_price": float(s.sku.base_price) if s.sku and s.sku.base_price else None` to the sku dict
6. **batch_service.py** `_to_response()`: missing `rolls_used: []` field — add `"rolls_used": []`

#### Also done this session (uncommitted)
- All Rolls table: roll code copy-paste fix already pushed
- All Rolls table cleanup already pushed

#### After P0/P1 fixes
1. Page overhauls remaining: SKUs, Lots, Batches, Orders, Invoices
2. Phase 6C (Mobile App) / Phase 6D (Infra/Docker)

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
- **Session 20:** "Processed & Returned" enriched table — 8 purpose-built columns with color-coded process pills, expandable timeline rows (DataTable enhanced with expand support). Edit Processing Log — full-stack feature (schema+service+endpoint+frontend modal) allowing post-hoc edits to cost/vendor/notes/dates. Live detail refresh after edit.

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
├── backend/                       ← FastAPI (Phase 6A + Sessions 7-20)
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
├── frontend/                      ← React (Phase 6B + Sessions 7-20)
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
