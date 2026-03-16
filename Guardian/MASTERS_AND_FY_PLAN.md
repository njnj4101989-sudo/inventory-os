# Masters Restructure + Ledger + Financial Year Plan

## Status: APPROVED — Execute phase by phase

---

## Part 1: Domain Understanding

### Client's Old System (Quick Software)

**Item Master:** Finished goods register with HSN, GST, pricing, opening stock
**Account Master:** Unified party register with opening balances, credit terms, GST panel, TDS/TCS, ledger

### Our System Mapping

```
Old System                     →  Our System
──────────────────────────────────────────────────────
Item Master (finished)         →  SKU (needs HSN/GST/MRP — Phase 3)
Item Master (raw material)     →  Fabric (master) + Roll (instance)
Account Master (all parties)   →  Supplier + VAParty + Customer (NEW)
Ledger (debit/credit journal)  →  LedgerEntry (NEW — Phase 2)
Financial Year                 →  Company + FinancialYear (Phase 4)
```

---

## Part 2: Decisions Log (All Confirmed)

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | `Order.customer_id` | **Required** | Fresh start, all new orders must reference customer master |
| 2 | Sidebar | "Party Masters" + "Masters" (no rename) | Keep simple, SKU→"Item Master" can happen later |
| 3 | URL | `/parties` for party masters | Clean |
| 4 | Ledger approach | **Journal table** (`LedgerEntry`) | Real accounting systems all use journals. Computed can't handle payments, adjustments, opening balances |
| 5 | Opening balance | **Both** — party field (cache) + ledger entry (authority) | Quick display from party model, FY-aware history from ledger |
| 6 | FY code format | `FY2026-27` | Standard Indian format |
| 7 | Counter format | `ORD-2627-0001` (FY prefixed) | GST requires unique invoice numbers per FY. Prefix = automatic uniqueness + audit-friendly |
| 8 | TDS/TCS fields | **Include** | Legal requirement — job work TDS (194C), broker TDS (194H), retailer TCS (206C) |
| 9 | MSME/Aadhar | **Include** | MSME 45-day payment rule (Sec 43B(h)), Aadhar needed if PAN missing (higher TDS) |

---

## Part 3: Data Models

### A. Customer (NEW — 27th model)

Customers are retailers who buy finished garments. Need credit terms, GST, TDS/TCS, ledger.

```
Table: customers
──────────────────────────────────────────────────────
Core Identity
  name              String(200)     REQUIRED    Company/retailer name
  contact_person    String(200)     optional    Who to contact
  short_name        String(50)      optional    Quick reference / alias
  phone             String(20)      optional    Primary mobile
  phone_alt         String(20)      optional    Office / alternate
  email             String(100)     optional

Address
  address           Text            optional    Full address line
  city              String(100)     optional
  state             String(100)     optional    Indian state (for GST: IGST vs CGST+SGST)
  pin_code          String(10)      optional

GST & Compliance
  gst_no            String(15)      optional    15-digit GSTIN
  gst_type          String(20)      optional    regular / composition / unregistered
  state_code        String(2)       optional    GST state code (e.g., "24" for Gujarat)
  pan_no            String(10)      optional
  aadhar_no         String(12)      optional    Needed if PAN missing (higher TDS rate)

Credit & Payment Terms
  due_days          Integer         optional    Credit period in days (0 = cash)
  credit_limit      Decimal(12,2)   optional    Max outstanding allowed
  opening_balance   Decimal(12,2)   optional    Opening balance for current FY
  balance_type      String(10)      optional    "debit" / "credit"

TDS/TCS
  tds_applicable    Boolean         default=false
  tds_rate          Decimal(5,2)    optional    Default TDS %
  tds_section       String(10)      optional    e.g., "194C", "194H"
  tcs_applicable    Boolean         default=false
  tcs_rate          Decimal(5,2)    optional    Default TCS %
  tcs_section       String(10)      optional    e.g., "206C(1H)"

Other
  broker            String(200)     optional    Agent/broker name
  notes             Text            optional    Remarks
  is_active         Boolean         default=true
```

**FK:** `Order.customer_id` → `customers.id` (required, RESTRICT ondelete)

---

### B. Supplier — Enrich Existing

Add to existing Supplier model (keep all current fields intact):

```
NEW columns on suppliers table
──────────────────────────────────────────────────────
  phone_alt         String(20)      optional    Alternate phone
  gst_type          String(20)      optional    regular / composition / unregistered
  state_code        String(2)       optional    GST state code
  aadhar_no         String(12)      optional
  due_days          Integer         optional    Payment credit period (days)
  credit_limit      Decimal(12,2)   optional    Max payable outstanding
  opening_balance   Decimal(12,2)   optional    Opening balance for current FY
  balance_type      String(10)      optional    "debit" / "credit"
  tds_applicable    Boolean         default=false
  tds_rate          Decimal(5,2)    optional
  tds_section       String(10)      optional    e.g., "194C" (contractors), "194H" (brokerage)
  msme_type         String(20)      optional    micro / small / medium / none
  msme_reg_no       String(30)      optional    Udyam registration number
  notes             Text            optional
```

**Existing fields unchanged:** name, contact_person, phone, email, gst_no, pan_no, address, city, state, pin_code, broker, hsn_code, is_active

---

### C. VA Party — Enrich Existing

Add to existing VAParty model (keep all current fields intact):

```
NEW columns on va_parties table
──────────────────────────────────────────────────────
  contact_person    String(200)     optional
  phone_alt         String(20)      optional
  email             String(100)     optional
  address           Text            optional
  state             String(100)     optional
  pin_code          String(10)      optional
  state_code        String(2)       optional    GST state code
  gst_type          String(20)      optional    regular / composition / unregistered
  pan_no            String(10)      optional
  aadhar_no         String(12)      optional
  due_days          Integer         optional    Payment credit period
  credit_limit      Decimal(12,2)   optional    Max payable outstanding
  opening_balance   Decimal(12,2)   optional
  balance_type      String(10)      optional    "debit" / "credit"
  tds_applicable    Boolean         default=false
  tds_rate          Decimal(5,2)    optional
  tds_section       String(10)      optional    "194C" (job work)
  msme_type         String(20)      optional    micro / small / medium / none
  msme_reg_no       String(30)      optional    Udyam registration number
  notes             Text            optional
```

**Existing fields unchanged:** name, phone, city, gst_no, hsn_code, is_active

---

### D. LedgerEntry (NEW — Phase 2)

Journal table for full double-entry accounting. Every financial movement creates an entry.

```
Table: ledger_entries
──────────────────────────────────────────────────────
Core
  entry_date        Date            REQUIRED    Transaction date
  party_type        String(20)      REQUIRED    "supplier" / "customer" / "va_party"
  party_id          UUID            REQUIRED    FK to the party (polymorphic — no DB constraint)
  entry_type        String(30)      REQUIRED    "opening" / "invoice" / "payment" / "challan" / "adjustment" / "tds" / "tcs"
  reference_type    String(30)      optional    "supplier_invoice" / "order" / "invoice" / "job_challan" / "batch_challan" / "manual"
  reference_id      UUID            optional    FK to source document (null for manual entries)

Amounts
  debit             Decimal(12,2)   default=0   Debit amount
  credit            Decimal(12,2)   default=0   Credit amount
  tds_amount        Decimal(12,2)   optional    TDS deducted on this entry
  tds_section       String(10)      optional    Which TDS section
  tcs_amount        Decimal(12,2)   optional    TCS collected on this entry
  net_amount        Decimal(12,2)   optional    Actual amount paid/received after TDS/TCS

Metadata
  description       String(500)     REQUIRED    Human-readable (e.g., "JC-001 Embroidery - 20 rolls")
  fy_id             UUID            REQUIRED    FK to financial_year
  created_by        UUID            optional    FK to users
  notes             Text            optional

Indexes
  (party_type, party_id, entry_date)  — ledger queries
  (fy_id)                             — FY filtering
  (reference_type, reference_id)      — back-reference to source document
```

**Auto-generated entries (created in same DB transaction as source):**

| Event | Party Type | Debit | Credit | Entry Type |
|---|---|---|---|---|
| Stock-in (SupplierInvoice) | supplier | — | invoice_total | "invoice" |
| Payment to supplier | supplier | paid_amount | — | "payment" |
| TDS deducted on supplier payment | supplier | tds_amount | — | "tds" |
| Sale invoice issued | customer | invoice_total | — | "invoice" |
| Payment from customer | customer | — | received_amount | "payment" |
| TCS collected from customer | customer | — | tcs_amount | "tcs" |
| VA Challan sent (with est. cost) | va_party | — | est_cost | "challan" |
| VA Challan received (actual cost) | va_party | — | adjustment | "challan" |
| Payment to VA party | va_party | paid_amount | — | "payment" |
| TDS deducted on VA payment | va_party | tds_amount | — | "tds" |
| FY opening balance | any | opening_amt | — (or credit) | "opening" |

**Balance computation:**
```
Supplier:  Balance = SUM(credit) - SUM(debit)  → positive = we owe them
Customer:  Balance = SUM(debit) - SUM(credit)  → positive = they owe us
VA Party:  Balance = SUM(credit) - SUM(debit)  → positive = we owe them
```

**Ledger view (frontend):**
```
PASHUPATI TRENDZ (VA Party) — Ledger
────────────────────────────────────────────────────────────
Date        Particular              Debit    Credit   Balance
01-Apr-26   Opening Balance                  5,000    5,000 Cr
05-Apr-26   JC-001 Embroidery               12,000   17,000 Cr
10-Apr-26   Payment (NEFT)          16,830            170 Cr
            TDS @1% u/s 194C          170
18-Apr-26   JC-002 Sequin                    8,500    8,670 Cr
────────────────────────────────────────────────────────────
            Totals                  17,000   25,500
            Closing Balance                           8,500 Cr
```

---

### E. Company (Phase 4)

```
Table: company (single row for now)
──────────────────────────────────────────────────────
  name              String(200)     "DRS Blouse"
  address           Text            Registered address
  city              String(100)
  state             String(100)
  pin_code          String(10)
  gst_no            String(15)      Company GSTIN
  state_code        String(2)       GST state code
  pan_no            String(10)      Company PAN
  phone             String(20)
  email             String(100)
  logo_url          String(500)     For invoice/challan headers
  bank_name         String(200)     For invoice footer
  bank_account      String(30)      Account number
  bank_ifsc         String(11)      IFSC code
  bank_branch       String(200)     Branch name
```

### F. FinancialYear (Phase 4)

```
Table: financial_years
──────────────────────────────────────────────────────
  code              String(20)      "FY2026-27" (unique)
  start_date        Date            2026-04-01
  end_date          Date            2027-03-31
  status            String(20)      "open" / "closed"
  is_current        Boolean         Only one true at a time
  closed_by         UUID FK→users   Who performed closing
  closed_at         DateTime        When closed
```

**Transaction tagging:** `fy_id` FK on rolls, orders, invoices, supplier_invoices, ledger_entries
**Counter format:** `{PREFIX}-{FY_SHORT}-{SEQ}` → `ORD-2627-0001`, `INV-2627-0001`, `JC-2627-001`

---

### G. Year Closing Process (Phase 4)

```
Step 1: Pre-close validation
  - List: pending VA challans, unfulfilled orders, unpaid invoices
  - These don't BLOCK close — user acknowledges carry-forward items
  - Warning if MSME payments overdue > 45 days

Step 2: Snapshot & carry forward
  Inventory:
    - For each SKU: closing inventory_state.available_qty → new FY opening
  Party balances:
    - For each party with non-zero balance:
      - Calculate closing balance from ledger (SUM debit - SUM credit for the FY)
      - Create "opening" ledger entry in new FY
      - Update party.opening_balance field
  Sequential counters:
    - New FY prefix: ORD-2627-xxxx → ORD-2728-xxxx
    - Sequence resets to 0001

Step 3: Create new FY
  - FY2026-27: status = 'closed', is_current = false
  - FY2027-28: created, status = 'open', is_current = true

Step 4: Post-close rules
  - Closed FY: viewable, printable, NOT editable (no new transactions)
  - All list pages: FY filter dropdown (default = current FY)
  - Reports: can span multiple FYs or filter by single FY
```

---

## Part 4: Indian Tax/Compliance Reference

### TDS Sections (relevant to this business)

| Section | Rate | Applies To | When |
|---|---|---|---|
| 194C | 1% (company) / 2% (individual) | Job work / VA processing | Payment to VA party |
| 194H | 5% | Commission / brokerage | Payment to broker |
| 194J | 10% | Professional fees | If applicable |

**Rule:** TDS deducted at time of payment (not invoice). Separate "tds" ledger entry.
**No PAN:** TDS rate doubles (or 20%, whichever higher). Track `aadhar_no` as fallback.

### TCS Sections

| Section | Rate | Applies To | When |
|---|---|---|---|
| 206C(1H) | 0.1% (PAN) / 1% (no PAN) | Sale of goods > ₹50L/FY | Receipt from customer |

**Rule:** TCS collected at time of receipt. Tracked per customer per FY.

### MSME (Sec 43B(h))

- Payment to micro/small enterprise must be within 45 days of acceptance
- If late → disallowed as expense in ITR
- Need: `msme_type` + `msme_reg_no` on Supplier and VA Party
- Dashboard alert: "MSME payments overdue" (future)

### GST Types

| Type | Meaning | Impact |
|---|---|---|
| regular | Normal GST registered | Full input credit, issue tax invoice |
| composition | Composition scheme | No input credit, issue bill of supply |
| unregistered | No GSTIN | Reverse charge may apply |

**State impact:** Same state → CGST + SGST. Different state → IGST. Need `state_code` on both company and party.

---

## Part 5: Execution Phases

### Phase 1a: Party Masters Page + Customer Model (THIS SESSION)

**Backend (11 tasks):**
1. Create `Customer` model with full field set (as defined in Part 3A)
2. Create Customer schemas (CustomerCreate, CustomerUpdate, CustomerResponse, CustomerBrief)
3. Create Customer service (CRUD + list with search/pagination)
4. Create Customer API routes (`GET/POST /customers`, `GET/PATCH /customers/{id}`)
5. Enrich Supplier model — add new columns (Part 3B)
6. Enrich VAParty model — add new columns (Part 3C)
7. Update Supplier schemas to include new fields
8. Update VAParty schemas to include new fields
9. Add `customer_id` FK to Order model (required)
10. Update Order schema + service — accept customer_id, return nested customer
11. Alembic migration (customers table + order FK + supplier/va_party new columns)

**Frontend (11 tasks):**
12. Create `PartyMastersPage.jsx` (3 tabs: Suppliers, VA Parties, Customers)
13. Move Supplier CRUD from `SuppliersPage.jsx` → Suppliers tab in PartyMastersPage
14. Move VA Party CRUD from `MastersPage.jsx` → VA Parties tab in PartyMastersPage
15. Build Customer CRUD in Customers tab (matching Supplier form pattern)
16. Remove VA Parties tab from MastersPage (keep 4 tabs: PT, Color, Fabric, VA Types)
17. Remove `SuppliersPage.jsx` from router (redirect /suppliers → /parties)
18. Update sidebar: remove "Suppliers", add "Party Masters" link
19. Update OrdersPage: customer_id dropdown picker + Shift+M quick create
20. Update InvoicesPage: show customer from nested FK object
21. Add Customer to QuickMasterModal config
22. Create `frontend/src/api/customers.js` API module

**Docs & Deploy (3 tasks):**
23. Update API_REFERENCE.md (Customer endpoints, enriched Supplier/VAParty, Order changes)
24. Migration on prod + deploy
25. Verify all 3 tabs + order creation + invoice display

### Phase 1c: COMPLETED (S74 — 2026-03-16)
- ✅ Task 19: OrdersPage — customer_id dropdown picker (fetches all active customers on create)
- ✅ Task 19: Shift+M quick create on customer dropdown (`data-master="customer"`)
- ✅ Task 19: Selected customer shows phone + GST inline, auto-fills customer_name/phone/address in payload
- ✅ Task 20: InvoicesPage — shows customer from nested FK object (name, phone, city, GST) in table, detail, and print
- ✅ Task 21: QuickMasterModal — `customer` type added (name, phone, city fields)
- ✅ OrdersPage detail — customer name/phone/address from nested `customer` object with fallback to flat fields

### Phase 1b: COMPLETED (S74 — 2026-03-16)
- ✅ `state_code` added to all 3 EMPTY_FORMS + sent in payload
- ✅ GST auto-fill: first 2 digits of GSTIN → auto-populates `state` + `state_code` (official 37-state mapping)
- ✅ State dropdown → auto-fills `state_code`
- ✅ TDS Section: dropdown with 194C (Job Work), 194H (Brokerage), 194J (Professional), 194Q (Purchase)
- ✅ TCS Section: dropdown with 206C(1H) (Sale >50L), 206C (Other) — customers only
- ✅ TDS rate placeholder auto-adjusts per section (1/2 for 194C, 5 for 194H)
- ✅ No-PAN warning: amber alert when TDS enabled but PAN is empty
- ✅ Aadhar hint: "Required if no PAN (higher TDS)"
- ✅ MSME 45-day hint: Sec 43B(h) warning for micro/small enterprises
- ✅ Detail view: state_code with decoded name, TDS/TCS section descriptions, MSME type capitalized
- ✅ Modal UX: auto-focus first input on open, Ctrl+S save, scrollable on zoom, compact section padding
- ✅ TDS checkbox + MSME Type + Notes all inline in one 5-col row

### Phase 2: COMPLETED (S74 — 2026-03-16)
- ✅ LedgerEntry model (28th) — journal table with 3 composite indexes
- ✅ LedgerService: create entry, record payment with TDS/TCS, balance computation (single + bulk)
- ✅ 4 API endpoints: GET /ledger, GET /balance, GET /balances, POST /payment
- ✅ Auto-entry wiring: stock-in→supplier credit, invoice→customer debit, JC receive→VA credit, BC receive→VA credit
- ✅ Partial receive safety: updates existing ledger entry instead of duplicating
- ✅ LedgerPanel slide-out: running balance table, inline Record Payment form
- ✅ Payment form: amount, date, mode (NEFT/UPI/cash/cheque), ref no, TDS/TCS section dropdowns
- ✅ Balance column on all 3 PartyMasters tabs
- ✅ "View Ledger" button in party detail modal
- NOTE: fy_id nullable until Phase 4 wiring

### Phase 3: COMPLETED (S74 — 2026-03-16)
- ✅ 5 new columns on SKU: hsn_code, gst_percent, mrp, sale_rate, unit
- ✅ Schemas updated (Create, Update, Response)
- ✅ SKUsPage detail: 4-col grid with Base Price, MRP, Sale Rate, Unit, HSN, GST% dropdown, Description
- ✅ Migration applied

### Phase 4: COMPLETED (S74 — 2026-03-16) — Foundation
- ✅ Company model (29th) — single-row profile (GST, PAN, bank details, address)
- ✅ FinancialYear model (30th) — FY periods with open/closed, is_current toggle
- ✅ `fy_id` FK added to: rolls, orders, invoices, supplier_invoices, ledger_entries
- ✅ Company + FY service (CRUD, current FY toggle, upsert company)
- ✅ 5 API endpoints: GET/PATCH /company, GET/POST/PATCH /financial-years
- ✅ SettingsPage (admin-only): Company Profile tab + Financial Years tab
- ✅ Sidebar: Settings entry under Setup section

**Deferred to future session:**
- Year closing logic (validate → snapshot → carry forward → create new FY)
- FY filter dropdown on all list pages
- Counter prefix migration (ORD-0001 → ORD-2627-0001)
- Opening balance carry-forward (inventory + party balances via ledger)
- Auto-tag fy_id on transaction creation (needs current FY lookup)

---

## Part 6: Files That Will Change (Phase 1a Reference)

### Backend — New Files
```
backend/app/models/customer.py          ← NEW model
backend/app/schemas/customer.py         ← NEW schemas
backend/app/services/customer_service.py ← NEW service
backend/app/api/customers.py            ← NEW routes
backend/migrations/versions/xxx.py      ← NEW migration
```

### Backend — Modified Files
```
backend/app/models/__init__.py          ← import Customer
backend/app/models/supplier.py          ← add new columns
backend/app/models/va_party.py          ← add new columns
backend/app/models/order.py             ← add customer_id FK + relationship
backend/app/schemas/supplier.py         ← update schemas with new fields
backend/app/schemas/master.py           ← update VAParty schemas with new fields
backend/app/schemas/order.py            ← add customer_id + nested customer
backend/app/services/order_service.py   ← selectinload Customer, include in response
backend/app/services/master_service.py  ← update VAParty create/update for new fields
backend/app/api/__init__.py             ← register customer router
```

### Frontend — New Files
```
frontend/src/pages/PartyMastersPage.jsx ← NEW page (3 tabs)
frontend/src/api/customers.js           ← NEW API module
```

### Frontend — Modified Files
```
frontend/src/components/layout/Sidebar.jsx  ← add Party Masters, remove Suppliers
frontend/src/App.jsx (or router)            ← add /parties route, remove /suppliers
frontend/src/pages/MastersPage.jsx          ← remove VA Parties tab
frontend/src/pages/OrdersPage.jsx           ← customer_id picker + Shift+M
frontend/src/pages/InvoicesPage.jsx         ← show customer from FK
frontend/src/hooks/useQuickMaster.js        ← (if needed) add customer config
frontend/src/components/common/QuickMasterModal.jsx ← add customer type
```

### Docs
```
Guardian/API_REFERENCE.md               ← Customer endpoints, enriched schemas
Guardian/CLAUDE.md                      ← session update
```
