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

## Current State (Session 113 — 2026-04-18) — CLOSED

**RES code collision hotfix + Order-edit bloat + Invoice cancel / Credit Note overhaul (Tally model).**

Morning: prod PATCH /orders crashed with `UniqueViolationError` on `reservation_code=RES-10000`. Two root causes: (A) `_max_code` sort was lexicographic — `'RES-9999' > 'RES-10000'` → generator collided; fixed with `ORDER BY LENGTH(col) DESC, col DESC` (future-proofs all generators). (B) `update_order` released ALL reservations + recreated ALL for every edit — burned 45 RES rows per 23-line edit; rewrote as diff-based (only release+create for rows where `sku_id` or `qty` actually changed). Full-order edits now 1 new RES row, not 23.

Afternoon: **invoice cancel / CN flow overhaul**, Tally/Zoho model end-to-end.
- **Phase 1 (Cancel audit):** Invoice gains `cancel_reason` / `cancel_notes` / `cancelled_at` / `cancelled_by` (migration `e5f6g7h8i9j0`). `POST /invoices/{id}/cancel` now requires a reason (6-code enum + `other`+notes). Red banner on invoice detail shows reason + who + when.
- **Phase 2:** Amber banner on order detail whenever any linked invoice is cancelled. Invoice buttons go grey+strikethrough for cancelled invoices.
- **Phase 3 (Fast-track CN):** `SalesReturn.invoice_id` FK + `SalesReturn.discount_amount` column (migrations `f6g7h8i9j0k1`, `g7h8i9j0k1l2`). `POST /invoices/{id}/credit-note` creates SR in `closed` state directly (skips 5-step QC), assigns both SRN+CN codes, posts single ledger credit, fires inventory events per-line restore-stock flag, updates `returned_qty` on linked order_items. Modal: items pre-filled + tri-state Select-All + proportional discount inheritance (share = cn_subtotal / invoice_subtotal).
- **Phase 4 (Full reversal):** Rejected — not industry-standard. Shipments don't un-ship. CN with restore_stock handles goods-return. Documented decision.
- **Phase 5 (Cancel→CN chain):** Zoho pattern. Cancel modal gains "Also issue a Credit Note" checkbox (default on). One click = cancel + auto-open CN modal pre-filled with invoice lines, restore_stock=true, cancel notes carried over. Button relabels to "Cancel + Create CN" when chaining on.

Critical bug fixes along the way:
- `cancel_invoice` no longer posts ledger reversal — was causing double-credit when a CN was later issued (saw −₹39,486.30 phantom debt on ORD-0021). **Tally model:** cancel = status flip only; CN is the sole ledger reversal document.
- MissingGreenlet in `create_credit_note_from_invoice` — `sr` was freshly added so `sr.customer` / `sr.order` weren't loaded; `_emit` triggered lazy load → 500. Fix: reload via `_get_or_404` before emitting.
- MissingGreenlet in orders list after CN-0001 created — `sales_returns.items` not eager-loaded; added `.selectinload(SalesReturn.items)` to both query paths.
- Invoice cancel gained retroactive patch route — existing pre-S113 cancelled invoices can have reason/notes backfilled via SQL (did this for INV-0009 mirroring CN-0001's reason).

Navigation cross-links fully wired:
- Invoice detail shows "Credit Notes" card (amber) listing all CNs against it, clickable.
- Order detail shows each linked invoice as a button (strikethrough if cancelled).
- SKU inventory history resolves `sales_return` reference to `CN-XXXX · INV-XXXX` with deep-link to CN.
- Party ledger Particular column is now clickable — deep-links to invoice / CN / purchase / return / challan based on `reference_type`.

Also fixed: LotsPage QuickMasterModal was rendered only in list view (unreachable from create + detail overlays due to early-return JSX) — added mount points inside both overlays so Shift+M in the Cutting Sheet's Design column actually shows the modal.

One-off prod SQL operations: patched CN-0001 amount mismatch (was ₹41,564.25 without discount → corrected to ₹39,486.30 matching invoice); deleted duplicate `invoice_cancel` ledger entry for INV-0009; retro-patched INV-0009.cancel_reason from CN-0001's reason.

**Commits this session:** `33b7cf1 94a8a96 5615fd4 501a862 144a77e c3b7ef5 d4f5c69 29e9aa6 c8a1e7f 7782c15 8cfaeab c04c268 c9d7c2c da674c8` (14 commits).

**S114 queue (carry-over):**
1. MRP bulk backfill tool (1/1697 SKUs have MRP)
2. ChallansPage 4d scan-to-receive refinement (open since S109)
3. Optional polish: "Full Sales Return (with QC)" entry point on invoice page; Print button on CN creation success.

---

## Previous Sessions (S87-S113) — Invoice, Shipping, Returns, FY, Reports, SKU, Thermal Labels, Cost Accounting

- **S113:** Hotfix RES code collision (lex vs numeric sort in `_max_code` — `'RES-9999'>'RES-10000'` in strings) + diff-based `update_order` (was burning N+N RES rows per edit, now O(changed)). **Invoice cancel / CN overhaul — Tally model:** cancel = status flip + audit (reason/by/when), CN is sole ledger reversal. Fast-track `POST /invoices/{id}/credit-note` → closed SR in one call, SRN+CN generated, proportional discount inheritance, per-line restore_stock. Cancel→CN chain checkbox (Zoho pattern). `SalesReturn.invoice_id` + `SalesReturn.discount_amount` columns. 3 migrations `e5f6…` `f6g7…` `g7h8…`. Invoice detail shows linked CNs; order detail amber-banners cancelled invoices; SKU history resolves sales_return refs; ledger Particular column deep-links. Phase 4 (full shipment reversal) rejected — not industry-standard. Prod SQL cleanup: CN-0001 amount fix, duplicate cancel-ledger entry removed, INV-0009 reason backfilled. 14 commits `33b7cf1..c9d7c2c`.
- **S112:** SKU infra overhaul. `GET /skus/grouped` + `/skus/summary`. Last Cost vs WAC split (`base_price` = latest stock-in, overwritten always; WAC derived from events via `compute_wac_map`; FY closing + dashboard use WAC — AS-2 compliant). No backfill — write-path handles all new events. SKU detail WOW: 3-block hero, merged sectioned card, `typo-input-sm` compact inputs. Bulk label print (per-design icons, SKU-level checkbox selection with 3-state parent + cross-design via `skuIndex`, Orders modal with A4/Thermal × per-piece/per-SKU toggle). Orders/Invoices `pickDefaultRate(sku)` helper + `price_source` tracking + amber "⚠ Last Cost" warning when fallback hits `base_price`. "Price" → "Sale Rate" everywhere; sizes sorted canonically. 15 commits `cd9d86e..798ed3f`.
- **S111:** SKU Open Demand card (`9c65254`). `GET /skus/{id}/open-demand` filters `fulfilled_qty < quantity AND status != 'cancelled'`. Card between Source Batches + Inventory History on detail, clickable deep-link to `/orders?open={id}`.
- **S110:** SKU thermal V3 + Orders UX + pricing cleanup. Thermal SKU body rebuilt: full `sku_code` top strip + `D.NO {design_no}` (2-line wrap) + MRP + bordered SIZE chip. `ThermalLabelSheet.jsx` gained `wrap` + `chip` row types (CSS lives in BOTH print `pageStyle` AND screen `<style>` blocks — one `replace_all` won't hit both). Orders KPIs fetch full list via `page_size:0` into `allOrders` (was computing on 20-row slice); clickable "Total Orders" resets filters, "With Shortage" client-filters. Dupe-SKU check on manual color/size dropdowns mirrors scan path. `has_shortage` narrowed to `fulfilled_qty < quantity`; ship auto-zeros `short_qty` on full fulfilment. SKU Inventory History clickable Reference column (resolves shipment/batch/purchase refs, batch-loaded no N+1). Latent `create_event` bug fixed: `metadata=` → `metadata_=` (historical rows NULL). Order form default flipped to `sale_rate → mrp → base_price → 0`. Opening stock form gained Sale Rate + MRP cols (order: Qty→Sale→MRP→Cost). Prod SQL: 1696 SKUs `base_price → sale_rate` + zeroed base_price; ORD-0004 stale short_qty zeroed. 10 commits `9fdf1df..95aa654`.
- **S109:** Thermal Label Boarding Pass redesign. TSC TTP-345 driver calibrated to new stock `DRS-54*40` (54×40mm Die-Cut, Landscape 180°). 4-sided layout: hero code top strip + vertical `DRS BLOUSE`/`SCAN TO VIEW` bars + 30mm QR (+125% scan area) + `drsblouse.com` bottom strip. 1mm safe margin survives TSC ~0.5mm feed variance. Smart Minimal: SKU drops DES/COL/SIZE/TYPE (all in sku_code) → 18pt SIZE hero + MRP/RATE; Roll drops SR/FAB/COL → stacked big weight + small unit (kg/m auto) + INV/DT; Batch keeps 6 rows (batch_code encodes nothing), parses `color_breakdown` JSON. Field fixes: roll uses flat `fabric_type`/`color`, batch has no `color` column, SKU has no `design_no` field (parse from code), date DD Mon. Renderers return `{hero, qrValue, rows}` — wrapper composes chrome. Commits `9371fb3 c3a0249 c539302`.
- **S108:** UPI QR fix + Thermal label system + Print UX cleanup. UPI QR `encodeURIComponent` mangled `@` → `%40` ("Could not load bank name") — fixed with literal `@` in `pa` param + VPA regex validate in Settings. Thermal label system (TSC TTP-345, 54×40mm): shared `ThermalLabelSheet.jsx` wrapper + 3 type renderers (`ThermalRollLabel/BatchLabel/SKULabel`), 5 pages wired (Rolls/Batches/BatchDetail/Lots/SKUs), "A4" vs "Thermal" button labels. Print UX: ESC/Ctrl+P detail-overlay guards (print was closing to list), `z-[55]` for label sheets above detail overlays (`z-50`). RollsPage headers migrated to emerald theme. Commits `2e3bd32 7381ed7 35c313d 5cbf3eb 7cc7d34 612fa5f 0c62e6a bb47aea 1b2ca58`.

- **S107:** LotsPage scan pairing + CuttingSheet QR. OrderPrint pivot Pick Sheet (chunked column bands). Invoice print B&W redesign (amount in words, T&C, padded rows, page-break handling). HSN propagation (Option A): ProductType.hsn_code → SKU → InvoiceItem snapshot. Backfill script ran on prod (796 SKUs + 164 invoice items). Invoice QR codes: lookup (header) + UPI payment (footer). Company.upi_id field. New endpoint `GET /invoices/by-no/{no}`. Migrations `c3d4e5f6g7h8` (tenant) + `d4e5f6g7h8i9` (public).
- **S106:** Scan pairing on ReturnsPage (supplier roll + sales SKU) + ChallansPage (QR prints, deep-link, job/batch create with phone scan) + SendForVAModal scan. OrderPrint wholesale B&W redesign (grouped by design, checkbox, size summary). Dead SSE scan code removed. 2 new backend endpoints (`by-no`).
- **S105:** `POST /skus/stock-check` bulk endpoint. `page_size:0` = fetch all (11 services + 13 frontend calls). Reservation-aware ship (order's own reserved stock counts as available). QuickMasterModal z-index fix in ship modal.
- **S104:** SKU search fix (dots→wildcards, "b.green" matches "B. GREEN"). Negative stock adjustments (±qty, reservation-aware validation, clear error messages). Inventory history ±sign fix.
- **S103:** Scanner Gun PWA. Option B: extend MobileLayout for admin/supervisor/billing on mobile. useIsMobile viewport hook, BottomNav role-aware tabs (Scan/Activity/Profile), Gun mode on ScanPage (continuous scan → POST /scan/remote → SSE → desktop auto-add). Backend scan.py endpoint. useRemoteScan hook on OrdersPage+ReturnsPage. ActivityPage scan log. Profile route fix. AWS budget $35/mo with 3 email alerts configured.
- **S102:** QR scan on order form, batch unclaim endpoint+UI, SKU identity design edit, InventoryState FOR UPDATE fix, PaginatedParams validation, CLAUDE.md trim (76K→26K)
- **S101:** 5 prod bug fixes (adjust crash, SKU search, inventory history 500, cost history filter, FilterSelect cycling). SKU page grouped accordion by design (All SKUs + Cost Breakdown tabs), fixed column widths, inline reserved qty
- **S100:** Sales Return system verified COMPLETE (built in unrecorded S93). Legacy dead code removed (return_order, POST /orders/{id}/return). S3 backup system (6 scripts, cron 2AM IST, 30d+12mo retention). EC2 infra (pg_dump 16, AWS CLI, S3 bucket). Prod data wipe → FY 2026-27 LIVE on clean slate. Recovery: `restore.sh snapshots/pre-real-wipe_2026-04-01_08-33.dump`
- **S99:** `design_id` UUID FK on Batch+SKU models, DesignBrief schema, lot→batch→SKU design_id flow, backfill migration `b2c3d4e5f6g7`. LotsPage+SKUsPage design_no→FilterSelect (Design master)
- **S98:** SKU opening stock moved to SKUsPage (`POST /skus/opening-stock` bulk). Design model (45th), full CRUD+MastersPage tab. Party name unique constraints (lower(name) index on 5 models). Title Case on all 10 masters. SKU detail inventory history section. Migration `a1b2c3d4e5f6`
- **S97:** FY Transition P4-P6. Closing stock valuation report (3 categories, AS-2). StockVerification+StockVerificationItem models (43rd+44th). Party reconciliation report + Balance Confirmation print. 5-component cost system (material+roll_va+stitching+batch_va+other, auto-compute at pack). Tailor costing report. Migrations `y9z0a1b2c3d4`, `z0a1b2c3d4e5`
- **S96:** FY Transition P1-P3. Opening stock entry (SKU bulk + roll bulk with At-VA toggle). Party opening balance (single+bulk+status). FY closing broker fix + enhanced preview (+4 warnings). API_REFERENCE +13 endpoints documented
- **S95:** Reports 5 new tabs (Sales, Accounting, VA, Purchases, Returns Analysis). Inventory 2 new tabs (Raw Material, WIP). WOW Dashboard redesign (alerts bar, revenue chart, 3 gauges, batch pipeline, gradient KPIs)
- **S93:** SalesReturn+SalesReturnItem models (41st+42nd), 5-status lifecycle (draft→received→inspected→restocked→closed), SRN-XXXX+CN-XXXX generators, Sales Returns tab on ReturnsPage, SalesReturnPrint+CreditNotePrint — built in unrecorded session, verified S100
- **S92:** Return Management P1-P5. Customer returns (returned_qty tracking, credit_note ledger, return modal). VA damage tracking (weight_damaged/pieces_damaged on processing models, damage ledger). Supplier returns — ReturnNote+ReturnNoteItem models (39th+40th), 6-status workflow, ReturnsPage. VA partner summary endpoint. ck_ constraint fix. 3 migrations `r2s3..`, `s3t4..`, `t4u5..`
- **S91:** Shipment+ShipmentItem models (37th+38th), partial order support. ship_order() rewrite (items[] partial ship, stock validation FOR UPDATE, invoice per shipment). ShipmentService, SHP-XXXX codes. Ship modal with unfulfilled items, fulfilled X/Y column, shipment history cards. Migration `q1r2s3t4u5v6`
- **S90:** Modal ESC isolation (capture-phase handler). Ship without LR (all fields optional), eway_bill on Order, PATCH /orders/{id}/shipping, orange warning banner/dot. FilterSelect data-master+focus ring fixes. Migration `p0j1k2l3m4n5`
- **S89:** Broker (35th) + Transport (36th) masters, broker_id/transport_id FK on Order+Invoice, broker commission ledger. Ship modal, order+invoice form overhaul, FilterSelect searchable prop. Migration `o9i0j1k2l3m4`
- **S87-88:** Standalone invoices (POST /invoices, no order), invoice cancel+ledger reversal. gst_percent+discount_amount on Orders+Invoices, dynamic GST split. Order→Invoice link, company info in prints. Palla input fix (text+inputMode). Migrations `m7g8h9..`, `n8h9i0..`

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

### WebSocket Scan Pairing (S105)
- Backend: `scan_ws.py` — ScanPairManager + WS endpoint `/api/v1/scan/ws/pair?role=phone|desktop`
- Frontend: `useScanPair.js` hook (connect, presence, scan, auto-reconnect with backoff)
- Auth: HttpOnly cookie sent automatically on WS handshake (same as SSE)
- Pairing: keyed by user_id from JWT. One phone + multiple desktops per user. Isolated per user.
- SSE stays for notifications (bell/toasts). WS handles scan pairing only.
- **DEPLOY NOTE:** Nginx needs WS upgrade headers. Add to EC2 Nginx config on next push:
  ```
  location /api/v1/scan/ws/ { proxy_pass http://127.0.0.1:8000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
  ```

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
| S69 | VA Party Master + FK Wiring | 26th model, va_party_id FK replaces vendor_name |
| S70 | VA Receive Hotfix | 5 missing selectinloads, pagination fix |
| S71 | Bulk Receive + ChallansPage | Single-call bulk receive, 3-state challan, ChallansPage |
| S72 | Production Hotfixes x3 | Decimal+float, lot distribute, MissingGreenlet |
| S73 | Color FK + DB Wipe + Party Masters | color_id FK, Customer model (27th), enriched Supplier+VAParty, PartyMastersPage |
| S74 | MASTERS_AND_FY_PLAN COMPLETE | TDS/TCS forms, customer picker, Ledger (28th model), SKU enrichment, Company+FY (29th, 30th) |
| S75 | Party Detail UI + API Docs | Full-page detail overlay, API_REFERENCE.md updated |
| S76 | Multi-Company + Auth + FY Closing | Schema-per-tenant (5 public + 28 tenant), HttpOnly cookie JWT, company picker/switcher, master inheritance, FY closing with balance carry-forward |
| S77 | FY Counter Reset + Auth + DB Hardening | fy_id on 9 models, counter reset per FY, token blacklist+JTI+rotation, 52 FK ondelete, 19 indexes, 6 CHECKs |
| S78 | Multi-Company UX + DB Stability | Auto-refresh JWT, company picker keyboard, default company, asyncpg cache fix |
| S79 | Global Typography System | 24 typo-* classes in index.css, 47 files migrated, Protocol 10 added |
| S80 | Multi-Design Lots + Print | designs JSON, batch.design_no, lot code LT-{PT}-XXXX, OrderPrint+PackingSlip |
| S81 | Product Type Overhaul | FBL/SBL/LHG/SAR, palla_mode, CuttingSheet dynamic unit |
| S82 | Full Audit — 3 Tiers | 7 critical + 23 warnings fixed, model sync (21 gaps), BLS→FBL |
| S83 | Typography + Emerald Theme | FilterSelect component, emerald theme, all 14 pages typo-* migrated |
| S84 | Challan CRUD + Cancel | Edit/cancel challan (5 safety guards), processing tab challan column |
| S85 | Login + Purchase Stock + SKU Redesign | Premium login, PurchaseItem (34th), purchase-stock endpoint, FilterSelect type-ahead |
| S86 | Over-Order + Reservations | pipeline_qty on SKUs, order form overhaul, 3 migrations |
| S87-88 | Invoice Overhaul | Standalone invoices, cancel+ledger reversal, gst_percent/discount on orders+invoices, dynamic GST, palla input fix |
| S89 | Broker + Transport Masters | Broker (35th) + Transport (36th), FK on Order+Invoice, ship modal, searchable FilterSelect |
| S90 | ESC Fix + Ship Without LR | Modal ESC isolation, eway_bill on Order, PATCH shipping, orange warning banner |
| S91 | Partial Order Support | Shipment+ShipmentItem (37th+38th), partial ship, invoice per shipment, SHP-XXXX codes |
| S92 | Return Management P1-P5 | ReturnNote+ReturnNoteItem (39th+40th), customer returns, VA damage tracking, supplier returns, 3 migrations |
| S93 | Sales Return System | SalesReturn+SalesReturnItem (41st+42nd), 5-status lifecycle, SRN/CN generators, print templates |
| S95 | Reports + Dashboard Overhaul | 5 new report tabs, 2 inventory tabs, WOW dashboard (alerts, gauges, pipeline) |
| S96 | FY Transition P1-P3 | Opening stock (SKU+roll), party opening balances, FY closing broker fix |
| S97 | FY Transition P4-P6 | Closing stock valuation, StockVerification (43rd+44th), party reconciliation, 5-component cost system |
| S98 | SKU Opening Stock + Design Master | Design model (45th), SKU opening stock on SKUsPage, party unique constraints, title case |
| S99 | design_id FK Wiring | design_id on Batch+SKU, FilterSelect for Design master, backfill migration |
| S100 | Backup System + Prod Wipe | S3 backup (6 scripts), EC2 infra, sales return audit, FY 2026-27 LIVE |
| S101 | Prod Bug Fixes + SKU Accordion | 5 bug fixes, grouped accordion by design, fixed column widths |
| S113 | RES hotfix + Order-edit diff + Cancel/CN overhaul (Tally model) | `_max_code` sort: `LENGTH DESC, col DESC` — fixes `RES-10000` collision + future-proofs all generators. `update_order` rewritten diff-based — only touches reservations for rows where `sku_id`/`qty` actually changed. **Invoice cancel overhaul**: audit fields (reason/by/when), red banner, reason enum + `other`+notes. **Fast-track CN**: `POST /invoices/{id}/credit-note` → closed SalesReturn in one call, SRN+CN assigned, proportional discount from invoice, per-line restore_stock with tri-state Select-All. **Tally model**: cancel = status flip only, CN = sole ledger reversal (was double-crediting). **Cancel→CN chain** checkbox (Zoho pattern). `SalesReturn.invoice_id` + `discount_amount` cols (migrations `e5f6g7h8i9j0`, `f6g7h8i9j0k1`, `g7h8i9j0k1l2`). Navigation: invoice↔CN card, order amber banner + strikethrough, SKU history resolves sales_return → CN+INV+deep-link, ledger Particular clickable. Phase 4 (un-ship) rejected — shipments don't reverse, CN handles it. Prod SQL: INV-0009 patched cancel_reason, duplicate cancel-ledger removed, CN-0001 amount corrected. 14 commits `33b7cf1..c9d7c2c` |
| S112 | SKU infra + Last Cost/WAC split + Bulk Label Print | `GET /skus/grouped` + `/skus/summary` (consistent design-rows + global KPIs, fixes S110-class bug). `sku.base_price` redefined as Last Cost (overwritten every stock-in, pricing signal); WAC derived from events via `SKUService.compute_wac_map()` for FY closing + valuation (AS-2). No backfill needed — write-path sets `base_price` on purchase/opening/pack. SKU detail WOW redesign (3-block hero + merged sectioned card + `typo-input-sm` compact). Bulk print — per-design icons + SKU-level checkbox with 3-state design parent + Orders modal with A4/Thermal × per-piece/per-SKU. Orders/Invoices `pickDefaultRate(sku)` + amber "⚠ Last Cost" warning. "Price" → "Sale Rate". Sizes sorted S→4XL. 15 commits `cd9d86e..798ed3f` |
| S111 | SKU Open Demand Card | New card on SKU detail (between Source Batches + Inventory History) showing unfulfilled orders holding the SKU. Backend `GET /skus/{id}/open-demand` filters `fulfilled_qty < quantity AND status != 'cancelled'`. Clickable deep-link to `/orders?open={id}`. Refreshes on SKU reopen only (no SSE). Commit `9c65254` |
| S110 | SKU Thermal V3 + Orders UX + Pricing | Thermal SKU body rebuilt (D.NO wrap + MRP + SIZE chip); Orders KPIs fetch full list via `page_size:0` + clickable Total/With-Shortage cards; manual-dropdown dupe-SKU check mirrors scan path; `has_shortage` narrowed + short_qty auto-zero on ship; SKU Inventory History gains clickable Reference column (resolve shipment/batch/purchase refs); `create_event` metadata bug fixed (`metadata=`→`metadata_=`); order form default flipped to sale_rate; opening stock form gains Sale Rate + MRP columns (order: Qty→Sale→MRP→Cost). Prod SQL: 1696 SKUs `base_price→sale_rate` + base_price zeroed; ORD-0004 stale short_qty zeroed. Commits `9fdf1df`..`95aa654` |
| S109 | Thermal Label Boarding Pass | TSC TTP-345 stock calibration (54×40mm, Landscape 180°). 4-sided layout: hero top strip + 30mm QR + vertical DRS BLOUSE/SCAN TO VIEW bars + bottom brand strip. 1mm safe margin all sides. Smart Minimal: SKU drops 4 redundant rows (in sku_code) → 18pt SIZE hero + MRP. Roll drops 3 rows (in roll_code) → stacked weight/unit hero (kg/m auto) + INV/DT. Batch keeps 6 rows (batch_code encodes nothing), color_breakdown JSON parsing. Field fixes: roll.fabric_type/color flat strings, batch.quantity, date DD Mon. Renderers refactored to return `{hero, qrValue, rows}` data. Commits `9371fb3 c3a0249 c539302` |
| S108 | UPI QR Fix + Thermal Labels + Print UX | UPI QR @encoding fix (`encodeURIComponent` mangled `@`). Thermal label system (TSC TTP-345, 54×40mm): shared `ThermalLabelSheet.jsx` wrapper + 3 type renderers, 5 pages wired (Rolls/Batches/BatchDetail/Lots/SKUs). "A4" vs "Thermal" button labels. Print UX cleanup: ESC/Ctrl+P detail-overlay guards, `z-[55]` for label sheets over detail overlays. RollsPage headers emerald theme |
| S107 | HSN + Invoice QR + UPI | LotsPage scan + CuttingSheet QR. OrderPrint Pick Sheet pivot. Invoice B&W redesign + amount-in-words. HSN on ProductType (Option A) + backfill script (796 SKUs + 164 inv items). Invoice QR: lookup + UPI pay. Company.upi_id. Migrations `c3d4e5f6g7h8` + `d4e5f6g7h8i9` |
| S106 | Scan Pairing + Challans + OrderPrint | useScanPair on Returns+Challans+SendForVAModal, QR on challan prints, challan create from ChallansPage, by-no endpoints, OrderPrint B&W wholesale redesign, dead SSE scan removed |
| S105 | Stock-Check + Pagination + Ship Fix | POST /skus/stock-check, page_size:0 all services, reservation-aware ship, QuickMasterModal z-index |
| S104 | SKU Search + Neg Adjust | Search dots→wildcards, ±qty adjustments, reservation validation, history ±sign fix |
| S103 | Scanner Gun PWA | Option B mobile layout, Gun mode scan→SSE→desktop, useIsMobile+useRemoteScan hooks, ActivityPage, backend /scan/remote, AWS budget alerts |
| S102 | QR Scan + Mobile Plan | QR scan on order form, batch unclaim, mobile-first UI plan (0/10) |

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
