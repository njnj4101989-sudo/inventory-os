# Reports & Inventory Overhaul Plan

> **Created:** 2026-03-30 (Session 95)
> **Scope:** New report tabs on ReportsPage + Inventory page upgrade
> **Stop-safe:** Every checkbox is independently deployable. Pause after any item.

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
