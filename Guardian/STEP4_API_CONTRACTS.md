# STEP 4: API CONTRACTS
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.0
**Status:** Draft
**Date:** 2026-02-07

---

## 4.1 API Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BASE URL: http://<edge-server-ip>:8000/api/v1                             │
│                                                                             │
│  INTERNAL APIs (LAN — Web + Mobile)                                        │
│  ├── /auth          → Login, token refresh, session                        │
│  ├── /users         → User CRUD (Admin only)                               │
│  ├── /roles         → Role management (Admin only)                         │
│  ├── /suppliers     → Supplier CRUD                                        │
│  ├── /rolls         → Raw material stock-in, listing, cutting              │
│  ├── /skus          → Product SKU management                               │
│  ├── /batches       → Batch lifecycle (create → assign → complete)         │
│  ├── /inventory     → Stock levels, events, adjustments                    │
│  ├── /orders        → Order management                                     │
│  ├── /invoices      → Invoice generation                                   │
│  └── /dashboard     → Reports, stats                                       │
│                                                                             │
│  EXTERNAL APIs (Tunnel — drsblouse.com)                                    │
│  └── /external      → Stock check, reserve, confirm, release, return       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4.2 Authentication & Authorization

### Auth Flow

```
┌──────────┐   POST /auth/login    ┌──────────┐
│  Client  │──────────────────────►│  Server  │
│          │◄──────────────────────│          │
│          │   { access_token,     │          │
│          │     refresh_token }   │          │
│          │                       │          │
│          │   Authorization:      │          │
│          │   Bearer <token>      │          │
│          │──────────────────────►│          │
│          │◄──────────────────────│          │
│          │   Protected response  │          │
└──────────┘                       └──────────┘
```

### Auth Endpoints

#### `POST /api/v1/auth/login`
```
Request:
{
  "username": "supervisor1",
  "password": "hashed_client_side_or_plain"
}

Response 200:
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "username": "supervisor1",
    "full_name": "Ravi Kumar",
    "role": "supervisor",
    "permissions": { "can_stock_in": true, "can_cut": true, ... }
  }
}

Response 401:
{ "detail": "Invalid credentials" }
```

#### `POST /api/v1/auth/refresh`
```
Request:
{ "refresh_token": "eyJhbG..." }

Response 200:
{ "access_token": "new_token", "expires_in": 3600 }

Response 401:
{ "detail": "Invalid or expired refresh token" }
```

#### `POST /api/v1/auth/logout`
```
Headers: Authorization: Bearer <token>

Response 200:
{ "message": "Logged out" }

Side effect: Blacklist current access_token
```

### JWT Token Structure
```
Payload:
{
  "sub": "user_uuid",
  "username": "supervisor1",
  "role": "supervisor",
  "permissions": ["stock_in", "cut", "batch_create", "batch_assign"],
  "iat": 1707300000,
  "exp": 1707303600
}

Access token TTL:  1 hour
Refresh token TTL: 7 days
Signing: HS256 with secret from .env
```

### Role-Based Access Control (RBAC)

| Permission | Admin | Supervisor | Tailor | Checker | Billing |
|------------|:-----:|:----------:|:------:|:-------:|:-------:|
| user_manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| role_manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| supplier_manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| stock_in | ✅ | ✅ | ❌ | ❌ | ❌ |
| roll_cut | ❌ | ✅ | ❌ | ❌ | ❌ |
| batch_create | ❌ | ✅ | ❌ | ❌ | ❌ |
| batch_assign | ❌ | ✅ | ❌ | ❌ | ❌ |
| batch_start | ❌ | ❌ | ✅ | ❌ | ❌ |
| batch_submit | ❌ | ❌ | ✅ | ❌ | ❌ |
| batch_check | ❌ | ❌ | ❌ | ✅ | ❌ |
| inventory_view | ✅ | ✅ | ❌ | ❌ | ✅ |
| inventory_adjust | ✅ | ✅ | ❌ | ❌ | ❌ |
| order_manage | ✅ | ❌ | ❌ | ❌ | ✅ |
| invoice_manage | ✅ | ❌ | ❌ | ❌ | ✅ |
| report_view | ✅ | ✅ | ❌ | ❌ | ✅ |

### External API Auth (drsblouse.com)
```
Method: API Key in header
Header: X-API-Key: <api_key_from_env>
Additional: IP whitelist (optional, configured in .env)

No JWT for external — stateless API key per request.
```

---

## 4.3 Internal API Endpoints

### Convention
```
- All responses wrapped: { "success": true, "data": {...}, "message": "..." }
- Error responses:       { "success": false, "error": "error_code", "detail": "..." }
- Pagination:            ?page=1&page_size=20 → { "data": [...], "total": 100, "page": 1, "pages": 5 }
- Sorting:               ?sort_by=created_at&sort_order=desc
- Filtering:             ?status=active&role=supervisor
- All timestamps:        ISO 8601 (UTC)
- All IDs:               UUID v4
```

---

### 4.3.1 Users & Roles

#### `GET /api/v1/users`
```
Auth: admin
Query: ?page=1&page_size=20&role=supervisor&is_active=true&search=ravi

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "username": "supervisor1",
      "full_name": "Ravi Kumar",
      "role": { "id": "uuid", "name": "supervisor" },
      "phone": "9876543210",
      "is_active": true,
      "created_at": "2026-02-07T10:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "pages": 1
}
```

#### `POST /api/v1/users`
```
Auth: admin

Request:
{
  "username": "tailor5",
  "password": "secure_password",
  "full_name": "Amit Singh",
  "role_id": "uuid",
  "phone": "9876543210"
}

Response 201:
{ "success": true, "data": { "id": "uuid", ... }, "message": "User created" }

Errors:
- 409: { "error": "duplicate_username", "detail": "Username already exists" }
- 400: { "error": "invalid_role", "detail": "Role not found" }
```

#### `PATCH /api/v1/users/{id}`
```
Auth: admin

Request (partial update):
{ "full_name": "Amit Kumar Singh", "is_active": false }

Response 200:
{ "success": true, "data": { ... }, "message": "User updated" }
```

#### `GET /api/v1/roles`
```
Auth: admin

Response 200:
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "admin", "permissions": { ... } },
    { "id": "uuid", "name": "supervisor", "permissions": { ... } },
    { "id": "uuid", "name": "tailor", "permissions": { ... } },
    { "id": "uuid", "name": "checker", "permissions": { ... } },
    { "id": "uuid", "name": "billing", "permissions": { ... } }
  ]
}
```

---

### 4.3.2 Suppliers

#### `GET /api/v1/suppliers`
```
Auth: admin, supervisor
Query: ?is_active=true&search=krishna

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Krishna Textiles",
      "contact_person": "Krishna Sharma",
      "phone": "9876543210",
      "address": "Surat, Gujarat",
      "is_active": true,
      "created_at": "2026-02-07T10:00:00Z"
    }
  ],
  "total": 8,
  "page": 1,
  "pages": 1
}
```

#### `POST /api/v1/suppliers`
```
Auth: admin, supervisor

Request:
{
  "name": "Krishna Textiles",
  "contact_person": "Krishna Sharma",
  "phone": "9876543210",
  "address": "Surat, Gujarat"
}

Response 201:
{ "success": true, "data": { "id": "uuid", ... }, "message": "Supplier created" }
```

#### `PATCH /api/v1/suppliers/{id}`
```
Auth: admin, supervisor

Request: { "phone": "9876543211", "is_active": false }
Response 200: { "success": true, "data": { ... }, "message": "Supplier updated" }
```

---

### 4.3.3 Rolls (Raw Materials)

#### `GET /api/v1/rolls`
```
Auth: admin, supervisor
Query: ?page=1&page_size=20&fabric_type=Cotton&color=Red&has_remaining=true&supplier_id=uuid

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roll_code": "ROLL-0042",
      "fabric_type": "Cotton",
      "color": "Red",
      "total_length": 50.00,
      "remaining_length": 37.50,
      "unit": "meters",
      "cost_per_unit": 120.00,
      "supplier": { "id": "uuid", "name": "Krishna Textiles" },
      "received_by": { "id": "uuid", "full_name": "Ravi Kumar" },
      "received_at": "2026-02-07T10:00:00Z",
      "notes": null
    }
  ],
  "total": 42,
  "page": 1,
  "pages": 3
}
```

#### `POST /api/v1/rolls` (Stock-In)
```
Auth: supervisor

Request:
{
  "fabric_type": "Cotton",
  "color": "Red",
  "total_length": 50.00,
  "unit": "meters",
  "cost_per_unit": 120.00,
  "supplier_id": "uuid",
  "notes": "Good quality, no defects"
}

Response 201:
{
  "success": true,
  "data": {
    "roll": { "id": "uuid", "roll_code": "ROLL-0042", ... },
    "event": { "id": "uuid", "event_id": "STOCK_IN_roll_uuid_ts", ... }
  },
  "message": "Roll stocked in"
}

Side effects:
- Auto-generates roll_code (ROLL-XXXX sequential)
- Creates STOCK_IN inventory_event
- remaining_length set to total_length
```

#### `GET /api/v1/rolls/{id}`
```
Auth: admin, supervisor

Response 200:
{
  "success": true,
  "data": {
    "id": "uuid",
    "roll_code": "ROLL-0042",
    ...,
    "consumption_history": [
      { "batch_code": "BATCH-0012", "pieces_cut": 25, "length_used": 12.50, "cut_at": "..." }
    ]
  }
}
```

---

### 4.3.4 SKUs (Products)

#### `GET /api/v1/skus`
```
Auth: admin, supervisor, billing
Query: ?product_type=BLS&color=Red&size=M&is_active=true&search=blouse

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sku_code": "101-Red-M",
      "product_type": "BLS",
      "product_name": "Design 101 Red Medium",
      "color": "Red",
      "size": "M",
      "base_price": 450.00,
      "is_active": true,
      "stock": { "total_qty": 150, "available_qty": 120, "reserved_qty": 30 }
    }
  ],
  "total": 24,
  "page": 1,
  "pages": 2
}
```

#### `POST /api/v1/skus`
```
Auth: admin, supervisor

Request:
{
  "product_type": "BLS",
  "product_name": "Design 101 Red Medium",
  "color": "Red",
  "size": "M",
  "description": "Cotton red blouse, regular fit",
  "base_price": 450.00
}

Response 201:
{
  "success": true,
  "data": { "id": "uuid", "sku_code": "101-Red-M", ... },
  "message": "SKU created"
}

Side effects:
- Auto-generates sku_code as DesignNo-Color-Size
- Creates inventory_state row with all zeros
```

#### `PATCH /api/v1/skus/{id}`
```
Auth: admin, supervisor
Request: { "base_price": 500.00, "is_active": false }
Response 200: { "success": true, "data": { ... }, "message": "SKU updated" }
```

---

### 4.3.5 Batches (Production)

#### `GET /api/v1/batches`
```
Auth: admin, supervisor
Query: ?status=ASSIGNED&sku_id=uuid&created_by=uuid&page=1&page_size=20

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_code": "BATCH-0012",
      "sku": { "id": "uuid", "sku_code": "101-Red-M", "product_name": "Design 101 Red Medium" },
      "quantity": 50,
      "status": "ASSIGNED",
      "qr_code_data": "https://inv.local/batch/uuid",
      "created_by": { "id": "uuid", "full_name": "Ravi Kumar" },
      "assignment": {
        "tailor": { "id": "uuid", "full_name": "Amit Singh" },
        "assigned_at": "2026-02-07T12:00:00Z"
      },
      "rolls_used": [
        { "roll_code": "ROLL-0042", "pieces_cut": 30, "length_used": 15.00 },
        { "roll_code": "ROLL-0043", "pieces_cut": 20, "length_used": 10.00 }
      ],
      "created_at": "2026-02-07T10:00:00Z",
      "assigned_at": "2026-02-07T12:00:00Z",
      "started_at": null,
      "submitted_at": null,
      "checked_at": null,
      "completed_at": null
    }
  ],
  "total": 35,
  "page": 1,
  "pages": 2
}
```

#### `POST /api/v1/batches` (Create Batch + Cut from Rolls)
```
Auth: supervisor

Request:
{
  "sku_id": "uuid",
  "rolls": [
    { "roll_id": "uuid", "pieces_cut": 30, "length_used": 15.00 },
    { "roll_id": "uuid", "pieces_cut": 20, "length_used": 10.00 }
  ],
  "notes": "Regular batch"
}

Response 201:
{
  "success": true,
  "data": {
    "batch": { "id": "uuid", "batch_code": "BATCH-0012", "quantity": 50, "status": "CREATED", ... },
    "events": [
      { "event_id": "STOCK_OUT_batch_uuid_roll1_ts", ... },
      { "event_id": "STOCK_OUT_batch_uuid_roll2_ts", ... }
    ]
  },
  "message": "Batch created with 50 pieces from 2 rolls"
}

Side effects:
- Auto-generates batch_code (BATCH-XXXX sequential)
- Generates QR code data
- quantity = SUM of all pieces_cut
- Creates STOCK_OUT events per roll
- Updates rolls.remaining_length per roll
- Creates batch_roll_consumption records
```

#### `POST /api/v1/batches/{id}/assign`
```
Auth: supervisor

Request:
{ "tailor_id": "uuid" }

Response 200:
{
  "success": true,
  "data": { "batch": { ..., "status": "ASSIGNED" }, "assignment": { ... } },
  "message": "Batch assigned to Amit Singh"
}

Validation:
- batch.status must be CREATED
- tailor must have role = tailor, is_active = true
```

#### `POST /api/v1/batches/{id}/start`
```
Auth: tailor (mobile — QR scan triggers this)

Response 200:
{
  "success": true,
  "data": { "batch": { ..., "status": "IN_PROGRESS", "started_at": "..." } },
  "message": "Batch started"
}

Validation:
- batch.status must be ASSIGNED
- current user must be the assigned tailor
```

#### `POST /api/v1/batches/{id}/submit`
```
Auth: tailor (mobile)

Response 200:
{
  "success": true,
  "data": { "batch": { ..., "status": "SUBMITTED", "submitted_at": "..." } },
  "message": "Batch submitted for QC"
}

Validation:
- batch.status must be IN_PROGRESS
- current user must be the assigned tailor
```

#### `POST /api/v1/batches/{id}/check`
```
Auth: checker (mobile — QR scan triggers this)

Request:
{
  "approved_qty": 48,
  "rejected_qty": 2,
  "rejection_reason": "Stitching defect on 2 pieces"
}

Response 200 (approved):
{
  "success": true,
  "data": {
    "batch": { ..., "status": "COMPLETED", "approved_qty": 48, "rejected_qty": 2 },
    "event": { "event_id": "STOCK_IN_batch_uuid_ts", "quantity": 48, ... }
  },
  "message": "Batch checked: 48 approved, 2 rejected. Stock updated."
}

Response 200 (fully rejected):
{
  "success": true,
  "data": {
    "batch": { ..., "status": "ASSIGNED", "rejection_reason": "All pieces defective" }
  },
  "message": "Batch rejected. Reassigned to tailor."
}

Validation:
- batch.status must be SUBMITTED
- approved_qty + rejected_qty = batch.quantity
- If approved_qty > 0 → COMPLETED + STOCK_IN event
- If approved_qty = 0 → back to ASSIGNED (full rejection)
```

#### `GET /api/v1/batches/{id}/qr`
```
Auth: supervisor
Response: QR code image (PNG) or base64 encoded data
```

---

### 4.3.6 Inventory

#### `GET /api/v1/inventory`
```
Auth: admin, supervisor, billing
Query: ?sku_id=uuid&sku_code=101-Red-M&low_stock=true&page=1&page_size=20

Response 200:
{
  "success": true,
  "data": [
    {
      "sku": { "id": "uuid", "sku_code": "101-Red-M", "product_name": "Design 101 Red Medium" },
      "total_qty": 150,
      "available_qty": 120,
      "reserved_qty": 30,
      "last_updated": "2026-02-07T15:00:00Z"
    }
  ],
  "total": 24,
  "page": 1,
  "pages": 2
}
```

#### `GET /api/v1/inventory/{sku_id}/events`
```
Auth: admin, supervisor
Query: ?event_type=STOCK_IN&page=1&page_size=50

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "event_id": "STOCK_IN_batch_uuid_ts",
      "event_type": "STOCK_IN",
      "item_type": "finished_goods",
      "reference_type": "batch",
      "reference_id": "uuid",
      "quantity": 48,
      "performed_by": { "id": "uuid", "full_name": "Checker Suresh" },
      "performed_at": "2026-02-07T14:00:00Z",
      "metadata": { "batch_code": "BATCH-0012" }
    }
  ],
  "total": 15,
  "page": 1,
  "pages": 1
}
```

#### `POST /api/v1/inventory/adjust` (Loss / Manual Correction)
```
Auth: admin, supervisor

Request:
{
  "event_type": "LOSS",
  "item_type": "finished_goods",
  "sku_id": "uuid",
  "quantity": 5,
  "reason": "Water damage in warehouse"
}

Response 201:
{
  "success": true,
  "data": {
    "event": { ... },
    "inventory": { "total_qty": 145, "available_qty": 115, "reserved_qty": 30 }
  },
  "message": "Stock adjusted: -5 pieces (LOSS)"
}
```

#### `POST /api/v1/inventory/reconcile`
```
Auth: admin

Triggers full recomputation of inventory_state from events.
Used for audit/verification.

Response 200:
{
  "success": true,
  "data": {
    "skus_checked": 24,
    "mismatches_found": 0,
    "mismatches_fixed": 0
  },
  "message": "Reconciliation complete. No mismatches."
}
```

---

### 4.3.7 Orders

#### `GET /api/v1/orders`
```
Auth: admin, billing
Query: ?status=pending&source=ecommerce&page=1&page_size=20&search=ORD-0045

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "order_number": "ORD-0045",
      "source": "ecommerce",
      "external_order_ref": "DRS-1234",
      "customer_name": "Priya Sharma",
      "customer_phone": "9876543210",
      "status": "pending",
      "items": [
        {
          "sku": { "sku_code": "101-Red-M", "product_name": "Design 101 Red Medium" },
          "quantity": 5,
          "unit_price": 450.00,
          "total_price": 2250.00,
          "fulfilled_qty": 0
        }
      ],
      "total_amount": 2250.00,
      "created_at": "2026-02-07T10:00:00Z"
    }
  ],
  "total": 30,
  "page": 1,
  "pages": 2
}
```

#### `POST /api/v1/orders`
```
Auth: billing

Request:
{
  "source": "web",
  "customer_name": "Priya Sharma",
  "customer_phone": "9876543210",
  "customer_address": "Mumbai, Maharashtra",
  "items": [
    { "sku_id": "uuid", "quantity": 5, "unit_price": 450.00 },
    { "sku_id": "uuid", "quantity": 3, "unit_price": 600.00 }
  ],
  "notes": "Gift wrapping requested"
}

Response 201:
{
  "success": true,
  "data": {
    "order": { "id": "uuid", "order_number": "ORD-0046", "status": "pending", ... },
    "reservations": [
      { "sku_code": "101-Red-M", "quantity": 5, "status": "active", "expires_at": "..." },
      { "sku_code": "201-Blue-L", "quantity": 3, "status": "active", "expires_at": "..." }
    ]
  },
  "message": "Order created. Stock reserved."
}

Side effects:
- Auto-generates order_number (ORD-XXXX sequential)
- Creates RESERVE event per item
- Creates reservation records
- total_amount = SUM of item totals
```

#### `POST /api/v1/orders/{id}/ship`
```
Auth: billing

Response 200:
{
  "success": true,
  "data": {
    "order": { ..., "status": "shipped" },
    "invoice": { "id": "uuid", "invoice_number": "INV-0032", ... },
    "events": [ { "event_type": "STOCK_OUT", ... } ]
  },
  "message": "Order shipped. Invoice generated. Stock deducted."
}

Side effects:
- STOCK_OUT events per item (reserved → shipped)
- Reservation status → confirmed
- Auto-generates invoice
- Order status → shipped
```

#### `POST /api/v1/orders/{id}/cancel`
```
Auth: billing

Response 200:
{
  "success": true,
  "data": {
    "order": { ..., "status": "cancelled" },
    "events": [ { "event_type": "RELEASE", ... } ]
  },
  "message": "Order cancelled. Stock released."
}

Validation:
- order.status must be 'pending' or 'confirmed'
- Cannot cancel shipped orders (use return instead)
```

#### `POST /api/v1/orders/{id}/return`
```
Auth: billing

Request:
{
  "items": [
    { "sku_id": "uuid", "quantity": 2, "reason": "Defective stitching" }
  ]
}

Response 200:
{
  "success": true,
  "data": {
    "order": { ..., "status": "returned" },
    "events": [ { "event_type": "RETURN", "quantity": 2, ... } ]
  },
  "message": "Return processed. 2 pieces added back to stock."
}

Validation:
- order.status must be 'shipped' or 'delivered'
- return quantity <= fulfilled_qty per item
```

---

### 4.3.8 Invoices

#### `GET /api/v1/invoices`
```
Auth: admin, billing
Query: ?status=issued&page=1&page_size=20

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoice_number": "INV-0032",
      "order": { "order_number": "ORD-0045", "customer_name": "Priya Sharma" },
      "subtotal": 2250.00,
      "tax_amount": 405.00,
      "discount_amount": 0,
      "total_amount": 2655.00,
      "status": "issued",
      "issued_at": "2026-02-07T14:00:00Z",
      "items": [
        {
          "sku": { "sku_code": "101-Red-M" },
          "quantity": 5,
          "unit_price": 450.00,
          "total_price": 2250.00
        }
      ]
    }
  ],
  "total": 20,
  "page": 1,
  "pages": 1
}
```

#### `PATCH /api/v1/invoices/{id}/pay`
```
Auth: billing

Response 200:
{
  "success": true,
  "data": { ..., "status": "paid", "paid_at": "2026-02-07T16:00:00Z" },
  "message": "Invoice marked as paid"
}
```

#### `GET /api/v1/invoices/{id}/pdf`
```
Auth: admin, billing

Response: PDF file download (invoice with QR code)
Content-Type: application/pdf
```

---

### 4.3.9 Dashboard & Reports

#### `GET /api/v1/dashboard/summary`
```
Auth: admin, supervisor, billing

Response 200:
{
  "success": true,
  "data": {
    "rolls": { "total": 42, "with_remaining": 28 },
    "batches": {
      "created": 5, "assigned": 8, "in_progress": 12,
      "submitted": 3, "completed_today": 7
    },
    "inventory": { "total_skus": 24, "low_stock_skus": 3 },
    "orders": { "pending": 10, "processing": 5, "shipped_today": 8 },
    "revenue_today": 45000.00,
    "revenue_month": 850000.00
  }
}
```

#### `GET /api/v1/dashboard/tailor-performance`
```
Auth: admin, supervisor
Query: ?from=2026-02-01&to=2026-02-07

Response 200:
{
  "success": true,
  "data": [
    {
      "tailor": { "id": "uuid", "full_name": "Amit Singh" },
      "batches_completed": 15,
      "pieces_completed": 420,
      "avg_completion_days": 2.3,
      "rejection_rate": 0.04
    }
  ]
}
```

#### `GET /api/v1/dashboard/inventory-movement`
```
Auth: admin, supervisor
Query: ?sku_id=uuid&from=2026-02-01&to=2026-02-07

Response 200:
{
  "success": true,
  "data": {
    "sku_code": "101-Red-M",
    "period": { "from": "2026-02-01", "to": "2026-02-07" },
    "stock_in": 200,
    "stock_out": 150,
    "returns": 5,
    "losses": 2,
    "net_change": 53,
    "closing_stock": 150
  }
}
```

---

### 4.3.10 Mobile-Specific Endpoints

#### `GET /api/v1/mobile/my-batches` (Tailor)
```
Auth: tailor

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_code": "BATCH-0012",
      "sku": { "sku_code": "101-Red-M", "product_name": "Design 101 Red Medium" },
      "quantity": 50,
      "status": "ASSIGNED",
      "assigned_at": "2026-02-07T12:00:00Z"
    }
  ]
}

Returns only batches assigned to current user.
```

#### `POST /api/v1/mobile/scan`
```
Auth: tailor, checker

Request:
{ "qr_data": "https://inv.local/batch/uuid" }

Response 200:
{
  "success": true,
  "data": {
    "batch": { "batch_code": "BATCH-0012", "status": "ASSIGNED", "quantity": 50, ... },
    "allowed_actions": ["start"]
  }
}

allowed_actions computed based on:
- Current user's role
- Current batch status
- Whether batch is assigned to this user
```

#### `GET /api/v1/mobile/pending-checks` (Checker)
```
Auth: checker

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_code": "BATCH-0015",
      "sku": { "sku_code": "201-Blue-L" },
      "quantity": 30,
      "status": "SUBMITTED",
      "tailor": { "full_name": "Amit Singh" },
      "submitted_at": "2026-02-07T15:00:00Z"
    }
  ]
}
```

---

## 4.4 External API (drsblouse.com)

All external endpoints are under `/api/v1/external/`.
Auth: API Key via `X-API-Key` header.

---

#### `GET /api/v1/external/stock/{sku_code}`
```
Auth: X-API-Key

Response 200:
{
  "sku_code": "101-Red-M",
  "product_name": "Design 101 Red Medium",
  "available_qty": 120,
  "price": 450.00
}

Response 404:
{ "error": "sku_not_found", "detail": "SKU 101-Red-X does not exist" }
```

#### `POST /api/v1/external/reserve`
```
Auth: X-API-Key

Request:
{
  "external_order_ref": "DRS-1234",
  "items": [
    { "sku_code": "101-Red-M", "quantity": 5 }
  ]
}

Response 201:
{
  "reservation_code": "RES-0078",
  "status": "active",
  "expires_at": "2026-02-08T10:00:00Z",
  "items": [
    { "sku_code": "101-Red-M", "quantity": 5, "available": true }
  ]
}

Response 409:
{
  "error": "insufficient_stock",
  "detail": "101-Red-M: requested 5, available 3",
  "items": [
    { "sku_code": "101-Red-M", "quantity": 5, "available_qty": 3 }
  ]
}
```

#### `POST /api/v1/external/confirm`
```
Auth: X-API-Key

Request:
{ "reservation_code": "RES-0078" }

Response 200:
{
  "reservation_code": "RES-0078",
  "status": "confirmed",
  "order_number": "ORD-0046",
  "message": "Stock confirmed and shipped"
}

Response 404:
{ "error": "reservation_not_found" }

Response 410:
{ "error": "reservation_expired", "detail": "Reservation expired at 2026-02-08T10:00:00Z" }
```

#### `POST /api/v1/external/release`
```
Auth: X-API-Key

Request:
{ "reservation_code": "RES-0078" }

Response 200:
{
  "reservation_code": "RES-0078",
  "status": "released",
  "message": "Stock released back to inventory"
}
```

#### `POST /api/v1/external/return`
```
Auth: X-API-Key

Request:
{
  "external_order_ref": "DRS-1234",
  "items": [
    { "sku_code": "101-Red-M", "quantity": 2, "reason": "Customer return - wrong size" }
  ]
}

Response 200:
{
  "status": "returned",
  "items": [
    { "sku_code": "101-Red-M", "quantity": 2, "new_available_qty": 122 }
  ],
  "message": "Return processed"
}
```

---

## 4.5 Error Codes Reference

| HTTP | Error Code | Description |
|------|------------|-------------|
| 400 | `validation_error` | Request body failed validation |
| 400 | `invalid_state_transition` | Batch/order cannot transition to requested state |
| 401 | `unauthorized` | Missing or invalid token |
| 401 | `token_expired` | JWT expired, use refresh |
| 403 | `forbidden` | Role lacks permission for this action |
| 404 | `not_found` | Resource does not exist |
| 409 | `duplicate` | Unique constraint violation (username, roll_code, etc.) |
| 409 | `insufficient_stock` | Not enough available inventory |
| 409 | `already_assigned` | Batch already assigned to a tailor |
| 410 | `reservation_expired` | Reservation auto-expired |
| 422 | `business_rule_violation` | Custom business rule failed |
| 500 | `internal_error` | Unexpected server error |

### Error Response Format
```json
{
  "success": false,
  "error": "insufficient_stock",
  "detail": "101-Red-M: requested 5, available 3",
  "timestamp": "2026-02-07T10:00:00Z"
}
```

---

## 4.6 Rate Limiting

| API Type | Limit | Window |
|----------|-------|--------|
| Internal (LAN) | No limit | — |
| External (drsblouse.com) | 100 requests | Per minute |

External rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1707303600
```

---

## 4.7 API Endpoint Summary

| Group | Endpoints | Auth |
|-------|-----------|------|
| Auth | 3 (login, refresh, logout) | Public / JWT |
| Users | 3 (list, create, update) | Admin |
| Roles | 1 (list) | Admin |
| Suppliers | 3 (list, create, update) | Admin, Supervisor |
| Rolls | 3 (list, create, detail) | Supervisor |
| SKUs | 3 (list, create, update) | Admin, Supervisor |
| Batches | 7 (list, create, assign, start, submit, check, qr) | Role-based |
| Inventory | 4 (list, events, adjust, reconcile) | Admin, Supervisor |
| Orders | 5 (list, create, ship, cancel, return) | Billing |
| Invoices | 3 (list, pay, pdf) | Billing |
| Dashboard | 3 (summary, tailor-perf, movement) | Admin, Supervisor, Billing |
| Mobile | 3 (my-batches, scan, pending-checks) | Tailor, Checker |
| External | 5 (stock, reserve, confirm, release, return) | API Key |
| **Total** | **46 endpoints** | |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial draft |

---

**Next:** STEP 5 - Folder Structure
