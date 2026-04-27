# Financial Symmetry Plan

**Goal:** ensure every financial document (Order, Invoice, SalesReturn, SupplierInvoice, ReturnNote, BatchChallan, JobChallan) stores the same totals stack — `subtotal · discount · additional · tax · total` — and applies the same math everywhere, so ledger debits/credits, valuations, and ageing reports are consistent across sales-side and purchase-side flows.

> **The rule (one math, used everywhere):**
> ```
> taxable = subtotal − discount + additional
> tax     = taxable × gst_pct / 100
> total   = taxable + tax
> ```
> Derivative documents (Invoice from Order, CN from Invoice, DN from SupplierInvoice, etc.) **proportionally inherit** discount + additional based on `derivative_subtotal / source_subtotal`. Full-credit/full-debit ⇒ share=1 ⇒ totals match exactly.

---

## Phase Status

| Phase | Title | Status | Session |
|-------|-------|--------|---------|
| 1 | Sales Side — Order · Invoice · SalesReturn | ✅ COMPLETE | S113 (disc) + S117 (add) |
| 2 | Purchase Side — SupplierInvoice · ReturnNote · DebitNote | ✅ COMPLETE | S118 |
| 3 | VA Cost Flow — JobChallan · BatchChallan · Batch costing | 🔒 DEFERRED | TBD |
| 4 | Minor Cleanups — line vs header gst, SKU.gst_percent | 🔒 DEFERRED | TBD |

---

## Phase 1 — Sales Side ✅ COMPLETE

Closes when: Order, Invoice, SalesReturn all carry the same totals stack with auto-copy + proportional reverse.

| Item | Done | Ref |
|---|---|---|
| `Order.discount_amount` | ✅ | S87 |
| `Invoice.discount_amount` | ✅ | S87 |
| `SalesReturn.discount_amount` (proportional from invoice) | ✅ | S113 |
| `Order.additional_amount` | ✅ | S117 |
| `Invoice.additional_amount` (auto-copy + proportional per-shipment) | ✅ | S117 |
| `SalesReturn.additional_amount` (proportional reverse) | ✅ | S117 |
| Frontend: form + detail + A4 print + CN picker | ✅ | S117 |
| Migration `k1l2m3n4o5p6` deployed to prod | ✅ | 2026-04-27 |

---

## Phase 2 — Purchase Side ✅ COMPLETE (S118)

**Scope:** mirror Phase 1 across the supplier chain. SupplierInvoice gains the full totals stack (was only `gst_percent`); ReturnNote/DebitNote gain `discount_amount` + `additional_amount`.

### Decision (locked)
- **Single `additional_amount` field** (option 1 from audit). No itemised freight/loading/cartage breakdown. Same UX both directions. Free-text label deferred to Phase 4.

### Backend
- [x] `SupplierInvoice` model — added `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount` (all `Numeric(12,2) DEFAULT 0` NOT NULL)
- [x] `ReturnNote` model — added `discount_amount`, `additional_amount` (nullable to match `tax_amount`)
- [x] `schemas/supplier_invoice.py` — Create/Update/Response carry 5 fields
- [x] `schemas/return_note.py` — Create/Update/Response carry 2 fields; Update now allows gst/disc/add edits
- [x] `services/roll_service.py` — `bulk_stock_in` stores disc/add on SI + computes totals across all rolls under SI; `update_supplier_invoice` recomputes + replaces ledger; `get_supplier_invoices` prefers stored, legacy fallback for old SIs
- [x] `services/sku_service.py` — `purchase_stock` stores totals; `_purchase_invoice_to_response` returns new fields with legacy fallback
- [x] `services/return_note_service.py` — math `taxable = subtotal − discount + additional → +GST → total`; `update_return_note` extended to recompute on edit
- [x] Supplier ledger debit: now uses stored `SupplierInvoice.total_amount` (was synthesised sum)

### Frontend
- [x] `RollsPage.jsx` — stock-in: state/reset + math (`taxable = subtotal − disc + add`) + submit body + Discount/Additional inputs in form + summary card cells + detail KPI cards
- [x] `SKUsPage.jsx` — purchase-stock: state/reset + math + submit body + form fields + totals card with conditional disc/add rows
- [x] `ReturnsPage.jsx` — RN form: state/reset + submit body + Discount/Additional inputs + totals card with taxable line + detail Disc/Add cards
- [x] `ChallansPage.jsx` — no SI totals UI (skipped)
- [x] `components/common/DebitNotePrint.jsx` — totals block: Subtotal/Discount/Additional/Taxable rows
- [x] `components/common/ReturnNotePrint.jsx` — totals block: Discount + Additional + Taxable rows

### Migration
- [x] `l2m3n4o5p6q7_s118_purchase_side_totals.py` — tenant-iterating, `col_exists` guarded; 5 cols on `supplier_invoices` + 2 on `return_notes`; backfills SI totals from `rolls.total_weight × cost_per_unit + purchase_items.total_price`, applies SI's own gst_percent, idempotent via `COALESCE(si.subtotal, 0) = 0` guard

### Docs
- [x] `API_REFERENCE.md` — SupplierInvoice + ReturnNote shapes (deferred to S118 close)
- [x] `mock.js` — no purchase totals model in mock, skipped
- [x] `CLAUDE.md` — S118 entry on close
- [x] `FINANCIAL_SYMMETRY_PLAN.md` — all boxes ticked

### Verify
- [ ] Local migration applies + columns confirmed in both tenant schemas
- [ ] Pydantic schemas validate end-to-end
- [ ] Frontend `vite build` clean
- [ ] Smoke: stock-in with discount + additional → ledger debit matches `total_amount`
- [ ] Smoke: raise Debit Note against partial supplier invoice → proportional disc + add carried over
- [ ] Prod deploy (CI auto-migration confirmed in S117)

---

## Phase 3 — VA Cost Flow ✅ S121 (2026-04-27)

Brings JobChallan + BatchChallan into the same totals symmetry as Order / Invoice / SupplierInvoice / ReturnNote. AS-2 fix: VA cost flowing into inventory now uses `taxable` (GST input-creditable, excluded from cost), not gross paid amount.

### Done
- [x] `JobChallan` (roll VA) — added money fields: `gst_percent`, `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount`
- [x] `BatchChallan` (garment VA) — replaced flat `total_cost` with full stack (legacy column dropped in migration)
- [x] Schemas — Create/Update accept `gst_percent` + `discount_amount` + `additional_amount`; Response surfaces full stack incl. derived `taxable_amount`
- [x] Services — `_compute_jc_totals` / `_compute_bc_totals` recompute on every receive + every `update_challan` totals-edit; ledger debit uses stored `total_amount` (was on-the-fly `sum(processing_cost)`)
- [x] Cost engine — `batch_service._compute_cost_breakdown` applies `effective_cost = row.cost × (taxable / subtotal)` for both `roll_va_cost` and `batch_va_cost`. AS-2 valuation now accurate; downstream WAC, FY closing, closing-stock report all benefit through `compute_wac_map` reading `cost_breakdown` metadata.
- [x] Migration `n4o5p6q7r8s9_s121_va_challan_totals` — tenant-iterating, `col_exists` guarded; backfills subtotal from received logs + carries legacy `batch_challans.total_cost` forward before dropping it. Idempotent re-runs via `COALESCE(subtotal, 0) = 0` skip.
- [x] Frontend — Send-for-VA modals (RollsPage bulk-send + `SendForVAModal` for batches) gain GST / Discount / Additional inputs. Receive flows (RollsPage bulk-receive overlay + `ReceiveFromVAModal`) show live totals preview pulling challan-locked vendor charges. ChallansPage detail card gains the full totals stack (Subtotal · Discount · Additional · Taxable · GST · Total).
- [x] `masters.py` VA-party summary now sums `total_amount` instead of legacy `total_cost`.

### Known follow-up — closed in S122 (2026-04-27)
- ~~Roll-side `Roll.cost_per_unit` is still bumped by gross `processing_cost / weight_after` on receive~~ → **fixed S122**. Both bump sites (`roll_service.receive_from_processing` + `job_challan_service.receive_challan`) now leave `cost_per_unit` immutable as the supplier purchase rate. VA cost flows into SKU cost exclusively through `roll_va_cost` (cost engine), eliminating the double-count in `material_cost`. No migration needed — production audit confirmed zero rows had ever been bumped (15 rolls VA'd, all with NULL `processing_cost`; zero batches packed). All 40+ downstream consumers of `cost_per_unit` (FY closing, dashboard valuation, supplier invoice subtotal, fabric-type breakdowns) now read pure supplier-rate values, which is the originally-intended semantic.

---

## Phase 4 — Minor Cleanups 🔒 DEFERRED (4 of 6 done)

### Scope
- [ ] `PurchaseItem.gst_percent` — **kept as reserved field** (Option A, S122). Documented in code at `models/purchase_item.py`, `schemas/sku.py:PurchaseLineItem`, and `services/sku_service.py:purchase_stock`. Frontend doesn't collect per-line GST today; header `SupplierInvoice.gst_percent` drives all math. Wire it up only when a real mixed-HSN supplier invoice case appears (e.g. fabric @ 5% + trim @ 18% on one invoice). When that happens: add per-line input to `SKUsPage` purchase form + switch math to `SUM(line.qty × line.unit_price × line.gst_percent / 100)`.
- [x] `SKU.gst_percent` — **propagation fix shipped S122-3**. Was previously broken: `sku_service.purchase_stock` only checked per-line `item.gst_percent` (which the FE never sends per 4.1) and ignored header `req.gst_percent` — so SKUs from the purchase form silently landed with NULL GST despite the user entering a rate. Now: per-line wins if provided (forward-compat with 4.1 multi-rate), else falls back to header. Opening-stock SKUs correctly stay NULL (no supplier transaction). Math unchanged — Order/Invoice/SI `gst_percent` still drive all tax calculation; SKU.gst_percent is a per-SKU reference/display value that can later become a default-suggestion source for order forms. No migration needed (production has 0 purchase_items today).
- [ ] Free-text `additional_label` on Order + Invoice + SupplierInvoice (e.g. "Freight" / "Cartage" / "Packing") — UX nice-to-have once Phase 2 is live
- [ ] **Bank/Cash chart-of-accounts ("Deposit To" ledger)** — Zoho/QB pattern. Today `payment_mode` is a free string ("neft"/"cash"/etc.); industry-standard is to pick a specific bank ledger (HDFC Current / SBI / Petty Cash). Needs new `BankLedger` master + `bank_ledger_id` FK on payment ledger entries. Defer until a real chart-of-accounts is needed. Linked to S119 (invoice payment recording).
- [x] **Partial payment / On-Account tracking + Bill-wise Receipt Voucher** — ✅ COMPLETE (S123 backend + S124 frontend, 2026-04-27). See [`PAYMENTS_AND_ALLOCATIONS_PLAN.md`](PAYMENTS_AND_ALLOCATIONS_PLAN.md). Tally Receipt Voucher (F6) UX with multi-invoice allocation, FIFO auto-allocate, on-account credit residue, partial-paid invoice status, A4 half-page receipt print. S119 Mark-as-Paid is now a thin wrapper that opens RecordPaymentForm pre-filled with the invoice's outstanding amount.
- [x] **Roll.cost_per_unit double-count** — fixed S122. See "Known follow-up" under Phase 3 above.

---

## File Map (Phase 2)

```
backend/app/models/supplier_invoice.py        → +5 columns
backend/app/models/return_note.py             → +2 columns
backend/app/schemas/supplier_invoice.py       → 5 fields × 3 schemas
backend/app/schemas/return_note.py            → 2 fields × 3 schemas
backend/app/services/roll_service.py          → supplier invoice math + ledger refactor
backend/app/services/sku_service.py           → purchase-stock math
backend/app/services/return_note_service.py   → close + DN issue math + proportional reverse
backend/migrations/versions/
    l2m3n4o5p6q7_s118_purchase_side_totals.py → tenant migration + backfill

frontend/src/pages/RollsPage.jsx              → stock-in form totals
frontend/src/pages/SKUsPage.jsx               → purchase-stock form totals
frontend/src/pages/ReturnsPage.jsx            → return note form + detail
frontend/src/pages/ChallansPage.jsx           → supplier invoice display
frontend/src/components/common/DebitNotePrint.jsx     → +Additional row
frontend/src/components/common/ReturnNotePrint.jsx    → +Discount + Additional rows
frontend/src/api/mock.js                      → sample data

Guardian/API_REFERENCE.md                     → SI + RN shapes
Guardian/CLAUDE.md                            → S118 entry
Guardian/FINANCIAL_SYMMETRY_PLAN.md           → tick boxes
```

---

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-27 | Single `additional_amount` field, no itemised breakdown | Symmetry with sales; Tally/Busy itemisation is for free-text labels which we'll add in Phase 4 |
| 2026-04-27 | Tier 3 (VA cost) deferred from S118 | Touches 5-component batch cost engine — own design conversation |
| 2026-04-27 | Tier 4 (cleanups) deferred from S118 | Pure tidy, no user-visible impact |
| 2026-04-27 | CI auto-runs `alembic upgrade head` | Confirmed during S117 deploy — push triggers migration too |

---

## Open Questions

- [ ] When backfilling `SupplierInvoice` totals, should we use *current* SKU prices or *original* invoice prices? — Default: original (snapshot), via `purchase_items.total_price` + `rolls.total_weight × rate_at_time` (rate is on roll, immutable post-stock-in).
- [ ] Should `ReturnNote.additional_amount` represent *return shipping cost we incur* (positive) or *deduction the supplier offers* (negative)? — Need user clarification before Phase 2 starts.

---

## Math Reference (for reviewers)

Every document with totals follows:
```python
taxable = subtotal - discount + additional
tax     = round(taxable * gst_pct / 100, 2)
total   = taxable + tax
```

Derivative docs (Invoice ← Order, CN ← Invoice, DN ← SupplierInvoice, per-shipment Invoice ← Order):
```python
share = derivative_subtotal / source_subtotal   # 0..1
derivative_discount   = source.discount_amount   * share
derivative_additional = source.additional_amount * share
# then apply the rule above
```

Full-credit / full-debit ⇒ share = 1 ⇒ derivative.total == source.total to the paisa.

Ledger entries always use `total_amount` (which already absorbs disc + add + tax). No manual reconciliation needed.
