"""Roll service — stock-in, queries, consumption history."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.inventory_event import InventoryEvent
from app.schemas.roll import RollCreate, RollResponse, RollDetail
from app.schemas import PaginatedParams


class RollService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_rolls(self, params: PaginatedParams) -> dict:
        """List rolls with pagination. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_roll(self, roll_id: UUID) -> RollDetail:
        """Get single roll with consumption history. Raises NotFoundError."""
        raise NotImplementedError

    async def stock_in(self, req: RollCreate, received_by: UUID) -> dict:
        """Register a new roll (stock-in event).

        Steps:
        1. Generate next_roll_code via core/code_generator
        2. Create Roll record (remaining_length = total_length)
        3. Create STOCK_IN InventoryEvent
        4. Return {roll: RollResponse, event: EventResponse}
        """
        raise NotImplementedError

    async def get_consumption_history(self, roll_id: UUID) -> list:
        """Get all batch consumptions for a roll. Raises NotFoundError."""
        raise NotImplementedError
