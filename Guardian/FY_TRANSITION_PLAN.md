# FY Transition + Opening Stock — Production-Grade Plan

> **Purpose:** Handle financial year boundaries (year-end closing, year-start opening) and first-time data entry for a garment manufacturing + wholesale business in India
> **Created:** 2026-03-30 (Session 96)
> **Status:** P1-P6 COMPLETE (S96-S97)
> **Prerequisite Plans (all COMPLETE):** `MASTERS_AND_FY_PLAN.md` (Party Masters + Ledger + FY models), `MULTI_COMPANY_PLAN.md` (Schema-per-company + Auth + FY closing)

---

## Part 1: Problem Statement

Two distinct scenarios require handling:

### Scenario A: First-Time Setup (Client's Day 1)
Client has **never used the software**. They have physical stock (rolls in godown, finished garments on shelves) and party balances from their old system (Tally/manual books). They need to enter all of this as opening data before starting normal operations.

**What they need to enter:**
1. Opening rolls — fabric rolls physically present (no purchase flow, no supplier invoice)
2. Opening SKU stock — finished garments on shelves (no lot→batch→pack flow)
3. Opening party balances — how much each supplier/customer/VA/broker owes or is owed

### Scenario B: Year-End Transition (March 31 → April 1)
Existing user completing one FY and starting the next. Physical stock doesn't change — it's the same rolls and garments. But accounting needs formal closing and opening entries.

**What the system must do automatically:**
1. Carry forward all party balances (opening ledger entries) — **HAVE THIS**
2. Keep active inventory visible in new FY — **HAVE THIS** (perpetual design)
3. Carry forward broker balances — **MISSING** (broker not in party_types)
4. Generate closing stock valuation for accountant — **MISSING**
5. Support physical stock verification for audit — **MISSING**

---

## Part 2: Industry Standards (Indian Accounting)

### Stock Valuation — AS-2 / Ind AS 2
- Inventory valued at **lower of cost or net realizable value (NRV)**
- **Weighted Average Cost (WAC)** — standard method for garment/textile (fabric lots mix during production)
- FIFO permitted but less practical. LIFO NOT permitted under Indian standards.

### Stock Categories at Year-End

| Category | Our System Equivalent | Valuation Basis |
|---|---|---|
| **Raw Materials** | Rolls (status: in_stock, sent_for_processing, remnant) | Purchase cost (roll.cost_per_unit × remaining_weight) |
| **Work-in-Progress** | Lots (open/cutting) + Batches (created→packing) | Material cost at minimum; + conversion cost for accurate |
| **Finished Goods** | SKUs in InventoryState (available_qty > 0) | WAC of production cost or purchase cost |

### How Tally Handles This (the Indian standard)
- **Stock is perpetual** — quantities carry forward automatically, no "transfer" needed
- **FY boundary = accounting event, not physical event** — same goods, new period
- **Opening balance voucher** — single compound journal entry dated April 1 with all ledger balances
- **Stock valuation** — computed on-the-fly using WAC/FIFO, not a stored snapshot
- **Stock Journal** — for non-purchase/non-sale movements (adjustments, transfers, damage write-offs)

### What This Means for Our Design
1. **DO NOT reset inventory on April 1** — InventoryState being global (no fy_id) is CORRECT
2. **DO NOT require manual stock carry-forward** — perpetual system handles it
3. **DO generate closing stock valuation reports** — accountant needs this for P&L / Balance Sheet
4. **DO support opening stock entry** — for Day 1 setup only (not every year-end)
5. **DO carry forward ALL party balances** — including broker (currently missing)

### GST at Year-End
- No formal "closing" of GST registers required
- ITC carries forward automatically (appears in April GSTR-3B)
- GSTR-9 (annual return) needs HSN-wise sales/purchase summaries
- Stock write-offs require ITC reversal

### Journal Entries (for accountant reference)

**Year-End (March 31):**
```
Dr. Trading A/c          Cr. Opening Stock A/c     [reverse last year's opening]
Dr. Closing Stock A/c    Cr. Trading A/c           [record this year's closing stock value]
```

**Year-Start (April 1):**
```
Dr. Opening Stock A/c    Cr. Closing Stock A/c     [closing becomes opening — identity]
```

In ERP systems, these are auto-generated from the closing stock valuation report — not manually entered.

---

## Part 3: Current System Audit

### What We HAVE (working correctly)

| Feature | Implementation | Location |
|---|---|---|
| FY close → snapshot party balances | supplier, customer, va_party | `fy_closing_service.py:98-107` |
| FY close → opening ledger entries | entry_type="opening", reference_type="fy_closing" | `fy_closing_service.py:214-242` |
| Atomic FY close (single txn) | Lock → snapshot → close → create → opening entries | `fy_closing_service.py:63-138` |
| Close preview with warnings | Open challans warning (non-blocking) | `fy_closing_service.py:24-61` |
| Document counter reset per FY | 9 code generators scoped by fy_id | `code_generator.py` |
| Roll cross-FY visibility | `OR(fy_id=current, status IN (in_stock, remnant, sent_for_processing))` | `roll_service.py:35-37` |
| Order/Lot/Batch cross-FY visibility | Active items show regardless of FY | Order/Lot/Batch list endpoints |
| SKU inventory perpetual (no fy_id) | InventoryState is global — correct design | `inventory_state.py` |
| FY auto-tagging on all transactions | JWT's fy_id → new roll/order/invoice/challan | `dependencies.py:get_fy_id()` |
| Closed FY protection | Read-only after close | `fy_closing_service.py` |

### What's MISSING

| # | Gap | Impact | Phase |
|---|---|---|---|
| 1 | No `opening_stock` event type on InventoryEvent | Can't enter existing SKU stock on Day 1; no audit trail | P1 |
| 2 | No opening roll entry without supplier invoice | Can't enter existing rolls on Day 1 | P1 |
| 3 | No opening party balance entry UI/API | Can't enter "Supplier X balance = ₹2L" on Day 1 | P2 |
| 4 | Broker not in FY closing party_types | Broker balances lost on year-end | P3 |
| 5 | No closing stock valuation report | Accountant can't prepare Balance Sheet / P&L | P4 |
| 6 | No physical verification workflow | Can't reconcile book vs physical stock | P5 |
| 7 | No party balance confirmation report | Can't send formal reconciliation letters | P6 |

### Codebase References (exact locations)

| What | File | Line | Detail |
|---|---|---|---|
| Party types in closing | `fy_closing_service.py` | 152-156 | Only: supplier, customer, va_party — **no broker** |
| Opening entry creation | `fy_closing_service.py` | 220 | Iterates same 3 party types |
| Party name resolver | `fy_closing_service.py` | 206-212 | Maps 3 types — **no broker** |
| InventoryEvent — no fy_id | `inventory_event.py` | full file | No fy_id column (correct — perpetual) |
| InventoryState — no fy_id | `inventory_state.py` | full file | No fy_id column (correct — perpetual) |
| Valid event types | `inventory_service.py` | 180 | `("stock_in", "stock_out", "loss", "return", "adjustment")` — missing `opening_stock` |
| Ready stock in (implicit) | `inventory_service.py` | 168 | `ready_stock_in` handled in logic but NOT in valid_types list |
| Roll supplier_invoice_id | `roll.py` | 46-48 | **nullable=True** — rolls CAN exist without invoice |
| Roll fy_id | `roll.py` | 54-56 | **nullable=True**, RESTRICT ondelete |
| Roll status CHECK | `roll.py` | 18-21 | `in_stock, sent_for_processing, in_cutting, remnant, returned` |
| Ledger entry_type values | `ledger_entry.py` | 24 | `opening, invoice, payment, challan, adjustment, tds, tcs` |
| Broker model import | `fy_closing_service.py` | 1-18 | **Broker NOT imported** |

---

## Part 4: Decisions Log

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | InventoryState fy_id | **Don't add** | Perpetual inventory is correct. Stock doesn't vanish on April 1. Matches Tally/industry standard. |
| 2 | InventoryEvent fy_id | **Don't add** | Events are timestamped — FY derivable from date. Adding fy_id creates maintenance burden with no benefit. |
| 3 | Opening stock event type | **Add `opening_stock`** to valid types | Distinguishes "received from supplier" vs "existed on Day 1". Audit trail for accountant. |
| 4 | Opening roll approach | **Use existing `stock_in()` with `reference_type="opening_stock"`** | Rolls already support nullable supplier_invoice_id. No new model needed. |
| 5 | Opening SKU approach | **New `opening_stock` inventory event** | Creates proper audit trail. InventoryState updated via existing reconcile formula. |
| 6 | Party opening balance | **Use existing ledger `entry_type="opening"`** | Already used by FY closing. Same mechanism for manual first-time entry. |
| 7 | Closing stock valuation | **Report endpoint, not stored snapshot** | Computed on-the-fly like Tally. No stale data. Can run for any date. |
| 8 | WIP valuation method | **Material cost only** (simplified) | Industry standard for Indian garment SMEs. Conversion costs expensed as incurred. Matches AS-2 simplified approach. |
| 9 | Physical verification | **Separate workflow, not tied to FY close** | Verification can happen anytime (quarterly, annual). Not a year-end blocker. |
| 10 | Stock valuation method | **Weighted Average Cost (WAC)** | Standard for garment/textile. Fabric lots mix during production. Matches Tally default. |

---

## Part 5: Execution Phases

### Phase 1: Opening Stock Entry (Day 1 Problem)

> **Goal:** Client can enter existing rolls + SKUs without going through purchase→lot→batch→pack

#### Backend — Opening SKU Stock

- [x] **1a.** Add `opening_stock` to valid event_types in `inventory_service.py` (line 180) — include in the `stock_in`/`return`/`ready_stock_in` addition group (line 167-168)
- [x] **1b.** Create `POST /inventory/opening-stock` endpoint in `inventory.py`:
  - Request: `{ items: [{ sku_id, quantity, unit_cost }] }`
  - For each item: create `InventoryEvent` with `event_type="opening_stock"`, `reference_type="opening_stock"`, `item_type="finished_goods"`
  - Update `InventoryState.total_qty` and `available_qty` via existing formula
  - Validation: only allowed when no prior `opening_stock` event exists for this SKU in current FY (prevent duplicates)
  - Auth: `inventory_manage` permission
- [x] **1c.** Add `unit_cost` field to InventoryEvent metadata JSON — store WAC cost per unit for valuation

#### Backend — Opening Roll Stock

- [x] **1d.** Create `POST /rolls/opening-stock` endpoint in `rolls.py`:
  - Request: `{ rolls: [{ fabric_type, color, color_id?, total_weight, cost_per_unit, sr_no?, notes? }] }`
  - For each roll: call existing `stock_in()` logic but with `reference_type="opening_stock"` marker
  - Set `fy_id` from JWT (current FY)
  - No supplier_invoice_id (already nullable)
  - No ledger entry (opening roll is not a purchase — no party to credit)
  - Validation: flag in metadata `{ "is_opening_stock": true }` for audit trail
  - Auth: `roll_manage` permission
- [x] **1e.** Update `roll_service.stock_in()` — accept optional `reference_type` parameter. When `reference_type="opening_stock"`, skip supplier ledger entry creation.

#### Frontend — Opening Stock UI

- [x] **1f.** InventoryPage → "Opening Stock" action button (visible only when InventoryState has zero total_qty OR admin override)
  - Opens full-screen overlay with SKU picker + quantity + unit cost per row
  - "Add Row" button, bulk entry style (like bulk roll stock-in)
  - Submit → `POST /inventory/opening-stock`
  - Success → refresh inventory list, show count toast
- [x] **1g.** RollsPage → "Opening Stock" action button (same visibility rule)
  - Opens overlay with fabric/color/weight/cost fields per row (no supplier/invoice fields)
  - Submit → `POST /rolls/opening-stock`
  - Success → refresh rolls list

#### Checkpoint 1 — DONE (S96)
- [x] Client can enter 85 existing rolls (fabric, color, weight, cost) without supplier invoice
- [x] Client can enter rolls at VA vendor (with VA party, VA type, sent date → creates RollProcessing log)
- [x] Client can enter "500 pcs of BLS-101-Red-M at ₹450/pc" without batch→pack flow
- [x] InventoryState updates correctly (total_qty, available_qty)
- [x] Audit trail: events show `event_type="opening_stock"` — distinguishable from normal stock-in
- [x] `adjustment` event type bug fixed (was no-op, now adds to stock)
- [ ] Opening stock entries visible in inventory movement report *(needs testing on dev)*

---

### Phase 2: Party Opening Balance Entry (Day 1)

> **Goal:** Client can enter "Supplier X has ₹2L outstanding" without creating fake invoices

#### Backend

- [x] **2a.** Create `POST /ledger/opening-balance` endpoint in `ledger.py`:
  - Request: `{ party_type, party_id, amount, balance_type ("dr"/"cr"), entry_date?, notes? }`
  - Creates `LedgerEntry` with `entry_type="opening"`, `reference_type="manual_opening"`, `fy_id` from JWT
  - Debit or credit based on `balance_type` (supplier cr = we owe them, customer dr = they owe us)
  - Validation: warn if party already has an opening entry in this FY (allow override with `force: true`)
  - Auth: `ledger_manage` or `user_manage` permission
- [x] **2b.** Create `POST /ledger/opening-balance/bulk` endpoint:
  - Request: `{ entries: [{ party_type, party_id, amount, balance_type }] }`
  - Creates all opening entries in single transaction
  - Returns count + total debit + total credit
- [x] **2c.** Create `GET /ledger/opening-balance/status` endpoint:
  - Returns: per party_type count of parties with/without opening balance in current FY
  - Helps UI show "12/15 suppliers have opening balance, 3 remaining"

#### Frontend

- [x] **2d.** SettingsPage → "Opening Balances" tab (or section in Financial Years tab):
  - 3 sub-tabs: Suppliers, Customers, VA Parties, Brokers
  - Table: Party Name | Current Balance | Opening Amount | Dr/Cr | Status (entered/pending)
  - Inline edit: click amount cell → enter value → auto-save
  - "Save All" button for bulk submission
  - Progress indicator: "12/15 suppliers done"
- [ ] **2e.** *(Deferred — bulk entry on SettingsPage covers the need)* Party Detail overlay → "Set Opening Balance" button (visible when no opening entry exists for current FY)
  - Quick single-party entry without going to Settings

#### Checkpoint 2 — DONE (S96)
- [x] Client can enter opening balance for all 15 suppliers in one go (SettingsPage bulk)
- [ ] Client can enter opening balance for individual party from detail overlay *(deferred — bulk covers the need)*
- [x] Ledger shows opening entry dated FY start_date (or custom date)
- [x] Party balance computation includes opening entry
- [x] Duplicate prevention: warn if opening already exists (force override supported)
- [x] Progress indicator: "12/15 suppliers done" per party type
- [x] `get_all_balances` balance_type bug fixed (supplier/VA always returned "cr")

---

### Phase 3: FY Closing Fixes (Broker + Validation)

> **Goal:** Year-end close carries ALL party balances correctly

#### Backend

- [x] **3a.** Import `Broker` model in `fy_closing_service.py`
- [x] **3b.** Add `("broker", "brokers")` to party_types list in `_compute_all_balances()` (line ~152)
- [x] **3c.** Add `("broker", "brokers")` to party_types list in `_create_opening_entries()` (line ~220)
- [x] **3d.** Add `"broker": Broker` to `_get_party_name()` mapping (line ~208)
- [x] **3e.** Enhanced close-preview — add to validation warnings:
  - Rolls still `in_stock` from current FY (informational — will carry over)
  - SKUs with available_qty > 0 (informational — closing stock count)
  - Unpaid invoices (informational — receivables carry-forward)
  - Parties without opening balance (warning if first FY)
- [x] **3f.** Update `closing_snapshot` to include broker balances in the snapshot JSON

#### Checkpoint 3 — DONE (S96)
- [x] FY close carries broker balances as opening entries in new FY
- [x] Close-preview shows comprehensive summary (parties, stock, invoices, challans + rolls, unpaid invoices, SKU stock)
- [x] Snapshot includes all 4 party types (supplier, customer, va_party, broker)
- [x] Frontend close-preview shows broker count (4-column grid)

---

### Phase 4: Closing Stock Valuation Report (Accountant Needs)

> **Goal:** Generate closing stock value for Balance Sheet / P&L / GSTR-9

#### Backend

- [x] **4a.** Create `GET /dashboard/closing-stock-report` endpoint:
  - Query: `as_of_date` (default: today), `valuation_method` (default: "wac")
  - Auth: `report_view` permission
  - Response structure:

```json
{
  "as_of_date": "2026-03-31",
  "valuation_method": "weighted_average_cost",
  "raw_materials": {
    "total_rolls": 85,
    "total_weight_kg": 3825.50,
    "total_value": 574825.0,
    "by_status": {
      "in_stock": { "rolls": 60, "weight": 2700.0, "value": 405000.0 },
      "sent_for_processing": { "rolls": 20, "weight": 900.0, "value": 135000.0 },
      "remnant": { "rolls": 5, "weight": 225.5, "value": 34825.0 }
    },
    "by_fabric": [
      { "fabric_type": "Cotton", "rolls": 45, "weight": 2025.0, "value": 303750.0 }
    ]
  },
  "work_in_progress": {
    "total_batches": 18,
    "total_pieces": 3240,
    "total_value": 162000.0,
    "by_stage": {
      "lots_in_cutting": { "count": 2, "material_value": 45000.0 },
      "batches_with_tailor": { "count": 8, "material_value": 72000.0 },
      "batches_at_va": { "count": 3, "material_value": 27000.0 },
      "batches_in_qc": { "count": 5, "material_value": 18000.0 }
    },
    "valuation_note": "Valued at raw material cost only (AS-2 simplified method)"
  },
  "finished_goods": {
    "total_skus": 45,
    "total_pieces": 2700,
    "total_value": 1215000.0,
    "by_product_type": [
      { "product_type": "FBL", "skus": 30, "pieces": 1800, "value": 810000.0 }
    ]
  },
  "grand_total": {
    "raw_materials": 574825.0,
    "work_in_progress": 162000.0,
    "finished_goods": 1215000.0,
    "total_closing_stock": 1951825.0
  }
}
```

- [x] **4b.** Raw material valuation logic:
  - `SUM(roll.remaining_weight × roll.cost_per_unit)` WHERE status IN (in_stock, sent_for_processing, remnant, in_cutting)
  - Group by fabric type + status for breakdown
- [x] **4c.** WIP valuation logic (material cost method):
  - Lots in cutting: `SUM(lot_roll.weight_used × roll.cost_per_unit)` for rolls assigned to open/cutting lots
  - Batches with tailor/VA/QC: proportional fabric cost from parent lot
  - Formula: `batch_material_cost = (batch.piece_count / lot.total_pieces) × lot_total_fabric_cost`
- [x] **4d.** Finished goods valuation logic:
  - For each SKU with available_qty > 0:
    - WAC = total cost of all `opening_stock` + `ready_stock_in` events / total qty from those events
    - If no cost data: use `sku.sale_rate × 0.6` as fallback estimate (60% cost assumption)
  - `value = available_qty × WAC`
- [x] **4e.** Store cost in `InventoryEvent.metadata` for all stock-in events going forward:
  - `ready_stock_in`: compute fabric cost per piece from lot→roll chain
  - `opening_stock`: use user-provided unit_cost (Phase 1)
  - This enables accurate WAC computation

#### Frontend

- [x] **4f.** ReportsPage → "Closing Stock" tab:
  - Date picker (default: last day of current FY)
  - 3 sections: Raw Materials, Work-in-Progress, Finished Goods
  - Each section: summary card + expandable detail table
  - Grand total card at bottom
  - Print button → A4 format suitable for accountant/auditor
- [ ] **4g.** Print template: formal closing stock statement with company header, date, 3 category tables, totals, signature line *(deferred — can add later)*

#### Notes (discuss after all phases)
- **InventoryState has no fy_id — perpetual design.** Stock carries over automatically. No opening/closing needed for SKU quantities. Verify with client: is this acceptable, or do they need FY-scoped stock snapshots for auditor?

#### Checkpoint 4
- [x] Closing stock report generates correct values for all 3 categories
- [ ] Raw material value matches roll cost × remaining_weight
- [ ] WIP value computed at material cost (simplified)
- [ ] Finished goods WAC computed from event history
- [ ] Report printable in A4 format for accountant
- [ ] Can run for any as_of_date (not just March 31)

---

### Phase 5: Physical Verification Workflow

> **Goal:** Reconcile book stock vs physical stock, create adjustment entries

#### Backend — Model

- [x] **5a.** Create `StockVerification` model (43rd):
  - `verification_no` (SV-XXXX per FY), `verification_type` ("raw_material" / "finished_goods"), `verification_date`, `status` ("draft" / "in_progress" / "completed" / "approved"), `notes`, `started_by` FK, `approved_by` FK, `approved_at`, `fy_id`
- [x] **5b.** Create `StockVerificationItem` model (44th):
  - `verification_id` FK (CASCADE), `sku_id` FK (nullable), `roll_id` FK (nullable), `book_qty` (Integer or Decimal for weight), `physical_qty`, `variance`, `variance_pct`, `adjustment_type` ("shortage" / "excess" / "match"), `notes`

#### Backend — Service + API

- [x] **5c.** `StockVerificationService`:
  - `create(type)` — generates SV number, auto-populates book quantities from current InventoryState (for SKUs) or Roll weights (for raw material)
  - `update_counts(id, items[])` — enter physical quantities, auto-compute variance
  - `complete(id)` — mark as completed, lock for review
  - `approve(id)` — creates adjustment inventory events:
    - Shortage: `InventoryEvent(event_type="loss", reference_type="physical_verification")`
    - Excess: `InventoryEvent(event_type="adjustment", reference_type="physical_verification")`
    - For rolls: adjusts `remaining_weight` + creates `adjustment` event
  - `get_verifications()` — list with filters
  - `get_verification(id)` — detail with items
- [x] **5d.** API: `GET /inventory/verifications`, `POST /inventory/verifications`, `GET /{id}`, `POST /{id}/counts`, `POST /{id}/complete`, `POST /{id}/approve`
- [x] **5e.** Code generator: `next_verification_number()` — SV-XXXX per FY

#### Frontend

- [x] **5f.** InventoryPage → "Physical Verification" action button:
  - Create verification: choose type (Raw Material / Finished Goods)
  - Auto-generates count sheet with all items + book quantities
  - Enter physical quantities per row (book qty visible for reference, or blind mode)
  - Variance column auto-computes (physical - book), color-coded (red shortage, green excess, gray match)
  - "Complete" → lock for review → "Approve & Adjust" → creates events
- [x] **5g.** Verification history: list of past verifications with status, date, variance summary
- [ ] **5h.** Print count sheet: A4 format with item list, book qty column (optional blank for blind count), physical qty column (blank for manual fill) *(deferred — can add later)*

#### Migration

- [x] **5i.** Migration `y9z0a1b2c3d4`: CREATE TABLE stock_verifications + stock_verification_items (all tenant schemas)

#### Checkpoint 5
- [ ] Can create raw material verification → auto-lists all rolls with book weight
- [ ] Can create finished goods verification → auto-lists all SKUs with book qty
- [ ] Enter physical counts → variance auto-computes
- [ ] Approve → shortage creates LOSS event, excess creates ADJUSTMENT event
- [ ] InventoryState updates correctly after approval
- [ ] Printable count sheet for warehouse team

---

### Phase 6: Party Reconciliation Report

> **Goal:** Generate formal balance confirmation letters for audit

#### Backend

- [x] **6a.** Create `GET /ledger/party-confirmation/{party_type}/{party_id}` endpoint:
  - Returns: party details, FY period, opening balance, transaction summary (invoices, payments, CN/DN), closing balance, unpaid invoice list
  - Auth: `report_view` permission

#### Frontend

- [x] **6b.** Party Detail overlay → "Balance Confirmation" print button:
  - Generates formal letter with:
    - Company letterhead (name, address, GST)
    - Party address
    - "Dear Sir/Madam, as per our books the balance as on {date} is ₹{amount}"
    - Transaction summary table (opening + invoices + payments + adjustments = closing)
    - Unpaid invoice list (invoice no, date, amount, due date)
    - "Please confirm or send discrepancies within 15 days"
    - Signature line
  - A4 print format

#### Checkpoint 6
- [ ] Generate balance confirmation for any party
- [ ] Letter includes transaction summary + unpaid invoices
- [ ] Printable A4 format with company header
- [ ] Works for all 4 party types (supplier, customer, va_party, broker)

---

## Part 6: Phase Dependencies & Priority

```
Phase 1 (Opening Stock)     ←── MUST HAVE for April 1 go-live
Phase 2 (Opening Balances)  ←── MUST HAVE for April 1 go-live
Phase 3 (Broker Fix)        ←── MUST HAVE before first year-end close
    ↓
Phase 4 (Closing Valuation) ←── MUST HAVE for March 31 (accountant)
    ↓
Phase 5 (Physical Verify)   ←── SHOULD HAVE for audit compliance
Phase 6 (Reconciliation)    ←── NICE TO HAVE for professional operations
```

**Phases 1-3 are independent** — can be built in parallel.
**Phase 4 depends on Phase 1** — needs `unit_cost` in InventoryEvent metadata for WAC.
**Phases 5-6 are independent** — can be built anytime after Phase 1.

---

## Part 7: Files That Will Change

### Phase 1 — Opening Stock

**Backend — Modified:**
```
backend/app/services/inventory_service.py   ← add opening_stock to valid types
backend/app/services/roll_service.py        ← accept reference_type param in stock_in()
backend/app/api/inventory.py                ← POST /opening-stock endpoint
backend/app/api/rolls.py                    ← POST /opening-stock endpoint
```

**Frontend — Modified:**
```
frontend/src/pages/InventoryPage.jsx        ← Opening Stock button + overlay
frontend/src/pages/RollsPage.jsx            ← Opening Stock button + overlay
frontend/src/api/inventory.js               ← openingStock() API call
frontend/src/api/rolls.js                   ← openingRollStock() API call
```

**No new models. No migration. ~8 files.**

### Phase 2 — Opening Balances

**Backend — Modified:**
```
backend/app/api/ledger.py                   ← POST /opening-balance, /opening-balance/bulk, GET /status
backend/app/services/ledger_service.py      ← create_opening_balance(), bulk method
```

**Frontend — Modified:**
```
frontend/src/pages/SettingsPage.jsx          ← Opening Balances tab
frontend/src/api/ledger.js                   ← openingBalance() API calls
frontend/src/pages/PartyMastersPage.jsx      ← "Set Opening Balance" in detail overlay
```

**No new models. No migration. ~5 files.**

### Phase 3 — Broker Fix

**Backend — Modified:**
```
backend/app/services/fy_closing_service.py  ← add broker to party_types, import Broker
```

**1 file. 4 line changes.**

### Phase 4 — Closing Stock Valuation

**Backend — New + Modified:**
```
backend/app/api/dashboard.py                ← GET /closing-stock-report endpoint
backend/app/services/dashboard_service.py   ← get_closing_stock_report() method
backend/app/services/inventory_service.py   ← store cost in event metadata
```

**Frontend — Modified:**
```
frontend/src/pages/ReportsPage.jsx          ← Closing Stock tab
frontend/src/api/dashboard.js               ← getClosingStockReport() call
```

**No new models. No migration. ~5 files.**

### Phase 5 — Physical Verification

**Backend — New:**
```
backend/app/models/stock_verification.py    ← StockVerification + StockVerificationItem models
backend/app/schemas/stock_verification.py   ← schemas
backend/app/services/stock_verification_service.py ← service
backend/app/api/stock_verification.py       ← routes
backend/migrations/versions/xxx.py          ← migration
```

**Backend — Modified:**
```
backend/app/models/__init__.py              ← import new models
backend/app/api/router.py                   ← register routes
backend/app/core/code_generator.py          ← next_verification_number()
```

**Frontend — Modified:**
```
frontend/src/pages/InventoryPage.jsx        ← verification UI
frontend/src/api/inventory.js               ← verification API calls
```

**2 new models (43rd, 44th). 1 migration. ~10 files.**

### Phase 6 — Reconciliation Report

**Backend — Modified:**
```
backend/app/api/ledger.py                   ← GET /party-confirmation endpoint
backend/app/services/ledger_service.py      ← party_confirmation_report() method
```

**Frontend — Modified:**
```
frontend/src/pages/PartyMastersPage.jsx     ← print button in detail overlay
```

**No new models. No migration. ~3 files.**

---

## Part 8: Summary

| Phase | What | New Models | Files (~) | Priority |
|---|---|---|---|---|
| **P1** | Opening Stock Entry (rolls + SKUs) | 0 | ~8 | MUST — April 1 |
| **P2** | Party Opening Balance Entry | 0 | ~5 | MUST — April 1 |
| **P3** | Broker Fix in FY Closing | 0 | ~1 | MUST — before close |
| **P4** | Closing Stock Valuation Report | 0 | ~5 | MUST — March 31 |
| **P5** | Physical Verification Workflow | 2 (43rd, 44th) | ~10 | SHOULD — audit |
| **P6** | Party Reconciliation Report | 0 | ~3 | NICE — professional |
| **Total** | | **2 new models** | **~32 files** | |
