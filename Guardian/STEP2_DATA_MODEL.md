# STEP 2: DATA MODEL DESIGN
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.1
**Status:** Approved
**Date:** 2026-02-07

> **Session 7-14 Updates (2026-02-08 to 2026-02-16):**
> - 14 → 17 tables (added `lots`, `lot_rolls`, `roll_processing`)
> - Roles: added `display_name` column
> - Suppliers: added 6 address/tax fields (gst_no, pan_no, email, city, state, pin_code)
> - Rolls: weight-based model (total_weight/remaining_weight in kg), status field, supplier invoice fields
> - SKU code pattern: `ProductType-DesignNo-Color-Size` (e.g. BLS-101-Red-M)
> - Batches: lot_id FK, piece_count, color_breakdown
> - New LOT entity: groups rolls for cutting, palla-based calculations
> - Roll processing tracking (sent_for_processing workflow)
>
> **Session 22-37 Updates (2026-02-17 to 2026-02-24):**
> - 17 → 22 tables (added `value_additions`, `job_challans`, `product_types`, `colors`, `fabrics`)
> - Rolls: added `current_weight`, `sr_no`, `supplier_challan_no` columns
> - Roll processing: removed `process_type`, added required `value_addition_id` FK + optional `job_challan_id` FK
> - Lots: added `standard_palla_meter`, statuses changed to `open`/`cutting`/`distributed`
> - Batches: `sku_id` now NULLABLE, added `size` column for size-bundle distribution
>
> **Session 43-45 Updates (2026-03-03):**
> - 22 → 24 tables (added `batch_challans`, `batch_processing`)
> - Batches: added `checked_by`, `packed_by`, `packed_at`, `pack_reference` columns; status `COMPLETED` renamed to `CHECKED`, new states `PACKING`, `PACKED`
> - Value additions: added `applicable_to` column (`roll`/`garment`/`both`)
> - BatchChallan: mirrors JobChallan for garment-level VA sends (BC-001, BC-002...)
> - BatchProcessing: mirrors RollProcessing for garment VA (tracks pieces, not weight)

---

## 2.1 Entity Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USERS & AUTH          RAW MATERIALS         PRODUCTION                    │
│  ├── users             ├── rolls             ├── skus                      │
│  ├── roles             ├── suppliers         ├── lots                      │
│  └── sessions          ├── roll_processing   ├── lot_rolls                │
│                        ├── value_additions   ├── batches                   │
│                        └── job_challans      ├── batch_assignments         │
│                                              └── batch_roll_consumption    │
│                                                                             │
│  MASTER DATA                                 SALES                         │
│  ├── product_types     INVENTORY (EVENT)     ├── orders                   │
│  ├── colors            ├── inventory_events  ├── order_items              │
│  └── fabrics           ├── inventory_state   ├── invoices                  │
│                        └── reservations      └── invoice_items             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.2 Table Designs

### USERS & AUTH

#### `roles`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | VARCHAR(50) | UNIQUE, NOT NULL | admin, supervisor, tailor, checker, billing |
| display_name | VARCHAR(100) | NULL | Admin-editable alias for UI display |
| permissions | JSONB | NOT NULL | Permission flags |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| username | VARCHAR(100) | UNIQUE, NOT NULL | Login username |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password |
| full_name | VARCHAR(200) | NOT NULL | Display name |
| role_id | UUID | FK → roles.id | User's role |
| phone | VARCHAR(20) | | Contact number |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | | Last update time |

---

### RAW MATERIALS

#### `suppliers`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | VARCHAR(200) | NOT NULL | Supplier/company name |
| contact_person | VARCHAR(200) | | Contact name |
| phone | VARCHAR(20) | | Contact number |
| email | VARCHAR(200) | NULL | Email address |
| address | TEXT | | Supplier address |
| city | VARCHAR(100) | NULL | City |
| state | VARCHAR(100) | NULL | State (Indian state dropdown) |
| pin_code | VARCHAR(10) | NULL | PIN code |
| gst_no | VARCHAR(20) | NULL | GST number (regex validated) |
| pan_no | VARCHAR(10) | NULL | PAN number (regex validated) |
| is_active | BOOLEAN | DEFAULT TRUE | Status |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `rolls`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| roll_code | VARCHAR(50) | UNIQUE, NOT NULL | Smart code: `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (e.g. `1-COT-GREEN/01-01`) |
| fabric_type | VARCHAR(100) | NOT NULL | Cotton, Silk, Georgette, etc. |
| color | VARCHAR(50) | NOT NULL | Fabric color |
| total_weight | DECIMAL(10,3) | NOT NULL | Original supplier weight (kg) — **IMMUTABLE** after stock-in |
| current_weight | DECIMAL(10,3) | NOT NULL | Latest weight after value additions (kg) — mutated by receive/update processing |
| remaining_weight | DECIMAL(10,3) | NOT NULL | Weight available for cutting/lots (kg) |
| total_length | DECIMAL(10,2) | NULL | Total meters (optional, for meter-based fabrics) |
| unit | VARCHAR(20) | DEFAULT 'kg' | Primary unit of measurement |
| cost_per_unit | DECIMAL(10,2) | | Cost per unit (kg or meter) |
| status | VARCHAR(20) | DEFAULT 'in_stock' | `in_stock`, `sent_for_processing`, `in_cutting` |
| supplier_id | UUID | FK → suppliers.id | Supplier reference |
| supplier_invoice_no | VARCHAR(50) | NULL | Supplier invoice number |
| supplier_challan_no | VARCHAR(50) | NULL | Supplier challan number (separate from invoice) |
| supplier_invoice_date | DATE | NULL | Supplier invoice date |
| sr_no | VARCHAR(20) | NULL | Internal filing serial number (written on physical invoice copy) |
| received_by | UUID | FK → users.id | Supervisor who received |
| received_at | TIMESTAMP | DEFAULT NOW() | Stock-in timestamp |
| notes | TEXT | | Additional notes |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `roll_processing`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| roll_id | UUID | FK → rolls.id, NOT NULL | Roll being processed |
| value_addition_id | UUID | FK → value_additions.id, **NOT NULL** | Type of VA (embroidery, dyeing, etc.) — **REQUIRED** |
| job_challan_id | UUID | FK → job_challans.id, NULL | Job challan that initiated this send (if bulk send) |
| vendor_name | VARCHAR(200) | | External vendor/processor name |
| vendor_phone | VARCHAR(20) | NULL | Vendor phone number |
| sent_date | DATE | NOT NULL | Date sent for processing |
| expected_return_date | DATE | | Expected return date |
| actual_return_date | DATE | | Actual return date |
| weight_before | DECIMAL(10,3) | | Partial weight sent (kg) — may be less than `current_weight` for partial sends |
| weight_after | DECIMAL(10,3) | | Weight after processing (kg) |
| cost | DECIMAL(10,2) | | Processing cost |
| notes | TEXT | | Processing notes |
| status | VARCHAR(20) | DEFAULT 'sent' | `sent`, `received` |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

> **Note:** `process_type` (free-text) was removed in Session 26. All processing uses `value_addition_id` FK.

#### `value_additions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | VARCHAR(100) | NOT NULL | Value addition name (Embroidery, Dying, etc.) |
| short_code | VARCHAR(10) | UNIQUE, NOT NULL | 3-4 char code for SKU suffix (EMB, DYE, DPT, HWK, SQN, BTC) |
| applicable_to | VARCHAR(20) | DEFAULT 'roll' | `roll`, `garment`, or `both` — which pipeline this VA applies to |
| description | TEXT | NULL | Description |
| is_active | BOOLEAN | DEFAULT TRUE | Status |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `job_challans`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| challan_no | VARCHAR(50) | UNIQUE, NOT NULL | Auto-sequential (JC-001, JC-002...) |
| value_addition_id | UUID | FK → value_additions.id, NOT NULL | Type of VA work |
| vendor_name | VARCHAR(200) | NOT NULL | Vendor/processor name |
| vendor_phone | VARCHAR(20) | NULL | Vendor phone |
| sent_date | DATE | NOT NULL | Date rolls sent |
| notes | TEXT | NULL | Notes |
| created_by_id | UUID | FK → users.id | User who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

> **Note:** `POST /job-challans` creates challan + sends all specified rolls atomically. Each roll gets a `RollProcessing` log linked via `job_challan_id`.

#### `batch_challans`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| challan_no | VARCHAR(50) | UNIQUE, NOT NULL | Auto-sequential (BC-001, BC-002...) |
| value_addition_id | UUID | FK → value_additions.id, NOT NULL | Type of garment VA work |
| vendor_name | VARCHAR(200) | NOT NULL | Vendor/processor name |
| vendor_phone | VARCHAR(20) | NULL | Vendor phone |
| sent_date | DATE | NOT NULL | Date batches sent |
| pieces_sent | INTEGER | NOT NULL | Total pieces sent |
| notes | TEXT | NULL | Notes |
| created_by_id | UUID | FK → users.id | User who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

> **Note:** Mirrors `job_challans` but for garment-level VA. `POST /batch-challans` creates challan + sends specified batches atomically.

#### `batch_processing`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| batch_id | UUID | FK → batches.id, NOT NULL | Batch being processed |
| batch_challan_id | UUID | FK → batch_challans.id, NULL | Challan that initiated this send |
| value_addition_id | UUID | FK → value_additions.id, NOT NULL | Type of garment VA |
| vendor_name | VARCHAR(200) | | External vendor name |
| vendor_phone | VARCHAR(20) | NULL | Vendor phone |
| pieces_sent | INTEGER | NOT NULL | Pieces sent for VA |
| pieces_received | INTEGER | NULL | Pieces returned after VA |
| cost | DECIMAL(10,2) | NULL | Processing cost |
| sent_date | DATE | NOT NULL | Date sent |
| received_date | DATE | NULL | Date received back |
| notes | TEXT | NULL | Notes |
| status | VARCHAR(20) | DEFAULT 'sent' | `sent`, `received` |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

> **Note:** Mirrors `roll_processing` but tracks pieces (not weight). Garment VA — embroidery, button work, lace work, finishing, etc.

---

### LOTS (Roll Grouping for Cutting)

#### `lots`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| lot_code | VARCHAR(50) | UNIQUE, NOT NULL | LOT-XXXX auto-generated code |
| sku_id | UUID | FK → skus.id, NULL | Optional SKU reference (lot may produce multiple SKUs) |
| lot_date | DATE | NOT NULL | Lot creation/cutting date |
| design_no | VARCHAR(50) | NOT NULL | Design number (e.g. 702) |
| standard_palla_weight | DECIMAL(10,3) | NOT NULL | Standard weight per palla (kg) |
| standard_palla_meter | DECIMAL(10,3) | NULL | Standard length per palla (meters) — optional |
| default_size_pattern | JSONB | NOT NULL | Pieces per palla by size, e.g. `{"L":2,"XL":6,"XXL":6,"3XL":4}` |
| pieces_per_palla | INTEGER | NOT NULL | Sum of size pattern values (e.g. 18) |
| total_pallas | INTEGER | NOT NULL | Total pallas across all rolls |
| total_pieces | INTEGER | NOT NULL | total_pallas x pieces_per_palla |
| total_weight | DECIMAL(10,3) | NOT NULL | Total fabric weight used (kg) |
| status | VARCHAR(20) | DEFAULT 'open' | `open`, `cutting`, `distributed` (forward-only transitions) |
| notes | TEXT | | Additional notes |
| created_by | UUID | FK → users.id | User who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | | Last update time |

#### `lot_rolls`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| lot_id | UUID | FK → lots.id, NOT NULL | Lot reference |
| roll_id | UUID | FK → rolls.id, NOT NULL | Roll reference |
| palla_weight | DECIMAL(10,3) | NOT NULL | Palla weight for this roll (kg) |
| num_pallas | INTEGER | NOT NULL | Number of pallas from this roll: `floor(roll_weight / palla_weight)` |
| weight_used | DECIMAL(10,3) | NOT NULL | Actual weight consumed from roll (kg) |
| waste_weight | DECIMAL(10,3) | | Waste/remnant weight (kg) |
| size_pattern | JSONB | NULL | Override size pattern for this roll (if different from lot default) |
| pieces_from_roll | INTEGER | NOT NULL | Total pieces from this roll: `num_pallas x pieces_per_palla` |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

---

### PRODUCT & PRODUCTION

#### `skus`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| sku_code | VARCHAR(50) | UNIQUE, NOT NULL | BLS-101-Red-M (ProductType-DesignNo-Color-Size) |
| product_type | VARCHAR(50) | NOT NULL | BLS, KRT, SAR, DRS, OTH |
| product_name | VARCHAR(200) | NOT NULL | Full product name |
| color | VARCHAR(50) | NOT NULL | Color |
| size | VARCHAR(20) | NOT NULL | S, M, L, XL, FS |
| description | TEXT | | Product description |
| base_price | DECIMAL(10,2) | | Default selling price |
| is_active | BOOLEAN | DEFAULT TRUE | Status |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `batches`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| batch_code | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable batch ID |
| sku_id | UUID | FK → skus.id, **NULL** | Product being made — nullable (linked later for billing) |
| lot_id | UUID | FK → lots.id, NULL | Source lot (rolls grouped for cutting) |
| size | VARCHAR(20) | NULL, INDEXED | Size bundle (L, XL, XXL, 3XL) — from lot distribution |
| quantity | INTEGER | NOT NULL | Pieces in batch |
| piece_count | INTEGER | NULL | Actual pieces produced |
| color_breakdown | JSONB | NULL | Per-size piece counts, e.g. `{"L":2,"XL":6,"XXL":6,"3XL":4}` |
| status | VARCHAR(20) | NOT NULL | CREATED, ASSIGNED, IN_PROGRESS, SUBMITTED, CHECKED, PACKING, PACKED |
| qr_code_data | TEXT | NOT NULL | QR code content |
| created_by | UUID | FK → users.id | Supervisor who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Batch creation time |
| assigned_at | TIMESTAMP | | When assigned to tailor |
| started_at | TIMESTAMP | | When tailor started |
| submitted_at | TIMESTAMP | | When tailor submitted |
| checked_at | TIMESTAMP | | When checker inspected |
| completed_at | TIMESTAMP | | When fully completed (legacy — use checked_at) |
| checked_by | UUID | FK → users.id, NULL | Checker who inspected |
| packed_by | UUID | FK → users.id, NULL | User who packed |
| packed_at | TIMESTAMP | NULL | When batch was packed |
| pack_reference | VARCHAR(100) | NULL | External packing reference |
| approved_qty | INTEGER | | Pieces approved by checker |
| rejected_qty | INTEGER | | Pieces rejected by checker |
| rejection_reason | TEXT | | Why pieces rejected |
| notes | TEXT | | Additional notes |

#### `batch_assignments`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| batch_id | UUID | FK → batches.id | Batch reference |
| tailor_id | UUID | FK → users.id | Assigned tailor |
| checker_id | UUID | FK → users.id | Assigned checker (optional) |
| assigned_by | UUID | FK → users.id | Supervisor who assigned |
| assigned_at | TIMESTAMP | DEFAULT NOW() | Assignment time |

#### `batch_roll_consumption`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| batch_id | UUID | FK → batches.id | Batch reference |
| roll_id | UUID | FK → rolls.id | Roll reference |
| pieces_cut | INTEGER | NOT NULL | Pieces cut from this roll |
| length_used | DECIMAL(10,2) | | Meters consumed |
| cut_by | UUID | FK → users.id | Supervisor who cut |
| cut_at | TIMESTAMP | DEFAULT NOW() | Cutting timestamp |

---

### INVENTORY (EVENT-DRIVEN)

#### `inventory_events` ⭐ SOURCE OF TRUTH
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| event_id | VARCHAR(100) | UNIQUE, NOT NULL | Idempotency key |
| event_type | VARCHAR(20) | NOT NULL | STOCK_IN, STOCK_OUT, RESERVE, RELEASE, RETURN, LOSS |
| item_type | VARCHAR(20) | NOT NULL | raw_material, finished_goods |
| reference_type | VARCHAR(50) | NOT NULL | roll, batch, order, invoice |
| reference_id | UUID | NOT NULL | ID of related entity |
| sku_id | UUID | FK → skus.id | SKU (for finished goods) |
| roll_id | UUID | FK → rolls.id | Roll (for raw materials) |
| quantity | INTEGER | NOT NULL | Quantity affected |
| unit | VARCHAR(20) | | Unit of measurement |
| reason | TEXT | | Reason for event |
| performed_by | UUID | FK → users.id | User who triggered event |
| performed_at | TIMESTAMP | DEFAULT NOW() | Event timestamp |
| metadata | JSONB | | Additional data |

#### `inventory_state` (Materialized / Computed)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| sku_id | UUID | FK → skus.id, UNIQUE | SKU reference |
| total_qty | INTEGER | DEFAULT 0 | Total pieces |
| available_qty | INTEGER | DEFAULT 0 | Available for sale |
| reserved_qty | INTEGER | DEFAULT 0 | Reserved for orders |
| last_updated | TIMESTAMP | DEFAULT NOW() | Last computation time |

#### `reservations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| reservation_code | VARCHAR(50) | UNIQUE, NOT NULL | Reservation ID |
| sku_id | UUID | FK → skus.id | SKU reference |
| quantity | INTEGER | NOT NULL | Reserved quantity |
| status | VARCHAR(20) | NOT NULL | active, confirmed, released, expired |
| order_id | UUID | FK → orders.id | Related order |
| external_order_ref | VARCHAR(100) | | E-commerce order ID |
| reserved_at | TIMESTAMP | DEFAULT NOW() | Reservation time |
| expires_at | TIMESTAMP | | Auto-release time |
| confirmed_at | TIMESTAMP | | When confirmed |
| released_at | TIMESTAMP | | When released |

---

### SALES

#### `orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| order_number | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable order ID |
| source | VARCHAR(20) | NOT NULL | web, ecommerce, walk_in |
| external_order_ref | VARCHAR(100) | | E-commerce order ID |
| customer_name | VARCHAR(200) | | Customer name |
| customer_phone | VARCHAR(20) | | Customer contact |
| customer_address | TEXT | | Shipping address |
| status | VARCHAR(20) | NOT NULL | pending, confirmed, processing, shipped, delivered, cancelled |
| total_amount | DECIMAL(12,2) | | Order total |
| notes | TEXT | | Order notes |
| created_by | UUID | FK → users.id | User who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Order creation time |
| updated_at | TIMESTAMP | | Last update time |

#### `order_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| order_id | UUID | FK → orders.id | Order reference |
| sku_id | UUID | FK → skus.id | Product reference |
| quantity | INTEGER | NOT NULL | Quantity ordered |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per piece |
| total_price | DECIMAL(12,2) | NOT NULL | Line total |
| fulfilled_qty | INTEGER | DEFAULT 0 | Quantity shipped |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `invoices`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| invoice_number | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable invoice ID |
| order_id | UUID | FK → orders.id | Related order |
| qr_code_data | TEXT | NOT NULL | QR code content |
| subtotal | DECIMAL(12,2) | NOT NULL | Before tax |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | Tax |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | Discount |
| total_amount | DECIMAL(12,2) | NOT NULL | Final total |
| status | VARCHAR(20) | NOT NULL | draft, issued, paid, cancelled |
| issued_at | TIMESTAMP | | When invoice issued |
| paid_at | TIMESTAMP | | When payment received |
| created_by | UUID | FK → users.id | Billing user |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| notes | TEXT | | Invoice notes |

#### `invoice_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| invoice_id | UUID | FK → invoices.id | Invoice reference |
| sku_id | UUID | FK → skus.id | Product reference |
| batch_id | UUID | FK → batches.id | Source batch (internal tracking) |
| quantity | INTEGER | NOT NULL | Quantity invoiced |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per piece |
| total_price | DECIMAL(12,2) | NOT NULL | Line total |

---

## 2.3 Entity Relationship Diagram

```
                                    ┌──────────────┐
                                    │    roles     │
                                    └──────┬───────┘
                                           │ 1
                                           │
                                           │ N
┌──────────────┐                   ┌──────────────┐
│  suppliers   │                   │    users     │
└──────┬───────┘                   └──────┬───────┘
       │ 1                                │
       │                                  │ (created_by, assigned_by, etc.)
       │ N                                │
┌──────────────┐                          │
│    rolls     │──────────────────────────┘
└──┬───┬───────┘
   │   │ N                    N
   │   └──────────────► ┌──────────────┐
   │      lot_rolls     │    lots      │ ◄── Groups rolls for cutting
   │      (N:N)         └──────┬───────┘     (palla-based calculations)
   │                           │ 1
   │ 1                         │
   │                           │ N
   │ N                  ┌──────────────┐    N         N
┌──────────────┐        │   batches    │◄──────────────────┐
│roll_processing│       └──────┬───────┘  batch_roll_      │
└──────────────┘               │          consumption      │
                               │ N                         │
                               │                    ┌──────────────┐
                        ┌──────────────┐            │     skus     │
                        │     skus     │            └──────┬───────┘
                        └──────┬───────┘                   │ 1
                               │ 1                         │
                               │                           │ N
                               │ N                         │
┌──────────────────────────────────────────────────────────┘
│              inventory_events                     │
│         (SOURCE OF TRUTH - APPEND ONLY)          │
└──────────────────────────────────────────────────┘
                      │
                      │ computed from
                      ▼
              ┌──────────────┐
              │inventory_state│
              └──────────────┘
                      │
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│reservations│ │   orders   │ │  invoices  │
└────────────┘ └─────┬──────┘ └─────┬──────┘
                     │ 1            │ 1
                     │              │
                     │ N            │ N
              ┌────────────┐ ┌────────────┐
              │order_items │ │invoice_items│
              └────────────┘ └────────────┘

KEY RELATIONSHIPS:
  Roll ──(lot_rolls N:N)──► Lot ──(lot_id FK)──► Batch
  Roll ──(1:N)──► roll_processing (processing history)
  roll_processing ──(N:1)──► value_additions (VA type)
  roll_processing ──(N:1)──► job_challans (challan grouping, nullable)
  Batch ──(1:N)──► batch_processing (garment VA history)
  batch_processing ──(N:1)──► value_additions (VA type)
  batch_processing ──(N:1)──► batch_challans (challan grouping, nullable)
  Lot.sku_id is NULLABLE (a lot may produce multiple SKUs/sizes)
  Batch.sku_id is NULLABLE (linked later for billing)
  Batch.size = size bundle from lot distribution (L/XL/XXL/3XL)
```

---

## 2.4 Key Constraints & Rules

### Inventory Events (Append-Only)
```
- Events are NEVER deleted or modified
- Each event has unique event_id (idempotency key)
- inventory_state is COMPUTED from events
- Stock = SUM(STOCK_IN + RETURN) - SUM(STOCK_OUT + LOSS)
- Available = Stock - Reserved
```

### Batch State Machine (7 states — S43+)
```
CREATED ──► ASSIGNED ──► IN_PROGRESS ──► SUBMITTED ──► CHECKED ──► PACKING ──► PACKED
                │                              │
                │                              │
                └──────────── REJECTED ◄───────┘
                              (back to ASSIGNED)

VA Guards:
  - SUBMITTED → CHECKED: blocked if batch has pending VA (batch_processing.status='sent')
  - CHECKED → PACKING: requires "Ready for Packing" action (no pending VA)
  - PACKING → PACKED: fires ready_stock_in event → inventory_events
```

### Roll Weight Rules
```
- total_weight = original supplier weight (IMMUTABLE after stock-in)
- current_weight = latest weight after value additions
- remaining_weight = available for cutting/lots
- On send_for_processing: remaining_weight -= weight_to_send (partial or full)
- On receive_from_processing: remaining_weight += weight_after, current_weight += (weight_after - weight_before)
- Roll stays in_stock if remaining_weight > 0 after partial send
```

### Roll Consumption (Weight-Based)
```
- Lots group rolls for cutting: lot_rolls tracks which rolls are in which lot
- Palla = one cutting layer; num_pallas = floor(roll_weight / palla_weight)
- Batches created via POST /lots/{id}/distribute (auto from size pattern) — NOT manually
- batch_roll_consumption still tracks per-batch roll usage
- SUM(weight_used) across lot_rolls ≤ rolls.current_weight
```

### Reservation Rules
```
- Reservation expires if not confirmed within X hours
- On expiry: auto-release back to available
- Reserved stock cannot be double-reserved
```

---

## 2.5 Indexes (Performance)

```sql
-- Frequently queried
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_sku ON batches(sku_id);
CREATE INDEX idx_inventory_events_sku ON inventory_events(sku_id);
CREATE INDEX idx_inventory_events_type ON inventory_events(event_type);
CREATE INDEX idx_inventory_events_performed_at ON inventory_events(performed_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_sku ON reservations(sku_id);

-- Unique lookups
CREATE INDEX idx_rolls_code ON rolls(roll_code);
CREATE INDEX idx_batches_code ON batches(batch_code);
CREATE INDEX idx_skus_code ON skus(sku_code);
```

---

## 2.6 Summary

| Category | Tables |
|----------|--------|
| Users & Auth | roles, users |
| Raw Materials | suppliers, rolls, roll_processing, value_additions, job_challans, batch_challans, batch_processing |
| Master Data | product_types, colors, fabrics |
| Lots | lots, lot_rolls |
| Production | skus, batches, batch_assignments, batch_roll_consumption |
| Inventory | inventory_events, inventory_state, reservations |
| Sales | orders, order_items, invoices, invoice_items |
| **Total** | **24 tables** |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial approved version |

---

**Next:** STEP 3 - Event Contracts
