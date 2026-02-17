"""Inventory service — event processing, state computation, reconciliation.

Core principle: all stock changes flow through inventory events.
State is always recomputable from the event stream.

Formula: total = STOCK_IN − STOCK_OUT − LOSS + RETURN
         reserved = SUM(active reservations)
         available = total − reserved
"""

import math
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory_event import InventoryEvent
from app.models.inventory_state import InventoryState
from app.models.sku import SKU
from app.schemas.inventory import AdjustRequest, InventoryFilterParams, InventoryResponse, EventResponse, ReconcileResponse
from app.schemas import PaginatedParams
from app.core.exceptions import NotFoundError, ValidationError


class InventoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_inventory(self, params: InventoryFilterParams) -> dict:
        conditions = []

        if params.sku_code:
            search = f"%{params.sku_code}%"
            conditions.append(
                SKU.sku_code.ilike(search) | SKU.product_name.ilike(search)
            )

        if params.product_type:
            conditions.append(SKU.product_type == params.product_type)

        if params.stock_status == "healthy":
            # available > 60% of total (and total > 0)
            conditions.append(InventoryState.total_qty > 0)
            conditions.append(
                InventoryState.available_qty * 100 >= InventoryState.total_qty * 60
            )
        elif params.stock_status == "low":
            conditions.append(InventoryState.total_qty > 0)
            conditions.append(InventoryState.available_qty > 0)
            conditions.append(
                InventoryState.available_qty * 100 < InventoryState.total_qty * 60
            )
        elif params.stock_status == "critical":
            conditions.append(
                (InventoryState.available_qty <= 0) | (InventoryState.total_qty == 0)
            )

        # Build base query joining SKU for filtering
        base = select(InventoryState).join(SKU, InventoryState.sku_id == SKU.id)
        if conditions:
            base = base.where(*conditions)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            base
            .options(selectinload(InventoryState.sku))
            .order_by(InventoryState.last_updated.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        states = result.scalars().all()

        return {
            "data": [self._state_to_response(s) for s in states],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_sku_inventory(self, sku_id: UUID) -> dict:
        stmt = (
            select(InventoryState)
            .where(InventoryState.sku_id == sku_id)
            .options(selectinload(InventoryState.sku))
        )
        result = await self.db.execute(stmt)
        state = result.scalar_one_or_none()
        if not state:
            raise NotFoundError(f"Inventory state for SKU {sku_id} not found")
        return self._state_to_response(state)

    async def get_events(self, sku_id: UUID, params: PaginatedParams) -> dict:
        count_stmt = (
            select(func.count())
            .select_from(InventoryEvent)
            .where(InventoryEvent.sku_id == sku_id)
        )
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            select(InventoryEvent)
            .where(InventoryEvent.sku_id == sku_id)
            .order_by(InventoryEvent.performed_at.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        events = result.scalars().all()

        return {
            "data": [self._event_to_response(e) for e in events],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

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
        event = InventoryEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            item_type=item_type,
            reference_type=reference_type,
            reference_id=reference_id,
            sku_id=sku_id,
            quantity=quantity,
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc),
            metadata=metadata or {},
        )
        self.db.add(event)
        await self.db.flush()

        # Upsert inventory state
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()

        if not state:
            state = InventoryState(
                sku_id=sku_id,
                total_qty=0,
                available_qty=0,
                reserved_qty=0,
            )
            self.db.add(state)
            await self.db.flush()

        # Update based on event type
        if event_type in ("stock_in", "return"):
            state.total_qty += quantity
        elif event_type in ("stock_out", "loss"):
            state.total_qty = max(0, state.total_qty - quantity)

        state.available_qty = max(0, state.total_qty - state.reserved_qty)
        state.last_updated = datetime.now(timezone.utc)
        await self.db.flush()

        return event

    async def adjust_inventory(self, req: AdjustRequest, user_id: UUID) -> dict:
        valid_types = ("stock_in", "stock_out", "loss", "return", "adjustment")
        if req.event_type not in valid_types:
            raise ValidationError(f"Invalid event_type '{req.event_type}'. Must be one of: {valid_types}")

        # Verify SKU exists
        sku_stmt = select(SKU).where(SKU.id == req.sku_id)
        sku_result = await self.db.execute(sku_stmt)
        if not sku_result.scalar_one_or_none():
            raise NotFoundError(f"SKU {req.sku_id} not found")

        event = await self.create_event(
            event_type=req.event_type,
            item_type=req.item_type or "finished_goods",
            reference_type="manual_adjustment",
            reference_id=uuid.uuid4(),
            sku_id=req.sku_id,
            quantity=req.quantity,
            performed_by=user_id,
            metadata={"reason": req.reason} if req.reason else None,
        )

        inv = await self.get_sku_inventory(req.sku_id)
        return {
            "event": self._event_to_response(event),
            "inventory": inv,
        }

    async def reconcile(self) -> dict:
        # Get all SKU IDs with inventory states
        stmt = select(InventoryState)
        result = await self.db.execute(stmt)
        states = result.scalars().all()

        skus_checked = len(states)
        mismatches_found = 0
        mismatches_fixed = 0

        for state in states:
            # Recompute from events
            evt_stmt = select(
                InventoryEvent.event_type,
                func.sum(InventoryEvent.quantity).label("total"),
            ).where(
                InventoryEvent.sku_id == state.sku_id
            ).group_by(InventoryEvent.event_type)
            evt_result = await self.db.execute(evt_stmt)
            totals = {row.event_type: row.total for row in evt_result}

            computed_total = (
                (totals.get("stock_in", 0) or 0)
                + (totals.get("return", 0) or 0)
                - (totals.get("stock_out", 0) or 0)
                - (totals.get("loss", 0) or 0)
            )
            computed_total = max(0, computed_total)

            if state.total_qty != computed_total:
                mismatches_found += 1
                state.total_qty = computed_total
                state.available_qty = max(0, computed_total - state.reserved_qty)
                state.last_updated = datetime.now(timezone.utc)
                mismatches_fixed += 1

        await self.db.flush()

        return {
            "skus_checked": skus_checked,
            "mismatches_found": mismatches_found,
            "mismatches_fixed": mismatches_fixed,
        }

    async def get_stock_by_code(self, sku_code: str) -> dict:
        """Get stock level for a SKU by its code (for external API)."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU '{sku_code}' not found")

        inv_stmt = (
            select(InventoryState)
            .where(InventoryState.sku_id == sku.id)
            .options(selectinload(InventoryState.sku))
        )
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()

        return {
            "sku_code": sku.sku_code,
            "product_name": sku.product_name,
            "available_qty": state.available_qty if state else 0,
            "total_qty": state.total_qty if state else 0,
            "reserved_qty": state.reserved_qty if state else 0,
        }

    def _state_to_response(self, s: InventoryState) -> dict:
        return {
            "id": str(s.id),
            "sku": {
                "id": str(s.sku.id),
                "sku_code": s.sku.sku_code,
                "product_name": s.sku.product_name,
            } if s.sku else None,
            "sku_id": str(s.sku_id),
            "total_qty": s.total_qty,
            "available_qty": s.available_qty,
            "reserved_qty": s.reserved_qty,
            "last_updated": s.last_updated.isoformat() if s.last_updated else None,
        }

    def _event_to_response(self, e: InventoryEvent) -> dict:
        return {
            "id": str(e.id),
            "event_id": e.event_id,
            "event_type": e.event_type,
            "item_type": e.item_type,
            "reference_type": e.reference_type,
            "reference_id": str(e.reference_id) if e.reference_id else None,
            "sku_id": str(e.sku_id) if e.sku_id else None,
            "quantity": e.quantity,
            "performed_by": str(e.performed_by) if e.performed_by else None,
            "performed_at": e.performed_at.isoformat() if e.performed_at else None,
            "metadata": e.metadata,
        }
