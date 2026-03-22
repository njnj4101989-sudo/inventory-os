# API_REFERENCE.md — The Single Source of Truth

> **Generated from:** `frontend/src/api/mock.js` + all 17 API modules
> **Date:** 2026-02-17 (Session 18) | **Updated:** 2026-03-17 (Session 77 — HttpOnly cookie auth, FY scoping on all endpoints, counter reset per FY, token blacklist, FY closing endpoints)
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

## Financial Year Scoping (S77)

All transactional endpoints are scoped to the current financial year from the JWT.

**FY-tagged models:** Roll, Lot, Batch, Order, Invoice, SupplierInvoice, JobChallan, BatchChallan, LedgerEntry — all have `fy_id` column (non-nullable for new records).

**Create endpoints:** `fy_id` is extracted from the JWT via `get_fy_id(request)`. The caller never sends `fy_id` in the request body. If no FY is in the JWT, returns `400 "No financial year selected. Please select a company with an active financial year."`.

**List endpoints:** Filter by current FY by default. Items from previous FYs that are still "active" (e.g., rolls `in_stock`, orders `pending`) are included via cross-FY visibility rules.

**Counter reset per FY:** The following auto-increment codes reset to 001/0001 at the start of each FY:
- `LOT-XXXX`, `BATCH-XXXX`, `ORD-XXXX`, `INV-XXXX` — reset to 0001
- `JC-XXX`, `BC-XXX` — reset to 001
- Roll codes are **NOT** FY-scoped (prefix-based, unchanged)

**Response:** All create responses include `fy_id` on the created record.

---

## 1. Auth (`/api/v1/auth`)

> **S77 update:** Auth migrated to HttpOnly cookies. Tokens are no longer in response bodies or localStorage.
> Access token: `Set-Cookie: access_token=jwt...; HttpOnly; Path=/; SameSite=None; Secure` (prod) / `SameSite=Lax` (dev).
> Refresh token: `Set-Cookie: refresh_token=jwt...; HttpOnly; Path=/api/v1/auth; SameSite=None; Secure` (prod).
> All tokens carry a `jti` (JWT ID) claim for server-side blacklisting.

### POST `/auth/login`
**Request:** `{ username: string, password: string }`
**Response (body):**
```json
{
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
  },
  "company": {
    "id": "uuid",
    "name": "Dr's Blouse",
    "slug": "drs_blouse",
    "schema_name": "co_drs_blouse"
  },
  "fy": {
    "id": "uuid",
    "code": "FY2026-27",
    "start_date": "2026-04-01",
    "end_date": "2027-03-31"
  },
  "fys": [
    { "id": "uuid", "code": "FY2025-26", "is_current": false, "status": "closed", "start_date": "2025-04-01", "end_date": "2026-03-31" },
    { "id": "uuid", "code": "FY2026-27", "is_current": true, "status": "open", "start_date": "2026-04-01", "end_date": "2027-03-31" }
  ]
}
```
**Cookies set:** `access_token` (HttpOnly) + `refresh_token` (HttpOnly, path=/api/v1/auth).
**Login flow:** 1 company -> auto-select (response includes company/fy). N companies -> `companies` array returned, frontend shows picker, then calls `/auth/select-company`. 0 companies -> redirects to Settings.

### POST `/auth/select-company`
**Request:** `{ company_id: "uuid", fy_id?: "uuid" }`
**Response:** Same shape as login (user + company + fy + fys). Sets new cookies with company_schema/fy_id in JWT claims.

### GET `/auth/me`
**Auth:** Required (reads `access_token` cookie)
**Response:**
```json
{
  "user": { "id": "uuid", "username": "admin1", "full_name": "Nitish Admin", "role": { "id": "uuid", "name": "admin", "display_name": null }, "phone": "9999900001", "is_active": true },
  "company": { "id": "uuid", "name": "Dr's Blouse", "slug": "drs_blouse", "schema_name": "co_drs_blouse" },
  "fy": { "id": "uuid", "code": "FY2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31" }
}
```
**Note:** This is the single source of truth on page load. Frontend calls this on mount instead of reading localStorage.

### POST `/auth/refresh`
**Request:** No body needed (reads `refresh_token` cookie).
**Response:** `{ message: "Tokens refreshed" }`
**Cookies set:** New `access_token` + new `refresh_token` (rotation -- old refresh token is blacklisted).

### POST `/auth/logout`
**Request:** No body needed.
**Response:** `{ message: "Logged out" }`
**Effect:** Both `access_token` and `refresh_token` cookies cleared. Token `jti` values added to `public.token_blacklist` table (server-side invalidation).

### Token Blacklist
- Table: `public.token_blacklist` (columns: `jti`, `expires_at`, `created_at`)
- On logout: both access + refresh token JTIs are blacklisted
- On refresh: old refresh token JTI is blacklisted (rotation)
- Middleware checks blacklist on every authenticated request
- Error: `401 "Token has been revoked. Please login again."`

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
    "report_view": true,
    "batch_start": true,
    "batch_submit": true,
    "batch_check": true,
    "batch_assign": true,
    "batch_send_va": true,
    "batch_receive_va": true,
    "batch_ready_packing": true,
    "batch_pack": true,
    "va_manage": true,
    "masters_manage": true
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
  "phone_alt": "9876543211",
  "email": "krishna@krishnatextiles.com",
  "gst_no": "24AABCK1234F1Z5",
  "gst_type": "regular",
  "state_code": "24",
  "pan_no": "AABCK1234F",
  "aadhar_no": null,
  "address": "45, Ring Road, Textile Market",
  "city": "Surat",
  "state": "Gujarat",
  "pin_code": "395002",
  "broker": "Ramesh Broker",
  "hsn_code": "5208",
  "due_days": 30,
  "credit_limit": 500000.00,
  "opening_balance": 0.00,
  "balance_type": "debit",
  "tds_applicable": false,
  "tds_rate": null,
  "tds_section": null,
  "msme_type": "small",
  "msme_reg_no": "UDYAM-GJ-01-0012345",
  "notes": null,
  "is_active": true,
  "created_at": "2026-02-07T08:00:00Z"
}
```
**S73 enrichment:** +14 fields (phone_alt, gst_type, state_code, aadhar_no, due_days, credit_limit, opening_balance, balance_type, tds_applicable, tds_rate, tds_section, msme_type, msme_reg_no, notes)

### POST `/suppliers`
**Request:** `{ name (required), contact_person?, phone?, phone_alt?, email?, city?, state?, pin_code?, gst_no?, gst_type?, state_code?, pan_no?, aadhar_no?, broker?, hsn_code?, due_days?, credit_limit?, opening_balance?, balance_type?, tds_applicable?, tds_rate?, tds_section?, msme_type?, msme_reg_no?, notes? }`
**Response:** Single supplier object

### PATCH `/suppliers/{id}`
**Request:** All fields optional + `is_active?`
**Response:** Updated supplier object

---

## 5. Rolls (`/api/v1/rolls`)

### GET `/rolls`
**Query:** `fabric_type`, `color`, `has_remaining` (bool), `fully_consumed` (bool), `status` (`in_stock`|`sent_for_processing`|`in_cutting`), `supplier_id`, `fabric_filter`, `value_addition_id`, `sr_no`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "roll_code": "1-COT-GREEN/01-01",
  "fabric_type": "Cotton",
  "color": "Green",
  "total_weight": 18.800,
  "remaining_weight": 0,
  "current_weight": 18.800,
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
  "gst_percent": 12.0,
  "supplier_invoice_id": "uuid | null",
  "processing_logs": [
    {
      "id": "uuid",
      "value_addition_id": "uuid",
      "value_addition": { "id": "uuid", "name": "Embroidery", "short_code": "EMB" },
      "va_party": { "id": "uuid", "name": "Shree Embroidery Works", "phone": "9898123456", "city": "Surat" },
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

### DELETE `/rolls/{id}`
**Auth:** `stock_in` permission required
**Guard:** Only deletes if `remaining_weight == total_weight` (unused roll). Returns 400 if roll has been used in lots or processing.
**Response:** `{ "success": true, "message": "Roll deleted" }`

### GET `/rolls?status=sent_for_processing` (Processing Rolls)
Same as `GET /rolls` with status filter pre-applied.

### POST `/rolls/{id}/processing` (Send for Processing)
**Request:**
```json
{
  "value_addition_id": "uuid (required)",
  "va_party_id": "uuid",
  "sent_date": "2026-02-09",
  "notes": "Chikan embroidery work",
  "weight_to_send": 20.000
}
```
- `weight_to_send` (optional): partial weight to send. Defaults to full `remaining_weight`.
- Must be `> 0` and `<= roll.remaining_weight`.
- `weight_before` on processing log = `weight_to_send` (the partial amount sent).
- `roll.remaining_weight -= weight_to_send` after send.
- If `remaining_weight > 0` after send → roll stays `in_stock` (partial send).
- If `remaining_weight == 0` → roll becomes `sent_for_processing`.

**Response:** Updated roll object

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
- `roll.remaining_weight += weight_after` (adds back the returned portion).
- `roll.current_weight += (weight_after - weight_before)` (VA delta — e.g. embroidery adds weight).
- Status → `in_stock` only if no other "sent" processing logs remain.

**Response:** Updated roll object

### PATCH `/rolls/{id}/processing/{processingId}/edit` (Edit Processing Log)
**Request:** All fields optional — only send changed fields:
```json
{
  "value_addition_id": "uuid (optional)",
  "va_party_id": "uuid (optional)",
  "sent_date": "2026-02-09",
  "received_date": "2026-02-15",
  "weight_after": 22.500,
  "length_after": null,
  "processing_cost": 1500.0,
  "notes": "Updated notes"
}
```
**Response:** Updated roll object (full roll with all processing_logs)

### POST `/rolls/bulk-stock-in` (Bulk Stock In — atomic)
**Auth:** `stock_in` permission required
**Purpose:** Stock-in multiple rolls in a SINGLE atomic transaction. All-or-nothing — if any roll fails, entire batch rolls back. Replaces frontend loop of individual `POST /rolls` calls.

**Request:**
```json
{
  "supplier_id": "uuid | null",
  "supplier_invoice_no": "KT-2026-0451",
  "supplier_challan_no": "CH-451",
  "supplier_invoice_date": "2026-02-06",
  "sr_no": "1",
  "gst_percent": 12,
  "rolls": [
    {
      "fabric_type": "Cotton",
      "color": "Green",
      "total_weight": 18.800,
      "unit": "kg",
      "cost_per_unit": 120.0,
      "total_length": null,
      "panna": 44,
      "gsm": 180,
      "notes": null,
      "fabric_code": "COT",
      "color_code": "GREEN",
      "color_no": 1
    }
  ]
}
```
- `rolls[]` — 1 to 200 entries. Each entry = one roll to create.
- Header fields (`supplier_id`, `supplier_invoice_no`, etc.) apply to ALL rolls.
- Roll codes auto-generated per existing `next_roll_code()` logic.

**Response:**
```json
{
  "success": true,
  "data": {
    "rolls": [ ...roll objects (same shape as GET /rolls items) ],
    "count": 30
  },
  "message": "30 rolls stocked in"
}
```

**Errors:**
- `422` — validation error (weight <= 0, missing required fields)
- `400` — business rule violation
- On ANY error, entire transaction rolls back (no partial saves)

### GET `/rolls/supplier-invoices` (Supplier Invoice Grouping — server-side)
**Auth:** `stock_in` permission required
**Purpose:** Returns rolls grouped by `(supplier_invoice_no, supplier_id)` with aggregates. Replaces client-side fetch-all-and-group.

**Query:** `search`, `page` (default 1), `page_size` (default 20)
- `search` — matches against `supplier_invoice_no`, `supplier_challan_no`, `sr_no`, supplier name, fabric_type, color, roll_code

**Response:** Paginated array of:
```json
{
  "invoice_no": "KT-2026-0451",
  "challan_no": "CH-451",
  "invoice_date": "2026-02-06",
  "sr_no": "1",
  "supplier": { "id": "uuid", "name": "Krishna Textiles" },
  "supplier_invoice_id": "uuid | null",
  "gst_percent": 12.0,
  "gst_amount": 1332.00,
  "total_with_gst": 12432.00,
  "rolls": [ ...full roll objects (same shape as GET /rolls items) ],
  "roll_count": 5,
  "total_weight": 92.500,
  "total_length": null,
  "total_value": 11100.00,
  "received_at": "2026-02-07T09:00:00Z"
}
```
- Rolls within each group sorted by `created_at ASC` (preserves original entry order)
- Groups sorted by `received_at DESC` (newest first)
- `total_value` = sum of `total_weight * cost_per_unit` per roll
- `gst_percent` — from linked `SupplierInvoice` record (0 if no link)
- `gst_amount` = `total_value * gst_percent / 100` (2 decimal places)
- `total_with_gst` = `total_value + gst_amount`
- `supplier_invoice_id` — FK to `SupplierInvoice` record (null for legacy rolls)
- Rolls without `supplier_invoice_no` get unique key `NO-INV-{roll_id}` (shown as standalone)

### PATCH `/rolls/supplier-invoices/{id}` (Update Supplier Invoice)
**Auth:** `stock_in` permission required
**Purpose:** Update invoice-level fields (e.g., GST%) on the `SupplierInvoice` record.

**Request:** (all fields optional)
```json
{
  "gst_percent": 18,
  "invoice_no": "KT-2026-0451",
  "challan_no": "CH-451",
  "invoice_date": "2026-02-06",
  "sr_no": "1",
  "notes": "Updated"
}
```
**Allowed fields:** `gst_percent`, `invoice_no`, `challan_no`, `invoice_date`, `sr_no`, `notes`

**Response:**
```json
{
  "id": "uuid",
  "supplier_id": "uuid | null",
  "invoice_no": "KT-2026-0451",
  "challan_no": "CH-451",
  "invoice_date": "2026-02-06",
  "sr_no": "1",
  "gst_percent": 18.0
}
```

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
  "hsn_code": "6206",
  "gst_percent": 12.0,
  "mrp": 799.0,
  "sale_rate": 650.0,
  "unit": "pcs",
  "is_active": true,
  "stock": {
    "total_qty": 150,
    "available_qty": 120,
    "reserved_qty": 30
  }
}
```
**S74 enrichment:** +5 fields (hsn_code, gst_percent, mrp, sale_rate, unit) — all nullable.
**IMPORTANT:** `stock` is a nested object with 3 fields. Backend must JOIN with `InventoryState` to produce this.

**S46 — Auto-generation:** SKUs with VA suffixes (e.g. `BLS-702-Red-XL+EMB+BTN`) are auto-created by `sku_service.find_or_create()` at pack time. `pack_batch()` reads `color_qc`, loops each color with `approved > 0`, generates SKU code as `{product_type}-{batch.design_no}-{color}-{size}+{VA1}+{VA2}...` (design_no now comes from batch, not lot), and fires `ready_stock_in` inventory event per color.

### GET `/skus/{id}`
**Response:** Single SKU object (same fields as list) + `source_batches` array:
```json
{
  "...sku fields...",
  "source_batches": [
    {
      "id": "uuid",
      "batch_code": "BATCH-0001",
      "status": "packed",
      "size": "XL",
      "piece_count": 200,
      "color_qc": { "Green": { "expected": 108, "approved": 106, "rejected": 2, "reason": "..." } },
      "approved_qty": 196,
      "rejected_qty": 4,
      "lot": { "id": "uuid", "lot_code": "LT-BLS-0001", "designs": [{"design_no": "702", "size_pattern": {"L": 4, "XL": 4}}] },
      "tailor": { "id": "uuid", "full_name": "Amit Singh" },
      "packed_at": "2026-02-07T18:00:00Z",
      "processing_logs": [
        {
          "id": "uuid",
          "value_addition": { "name": "Embroidery", "short_code": "EMB" },
          "status": "received",
          "pieces_sent": 200,
          "pieces_received": 198,
          "cost": 4500,
          "phase": "stitching",
          "created_at": "2026-02-08"
        }
      ]
    }
  ]
}
```
**Note:** `source_batches` enables the "pricing decision" view — admin sees full batch/lot/VA context.

### POST `/skus`
**Request:** `{ product_type, design_no, color, size, product_name, base_price, description? }`
**Response:** Single SKU object (with `stock: { total_qty: 0, available_qty: 0, reserved_qty: 0 }`)
**Note:** Manual creation is secondary — auto-generated from batch packing is the primary flow.

### PATCH `/skus/{id}`
**Request:** `{ product_name?, base_price?, description?, hsn_code?, gst_percent?, mrp?, sale_rate?, unit?, is_active? }`
**Response:** Updated SKU object

---

## 7. Lots (`/api/v1/lots`)

### GET `/lots`
**Query:** `status`, `design_no` (searches within designs JSON), `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "lot_code": "LT-BLS-0001",
  "lot_date": "2026-02-07",
  "product_type": "BLS",
  "standard_palla_weight": 3.60,
  "standard_palla_meter": null,
  "designs": [
    { "design_no": "101", "size_pattern": { "L": 4, "XL": 4 } },
    { "design_no": "102", "size_pattern": { "XXL": 6, "3XL": 4 } }
  ],
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
  "notes": "First lot"
}
```

### GET `/lots/{id}`
**Response:** Single lot object (same shape as above)

### POST `/lots`
**Request:**
```json
{
  "lot_date": "2026-02-07",
  "product_type": "BLS",
  "standard_palla_weight": 3.60,
  "standard_palla_meter": null,
  "designs": [
    { "design_no": "101", "size_pattern": { "L": 4, "XL": 4 } },
    { "design_no": "102", "size_pattern": { "XXL": 6, "3XL": 4 } }
  ],
  "rolls": [
    { "roll_id": "uuid", "palla_weight": 2.860, "size_pattern": null }
  ],
  "notes": "Multi-design lot"
}
```
**Response:** Created lot object (backend auto-computes: `pieces_per_palla`, `total_pallas`, `total_pieces`, `total_weight`, `lot_code` as `LT-{PT}-XXXX`, `lot_rolls[].num_pallas`, `lot_rolls[].weight_used`, `lot_rolls[].waste_weight`, `lot_rolls[].pieces_from_roll`)

### PATCH `/lots/{id}`
**Request:** `{ status?, standard_palla_weight?, standard_palla_meter?, designs?: [{design_no, size_pattern}], notes? }`
**Response:** Updated lot object

---

## 8. Batches (`/api/v1/batches`)

### Batch States (7 — Enhanced S42)

```
created → assigned → in_progress → submitted → checked → packing → packed
                                    ↩ rejected (back to in_progress)
```

| State | Meaning | VA Allowed? |
|-------|---------|-------------|
| `created` | Unclaimed | No |
| `assigned` | Tailor claimed | No |
| `in_progress` | Tailor stitching | **Yes** (supervisor sends) |
| `submitted` | Awaiting QC | No |
| `checked` | QC passed | **Yes** (supervisor sends for finishing) |
| `packing` | Being packed | No |
| `packed` | **Ready Stock** — in inventory | No |

> **Migration:** Old `completed` status → renamed to `checked`. Frontend references updated.

### GET `/batches`
**Query:** `status`, `sku_id`, `lot_id`, `size`, `location` (`in_house`|`out_house`|`all`), `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "batch_code": "BATCH-0001",
  "design_no": "702",
  "lot": {
    "id": "uuid",
    "lot_code": "LT-BLS-0001",
    "designs": [{"design_no": "101", "size_pattern": {"L": 4}}, {"design_no": "102", "size_pattern": {"XXL": 6}}],
    "product_type": "BLS",
    "total_pieces": 432,
    "status": "distributed"
  },
  "sku": null,
  "size": "XL",
  "quantity": 200,
  "piece_count": 200,
  "color_breakdown": { "Green": 108, "Red": 92 },
  "color_qc": { "Green": { "expected": 108, "approved": 106, "rejected": 2, "reason": "..." }, "Red": { "expected": 92, "approved": 90, "rejected": 2, "reason": null } },
  "status": "checked",
  "qr_code_data": "https://inv.local/batch/uuid",
  "has_pending_va": false,
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
  "checked_by": { "id": "uuid", "full_name": "Suresh Checker" },
  "packed_by": null,
  "packed_at": null,
  "pack_reference": null,
  "rolls_used": [],
  "processing_logs": [
    {
      "id": "uuid",
      "batch_challan_id": "uuid",
      "challan_no": "BC-001",
      "value_addition": { "id": "uuid", "name": "Hand Stones", "short_code": "HST" },
      "va_party": { "id": "uuid", "name": "Raju Hand-stone Works", "phone": "9876500001", "city": "Surat" },
      "pieces_sent": 15,
      "pieces_received": 15,
      "cost": 2500.00,
      "status": "received",
      "phase": "stitching",
      "sent_date": "2026-03-03",
      "received_date": "2026-03-05",
      "notes": null
    }
  ],
  "created_at": "2026-02-07T10:00:00Z",
  "assigned_at": "2026-02-07T11:00:00Z",
  "started_at": "2026-02-07T12:00:00Z",
  "submitted_at": "2026-02-07T16:00:00Z",
  "checked_at": "2026-02-07T17:00:00Z",
  "approved_qty": 196,
  "rejected_qty": 4,
  "rejection_reason": "Minor stitching defects",
  "notes": null
}
```

**New fields (S42):**
- `has_pending_va` — boolean, `true` if any `processing_logs` have `status='sent'`
- `processing_logs[]` — array of garment-level VA records (from `batch_processing` table)
- `checked_by` — nested user who did QC (nullable)
- `packed_by` — nested user who packed (nullable)
- `packed_at` — timestamp (nullable)
- `pack_reference` — box/bundle label string (nullable)

**New fields (S46):**
- `color_qc` — JSON dict, per-color QC breakdown: `{color: {expected, approved, rejected, reason}}`. Populated by checker at QC step. `null` if legacy flat QC.
- `lot.product_type` — string (BLS, KRT, SAR, DRS, OTH) — used for SKU code generation at pack time.

**Note:** `sku` can be `null` (batches from lot distribution don't have SKU yet — auto-generated at pack time from `color_qc`). `size` is the size bundle (L, XL, XXL, 3XL) — present on distributed batches.

When `sku` is present:
```json
"sku": { "id": "uuid", "sku_code": "BLS-101-Red-M", "product_name": "Design 101 Red Medium" }
```

### POST `/batches`
**Request:** `{ lot_id, sku_id? (nullable), size?, piece_count, color_breakdown?, notes? }`
**Response:** Created batch object

### POST `/batches/{id}/assign`
**Request:** `{ tailor_id: "uuid" }`
**Response:** Updated batch object (status → `assigned`, `assignment` populated)

### GET `/batches/{id}`
**Response:** Single batch object (same shape as list item, with `processing_logs[]`)

### GET `/batches/passport/{batch_code}` (Batch Passport)
**Auth:** None (public — workers scan QR on floor)
**Response:**
```json
{
  "id": "uuid",
  "batch_code": "BATCH-0001",
  "size": "XL",
  "piece_count": 9,
  "status": "in_progress",
  "has_pending_va": true,
  "color_breakdown": { "Green": 6, "Red": 3 },
  "lot": { "id": "uuid", "lot_code": "LT-BLS-0003", "designs": [{"design_no": "1009", "size_pattern": {"L": 2, "XL": 6, "XXL": 6, "3XL": 4}}], "status": "distributed" },
  "design_no": "1009",
  "lot_date": "2026-02-24",
  "designs": [{"design_no": "1009", "size_pattern": {"L": 2, "XL": 6, "XXL": 6, "3XL": 4}}],
  "assignment": {
    "tailor": { "id": "uuid", "full_name": "Amit Singh" },
    "assigned_at": "2026-02-24T11:00:00Z"
  },
  "checked_by": null,
  "packed_by": null,
  "packed_at": null,
  "pack_reference": null,
  "processing_logs": [
    {
      "id": "uuid",
      "challan_no": "BC-001",
      "value_addition": { "id": "uuid", "name": "Hand Stones", "short_code": "HST" },
      "va_party": { "id": "uuid", "name": "Raju Hand-stone Works", "phone": "9876500001", "city": "Surat" },
      "pieces_sent": 9,
      "pieces_received": null,
      "cost": null,
      "status": "sent",
      "phase": "stitching",
      "sent_date": "2026-03-03",
      "received_date": null
    }
  ],
  "created_at": "2026-02-24T10:00:00Z"
}
```

### POST `/batches/claim/{batch_code}` (Tailor Claim)
**Auth:** Required (`batch_start` permission — tailor role)
**Validates:** Batch must have `status = 'created'` (unclaimed).
**Effect:** Creates `BatchAssignment`, sets `status = 'assigned'`.
**Response:** Updated batch object

### POST `/batches/{id}/submit` (Submit for QC)
**Auth:** Required (tailor — must be assigned tailor)
**Validates:** `status = 'in_progress'`. **BLOCKED if `has_pending_va = true`** (pieces still at VA vendor).
**Effect:** `status → 'submitted'`, sets `submitted_at`.
**Error (if VA pending):** `400 — "Cannot submit: X pieces still at VA vendor"`
**Response:** Updated batch object

### POST `/batches/{id}/check` (QC Check)
**Auth:** Required (`batch_check` permission — checker role)
**Request (per-color mode):** `{ color_qc: { "Red": { expected: 92, approved: 90, rejected: 2, reason: "..." }, "Green": { ... } } }`
**Request (legacy flat mode):** `{ approved_qty: 196, rejected_qty: 4, rejection_reason?: "..." }`
**Validates:** Sum of approved + rejected = batch.piece_count. Per-color mode auto-computes totals.
**Effect:**
- Partial/full approval: `status → 'checked'`, sets `checked_at`, `checked_by`
- Full rejection (`rejected_qty = piece_count`): `status → 'in_progress'` (rework)
**Response:** Updated batch object

### POST `/batches/{id}/ready-for-packing` (NEW — S42)
**Auth:** Required (`batch_check` permission — checker role)
**Validates:** `status = 'checked'`. **BLOCKED if `has_pending_va = true`** (pieces still at finishing vendor).
**Effect:** `status → 'packing'`.
**Error (if VA pending):** `400 — "Cannot pack: X pieces still at finishing vendor"`
**Response:** Updated batch object

### POST `/batches/{id}/pack` (NEW — S42)
**Auth:** Required (`batch_assign` permission — supervisor/admin)
**Request:** `{ pack_reference?: "BOX-A12" }`
**Validates:** `status = 'packing'`.
**Effect:** `status → 'packed'`, sets `packed_by`, `packed_at`, `pack_reference`. Creates `InventoryEvent(type='ready_stock_in')`.
**Response:** Updated batch object

### POST `/lots/{id}/distribute` (Lot Distribution → Batch Auto-Creation)
**Auth:** Required (`lot_manage` permission)
**Validates:** Lot must have `status = 'cutting'`.
**Effect:** Auto-creates batches from each design's `size_pattern`. Each batch gets `design_no` from its parent design, `size`, `piece_count = total_pallas`, `color_breakdown` from lot_rolls, `qr_code_data = /scan/batch/{code}`. Lot status → `distributed`.
**Response:** Array of created batch objects

> **Note:** Route ordering in FastAPI: `/passport/{code}`, `/claim/{code}`, `/ready-for-packing`, `/pack` MUST be defined BEFORE `/{batch_id}` — otherwise FastAPI parses path as UUID → 422.

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
**Query:** `OrderFilterParams` — `status`, `source`, `search`, `page`, `page_size`, `sort_by`, `sort_order`
- `search` does `ILIKE` on `order_number` + `customer_name`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "order_number": "ORD-0001",
  "source": "web",
  "external_order_ref": null,
  "customer_id": "uuid | null",
  "customer": { "id": "uuid", "name": "Priya Sharma", "phone": "9876543210", "gst_no": null },
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "customer_address": "12, Ring Road, Surat 395003",
  "status": "pending",
  "notes": "Urgent delivery needed",
  "items": [
    {
      "sku": {
        "id": "uuid",
        "sku_code": "BLS-101-Red-M",
        "product_name": "Design 101 Red Medium",
        "color": "Red",
        "size": "M",
        "base_price": 450.0
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
**IMPORTANT:** `items[].sku` is a nested object with `color`, `size`, `base_price` (S48 extension). Each item has `fulfilled_qty`.

### GET `/orders/{id}`
**Response:** Single order object (same shape as list items). Uses `selectinload` for items + sku.

### POST `/orders`
**Request:**
```json
{
  "source": "web",
  "customer_id": "uuid (optional — links to Customer master)",
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "customer_address": "12, Ring Road, Surat 395003",
  "items": [
    { "sku_id": "uuid", "quantity": 5, "unit_price": 450.0 }
  ],
  "notes": "Optional notes"
}
```
**Response:** Created order object
**Stock validation (S48):** Checks `InventoryState.available_qty` per item. Raises `InsufficientStockError` if insufficient.

### POST `/orders/{id}/ship`
**Response:** Updated order (status → `shipped`) + auto-creates invoice

### POST `/orders/{id}/cancel`
**Response:** Updated order (status → `cancelled`)

---

## 11. Invoices (`/api/v1/invoices`)

### GET `/invoices`
**Query:** `InvoiceFilterParams` — `status`, `search`, `page`, `page_size`, `sort_by`, `sort_order`
- `search` does `ILIKE` on `invoice_number` + `customer_name` (JOIN to Order)
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "invoice_number": "INV-0001",
  "order": {
    "id": "uuid",
    "order_number": "ORD-0002",
    "customer_name": "Anita Verma",
    "customer_phone": "9876543212",
    "customer_address": "45, Textile Market, Ahmedabad 380002"
  },
  "subtotal": 1500.0,
  "tax_amount": 270.0,
  "discount_amount": 0,
  "total_amount": 1770.0,
  "status": "paid",
  "issued_at": "2026-02-07T15:00:00Z",
  "paid_at": "2026-02-07T16:00:00Z",
  "created_at": "2026-02-07T15:00:00Z",
  "items": [
    {
      "sku": {
        "id": "uuid",
        "sku_code": "BLS-102-Blue-L",
        "product_name": "Design 102 Blue Large",
        "color": "Blue",
        "size": "L",
        "base_price": 500.0
      },
      "quantity": 3,
      "unit_price": 500.0,
      "total_price": 1500.0
    }
  ]
}
```
**IMPORTANT:** `order` is a nested object with `id`, `order_number`, `customer_name`, `customer_phone`, `customer_address` (S48 extension). `items[].sku` includes `color`, `size`, `base_price`.

### GET `/invoices/{id}`
**Response:** Single invoice object (same shape as list items). Uses `selectinload` for order + items + sku.

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
  "batches": {
    "created": 0, "assigned": 1, "in_progress": 0, "submitted": 0,
    "checked": 0, "packing": 0, "packed": 1,
    "checked_today": 1, "packed_today": 1
  },
  "inventory": { "total_skus": 3, "low_stock_skus": 0 },
  "orders": { "pending": 1, "processing": 1, "shipped_today": 1 },
  "revenue_today": 1770.0,
  "revenue_month": 12500.0,
  "rolls_out_house": 1,
  "batches_out_house": 0,
  "ready_stock_pieces": 196
}
```

**New fields (S45):**
- `batches.checked/packing/packed` — 7-state pipeline counts (replaces old `completed_today`)
- `batches.checked_today` — batches that passed QC today
- `batches.packed_today` — batches packed today
- `rolls_out_house` — rolls with `status='sent_for_processing'`
- `batches_out_house` — distinct batches with pending `BatchProcessing` records (`status='sent'`)
- `ready_stock_pieces` — total `piece_count` of all `packed` batches

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
      "lot_code": "LT-BLS-0001",
      "designs": [{"design_no": "702", "size_pattern": {"L": 2, "XL": 6}}],
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

## 14. Roll Passport (`/api/v1/rolls`)

> Phase 1. Single endpoint. No auth required (public scan URL).

### GET `/rolls/{roll_code}/passport`
**Auth:** None (public — workers scan on floor)
**Response:**
```json
{
  "roll_code": "1-COT-PINK/07-01",
  "status": "in_stock",
  "fabric_type": "Cotton",
  "color": "Pink",
  "color_no": 7,
  "total_weight": 45.5,
  "remaining_weight": 35.0,
  "current_weight": 47.8,
  "unit": "kg",
  "sr_no": "1",
  "supplier_invoice_no": "INV-001",
  "supplier_challan_no": "CH-001",
  "supplier_invoice_date": "2026-02-15",
  "received_at": "2026-02-15T10:00:00Z",
  "supplier": { "id": "uuid", "name": "Ratan Fabrics", "phone": "9999900001" },
  "received_by_user": { "id": "uuid", "full_name": "Nitish Admin" },
  "value_additions": [
    {
      "id": "uuid",
      "name": "Embroidery",
      "short_code": "EMB",
      "va_party": { "id": "uuid", "name": "Sonu Works", "phone": "9999900002", "city": "Surat" },
      "sent_date": "2026-02-10",
      "received_date": "2026-02-15",
      "processing_cost": 2500.00,
      "status": "received",
      "notes": "Floral pattern"
    }
  ],
  "lots": [
    {
      "id": "uuid",
      "lot_code": "LT-BLS-0001",
      "lot_date": "2026-02-20",
      "designs": [{"design_no": "101", "size_pattern": {"L": 4, "XL": 4}}],
      "weight_used": 10.5,
      "waste_weight": 0.5,
      "pieces_from_roll": 200,
      "status": "distributed"
    }
  ],
  "batches": [
    {
      "id": "uuid",
      "batch_code": "BAT-001",
      "sku_code": "BLS-101-Pink-M",
      "effective_sku": "BLS-101-Pink-M+EMB",
      "quantity": 50,
      "status": "STARTED",
      "tailor": { "id": "uuid", "full_name": "Ramesh Kumar" }
    }
  ],
  "orders": [
    {
      "id": "uuid",
      "order_number": "ORD-001",
      "customer_name": "Fashion Hub",
      "status": "processing"
    }
  ],
  "effective_sku": "BLS-101-Pink-M+EMB"
}
```

**Note:** `effective_sku` = `batch.sku.sku_code` + completed value addition short_codes (status='received').
If roll is not yet in a batch, `effective_sku` is `null`.

---

## 15. Value Additions (`/api/v1/masters/value-additions`)

> Phase 2. Master data entity. Admin/supervisor only.
> Controls which process types appear in effective SKU suffix.
> **S42 update:** Added `applicable_to` field — filters VAs by roll/garment context.

### GET `/masters/value-additions`
**Query:** `applicable_to` (`roll`|`garment`|`both`|omit for all)
**Response:** Array of:
```json
{
  "id": "uuid",
  "name": "Embroidery",
  "short_code": "EMB",
  "applicable_to": "both",
  "description": "Machine/hand embroidery on fabric or garments",
  "is_active": true
}
```

### POST `/masters/value-additions`
**Request:** `{ name, short_code (3-4 chars uppercase), applicable_to? (default: "both"), description? }`
**Response:** Created value addition object

### PATCH `/masters/value-additions/{id}`
**Request:** `{ name?, short_code?, applicable_to?, description?, is_active? }`
**Response:** Updated value addition

### Downstream Filtering
- **Job Challan** (roll VA send): shows VAs where `applicable_to` = `'roll'` or `'both'`
- **Batch Challan** (garment VA send): shows VAs where `applicable_to` = `'garment'` or `'both'`
- **Masters page**: shows all with colored badge (Roll=purple, Garment=green, Both=blue)

### Seed Data (auto-seeded on first run — 10 entries)
```json
[
  { "name": "Embroidery",    "short_code": "EMB", "applicable_to": "both" },
  { "name": "Dying",         "short_code": "DYE", "applicable_to": "roll" },
  { "name": "Digital Print", "short_code": "DPT", "applicable_to": "both" },
  { "name": "Handwork",      "short_code": "HWK", "applicable_to": "both" },
  { "name": "Sequin Work",   "short_code": "SQN", "applicable_to": "both" },
  { "name": "Batik",         "short_code": "BTC", "applicable_to": "roll" },
  { "name": "Hand Stones",   "short_code": "HST", "applicable_to": "garment" },
  { "name": "Button Work",   "short_code": "BTN", "applicable_to": "garment" },
  { "name": "Lace Work",     "short_code": "LCW", "applicable_to": "garment" },
  { "name": "Finishing",     "short_code": "FIN", "applicable_to": "garment" }
]
```

### Updated RollProcessing shape (Phase 2 + Partial Weight)

Every processing log has a required `value_addition_id` (no more `process_type`).
`weight_before` = the partial amount sent (not full roll weight). Can be less than `current_weight` for partial sends.
```json
{
  "id": "uuid",
  "roll_id": "uuid",
  "value_addition_id": "uuid",
  "value_addition": { "id": "uuid", "name": "Embroidery", "short_code": "EMB" },
  "va_party": { "id": "uuid", "name": "Sonu Works", "phone": "9999900002", "city": "Surat" },
  "sent_date": "2026-02-10",
  "received_date": "2026-02-15",
  "weight_before": 20.0,
  "weight_after": 20.5,
  "processing_cost": 2500.00,
  "status": "received",
  "notes": "",
  "job_challan_id": "uuid | null"
}
```

---

## 15b. VA Parties (`/api/v1/masters/va-parties`) — S69, enriched S73

> Value Addition party/vendor master. Stores external processors (embroidery houses, dye works, etc.)

### GET `/masters/va-parties`
**Response:** Array of:
```json
{
  "id": "uuid",
  "name": "Pasupatti Trendz",
  "contact_person": "Rajesh Patel",
  "phone": "9876543210",
  "phone_alt": null,
  "email": null,
  "address": "Diamond Industrial Estate",
  "city": "Surat",
  "state": "Gujarat",
  "pin_code": "395004",
  "gst_no": "24AABCT1332L1ZH",
  "gst_type": "regular",
  "state_code": "24",
  "pan_no": "AABCT1332L",
  "aadhar_no": null,
  "hsn_code": "5407",
  "due_days": 15,
  "credit_limit": null,
  "opening_balance": null,
  "balance_type": null,
  "tds_applicable": true,
  "tds_rate": 1.0,
  "tds_section": "194C",
  "msme_type": "micro",
  "msme_reg_no": "UDYAM-GJ-02-0054321",
  "notes": null,
  "is_active": true,
  "created_at": "2026-03-12T10:00:00Z"
}
```
**S73 enrichment:** +19 fields (contact_person, phone_alt, email, address, state, pin_code, gst_type, state_code, pan_no, aadhar_no, due_days, credit_limit, opening_balance, balance_type, tds_applicable, tds_rate, tds_section, msme_type, msme_reg_no, notes)

### GET `/masters/va-parties/all`
**Response:** Array (active only, for dropdowns)

### POST `/masters/va-parties`
**Request:** `{ name (required), contact_person?, phone?, phone_alt?, email?, address?, city?, state?, pin_code?, gst_no?, gst_type?, state_code?, pan_no?, aadhar_no?, hsn_code?, due_days?, credit_limit?, opening_balance?, balance_type?, tds_applicable?, tds_rate?, tds_section?, msme_type?, msme_reg_no?, notes? }`
**Response:** Created VA Party

### PATCH `/masters/va-parties/{id}`
**Request:** All fields optional + `is_active?`
**Response:** Updated VA Party

---

## §16. Job Challans

### POST `/job-challans` (Create Job Challan + Bulk Send)
**Auth:** Required (stock_in permission)

Creates a job challan and sends all specified rolls for processing atomically.

**Request:**
```json
{
  "value_addition_id": "uuid (required)",
  "va_party_id": "uuid",
  "sent_date": "2026-02-09",
  "notes": "Chikan embroidery on all rolls",
  "rolls": [
    { "roll_id": "uuid", "weight_to_send": 20.000 },
    { "roll_id": "uuid", "weight_to_send": null }
  ]
}
```
- `rolls[].weight_to_send` (optional): partial weight per roll. `null` = full `remaining_weight`.
- Same validation as individual send: `0 < weight_to_send <= remaining_weight`.
- Each roll gets a `RollProcessing` log linked to the challan (`job_challan_id`).
- Rolls with `remaining_weight > 0` after send stay `in_stock`.

**Response:**
```json
{
  "id": "uuid",
  "challan_no": "JC-001",
  "value_addition": { "id": "uuid", "name": "Embroidery", "short_code": "EMB" },
  "va_party": { "id": "uuid", "name": "Shree Embroidery Works", "phone": "9898123456", "city": "Surat" },
  "sent_date": "2026-02-09",
  "received_date": null,
  "status": "sent",
  "notes": "Chikan embroidery on all rolls",
  "created_by_user": { "id": "uuid", "full_name": "Admin User" },
  "created_at": "2026-02-09T10:30:00Z",
  "rolls": [
    {
      "id": "uuid",
      "roll_code": "1-COT-GREEN/01-01",
      "enhanced_roll_code": "1-COT-GREEN/01-01",
      "fabric_type": "Cotton",
      "color": "Green",
      "current_weight": 50.0,
      "weight_sent": 20.0
    }
  ],
  "total_weight": 20.0,
  "roll_count": 1
}
```

### GET `/job-challans` (List Job Challans)
**Auth:** Required
**Query:** `va_party_id`, `value_addition_id`, `status` (`sent`|`partially_received`|`received`), `page`, `page_size`
**Response:** Paginated list of challan objects (same shape as create response).

### GET `/job-challans/{id}` (Get Job Challan)
**Auth:** Required
**Response:** Single challan object with full roll details.

### PATCH `/job-challans/{id}` (Update Job Challan)
**Auth:** Required
**Request:** All fields optional — only send changed fields:
```json
{
  "va_party_id": "uuid",
  "value_addition_id": "uuid",
  "sent_date": "2026-02-09",
  "notes": "Updated notes"
}
```
**Response:** Updated challan object (same shape as create response).

### POST `/job-challans/{id}/receive` (Receive Rolls Back from VA) — NEW S71
**Auth:** Required (`stock_in` permission)

Bulk receive rolls in a single transaction. Supports partial receive (uncheck some rolls).
Replaces sequential per-roll `receiveFromProcessing` calls.

**Request:**
```json
{
  "received_date": "2026-03-15",
  "rolls": [
    { "roll_id": "uuid", "processing_id": "uuid", "weight_after": 19.500, "processing_cost": 500.00 },
    { "roll_id": "uuid", "processing_id": "uuid", "weight_after": 27.200, "processing_cost": null }
  ],
  "notes": "All rolls returned in good condition"
}
```
- `rolls[]`: only include checked/selected rolls — unchecked rolls stay `sent`
- `processing_cost`: optional per roll
- `notes`: optional, appended to challan notes

**Effect per roll:**
- `RollProcessing.status → 'received'`, fills `weight_after`, `processing_cost`, `received_date`
- Roll: `remaining_weight += weight_after`, `current_weight += (weight_after - weight_before)`
- Roll status: counts ALL remaining `sent` logs (across all challans) — only returns to `in_stock` when zero sent logs remain

**Challan status logic:**
- All rolls received → `status = 'received'`, `received_date` set
- Some rolls received → `status = 'partially_received'`
- Already-received rolls are skipped (idempotent)

**Response:** Updated challan object (same shape as create response, with `status` and `received_date`)

---

## 17. Batch Challans (`/api/v1/batch-challans`) — NEW S42

> Garment-level Value Addition tracking. Mirrors Job Challans (§16) but for batches (pieces) instead of rolls (weight).
> **Models:** `STEP2_DATA_MODEL.md` §2.2 | **State machine:** `STEP3_EVENT_CONTRACTS.md` §3.4

### POST `/batch-challans` (Create + Send Batches for VA)
**Auth:** Required (`batch_assign` permission — supervisor/admin)
**Request:**
```json
{
  "va_party_id": "uuid",
  "value_addition_id": "uuid",
  "batches": [
    { "batch_id": "uuid", "pieces_to_send": 15 },
    { "batch_id": "uuid", "pieces_to_send": 20 }
  ],
  "notes": "Hand stones on neckline area"
}
```
**Validates:**
- Each batch must be in `in_progress` or `checked` status (VA allowed states)
- `pieces_to_send > 0` and `<= batch.piece_count`
- `value_addition_id` must have `applicable_to` = `'garment'` or `'both'`

**Effect:** Creates `BatchChallan` + one `BatchProcessing` record per batch (atomic transaction). Each record gets `phase` = `'stitching'` (if batch `in_progress`) or `'post_qc'` (if batch `checked`). Auto-sequential `challan_no`: BC-001, BC-002...

**Response:**
```json
{
  "id": "uuid",
  "challan_no": "BC-001",
  "va_party": { "id": "uuid", "name": "Raju Hand-stone Works", "phone": "9876500001", "city": "Surat" },
  "value_addition": { "id": "uuid", "name": "Hand Stones", "short_code": "HST" },
  "total_pieces": 35,
  "total_cost": null,
  "status": "sent",
  "sent_date": "2026-03-03T10:00:00Z",
  "received_date": null,
  "notes": "Hand stones on neckline area",
  "created_by_user": { "id": "uuid", "full_name": "Ravi Kumar" },
  "created_at": "2026-03-03T10:00:00Z",
  "batch_items": [
    {
      "id": "uuid",
      "batch": { "id": "uuid", "batch_code": "BATCH-0001", "size": "XL" },
      "pieces_sent": 15,
      "pieces_received": null,
      "cost": null,
      "status": "sent",
      "phase": "stitching"
    },
    {
      "id": "uuid",
      "batch": { "id": "uuid", "batch_code": "BATCH-0002", "size": "L" },
      "pieces_sent": 20,
      "pieces_received": null,
      "cost": null,
      "status": "sent",
      "phase": "stitching"
    }
  ]
}
```

### GET `/batch-challans` (List)
**Auth:** Required
**Query:** `va_party_id`, `value_addition_id`, `status` (`sent`|`partially_received`|`received`), `page`, `page_size`
**Response:** Paginated list of challan objects (same shape as create response).

### GET `/batch-challans/{id}` (Detail)
**Auth:** Required
**Response:** Single challan object with full `batch_items[]`.

### PATCH `/batch-challans/{id}` (Update Batch Challan)
**Auth:** Required
**Request:** All fields optional — only send changed fields:
```json
{
  "va_party_id": "uuid",
  "value_addition_id": "uuid",
  "notes": "Updated notes"
}
```
**Response:** Updated challan object (same shape as create response).

### POST `/batch-challans/{id}/receive` (Receive Batches Back from VA)
**Auth:** Required (`batch_assign` permission — supervisor/admin)
**Request:**
```json
{
  "batches": [
    { "batch_id": "uuid", "pieces_received": 15, "cost": 2500.00 },
    { "batch_id": "uuid", "pieces_received": 20, "cost": 3200.00 }
  ],
  "notes": "All pieces returned in good condition"
}
```
**Effect:** Updates each `BatchProcessing` record (`status → 'received'`, fills `pieces_received`, `cost`, `received_date`). Challan status: all received → `'received'`, some received → `'partially_received'`. `total_cost` = sum of costs.
**Response:** Updated challan object

---

## 18. Customers (`/api/v1/customers`) — NEW S73

### GET `/customers`
**Auth:** `supplier_manage` permission
**Query:** `is_active`, `search`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "name": "Fashion Hub",
  "short_name": "FH",
  "contact_person": "Priya Sharma",
  "phone": "9876543210",
  "phone_alt": null,
  "email": "priya@fashionhub.com",
  "address": "12, Ring Road, Textile Market",
  "city": "Surat",
  "state": "Gujarat",
  "pin_code": "395003",
  "gst_no": "24AABCF5678K1Z2",
  "gst_type": "regular",
  "state_code": "24",
  "pan_no": "AABCF5678K",
  "aadhar_no": null,
  "due_days": 45,
  "credit_limit": 1000000.00,
  "opening_balance": 0.00,
  "balance_type": "credit",
  "tds_applicable": false,
  "tds_rate": null,
  "tds_section": null,
  "tcs_applicable": true,
  "tcs_rate": 0.1,
  "tcs_section": "206C(1H)",
  "broker": "Narendra Singh",
  "notes": null,
  "is_active": true,
  "created_at": "2026-03-16T10:00:00Z"
}
```

### GET `/customers/all`
**Auth:** `supplier_manage` permission
**Response:** Array of `CustomerBrief` (active only, for dropdowns):
```json
{ "id": "uuid", "name": "Fashion Hub", "phone": "9876543210", "city": "Surat", "gst_no": "24AABCF5678K1Z2" }
```

### GET `/customers/{customer_id}`
**Response:** Single customer object (same shape as list)

### POST `/customers`
**Request:** `{ name (required), short_name?, contact_person?, phone?, phone_alt?, email?, address?, city?, state?, pin_code?, gst_no?, gst_type?, state_code?, pan_no?, aadhar_no?, due_days?, credit_limit?, opening_balance?, balance_type?, tds_applicable?, tds_rate?, tds_section?, tcs_applicable?, tcs_rate?, tcs_section?, broker?, notes? }`
**Response:** Single customer object

### PATCH `/customers/{customer_id}`
**Request:** All fields optional + `is_active?`
**Response:** Updated customer object

---

## 19. Ledger (`/api/v1/ledger`) — NEW S74

> Tracks financial entries (debits/credits) per party. Auto-entries created by stock-in (supplier), invoice (customer), JC/BC receive (VA party). Manual payments via POST.

### GET `/ledger`
**Auth:** `supplier_manage` permission
**Query:** `party_type` (required: `supplier`|`customer`|`va_party`), `party_id` (required: UUID), `entry_type?`, `date_from?`, `date_to?`, `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "entry_date": "2026-03-16",
  "party_type": "supplier",
  "party_id": "uuid",
  "entry_type": "stock_in",
  "reference_type": "supplier_invoice",
  "reference_id": "uuid",
  "debit": 11100.00,
  "credit": 0.00,
  "tds_amount": null,
  "tds_section": null,
  "tcs_amount": null,
  "net_amount": 11100.00,
  "description": "Stock-in: 5 rolls, Invoice KT-2026-0451",
  "fy_id": "uuid",
  "created_by": "uuid | null",
  "notes": null,
  "created_at": "2026-03-16T10:00:00Z"
}
```

### GET `/ledger/balance`
**Auth:** `supplier_manage` permission
**Query:** `party_type` (required), `party_id` (required)
**Response:**
```json
{
  "party_type": "supplier",
  "party_id": "uuid",
  "party_name": "Krishna Textiles",
  "total_debit": 55000.00,
  "total_credit": 30000.00,
  "balance": 25000.00,
  "balance_type": "dr"
}
```

### GET `/ledger/balances`
**Auth:** `supplier_manage` permission
**Query:** `party_type` (required: `supplier`|`customer`|`va_party`)
**Response:** Array of `PartyBalanceResponse` (same shape as above, one per party)

### POST `/ledger/payment`
**Auth:** `supplier_manage` permission
**Request:**
```json
{
  "party_type": "supplier",
  "party_id": "uuid",
  "amount": 25000.00,
  "payment_date": "2026-03-16",
  "payment_mode": "neft",
  "reference_no": "UTR123456789",
  "tds_applicable": true,
  "tds_rate": 1.0,
  "tds_section": "194C",
  "tcs_applicable": false,
  "tcs_rate": null,
  "tcs_section": null,
  "notes": "March payment"
}
```
**Response:** Created ledger entry object
**Auto-entry wiring (S74):** Stock-in → supplier debit, Invoice → customer debit, JC/BC receive → VA party debit

---

## 20. Company & Financial Years (`/api/v1`) — NEW S74

### GET `/company`
**Auth:** `supplier_manage` permission
**Response:**
```json
{
  "id": "uuid",
  "name": "Dr's Blouse",
  "address": "45, Ring Road",
  "city": "Surat",
  "state": "Gujarat",
  "pin_code": "395002",
  "gst_no": "24AABCD1234F1Z5",
  "state_code": "24",
  "pan_no": "AABCD1234F",
  "phone": "9876543210",
  "email": "info@drsblouse.com",
  "logo_url": null,
  "bank_name": "HDFC Bank",
  "bank_account": "50200012345678",
  "bank_ifsc": "HDFC0001234",
  "bank_branch": "Ring Road, Surat"
}
```

### PATCH `/company`
**Auth:** `supplier_manage` permission
**Request:** All fields optional: `{ name?, address?, city?, state?, pin_code?, gst_no?, state_code?, pan_no?, phone?, email?, logo_url?, bank_name?, bank_account?, bank_ifsc?, bank_branch? }`
**Response:** Updated company object

### GET `/financial-years`
**Auth:** `supplier_manage` permission
**Response:** Array of:
```json
{
  "id": "uuid",
  "code": "FY2026-27",
  "start_date": "2026-04-01",
  "end_date": "2027-03-31",
  "status": "open",
  "is_current": true,
  "closed_by": null,
  "closed_at": null,
  "created_at": "2026-03-16T10:00:00Z"
}
```

### GET `/financial-years/current`
**Response:** Single FY object (the one with `is_current = true`)

### POST `/financial-years`
**Auth:** `supplier_manage` permission
**Request:** `{ code, start_date, end_date, is_current? (default false) }`
**Response:** Created FY object

### PATCH `/financial-years/{fy_id}`
**Auth:** `supplier_manage` permission
**Request:** `{ code?, start_date?, end_date?, is_current? }`
**Response:** Updated FY object

### DELETE `/financial-years/{fy_id}`
**Auth:** `supplier_manage` permission
**Validation:** Rejects if FY has linked data (rolls, orders, invoices, ledger entries, etc.)
**Response:** `{ message: "Financial year deleted" }`

### GET `/financial-years/{id}/close-preview`
**Auth:** `supplier_manage` permission
**Response:**
```json
{
  "fy": { "id": "uuid", "code": "FY2025-26", "start_date": "2025-04-01", "end_date": "2026-03-31" },
  "warnings": ["3 rolls still in_stock from this FY", "1 order still pending"],
  "balances": [
    { "party_type": "supplier", "party_id": "uuid", "party_name": "Krishna Textiles", "balance": 25000.00, "balance_type": "dr" },
    { "party_type": "customer", "party_id": "uuid", "party_name": "Mehta Stores", "balance": 12000.00, "balance_type": "cr" }
  ],
  "new_fy": { "code": "FY2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31" }
}
```
**Purpose:** Preview what will happen before committing. Shows balance snapshot + warnings about open items.

### POST `/financial-years/{id}/close`
**Auth:** `supplier_manage` permission
**Request:** `{}` (no body needed -- preview must be reviewed first via UI)
**Response:**
```json
{
  "closed_fy": { "id": "uuid", "code": "FY2025-26", "status": "closed", "closed_at": "2026-03-17T10:00:00Z" },
  "new_fy": { "id": "uuid", "code": "FY2026-27", "status": "open", "is_current": true, "start_date": "2026-04-01", "end_date": "2027-03-31" },
  "opening_entries_count": 5
}
```
**Effect (atomic, single transaction):**
1. Validates FY is `open` and `is_current`
2. Snapshots all party balances (stored in `closing_snapshot` table)
3. Sets old FY `status = 'closed'`, `closed_by`, `closed_at`
4. Creates new FY (next year dates, `is_current = true`)
5. Creates opening ledger entries in new FY carrying forward party balances
6. Stock quantities are NOT carried forward (they persist across FYs naturally)

**Note:** `fy_id` FK exists on Roll, Lot, Batch, Order, Invoice, SupplierInvoice, JobChallan, BatchChallan, LedgerEntry. See "Financial Year Scoping" section above for counter reset and cross-FY visibility rules.

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
| Roll    | `in_stock`, `sent_for_processing`, `in_cutting`, `remnant` |
| Roll Processing | `sent`, `received` |
| Lot     | `open`, `cutting`, `distributed` |
| Batch   | `created`, `assigned`, `in_progress`, `submitted`, `checked`, `packing`, `packed` |
| Batch Processing | `sent`, `received` |
| Job Challan | `sent`, `partially_received`, `received` |
| Batch Challan | `sent`, `partially_received`, `received` |
| Order   | `pending`, `processing`, `shipped`, `returned`, `cancelled` |
| Invoice | `issued`, `paid` |
| Financial Year | `open`, `closed` |
| Ledger Entry Type | `stock_in`, `payment`, `invoice`, `va_receive`, `tds`, `tcs`, `adjustment`, `opening` |

## Appendix C: Nested Object Patterns

Backend MUST return these as nested objects, NOT flat IDs:

| Field | Where Used | Shape |
|-------|-----------|-------|
| `role` | Users, Auth login | `{ id, name, display_name }` |
| `supplier` | Rolls | `{ id, name }` |
| `received_by_user` | Rolls | `{ id, full_name }` |
| `created_by_user` | Lots, Batches | `{ id, full_name }` |
| `tailor` | Batches (inside `assignment`) | `{ id, full_name }` |
| `lot` | Batches | `{ id, lot_code, designs, product_type, total_pieces, status }` |
| `sku` | Batches, Inventory, Orders, Invoices | varies — see each section |
| `order` | Invoices | `{ order_number, customer_name }` |
| `customer` | Orders | `{ id, name, phone, gst_no }` |
| `performed_by` | Inventory Events | `{ id, full_name }` |
| `stock` | SKUs | `{ total_qty, available_qty, reserved_qty }` |
| `period` | Inventory Movement | `{ from, to }` |
| `checked_by` | Batches | `{ id, full_name }` |
| `packed_by` | Batches | `{ id, full_name }` |
| `value_addition` | RollProcessing, BatchProcessing, JobChallan, BatchChallan | `{ id, name, short_code }` |
| `va_party` | RollProcessing, JobChallan, BatchChallan | `{ id, name, phone, city }` |
| `batch` | BatchChallan items | `{ id, batch_code, size }` |
| `color_obj` | Rolls, SKUs | `{ id, name, code, color_no }` |
| `company` | Auth login/me/select-company | `{ id, name, slug, schema_name }` |
| `fy` | Auth login/me/select-company | `{ id, code, start_date, end_date }` |

## Appendix D: Auth & FY Error Responses (S77)

| Status | Message | When |
|--------|---------|------|
| 400 | `No financial year selected. Please select a company with an active financial year.` | Any create endpoint when JWT has no `fy_id` |
| 401 | `Token has been revoked. Please login again.` | Token `jti` found in `public.token_blacklist` |
| 401 | `Token expired` | Access token past expiry (frontend should call `/auth/refresh`) |
| 401 | `Refresh token expired` | Refresh token past expiry (user must re-login) |
| 401 | `Invalid token` | Malformed or tampered JWT |
