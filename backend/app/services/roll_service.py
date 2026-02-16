"""Roll service — stock-in, queries, consumption history."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.roll import Roll
from app.models.inventory_event import InventoryEvent
from app.models.batch_roll_consumption import BatchRollConsumption
from app.schemas.roll import RollCreate, RollResponse, RollDetail
from app.schemas import PaginatedParams
from app.core.code_generator import next_roll_code
from app.core.exceptions import NotFoundError


class RollService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_rolls(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(Roll)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Roll, params.sort_by, Roll.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Roll)
            .options(selectinload(Roll.supplier))
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
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
            .options(selectinload(Roll.supplier))
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        consumption = await self.get_consumption_history(roll_id)
        # Get processing history
        from app.models.roll import RollProcessing
        proc_stmt = select(RollProcessing).where(RollProcessing.roll_id == roll_id).order_by(RollProcessing.created_at.desc())
        proc_result = await self.db.execute(proc_stmt)
        processing = proc_result.scalars().all()

        resp = self._to_response(roll)
        resp["consumption_history"] = consumption
        resp["processing_history"] = [
            {
                "id": str(p.id),
                "process_type": p.process_type,
                "vendor_name": p.vendor_name,
                "vendor_phone": p.vendor_phone,
                "sent_date": p.sent_date.isoformat() if p.sent_date else None,
                "expected_return_date": p.expected_return_date.isoformat() if p.expected_return_date else None,
                "actual_return_date": p.actual_return_date.isoformat() if p.actual_return_date else None,
                "weight_before": float(p.weight_before) if p.weight_before else None,
                "weight_after": float(p.weight_after) if p.weight_after else None,
                "length_before": float(p.length_before) if p.length_before else None,
                "length_after": float(p.length_after) if p.length_after else None,
                "processing_cost": float(p.processing_cost) if p.processing_cost else None,
                "status": p.status,
                "notes": p.notes,
            }
            for p in processing
        ]
        return resp

    async def stock_in(self, req: RollCreate, received_by: UUID) -> dict:
        roll_code = await next_roll_code(
            self.db,
            challan_no=req.supplier_invoice_no or "STOCK",
            fabric_type=req.fabric_type,
            color=req.color,
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

        # Reload with supplier
        stmt = select(Roll).where(Roll.id == roll.id).options(selectinload(Roll.supplier))
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
            "received_by": str(r.received_by) if r.received_by else None,
            "received_at": r.received_at.isoformat() if r.received_at else None,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
