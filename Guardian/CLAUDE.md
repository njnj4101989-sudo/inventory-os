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
| `REPORTS_AND_INVENTORY_PLAN.md` | Reports overhaul + Inventory upgrade (3 phases) | Before any reports/inventory work |
| `FY_TRANSITION_PLAN.md` | Opening stock + FY closing fixes + valuation + verification (6 phases) | Before any FY/opening stock work |
| `MASTERS_AND_FY_PLAN.md` | Party Masters + Ledger + FY plan (Phases 1-4) — COMPLETE | Before any masters/FY work |
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

## Current State (Session 100 — 2026-04-01)

### S100: Sales Return Audit + Legacy Dead Code Cleanup + Migration Sync

**4 commits pushed. 0 new models. 0 migrations. 45 models total. FY 2026-27 Year 1 LIVE.**

**Part 1 — Sales Return Audit + Dead Code Cleanup:**
- Full codebase scan revealed Sales Return system already fully built (unrecorded session)
- Backend: SalesReturn + SalesReturnItem (41st+42nd), 5-status lifecycle, 10 endpoints, SRN-XXXX + CN-XXXX generators
- Frontend: Sales Returns tab on ReturnsPage, OrdersPage integration, SalesReturnPrint + CreditNotePrint
- Legacy dead code removed: `return_order()` (80 lines), `POST /orders/{id}/return`, `ReturnRequest` schema, `returnOrder()` frontend function — all zero callers, replaced by Sales Returns system
- S93 plan marked COMPLETE. API_REFERENCE.md updated (§10 endpoint marked removed → §25)

**Part 2 — Production Backup System (S3 + cron):**
- 6 shell scripts in `backend/scripts/backup/`:
  - `backup.sh` — daily pg_dump→S3, validates dump, prunes expired, S3 upload verification + BACKUP_FAILED flag
  - `restore.sh` — interactive S3→pg_restore with safety gate (type RESTORE to confirm)
  - `snapshot.sh` — pre-operation named snapshots (not auto-pruned)
  - `setup-backup.sh` — one-time EC2 setup (S3 bucket, .pgpass, cron, logrotate)
  - `check-backup.sh` — health check (exits 1 if no backup today)
  - `wipe-and-seed-fy.sh` — production data wipe (keeps 5 masters) + creates FY
- `pg_dump --format=custom --compress=6 --encoding=UTF8 --no-owner --no-privileges`
- S3 bucket: `inventory-os-backups-ap-south-1` (AES-256, versioned, private, STANDARD_IA)
- Retention: 30 daily + 12 monthly (auto-pruned)
- Cron: `30 20 * * *` (20:30 UTC = 2:00 AM IST)
- Supabase config removed → replaced with `BACKUP_S3_BUCKET` + `BACKUP_S3_REGION`
- CI/CD updated: deploys all backup scripts to EC2 on push

**Part 3 — EC2 Infrastructure Setup (done in-session):**
- Installed PostgreSQL 16 client (pg_dump 16.13, matching RDS)
- Installed AWS CLI v2.34.21
- Configured AWS credentials (IAM user Nitish + AmazonS3FullAccess)
- Created S3 bucket with versioning, encryption, public access block, lifecycle policy
- Set up .pgpass (mode 600), cron, logrotate, deployed scripts

**Part 4 — Backup Dry Run (wipe → restore → verify):**
- Took pre-wipe snapshot → S3 (`snapshots/pre-data-wipe_2026-04-01_08-13.dump`)
- Wiped all 35 non-master tables via TRUNCATE CASCADE — 5 masters preserved
- Restored from snapshot — 0 errors, all row counts matched exactly
- Verified: Decimal precision perfect (27.660 kg, 205.00 cost), UUIDs intact, timestamps UTC, alembic version correct
- Finding: `co_mahaveer_fabrics` schema dropped during --clean restore (was empty, company record also not in backup — consistent, not a bug)

**Part 5 — Production Data Wipe (REAL — FY 2026-27 Start):**
- Took fresh snapshot: `snapshots/pre-real-wipe_2026-04-01_08-33.dump`
- Wiped all transactional data on prod (35 tables, ~500 rows of test data)
- Kept: 21 fabrics, 28 colors, 4 product types, 10 value additions, 1 design
- FY 2026-27 created by Nit via app UI (Settings page, is_current=true)
- Verified: login works, JWT has fy_id, all endpoints return success, counters reset (ORD-0001)
- All API endpoints tested: dashboard, rolls, orders, SKUs, lots, batches, masters — all clean zeros, no errors
- **Production is LIVE on clean slate for Year 1**

**Backup recovery path:** `/home/ubuntu/scripts/restore.sh snapshots/pre-real-wipe_2026-04-01_08-33.dump`

**Known gaps documented:** See `memory/project_backup_gaps.md` — intra-day recovery, single-table restore, cross-region S3, automated verification (all Year 2 items)

**NEXT (S101):** Enter real opening stock (rolls + SKUs), party masters (suppliers, customers, VA parties, brokers, transports), opening balances. Start real transactions under FY 2026-27.

---

## Previous State (Session 99 — 2026-03-31)

### S99: design_id FK Wiring + Color/Design Dropdowns on SKU Forms

**5 commits pushed. 1 migration on dev+prod. 45 models (0 new).**

- `design_id` UUID FK (nullable, RESTRICT) on Batch + SKU models, with relationship + selectinload
- `DesignBrief` schema, `design_id` on DesignEntry (lot), PurchaseLineItem, OpeningStockLineItem, BatchResponse, SKUResponse
- Lot service stores `design_id` in designs JSON, passes to Batch on distribute
- Batch service passes `design_id` to `find_or_create` at pack, returns `design` nested object
- SKU `find_or_create` backfills `color_id` + `design_id` on existing SKUs
- Migration `b2c3d4e5f6g7`: ALTER batches+skus ADD design_id + FK + INDEX, backfill from design_no
- **LotsPage:** design_no text input → searchable FilterSelect linked to Design master. Removed autoFocus. Fixed overflow-hidden clipping dropdown (Protocol 6).
- **SKUsPage (purchase + opening stock):** design_no → FilterSelect (Design master), color → FilterSelect (Color master), `color_id` wired through opening stock path, `useQuickMaster` + `QuickMasterModal` added (3 render paths)
- **No cascading breaks:** size was already a FilterSelect, batch _to_response already returned design_no

---

## Previous State (Session 98 — 2026-03-31)

### S98: SKU Opening Stock Overhaul + Design Master + Party Unique Constraints + Inventory History

**3 commits pushed. 1 migration on dev+prod. 45 models (1 new: Design).**

**SKU Opening Stock — Moved from InventoryPage to SKUsPage:**
- Old: InventoryPage modal requiring pre-existing SKU dropdown (broken — SKUs don't exist on Day 1)
- New: `POST /skus/opening-stock` — bulk endpoint using `find_or_create` + `opening_stock` events
- Full-page overlay on SKUsPage with inline Type/Design/Color/Size/Qty/Cost fields per row
- Live status badges: green "New", blue "Exists", amber "Has Stock (X pcs)" — matched against loaded SKU list
- Post-submit skipped rows panel: shows SKUs that already have opening stock with "Adjust" button per row
- Removed opening stock button, modal, state, handlers from InventoryPage
- Fixed FilterSelect auto-select on blur (single match) — was causing "SKU disappears on save" bug
- Fixed overflow-y-auto clipping on Rolls opening stock modal + SKU opening stock table

**Design Master (45th model):**
- `Design` model: design_no (unique), description, is_active — same pattern as Fabric/Color
- Full CRUD: service, API (`/masters/designs`, `/masters/designs/all`), migration
- MastersPage: 5th "Designs" tab with DataTable + create/edit modal
- QuickMasterModal: `data-master="design"` config for Shift+M quick-create
- `data-master="design"` added to design_no inputs on LotsPage, SKUsPage (Opening Stock + Purchase)
- **NOT YET:** design_id UUID FK on Lot/Batch/SKU models — planned for S99

**Party Name Unique Constraints:**
- Case-insensitive unique index (`lower(name)`) on 5 party models: suppliers, customers, va_parties, brokers, transports
- Duplicate check in all 5 party create services: `func.lower(Model.name) == name.lower()`

**Title Case Normalization:**
- `.title()` on save for all 10 master create methods (4 ref masters + 5 parties + Design)
- "RATAN FABRICS" → "Ratan Fabrics", "chandni" → "Chandni"

**SKU Detail — Inventory History:**
- New section in SKU detail overlay showing all `InventoryEvent` records for the SKU
- Chronological table: Date, Event (colored badge), Source, +/- Qty, Cost/pc, By
- Event types: Opening Stock (amber), Stock In (green), Stock Out (red), Return (blue), Adjustment (purple), Loss (red)

**Bug Fixes:**
- Cost breakdown tab: `items` → `filteredSKUs` (ReferenceError)
- FilterSelect: auto-select on click-outside when single match (prevents "SKU disappears" bug)

**Backend files modified (10):** masters.py (API), master_service.py, supplier_service.py, customer_service.py, broker_service.py, transport_service.py, skus.py (API), sku_service.py, schemas/sku.py, schemas/master.py
**Backend files new (2):** models/design.py, migration `a1b2c3d4e5f6`
**Frontend files modified (8):** SKUsPage, InventoryPage, RollsPage, MastersPage, LotsPage, FilterSelect, QuickMasterModal, api/skus.js, api/masters.js

**NEXT (S99):** Add `design_id` UUID FK to Lot (designs JSON), Batch, SKU models. Replace design_no free-text inputs with searchable FilterSelect linked to Design master via FK. Migration + backfill. Update lot distribute, batch pack, SKU find_or_create, purchase stock, opening stock services. This is the proper FK wiring — same pattern as color + color_id.

---

## Previous State (Session 97 — 2026-03-30)

### S97: FY Transition P4-P6 + 5-Component Cost System + Tailor Costing

**1 commit pushed. 2 migrations pending on dev+prod. 44 models (2 new).**

**Phase 4 — Closing Stock Valuation Report:**
- `GET /dashboard/closing-stock-report` — 3 categories: Raw Materials (roll weight × cost), WIP (material cost, AS-2 simplified), Finished Goods (WAC from events)
- 5-column cost breakdown: Material / Roll VA / Stitching / Batch VA / Other
- Unpriced SKUs flagged with "No cost" badge instead of arbitrary estimates
- FY close snapshot: stock computed as-of `fy.end_date` using event replay (handles late close)
- For closed FYs, report reads frozen snapshot; for current FY, shows live data with source indicator

**Phase 5 — Physical Verification Workflow:**
- 2 new models: `StockVerification` (43rd), `StockVerificationItem` (44th)
- 6 API endpoints: list, create, get, update_counts, complete, approve
- Auto-populates items from current stock (finished goods: SKUs, raw material: rolls)
- Approve creates loss/adjustment events for mismatches, updates InventoryState/Roll weights
- Frontend: "Physical Verification" button on InventoryPage, modal with create/count/approve flow, history list

**Phase 6 — Party Reconciliation Report:**
- `GET /ledger/party-confirmation/{party_type}/{party_id}` — opening balance, transactions, closing balance, unpaid invoices
- "Balance Confirmation" print button on Party Detail overlay — formal A4 letter with company header, transaction table, signature line
- Works for all 4 party types (supplier, customer, va_party, broker)

**5-Component Cost System (beyond original plan):**
- `stitching_cost` + `other_cost` fields on SKU model (migration `z0a1b2c3d4e5`)
- Auto-compute at pack time in `batch_service.pack_batch()`: material + roll_va + stitching + batch_va + other → stored in `ready_stock_in` event metadata + sets `sku.base_price`
- SKUs page: new "Cost Breakdown" tab with per-SKU cost table + margin calculation + formula note
- Closing Stock Report: 5-column breakdown table + formula note at bottom

**Tailor Costing Report:**
- Tailor Performance enriched: total_stitching_cost, avg_rate, per-batch detail table
- Expandable rows: Batch / SKU / Pieces / Rejected / Rate / Cost / Date per tailor
- "Rate pending" badge when SKU.stitching_cost not set — full transparency, no fake ₹0

**Backend files modified (17):** batch_service, dashboard_service, fy_closing_service, inventory_service, ledger_service, roll_service, sku_service, dashboard.py (API), inventory.py (API), ledger.py (API), rolls.py (API), code_generator, models/__init__, sku model, sku schema, inventory schema, ledger schema, roll schema
**Backend files new (5):** stock_verification model, stock_verification schema, stock_verification_service, 2 migrations
**Frontend files modified (9):** ReportsPage, InventoryPage, SKUsPage, PartyMastersPage, RollsPage, SettingsPage, dashboard.js, inventory.js, ledger.js
**Migrations pending:** `y9z0a1b2c3d4` (stock_verifications tables), `z0a1b2c3d4e5` (stitching_cost + other_cost on SKUs)

**NEXT:** Run 2 migrations on dev+prod. Test full pack→cost flow. Test physical verification flow. Test closing stock report with real data. Update API_REFERENCE.md with all new endpoints.

---

## Previous State (Session 96 — 2026-03-30)

### S96: FY Transition P1-P3 (Opening Stock + Opening Balances + Broker Fix) + API_REFERENCE Update

**1 commit pushed (S97). 0 migrations for P1-P3. 42 models (no new models from P1-P3).**

**FY_TRANSITION_PLAN.md Created:**
- 6-phase production-grade plan: Opening Stock, Opening Balances, Broker Fix, Closing Valuation, Physical Verification, Reconciliation
- Industry standards research (AS-2, Tally behavior, WAC, GST, WIP valuation)
- Current system audit with exact file:line references
- 10 design decisions with reasoning

**Phase 1 — Opening Stock Entry (Day 1 Setup):**
- `POST /inventory/opening-stock` — bulk SKU entry: [{sku_id, quantity, unit_cost}], creates `opening_stock` events, duplicate prevention per SKU
- `POST /rolls/opening-stock` — bulk roll entry without supplier invoice, supports in-godown (`in_stock`) AND at-VA (`sent_for_processing`) rolls with RollProcessing log
- `opening_stock` event type added to InventoryService (valid_types, create_event addition group, reconcile formula)
- `adjustment` event type bug fixed — was no-op (fell through without modifying total_qty), now adds to stock
- InventoryPage: "Opening Stock" button + modal with SKU picker + qty + cost per row
- RollsPage: "Opening Stock" button + modal with fabric/color/weight/cost + "At VA" toggle with VA Party/VA Type/Sent Date fields
- Frontend API: `createOpeningStock()`, `createOpeningRollStock()`

**Phase 2 — Party Opening Balance Entry:**
- `POST /ledger/opening-balance` — single party entry with force override, user-friendly messages
- `POST /ledger/opening-balance/bulk` — multi-party single transaction, always overwrites
- `GET /ledger/opening-balance/status` — per party_type progress (with/without opening, all 4 types including broker)
- SettingsPage: "Opening Balances" tab with gradient header, 4 progress cards, sub-tabs per party type, inline amount entry, Dr/Cr toggle, "Save All" bulk submit
- `get_all_balances` balance_type bug fixed — supplier/VA else branch returned "cr" in both cases

**Phase 3 — FY Closing Broker Fix + Enhanced Preview:**
- Broker added to `_compute_all_balances`, `_create_opening_entries`, `_get_party_name`, `closing_snapshot`
- Close-preview enhanced: +4 informational warnings (active rolls, unpaid invoices, SKU stock, open challans)
- Frontend close-preview: grid 3→4 cols to show Brokers count

**API_REFERENCE.md Updated:**
- +8 dashboard endpoints documented (§12 — enhanced, sales, accounting, raw-material, wip, va, purchase, returns)
- +page-consumption routing table added to §12 header
- +2 new opening stock endpoints (§5 rolls, §9 inventory)
- +3 new opening balance endpoints (§19 ledger)

**Backend files modified (7):** inventory_service.py, inventory.py (API), roll_service.py, rolls.py (API), ledger_service.py, ledger.py (API), fy_closing_service.py
**Schema files modified (3):** inventory.py, roll.py, ledger.py
**Frontend files modified (6):** inventory.js, rolls.js, ledger.js, InventoryPage.jsx, RollsPage.jsx, SettingsPage.jsx
**Doc files modified (3):** API_REFERENCE.md, CLAUDE.md, FY_TRANSITION_PLAN.md

**NEXT:** Commit + push S96. Phase 4 (Closing Stock Valuation Report), Phase 5 (Physical Verification), Phase 6 (Reconciliation Report). BatchesPage print SKU labels after pack. Test full flow on prod.

---

## Previous State (Session 95 — 2026-03-30)

### S95: Reports & Inventory Overhaul (P1-P3) + WOW Dashboard + API_REFERENCE Update

**14 commits pushed. 0 migrations. 42 models (no new models).**

**API_REFERENCE.md Updated (S90-S94):**
- +398 lines: Shipments (§23), Return Notes (§24), Sales Returns (§25), updated statuses, nested objects, FY counters
- All S90-S94 changes documented

**Reports Page — 5 new tabs (4+5 existing = 9 total):**
- **Sales & Orders** — order KPIs, customer ranking (revenue-returns=net), fulfillment funnel, broker commission
- **Accounting** — receivables aging (0-30/31-60/61-90/90+ buckets), payables by party, GST summary, CN/DN register
- **VA Processing** — cost by vendor/VA type, turnaround time per vendor, damage tracking
- **Purchases & Suppliers** — purchase register, supplier quality scorecard (defect%), fabric utilization (waste%)
- **Returns Analysis** — customer return rate by SKU/customer, supplier returns, restock vs damage recovery rate

**Inventory Page — 2 new tabs (1 existing + 2 = 3 total):**
- **Raw Material** — roll inventory by status/fabric/supplier with weight+value KPIs
- **Work in Progress** — batch pipeline by stage/product type/tailor with avg days metric

**WOW Dashboard Redesign:**
- Smart Alerts Bar (6 alerts): unclaimed batches >24h, lots piling up, VA overdue >7d, overdue invoices, QC bottleneck >48h, low stock
- 7-day revenue bar chart with today highlight
- Invoice collection split bar (paid vs pending)
- 3 semicircle gauges: Lot Load, Tailor Utilization, QC Flow (normal/busy/overloaded)
- Batch pipeline with connecting arrows and accent-colored stage labels
- Gradient KPI cards matching Orders/Invoices/Returns pattern
- All text dark/bold/readable — no gray-400 on dashboard

**NEXT:** Update API_REFERENCE.md with 8 new dashboard endpoints, BatchesPage print SKU labels after pack, test full flow on prod

---

## Previous State (Session 92 — 2026-03-29)

### S92: Return Management System (P1-P5) + Invoice/Order Deep-Links + Constraint Fix

**6 commits pushed. 3 migrations on dev + prod. 40 models total.**

**Invoice/Order Deep-Links:**
- Order detail → INV-xxxx button now deep-links to invoice detail (`/invoices?open=<id>`)
- Invoice detail → ORD-xxxx link now deep-links to order detail (`/orders?open=<id>`)
- Both pages support `?open=<id>` query param → auto-open detail overlay

**P1 — Customer Sale Returns (quick action on Orders page):**
- `return_order()` rewrite: validates returnable qty (fulfilled - returned), creates RETURN inventory event, tracks `returned_qty` per OrderItem, determines `partially_returned` vs `returned` status, creates `credit_note` ledger entry for customer
- Return modal on OrdersPage: item picker, qty, reason dropdown (7 options), notes
- "Returned" column in items table, "Partial Return" + "Returned" filter tabs
- **NOTE:** This is a quick-action modal, NOT a full sales return document. Needs upgrade to proper SalesReturn model in S93.

**P2 — VA Damage Tracking:**
- `weight_damaged` + `damage_reason` on RollProcessing; `pieces_damaged` + `damage_reason` on BatchProcessing
- Job & batch challan receive modals: Damaged + Reason columns
- Auto debit ledger entry against VA party on damage (entry_type="adjustment", reference_type="damage_claim")

**P3 — Supplier Returns (2 new models: ReturnNote 39th, ReturnNoteItem 40th):**
- 6-status workflow: draft → approved → dispatched → acknowledged → closed (+cancelled)
- ReturnNoteService: full CRUD + lifecycle with stock reversal (roll status→returned, SKU stock_out) + supplier ledger debit on close
- 10 API endpoints, RN-XXXX code generator per FY
- ReturnsPage: KPIs, status + type tabs, create overlay, detail overlay with status timeline + action buttons
- Sidebar "Returns" link, StatusBadge styles, api/returns.js

**P4 — VA Partner Ledger Enhancement:**
- `GET /masters/va-parties/{id}/summary` — challans, costs, balance, damage claims
- VA detail KPI row (Job Challans, Batch Challans, Total Processed, Outstanding, Damage Claims)

**P5 — Integration & Polish:**
- Dashboard: Returns KPI card (this month count, draft + active breakdown)
- SSE: return_created, return_approved, return_dispatched events
- Permissions: using existing order_manage for billing/admin access

**Constraint Fix (critical):**
- SQLAlchemy `create_all()` generates `ck_{table}_{name}` constraints that duplicate our named ones
- Dropped 5 duplicate `ck_` constraints on prod (batch_challans, batch_processing, roll_processing, rolls, job_challans)
- Added auto-cleanup in `create_tenant_tables()` — new companies won't have duplicates
- Updated migration to drop both `ck_` and named variants

**Migrations on dev + prod:**
- `r2s3t4u5v6w7` — P1: returned_qty on order_items, partially_returned on orders CHECK
- `s3t4u5v6w7x8` — P2: weight_damaged/damage_reason on roll_processing, pieces_damaged/damage_reason on batch_processing
- `t4u5v6w7x8y9` — P3: return_notes + return_note_items tables, returned on rolls CHECK

**NEXT SESSION (S93): Proper Sales Return System + Pagination Discussion**

---

## S93 Plan: Sales Return System — COMPLETE (built in unrecorded session, verified S100)

**Status:** All items below implemented. Legacy quick-return endpoint removed S100. Full document-based workflow live: `draft → received → inspected → restocked → closed`. Models: SalesReturn (41st) + SalesReturnItem (42nd). Frontend: Sales Returns tab on ReturnsPage + OrdersPage integration. Print: SalesReturnPrint + CreditNotePrint.

**Original problem (solved):**

### Backend — SalesReturn Model (41st + 42nd)
- [ ] `SalesReturn` model: srn_no (SRN-XXXX per FY), order_id FK, customer_id FK, status (`draft → received → inspected → restocked → closed`), return_date, received_date, transport_id, lr_number, lr_date, reason_summary, credit_note_id FK (linked invoice), qc_notes, total_amount, fy_id
- [ ] `SalesReturnItem` model: sales_return_id FK, order_item_id FK, sku_id FK, quantity_returned, quantity_restocked (back to available), quantity_damaged (written off as loss), reason, condition (`good → restock`, `damaged → loss`, `rejected`), notes
- [ ] `SalesReturnService`: create (from order, validates shipped/delivered), receive (mark goods received, update return_date), inspect (QC — mark items as restockable/damaged), restock (RETURN inventory event for good items, LOSS event for damaged), close (create credit note invoice, customer ledger credit)
- [ ] Code generator: `next_sales_return_number()` — SRN-XXXX per FY
- [ ] API: `GET /sales-returns`, `POST /sales-returns` (from order), `POST /{id}/receive`, `POST /{id}/inspect`, `POST /{id}/restock`, `POST /{id}/close`, `POST /{id}/cancel`
- [ ] Credit note invoice: create a negative invoice linked to the return (proper CN document, not just ledger entry)

### Frontend — Sales Returns
- [ ] "Sales Returns" tab on ReturnsPage (alongside Roll Returns / SKU Returns)
- [ ] Create from order: "Create Return Note" button on shipped/partially_returned order detail → opens form with return shipment details (transport, LR, date, items from order)
- [ ] Sales Return detail overlay: status timeline (draft → received → inspected → restocked → closed), items table with condition (restockable/damaged), QC notes, credit note link
- [ ] Print: Sales Return Note / Credit Note print template

### Upgrade Existing P1 Flow
- [ ] Replace current `return_order()` modal with "Create Sales Return" that creates proper SalesReturn document
- [ ] Keep quick return validation (qty, reason) but feed into SalesReturn model instead of directly modifying order
- [ ] Order detail: show linked SalesReturn notes (like we show shipments)
- [ ] Migration: backfill existing returns (ORD-0003 has returned_qty=20) into SalesReturn records

### Other S93 Tasks
- [ ] **Pagination vs fetch-all discussion** — decide pattern for dropdowns across all pages
- [ ] Update API_REFERENCE.md — all S92 new endpoints
- [ ] Deploy S93 migrations to prod

---

## Previous State (Session 90 — 2026-03-28)

### S90: Modal ESC Isolation + Ship Without LR + E-Way Bill + FilterSelect Fixes

**3 commits pushed. 1 migration on dev + prod.**

**Modal ESC Isolation (global fix):**
- Modal.jsx: capture-phase ESC handler with `stopImmediatePropagation` + `overlayRef.contains(activeElement)` check
- Only the innermost focused modal handles ESC — no more leaking to parent forms
- Fixed stale closure in OrdersPage (`quickMasterOpen`, `shipModalOpen` missing from deps) and InvoicesPage (`quickMasterOpen`)

**Ship Without LR + E-Way Bill (Option C):**
- `ShipOrderRequest.lr_number` now optional — all ship modal fields are optional
- `eway_bill_no` + `eway_bill_date` on Order model + schema + response
- `PATCH /orders/{id}/shipping` — update transport/LR/eway on shipped orders
- `UpdateShippingRequest` schema, `update_shipping()` service method
- Ship modal: 2x2 grid (LR no/date + E-Way no/date), amber hint "add later"
- Shipped order detail: orange warning banner for missing LR/eway, "Update Shipping" button
- DataTable: orange dot badge on shipped orders missing LR
- Migration `p0j1k2l3m4n5` deployed to dev + prod

**FilterSelect Fixes:**
- `data-master` now propagated to search input (was only on button) — Shift+M picks correct master type
- Focus ring: `focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500` matching typo-input style
- Auto-focus Customer FilterSelect on New Order overlay open (was broken — `nameRef` never attached)

---

## S92: Full Return Management System + VA Partner Ledger Integration

**Goal:** Build complete return/reverse flows for all 5 external touchpoints, with proper stock reversal, ledger entries, credit notes, and approval tracking. VA Partners get full ledger parity with Suppliers/Customers.

**Design Decisions:**
- Single `ReturnOrder` model handles customer sale returns (not reusing Order)
- `DebitNote` model for supplier/VA returns (mirror of credit note concept)
- VA Partner ledger already works (job_challan + batch_challan create entries on receive) — enhance with return reversals
- Damage tracking added to VA receive flows (not a separate model — fields on existing processing models)
- Return statuses: `requested → approved → received → closed` (4-step approval)
- Stock reversal: `RETURN` event (already supported in inventory_service) for customer returns, `STOCK_IN` reversal for supplier returns
- Ledger impact: every return creates a reversal entry (credit_note for customer, debit_note for supplier/VA)

---

### Phase 1: Customer Sale Returns (Backend exists, needs UI + ledger fix)

#### Backend Fixes
- [x] **1a.** Fix `return_order()` in order_service.py — create credit_note ledger entry for customer (currently missing)
- [x] **1b.** Fix `return_order()` — support `partially_shipped`, `delivered`, `partially_returned` status (was only `shipped`)
- [x] **1c.** Add `return_date`, `return_notes` fields to ReturnRequest schema
- [x] **1d.** Add `returned_qty` tracking per OrderItem (new field, separate from `fulfilled_qty`)
- [x] **1e.** New status `partially_returned` on Order + `returned_qty` in _to_response + OrderItemResponse
- [ ] **1f.** Link return to specific Shipment — add `shipment_id` to ReturnRequest (future enhancement)
- [ ] **1g.** Create return-related invoice adjustment — credit note invoice per return (future enhancement)

#### Frontend — Order Return UI
- [x] **1h.** "Return Items" button on order detail overlay (visible when canReturn — shipped/delivered/partially_shipped/partially_returned with returnable items)
- [x] **1i.** Return modal: show returnable items → qty picker per item (max = fulfilled - already returned) → reason per item → notes → "Return N pcs" button
- [x] **1j.** Return reason dropdown: `defective`, `wrong_item`, `size_mismatch`, `color_mismatch`, `damaged_in_transit`, `customer_changed_mind`, `other`
- [x] **1k.** Items table: "Returned" column showing returned_qty (orange)
- [x] **1l.** StatusBadge: `partially_returned` → orange badge
- [x] **1m.** "Partial Return" + "Returned" tabs in order filter pills
- [x] **1n.** Add `returnOrder(orderId, data)` to frontend `api/orders.js`

#### Migration
- [x] **1o.** Migration `r2s3t4u5v6w7`: ALTER orders CHECK (add `partially_returned`), ALTER order_items ADD `returned_qty` INT DEFAULT 0 — run on dev

---

### Phase 2: VA Damage Tracking on Receive (Rolls + Batches)

#### Backend — Roll VA (Job Challan Receive)
- [x] **2a.** Add `weight_damaged` (Numeric 10,3), `damage_reason` (String 50) fields to RollProcessing model
- [x] **2b.** Update JobChallanReceiveEntry schema — add `weight_damaged`, `damage_reason` per roll entry
- [x] **2c.** Update `receive_challan()` in job_challan_service — stores damage on log, includes in _to_response
- [x] **2d.** Ledger adjustment on damage — `entry_type="adjustment"`, `reference_type="damage_claim"`, debit against VA party (proportional to processing cost)

#### Backend — Batch VA (Batch Challan Receive)
- [x] **2e.** Add `pieces_damaged` (Integer), `damage_reason` (String 50) fields to BatchProcessing model
- [x] **2f.** Update BatchChallanReceiveEntry schema — add `pieces_damaged`, `damage_reason` per batch entry
- [x] **2g.** Update `receive_challan()` in batch_challan_service — stores damage, includes in _to_response
- [x] **2h.** Ledger debit for damage — proportional cost per damaged piece against VA party

#### Frontend — Damage Tracking UI
- [x] **2i.** Job Challan receive modal: "Damaged" weight column + reason dropdown per roll
- [x] **2j.** Batch Challan receive modal (ReceiveFromVAModal): "Damaged" pieces column + reason dropdown per batch
- [x] **2k.** Damage reason options: `shrinkage`, `color_bleeding`, `stain`, `tear`, `wrong_process`, `lost`, `other`
- [x] **2l.** Batch challan detail: "Damaged" column in items table (red font with tooltip for reason)
- [ ] **2m.** VA Party detail: damage history section (future — needs aggregation endpoint)

#### Migration
- [x] **2n.** Migration `s3t4u5v6w7x8`: ALTER roll_processing ADD `weight_damaged`, `damage_reason`; ALTER batch_processing ADD `pieces_damaged`, `damage_reason` — run on dev

---

### Phase 3: Supplier Returns (Rolls + Purchased SKUs)

#### Backend — Model
- [x] **3a.** Create `ReturnNote` model (39th): return_note_no, return_type, supplier_id FK, 6-status workflow, return_date, approved_by/at, dispatch_date, transport_id, lr_number, total_amount, fy_id
- [x] **3b.** Create `ReturnNoteItem` model (40th): return_note_id FK (CASCADE), roll_id FK (nullable), sku_id FK (nullable), quantity, weight, unit_price, amount, reason, condition
- [x] Registered both in models/__init__.py

#### Backend — Schema + Service
- [x] **3c.** Create schemas: ReturnNoteCreate, ReturnNoteItemInput, ReturnNoteResponse, ReturnNoteUpdate, ReturnNoteFilterParams
- [x] **3d.** Create ReturnNoteService: list, get, create, update, approve, dispatch (stock_out for SKUs, status→returned for rolls), acknowledge, close (debit supplier ledger), cancel
- [x] **3e.** Code generator: `next_return_note_number()` — RN-XXXX per FY
- [x] **3f.** Roll return: dispatch sets roll.status = "returned" (new status in CHECK)
- [x] **3g.** SKU return: dispatch creates stock_out event with reference_type "supplier_return"

#### Backend — API Routes
- [x] **3h.** 10 endpoints: GET list, GET /next-number, GET /{id}, POST create, PATCH update, POST approve/dispatch/acknowledge/close/cancel
- [x] **3i.** Registered in router.py

#### Frontend — Return Notes Page
- [x] **3j.** ReturnsPage.jsx — full page with status tabs + type tabs (Roll Returns / SKU Returns)
- [x] **3k-l.** KPI cards (Total, Draft, Approved, Dispatched, Closed, Value), DataTable, Pagination
- [ ] **3m.** Customer Returns tab (deferred — will come with dedicated ReturnsPage tabs expansion)
- [x] **3n.** Create overlay: supplier picker, transport, LR, items table with qty/weight/price/reason
- [x] **3o.** Detail overlay: status timeline, info cards, items table, action buttons per status (Approve, Dispatch, Acknowledge, Close & Debit, Cancel)
- [ ] **3p.** Print template (deferred — future)
- [x] **3q.** api/returns.js — all 9 CRUD + status functions
- [x] **3r.** Sidebar "Returns" link in Commerce section + route in routes.js
- [x] StatusBadge: draft/approved/dispatched/acknowledged/closed styles added

#### Migration
- [x] **3s.** Migration `t4u5v6w7x8y9`: CREATE TABLE return_notes + return_note_items, ALTER rolls CHECK (add `returned`) — run on dev

---

### Phase 4: VA Partner Ledger Enhancement

#### Backend
- [x] **4a-b.** No DB CHECK constraints exist on ledger_entry — entry_type/reference_type are plain String fields. Using `entry_type="adjustment"` + `reference_type="damage_claim"` (already working from P2)
- [x] **4c.** VA Party payment: verified — works via `POST /ledger/payment` with `party_type="va_party"`, LedgerPanel supports it
- [x] **4d.** VA Party balance: verified — PartyMastersPage shows balance correctly via `getAllBalances("va_party")`
- [x] **4e.** `GET /masters/va-parties/{id}/summary` — job_challans (count+cost), batch_challans (count+cost), total_processed_cost, balance (debit/credit), damage_claims (count+amount)

#### Frontend — VA Partner Ledger Panel Enhancement
- [x] **4f-j.** VA Party detail: new KPI row (Job Challans, Batch Challans, Total Processed, Outstanding, Damage Claims) — fetches from summary endpoint, shows below existing KPI strip
- [x] `getVAPartySummary()` added to api/masters.js
- [ ] **4g-i.** Separate Challans/Damage/Payments tabs (deferred — current LedgerPanel + summary KPIs cover the core need)

#### Migration
- [x] **4k.** No migration needed — no CHECK constraints on ledger_entries

---

### Phase 5: Integration + Polish

#### Cross-Cutting
- [x] **5a.** Dashboard: Returns KPI card in out-house section (this month count, draft + active breakdown)
- [ ] **5b.** Reports: Returns report (deferred — needs dedicated reports overhaul)
- [x] **5c.** SSE events: `return_created`, `return_approved`, `return_dispatched` emitted from ReturnNoteService
- [x] **5d.** Permissions: using existing `order_manage` permission for all return endpoints (same billing/admin access)

#### Documentation
- [ ] **5e.** Update API_REFERENCE.md — new endpoints (deferred to dedicated docs session)
- [x] **5f.** Update CLAUDE.md — S92 session summary + checklist

---

### Summary

| Phase | What | New Models | Files (~) |
|-------|------|-----------|-----------|
| **P1** | Customer Sale Returns | 0 (enhance existing) | ~8 |
| **P2** | VA Damage Tracking | 0 (add fields) | ~10 |
| **P3** | Supplier Returns | 2 (ReturnNote + ReturnNoteItem) | ~12 |
| **P4** | VA Partner Ledger Enhancement | 0 | ~6 |
| **P5** | Integration + Polish | 0 | ~5 |
| **Total** | | **2 new models (39th, 40th)** | **~41 files** |

**Phases are independent — can stop after any phase. P1 is highest business impact.**

---

## Previous State (Session 91 — 2026-03-29)

### S91: Partial Order Support (Shipment Model)

**6 new files + 14 modified = 20 files. 1 migration on dev. Frontend builds clean.**

**New Models (37th + 38th):**
- `Shipment`: shipment_no, order FK, transport FK, LR/eway fields, invoice FK, fy FK
- `ShipmentItem`: shipment FK (CASCADE), order_item FK, sku FK, quantity

**Backend Changes:**
- `ship_order()` rewritten — accepts `items[]` (partial) or None (ship all remaining), creates Shipment + ShipmentItems, increments `fulfilled_qty`, STOCK_OUT per shipment item, proportional reservation confirmation, status = `partially_shipped` or `shipped`
- Stock validation at ship time — `available_qty >= ship_qty` with FOR UPDATE lock, rejects if insufficient
- `create_invoice_for_shipment()` — invoice per shipment, proportional discount, broker commission, customer ledger
- `ShipmentService` — get_shipments(order_id), update_shipment(id, data)
- API: `GET /orders/{id}/shipments`, `GET /shipments/{id}`, `PATCH /shipments/{id}`
- Code generator: `next_shipment_number()` — SHP-XXXX per FY

**Frontend Changes:**
- Ship modal: shows unfulfilled items with "In Stock" column, qty capped at available, checkbox disabled for 0 stock, "No stock" label
- Order detail: Fulfilled column shows `X/Y` amber for partial, Shipment History section with per-shipment cards (items, transport, LR, invoice link, "Add Details"/"Edit" button)
- Status: `partially_shipped` → amber "Partial" badge, new tab in filter pills
- Orange dot/banner: per-shipment (checks each shipment for missing LR/eway)
- Order create fix: `resolveLineSKU` fallback at submit time (was blocking 0-stock orders)
- Invoice detail/print: shows `· SHP-xxxx` shipment reference

**Migration `q1r2s3t4u5v6`:** CREATE shipments + shipment_items, ALTER orders CHECK (add partially_shipped), ALTER invoices ADD shipment_id, backfill existing shipped orders

**Bug fixed:** Order create with 0 stock was blocked — `sku_id` not set by onChange handlers. Fixed with `resolveLineSKU()` fallback at submit time.

**Phase D noted:** Consolidated Dispatch (multi-order → 1 parcel → 1 invoice). Workaround: cancel remaining partials + create 1 new consolidated order.

**NEXT:** Test partial ship flow on prod (13b-13d). Update API_REFERENCE.md (12a). Reports overhaul. Remnant roll UX.

---

## S91: Partial Order Support — Implementation Checklist

**Goal:** Ship any subset of order items per shipment. Each shipment gets its own invoice. Transport/LR/eway details live on Shipment (not Order). All fields optional — filled in 1-3 days after ship.

**Design decisions:**
- `transport_id` stays on Order as customer preference (planning field)
- `lr_number`, `lr_date`, `eway_bill_no`, `eway_bill_date` move to Shipment only
- Existing shipped orders backfilled with 1 Shipment each (preserves history)
- `ship_data.items = None` → ships all remaining (backward compatible)
- Discount proportioned per shipment: `shipment_discount = order.discount × (shipment_subtotal / order_subtotal)`
- 1 Shipment = 1 Invoice (auto-created)

### Backend — Models
- [x] **1a.** Create `backend/app/models/shipment.py` — Shipment model (37th): shipment_no, order_id FK, transport_id FK, lr_number, lr_date, eway_bill_no, eway_bill_date, shipped_by FK, shipped_at, notes, invoice_id FK, fy_id FK
- [x] **1b.** Create `backend/app/models/shipment_item.py` — ShipmentItem model (38th): shipment_id FK (CASCADE), order_item_id FK (RESTRICT), sku_id FK (RESTRICT), quantity
- [x] **1c.** Update `backend/app/models/order.py` — add `partially_shipped` to CHECK constraint, add `shipments` relationship
- [x] **1d.** Update `backend/app/models/invoice.py` — add `shipment_id` FK (SET NULL, nullable), add `shipment` relationship
- [x] **1e.** Register both new models in `backend/app/models/__init__.py`

### Backend — Schemas
- [x] **2a.** Create `backend/app/schemas/shipment.py` — ShipItemInput, ShipmentItemResponse, ShipmentResponse, UpdateShipmentRequest, ShipmentBrief
- [x] **2b.** Update `backend/app/schemas/order.py` — rewrite ShipOrderRequest (add `items: list[ShipItemInput] | None`), add ShipItemInput, deprecate UpdateShippingRequest
- [x] **2c.** Update OrderResponse — add `shipments: list[dict] = []`

### Backend — Code Generator
- [x] **3.** Add `next_shipment_number()` to `backend/app/core/code_generator.py` — pattern `SHP-XXXX`, per FY auto-increment

### Backend — Services
- [x] **4a.** Create `backend/app/services/shipment_service.py` — get_shipments(order_id), get_shipment(id), update_shipment(id, data), _to_response()
- [x] **4b.** Rewrite `ship_order()` in `backend/app/services/order_service.py`:
  - Accept items[] (optional, None = ship all remaining)
  - Validate qty per item (> 0, <= remaining = quantity - fulfilled_qty)
  - Create Shipment + ShipmentItems
  - Increment `fulfilled_qty` per item (not set to full)
  - STOCK_OUT per shipment item (reference_type="shipment")
  - Proportional reservation confirmation
  - Status: all fulfilled → "shipped", else → "partially_shipped"
  - Allow shipping from `partially_shipped` status (not just pending/processing)
- [x] **4c.** Update `create_invoice()` in `backend/app/services/invoice_service.py`:
  - New method: `create_invoice_for_shipment(order, shipment, shipment_items, ...)`
  - Invoice items = only this shipment's SKUs/qtys
  - Proportional discount
  - Set `invoice.shipment_id`
  - Old create_invoice() kept for backward compat (manual trigger)
- [x] **4d.** Update `_to_response()` in order_service — include `shipments[]` with nested items + transport + invoice

### Backend — API Routes
- [x] **5a.** Create `backend/app/api/shipments.py` — `GET /orders/{id}/shipments`, `GET /shipments/{id}`, `PATCH /shipments/{id}`
- [x] **5b.** Register shipments router in `backend/app/api/router.py`
- [x] **5c.** `POST /orders/{id}/ship` already passes ShipOrderRequest (schema updated in step 2b)
- [x] **5d.** `PATCH /orders/{id}/shipping` kept as-is for backward compat (updates order-level fields, legacy)

### Backend — Migration
- [x] **6.** Write migration `q1r2s3t4u5v6_s91_shipments.py`:
  - CREATE TABLE `shipments` (all tenant schemas)
  - CREATE TABLE `shipment_items` (all tenant schemas)
  - ALTER `orders` CHECK constraint → add `partially_shipped`
  - ALTER `invoices` ADD COLUMN `shipment_id` UUID + FK + INDEX
  - Backfill: for each shipped order → create 1 Shipment + ShipmentItems from order_items (copy LR/eway from order)

### Frontend — API Module
- [x] **7a.** Update `frontend/src/api/orders.js` — `shipOrder(id, data)` payload now includes optional `items[]`
- [x] **7b.** Add to `frontend/src/api/orders.js`: `updateShipment(shipmentId, data)`, `getOrderShipments(orderId)`

### Frontend — OrdersPage Ship Modal
- [x] **8a.** Rewrite ship modal — show unfulfilled items with qty pickers (default = remaining), allow unchecking items
- [x] **8b.** Transport + LR + Eway fields below items (all optional, "details can be added later" hint)
- [x] **8c.** "Ship Selected" button — sends `{ items: [{order_item_id, quantity}], transport_id, ... }`

### Frontend — OrdersPage Detail Overlay
- [x] **9a.** Items table — "Fulfilled" column shows `X/Y` amber for partial, green check for full
- [x] **9b.** Shipment History section below items table — cards per shipment (SHP-xxx, date, item badges, transport, LR, invoice link)
- [x] **9c.** "Add Details" / "Edit" button per shipment card → opens modal for that specific shipment via updateShipment()
- [x] **9d.** Orange dot/banner logic → per shipment (checks each shipment for missing LR/eway)
- [x] **9e.** "Ship More" button visible when `status === 'partially_shipped'`

### Frontend — Status & List
- [x] **10a.** Add "Partial" tab in status filter pills for `partially_shipped`
- [x] **10b.** StatusBadge: `partially_shipped` → amber "Partial" badge (amber-100/amber-700)
- [x] **10c.** DataTable: orange dot checks `row.shipments` for missing LR (not order-level fields)

### Frontend — InvoicesPage
- [x] **11a.** Invoice detail — shows `· SHP-xxxx` next to "From Order" type label
- [x] **11b.** Invoice print template — shows `· SHP-xxxx` in header, LR/eway from invoice fields (populated from shipment at creation)

### Documentation
- [ ] **12a.** Update `Guardian/API_REFERENCE.md` — new Shipment endpoints, updated OrderResponse shape, updated ShipOrderRequest
- [ ] **12b.** Update `Guardian/CLAUDE.md` — S91 session summary, current state, architecture decisions

### Deploy
- [x] **13a.** Run migration on dev DB
- [ ] **13b.** Test: create order → partial ship → verify invoice + fulfilled_qty → ship remaining → verify order status = shipped
- [ ] **13c.** Test: backward compat — ship without items[] → ships all remaining
- [ ] **13d.** Test: update shipment LR/eway days later
- [x] **13e.** Deploy migration to prod
- [x] **13f.** Deploy backend to prod (CI/CD auto-deploy on push)
- [x] **13g.** Deploy frontend (Vercel auto)

**Total: 38 models, ~30 files changed (6 new + ~24 modified)**

---

## Previous State (Session 90 — 2026-03-28)

### S90: Modal ESC Isolation + Ship Without LR + E-Way Bill + FilterSelect Fixes

**3 commits pushed. 1 migration on dev + prod.**

**Modal ESC Isolation (global fix):**
- Modal.jsx: capture-phase ESC handler with `stopImmediatePropagation` + `overlayRef.contains(activeElement)` check
- Only the innermost focused modal handles ESC — no more leaking to parent forms
- Fixed stale closure in OrdersPage (`quickMasterOpen`, `shipModalOpen` missing from deps) and InvoicesPage (`quickMasterOpen`)

**Ship Without LR + E-Way Bill (Option C):**
- `ShipOrderRequest.lr_number` now optional — all ship modal fields are optional
- `eway_bill_no` + `eway_bill_date` on Order model + schema + response
- `PATCH /orders/{id}/shipping` — update transport/LR/eway on shipped orders
- `UpdateShippingRequest` schema, `update_shipping()` service method
- Ship modal: 2x2 grid (LR no/date + E-Way no/date), amber hint "add later"
- Shipped order detail: orange warning banner for missing LR/eway, "Update Shipping" button
- DataTable: orange dot badge on shipped orders missing LR
- Migration `p0j1k2l3m4n5` deployed to dev + prod

**FilterSelect Fixes:**
- `data-master` now propagated to search input (was only on button) — Shift+M picks correct master type
- Focus ring: `focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500` matching typo-input style
- Auto-focus Customer FilterSelect on New Order overlay open (was broken — `nameRef` never attached)

**NEXT:** Partial order support (S91). Reports overhaul. Remnant roll UX.

---

## Previous State (Session 89 — 2026-03-28)

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

**Ship Order Modal:** Click "Ship" → modal with Transport, L.R. No. (optional), L.R. Date, E-Way Bill No/Date

**Order Create Form Overhaul:** Broker/Transport → searchable FilterSelect, row-based design picker, single flat emerald table, inline totals

**Invoice Create Form Overhaul:** Full-width, emerald header, section header bars, emerald table header

**FilterSelect `searchable` prop:** Button → inline text input on open, type to filter

**Migration `o9i0j1k2l3m4`:** CREATE TABLE brokers + transports, ALTER orders + invoices (FK + indexes)

**BUG — carry to next session:** ESC on QuickMaster modal (Shift+M) closes the parent Order/Invoice form instead of just the modal. Both use `document.addEventListener('keydown')` — need proper event isolation so inner modal ESC doesn't trigger parent form close.

**NEXT:** Fix ESC bug above. Deploy S89 to prod. Partial order support. Reports overhaul. Remnant roll UX.

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

**PHASE D (discuss with client):** Consolidated Dispatch — ship remaining items from multiple orders (same customer) in 1 parcel → 1 invoice. Needs Dispatch entity, multi-order shipment, "Ship for Customer" view. GST-compliant (single invoice for multiple orders is valid). **Current workaround:** cancel remaining partial orders + create 1 new consolidated order → ship as single order, 1 invoice.

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
| S90 | Ship optional LR + E-Way Bill + ESC fix | Modal ESC isolation (capture-phase + containment check), ship without LR (all optional), eway_bill_no/date on Order, PATCH /orders/{id}/shipping, UpdateShippingRequest, orange warning banner/dot for missing LR, FilterSelect data-master on search input, focus ring matching typo-input, auto-focus Customer on New Order |
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
