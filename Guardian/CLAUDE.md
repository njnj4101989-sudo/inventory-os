# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → http://localhost:5173
3. **Production:** `https://inventory.drsblouse.com` (Vercel ✅) + `https://api-inventory.drsblouse.com` (AWS EC2 ✅)
4. Login: `admin` → `/dashboard` | `tailor1` → `/my-work` | `checker1` → `/qc-queue`

---

## Document Directory

| Document | Purpose | When to Read |
|----------|---------|-------------|
| `CLAUDE.md` | Session log, project state, architecture | Every session start |
| `guardian.md` | Protocols, rules, coding standards | Before any coding |
| `API_REFERENCE.md` | **THE** source of truth for API shapes | Before any frontend↔backend work |
| `MASTERS_AND_FY_PLAN.md` | Party Masters + Ledger + FY plan (Phases 1-4) | Before any masters/FY work |
| `MULTI_COMPANY_PLAN.md` | Schema-per-company + FY-at-login plan (4 phases) | Before any multi-company work |
| `STEP1_SYSTEM_OVERVIEW.md` | Role matrix, production flow | Architecture decisions |
| `STEP2_DATA_MODEL.md` | 24 tables, columns, types, FKs | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, 7-state batch machine | Business logic |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning |
| `AWS_DEPLOYMENT.md` | Hybrid deploy plan (Vercel + EC2 + RDS) | Deployment day |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `STEP3 §3.4` | Deploy → `AWS_DEPLOYMENT.md`

---

## Current State (Session 82 — 2026-03-23)

### S82: Full Audit — 7 Critical + 23 Warnings Fixed

**Tier 1 (critical):** close_preview crash, BLS→FBL defaults (16 refs across model/schemas/services/frontend), InventoryPage+SKUsPage filters, FY closing FOR UPDATE lock
**Tier 2 (edge cases):** Pydantic date validation on CloseFYRequest, palla_mode CHECK constraint + migration `g1a2b3c4d5e6`, 21 model ondelete/index gaps synced with DB hardening, zero-size design rejection, batch claim/assign FOR UPDATE
**Tier 3 (polish):** auth search_path try/finally, roles HTTPException→AppException, MastersPage BLS placeholder, MyWorkPage alert→inline banner

**Files:** 28 changed across 2 commits. Migration applied on prod. All deployed.

**NEXT:** Test full cutting sheet flow end-to-end on prod with new product types. Remnant roll UX (needs spec).

---

## Previous State (Session 81 — 2026-03-22)

### S81: Deploy S80 + Palla Unit Logic + Product Type Overhaul + UX Fixes

**Deployed S80 to production:**
- Committed + pushed all S80 changes (31 files, +873/-245)
- CI/CD auto-deployed backend (migration `d7f3a1b4c5e2`) + Vercel frontend

**Lot create CORS/500 fix:**
- Root cause: `lots.design_no` NOT NULL on prod DB — new code no longer sets it (uses `designs` JSON)
- Migration `e8a4b2c6d9f1`: makes `design_no` + `default_size_pattern` nullable on existing schemas
- Browser showed CORS error but actual issue was 500 from DB constraint violation

**Product Type overhaul:**
- 4 product types: FBL (Fancy Blouse), SBL (Stretchable Blouse), LHG (Lehenga), SAR (Saree)
- Old codes removed: BLS→FBL, KRT→SBL, DRS→LHG, OTH deleted
- `palla_mode` column on ProductType: `weight` | `meter` | `both`
- FBL=meter, SBL=both, LHG=both, SAR=meter
- Migration `f9b5c3d7e2a4`: adds column, renames codes, updates existing lots
- Seed data updated for new companies
- Frontend: Palla Wt / Palla Mtr inputs show/hide based on selected type's palla_mode
- Type field moved before Lot No. in cutting sheet, autoFocus on Type

**Palla calculation per roll unit (kg vs meters):**
- Backend: `lot_service` checks `roll.unit` — meter rolls divide by `standard_palla_meter`, kg rolls by `standard_palla_weight`
- Frontend: `getPallaForRoll()` assigns correct palla value per roll's unit
- Palla Wt input propagates only to kg rolls, Palla Mtr only to meter rolls
- Remnant/usable filter uses unit-aware palla threshold

**QR Label compact:**
- Replaced long supplier name with `Sr / Inv` (e.g. `19 / 431`) — fits label width

**CuttingSheet dynamic unit:**
- Headers show `Roll Wt (m)` / `Palla Wt (m)` for meter rolls, `kg` for kg rolls
- Totals use dynamic unit, `lot_rolls` response now includes `roll.unit`

**Roll picker unit display:**
- Roll chips show actual unit (`28.5 m` or `45.2 kg`) instead of hardcoded kg
- Group header totals show correct unit

**LotsPage full-width + typography:**
- Removed `max-w-5xl` from create and detail overlays — uses full viewport
- All `text-[10px]`/`text-[11px]` replaced with `typo-label-sm`, `typo-th`, `text-xs`
- Size inputs widened, labels darker, filter buttons/dropdowns bumped

**Prod data cleanup:**
- Deleted downstream data (lots, batches, SKUs, ledger entries) with old product type codes
- Kept rolls (340), supplier invoices, suppliers, masters untouched
- Deleted extra manually-created product types (FBLS, LYCRABLS, STRETCHABL)

**Migrations:** `d7f3a1b4c5e2` (S80) → `e8a4b2c6d9f1` (nullable legacy cols) → `f9b5c3d7e2a4` (product type palla_mode)

---

## Previous State (Session 80 — 2026-03-22)

### S80: Multi-Design Lots + Print Components + Stock-In Auto-Fill

**Multi-Design Lots (structural change):**
- Lot model: `design_no` + `default_size_pattern` → `designs` JSON array `[{design_no, size_pattern}, ...]`
- One lot = one set of rolls, but **multiple designs** with independent size patterns (real-world: cutting master marks 2+ designs on same palla to minimize waste)
- `standard_palla_weight` now nullable — either weight or meter required
- Batch model: `design_no` column added — set during distribute, no longer derived from lot
- Lot code: `LOT-XXXX` → `LT-{ProductType}-XXXX` (e.g. `LT-BLS-0001`) — counter per product_type per FY
- Size chart: S, M, L, XL, XXL, 3XL, 4XL (was L, XL, XXL, 3XL)
- Distribute: iterates each design's size_pattern, creates batches per design with `design_no` set
- SKU auto-gen at pack: uses `batch.design_no` (was `lot.design_no`)
- ~20 files updated, ~50 references migrated
- Migration `d7f3a1b4c5e2`: adds `designs` JSON to lots, `design_no` to batches, backfills existing data
- API_REFERENCE.md fully updated

**LotsPage multi-design UX:**
- Repeatable design rows with add/remove in create form
- Keyboard nav: Enter/Tab through design_no → size fields → auto-add new design → Enter on empty skips to rolls
- Badge shows per-design breakdown: `2 + 10 = 12 pcs / 12 batches`
- Unit filter added to roll selection (kg/meters)
- Detail overlay and edit form show multiple designs
- CuttingSheet print shows per-design size breakdowns

**Print Components (new):**
- `OrderPrint.jsx` — A4 order confirmation sheet (wired into OrdersPage detail → Print button)
- `PackingSlip.jsx` — A4 packing slip for packed batches (wired into BatchDetailPage → Print Packing Slip)

**Stock-In Auto-Fill:**
- When fabric/design is selected in stock-in form, auto-fills Panna/GSM/Rate/Unit from most recent roll for that fabric

**RollsPage unit label fix:**
- "WEIGHTS (kg)" and "Roll Weights (kg)" labels now dynamically show the selected unit

---

## Previous State (Session 79 — 2026-03-18)

### S79: Global Typography System

**24 `.typo-*` classes in `index.css`, 47 files migrated:**
- Page titles, section headers, modal titles, table headers/cells, KPI values/labels
- Form labels, inputs, data displays, badges, buttons, nav, tabs, captions, empty states
- All per-file `LABEL`/`INPUT_CLS`/`SECTION_TITLE` constants removed
- Print components (JobChallan, BatchChallan, CuttingSheet, LabelSheet) untouched — inline styles required
- Font weights upgraded: labels now `font-semibold` (was `font-medium`), text colors darker
- Protocol 10 added to `guardian.md`

---

## Previous State (Session 78 — 2026-03-18)

### S78: Multi-Company UX + Company Picker Keyboard + DB Stability

**Auto-refresh JWT after company creation:**
- `selectCompany(newCompany.id)` called after `createNewCompany()` — JWT gets company context immediately, no double logout
- Conditional success messages: "you're all set" (if FY exists) or "create a Financial Year to start working" (auto-switches to FY tab)
- FY creation success toast added

**Company Profile fix:**
- `GET /company` and `PATCH /company` now use `company_id` from JWT (was `SELECT ... LIMIT 1` — always returned first company)

**Default company logic fix:**
- Creating a new company no longer steals `is_default` from existing company
- First company = default, subsequent companies = `is_default=False`
- `POST /companies/set-default` endpoint + "Set as Default" button on Companies tab
- "Default" badge on company cards

**Company picker keyboard navigation:**
- Arrow Up/Down to move selection, Enter to continue
- Auto-focus on default company, `stopPropagation` to prevent double-submit
- Form wrapper for native Enter submission

**FY tab company context:**
- "Managing financial years for {company name}" indicator

**Companies list fix:**
- `GET /companies` now returns `is_active`, `city`, `gst_no`, `is_default` per user (was missing, caused "Inactive" badge)

**DB stability (asyncpg):**
- `prepared_statement_cache_size=0` on engine — eliminates `InvalidCachedStatementError` after schema creation
- Correct fix for multi-tenant apps that create schemas dynamically

**Cleanup:**
- Deleted `backend/inventory_os.db.bak` (old SQLite backup from S76)

**TODO (next session — S79):**
- [ ] Remnant roll UX improvements (needs spec)
- [ ] Deploy S78 changes to production

---

## Previous State (Session 77 — 2026-03-17)

### S77: FY Counter Reset + FY Scoping + Auth Hardening + DB Hardening

**Phase 4c — Counter Reset per FY:**
- `fy_id` FK added to 4 models: Lot, Batch, JobChallan, BatchChallan (9 total now have fy_id)
- Code generators filter by fy_id: LOT/BATCH/ORD/INV/JC/BC codes reset per FY
- Roll codes unchanged (prefix-scoped, not FY-scoped)
- `get_fy_id(user)` helper in dependencies.py — extracts from JWT, clear error if missing
- All create endpoints set fy_id on records, all auto-ledger entries include fy_id

**FY Scoping on List Endpoints:**
- All 11 list endpoints filter by current FY + active items from previous FYs
- Active-status carry-over: in_stock/remnant rolls, open lots, unpacked batches, pending orders, open challans visible across FY boundaries
- Terminal-state records only visible in their creation FY
- Dashboard financial-report FY-scoped

**FY Expiry Banner:**
- JWT now carries `fy_start_date` + `fy_end_date`
- Layout.jsx: amber warning banner when current FY has ended
- Admin gets "Go to Settings" button, non-admin sees message only

**Auth Hardening:**
- JWT `jti` (unique ID) on all tokens for blacklisting
- `public.token_blacklist` table + migration
- Logout: blacklists both access + refresh tokens server-side
- Refresh: token rotation (old refresh blacklisted, new one issued)
- `get_current_user()`: checks blacklist before processing request
- JWT secret validation: production startup blocked with placeholder secrets
- Background task: purges expired blacklist entries every 6h

**Frontend Auth Migration:**
- 5 pages migrated from dead `localStorage.getItem('user')` to `useAuth()` hook
- BatchesPage, BatchDetailPage, MyWorkPage, QCQueuePage, ScanPage
- Silent `.catch(() => {})` replaced with `console.error` on 5 pages
- FY close success toast on SettingsPage

**DB Hardening (migration `c6e9f4a3b2d1`):**
- 52 FK ondelete rules added (SET NULL / RESTRICT / CASCADE as appropriate)
- 19 missing indexes on FK columns + party master search columns
- 6 CHECK constraints on status columns (RollProcessing, BatchProcessing, Order, Invoice, Reservation, FinancialYear)
- 5 UNIQUE constraints (Color/Fabric/ProductType/ValueAddition name + LotRoll compound)
- All model definitions updated to match (new companies inherit hardening)
- `migrations/tenant_utils.py` — reusable helpers for future multi-tenant migrations
- Protocol 9 added to guardian.md (multi-tenant migration rules)

**Bug Fixes:**
- Supplier `_to_response()` missing 14 fields (due_days, credit_limit, TDS, MSME, etc.) — switched to Pydantic `SupplierResponse.model_validate()`
- `batch_challan_service.receive_challan()` missing FOR UPDATE (race condition)
- guardian.md: auth section updated (was still saying localStorage), DB section updated (was saying SQLite)

**Migrations:** `a4c7b2e1f3d9` (fy_id columns) → `b5d8e3f2a1c0` (token_blacklist) → `c6e9f4a3b2d1` (DB hardening)

**Production Deployment Fixes (post-commit):**
- `upsert_company` no longer creates bare company without schema — raises error
- Company context guard on all FY + company-profile endpoints
- Login redirects admin to Settings when no company exists
- Settings auto-opens Companies tab when no company
- Deployed to prod: DB wiped, recreated from models, 5 users seeded + linked

**TODO (next session — S78):**
- [ ] Auto-refresh JWT after company creation (avoid double logout)
- [ ] Success messages on company + FY creation
- [ ] Link other users to company on company creation (currently only creator is linked)
- [ ] Min Weight filter on RollsPage invoice view (cutting sheet already has palla-weight filter)
- [ ] Remnant roll UX improvements

---

## Previous State (Session 76 — 2026-03-17)

### S76: Multi-Company Schema-Per-Tenant + HttpOnly Cookie Auth + FY Closing

- Local PG 18.3 replaces SQLite, `aiosqlite` removed
- 5 public tables: companies, users, roles, user_companies, token_blacklist
- 28 tenant tables per company schema (`co_{slug}`)
- Schema provisioning: `create_company()` → PG schema + 28 tables + master inheritance
- HttpOnly cookie JWT (access_token path=/, refresh_token path=/api/v1/auth)
- `/auth/me` single source of truth, `/auth/select-company` for switching
- TenantMiddleware: `SET search_path TO {schema}, public` per request
- FY closing: snapshot → close → create new FY → opening ledger entries (atomic)
- Frontend: company picker, switcher, FY badge, Settings page (Company/FY/Companies tabs)
- 6 production blockers fixed (annotations, 401 loop, transactional company create, etc.)

**Commits:** `6ebcdc8` | 60 files, +3279/-958

---

## Previous Sessions (S65–S75) — Masters, Ledger, Party Detail

- **S75:** Party detail UI (full-page overlay, 3-col cards, KPI strip), API_REFERENCE.md updated
- **S74:** MASTERS_AND_FY_PLAN complete — TDS/TCS forms, customer picker, Ledger system (28th model), SKU enrichment, Company+FY models (29th, 30th)
- **S73:** Color FK on rolls+SKUs, prod DB wiped, Customer model (27th), enriched Supplier+VAParty (+14/+19 cols), PartyMastersPage (3 tabs)
- **S72:** Production hotfixes x3 — Decimal+float TypeError, lot distribute without batches, MissingGreenlet
- **S71:** Bulk receive endpoint (1 call vs 62), 3-state challan, ChallansPage, print refactor
- **S70:** VA receive hotfix — 5 missing selectinloads, pagination fix
- **S69:** VA Party model (26th), va_party_id FK replaces vendor_name, challan edit, Shift+M fix
- **S68:** Stock-in UX, SupplierInvoice model (25th), GST% dropdown, keyboard shortcuts
- **S67:** VA diamond timeline, tailor/checker mobile glow-up, notification bell fix
- **S66:** QC UX (All Pass/Mark Rejects), remnant roll status, bulk VA receive by challan
- **S65:** Login UX — password eye toggle, CapsLock warning

---

## Previous Sessions (S59–S64) — Backend Audit Sprint

- **S64:** Phase 4 Production Readiness — 9 fixes deployed. Audit COMPLETE.
- **S63:** Phase 3 Data Flow — 9 fixes (FOR UPDATE, remaining_weight CHECK, lot state machine)
- **S62:** Phase 2 Query Optimization — 14 fixes (~50% fewer DB round-trips)
- **S61:** Phase 1 DB Structure — 26 fixes (indexes, CHECK constraints, ondelete rules)
- **S60:** Bulk stock-in + supplier invoices endpoints + mock vs real audit
- **S59:** Stock-in bug blitz — 7 bugs fixed + compact ERP UI

---

## Previous Sessions (S54–S58) — VA Tracking, Deploy, Quick Master

- **S58:** Quick Master (Shift+M) — useQuickMaster hook + QuickMasterModal
- **S56:** AWS Backend LIVE — EC2+RDS+Nginx+SSL+CORS, `api-inventory.drsblouse.com`
- **S55:** Vercel Frontend Deploy — `inventory.drsblouse.com` LIVE
- **S54:** Batch VA "Out for VA" tab + BatchChallan print

---

## Phase Tracker

**PHASE A (S1-42):** Full stack scaffold + 14 pages + QR system + lots + batches + print + PWA + mobile — ALL COMPLETE

**PHASE B (S46-52):** Page Overhauls — ALL COMPLETE
- S46: Per-Color QC + SKU Auto-Gen | S47: SKU Detail + Color Master | S48: Orders + Invoices overhaul
- S49: Order Create Picker + Typography + Keyboard | S50: KPI Typography + Dashboard Grid + Sidebar
- S51: Invoice-to-Lot Shortcut (A+B+C) | S52: Roll Picker Group By

**PHASE B-VA (S43-45, S54):** Batch VA + Packing — ALL COMPLETE
- S43: Backend (BatchChallan + BatchProcessing models, 7-state machine, 6 endpoints)
- S44: Frontend (VA modals, permission system upgrade)
- S45: Testing + docs (dashboard KPIs, E2E audit, batch passport print)
- S54: Out for VA tab + BatchChallan print + next-number preview

**PHASE C: Deploy**

| # | Step | Status |
|---|------|--------|
| C1 | SQLite → PostgreSQL migration code | ✅ S53 |
| C2 | SSE backend — EventBus + streaming endpoint | ✅ S53 |
| C3 | SSE frontend — Toast + Bell + Notifications | ✅ S53 |
| C4 | AWS EC2 + RDS setup | ✅ S56 — `api-inventory.drsblouse.com` LIVE |
| C5 | Vercel frontend deploy + GoDaddy DNS | ✅ S55 — `inventory.drsblouse.com` LIVE |
| C6 | CI/CD GitHub Actions | ✅ S57 — backend auto-deploy on push, Vercel handles frontend |
| C7 | CORS production config | ✅ S56 — removed trycloudflare, added production origin |

**NICE-TO-HAVE (post-deploy):** Free size support | Feriwala (waste) | Reports enrichment | Thermal ZPL templates

---

## Key Architecture Decisions

### Batch System (S43-46)
- **7-state machine:** created → assigned → in_progress → submitted → checked → packing → packed
- **VA guard:** Can't submit/pack if BatchProcessing has `status='sent'`
- **Garment VA:** `BatchProcessing` (pieces) mirrors `RollProcessing` (kg). `BatchChallan` (BC-xxx) mirrors `JobChallan` (JC-xxx)
- **Packing:** Light — fields on Batch (packed_by, packed_at, pack_reference). `packed` fires `ready_stock_in`
- **Permissions:** 4 batch permissions configurable from Roles page. Backend: `require_permission()`. Frontend: `perms.batch_*`
- **`applicable_to`** on value_additions: `roll` / `garment` / `both`
- **Per-color QC:** `color_qc` JSON on Batch. Falls back to flat `approved_qty/rejected_qty`
- **SKU auto-gen at pack:** `find_or_create()` SKU = `{product_type}-{design}-{color}-{size}+{VA1}+{VA2}` → fire `ready_stock_in` per color
- **`product_type` on Lot:** BLS/KRT/SAR/DRS/OTH → flows lot → batch → SKU code

### Weight System (3 fields on Roll)
- `total_weight` — original supplier weight, **IMMUTABLE** after stock-in
- `current_weight` — post-VA weight (mutated by receive/update processing)
- `remaining_weight` — available for cutting/lots (mutated by send/receive/lot creation)
- Partial send: `weight_before` = amount sent (not full weight). Roll stays `in_stock` if `remaining_weight > 0`
- `JobChallanCreate.rolls` = `list[{roll_id, weight_to_send}]`

### Lot System (S80 — Multi-Design)
- Statuses: open → cutting → distributed (forward-only)
- **Multi-design:** `designs` JSON array `[{design_no, size_pattern}, ...]` — one lot, multiple designs
- Both `standard_palla_weight` and `standard_palla_meter` nullable — at least one required
- Lot code: `LT-{PT}-XXXX` per product_type per FY (e.g. `LT-BLS-0001`)
- Batch has its own `design_no` — set during distribute from parent design entry
- `POST /lots/{id}/distribute` iterates each design's size_pattern → creates batches per design
- Size chart: S, M, L, XL, XXL, 3XL, 4XL (all default 0)
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header
- Keyboard nav: Enter/Tab through design fields, Enter on empty design_no → jump to rolls

### QR & Scan System
- **Static QR, Dynamic Passport** — QR printed once, scan shows live DB data
- `/scan/roll/:roll_code` — PUBLIC, Roll Passport | `/scan/batch/:batch_code` — PUBLIC, Batch Passport
- `enhanced_roll_code` = `roll_code` + received VA short codes (computed, never stored)
- `effective_sku` = `BLS-101-Pink-M+EMB+SQN` (computed from base_sku + received VAs)
- QR sizes: 130px (print), 160px (screen scan)
- Scanner: Native `BarcodeDetector` on mobile Chrome 83+, `html5-qrcode` desktop fallback

### Value Additions
- `RollProcessing.value_addition_id` — REQUIRED FK (process_type removed S26)
- 10 seed VAs: EMB, DYE, DPT, HWK, SQN, BTC (roll/both) + HST, BTN, LCW, FIN (garment)
- Color map: EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal
- Job Challans: `POST /job-challans` atomic (creates challan + sends all rolls). Auto-sequential JC-001+
- **VA Party (S69):** `VaParty` model (name, phone, city, gst_no, hsn_code). `va_party_id` FK on `JobChallan`, `BatchChallan`, `RollProcessing` — replaces free-text `vendor_name`/`processor_name`. All responses return nested `va_party` object via `selectinload`

### PWA + Mobile (S38)
- Dual layout: Tailor/Checker → `MobileLayout` (bottom tabs), Admin/Supervisor/Billing → `Layout` (sidebar)
- BottomNav: 3 tabs — Scan / My Work (or QC Queue) / Profile
- Offline queue: `useOfflineQueue` hook, localStorage-persisted, auto-syncs on reconnect
- Production CORS: `https://inventory.drsblouse.com` only

### UI Patterns
- **Print:** `react-to-print` + `useReactToPrint({ contentRef })` + fixed overlay `z-50`, A4 inline styles
- **Typography (S79):** 24 `.typo-*` classes in `index.css` control ALL text across 47 files. Inter font (400-800). See guardian.md Protocol 10 for class reference. No raw Tailwind typography, no per-file constants.
- **Roll code:** `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (Sr. No. = internal filing serial)
- **SKU pattern:** `ProductType-DesignNo-Color-Size` (e.g. `BLS-101-Red-M`)
- **Response shapes:** All FK UUIDs return nested objects. Authority: `mock.js → API_REFERENCE.md → backend`

### SSE Real-Time (S53)
- Backend: `event_bus.py` singleton → `asyncio.Queue` per client → `GET /events/stream?token=<jwt>`
- Frontend: `NotificationContext.jsx` (EventSource + exponential backoff), `Toast.jsx`, `NotificationBell.jsx`
- 10 emit calls across 6 services. 30s heartbeat. Nginx: `proxy_buffering off; proxy_read_timeout 86400;`

### AWS Deployment (S42)
- **Frontend:** Vercel (free forever) — `vercel.json` SPA rewrites + `allowedHosts`
- **Backend:** AWS EC2 t2.micro + Nginx + Gunicorn + FastAPI (free 12 months)
- **Database:** AWS RDS PostgreSQL db.t3.micro (free 12 months)
- **Cost:** ₹0 year 1, ~₹2,300/mo after. Guide: `Guardian/AWS_DEPLOYMENT.md`

### Multi-Company + Auth (S76-S77)
- **Schema-per-tenant:** 5 public tables (companies, users, roles, user_companies, token_blacklist) + 28 tenant tables per company
- **`SET search_path TO co_{slug}, public`** per request via TenantMiddleware + `get_db(request: Request)`
- **HttpOnly cookie JWT:** access_token (path=/), refresh_token (path=/api/v1/auth), SameSite=None in prod
- **Token security (S77):** `jti` on all tokens, blacklist on logout, refresh rotation, JWT secret validation
- **No localStorage for auth:** `/auth/me` is single source of truth on page load, `useAuth()` hook everywhere
- **FY scoping (S77):** fy_id on 9 models, counter reset per FY, list queries filter by FY + active carry-over
- **FY closing:** snapshot balances → close old FY → create new FY → opening ledger entries (atomic)
- **FY expiry banner (S77):** amber warning when FY end_date < today, "Go to Settings" for admins
- **Company creation:** schema provisioning + master inheritance (selective) + all hardening auto-applied via models
- **Dev DB:** PostgreSQL 18.3 local (`inventory_dev`), SQLite fully removed

### PostgreSQL Migration (S53 → S76)
- S53: SQLite dev + PostgreSQL prod. S76: **PostgreSQL everywhere** — SQLite dropped entirely
- `aiosqlite` removed, `is_postgresql()` removed, `batch_alter_table` workarounds removed
- `with_for_update()` now unconditional (no more PG conditional)
- Fresh Alembic baseline (S76): 32 tables, public/tenant split

---

## Session History (Compressed)

| Session | What | Key Changes |
|---------|------|-------------|
| S1-6 | Full Stack Scaffold | 22 models, 19 schemas, 15 services, 14 pages, auth, layout |
| S7-8 | Users & Roles + LOT entity | SKU pattern, weight-based rolls |
| S9-14 | UI Polish + Backend Integration | Suppliers, Rolls 3-tab, challan stock-in, invoice detail, filters |
| S15-20 | Backend Complete + Integration | All 13 services implemented, master data, API_REFERENCE created |
| S21-26 | QR Phase 1+2 | Labels, ScanPage, CameraScanner, ValueAddition model, enhanced_roll_code |
| S27-30 | Weight System + Job Challans | 3-weight system, partial sends, atomic bulk send |
| S31-37 | Lots + Batches + Print | Lot redesign, cutting sheet, distribution, BatchesPage, Inter typography |
| S38-42 | Mobile + Deploy Prep | PWA, dual layout, offline queue, native BarcodeDetector, AWS decision |
| S43-45 | Batch VA + Packing | 2 models, 7-state machine, 6 endpoints, VA modals, permission system, E2E audit |
| S46 | Per-Color QC + SKU Auto-Gen | color_qc on Batch, product_type on Lot, pack→auto-SKU, ready_stock_in fix |
| S47 | SKU Detail + Color Master | GET /skus/{id} with source_batches, colorUtils.js shared utility |
| S48 | Orders + Invoices Overhaul | Full rewrite both pages, design-grid create, A4 print invoice, OrderForm deleted |
| S49 | Order Picker + Typography + Keyboard | Picker pattern, .typo-label/.typo-data, full keyboard nav (Ctrl+S/Esc/Tab/Enter/Delete) |
| S50 | KPI Typography + Dashboard + Sidebar | 8 pages KPI uplift, 4+4 dashboard grid, sidebar sections (Commerce→Production→Setup) |
| S51 | Invoice-to-Lot Shortcut | LotsPage preselect receiver, Shift+Click in invoice, Create Lot button, multi-design dialog |
| S52 | Roll Picker Group By | 4 modes (Sr.No/Fabric/Color/Supplier), dynamic badges, compact dropdown |
| S53 | PostgreSQL + SSE Notifications | C1: PG migration code, C2: EventBus + SSE endpoint, C3: Toast + Bell + NotificationContext |
| S54 | Batch VA Tracking | Out for VA tab, BatchChallan print, next-number preview, onPrintChallan prop |
| S55 | Vercel Frontend Deploy | CLAUDE.md optimized (44K→12K), Vercel project + env vars + GoDaddy CNAME, `inventory.drsblouse.com` LIVE |
| S56 | AWS Backend Deploy + Mobile Fixes | C4+C7: EC2+RDS+Nginx+SSL+CORS. 3 fixes: DateTime(tz), password autoCapitalize, SW 5s timeout. Full stack LIVE |
| S57 | Roll Delete + Stock-In Edit + SSE Refresh | DELETE /rolls/{id}, partial stockInBulk, SSE token auto-refresh, batch eager loading |
| S58 | Quick Master (Shift+M) | Inline create from any form dropdown — useQuickMaster hook + QuickMasterModal + Protocol 8 |
| S59 | Stock-In Bug Blitz | 7 bugs fixed: page_size override (root cause), NaN weight, rIdx, [object Object], Ctrl+S, color reorder, orphan rolls. Invoice search + grouping collision. Compact ERP UI. Next: mock vs real audit + backend invoice layer |
| S60 | Backend Invoice Layer + DB Audit | Bulk stock-in + supplier invoices endpoints. Mock vs real audit (zero mismatches). Phase 1 DB audit: 26 findings |
| S61 | Phase 1 DB Fix + Phase 2 Audit | Fixed all 26 DB findings (indexes, checks, ondelete). Deployed to prod. Phase 2 query audit: 14 findings |
| S62 | Phase 2 Query Fixes | All 14 query findings fixed. Zero logic changes. ~50% fewer DB round-trips across dashboard, rolls, batches, lots, orders, inventory |
| S63 | Phase 3 Data Flow Integrity | 9 fixes: FOR UPDATE race protection, remaining_weight CHECK, lot state machine, code generator locking |
| S64 | Phase 4 Production Readiness | 9 fixes: Swagger disabled, strong JWT, CORS hardened, Nginx headers, structured logging, pool_pre_ping |
| S65 | Login UX | Password eye toggle, CapsLock warning, meta tag fix |
| S66 | QC UX + Remnant + Bulk VA Receive | All Pass/Mark Rejects QC, remnant roll status (full stack), palla-weight picker filter, bulk receive by challan, invoice tab bulk send fix, prod DB cleanup |
| S67 | VA Diamond Timeline + Mobile UX | Desktop timeline with VA diamonds, tailor/checker mobile glow-up, notification bell fix |
| S68 | Stock-In UX + SupplierInvoice + GST | 25th model, CapsLock-safe shortcuts, stale closure fix, GST% dropdown + totals, PATCH invoice endpoint |
| S82 | Full Audit — 3 Tiers | 7 critical + 23 warnings fixed: close_preview crash, BLS→FBL (16 refs), FY/batch FOR UPDATE, model ondelete/index sync (21 gaps), palla_mode CHECK, zero-size guard, Pydantic dates, auth try/finally, roles AppException, MyWorkPage banner |
| S81 | Deploy S80 + Product Type Overhaul | Deployed S80+S81, 4 product types (FBL/SBL/LHG/SAR), palla_mode, palla unit logic, QR compact, CuttingSheet dynamic unit, LotsPage full-width |
| S80 | Multi-Design Lots + Print + Auto-Fill | designs JSON replaces design_no+default_size_pattern, batch.design_no, lot code LT-{PT}-XXXX, 7 sizes, OrderPrint+PackingSlip, stock-in auto-fill, unit filter+label fix |
| S79 | Global Typography System | 24 typo-* classes in index.css, 47 files migrated, all per-file constants removed, font weights upgraded, Protocol 10 added |
| S78 | Multi-Company UX + Picker Keyboard + DB Stability | Auto-refresh JWT after company creation, company profile uses JWT company_id, default company logic fix, set-default endpoint+UI, company picker keyboard nav, FY tab company indicator, asyncpg prepared_statement_cache_size=0, deleted SQLite backup |
| S77 | FY Counter Reset + Auth Hardening + DB Hardening | fy_id on 9 models, counter reset per FY, FY scoping on 11 list endpoints, active-status carry-over, token blacklist+JTI+rotation, JWT secret validation, 52 FK ondelete, 19 indexes, 6 CHECKs, 5 UNIQUEs, localStorage→useAuth migration, supplier response fix |
| S76 | Multi-Company + Auth + FY Closing | Schema-per-tenant (5 public + 28 tenant), HttpOnly cookie JWT, company picker/switcher, master inheritance, FY closing with balance carry-forward |
| S75 | Party Detail UI + API Docs | Full-page detail overlay, API_REFERENCE.md updated |
| S74 | MASTERS_AND_FY_PLAN COMPLETE | TDS/TCS forms, customer picker, Ledger (28th model), SKU enrichment, Company+FY (29th, 30th) |
| S73 | Color FK + DB Wipe + Party Masters | color_id FK, Customer model (27th), enriched Supplier+VAParty, PartyMastersPage |
| S72 | Production Hotfixes x3 | Decimal+float, lot distribute, MissingGreenlet |
| S71 | Bulk Receive + ChallansPage | Single-call bulk receive, 3-state challan, ChallansPage |
| S70 | VA Receive Hotfix | 5 missing selectinloads, pagination fix |
| S69 | VA Party Master + FK Wiring | 26th model, va_party_id FK replaces vendor_name |

**Backend audit COMPLETE (S60-S64).** 4 phases, 59 findings, 58 fixed, 1 deferred. See `BACKEND_AUDIT_PLAN.md`.

---

## Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1 — password: `test1234`
- **Real DB login:** admin/supervisor/billing/tailor1/checker1 — password: `test1234`
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## Project Structure
```
inventory-os/
├── Guardian/           ← Docs (CLAUDE.md, guardian.md, API_REFERENCE.md, STEP1-6, AWS_DEPLOYMENT.md)
├── backend/app/        ← FastAPI (models/33, schemas/21, services/19, api/18, core/, tasks/3)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
