"""Background task — auto-expire stale reservations every 15 minutes.

Spec (STEP3 §3.7):
  - Runs every 15 minutes
  - Finds reservations WHERE status='active' AND expires_at < NOW()
  - Triggers RELEASE event with reason='auto_expired'
  - Default expiry: 24h e-commerce, 72h web orders
"""

import asyncio
import logging

from app.database import async_session_factory
from app.services.reservation_service import ReservationService

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 15 * 60  # 15 minutes

_task: asyncio.Task | None = None


async def _run_expiry_loop() -> None:
    """Loop that expires stale reservations on a fixed interval."""
    while True:
        try:
            async with async_session_factory() as session:
                service = ReservationService(session)
                count = await service.expire_stale_reservations()
                if count:
                    await session.commit()
                    logger.info("Expired %d stale reservation(s)", count)
        except asyncio.CancelledError:
            logger.info("Reservation expiry task cancelled")
            break
        except Exception:
            logger.exception("Error in reservation expiry task")

        try:
            await asyncio.sleep(INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("Reservation expiry task cancelled during sleep")
            break


def start_reservation_expiry() -> None:
    """Spawn the reservation expiry background task."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.get_event_loop().create_task(_run_expiry_loop())
        logger.info("Reservation expiry task started (every %ds)", INTERVAL_SECONDS)


def stop_reservation_expiry() -> None:
    """Cancel the reservation expiry background task."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        _task = None
        logger.info("Reservation expiry task stopped")
