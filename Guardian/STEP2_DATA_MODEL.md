# STEP 2: DATA MODEL DESIGN
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.0
**Status:** Approved
**Date:** 2026-02-07

---

## 2.1 Entity Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USERS & AUTH          RAW MATERIALS         PRODUCTION                    │
│  ├── users             ├── rolls             ├── skus                      │
│  ├── roles             └── suppliers         ├── batches                   │
│  └── sessions                                ├── batch_assignments         │
│                                              └── batch_roll_consumption    │
│                                                                             │
│  INVENTORY (EVENT-DRIVEN)                    SALES                         │
│  ├── inventory_events  ◄── SOURCE OF TRUTH   ├── orders                   │
│  ├── inventory_state   ◄── COMPUTED VIEW     ├── order_items              │
│  └── reservations                            ├── invoices                  │
│                                              └── invoice_items             │
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
| name | VARCHAR(200) | NOT NULL | Supplier name |
| contact_person | VARCHAR(200) | | Contact name |
| phone | VARCHAR(20) | | Contact number |
| address | TEXT | | Supplier address |
| is_active | BOOLEAN | DEFAULT TRUE | Status |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### `rolls`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| roll_code | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable roll ID |
| fabric_type | VARCHAR(100) | NOT NULL | Cotton, Silk, etc. |
| color | VARCHAR(50) | NOT NULL | Fabric color |
| total_length | DECIMAL(10,2) | NOT NULL | Total meters received |
| remaining_length | DECIMAL(10,2) | NOT NULL | Meters remaining |
| unit | VARCHAR(20) | DEFAULT 'meters' | Unit of measurement |
| cost_per_unit | DECIMAL(10,2) | | Cost per meter |
| supplier_id | UUID | FK → suppliers.id | Supplier reference |
| received_by | UUID | FK → users.id | Supervisor who received |
| received_at | TIMESTAMP | DEFAULT NOW() | Stock-in timestamp |
| notes | TEXT | | Additional notes |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

---

### PRODUCT & PRODUCTION

#### `skus`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| sku_code | VARCHAR(50) | UNIQUE, NOT NULL | BLS-RED-M |
| product_type | VARCHAR(50) | NOT NULL | BLS, KRT, DRS |
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
| sku_id | UUID | FK → skus.id, NOT NULL | Product being made |
| quantity | INTEGER | NOT NULL | Pieces in batch |
| status | VARCHAR(20) | NOT NULL | CREATED, ASSIGNED, IN_PROGRESS, SUBMITTED, CHECKED, COMPLETED |
| qr_code_data | TEXT | NOT NULL | QR code content |
| created_by | UUID | FK → users.id | Supervisor who created |
| created_at | TIMESTAMP | DEFAULT NOW() | Batch creation time |
| assigned_at | TIMESTAMP | | When assigned to tailor |
| started_at | TIMESTAMP | | When tailor started |
| submitted_at | TIMESTAMP | | When tailor submitted |
| checked_at | TIMESTAMP | | When checker inspected |
| completed_at | TIMESTAMP | | When fully completed |
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
┌──────────────┐    N         N    ┌──────────────┐
│    rolls     │◄──────────────────│   batches    │
└──────┬───────┘                   └──────┬───────┘
       │           batch_roll_            │
       │           consumption            │
       │                                  │ N
       │                                  │
       │                           ┌──────────────┐
       │                           │     skus     │
       │                           └──────┬───────┘
       │                                  │ 1
       │                                  │
       │ N                                │ N
┌──────────────────────────────────────────────────┐
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

### Batch State Machine
```
CREATED ──► ASSIGNED ──► IN_PROGRESS ──► SUBMITTED ──► CHECKED ──► COMPLETED
                │                              │
                │                              │
                └──────────── REJECTED ◄───────┘
                              (back to ASSIGNED)
```

### Roll Consumption
```
- rolls.remaining_length updated on each cut
- batch_roll_consumption tracks which rolls fed which batch
- SUM(length_used) across batches ≤ rolls.total_length
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
| Raw Materials | suppliers, rolls |
| Production | skus, batches, batch_assignments, batch_roll_consumption |
| Inventory | inventory_events, inventory_state, reservations |
| Sales | orders, order_items, invoices, invoice_items |
| **Total** | **14 tables** |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial approved version |

---

**Next:** STEP 3 - Event Contracts
