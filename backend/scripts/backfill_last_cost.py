"""S112 Backfill: set sku.base_price = Last Cost (unit_cost of LATEST stock-in event).

CONTEXT
  S112 redefined sku.base_price as "Last Cost" (Option D): pricing signal =
  unit_cost of the most recent stock-in event. FY closing + dashboard valuation
  now use event-WAC, so base_price is no longer used for valuation math.

  Before this script, 1696 SKUs had base_price=0 (S110 migration moved old
  values to sale_rate). After this script, each SKU will carry the unit_cost
  of its latest ready_stock_in / opening_stock / stock_in event — matching
  the new write-path behaviour in sku_service + batch_service.

SAFETY
  - Run AFTER deploying the S112 Last Cost code.
  - Run AFTER taking an RDS snapshot (standard practice for any bulk update).
  - Idempotent: re-running produces the same base_price values.
  - Only touches SKUs that have at least one cost-bearing event. SKUs with
    no events are left alone (their base_price stays as-is).

WHAT IT DOES (per tenant schema)
  For each SKU:
    1. Find the latest InventoryEvent (performed_at DESC) where event_type IN
       (ready_stock_in, opening_stock, stock_in) AND metadata_ has a numeric
       unit_cost (or cost_per_piece fallback).
    2. If that unit_cost > 0, write it to sku.base_price.
    3. Skip if no qualifying event exists.

USAGE
  cd backend && python -m scripts.backfill_last_cost [--dry-run]

  --dry-run: prints what would be updated without committing.

EXIT: 0 on success, non-zero on error.
"""
import asyncio
import sys
from sqlalchemy import text
from app.database import engine


async def get_tenant_schemas(conn):
    result = await conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata "
        "WHERE schema_name LIKE 'co_%' ORDER BY schema_name"
    ))
    return [row[0] for row in result.fetchall()]


async def backfill_schema(conn, schema: str, dry_run: bool) -> tuple[int, int]:
    print(f"\n=== Schema: {schema} ===")

    sku_total = (await conn.execute(text(f"SELECT COUNT(*) FROM {schema}.skus"))).scalar() or 0
    print(f"  SKUs: {sku_total}")

    # Candidate updates — one row per SKU with the latest qualifying event's unit_cost.
    # DISTINCT ON picks the first row per sku_id after ORDER BY performed_at DESC.
    # metadata column is JSON (not JSONB), so we can't use `?`. Using ->> with NULL
    # check + numeric cast — invalid/missing values just produce NULL and are filtered.
    candidates = (await conn.execute(text(f"""
        SELECT DISTINCT ON (e.sku_id)
          e.sku_id,
          COALESCE(
            NULLIF(e.metadata->>'unit_cost', '')::numeric,
            NULLIF(e.metadata->>'cost_per_piece', '')::numeric
          ) AS unit_cost,
          e.event_type,
          e.performed_at,
          s.sku_code,
          s.base_price AS current_base_price
        FROM {schema}.inventory_events e
        JOIN {schema}.skus s ON s.id = e.sku_id
        WHERE e.event_type IN ('ready_stock_in','opening_stock','stock_in')
          AND COALESCE(
            NULLIF(e.metadata->>'unit_cost', '')::numeric,
            NULLIF(e.metadata->>'cost_per_piece', '')::numeric,
            0
          ) > 0
        ORDER BY e.sku_id, e.performed_at DESC
    """))).all()

    print(f"  SKUs with at least one cost-bearing event: {len(candidates)}")

    changed = 0
    unchanged = 0
    for c in candidates:
        new_cost = float(c.unit_cost)
        old_cost = float(c.current_base_price) if c.current_base_price else 0.0
        if abs(old_cost - new_cost) < 0.005:  # same value within paisa
            unchanged += 1
            continue
        if dry_run:
            changed += 1
            if changed <= 10:
                print(f"    [dry-run] {c.sku_code}: {old_cost:.2f} → {new_cost:.2f} (from {c.event_type})")
            continue
        await conn.execute(
            text(f"UPDATE {schema}.skus SET base_price = :bp WHERE id = :id"),
            {"bp": new_cost, "id": c.sku_id},
        )
        changed += 1

    print(f"  {'Would update' if dry_run else 'Updated'}: {changed}  |  Unchanged: {unchanged}")
    return changed, unchanged


async def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("=== DRY RUN — no changes committed ===")

    total_changed = 0
    total_unchanged = 0

    async with engine.begin() as conn:
        schemas = await get_tenant_schemas(conn)
        for s in schemas:
            c, u = await backfill_schema(conn, s, dry_run)
            total_changed += c
            total_unchanged += u

        if dry_run:
            await conn.rollback()

    print(f"\n=== Summary ===")
    print(f"  Total updated: {total_changed}")
    print(f"  Total unchanged: {total_unchanged}")
    if dry_run:
        print("  (dry-run — rolled back)")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
