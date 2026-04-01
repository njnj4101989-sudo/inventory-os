#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — Pre-Operation Snapshot
#
# Take a named snapshot before risky operations:
#   ./snapshot.sh pre-fy-close
#   ./snapshot.sh pre-data-wipe
#   ./snapshot.sh pre-migration-v2
#
# Snapshots are NOT auto-pruned. Clean up manually via:
#   aws s3 ls s3://inventory-os-backups-ap-south-1/snapshots/
#   aws s3 rm s3://inventory-os-backups-ap-south-1/snapshots/<file>
# ============================================================

# --- Configuration ---
DB_HOST="${DB_HOST:-drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-drs_inventory}"
DB_USER="${DB_USER:-postgres}"
S3_BUCKET="${S3_BUCKET:-s3://inventory-os-backups-ap-south-1}"
BACKUP_DIR="/tmp/inventory-backups"

# --- Label ---
if [ $# -lt 1 ]; then
    echo "Usage: $0 <label>"
    echo ""
    echo "Examples:"
    echo "  $0 pre-fy-close"
    echo "  $0 pre-data-wipe"
    echo "  $0 pre-migration-v2"
    echo ""
    echo "Existing snapshots:"
    aws s3 ls "${S3_BUCKET}/snapshots/" 2>/dev/null || echo "  (none)"
    exit 1
fi

LABEL="$1"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
S3_KEY="snapshots/${LABEL}_${TIMESTAMP}.dump"
DUMP_FILE="${BACKUP_DIR}/${LABEL}_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Creating snapshot: ${LABEL}"
echo "Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""

pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --compress=6 \
    --encoding=UTF8 \
    --no-owner \
    --no-privileges \
    --file="$DUMP_FILE"

DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
echo "Dump created: $(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes")"

# Verify
TABLE_COUNT=$(pg_restore --list "$DUMP_FILE" 2>/dev/null | grep -c "TABLE DATA" || true)
echo "Verified: ${TABLE_COUNT} data tables"

echo "Uploading to S3..."
aws s3 cp "$DUMP_FILE" "${S3_BUCKET}/${S3_KEY}" \
    --storage-class STANDARD_IA \
    --only-show-errors

rm -f "$DUMP_FILE"

echo ""
echo "=== Snapshot complete ==="
echo "S3 key: ${S3_KEY}"
echo ""
echo "To restore: ./restore.sh ${S3_KEY}"
