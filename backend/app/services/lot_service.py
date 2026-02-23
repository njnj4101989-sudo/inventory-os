"""Lot service — create lots, add rolls, calculate pallas/pieces.

Lot lifecycle: OPEN → CUTTING → DISTRIBUTED → CLOSED
"""

import math
from math import floor
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lot import Lot, LotRoll
from app.models.roll import Roll
from app.models.batch import Batch
from app.schemas.lot import LotCreate, LotFilterParams, LotUpdate, LotResponse
from app.core.code_generator import next_lot_code, _extract_number, next_batch_code
from app.core.exceptions import (
    NotFoundError,
    InsufficientStockError,
    InvalidStateTransitionError,
)


class LotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_lots(self, params: LotFilterParams) -> dict:
        # Build filter conditions
        conditions = []
        if params.status:
            conditions.append(Lot.status == params.status)
        if params.design_no:
            conditions.append(Lot.design_no.ilike(f"%{params.design_no}%"))

        count_stmt = select(func.count()).select_from(Lot)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Lot, params.sort_by, Lot.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Lot)
            .options(
                selectinload(Lot.lot_rolls).selectinload(LotRoll.roll),
                selectinload(Lot.created_by_user),
            )
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        if conditions:
            stmt = stmt.where(*conditions)
        result = await self.db.execute(stmt)
        lots = result.scalars().unique().all()

        return {
            "data": [self._to_response(lot) for lot in lots],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_lot(self, lot_id: UUID) -> dict:
        lot = await self._get_or_404(lot_id)
        return self._to_response(lot)

    async def create_lot(self, req: LotCreate, created_by: UUID) -> dict:
        lot_code = await next_lot_code(self.db)

        # Compute pieces_per_palla from size pattern
        size_pattern = req.default_size_pattern or {}
        pieces_per_palla = sum(size_pattern.values())

        total_pallas = 0
        total_pieces = 0
        total_weight = 0.0
        lot_rolls = []

        for roll_input in req.rolls:
            # Validate roll exists and has remaining weight
            roll_stmt = select(Roll).where(Roll.id == roll_input.roll_id)
            roll_result = await self.db.execute(roll_stmt)
            roll = roll_result.scalar_one_or_none()

            if not roll:
                raise NotFoundError(f"Roll {roll_input.roll_id} not found")
            if roll.status != "in_stock":
                raise InvalidStateTransitionError(f"Roll {roll.roll_code} is not in stock (status: {roll.status})")

            palla_weight = float(roll_input.palla_weight or req.standard_palla_weight or 0)
            if not palla_weight or palla_weight <= 0:
                raise InvalidStateTransitionError("Palla weight must be positive")

            remaining = float(roll.remaining_weight or 0)
            if remaining <= 0:
                raise InsufficientStockError(f"Roll {roll.roll_code} has no remaining weight")

            num_pallas = floor(remaining / palla_weight)
            if num_pallas <= 0:
                raise InsufficientStockError(
                    f"Roll {roll.roll_code} remaining weight ({remaining} kg) "
                    f"is less than palla weight ({palla_weight} kg)"
                )

            weight_used = num_pallas * palla_weight
            waste_weight = remaining - weight_used
            pieces_from_roll = num_pallas * pieces_per_palla

            roll_size_pattern = roll_input.size_pattern or size_pattern

            lot_roll = LotRoll(
                roll_id=roll.id,
                palla_weight=palla_weight,
                num_pallas=num_pallas,
                weight_used=weight_used,
                waste_weight=waste_weight,
                size_pattern=roll_size_pattern,
                pieces_from_roll=pieces_from_roll,
            )
            lot_rolls.append(lot_roll)

            # Deduct remaining weight from roll
            roll.remaining_weight = waste_weight
            if waste_weight <= 0:
                roll.status = "in_cutting"

            total_pallas += num_pallas
            total_pieces += pieces_from_roll
            total_weight += weight_used

        lot = Lot(
            lot_code=lot_code,
            sku_id=req.sku_id,
            lot_date=req.lot_date,
            design_no=req.design_no,
            standard_palla_weight=req.standard_palla_weight,
            standard_palla_meter=req.standard_palla_meter,
            default_size_pattern=size_pattern,
            pieces_per_palla=pieces_per_palla,
            total_pallas=total_pallas,
            total_pieces=total_pieces,
            total_weight=total_weight,
            status="open",
            notes=req.notes,
            created_by=created_by,
        )
        self.db.add(lot)
        await self.db.flush()

        # Attach lot_rolls
        for lr in lot_rolls:
            lr.lot_id = lot.id
            self.db.add(lr)
        await self.db.flush()

        # Reload with relationships
        return await self.get_lot(lot.id)

    async def update_lot(self, lot_id: UUID, req: LotUpdate) -> dict:
        lot = await self._get_or_404(lot_id)

        update_data = req.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(lot, field, value)

        await self.db.flush()
        return await self.get_lot(lot_id)

    async def add_roll_to_lot(self, lot_id: UUID, roll_id: UUID, palla_weight: float) -> dict:
        lot = await self._get_or_404(lot_id)
        if lot.status not in ("open",):
            raise InvalidStateTransitionError("Can only add rolls to lots in 'open' status")

        roll_stmt = select(Roll).where(Roll.id == roll_id)
        roll_result = await self.db.execute(roll_stmt)
        roll = roll_result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")
        if roll.status != "in_stock":
            raise InvalidStateTransitionError(f"Roll {roll.roll_code} is not in stock")

        remaining = float(roll.remaining_weight or 0)
        if remaining <= 0:
            raise InsufficientStockError(f"Roll {roll.roll_code} has no remaining weight")

        pieces_per_palla = lot.pieces_per_palla or 0
        num_pallas = floor(remaining / palla_weight)
        if num_pallas <= 0:
            raise InsufficientStockError("Roll weight insufficient for even one palla")

        weight_used = num_pallas * palla_weight
        waste_weight = remaining - weight_used
        pieces_from_roll = num_pallas * pieces_per_palla

        lot_roll = LotRoll(
            lot_id=lot.id,
            roll_id=roll.id,
            palla_weight=palla_weight,
            num_pallas=num_pallas,
            weight_used=weight_used,
            waste_weight=waste_weight,
            size_pattern=lot.default_size_pattern,
            pieces_from_roll=pieces_from_roll,
        )
        self.db.add(lot_roll)

        roll.remaining_weight = waste_weight
        if waste_weight <= 0:
            roll.status = "in_cutting"

        # Update lot totals
        lot.total_pallas = (lot.total_pallas or 0) + num_pallas
        lot.total_pieces = (lot.total_pieces or 0) + pieces_from_roll
        lot.total_weight = float(lot.total_weight or 0) + weight_used

        await self.db.flush()
        return await self.get_lot(lot_id)

    async def remove_roll_from_lot(self, lot_id: UUID, lot_roll_id: UUID) -> dict:
        lot = await self._get_or_404(lot_id)
        if lot.status not in ("open",):
            raise InvalidStateTransitionError("Can only remove rolls from lots in 'open' status")

        lr_stmt = select(LotRoll).where(LotRoll.id == lot_roll_id, LotRoll.lot_id == lot_id)
        lr_result = await self.db.execute(lr_stmt)
        lot_roll = lr_result.scalar_one_or_none()
        if not lot_roll:
            raise NotFoundError(f"LotRoll {lot_roll_id} not found in lot {lot_id}")

        # Restore roll weight
        roll_stmt = select(Roll).where(Roll.id == lot_roll.roll_id)
        roll_result = await self.db.execute(roll_stmt)
        roll = roll_result.scalar_one_or_none()
        if roll:
            roll.remaining_weight = float(roll.remaining_weight or 0) + float(lot_roll.weight_used or 0)
            if roll.status == "in_cutting":
                roll.status = "in_stock"

        # Update lot totals
        lot.total_pallas = max(0, (lot.total_pallas or 0) - (lot_roll.num_pallas or 0))
        lot.total_pieces = max(0, (lot.total_pieces or 0) - (lot_roll.pieces_from_roll or 0))
        lot.total_weight = max(0, float(lot.total_weight or 0) - float(lot_roll.weight_used or 0))

        await self.db.delete(lot_roll)
        await self.db.flush()
        return await self.get_lot(lot_id)

    async def distribute_lot(self, lot_id: UUID, created_by: UUID) -> dict:
        """Auto-create batches from lot size pattern, set lot status to distributed."""
        lot = await self._get_or_404(lot_id)
        if lot.status != "cutting":
            raise InvalidStateTransitionError(
                f"Lot {lot.lot_code} must be in 'cutting' status to distribute (current: '{lot.status}')"
            )

        size_pattern = lot.default_size_pattern or {}
        if not size_pattern:
            raise InvalidStateTransitionError("Lot has no size pattern — cannot distribute")

        # Compute color_breakdown from lot_rolls
        color_breakdown = {}
        for lr in (lot.lot_rolls or []):
            color = lr.roll.color if lr.roll else "Unknown"
            color_breakdown[color] = (color_breakdown.get(color, 0) + (lr.num_pallas or 0))

        # Get current max batch code once, generate all sequentially
        from sqlalchemy import func, select as sa_select
        result = await self.db.execute(sa_select(func.max(Batch.batch_code)))
        current_max = _extract_number(result.scalar(), "BATCH-")

        batches_created = []
        seq = current_max

        for size_name, count in size_pattern.items():
            for _ in range(int(count)):
                seq += 1
                batch_code = f"BATCH-{seq:04d}"
                qr_url = f"/scan/batch/{batch_code}"

                batch = Batch(
                    batch_code=batch_code,
                    lot_id=lot.id,
                    sku_id=None,
                    size=size_name,
                    quantity=lot.total_pallas or 0,
                    piece_count=lot.total_pallas or 0,
                    color_breakdown=color_breakdown,
                    status="created",
                    qr_code_data=qr_url,
                    created_by=created_by,
                )
                self.db.add(batch)
                batches_created.append({
                    "batch_code": batch_code,
                    "size": size_name,
                    "piece_count": lot.total_pallas or 0,
                    "color_breakdown": color_breakdown,
                    "qr_code_data": qr_url,
                })

        # Set lot status to distributed
        lot.status = "distributed"
        await self.db.flush()

        # Collect IDs for response
        batch_responses = []
        for bc in batches_created:
            # Query the batch we just created for its ID
            stmt = select(Batch).where(Batch.batch_code == bc["batch_code"])
            result = await self.db.execute(stmt)
            b = result.scalar_one_or_none()
            if b:
                batch_responses.append({
                    "id": str(b.id),
                    "batch_code": b.batch_code,
                    "size": b.size,
                    "piece_count": b.piece_count,
                    "color_breakdown": b.color_breakdown,
                    "qr_code_data": b.qr_code_data,
                })

        return {
            "lot_id": str(lot.id),
            "lot_code": lot.lot_code,
            "design_no": lot.design_no,
            "lot_date": lot.lot_date.isoformat() if lot.lot_date else None,
            "batches_created": len(batch_responses),
            "batches": batch_responses,
        }

    async def _get_or_404(self, lot_id: UUID) -> Lot:
        stmt = (
            select(Lot)
            .where(Lot.id == lot_id)
            .options(
                selectinload(Lot.lot_rolls).selectinload(LotRoll.roll),
                selectinload(Lot.created_by_user),
            )
        )
        result = await self.db.execute(stmt)
        lot = result.scalar_one_or_none()
        if not lot:
            raise NotFoundError(f"Lot {lot_id} not found")
        return lot

    def _to_response(self, lot: Lot) -> dict:
        return {
            "id": str(lot.id),
            "lot_code": lot.lot_code,
            "sku_id": str(lot.sku_id) if lot.sku_id else None,
            "lot_date": lot.lot_date.isoformat() if lot.lot_date else None,
            "design_no": lot.design_no,
            "standard_palla_weight": float(lot.standard_palla_weight) if lot.standard_palla_weight else None,
            "standard_palla_meter": float(lot.standard_palla_meter) if lot.standard_palla_meter else None,
            "default_size_pattern": lot.default_size_pattern,
            "pieces_per_palla": lot.pieces_per_palla,
            "total_pallas": lot.total_pallas,
            "total_pieces": lot.total_pieces,
            "total_weight": float(lot.total_weight) if lot.total_weight else 0,
            "status": lot.status,
            "notes": lot.notes,
            "created_by_user": {
                "id": str(lot.created_by_user.id),
                "full_name": lot.created_by_user.full_name,
            } if lot.created_by_user else None,
            "created_at": lot.created_at.isoformat() if lot.created_at else None,
            "lot_rolls": [
                {
                    "id": str(lr.id),
                    "roll_id": str(lr.roll_id),
                    "roll_code": lr.roll.roll_code if lr.roll else None,
                    "color": lr.roll.color if lr.roll else None,
                    "roll_weight": float(lr.roll.total_weight) if lr.roll and lr.roll.total_weight else 0,
                    "palla_weight": float(lr.palla_weight) if lr.palla_weight else None,
                    "num_pallas": lr.num_pallas,
                    "weight_used": float(lr.weight_used) if lr.weight_used else 0,
                    "waste_weight": float(lr.waste_weight) if lr.waste_weight else 0,
                    "size_pattern": lr.size_pattern,
                    "pieces_from_roll": lr.pieces_from_roll,
                }
                for lr in (lot.lot_rolls or [])
            ],
        }
