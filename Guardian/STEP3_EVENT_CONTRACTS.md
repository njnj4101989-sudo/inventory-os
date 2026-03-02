# STEP 3: EVENT CONTRACTS
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.2 (Updated Session 45 — Batch VA + Packing)
**Status:** Approved
**Date:** 2026-02-07 (Updated: 2026-03-03)

> **⚠️ Session 45 Note:** For current API shapes and endpoints, always prefer `API_REFERENCE.md` over this document. Key changes since v1.1: lot distribution auto-creates batches (S35), batch passport/claim endpoints (S35), partial weight send (S30), `process_type` removed → `value_addition_id` required (S26), **batch state machine expanded from 5 to 7 states** (S43-45): `COMPLETED` renamed to `CHECKED`, new states `PACKING` and `PACKED`. VA guard rules block transitions when VA is pending. `ready_stock_in` event fires when batch reaches `packed` status.

---

## 3.1 Event System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EVENT-DRIVEN INVENTORY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PRINCIPLE: Stock is NEVER edited directly.                                │
│  All changes flow through inventory_events (append-only log).              │
│  inventory_state is COMPUTED from events.                                  │
│                                                                             │
│  ┌──────────┐     ┌──────────────────┐     ┌──────────────────┐           │
│  │  Action   │────►│ inventory_events │────►│ inventory_state  │           │
│  │ (trigger) │     │  (append-only)   │     │   (computed)     │           │
│  └──────────┘     └──────────────────┘     └──────────────────┘           │
│                                                                             │
│  Formula:                                                                  │
│  total_qty     = SUM(STOCK_IN, RETURN) - SUM(STOCK_OUT, LOSS)             │
│  reserved_qty  = SUM(RESERVE) - SUM(RELEASE, CONFIRM)                     │
│  available_qty = total_qty - reserved_qty                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3.2 Idempotency Rules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IDEMPOTENCY CONTRACT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Every event MUST carry a unique event_id                               │
│  2. event_id format: {event_type}_{reference_type}_{reference_id}_{ts}     │
│     Example: STOCK_IN_roll_550e8400-e29b_1707300000                        │
│  3. Before inserting: CHECK if event_id already exists                     │
│  4. If duplicate: SKIP silently, return existing event (no error)          │
│  5. Events are APPEND-ONLY — never UPDATE or DELETE                        │
│  6. Retry-safe: same request with same event_id = same result              │
│                                                                             │
│  Implementation:                                                           │
│  ┌────────────────────────────────────────────────────┐                    │
│  │  INSERT INTO inventory_events (event_id, ...)      │                    │
│  │  ON CONFLICT (event_id) DO NOTHING                 │                    │
│  │  RETURNING *;                                      │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                             │
│  If RETURNING is empty → fetch existing by event_id and return it          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3.3 Inventory Event Schemas

### EVENT 1: STOCK_IN (Raw Material — Roll Received)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Supervisor receives fabric roll at stock-in |
| **event_type** | `STOCK_IN` |
| **item_type** | `raw_material` |
| **reference_type** | `roll` |
| **reference_id** | `rolls.id` (the newly created roll) |
| **sku_id** | `NULL` (raw material has no SKU) |
| **roll_id** | `rolls.id` |
| **quantity** | `1` (one roll unit) |
| **unit** | `kg` (weight-based tracking) |
| **performed_by** | Supervisor's `users.id` |
| **metadata** | `{ "total_weight": 12.50, "fabric_type": "Cotton", "color": "Green", "supplier_invoice_no": "KT-2026-0451" }` |

**Side Effects:**
```
1. INSERT into rolls table (roll_code, fabric_type, color, total_weight, remaining_weight = total_weight, status = 'in_stock')
2. Roll code generated: {Challan}-{Fabric3}-{Color5}-{Seq} (e.g., KT-2026-0451-COT-GREEN-01)
3. INSERT into inventory_events
4. No inventory_state update (raw materials tracked via rolls.remaining_weight in kg)
```

**Validation:**
```
- total_weight > 0 (in kg)
- fabric_type is not empty
- supplier_id exists and is_active = true
- performed_by has role = supervisor or admin
```

---

### EVENT 2: STOCK_OUT (Raw Material — Roll Cut for Batch)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Supervisor cuts fabric from roll to create batch pieces |
| **event_type** | `STOCK_OUT` |
| **item_type** | `raw_material` |
| **reference_type** | `batch` |
| **reference_id** | `batches.id` (the batch being created) |
| **sku_id** | `NULL` |
| **roll_id** | `rolls.id` (source roll) |
| **quantity** | Number of pieces cut |
| **unit** | `pieces` |
| **performed_by** | Supervisor's `users.id` |
| **metadata** | `{ "length_used": 12.50, "roll_remaining": 37.50 }` |

**Side Effects:**
```
1. UPDATE rolls SET remaining_length = remaining_length - length_used
2. INSERT into batch_roll_consumption (batch_id, roll_id, pieces_cut, length_used)
3. INSERT into inventory_events
```

**Validation:**
```
- rolls.remaining_length >= length_used (cannot over-cut)
- pieces_cut > 0
- length_used > 0
- roll exists and remaining_length > 0
- performed_by has role = supervisor
```

---

### EVENT 3: STOCK_IN (Finished Goods — Batch Completed QC)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Batch passes QC check → approved pieces become finished goods |
| **event_type** | `STOCK_IN` |
| **item_type** | `finished_goods` |
| **reference_type** | `batch` |
| **reference_id** | `batches.id` |
| **sku_id** | `batches.sku_id` (the product SKU) |
| **roll_id** | `NULL` |
| **quantity** | `batches.approved_qty` (only approved pieces) |
| **unit** | `pieces` |
| **performed_by** | Checker's `users.id` |
| **metadata** | `{ "batch_code": "BATCH-0012", "rejected_qty": 2, "rejection_reason": "..." }` |

**Side Effects:**
```
1. UPDATE batches SET status = 'COMPLETED', completed_at = NOW()
2. INSERT into inventory_events
3. UPDATE inventory_state:
   - total_qty     += approved_qty
   - available_qty += approved_qty
```

**Validation:**
```
- batch.status = 'SUBMITTED' (must be submitted first)
- approved_qty > 0
- approved_qty + rejected_qty = batch.quantity
- No pending VA (batch_processing.status='sent')
- performed_by has batch_check permission
```

---

### EVENT 9: READY_STOCK_IN (Finished Goods — Batch Packed)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Batch reaches PACKED status → ready stock enters inventory |
| **event_type** | `READY_STOCK_IN` |
| **item_type** | `finished_goods` |
| **reference_type** | `batch` |
| **reference_id** | `batches.id` |
| **sku_id** | `batches.sku_id` (may be NULL if not yet linked) |
| **roll_id** | `NULL` |
| **quantity** | `batches.piece_count` (all pieces in batch) |
| **unit** | `pieces` |
| **performed_by** | User who marked batch as packed |
| **metadata** | `{ "batch_code": "BAT-001", "pack_reference": "PKG-001", "va_history": [...] }` |

**Side Effects:**
```
1. UPDATE batches SET status = 'PACKED', packed_at = NOW(), packed_by = user_id
2. INSERT into inventory_events (type = 'ready_stock_in')
3. UPDATE inventory_state:
   - total_qty     += piece_count
   - available_qty += piece_count
```

**Validation:**
```
- batch.status = 'PACKING'
- No pending VA (batch_processing.status='sent')
- performed_by has batch_pack permission
```

---

### EVENT 4: RESERVE (Stock Reserved for Order)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Order placed (web/e-commerce) → stock held |
| **event_type** | `RESERVE` |
| **item_type** | `finished_goods` |
| **reference_type** | `order` |
| **reference_id** | `orders.id` |
| **sku_id** | `order_items.sku_id` |
| **roll_id** | `NULL` |
| **quantity** | Quantity to reserve |
| **unit** | `pieces` |
| **performed_by** | Billing user's `users.id` OR `system` for e-commerce |
| **metadata** | `{ "order_number": "ORD-0045", "source": "ecommerce", "external_ref": "DRS-1234" }` |

**Side Effects:**
```
1. INSERT into reservations (status = 'active', expires_at = NOW() + interval)
2. INSERT into inventory_events
3. UPDATE inventory_state:
   - available_qty -= quantity
   - reserved_qty  += quantity
   (total_qty unchanged)
```

**Validation:**
```
- inventory_state.available_qty >= quantity (cannot over-reserve)
- sku exists and is_active = true
- quantity > 0
```

---

### EVENT 5: STOCK_OUT (Finished Goods — Order Shipped)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Order confirmed and shipped → stock leaves inventory |
| **event_type** | `STOCK_OUT` |
| **item_type** | `finished_goods` |
| **reference_type** | `order` |
| **reference_id** | `orders.id` |
| **sku_id** | `order_items.sku_id` |
| **roll_id** | `NULL` |
| **quantity** | Quantity shipped |
| **unit** | `pieces` |
| **performed_by** | Billing user's `users.id` |
| **metadata** | `{ "order_number": "ORD-0045", "invoice_number": "INV-0032" }` |

**Side Effects:**
```
1. UPDATE reservations SET status = 'confirmed', confirmed_at = NOW()
2. UPDATE orders SET status = 'shipped'
3. UPDATE order_items SET fulfilled_qty += quantity
4. INSERT into inventory_events
5. UPDATE inventory_state:
   - total_qty    -= quantity
   - reserved_qty -= quantity
   (available_qty unchanged — was already deducted at RESERVE)
```

**Validation:**
```
- reservation exists with status = 'active' for this order + SKU
- reservation.quantity >= ship quantity
- performed_by has role = billing
```

---

### EVENT 6: RELEASE (Order Cancelled — Stock Released)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Order cancelled OR reservation expired → stock returned to available |
| **event_type** | `RELEASE` |
| **item_type** | `finished_goods` |
| **reference_type** | `order` |
| **reference_id** | `orders.id` (or `reservation.id` if auto-expiry) |
| **sku_id** | `reservations.sku_id` |
| **roll_id** | `NULL` |
| **quantity** | Quantity released |
| **unit** | `pieces` |
| **performed_by** | User who cancelled OR `system` for auto-expiry |
| **metadata** | `{ "reason": "customer_cancelled" }` or `{ "reason": "auto_expired" }` |

**Side Effects:**
```
1. UPDATE reservations SET status = 'released', released_at = NOW()
2. UPDATE orders SET status = 'cancelled' (if full cancellation)
3. INSERT into inventory_events
4. UPDATE inventory_state:
   - available_qty += quantity
   - reserved_qty  -= quantity
   (total_qty unchanged)
```

**Validation:**
```
- reservation exists with status = 'active'
- release quantity <= reservation.quantity
```

---

### EVENT 7: RETURN (Goods Returned to Inventory)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Customer returns goods → stock added back |
| **event_type** | `RETURN` |
| **item_type** | `finished_goods` |
| **reference_type** | `order` |
| **reference_id** | `orders.id` |
| **sku_id** | `order_items.sku_id` |
| **roll_id** | `NULL` |
| **quantity** | Quantity returned |
| **unit** | `pieces` |
| **performed_by** | Billing user's `users.id` |
| **metadata** | `{ "order_number": "ORD-0045", "return_reason": "defective", "condition": "good" }` |

**Side Effects:**
```
1. UPDATE orders SET status = 'returned' (if full return)
2. UPDATE order_items SET fulfilled_qty -= quantity
3. INSERT into inventory_events
4. UPDATE inventory_state:
   - total_qty     += quantity
   - available_qty += quantity
```

**Validation:**
```
- order exists with status = 'shipped' or 'delivered'
- return quantity <= order_items.fulfilled_qty
- performed_by has role = billing
```

---

### EVENT 8: LOSS (Damaged / Stolen / Waste)

| Field | Value / Rule |
|-------|-------------|
| **Trigger** | Admin/Supervisor records inventory loss |
| **event_type** | `LOSS` |
| **item_type** | `finished_goods` or `raw_material` |
| **reference_type** | `sku` or `roll` |
| **reference_id** | `skus.id` or `rolls.id` |
| **sku_id** | `skus.id` (if finished goods) |
| **roll_id** | `rolls.id` (if raw material) |
| **quantity** | Quantity lost |
| **unit** | `pieces` or `meters` |
| **performed_by** | Admin or Supervisor `users.id` |
| **metadata** | `{ "reason": "water_damage", "notes": "Warehouse leak on 2026-02-05" }` |

**Side Effects (finished_goods):**
```
1. INSERT into inventory_events
2. UPDATE inventory_state:
   - total_qty     -= quantity
   - available_qty -= quantity
```

**Side Effects (raw_material):**
```
1. UPDATE rolls SET remaining_length -= loss_length
2. INSERT into inventory_events
```

**Validation:**
```
- If finished_goods: available_qty >= quantity (cannot lose more than available)
- If raw_material: rolls.remaining_length >= loss_length
- reason is not empty (mandatory for audit trail)
- performed_by has role = admin or supervisor
```

---

## 3.4 Batch State Machine

### State Transition Diagram

```
                    ┌───────────────────────────────────────────────────────────┐
                    │         BATCH LIFECYCLE (7 states — S43+)                 │
                    ├───────────────────────────────────────────────────────────┤
                    │                                                           │
                    │   ┌─────────┐    assign    ┌──────────┐                  │
                    │   │ CREATED │─────────────►│ ASSIGNED │◄─────────┐       │
                    │   └─────────┘              └────┬─────┘          │       │
                    │       │                         │                │       │
                    │       │ cancel                  │ tailor         │reject │
                    │       ▼                         │ starts         │       │
                    │   ┌──────────┐                  ▼                │       │
                    │   │CANCELLED │          ┌─────────────┐         │       │
                    │   └──────────┘          │ IN_PROGRESS │         │       │
                    │                         └──────┬──────┘         │       │
                    │                                │                │       │
                    │                                │ tailor         │       │
                    │                                │ submits        │       │
                    │                                ▼                │       │
                    │                         ┌───────────┐          │       │
                    │                         │ SUBMITTED │──────────┘       │
                    │                         └─────┬─────┘  (if rejected)  │
                    │                               │                        │
                    │                     checker   │ [VA guard: no pending  │
                    │                     inspects  │  batch_processing]     │
                    │                               ▼                        │
                    │                         ┌───────────┐                  │
                    │                         │  CHECKED  │                  │
                    │                         └─────┬─────┘                  │
                    │                               │                        │
                    │                     "Ready    │ [VA guard: no pending  │
                    │                     for Pack" │  batch_processing]     │
                    │                               ▼                        │
                    │                         ┌───────────┐                  │
                    │                         │  PACKING  │                  │
                    │                         └─────┬─────┘                  │
                    │                               │                        │
                    │                     "Mark     │                        │
                    │                      Packed"  │                        │
                    │                               ▼                        │
                    │                         ┌───────────┐                  │
                    │                         │  PACKED   │                  │
                    │                         └───────────┘                  │
                    │                               │                        │
                    │                               │ triggers               │
                    │                               ▼                        │
                    │                    READY_STOCK_IN (finished_goods)      │
                    │                                                        │
                    └───────────────────────────────────────────────────────┘
```

### Transition Rules

| # | From | To | Triggered By | Conditions | Side Effects |
|---|------|----|-------------|------------|--------------|
| T1 | — | CREATED | Supervisor (Web) | Lot distributed, size pattern defined | Create batch, generate QR, set piece_count |
| T2 | CREATED | ASSIGNED | Supervisor (Web/Mobile) | Tailor exists, is_active, role = tailor | Create batch_assignment, set assigned_at |
| T3 | ASSIGNED | IN_PROGRESS | Tailor (Mobile) | Scan QR, batch assigned to this tailor | Set started_at |
| T4 | IN_PROGRESS | SUBMITTED | Tailor (Mobile) | Batch in IN_PROGRESS, assigned to this tailor, **no pending VA** | Set submitted_at |
| T5 | SUBMITTED | CHECKED | Checker (Mobile) | approved_qty > 0, **no pending VA** | Set checked_at, checked_by |
| T6 | SUBMITTED | ASSIGNED | Checker (Mobile) | rejected_qty > 0, needs rework | Reset to ASSIGNED, clear started_at/submitted_at, log rejection_reason |
| T7 | CREATED | CANCELLED | Supervisor (Web) | Batch not yet assigned | Mark cancelled, no inventory impact |
| T8 | CHECKED | PACKING | Supervisor/Checker (Web) | **No pending VA** (batch_processing.status='sent') | "Ready for Packing" action |
| T9 | PACKING | PACKED | Supervisor (Web) | Batch in PACKING state | Set packed_at, packed_by, pack_reference, trigger READY_STOCK_IN event |

### Transition Validation Matrix (7 states + cancelled)

```
             │ CREATED │ ASSIGNED │ IN_PROGRESS │ SUBMITTED │ CHECKED │ PACKING │ PACKED │ CANCELLED │
─────────────┼─────────┼──────────┼─────────────┼───────────┼─────────┼─────────┼────────┼───────────┤
CREATED      │    —    │    ✅    │      ❌      │     ❌    │    ❌   │    ❌   │   ❌   │    ✅     │
ASSIGNED     │    ❌   │    —     │      ✅      │     ❌    │    ❌   │    ❌   │   ❌   │    ❌     │
IN_PROGRESS  │    ❌   │    ❌    │      —       │     ✅    │    ❌   │    ❌   │   ❌   │    ❌     │
SUBMITTED    │    ❌   │    ✅    │      ❌      │     —     │    ✅   │    ❌   │   ❌   │    ❌     │
CHECKED      │    ❌   │    ❌    │      ❌      │     ❌    │    —    │    ✅   │   ❌   │    ❌     │
PACKING      │    ❌   │    ❌    │      ❌      │     ❌    │    ❌   │    —    │   ✅   │    ❌     │
PACKED       │    ❌   │    ❌    │      ❌      │     ❌    │    ❌   │    ❌   │   —    │    ❌     │
CANCELLED    │    ❌   │    ❌    │      ❌      │     ❌    │    ❌   │    ❌   │   ❌   │    —      │
```

### VA Guard Rules (Batch Processing)
```
VA Guard: A batch with pending VA (batch_processing records with status='sent')
CANNOT transition past certain states. This prevents packing unfinished garments.

  T4 (IN_PROGRESS → SUBMITTED):  ⚠️ VA guard — blocked if pending batch_processing
  T5 (SUBMITTED → CHECKED):      ⚠️ VA guard — blocked if pending batch_processing
  T8 (CHECKED → PACKING):        ⚠️ VA guard — blocked if pending batch_processing

VA can be sent at any stage (ASSIGNED through CHECKED). VA must be received before
the batch can advance past the stage where the guard applies.
```

---

## 3.5 Order State Machine

```
┌─────────┐  confirm   ┌────────────┐  process   ┌────────────┐
│ PENDING │───────────►│ CONFIRMED  │───────────►│ PROCESSING │
└────┬────┘            └────────────┘            └─────┬──────┘
     │                                                  │
     │ cancel                                           │ ship
     ▼                                                  ▼
┌───────────┐                                    ┌──────────┐
│ CANCELLED │                                    │ SHIPPED  │
└───────────┘                                    └────┬─────┘
                                                      │
                                                      │ deliver
                                                      ▼
                                                ┌───────────┐
                                                │ DELIVERED │
                                                └───────────┘
```

| # | From | To | Triggered By | Side Effects |
|---|------|----|-------------|--------------|
| O1 | — | PENDING | Billing / E-commerce | Create order, create order_items, trigger RESERVE events |
| O2 | PENDING | CONFIRMED | Billing | Reservation confirmed |
| O3 | CONFIRMED | PROCESSING | Billing | Picking/packing in progress |
| O4 | PROCESSING | SHIPPED | Billing | Trigger STOCK_OUT events, generate invoice |
| O5 | SHIPPED | DELIVERED | Billing | Mark delivery complete |
| O6 | PENDING | CANCELLED | Billing / E-commerce | Trigger RELEASE events |

---

## 3.6 Reservation State Machine

```
┌────────┐  confirm   ┌───────────┐
│ ACTIVE │───────────►│ CONFIRMED │
└───┬────┘            └───────────┘
    │
    ├── cancel ──►  ┌──────────┐
    │               │ RELEASED │
    └── expire ──►  └──────────┘
```

| # | From | To | Triggered By | Side Effects |
|---|------|----|-------------|--------------|
| R1 | — | ACTIVE | Order placed | Deduct available_qty |
| R2 | ACTIVE | CONFIRMED | Order shipped | Deduct total_qty and reserved_qty (STOCK_OUT) |
| R3 | ACTIVE | RELEASED | Cancel / Expiry | Restore available_qty (RELEASE event) |

**Auto-Expiry Rule:**
```
- Background job runs every 15 minutes
- Finds reservations WHERE status = 'active' AND expires_at < NOW()
- For each: trigger RELEASE event with reason = 'auto_expired'
- Default expiry: 24 hours for e-commerce, 72 hours for web orders
```

---

## 3.7 Event Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        EVENT PROCESSING PIPELINE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: VALIDATE                                                           │
│  ├── Check event_id uniqueness (idempotency)                                │
│  ├── Validate payload fields (type, reference, quantity)                     │
│  ├── Verify permissions (role-based)                                        │
│  └── Check business rules (sufficient stock, valid state transition)         │
│                                                                              │
│  Step 2: EXECUTE (Single Transaction)                                       │
│  ├── INSERT inventory_event                                                 │
│  ├── UPDATE related entity (roll, batch, order, reservation)                │
│  └── UPDATE inventory_state (recompute or incremental)                      │
│                                                                              │
│  Step 3: RESPOND                                                            │
│  ├── Return created event with ID                                           │
│  └── Return updated inventory_state snapshot                                │
│                                                                              │
│  ⚠️ ALL THREE STEPS RUN IN A SINGLE DATABASE TRANSACTION                    │
│  ⚠️ If any step fails → full rollback, no partial state                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Inventory State Recomputation Strategy

```
STRATEGY: Incremental Update (Default)
─────────────────────────────────────
On each event → apply delta to inventory_state
  STOCK_IN:  total_qty += qty, available_qty += qty
  STOCK_OUT: total_qty -= qty, reserved_qty -= qty
  RESERVE:   available_qty -= qty, reserved_qty += qty
  RELEASE:   available_qty += qty, reserved_qty -= qty
  RETURN:    total_qty += qty, available_qty += qty
  LOSS:      total_qty -= qty, available_qty -= qty

STRATEGY: Full Recomputation (On-Demand / Nightly)
───────────────────────────────────────────────────
SELECT sku_id,
  SUM(CASE WHEN event_type IN ('STOCK_IN','RETURN') THEN quantity ELSE 0 END) -
  SUM(CASE WHEN event_type IN ('STOCK_OUT','LOSS') THEN quantity ELSE 0 END) AS total_qty,
  ... AS reserved_qty,
  total_qty - reserved_qty AS available_qty
FROM inventory_events
GROUP BY sku_id;

Use full recomputation to VERIFY incremental state (audit/reconciliation).
```

---

## 3.8 Event Schema Summary Table

| Event | item_type | reference_type | sku_id | roll_id | Who Can Trigger |
|-------|-----------|----------------|--------|---------|-----------------|
| STOCK_IN (roll) | raw_material | roll | NULL | ✅ | Supervisor |
| STOCK_OUT (cut) | raw_material | batch | NULL | ✅ | Supervisor |
| STOCK_IN (batch checked) | finished_goods | batch | ✅ | NULL | Checker (batch_check) |
| READY_STOCK_IN (packed) | finished_goods | batch | ✅/NULL | NULL | Supervisor (batch_pack) |
| RESERVE | finished_goods | order | ✅ | NULL | Billing / System |
| STOCK_OUT (ship) | finished_goods | order | ✅ | NULL | Billing |
| RELEASE | finished_goods | order | ✅ | NULL | Billing / System |
| RETURN | finished_goods | order | ✅ | NULL | Billing |
| LOSS | finished_goods | sku | ✅ | NULL | Admin / Supervisor |
| LOSS | raw_material | roll | NULL | ✅ | Admin / Supervisor |

---

## 3.9 Concurrency & Edge Cases

### Race Condition: Double Reserve
```
Problem:  Two orders try to reserve last 5 pieces simultaneously
Solution: SELECT ... FOR UPDATE on inventory_state row before RESERVE
          Only one transaction proceeds; other gets insufficient_stock error
```

### Race Condition: Cut While Roll Empty
```
Problem:  Two supervisors cut from same roll simultaneously
Solution: SELECT ... FOR UPDATE on rolls row before cut
          Second cut sees updated remaining_length
```

### Offline Mobile Sync Conflicts
```
Problem:  Tailor submits batch offline, checker also acts offline
Solution: Server processes events in received order
          If batch already COMPLETED when SUBMITTED arrives → reject with conflict
          Mobile app shows conflict resolution screen
```

### Partial QC (Split Batch)
```
Problem:  50 pieces in batch, 48 approved, 2 rejected
Solution: STOCK_IN event with quantity = 48 (approved_qty)
          Batch marked COMPLETED
          rejected_qty and rejection_reason logged in batch + event metadata
          Rejected pieces do NOT re-enter inventory (absorbed as production loss)
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial draft |

---

**Next:** STEP 4 - API Contracts
