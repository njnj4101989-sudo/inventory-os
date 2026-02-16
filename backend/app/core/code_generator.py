"""Sequential code generators for rolls, batches, orders, invoices, reservations.

Each function queries the current MAX code from the database, extracts the
numeric suffix, increments it, and returns the next padded code.

SQLite-safe: no SELECT FOR UPDATE (uniqueness enforced by DB unique constraint).
"""

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.lot import Lot
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


def _shorten_fabric(text: str) -> str:
    """Shorten fabric name to 3-char uppercase, e.g. 'Cotton' → 'COT'."""
    if not text:
        return "UNK"
    clean = re.sub(r"[^a-zA-Z0-9]", "", text).upper()
    abbrevs = {
        "COTTON": "COT", "SILK": "SLK", "GEORGETTE": "GGT", "SHAKIRA": "SHK",
        "CHIFFON": "CHF", "RAYON": "RYN", "POLYESTER": "PLY", "LINEN": "LNN",
        "CREPE": "CRP", "SATIN": "STN", "VELVET": "VLT", "ORGANZA": "OGZ",
    }
    if clean in abbrevs:
        return abbrevs[clean]
    consonants = re.sub(r"[AEIOU]", "", clean)
    return (consonants[:3] if len(consonants) >= 3 else clean[:3]).upper()


def _shorten_color(text: str) -> str:
    """Shorten color name to up to 5-char uppercase, e.g. 'Green' → 'GREEN', 'Mehandi' → 'MHNDI'."""
    if not text:
        return "UNK"
    clean = re.sub(r"[^a-zA-Z0-9]", "", text).upper()
    abbrevs = {
        "GREEN": "GREEN", "RED": "RED", "BLUE": "BLUE", "BLACK": "BLACK", "WHITE": "WHITE",
        "YELLOW": "YELLW", "PINK": "PINK", "ORANGE": "ORNGE", "PURPLE": "PURPL", "BROWN": "BROWN",
        "GREY": "GREY", "GRAY": "GRAY", "MEHANDI": "MHNDI", "MAROON": "MROON", "BEIGE": "BEIGE",
        "MAGENTA": "MGNTA", "PEACH": "PEACH", "CREAM": "CREAM", "NAVY": "NAVY", "TEAL": "TEAL",
        "CORAL": "CORAL", "RUST": "RUST", "IVORY": "IVORY", "OLIVE": "OLIVE", "WINE": "WINE",
    }
    if clean in abbrevs:
        return abbrevs[clean]
    return clean[:5].upper()


async def next_roll_code(
    db: AsyncSession,
    challan_no: str | None = None,
    fabric_type: str | None = None,
    color: str | None = None,
) -> str:
    """Generate roll code: {Challan}-{Fabric}-{Color}-{Seq}.

    Example: 390-COT-GRN-01, NOINV-SHK-RED-03
    """
    challan = (challan_no or "").strip() or "NOINV"
    fabric_short = _shorten_fabric(fabric_type or "")
    color_short = _shorten_color(color or "")
    prefix = f"{challan}-{fabric_short}-{color_short}-"

    # Find max sequence for this prefix
    result = await db.execute(
        select(func.max(Roll.roll_code)).where(Roll.roll_code.like(f"{prefix}%"))
    )
    max_code = result.scalar()
    if max_code:
        # Extract last segment as number
        last_part = max_code.rsplit("-", 1)[-1]
        seq = int(last_part) if last_part.isdigit() else 0
    else:
        seq = 0
    return f"{prefix}{seq + 1:02d}"


async def next_lot_code(db: AsyncSession) -> str:
    """Generate next LOT-XXXX code."""
    result = await db.execute(select(func.max(Lot.lot_code)))
    current = _extract_number(result.scalar(), "LOT-")
    return f"LOT-{current + 1:04d}"


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
