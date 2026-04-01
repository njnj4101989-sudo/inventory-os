#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — Production Data Wipe + FY Seed
#
# Wipes ALL transactional data, keeps 5 master tables:
#   fabrics, colors, product_types, value_additions, designs
#
# Then creates FY 2026-27 so the app is immediately usable.
#
# IMPORTANT: Run snapshot.sh BEFORE this script!
#   ./snapshot.sh pre-data-wipe
#   ./wipe-and-seed-fy.sh
# ============================================================

DB_HOST="${DB_HOST:-drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-drs_inventory}"
DB_USER="${DB_USER:-postgres}"

echo "=============================================="
echo "  PRODUCTION DATA WIPE"
echo "=============================================="
echo ""
echo "  Target: ${DB_HOST}/${DB_NAME}"
echo ""
echo "  KEEPING: fabrics, colors, product_types,"
echo "           value_additions, designs"
echo ""
echo "  DELETING: everything else (all transactions,"
echo "            parties, FY, rolls, orders, etc.)"
echo ""
echo "  After wipe: FY 2026-27 will be created."
echo ""

# Check snapshot exists
SNAPSHOT_COUNT=$(aws s3 ls s3://inventory-os-backups-ap-south-1/snapshots/ 2>/dev/null | wc -l)
if [ "$SNAPSHOT_COUNT" -eq 0 ]; then
    echo "ERROR: No snapshot found in S3. Run snapshot.sh first!"
    echo "  ./snapshot.sh pre-data-wipe"
    exit 1
fi
echo "  Latest snapshot:"
aws s3 ls s3://inventory-os-backups-ap-south-1/snapshots/ | tail -1
echo ""

read -p "  Type 'WIPE' to proceed: " CONFIRM
if [ "$CONFIRM" != "WIPE" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "[1/4] Discovering tenant schemas..."
SCHEMAS=$(PGPASSWORD="" psql \
    --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
    --tuples-only --no-align \
    --command="SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'co_%';")

if [ -z "$SCHEMAS" ]; then
    echo "ERROR: No tenant schemas found."
    exit 1
fi
echo "  Found: ${SCHEMAS}"

echo ""
echo "[2/4] Wiping transactional data (keeping 5 masters)..."
for SCHEMA in $SCHEMAS; do
    echo "  Schema: ${SCHEMA}"
    PGPASSWORD="" psql \
        --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
        --command="
        TRUNCATE TABLE
            ${SCHEMA}.sales_return_items,
            ${SCHEMA}.sales_returns,
            ${SCHEMA}.return_note_items,
            ${SCHEMA}.return_notes,
            ${SCHEMA}.stock_verification_items,
            ${SCHEMA}.stock_verifications,
            ${SCHEMA}.shipment_items,
            ${SCHEMA}.shipments,
            ${SCHEMA}.invoice_items,
            ${SCHEMA}.invoices,
            ${SCHEMA}.order_items,
            ${SCHEMA}.orders,
            ${SCHEMA}.purchase_items,
            ${SCHEMA}.reservations,
            ${SCHEMA}.inventory_events,
            ${SCHEMA}.inventory_state,
            ${SCHEMA}.batch_assignments,
            ${SCHEMA}.batch_processing,
            ${SCHEMA}.batch_challans,
            ${SCHEMA}.batch_roll_consumption,
            ${SCHEMA}.batches,
            ${SCHEMA}.lot_rolls,
            ${SCHEMA}.lots,
            ${SCHEMA}.roll_processing,
            ${SCHEMA}.job_challans,
            ${SCHEMA}.rolls,
            ${SCHEMA}.supplier_invoices,
            ${SCHEMA}.skus,
            ${SCHEMA}.ledger_entries,
            ${SCHEMA}.financial_years,
            ${SCHEMA}.suppliers,
            ${SCHEMA}.customers,
            ${SCHEMA}.brokers,
            ${SCHEMA}.transports,
            ${SCHEMA}.va_parties
        CASCADE;
        "
    echo "  Wiped: ${SCHEMA}"
done

echo ""
echo "[3/4] Creating FY 2026-27..."
for SCHEMA in $SCHEMAS; do
    PGPASSWORD="" psql \
        --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
        --command="
        INSERT INTO ${SCHEMA}.financial_years (id, code, start_date, end_date, status, is_current, created_at)
        VALUES (
            gen_random_uuid(),
            'FY2026-27',
            '2026-04-01',
            '2027-03-31',
            'open',
            true,
            NOW()
        );
        "
    echo "  Created FY2026-27 in ${SCHEMA}"
done

echo ""
echo "[4/4] Verifying..."
for SCHEMA in $SCHEMAS; do
    echo "  --- ${SCHEMA} ---"
    PGPASSWORD="" psql \
        --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
        --tuples-only \
        --command="
        SELECT 'Masters: ' ||
            (SELECT count(*) FROM ${SCHEMA}.fabrics) || ' fabrics, ' ||
            (SELECT count(*) FROM ${SCHEMA}.colors) || ' colors, ' ||
            (SELECT count(*) FROM ${SCHEMA}.product_types) || ' types, ' ||
            (SELECT count(*) FROM ${SCHEMA}.value_additions) || ' VAs, ' ||
            (SELECT count(*) FROM ${SCHEMA}.designs) || ' designs'
        UNION ALL
        SELECT 'FY: ' || code || ' (' || start_date || ' → ' || end_date || ') — ' || status
        FROM ${SCHEMA}.financial_years
        UNION ALL
        SELECT 'Transactions: ' ||
            (SELECT count(*) FROM ${SCHEMA}.rolls) || ' rolls, ' ||
            (SELECT count(*) FROM ${SCHEMA}.orders) || ' orders, ' ||
            (SELECT count(*) FROM ${SCHEMA}.invoices) || ' invoices';
        "
done

echo ""
echo "=== Wipe complete. FY 2026-27 active. ==="
echo ""
echo "Next steps:"
echo "  1. Log in at https://inventory.drsblouse.com"
echo "  2. Go to Settings → select FY 2026-27"
echo "  3. Enter opening stock (Rolls + SKUs)"
echo "  4. Enter party masters (Suppliers, Customers, etc.)"
echo "  5. Enter opening balances (Settings → Opening Balances)"
