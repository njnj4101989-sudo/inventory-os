"""Lot service — create lots, add rolls, calculate pallas/pieces.

Lot lifecycle: OPEN → CUTTING → DISTRIBUTED → CLOSED
"""

import math
from math import floor
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lot import Lot, LotRoll
from app.models.roll import Roll
from app.models.batch import Batch
from app.schemas.lot import LotCreate, LotFilterParams, LotUpdate, LotResponse
from app.core.code_generator import next_lot_code, max_batch_number_for_fy
from app.core.exceptions import (
    NotFoundError,
    InsufficientStockError,
    InvalidStateTransitionError,
)


LOT_STATUS_FLOW = ("open", "cutting", "distributed")


def _compute_pieces_per_palla(designs: list[dict]) -> int:
    """Sum of all size counts across all designs = total pieces cut per palla."""
    total = 0
    for d in (designs or []):
        sp = d.get("size_pattern") or {}
        total += sum(sp.values())
    return total


def _merged_size_pattern(designs: list[dict]) -> dict:
    """Merge all designs' size patterns into one combined pattern (for roll calculation)."""
    merged = {}
    for d in (designs or []):
        for size, count in (d.get("size_pattern") or {}).items():
            merged[size] = merged.get(size, 0) + int(count)
    return merged


class LotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_lots(self, params: LotFilterParams, fy_id: UUID) -> dict:
        # FY scoping: current FY records + active lots from any previous FY
        _LOT_ACTIVE = ("open", "cutting")
        conditions = [or_(Lot.fy_id == fy_id, Lot.status.in_(_LOT_ACTIVE))]
        if params.status:
            conditions.append(Lot.status == params.status)
        if params.design_no:
            # Search within designs JSON — cast to text and search
            conditions.append(func.cast(Lot.designs, String).ilike(f"%{params.design_no}%"))

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

    async def create_lot(self, req: LotCreate, created_by: UUID, fy_id: UUID) -> dict:
        if not req.designs:
            raise InvalidStateTransitionError("At least one design is required")
        if req.standard_palla_weight is None and req.standard_palla_meter is None:
            raise InvalidStateTransitionError("Either palla weight or palla meter is required")

        # Serialize designs to dicts
        designs_data = [{"design_no": d.design_no, "size_pattern": d.size_pattern} for d in req.designs]
        pieces_per_palla = _compute_pieces_per_palla(designs_data)

        lot_code = await next_lot_code(self.db, fy_id, req.product_type)

        total_pallas = 0
        total_pieces = 0
        total_weight = 0.0
        lot_rolls = []

        # Batch-fetch all rolls in one query instead of N individual queries
        roll_ids = [ri.roll_id for ri in req.rolls]
        roll_stmt = select(Roll).where(Roll.id.in_(roll_ids)).with_for_update()
        roll_result = await self.db.execute(roll_stmt)
        roll_map = {r.id: r for r in roll_result.scalars().all()}

        for roll_input in req.rolls:
            roll = roll_map.get(roll_input.roll_id)

            if not roll:
                raise NotFoundError(f"Roll {roll_input.roll_id} not found")
            if roll.status not in ("in_stock", "remnant"):
                raise InvalidStateTransitionError(f"Roll {roll.roll_code} is not available (status: {roll.status})")

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

            # Merged size pattern for lot_roll (backward compat)
            merged_sp = _merged_size_pattern(designs_data)
            roll_size_pattern = roll_input.size_pattern or merged_sp

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
            elif waste_weight < palla_weight:
                roll.status = "remnant"

            total_pallas += num_pallas
            total_pieces += pieces_from_roll
            total_weight += weight_used

        lot = Lot(
            lot_code=lot_code,
            sku_id=req.sku_id,
            lot_date=req.lot_date,
            product_type=req.product_type,
            standard_palla_weight=req.standard_palla_weight,
            standard_palla_meter=req.standard_palla_meter,
            designs=designs_data,
            pieces_per_palla=pieces_per_palla,
            total_pallas=total_pallas,
            total_pieces=total_pieces,
            total_weight=total_weight,
            status="open",
            notes=req.notes,
            created_by=created_by,
            fy_id=fy_id,
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

        # Validate forward-only status transition (open → cutting → distributed)
        if "status" in update_data:
            new_status = update_data["status"]
            cur_idx = LOT_STATUS_FLOW.index(lot.status) if lot.status in LOT_STATUS_FLOW else -1
            new_idx = LOT_STATUS_FLOW.index(new_status) if new_status in LOT_STATUS_FLOW else -1
            if new_idx <= cur_idx:
                raise InvalidStateTransitionError(
                    f"Cannot move lot from '{lot.status}' to '{new_status}'"
                )

        # Handle designs update — recalculate pieces_per_palla
        if "designs" in update_data and update_data["designs"] is not None:
            designs_raw = update_data.pop("designs")
            designs_data = [{"design_no": d.design_no, "size_pattern": d.size_pattern} for d in designs_raw]
            lot.designs = designs_data
            lot.pieces_per_palla = _compute_pieces_per_palla(designs_data)

        for field, value in update_data.items():
            setattr(lot, field, value)

        await self.db.flush()
        return await self.get_lot(lot_id)

    async def add_roll_to_lot(self, lot_id: UUID, roll_id: UUID, palla_weight: float) -> dict:
        lot = await self._get_or_404(lot_id)
        if lot.status not in ("open",):
            raise InvalidStateTransitionError("Can only add rolls to lots in 'open' status")

        roll_stmt = select(Roll).where(Roll.id == roll_id).with_for_update()
        roll_result = await self.db.execute(roll_stmt)
        roll = roll_result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")
        if roll.status not in ("in_stock", "remnant"):
            raise InvalidStateTransitionError(f"Roll {roll.roll_code} is not available (status: {roll.status})")

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
            size_pattern=_merged_size_pattern(lot.designs or []),
            pieces_from_roll=pieces_from_roll,
        )
        self.db.add(lot_roll)

        roll.remaining_weight = waste_weight
        if waste_weight <= 0:
            roll.status = "in_cutting"
        elif waste_weight < palla_weight:
            roll.status = "remnant"

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
        roll_stmt = select(Roll).where(Roll.id == lot_roll.roll_id).with_for_update()
        roll_result = await self.db.execute(roll_stmt)
        roll = roll_result.scalar_one_or_none()
        if roll:
            roll.remaining_weight = float(roll.remaining_weight or 0) + float(lot_roll.weight_used or 0)
            if roll.status in ("in_cutting", "remnant"):
                roll.status = "in_stock"

        # Update lot totals
        lot.total_pallas = max(0, (lot.total_pallas or 0) - (lot_roll.num_pallas or 0))
        lot.total_pieces = max(0, (lot.total_pieces or 0) - (lot_roll.pieces_from_roll or 0))
        lot.total_weight = max(0, float(lot.total_weight or 0) - float(lot_roll.weight_used or 0))

        await self.db.delete(lot_roll)
        await self.db.flush()
        return await self.get_lot(lot_id)

    async def distribute_lot(self, lot_id: UUID, created_by: UUID, fy_id: UUID) -> dict:
        """Auto-create batches from lot designs, set lot status to distributed.

        Iterates each design in lot.designs, creates batches per design's
        size pattern. Each batch gets design_no from its parent design.
        """
        lot = await self._get_or_404(lot_id)
        if lot.status != "cutting":
            raise InvalidStateTransitionError(
                f"Lot {lot.lot_code} must be in 'cutting' status to distribute (current: '{lot.status}')"
            )

        designs = lot.designs or []
        if not designs:
            raise InvalidStateTransitionError("Lot has no designs — cannot distribute")

        # Compute color_breakdown from lot_rolls
        color_breakdown = {}
        for lr in (lot.lot_rolls or []):
            color = lr.roll.color if lr.roll else "Unknown"
            color_breakdown[color] = (color_breakdown.get(color, 0) + (lr.num_pallas or 0))

        # Get current max batch code for this FY, generate all sequentially
        current_max = await max_batch_number_for_fy(self.db, fy_id)

        batch_objects = []
        seq = current_max

        for design in designs:
            design_no = design.get("design_no", "")
            size_pattern = design.get("size_pattern", {})

            for size_name, count in size_pattern.items():
                for _ in range(int(count)):
                    seq += 1
                    batch_code = f"BATCH-{seq:04d}"
                    qr_url = f"/scan/batch/{batch_code}"

                    batch = Batch(
                        batch_code=batch_code,
                        lot_id=lot.id,
                        sku_id=None,
                        design_no=design_no,
                        size=size_name,
                        quantity=lot.total_pallas or 0,
                        piece_count=lot.total_pallas or 0,
                        color_breakdown=color_breakdown,
                        status="created",
                        qr_code_data=qr_url,
                        created_by=created_by,
                        fy_id=fy_id,
                    )
                    self.db.add(batch)
                    batch_objects.append(batch)

        # Set lot status to distributed
        lot.status = "distributed"
        await self.db.flush()

        # Use batch objects directly — IDs are available after flush(), no re-query needed
        batch_responses = [
            {
                "id": str(b.id),
                "batch_code": b.batch_code,
                "design_no": b.design_no,
                "size": b.size,
                "piece_count": b.piece_count,
                "color_breakdown": b.color_breakdown,
                "qr_code_data": b.qr_code_data,
            }
            for b in batch_objects
        ]

        # Build display design_no string for event
        design_nos = ", ".join(d.get("design_no", "") for d in designs)

        from app.core.event_bus import event_bus
        await event_bus.emit("lot_distributed", {
            "lot_code": lot.lot_code,
            "design_no": design_nos,
            "batch_count": len(batch_responses),
        }, str(created_by))

        return {
            "lot_id": str(lot.id),
            "lot_code": lot.lot_code,
            "designs": designs,
            "product_type": lot.product_type or "BLS",
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
            "product_type": lot.product_type or "BLS",
            "standard_palla_weight": float(lot.standard_palla_weight) if lot.standard_palla_weight else None,
            "standard_palla_meter": float(lot.standard_palla_meter) if lot.standard_palla_meter else None,
            "designs": lot.designs or [],
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
                    "unit": lr.roll.unit if lr.roll else "kg",
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
