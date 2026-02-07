"""Sequential code generators for rolls, batches, orders, invoices, reservations.

Each function queries the current MAX code from the database, extracts the
numeric suffix, increments it, and returns the next padded code.

SQLite-safe: no SELECT FOR UPDATE (uniqueness enforced by DB unique constraint).
"""

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.batch import Batch
from app.models.order import Order
from app.models.invoice import Invoice
from app.models.reservation import Reservation


def _extract_number(code: str | None, prefix: str) -> int:
    """Extract the numeric part from a code like 'ROLL-0042' → 42."""
    if code is None:
        return 0
    match = re.search(rf"{re.escape(prefix)}(\d+)", code)
    return int(match.group(1)) if match else 0


async def next_roll_code(db: AsyncSession) -> str:
    """Generate next ROLL-XXXX code."""
    result = await db.execute(select(func.max(Roll.roll_code)))
    current = _extract_number(result.scalar(), "ROLL-")
    return f"ROLL-{current + 1:04d}"


async def next_batch_code(db: AsyncSession) -> str:
    """Generate next BATCH-XXXX code."""
    result = await db.execute(select(func.max(Batch.batch_code)))
    current = _extract_number(result.scalar(), "BATCH-")
    return f"BATCH-{current + 1:04d}"


async def next_order_number(db: AsyncSession) -> str:
    """Generate next ORD-XXXX code."""
    result = await db.execute(select(func.max(Order.order_number)))
    current = _extract_number(result.scalar(), "ORD-")
    return f"ORD-{current + 1:04d}"


async def next_invoice_number(db: AsyncSession) -> str:
    """Generate next INV-XXXX code."""
    result = await db.execute(select(func.max(Invoice.invoice_number)))
    current = _extract_number(result.scalar(), "INV-")
    return f"INV-{current + 1:04d}"


async def next_reservation_code(db: AsyncSession) -> str:
    """Generate next RES-XXXX code."""
    result = await db.execute(select(func.max(Reservation.reservation_code)))
    current = _extract_number(result.scalar(), "RES-")
    return f"RES-{current + 1:04d}"
