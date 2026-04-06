"""S107 Backfill: Propagate HSN code to existing SKUs and InvoiceItems.

SAFETY:
  - Run AFTER alembic migration c3d4e5f6g7h8 (adds hsn_code to product_types)
  - Run AFTER admin has set hsn_code on each ProductType via MastersPage UI
  - Run AFTER taking an RDS snapshot
  - Idempotent — only updates rows where hsn_code IS NULL

WHAT IT DOES (per tenant schema):
  1. Updates skus.hsn_code from product_types.hsn_code (matched by skus.product_type = product_types.code)
     Only where skus.hsn_code IS NULL.
  2. Updates invoice_items.hsn_code from skus.hsn_code (joined by sku_id)
     Only where invoice_items.hsn_code IS NULL AND invoice is not cancelled.

USAGE:
  cd backend && python -m scripts.backfill_hsn [--dry-run]

  --dry-run: prints what would be updated without committing

EXIT:
  0 on success, non-zero on error.
"""
import asyncio
import sys
from sqlalchemy import text
from app.database import engine


async def get_tenant_schemas(conn):
    """Return list of all co_* tenant schemas."""
    result = await conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata "
        "WHERE schema_name LIKE 'co_%' ORDER BY schema_name"
    ))
    return [row[0] for row in result.fetchall()]


async def backfill_schema(conn, schema: str, dry_run: bool):
    """Run backfill SQL for one tenant schema."""
    print(f"\n=== Schema: {schema} ===")

    # 1. Count product_types with HSN set
    pt_with_hsn = await conn.execute(text(
        f"SELECT COUNT(*) FROM {schema}.product_types WHERE hsn_code IS NOT NULL"
    ))
    pt_count = pt_with_hsn.scalar()
    if pt_count == 0:
        print(f"  ⚠️  No product types have hsn_code set yet — skip backfill.")
        print(f"     Set HSN on each Product Type via MastersPage UI first.")
        return 0, 0

    print(f"  Product types with HSN: {pt_count}")

    # 2. Count SKUs needing backfill
    sku_target = await conn.execute(text(f"""
        SELECT COUNT(*) FROM {schema}.skus s
        JOIN {schema}.product_types pt ON pt.code = s.product_type
        WHERE s.hsn_code IS NULL AND pt.hsn_code IS NOT NULL
    """))
    sku_count = sku_target.scalar()
    print(f"  SKUs to backfill: {sku_count}")

    # 3. Count invoice_items needing backfill (after SKUs are updated)
    # We compute this as: invoice_items where hsn_code IS NULL and the linked SKU's product_type has HSN
    inv_target = await conn.execute(text(f"""
        SELECT COUNT(*) FROM {schema}.invoice_items ii
        JOIN {schema}.skus s ON s.id = ii.sku_id
        JOIN {schema}.product_types pt ON pt.code = s.product_type
        JOIN {schema}.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.hsn_code IS NULL
          AND pt.hsn_code IS NOT NULL
          AND inv.status != 'cancelled'
    """))
    inv_count = inv_target.scalar()
    print(f"  Invoice items to backfill: {inv_count}")

    if dry_run:
        print(f"  [DRY RUN] No changes committed.")
        return sku_count, inv_count

    # Execute the updates
    await conn.execute(text(f"""
        UPDATE {schema}.skus s
        SET hsn_code = pt.hsn_code
        FROM {schema}.product_types pt
        WHERE pt.code = s.product_type
          AND s.hsn_code IS NULL
          AND pt.hsn_code IS NOT NULL
    """))

    await conn.execute(text(f"""
        UPDATE {schema}.invoice_items ii
        SET hsn_code = s.hsn_code
        FROM {schema}.skus s, {schema}.invoices inv
        WHERE s.id = ii.sku_id
          AND inv.id = ii.invoice_id
          AND ii.hsn_code IS NULL
          AND s.hsn_code IS NOT NULL
          AND inv.status != 'cancelled'
    """))

    print(f"  ✅ Updated {sku_count} SKUs + {inv_count} invoice items")
    return sku_count, inv_count


async def main():
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        print("=" * 60)
        print("HSN BACKFILL — DRY RUN (no changes will be committed)")
        print("=" * 60)
    else:
        print("=" * 60)
        print("HSN BACKFILL — LIVE RUN")
        print("=" * 60)

    total_skus = 0
    total_invs = 0

    async with engine.begin() as conn:
        schemas = await get_tenant_schemas(conn)
        if not schemas:
            print("No tenant schemas found. Exiting.")
            return

        print(f"Found {len(schemas)} tenant schema(s): {', '.join(schemas)}")

        for s in schemas:
            sku_n, inv_n = await backfill_schema(conn, s, dry_run)
            total_skus += sku_n
            total_invs += inv_n

        if dry_run:
            # Roll back any changes from dry run (begin() commits on success)
            raise Exception("DRY_RUN_ROLLBACK")

    print("\n" + "=" * 60)
    print(f"DONE. Total: {total_skus} SKUs + {total_invs} invoice items updated.")
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        if str(e) == "DRY_RUN_ROLLBACK":
            print("\n[DRY RUN] Transaction rolled back. No changes committed.")
            sys.exit(0)
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
