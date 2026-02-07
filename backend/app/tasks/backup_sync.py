"""Background task — Supabase backup sync every 24 hours.

Spec (STEP1 §1.13):
  - Every 24 hours (or manual trigger)
  - Create encrypted PostgreSQL dump
  - Upload to Supabase Storage
  - Retain last 7 backups

NOTE: Actual pg_dump + encryption is Phase 6D (infra scripts).
      This task orchestrates the scheduling; logic is a stub for now.
"""

import asyncio
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 24 * 60 * 60  # 24 hours

_task: asyncio.Task | None = None


async def _run_backup_loop() -> None:
    """Loop that triggers backup on a fixed interval."""
    settings = get_settings()

    while True:
        try:
            if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
                logger.debug("Supabase not configured — skipping backup")
            else:
                # TODO (Phase 6D): Implement actual backup logic
                #   1. pg_dump → encrypted file
                #   2. Upload to Supabase Storage (bucket: settings.BACKUP_BUCKET)
                #   3. Prune backups older than 7 days
                logger.info(
                    "Backup sync triggered (bucket: %s) — not yet implemented",
                    settings.BACKUP_BUCKET,
                )
        except asyncio.CancelledError:
            logger.info("Backup sync task cancelled")
            break
        except Exception:
            logger.exception("Error in backup sync task")

        try:
            await asyncio.sleep(INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("Backup sync task cancelled during sleep")
            break


def start_backup_sync() -> None:
    """Spawn the backup sync background task."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.get_event_loop().create_task(_run_backup_loop())
        logger.info("Backup sync task started (every %ds)", INTERVAL_SECONDS)


def stop_backup_sync() -> None:
    """Cancel the backup sync background task."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        _task = None
        logger.info("Backup sync task stopped")
