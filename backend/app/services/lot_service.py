"""Lot service — create lots, add rolls, calculate pallas/pieces.

Lot lifecycle: OPEN → CUTTING → DISTRIBUTED → CLOSED
"""

from math import floor
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lot import Lot, LotRoll
from app.models.roll import Roll
from app.schemas.lot import LotCreate, LotUpdate, LotResponse
from app.schemas import PaginatedParams


class LotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_lots(self, params: PaginatedParams) -> dict:
        """List lots with pagination. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_lot(self, lot_id: UUID) -> LotResponse:
        """Get single lot with rolls, palla calculations. Raises NotFoundError."""
        raise NotImplementedError

    async def create_lot(self, req: LotCreate, created_by: UUID) -> dict:
        """Create lot with rolls and auto-calculate pallas/pieces.

        Steps:
        1. Generate next_lot_code via core/code_generator
        2. Compute pieces_per_palla = sum(default_size_pattern.values())
        3. For each roll in req.rolls:
           a. Validate roll exists and has remaining weight
           b. Compute num_pallas = floor(roll.total_weight / palla_weight)
           c. Compute weight_used = num_pallas * palla_weight
           d. Compute waste_weight = roll.total_weight - weight_used
           e. Compute pieces_from_roll = num_pallas * pieces_per_palla
           f. Create LotRoll record
           g. Deduct remaining_weight from Roll
        4. Compute totals: total_pallas, total_pieces, total_weight
        5. Create Lot record (status=open)
        6. Return {lot: LotResponse}
        Raises: NotFoundError (roll/sku), InsufficientStockError.
        """
        raise NotImplementedError

    async def update_lot(self, lot_id: UUID, req: LotUpdate) -> LotResponse:
        """Update lot metadata (design_no, status, notes). Raises NotFoundError."""
        raise NotImplementedError

    async def add_roll_to_lot(self, lot_id: UUID, roll_id: UUID, palla_weight: float) -> dict:
        """Add a roll to an existing open lot. Recalculates totals."""
        raise NotImplementedError

    async def remove_roll_from_lot(self, lot_id: UUID, lot_roll_id: UUID) -> dict:
        """Remove a roll from lot (only if lot is still OPEN). Restores roll weight."""
        raise NotImplementedError
