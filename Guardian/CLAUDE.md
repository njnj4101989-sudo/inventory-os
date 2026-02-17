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

## Current State (Session 22 — 2026-02-18)

### What's Done
- **Phase 6A (Backend):** COMPLETE — 20 models, 17 schemas, 14 services, 15 routers, 73+ endpoints
- **Phase 6B (Frontend):** COMPLETE — 14 feature pages, 130+ modules, 0 build errors
- **API_REFERENCE.md:** Authoritative contract for all 13 API modules + new edit-processing endpoint
- **Backend services:** All 14 fully implemented, gap audit done (Session 16), masters added (Session 17)
- **STEP docs:** Updated to v1.1 (Session 15) — reflect weight-based rolls, LOTs, master entities

### What's Built This Session (Session 22)

#### Challan Form Keyboard Fixes & Enhancements
1. **Keyboard shortcuts restored** — Enter/Tab/Backspace stopped working after color `<input>` was changed to `<select>` dropdown
   - Restored full onKeyDown on color `<select>`: Enter/Tab empty → new design group, Backspace/Shift+Tab empty → delete row & jump back
   - Fixed `input[data-color-input]` selector → `[data-color-input]` (works for `<select>`)
2. **Focus fix: new design group** — Enter on empty color was focusing Notes instead of Fabric dropdown. Added `data-fabric-input` attr, fixed selector
3. **Ctrl+S save shortcut** — Global keydown listener saves stock-in form from anywhere when overlay is open
4. **Auto-focus supplier** — Opening +Stock In auto-focuses the Supplier dropdown (no mouse needed)
5. **Auto-fill date** — Today's date auto-filled on new stock-in (editable)
6. **Sr. No. field (NEW)** — Auto-incrementing internal filing serial number. Written on physical supplier invoice copy for easy filing
7. **Challan No. field (NEW)** — Supplier's challan number (separate from invoice number)
8. **Full-stack: `supplier_challan_no` + `sr_no`** — Model column, schema, service, migration, mock.js, API_REFERENCE.md all updated
9. **Roll code pattern changed** — `{InvoiceNo}-Fabric-Color-Seq` → `{SrNo}-Fabric-Color-Seq` (e.g. `1-COT-GREEN-01`). Sr. No. in roll code = easy physical filing lookup

#### Files Changed
| File | Change |
|------|--------|
| `frontend/src/pages/RollsPage.jsx` | Keyboard fixes, Ctrl+S, auto-focus, Sr. No. + Challan No. fields |
| `frontend/src/api/rolls.js` | `stockInBulk` sends `supplier_challan_no` + `sr_no`, invoice grouping includes them |
| `frontend/src/api/mock.js` | Added `supplier_challan_no` + `sr_no` to all mock rolls, roll codes use sr_no prefix |
| `backend/app/models/roll.py` | Added `supplier_challan_no`, `sr_no` columns |
| `backend/app/core/code_generator.py` | Roll code now uses `sr_no` instead of `supplier_invoice_no` |
| `backend/app/schemas/roll.py` | Added to RollCreate, RollUpdate, RollResponse |
| `backend/app/services/roll_service.py` | Added to `stock_in()` and `_to_response()` |
| `backend/migrations/versions/6f0c...` | New migration: add columns |
| `Guardian/API_REFERENCE.md` | Updated §5 Rolls — all shapes include new fields |

---

### What Was Built in Session 21

#### P0/P1 Backend Fixes — Appendix C Alignment (6 fixes)
All backend response shapes now match `API_REFERENCE.md` Appendix C.

**P0 — Flat UUID → Nested Object (4 fixes):**
1. `lot_service.py` — `created_by: "uuid"` → `created_by_user: { id, full_name }` + `selectinload(Lot.created_by_user)` on both `get_lots()` and `_get_or_404()`
2. `batch_service.py` — `created_by: "uuid"` → `created_by_user: { id, full_name }` + `selectinload(Batch.created_by_user)` on both `get_batches()` and `_get_or_404()`
3. `batch_service.py` — `assignment.tailor_id: "uuid"` → `assignment.tailor: { id, full_name }` + `selectinload(Batch.assignments).selectinload(BatchAssignment.tailor)`
4. `inventory_service.py` — `performed_by: "uuid"` → `performed_by: { id, full_name }` + `selectinload(InventoryEvent.performed_by_user)` on `get_events()`

**P1 — Missing Fields (2 fixes):**
5. `inventory_service.py` — Added `base_price` to `sku` object in `_state_to_response()`
6. `batch_service.py` — Added `rolls_used: []` field to `_to_response()`

#### Files Changed
| File | Change |
|------|--------|
| `backend/app/services/lot_service.py` | `created_by` → `created_by_user` nested, added selectinload |
| `backend/app/services/batch_service.py` | `created_by` → `created_by_user` nested, `tailor_id` → `tailor` nested, added `rolls_used`, added selectinloads |
| `backend/app/services/inventory_service.py` | `performed_by` → nested object, added `sku.base_price`, added selectinload |

### NEXT — Page Overhauls
1. **SKUs page** — align to API_REFERENCE.md §6
2. **Lots page** — align to API_REFERENCE.md §7
3. **Batches page** — align to API_REFERENCE.md §8
4. **Orders page** — align to API_REFERENCE.md §10
5. **Invoices page** — align to API_REFERENCE.md §11

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
