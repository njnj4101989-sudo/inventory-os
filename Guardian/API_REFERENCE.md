# API_REFERENCE.md — The Single Source of Truth

> **Generated from:** `frontend/src/api/mock.js` + all 13 API modules
> **Date:** 2026-02-17 (Session 18)
> **Purpose:** Backend MUST return these EXACT shapes. No interpretation, no guessing.

---

## Response Envelope

All endpoints wrap responses in:

```json
{ "success": true, "data": <payload>, "message": "OK" }
```

Frontend extracts: `response.data.data` (mock) / `response.data` (real — Axios interceptor).

Paginated endpoints return:

```json
{ "success": true, "data": [...items], "total": 270, "page": 1, "pages": 14 }
```

---

## 1. Auth (`/api/v1/auth`)

### POST `/auth/login`
**Request:** `{ username: string, password: string }`
**Response:**
```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "user": {
    "id": "uuid",
    "username": "admin1",
    "full_name": "Nitish Admin",
    "role": {
      "id": "uuid",
      "name": "admin",
      "display_name": null
    },
    "phone": "9999900001",
    "is_active": true
  }
}
```

### POST `/auth/refresh`
**Request:** `{ refresh_token: string }`
**Response:** `{ access_token: "jwt..." }`

### POST `/auth/logout`
**Request:** `{}`
**Response:** `{ message: "Logged out" }`

---

## 2. Users (`/api/v1/users`)

### GET `/users`
**Query:** `role`, `is_active`, `search`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "username": "admin1",
  "full_name": "Nitish Admin",
  "role": {
    "id": "uuid",
    "name": "admin",
    "display_name": null
  },
  "phone": "9999900001",
  "is_active": true,
  "created_at": "2026-02-07T08:00:00Z"
}
```

### POST `/users`
**Request:** `{ username, password, full_name, role_id, phone }`
**Response:** Single user object (same shape as above)

### PATCH `/users/{id}`
**Request:** `{ username?, password?, full_name?, role_id?, phone? }`
**Response:** Updated user object

---

## 3. Roles (`/api/v1/roles`)

### GET `/roles`
**Response:** Array of:
```json
{
  "id": "uuid",
  "name": "admin",
  "display_name": null,
  "permissions": {
    "user_manage": true,
    "role_manage": true,
    "supplier_manage": true,
    "stock_in": true,
    "lot_manage": true,
    "inventory_view": true,
    "inventory_adjust": true,
    "order_manage": true,
    "invoice_manage": true,
    "report_view": true
  },
  "user_count": 1
}
```

### POST `/roles`
**Request:** `{ name, display_name?, permissions? }`
**Response:** Single role object

### PATCH `/roles/{id}`
**Request:** `{ display_name?, permissions? }`
**Response:** Updated role object

### DELETE `/roles/{id}`
**Response:** `{ message: "Deleted" }`

---

## 4. Suppliers (`/api/v1/suppliers`)

### GET `/suppliers`
**Query:** `is_active`, `search`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "name": "Krishna Textiles",
  "contact_person": "Krishna Sharma",
  "phone": "9876543210",
  "email": "krishna@krishnatextiles.com",
  "gst_no": "24AABCK1234F1Z5",
  "pan_no": "AABCK1234F",
  "address": "45, Ring Road, Textile Market",
  "city": "Surat",
  "state": "Gujarat",
  "pin_code": "395002",
  "broker": "Ramesh Broker",
  "hsn_code": "5208",
  "is_active": true,
  "created_at": "2026-02-07T08:00:00Z"
}
```

### POST `/suppliers`
**Request:** `{ name, contact_person, phone, email?, city?, state?, pin_code?, gst_no?, pan_no?, broker?, hsn_code? }`
**Response:** Single supplier object

### PATCH `/suppliers/{id}`
**Request:** `{ name?, contact_person?, phone?, email?, city?, state?, pin_code?, gst_no?, pan_no?, broker?, hsn_code? }`
**Response:** Updated supplier object

---

## 5. Rolls (`/api/v1/rolls`)

### GET `/rolls`
**Query:** `fabric_type`, `color`, `has_remaining` (bool), `fully_consumed` (bool), `status` (`in_stock`|`sent_for_processing`|`in_cutting`), `supplier_id`, `fabric_filter`, `process_type`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "roll_code": "1-COT-GREEN/01-01",
  "fabric_type": "Cotton",
  "color": "Green",
  "total_weight": 18.800,
  "remaining_weight": 0,
  "unit": "kg",
  "cost_per_unit": 120.0,
  "total_length": null,
  "panna": 44,
  "gsm": 180,
  "status": "in_cutting",
  "supplier": {
    "id": "uuid",
    "name": "Krishna Textiles"
  },
  "supplier_invoice_no": "KT-2026-0451",
  "supplier_challan_no": "CH-451",
  "supplier_invoice_date": "2026-02-06",
  "sr_no": "1",
  "received_by_user": {
    "id": "uuid",
    "full_name": "Ravi Kumar"
  },
  "received_at": "2026-02-07T09:00:00Z",
  "notes": null,
  "processing_logs": [
    {
      "id": "uuid",
      "process_type": "embroidery",
      "vendor_name": "Shree Embroidery Works",
      "vendor_phone": "9898123456",
      "sent_date": "2026-02-09",
      "received_date": null,
      "weight_before": 23.120,
      "weight_after": null,
      "length_before": null,
      "length_after": null,
      "processing_cost": null,
      "status": "sent",
      "notes": "Chikan embroidery work"
    }
  ]
}
```

### POST `/rolls` (Stock In — single roll)
**Request:**
```json
{
  "fabric_type": "Cotton",
  "color": "Green",
  "total_weight": 18.800,
  "unit": "kg",
  "cost_per_unit": 120.0,
  "supplier_id": "uuid",
  "supplier_invoice_no": "KT-2026-0451",
  "supplier_challan_no": "CH-451",
  "supplier_invoice_date": "2026-02-06",
  "sr_no": "1",
  "panna": 44,
  "gsm": 180,
  "notes": null,
  "fabric_code": "COT",
  "color_code": "GREEN",
  "color_no": 1
}
```
**Response:** Single roll object (same shape as GET)

### POST `/rolls` (Bulk Stock In — called in loop)
Frontend calls `stockIn()` per roll entry. Each entry:
```json
{
  "fabric_type": "Cotton",
  "color": "Green",
  "quantity": 18.800,
  "unit": "kg",
  "cost_per_unit": 120.0,
  "panna": 44,
  "gsm": 180,
  "supplier_id": "uuid",
  "supplier_invoice_no": "KT-2026-0451",
  "supplier_challan_no": "CH-451",
  "supplier_invoice_date": "2026-02-06",
  "sr_no": "1",
  "notes": null,
  "weight": 18.800,
  "length": null,
  "fabric_code": "COT",
  "color_code": "GREEN",
  "color_no": 1
}
```
Note: `quantity` maps to `total_weight` (kg) or `total_length` (meters) depending on `unit`.

### GET `/rolls/{id}`
**Response:** Single roll object (same shape as list item, with `processing_logs[]`)

### PATCH `/rolls/{id}`
**Request:** `{ fabric_type?, color?, total_weight?, cost_per_unit?, panna?, gsm?, supplier_id?, supplier_invoice_no?, supplier_challan_no?, supplier_invoice_date?, sr_no?, notes? }`
**Response:** Updated roll object

### GET `/rolls?status=sent_for_processing` (Processing Rolls)
Same as `GET /rolls` with status filter pre-applied.

### POST `/rolls/{id}/processing` (Send for Processing)
**Request:**
```json
{
  "process_type": "embroidery",
  "vendor_name": "Shree Embroidery Works",
  "vendor_phone": "9898123456",
  "sent_date": "2026-02-09",
  "notes": "Chikan embroidery work"
}
```
**Response:** Updated roll object (status → `sent_for_processing`)

### PATCH `/rolls/{id}/processing/{processingId}` (Receive from Processing)
**Request:**
```json
{
  "received_date": "2026-02-15",
  "weight_after": 22.500,
  "length_after": null,
  "processing_cost": 1500.0,
  "notes": "Completed"
}
```
**Response:** Updated roll object (status → `in_stock`)

### PATCH `/rolls/{id}/processing/{processingId}/edit` (Edit Processing Log)
**Request:** All fields optional — only send changed fields:
```json
{
  "process_type": "dyeing",
  "vendor_name": "Updated Vendor",
  "vendor_phone": "9898000000",
  "sent_date": "2026-02-09",
  "received_date": "2026-02-15",
  "weight_after": 22.500,
  "length_after": null,
  "processing_cost": 1500.0,
  "notes": "Updated notes"
}
```
**Response:** Updated roll object (full roll with all processing_logs)

### Invoice Grouping (Frontend-Only)
`getInvoices()` fetches all rolls and groups by `supplier_invoice_no`:
```json
{
  "invoice_no": "KT-2026-0451",
  "challan_no": "CH-451",
  "sr_no": "1",
  "supplier": "Krishna Textiles",
  "date": "2026-02-06",
  "rolls": [ ...roll objects ],
  "total_rolls": 2,
  "total_weight": 55.720,
  "total_value": 6686.40
}
```
This is computed client-side from roll data — no dedicated backend endpoint needed.

---

## 6. SKUs (`/api/v1/skus`)

### GET `/skus`
**Query:** `product_type`, `color`, `size`, `is_active`, `search`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "sku_code": "BLS-101-Red-M",
  "product_type": "BLS",
  "product_name": "Design 101 Red Medium",
  "color": "Red",
  "size": "M",
  "description": "Cotton red blouse, regular fit",
  "base_price": 450.0,
  "is_active": true,
  "stock": {
    "total_qty": 150,
    "available_qty": 120,
    "reserved_qty": 30
  }
}
```
**IMPORTANT:** `stock` is a nested object with 3 fields. Backend must JOIN with `InventoryState` to produce this.

### POST `/skus`
**Request:** `{ product_type, design_no, color, size, product_name, base_price, description? }`
**Response:** Single SKU object (with `stock: { total_qty: 0, available_qty: 0, reserved_qty: 0 }`)

### PATCH `/skus/{id}`
**Request:** `{ product_name?, base_price?, description?, is_active? }`
**Response:** Updated SKU object

---

## 7. Lots (`/api/v1/lots`)

### GET `/lots`
**Query:** `status`, `design_no`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "lot_code": "LOT-0001",
  "lot_date": "2026-02-07",
  "design_no": "702",
  "standard_palla_weight": 3.60,
  "default_size_pattern": { "L": 2, "XL": 6, "XXL": 6, "3XL": 4 },
  "pieces_per_palla": 18,
  "total_pallas": 24,
  "total_pieces": 432,
  "total_weight": 113.270,
  "status": "distributed",
  "created_by_user": {
    "id": "uuid",
    "full_name": "Ravi Kumar"
  },
  "lot_rolls": [
    {
      "id": "uuid",
      "roll_id": "uuid",
      "roll_code": "1-COT-GREEN/01-01",
      "color": "Green",
      "roll_weight": 18.800,
      "palla_weight": 2.860,
      "num_pallas": 6,
      "weight_used": 17.160,
      "waste_weight": 1.640,
      "size_pattern": null,
      "pieces_from_roll": 108
    }
  ],
  "created_at": "2026-02-07T10:00:00Z",
  "notes": "First lot - Design 702"
}
```

### GET `/lots/{id}`
**Response:** Single lot object (same shape as above)

### POST `/lots`
**Request:**
```json
{
  "lot_date": "2026-02-07",
  "design_no": "702",
  "standard_palla_weight": 3.60,
  "default_size_pattern": { "L": 2, "XL": 6, "XXL": 6, "3XL": 4 },
  "rolls": [
    { "roll_id": "uuid", "palla_weight": 2.860, "size_pattern": null }
  ],
  "notes": "First lot - Design 702"
}
```
**Response:** Created lot object (backend auto-computes: `pieces_per_palla`, `total_pallas`, `total_pieces`, `total_weight`, `lot_code`, `lot_rolls[].num_pallas`, `lot_rolls[].weight_used`, `lot_rolls[].waste_weight`, `lot_rolls[].pieces_from_roll`)

### PATCH `/lots/{id}`
**Request:** `{ status?, notes?, ...updatable fields }`
**Response:** Updated lot object

---

## 8. Batches (`/api/v1/batches`)

### GET `/batches`
**Query:** `status`, `sku_id`, `lot_id`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "batch_code": "BATCH-0001",
  "lot": {
    "id": "uuid",
    "lot_code": "LOT-0001",
    "design_no": "702",
    "total_pieces": 432,
    "status": "distributed"
  },
  "sku": {
    "id": "uuid",
    "sku_code": "BLS-101-Red-M",
    "product_name": "Design 101 Red Medium"
  },
  "quantity": 200,
  "piece_count": 200,
  "color_breakdown": { "Green": 108, "Red": 92 },
  "status": "COMPLETED",
  "qr_code_data": "https://inv.local/batch/uuid",
  "created_by_user": {
    "id": "uuid",
    "full_name": "Ravi Kumar"
  },
  "assignment": {
    "tailor": {
      "id": "uuid",
      "full_name": "Amit Singh"
    },
    "assigned_at": "2026-02-07T11:00:00Z"
  },
  "rolls_used": [],
  "created_at": "2026-02-07T10:00:00Z",
  "assigned_at": "2026-02-07T11:00:00Z",
  "started_at": "2026-02-07T12:00:00Z",
  "submitted_at": "2026-02-07T16:00:00Z",
  "checked_at": "2026-02-07T17:00:00Z",
  "completed_at": "2026-02-07T17:00:00Z",
  "approved_qty": 196,
  "rejected_qty": 4,
  "rejection_reason": "Minor stitching defects",
  "notes": null
}
```

### POST `/batches`
**Request:** `{ lot_id, piece_count, color_breakdown?, notes? }`
**Response:** Created batch object

### POST `/batches/{id}/assign`
**Request:** `{ tailor_id: "uuid" }`
**Response:** Updated batch object (status → `ASSIGNED`, `assignment` populated)

### GET `/batches/{id}`
**Response:** Single batch object (same shape as list item)

---

## 9. Inventory (`/api/v1/inventory`)

### GET `/inventory`
**Query:** `sku_code`, `product_type`, `stock_status` (`low`|`critical`|`healthy`), `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "sku": {
    "id": "uuid",
    "sku_code": "BLS-101-Red-M",
    "product_name": "Design 101 Red Medium",
    "base_price": 450.0
  },
  "total_qty": 150,
  "available_qty": 120,
  "reserved_qty": 30,
  "last_updated": "2026-02-08T10:00:00Z"
}
```
**IMPORTANT:** Response is flat with nested `sku` object (NOT `sku_id`). `sku.base_price` is required for inventory value calculations.

### GET `/inventory/{skuId}/events`
**Query:** `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "event_id": "STOCK_IN_batch_f_001",
  "event_type": "STOCK_IN",
  "item_type": "finished_goods",
  "reference_type": "batch",
  "reference_id": "uuid",
  "quantity": 196,
  "performed_by": {
    "id": "uuid",
    "full_name": "Suresh Checker"
  },
  "performed_at": "2026-02-07T17:00:00Z",
  "metadata": {
    "batch_code": "BATCH-0001"
  }
}
```

### POST `/inventory/adjust`
**Request:** `{ sku_id, event_type, quantity }`
**Response:** Updated inventory state object

### POST `/inventory/reconcile`
**Request:** `{}`
**Response:** `{ message: "Reconciliation complete" }`

---

## 10. Orders (`/api/v1/orders`)

### GET `/orders`
**Query:** `status`, `source`, `search`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "order_number": "ORD-0001",
  "source": "web",
  "external_order_ref": null,
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "status": "pending",
  "items": [
    {
      "sku": {
        "id": "uuid",
        "sku_code": "BLS-101-Red-M",
        "product_name": "Design 101 Red Medium"
      },
      "quantity": 5,
      "unit_price": 450.0,
      "total_price": 2250.0,
      "fulfilled_qty": 0
    }
  ],
  "total_amount": 2250.0,
  "created_at": "2026-02-08T08:00:00Z"
}
```
**IMPORTANT:** `items[].sku` is a nested object (NOT `sku_id`). Each item has `fulfilled_qty`.

### POST `/orders`
**Request:**
```json
{
  "source": "web",
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "items": [
    { "sku_id": "uuid", "quantity": 5, "unit_price": 450.0 }
  ]
}
```
**Response:** Created order object

### POST `/orders/{id}/ship`
**Response:** Updated order (status → `shipped`)

### POST `/orders/{id}/cancel`
**Response:** Updated order (status → `cancelled`)

---

## 11. Invoices (`/api/v1/invoices`)

### GET `/invoices`
**Query:** `status`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "invoice_number": "INV-0001",
  "order": {
    "order_number": "ORD-0002",
    "customer_name": "Anita Verma"
  },
  "subtotal": 1500.0,
  "tax_amount": 270.0,
  "discount_amount": 0,
  "total_amount": 1770.0,
  "status": "paid",
  "issued_at": "2026-02-07T15:00:00Z",
  "paid_at": "2026-02-07T16:00:00Z",
  "items": [
    {
      "sku": {
        "id": "uuid",
        "sku_code": "BLS-102-Blue-L",
        "product_name": "Design 102 Blue Large"
      },
      "quantity": 3,
      "unit_price": 500.0,
      "total_price": 1500.0
    }
  ]
}
```
**IMPORTANT:** `order` is a nested object with `order_number` + `customer_name`. `items[].sku` is nested.

### PATCH `/invoices/{id}/pay`
**Response:** Updated invoice (status → `paid`, `paid_at` set)

### GET `/invoices/{id}/pdf`
**Response:** Binary PDF blob (Content-Type: application/pdf)

---

## 12. Dashboard (`/api/v1/dashboard`)

### GET `/dashboard/summary`
**Response:**
```json
{
  "rolls": { "total": 6, "with_remaining": 2 },
  "lots": { "total": 1, "open": 0, "distributed": 1 },
  "batches": { "created": 0, "assigned": 1, "in_progress": 0, "submitted": 0, "completed_today": 1 },
  "inventory": { "total_skus": 3, "low_stock_skus": 0 },
  "orders": { "pending": 1, "processing": 1, "shipped_today": 1 },
  "revenue_today": 1770.0,
  "revenue_month": 12500.0
}
```

### GET `/dashboard/tailor-performance`
**Query:** `period` (`7d`|`30d`|`90d`)
**Response:** Array of:
```json
{
  "tailor": {
    "id": "uuid",
    "full_name": "Amit Singh"
  },
  "batches_completed": 12,
  "pieces_completed": 580,
  "avg_completion_days": 1.8,
  "rejection_rate": 3.2,
  "efficiency_score": 92,
  "current_batch": "BATCH-0002",
  "speciality": "Blouse stitching"
}
```

### GET `/dashboard/inventory-movement`
**Query:** `sku_code`, `period` (optional)
**Response:** Array of:
```json
{
  "sku_code": "BLS-101-Red-M",
  "product_name": "Design 101 Red Medium",
  "period": {
    "from": "2026-02-01",
    "to": "2026-02-08"
  },
  "opening_stock": 80,
  "stock_in": 98,
  "stock_out": 30,
  "returns": 2,
  "losses": 0,
  "net_change": 70,
  "closing_stock": 150,
  "turnover_rate": 0.20
}
```

### GET `/dashboard/inventory-summary`
**Response:**
```json
{
  "total_skus": 3,
  "total_pieces": 270,
  "available_pieces": 225,
  "reserved_pieces": 45,
  "low_stock_count": 0,
  "out_of_stock_count": 0,
  "total_inventory_value": 153750.0,
  "avg_stock_per_sku": 90
}
```

### GET `/dashboard/production-report`
**Query:** `period` (`7d`|`30d`|`90d`)
**Response:**
```json
{
  "summary": {
    "lots_created": 1,
    "rolls_consumed": 4,
    "total_weight_used": 108.690,
    "total_waste": 4.580,
    "waste_percentage": 4.21,
    "total_pallas": 24,
    "total_pieces_produced": 432,
    "pieces_approved": 196,
    "pieces_rejected": 4,
    "approval_rate": 98.0
  },
  "by_lot": [
    {
      "lot_code": "LOT-0001",
      "design_no": "702",
      "lot_date": "2026-02-07",
      "rolls_used": 4,
      "total_weight": 113.270,
      "weight_used": 108.690,
      "waste_weight": 4.580,
      "waste_pct": 4.04,
      "total_pallas": 24,
      "total_pieces": 432,
      "status": "distributed"
    }
  ],
  "by_period": [
    { "date": "2026-02-07", "pieces": 432, "waste_kg": 4.58 }
  ]
}
```

### GET `/dashboard/financial-report`
**Query:** `period` (`7d`|`30d`|`90d`)
**Response:**
```json
{
  "summary": {
    "total_revenue": 12500.0,
    "total_material_cost": 13604.28,
    "gross_margin": -1104.28,
    "margin_percentage": -8.83,
    "orders_total": 12000.0,
    "invoices_paid": 1770.0,
    "invoices_pending": 2555.0,
    "avg_order_value": 4000.0
  },
  "revenue_by_sku": [
    {
      "sku_code": "BLS-101-Red-M",
      "product_name": "Design 101 Red Medium",
      "revenue": 6750.0,
      "units_sold": 15,
      "avg_price": 450.0
    }
  ],
  "cost_breakdown": [
    { "category": "Raw Material (Fabric)", "amount": 13604.28, "pct": 82.5 },
    { "category": "Tailor Labour", "amount": 2160.0, "pct": 13.1 },
    { "category": "QC / Checking", "amount": 432.0, "pct": 2.6 },
    { "category": "Packaging", "amount": 300.0, "pct": 1.8 }
  ],
  "revenue_by_period": [
    { "date": "2026-02-07", "revenue": 3230 }
  ]
}
```

---

## 13. Masters (`/api/v1/masters`)

### Product Types

#### GET `/masters/product-types`
**Response:** Array of:
```json
{
  "id": "uuid",
  "code": "BLS",
  "name": "Blouse",
  "description": "Traditional and modern blouse designs",
  "is_active": true
}
```

#### GET `/masters/product-types/all`
**Response:** Array (active only, for dropdowns)

#### POST `/masters/product-types`
**Request:** `{ code: "BLS", name: "Blouse", description? }`
**Response:** Created product type

#### PATCH `/masters/product-types/{id}`
**Request:** `{ name?, description?, is_active? }`
**Response:** Updated product type

### Colors

#### GET `/masters/colors`
**Response:** Array of:
```json
{
  "id": "uuid",
  "name": "Green",
  "code": "GREEN",
  "color_no": 1,
  "hex_code": "#22c55e",
  "is_active": true
}
```

#### GET `/masters/colors/all`
**Response:** Array (active only, for dropdowns). Same shape as above.

#### POST `/masters/colors`
**Request:** `{ name, code (5-char max), color_no? (auto-assigned if omitted), hex_code? }`
**Response:** Created color

#### PATCH `/masters/colors/{id}`
**Request:** `{ name?, color_no?, hex_code?, is_active? }`
**Response:** Updated color

### Fabrics

#### GET `/masters/fabrics`
**Response:** Array of:
```json
{
  "id": "uuid",
  "name": "Cotton",
  "code": "COT",
  "description": "Natural cotton fabric",
  "is_active": true
}
```

#### GET `/masters/fabrics/all`
**Response:** Array (active only, for dropdowns)

#### POST `/masters/fabrics`
**Request:** `{ name, code (3-char max), description? }`
**Response:** Created fabric

#### PATCH `/masters/fabrics/{id}`
**Request:** `{ name?, description?, is_active? }`
**Response:** Updated fabric

---

## Appendix A: All Permission Keys

```
user_manage, role_manage, supplier_manage, stock_in, lot_manage,
roll_cut, batch_create, batch_assign, batch_start, batch_submit,
batch_check, inventory_view, inventory_adjust, order_manage,
invoice_manage, report_view
```

## Appendix B: Status Values

| Entity  | Valid Statuses |
|---------|---------------|
| Roll    | `in_stock`, `sent_for_processing`, `in_cutting` |
| Roll Processing | `sent`, `received` |
| Lot     | `open`, `distributed` |
| Batch   | `CREATED`, `ASSIGNED`, `STARTED`, `SUBMITTED`, `COMPLETED`, `APPROVED`, `REJECTED` |
| Order   | `pending`, `processing`, `shipped`, `returned`, `cancelled` |
| Invoice | `issued`, `paid` |

## Appendix C: Nested Object Patterns

Backend MUST return these as nested objects, NOT flat IDs:

| Field | Where Used | Shape |
|-------|-----------|-------|
| `role` | Users, Auth login | `{ id, name, display_name }` |
| `supplier` | Rolls | `{ id, name }` |
| `received_by_user` | Rolls | `{ id, full_name }` |
| `created_by_user` | Lots, Batches | `{ id, full_name }` |
| `tailor` | Batches (inside `assignment`) | `{ id, full_name }` |
| `lot` | Batches | `{ id, lot_code, design_no, total_pieces, status }` |
| `sku` | Batches, Inventory, Orders, Invoices | varies — see each section |
| `order` | Invoices | `{ order_number, customer_name }` |
| `performed_by` | Inventory Events | `{ id, full_name }` |
| `stock` | SKUs | `{ total_qty, available_qty, reserved_qty }` |
| `period` | Inventory Movement | `{ from, to }` |
