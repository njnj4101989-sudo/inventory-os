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

## Current State (Session 89 — 2026-03-28)

### S89: Broker + Transport Masters + Order/Invoice Form Overhaul + Ship Modal

**29 files changed (11 new + 18 modified). 1 migration on dev.**

**Broker Master (35th model) + Transport Master (36th model):**
- `brokers` + `transports` tenant tables, full CRUD services, Brief/Create/Update/Response schemas
- API routes: `GET/POST/PATCH /brokers` + `/transports`, `/all` for dropdowns
- PartyMastersPage: "Brokers" tab (with commission %) + "Transports" tab, emerald theme fix
- QuickMasterModal: `data-master="broker"` + `data-master="transport"` → Shift+M quick-create

**Order + Invoice FK Wiring:**
- Order/Invoice models: `broker_id` FK, `transport_id` FK, `lr_number`, `lr_date` + relationships
- `create_order()`: accepts broker_id/transport_id, auto-populates legacy text fields
- `ship_order()`: accepts `ShipOrderRequest` (transport_id, lr_number, lr_date)
- `create_invoice()`: receives broker/transport/LR, creates broker commission ledger if commission_rate > 0

**Ship Order Modal:** Click "Ship" → modal with Transport, L.R. No. (required), L.R. Date

**Order Create Form Overhaul:** Broker/Transport → searchable FilterSelect, row-based design picker, single flat emerald table, inline totals

**Invoice Create Form Overhaul:** Full-width, emerald header, section header bars, emerald table header

**FilterSelect `searchable` prop:** Button → inline text input on open, type to filter

**Migration `o9i0j1k2l3m4`:** CREATE TABLE brokers + transports, ALTER orders + invoices (FK + indexes)

**NEXT:** Deploy S89 to prod. Partial order support. Reports overhaul. Remnant roll UX.

---

## Previous State (Session 87-88 — 2026-03-27)

### S87-S88: Invoice System Overhaul + Palla Input Fix

**19 files changed. 2 migrations deployed to dev + prod. 2 commits pushed.**

**Invoice Standalone Create (new feature):**
- `POST /invoices` — create invoice without an order (direct sale)
- Invoice model: `order_id` now nullable, added `customer_id` FK, `customer_name/phone/address`, `gst_percent`
- `InvoiceCreate` + `InvoiceItemInput` request schemas
- `create_standalone_invoice()` service — SKU lookup, line items, ledger debit entry
- InvoicesPage: "New Invoice" button + full-screen create overlay (customer picker, GST%, discount, SKU line items, notes, live summary)

**Invoice Cancel:**
- `POST /invoices/{id}/cancel` — only draft/issued, reverses ledger (credit note)
- Cancel button + red confirmation modal on detail overlay
- "Cancelled" tab in filter pills

**GST/Discount on Orders + Invoices:**
- `gst_percent` + `discount_amount` on Order model/schema/service/response
- `gst_percent` on Invoice model — drives CGST/SGST split (was hardcoded 18%)
- Order create form: discount input in summary, GST calc uses actual percent
- Order detail: Subtotal → Discount → CGST/SGST → Grand Total breakdown
- Invoice print + detail: dynamic GST% (was hardcoded 9%/9%)

**Order → Invoice Link:**
- `selectinload(Order.invoices)` on order queries
- Order response includes `invoices[]` array
- Order detail: invoice link button for shipped orders

**Company Info in Print + Auth:**
- Auth service returns `city`, `gst_no`, `address` on company response
- Invoice print + OrderPrint: company name, address, GSTIN from JWT company
- "Direct Sale" label for standalone invoices (was "Order —")

**Bill To Fallback:**
- Detail + print overlays: `inv.customer_name` → `order.customer` fallback chain
- DataTable customer column: same fallback

**Palla Input Fix (LotsPage):**
- Palla Wt + Palla Mtr: `type="text" inputMode="decimal"` with `onBlur` cascade
- Was `type="number"` with debounced `onChange` — caused input fighting and re-render jank

**Migrations deployed (dev + prod in sync):**
- `m7g8h9i0j1k2` — gst_percent + discount_amount + invoice standalone columns
- `n8h9i0j1k2l3` — due_date, payment_terms, place_of_supply, hsn_code, partial unique index

**NEXT:** Reports overhaul. Supplier master invoice filter. Remnant roll UX (needs spec).

---

## Previous Sessions (S76-S86) — Multi-Company, Auth, UI, Orders

- **S86:** Over-order + reservations, pipeline_qty on SKUs, order form overhaul. Migrations: `j4d5e6f7g8h9`, `k5e6f7g8h9i0`, `l6f7g8h9i0j1`
- **S85:** Premium login, PurchaseItem model (34th), purchase-stock endpoint, SKU page redesign. Migration: `i3c4d5e6f7g8`
- **S84:** Challan CRUD consolidation, edit/cancel challan (5 safety guards). Migration: `h2b3c4d5e6f7`
- **S83:** Full app typography + emerald theme (25 files, FilterSelect, all 14 pages typo-* migrated)
- **S82:** Full audit — 7 critical + 23 warnings (BLS->FBL, FOR UPDATE, model sync). Migration: `g1a2b3c4d5e6`
- **S81:** Deploy S80, product type overhaul (FBL/SBL/LHG/SAR + palla_mode). Migrations: `e8a4b2c6d9f1`, `f9b5c3d7e2a4`
- **S80:** Multi-design lots (designs JSON), batch.design_no, lot code LT-{PT}-XXXX, OrderPrint+PackingSlip. Migration: `d7f3a1b4c5e2`
- **S79:** Global typography system (24 typo-* classes, 47 files migrated)
- **S78:** Multi-company UX (auto-refresh JWT, company picker keyboard, default company, asyncpg fix)
- **S77:** FY counter reset + scoping (fy_id on 9 models), auth hardening (JTI, blacklist, rotation), DB hardening (52 FK, 19 indexes, 6 CHECKs). Migrations: `a4c7b2e1f3d9`, `b5d8e3f2a1c0`, `c6e9f4a3b2d1`
- **S76:** Multi-company schema-per-tenant (5 public + 28 tenant), HttpOnly cookie JWT, FY closing. Baseline: `d5de97f3daf8`

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
| S89 | Broker + Transport Masters + Ship Modal | Broker model (35th, commission_rate), Transport model (36th), broker_id/transport_id/lr_number/lr_date on Order+Invoice, ShipOrderRequest, broker commission ledger, Order form overhaul (row-based design picker, searchable FilterSelect), Invoice form overhaul, PartyMastersPage 5 tabs, FilterSelect searchable prop |
| S87 | Sale Invoice Polish + Standalone | Standalone invoices (POST /invoices, no order), cancel invoice + ledger reversal, gst_percent/discount_amount on orders+invoices, dynamic GST split (was hardcoded 18%), order→invoice link, company info in prints, create invoice overlay, Bill To fallback for standalone |
| S86 | Over-Order + Pipeline + Order Overhaul | Over-order with reservations (short_qty, has_shortage), pipeline_qty on SKUs (read-only from batches), reservation CHECK fix, order form overhaul (8-field header, per-SKU pricing, flat line-items table, Notes+Summary layout, GST%, broker, transport, order_date), 3 migrations |
| S85 | Login + Purchase Stock + SKU Redesign | Premium login (emerald, illustration, frosted glass), order create Decimal fix, PurchaseItem model (34th), purchase-stock endpoint, SKU page tabs + overlay, FilterSelect type-ahead + arrow keys, invoice type badges |
| S84 | Challan CRUD + Cancel + Auto-Fill | Removed sendForProcessing (all sends via Job Challans), edit challan UI (both types), cancel challan with 5 safety guards + migration, processing tab challan column, auto-fill debounce fix |
| S83 | Typography + Emerald Theme | 25 files: FilterSelect component, emerald tabs/buttons/focus/sidebar, collapsible roll picker, LedgerPanel redesign, all 14 pages typo-* migrated, guardian.md Protocol 10 rules 6-12 |
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
├── backend/app/        ← FastAPI (models/36, schemas/23, services/21, api/20, core/, tasks/3)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
