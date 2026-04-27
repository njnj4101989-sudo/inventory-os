# API_REFERENCE.md — The Single Source of Truth

> **Generated from:** `frontend/src/api/mock.js` + all 25 API modules
> **Date:** 2026-02-17 (Session 18) | **Updated:** 2026-04-27 (Session 116 — +2 dashboard endpoints: wastage-report + wastage-report.csv [P4.7])
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
- `LOT-XXXX`, `BATCH-XXXX`, `ORD-XXXX`, `INV-XXXX`, `SHP-XXXX`, `RN-XXXX`, `SRN-XXXX` — reset to 0001
- `JC-XXX`, `BC-XXX` — reset to 001
- `CN-XXXX`, `DN-XXXX` — reset to 0001 (credit/debit notes)
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

### POST `/rolls/{id}/write-off`
**Auth:** `stock_in` permission required
**Request:** `{ reason: 'too_small' | 'damaged' | 'expired' | 'other', notes?: string }`
**Guard:** Roll status must be `'remnant'`. Returns 400 `InvalidStateTransitionError` otherwise.
**Effect:** Sets `status='written_off'`, `remaining_weight=0`, and stores audit fields (`write_off_reason`, `write_off_notes`, `written_off_at`, `written_off_by`). Written-off rolls are excluded from all active pickers (lots, job challans).
**Response:** `{ success: true, data: <roll>, message: 'Roll written off' }`

### POST `/rolls/bulk-write-off`
**Auth:** `stock_in` permission required
**Request:** `{ roll_ids: [UUID], reason: 'too_small' | 'damaged' | 'expired' | 'other', notes?: string }`
**Behaviour:** Iterates roll_ids with per-roll FOR UPDATE lock. Each roll must be `status='remnant'`; ineligible rolls are **skipped** and recorded in `failed[]` without aborting the batch. All processed rolls share the same `written_off_at` timestamp.
**Response:**
```json
{
  "success": true,
  "data": {
    "processed": 12,
    "processed_ids": ["uuid", ...],
    "failed": [{ "roll_id": "uuid", "roll_code": "...", "error": "Not a remnant roll (status: 'in_stock')" }]
  },
  "message": "Wrote off 12 roll(s)"
}
```

### GET `/rolls?status=sent_for_processing` (Processing Rolls)
Same as `GET /rolls` with status filter pre-applied.

### ~~POST `/rolls/{id}/processing`~~ — REMOVED (S84)
> **Replaced by:** `POST /job-challans` (§16). All roll VA sends now go through Job Challans exclusively. Single-roll sends create a 1-roll challan. The standalone endpoint, schema (`SendForProcessing`), service method, and frontend API function have been deleted.

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

### POST `/rolls/opening-stock` — NEW S96
**Auth:** `stock_in` permission required
**Purpose:** Bulk opening roll stock entry for Day 1 setup. No supplier invoice, no ledger entry. Supports both in-godown and at-VA rolls.
**Request:**
```json
{
  "rolls": [
    {
      "fabric_type": "Cotton",
      "color": "Green",
      "color_id": "uuid | null",
      "total_weight": 18.800,
      "cost_per_unit": 120.0,
      "sr_no": null,
      "panna": 44,
      "gsm": 180,
      "notes": null,
      "fabric_code": "COT",
      "color_code": "GREEN",
      "color_no": 1,
      "at_va": false
    },
    {
      "fabric_type": "Silk",
      "color": "Red",
      "total_weight": 22.500,
      "cost_per_unit": 250.0,
      "at_va": true,
      "va_party_id": "uuid",
      "value_addition_id": "uuid",
      "sent_date": "2026-03-15",
      "weight_sent": 22.500
    }
  ]
}
```
**Response:**
```json
{
  "count": 5,
  "in_stock_count": 3,
  "at_va_count": 2,
  "roll_codes": ["OPEN-COT-GREEN/01-01", "OPEN-SLK-RED/02-01", ...],
  "message": "5 opening stock rolls created (3 in godown, 2 at VA vendor)"
}
```
**Notes:**
- Rolls in godown: `status="in_stock"`, `remaining_weight=total_weight`
- Rolls at VA: `status="sent_for_processing"`, `remaining_weight=0`, creates `RollProcessing` log with `status="sent"` — so the normal receive flow works when VA vendor returns them
- `at_va=true` requires: `va_party_id`, `value_addition_id`, `sent_date`; `weight_sent` defaults to `total_weight` if omitted
- No `supplier_invoice_id`, no ledger entry. Max 200 rolls per request.
- Roll codes use "OPEN" as challan prefix. Notes prefixed with `[Opening Stock]` / `[At VA]`.

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
  "subtotal": 11100.00,
  "discount_amount": 0,
  "additional_amount": 0,
  "tax_amount": 1332.00,
  "total_amount": 12432.00,
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
- `total_value` = sum of `total_weight * cost_per_unit` per roll (raw subtotal)
- **S118 — purchase-side totals symmetry:** `subtotal`, `discount_amount`, `additional_amount`, `tax_amount`, `total_amount` come from the stored `SupplierInvoice` record (post-S118). For legacy SIs without stored totals, the response falls back to `gst_amount` / `total_with_gst` synthesised from rolls.
- Math: `taxable = subtotal − discount + additional`; `tax = taxable × gst_pct / 100`; `total = taxable + tax`
- `gst_percent` — from linked `SupplierInvoice` record (0 if no link)
- `gst_amount` (legacy) = `total_value * gst_percent / 100` (2 decimal places)
- `total_with_gst` (legacy) = `total_value + gst_amount`
- `supplier_invoice_id` — FK to `SupplierInvoice` record (null for legacy rolls)
- Rolls without `supplier_invoice_no` get unique key `NO-INV-{roll_id}` (shown as standalone)

### PATCH `/rolls/supplier-invoices/{id}` (Update Supplier Invoice)
**Auth:** `stock_in` permission required
**Purpose:** Update invoice-level fields (e.g., GST%) on the `SupplierInvoice` record.

**Request:** (all fields optional)
```json
{
  "gst_percent": 18,
  "discount_amount": 0,
  "additional_amount": 0,
  "invoice_no": "KT-2026-0451",
  "challan_no": "CH-451",
  "invoice_date": "2026-02-06",
  "sr_no": "1",
  "notes": "Updated"
}
```
**Allowed fields:** `gst_percent`, `discount_amount`, `additional_amount`, `invoice_no`, `challan_no`, `invoice_date`, `sr_no`, `notes`. When any of `gst_percent`/`discount_amount`/`additional_amount` change, the SI's stored `subtotal`/`tax_amount`/`total_amount` are recomputed from the rolls + items aggregate and the supplier ledger entry is replaced (S118).

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

### GET `/skus/grouped` (S112)
**Query:** `page` (default 1), `page_size` (default 25, `0` = no limit), `search`, `product_type`, `is_active`, `stock_status` (`in_stock` | `out_of_stock`)
**Response:** Paginated array of design groups — each row is one design, with its SKUs nested inside:
```json
{
  "success": true,
  "data": [
    {
      "design_key": "FBL-Anarkali",
      "product_type": "FBL",
      "design_no": "Anarkali",
      "sku_count": 2,
      "colors": ["Green", "Teal"],
      "sizes": ["XL"],
      "price_min": 450.0,
      "price_max": 650.0,
      "total_qty": 12,
      "available_qty": 0,
      "reserved_qty": 12,
      "skus": [ /* full SKU objects — same shape as GET /skus, see below */ ]
    }
  ],
  "total": 487,
  "page": 1,
  "pages": 20
}
```
**Notes:**
- `total` = design group count (NOT SKU count) — pagination math is over groups, so every page shows exactly `page_size` rows (consistent table height).
- Group key derived via SQL `SPLIT_PART(sku_code, '-', 1) || '-' || SPLIT_PART(sku_code, '-', 2)` — handles legacy SKUs with NULL `design_id`.
- Sort: groups ordered by `MAX(sku.created_at) DESC` — newest designs first.
- `stock_status` filters individual SKUs; a group appears if ANY of its SKUs match. Aggregates (`total_qty`, `colors`, etc.) reflect matching SKUs only.
- **Use this endpoint instead of `GET /skus` when rendering the SKUs accordion page.** Flat `GET /skus` remains for picker dropdowns, stock-check, bulk operations.

### GET `/skus/summary` (S112)
**Response:** Global SKU KPI aggregates — scoped per company/FY via tenant middleware:
```json
{
  "success": true,
  "data": {
    "total_skus": 1784,
    "in_stock_skus": 20,
    "total_pieces": 1151,
    "auto_generated": 0
  }
}
```
**Notes:**
- 4 aggregate SQL queries, no row fetch — fast.
- `auto_generated` = count of SKUs whose `sku_code` contains `+` (VA suffix like `+EMB`), i.e. pack-time auto-generated.
- Used by `SKUsPage.jsx` KPI bar to show global totals — **never compute KPIs from the paginated/grouped list**, they'd only reflect the current page.

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

### POST `/skus/purchase-stock` (S85)
**Request:**
```json
{
  "supplier_id": "uuid",
  "invoice_no": "INV-001",
  "challan_no": "CH-001",
  "invoice_date": "2026-03-27",
  "sr_no": "42",
  "gst_percent": 12,
  "notes": "Purchased blouses from vendor",
  "line_items": [
    { "product_type": "FBL", "design_no": "702", "color": "Red", "size": "M", "qty": 50, "unit_price": 150.00 },
    { "product_type": "FBL", "design_no": "702", "color": "Red", "size": "L", "qty": 30, "unit_price": 150.00 }
  ]
}
```
**Response:**
```json
{
  "invoice_id": "uuid",
  "invoice_no": "INV-001",
  "items_created": 2,
  "items": [{ "sku_id": "uuid", "sku_code": "FBL-702-Red-M", "quantity": 50, "total_price": 7500.0 }, ...],
  "subtotal": 12000.0
}
```
**Side effects:** Creates SupplierInvoice (`type=item_purchase`), find/create SKUs, PurchaseItem records, `ready_stock_in` inventory events per line, ledger entry (supplier credit).

### GET `/skus/purchase-invoices` (S85)
**Query:** `page`, `page_size`
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "supplier": { "id": "uuid", "name": "Ratan Fabrics" },
  "invoice_no": "INV-001",
  "challan_no": "CH-001",
  "invoice_date": "2026-03-27",
  "sr_no": "42",
  "gst_percent": 12.0,
  "received_at": "2026-03-27T10:00:00Z",
  "notes": "...",
  "items": [
    { "id": "uuid", "sku_id": "uuid", "sku_code": "FBL-702-Red-M", "product_type": "FBL", "design_no": "702", "color": "Red", "size": "M", "quantity": 50, "unit_price": 150.0, "total_price": 7500.0, "hsn_code": null, "gst_percent": null }
  ],
  "item_count": 2,
  "total_amount": 12000.0
}
```
**Note:** SupplierInvoice now has `type` column: `roll_purchase` (default, for rolls) | `item_purchase` (for purchased SKUs). PurchaseItem model links invoice → SKU with qty + pricing.

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
    { "roll_id": "uuid", "palla_weight": 2.860, "num_pallas": null, "size_pattern": null }
  ],
  "notes": "Multi-design lot"
}
```
**Request fields:**
- `rolls[].palla_weight` — standard palla weight per roll (kg or meters based on roll.unit)
- `rolls[].num_pallas` — **optional** user override. Default `null` → backend auto-computes `floor(remaining / palla_weight)`. When provided, clamped server-side to `[1, auto_max]`; the delta (auto_max - num_pallas) × palla_weight flows into `waste_weight`. Used when actual per-palla weight came heavier than standard.

**Response:** Created lot object (backend auto-computes: `pieces_per_palla`, `total_pallas`, `total_pieces`, `total_weight`, `lot_code` as `LT-{PT}-XXXX`, `lot_rolls[].num_pallas`, `lot_rolls[].weight_used`, `lot_rolls[].waste_weight`, `lot_rolls[].pieces_from_roll`)

### PATCH `/lots/{id}`
**Request:** `{ status?, standard_palla_weight?, standard_palla_meter?, designs?: [{design_no, size_pattern}], notes? }`
**Response:** Updated lot object

### PATCH `/lots/{lot_id}/rolls/{lot_roll_id}`
**Request:** `{ num_pallas: int | null }`
**Guard:** Lot must be in `status='open'`. Returns 400 `InvalidStateTransitionError` otherwise.
**Behaviour:** Override num_pallas on an existing lot-roll. Pass `null` or a value `>= auto_max` to reset to `floor((roll.remaining_weight + lot_roll.weight_used) / palla_weight)`. The server recomputes `weight_used`, `waste_weight`, `pieces_from_roll`, deltas the source roll's `remaining_weight` and status (`in_stock` / `remnant` / `in_cutting`), and refreshes lot totals (`total_pallas`, `total_pieces`, `total_weight`).
**Response:** Full updated lot object.

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
**Query:** `page`, `page_size` (`page_size=0` = no limit)
**Response:** Paginated array of:
```json
{
  "id": "uuid",
  "event_id": "STOCK_IN_batch_f_001",
  "event_type": "STOCK_IN",
  "item_type": "finished_goods",
  "reference_type": "batch",
  "reference_id": "uuid",
  "reference": {
    "kind": "shipment",
    "code": "SHP-0004",
    "extra": "ORD-0004",
    "order_id": "uuid"
  },
  "quantity": 196,
  "performed_by": { "id": "uuid", "full_name": "Suresh Checker" },
  "performed_at": "2026-02-07T17:00:00Z",
  "metadata": { "batch_code": "BATCH-0001" }
}
```
**`reference` field (S110 — enrichment of `reference_id`):**
- `kind` mirrors `reference_type` (`shipment`, `batch`, `purchase_item`, `supplier_invoice`, `manual_adjustment`, `opening_stock`)
- `code` is the human-readable code (`SHP-0004`, `BAT-0033`, supplier invoice no, `"Manual"`, `"Opening Stock"`)
- `extra` is a secondary label (`ORD-0004`, lot code, supplier name, adjustment reason) — nullable
- Extra FK ids are included for deep-linking: `order_id` (shipment), `batch_id` (batch), `supplier_invoice_id` (purchase_item / supplier_invoice)
- `reference` is `null` for events whose `reference_type` isn't resolved (future-safe fallback)

### POST `/inventory/adjust`
**Request:** `{ sku_id, event_type, quantity }`
**Response:** Updated inventory state object

### POST `/inventory/opening-stock` — NEW S96
**Auth:** `inventory_adjust`
**Purpose:** Bulk opening stock entry for Day 1 setup. Creates `opening_stock` events.
**Request:**
```json
{
  "items": [
    { "sku_id": "uuid", "quantity": 500, "unit_cost": 450.0 }
  ]
}
```
**Response:**
```json
{
  "created": 3,
  "skipped": ["BLS-101-Red-M"],
  "message": "3 SKU opening stock entries created, 1 skipped (already exist)"
}
```
**Notes:** Each SKU can only have one `opening_stock` event (duplicate prevention). `unit_cost` is optional but recommended for closing stock valuation (WAC computation). Events are created with `event_type="opening_stock"`, `reference_type="opening_stock"`, `metadata.is_opening_stock=true`.

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
  "broker_name": "Rajesh",
  "broker_id": "uuid | null",
  "broker": { "id": "uuid", "name": "Rajesh Agencies", "phone": "9876543210", "city": "Mumbai", "gst_no": null, "commission_rate": 2.5 },
  "transport": "Shree Maruti",
  "transport_id": "uuid | null",
  "transport_detail": { "id": "uuid", "name": "Shree Maruti", "phone": "9876543211", "city": "Surat", "gst_no": "24AABCS1234F1Z5" },
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-28 | null",
  "eway_bill_no": "EWB123456 | null",
  "eway_bill_date": "2026-03-28 | null",
  "gst_percent": 12,
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
      "fulfilled_qty": 0,
      "short_qty": 0,
      "returned_qty": 0
    }
  ],
  "has_shortage": false,
  "total_amount": 2250.0,
  "discount_amount": 0,
  "additional_amount": 0,
  "invoices": [
    { "id": "uuid", "invoice_number": "INV-0001", "total_amount": 2520.0, "status": "issued" }
  ],
  "shipments": [
    {
      "id": "uuid",
      "shipment_no": "SHP-0001",
      "shipped_at": "2026-03-29T10:00:00Z",
      "transport": { "id": "uuid", "name": "Shree Maruti" },
      "lr_number": "LR-12345",
      "eway_bill_no": "EWB123456",
      "invoice": { "id": "uuid", "invoice_number": "INV-0001" },
      "items": [
        { "id": "uuid", "sku": { "id": "uuid", "sku_code": "BLS-101-Red-M", "product_name": "..." }, "order_item_id": "uuid", "quantity": 3 }
      ]
    }
  ],
  "created_at": "2026-02-08T08:00:00Z"
}
```
**S91 additions:** `items[].fulfilled_qty` (partial ship progress), `items[].short_qty` (over-order), `items[].returned_qty` (returns), `shipments[]` (per-shipment records with items, transport, invoice link), `eway_bill_no`/`eway_bill_date` on order.
**Order statuses:** `pending`, `processing`, `partially_shipped`, `shipped`, `partially_returned`, `returned`, `delivered`, `cancelled`.

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
  "order_date": "2026-03-28",
  "broker_name": "Rajesh (legacy — prefer broker_id)",
  "broker_id": "uuid | null",
  "transport": "Shree Maruti (legacy — prefer transport_id)",
  "transport_id": "uuid | null",
  "gst_percent": 12,
  "discount_amount": 0,
  "additional_amount": 0,
  "items": [
    { "sku_id": "uuid", "quantity": 5, "unit_price": 450.0 }
  ],
  "notes": "Optional notes"
}
```
**Response:** Created order object
**Over-order (S86):** Allows ordering when stock is insufficient — reserves available portion, tracks `short_qty` on items.

### POST `/orders/{id}/ship` (S91 — Partial Ship via Shipments)
**Request (S91 — all fields optional):**
```json
{
  "items": [
    { "order_item_id": "uuid", "quantity": 3 },
    { "order_item_id": "uuid", "quantity": 5 }
  ],
  "transport_id": "uuid | null",
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-28 | null",
  "eway_bill_no": "EWB123456 | null",
  "eway_bill_date": "2026-03-28 | null",
  "notes": "Optional"
}
```
- `items` = `null` or omitted → ships ALL remaining unfulfilled items (backward compatible)
- `items[]` = partial ship — only ships specified items/quantities
- Creates a `Shipment` + `ShipmentItem` records (see §23)
- Each shipment auto-creates its own invoice (proportional discount)
- `fulfilled_qty` incremented per item; status → `partially_shipped` or `shipped`
- Stock validation: `available_qty >= ship_qty` with FOR UPDATE lock
- If broker has `commission_rate > 0`, auto-creates broker commission ledger entry

**Response:** Updated order with `shipments[]` populated. Order `items[].fulfilled_qty` updated.

### PATCH `/orders/{id}/shipping` (S90 — Legacy, updates order-level fields)
**Request:** `{ transport_id?, lr_number?, lr_date?, eway_bill_no?, eway_bill_date? }`
**Response:** Updated order. **Note:** Prefer updating via `PATCH /shipments/{id}` (per-shipment) instead.

### ~~POST `/orders/{id}/return`~~ — REMOVED (S100)
**Replaced by** Sales Returns (§25). Use `POST /sales-returns` with `order_id` to create a proper document-based return with QC inspection, restock/damage split, and credit note generation. The OrdersPage "Create Sales Return" button navigates to the Sales Returns page with order pre-fill.

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
  "gst_percent": 18,
  "order": {
    "id": "uuid",
    "order_number": "ORD-0002",
    "customer_name": "Anita Verma",
    "customer_phone": "9876543212",
    "customer_address": "45, Textile Market, Ahmedabad 380002"
  },
  "customer_name": "Anita Verma",
  "customer_phone": "9876543212",
  "customer_address": "45, Textile Market, Ahmedabad 380002",
  "subtotal": 1500.0,
  "tax_amount": 270.0,
  "discount_amount": 0,
  "additional_amount": 0,
  "total_amount": 1770.0,
  "status": "paid",
  "broker_id": "uuid | null",
  "broker": { "id": "uuid", "name": "Rajesh Agencies", "phone": "...", "city": "...", "gst_no": "..." },
  "transport_id": "uuid | null",
  "transport_detail": { "id": "uuid", "name": "Shree Maruti", "phone": "...", "city": "...", "gst_no": "..." },
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-28 | null",
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
**S87:** `order` is nullable (standalone invoices have `order: null`). Top-level `customer_name/phone/address` are always populated — prefer invoice-level, fall back to order-level. `gst_percent` drives CGST/SGST split.
**S91:** Invoice may have `shipment_id` — auto-created per shipment. Shows `· SHP-xxxx` in detail/print.
**S94:** Credit notes (CN-XXXX) auto-created on sales return close. Debit notes (DN-XXXX) on supplier return close. Frontend shows 3-way tabs: Invoices / Credit Notes / Debit Notes.

### GET `/invoices/{id}`
**Response:** Single invoice object (same shape as list items). Uses `selectinload` for order + customer + items + sku.

### POST `/invoices`
**Request (standalone invoice — no order):**
```json
{
  "customer_id": "uuid",
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "customer_address": "Surat",
  "gst_percent": 12,
  "discount_amount": 0,
  "additional_amount": 0,
  "items": [
    { "sku_id": "uuid", "quantity": 5, "unit_price": 450.0 }
  ],
  "notes": "Optional"
}
```
**Response:** Created invoice. Auto-creates ledger debit entry for customer.
**Permission:** `invoice_manage`

### PATCH `/invoices/{id}/pay`
**Request:**
```json
{
  "payment_date": "2026-04-27",
  "payment_mode": "neft",
  "reference_no": "UTR-12345",
  "tds_applicable": false,
  "tds_rate": null,
  "tds_section": null,
  "tcs_applicable": false,
  "tcs_rate": null,
  "tcs_section": null,
  "notes": null
}
```
**Response:** Updated invoice (status → `paid`, `paid_at` set)
**Side effects (S119):** Records a customer payment ledger entry (`entry_type='payment'`, Cr customer) for `invoice.total_amount`, optionally with TDS/TCS split into separate ledger lines. Ledger row carries `reference_type='invoice'` + `reference_id=invoice.id` so it deep-links back from the customer ledger panel.
**v1 strict full-payment:** amount is always `invoice.total_amount` — partial-payment / On-Account tracking is Phase 4 of FINANCIAL_SYMMETRY_PLAN. State guard: only `draft` or `issued` invoices can be marked paid.
**Permission:** `invoice_manage`

### POST `/invoices/{id}/cancel`
**Response:** Updated invoice (status → `cancelled`). Only `draft` or `issued` invoices can be cancelled. Reverses ledger entry (credit note).
**Permission:** `invoice_manage`

### GET `/invoices/by-no/{invoice_no}` (S107)
**Path:** `invoice_no` — invoice_number string (e.g., `INV-0005`)
**Response:** Same shape as `GET /invoices/{id}` with full eager loading.
**Use case:** QR scan deep-link from invoice print. ScanPage navigates to `/invoices?open={invoice_no}` which calls this endpoint.
**Route ordering:** Declared before `/{invoice_id}` so FastAPI matches the fixed path first.
**Permission:** `invoice_manage`

### GET `/invoices/{id}/pdf`
**Response:** Binary PDF blob (Content-Type: application/pdf)

---

## 12. Dashboard & Reports (`/api/v1/dashboard`)

> All analytics endpoints share the `/dashboard/` route prefix but serve 3 different pages:
>
> | Page | Endpoints |
> |------|-----------|
> | **DashboardPage** | `summary`, `enhanced` |
> | **ReportsPage** (11 tabs) | `production-report`, `financial-report`, `tailor-performance`, `inventory-movement`, `inventory-position`, `sales-report`, `accounting-report`, `va-report`, `purchase-report`, `returns-report`, `wastage-report`, `closing-stock-report` |
> | **InventoryPage** (3 tabs) | `inventory-summary`, `raw-material-summary`, `wip-summary` |

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

### GET `/dashboard/inventory-position` (P4.1)
**Auth:** `report_view` permission required
**Query:**
- `period?` — `7d` / `30d` / `90d` (default 30d if no `from`/`to`)
- `from?`, `to?` — explicit date range (ISO `YYYY-MM-DD`), overrides `period`
- `product_type?` — filter by SKU product_type code
- `fabric_type?` — filter by fabric (matches substring in product_name)
- `stock_status?` — `has` / `zero` / `negative`
- `min_value?` — min ₹ value per SKU (float)
- `search?` — matches sku_code, product_name, color (case-insensitive)
- `dead_days?` — threshold for Dead-stock flag in days (default `60`, range `1-365`). SKUs with `ageing_days >= dead_days` count in `dead_sku_count` KPI
- `low_stock?` — threshold for Low-stock flag in pieces (default `5`, range `0-1000`). SKUs with `0 < available_qty <= low_stock` count in `short_sku_count` KPI

**Response:**
```json
{
  "success": true,
  "data": {
    "kpis": {
      "stock_in": 450, "stock_out": 1200, "returns": 12, "net_change": -738,
      "total_value_inr": 8945230.50, "skus_with_stock": 428,
      "dead_sku_count": 37, "short_sku_count": 8
    },
    "groups": [
      {
        "design_id": "uuid",
        "design_no": "1080",
        "product_type": "FBL",
        "sku_count": 6,
        "total_qty": 240,
        "reserved_qty": 20,
        "available_qty": 220,
        "value_inr": 132000.0,
        "skus": [
          {
            "sku_id": "uuid", "sku_code": "FBL-1080-RED-M", "product_name": "1080",
            "product_type": "FBL", "color": "Red", "size": "M",
            "design_id": "uuid",
            "opening_stock": 50, "stock_in": 30, "stock_out": 20,
            "returns": 0, "losses": 0, "net_change": 10,
            "closing_stock": 60, "reserved_qty": 5, "available_qty": 55,
            "wac": 600.0, "value_inr": 33000.0, "ageing_days": 12
          }
        ]
      }
    ],
    "totals": {
      "opening_stock": 1000, "closing_stock": 2400,
      "reserved_qty": 120, "available_qty": 2280, "value_inr": 1368000.0
    },
    "period": { "from": "2026-03-25", "to": "2026-04-24" },
    "thresholds": { "dead_stock_days": 60, "low_stock_threshold": 5 }
  }
}
```
**Notes:**
- Groups are sorted by `value_inr` desc (highest-value designs first)
- SKUs within each group are sorted by canonical size order (S→M→L→XL→XXL→3XL→4XL→Free), then color alphabetical
- `ageing_days` = days since last STOCK_OUT event per SKU (`null` if never sold)
- `value_inr` per SKU = `available_qty × WAC` (WAC from `SKUService.compute_wac_map`, falls back to `base_price` if no cost-bearing events)
- `dead_sku_count` = SKUs with `closing > 0` AND `ageing_days IS NOT NULL` AND `ageing_days >= dead_days` (never-sold SKUs excluded — they are new, not dead)
- `short_sku_count` = SKUs with `0 < available_qty <= low_stock` (**placeholder** — P4.3 swaps for per-SKU `reorder_level`)
- `thresholds` in response echoes the applied values so the frontend chip logic and KPI stay in sync with user filters

### GET `/dashboard/inventory-position.csv` (P4.1)
**Auth:** `report_view` permission required
**Query:** same as `/inventory-position`
**Response:** `text/csv` attachment. Filename: `inventory-position_<from>_<to>.csv`
**Columns:** Design, SKU Code, Product, Color, Size, Opening, Stock In, Stock Out, Returns, Losses, Net, Closing, Reserved, Available, WAC (₹), Value (₹), Ageing (days)
**Note:** One row per SKU (flattened across groups). Not envelope-wrapped.

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

### GET `/dashboard/enhanced`
**Auth:** `report_view`
**Response:**
```json
{
  "alerts": [
    {
      "severity": "critical|warning|info",
      "title": "Unclaimed Batches",
      "message": "3 batches waiting 24h+ — no tailor has scanned",
      "count": 3
    }
  ],
  "revenue_trend": [
    {
      "date": "2026-03-24",
      "day_label": "Mon",
      "amount": 12500.0,
      "invoices": 3
    }
  ],
  "gauges": {
    "lot_load": {
      "value": 4,
      "max": 10,
      "level": "normal|busy|overloaded",
      "label": "Lot Load"
    },
    "tailor_util": {
      "value": 75,
      "max": 100,
      "level": "low|normal|busy|overloaded",
      "label": "Tailor Load",
      "detail": "3/4 tailors active, 1 idle"
    },
    "qc_throughput": {
      "value": 80,
      "max": 100,
      "level": "normal|busy|overloaded",
      "label": "QC Flow",
      "detail": "4 checked today, 1 in queue"
    }
  },
  "invoice_split": {
    "paid": 25000.0,
    "pending": 12500.0,
    "total": 37500.0
  }
}
```

**Alert types (6):** unclaimed batches >24h, lots piling up (3+), VA overdue >7d, overdue invoices, low stock SKUs (<10), QC bottleneck >48h. Sorted by severity (critical → warning → info).

**Gauge levels:** lot_load: ≥7 overloaded, ≥4 busy, else normal. tailor_util: ≥90% overloaded, ≥60% busy, <30% low, else normal. qc_throughput: >5 submitted + 0 checked = overloaded, <50% = busy, else normal.

### GET `/dashboard/sales-report`
**Auth:** `report_view`
**Query:**
- `period?` — `7d`/`30d`/`90d` (default 30d)
- `from?`, `to?` — explicit date range
- `stuck_days?` — pending orders older than this count as stuck (default `7`, range `1-90`). P5.1
- `top_n?` — top N products + top N stuck-order rows (default `10`, range `5-50`). P5.1

**Response:**
```json
{
  "kpis": {
    "total_orders": 25,
    "total_revenue": 150000.0,
    "avg_fulfillment_days": 2.3,
    "return_rate_pct": 4.0,
    "orders_by_status": {
      "pending": 3,
      "processing": 5,
      "shipped": 10,
      "delivered": 5,
      "cancelled": 2
    }
  },
  "customer_ranking": [
    {
      "customer_id": "uuid",
      "customer_name": "Fashion Hub",
      "order_count": 8,
      "total_revenue": 45000.0,
      "total_returns": 2000.0,
      "net_revenue": 43000.0,
      "avg_order_value": 5625.0
    }
  ],
  "fulfillment": {
    "total_orders": 25,
    "pending": 3,
    "processing": 5,
    "partially_shipped": 2,
    "shipped": 10,
    "delivered": 5,
    "cancelled": 2,
    "avg_days_to_ship": 2.3,
    "partial_ship_pct": 11.8,
    "items_ordered": 500,
    "items_fulfilled": 420,
    "items_returned": 20,
    "fulfillment_rate_pct": 84.0
  },
  "broker_commission": [
    {
      "broker_id": "uuid",
      "broker_name": "Ramesh Broker",
      "order_count": 5,
      "total_order_value": 75000.0,
      "commission_rate": 3.0,
      "commission_earned": 2250.0
    }
  ],
  "previous_period": {
    "from": "2026-02-23", "to": "2026-03-24",
    "total_orders": 20, "total_revenue": 120000.0,
    "avg_fulfillment_days": 2.8, "return_rate_pct": 3.5
  },
  "stuck_orders": {
    "count": 8,
    "total_value": 240000.0,
    "threshold_days": 7,
    "rows": [
      {
        "order_id": "uuid", "order_number": "ORD-0042",
        "customer_name": "Fashion Hub",
        "days_pending": 12,
        "total_amount": 32000.0
      }
    ]
  },
  "top_products": [
    {
      "sku_id": "uuid", "sku_code": "FBL-1080-RED-M",
      "product_name": "1080",
      "units_sold": 45,
      "revenue_inr": 22500.0,
      "available_qty": 18
    }
  ],
  "revenue_daily": [
    { "date": "2026-03-25", "revenue": 4500.0 },
    { "date": "2026-03-26", "revenue": 6200.0 }
  ]
}
```

**Notes (P5.1):**
- `previous_period` = shifted same-span window (e.g., period `30d` → previous 30d just before). Used for MoM delta badges.
- `stuck_orders.rows` capped at `top_n`; `count` + `total_value` are aggregates across ALL stuck orders.
- `top_products` — top N by units sold (invoice_items). `available_qty` is current InventoryState.
- `revenue_daily` — zero-filled array for every date in range (sparkline fits even with sparse data).

### GET `/dashboard/sales-report.csv` (P5.2)
**Auth:** `report_view`
**Query:** same as `/sales-report` (period + from/to)
**Response:** `text/csv` attachment. Filename: `sales-report_<from>_<to>.csv`
**Columns:** Rank, Customer, Orders, Revenue (₹), Returns (₹), Net Revenue (₹), Avg Order (₹) — one row per customer from the ranking.

### GET `/dashboard/wastage-report` (P4.7)
**Auth:** `report_view`
**Query:**
  - `period` (`7d`|`30d`|`90d`) **or** `from`+`to` dates
  - `category` — `cutting` | `damage_roll` | `damage_batch` | `damage_sales` | `write_off` (omit for all)
  - `va_party_id` — UUID, scopes damage rows to a single VA party
  - `product_type` — filters cutting + sales-return rows
  - `search` — substring match on ref code, fabric/design, color, party name

**Response:**
```json
{
  "kpis": {
    "cutting_inr": 4250.50,
    "damage_inr": 1820.00,
    "write_off_inr": 980.00,
    "total_inr": 7050.50,
    "cutting_kg": 8.5,
    "damage_roll_kg": 1.2,
    "damage_batch_pcs": 3,
    "damage_sales_pcs": 2,
    "write_off_kg": 1.96
  },
  "monthly": [
    { "month": "2026-04", "cutting_inr": 4250.50, "damage_inr": 1820.00, "write_off_inr": 980.00, "total_inr": 7050.50 }
  ],
  "groups": {
    "cutting":      { "label": "Cutting Waste",       "unit": "kg",  "count": 12, "weight_kg": 8.5,  "pieces": 0, "value_inr": 4250.50, "rows": [...] },
    "damage_roll":  { "label": "Roll VA Damage",      "unit": "kg",  "count": 2,  "weight_kg": 1.2,  "pieces": 0, "value_inr": 600.00,  "rows": [...] },
    "damage_batch": { "label": "Batch VA Damage",     "unit": "pcs", "count": 1,  "weight_kg": 0,    "pieces": 3, "value_inr": 720.00,  "rows": [...] },
    "damage_sales": { "label": "Sales Return Damage", "unit": "pcs", "count": 1,  "weight_kg": 0,    "pieces": 2, "value_inr": 500.00,  "rows": [...] },
    "write_off":    { "label": "Roll Write-off",      "unit": "kg",  "count": 3,  "weight_kg": 1.96, "pieces": 0, "value_inr": 980.00,  "rows": [...] }
  },
  "totals": { "events": 19, "value_inr": 7050.50 },
  "period": { "from": "2026-04-01", "to": "2026-04-27" }
}
```

**Row shape (per group):**
```json
{
  "id": "<uuid>",
  "date": "2026-04-15",
  "ref_code": "LT-FBL-0001",      // lot_code | roll_code | batch_code | srn_no
  "ref_kind": "lot",              // lot | roll_processing | batch_processing | sales_return | roll
  "product_type": "FBL",          // null where not applicable
  "fabric_or_design": "Cotton",
  "color": "Pink",
  "weight_kg": 0.500,             // null for batch/sales (use pieces)
  "pieces": null,                 // null for cutting/roll-VA/write-off (use weight_kg)
  "rate_inr": 850.00,             // ₹ per unit (per-kg cost for rolls; WAC per piece for SKUs)
  "value_inr": 425.00,
  "reason": "too_small",          // free-text or enum, source-dependent
  "party": "Sonu Embroidery",     // VA party (for damage), supplier (for write-off), customer (for sales-return)
  "roll_code": "1-COT-PINK/07-01" // present on roll-derived rows
}
```

**Valuation rules (AS-2 compliant):**
  - **Fabric waste** (cutting, roll VA damage, write-off) — `weight_kg × Roll.cost_per_unit` (per-kg purchase cost).
  - **SKU damage** (batch VA, sales return) — `pieces × WAC` from `SKUService.compute_wac_map`. Batch rows where `batch.sku_id IS NULL` (not yet finalized) value at 0 but still contribute to event count + pieces total.

**Date anchors:**
  - Cutting → `lots.lot_date`
  - Roll VA damage → `roll_processing.received_date`
  - Batch VA damage → `batch_challans.received_date`
  - Sales return damage → `COALESCE(sales_returns.restocked_date, sales_returns.received_date)`
  - Write-off → `rolls.written_off_at::date`

**Snapshot column dependency:** write-off valuation reads `rolls.weight_at_write_off`, populated by S116 migration `j0k1l2m3n4o5`. Pre-S116 written-off rolls are backfilled best-effort via `total_weight - SUM(lot_rolls.weight_used + waste_weight) - SUM(roll_processing.weight_damaged)` clamped ≥ 0.

### GET `/dashboard/wastage-report.csv` (P4.7)
**Auth:** `report_view`
**Query:** same as `/wastage-report`
**Response:** `text/csv` attachment. Filename: `wastage-report_<from>_<to>.csv`
**Columns:** Category, Date, Reference, Fabric / Design, Color, Weight (kg), Pieces, Rate (₹), Value (₹), Reason, Party — one row per wastage event across all (filter-matching) categories.

### GET `/dashboard/accounting-report`
**Auth:** `report_view`
**Query:** `period` (`7d`|`30d`|`90d`) or `from`+`to` dates
**Response:**
```json
{
  "receivables": {
    "total_receivable": 85000.0,
    "overdue_amount": 25000.0,
    "aging_buckets": { "0-30": 45000.0, "31-60": 20000.0, "61-90": 12000.0, "90+": 8000.0 },
    "by_customer": [
      {
        "customer_name": "Fashion Hub",
        "invoice_count": 3,
        "total_amount": 25000.0,
        "overdue_amount": 8000.0,
        "oldest_due_date": "2026-02-15"
      }
    ]
  },
  "payables": {
    "total_payable_suppliers": 45000.0,
    "total_payable_va": 12000.0,
    "by_party": [
      {
        "party_type": "supplier|va_party",
        "party_name": "Ratan Fabrics",
        "balance": 25000.0,
        "balance_type": "cr|dr"
      }
    ]
  },
  "gst_summary": {
    "output_tax": 15300.0,
    "input_tax": 9800.0,
    "net_payable": 5500.0,
    "by_rate": [
      {
        "gst_percent": 18.0,
        "taxable_value": 85000.0,
        "cgst": 7650.0,
        "sgst": 7650.0,
        "total_tax": 15300.0,
        "type": "output|input"
      }
    ]
  },
  "credit_debit_notes": [
    {
      "note_no": "CN-0001",
      "type": "CN|DN",
      "date": "2026-03-15",
      "party_name": "Fashion Hub",
      "linked_return": "SRN-0001",
      "amount": 5000.0,
      "gst": 900.0
    }
  ]
}
```

### GET `/dashboard/raw-material-summary`
**Auth:** `report_view`
**Response:**
```json
{
  "total_rolls": 120,
  "total_weight_kg": 5400.50,
  "total_value": 810075.0,
  "rolls_in_stock": 80,
  "rolls_at_va": 25,
  "rolls_in_cutting": 10,
  "remnant_rolls": 5,
  "weight_in_stock": 3600.25,
  "weight_at_va": 1125.0,
  "by_fabric": [
    {
      "fabric_type": "Cotton",
      "roll_count": 45,
      "total_weight": 2025.0,
      "value": 303750.0,
      "in_stock": 30,
      "at_va": 10
    }
  ],
  "by_supplier": [
    {
      "supplier_name": "Ratan Fabrics",
      "roll_count": 35,
      "total_weight": 1575.0,
      "value": 236250.0
    }
  ]
}
```

### GET `/dashboard/wip-summary`
**Auth:** `report_view`
**Response:**
```json
{
  "total_batches": 18,
  "total_pieces": 3240,
  "by_status": {
    "created": { "count": 2, "pieces": 360 },
    "assigned": { "count": 3, "pieces": 540 },
    "in_progress": { "count": 5, "pieces": 900 },
    "submitted": { "count": 4, "pieces": 720 },
    "checked": { "count": 2, "pieces": 360 },
    "packing": { "count": 2, "pieces": 360 }
  },
  "pieces_at_va": 180,
  "batches_at_va": 1,
  "avg_days_in_pipeline": 4.2,
  "by_product_type": [
    { "product_type": "FBL", "batch_count": 10, "piece_count": 1800 }
  ],
  "by_tailor": [
    {
      "tailor_name": "Amit Singh",
      "batch_count": 4,
      "piece_count": 720,
      "in_progress": 2,
      "submitted": 1
    }
  ]
}
```

### GET `/dashboard/va-report`
**Auth:** `report_view`
**Query:** `period` (`7d`|`30d`|`90d`) or `from`+`to` dates
**Response:**
```json
{
  "kpis": {
    "total_va_spend": 45000.0,
    "avg_turnaround_days": 3.5,
    "damage_rate_pct": 2.1,
    "active_challans": 8
  },
  "by_vendor": [
    {
      "va_party_name": "Sonu Works",
      "roll_challans": 5,
      "batch_challans": 3,
      "roll_cost": 15000.0,
      "batch_cost": 8000.0,
      "total_weight": 225.0,
      "total_pieces": 540,
      "avg_cost_per_kg": 66.67,
      "avg_cost_per_piece": 14.81,
      "damage_count": 2,
      "damage_weight": 1.5,
      "damage_pieces": 5
    }
  ],
  "by_va_type": [
    {
      "name": "Embroidery",
      "short_code": "EMB",
      "roll_challans": 8,
      "batch_challans": 0,
      "total_spend": 22000.0
    }
  ],
  "turnaround": [
    {
      "va_party_name": "Sonu Works",
      "va_type": "EMB",
      "challan_type": "Roll (JC)|Batch (BC)",
      "avg_days": 4.2,
      "total_challans": 5
    }
  ]
}
```

### GET `/dashboard/purchase-report`
**Auth:** `report_view`
**Query:** `period` (`7d`|`30d`|`90d`) or `from`+`to` dates
**Response:**
```json
{
  "kpis": {
    "total_purchased": 810000.0,
    "rolls_received": 120,
    "suppliers_active": 8,
    "avg_waste_pct": 4.5
  },
  "by_supplier": [
    {
      "supplier_name": "Ratan Fabrics",
      "roll_count": 35,
      "total_weight": 1575.0,
      "total_value": 236250.0
    }
  ],
  "supplier_quality": [
    {
      "supplier_name": "Ratan Fabrics",
      "rolls_received": 35,
      "rolls_returned": 1,
      "damage_claims": 2,
      "return_value": 5000.0,
      "quality_score": 91.4
    }
  ],
  "fabric_utilization": [
    {
      "fabric_type": "Cotton",
      "purchased_kg": 2025.0,
      "used_kg": 1800.0,
      "waste_kg": 85.0,
      "waste_pct": 4.7
    }
  ]
}
```

### GET `/dashboard/returns-report`
**Auth:** `report_view`
**Query:** `period` (`7d`|`30d`|`90d`) or `from`+`to` dates
**Response:**
```json
{
  "kpis": {
    "customer_return_rate_pct": 4.0,
    "supplier_return_rate_pct": 1.5,
    "recovery_rate_pct": 85.0,
    "total_credit_notes": 15000.0,
    "total_debit_notes": 5000.0,
    "total_restocked": 170,
    "total_damaged": 30
  },
  "by_sku": [
    {
      "sku_code": "BLS-101-Red-M",
      "product_name": "Design 101 Red Medium",
      "sold_qty": 200,
      "returned_qty": 8,
      "return_rate_pct": 4.0,
      "restocked": 6,
      "damaged": 2,
      "top_reason": "size_mismatch"
    }
  ],
  "by_customer": [
    {
      "customer_name": "Fashion Hub",
      "order_count": 8,
      "return_count": 2,
      "return_rate_pct": 25.0,
      "credit_amount": 8000.0
    }
  ],
  "supplier_returns": [
    {
      "supplier_name": "Ratan Fabrics",
      "return_count": 1,
      "debit_value": 5000.0
    }
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
  "code": "FBL",
  "name": "Fancy Blouse",
  "description": "Fancy blouse designs (meter rolls)",
  "palla_mode": "meter",
  "hsn_code": "6206",
  "is_active": true
}
```

#### GET `/masters/product-types/all`
**Response:** Array (active only, for dropdowns)

#### POST `/masters/product-types`
**Request:** `{ code: "FBL", name: "Fancy Blouse", description?, palla_mode?, hsn_code? }`
**Response:** Created product type

#### PATCH `/masters/product-types/{id}`
**Request:** `{ name?, description?, palla_mode?, hsn_code?, is_active? }`
**Response:** Updated product type

**HSN propagation (S107):** `hsn_code` on ProductType auto-flows to new SKUs at creation time (`sku_service.find_or_create()` looks up ProductType by code), then to InvoiceItem at invoice generation time (already snapshotted from `sku.hsn_code`). Existing SKUs and invoice items are NOT modified when ProductType.hsn_code is changed — historical records preserve their original HSN. Default seed HSN: FBL/SBL=`6206`, LHG=`6204`, SAR=`5407`.

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
  "job_challan_id": "uuid | null",
  "challan_no": "JC-001 | null"
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

### GET `/masters/va-parties/{id}/summary` (S92)
**Auth:** `supplier_manage` permission
**Response:**
```json
{
  "job_challans": { "count": 12, "total_cost": 45000.00 },
  "batch_challans": { "count": 8, "total_cost": 32000.00 },
  "total_processed_cost": 77000.00,
  "balance": { "total_debit": 80000.00, "total_credit": 50000.00, "balance": 30000.00, "balance_type": "dr" },
  "damage_claims": { "count": 3, "total_amount": 2500.00 }
}
```
**Purpose:** KPI summary for VA party detail overlay — shows challan counts, costs, balance, and damage claims.

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
  "gst_percent": 5.0,
  "discount_amount": 0,
  "additional_amount": 0,
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
- `gst_percent` / `discount_amount` / `additional_amount` (S121, all optional, default 0): header-level vendor charges. `subtotal` is computed at receive from received `processing_cost` totals; the math runs on every receive: `taxable = subtotal − discount + additional`, `tax = taxable × gst_pct / 100`, `total = taxable + tax`. Editable post-create via PATCH (recomputes + replaces ledger).

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
      "weight_sent": 20.0,
      "processing_id": "uuid",
      "processing_status": "sent"
    }
  ],
  "total_weight": 20.0,
  "roll_count": 1,
  "gst_percent": 5.0,
  "subtotal": 0,
  "discount_amount": 0,
  "additional_amount": 0,
  "taxable_amount": 0,
  "tax_amount": 0,
  "total_amount": 0
}
```
> S121 — `subtotal` and `taxable_amount` are 0 until receive (when received `processing_cost` lines populate). `total_amount` is what we owe the VA party (gross, including GST). For inventory cost (AS-2), the cost engine uses `taxable_amount` so GST input-credit is excluded.

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
  "notes": "Updated notes",
  "gst_percent": 5.0,
  "discount_amount": 0,
  "additional_amount": 0
}
```
- Editing any of `gst_percent` / `discount_amount` / `additional_amount` (S121) triggers full totals recompute and replaces the existing ledger entry's credit + description with the new `total_amount` (no duplicate ledger row created on edit).

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
    { "roll_id": "uuid", "processing_id": "uuid", "weight_after": 19.500, "processing_cost": 500.00, "weight_damaged": 0.5, "damage_reason": "shrinkage" },
    { "roll_id": "uuid", "processing_id": "uuid", "weight_after": 27.200, "processing_cost": null, "weight_damaged": null, "damage_reason": null }
  ],
  "notes": "All rolls returned in good condition"
}
```
- `rolls[]`: only include checked/selected rolls — unchecked rolls stay `sent`
- `processing_cost`: optional per roll
- `weight_damaged`: optional (S92) — damaged weight in kg, triggers ledger debit against VA party
- `damage_reason`: optional — `shrinkage`, `color_bleeding`, `stain`, `tear`, `wrong_process`, `lost`, `other`
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
  "notes": "Hand stones on neckline area",
  "gst_percent": 5.0,
  "discount_amount": 0,
  "additional_amount": 0
}
```
**Validates:**
- Each batch must be in `in_progress` or `checked` status (VA allowed states)
- `pieces_to_send > 0` and `<= batch.piece_count`
- `value_addition_id` must have `applicable_to` = `'garment'` or `'both'`

**Effect:** Creates `BatchChallan` + one `BatchProcessing` record per batch (atomic transaction). Each record gets `phase` = `'stitching'` (if batch `in_progress`) or `'post_qc'` (if batch `checked`). Auto-sequential `challan_no`: BC-001, BC-002...

`gst_percent` / `discount_amount` / `additional_amount` (S121, all optional, default 0): header-level vendor charges. Same math as JobChallan — `subtotal` is computed at receive from received line `cost` totals, then `taxable = subtotal − discount + additional`, `tax = taxable × gst_pct / 100`, `total = taxable + tax`.

**Response:**
```json
{
  "id": "uuid",
  "challan_no": "BC-001",
  "va_party": { "id": "uuid", "name": "Raju Hand-stone Works", "phone": "9876500001", "city": "Surat" },
  "value_addition": { "id": "uuid", "name": "Hand Stones", "short_code": "HST" },
  "total_pieces": 35,
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
  ],
  "gst_percent": 5.0,
  "subtotal": 0,
  "discount_amount": 0,
  "additional_amount": 0,
  "taxable_amount": 0,
  "tax_amount": 0,
  "total_amount": 0
}
```
> S121 — flat `total_cost` was dropped in favour of the totals stack. Migration backfilled `subtotal` from received `batch_processing.cost`, falling back to legacy `total_cost` for older challans.

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
  "notes": "Updated notes",
  "gst_percent": 5.0,
  "discount_amount": 0,
  "additional_amount": 0
}
```
- Editing any of `gst_percent` / `discount_amount` / `additional_amount` (S121) triggers full totals recompute and replaces the existing ledger entry's credit + description with the new `total_amount`.

**Response:** Updated challan object (same shape as create response).

### POST `/batch-challans/{id}/receive` (Receive Batches Back from VA)
**Auth:** Required (`batch_assign` permission — supervisor/admin)
**Request:**
```json
{
  "batches": [
    { "batch_id": "uuid", "pieces_received": 15, "cost": 2500.00, "pieces_damaged": 1, "damage_reason": "stain" },
    { "batch_id": "uuid", "pieces_received": 20, "cost": 3200.00, "pieces_damaged": null, "damage_reason": null }
  ],
  "notes": "All pieces returned in good condition"
}
```
- `pieces_damaged`: optional (S92) — damaged piece count, triggers ledger debit against VA party
- `damage_reason`: optional — `shrinkage`, `color_bleeding`, `stain`, `tear`, `wrong_process`, `lost`, `other`

**Effect:** Updates each `BatchProcessing` record (`status → 'received'`, fills `pieces_received`, `cost`, `received_date`). Challan status: all received → `'received'`, some received → `'partially_received'`. S121 — totals stack recomputes: `subtotal = SUM(cost)`, then `taxable = subtotal − discount + additional`, `tax = taxable × gst_pct / 100`, `total = taxable + tax`. Ledger credit on VA party uses stored `total_amount` (not gross `subtotal`).
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

### POST `/ledger/opening-balance` — NEW S96
**Auth:** `supplier_manage`
**Query:** `force` (boolean, default false) — override existing opening balance
**Request:**
```json
{
  "party_type": "supplier",
  "party_id": "uuid",
  "amount": 50000.00,
  "balance_type": "cr",
  "entry_date": "2026-04-01",
  "notes": "Carry-forward from Tally"
}
```
**Response:**
```json
{ "created": true, "party_name": "Krishna Textiles", "message": "Opening balance set for Krishna Textiles: ₹50,000.00 CR" }
```
**Notes:** `balance_type`: `cr` = we owe them (supplier/VA default), `dr` = they owe us (customer default). `entry_date` defaults to FY start date if omitted. Without `force=true`, returns `existing: true` if opening already exists.

### POST `/ledger/opening-balance/bulk` — NEW S96
**Auth:** `supplier_manage`
**Request:**
```json
{
  "entries": [
    { "party_type": "supplier", "party_id": "uuid", "amount": 50000, "balance_type": "cr" },
    { "party_type": "customer", "party_id": "uuid", "amount": 25000, "balance_type": "dr" }
  ]
}
```
**Response:**
```json
{ "created": 12, "skipped": [], "total_debit": 75000.0, "total_credit": 125000.0, "message": "12 opening balances saved (₹75,000 Dr, ₹1,25,000 Cr)" }
```
**Notes:** Bulk always overwrites existing opening entries (force=true). Single transaction.

### GET `/ledger/opening-balance/status` — NEW S96
**Auth:** `supplier_manage`
**Response:**
```json
{
  "supplier": { "total": 15, "with_opening": 12, "without_opening": 3 },
  "customer": { "total": 20, "with_opening": 18, "without_opening": 2 },
  "va_party": { "total": 8, "with_opening": 8, "without_opening": 0 },
  "broker": { "total": 3, "with_opening": 0, "without_opening": 3 }
}
```

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
  "bank_branch": "Ring Road, Surat",
  "upi_id": "drsblouse@hdfcbank"
}
```

### PATCH `/company`
**Auth:** `supplier_manage` permission
**Request:** All fields optional: `{ name?, address?, city?, state?, pin_code?, gst_no?, state_code?, pan_no?, phone?, email?, logo_url?, bank_name?, bank_account?, bank_ifsc?, bank_branch?, upi_id? }`
**Response:** Updated company object

**S107 — UPI payment QR:** When `upi_id` is set, invoice print renders a UPI payment QR in the footer encoding `upi://pay?pa={upi_id}&pn={company.name}&am={total}&cu=INR&tn=Invoice%20{invoice_number}`. Customer scans with any UPI app (GPay/PhonePe/Paytm) and pays directly. Renders only if upi_id is present.

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

## 23. Shipments (`/api/v1/shipments`) — NEW S91

> Auto-created when `/orders/{id}/ship` is called. Separate endpoints to query and update shipping details 1-3 days later. Each shipment gets its own invoice.

### GET `/orders/{order_id}/shipments`
**Auth:** `order_manage` permission
**Response:** Array of:
```json
{
  "id": "uuid",
  "shipment_no": "SHP-0001",
  "order_id": "uuid",
  "transport_id": "uuid | null",
  "transport": { "id": "uuid", "name": "Shree Maruti", "phone": "...", "city": "..." },
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-29 | null",
  "eway_bill_no": "EWB123456 | null",
  "eway_bill_date": "2026-03-29 | null",
  "shipped_by": "uuid | null",
  "shipped_at": "2026-03-29T10:00:00Z",
  "notes": null,
  "invoice": { "id": "uuid", "invoice_number": "INV-0001" },
  "items": [
    {
      "id": "uuid",
      "sku": { "id": "uuid", "sku_code": "BLS-101-Red-M", "product_name": "Design 101 Red Medium" },
      "order_item_id": "uuid",
      "quantity": 3
    }
  ],
  "created_at": "2026-03-29T10:00:00Z"
}
```

### GET `/shipments/{shipment_id}`
**Auth:** `order_manage` permission
**Response:** Single shipment object (same shape as above)

### PATCH `/shipments/{shipment_id}`
**Auth:** `order_manage` permission
**Request:** All fields optional:
```json
{
  "transport_id": "uuid | null",
  "lr_number": "LR-12345",
  "lr_date": "2026-03-29",
  "eway_bill_no": "EWB123456",
  "eway_bill_date": "2026-03-29",
  "notes": "Updated"
}
```
**Response:** Updated shipment object
**Use case:** Add transport/LR/eway details 1-3 days after shipping.

---

## 24. Return Notes — Supplier Returns (`/api/v1/return-notes`) — NEW S92

> Return defective/excess rolls or SKUs to suppliers. 6-status workflow with stock reversal and supplier ledger debit on close. GST fields added S94.

### Statuses
```
draft → approved → dispatched → acknowledged → closed
                                                ↳ cancelled (from any status except closed)
```

### GET `/return-notes`
**Auth:** `order_manage` permission
**Query:** `ReturnNoteFilterParams` — `status`, `return_type` (`roll_return`|`sku_return`), `supplier_id`, `search`, `page`, `page_size`
**Response:** Paginated array of ReturnNoteResponse (see below)

### GET `/return-notes/next-number`
**Auth:** `order_manage` permission
**Response:** `{ "next_number": "RN-0001" }`

### GET `/return-notes/{id}`
**Auth:** `order_manage` permission
**Response:**
```json
{
  "id": "uuid",
  "return_note_no": "RN-0001",
  "return_type": "roll_return",
  "supplier": { "id": "uuid", "name": "Krishna Textiles" },
  "status": "draft",
  "return_date": "2026-03-29",
  "approved_by_user": null,
  "approved_at": null,
  "dispatch_date": null,
  "transport": { "id": "uuid", "name": "Shree Maruti" },
  "lr_number": "LR-12345 | null",
  "total_amount": 5000.00,
  "gst_percent": 12.0,
  "subtotal": 4464.29,
  "tax_amount": 535.71,
  "debit_note_no": "DN-0001 | null",
  "notes": null,
  "created_by_user": { "id": "uuid", "full_name": "Admin" },
  "created_at": "2026-03-29T10:00:00Z",
  "items": [
    {
      "id": "uuid",
      "roll": { "id": "uuid", "roll_code": "1-COT-GREEN/01-01" },
      "sku": null,
      "quantity": 1,
      "weight": 18.5,
      "unit_price": 120.0,
      "amount": 2220.0,
      "reason": "Defective weave",
      "condition": "damaged",
      "notes": null
    }
  ]
}
```

### POST `/return-notes`
**Auth:** `order_manage` permission
**Request:**
```json
{
  "return_type": "roll_return",
  "supplier_id": "uuid",
  "return_date": "2026-03-29",
  "transport_id": "uuid | null",
  "lr_number": "LR-12345 | null",
  "gst_percent": 12,
  "items": [
    {
      "roll_id": "uuid (for roll_return)",
      "sku_id": null,
      "quantity": 1,
      "weight": 18.5,
      "unit_price": 120.0,
      "reason": "Defective weave",
      "condition": "damaged",
      "notes": null
    }
  ],
  "notes": null
}
```
- `return_type`: `roll_return` (requires `roll_id`) or `sku_return` (requires `sku_id`)
- `gst_percent`: auto-calculated from supplier's last invoice if not provided

**Response:** Created return note

### PATCH `/return-notes/{id}`
**Auth:** `order_manage` permission
**Request:** `{ return_date?, transport_id?, lr_number?, notes? }`
**Response:** Updated return note

### POST `/return-notes/{id}/approve`
**Effect:** `status → approved`, sets `approved_by`, `approved_at`

### POST `/return-notes/{id}/dispatch`
**Effect:** `status → dispatched`, sets `dispatch_date`. **Stock reversal:** roll status → `returned`, SKU stock_out event.

### POST `/return-notes/{id}/acknowledge`
**Effect:** `status → acknowledged`

### POST `/return-notes/{id}/close`
**Effect:** `status → closed`. Creates debit note (DN-XXXX) — debits supplier ledger for return amount.

### POST `/return-notes/{id}/cancel`
**Effect:** `status → cancelled`. Only from `draft`, `approved`, or `dispatched`.

---

## 25. Sales Returns — Customer Returns (`/api/v1/sales-returns`) — NEW S93-S94

> Full document-based customer return flow with QC inspection, restock/damage tracking, and automatic credit note generation. GST fields added S94.

### Statuses
```
draft → received → inspected → restocked → closed
                                             ↳ cancelled (from any status except closed)
```

### GET `/sales-returns`
**Auth:** `order_manage` permission
**Query:** `SalesReturnFilterParams` — `status`, `customer_id`, `order_id`, `search`, `page`, `page_size`
**Response:** Paginated array of SalesReturnResponse (see below)

### GET `/sales-returns/next-number`
**Auth:** `order_manage` permission
**Response:** `{ "next_number": "SRN-0001" }`

### GET `/sales-returns/{id}`
**Auth:** `order_manage` permission
**Response:**
```json
{
  "id": "uuid",
  "srn_no": "SRN-0001",
  "order": { "id": "uuid", "order_number": "ORD-0001", "customer_name": "Fashion Hub" },
  "customer": { "id": "uuid", "name": "Fashion Hub", "phone": "9876543210", "gst_no": "..." },
  "status": "draft",
  "return_date": "2026-03-29",
  "received_date": null,
  "inspected_date": null,
  "restocked_date": null,
  "transport": { "id": "uuid", "name": "Shree Maruti" },
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-29 | null",
  "reason_summary": "Customer reported defects in batch",
  "qc_notes": null,
  "gst_percent": 12.0,
  "subtotal": 4464.29,
  "tax_amount": 535.71,
  "total_amount": 5000.00,
  "credit_note_no": "CN-0001 | null",
  "created_by_user": { "id": "uuid", "full_name": "Admin" },
  "received_by_user": null,
  "inspected_by_user": null,
  "created_at": "2026-03-29T10:00:00Z",
  "items": [
    {
      "id": "uuid",
      "order_item": { "id": "uuid", "sku_code": "BLS-101-Red-M", "quantity": 10 },
      "sku": { "id": "uuid", "sku_code": "BLS-101-Red-M", "product_name": "Design 101 Red Medium" },
      "unit_price": 450.0,
      "quantity_returned": 5,
      "quantity_restocked": 0,
      "quantity_damaged": 0,
      "reason": "defective",
      "condition": "pending",
      "notes": null
    }
  ]
}
```

### POST `/sales-returns`
**Auth:** `order_manage` permission
**Request:**
```json
{
  "customer_id": "uuid",
  "order_id": "uuid | null",
  "return_date": "2026-03-29",
  "transport_id": "uuid | null",
  "lr_number": "LR-12345 | null",
  "lr_date": "2026-03-29 | null",
  "reason_summary": "Customer reported defects",
  "gst_percent": 12,
  "items": [
    {
      "sku_id": "uuid",
      "quantity_returned": 5,
      "order_item_id": "uuid | null",
      "unit_price": 450.0,
      "reason": "defective",
      "notes": null
    }
  ]
}
```
- `gst_percent`: auto-fetched from linked order if not provided
- `order_item_id`: links to specific order line item (for traceability)

**Response:** Created sales return

### PATCH `/sales-returns/{id}`
**Auth:** `order_manage` permission
**Request:** `{ transport_id?, lr_number?, lr_date?, reason_summary? }`
**Response:** Updated sales return

### POST `/sales-returns/{id}/receive`
**Effect:** `status → received`, sets `received_date`, `received_by_user`

### POST `/sales-returns/{id}/inspect`
**Request:**
```json
{
  "items": [
    {
      "item_id": "uuid",
      "condition": "good",
      "quantity_restocked": 4,
      "quantity_damaged": 1,
      "notes": "1 piece has torn stitching"
    }
  ],
  "qc_notes": "Inspected all 5 pieces, 1 damaged beyond repair"
}
```
- `condition`: `good` (restockable), `damaged` (write-off), `rejected`
- `quantity_restocked + quantity_damaged` must equal `quantity_returned` per item

**Effect:** `status → inspected`, sets `inspected_date`, `inspected_by_user`, updates item conditions.

### POST `/sales-returns/{id}/restock`
**Effect:** `status → restocked`, sets `restocked_date`. Creates RETURN inventory events for good items (quantity_restocked), LOSS events for damaged items (quantity_damaged).

### POST `/sales-returns/{id}/close`
**Effect:** `status → closed`. Creates credit note (CN-XXXX) — credits customer ledger for return amount (based on restocked + damaged at unit_price, with GST).

### POST `/sales-returns/{id}/cancel`
**Effect:** `status → cancelled`. Only from `draft` or `received`.

---

## 26. Payment Receipts (`/api/v1/payment-receipts`) — NEW S123 · S125 polymorphic

Tally-style bill-wise receipt voucher. One inflow/outflow → one-or-more `PaymentAllocation` lines + optional on-account residue. Each allocation generates one `LedgerEntry` keyed `reference_type='payment_allocation'`. On-account residue gets one extra `LedgerEntry` keyed `reference_type='payment_receipt'`.

**S125 polymorphic:** allocations now reference bills via (`bill_type`, `bill_id`) where `bill_type IN ('invoice', 'supplier_invoice', 'job_challan', 'batch_challan')`. The same endpoint serves customer receipts, supplier payments, and VA payouts.

**Math contract:**
```
allocatable = amount − tds_amount + tcs_amount
SUM(allocations.amount_applied) <= allocatable
on_account_amount = allocatable − SUM(allocations.amount_applied)
```

Status transitions on each allocation:
- `outstanding > 0`  →  `partially_paid`
- `outstanding ≈ 0`  →  `paid` (sets `paid_at`)

### GET `/payment-receipts`
**Permission:** `invoice_manage` | **Auth:** Cookie | **FY-scoped**

Query params:
- `party_type` — `customer` | `supplier` | `va_party`
- `party_id` — UUID
- `payment_mode` — `neft` | `upi` | `cash` | `cheque` | `card`
- `date_from`, `date_to` — ISO date
- `search` — matches `receipt_no` or `reference_no`
- Standard `page`, `page_size` (`page_size=0` for all)

### POST `/payment-receipts`
**Permission:** `invoice_manage` | **Auth:** Cookie | **Status:** 201

Request body:
```json
{
  "party_type": "customer",
  "party_id": "uuid",
  "payment_date": "2026-04-27",
  "payment_mode": "neft",
  "reference_no": "UTR12345",
  "amount": 50000,
  "tds_applicable": false,
  "tcs_applicable": false,
  "allocations": [
    { "bill_type": "invoice", "bill_id": "uuid", "amount_applied": 20000 },
    { "bill_type": "invoice", "bill_id": "uuid", "amount_applied": 20000 },
    { "bill_type": "invoice", "bill_id": "uuid", "amount_applied": 10000 }
  ],
  "notes": "Partial settlement"
}
```

Validation:
- `amount > 0` (CHECK)
- `allocations[].amount_applied > 0` (CHECK)
- `bill_type IN ('invoice', 'supplier_invoice', 'job_challan', 'batch_challan')` (CHECK)
- Allowed bill_type per party_type: `customer→invoice`, `supplier→supplier_invoice`, `va_party→job_challan|batch_challan`
- `SUM(allocations) <= amount − tds + tcs`
- Each bill belongs to the party (`customer_id`/`supplier_id`/`va_party_id` match)
- Invoice allocation requires status `IN ('issued', 'partially_paid')`
- Job/Batch challan allocation requires status `IN ('received', 'partially_received')` (work-done gate)
- Each `allocation.amount_applied <= bill.outstanding_amount`

Returns: full `PaymentReceiptResponse` with allocations + party brief + derived `allocated_amount`/`net_amount`/`on_account_amount`.

### GET `/payment-receipts/{id}`
**Permission:** `invoice_manage` | **Auth:** Cookie

Returns: same shape as POST.

### POST `/payment-receipts/{id}/cancel` — NEW S126
**Permission:** `invoice_manage` | **Auth:** Cookie

Voids an active receipt + reverses all allocation effects. Atomic: locks receipt + bills FOR UPDATE, decrements `bill.amount_paid` per allocation, walks back invoice status (paid → partially_paid → issued) from remaining live amount_paid, posts compensating Dr/Cr `LedgerEntry` rows (reference_type='payment_receipt_cancel'), reverses on-account residue + TDS/TCS, sets `status='cancelled'` + audit cols.

Request body:
```json
{
  "cancel_reason": "wrong_amount",
  "cancel_notes": "Customer disputed — re-record correct amount tomorrow"
}
```

Valid `cancel_reason` values: `wrong_customer`, `wrong_amount`, `duplicate`, `bounced_cheque`, `payment_reversed`, `data_entry_error`, `other`.

Returns: full receipt with `status='cancelled'` + audit fields populated.

422 if receipt is already cancelled. Original receipt + allocation rows are retained for audit (Tally voucher-cancel pattern).

### Response shape — `PaymentReceiptResponse`
```json
{
  "id": "uuid",
  "receipt_no": "PAY-0001",
  "party_type": "customer",
  "party_id": "uuid",
  "party": { "id", "name", "phone", "city", "gst_no" },
  "payment_date": "2026-04-27",
  "payment_mode": "neft",
  "reference_no": "UTR12345",
  "amount": 50000.00,
  "tds_applicable": false,
  "tds_rate": null, "tds_section": null, "tds_amount": 0.00,
  "tcs_applicable": false,
  "tcs_rate": null, "tcs_section": null, "tcs_amount": 0.00,
  "allocated_amount": 50000.00,
  "on_account_amount": 0.00,
  "net_amount": 50000.00,
  "allocations": [
    { "id": "uuid", "bill_type": "invoice", "bill_id": "uuid", "bill_no": "INV-0042", "amount_applied": 20000.00 }
  ],
  "notes": null,
  "fy_id": "uuid",
  "created_at": "2026-04-27T10:00:00Z"
}
```

### GET `/customers/{id}/open-invoices` — NEW S123 (S125 returns polymorphic shape)
### GET `/suppliers/{id}/open-bills` — NEW S125
### GET `/masters/va-parties/{id}/open-bills` — NEW S125
**Permission:** `invoice_manage` | **Auth:** Cookie | **FY-scoped**

Returns FIFO-ordered list of open bills for the party.
- Customer → invoices with `status IN ('issued','partially_paid')` and `outstanding > 0`, ordered by `issued_at`
- Supplier → supplier_invoices with `outstanding > 0`, ordered by `invoice_date`
- VA Party → union of `job_challans` + `batch_challans` with `status IN ('received','partially_received')` and `outstanding > 0`, FIFO across both

Polymorphic shape (works for all three endpoints):
```json
[
  {
    "bill_type": "invoice",
    "bill_id": "uuid",
    "bill_no": "INV-0042",
    "bill_date": "2026-04-15",
    "due_date": "2026-04-30",
    "total_amount": 25000.00,
    "amount_paid": 10000.00,
    "outstanding_amount": 15000.00,
    "status": "partially_paid"
  }
]
```

### GET `/customers/{id}/on-account-balance` — NEW S123
### GET `/suppliers/{id}/on-account-balance` — NEW S125
### GET `/masters/va-parties/{id}/on-account-balance` — NEW S125
**Permission:** `invoice_manage` | **Auth:** Cookie | **FY-scoped**

```json
{ "party_type": "customer", "party_id": "uuid", "balance": 5000.00 }
```

### Invoice Response Extension — S123
`InvoiceResponse` now includes:
```json
{
  "amount_paid": 10000.00,
  "outstanding_amount": 15000.00,
  "status": "partially_paid"
}
```
`status` enum extended with `partially_paid`.

### Mark-as-Paid (refactored S123)
`PATCH /invoices/{id}/pay` (existing) is now a thin wrapper over `PaymentReceiptService.record()`. It allocates `outstanding_amount` against this single invoice and creates one `PaymentReceipt` + one `PaymentAllocation` underneath. Same request body (`MarkPaidRequest`).

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
| Roll    | `in_stock`, `sent_for_processing`, `in_cutting`, `remnant`, `returned` |
| Roll Processing | `sent`, `received` |
| Lot     | `open`, `cutting`, `distributed` |
| Batch   | `created`, `assigned`, `in_progress`, `submitted`, `checked`, `packing`, `packed` |
| Batch Processing | `sent`, `received` |
| Job Challan | `sent`, `partially_received`, `received` |
| Batch Challan | `sent`, `partially_received`, `received` |
| Order   | `pending`, `processing`, `partially_shipped`, `shipped`, `partially_returned`, `returned`, `delivered`, `cancelled` |
| Invoice | `draft`, `issued`, `paid`, `cancelled` |
| Return Note (Supplier) | `draft`, `approved`, `dispatched`, `acknowledged`, `closed`, `cancelled` |
| Sales Return (Customer) | `draft`, `received`, `inspected`, `restocked`, `closed`, `cancelled` |
| Financial Year | `open`, `closed` |
| Ledger Entry Type | `stock_in`, `payment`, `invoice`, `commission`, `va_receive`, `tds`, `tcs`, `adjustment`, `opening`, `credit_note`, `debit_note` |
| Ledger Reference Type | `supplier_invoice`, `order`, `invoice`, `job_challan`, `batch_challan`, `payment`, `damage_claim`, `supplier_return`, `sales_return`, `shipment` |
| Ledger Party Type | `supplier`, `customer`, `va_party`, `broker`, `transport` |

## 21. Brokers (`/api/v1/brokers`) — NEW S89

### GET `/brokers`
**Auth:** `supplier_manage` permission
**Query:** `page`, `page_size`, `search` (ILIKE on name, phone, city, gst_no)
**Response:** Paginated array of BrokerResponse

### GET `/brokers/all`
**Response:** Array of active brokers (for dropdowns)

### GET `/brokers/{broker_id}`
**Response:** Single broker

### POST `/brokers`
**Request:** `{ name (required), contact_person?, phone?, phone_alt?, email?, address?, city?, state?, pin_code?, gst_no?, gst_type?, state_code?, pan_no?, aadhar_no?, due_days?, credit_limit?, opening_balance?, balance_type?, commission_rate?, tds_applicable?, tds_rate?, tds_section?, notes? }`
**Response:** Created broker

### PATCH `/brokers/{broker_id}`
**Request:** All fields optional + `is_active?`
**Response:** Updated broker

**Broker-specific:** `commission_rate` (Decimal) — default % used for auto commission ledger entries on ship.

---

## 22. Transports (`/api/v1/transports`) — NEW S89

### GET `/transports`
**Auth:** `supplier_manage` permission
**Query:** `page`, `page_size`, `search`
**Response:** Paginated array of TransportResponse

### GET `/transports/all`
**Response:** Array of active transports (for dropdowns)

### GET `/transports/{transport_id}`
**Response:** Single transport

### POST `/transports`
**Request:** `{ name (required), contact_person?, phone?, phone_alt?, email?, address?, city?, state?, pin_code?, gst_no?, gst_type?, state_code?, pan_no?, aadhar_no?, opening_balance?, balance_type?, notes? }`
**Response:** Created transport

### PATCH `/transports/{transport_id}`
**Request:** All fields optional + `is_active?`
**Response:** Updated transport

**Transport-specific:** No due_days, credit_limit, commission_rate, or TDS fields. Lighter than Broker/Supplier.

---

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
| `broker` | Orders, Invoices | `{ id, name, phone, city, gst_no, commission_rate }` |
| `transport_detail` | Orders | `{ id, name, phone, city, gst_no }` |
| `transport` | Invoices | `{ id, name, phone, city, gst_no }` |
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
| `shipments` | Orders | `[{ id, shipment_no, shipped_at, transport, lr_number, eway_bill_no, invoice, items }]` |
| `items` (shipment) | Shipments | `[{ id, sku, order_item_id, quantity }]` |
| `supplier` | Return Notes | `{ id, name }` |
| `roll` | Return Note Items | `{ id, roll_code }` |
| `order` | Sales Returns | `{ id, order_number, customer_name }` |
| `customer` | Sales Returns | `{ id, name, phone, gst_no }` |
| `approved_by_user` | Return Notes | `{ id, full_name }` |
| `created_by_user` | Return Notes, Sales Returns | `{ id, full_name }` |
| `received_by_user` | Sales Returns | `{ id, full_name }` |
| `inspected_by_user` | Sales Returns | `{ id, full_name }` |

## Appendix D: Auth & FY Error Responses (S77)

| Status | Message | When |
|--------|---------|------|
| 400 | `No financial year selected. Please select a company with an active financial year.` | Any create endpoint when JWT has no `fy_id` |
| 401 | `Token has been revoked. Please login again.` | Token `jti` found in `public.token_blacklist` |
| 401 | `Token expired` | Access token past expiry (frontend should call `/auth/refresh`) |
| 401 | `Refresh token expired` | Refresh token past expiry (user must re-login) |
| 401 | `Invalid token` | Malformed or tampered JWT |
