"""Reservation service — reserve, confirm, release, expiry management."""

from uuid import UUID
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reservation import Reservation
from app.models.inventory_state import InventoryState
from app.core.code_generator import next_reservation_code
from app.core.exceptions import (
    NotFoundError,
    InsufficientStockError,
    InvalidStateTransitionError,
    ReservationExpiredError,
)


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
        permanent: bool = False,
    ) -> Reservation:
        reservation_code = await next_reservation_code(self.db)

        # Check available stock
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()

        if not state:
            raise NotFoundError(f"Inventory state for SKU {sku_id} not found")
        if state.available_qty < quantity:
            raise InsufficientStockError(
                f"Insufficient stock: available={state.available_qty}, requested={quantity}"
            )

        if expires_at is None and not permanent:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        reservation = Reservation(
            reservation_code=reservation_code,
            sku_id=sku_id,
            quantity=quantity,
            status="active",
            order_id=order_id,
            external_order_ref=external_order_ref,
            expires_at=expires_at,
        )
        self.db.add(reservation)

        # Update reserved qty
        state.reserved_qty += quantity
        state.available_qty = max(0, state.total_qty - state.reserved_qty)
        state.last_updated = datetime.now(timezone.utc)

        await self.db.flush()
        return reservation

    async def get_active_reservations(self, sku_id: UUID) -> list[Reservation]:
        stmt = select(Reservation).where(
            Reservation.sku_id == sku_id,
            Reservation.status == "active",
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def confirm_reservation(self, reservation_id: UUID) -> Reservation:
        reservation = await self._get_or_404(reservation_id)

        if reservation.status == "expired":
            raise ReservationExpiredError("Reservation has expired")
        if reservation.status != "active":
            raise InvalidStateTransitionError(
                f"Cannot confirm reservation in '{reservation.status}' status"
            )

        reservation.status = "confirmed"
        reservation.confirmed_at = datetime.now(timezone.utc)

        # Decrement reserved_qty (confirmed stock is now committed)
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == reservation.sku_id)
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()
        if state:
            state.reserved_qty = max(0, state.reserved_qty - reservation.quantity)
            state.available_qty = max(0, state.total_qty - state.reserved_qty)
            state.last_updated = datetime.now(timezone.utc)

        await self.db.flush()
        return reservation

    async def release_reservation(self, reservation_id: UUID) -> Reservation:
        reservation = await self._get_or_404(reservation_id)

        if reservation.status != "active":
            raise InvalidStateTransitionError(
                f"Cannot release reservation in '{reservation.status}' status"
            )

        reservation.status = "released"
        reservation.released_at = datetime.now(timezone.utc)

        # Restore reserved_qty
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == reservation.sku_id)
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()
        if state:
            state.reserved_qty = max(0, state.reserved_qty - reservation.quantity)
            state.available_qty = max(0, state.total_qty - state.reserved_qty)
            state.last_updated = datetime.now(timezone.utc)

        await self.db.flush()
        return reservation

    async def create_external_reservation(self, req) -> dict:
        """Create reservations from external API request (multiple items)."""
        from app.models.sku import SKU
        reservation_code = await next_reservation_code(self.db)
        items_response = []

        for item in req.items:
            sku_stmt = select(SKU).where(SKU.sku_code == item.sku_code)
            sku_result = await self.db.execute(sku_stmt)
            sku = sku_result.scalar_one_or_none()
            if not sku:
                raise NotFoundError(f"SKU '{item.sku_code}' not found")

            reservation = await self.create_reservation(
                sku_id=sku.id,
                quantity=item.quantity,
                external_order_ref=req.external_order_ref,
            )
            items_response.append({
                "sku_code": item.sku_code,
                "quantity": item.quantity,
                "available": True,
            })
            reservation_code = reservation.reservation_code

        return {
            "reservation_code": reservation_code,
            "status": "active",
            "expires_at": reservation.expires_at.isoformat() if reservation.expires_at else None,
            "items": items_response,
        }

    async def confirm_external_reservation(self, reservation_code: str) -> dict:
        """Confirm reservation by code (for external API)."""
        stmt = select(Reservation).where(Reservation.reservation_code == reservation_code)
        result = await self.db.execute(stmt)
        reservation = result.scalar_one_or_none()
        if not reservation:
            raise NotFoundError(f"Reservation '{reservation_code}' not found")

        confirmed = await self.confirm_reservation(reservation.id)
        return {
            "reservation_code": confirmed.reservation_code,
            "status": confirmed.status,
        }

    async def release_external_reservation(self, reservation_code: str) -> dict:
        """Release reservation by code (for external API)."""
        stmt = select(Reservation).where(Reservation.reservation_code == reservation_code)
        result = await self.db.execute(stmt)
        reservation = result.scalar_one_or_none()
        if not reservation:
            raise NotFoundError(f"Reservation '{reservation_code}' not found")

        released = await self.release_reservation(reservation.id)
        return {
            "reservation_code": released.reservation_code,
            "status": released.status,
        }

    async def expire_stale_reservations(self) -> int:
        now = datetime.now(timezone.utc)

        stmt = select(Reservation).where(
            Reservation.status == "active",
            Reservation.expires_at.isnot(None),
            Reservation.expires_at < now,
        )
        result = await self.db.execute(stmt)
        stale = result.scalars().all()

        if not stale:
            return 0

        # Batch-fetch all inventory states at once instead of per-reservation
        sku_ids = list({res.sku_id for res in stale})
        inv_result = await self.db.execute(
            select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
        )
        inv_map = {s.sku_id: s for s in inv_result.scalars().all()}

        for res in stale:
            res.status = "expired"
            res.released_at = now

            inv = inv_map.get(res.sku_id)
            if inv:
                inv.reserved_qty = max(0, inv.reserved_qty - res.quantity)
                inv.available_qty = inv.total_qty - inv.reserved_qty
                inv.last_updated = now

        return len(stale)

    async def _get_or_404(self, reservation_id: UUID) -> Reservation:
        stmt = select(Reservation).where(Reservation.id == reservation_id)
        result = await self.db.execute(stmt)
        reservation = result.scalar_one_or_none()
        if not reservation:
            raise NotFoundError(f"Reservation {reservation_id} not found")
        return reservation
