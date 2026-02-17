"""Roll service — stock-in, queries, consumption history."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.roll import Roll, RollProcessing
from app.models.inventory_event import InventoryEvent
from app.models.batch_roll_consumption import BatchRollConsumption
from app.schemas.roll import (
    RollCreate, RollUpdate, RollFilterParams, RollResponse, RollDetail,
    SendForProcessing, ReceiveFromProcessing,
)
from app.core.code_generator import next_roll_code
from app.core.exceptions import NotFoundError, BusinessRuleViolationError


class RollService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_rolls(self, params: RollFilterParams) -> dict:
        # Build filter conditions
        conditions = []

        if params.status:
            conditions.append(Roll.status == params.status)

        if params.fabric_type:
            # Used as search text — match against code, fabric, color, invoice
            search = f"%{params.fabric_type}%"
            conditions.append(
                Roll.roll_code.ilike(search)
                | Roll.fabric_type.ilike(search)
                | Roll.color.ilike(search)
                | Roll.supplier_invoice_no.ilike(search)
            )

        if params.fabric_filter:
            conditions.append(Roll.fabric_type == params.fabric_filter)

        if params.has_remaining:
            conditions.append(Roll.remaining_weight > 0)

        if params.fully_consumed:
            conditions.append(Roll.remaining_weight <= 0)

        if params.supplier_id:
            conditions.append(Roll.supplier_id == params.supplier_id)

        # Count with filters applied
        count_stmt = select(func.count()).select_from(Roll)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Roll, params.sort_by, Roll.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Roll)
            .options(
                selectinload(Roll.supplier),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs),
            )
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        if conditions:
            stmt = stmt.where(*conditions)

        result = await self.db.execute(stmt)
        rolls = result.scalars().all()

        return {
            "data": [self._to_response(r) for r in rolls],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_roll(self, roll_id: UUID) -> dict:
        stmt = (
            select(Roll)
            .where(Roll.id == roll_id)
            .options(
                selectinload(Roll.supplier),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs),
            )
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        consumption = await self.get_consumption_history(roll_id)

        resp = self._to_response(roll)
        resp["consumption_history"] = consumption
        return resp

    async def stock_in(self, req: RollCreate, received_by: UUID) -> dict:
        roll_code = await next_roll_code(
            self.db,
            challan_no=req.supplier_invoice_no or "STOCK",
            fabric_type=req.fabric_type,
            color=req.color,
            fabric_code=req.fabric_code,
            color_code=req.color_code,
        )

        roll = Roll(
            roll_code=roll_code,
            fabric_type=req.fabric_type,
            color=req.color,
            total_weight=req.total_weight,
            remaining_weight=req.total_weight,
            unit=req.unit or "kg",
            cost_per_unit=req.cost_per_unit,
            total_length=req.total_length,
            supplier_id=req.supplier_id,
            supplier_invoice_no=req.supplier_invoice_no,
            supplier_invoice_date=req.supplier_invoice_date,
            received_by=received_by,
            received_at=datetime.now(timezone.utc),
            status="in_stock",
            notes=req.notes,
        )
        self.db.add(roll)
        await self.db.flush()

        # Reload with relationships
        stmt = select(Roll).where(Roll.id == roll.id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs),
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one()

        return self._to_response(roll)

    async def update_roll(self, roll_id: UUID, req: RollUpdate) -> dict:
        stmt = (
            select(Roll)
            .where(Roll.id == roll_id)
            .options(selectinload(Roll.supplier))
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        # Guard: only unused rolls can be edited
        if roll.remaining_weight < roll.total_weight:
            raise BusinessRuleViolationError(
                "Cannot edit a roll that has been partially or fully consumed"
            )

        updates = req.model_dump(exclude_unset=True)
        weight_changed = False

        for field, value in updates.items():
            setattr(roll, field, value)
            if field == "total_weight":
                weight_changed = True

        # Keep remaining_weight in sync when total_weight changes on unused roll
        if weight_changed and req.total_weight is not None:
            roll.remaining_weight = req.total_weight

        await self.db.flush()

        # Reload with relationships (supplier may have changed)
        stmt = select(Roll).where(Roll.id == roll.id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs),
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one()

        return self._to_response(roll)

    async def get_consumption_history(self, roll_id: UUID) -> list:
        stmt = (
            select(BatchRollConsumption)
            .where(BatchRollConsumption.roll_id == roll_id)
            .order_by(BatchRollConsumption.created_at.desc())
        )
        result = await self.db.execute(stmt)
        records = result.scalars().all()

        return [
            {
                "id": str(c.id),
                "batch_id": str(c.batch_id),
                "pieces_cut": c.pieces_cut,
                "length_used": float(c.length_used) if c.length_used else None,
                "cut_at": c.cut_at.isoformat() if c.cut_at else None,
            }
            for c in records
        ]

    async def send_for_processing(self, roll_id: UUID, req: SendForProcessing) -> dict:
        stmt = select(Roll).where(Roll.id == roll_id)
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")
        if roll.status != "in_stock":
            raise BusinessRuleViolationError("Roll must be in_stock to send for processing")

        log = RollProcessing(
            roll_id=roll_id,
            process_type=req.process_type,
            vendor_name=req.vendor_name,
            vendor_phone=req.vendor_phone,
            sent_date=req.sent_date,
            weight_before=roll.total_weight,
            length_before=roll.total_length,
            status="sent",
            notes=req.notes,
        )
        self.db.add(log)
        roll.status = "sent_for_processing"
        await self.db.flush()

        # Reload with all relationships for full roll response
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs),
        )
        roll = (await self.db.execute(reload)).scalar_one()
        return self._to_response(roll)

    async def receive_from_processing(
        self, roll_id: UUID, processing_id: UUID, req: ReceiveFromProcessing
    ) -> dict:
        stmt = select(Roll).where(Roll.id == roll_id)
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        log_stmt = select(RollProcessing).where(
            RollProcessing.id == processing_id,
            RollProcessing.roll_id == roll_id,
        )
        log_result = await self.db.execute(log_stmt)
        log = log_result.scalar_one_or_none()
        if not log:
            raise NotFoundError(f"Processing log {processing_id} not found")
        if log.status != "sent":
            raise BusinessRuleViolationError("Processing log is not in 'sent' status")

        log.received_date = req.received_date
        log.weight_after = req.weight_after
        log.length_after = req.length_after
        log.processing_cost = req.processing_cost
        log.status = "received"
        if req.notes:
            log.notes = (log.notes + " | " + req.notes) if log.notes else req.notes

        # Update roll measurements and return to stock
        roll.total_weight = req.weight_after
        roll.remaining_weight = req.weight_after
        if req.length_after:
            roll.total_length = req.length_after
        if req.processing_cost and roll.cost_per_unit and req.weight_after:
            roll.cost_per_unit = float(roll.cost_per_unit) + (float(req.processing_cost) / float(req.weight_after))
        roll.status = "in_stock"
        await self.db.flush()

        # Reload with all relationships for full roll response
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs),
        )
        roll = (await self.db.execute(reload)).scalar_one()
        return self._to_response(roll)

    def _processing_to_response(self, p: RollProcessing) -> dict:
        return {
            "id": str(p.id),
            "roll_id": str(p.roll_id),
            "process_type": p.process_type,
            "vendor_name": p.vendor_name,
            "vendor_phone": p.vendor_phone,
            "sent_date": p.sent_date.isoformat() if p.sent_date else None,
            "received_date": p.received_date.isoformat() if p.received_date else None,
            "weight_before": float(p.weight_before) if p.weight_before else None,
            "weight_after": float(p.weight_after) if p.weight_after else None,
            "length_before": float(p.length_before) if p.length_before else None,
            "length_after": float(p.length_after) if p.length_after else None,
            "processing_cost": float(p.processing_cost) if p.processing_cost else None,
            "status": p.status,
            "notes": p.notes,
        }

    def _to_response(self, r: Roll) -> dict:
        return {
            "id": str(r.id),
            "roll_code": r.roll_code,
            "fabric_type": r.fabric_type,
            "color": r.color,
            "total_weight": float(r.total_weight) if r.total_weight else 0,
            "remaining_weight": float(r.remaining_weight) if r.remaining_weight else 0,
            "unit": r.unit,
            "cost_per_unit": float(r.cost_per_unit) if r.cost_per_unit else 0,
            "total_length": float(r.total_length) if r.total_length else None,
            "status": r.status,
            "supplier": {
                "id": str(r.supplier.id),
                "name": r.supplier.name,
            } if r.supplier else None,
            "supplier_invoice_no": r.supplier_invoice_no,
            "supplier_invoice_date": r.supplier_invoice_date.isoformat() if r.supplier_invoice_date else None,
            "received_by_user": {
                "id": str(r.received_by_user.id),
                "full_name": r.received_by_user.full_name,
            } if r.received_by_user else None,
            "received_at": r.received_at.isoformat() if r.received_at else None,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "processing_logs": [
                self._processing_to_response(p) for p in r.processing_logs
            ] if r.processing_logs else [],
        }
