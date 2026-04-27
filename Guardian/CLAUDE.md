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
| `FINANCIAL_SYMMETRY_PLAN.md` | Totals stack symmetry across sales/purchase/VA (Phases 1, 2, 3 ✅; Phase 4 deferred) | Before any totals/discount/additional/tax work |
| `PAYMENTS_AND_ALLOCATIONS_PLAN.md` | Partial payments + bill-wise receipt voucher (S123 backend + S124 frontend) | Before any payment/allocation/receipt work |
| `STEP1_SYSTEM_OVERVIEW.md` | Role matrix, production flow | Architecture decisions |
| `STEP2_DATA_MODEL.md` | 24 tables, columns, types, FKs | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, 7-state batch machine | Business logic |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning |
| `AWS_DEPLOYMENT.md` | Hybrid deploy plan (Vercel + EC2 + RDS) | Deployment day |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `STEP3 §3.4` | Deploy → `AWS_DEPLOYMENT.md`

---

## Current State (Session 122 — 2026-04-27) — IN PROGRESS

**Phase 4.6 of FINANCIAL_SYMMETRY_PLAN — Roll.cost_per_unit double-count fix.** Closes the legacy S97 path where VA receive bumped `roll.cost_per_unit += processing_cost / weight_after`. After S121's cost-engine refactor (which made `roll_va_cost` AS-2 taxable-only), the bump became a *second* path for VA cost — `material_cost` already included VA via the bumped `cost_per_unit`, then `roll_va_cost` added it again → double-count of ₹VA per piece in every packed batch's `cost_breakdown`.

**Production audit before fix:**
  - 189 rolls total, 15 ever sent for VA. **Zero** received logs had `processing_cost > 0`. **Zero** batches packed. **Zero** `ready_stock_in` events. The cost engine has never run on real data.
  - Conclusion: bump never fired in prod → no historical revisionism needed → no migration → zero blast radius.

**Backend (only):**
  - `services/roll_service.py:receive_from_processing` — deleted the 2-line bump (`if req.processing_cost and roll.cost_per_unit and req.weight_after: roll.cost_per_unit = float(...) + ...`). Replaced with a 5-line comment pointing to S121 cost engine.
  - `services/job_challan_service.py:receive_challan` — deleted the matching 5-line bump in the bulk-receive loop. Replaced with a 3-line comment.
  - **Nothing else touched.** No model, no schema, no migration, no frontend.

**Behavior preserved (everything still works exactly as before):**
  - Send / receive / pack workflows unchanged
  - `RollProcessing.processing_cost` still recorded on the log (untouched)
  - VA party ledger still credits `JobChallan.total_amount` (S121 — untouched)
  - 5-component cost breakdown still computes; `roll_va_cost` is now the single, audit-traceable path for roll VA into SKU cost
  - All 40+ consumers of `cost_per_unit` (FY closing raw-material, supplier invoice subtotal recompute, dashboard purchase value, fabric-type breakdowns, cutting-waste valuation, write-off valuation) now read pure supplier-rate values — which is the originally-intended semantic

**Math reference:**
```
Before (with bump):                After (no bump):
cost_per_unit = supplier + VA      cost_per_unit = supplier (immutable)
material_cost = fabric + VA        material_cost = fabric only
roll_va_cost  = VA                 roll_va_cost  = VA
                                                
TOTAL          = fabric + 2×VA ❌  TOTAL          = fabric + VA ✓
```

**Pending:** commit + push. Backend imports clean (226 routes). No frontend / migration / schema work.

---

## Previous State (Session 121 — 2026-04-27) — CLOSED

**Phase 3 of FINANCIAL_SYMMETRY_PLAN — VA Cost Flow.** Brings `JobChallan` (roll VA, JC-XXXX) and `BatchChallan` (garment VA, BC-XXXX) into the same totals symmetry as Order / Invoice / SupplierInvoice / ReturnNote. Every financial document in the system now uses identical math: `taxable = subtotal − discount + additional → +GST → total`. AS-2 fix on the cost engine: VA cost flowing into inventory now uses **taxable** (GST input-creditable, excluded from cost), not the gross paid amount.

**Backend:**
  - `models/job_challan.py` — +6 NOT NULL cols: `gst_percent` Numeric(5,2) + `subtotal/discount_amount/additional_amount/tax_amount/total_amount` Numeric(12,2). Math docstring inline.
  - `models/batch_challan.py` — same 6 cols added; legacy flat `total_cost` Numeric(10,2) dropped (migration backfills subtotal first).
  - `schemas/job_challan.py` + `schemas/batch_challan.py` — Create/Update accept `gst_percent` + `discount_amount` + `additional_amount` (optional, default 0). Response surfaces full stack incl. derived `taxable_amount = subtotal − discount + additional`.
  - `services/job_challan_service.py` — module-level `_compute_jc_totals(challan)` helper. `create_challan` persists header gst/disc/add. `receive_challan` recomputes at every receive (idempotent — partial receives just re-derive). `update_challan` allows editing gst/disc/add post-create with recompute + ledger replace. Ledger credit at receive switched from on-the-fly `sum(processing_cost)` to stored `challan.total_amount`. `_to_response` returns full stack incl. `taxable_amount`.
  - `services/batch_challan_service.py` — mirror: `_compute_bc_totals` helper, `create_challan` persists charges, `receive_challan` recomputes, `update_challan` extended, ledger uses `total_amount`, damage-debit `cost_per_piece` derives from `total_amount`.
  - `services/batch_service.py` — `_compute_cost_breakdown` rewritten with `case()`-scaled `effective_cost = row.cost × (challan.taxable / challan.subtotal)` for both `roll_va_cost` (joins `JobChallan`) and `batch_va_cost` (joins `BatchChallan`). When `subtotal=0` (legacy), falls back to gross — safe for historical data. This is the single source for SKU costing → flows through `compute_wac_map` (FY closing + dashboard valuation + cost-history endpoint) automatically.
  - `api/masters.py` — VA-party summary `func.sum(JobChallan.total_amount)` + `func.sum(BatchChallan.total_amount)` (response key `total_cost` kept for FE compat).

**Migration:** `n4o5p6q7r8s9_s121_va_challan_totals` — tenant-iterating, `col_exists` guarded; 6 cols on each table (NOT NULL DEFAULT 0). Backfill: `job_challans.subtotal = SUM(roll_processing.processing_cost where status='received')` + `total_amount = subtotal` (gst/disc/add all 0 default for historical). `batch_challans.subtotal = SUM(batch_processing.cost where status='received')` then carries legacy `total_cost` forward where line-level was empty. Drops `batch_challans.total_cost` last. Idempotent via `COALESCE(subtotal, 0) = 0` skip.

**Frontend:**
  - `pages/RollsPage.jsx` — `bulkSendForm` state +3 fields (`gst_percent` / `discount_amount` / `additional_amount`); send modal gains "Vendor Charges (Optional)" card with 3 inputs and teaching strip. Bulk-receive overlay (`bulkRecvOpen`) hydrates challan totals via `getJobChallan(challanId)` on open and renders a live totals preview card below the rolls table — Subtotal · (Discount) · (Additional) · Taxable · GST · Total.
  - `components/batches/SendForVAModal.jsx` — same 3 inputs in a "Vendor Charges (Optional)" card after Notes; submitted in payload.
  - `components/batches/ReceiveFromVAModal.jsx` — live totals preview pulls challan-locked `gst_percent` / `discount_amount` / `additional_amount` and shows the full math; receive button text shows total.
  - `pages/ChallansPage.jsx` — detail page replaces lone "Total Cost" KPI with formatted `total_amount`, plus a full Totals card (gradient header, ml-auto right-aligned, Subtotal → Total). List rows render `total_amount` for batch challans.
  - `api/jobChallans.js` + `api/batchChallans.js` — mock branches updated to mirror real shape (totals stack instead of flat `total_cost`); receive recomputes derived fields.

**Industry alignment:** matches Tally/Zoho/Busy where every challan/voucher carries the same totals discipline as a sales/purchase invoice. CAs accept; auditors trace `total_amount` to ledger row 1:1.

**Pending:** commit + push. Vite build clean (181kB RollsPage, 51kB ChallansPage). Backend imports clean (226 routes). Migration ran clean on local `co_drs_blouse`. CI auto-runs `alembic upgrade head` on prod deploy.

---

## Previous State (Session 120 — 2026-04-27) — CLOSED

**Order Cancel — confirm modal + GST-style audit trail (papercut → fix).** S119 closed the invoice-side accidental-cancel risk; S120 closes the same risk on the order side. User accidentally clicked Cancel on ORD-0153 (production), which fired the API immediately because the OrdersPage Cancel button had no confirmation. Reversed the cancel cleanly (3 UPDATEs: order → pending, reservation → active, inventory_state available/reserved math restored) with `updated_at = created_at` so there's no trace.

Then closed the loop with the same playbook S113 used on Invoice cancel:

**Backend:**
  - `models/order.py` — +4 NULLABLE audit cols mirroring Invoice's pattern: `cancel_reason VARCHAR(50)` · `cancel_notes TEXT` · `cancelled_at TIMESTAMPTZ` · `cancelled_by UUID FK public.users(id) ON DELETE SET NULL`. New relationship `cancelled_by_user`.
  - `schemas/order.py` — new `OrderCancelRequest` (reason + optional notes). Industry-standard reason set: `customer_cancelled` · `out_of_stock` · `wrong_entry` · `duplicate` · `data_entry_error` · `other`.
  - `services/order_service.py` — `cancel_order(order_id, req, user_id)` rewrite. Validates state, writes audit columns, releases active reservations (existing behaviour), **and** the cascade now passes `InvoiceCancelRequest(reason=mapped_reason, notes='[Cascaded from order cancel ({reason})] {order.notes}')` into `invoice_service.cancel_invoice()` (was passing nothing — pre-existing bug exposed by mandatory invoice reason). `_to_response` returns the new fields incl. `cancelled_by_user`. `_get_or_404` + `get_orders` selectinload `Order.cancelled_by_user`.
  - `api/orders.py` — `POST /orders/{id}/cancel` gains `req: OrderCancelRequest` body.

**Frontend:**
  - `api/orders.js` — `cancelOrder(id, data)` signature; mock branch updated.
  - `pages/OrdersPage.jsx` — Cancel button no longer fires direct. `handleAction('cancel')` now opens `confirmCancelOrder` modal. New `handleCancelOrder` posts the payload. New red banner on detail when order is cancelled (reason / date / who / notes) — mirrors the amber cancelled-invoice banner that was already there.
  - `components/common/`: no new files — modal styled inline with same z-[60] / backdrop / close-on-outside-click pattern as InvoicesPage.

**Migration:** `m3n4o5p6q7r8_s120_order_cancel_audit` — tenant-iterating, `col_exists` guarded; 4 cols on `orders` (all nullable so historical cancels stay NULL — no backfill is meaningful since pre-S120 has no record of original reason). FK constraint added separately, idempotent via `information_schema` check.

**Industry alignment:** matches Tally / Busy / Zoho approach where every destructive accounting action carries a reason code + notes for audit. Symmetry with InvoicesPage cancel UX (S113).

**Pending:** prod migration (CI auto-applies on push), commit + push.

---

## Previous State (Session 119 — 2026-04-27) — CLOSED

**Invoice Mark-as-Paid → proper payment ledger entry (Option B, industry-standard).** S118 left a silent-correctness gap on the invoice detail page: clicking "Mark as Paid" flipped `invoice.status='paid'` + set `paid_at` but **never wrote a payment ledger entry**, so the customer's account still showed the full debit outstanding even though the invoice card said paid. Two sources of truth disagreed.

S119 fixes this with the Zoho/QB/Marg pattern (Tally-grade correctness underneath, cloud SME UX on top): "Mark as Paid" now opens a confirm modal carrying the **shared `<PaymentForm>`** (same component LedgerPanel uses) — date / mode (neft/upi/cash/cheque) / reference# / TCS toggle (customer side) / notes. On confirm, backend `mark_paid()` builds a `PaymentCreate` and calls `LedgerService.record_payment(reference_type='invoice', reference_id=invoice.id)`, then flips status. The ledger row deep-links back to this invoice from the customer ledger panel.

**Backend:**
  - `schemas/invoice.py` — new `MarkPaidRequest` (payment_date · payment_mode · reference_no · tds/tcs toggles + section + rate · notes).
  - `services/ledger_service.py` — `record_payment()` now accepts optional `reference_type` + `reference_id`; defaults to `'manual'` for ad-hoc receipts, `'invoice'`/invoice.id when called from invoice flow.
  - `services/invoice_service.py` — `mark_paid()` rewrite: validates state (`draft`/`issued` only) + customer presence, builds `PaymentCreate` from request + invoice context (`amount = invoice.total_amount`, `party_type = 'customer'`, `party_id = invoice.customer_id`), calls `record_payment(reference_type='invoice', reference_id=invoice.id)`, then flips status. v1 strict full-payment.
  - `api/invoices.py` — `mark_paid` route gains `req: MarkPaidRequest` body + extracts `fy_id` via `get_fy_id(current_user)` (matches existing pattern; `get_fy_id` is a plain function, not a Depends).

**Frontend:**
  - `components/common/PaymentForm.jsx` — NEW shared component extracted from LedgerPanel (PAYMENT_MODES + TDS_SECTIONS + TCS_SECTIONS exported as named consts; `emptyPaymentForm()` helper). Renders amount (with optional `amountReadOnly` + `amountHelper`) · date · mode · ref# · TDS panel (supplier/VA) · TCS panel (customer) · notes. Auto-clears stale TDS/TCS toggles when partyType flips.
  - `components/common/LedgerPanel.jsx` — refactored to use `<PaymentForm>` (~80 lines of inline form removed; behaviour identical).
  - `pages/InvoicesPage.jsx` — `openMarkPaid()` opens confirm modal pre-filled with `amount = inv.total_amount`. `handleMarkPaid()` posts the payload; modal sits beside the existing Cancel modal in z-[60]. Mark-as-Paid button now triggers `openMarkPaid` (was direct fire).
  - `api/invoices.js` — `markPaid(id, data)` signature; mock branch left unchanged.

**Industry alignment:** Zoho Books / QuickBooks / Marg pattern (invoice button opens payment receipt form, books the payment, links back). Tally Receipt Voucher (F6) is heavier — separate voucher type — but identical correctness. CAs accept both.

**Phase 4 deferrals (added to FINANCIAL_SYMMETRY_PLAN):**
  - **Bank/Cash chart-of-accounts ("Deposit To" ledger)** — Zoho/QB ask which bank ledger receives money; today `payment_mode` is a free string. Needs `BankLedger` master + `bank_ledger_id` FK on payment ledger entries.
  - **Partial payment / On-Account tracking** — Tally's bill-wise pattern. Adds `Invoice.amount_paid` Numeric col + `partially_paid` status + balance-aware UI. Defer until a real partial case appears.

**Pending:** local boot smoke + commit + push. Vite build clean. Backend imports clean (226 routes).

---

## Previous State (Session 118 — 2026-04-27) — CLOSED

**Phase 2 of FINANCIAL_SYMMETRY_PLAN — purchase-side totals symmetry.** Mirrors S117 across the supplier chain so every financial document carries the same totals stack and uses the same math (`taxable = subtotal − discount + additional → +GST → total`).

**Backend:**
  - `models/supplier_invoice.py` — +5 NOT NULL cols: `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount` (was only carrying `gst_percent`; totals were synthesised on every read from rolls × cost + purchase_items).
  - `models/return_note.py` — +2 nullable cols mirroring `tax_amount`: `discount_amount`, `additional_amount`.
  - `schemas/supplier_invoice.py` + `schemas/return_note.py` + `schemas/roll.py` (BulkStockIn + SupplierInvoiceUpdate) + `schemas/sku.py` (PurchaseStockRequest + PurchaseInvoiceResponse).
  - `services/roll_service.py` — `bulk_stock_in` stores disc/add on SI + computes totals over **all** rolls under that SI (handles "add to existing invoice"); `update_supplier_invoice` recomputes + replaces ledger when gst/disc/add change; `get_supplier_invoices` prefers stored totals, legacy fallback for old SIs.
  - `services/sku_service.py` — `purchase_stock` stores totals + uses stored total for ledger; `_purchase_invoice_to_response` returns new fields with legacy fallback.
  - `services/return_note_service.py` — `create_return_note` applies the rule; `update_return_note` extended to allow editing gst/disc/add with recompute; `_to_response` includes both new fields.
  - **Ledger (supplier credit on stock-in / debit on return)** — both paths now use the stored `total_amount` (was using on-the-fly synthesised sum).

**Frontend:**
  - `RollsPage.jsx` — stock-in: `invoiceHeader` + reset + `openEditInvoice` prefill + submit body + `challanTotals` math; Discount/Additional inputs in form; `summary card` grid expanded to 8 cols with conditional disc/add cells; detail KPI grid +Discount/Additional cards.
  - `SKUsPage.jsx` — purchase-stock: state/reset + math (`purchaseTaxable`, `purchaseGrandTotal` memos) + submit body + form fields after GST + totals card with conditional disc/add/taxable rows.
  - `ReturnsPage.jsx` — RN create form: state/reset + Discount/Additional inputs after GST + totals card with disc/add/taxable rows + submit body + detail Disc/Add cards.
  - `api/rolls.js` — `stockInBulk` payload now sends `discount_amount` + `additional_amount`.
  - `components/common/DebitNotePrint.jsx` — totals block now: Subtotal · (Discount) · Additional · Taxable Value · GST · TOTAL DEBIT.
  - `components/common/ReturnNotePrint.jsx` — totals block now: Subtotal · Discount · Additional · Taxable Value · CGST/SGST · TOTAL VALUE.
  - `ChallansPage.jsx` — no SI totals UI present, skipped.

**Migration:** `l2m3n4o5p6q7_s118_purchase_side_totals` — tenant-iterating, `col_exists` guarded; 5 cols on `supplier_invoices` (NOT NULL DEFAULT 0) + 2 cols on `return_notes` (nullable DEFAULT 0). Backfill reconstructs SI subtotal from `rolls.total_weight × cost_per_unit + purchase_items.total_price`, applies the SI's own `gst_percent`, fills `tax_amount` + `total_amount`. Idempotent via `COALESCE(si.subtotal, 0) = 0` skip — safe to re-run.

**Docs:** `API_REFERENCE.md` (Supplier Invoice grouping endpoint + PATCH SI shape extended); `FINANCIAL_SYMMETRY_PLAN.md` (Phase 2 ✅, all boxes ticked).

**Prod deploy:** Run by CI on push (S117 deploy confirmed CI auto-runs `alembic upgrade head`).

**Pending:** local migrate verification, vite build, smoke tests, commit + push.

---

## Previous State (Session 117 — 2026-04-27) — CLOSED

**Additional Amount column** on Order + Invoice grand totals. Mirrors `discount_amount` exactly — taxable = subtotal − discount + **additional** → +GST → total. Auto-copies order→invoice (full + proportional per-shipment). Proportionally reverses on credit-note (matches S113 discount pattern). Use cases: packing, freight, handling, labour. Client reference: per-line "Add Amt" in their accounting software simplified to single header-level field per UX request.

**Files:**
  - BE: `models/order.py` + `models/invoice.py` + `models/sales_return.py` (+`additional_amount` Numeric(12,2) default 0); `schemas/order.py` + `schemas/invoice.py` + `schemas/sales_return.py` (Create/Update/Response); `services/order_service.py` (create + update + response); `services/invoice_service.py` (4 paths: create_invoice, create_invoice_for_shipment proportional, create_standalone_invoice, update_invoice recalc + response); `services/sales_return_service.py` (fast-track CN proportional reverse + response).
  - FE: `pages/OrdersPage.jsx` (form state + edit prefill + submit body + form totals input + detail breakdown row); `pages/InvoicesPage.jsx` (form state + submit + form totals row, grid bumped 6→7 cols + detail mini summary + A4 print totals block + CN picker proportional preview); `components/common/CreditNotePrint.jsx` + `components/common/SalesReturnPrint.jsx` (totals block additional row).
  - Migration: `k1l2m3n4o5p6_s117_additional_amount` — single migration adds `additional_amount` to `orders`, `invoices`, `sales_returns` (tenant-iterating, idempotent via `col_exists`).
  - Docs: `API_REFERENCE.md` (Order + Invoice request/response shapes), `mock.js` (sample data).
  - **NOT touched:** `DebitNotePrint.jsx` / `ReturnNotePrint.jsx` (purchase-side, different model — out of scope).

**S116 Wastage Report (still PENDING prod deploy):**
Full spec → [REPORTS_AND_INVENTORY_PLAN.md § P4.7](REPORTS_AND_INVENTORY_PLAN.md). Files in S116 block above. Migration `j0k1l2m3n4o5` not yet run on EC2 — defer or batch with S117 deploy.

**P4.7 Wastage Report (S116)** — closes the S115 write-off loop. New top-level Reports tab unifying 5 wastage streams (cutting, roll VA damage, batch VA damage, sales-return damage, write-off) into one ₹ picture (AS-2 valued).

Full spec, deviations from original plan, file maps → [REPORTS_AND_INVENTORY_PLAN.md § P4.7](REPORTS_AND_INVENTORY_PLAN.md).

**Files:**
  - BE: `models/roll.py` (+`weight_at_write_off`), `services/roll_service.py` (snapshot before zero, both single + bulk write-off), `services/dashboard_service.py` (+`get_wastage_report`), `api/dashboard.py` (+2 endpoints).
  - FE: `api/dashboard.js` (+`getWastageReport`, +`downloadWastageReportCSV`), `pages/ReportsPage.jsx` (+`WastageTab` + tab wired into `TABS`/`validTabs`/render switch).
  - Migration: `j0k1l2m3n4o5_s116_writeoff_snapshot` — adds `Roll.weight_at_write_off` + backfills historical written-off rolls via reconstruction.
  - Docs: `API_REFERENCE.md` (+2 endpoints), `REPORTS_AND_INVENTORY_PLAN.md` (P4.7 ✅, table updated).

**Architectural note:** S115's `write_off_roll` zeroed `remaining_weight` without snapshotting it — historical wastage was unrecoverable. S116 fixes this properly (no band-aid): new snapshot column, service captures pre-zero value, migration backfills via `total_weight - SUM(consumed) - SUM(va_damage)` clamped ≥ 0.

**Prod deploy (S116 + S117) — ✅ DEPLOYED 2026-04-27 09:36 UTC.** CI/CD auto-ran `alembic upgrade head` as part of the EC2 deploy. Both `j0k1l2m3n4o5` (Roll.weight_at_write_off) and `k1l2m3n4o5p6` (additional_amount × 3 tables) live on `co_drs_blouse`. fastapi.service confirmed `active (running)`, health check 200.

**Math reference (the rule):**
```
order.total_amount   = sum(line items)            ← subtotal stays line-sum
invoice.subtotal     = order.total_amount         ← copy or proportional per-shipment
invoice.taxable      = subtotal − discount + additional
invoice.tax_amount   = taxable × gst_pct / 100
invoice.total_amount = taxable + tax_amount        ← debit ledger uses this
```
Sales-return CN inherits all three (subtotal, discount, additional) proportionally based on `cn_subtotal / invoice_subtotal` share — full credit ⇒ share=1 ⇒ CN total exactly equals invoice total.

---

## Previous State (Session 115d — 2026-04-24) — CLOSED

**Reports overhaul (P4.1 Inventory + P5 Tier 1 Sales) + UX polish.** Inventory tab expanded-row chips (Free/Locked/Out/Dead) + tunable Dead-days; Sales tab stuck-days filter + horizontal funnel; URL-synced active tab on both ReportsPage (`?tab=`) and InventoryPage (`?tab=`); OrdersPage `?status=` deep-link fix. Plan refs: REPORTS_AND_INVENTORY_PLAN.md §4 + §5. Commits `407ca6c` (P4.1) + `d9e9bf0` (P5 Tier 1) + polish (`9abf66b..902e839`) — deployed to prod.

> **Detailed S115/S115b/S115c-i/S115c-ii/S115d notes** are condensed in the Session History table below. Plan checklist + API shapes live in [REPORTS_AND_INVENTORY_PLAN.md](REPORTS_AND_INVENTORY_PLAN.md).

---

## Previous Sessions (S87-S115d) — Invoice, Shipping, Returns, FY, Reports, SKU, Thermal Labels, Cost Accounting

- **S115d:** Reports tab polish — Inventory chips (Free/Locked/Out/Dead) + tunable dead-days; Sales stuck-days filter + horizontal funnel; ReportsPage `?tab=` + InventoryPage `?tab=` URL persistence; OrdersPage `?status=` deep-link fix. Refs: REPORTS_AND_INVENTORY_PLAN.md §4 + §5. 14 commits `9abf66b..902e839`.
- **S115c-ii:** P5 Tier 1 Sales Report — `get_sales_report` extended (`previous_period`, `stuck_orders`, `top_products`, `revenue_daily`) + params `stuck_days`/`top_n` + `GET /dashboard/sales-report.csv`. KpiCard with delta+sparkline (no deps), OrderFunnel 5-stage, Top Products. No migration. Ref: §5. Commit `d9e9bf0`. **Edit-tool gotcha:** JSON transport converts JS `₹` → literal `₹` — use literal in source.
- **S115c-i:** P4.1 Inventory Report — `get_inventory_position(filters...)` + `GET /dashboard/inventory-position` + `.csv`. Payload `{kpis, groups[design→skus], totals, period}`. WAC via `compute_wac_map` (AS-2). 8 KPIs (4 period + 4 position). Custom accordion (DataTable expandedRows didn't fit). `fabric_type` substring placeholder → P4.5. `short_sku_count` threshold 5 → P4.3. No migration. Ref: §4. Commit `407ca6c`.
- **S115b:** Bulk write-off + contextual UX. `POST /rolls/bulk-write-off` (per-roll FOR UPDATE, ineligible skipped not aborted). Floating bulk-bar gated on `allRemnant`. Polymorphic modal (single vs bulk via `bulkWriteOffTargets.length`). Detail: amber teaching strip on remnant, gray audit on written_off. No migration.
- **S115:** Cutting sheet palla override + remnant write-off. (1) PALLAS editable on lot create + detail (status='open' guard). New `LotRollInput.num_pallas` + `PATCH /lots/{lot_id}/rolls/{lot_roll_id}`. Service: lock FOR UPDATE, `fabric_available = roll.remaining_weight + lot_roll.weight_used` (self-consistent across edits). (2) `POST /rolls/{id}/write-off` — `remnant→written_off`, weight=0, 4 audit cols. Migration `i9j0k1l2m3n4_s115_roll_write_off` (drops both `ck_rolls_valid_status` AND `valid_status`). Written-off excluded from active pickers. **Prod deploy:** `alembic upgrade head` on EC2.
- **S114:** Unified CN picker (`CreditNotePickerModal` shared on Invoice/Order/Returns: Fast-track vs With-QC). `SalesReturn.workflow_type` col (migration `h8i9j0k1l2m3`). All 4 return prints rewritten — CN/DebitNote = A4 half-page GST summary (no SKU list per Rule 53(1A)); SalesReturn/ReturnNote = full-page warehouse doc (3-way signature, page counter, TOTALS out of `<tfoot>`). Inline SVG icons. 15 commits `114da8f..6b96e9b`.
- **S113:** RES code collision hotfix (`_max_code` sort: LENGTH DESC, col DESC — `'RES-9999'>'RES-10000'` lex bug) + diff-based `update_order` (was N+N RES rows/edit, now O(changed)). **Invoice cancel/CN overhaul — Tally model:** cancel = status flip + audit; CN is sole ledger reversal. Fast-track `POST /invoices/{id}/credit-note` → closed SR in one call (SRN+CN, proportional discount, per-line restore_stock). Cancel→CN chain checkbox. `SalesReturn.invoice_id` + `discount_amount` cols. 3 migrations `e5f6…` `f6g7…` `g7h8…`. Phase 4 (full shipment reversal) rejected. 14 commits `33b7cf1..c9d7c2c`.
- **S112:** SKU infra overhaul. `GET /skus/grouped` + `/skus/summary`. **Last Cost vs WAC split:** `base_price` = latest stock-in (always overwritten); WAC derived from events via `compute_wac_map` for FY closing + valuation (AS-2). No backfill — write-path handles new events. SKU detail WOW (3-block hero). Bulk label print (3-state parent, A4/Thermal × per-piece/per-SKU). Orders/Invoices `pickDefaultRate(sku)` + amber Last Cost warning. "Price" → "Sale Rate". 15 commits `cd9d86e..798ed3f`.
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
| S115d | Reports tab polish + URL persistence | Inventory tab chips (Free/Locked/Out/Dead) + tunable dead-days threshold; Sales tab stuck-days filter + horizontal funnel; ReportsPage `?tab=` + InventoryPage `?tab=` URL persistence; OrdersPage `?status=` deep-link fix from stuck-orders banner. Refs: REPORTS_AND_INVENTORY_PLAN.md §4 + §5. 14 commits `9abf66b..902e839` |
| S115c-ii | P5 Tier 1 Sales Report WOW | `dashboard_service.get_sales_report` extended with `previous_period`/`stuck_orders`/`top_products`/`revenue_daily` + params `stuck_days`/`top_n` + new `GET /dashboard/sales-report.csv`. Frontend: KpiCard with delta+sparkline (no deps), OrderFunnel 5-stage horizontal bars, Top Products table, Export CSV. Tier 2/3 deferred (geo/churn/broker ROI). No migration. Ref: §5. Commit `d9e9bf0`. **Edit-tool gotcha:** JSON transport converts JS `₹` → literal `₹` — use literal `₹` in source |
| S115c-i | P4.1 Inventory Report overhaul | `dashboard_service.get_inventory_position(filters...)` + `GET /dashboard/inventory-position` + `.csv`. Payload `{kpis, groups[design→skus], totals, period}`. WAC via `SKUService.compute_wac_map` (AS-2). 8 KPIs (4 period + 4 position). Custom accordion (DataTable expandedRows didn't fit sibling-row grouping). `fabric_type` is substring placeholder — proper home P4.5. `short_sku_count` hard threshold 5 — P4.3 swaps for per-SKU `reorder_level`. No migration. Ref: §4. Commit `407ca6c` |
| S115b | Write-off contextual UX + bulk write-off | New `POST /rolls/bulk-write-off` (per-roll FOR UPDATE, ineligible skipped not aborted, returns `{processed, processed_ids, failed}`). Floating bulk-bar Write Off button gated on `allRemnant`. Polymorphic modal (single vs bulk via `bulkWriteOffTargets.length`). Detail page: amber teaching strip on remnant, gray audit strip on written_off. No migration |
| S115 | Cutting sheet palla override + remnant write-off | (1) PALLAS editable on lot create + detail (status='open' guard). New `LotRollInput.num_pallas` + `PATCH /lots/{lot_id}/rolls/{lot_roll_id}`. Service: lock FOR UPDATE, `fabric_available = roll.remaining_weight + lot_roll.weight_used` (self-consistent across edits — see memory `feedback_lot_roll_fabric_available`). (2) `POST /rolls/{id}/write-off` — `remnant→written_off`, weight=0, 4 audit cols (`written_off_at/by/reason/notes`). Migration `i9j0k1l2m3n4_s115_roll_write_off` (drops both `ck_rolls_valid_status` AND `valid_status` per ck_-prefix memory). Written-off excluded from all active pickers. **Prod deploy:** `alembic upgrade head` on EC2 |
| S114 | Unified CN picker + Print suite redesign (sales + purchase symmetry) | `CreditNotePickerModal` shared across Invoice/Order/Returns pages — ⚡ Fast-track vs 🔍 With QC cards, contextual button labels per page (CN vs Sales Return per Tally convention). `SalesReturn.workflow_type` column (migration `h8i9j0k1l2m3`) drives list badges. All 4 return print templates rewritten: **CreditNotePrint + DebitNotePrint** = A4 half-page GST summary (cut line at 148.5mm midpoint, top-half locked to 138.5mm, Amount-in-Words, emerald-tinted tax breakup card, NO SKU list per GST Rule 53(1A), single signature); **SalesReturnPrint + ReturnNotePrint** = A4 full-page warehouse/ops (4-card summary bar, condition chip G/D/R circle, verify-box column, 3-way signature — Received/Inspected/Authorised for sales, Dispatched/Acknowledged/Authorised for purchase, dynamic table columns for roll vs SKU returns, TOTALS as post-table div not `<tfoot>` to stop multi-page duplication, page counter `Page X of Y` via `@page @bottom-center`). Fixed CN print padding stacking (38mm → 14mm), `overflow: hidden` clipping the signature block, duplicate TOTALS on multi-page SR. Emojis → inline SVG icons (bolt/clipboard-check) with gradient tiles, zero new deps. Button labels: `Print Credit Note` / `Print Sales Return` / `Print Debit Note` / `Print Return Note`. 15 commits `114da8f..6b96e9b` |
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
