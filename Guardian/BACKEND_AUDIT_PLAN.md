# Backend Architecture Audit Plan

> **Created:** S60 (2026-03-06) | **Updated:** S61 (2026-03-06)
> **Goal:** Production-grade backend before real data goes live

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

## Phase 1: Database Structure — AUDITED (S60) + FIXED (S61)

All 24 models reviewed (S60). All 26 issues fixed and deployed to production (S61).

**Fix details:** 11 model files edited, 1 Alembic migration created (`s61_db_hardening`).
**Deploy:** Tables dropped + recreated + re-seeded on PostgreSQL (production had only master data).
**Commit:** `7d54969` — pushed to GitHub, pulled on EC2, FastAPI restarted.
**Verified:** `pg_indexes` and `pg_constraint` queries confirm all indexes/constraints present.

All 26 issues found:

### CRITICAL (4) — ✅ ALL FIXED

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 1 | `roll.py:25` | `status` column — NO index. Every `GET /rolls?status=in_stock` full table scan. Hottest query in the app. | Add `index=True` to `status` column |
| 2 | `roll.py:26` | `supplier_invoice_no` — NO index. `get_supplier_invoices` loads ALL rolls. At 10K+ rolls this dominates CPU. | Add `index=True` |
| 3 | `roll.py:32` | `supplier_id` FK — NO index. Supplier filter scans entire rolls table. | Add `index=True` |
| 4 | `roll.py:19` | `total_weight` Numeric — NO check constraint. Zero/negative weight can be inserted via bug or direct DB. Corrupted data is unfixable. | Add `CheckConstraint('total_weight > 0', name='ck_rolls_positive_weight')` |

### HIGH (7) — ✅ ALL FIXED

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 5 | `roll.py:29` | `sr_no` — NO index. Filtered in `RollFilterParams`, used in label printing after stock-in. | Add `index=True` |
| 6 | `roll.py:25` | `status` — NO CHECK constraint. Any string like `"in_stok"` silently accepted. | Add `CheckConstraint("status IN ('in_stock','sent_for_processing','in_cutting')")` |
| 7 | `batch.py:22` | `status` — has index but NO CHECK. 7-state machine not enforced at DB level. | Add `CheckConstraint` for 7 valid states |
| 8 | `lot.py:30-31` | `status` — has index but NO CHECK. Should be `open`/`cutting`/`distributed` only. | Add `CheckConstraint` |
| 9 | `supplier.py:27` | `Supplier.rolls` rel — NO `ondelete` rule on Roll FK. Supplier delete → orphaned rolls or FK violation. | Add `ondelete="RESTRICT"` on `Roll.supplier_id` FK |
| 10 | `lot.py:46-47` | `LotRoll.lot_id` / `LotRoll.roll_id` — NO `ondelete`. Lot delete → orphan lot_rolls. Roll delete while in lot → orphan. | Add `ondelete="CASCADE"` on lot_id, `ondelete="RESTRICT"` on roll_id |
| 11 | `batch.py:16` | `Batch.lot_id` — NO `ondelete`. Lot delete → orphan batches. | Add `ondelete="RESTRICT"` |

### MEDIUM (11) — ✅ ALL FIXED

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

### LOW (4) — ✅ ALL FIXED

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

## Phase 2 Findings: Query Efficiency — AUDITED (S61) + FIXED (S62)

All 17 services reviewed (S61). All 14 issues fixed (S62).

**Fix details:** 7 service files edited. Zero logic changes — only internal query patterns optimized.
**Key wins:**
- `get_supplier_invoices()`: fetch ALL rolls → 2-phase SQL (GROUP BY + paginated roll fetch)
- `get_summary()`: ~15 queries → ~8 (GROUP BY, CASE WHEN aggregations)
- `get_tailor_performance()`: N+1 (20 tailors × 1 query) → 2 queries total
- `get_inventory_movement()`: N+1 per SKU → single GROUP BY
- `get_financial_report()`: day-by-day loop → single GROUP BY DATE
- `get_production_report()`: N+1 lot_rolls → selectinload
- `get_batches()` location filter: fetch ALL → SQL subquery
- `create_lot()`: per-roll fetch → batch IN()
- `distribute_lot()`: re-query loop → use objects after flush()
- `reconcile()`: per-SKU event query → single GROUP BY
- `create_order()`: per-item SKU+inv fetch → batch IN()
- `expire_stale_reservations()`: per-reservation inv lookup → batch fetch

### CRITICAL (2) — ✅ ALL FIXED

| # | File:Line | Issue | Fix | Status |
|---|-----------|-------|-----|--------|
| P2-1 | `roll_service.py` | `get_supplier_invoices()` fetches ALL rolls | 2-phase: SQL GROUP BY + fetch rolls for visible page only | ✅ FIXED |
| P2-2 | `dashboard_service.py` | 7 separate COUNT queries for batch statuses | Single `GROUP BY status` query | ✅ FIXED |

### HIGH (5) — ✅ ALL FIXED

| # | File:Line | Issue | Fix | Status |
|---|-----------|-------|-----|--------|
| P2-3 | `dashboard_service.py` | ~15 individual COUNT/SUM queries | CASE WHEN aggregations per table | ✅ FIXED |
| P2-4 | `dashboard_service.py` | N+1 on lots→lot_rolls in production report | Added `selectinload(Lot.lot_rolls)` | ✅ FIXED |
| P2-5 | `dashboard_service.py` | revenue_by_period day-by-day loop (30 queries) | Single `GROUP BY DATE(paid_at)` + fill gaps | ✅ FIXED |
| P2-6 | `batch_service.py` | location filter fetches ALL batches | SQL subquery for out_house batch IDs | ✅ FIXED |
| P2-7 | `dashboard_service.py` | N+1 per tailor performance | Single batch query + Python grouping | ✅ FIXED |

### MEDIUM (5) — ✅ ALL FIXED

| # | File:Line | Issue | Fix | Status |
|---|-----------|-------|-----|--------|
| P2-8 | `lot_service.py` | create_lot per-roll fetch (20 queries) | Batch `WHERE id IN (...)` | ✅ FIXED |
| P2-9 | `lot_service.py` | distribute_lot re-queries batches by code | Use batch objects directly after flush() | ✅ FIXED |
| P2-10 | `inventory_service.py` | reconcile per-SKU event query (500 queries) | Single `GROUP BY sku_id, event_type` | ✅ FIXED |
| P2-11 | `order_service.py` | create_order per-item SKU+inv fetch | Batch `WHERE id IN (...)` for both | ✅ FIXED |
| P2-12 | `job_challan_service.py` | Deep 4-level eager load chain | Reviewed — chain IS needed for enhanced_roll_code. Added comment. | ✅ REVIEWED |

### LOW (2) — ✅ ALL FIXED

| # | File:Line | Issue | Fix | Status |
|---|-----------|-------|-----|--------|
| P2-13 | `reservation_service.py` | expire_stale per-reservation inv lookup | Batch fetch all inv states at once | ✅ FIXED |
| P2-14 | `dashboard_service.py` | inventory_movement per-SKU loop | Single `GROUP BY sku_id, event_type` + batch inv fetch | ✅ FIXED |

### Already Good (notable patterns)

- `roll_service.get_rolls()` — proper SQL pagination, count, sort, eager loads. Well-structured.
- `roll_service.get_roll()` — single query with selectinload. Clean.
- `batch_service._get_or_404()` — comprehensive eager loading prevents lazy load errors.
- `job_challan_service.create_challan()` — batch validates rolls with `IN()` query. Good.
- `batch_challan_service` — proper eager loading, `.unique()` on list queries.
- `auth_service` / `user_service` / `master_service` — simple queries, no issues.
- `inventory_service.get_inventory()` — proper join + pagination + subquery for count.
- All services use `selectinload` consistently (no lazy load crashes in async).
- All list endpoints have SQL `COUNT`, `OFFSET`, `LIMIT` (except the flagged ones).

---

## Phase 3 Findings: Data Flow Integrity — AUDITED + FIXED (S63)

All 5 key services audited. 9 issues found and fixed.

**Fix details:** 9 files edited. Zero response shape changes. SQLite dev compatibility preserved.
**Key wins:**
- Race condition protection: `SELECT FOR UPDATE` on all roll weight mutations (PostgreSQL)
- DB constraint: `remaining_weight >= 0` CHECK on Roll model
- Lot state machine: removed `status` from `LotUpdate` schema (can't bypass via PATCH)
- Sequence collision: all code generators + challan numbers use row-level locking on PostgreSQL
- Roll edit guard: now checks processing history + lot assignments, not just weight comparison
- Status preservation: `receive_from_processing` no longer overrides `in_cutting` status

### CRITICAL (2) — ✅ ALL FIXED

| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P3-1 | `roll_service.py`, `lot_service.py`, `job_challan_service.py` | No `SELECT FOR UPDATE` on `remaining_weight` before deduction — race condition | Added `with_for_update()` on all critical roll reads (PostgreSQL only, no-op on SQLite) | ✅ FIXED |
| P3-2 | `models/roll.py` | No CHECK constraint `remaining_weight >= 0` — negative weight persists silently | Added `CheckConstraint("remaining_weight >= 0", name="non_negative_remaining")` | ✅ FIXED |

### HIGH (3) — ✅ ALL FIXED

| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P3-3 | `schemas/lot.py:86` | `LotUpdate` includes `status` — bypasses lot state machine via PATCH | Removed `status` field from `LotUpdate` schema | ✅ FIXED |
| P3-4 | `code_generator.py`, `lot_service.py`, `job_challan_service.py`, `batch_challan_service.py` | Sequence collision — `SELECT MAX + 1` race on concurrent requests | Changed to `ORDER BY DESC LIMIT 1 FOR UPDATE` on PostgreSQL; UNIQUE constraint safety net | ✅ FIXED |
| P3-5 | `roll_service.py:512` | `update_roll()` guard passes after full VA cycle (remaining == current) | Added check for processing_logs and lot_rolls count > 0 | ✅ FIXED |

### MEDIUM (2) — ✅ ALL FIXED

| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P3-6 | `batch_service.py:134` | `update_batch()` uses `db.commit()` instead of `db.flush()` | Changed to `db.flush()`, removed `db.refresh()` (pattern matches all other services) | ✅ FIXED |
| P3-7 | `roll_service.py:670` | `receive_from_processing` resets `in_cutting` to `in_stock` when VA returns | Now only transitions from `sent_for_processing` → `in_stock`; preserves `in_cutting` | ✅ FIXED |

### LOW (2) — ✅ ALL FIXED

| # | File | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P3-8 | `lot_service.py:182` | `add_roll_to_lot()` only allows `"open"` status — correct but noted | No change needed — behavior is correct | ✅ REVIEWED |
| P3-9 | `batch_challan_service.py:127` | SSE emit accesses `challan.batch_items` before eager reload | Changed to use `total_pieces` (already computed from request data) | ✅ FIXED |

### Files Changed (9 files)
- `backend/app/database.py` — Added `is_postgresql()` helper
- `backend/app/models/roll.py` — Added CHECK constraint `remaining_weight >= 0`
- `backend/app/schemas/lot.py` — Removed `status` from `LotUpdate`
- `backend/app/core/code_generator.py` — `_max_code()` helper with FOR UPDATE on PostgreSQL
- `backend/app/services/roll_service.py` — FOR UPDATE on send/receive/update_processing_log, better update guard, preserve in_cutting
- `backend/app/services/lot_service.py` — FOR UPDATE on create/add/remove roll, distribute_lot batch code lock
- `backend/app/services/job_challan_service.py` — FOR UPDATE on challan number + roll reads
- `backend/app/services/batch_challan_service.py` — FOR UPDATE on challan number + SSE emit fix
- `backend/app/services/batch_service.py` — `commit()` → `flush()` in update_batch

### Already Good (notable patterns)
- Bulk stock-in: all-or-nothing via single flush — ✅ atomic
- Job challan create: challan + all roll sends in single flush — ✅ atomic
- Batch challan create: challan + all BatchProcessing records in single flush — ✅ atomic
- Lot distribute: all batches + status change in single flush — ✅ atomic
- Batch 7-state machine: every transition has exact status guard — ✅ no skips possible
- VA guard on submit + ready_for_packing: consistent — ✅ enforced
- Roll status transitions: properly guarded (in_stock required for send/lot) — ✅
- total_weight: only set in stock_in/bulk_stock_in — ✅ immutable after use

---

## Session Plan

| Session | Phase | Status |
|---------|-------|--------|
| S60 | Phase 1: DB Structure Audit (26 findings) | ✅ COMPLETE |
| S61 | Phase 1: Fix all 26 findings + deploy | ✅ COMPLETE |
| S61 | Phase 2: Query Efficiency Audit (14 findings) | ✅ COMPLETE |
| S62 | Phase 2: Fix all 14 findings | ✅ COMPLETE |
| S63 | Phase 3: Data Flow Integrity (9 findings) | ✅ COMPLETE |
| S63 | Phase 4: Production Readiness Audit (10 findings) | ✅ AUDITED |
| S64 | Phase 4: Fix all 10 findings + deploy | NEXT |

---

## Phase 4 Findings: Production Readiness — AUDITED (S63), PARTIALLY FIXED

**Files read:** `main.py`, `database.py`, `config.py`, `security.py`, `permissions.py`, `event_bus.py`, `error_handlers.py`, `exceptions.py`, `dependencies.py`, `reservation_expiry.py`, `backup_sync.py`, EC2 `.env`, Nginx config, systemd service.

**P4-4 pool_pre_ping FIXED in S63** (committed but not yet pushed/deployed).

### HIGH (3)

| # | Area | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P4-1 | EC2 `.env` | JWT_SECRET is predictable (`drs-inventory-prod-jwt-secret-2026-change-this`) | Generate random 64-char secret, update .env on EC2 | PENDING |
| P4-2 | `CLAUDE.md` | DB password + RDS endpoint exposed in public repo docs | Replace with `[see EC2 .env]` placeholder | PENDING |
| P4-3 | `main.py` | Swagger UI publicly accessible at `/api/v1/docs` in production | Disable docs_url/redoc_url when APP_ENV=production | PENDING |

### MEDIUM (4)

| # | Area | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P4-4 | `database.py` | Missing `pool_pre_ping=True` — stale connections after idle | Added `pool_pre_ping=True` + `pool_recycle=1800` | ✅ FIXED (not deployed) |
| P4-5 | EC2 `.env` CORS | localhost origins in production ALLOWED_ORIGINS | Remove localhost, keep only `https://inventory.drsblouse.com` | PENDING |
| P4-6 | Nginx | No security headers (HSTS, X-Content-Type-Options, X-Frame-Options) | Add headers to Nginx server block | PENDING |
| P4-7 | Nginx | No explicit `client_max_body_size` | Set `client_max_body_size 5m;` | PENDING |

### LOW (3)

| # | Area | Issue | Fix | Status |
|---|------|-------|-----|--------|
| P4-8 | Logging | No structured log format for production | Add basicConfig with timestamp+level+name format | PENDING |
| P4-9 | Auth | No rate limiting on login endpoint | Future: add `slowapi` middleware | DEFERRED |
| P4-10 | Tasks | `asyncio.get_event_loop()` deprecated in 3.10+ | Change to `asyncio.create_task()` in lifespan | PENDING |

### Already Good
- Exception hierarchy: 400/401/403/404/409/410/422 + generic 500 handler ✅
- Pool: size=10, overflow=20 (correct for t3.micro) ✅
- `echo=False` in production ✅
- `.env` in `.gitignore` ✅
- Gunicorn: 2 UvicornWorkers, 120s timeout, auto-restart ✅
- SSL enforced, HTTP→HTTPS, Let's Encrypt ✅
- SSE: proxy_buffering off, 86400s read timeout ✅
- JWT: HS256, 1h access / 7d refresh ✅
- Password hashing: bcrypt via passlib ✅
- Auth: Bearer token, DB user lookup, role+permission in JWT ✅

---

## Rules
1. Every finding has file, line, severity, and proposed fix
2. Ask user before proceeding to next phase
3. Save findings to this document as we go
4. Update CLAUDE.md at session end
