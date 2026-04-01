#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — Daily PostgreSQL Backup
# Runs at 2:00 AM IST via cron (30 20 * * * UTC)
#
# Dumps full database (all schemas) → validates → uploads to S3
# Retention: 30 daily + 12 monthly
# ============================================================

# --- Configuration ---
DB_HOST="${DB_HOST:-drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-drs_inventory}"
DB_USER="${DB_USER:-postgres}"
S3_BUCKET="${S3_BUCKET:-s3://inventory-os-backups-ap-south-1}"
BACKUP_DIR="/tmp/inventory-backups"
LOG_FILE="/var/log/inventory-backup/backup.log"
RETENTION_DAILY=30
RETENTION_MONTHLY=12

# --- Timestamp ---
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H-%M)
MONTH=$(date +%Y-%m)
DAY_OF_MONTH=$(date +%d)
TIMESTAMP="${DATE}_${TIME}"

# --- Logging ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" | tee -a "$LOG_FILE"
}

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

log "=== Backup started ==="
log "Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}"

# --- Step 1: pg_dump ---
DUMP_FILE="${BACKUP_DIR}/${TIMESTAMP}.dump"

log "Running pg_dump..."
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
    --verbose \
    --file="$DUMP_FILE" \
    2>> "$LOG_FILE"

# --- Step 2: Validate dump ---
DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
if [ "$DUMP_SIZE" -lt 1024 ]; then
    log "ERROR: Dump file too small (${DUMP_SIZE} bytes). Backup FAILED."
    rm -f "$DUMP_FILE"
    exit 1
fi
log "Dump created: ${DUMP_FILE} ($(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes"))"

# --- Step 3: Verify integrity ---
TABLE_COUNT=$(pg_restore --list "$DUMP_FILE" 2>/dev/null | grep -c "TABLE DATA" || true)
log "Verification: ${TABLE_COUNT} data tables found in dump"
if [ "$TABLE_COUNT" -lt 5 ]; then
    log "ERROR: Expected >= 5 data tables, found ${TABLE_COUNT}. Backup may be corrupt."
    rm -f "$DUMP_FILE"
    exit 1
fi

# --- Step 4: Upload to S3 ---
S3_DAILY_KEY="daily/${TIMESTAMP}.dump"
log "Uploading daily backup to ${S3_DAILY_KEY}..."
aws s3 cp "$DUMP_FILE" "${S3_BUCKET}/${S3_DAILY_KEY}" \
    --storage-class STANDARD_IA \
    --only-show-errors \
    2>> "$LOG_FILE"
log "Daily backup uploaded: ${S3_DAILY_KEY}"

# Monthly backup (1st of month)
if [ "$DAY_OF_MONTH" = "01" ]; then
    S3_MONTHLY_KEY="monthly/${MONTH}.dump"
    log "Uploading monthly backup to ${S3_MONTHLY_KEY}..."
    aws s3 cp "$DUMP_FILE" "${S3_BUCKET}/${S3_MONTHLY_KEY}" \
        --storage-class STANDARD_IA \
        --only-show-errors \
        2>> "$LOG_FILE"
    log "Monthly backup uploaded: ${S3_MONTHLY_KEY}"
fi

# --- Step 5: Retention cleanup ---
log "Pruning expired backups..."

# Delete daily backups older than RETENTION_DAILY days
CUTOFF_DAILY=$(date -d "-${RETENTION_DAILY} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAILY}d +%Y-%m-%d)
aws s3 ls "${S3_BUCKET}/daily/" 2>/dev/null | while read -r line; do
    FILE_NAME=$(echo "$line" | awk '{print $NF}')
    FILE_DATE=$(echo "$FILE_NAME" | grep -oP '^\d{4}-\d{2}-\d{2}' || true)
    if [ -n "$FILE_DATE" ] && [[ "$FILE_DATE" < "$CUTOFF_DAILY" ]]; then
        aws s3 rm "${S3_BUCKET}/daily/${FILE_NAME}" --only-show-errors 2>> "$LOG_FILE"
        log "  Deleted expired daily: ${FILE_NAME}"
    fi
done

# Delete monthly backups older than RETENTION_MONTHLY months
CUTOFF_MONTHLY=$(date -d "-${RETENTION_MONTHLY} months" +%Y-%m 2>/dev/null || date -v-${RETENTION_MONTHLY}m +%Y-%m)
aws s3 ls "${S3_BUCKET}/monthly/" 2>/dev/null | while read -r line; do
    FILE_NAME=$(echo "$line" | awk '{print $NF}')
    FILE_MONTH=$(echo "$FILE_NAME" | grep -oP '^\d{4}-\d{2}' || true)
    if [ -n "$FILE_MONTH" ] && [[ "$FILE_MONTH" < "$CUTOFF_MONTHLY" ]]; then
        aws s3 rm "${S3_BUCKET}/monthly/${FILE_NAME}" --only-show-errors 2>> "$LOG_FILE"
        log "  Deleted expired monthly: ${FILE_NAME}"
    fi
done

# --- Step 6: Cleanup local temp ---
rm -f "$DUMP_FILE"
log "=== Backup completed successfully ($(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes")) ==="
