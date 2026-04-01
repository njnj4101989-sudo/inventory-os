#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — PostgreSQL Restore from S3 Backup
#
# Usage:
#   ./restore.sh                                    # List available backups
#   ./restore.sh daily/2026-04-01_02-00.dump        # Restore specific backup
#   ./restore.sh snapshots/pre-fy-close_2026-04.dump
# ============================================================

# --- Configuration ---
DB_HOST="${DB_HOST:-drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-drs_inventory}"
DB_USER="${DB_USER:-postgres}"
S3_BUCKET="${S3_BUCKET:-s3://inventory-os-backups-ap-south-1}"
RESTORE_DIR="/tmp/inventory-restore"

# --- No arguments: list available backups ---
if [ $# -lt 1 ]; then
    echo "inventory-os — Restore from S3 Backup"
    echo ""
    echo "Usage: $0 <s3-key>"
    echo ""
    echo "Examples:"
    echo "  $0 daily/2026-04-01_02-00.dump"
    echo "  $0 monthly/2026-04.dump"
    echo "  $0 snapshots/pre-fy-close_2026-04-01_14-30.dump"
    echo ""
    echo "--- Daily (last 10) ---"
    aws s3 ls "${S3_BUCKET}/daily/" 2>/dev/null | tail -10 || echo "  (none)"
    echo ""
    echo "--- Monthly ---"
    aws s3 ls "${S3_BUCKET}/monthly/" 2>/dev/null || echo "  (none)"
    echo ""
    echo "--- Snapshots ---"
    aws s3 ls "${S3_BUCKET}/snapshots/" 2>/dev/null || echo "  (none)"
    exit 0
fi

S3_KEY="$1"
DUMP_FILE="${RESTORE_DIR}/$(basename "$S3_KEY")"

mkdir -p "$RESTORE_DIR"

echo "[1/5] Downloading ${S3_KEY} from S3..."
aws s3 cp "${S3_BUCKET}/${S3_KEY}" "$DUMP_FILE" --only-show-errors
DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
echo "  Downloaded: $(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes")"

echo ""
echo "[2/5] Verifying dump integrity..."
TABLE_COUNT=$(pg_restore --list "$DUMP_FILE" 2>/dev/null | grep -c "TABLE DATA" || echo "0")
SCHEMA_COUNT=$(pg_restore --list "$DUMP_FILE" 2>/dev/null | grep "SCHEMA -" | grep -c "co_" || echo "0")
echo "  Data tables: ${TABLE_COUNT}"
echo "  Tenant schemas: ${SCHEMA_COUNT}"

echo ""
echo "[3/5] Schemas in dump:"
pg_restore --list "$DUMP_FILE" 2>/dev/null | grep "SCHEMA -" || echo "  (none found)"

echo ""
echo "=============================================="
echo "  WARNING: DESTRUCTIVE OPERATION"
echo "=============================================="
echo ""
echo "  This will DROP and RECREATE all objects in:"
echo "  Host:     ${DB_HOST}"
echo "  Database: ${DB_NAME}"
echo "  Port:     ${DB_PORT}"
echo ""
echo "  All current data will be replaced."
echo ""
read -p "  Type 'RESTORE' to proceed (anything else cancels): " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
    echo ""
    echo "Aborted. No changes made."
    rm -f "$DUMP_FILE"
    exit 0
fi

echo ""
echo "[4/5] Restoring database..."
pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --verbose \
    --jobs=2 \
    "$DUMP_FILE" \
    2>&1 | tee "${RESTORE_DIR}/restore.log"

echo ""
echo "[5/5] Verifying restore..."
RESTORED_SCHEMAS=$(psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --tuples-only \
    --no-align \
    --command="SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'co_%';" \
    2>/dev/null || echo "?")
echo "  Tenant schemas after restore: ${RESTORED_SCHEMAS}"

ALEMBIC_VER=$(psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --tuples-only \
    --no-align \
    --command="SELECT version_num FROM public.alembic_version LIMIT 1;" \
    2>/dev/null || echo "?")
echo "  Alembic version: ${ALEMBIC_VER}"

rm -f "$DUMP_FILE"
echo ""
echo "=== Restore complete ==="
echo "Log: ${RESTORE_DIR}/restore.log"
