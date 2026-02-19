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

## Current State (Session 25 — 2026-02-19)

### What's Done
- **Phase 6A (Backend):** COMPLETE — 21 models, 18 schemas, 14 services, 15 routers, 80+ endpoints
- **Phase 6B (Frontend):** COMPLETE — 14 feature pages, 135+ modules, 0 build errors
- **QR/Print Labels Phase 1:** COMPLETE — full end-to-end
- **QR Phase 2 (Value Additions + Enhanced Roll Code):** COMPLETE — see below
- **Real backend active:** `VITE_USE_MOCK=false` — all data from SQLite via FastAPI
- **API_REFERENCE.md:** Updated — §5 rolls include `enhanced_roll_code`, §15 value additions

### What's Built This Session (Session 25)

#### QR Phase 2 — Value Additions + Enhanced Roll Code COMPLETE

**Core concept:** When a roll goes through value-adding processes (embroidery, dying, etc.), the enhanced roll code reflects it:
```
Base:     1-COT-GREEN/01-01
+EMB:     1-COT-GREEN/01-01+EMB
+EMB+DYE: 1-COT-GREEN/01-01+EMB+DYE
```
- `roll_code` stays immutable (QR encodes this)
- `enhanced_roll_code` is computed from `roll_code` + received value addition short codes
- Never stored — assembled on-the-fly from processing_logs

**Backend changes:**
| File | Change |
|------|--------|
| `models/value_addition.py` | NEW model: name, short_code (3-4 chars), description, is_active |
| `models/roll.py` | Added `value_addition_id` FK + relationship on RollProcessing |
| `models/__init__.py` | Registered ValueAddition |
| `schemas/master.py` | ValueAddition CRUD schemas (Brief, Create, Update, Response) |
| `schemas/roll.py` | Added `value_addition_id` to SendForProcessing + UpdateProcessingLog |
| `services/master_service.py` | Full CRUD for value additions |
| `services/roll_service.py` | `enhanced_roll_code` computed in `_to_response()`, `value_addition` nested in processing logs, passport splits VA vs regular processing |
| `api/masters.py` | 4 new endpoints: GET/GET-all/POST/PATCH value-additions |
| `seeds/seed_data.py` | 6 seed value additions (EMB, DYE, DPT, HWK, SQN, BTC) |
| `migrations/versions/eef26a6af67d_...` | value_additions table + FK on roll_processing |

**Frontend changes:**
| File | Change |
|------|--------|
| `api/mock.js` | Added `valueAdditions` mock data array |
| `api/masters.js` | Added getValueAdditions, getAllValueAdditions, createValueAddition, updateValueAddition |
| `pages/MastersPage.jsx` | 4th tab "Value Additions" with CRUD table |
| `pages/RollsPage.jsx` | Value Addition dropdown in Send for Processing modal, enhanced_roll_code shown in All Rolls + Processed columns + detail modal, VA badges in processing logs |
| `pages/ScanPage.jsx` | Separate "Value Additions" and "Regular Processing" sections, enhanced_roll_code in header |
| `components/common/QRLabel.jsx` | Label text shows enhanced_roll_code (QR still encodes base roll_code) |

### Previous Session (Session 24)

#### QR/Print Labels — Phase 1 COMPLETE (full-stack)

**Label Sheet (A4 Print)**
- 3 columns per row, content-height rows (no wasted space)
- `break-inside: avoid` on each label — no label cut across page boundaries
- Removed `position: fixed` from print CSS (was causing page overflow/clipping)
- Label content: Roll Code (bold) + Weight + Supplier + Date (minimal, clean)
- Removed Fabric, Color, Sr.No from label (redundant — in roll code already)

**Roll Code on Labels — Real Data Fix**
- `stockInBulk` result was discarded; `roll_code: '…'` hardcoded as placeholder
- Fix: after stock-in, fetch fresh rolls by `sr_no` from backend → real roll codes
- Backend: added `sr_no` filter to `RollFilterParams` schema + `get_rolls()` service
- Response path corrected: `res.data.data` (not `res.data.data.data`)

**Backend (all verified working)**
| Endpoint | Auth | Status |
|----------|------|--------|
| `POST /rolls` | Required | ✅ Returns full roll with `roll_code` |
| `GET /rolls?sr_no=X` | Required | ✅ Filter by sr_no (newly added) |
| `GET /rolls/{roll_code}/passport` | **Public** | ✅ Full chain: origin→processing→lots→batches |

**Frontend (all verified working)**
| File | Purpose | Status |
|------|---------|--------|
| `QRLabel.jsx` | Single label: Roll Code + Weight + Supplier + Date | ✅ |
| `LabelSheet.jsx` | A4 sheet, 3-col, proper page breaks, professional print | ✅ |
| `CameraScanner.jsx` | Mobile camera QR scan (html5-qrcode, rear camera) | ✅ |
| `ScanPage.jsx` | Roll Passport: full chain view, sections for all stages | ✅ |
| `App.jsx` | Public route `/scan/roll/:rollCode` (no auth) | ✅ |
| `api/rolls.js` | `getRollPassport(rollCode)` → `/rolls/{code}/passport` | ✅ |

#### Files Changed This Session
| File | Change |
|------|--------|
| `frontend/src/components/common/LabelSheet.jsx` | 3-col layout, compact, proper print CSS, better fonts |
| `frontend/src/components/common/QRLabel.jsx` | QR size 88, label: Weight + Supplier + Date only |
| `frontend/src/pages/RollsPage.jsx` | Fresh roll fetch by sr_no after stock-in for real roll codes |
| `backend/app/schemas/roll.py` | Added `sr_no` to `RollFilterParams` |
| `backend/app/services/roll_service.py` | Added `sr_no` filter condition in `get_rolls()` |

### NEXT (Session 25)
1. **Page overhauls:** SKUs, Lots, Batches, Orders, Invoices (align to API_REFERENCE.md)
2. **QR Phase 2:** ValueAddition model + SKU suffixes + effective_sku (see master plan below)
3. **Real data entry:** 15-day stock entries after page overhauls confirmed working

---

## Barcode & QR System — Master Plan (Designed Session 24)

> **Read guardian.md Protocol 7 before ANY work in this area.**
> **Read API_REFERENCE.md §14 (Roll Passport) + §15 (Value Additions) for shapes.**

### Why QR (not barcode)?
- Smartphones can scan without extra hardware (everyone has a phone)
- Holds more data than Code128
- Works with cheap 2D USB scanners (₹1,500) AND phone cameras (₹0)
- Roll code fits easily: `1-COT-PINK/07-01` → well within QR capacity

### Core Insight: Static QR, Dynamic Passport
```
QR Code → printed ONCE after stock-in → stuck on roll forever
Scan → opens /scan/roll/{roll_code} → live DB data (always current)
No reprinting needed as roll moves through stages
```

### The "Full Process in One Scan" Vision
Scanning a roll QR shows its complete product passport:
```
Origin (supplier/invoice/challan/date/weight)
  → Value Additions (EMB, DYE, etc. — with vendor + cost + dates)
  → Lot (cutting details, weight used, pieces)
  → Batch (tailor, stitching status)
  → Order (customer, dispatch status)
  → Effective SKU: BLS-101-Pink-M+EMB+SQN
```

### Effective SKU System (Phase 2)
```
BLS-101-Pink-M          ← base (from Batch → SKU)
BLS-101-Pink-M+EMB      ← after embroidery returned
BLS-101-Pink-M+EMB+SQN  ← after sequin also returned
```
- `+` separates base from value additions (avoids confusion with `-` in base SKU)
- NEVER stored — always computed from base_sku + received value addition logs
- Only `status='received'` value additions count (not while still sent out)

### Phase 1 — Implementation Plan (Session 24)

#### Frontend Only — No DB changes
| Task | File | Status |
|------|------|--------|
| Install packages | package.json | ✅ |
| QR label component | `src/components/common/QRLabel.jsx` | ✅ |
| A4 label sheet (8/page) | `src/components/common/LabelSheet.jsx` | ✅ |
| "Print Labels" button in stock-in | `RollsPage.jsx` | ✅ |
| Roll Passport page | `src/pages/ScanPage.jsx` | ✅ |
| Camera scan component | `src/components/common/CameraScanner.jsx` | ✅ |
| Public route `/scan/roll/:code` | `App.jsx` | ✅ |
| Roll passport API | `src/api/rolls.js` — `getRollPassport(roll_code)` | ✅ |

#### Backend — 1 new endpoint
| Task | File | Status |
|------|------|--------|
| `GET /rolls/{roll_code}/passport` | `api/rolls.py` + `services/roll_service.py` | ✅ |

#### No new models or migrations in Phase 1

**Phase 1 COMPLETE — Session 24**

### Phase 2 — Value Additions + SKU Suffixes (Next Session)

| Task | Layer | File |
|------|-------|------|
| `ValueAddition` model | Backend | `models/master.py` (new model) |
| `value_addition_id` FK on RollProcessing | Backend | `models/roll.py` + migration |
| ValueAddition CRUD endpoints | Backend | `api/masters.py` |
| Seed 6 value additions | Backend | `seeds/` |
| Effective SKU computation | Backend | `services/roll_service.py` |
| Processing form: Value Addition dropdown | Frontend | `RollsPage.jsx` |
| MastersPage: Value Additions tab | Frontend | `MastersPage.jsx` |
| Effective SKU shown in roll detail + passport | Frontend | `ScanPage.jsx` + `RollsPage.jsx` |

### Phase 3 — Batch QR + Thermal + Finished Garment Label (Later)
- Populate `Batch.qr_code_data` on batch creation (field already exists!)
- `/scan/batch/{batch_code}` → Batch Passport
- ZPL template for Zebra thermal printers
- Finished garment label with full chain QR

### Hardware Recommendation
| Item | Model | Price | When |
|------|-------|-------|------|
| USB 2D scanner | Rida/Honeywell | ₹1,200–1,500 | Phase 1 (optional — phone works too) |
| Label sticker paper | A4 Avery-style | ₹8/sheet | Phase 1 |
| Thermal printer | TSC TE200 | ₹8,000 | Phase 3 |

### Scan URL Rules
- `/scan/roll/:roll_code` — **PUBLIC** (no auth — floor workers scan without login)
- `/scan/batch/:batch_code` — **PUBLIC** (Phase 3)
- Auth pages remain protected as before

---

### What Was Built in Session 22

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
