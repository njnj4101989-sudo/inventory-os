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
| 2 | Purchase Side — SupplierInvoice · ReturnNote · DebitNote | ⏳ PENDING | S118 (next) |
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

## Phase 2 — Purchase Side ⏳ PENDING (S118)

**Scope:** mirror Phase 1 across the supplier chain. SupplierInvoice gains the full totals stack (currently has only `gst_percent`); ReturnNote/DebitNote gain `discount_amount` + `additional_amount` and proportional reverse on debit-note creation.

### Decision (locked)
- **Single `additional_amount` field** (option 1 from audit). No itemised freight/loading/cartage breakdown. Same UX both directions. Free-text label deferred to Phase 4.

### Backend
- [ ] `SupplierInvoice` model — add `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount` (all `Numeric(12,2) DEFAULT 0`)
- [ ] `ReturnNote` model — add `discount_amount`, `additional_amount` (mirror `tax_amount` nullability)
- [ ] `schemas/supplier_invoice.py` — Create/Update/Response add 5 fields
- [ ] `schemas/return_note.py` — Create/Update/Response add 2 fields
- [ ] `services/roll_service.py` — supplier invoice creation path: store totals from request + apply math (was synthesising on the fly)
- [ ] `services/sku_service.py` — purchase-stock supplier invoice path: same totals math
- [ ] `services/return_note_service.py` — apply same math on close + DN issue
- [ ] **Auto-copy**: when raising a Debit Note from SupplierInvoice → proportionally copy `discount_amount` + `additional_amount` (mirror S117 CN pattern)
- [ ] Supplier ledger debit: should now use `SupplierInvoice.total_amount` (not synthesised sum)

### Frontend
- [ ] `RollsPage.jsx` — stock-in form: add Discount + Additional rows in totals card; submit body wires fields
- [ ] `RollsPage.jsx` — supplier invoice detail/edit panel: same fields + math
- [ ] `SKUsPage.jsx` — purchase-stock form: same fields
- [ ] `ReturnsPage.jsx` — return note create form: Discount + Additional rows in totals card
- [ ] `ReturnsPage.jsx` — return note detail summary: show rows when > 0
- [ ] `ChallansPage.jsx` — supplier invoice list/detail: show new totals
- [ ] `components/common/DebitNotePrint.jsx` — totals block adds Additional row (Discount already supported pattern-wise; verify)
- [ ] `components/common/ReturnNotePrint.jsx` — totals block adds Discount + Additional rows (currently neither shown)

### Migration
- [ ] New file: `l2m3n4o5p6q7_s118_purchase_side_totals.py`
  - tenant-iterating, `col_exists` guarded
  - 5 cols on `supplier_invoices` + 2 cols on `return_notes`
  - Backfill: `supplier_invoices.subtotal = SUM(rolls.total_weight × rate) + SUM(purchase_items.total_price)`; `tax_amount = subtotal × gst_percent / 100`; `total_amount = subtotal + tax_amount`
  - **Skip backfill if any historical SI already has the column populated** (idempotent re-runs)

### Docs
- [ ] `API_REFERENCE.md` — SupplierInvoice + ReturnNote shapes
- [ ] `mock.js` — sample data with new fields
- [ ] `CLAUDE.md` — S118 entry, mark Phase 2 ✅
- [ ] `FINANCIAL_SYMMETRY_PLAN.md` — tick all checkboxes above

### Verify
- [ ] Local migration applies + columns confirmed in both tenant schemas
- [ ] Pydantic schemas validate end-to-end
- [ ] Frontend `vite build` clean
- [ ] Smoke: stock-in with discount + additional → ledger debit matches `total_amount`
- [ ] Smoke: raise Debit Note against partial supplier invoice → proportional disc + add carried over
- [ ] Prod deploy (CI auto-migration confirmed in S117)

---

## Phase 3 — VA Cost Flow 🔒 DEFERRED

**Why deferred:** touches the 5-component batch cost engine (S97). Needs its own design pass — VA partner GST handling, freight, returnable-after-VA semantics. Don't bundle with Phase 2.

### Scope (when picked up)
- [ ] `JobChallan` (roll VA) — add money fields: `gst_percent`, `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount`
- [ ] `BatchChallan` (garment VA) — replace flat `total_cost` with full stack
- [ ] Wire VA totals into `Batch` 5-component cost (material + roll_va + stitching + **batch_va** + other)
- [ ] AS-2 valuation accuracy: VA-inclusive batch unit cost flows into closing-stock + WAC

---

## Phase 4 — Minor Cleanups 🔒 DEFERRED

### Scope
- [ ] `PurchaseItem.gst_percent` (per-line) vs `SupplierInvoice.gst_percent` (header) — pick one home, drop the other or aggregate consistently
- [ ] `SKU.gst_percent` — currently inert (HSN drives GST in invoices); decide: drop or wire into `pickDefaultRate` chain
- [ ] Free-text `additional_label` on Order + Invoice + SupplierInvoice (e.g. "Freight" / "Cartage" / "Packing") — UX nice-to-have once Phase 2 is live

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
