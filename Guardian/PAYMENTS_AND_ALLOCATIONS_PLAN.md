# PAYMENTS_AND_ALLOCATIONS_PLAN — Partial Payment + Bill-wise Receipt System

> **Status:** 🔒 DESIGN LOCKED — all 7 questions resolved 2026-04-27. Ready for S123 build.
> **Origin:** Phase 4.5 of FINANCIAL_SYMMETRY_PLAN — promoted to dedicated plan because of scope.
> **Estimated effort:** 2 sessions (S123 backend + S124 frontend), ~1 day each.
> **Industry pattern:** Tally Receipt Voucher (F6) — the Indian accounting standard.
> **Last updated:** 2026-04-27 (S122 close)

---

## 0. Resume Protocol

Anyone picking this up mid-stream — start here:

1. Read this whole doc top to bottom (~5 min)
2. Check the **Phase Checklist** below to see which boxes are ticked
3. Check `git log --oneline | grep -E "S12[34]"` to see which sub-commits landed
4. Read the most recent entry in the **Decisions Log** so you don't re-debate settled choices
5. Resume at the first unticked box

**Closing a session:** before logging off, ensure
- [ ] every code change is committed + pushed (no dirty working tree)
- [ ] this doc has the latest checkbox state
- [ ] CLAUDE.md "Current State" entry mentions which sub-checkbox you stopped at
- [ ] no half-applied migrations on local dev (alembic upgrade head + downgrade -1 + upgrade head test)

---

## 1. Goal & Scope

### What this builds
A proper receipt-and-allocation system where one incoming customer payment can be **split across multiple invoices** (with optional partial settlement on any of them), and any unallocated remainder becomes **on-account credit** for future application.

### Concrete user story
> Customer Ramesh has 4 open invoices totalling ₹105,000. He sends ₹50,000 (NEFT, UTR-12345). User opens "Record Payment", picks Ramesh, enters ₹50,000. System auto-loads Ramesh's open invoices. User allocates: ₹20,000 to INV-0001 (full), ₹20,000 to INV-0002 (full), ₹10,000 to INV-0003 (partial — ₹15,000 still due). System creates 1 PaymentReceipt + 3 PaymentAllocations + 4 LedgerEntries + flips invoice statuses + updates `amount_paid` on each invoice.

### What changes for the user
- New top-level page **"Payments"** (sidebar under Commerce, between Invoices and Returns)
- New **"Record Payment"** form with customer picker + open-invoices allocation table
- **InvoicesPage** gains a "Pending ₹X" column and `partially_paid` status badge
- Existing **Mark-as-Paid** button on invoice detail keeps working — just opens the new form pre-filled with that single invoice
- **Customer detail / LedgerPanel** shows outstanding receivable + on-account credit balance prominently

### What stays exactly the same
- Order → Invoice flow (unchanged)
- Cancel / CN flow (unchanged — S113 still owns this)
- Existing `paid` invoices in production stay paid (backfilled `amount_paid = total_amount`)
- Tax math, GST, totals, ledger debit/credit conventions
- All other reports, prints, dashboards

### Out of scope (deferred unless explicitly added later)
- Supplier-side bill-wise payment booking (data model supports it, frontend defers)
- VA-party bill-wise payment booking (same — model supports, FE defers)
- Bank/Cash chart-of-accounts (Phase 4.4 — separate plan)
- Foreign currency receipts
- TDS deduction at receipt time (S119 already handles TDS at the LedgerEntry level — same pattern flows through)
- Auto-reconciliation against bank statement (post-4.4)

---

## 2. Architecture

### 2.1 Data model

**Two new tables.** Both tenant-schema.

```python
class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"
    __table_args__ = (
        CheckConstraint(
            "party_type IN ('customer', 'supplier', 'va_party')",
            name="pr_valid_party_type",
        ),
    )
    receipt_no: Mapped[str]              # PAY-0001, auto-sequential per FY
    party_type: Mapped[str]              # customer | supplier | va_party
    party_id: Mapped[UUID]               # polymorphic — service resolves to customers/suppliers/va_parties table
    payment_date: Mapped[date]
    payment_mode: Mapped[str]            # neft | upi | cash | cheque | card
    reference_no: Mapped[str | None]     # UTR / cheque no
    total_amount: Mapped[Decimal]        # what was received
    allocated_amount: Mapped[Decimal]    # SUM(allocations.amount_applied) — denormalised for fast list queries
    on_account_amount: Mapped[Decimal]   # total_amount − allocated_amount (≥ 0)
    notes: Mapped[str | None]
    fy_id: Mapped[UUID]
    created_by_id: Mapped[UUID]
    created_at: Mapped[datetime]
    # Relationships
    allocations = relationship("PaymentAllocation", back_populates="receipt")
    created_by_user = relationship("User", foreign_keys=[created_by_id])

class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    payment_receipt_id: Mapped[UUID]     # FK ON DELETE CASCADE
    invoice_id: Mapped[UUID | None]      # FK — nullable for pure on-account
    amount_applied: Mapped[Decimal]
    created_at: Mapped[datetime]
    # Relationships
    receipt = relationship("PaymentReceipt", back_populates="allocations")
    invoice = relationship("Invoice")
```

**One column added to existing `invoices` table:**
```sql
ALTER TABLE invoices ADD COLUMN amount_paid NUMERIC(12,2) DEFAULT 0 NOT NULL;
```

**One CHECK constraint widened on `invoices`:**
```sql
-- old: status IN ('draft','issued','paid','cancelled')
-- new: status IN ('draft','issued','partially_paid','paid','cancelled')
ALTER TABLE invoices DROP CONSTRAINT invoice_valid_status;
ALTER TABLE invoices ADD CONSTRAINT invoice_valid_status
    CHECK (status IN ('draft','issued','partially_paid','paid','cancelled'));
```

### 2.2 Status state machine on `Invoice`

```
draft ──issue──→ issued ──pay (full)──→ paid
                    │                     │
                    │                     ↓
                    └──pay (partial)──→ partially_paid ──pay (rest)──→ paid

Any state ──cancel──→ cancelled (S113 audit trail)
```

- `partially_paid` is a new in-between state when `0 < amount_paid < total_amount`
- Auto-transition to `paid` when `amount_paid >= total_amount`
- Cancel from `partially_paid` requires CN per S113 model (existing rule stays)

### 2.3 Ledger booking pattern

Each PaymentAllocation produces one LedgerEntry (debit invoice clearing, credit customer). One additional "header" entry per receipt is **not** created — the customer's running balance is computed from invoice + allocation entries directly.

For each allocation:
```
LedgerEntry {
  party_type='customer', party_id=receipt.party_id,
  entry_type='payment',
  reference_type='payment_allocation', reference_id=allocation.id,
  debit=allocation.amount_applied,   # reduces customer's open balance
  credit=0,
  description='PAY-XXXX → INV-YYYY ₹{amount}'
  (TDS/TCS sub-entries handled exactly like S119 if applicable)
}
```

For pure on-account (invoice_id NULL):
```
LedgerEntry {
  reference_type='payment_allocation', reference_id=allocation.id,
  debit=allocation.amount_applied,
  credit=0,
  description='PAY-XXXX on-account credit ₹{amount}'
}
```

This keeps every payment auditable and traceable: customer ledger panel can show "PAY-0001 cleared INV-0003 ₹10,000" with deep-links both ways.

### 2.4 Service surface

```python
class PaymentReceiptService:
    async def record(
        party_type: str,
        party_id: UUID,
        payment_date: date,
        payment_mode: str,
        reference_no: str | None,
        total_amount: Decimal,
        allocations: list[{invoice_id: UUID | None, amount_applied: Decimal}],
        notes: str | None,
        tds_*: ...,   # mirrors S119 PaymentForm fields
        tcs_*: ...,
        fy_id: UUID,
        created_by: UUID,
    ) -> dict:
        """
        Atomic transaction:
        1. Validate SUM(allocations) <= total_amount
        2. Lock target invoices FOR UPDATE
        3. Validate each allocation.amount_applied <= invoice.outstanding
        4. Create PaymentReceipt
        5. Create N PaymentAllocations
        6. Per allocation: invoice.amount_paid += amount; flip status if needed
        7. Per allocation: LedgerEntry (debit clear, credit customer)
        8. On-account residue: 1 final LedgerEntry with invoice_id=None
        9. SSE event 'payment_recorded'
        Returns: receipt_response with allocations + invoice statuses
        """

    async def list_receipts(filters, pagination): ...
    async def get_receipt(receipt_id): ...
    async def get_open_invoices_for_party(party_type, party_id) -> [{invoice_no, date, total, paid, outstanding}]
    async def get_on_account_balance(party_type, party_id) -> Decimal
```

S119's `InvoiceService.mark_paid()` becomes a thin wrapper:
```python
async def mark_paid(invoice_id, req: MarkPaidRequest, fy_id, user_id):
    # Backward-compat — calls record() with single full allocation
    invoice = await self._get_or_404(invoice_id)
    return await PaymentReceiptService(self.db).record(
        party_type='customer',
        party_id=invoice.customer_id,
        payment_date=req.payment_date,
        payment_mode=req.payment_mode,
        reference_no=req.reference_no,
        total_amount=invoice.total_amount - invoice.amount_paid,  # outstanding only
        allocations=[{invoice_id: invoice.id, amount_applied: outstanding}],
        notes=req.notes,
        tds_*=req.tds_*, tcs_*=req.tcs_*,
        fy_id=fy_id, created_by=user_id,
    )
```

### 2.5 API surface

```
POST   /payment-receipts                         create receipt + allocations
GET    /payment-receipts                         list (paginated, filter: party, date, status)
GET    /payment-receipts/{id}                    detail with allocations
GET    /customers/{id}/open-invoices             [{invoice_no, total, paid, outstanding}]
GET    /customers/{id}/on-account-balance        {balance: Decimal}
POST   /invoices/{id}/mark-paid                  (UNCHANGED — backward-compat wrapper)
```

Future expansion: `/suppliers/{id}/open-bills`, `/va-parties/{id}/open-bills` — same shape, different join.

### 2.6 Frontend layout

**New file:** `frontend/src/pages/PaymentsPage.jsx`
- Sidebar entry: under Commerce, between Invoices and Returns
- Tabs at top: "All" | "On Account" | "Recent"
- List view: `receipt_no | date | party | mode | total | allocated | on_account | status_badge`
- Detail overlay: receipt header + allocations table + ledger entries link

**New file:** `frontend/src/components/payments/RecordPaymentForm.jsx` (large modal or full-page)
- Customer FilterSelect (Quick Master Shift+M support)
- Amount + date + mode + ref# + notes (reuse `PaymentForm.jsx` from S119 where possible)
- Open invoices auto-load on customer select
- Allocation rows: checkbox, invoice link, amount input with [Auto] [Full] helpers
- Live counter: `Allocated ₹X / ₹Y · On Account ₹Z`
- Save → POST /payment-receipts → close → refresh

**Modified files:**
- `pages/InvoicesPage.jsx` — pending column, partial badge, list filter
- `components/common/LedgerPanel.jsx` — add "Outstanding ₹X" + "On Account ₹Y" tiles
- `pages/InvoicesPage.jsx` Mark-as-Paid button — opens new form pre-filled
- `components/layout/Sidebar.jsx` — add Payments entry

**New print template:** `components/common/ReceiptVoucherPrint.jsx`
- A4 half-page (mirrors CN/DN style)
- PAY-XXXX header, customer, date/mode/ref
- Allocations table
- "Amount in words" line
- Single signature line (Authorised)

### 2.7 Migration

`backend/migrations/versions/o5p6q7r8s9t0_s123_payment_receipts.py`

Tenant-iterating, `col_exists` + `constraint_exists` guarded:
1. Create `payment_receipts` table (with FY FK, party CHECK)
2. Create `payment_allocations` table (with cascade on receipt delete)
3. Add `invoices.amount_paid NUMERIC(12,2) DEFAULT 0 NOT NULL`
4. Drop + recreate `invoice_valid_status` CHECK to include `partially_paid`
5. Backfill: `UPDATE invoices SET amount_paid = total_amount WHERE status='paid'`
6. Synthetic backfill of historical S119 payments — for each `LedgerEntry` with `reference_type='invoice' AND debit=0` (the customer credit row from S119), create a synthetic `PaymentReceipt` + `PaymentAllocation` so the new Payments page lists them. (Can defer this — old payments still appear in customer ledger via existing entries; only the new Payments page list would be empty for historical rows.)

**Idempotent re-runs** via existence guards on every step.

---

## 3. Decisions Log

Every settled architectural choice. Don't re-debate.

| Date | Decision | Reason |
|---|---|---|
| 2026-04-27 | **Two new tables** (PaymentReceipt + PaymentAllocation) instead of stuffing into LedgerEntry | LedgerEntry is the journal; receipts are domain objects. Separation keeps ledger pure (one row per accounting effect) and lets receipts carry their own metadata (mode, ref, allocation breakdown). |
| 2026-04-27 | **One LedgerEntry per allocation** (no "receipt header" entry) | Customer's running balance is correct without it. Adding a header entry would either double-count or need a contra-entry — both fragile. |
| 2026-04-27 | **`amount_paid` denormalised on `invoices`** | Reads (list view: "Outstanding ₹X") happen 100× more than writes. Computing from SUM(allocations) every read = slow + needs subquery on every list query. Trigger keeps it in sync (or service-level update; FOR UPDATE protects against races). |
| 2026-04-27 | **`partially_paid` is a real status, not derived** | Filter queries (`WHERE status='partially_paid'`) need an index path. Computed status would force LEFT JOIN allocations on every list query. |
| 2026-04-27 | **On-account allowed (Option B from design discussion)** | Real Indian businesses receive advances, round amounts, settle later. Strict-allocation mode is older Tally; modern Zoho/QB/Marg all allow over-receipt and on-account credit. |
| 2026-04-27 | **`party_type` polymorphic on PaymentReceipt** (customer/supplier/va_party) | Symmetry — same model serves all 3. Frontend builds customer-only first; supplier/va_party tabs follow without schema change. |
| 2026-04-27 | **S119 `mark_paid` becomes thin wrapper, button stays** | Zero migration of UX. Existing button on invoice detail keeps working — just routes through the new service internally. Backward-compat for any external callers of the API. |
| 2026-04-27 | **Receipt counter `PAY-XXXX` scoped per FY** | Same pattern as INV / ORD / CN / SRN. FY counter reset rules (S77) auto-apply. |
| 2026-04-27 | **TDS/TCS handled at allocation level via S119's existing PaymentForm fields** | Reuses already-tested LedgerService logic; no new TDS code path. |
| 2026-04-27 | **Cancel of receipt = manual reversal entry, no `cancel_receipt` endpoint in v1** | Cancel-payment creates ledger asymmetry (was the bank money returned? was it ever there?). Defer to a future "Reverse Receipt" feature with audit. v1 = receipts are immutable records of fact. |

---

## 4. Open Questions (resolve before coding)

- [x] **Q1 (scope):** customer-only UI first, supplier+VA later — **YES** (model supports all 3, frontend tab-builds customer first)
- [x] **Q2 (on-account):** allow over-receipt, book residue as on-account — **YES** (Option B)
- [x] **Q3 (FIFO auto-allocate):** **oldest-invoice-first by `invoice_date asc, id asc`** (Tally convention). Locked S123 design 2026-04-27.
- [x] **Q4 (on-account application):** **allow on-account in v1.** Excess receipt money sits as on-account credit. On the next receipt entry for that party, surface as "Available Credit ₹X" pill at the top of the allocation table; user can click it to consume against the new allocations. Auto-application against new invoices deferred to v2.
- [x] **Q5 (ledger entry for receipt header):** **confirmed — no header LedgerEntry.** Each allocation is one ledger row keyed `reference_type='payment_allocation'`. On-account residue gets one ledger row with `reference_type='payment_receipt'` (not allocation, because no invoice anchor) — this is the only "header-ish" entry, and it represents real money credited to the party.
- [x] **Q6 (cancel-then-CN cascade):** **option (a) with mandatory warning modal.** When user cancels a `partially_paid` invoice: cancel handler computes `amount_paid` on that invoice, opens a confirmation modal showing "₹X already received against this invoice will be converted to on-account credit for {customer_name}. Continue?". On confirm: PaymentAllocation rows stay (immutable history), but a reversal ledger entry credits the party + an on-account credit row is booked. Invoice goes to `cancelled`. Same warning fires on cancel-then-CN chain.
- [x] **Q7 (synthetic backfill of S119 payments):** **no backfill needed — production has 0 paid invoices, 0 paid_at rows** (confirmed via prod query 2026-04-27). S123 instead refactors `mark_paid` to call `PaymentReceiptService.record()` underneath, so every invoice paid from S123 onwards has full receipt+allocation rows. Migration only needs to add the `amount_paid` column with default 0 — no UPDATE backfill.

---

## 5. Phase Checklist

### Phase 0 — Pre-flight (✅ done at design lock)

- [x] Design doc created (this file)
- [x] Linked from CLAUDE.md document directory
- [x] Linked from FINANCIAL_SYMMETRY_PLAN as 4.5's home
- [x] Q1, Q2 resolved at architecture session

### Phase 1 (S123) — Backend foundation

> **Resume rule:** all checkboxes in this phase belong to a single commit OR a clean sequence of commits each leaving the system runnable. Don't commit a half-applied migration.

#### 1.1 Models
- [x] `backend/app/models/payment_receipt.py` — new file, `PaymentReceipt` + relationships
- [x] `backend/app/models/payment_allocation.py` — new file, `PaymentAllocation` + relationships
- [x] `backend/app/models/invoice.py` — add `amount_paid: Mapped[Decimal]` column with default 0, server_default 0, NOT NULL
- [x] `backend/app/models/invoice.py` — extend status check constraint to include `partially_paid`
- [x] Verify `python -c "from app.main import app; print(len(app.routes))"` still loads (226+) — confirmed 226 → 231 after API wiring

#### 1.2 Schemas
- [x] `backend/app/schemas/payment_receipt.py` — new file with:
  - [x] `PaymentAllocationInput` (invoice_id: UUID, amount_applied: Decimal — positive validator)
  - [x] `PaymentReceiptCreate` (party + amount + allocations[] + mode + ref + tds/tcs)
  - [x] `PaymentReceiptResponse` (full receipt + allocations + party brief)
  - [x] `PaymentAllocationBrief` (for nesting in invoice + ledger responses)
  - [x] `OpenInvoiceBrief` (invoice_no, date, total, paid, outstanding)
- [x] `backend/app/schemas/invoice.py` — add `amount_paid`, `outstanding_amount` (derived) to `InvoiceResponse`

#### 1.3 Service layer
- [x] `backend/app/services/payment_receipt_service.py` — new file:
  - [x] `next_receipt_number(fy_id)` — added in `core/code_generator.py` (PAY-XXXX per FY)
  - [x] `record(...)` — full atomic transaction (lock invoices via FOR UPDATE, validate per-invoice outstanding, create receipt + allocations + ledger entries, update invoice statuses, SSE emit)
  - [x] `list_receipts(params, fy_id)` — paginated with party + date + payment_mode + search filters
  - [x] `get_receipt(id)` — full detail with allocations + party brief + invoice_number per allocation
  - [x] `get_open_invoices_for_party(party_type, party_id, fy_id)` — `OpenInvoiceBrief[]` filtering on `status IN ('issued','partially_paid')`, FIFO by `issued_at` (Q3 lock)
  - [x] `get_on_account_balance(party_type, party_id, fy_id)` — `SUM(receipt.on_account_amount)` (v1; v2 will subtract consumption)
  - [x] `_to_response(receipt)` — consistent shape across list + detail with derived `allocated_amount`, `net_amount`
- [x] `backend/app/services/invoice_service.py:mark_paid` — refactored to thin wrapper calling `PaymentReceiptService.record()` with `outstanding` allocation; gracefully handles `partially_paid` invoices (settles remainder)
- [x] Verify backend imports clean — 231 routes load OK

#### 1.4 API endpoints
- [x] `backend/app/api/payment_receipts.py` — new file:
  - [x] `POST /payment-receipts` — `PaymentReceiptCreate` → `PaymentReceiptResponse` (status 201)
  - [x] `GET /payment-receipts` — paginated list
  - [x] `GET /payment-receipts/{id}` — detail
- [x] `backend/app/api/customers.py` — add:
  - [x] `GET /customers/{id}/open-invoices` → `list[OpenInvoiceBrief]`
  - [x] `GET /customers/{id}/on-account-balance` → `{party_type, party_id, balance: Decimal}`
- [x] `backend/app/api/router.py` — register new router (not main.py — routers aggregate via api_router)
- [x] Verify route count climbs by ~5 (was 226 → now 231) ✓

#### 1.5 Migration
- [x] `backend/migrations/versions/o5p6q7r8s9t0_s123_payment_receipts.py` — tenant-iterating, idempotent
  - [x] `col_exists` guard on `invoices.amount_paid`
  - [x] Existence check before creating `payment_receipts` + `payment_allocations` tables (`_table_exists` helper)
  - [x] `DROP CONSTRAINT IF EXISTS` on both `ck_invoices_inv_valid_status` AND `inv_valid_status` per ck_-prefix memory before recreating
  - [x] No data backfill needed (Q7 — prod has 0 paid invoices). Column lands with `server_default='0'`.
  - [x] FK + index declarations match models exactly (UNIQUE on receipt_no, FK CASCADE on receipt→allocations, FK RESTRICT on allocation→invoice)
- [x] Local dev: `alembic upgrade head` clean
- [x] Local dev: `alembic downgrade -1` clean (round-trip safety) — preserves data via `UPDATE status='partially_paid' SET status='issued'` before re-narrowing CHECK
- [x] Local dev: `alembic upgrade head` clean again (idempotent)
- [x] Verify `co_drs_blouse.payment_receipts` + `co_drs_blouse.payment_allocations` exist via psql ✓
- [x] Verify `co_drs_blouse.invoices.amount_paid` column present (default 0) ✓

#### 1.6 Tests / smoke
- [ ] `pytest backend/tests/services/test_payment_receipt_service.py` — DEFERRED to S125 (no test infra in repo currently; smoke tested via service-level Python imports + alembic round-trip)
- [ ] `curl POST /payment-receipts` round-trip — DEFERRED to S124 (requires real session; FY-scoped + cookie auth)
- [x] `from app.services.payment_receipt_service import PaymentReceiptService` imports clean
- [x] `from app.services.invoice_service import InvoiceService` mark_paid wrapper imports clean

#### 1.7 Docs
- [x] `Guardian/API_REFERENCE.md` — new "26. Payment Receipts" section with:
  - [x] POST shape + example
  - [x] Response shape
  - [x] List filters
  - [x] Open invoices endpoint shape
  - [x] On-account endpoint shape
  - [x] Invoice Response Extension note (`amount_paid` + `outstanding_amount` + `partially_paid` status)
  - [x] Mark-as-Paid wrapper note
- [x] `Guardian/CLAUDE.md` — S123 entry under Current State
- [x] This doc — Phase 1 boxes ticked

#### 1.8 Commit + push
- [ ] `git status` clean of unintended files
- [ ] Single commit (or 2 — model+migration first, then service+api+docs) with conventional message
- [ ] `git push origin main`
- [ ] CI confirms migration runs on prod EC2 deploy

---

### Phase 2 (S124) — Frontend

> **Resume rule:** UI changes are independent per-file. Each file's checkbox is one PR-worthy unit.

#### 2.1 API client
- [x] `frontend/src/api/paymentReceipts.js` — new file:
  - [x] `recordPayment(data)` — POST
  - [x] `getPaymentReceipts(params)` — GET list
  - [x] `getPaymentReceipt(id)` — GET detail
  - [x] `getOpenInvoicesForCustomer(customerId)` — GET
  - [x] `getOnAccountBalance(customerId)` — GET
  - [x] Mock branch for `VITE_USE_MOCK=true` (mirror real shape) — including write-side mutation of invoice.amount_paid + status flip

#### 2.2 New page — PaymentsPage
- [x] `frontend/src/pages/PaymentsPage.jsx`:
  - [x] Header with "Record Payment" CTA (gradient)
  - [x] KPI cards: Receipts (page) · Total Received · On-Account · Avg Receipt
  - [x] Filter bar: search · customer (FilterSelect) · mode · date range
  - [x] List table: PAY-XXXX · date · customer · mode · ref · amount · allocated · on-account · status pill
  - [x] Click row → detail overlay (full-page `fixed inset-0 z-50`, gradient header)
  - [x] Detail overlay: 4-card summary (Gross/Net/Allocated/On-Account) + Customer + Receipt info + Allocations table with deep-link to invoice + Print Receipt CTA
  - [x] Deep-link `?open=<receipt_id>` support (mirrors InvoicesPage pattern)
- [x] `frontend/src/routes/routes.js` — add `/payments` route (admin+billing)
- [x] `frontend/src/components/layout/Sidebar.jsx` — add "Payments" entry under Commerce, between Invoices and Returns

#### 2.3 New form — RecordPaymentForm
- [x] `frontend/src/components/payments/RecordPaymentForm.jsx`:
  - [x] Customer FilterSelect (data-master="customer", Quick Master Shift+M support)
  - [x] On customer change → fetch open invoices + on-account balance, show on-account chip
  - [x] Reuses `PaymentForm.jsx` (S119) for date / mode / ref / TDS / TCS / notes
  - [x] Allocations table:
    - [x] Header: ☐ · Invoice · Date · Total · Paid · Outstanding · Apply · Full
    - [x] Per row: checkbox toggles `Apply ₹___` input (clicking auto-fills outstanding)
    - [x] [Auto FIFO] button — distributes receipt amount oldest-first (Q3 lock)
    - [x] [Full] per-row helper — fills remaining outstanding capped at allocatable
    - [x] [Clear] all
  - [x] Live counter footer: `Allocatable ₹X · Allocated ₹Y · On Account ₹Z` (with TDS/TCS subline)
  - [x] Colour states: emerald (fully allocated) · sky (on-account positive) · rose (over-allocated, blocks save)
  - [x] Save button disabled until valid; lockedInvoice mode disables non-target rows (Mark-as-Paid path)
  - [x] On save: POST → onSuccess(receipt) callback fires
  - [x] Compact UI per `feedback_compact_forms` memory — `typo-input-sm`, `gap-2`, no extra padding

#### 2.4 InvoicesPage updates
- [x] `frontend/src/pages/InvoicesPage.jsx`:
  - [x] List: add "Pending" column showing `outstanding_amount` (derived from total − amount_paid)
  - [x] List: status filter tabs gain `Partial` option
  - [x] Status badge map gains `partially_paid` (sky colour, in StatusBadge.jsx)
  - [x] Detail: Invoice Info card now shows `Paid So Far` + `Outstanding` when partially paid
  - [x] Detail: Mark-as-Paid modal swapped to RecordPaymentForm with `defaultInvoiceId` + `defaultAmount=outstanding` (locks customer + invoice, but allocation amount stays editable)
  - [x] Detail: button label flips to "Record Next Payment" when status is `partially_paid`
  - [x] Detail: action panel now shows for both `issued` and `partially_paid` (cancel button only on issued)

#### 2.5 LedgerPanel updates
- [x] `frontend/src/components/common/LedgerPanel.jsx`:
  - [x] Renames balance row to "Outstanding" for customers
  - [x] On-Account ₹Y pill (customer party only) — pulled from `/customers/{id}/on-account-balance`
  - [x] `deepLinkFor` extended for `payment_receipt` → `/payments?open=<id>` (header receipt + on-account/TDS rows)
  - [x] `payment_allocation` rows render INV-XXXX as inline click-through (reference_id is allocation, not receipt — frontend parses description)

#### 2.6 Print template
- [x] `frontend/src/components/common/ReceiptVoucherPrint.jsx`:
  - [x] A4 half-page (mirrors S114 CN/DN discipline — top half ~138.5mm, cut line at A4 midpoint)
  - [x] Company header (Received By card with GST + address + phone)
  - [x] PAY-XXXX large + date stacked right
  - [x] Customer block (Received From card with GST + city + phone)
  - [x] Mode + ref + notes inline strip
  - [x] Allocations table: Invoice · Applied + total row
  - [x] Totals card: Gross − TDS + TCS = NET RECEIVED
  - [x] On-Account residue displayed inline when present
  - [x] Amount in words (Indian system helper inlined)
  - [x] Bank deposit line + Authorised Signatory
  - [x] forwardRef so parent's useReactToPrint targets it

#### 2.7 Mock data
- [x] `frontend/src/api/mock.js` — `paymentReceipts` array (starts empty, mutated by recordPayment mock)
- [x] Mock toggle: full create + list + detail flow works in mock mode

#### 2.8 Smoke + build
- [x] Vite build clean — 22.31kB PaymentsPage chunk, ~18s build, zero errors/warnings
- [ ] Dev server smoke (deferred — pushed to staging for full integration test)
- [x] StatusBadge gains `partially_paid` (sky-100/sky-700)
- [x] No new dependencies — all new components use existing patterns

#### 2.9 Docs
- [x] `Guardian/CLAUDE.md` — S124 entry
- [x] This doc — all 2.x boxes ticked
- [x] FINANCIAL_SYMMETRY_PLAN — Phase 4.5 marked closed (link to this plan)

#### 2.10 Commit + push
- [x] Single commit covering API + page + form + print + invoice updates + ledger panel + docs
- [ ] `git push origin main` — pending after this checkbox tick
- [ ] Vercel rebuild confirms (~60s after push)

---

### Phase 3 (S125) — Supplier + VA Bill-wise Payments — ✅ COMPLETE

Polymorphic refactor of `PaymentAllocation` (`bill_type` + `bill_id`) extends the
S123/S124 receipt voucher to all four bill kinds: `invoice`, `supplier_invoice`,
`job_challan`, `batch_challan`.

- [x] Backend models: `amount_paid` Numeric(12,2) NOT NULL DEFAULT 0 on `SupplierInvoice` / `JobChallan` / `BatchChallan`
- [x] Backend models: `PaymentAllocation` ditched FK `invoice_id`, added `bill_type VARCHAR(30)` + `bill_id UUID` + CHECK `pa_valid_bill_type` + indexes `ix_pa_receipt_bill` / `ix_pa_bill`
- [x] Schemas: `PaymentAllocationInput` / `PaymentAllocationBrief` use `bill_type`/`bill_id`/`bill_no`; new `OpenBillBrief` replaces `OpenInvoiceBrief`
- [x] Service: `record()` dispatches per-allocation across 4 bill types — locks bills FOR UPDATE, validates outstanding, bumps `bill.amount_paid` (only `invoice` flips status `partially_paid`/`paid`); `_PARTY_BILL_MAP` rejects cross-party allocation (e.g. `customer` → `job_challan`)
- [x] Service: `get_open_bills_for_party(party_type, party_id, fy_id)` returns FIFO list — invoices for customers, supplier_invoices for suppliers, JC + BC unioned for va_parties (only `received`/`partially_received` challans — work has to be done before payment)
- [x] API: `GET /suppliers/{id}/open-bills` + `/on-account-balance`; `GET /masters/va-parties/{id}/open-bills` + `/on-account-balance`; `/customers/{id}/open-invoices` reuses unified service method
- [x] Migration `p6q7r8s9t0u1_s125_payments_polymorphic.py` — tenant-iterating, `col_exists` + `_table_exists` guarded, drops legacy `invoice_id` FK + col + indexes, adds polymorphic columns + CHECK + new indexes; verified prod has 0 receipts/0 allocations/0 challans → safe destructive ALTER
- [x] Frontend: `RecordPaymentForm` accepts `partyType` prop + `parties[]` + `defaultPartyId/BillType/BillId` — same form serves customer/supplier/va_party; row chips show `roll`/`garment` for challans; CTA label flips Receipt↔Payment
- [x] Frontend: `getOpenBillsForParty(partyType, partyId)` + polymorphic `getOnAccountBalance(partyType, partyId)` (back-compat single-arg signature kept for old call sites)
- [x] Frontend: `PaymentsPage` 3 tabs (Customer Receipts / Supplier Payments / VA Payments) — tab persisted on URL `?tab=`, KPIs flip `On-Account` ↔ `Advance`, columns adapt, `+ Record Payment/Receipt` CTA per tab; allocation table renders `bill_no` with type chip + deep-links per `bill_type`
- [x] Frontend: `LedgerPanel` reads on-account balance for all party types (was customer-only); description regex extended to JC-/BC- codes with route to `/challans?open=`
- [x] Frontend: `InvoicesPage` Mark-as-Paid passes `partyType="customer"` + `defaultBillType="invoice"` (caller-side prop rename only)
- [x] Local: alembic round-trip clean; backend imports = 235 routes; vite build clean (`PaymentsPage` 25kB)
- [ ] CI deploy + post-deploy smoke

### Phase 4 (post-S125) — Polish & follow-ups (deferred)

- ~~**On-account auto-application at invoice creation:**~~ **REJECTED 2026-04-27.** Tally / Zoho / QuickBooks / SAP B1 all keep this manual — credit might be earmarked for a disputed bill, auto-apply is hard to reverse, CAs prefer deliberate allocation. Existing flow is correct: residue is visible on the customer balance + LedgerPanel chip, and naturally consumed when the user records the next receipt (RecordPaymentForm shows open bills + on-account chip together, user types Apply amounts manually).
- [ ] **Outstanding aging report:** dashboard tile + dedicated report (0–30 / 31–60 / 61–90 / 90+ days) for receivables AND payables (mirror split now that all 3 party types have receipts)
- [ ] **Synthetic backfill of pre-S123 payments (Q7):** if user wants historical S119 single-shot Mark-as-Paid receipts visible in new Payments list
- [ ] **Receipt cancel flow:** with proper ledger reversal + audit trail (Q10 — only if real cancel case appears)
- [ ] **Bank reconciliation (post-4.4):** when chart-of-accounts lands, allow matching receipts to bank statement lines

---

## 6. Migration Safety Checklist

> Production audit done at design time (2026-04-27): 0 invoices in `paid` status with non-zero amount paid, 0 partial payments, 0 receipts. Production has no live receipt data — fix is pure additive.

- [ ] Pre-deploy: backup prod DB via existing S100 cron snapshot system (verify cron ran ≤24h ago)
- [ ] Migration file passes `alembic upgrade head` + `alembic downgrade -1` round-trip on local dev
- [ ] CI auto-runs `alembic upgrade head` on EC2 push (per S117 confirmation)
- [ ] Post-deploy verify: `psql co_drs_blouse -c "SELECT COUNT(*) FROM payment_receipts"` returns 0 (clean install)
- [ ] Post-deploy verify: `SELECT COUNT(*) FROM invoices WHERE amount_paid > 0` matches paid-invoice count
- [ ] Post-deploy smoke: log into prod, open existing paid invoice → status still shows correctly, Mark-as-Paid button on a draft → opens new form, save → ledger updates

## 7. Rollback Plan

If S123 deploy goes bad:
1. `git revert <commit_sha>` and force push (branch is protected — coordinate)
2. EC2 redeploy auto-runs migration; alembic detects new HEAD as previous migration
3. New columns + tables remain in DB but unused — harmless (no production data lost)
4. Manually run `alembic downgrade <previous>` only if cleanup truly needed (drops payment_receipts + payment_allocations + amount_paid column)
5. Existing S119 Mark-as-Paid path keeps working throughout — no user disruption

If S124 deploy goes bad:
1. `git revert` frontend commit, Vercel rebuilds in ~60s
2. Backend keeps the new endpoints registered — harmless without UI calls
3. No data loss; UI is the only thing that disappears

---

## 8. File Map (forward reference)

```
backend/app/models/
    payment_receipt.py           NEW
    payment_allocation.py        NEW
    invoice.py                   modified — +amount_paid, status check

backend/app/schemas/
    payment_receipt.py           NEW
    invoice.py                   modified — +amount_paid in response

backend/app/services/
    payment_receipt_service.py   NEW
    invoice_service.py           modified — mark_paid → wrapper

backend/app/api/
    payment_receipts.py          NEW
    customers.py                 modified — open-invoices + on-account-balance
    main.py                      modified — register router

backend/migrations/versions/
    o5p6q7r8s9t0_s123_payment_receipts.py  NEW

backend/tests/services/
    test_payment_receipt_service.py        NEW

frontend/src/api/
    paymentReceipts.js           NEW
    mock.js                      modified — sample data

frontend/src/pages/
    PaymentsPage.jsx             NEW
    InvoicesPage.jsx             modified — pending col, partial badge, mark-as-paid rewire

frontend/src/components/
    payments/RecordPaymentForm.jsx   NEW
    common/LedgerPanel.jsx           modified — outstanding + on-account tiles
    common/ReceiptVoucherPrint.jsx   NEW
    layout/Sidebar.jsx               modified — Payments entry

frontend/src/App.jsx             modified — /payments route

Guardian/
    API_REFERENCE.md             modified — Payment Receipts section
    CLAUDE.md                    modified — S123 + S124 entries
    PAYMENTS_AND_ALLOCATIONS_PLAN.md  this doc — tick checkboxes as work progresses
    FINANCIAL_SYMMETRY_PLAN.md   modified — mark 4.5 closed
```

---

## 9. Industry Reference

For reviewers / new contributors:

- **Tally Receipt Voucher (F6):** the canonical Indian pattern — one receipt → multiple bill allocations → ledger journal lines per allocation
- **Tally bill-wise:** customer ledger maintains running outstanding per invoice; receipts allocate against specific bills
- **Tally on-account:** unallocated receipt = customer credit balance; consumed when a future invoice is allocated against it
- **Zoho Books "Apply Credits":** on-account credit can be applied to future invoices via a dedicated "Apply" button
- **QuickBooks "Receive Payment":** customer + amount + auto-loaded open invoices with checkbox + apply column = same exact UX we're building

Our model = Tally semantic (multi-allocation receipt) + Zoho UX (open-invoices auto-load with allocation table) + QB clarity (live counter showing allocated / on-account).

---

**End of plan.** Update checkboxes as work progresses. Don't lose this file.
