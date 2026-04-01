#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# inventory-os — One-Time Backup Infrastructure Setup
#
# Run this ONCE on EC2 after first deployment:
#   cd /home/ubuntu/inventory-os/backend/scripts/backup
#   bash setup-backup.sh
#
# What it does:
#   1. Creates S3 bucket (versioned, encrypted, private)
#   2. Creates .pgpass for passwordless pg_dump
#   3. Deploys scripts to /home/ubuntu/scripts/
#   4. Creates log directory + logrotate config
#   5. Installs daily cron job (2:00 AM IST)
# ============================================================

S3_BUCKET="inventory-os-backups-ap-south-1"
S3_REGION="ap-south-1"
SCRIPTS_DIR="/home/ubuntu/scripts"
LOG_DIR="/var/log/inventory-backup"
SCRIPT_SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== inventory-os Backup Setup ==="
echo ""

# --- Step 1: S3 Bucket ---
echo "[1/6] Setting up S3 bucket: ${S3_BUCKET}..."

aws s3 mb "s3://${S3_BUCKET}" --region "$S3_REGION" 2>/dev/null \
    && echo "  Bucket created" \
    || echo "  Bucket already exists"

# Enable versioning (safety net for accidental overwrites)
aws s3api put-bucket-versioning \
    --bucket "$S3_BUCKET" \
    --versioning-configuration Status=Enabled
echo "  Versioning enabled"

# Block all public access
aws s3api put-public-access-block \
    --bucket "$S3_BUCKET" \
    --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  Public access blocked"

# Server-side encryption (AES-256)
aws s3api put-bucket-encryption \
    --bucket "$S3_BUCKET" \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            },
            "BucketKeyEnabled": true
        }]
    }'
echo "  AES-256 encryption enabled"

# Lifecycle: delete old object versions after 7 days
aws s3api put-bucket-lifecycle-configuration \
    --bucket "$S3_BUCKET" \
    --lifecycle-configuration '{
        "Rules": [
            {
                "ID": "CleanupOldVersions",
                "Status": "Enabled",
                "Filter": {"Prefix": ""},
                "NoncurrentVersionExpiration": {"NoncurrentDays": 7}
            }
        ]
    }'
echo "  Lifecycle policy set (old versions expire in 7 days)"

# --- Step 2: .pgpass ---
echo ""
echo "[2/6] Setting up .pgpass for passwordless pg_dump..."
PGPASS_FILE="/home/ubuntu/.pgpass"

if [ -f "$PGPASS_FILE" ]; then
    echo "  .pgpass already exists. Overwrite? (y/N)"
    read -r OVERWRITE
    if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
        echo "  Skipped .pgpass"
    else
        read -sp "  Enter RDS PostgreSQL password: " DB_PASS
        echo ""
        echo "drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com:5432:drs_inventory:postgres:${DB_PASS}" > "$PGPASS_FILE"
        chmod 600 "$PGPASS_FILE"
        echo "  .pgpass updated (mode 600)"
    fi
else
    read -sp "  Enter RDS PostgreSQL password: " DB_PASS
    echo ""
    echo "drs-inventory-db.crmiy8k00t4k.ap-south-1.rds.amazonaws.com:5432:drs_inventory:postgres:${DB_PASS}" > "$PGPASS_FILE"
    chmod 600 "$PGPASS_FILE"
    echo "  .pgpass created (mode 600)"
fi

# --- Step 3: Check pg_dump version ---
echo ""
echo "[3/6] Checking pg_dump version..."
PG_DUMP_VER=$(pg_dump --version 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")
echo "  pg_dump version: ${PG_DUMP_VER}"
if [ "$PG_DUMP_VER" -lt 16 ]; then
    echo ""
    echo "  WARNING: pg_dump version ${PG_DUMP_VER} is older than RDS PostgreSQL 16."
    echo "  This may cause compatibility issues. Install PostgreSQL 16 client:"
    echo ""
    echo "    sudo sh -c 'echo \"deb http://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" > /etc/apt/sources.list.d/pgdg.list'"
    echo "    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -"
    echo "    sudo apt update"
    echo "    sudo apt install -y postgresql-client-16"
    echo ""
    read -p "  Continue anyway? (y/N) " CONT
    if [ "$CONT" != "y" ] && [ "$CONT" != "Y" ]; then
        echo "  Aborted. Install postgresql-client-16 first."
        exit 1
    fi
fi

# --- Step 4: Deploy scripts ---
echo ""
echo "[4/6] Deploying scripts to ${SCRIPTS_DIR}..."
mkdir -p "$SCRIPTS_DIR"
cp "${SCRIPT_SRC_DIR}/backup.sh" "${SCRIPTS_DIR}/backup.sh"
cp "${SCRIPT_SRC_DIR}/restore.sh" "${SCRIPTS_DIR}/restore.sh"
cp "${SCRIPT_SRC_DIR}/snapshot.sh" "${SCRIPTS_DIR}/snapshot.sh"
chmod +x "${SCRIPTS_DIR}"/*.sh
echo "  Deployed: backup.sh, restore.sh, snapshot.sh"

# --- Step 5: Log directory + logrotate ---
echo ""
echo "[5/6] Setting up logging..."
sudo mkdir -p "$LOG_DIR"
sudo chown ubuntu:ubuntu "$LOG_DIR"
echo "  Log directory: ${LOG_DIR}"

sudo tee /etc/logrotate.d/inventory-backup > /dev/null <<'LOGROTATE'
/var/log/inventory-backup/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 644 ubuntu ubuntu
}
LOGROTATE
echo "  Logrotate configured (weekly, 8 rotations)"

# --- Step 6: Cron job ---
echo ""
echo "[6/6] Installing cron job..."
# 2:00 AM IST = 20:30 UTC (IST is UTC+5:30)
CRON_ENTRY="30 20 * * * /home/ubuntu/scripts/backup.sh >> /var/log/inventory-backup/cron.log 2>&1"

# Remove old inventory-backup entries, add new one
(crontab -l 2>/dev/null | grep -v "inventory-backup\|backup.sh"; echo "$CRON_ENTRY") | crontab -
echo "  Cron installed: 30 20 * * * (20:30 UTC = 2:00 AM IST)"
echo "  Verify: crontab -l"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Quick commands:"
echo "  Test backup:    /home/ubuntu/scripts/backup.sh"
echo "  Take snapshot:  /home/ubuntu/scripts/snapshot.sh pre-test"
echo "  List backups:   /home/ubuntu/scripts/restore.sh"
echo "  View logs:      tail -f /var/log/inventory-backup/backup.log"
echo "  Check cron:     crontab -l"
echo "  Check S3:       aws s3 ls s3://${S3_BUCKET}/"
