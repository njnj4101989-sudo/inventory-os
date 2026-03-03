# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

---

## Document Directory

| Document | Purpose | When to Read |
|----------|---------|-------------|
| `CLAUDE.md` | Session log, project state, architecture | Every session start |
| `guardian.md` | Protocols, rules, coding standards | Before any coding |
| `API_REFERENCE.md` | **THE** source of truth for API shapes | Before any frontend↔backend work |
| `STEP1_SYSTEM_OVERVIEW.md` | Role matrix, production flow | Architecture decisions |
| `STEP2_DATA_MODEL.md` | 24 tables, columns, types, FKs | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, 7-state batch machine | Business logic |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning |
| `AWS_DEPLOYMENT.md` | Hybrid deploy plan (Vercel + EC2 + RDS) | Deployment day |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `STEP3 §3.4` | Deploy → `AWS_DEPLOYMENT.md`

---

## Current State (Session 50 — 2026-03-03)

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → test at http://localhost:5173
3. **Production (planned):** `https://inventory.drsblouse.com` (Vercel) + `https://api-inventory.drsblouse.com` (AWS EC2)
4. Login as `admin` → `/dashboard` | `tailor1` → `/my-work` | `checker1` → `/qc-queue`

### S50: KPI Card Typography + Dashboard Grid + Sidebar Sections

**S50 (Part A — Global KPI Card Text Uplift):**
- 8 pages updated: Dashboard, Batches, Orders, Invoices, SKUs, Lots, Rolls, MyWork
- Labels: `text-xs font-medium` / `opacity-75` → `text-[11px] font-semibold uppercase tracking-wide` + explicit colors
- Dashboard pipeline: split color map (`bg` + `accent` for value + `muted` for label) — values now `-800`, labels `-600`
- Orders/Invoices gradient cards: `opacity-80/70` → `text-white/85` / `text-white/75`
- SKUsPage: `opacity-75` removed, `text-lg` → `text-xl`
- LotsPage: 12 stat labels → `.typo-label` class (existing global CSS)
- RollsPage processed tab: 4 labels upgraded
- MyWorkPage: added `tabular-nums` + upgraded labels

**S50 (Part B — Dashboard 4+4 Grid):**
- Added **Active Lots** card (4th in row 2): `summary.lots.total`, subtitle `X open, Y distributed`, cyan icon
- Second row grid: `sm:grid-cols-3` → `sm:grid-cols-2 lg:grid-cols-4` — matches row 1
- Data from existing `summary.lots` object (both mock + real backend already return it)

**S50 (Part C — Sidebar Rearrange with Sections):**
- Reordered by business function: Commerce → Production → Setup
- **Commerce** (top): Orders, Invoices, Inventory, Reports — admin's daily workflow
- **Production** (middle): Rolls → Lots → Batches → SKUs — pipeline left-to-right
- **Setup** (bottom): Suppliers, Masters, Users & Roles — configure once
- Section labels: `text-[10px] font-semibold uppercase tracking-widest text-gray-500`, auto-hide when collapsed
- Compact fit: nav links `py-2.5→py-1.5`, section headers `pt-4→pt-2.5`, gaps `space-y-1→space-y-0.5`, footer `py-3→py-2`
- All 12 admin items + 3 section labels fit in single viewport without scrollbar

**Build: 0 errors. Commit: `ed2cdf8`**

---

### NEXT: S51 — Invoice-to-Lot Shortcut (Options A+B+C)

**Goal:** Bridge the gap between stock-in and lot creation. Currently after stock-in, user must navigate to LotsPage and manually find rolls from the picker. Three features planned:

**Option A — "Create Lot from Invoice" button in Invoice Detail:**
- In RollsPage → Invoices tab → click invoice row → Invoice Detail view
- Add "Create Lot from Invoice" button
- Pre-selects ALL rolls from that invoice
- Navigates to LotsPage with rolls pre-loaded via `navigate('/lots', { state: { preselectedRolls } })`

**Option B — Tick marks in Invoice Detail (selective):**
- Add checkboxes next to each roll in Invoice Detail table
- Select specific rolls → sticky action bar appears: "Create Lot (N)" + "Send for Processing (N)"
- Only `in_stock` rolls with `remaining_weight > 0` are selectable
- Navigate to LotsPage with ticked rolls only
- Pre-fillable from invoice context: `fabric_type` → product_type hint, date → lot_date

**Option C — "Create Lot" in All Rolls tab bulk action bar:**
- Existing checkbox selection already works on All Rolls tab (currently: Print Labels + Send for Processing)
- Add "Create Lot" button to the sticky bulk action bar
- Same navigation pattern: `navigate('/lots', { state: { preselectedRolls } })`

**LotsPage receiver (shared by all 3 options):**
- Detect `location.state.preselectedRolls` in LotsPage
- Auto-open create overlay → pre-populate `form.rolls` with selected rolls
- Auto-fill `lot_date` from invoice date if available
- User fills remaining: design_no, palla_weight, size_pattern → save

**Zero backend changes needed.** All data already exists.

**Implementation order:** Option C first (smallest — add 1 button to existing bar) → Option B (checkboxes in invoice detail) → Option A (convenience button) → LotsPage receiver (shared)

**Key files to modify:**
- `frontend/src/pages/RollsPage.jsx` — Invoice Detail (options A+B), All Rolls bulk bar (option C)
- `frontend/src/pages/LotsPage.jsx` — Receive `location.state.preselectedRolls`, auto-open + pre-fill

**Key data flow:** `roll.id` + `roll` object → passed via React Router state → LotsPage reads it → maps to `form.rolls[]` entries with `roll_id` + auto-fetched roll data for calculations

---

### S49: Order Create Picker Redesign + Typography WOW Factor

**S49 (Part A — Order Create Picker):**
- Replaced "all-grids-expanded" create overlay with **LotPage-style picker pattern**
- Design Picker: 3-4 col compact cards (max-h-64, scrollable) — shows design code, color/size counts, stock level, base price, VA badges
- Click card → adds design to "Selected Designs" area below → shows color×size qty grid
- Already-selected designs dimmed with "Added" badge in picker
- Remove (X) button per selected design → clears associated qty data
- Empty state: dashed border "Click a design card above" prompt
- Footer upgraded: shows design count + item count + grand total
- New state: `selectedDesigns` (Set) + `pickerGroups` + `selectedGroups` memos
- Removed unused `filteredGroups` memo

**S49 (Part B — Typography WOW Factor):**
- **Global CSS (`index.css`):**
  - Google Fonts: added weight `300` (light)
  - `html` base: `text-gray-800` (darker body text)
  - `.typo-th`: added `text-gray-600` (was unstyled color)
  - New `.typo-label`: `text-[11px] font-semibold uppercase tracking-wide text-gray-500`
  - New `.typo-data`: `text-[13px] font-medium text-gray-700`
- **DataTable.jsx (global fix):** `<th>` color `text-gray-500` → `text-gray-600`, hover `text-gray-700` → `text-gray-800` — ALL pages' table headers upgraded automatically
- **Per-page typography fixes:**
  - Zero `text-[9px]` remaining (was 13 occurrences across 2 files)
  - Labels: `text-gray-400 font-semibold` → `text-gray-500 font-semibold` (RollsPage, SuppliersPage, LotsPage, SKUsPage, BatchDetailPage, InvoicesPage, OrdersPage)
  - Label size: `text-[10px]` → `text-[11px]` (LotsPage 15 labels, SKUsPage 2, InvoicesPage KPI+headers)
  - KPI card labels: `text-[10px]` → `text-[11px]` (OrdersPage, InvoicesPage)
  - Detail table headers: `text-[10px]` → `text-[11px]` + `font-semibold` + `text-gray-600` (OrdersPage, InvoicesPage)

**S49 (Keyboard System — Order Create Overlay):**
- **Ctrl+S** — save order from anywhere in overlay (global `keydown` listener, gated on `!saving`)
- **Escape** — safe close with dirty check. Clean form = instant close. Dirty form = centered confirmation dialog ("Discard this order? X items across Y designs") with **Keep Editing** (autoFocus, safe default) and Discard buttons
- **Auto-focus** — Name field focused on overlay open via `nameRef` (100ms after SKU load)
- **Enter through customer fields** — Name → Phone → Address → Source → Notes → Design Search. Uses `data-customer-field` attrs + `handleCustomerKeyDown` with `querySelector`
- **Grid cell navigation** — `Enter/Tab` on qty cell advances right across sizes, wraps to next color row's first cell. Uses `data-grid-row`/`data-grid-col` + `data-qty` attrs. At end of grid → focuses price input. `Shift+Tab` natural backward via browser default
- **Price input Enter** — focuses first qty cell in same design's grid via `data-design-block` + `data-qty` query
- **Delete key** — press Delete on any qty cell → inline confirmation bar in design header (red: "Remove BLS-101 (12 items)?" [Remove] [Keep]). Keep button autoFocused. Escape dismisses confirmation without closing overlay
- **tabIndex optimization** — X button: `tabIndex={-1}` (mouse-only, Tab skips). Price input: `tabIndex={-1}` (clickable but Tab skips). Zero wasted Tab stops
- **Cross-design Tab flow** — last cell of design grid → first `[data-qty]` of next `[data-design-block]` → last design ends at Create button. Uses DOM-ordered `querySelectorAll('[data-qty]')` (handles gaps from missing SKUs)
- **Cancel buttons** (header + footer) both use `requestClose()` which respects dirty state
- **Keyboard hint strip** — footer bar: `Enter` Next cell | `Delete` Remove design | `Ctrl+S` Save | `Esc` Close (hidden on mobile via `hidden md:flex`)
- **Dirty detection** — `isDirty` computed from customerForm (name/phone/address/notes trimmed), selectedDesigns.size, gridQty values
- **Layered Escape** — Delete confirmation → Discard confirmation → close (innermost dismissed first)
- **No band-aids:** GridCell component accepts `onKeyDown` + `data-grid-row/col` as first-class props, not patched after the fact
- **TDZ fix:** `confirmDeleteDesign`/`cancelDeleteDesign` useCallback declarations placed BEFORE the useEffect that references them (avoids temporal dead zone crash)

**Build: 0 errors.**

### Orders + Invoices Wholesale Overhaul — S48 (ERP compaction in progress)

**S48 (Backend):**
- `SKUBrief` extended: +`color`, +`size`, +`base_price` — auto-flows to OrderItemResponse.sku and InvoiceItemResponse.sku
- `OrderFilterParams(PaginatedParams)`: +`status`, +`source`, +`search` (ilike on order_number + customer_name)
- `InvoiceFilterParams(PaginatedParams)`: +`status`, +`search` (ilike on invoice_number + customer_name via JOIN to Order)
- `GET /orders/{id}` — single-fetch route (placed before /{id}/ship)
- `GET /invoices/{id}` — single-fetch route (placed before /{id}/pay)
- `order_service.create_order()` — stock check via `InventoryState.available_qty` → raises `InsufficientStockError`
- `order_service._to_response()` — extended sku dict (+color, +size, +base_price)
- `invoice_service._to_response()` — extended sku dict (+color, +size, +base_price), extended order dict (+customer_phone, +customer_address)
- `OrderResponse` schema: +`customer_address`, +`notes`

**S48 (Frontend):**
- `orders.js`: +`getOrder(id)`, fixed mock `createOrder()` to look up real SKU from `skus[]` instead of dummy `sku_code: 'XXX'`
- `invoices.js`: +`getInvoice(id)`, +`search` filter support in mock `getInvoices()`
- Mock data enriched: orders (+customer_address, +notes, +color/size/base_price in sku), invoices (+id/phone/address in order, +notes, +created_at, +color/size/base_price in sku)
- **OrdersPage full rewrite:**
  - KPI strip: Total Orders / Pending / Processing / Shipped Today / Revenue
  - Tab pills: All / Pending / Processing / Shipped / Cancelled / Returned
  - Source filter dropdown + search bar
  - Detail overlay (full-page z-50): customer info cards, items table with SKUCodeDisplay + color dots, grand total, Ship/Cancel actions
  - **Create overlay (design-grid entry):** Customer section → design search → grouped cards per `{type}-{design}` → colors as rows × sizes as columns → qty inputs with stock availability → price per design → sticky footer with totals
  - Replaced old modal + OrderForm.jsx (one-by-one SKU adding)
- **InvoicesPage full rewrite:**
  - KPI strip: Total Invoices / Unpaid (count + amount) / Paid (count + amount) / Revenue
  - Tab pills: All / Unpaid / Paid + search bar
  - Detail overlay (full-page z-50): Bill To card, invoice info, line items with SKUCodeDisplay + color dots, CGST/SGST breakdown, Mark Paid action
  - **Print overlay** (A4 react-to-print): TAX INVOICE header, Bill To, line items table, CGST 9% + SGST 9% + discount → Grand Total, payment status box, signature line — ALL inline styles for print compatibility
- `OrderForm.jsx` deleted (no longer imported)

**S48 (Docs):**
- API_REFERENCE §10: +GET /orders/{id}, OrderFilterParams, extended sku dict, stock validation note, customer_address + notes in POST
- API_REFERENCE §11: +GET /invoices/{id}, InvoiceFilterParams, extended order dict (+phone, +address), extended sku dict

**ERP Compaction (dense padding) — COMPLETE:**
- OrdersPage: ✅ DONE — KPICard p-2.5, detail overlay p-4/space-y-3, info cards p-2, table cells px-2 py-1.5 text-xs, grid cells w-14 text-xs py-0.5, create overlay inputs px-2 py-1 text-xs, design headers px-3 py-1.5, footer px-4 py-2
- InvoicesPage: ✅ DONE — KPICard p-2.5, detail overlay p-4/space-y-3, info cards p-2, table cells px-2 py-1.5 text-xs, amount summary text-xs w-64, actions px-4 py-1.5 text-xs. Print overlay untouched (A4 needs full padding)

**Build: 0 errors.**

### SKU Detail Overlay + Color Master — COMPLETE (S47)

**S47 Tasks 1-3 (Complete):**
- **Task 1 — SKU VA badges:** Already done in S46 (`SKUCodeDisplay` with `VA_COLORS` map).
- **Task 2 — SKU detail overlay:** Full-page overlay (fixed z-50) on row click. Shows: SKU code with VA badges, stock KPIs (total/available/reserved + color/size/type), inline price + description editors with save, source batch cards (batch_code, status, lot info, tailor, packed_at, QC summary, VA processing pills), aggregated per-color QC breakdown table.
  - Backend: `GET /skus/{id}` with `source_batches` (batch→lot→assignments→processing_logs loaded via selectinload)
  - Frontend: `getSKU(id)` API function + mock. Detail overlay replaces edit modal on row click. Modal kept for "Manual SKU" create only.
- **Task 3 — Color master wiring:** Shared `utils/colorUtils.js` — `loadColorMap()` fetches `GET /masters/colors/all` once (lazy, cached), `colorHex(name)` uses master hex_codes first → hash fallback. Wired into SKUsPage, ScanPage, LotsPage (removed 2 duplicate COLOR_MAP/COLOR_HEX constants).

**Build: 0 errors.**

### Per-Color QC + SKU Auto-Generation — COMPLETE (S46)

**Problem solved:** When batches were packed, `sku_id` was null → `ready_stock_in` silently skipped → inventory never updated. QC only had flat approved/rejected with no per-color breakdown.

**S46 (Backend):**
- `product_type` column on Lot model (VARCHAR(10), default 'BLS')
- `color_qc` column on Batch model (JSON, nullable) — per-color QC data
- Migration `a8a7f6a87d98` (batch_alter_table for SQLite)
- `batch_service.check_batch()` — per-color mode (color_qc dict) + legacy flat mode (backward compat)
- `batch_service.pack_batch()` — auto-generates per-color SKUs via `sku_service.find_or_create()`, fires `ready_stock_in` events per color
- `sku_service.find_or_create()` — idempotent SKU creation with InventoryState
- `inventory_service.create_event()` — fixed `ready_stock_in` to actually update InventoryState (was missing from event type list)
- `inventory_service.reconcile()` — includes `ready_stock_in` in total computation
- `lot_service` + `_to_response` — passes `product_type` everywhere (create, response, LotBrief)

**S46 (Frontend):**
- ScanPage: per-color QC table (color dot + expected + approved + rejected + reason per row) with totals footer. Falls back to flat form when no color_breakdown.
- LotsPage: `product_type` dropdown (BLS/KRT/SAR/DRS/OTH) in lot creation form, passed to backend
- SKUsPage: Full overhaul → "Finished Goods" catalog with VA badges (SKUCodeDisplay), color dots, stock indicators (green/amber/red), KPI strip (Total SKUs / In Stock / Total Pieces / Auto-Generated), type + stock filters, info banner about auto-generation
- Mock data: `product_type: 'BLS'` on lots, `color_qc` on packed batch, `product_type` in batch lot briefs, 2 new VA-suffixed SKU samples

**S46 (Docs):** API_REFERENCE (BatchCheck per-color mode, lot product_type, SKU auto-gen note), STEP2 (+product_type, +color_qc columns), CLAUDE.md session log.

**Build: 0 errors.**

### Batch VA + Packing — COMPLETE (S43-S45)

All 31 tasks verified against source code. Spec file deleted — content merged into STEP2/STEP3/API_REFERENCE.

**S43 (Backend):** BatchChallan + BatchProcessing models, migration `b1c2d3e4f5a6`, batch_challan_service, batch_service rewrite (VA guards, 7-state machine, packing flow, ready_stock_in event), 4 new batch-challan endpoints, 2 new batch endpoints, 4 new garment VA seeds (HST/BTN/LCW/FIN), applicable_to on VAs.

**S44 (Frontend):** batchChallans.js API + SendForVAModal + ReceiveFromVAModal. StatusBadge 7 states. MastersPage applicable_to badges/filter/form. ScanPage VA timeline + out-house alert + Ready for Packing + Mark Packed. BatchesPage VA send/receive + KPIs. Permission system upgrade: 4 new permissions (`batch_send_va/receive_va/ready_packing/pack`), backend `require_role` → `require_permission`, frontend `userRole ===` → `perms.batch_*`.

**S45 (Testing + Docs):** Dashboard 3 out-house KPIs + 7-state pipeline + checked/packed today. Batch passport print (react-to-print). E2E audit (14 steps, no gaps). Mobile flow audit. Mock data fix (UPPERCASE→lowercase, +processing_logs, +has_pending_va). Docs updated: API_REFERENCE (permissions), STEP2 (24 tables), STEP3 (7-state + VA guards + READY_STOCK_IN). Build: 0 errors.

---

### PENDING — S51: Invoice-to-Lot Shortcut

**PHASE B2: Workflow Shortcuts (Invoice → Lot)**

| # | Task | Option | Status |
|---|------|--------|--------|
| 1 | LotsPage receiver: detect `location.state.preselectedRolls`, auto-open create overlay, pre-fill rolls | Shared | Pending |
| 2 | "Create Lot" button in All Rolls bulk action bar | C | Pending |
| 3 | Checkboxes in Invoice Detail roll table + action bar | B | Pending |
| 4 | "Create Lot from Invoice" button in Invoice Detail | A | Pending |

**Implementation order:** Task 1 (shared receiver) → Task 2 (Option C, smallest) → Task 3 (Option B) → Task 4 (Option A)

**PHASE B: Page Overhauls — ALL COMPLETE**

| # | Task | Status |
|---|------|--------|
| 1 | ~~SKU VA badges~~ | ✅ S46 |
| 2 | ~~SKU detail overlay~~ | ✅ S47 |
| 3 | ~~Color master wiring~~ | ✅ S47 |
| 4 | ~~Orders page overhaul~~ | ✅ S48 |
| 5 | ~~Invoices page overhaul~~ | ✅ S48 |
| 6 | ~~KPI card typography uplift~~ | ✅ S50 |
| 7 | ~~Dashboard 4+4 grid + Active Lots card~~ | ✅ S50 |
| 8 | ~~Sidebar rearrange with sections~~ | ✅ S50 |

**PHASE C: Deploy**

| # | Step | Guide |
|---|------|-------|
| 6 | SQLite → PostgreSQL migration code | `AWS_DEPLOYMENT.md` Step 4 |
| 7 | AWS EC2 + RDS setup | `AWS_DEPLOYMENT.md` Steps 1-3 |
| 8 | Vercel frontend deploy + GoDaddy DNS | `AWS_DEPLOYMENT.md` Steps 5-6 |
| 9 | CI/CD GitHub Actions | `AWS_DEPLOYMENT.md` Step 7 |
| 10 | CORS production config | Remove `trycloudflare.com`, add fixed domain |

**NICE-TO-HAVE (post-deploy):**

| # | Task |
|---|------|
| 11 | "Free" size support in size pattern |
| 12 | Feriwala (waste disposition) |
| 13 | Reports page enrichment |
| 14 | Thermal printer ZPL templates |

---

## Key Architecture Decisions

### Per-Color QC + SKU Auto-Gen (S46)
- **Per-color QC:** `color_qc` JSON on Batch: `{color: {expected, approved, rejected, reason}}`. Falls back to flat `approved_qty/rejected_qty` for backward compat.
- **SKU auto-generation at pack time:** `pack_batch()` reads `color_qc` → for each color with `approved > 0` → `find_or_create()` SKU with code `{product_type}-{design_no}-{color}-{size}+{VA1}+{VA2}` → fire `ready_stock_in` per color
- **`product_type` on Lot:** BLS/KRT/SAR/DRS/OTH — flows from lot → batch → SKU code. Default 'BLS'.
- **`ready_stock_in` fix:** Was listed in event creation but NOT in the `if event_type in (...)` that updates InventoryState. Now included.
- **SKUsPage overhaul:** "Finished Goods" catalog — VA badges parsed from sku_code suffix, stock indicators, KPI strip, info banner about auto-generation. Manual create is secondary.

### Batch VA + Packing (S43-S45)
- **7-state batch machine:** created → assigned → in_progress → submitted → checked → packing → packed (`completed` renamed to `checked`)
- **VA guard:** Can't submit/pack if BatchProcessing records have `status='sent'` — blocks transitions when pieces are at VA vendor
- **Garment VA:** `BatchProcessing` model (mirrors RollProcessing but tracks pieces not weight). `BatchChallan` (BC-001, BC-002...) mirrors JobChallan
- **Packing:** Light — fields on Batch (packed_by, packed_at, pack_reference). `packed` status fires `ready_stock_in` inventory event
- **Permission system:** 4 new permissions configurable from Roles page. Backend: `require_permission()`. Frontend: `perms.batch_*`
- **`applicable_to`** on value_additions: `roll` / `garment` / `both` — filters VA dropdown per pipeline

### PWA + Mobile Layout (S38)
- **Dual layout:** Tailor/Checker get `MobileLayout` (compact header + bottom tabs), Admin/Supervisor/Billing get `Layout` (sidebar)
- **Role-based routing:** `LoginPage` redirects based on `user.role`; `ProtectedRoute` falls back to role-appropriate landing
- **BottomNav:** 3 tabs — Scan / My Work (or QC Queue) / Profile
- **Offline queue:** `useOfflineQueue` hook — localStorage-persisted, auto-syncs on reconnect
- **PWA caching:** Workbox — precache static, CacheFirst fonts, NetworkFirst API (5s timeout)
- **Touch UX:** `touch-action: manipulation` (no 300ms delay), `safe-area-pb` for notched phones

### CameraScanner Architecture (S41)
- **Mobile (Chrome Android 83+):** `BarcodeDetector.detect(videoElement)` — hardware GPU/DSP, scan loop 60ms, near-instant
- **Desktop fallback:** `html5-qrcode` lazy-loaded. `qrbox: 250×250`, `fps: 15`
- **UI:** Full-viewport camera, CSS corner brackets, header/footer float via `z-20`
- **Contract:** `onScan(string)` + `onClose()`
- **CORS for dev tunnels:** `allow_origin_regex=r"https://.*\.trycloudflare\.com"` in `main.py` — **remove for production**

### Weight System (3 fields on Roll)
- `total_weight` — original supplier weight, **IMMUTABLE** after stock-in
- `current_weight` — latest weight after value additions (mutated by receive/update processing)
- `remaining_weight` — available for cutting/lots (mutated by send/receive/lot creation)
- `send_for_processing` captures `current_weight` as `weight_before` (not total_weight)

### Partial Weight Send (S30)
- `weight_before` on processing log = partial amount sent (not full roll weight)
- Roll stays `in_stock` if `remaining_weight > 0` after send
- On receive: `remaining_weight += weight_after`, `current_weight += (weight_after - weight_before)`
- `JobChallanCreate.rolls` = `list[{roll_id, weight_to_send}]` (not `list[UUID]`)

### Lot System
- Statuses: open → cutting → distributed (forward-only)
- Fields: `standard_palla_weight`, `standard_palla_meter`, `default_size_pattern` (JSON)
- Custom `LOT_STATUS_COLORS` constant (open=emerald, cutting=blue, distributed=purple)
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header

### Lot Distribution → Batch Auto-Creation (S35)
- `POST /lots/{id}/distribute` auto-creates N batches from `default_size_pattern`
- Each batch: `size`, `piece_count=total_pallas`, `qr_code_data=/scan/batch/{code}`
- Lot status → 'distributed'. `sku_id` nullable on batches (linked later for billing)
- `GET /batches/passport/{batch_code}` — public, no auth
- `POST /batches/claim/{batch_code}` — tailor role, sets status=assigned

### BatchesPage — Lot-Grouped Cards (S36, updated S44)
- Pipeline KPIs: 7 states (Created / Assigned / In Progress / Submitted / Checked / Packing / Packed)
- Smart tabs: All / Unclaimed / In Production / In Review / Done
- VA send/receive buttons (permission-gated) + out-for-VA count + ready stock count

### QR & Scan System
- **Static QR, Dynamic Passport** — QR printed once, scan shows live DB data
- `/scan/roll/:roll_code` — PUBLIC, Roll Passport (origin→VA→lot→batch→order)
- `/scan/batch/:batch_code` — PUBLIC, Batch Passport (+ VA timeline + out-house alert)
- `enhanced_roll_code` = `roll_code` + received VA short codes (computed, never stored)
- `effective_sku` = `BLS-101-Pink-M+EMB+SQN` (computed from base_sku + received VAs)
- QR sizes: 130px (print labels), 160px (screen-to-screen scan)

### Value Additions
- `RollProcessing.value_addition_id` — REQUIRED FK (process_type removed in S26)
- 10 seed VAs: EMB, DYE, DPT, HWK, SQN, BTC (roll/both) + HST, BTN, LCW, FIN (garment)
- Color map: EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal

### Job Challans (Roll VA)
- `POST /job-challans` — creates challan + sends all rolls atomically
- Auto-sequential `challan_no` (JC-001, JC-002...)
- `RollProcessing.job_challan_id` FK links logs to challans

### Typography System (S37)
- **Inter** from Google Fonts (400-800 weights)
- Tailwind `fontFamily.sans` overridden → all text classes render Inter
- Print: `'Inter', 'Segoe UI', Arial, sans-serif`
- Font swap: change index.html URL + index.css var + tailwind.config.js + 4 print pageStyle strings

### Roll Code Pattern
- `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (e.g. `1-COT-GREEN/01-01`)
- Sr. No. = internal filing serial written on physical supplier invoice

### Print Components Pattern
- All use `react-to-print` + `useReactToPrint({ contentRef })` + fixed overlay `z-50`
- A4 container, inline styles for print compatibility
- Files: `LabelSheet.jsx`, `BatchLabelSheet.jsx`, `JobChallan.jsx`, `CuttingSheet.jsx`
- Close modal before opening print overlay (both use z-50)

### Backend Response Shapes (S21)
- All FK UUIDs return nested objects: `created_by_user: {id, full_name}`, `tailor: {id, full_name}`
- Use `selectinload()` on relationships for nested objects
- Authority chain: `mock.js → API_REFERENCE.md → backend services`

### AWS Deployment Decision (S42)
- **Frontend:** Vercel (free forever) — `vercel.json` SPA rewrites + `allowedHosts` configured
- **Backend:** AWS EC2 t2.micro + Nginx + Gunicorn + FastAPI (free 12 months)
- **Database:** AWS RDS PostgreSQL db.t3.micro (free 12 months)
- **Cost:** ₹0 year 1, ~₹2,300/mo after. Cloudflare tunnel abandoned.
- **Guide:** `Guardian/AWS_DEPLOYMENT.md`

---

## QR Phase 3 — Future

- ZPL template for Zebra thermal printers
- Finished garment label with full chain QR
- Hardware: TSC TE200 thermal printer (~₹8,000)

---

## Session History (Compressed)

### Phase 6A+6B (S1-6) — Full Stack Scaffold
- Backend: 22 ORM models, Alembic, 19 schemas, 15 services, 16 routers, seeds, Dockerfile
- Frontend: Vite+React+Tailwind, 15 API modules (client+mock), 14 pages, auth, layout

### S7-14: Feature Evolution + UI Overhaul
- S7: Users & Roles, supplier invoices, SKU pattern (`ProductType-DesignNo-Color-Size`)
- S8: LOT entity, weight-based rolls (`total_weight`/`remaining_weight`)
- S9-10: UI polish, InventoryPage/ReportsPage overhauls
- S11-12: Supplier upgrade (+6 fields), Rolls 3-tab layout, roll detail modal
- S13: Challan-style stock-in (full-page overlay, keyboard-driven, design groups)
- S14: Invoice detail challan view, filter toolbars

### S15-20: Backend Implementation + Integration
- S15: All 13 services fully implemented (zero stubs)
- S16: Frontend↔Backend gap audit (7 fixes)
- S17: Master Data (ProductType, Color, Fabric) — 3 models, 12 endpoints, MastersPage
- S18: `API_REFERENCE.md` created, dashboard fixes, Protocol 6 added
- S19: `roll_service._to_response()` — 5 API shape mismatches fixed
- S20: Processed & Returned enriched table, Edit Processing Log (full-stack)

### S21-37: QR System + Lots + Batches + Print
- S22: Challan keyboard fixes, Sr. No. + Challan No., roll code pattern
- S24: QR Phase 1 — LabelSheet, QRLabel, ScanPage, CameraScanner, roll passport
- S25-26: QR Phase 2 — ValueAddition model, enhanced_roll_code, `process_type` → `value_addition_id`
- S27: `current_weight` column (3-weight system)
- S28-29: QR reprint + Job Challan model + atomic bulk send
- S30: Partial weight send for VA processing
- S31-33: Lot page redesign — cutting sheet overlay, VA-colored roll picker, lot detail overlay
- S34: Lot status filter bug fix (`LotFilterParams`)
- S35: Lot distribution → batch auto-creation + batch QR + tailor claim
- S36: BatchesPage — lot-grouped card view, pipeline KPIs, smart tabs
- S37: Global typography (Inter font + CSS vars)

### S38-42: Mobile + Deployment Prep
- S38: PWA + Mobile Tailor/Checker Workflow (13 new files, 9 modified, dual layout, offline queue)
- S39: QR scanner migration + mobile fixes (login autoCapitalize, clickable batch cards, 160px QR)
- S40: Vercel + Cloudflare deployment prep (vercel.json, allowedHosts)
- S41: Native BarcodeDetector on mobile + html5-qrcode desktop fallback + CORS wildcard + batch passport cleanup
- S42: AWS hybrid architecture decision. Cloudflare tunnel abandoned. Full frontend audit. `AWS_DEPLOYMENT.md` created.

### S43-45: Batch VA + Packing (complete)
- S43: Backend — 2 new models (BatchChallan, BatchProcessing), migration, services, 6 new endpoints, 4 garment VA seeds
- S44: Frontend — VA modals, 7-state UI, permission system upgrade (4 new permissions, `require_role` → `require_permission`)
- S45: Testing + docs — dashboard KPIs, batch passport print, E2E audit (no gaps), mock data fixes, STEP2/STEP3/API_REFERENCE updated

### S46: Per-Color QC + SKU Auto-Generation (complete)
- Backend: +product_type on Lot, +color_qc on Batch, migration `a8a7f6a87d98`, check_batch per-color mode, pack_batch auto-SKU generation, sku_service.find_or_create(), ready_stock_in fix in inventory_service
- Frontend: ScanPage per-color QC table, LotsPage product_type dropdown, SKUsPage full overhaul (finished goods catalog with VA badges, stock indicators, KPIs, filters)
- Docs: API_REFERENCE (BatchCheck per-color, lot product_type, SKU auto-gen), STEP2 (+2 columns), CLAUDE.md
- Build: 0 errors

### S47: SKU Detail Overlay + Color Master (complete)
- Backend: `GET /skus/{id}` with `source_batches` (batch→lot→assignments→processing_logs). `sku_service._batch_brief()` helper.
- Frontend: `getSKU(id)` API + mock. SKU detail overlay (full-page, pricing decision view). Create modal kept for manual SKU.
- Shared `utils/colorUtils.js` — `loadColorMap()` lazy-fetches Color master → `colorHex()` uses hex_codes. Wired into SKUsPage, ScanPage, LotsPage.
- Build: 0 errors

### S49: Order Create Picker Redesign + Typography + Keyboard System (complete)
- Part A: Order Create overlay → picker pattern (Design cards → click to select → grid below). New states: `selectedDesigns`, `pickerGroups`, `selectedGroups`
- Part B: Typography global uplift — `index.css` new classes (.typo-label, .typo-data), DataTable `<th>` global fix, zero text-[9px] remaining, labels upgraded to text-gray-500/text-[11px] across 7 pages
- Part C: Full keyboard system — Ctrl+S save, Escape with dirty-check confirmation dialog, auto-focus Name, Enter chain through customer→search→grid, Tab/Enter grid cell navigation (right→wrap-down), price Enter→grid, keyboard hint strip in footer
- Build: 0 errors

### S50: KPI Card Typography + Dashboard Grid + Sidebar Sections (complete)
- Part A: Global KPI card text uplift across 8 pages — opacity→explicit colors, labels→semibold uppercase tracking-wide
- Part B: Dashboard 4+4 grid — Active Lots card added (from existing summary.lots), second row matched to 4-col
- Part C: Sidebar rearranged by business function (Commerce→Production→Setup) with section labels, compact padding (no scrollbar)
- Build: 0 errors, commit: `ed2cdf8`

### S48: Orders + Invoices Wholesale Overhaul (complete)
- Backend: SKUBrief +color/size/base_price, OrderFilterParams, InvoiceFilterParams, GET /orders/{id}, GET /invoices/{id}, stock check on create_order(), extended sku/order dicts in _to_response()
- Frontend: OrdersPage full rewrite (KPIs, tabs, source filter, design-grid create overlay, detail overlay with Ship/Cancel), InvoicesPage full rewrite (KPIs, tabs, search, detail overlay, A4 print overlay with react-to-print)
- Deleted: OrderForm.jsx (replaced by design-grid embedded in OrdersPage create overlay)
- Mock data enriched: +customer_address, +notes, +color/size/base_price in sku, +id/phone/address in invoice order
- Docs: API_REFERENCE §10-11 updated with new routes, filter params, extended shapes
- Build: 0 errors

**Real backend active:** `VITE_USE_MOCK=false` — all data from SQLite via FastAPI

---

## Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1 — password: `test1234`
- **Real DB login:** admin/supervisor/billing/tailor1/checker1 — password: `test1234`
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## SQLite → PostgreSQL Migration

**Current:** SQLite (dev) | **Target:** PostgreSQL (AWS RDS)

1. Change `DATABASE_URL`: `sqlite+aiosqlite:///./inventory_os.db` → `postgresql+asyncpg://user:pass@host:5432/inventory_os`
2. Optional: JSON → JSONB (role.py, inventory_event.py)
3. Re-generate: `rm inventory_os.db && rm migrations/versions/*.py && alembic revision --autogenerate -m "initial" && alembic upgrade head`

---

## Project Structure
```
inventory-os/
├── Guardian/           ← Docs (CLAUDE.md, guardian.md, API_REFERENCE.md, STEP1-6, AWS_DEPLOYMENT.md)
├── backend/app/        ← FastAPI (models/24, schemas/20, services/16, api/17, core/, tasks/)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
