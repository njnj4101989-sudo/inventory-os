"""Background task — purge expired entries from token_blacklist every 6 hours.

Expired tokens can't be reused anyway (JWT exp check fails first),
so the blacklist entry is just dead weight after expiry.
"""

import asyncio
import logging

from sqlalchemy import delete, text
from datetime import datetime, timezone

from app.database import async_session_factory

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 6 * 60 * 60  # 6 hours

_task: asyncio.Task | None = None


async def _run_cleanup_loop() -> None:
    while True:
        try:
            async with async_session_factory() as session:
                # Ensure we query public schema
                await session.execute(text("SET search_path TO public"))
                from app.models.token_blacklist import TokenBlacklist
                result = await session.execute(
                    delete(TokenBlacklist).where(
                        TokenBlacklist.expires_at < datetime.now(timezone.utc)
                    )
                )
                count = result.rowcount
                if count:
                    await session.commit()
                    logger.info("Purged %d expired blacklist entries", count)
        except asyncio.CancelledError:
            logger.info("Token cleanup task cancelled")
            break
        except Exception:
            logger.exception("Error in token cleanup task")

        try:
            await asyncio.sleep(INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("Token cleanup task cancelled during sleep")
            break


def start_token_cleanup() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.get_running_loop().create_task(_run_cleanup_loop())
        logger.info("Token blacklist cleanup task started (every %ds)", INTERVAL_SECONDS)


def stop_token_cleanup() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        _task = None
        logger.info("Token blacklist cleanup task stopped")
