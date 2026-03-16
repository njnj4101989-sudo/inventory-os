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

## Current State (Session 76 — 2026-03-17)

### S76: Multi-Company Schema-Per-Tenant + HttpOnly Cookie Auth + FY Closing

**Phase 1 — PostgreSQL Only (drop SQLite):**
- Local PG 18.3 (`inventory_dev` DB), `aiosqlite` removed, `is_postgresql()` removed
- 4 public tables: `companies` (+ slug/schema_name), `users`, `roles`, `user_companies` (NEW)
- 28 tenant tables: all business tables (rolls, lots, batches, orders, etc.)
- All 17 tenant model FKs updated: `ForeignKey("public.users.id")`
- Fresh Alembic baseline: `d5de97f3daf8` (32 tables) + `3e78791f67a1` (closing_snapshot)
- Schema provisioning: `create_company()` → PG schema + 28 tables + seed/inherit masters
- Master inheritance: copy item/party masters from source company (selective or all)

**Phase 2 — Auth Migration (HttpOnly Cookies):**
- JWT in HttpOnly cookies (no more localStorage tokens), `SameSite=None` in prod
- `/auth/me` endpoint (server = single source of truth), `/auth/select-company`
- TenantMiddleware: extracts `company_schema` from JWT → `request.state`
- `get_db(request: Request)` — `SET search_path TO {schema}, public` per request
- Extended JWT: `company_id`, `company_schema`, `company_name`, `fy_id`, `fy_code`
- Login: 1 company → auto-select | N companies → picker | 0 → settings redirect
- SSE: cookie-based auth (no more `?token=` query param)

**Phase 3 — Frontend:**
- Login company picker (radio cards, initial avatar, default badge)
- Header: company switcher dropdown + FY badge switcher (both reload page on switch)
- Settings → Companies tab: company cards grid + 2-step creation wizard (master inheritance checkboxes)
- Settings → FY tab: edit (inline), delete (with linked-data check), validation (date range)
- AuthContext: zero localStorage for auth, `/auth/me` on mount, `selectCompany()` for switching

**Phase 4a — Year Closing:**
- `FYClosingService`: validate → snapshot balances → close old FY → create new FY → opening entries
- Atomic: validate-then-mutate, single transaction (route commits)
- `/financial-years/{id}/close-preview` (warnings + balance snapshot)
- `/financial-years/{id}/close` (execute closing)
- UI: "Close Year" button on current FY → confirmation modal with balance summary + "What will happen"

**Production Fixes (6 blockers from audit):**
- `from __future__ import annotations` broke FastAPI Request injection in `get_db`
- 401 interceptor infinite loop on auth endpoints (excluded `/auth/me`, `/auth/refresh`)
- Company creation transactional (rollback drops schema on failure)
- FY closing atomic (validate-then-mutate, single transaction)
- Auth service reuses injected session (no extra pool connections per login)
- 0-companies edge case → redirects to Settings

**Decisions:**
- Native PG 18 (not Docker — laptop can't run Docker Desktop/WSL2)
- ONE Base class, `search_path` for routing (no PublicBase/TenantBase split)
- `schema="public"` on 4 models, tenant models have no schema qualifier
- `checkfirst=False` in `create_tenant_tables` (search_path fallthrough skips creation)
- Party opening balances reset to null on master inheritance (fresh books per company)
- FY closing carries forward party balances as opening ledger entries, stock untouched

**Commits:** `6ebcdc8` | 60 files, +3279/-958

**TODO (next session — S77):**
- [ ] Phase 4c: Counter reset — add `fy_id` filter to code generators (ORD/INV/JC/BC/LOT/BATCH)
- [ ] Phase 4d: Production data migration script (move prod data → `co_drs_blouse` schema on AWS RDS)
- [ ] Alembic multi-schema `env.py` (iterate tenant schemas for future model changes)
- [ ] Link all prod users to company + create UserCompany records
- [ ] Deploy multi-company + auth changes to production
- [ ] Update API_REFERENCE.md with new auth endpoints + company/FY endpoints

---

## Previous State (Session 74 — 2026-03-16)

### S74: MASTERS_AND_FY_PLAN Complete — Phases 1b, 1c, 2, 3, 4

**Phase 1b: TDS/TCS/MSME Form Enrichment + Modal UX**
- GST auto-fill (GSTIN → state + state_code), TDS/TCS section dropdowns (194C/194H/194J/206C)
- No-PAN warning, Aadhar hint, MSME 45-day Sec 43B(h) warning
- Modal: auto-focus first input, Ctrl+S save, scrollable on zoom, compact padding
- TDS + MSME + Notes inline in one 5-col row

**Phase 1c: OrdersPage Customer Picker**
- Customer dropdown picker (fetches `/customers/all`), Shift+M quick create
- InvoicesPage: nested customer in table/detail/print (name, phone, GST)
- QuickMasterModal: `customer` type added

**Phase 2: Ledger System (28th model — LedgerEntry)**
- LedgerService: payment recording with TDS/TCS, balance computation
- 4 API endpoints: GET /ledger, GET /balance, GET /balances, POST /payment
- Auto-entry wiring: stock-in→supplier, invoice→customer, JC/BC receive→VA party
- LedgerPanel slide-out + inline payment form + balance column on PartyMasters

**Phase 3: SKU Enrichment**
- 5 columns added: hsn_code, gst_percent, mrp, sale_rate, unit
- SKUsPage detail: 4-col grid editor

**Phase 4: Company + Financial Year (29th Company, 30th FinancialYear)**
- fy_id FK on rolls, orders, invoices, supplier_invoices, ledger_entries
- SettingsPage: Company Profile tab + Financial Years tab
- Sidebar: Settings entry (admin-only)

**30 models total. MASTERS_AND_FY_PLAN.md fully completed.**

**Commits:** `910735e`, `275d14d`, `ba308c1`, `c022b63`, `9fc2841`, `839a08a`

**TODO (next session):**
- [x] Update API_REFERENCE.md ✅ S75
- [x] Counter prefix migration ❌ Not needed (client confirmed)
- [ ] Year closing logic → moved to S76+
- [ ] Auto-tag fy_id → moved to S76+
- [ ] FY filter dropdown → moved to S76+
- [ ] Deploy Phase 2-4 to production → moved to S76+

---

## Previous State (Session 73 — 2026-03-16)

### S73: Color FK + Production DB Wipe + Party Masters Phase 1a

**Color Master Fixes (direct DB on prod):**
- RED: code `` `ORG `` → `RED`
- YELLOW → MUSTARD: name + code `YLOW` → `MSTRD`
- BOTTEL GREEN → BOTTLE GREEN: name + code `B GRE` → `BTGRN`
- CHIKKU: confirmed (user changed GOLDEN → CHIKKU via admin panel), code still `BEIGE`

**Color FK (rolls + SKUs):**
- `Roll.color_id` FK → `colors.id` (nullable, RESTRICT ondelete)
- `SKU.color_id` FK → `colors.id` (nullable, RESTRICT ondelete)
- Roll response: nested `color_obj` (id, name, code, color_no) via selectinload
- All 11 roll query paths updated with `selectinload(Roll.color_obj)`
- `ColorUpdate` schema: `code` now editable (with duplicate check)
- Frontend: stock-in sends `color_id`, MastersPage color edit includes code field
- Migration `ca193c1c4572`

**Production DB Wiped (fresh start):**
- All 17 transaction tables emptied (rolls, lots, batches, challans, orders, invoices, etc.)
- 10 master tables intact (colors=11, fabrics=4, suppliers=1, users=5, roles=5, va_additions=11, va_parties=1)
- SKUs + inventory_state also cleared (generated from transactions)
- Test VA party "handStoneHouse" deleted

**Phase 1a: Party Masters + Customer Model (27th model):**
- Customer model: name, contact_person, short_name, phone, phone_alt, email, address, city, state, pin_code, gst_no, gst_type, state_code, pan_no, aadhar_no, due_days, credit_limit, opening_balance, balance_type, tds_applicable, tds_rate, tds_section, tcs_applicable, tcs_rate, tcs_section, broker, notes, is_active
- Customer schema (Create/Update/Response/Brief), service (CRUD + search), API routes (`/customers`)
- Supplier enriched: +14 columns (phone_alt, gst_type, state_code, aadhar_no, due_days, credit_limit, opening_balance, balance_type, tds_applicable, tds_rate, tds_section, msme_type, msme_reg_no, notes)
- VAParty enriched: +19 columns (contact_person, phone_alt, email, address, state, pin_code, gst_type, state_code, pan_no, aadhar_no, due_days, credit_limit, opening_balance, balance_type, tds_applicable, tds_rate, tds_section, msme_type, msme_reg_no, notes)
- `Order.customer_id` FK (RESTRICT ondelete) + nested customer in response + selectinload
- PartyMastersPage.jsx (NEW): 3 tabs (Suppliers, VA Parties, Customers), 8-section forms, full CRUD
- Sidebar: "Suppliers" → "Party Masters" at `/parties`
- MastersPage: removed VA Parties tab (4 tabs remain: PT, Color, Fabric, VA Types)
- Routes: `/suppliers` → `/parties` (PartyMastersPage)
- `api/customers.js`: CRUD API module
- Migration `2f1ec3b945c7`
- Planning doc: `MASTERS_AND_FY_PLAN.md` (Phases 1-4: Party Masters, Ledger, SKU Enrichment, FY)

**Commits:** `f2ef490`, `d07c797` | All deployed to prod

**TODO (next session):**
- [ ] Phase 1b: TDS/TCS fields in party form UI (already in DB, enhance form sections)
- [ ] Phase 1c: OrdersPage customer_id dropdown picker + QuickMasterModal customer config
- [ ] Update API_REFERENCE.md with Customer endpoints, enriched Supplier/VAParty schemas, Order changes
- [ ] Phase 2: Ledger system (LedgerEntry model, auto-entries, payment recording, ledger view)
- [ ] Phase 3: SKU enrichment (hsn_code, gst_percent, mrp, sale_rate)
- [ ] Phase 4: Financial Year (Company model, FY model, closing/opening, counter prefix)

---

## Previous State (Session 72 — 2026-03-15)

### S72: Production Hotfixes — 3 Bugs Fixed on Live

**Bug 1: Bulk Receive 500 — Decimal+float TypeError (JC-001)**
- `POST /job-challans/{id}/receive` crashed with `unsupported operand type(s) for +: 'decimal.Decimal' and 'float'`
- PostgreSQL returns `Decimal` for numeric columns; code mixed `Decimal + float`
- Fix: `float(roll.remaining_weight or 0)` and `float(roll.current_weight or 0)` in `job_challan_service.py`
- Browser showed CORS error (500 crashes bypass CORS middleware headers)
- 1 roll (MEHDI/14-01) test-received during diagnosis; 13 remaining received by user

**Bug 2: Lot "Move to Distributed" — No Batches Created (LOT-0001)**
- Status flow buttons included "Move to Distributed" which just PATCHed status without creating batches
- User clicked that instead of "Distribute (18 Batches)" button (which calls `POST /lots/{id}/distribute`)
- Fix: Filtered `distributed` out of status transition buttons — now only reachable via Distribute button
- Reset LOT-0001 back to `cutting` via direct DB update so user could re-distribute properly

**Bug 3: Batch GET 500 — MissingGreenlet after VA Send**
- `_to_response()` accesses `challan.va_party` but 3 of 4 query paths missing `.selectinload(BatchChallan.va_party)`
- Same class of bug as S70 (selectinload regression trap)
- Fix: Added `.selectinload(BatchChallan.va_party)` to `get_batches_for_tailor`, `get_batch_by_code`, `_get_or_404`

**Commits:** `96676b9`, `662395f`, `3aa7827` | All deployed to prod

**TODO (next session):**
- ~~S68 TODOs: obsolete — prod DB wiped in S73, GST deployed~~
- [ ] Monitor lot distribution + batch VA flow end-to-end

---

## Previous State (Session 71 — 2026-03-15)

### S71: Bulk Receive Endpoint + Partial Challan Status + ChallansPage

**Bulk Receive Endpoint (kills 62-call latency bomb):**
- `POST /job-challans/{id}/receive` — single transaction bulk receive
- Replicates `roll_service.receive_from_processing()` per-roll logic (weight math, multi-VA status check) but atomic
- Supports partial receive: unchecked rolls stay `sent`, challan → `partially_received`
- Frontend `handleBulkReceive` now sends 1 API call instead of N sequential calls
- Legacy fallback for rolls without challan ID (old single sends)

**Challan 3-State Machine (both JC + BC):**
- `sent → partially_received → received`
- JobChallan model: added `status` (String, default='sent', indexed) + `received_date` (Date, nullable)
- BatchChallan: added `partially_received` to existing receive logic (was binary sent/received)
- Alembic migration `a1b2c3d4e5f6` — applied on both SQLite + PostgreSQL

**ChallansPage (new — `/challans`):**
- Table list view with columns: Challan No, VA Party, VA Type, Rolls/Pieces, Weight/Cost, Sent Date, Status, Days Out, Actions
- Two tabs: Job Challans (Rolls) + Batch Challans (Garments)
- KPI row: Total, Sent, Partial, Received, Rolls/Pieces
- Filters: status, VA type, VA party + search
- Click row → detail overlay with roll/batch item table + notes
- Print icon → fetches full detail then opens print overlay
- Sidebar: Challans entry in Production section (between Batches and SKUs)

**Print Component Refactor (single source of truth):**
- `JobChallan.jsx` + `BatchChallan.jsx` now accept single `challan` prop (raw API response)
- All 6 call sites (RollsPage x2, BatchesPage x2, ChallansPage, SendForVAModal) pass API response directly
- Deleted all manual field remapping code (-56 lines net)
- Change print layout once → works everywhere

**Data Fixes:**
- JC-002: backfilled `status='received'`, `received_date='2026-03-15'` (was stuck at 'sent' from S70 old receive)
- Local SQLite DB: recreated fresh (S69 batch_alter_table had silently failed on old DB)
- Production PostgreSQL: verified clean — all S69/S71 migrations applied correctly

**API_REFERENCE.md Updated:**
- JobChallan response: `status` + `received_date` fields
- NEW: `POST /job-challans/{id}/receive` fully documented
- `partially_received` on both JC + BC
- Appendix B: `remnant` (Roll), Job Challan row, `partially_received`
- Appendix C: `va_party` + expanded `value_addition` coverage

**JC-001 Audit (14 rolls):** All clear — all logs have job_challan_id, weight_before, va_party_id, status=sent. Safe to receive via new bulk endpoint.

**Deployed:** All changes live on prod. Commits: `06ba550`, `c7b2846`, `83e386c`, `b7bfe1d`, `b1fbbad`

**TODO (next session):**
- [ ] Monitor JC-001 receive via new bulk endpoint (user will test)
- [ ] Check EC2 logs for any errors after receive
- ~~S68 TODOs: obsolete — prod DB wiped in S73, GST deployed~~

---

## Previous State (Session 70 — 2026-03-15)

### S70: VA Receive Hotfix — MissingGreenlet + Pagination

**Bug 1:** MissingGreenlet crash — 5 missing selectinloads in roll_service.py
**Bug 2:** Pagination — page_size=20 silently dropped data, fixed with page_size=0
**Deployed:** JC-002 (62 rolls) fully received. Commits: `b2e1917`, `a0fd022`, `446b9e3`

---

## Previous State (Session 69 — 2026-03-12)

### S69: VA Party Master + FK Wiring + Challan Edit + Migration Cleanup

**VA Party Master (26th model — full stack):**
- `backend/app/models/va_party.py`: name, phone, city, gst_no, hsn_code, is_active
- Schema: Create/Update/Response in `master.py`
- Service: CRUD in `master_service.py`
- Routes: GET/GET-all/POST/PATCH in `masters.py`
- Frontend: MastersPage "VA Parties" tab, QuickMasterModal config, `masters.js` API

**VA Party FK — replaces free-text vendor_name/processor_name:**
- Models: `job_challan.py`, `batch_challan.py`, `roll.py` (RollProcessing) — `va_party_id` FK + relationship
- Schemas: All Create/Update/Response/Filter schemas updated
- Services: `job_challan_service`, `batch_challan_service`, `roll_service`, `batch_service` — selectinload, nested `va_party` object in responses
- Frontend (8 files): RollsPage, BatchesPage, BatchDetailPage, ScanPage, SendForVAModal, ReceiveFromVAModal, JobChallan print, BatchChallan print

**Challan Edit (new):**
- `PATCH /job-challans/{id}` — updates va_party_id, value_addition_id, sent_date, notes + cascades to linked processing logs
- `PATCH /batch-challans/{id}` — updates va_party_id, value_addition_id, notes

**Shift+M QuickMaster fix:**
- `useQuickMaster.js`: Now searches parent modal/form container for `[data-master]` when focused element doesn't have it
- Fixes "M" being typed in text inputs when pressing Shift+M

**Tab rename:** "Value Additions" → "VA Types" (prevents users entering party names as VA types)

**Migration cleanup:** Nuked 5 old migrations, created baseline `e86e3462e90c` + `9f88c9ee7c04` (va_party_id FK on challans)

**Production:** VA test data deleted, wrong VA types cleaned, 11 proper VA types re-seeded

**Deployed:** Yes — migration applied, backend restarted

---

## Previous State (Session 68 — 2026-03-12)

### S68: Stock-In UX Fixes + SupplierInvoice Table + GST

**Keyboard Fixes (CapsLock-safe):**
- `useQuickMaster.js`: Shift+M now case-insensitive (`e.key.toLowerCase() === 'm'`)
- `RollsPage.jsx`: Ctrl+S save now case-insensitive
- Color select: Enter opens dropdown naturally (was hijacked for new design group)
- New shortcut: `Shift+G` on color select → new design group
- New shortcut: `Delete` on color select → remove row (with confirmation if has data)

**Delete Flow Fix (stale closure bug):**
- `removeWeight()`: rollId lookup moved inside updater function (was reading stale `designGroups`)
- `removeColorRow()`: same fix — reads from fresh updater state `(g) => {...}`
- `trimEmptyWeight()`: now tracks `removedRollIds` in edit mode (was silently dropping)
- `pendingDeleteRow` state: red highlight → Yes/Esc confirmation for rows with data

**SupplierInvoice Table (new — 25th model):**
- `backend/app/models/supplier_invoice.py`: id, supplier_id, invoice_no, challan_no, invoice_date, sr_no, gst_percent, received_by, received_at, notes
- `Roll.supplier_invoice_id` FK (nullable) — old rolls keep working
- `stock_in_bulk()`: creates SupplierInvoice first, links rolls via FK
- `get_supplier_invoices()`: response now includes `gst_percent`, `gst_amount`, `total_with_gst`, `supplier_invoice_id`
- `_to_response()`: includes `gst_percent`, `supplier_invoice_id` from linked SupplierInvoice
- All `selectinload(Roll.supplier_invoice)` added to every Roll query
- Alembic migration: `63ca51d7966a` (batch_alter_table for SQLite compat)

**Frontend GST:**
- GST% `<select>` dropdown (0/5/12/18/28%) inline in header row (7-col grid)
- Sr. No. moved to first column (tabIndex=-1, auto-focus stays on Supplier)
- `challanTotals`: computes `gstAmount`, `totalWithGst`
- Sticky bar + bottom summary: Subtotal / GST / Total
- Invoice detail modal: GST in header line + KPI badge + list table
- Edit mode: `updateSupplierInvoice()` PATCH saves GST on SupplierInvoice record
- `PATCH /rolls/supplier-invoices/{id}` — new endpoint for invoice-level updates
- Keyboard hints bar: Enter/Backspace/Shift+G/Shift+M/Delete/Ctrl+S

**NOT deployed yet.** Migration `63ca51d7966a` applied locally only.

**TODO (next session):**
- ~~Data migration script: obsolete — prod DB wiped in S73~~
- [ ] Update `API_REFERENCE.md` + `mock.js`
- [ ] Test full CRUD cycle (create/edit/delete with GST)
- [ ] Deploy to prod (migration + restart)

---

## Previous State (Session 67 — 2026-03-06)

### S67: VA Diamond Timeline + Mobile UX Glow-up + Notification Fix

**Desktop BatchDetailPage — VA Diamond Timeline:**
- `timelineNodes[]` interleaves 7 STEPS with VA processing logs (in_progress + post_qc phases)
- VA diamonds (w-5 h-5 rotate-45) between steps: amber pulsing (sent), green check (received)
- Hover tooltip: VA name, processor, challan, pieces, dates, cost, status
- Dynamic grid columns, center-to-center connecting lines

**Mobile MyWorkPage (Tailor) — Glow-up:**
- Backend: enriched `get_batches_for_tailor` with size, lot, color_breakdown, pending_va, timestamps
- Frontend: personalized greeting, gradient KPI cards, grouped sections (Stitching/Ready/Awaiting QC), richer cards with color chips + VA alert pill + days-since badge, refresh button

**Mobile QCQueuePage (Checker) — Glow-up:**
- Backend: added `started_at` to pending checks
- Frontend: personalized greeting, 3 KPI cards (Pending/Checked Today/Pieces), submitted-ago + stitch-duration badges, color dots, view-batch link, checked-today counter

**NotificationBell — Mobile Clipping Fix:**
- `fixed right-2 left-2 top-14` on mobile, `sm:absolute sm:right-0 sm:w-80` on desktop

**Commits:** `36ebc27` | Pushed → Vercel + EC2 deployed

---

## Previous State (Session 66 — 2026-03-06)

### S66: QC UX Overhaul + Remnant Roll Status + Bulk VA Receive + Invoice Tab Fix

**QC UX (QCQueuePage + ScanPage):**
- "All Pass" button: builds `color_qc` from `color_breakdown` with all approved
- "Mark Rejects" mode: reject-only (mark damaged colors, rest auto-approved)
- Legacy flat fallback for batches without color_breakdown
- SKU auto-gen on pack now works (was broken — `color_qc` never sent before)

**Bulk VA Receive by Job Challan (RollsPage):**
- In Processing tab: grouped by `job_challan_id` with challan_no, roll chips, days-out badges
- Bulk Receive overlay: shared date, per-roll weight/cost, checkbox for partial receive

**Invoice Tab Fix (RollsPage):**
- Bulk send from Invoice tab now works — dedicated `bulkSendRolls` state instead of reading from Rolls tab selection

**Remnant Roll Status (full stack):**
- Backend: `remnant` added to Roll CHECK constraint + Alembic migration (`s66_remnant_status`)
- `lot_service.py`: auto-marks rolls as `remnant` when waste < palla weight after lot creation
- `job_challan_service.py`: allows `remnant` rolls for VA send
- `roll_service.py`: allows `remnant` for single VA send
- Frontend StatusBadge/ScanPage: amber `remnant` style
- **RollsPage Remnant pill**: weight-based threshold (default 5 kg, adjustable input) — uses `max_remaining_weight` backend param instead of `status=remnant`
- **LotsPage roll picker**: hides rolls below palla weight from All/Fresh/Processed; Remnant tab shows only sub-palla-weight rolls with REM badge; purple border for VA-processed rolls

**Production DB cleanup:** Deleted all transactional data, kept masters/users/roles/suppliers. Assigned `color_no` to all colors.

**Commits:** `731eb82`, `ff4b6b2`, `8fca444`, `9e8707e` | Pushed → Vercel + EC2 deployed

---

## Previous State (Session 65 — 2026-03-06)

### S65: Login UX — Password Eye Toggle + CapsLock Warning

- Password show/hide eye icon, CapsLock warning, meta tag fix

**Commits:** `06d7743`, `4bff892`

---

## Previous State (Session 64 — 2026-03-06)

### S64: Phase 4 Production Readiness — ALL 9 Fixes Deployed

**Backend audit COMPLETE.** 4 phases, 59 findings, 58 fixed, 1 deferred (rate limiting).
Full details: `Guardian/BACKEND_AUDIT_PLAN.md` ✅ COMPLETED

---

## Previous Sessions (S59–S63) — Backend Audit Sprint

- **S63:** Phase 3 Data Flow — 9 fixes (FOR UPDATE race protection, remaining_weight CHECK, lot state machine, code generator locking)
- **S62:** Phase 2 Query Optimization — 14 fixes (N+1 elimination, GROUP BY, batch fetches, ~50% fewer DB round-trips)
- **S61:** Phase 1 DB Structure — 26 fixes (indexes, CHECK constraints, ondelete rules) + deployed to prod
- **S60:** Bulk stock-in + supplier invoices endpoints + mock vs real audit (zero mismatches) + Phase 1 audit
- **S59:** Stock-in bug blitz — 7 bugs fixed (page_size override root cause, NaN weight, orphan rolls) + compact ERP UI

---

## Previous State (Session 58 — 2026-03-05)

### S58: Quick Master (Shift+M) — Inline Master Create from Any Form

- `useQuickMaster` hook + `QuickMasterModal` component
- Integrated in: RollsPage, LotsPage, SendForVAModal
- Protocol 8 added to guardian.md

---

## Previous State (Session 56 — 2026-03-04)

### S56: C4+C7 — AWS Backend LIVE + Production CORS

**Full stack now in production.**

- **C7 CORS:** Removed `trycloudflare.com` regex (security), added `https://inventory.drsblouse.com`
- **C4 EC2:** `t3.micro` (free tier), Ubuntu 22.04, Elastic IP `43.204.66.254`
  - SSH: `ssh -i drs-inventory-key.pem ubuntu@43.204.66.254`
  - Key file: `C:\Users\HP\drs-inventory-key.pem`
  - Gunicorn: 2 UvicornWorkers, systemd managed (`sudo systemctl restart fastapi`)
  - Nginx: reverse proxy + SSE support (`proxy_buffering off`)
  - SSL: Let's Encrypt, auto-renews, expires 2026-06-01
- **C4 RDS:** `db.t3.micro` PostgreSQL 16.6, encrypted, EC2-only access
  - Endpoint: `[see EC2 .env]`
  - DB: `drs_inventory`, User: `postgres`, Pass: `[see EC2 .env]`
  - 24 tables, seeded: 5 roles, 5 users, 5 product types, 30 colors, 10 VAs
- **Fix:** `Base.created_at` → `DateTime(timezone=True)` for asyncpg compatibility
- **Fix:** Mobile login failure — password `autoCapitalize="off"` on LoginPage
- **Fix:** Service worker 5s timeout → changed `/api/` from `NetworkFirst(5s)` to `NetworkOnly`
- **DNS:** GoDaddy A record `api-inventory` → `43.204.66.254` (propagated)
- **IAM:** User `Nitish` with EC2/RDS/VPC FullAccess + Vercel policy
- **Repo:** Made public for EC2 git clone

---

## Previous State (Session 55 — 2026-03-04)

### S55: C5 Vercel Frontend Deploy — LIVE

- CLAUDE.md optimized: 44K → 12K chars (72% reduction)
- Vercel project `inventory-os` created (same account as `fashion-ecommerce`/`drsblouse.com`)
- Env vars: `VITE_API_URL=https://api-inventory.drsblouse.com/api/v1`, `VITE_USE_MOCK=false`
- GoDaddy CNAME: `inventory` → `cname.vercel-dns.com`
- **https://inventory.drsblouse.com** — LIVE, SSL active, login page rendering
- Auto-deploy on push to `main` (Vercel built-in)
- Vercel CLI authenticated for future domain/project management

---

## Previous State (Session 54 — 2026-03-03)

### S54: Batch VA Tracking — "Out for VA" Tab + Challan Print

**Zero backend changes.** All data from existing endpoints.

- **BatchChallan.jsx (New):** A4 print component mirroring `JobChallan.jsx` — title "BATCH CHALLAN", CSS prefix `bc-`, columns: # / Batch Code / Size / Pieces / Phase
- **SendForVAModal.jsx:** +`onPrintChallan` prop — auto-opens print overlay after successful `createBatchChallan()`
- **BatchesPage.jsx "Out for VA" tab:**
  - Permission-gated (`canSendVA || canReceiveVA`), amber active state
  - VA color map: 10 entries (EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal, HST=orange, BTN=indigo, LCW=lime, FIN=gray)
  - State: `batchChallansData`, `bcLoading`, `bcVAFilter`, `bcProcessorFilter`, `bcSearch`, `showBatchChallan`, `batchChallanData`
  - Fetch: `getBatchChallans({ status: 'sent', page_size: 200 })` on tab switch
  - 4 KPIs: Challans Out / Total Pieces / Processors / Overdue >14d
  - Filter bar: VA Type + Processor + Search + Clear
  - 3-col challan cards with Print + Receive buttons, days-out badges
  - Print chaining: SendForVAModal → auto-opens BatchChallan after send
  - `visibleTabs` via `useMemo` (TABS + conditional VA tab)
- **Batch Passport:** Already complete (ScanPage lines 381-434)

**Files:** 1 created (BatchChallan.jsx), 2 modified (SendForVAModal.jsx, BatchesPage.jsx). **Build: 0 errors.**

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

### Lot System
- Statuses: open → cutting → distributed (forward-only)
- Fields: `standard_palla_weight`, `standard_palla_meter`, `default_size_pattern` (JSON)
- `POST /lots/{id}/distribute` auto-creates batches from size pattern. `sku_id` nullable on batches
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header

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
- **Typography:** Inter font (400-800), `.typo-label`/`.typo-data` CSS classes, DataTable `<th>` text-gray-600
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

### Multi-Company + Auth (S76)
- **Schema-per-tenant:** 4 public tables (companies, users, roles, user_companies) + 28 tenant tables per company
- **`SET search_path TO co_{slug}, public`** per request via TenantMiddleware + `get_db(request: Request)`
- **HttpOnly cookie JWT:** access_token (path=/), refresh_token (path=/api/v1/auth), SameSite=None in prod
- **No localStorage for auth:** `/auth/me` is single source of truth on page load
- **Company creation:** schema provisioning + master inheritance (selective: colors/fabrics/PTs/VAs/suppliers/customers/VA parties)
- **FY closing:** snapshot balances → close old FY → create new FY → opening ledger entries (atomic, single transaction)
- **Login flow:** 1 company → auto-select | N companies → picker | 0 → settings redirect
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
| S76 | Multi-Company + Auth + FY Closing | Schema-per-tenant (4 public + 28 tenant), HttpOnly cookie JWT (replaces localStorage), company picker/switcher, master inheritance, FY closing with balance carry-forward, 6 production blockers fixed |
| S75 | Party Detail UI + API Docs | Full-page detail overlay (3-col cards, KPI strip, gradient header), API_REFERENCE.md updated (§18 Customers, §19 Ledger, §20 Company/FY, enriched Suppliers/VA/SKU/Orders). Counter prefix dropped (client: not needed) |
| S74 | MASTERS_AND_FY_PLAN COMPLETE | 1b: GST→state, TDS/TCS dropdowns, modal UX. 1c: customer picker+Shift+M. P2: Ledger (28th model, auto-entries, LedgerPanel, payments). P3: SKU enrichment (5 cols). P4: Company (29th)+FY (30th), fy_id FK on 5 tables, SettingsPage |
| S73 | Color FK + DB Wipe + Party Masters | color_id FK on rolls+SKUs, editable color code, prod DB wiped for fresh start, Customer model (27th), enriched Supplier+VAParty (+TDS/MSME/credit), PartyMastersPage (3 tabs), Order.customer_id FK, MASTERS_AND_FY_PLAN.md |
| S72 | Production Hotfixes x3 | Decimal+float TypeError in bulk receive, "Move to Distributed" without batches, MissingGreenlet on batch GET after VA send |
| S71 | Bulk Receive + ChallansPage | POST /job-challans/{id}/receive (1 call vs 62), 3-state challan (sent/partial/received), ChallansPage table list, print refactor (single `challan` prop), API_REFERENCE updated |
| S70 | VA Receive Hotfix | MissingGreenlet crash (5 missing selectinloads), pagination fix (page_size=0 = no limit), JC-002 fully received |
| S69 | VA Party Master + FK Wiring | 26th model, va_party_id FK replaces vendor_name/processor_name on 3 tables, PATCH challan endpoints, migration cleanup, Shift+M fix |

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
├── backend/app/        ← FastAPI (models/32, schemas/21, services/19, api/18, core/, tasks/)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
