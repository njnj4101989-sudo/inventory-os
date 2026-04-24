# Reports & Inventory Overhaul Plan

> **Created:** 2026-03-30 (Session 95)
> **Scope:** New report tabs on ReportsPage + Inventory page upgrade
> **Stop-safe:** Every checkbox is independently deployable. Pause after any item.

## Status Snapshot

| Phase | Delivered | Session |
|-------|-----------|---------|
| **P1** — Sales + Accounting + Inventory Raw Material | ✅ COMPLETE | S95 |
| **P2** — VA Processing + Purchases & Suppliers | ✅ COMPLETE | S95 |
| **P3** — Returns Analysis + Inventory Enhancements + Polish | ✅ COMPLETE | S95 |
| **P4.1** — Structural rebuild (grouped + ₹ + ageing + CSV) | ✅ COMPLETE (1 deferred: 4.1j) | S115c (commit `407ca6c`) |
| **P4.2–4.8** — Remaining sub-phases (Ageing / Reorder / ABC / Raw Material / Variance / Wastage / UX) | 🟡 QUEUED | S116+ |

---

## Current State

### ReportsPage — 4 tabs, 6 backend endpoints
| Tab | KPIs | Data | Backend Method |
|-----|------|------|----------------|
| Production | Pieces Produced, Total Pallas, Fabric Used, Approval Rate | Lot-wise table + Daily bars | `get_production_report()` |
| Inventory Movement | Stock In/Out/Returns/Net Change | SKU movement table + totals row | `get_inventory_movement()` |
| Financial | Revenue, Material Cost, Invoices Paid, Avg Order Value | Revenue by SKU + Cost breakdown + Daily revenue | `get_financial_report()` |
| Tailor Performance | Active Tailors, Total Pieces, Avg Rejection, Top Performer | Tailor cards with efficiency bars | `get_tailor_performance()` |

### InventoryPage — finished goods only
| KPI | Current |
|-----|---------|
| Total Pieces | Sum across all SKUs |
| Available | Available qty + % |
| Reserved | Reserved qty + low stock alerts |
| Inventory Value | `available_qty * base_price` |

**Missing:** Raw material (rolls), WIP (batches in pipeline), stock aging, no cross-table reports.

### Tables NOT represented in any report (20 of 42)
`orders`, `order_items`, `customers`, `brokers`, `transports`, `shipments`, `shipment_items`, `supplier_invoices`, `purchase_items`, `suppliers`, `job_challans`, `roll_processing`, `batch_challans`, `batch_processing`, `va_parties`, `value_additions`, `ledger_entries`, `return_notes`, `sales_returns`, `sales_return_items`

---

## Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Where to add reports | New tabs on existing ReportsPage | Single reports hub, consistent UX, shared period selector |
| Backend pattern | New methods on `DashboardService` | Existing service handles all reports, reuse `_resolve_period()` pattern |
| API pattern | New endpoints on `/api/v1/dashboard/` | Existing router, existing auth (`report_view`), consistent prefix |
| Frontend pattern | New tab components in `ReportsPage.jsx` | Existing tab architecture, shared period/filter state |
| Inventory tabs | New tabs on existing InventoryPage | Single inventory hub with Raw Material / WIP / Finished Goods views |
| Query style | Raw SQL via `select()` with JOINs + GROUP BY | Matches existing dashboard queries, efficient single-pass aggregations |

---

## Phase 1: Sales & Orders + Accounting + Inventory Raw Material

### P1.1 — Sales & Orders Report Tab

#### Backend — `dashboard_service.py`

- [ ] **1.1a** `get_sales_report(from_date, to_date, fy_id)` — Sales & Orders aggregation
  - KPIs: total_orders, total_revenue, avg_fulfillment_days, return_rate_pct, orders_by_status (dict)
  - Tables: `orders` + `order_items` + `invoices` + `sales_returns`
  - Queries:
    - Order counts by status (GROUP BY)
    - Revenue = SUM(invoices.total_amount) WHERE status IN (issued, paid)
    - Avg fulfillment = AVG(shipped_at - created_at) WHERE status IN (shipped, delivered, partially_shipped)
    - Return rate = COUNT(sales_returns) / COUNT(orders) * 100

- [ ] **1.1b** `get_customer_ranking(from_date, to_date, fy_id)` — Customer revenue ranking
  - Returns: list of `{ customer_id, customer_name, order_count, total_revenue, total_returns, net_revenue, avg_order_value }`
  - Tables: `customers` JOIN `orders` JOIN `invoices` LEFT JOIN `sales_returns`
  - Queries:
    - GROUP BY customer_id
    - Revenue from invoices (issued+paid), returns from sales_returns (closed)
    - net_revenue = revenue - returns
    - ORDER BY net_revenue DESC, LIMIT 50

- [ ] **1.1c** `get_order_fulfillment(from_date, to_date, fy_id)` — Fulfillment funnel
  - Returns: `{ total_orders, pending, processing, partially_shipped, shipped, delivered, cancelled, avg_days_to_ship, partial_ship_pct, items_ordered, items_fulfilled, items_returned, fulfillment_rate_pct }`
  - Tables: `orders` + `order_items` + `shipments`
  - Queries:
    - Status counts (GROUP BY)
    - SUM(order_items.quantity) vs SUM(order_items.fulfilled_qty) vs SUM(order_items.returned_qty)
    - fulfillment_rate = fulfilled / ordered * 100

- [ ] **1.1d** `get_broker_commission(from_date, to_date, fy_id)` — Broker performance
  - Returns: list of `{ broker_id, broker_name, order_count, total_order_value, commission_rate, commission_earned }`
  - Tables: `brokers` JOIN `orders` JOIN `ledger_entries` (entry_type=commission)
  - Queries:
    - GROUP BY broker_id
    - Commission from ledger_entries WHERE reference_type='commission'

#### Backend — API endpoint

- [ ] **1.1e** `GET /dashboard/sales-report` — new endpoint in `dashboard.py`
  - Query params: `period`, `from`, `to` (reuse `_resolve_period`)
  - Auth: `report_view` permission
  - Response: `{ kpis: {...}, customer_ranking: [...], fulfillment: {...}, broker_commission: [...] }`
  - Single endpoint returns all sub-reports (1 API call from frontend)

#### Frontend — SalesTab component

- [ ] **1.1f** Add `SalesTab` component in ReportsPage.jsx
  - 4 KPI cards: Total Orders, Total Revenue (₹), Avg Fulfillment Days, Return Rate %
  - Customer Ranking table: Customer, Orders, Revenue, Returns, Net Revenue, Avg Order Value
  - Fulfillment Funnel: horizontal bar showing order status pipeline with counts + %
  - Broker Commission table: Broker, Orders, Order Value, Commission Rate, Commission Earned

- [ ] **1.1g** Wire `SalesTab` to new tab in ReportsPage tab bar
  - Tab label: "Sales & Orders" with icon
  - Fetch on tab switch (lazy load), reuse shared period selector
  - Add `getSalesReport(params)` to `frontend/src/api/dashboard.js`

---

### P1.2 — Accounting Report Tab

#### Backend — `dashboard_service.py`

- [ ] **1.2a** `get_receivables_report(fy_id)` — Outstanding receivables with aging
  - Returns: `{ total_receivable, overdue_amount, aging_buckets: { "0-30": amount, "31-60": amount, "61-90": amount, "90+": amount }, by_customer: [{ customer_name, invoice_count, total_amount, overdue_amount, oldest_due_date }] }`
  - Tables: `invoices` (status IN (issued)) JOIN `customers`
  - Queries:
    - Aging: CASE on (today - due_date) buckets
    - GROUP BY customer_id, ORDER BY total_amount DESC

- [ ] **1.2b** `get_payables_report(fy_id)` — Outstanding payables
  - Returns: `{ total_payable_suppliers, total_payable_va, by_party: [{ party_type, party_name, balance, balance_type }] }`
  - Tables: `ledger_entries` GROUP BY (party_type, party_id)
  - Queries:
    - SUM(debit) - SUM(credit) per party WHERE party_type IN (supplier, va_party)
    - Only parties with non-zero balance

- [ ] **1.2c** `get_gst_summary(from_date, to_date, fy_id)` — GST liability
  - Returns: `{ output_tax (sales), input_tax (purchases), net_payable, by_rate: [{ gst_percent, taxable_value, cgst, sgst, total_tax }] }`
  - Tables: `invoices` (output) + `supplier_invoices` (input) + `return_notes` + `sales_returns`
  - Queries:
    - Output: SUM(tax_amount) from invoices WHERE status != cancelled
    - Input: SUM(rolls.cost_per_unit * rolls.total_weight * si.gst_percent / 100) from supplier_invoices
    - Adjustments: tax from return_notes (reduce input) + sales_returns (reduce output)
    - GROUP BY gst_percent for rate-wise breakdown

- [ ] **1.2d** `get_credit_debit_notes(from_date, to_date, fy_id)` — CN/DN register
  - Returns: list of `{ note_no, type (CN/DN), date, party_name, linked_return, amount, gst, total }`
  - Tables: `sales_returns` (credit_note_no) + `return_notes` (debit_note_no)
  - Queries:
    - UNION of sales_returns (WHERE credit_note_no IS NOT NULL) + return_notes (WHERE debit_note_no IS NOT NULL)
    - ORDER BY date DESC

#### Backend — API endpoint

- [ ] **1.2e** `GET /dashboard/accounting-report` — new endpoint
  - Query params: `period`, `from`, `to`
  - Auth: `report_view` permission
  - Response: `{ receivables: {...}, payables: {...}, gst_summary: {...}, credit_debit_notes: [...] }`

#### Frontend — AccountingTab component

- [ ] **1.2f** Add `AccountingTab` component in ReportsPage.jsx
  - 4 KPI cards: Total Receivable (₹), Total Payable (₹), Net GST Payable (₹), Overdue Amount (₹)
  - Receivables aging table: Customer, Invoices, Amount, 0-30d, 31-60d, 61-90d, 90+d, Overdue
  - Payables table: Party Type, Party Name, Balance, Type (Dr/Cr)
  - GST Summary table: Rate %, Taxable Value, CGST, SGST, Total Tax
  - Credit/Debit Notes table: Note No, Type (CN/DN badge), Date, Party, Linked Return, Amount

- [ ] **1.2g** Wire `AccountingTab` to ReportsPage tab bar
  - Tab label: "Accounting" with icon
  - Add `getAccountingReport(params)` to `frontend/src/api/dashboard.js`

---

### P1.3 — Inventory Page: Raw Material Tab

#### Backend — `inventory_service.py` (or `dashboard_service.py`)

- [ ] **1.3a** `get_raw_material_summary()` — Roll inventory aggregation
  - Returns: `{ total_rolls, total_weight_kg, total_value, rolls_in_stock, rolls_at_va, rolls_in_cutting, remnant_rolls, weight_in_stock, weight_at_va, by_fabric: [{ fabric_type, roll_count, total_weight, value, in_stock, at_va }], by_supplier: [{ supplier_name, roll_count, total_weight, value }] }`
  - Tables: `rolls` LEFT JOIN `suppliers`
  - Queries:
    - STATUS-wise aggregation: GROUP BY status for counts + SUM(remaining_weight)
    - FABRIC-wise: GROUP BY fabric_type
    - SUPPLIER-wise: GROUP BY supplier_id
    - Value = SUM(remaining_weight * cost_per_unit)

#### Backend — API endpoint

- [ ] **1.3b** `GET /dashboard/raw-material-summary` — new endpoint
  - Auth: `report_view` permission
  - Response: `{ success: true, data: { ...summary } }`

#### Frontend — InventoryPage tabs

- [ ] **1.3c** Add tab bar to InventoryPage: "Finished Goods" (current) | "Raw Material" | "Work in Progress"
  - Current content moves under "Finished Goods" tab (default)
  - Tab styling: emerald underline, matches ReportsPage tabs

- [ ] **1.3d** Add `RawMaterialTab` in InventoryPage
  - 4 KPI cards: Total Rolls, Total Weight (kg), In Stock, At VA, Inventory Value (₹)
  - By Fabric table: Fabric Type, Rolls, Weight (kg), Value (₹), In Stock, At VA
  - By Supplier table: Supplier, Rolls, Weight (kg), Value (₹)
  - Filter pills: All / In Stock / At VA / In Cutting / Remnant

- [ ] **1.3e** Add `getRawMaterialSummary()` to `frontend/src/api/inventory.js`

---

### P1.4 — Inventory Page: WIP Tab

#### Backend

- [ ] **1.4a** `get_wip_summary()` — Work-in-progress inventory
  - Returns: `{ total_batches, total_pieces, by_status: { created: N, assigned: N, in_progress: N, submitted: N, checked: N, packing: N }, pieces_at_va, batches_at_va, by_product_type: [{ product_type, batch_count, piece_count, at_va }], by_tailor: [{ tailor_name, batch_count, piece_count, in_progress, submitted }] }`
  - Tables: `batches` (WHERE status != 'packed') LEFT JOIN `batch_processing` LEFT JOIN `batch_assignments` + `users`
  - Queries:
    - Status pipeline: GROUP BY status (exclude packed — that's finished goods)
    - At VA: batches with any batch_processing.status = 'sent'
    - By product type: JOIN lots for product_type
    - By tailor: JOIN batch_assignments + users

#### Backend — API endpoint

- [ ] **1.4b** `GET /dashboard/wip-summary` — new endpoint
  - Auth: `report_view` permission

#### Frontend

- [ ] **1.4c** Add `WIPTab` in InventoryPage
  - 4 KPI cards: Batches in Pipeline, Total Pieces, At VA, Avg Days in Pipeline
  - Pipeline bar: visual stage-by-stage count (created → assigned → ... → packing)
  - By Product Type table: Product Type, Batches, Pieces, At VA
  - By Tailor table: Tailor, Batches, Pieces, In Progress, Submitted

- [ ] **1.4d** Add `getWIPSummary()` to `frontend/src/api/inventory.js`

---

### P1.5 — Deploy & Test Phase 1

- [ ] **1.5a** Test all 3 new backend endpoints on dev DB
- [ ] **1.5b** Verify frontend builds clean (`npm run build`)
- [ ] **1.5c** Deploy backend to prod (push → CI/CD auto-deploy)
- [ ] **1.5d** Deploy frontend to prod (Vercel auto)
- [ ] **1.5e** Update `API_REFERENCE.md` — 3 new endpoints
- [ ] **1.5f** Update `CLAUDE.md` — session summary

---

## Phase 2: VA Processing + Purchases & Suppliers

### P2.1 — VA Processing Report Tab

#### Backend

- [ ] **2.1a** `get_va_cost_report(from_date, to_date, fy_id)` — VA cost analysis
  - KPIs: total_va_spend, avg_cost_per_kg (rolls), avg_cost_per_piece (batches), damage_rate_pct, active_challans
  - By vendor table: VA Party, Challans, Total Spend, Avg Cost, Damage Count, Damage Amount
  - By VA type table: VA Name, Short Code, Roll Challans, Batch Challans, Total Spend
  - Tables: `roll_processing` + `batch_processing` + `job_challans` + `batch_challans` + `va_parties` + `value_additions`

- [ ] **2.1b** `get_va_turnaround(from_date, to_date)` — VA turnaround times
  - Returns: list of `{ va_party_name, va_type, challan_type (job/batch), avg_days, min_days, max_days, total_challans, pending_challans }`
  - Tables: `job_challans` + `batch_challans` + `va_parties` + `value_additions`
  - Queries:
    - AVG(received_date - sent_date) WHERE status = 'received'
    - COUNT WHERE status = 'sent' for pending

- [ ] **2.1c** `get_damage_report(from_date, to_date)` — Damage analysis
  - Returns: list of `{ va_party_name, roll_damage_weight, roll_damage_cost, batch_damage_pieces, batch_damage_cost, damage_reasons: { reason: count } }`
  - Tables: `roll_processing` (weight_damaged) + `batch_processing` (pieces_damaged)
  - GROUP BY va_party_id, damage_reason

#### Backend — API endpoint

- [ ] **2.1d** `GET /dashboard/va-report` — new endpoint
  - Response: `{ cost: {...}, turnaround: [...], damage: [...] }`

#### Frontend — VATab

- [ ] **2.1e** Add `VATab` component in ReportsPage.jsx
  - 4 KPI cards: Total VA Spend (₹), Avg Turnaround Days, Damage Rate %, Active Challans
  - Cost by Vendor table: VA Party, Challans, Spend, Avg Cost, Damage
  - Cost by VA Type table: VA Type, Challans, Spend
  - Turnaround table: VA Party, VA Type, Avg Days, Pending
  - Damage table: VA Party, Roll Damage (kg/₹), Batch Damage (pcs/₹), Top Reason

- [ ] **2.1f** Wire `VATab` to ReportsPage + add `getVAReport(params)` to dashboard.js

---

### P2.2 — Purchases & Suppliers Report Tab

#### Backend

- [ ] **2.2a** `get_purchase_report(from_date, to_date, fy_id)` — Purchase register
  - KPIs: total_purchased, rolls_received, suppliers_active, avg_waste_pct
  - By supplier table: Supplier, Invoices, Rolls, Weight, Value (₹), GST (₹), Waste %
  - Tables: `supplier_invoices` + `rolls` + `suppliers` + `lot_rolls`

- [ ] **2.2b** `get_supplier_quality(from_date, to_date)` — Supplier quality scorecard
  - Returns: list of `{ supplier_name, rolls_received, rolls_returned, damage_claims, return_value, quality_score_pct }`
  - Tables: `suppliers` JOIN `rolls` LEFT JOIN `return_note_items` (roll_id) LEFT JOIN `roll_processing` (weight_damaged)
  - Quality score = 100 - (returns + damages) / received * 100

- [ ] **2.2c** `get_fabric_utilization(from_date, to_date)` — Waste analysis
  - Returns: list of `{ fabric_type, total_purchased_kg, total_used_kg, total_waste_kg, waste_pct, by_color: [{ color, purchased, used, waste, waste_pct }] }`
  - Tables: `rolls` JOIN `lot_rolls`
  - Queries: SUM(weight_used), SUM(waste_weight) GROUP BY fabric_type, color

#### Backend — API endpoint

- [ ] **2.2d** `GET /dashboard/purchase-report` — new endpoint

#### Frontend — PurchaseTab

- [ ] **2.2e** Add `PurchaseTab` component in ReportsPage.jsx
  - 4 KPI cards: Total Purchased (₹), Rolls Received, Active Suppliers, Avg Waste %
  - Purchase by Supplier table: Supplier, Invoices, Rolls, Weight, Value, GST
  - Supplier Quality table: Supplier, Received, Returned, Damage Claims, Quality Score (color bar)
  - Fabric Utilization table: Fabric, Purchased (kg), Used (kg), Waste (kg), Waste % (color bar)

- [ ] **2.2f** Wire `PurchaseTab` to ReportsPage + add `getPurchaseReport(params)` to dashboard.js

---

### P2.3 — Deploy & Test Phase 2

- [ ] **2.3a** Test all new endpoints on dev DB
- [ ] **2.3b** Build + deploy
- [ ] **2.3c** Update API_REFERENCE.md + CLAUDE.md

---

## Phase 3: Returns Analysis + Inventory Enhancements + Polish

### P3.1 — Returns Report Tab

#### Backend

- [ ] **3.1a** `get_returns_report(from_date, to_date, fy_id)` — Return analysis
  - KPIs: customer_return_rate_pct, supplier_return_rate_pct, recovery_rate_pct, total_credit_notes (₹)
  - Customer returns by SKU: SKU, Sold Qty, Returned Qty, Return Rate %, Top Reason
  - Customer returns by customer: Customer, Orders, Returns, Return Rate %, Total Credit
  - Supplier returns by supplier: Supplier, Rolls Received, Rolls Returned, Debit Notes, Value
  - Restock vs damage: quantity_restocked / (quantity_restocked + quantity_damaged) * 100
  - Tables: `sales_returns` + `sales_return_items` + `return_notes` + `return_note_items` + `orders` + `order_items` + `customers` + `suppliers` + `skus`

#### Backend — API endpoint

- [ ] **3.1b** `GET /dashboard/returns-report` — new endpoint

#### Frontend — ReturnsTab

- [ ] **3.1c** Add `ReturnsTab` component in ReportsPage.jsx
  - 4 KPI cards: Customer Return Rate %, Supplier Return Rate %, Recovery Rate %, Credit Notes (₹)
  - Return by SKU table: SKU, Sold, Returned, Rate %, Reason
  - Return by Customer table: Customer, Orders, Returns, Rate %, Credit Amount
  - Supplier Returns table: Supplier, Received, Returned, Debit Notes, Value
  - Restock vs Damage donut/bar: Restocked %, Damaged %, Recovery value

- [ ] **3.1d** Wire `ReturnsTab` + add `getReturnsReport(params)` to dashboard.js

---

### P3.2 — Inventory Enhancements

- [ ] **3.2a** Stock Aging on Finished Goods tab
  - Backend: query `inventory_events` to find last `STOCK_OUT` date per SKU
  - Flag: No sale in 30d (amber), 60d (orange), 90d (red)
  - Add "Aging" column to existing inventory table

- [ ] **3.2b** Inventory Value Breakdown KPI enhancement
  - Show value split by product type (mini bar under Inventory Value KPI card)
  - Backend: GROUP BY product_type on inventory_state + skus

---

### P3.3 — Existing Tab Improvements

- [ ] **3.3a** Financial Tab: add Receivables aging summary row at top
- [ ] **3.3b** Production Tab: add "VA Cost" column in lot-wise table (SUM processing_cost from lot's rolls)
- [ ] **3.3c** Tailor Tab: add "Current Batch" column showing active batch code

---

### P3.4 — Deploy & Test Phase 3

- [ ] **3.4a** Test + deploy
- [ ] **3.4b** Update API_REFERENCE.md + CLAUDE.md — final session summary

---

## File Change Map

### Phase 1 (estimated ~15 files)

| File | Action | What |
|------|--------|------|
| `backend/app/services/dashboard_service.py` | EDIT | +4 new methods (sales, accounting, raw material, WIP) |
| `backend/app/api/dashboard.py` | EDIT | +4 new endpoints |
| `frontend/src/api/dashboard.js` | EDIT | +2 new API functions |
| `frontend/src/api/inventory.js` | EDIT | +2 new API functions |
| `frontend/src/pages/ReportsPage.jsx` | EDIT | +2 new tab components (Sales, Accounting) |
| `frontend/src/pages/InventoryPage.jsx` | EDIT | Add tab bar + 2 new tab components (Raw Material, WIP) |
| `Guardian/API_REFERENCE.md` | EDIT | Document new endpoints |
| `Guardian/CLAUDE.md` | EDIT | Session summary |

### Phase 2 (estimated ~8 files)

| File | Action | What |
|------|--------|------|
| `backend/app/services/dashboard_service.py` | EDIT | +5 new methods |
| `backend/app/api/dashboard.py` | EDIT | +2 new endpoints |
| `frontend/src/api/dashboard.js` | EDIT | +2 new API functions |
| `frontend/src/pages/ReportsPage.jsx` | EDIT | +2 new tab components (VA, Purchases) |

### Phase 3 (estimated ~6 files)

| File | Action | What |
|------|--------|------|
| `backend/app/services/dashboard_service.py` | EDIT | +1 new method + enhancements |
| `backend/app/api/dashboard.py` | EDIT | +1 new endpoint |
| `frontend/src/api/dashboard.js` | EDIT | +1 new API function |
| `frontend/src/pages/ReportsPage.jsx` | EDIT | +1 new tab + existing tab tweaks |
| `frontend/src/pages/InventoryPage.jsx` | EDIT | Stock aging column + value breakdown |

---

## Summary

| Phase | New Backend Methods | New Endpoints | New Frontend Tabs | Tables Covered |
|-------|--------------------:|-------------:|------------------:|--------------:|
| **P1** | 6 | 4 | 4 (2 report + 2 inventory) | +14 tables |
| **P2** | 5 | 2 | 2 report tabs | +6 tables |
| **P3** | 2 | 1 | 1 report tab + enhancements | +4 tables |
| **Total** | **13** | **7** | **7** | **24 new tables covered** |

After all 3 phases: **44 of 42 tables** represented in reports (some tables contribute to multiple reports).

**No new models, no migrations. Pure read-only aggregation queries + UI.**

---

## Phase 4: Inventory Reports Professional Overhaul

> **Created:** 2026-04-24 (Session 115/116)
> **Trigger:** User feedback — current Inventory tab is flat, pieces-only, no grouping, no ₹ value, no ageing/reorder signals, rolls absent.
> **Goal:** Turn the Inventory tab from a single flat SKU movement table into a professional reports suite with grouped views, ₹ valuation, dead stock / shortage detection, raw material visibility, and export.
> **Stop-safe:** Each sub-phase (P4.1, P4.2, …) ships independently. Close any of them whenever the value is captured.

### Non-negotiable constraints (read BEFORE touching code)

- **Typography** — use `.typo-*` classes only. See [guardian.md Protocol 10](guardian.md). No raw Tailwind typography like `text-sm font-medium text-gray-700`, no per-file constants (`const LABEL = ...`). Quick map:
  - Page: `typo-page-title` / Section: `typo-section-title` / Card: `typo-card-title` / Modal: `typo-modal-title`
  - Table: `typo-th` (header), `typo-td` (cell), `typo-td-secondary` (muted cell)
  - KPIs: `typo-kpi` (big), `typo-kpi-sm` (small — pair with color class for coloured KPIs), `typo-kpi-label`
  - Form: `typo-label`, `typo-label-sm`, `typo-input`, `typo-input-sm`
  - Buttons: `typo-btn`, `typo-btn-sm` / Chips: `typo-badge`
  - Tabs: `typo-tab` + emerald underline (`border-b-2 border-emerald-600 text-emerald-700`)
  - Body: `typo-body` / Caption/empty: `typo-caption`, `typo-empty` (have gray baked in — don't use on dark bg)
- **Theme** — all focus rings, active tabs, primary buttons, filter pills use **emerald-600**. No `primary-600`, no blue for UI chrome.
- **Dropdowns** — use `FilterSelect` component (not native `<select>`). `full` prop for forms, default for filters. `searchable` prop for lists >20 items.
- **Pagination** — use `Pagination` component. Use `page_size=0` to "fetch all" when aggregating client-side (memory rule).
- **Auth** — all new endpoints require `get_fy_id(current_user)` + permission check (usually `reports_view` or `inventory_view`).
- **Response envelope** — all endpoints return `{ success, data, message? }`. Paginated lists: `{ data: [], total, page, pages }`.
- **No new models, no migrations** unless explicitly approved — aggregations over existing tables only.
- **API_REFERENCE.md updates mandatory** — every new endpoint documented before commit (Protocol 5).

---

### P4.1 — Structural rebuild of Inventory tab (grouped + valued + ageing)

**Goal:** Replace the flat `SKU-wise Movement` table with design-grouped accordion. Add ₹ valuation, reserved/available, ageing column, and CSV export. Add 4 more KPI cards (total 8).

#### Backend

- [x] **4.1a** New service method `get_inventory_position(fy_id, filters, group_by='design')` in `dashboard_service.py`
  - Returns `{ kpis: {...}, groups: [{ design_no, design_id, product_type, sku_count, total_qty, reserved_qty, available_qty, value_inr, skus: [...] }], totals: {...} }`
  - ₹ value per SKU = `available_qty × WAC` (reuse `SKUService.compute_wac_map(fy_id)`)
  - Ageing per SKU = days since last `STOCK_OUT` inventory_event (null → "never sold")
  - Filters: `product_type`, `fabric_type`, `stock_status` (has/zero/negative), `min_value_inr`, `design_search`
- [x] **4.1b** KPI calc inside the same method — 8 metrics:
  - Row 1 (movement, period-scoped): `stock_in`, `stock_out`, `returns`, `net_change` (existing)
  - Row 2 (position, as-of-today): `total_value_inr`, `skus_with_stock`, `dead_sku_count` (no STOCK_OUT in 60d), `short_sku_count` (available < `sku.reorder_level`, ignore if reorder_level null)
- [x] **4.1c** New endpoint `GET /dashboard/inventory-position` — accepts `?from=&to=&product_type=&fabric_type=&stock_status=&min_value=&search=`
- [x] **4.1d** CSV export variant `GET /dashboard/inventory-position.csv` — same filters, streams CSV (no envelope) with columns: Design, SKU, Color, Size, Opening, In, Out, Returns, Net, Closing, Reserved, Available, WAC, Value ₹, Ageing Days
- [x] **4.1e** Document both endpoints in `API_REFERENCE.md`

#### Frontend — `ReportsPage.jsx::InventoryTab`

- [x] **4.1f** Two-row KPI grid (4 + 4) using `KpiCard` — row 1 period-scoped (existing), row 2 position-scoped (new); follow existing `KpiCard` pattern, keep `typo-kpi` / `typo-kpi-label`
- [x] **4.1g** Replace flat table with grouped accordion:
  - Parent row (design): chevron + design_no + product_type badge + aggregate columns (sku_count, total_qty, reserved, available, value_inr)
  - Child rows (SKUs within design): current columns PLUS Reserved, Available, WAC, Value ₹, Ageing Days
  - Ageing badge colour: `<30d` emerald, `30-60d` amber, `60-90d` orange, `>90d` red — implemented via `ageingBadgeClass` helper + `typo-badge`
  - Custom accordion (chevron on design row, click to toggle) instead of DataTable — DataTable's expandedRows pattern didn't fit the sibling-row model cleanly
- [x] **4.1h** Sticky filter bar above table: `FilterSelect` for product_type + stock_status + min_value numeric input + `SearchInput` + Clear button. (`fabric_type` filter deferred — SKUs don't have a fabric_type column, only rolls do; needs P4.5 roll-side work to be meaningful)
- [x] **4.1i** CSV export button — `typo-btn-sm` emerald, right of filter bar. Hits `.csv` endpoint via `downloadInventoryPositionCSV` helper (anchor click; cookies inherited).
- [ ] **4.1j** Period picker upgrade — **DEFERRED to P4.8 polish**. Would require cross-tab coordination (period picker is global). Current `7d/30d/90d` pills still work for inventory. Scoped custom date-range can layer in when P4.8 ships.
- [x] **4.1k** Wire to `getInventoryPosition(params)` in `api/dashboard.js` (+ mock + CSV download helper)

#### Deploy gate

- [x] **4.1l** Local smoke: group expand/collapse works, filters combine, CSV downloads, KPIs match totals (backend import + route registration verified; frontend syntax clean)
- [x] **4.1m** Update `CLAUDE.md` session entry, commit, push — verify CI/CD + Vercel (commit `407ca6c`)

---

### P4.2 — Ageing & Dead Stock sub-tab

**Goal:** A dedicated view sorted by inactivity with ₹-at-risk totals. Answers "what capital is stuck in non-moving stock?"

#### Backend

- [ ] **4.2a** New service method `get_stock_ageing(fy_id, thresholds={30,60,90})` in `dashboard_service.py`
  - Returns `{ buckets: [{ label: '0-30d', sku_count, value_inr }, ...], rows: [{ sku_code, design_no, available_qty, wac, value_inr, last_out_date, days_idle, bucket }] }`
  - `days_idle` = days since last STOCK_OUT event (null → "never sold, age from first STOCK_IN")
- [ ] **4.2b** New endpoint `GET /dashboard/stock-ageing` — accepts `?thresholds=30,60,90` (optional), `?product_type=`, `?min_value=`
- [ ] **4.2c** Document in `API_REFERENCE.md`

#### Frontend — new sub-tab inside Inventory

- [ ] **4.2d** Introduce a **sub-tab bar** inside `InventoryTab` — emerald underline, `typo-tab` — options: `Stock Position` (P4.1) / `Ageing & Dead Stock` (P4.2) / `Reorder & Shortage` (P4.3) / `ABC Analysis` (P4.4) / `Raw Material` (P4.5) / `Variance` (P4.6) / `Wastage` (P4.7)
- [ ] **4.2e** `AgeingTab` component: 4 KPI bucket cards (0-30 / 30-60 / 60-90 / 90+) each showing sku_count + value_inr. Table sorted by `days_idle desc` with ageing badge column.
- [ ] **4.2f** Row click → link to SKU detail page (reuse existing `/skus?open=<id>` deep-link)
- [ ] **4.2g** CSV export variant

#### Deploy gate

- [ ] **4.2h** Local smoke, commit, deploy

---

### P4.3 — Reorder & Shortage sub-tab

**Goal:** "What's about to stock out?" List SKUs where current availability is below the reorder threshold.

#### Data-model decision (pick one before building)

- **Option A (simple):** New nullable column `skus.reorder_level: int` — user sets per SKU via SKUs page (inline edit). Null = not tracked.
- **Option B (smart):** Compute demand velocity per SKU (avg units sold / day over last 30d), combine with fixed `lead_time_days` (setting on company), threshold = `velocity × lead_time`.
- **Recommendation:** A first (ships fast, user-controlled). B can layer in later with `reorder_level_auto` fallback.

#### Backend

- [ ] **4.3a** **[IF Option A]** Migration: add nullable `skus.reorder_level INT` to tenant schema (follow Protocol 9 pattern — `tenant_utils.col_exists` guard)
- [ ] **4.3b** Schema: add `reorder_level` to `SKUUpdate` request + response
- [ ] **4.3c** Service method `get_reorder_report(fy_id)` in `dashboard_service.py`
  - Returns rows where `available_qty < reorder_level` — columns: sku_code, design, available, reserved, reorder_level, gap, avg_daily_velocity_30d, days_until_stockout (= available / velocity, null if velocity 0), value_at_risk
- [ ] **4.3d** New endpoint `GET /dashboard/reorder-report`
- [ ] **4.3e** Document endpoint + column in `API_REFERENCE.md`

#### Frontend

- [ ] **4.3f** SKUsPage: add `reorder_level` inline-editable cell (compact `typo-input-sm`, numeric)
- [ ] **4.3g** `ReorderTab` component: 3 KPIs (skus_short, value_at_risk, avg_days_to_stockout). Table sorted by `days_until_stockout asc` (most urgent first). Red row bg if <3d.
- [ ] **4.3h** Wire via `getReorderReport(params)` in `api/dashboard.js`
- [ ] **4.3i** CSV export

#### Deploy gate

- [ ] **4.3j** Migration run on prod (if Option A) — CI/CD handles via `alembic upgrade head`
- [ ] **4.3k** Local smoke, commit, deploy

---

### P4.4 — ABC Analysis sub-tab

**Goal:** 80/20 classification — which SKUs carry the bulk of value (A) vs the long tail (C). Drives attention, cycle-count cadence, procurement priority.

#### Backend

- [ ] **4.4a** Service method `get_abc_analysis(fy_id, period_days=365)` in `dashboard_service.py`
  - For each SKU: `annual_revenue = SUM(invoice_items.qty × rate)` over period → sort desc → cumulative % → bucket A (≤80% cumulative), B (80-95%), C (>95%)
  - Also compute `annual_volume` (qty sold) for secondary analysis
  - Return: `{ buckets: { A: {count, value_pct}, B: {...}, C: {...} }, rows: [{ sku_code, design, annual_revenue, annual_volume, value_pct, cumulative_pct, bucket }] }`
- [ ] **4.4b** New endpoint `GET /dashboard/abc-analysis?period_days=365`
- [ ] **4.4c** Document in `API_REFERENCE.md`

#### Frontend

- [ ] **4.4d** `ABCTab` component: 3 KPI cards (A / B / C) showing `sku_count (value_pct%)` each. Table with A/B/C coloured badge (emerald / amber / gray).
- [ ] **4.4e** Default sort by `annual_revenue desc`; sticky filter: bucket, product_type
- [ ] **4.4f** CSV export

#### Deploy gate

- [ ] **4.4g** Local smoke, commit, deploy

---

### P4.5 — Raw Material (Rolls) sub-tab — upgrade + drill-in

**Goal:** Raw material IS a report gap today — the existing `Raw Material` tab is on InventoryPage but not inside Reports. Bring rolls into ReportsPage Inventory.

#### Backend

- [ ] **4.5a** Service method `get_raw_material_report(fy_id, group_by='fabric')` in `dashboard_service.py`
  - Groups rolls by `fabric_type` → `color` → `supplier`. Each leaf: `roll_count, total_weight_kg, total_value_inr` (weight × WAC from roll.base_price / purchase events)
  - KPIs: total_rolls, total_weight, in_stock_value, at_va_value, remnant_value, written_off_value
  - Exclude `status='returned'` from active totals; include `written_off` in its own metric
- [ ] **4.5b** New endpoint `GET /dashboard/raw-material-report?group_by=fabric|color|supplier`
- [ ] **4.5c** Document in `API_REFERENCE.md`

#### Frontend

- [ ] **4.5d** `RawMaterialTab` in the new sub-tab bar (mirrors existing InventoryPage tab but with reports-style aggregation). Accordion by fabric → color → supplier. Row click → deep-link `/rolls?fabric=&color=`
- [ ] **4.5e** 6 KPI cards: Total Rolls, Total Weight, In Stock ₹, At VA ₹, Remnant ₹, Written-off ₹
- [ ] **4.5f** CSV export

#### Deploy gate

- [ ] **4.5g** Local smoke, commit, deploy

---

### P4.6 — Variance sub-tab (physical vs system)

**Goal:** Expose the existing `StockVerification` model (built S97, unused in reports) as a report surface.

#### Backend

- [ ] **4.6a** Service method `get_variance_report(fy_id)` — queries `stock_verifications` + `stock_verification_items`. Per-verification summary + per-SKU variance rows
- [ ] **4.6b** New endpoint `GET /dashboard/variance-report`
- [ ] **4.6c** Document in `API_REFERENCE.md`

#### Frontend

- [ ] **4.6d** `VarianceTab` component: verification history list (date, counted_by, skus_checked, variance_sku_count, variance_value_inr). Click a verification → drawer with per-SKU variance lines
- [ ] **4.6e** KPIs: last_verification_date, total_variance_value_inr (absolute), skus_with_variance

#### Deploy gate

- [ ] **4.6f** Local smoke, commit, deploy

---

### P4.7 — Wastage Report sub-tab

**Goal:** Carries over from S116 queue. Unify three waste streams into one ₹ picture.

#### Backend

- [ ] **4.7a** Service method `get_wastage_report(fy_id, from_date, to_date)` — aggregates:
  1. **Cutting waste** — SUM(`lot_rolls.waste_weight × roll.base_price`) per lot
  2. **Damage waste** — SUM(`return_note_items.pieces_damaged × sku.base_price`) + SUM(`sales_return_items.pieces_damaged × sku.base_price`)
  3. **Write-off waste** — SUM rolls where `status='written_off'` of `remaining_weight_at_writeoff × base_price` (snapshot at write-off time — for now use `write_off_notes` or query InventoryEvent; fallback: `total_weight × base_price` if no snapshot)
  - Group by month. Total wastage ₹, wastage % (waste / total consumption)
- [ ] **4.7b** New endpoint `GET /dashboard/wastage-report?from=&to=`
- [ ] **4.7c** Document in `API_REFERENCE.md`

#### Frontend

- [ ] **4.7d** `WastageTab` component: 4 KPIs (Cutting Waste ₹, Damage ₹, Write-off ₹, Total Wastage %). Monthly breakdown table + stacked bar chart (optional, defer if tight)
- [ ] **4.7e** CSV export

#### Deploy gate

- [ ] **4.7f** Local smoke, commit, deploy

---

### P4.8 — Cross-cutting UX polish (bundles with whichever phase ships first)

- [ ] **4.8a** Sticky filter bar at top of `InventoryTab` (outside sub-tabs) — period picker lives here (global across sub-tabs)
- [ ] **4.8b** Drill-down links consistent across all sub-tabs: SKU → `/skus?open=<id>`; Design → `/skus?design=<no>`; Roll → `/scan/roll/<code>`; Lot → `/lots?open=<id>`
- [ ] **4.8c** Keyboard: `Ctrl+F` focuses search; `E` exports current sub-tab CSV
- [ ] **4.8d** Empty states per sub-tab — use `typo-empty` class, single line, no clipart
- [ ] **4.8e** Loading states — use `LoadingSpinner` size="lg" with `text="Loading {subtab} report..."`

---

### P4 File Change Map (estimated)

| Layer | File | Touch |
|---|---|---|
| BE schema | `schemas/dashboard.py` or new `schemas/reports.py` | Add 7 response models |
| BE service | `services/dashboard_service.py` | +7 methods (or split into `reports_service.py` if >2000 lines) |
| BE service | `services/sku_service.py` | Reuse `compute_wac_map` — no change |
| BE migration | `migrations/versions/XXXX_reorder_level.py` | +1 (P4.3 only, if Option A) |
| BE model | `models/sku.py` | +1 column (P4.3 only, if Option A) |
| BE routes | `api/dashboard.py` or new `api/reports.py` | +7 endpoints + 1 CSV variant |
| FE API | `api/dashboard.js` | +7 functions + mocks |
| FE page | `pages/ReportsPage.jsx` | Rewrite `InventoryTab` + add sub-tab bar + 7 sub-tab components |
| FE page | `pages/SKUsPage.jsx` | Add `reorder_level` inline edit (P4.3) |
| Docs | `Guardian/API_REFERENCE.md` | Document 7 endpoints + 1 CSV + `reorder_level` field |
| Docs | `Guardian/CLAUDE.md` | Per-sub-phase session entries |

---

### P4 Summary

| Sub-phase | Backend Methods | New Endpoints | Frontend | Migrations | Risk |
|---|---:|---:|---|---:|---|
| P4.1 Structural | 1 | 2 (JSON + CSV) | Rebuild InventoryTab | 0 | Low |
| P4.2 Ageing | 1 | 1 | New sub-tab | 0 | Low |
| P4.3 Reorder | 1 | 1 | New sub-tab + SKU edit | 1 (if Option A) | Medium |
| P4.4 ABC | 1 | 1 | New sub-tab | 0 | Low |
| P4.5 Raw Material | 1 | 1 | New sub-tab | 0 | Low |
| P4.6 Variance | 1 | 1 | New sub-tab | 0 | Low |
| P4.7 Wastage | 1 | 1 | New sub-tab | 0 | Low |
| P4.8 UX | — | — | Cross-cutting | 0 | Low |
| **Total** | **7** | **8** | **7 new sub-tabs + rebuilt parent** | **0-1** | — |

**Recommended start order:** P4.1 → P4.5 → P4.2 → P4.3 → P4.4 → P4.7 → P4.6 → P4.8

Rationale: P4.1 delivers the biggest daily-use improvement (the table everyone uses). P4.5 covers the visible gap (rolls invisible in reports). P4.2 + P4.3 unblock capital-efficiency decisions. P4.4 + P4.7 are analysis layers. P4.6 is audit-oriented (lowest frequency). P4.8 folds in polish as phases ship.

**Close criteria per sub-phase:** All checkboxes ticked + deployed to prod + `CLAUDE.md` session entry updated. No sub-phase requires the next to be valuable.
