#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — Backup Health Check
#
# Checks if today's backup exists in S3. Exit code:
#   0 = healthy (backup exists)
#   1 = unhealthy (no backup today)
#
# Usage:
#   ./check-backup.sh          # check today
#   ./check-backup.sh 2        # allow up to 2 days gap (weekends)
#
# Add to cron for daily alerting (run at 6 AM IST = 00:30 UTC):
#   30 0 * * * /home/ubuntu/scripts/check-backup.sh || echo "BACKUP MISSING" >> /var/log/inventory-backup/alert.log
# ============================================================

S3_BUCKET="${S3_BUCKET:-s3://inventory-os-backups-ap-south-1}"
MAX_AGE_DAYS="${1:-1}"
LOG_FILE="/var/log/inventory-backup/backup.log"

# Check for failure flag (set by backup.sh on error)
if [ -f "/var/log/inventory-backup/BACKUP_FAILED" ]; then
    echo "UNHEALTHY: Last backup failed"
    cat "/var/log/inventory-backup/BACKUP_FAILED"
    exit 1
fi

# Check S3 for recent backup
FOUND=0
for i in $(seq 0 "$MAX_AGE_DAYS"); do
    CHECK_DATE=$(date -d "-${i} days" +%Y-%m-%d 2>/dev/null || date -v-${i}d +%Y-%m-%d)
    COUNT=$(aws s3 ls "${S3_BUCKET}/daily/${CHECK_DATE}" 2>/dev/null | wc -l)
    if [ "$COUNT" -gt 0 ]; then
        FOUND=1
        LATEST=$(aws s3 ls "${S3_BUCKET}/daily/${CHECK_DATE}" 2>/dev/null | tail -1)
        echo "HEALTHY: Found backup for ${CHECK_DATE}"
        echo "  ${LATEST}"
        break
    fi
done

if [ "$FOUND" -eq 0 ]; then
    echo "UNHEALTHY: No backup found in the last ${MAX_AGE_DAYS} day(s)"
    echo "  Bucket: ${S3_BUCKET}/daily/"
    echo "  Last log entry:"
    tail -3 "$LOG_FILE" 2>/dev/null || echo "  (no log)"
    exit 1
fi
