"""Inventory service — event processing, state computation, reconciliation.

Core principle: all stock changes flow through inventory events.
State is always recomputable from the event stream.

Formula: total = STOCK_IN − STOCK_OUT − LOSS + RETURN
         reserved = SUM(active reservations)
         available = total − reserved
"""

from uuid import UUID
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_event import InventoryEvent
from app.models.inventory_state import InventoryState
from app.schemas.inventory import AdjustRequest, InventoryResponse, EventResponse, ReconcileResponse
from app.schemas import PaginatedParams


class InventoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_inventory(self, params: PaginatedParams) -> dict:
        """List all SKU stock levels with pagination. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_sku_inventory(self, sku_id: UUID) -> InventoryResponse:
        """Get stock level for a single SKU. Raises NotFoundError."""
        raise NotImplementedError

    async def get_events(self, sku_id: UUID, params: PaginatedParams) -> dict:
        """Get inventory event history for a SKU. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def create_event(
        self,
        event_type: str,
        item_type: str,
        reference_type: str,
        reference_id: UUID,
        sku_id: UUID,
        quantity: int,
        performed_by: UUID,
        metadata: dict | None = None,
    ) -> InventoryEvent:
        """Insert an inventory event and update the inventory_state row.

        Steps:
        1. Generate unique event_id
        2. Insert InventoryEvent record
        3. Upsert InventoryState for the SKU (recalculate total_qty)
        4. Return the created event
        Idempotency: event_id is unique — duplicate insert is rejected.
        """
        raise NotImplementedError

    async def adjust_inventory(self, req: AdjustRequest, user_id: UUID) -> dict:
        """Manual stock adjustment (loss, correction).

        Creates an inventory event of the given type.
        Returns {event: EventResponse, inventory: InventoryResponse}.
        Raises: NotFoundError (sku), ValidationError (bad event_type).
        """
        raise NotImplementedError

    async def reconcile(self) -> ReconcileResponse:
        """Recompute all inventory states from event stream.

        Compares recomputed totals with stored states, fixes mismatches.
        Returns ReconcileResponse with counts.
        """
        raise NotImplementedError
