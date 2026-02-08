"""Reservation service — reserve, confirm, release, expiry management."""

from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation import Reservation
from app.models.inventory_state import InventoryState


class ReservationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_reservation(
        self,
        sku_id: UUID,
        quantity: int,
        order_id: UUID | None = None,
        external_order_ref: str | None = None,
        expires_at: datetime | None = None,
    ) -> Reservation:
        """Reserve stock for an order.

        Steps:
        1. Generate next_reservation_code via core/code_generator
        2. Check available_qty in inventory_state >= quantity
        3. Create Reservation record (status=ACTIVE)
        4. Update inventory_state.reserved_qty
        5. Return Reservation
        Raises: InsufficientStockError, NotFoundError (sku).
        """
        raise NotImplementedError

    async def get_active_reservations(self, sku_id: UUID) -> list[Reservation]:
        """Get all active (non-expired, non-released) reservations for a SKU."""
        raise NotImplementedError

    async def confirm_reservation(self, reservation_id: UUID) -> Reservation:
        """Confirm reservation (ACTIVE → CONFIRMED). Called on order shipment.

        Raises: NotFoundError, ReservationExpiredError, InvalidStateTransitionError.
        """
        raise NotImplementedError

    async def release_reservation(self, reservation_id: UUID) -> Reservation:
        """Release reservation (ACTIVE → RELEASED). Called on order cancellation.

        Updates inventory_state.reserved_qty (decrement).
        Raises: NotFoundError, InvalidStateTransitionError.
        """
        raise NotImplementedError

    async def expire_stale_reservations(self) -> int:
        """Expire all reservations past expires_at. Returns count expired.

        Called by background task (6A-11). Updates status → EXPIRED,
        decrements reserved_qty in inventory_state.
        """
        now = datetime.now(timezone.utc)

        # Find active reservations that have passed their expiry time
        stmt = select(Reservation).where(
            Reservation.status == "active",
            Reservation.expires_at.isnot(None),
            Reservation.expires_at < now,
        )
        result = await self.db.execute(stmt)
        stale = result.scalars().all()

        if not stale:
            return 0

        for res in stale:
            res.status = "expired"
            res.released_at = now

            # Decrement reserved_qty on inventory_state
            inv_stmt = select(InventoryState).where(
                InventoryState.sku_id == res.sku_id
            )
            inv_result = await self.db.execute(inv_stmt)
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.reserved_qty = max(0, inv.reserved_qty - res.quantity)
                inv.available_qty = inv.total_qty - inv.reserved_qty
                inv.last_updated = now

        return len(stale)
