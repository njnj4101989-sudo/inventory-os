# Backend Architecture Audit Plan

> **Created:** S60 (2026-03-06) | **Goal:** Production-grade backend before real data goes live
> **Rule:** Audit only — NO code changes until findings discussed and approved

---

## Why This Audit

- App is LIVE on AWS (EC2 + RDS PostgreSQL)
- Real data entry starts tomorrow
- Current backend was built iteratively over 59 sessions — needs a single pass to ensure it's professional-grade
- Poor queries = high CPU, slow responses, wrong data
- Missing indexes = table scans on 10K+ rows
- Missing constraints = corrupted data that's impossible to fix later
- Non-atomic transactions = partial saves, orphaned records

---

## Scope: 24 Models, 16 Services, 17 Route Files

### Phase 1: Database Structure Audit
**What:** Review all 24 models in `backend/app/models/`
**Looking for:**
- Missing indexes on columns used in WHERE/ORDER BY/JOIN (supplier_id, status, roll_code, lot_id, etc.)
- Missing UNIQUE constraints (roll_code is unique, but is batch_code? lot_code? challan_no?)
- Missing CHECK constraints (weight > 0, status in valid set, piece_count > 0)
- FK cascade rules — what happens when a supplier is deleted? Does it cascade to rolls?
- Decimal precision — is Numeric(10,3) enough for weights? Is Numeric(10,2) enough for costs?
- String lengths — is String(50) enough for roll_code with VA suffixes?
- Nullable columns that shouldn't be nullable (or vice versa)
- Missing relationships that would simplify queries

**Files:** `backend/app/models/*.py` (24 files), `backend/app/database.py`

### Phase 2: Query Efficiency Audit
**What:** Review all 16 services in `backend/app/services/`
**Looking for:**
- N+1 query patterns (loop that does a query per iteration)
- Missing `selectinload` / `joinedload` causing lazy loads (SQLAlchemy async doesn't support lazy)
- "Fetch all then filter in Python" when SQL WHERE would do
- "Fetch all then sort in Python" when SQL ORDER BY would do
- "Fetch all then paginate in Python" when SQL OFFSET/LIMIT would do
- Heavy aggregations done in Python instead of SQL (COUNT, SUM, GROUP BY)
- Redundant queries (same data fetched twice in one request)
- Missing `.unique()` on queries with `selectinload` (causes duplicates)

**Files:** `backend/app/services/*.py` (16 files)

### Phase 3: Data Flow Integrity Audit
**What:** Trace the complete lifecycle of a roll from stock-in to packed garment
**Looking for:**
- Weight transitions: total_weight (immutable) vs current_weight vs remaining_weight — are all mutations correct?
- Status transitions: roll (in_stock -> sent_for_processing -> in_stock -> in_cutting) — are guards enforced?
- Batch state machine: 7 states (created -> assigned -> in_progress -> submitted -> checked -> packing -> packed) — are transitions atomic?
- VA guard: can't submit/pack batch if BatchProcessing has status='sent' — is this enforced?
- Lot forward-only: open -> cutting -> distributed — can you go backwards?
- Job Challan atomicity: challan + all roll sends in single transaction?
- Batch Challan atomicity: challan + all batch processing records in single transaction?
- Concurrent access: two users send same roll for processing simultaneously — race condition on remaining_weight?
- Partial failure: if roll 15 of 30 fails in bulk stock-in, do first 14 persist? (Should NOT with our new atomic endpoint)

**Flow to trace:**
```
Supplier Invoice -> Stock-In (bulk rolls)
  -> Send for VA (Job Challan) -> Receive from VA
  -> Create Lot (assign rolls) -> Cut (status change)
  -> Distribute Lot (auto-create batches)
  -> Assign Batch (to tailor) -> Start -> Submit
  -> Send for Garment VA (Batch Challan) -> Receive
  -> QC Check -> Ready for Packing -> Pack
  -> SKU auto-gen -> Ready Stock
```

**Files:** All 16 services, focusing on `roll_service.py`, `lot_service.py`, `batch_service.py`, `job_challan_service.py`, `batch_challan_service.py`

### Phase 4: Production Readiness Audit
**What:** Config, connection pooling, error handling, security
**Looking for:**
- Database connection pool config (pool_size, max_overflow, pool_timeout)
- Transaction isolation level — default or explicit?
- Error handling — do services catch DB errors or let them bubble as 500s?
- Alembic migration state — is it clean for production?
- Environment config — are secrets in .env? Is DEBUG off?
- CORS — production-only origins?
- Rate limiting — any protection against abuse?
- Request size limits — can someone POST a 10MB payload?
- Logging — structured logs for debugging production issues?

**Files:** `backend/app/main.py`, `backend/app/database.py`, `backend/app/core/`, `.env`

---

## Output Format

Each finding will be:

| # | Severity | File:Line | Issue | Fix |
|---|----------|-----------|-------|-----|
| 1 | CRITICAL | models/roll.py:16 | No index on `status` column — table scan on every `GET /rolls?status=in_stock` | Add `index=True` to column def |

**Severity levels:**
- **CRITICAL** — Will cause wrong data or crash under load. Fix before real data entry.
- **HIGH** — Performance will degrade noticeably at 1K+ records. Fix within first week.
- **MEDIUM** — Best practice violation. Fix when convenient.
- **LOW** — Nice to have. Defer.

---

## Phase 1 Findings: Database Structure (COMPLETE — S60)

All 24 models in `backend/app/models/` reviewed. 26 issues found.

### CRITICAL (4) — Fix before real data entry

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 1 | `roll.py:25` | `status` column — NO index. Every `GET /rolls?status=in_stock` full table scan. Hottest query in the app. | Add `index=True` to `status` column |
| 2 | `roll.py:26` | `supplier_invoice_no` — NO index. `get_supplier_invoices` loads ALL rolls. At 10K+ rolls this dominates CPU. | Add `index=True` |
| 3 | `roll.py:32` | `supplier_id` FK — NO index. Supplier filter scans entire rolls table. | Add `index=True` |
| 4 | `roll.py:19` | `total_weight` Numeric — NO check constraint. Zero/negative weight can be inserted via bug or direct DB. Corrupted data is unfixable. | Add `CheckConstraint('total_weight > 0', name='ck_rolls_positive_weight')` |

### HIGH (7) — Fix within first week

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 5 | `roll.py:29` | `sr_no` — NO index. Filtered in `RollFilterParams`, used in label printing after stock-in. | Add `index=True` |
| 6 | `roll.py:25` | `status` — NO CHECK constraint. Any string like `"in_stok"` silently accepted. | Add `CheckConstraint("status IN ('in_stock','sent_for_processing','in_cutting')")` |
| 7 | `batch.py:22` | `status` — has index but NO CHECK. 7-state machine not enforced at DB level. | Add `CheckConstraint` for 7 valid states |
| 8 | `lot.py:30-31` | `status` — has index but NO CHECK. Should be `open`/`cutting`/`distributed` only. | Add `CheckConstraint` |
| 9 | `supplier.py:27` | `Supplier.rolls` rel — NO `ondelete` rule on Roll FK. Supplier delete → orphaned rolls or FK violation. | Add `ondelete="RESTRICT"` on `Roll.supplier_id` FK |
| 10 | `lot.py:46-47` | `LotRoll.lot_id` / `LotRoll.roll_id` — NO `ondelete`. Lot delete → orphan lot_rolls. Roll delete while in lot → orphan. | Add `ondelete="CASCADE"` on lot_id, `ondelete="RESTRICT"` on roll_id |
| 11 | `batch.py:16` | `Batch.lot_id` — NO `ondelete`. Lot delete → orphan batches. | Add `ondelete="RESTRICT"` |

### MEDIUM (11) — Fix when convenient

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 12 | `roll.py:52` (RollProcessing) | `roll_id` FK — NO explicit index. `selectinload(Roll.processing_logs)` needs this. | Add `index=True` |
| 13 | `roll.py:67` (RollProcessing) | `job_challan_id` FK — NO index. | Add `index=True` |
| 14 | `batch_assignment.py:15` | `batch_id` FK — NO index. Loading `batch.assignments`. | Add `index=True` |
| 15 | `batch_assignment.py:16` | `tailor_id` FK — NO index. `getMyBatches` filters by tailor. | Add `index=True` |
| 16 | `batch_roll_consumption.py:16` | `batch_id` FK — NO index. | Add `index=True` |
| 17 | `batch_roll_consumption.py:17` | `roll_id` FK — NO index. Consumption history lookup. | Add `index=True` |
| 18 | `order.py:17` | `source` column — NO index. Filtered in `OrderFilterParams`. | Add `index=True` |
| 19 | `order_item.py:15` | `order_id` FK — NO index. | Add `index=True` |
| 20 | `order_item.py:16` | `sku_id` FK — NO index. | Add `index=True` |
| 21 | `batch.py:19` | `quantity` — NO check > 0. | Add `CheckConstraint('quantity > 0')` |
| 22 | `batch_processing.py:31` | `pieces_sent` — NO check > 0. | Add `CheckConstraint('pieces_sent > 0')` |

### LOW (4) — Defer

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 23 | `invoice.py:17` | `order_id` FK — NO index. | Add `index=True` |
| 24 | `invoice_item.py:15` | `invoice_id` FK — NO index. | Add `index=True` |
| 25 | `inventory_event.py:23` | `roll_id` FK — NO index. | Add `index=True` |
| 26 | `roll.py:16` | `roll_code` String(50) — with VA suffixes like `1-COT-PINK/07-01+EMB+DYE+SQN` that's ~35 chars. Tight if many VAs. | Consider String(80) |

### Already Good (10 items)

- Batch: `status`, `lot_id`, `sku_id`, `size` — all indexed
- BatchProcessing: `batch_id`, `batch_challan_id`, `value_addition_id`, `status` — all indexed
- BatchChallan: `challan_no`, `value_addition_id`, `status` — all indexed
- Lot: `status`, `sku_id` — indexed. LotRoll: `lot_id`, `roll_id` — indexed
- All unique codes: `roll_code`, `batch_code`, `lot_code`, `challan_no`, `sku_code`, `order_number` — unique=True
- Naming convention for constraints (Alembic-friendly)
- PostgreSQL pool: `pool_size=10`, `max_overflow=20`
- `DateTime(timezone=True)` on `created_at` — asyncpg compatible

---

## Session Plan

- **S60 (done):** P2 backend invoice layer (FIXED) + Phase 1 audit (COMPLETE)
- **S61 (next):** Fix all Phase 1 findings (CRITICAL→LOW) via Alembic migration, then Phase 2 (query efficiency audit)
- **S62:** Phase 3 (data flow integrity) + Phase 4 (production readiness)
- **S63:** Apply Phase 2-4 fixes

---

## Rules
1. NO code changes during audit — findings only
2. Every finding has file, line, severity, and proposed fix
3. Ask user before proceeding to next phase
4. Save findings to this document as we go
5. Update CLAUDE.md at session end
