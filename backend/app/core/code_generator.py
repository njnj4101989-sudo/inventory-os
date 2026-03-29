"""Sequential code generators for rolls, batches, orders, invoices, reservations.

Each function queries the current MAX code from the database, extracts the
numeric suffix, increments it, and returns the next padded code.

Uses ORDER BY DESC LIMIT 1 FOR UPDATE to lock the latest row
and prevent concurrent code collisions.

All sequential generators (LOT/BATCH/ORD/INV/RES) filter by fy_id so that
codes reset to -0001 at the start of each financial year.
"""

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.lot import Lot
from app.models.batch import Batch
from app.models.order import Order
from app.models.invoice import Invoice
from app.models.reservation import Reservation
from app.models.shipment import Shipment


def _extract_number(code: str | None, prefix: str) -> int:
    """Extract the numeric part from a code like 'LOT-0042' → 42."""
    if code is None:
        return 0
    match = re.search(rf"{re.escape(prefix)}(\d+)", code)
    return int(match.group(1)) if match else 0


async def _max_code(
    db: AsyncSession,
    col,
    pattern: str | None = None,
    extra_where=None,
) -> str | None:
    """Get current max code with row-level locking (FOR UPDATE).

    Args:
        db: Async database session.
        col: The column to query (e.g. Lot.lot_code).
        pattern: Optional LIKE pattern for prefix filtering.
        extra_where: Optional SQLAlchemy where clause (e.g. Model.fy_id == uuid).
    """
    stmt = select(col).order_by(col.desc()).limit(1).with_for_update()
    if pattern:
        stmt = select(col).where(col.like(pattern)).order_by(col.desc()).limit(1).with_for_update()
    if extra_where is not None:
        stmt = stmt.where(extra_where)

    result = await db.execute(stmt)
    return result.scalar()


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
    fabric_code: str | None = None,
    color_code: str | None = None,
    color_no: int | None = None,
) -> str:
    """Generate roll code: {SrNo}-{Fabric}-{Color/ColorNo}-{Seq}.

    Roll codes are scoped by prefix (SrNo+Fabric+Color), NOT by fy_id.
    Each unique prefix gets its own sequence.

    Example: 1-COT-PINK/04-01, STOCK-SHK-RED/02-03
    """
    challan = (challan_no or "").strip() or "NOINV"
    fabric_short = fabric_code.strip().upper() if fabric_code else _shorten_fabric(fabric_type or "")
    color_short = color_code.strip().upper() if color_code else _shorten_color(color or "")
    if color_no:
        color_short = f"{color_short}/{color_no:02d}"
    prefix = f"{challan}-{fabric_short}-{color_short}-"

    max_code = await _max_code(db, Roll.roll_code, f"{prefix}%")
    if max_code:
        last_part = max_code.rsplit("-", 1)[-1]
        seq = int(last_part) if last_part.isdigit() else 0
    else:
        seq = 0
    return f"{prefix}{seq + 1:02d}"


async def next_lot_code(db: AsyncSession, fy_id: UUID, product_type: str = "FBL") -> str:
    """Generate next LT-{PT}-XXXX code, scoped to product_type + financial year.

    Each product_type gets its own counter: LT-FBL-0001, LT-SBL-0001, etc.
    """
    pt = (product_type or "FBL").upper()
    prefix = f"LT-{pt}-"
    current = _extract_number(
        await _max_code(db, Lot.lot_code, f"{prefix}%", extra_where=Lot.fy_id == fy_id),
        prefix,
    )
    return f"{prefix}{current + 1:04d}"


async def next_batch_code(db: AsyncSession, fy_id: UUID) -> str:
    """Generate next BATCH-XXXX code, scoped to financial year."""
    current = _extract_number(
        await _max_code(db, Batch.batch_code, extra_where=Batch.fy_id == fy_id),
        "BATCH-",
    )
    return f"BATCH-{current + 1:04d}"


async def max_batch_number_for_fy(db: AsyncSession, fy_id: UUID) -> int:
    """Get the current max batch number for a given FY (used by distribute_lot bulk creation)."""
    return _extract_number(
        await _max_code(db, Batch.batch_code, extra_where=Batch.fy_id == fy_id),
        "BATCH-",
    )


async def next_order_number(db: AsyncSession, fy_id: UUID) -> str:
    """Generate next ORD-XXXX code, scoped to financial year."""
    current = _extract_number(
        await _max_code(db, Order.order_number, extra_where=Order.fy_id == fy_id),
        "ORD-",
    )
    return f"ORD-{current + 1:04d}"


async def next_invoice_number(db: AsyncSession, fy_id: UUID) -> str:
    """Generate next INV-XXXX code, scoped to financial year."""
    current = _extract_number(
        await _max_code(db, Invoice.invoice_number, extra_where=Invoice.fy_id == fy_id),
        "INV-",
    )
    return f"INV-{current + 1:04d}"


async def next_shipment_number(db: AsyncSession, fy_id: UUID) -> str:
    """Generate next SHP-XXXX code, scoped to financial year."""
    current = _extract_number(
        await _max_code(db, Shipment.shipment_no, extra_where=Shipment.fy_id == fy_id),
        "SHP-",
    )
    return f"SHP-{current + 1:04d}"


async def next_reservation_code(db: AsyncSession) -> str:
    """Generate next RES-XXXX code (not FY-scoped — reservations are transient)."""
    current = _extract_number(await _max_code(db, Reservation.reservation_code), "RES-")
    return f"RES-{current + 1:04d}"


async def next_return_note_number(db: AsyncSession, fy_id: UUID) -> str:
    """Generate next RN-XXXX code, scoped to financial year."""
    from app.models.return_note import ReturnNote
    current = _extract_number(
        await _max_code(db, ReturnNote.return_note_no, extra_where=ReturnNote.fy_id == fy_id),
        "RN-",
    )
    return f"RN-{current + 1:04d}"
