"""Backup scheduling — handled by system cron on EC2.

Daily backups run at 2:00 AM IST via:
  crontab: 30 20 * * * /home/ubuntu/scripts/backup.sh

Scripts: backend/scripts/backup/
  backup.sh   — daily pg_dump → S3 (30 daily + 12 monthly retention)
  restore.sh  — download from S3 → pg_restore
  snapshot.sh — pre-operation named snapshot → S3

S3 bucket: s3://inventory-os-backups-ap-south-1/
  daily/      — auto-pruned after 30 days
  monthly/    — auto-pruned after 12 months
  snapshots/  — manual cleanup
"""

import logging

logger = logging.getLogger(__name__)


def start_backup_sync() -> None:
    """No-op — backup scheduling is handled by system cron on EC2."""
    logger.info("Backup scheduling handled by cron (30 20 * * * UTC = 2:00 AM IST)")


def stop_backup_sync() -> None:
    """No-op — backup scheduling is handled by system cron on EC2."""
    pass
