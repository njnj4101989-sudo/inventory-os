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
from app.models.lot import Lot, LotRoll
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.schemas.roll import (
    RollCreate, RollUpdate, RollFilterParams, RollResponse, RollDetail,
    SendForProcessing, ReceiveFromProcessing, UpdateProcessingLog,
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

        if params.sr_no:
            conditions.append(Roll.sr_no == params.sr_no)

        if params.value_addition_id:
            conditions.append(
                Roll.id.in_(
                    select(RollProcessing.roll_id).where(
                        RollProcessing.value_addition_id == params.value_addition_id
                    )
                )
            )

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
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
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
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
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

    async def get_roll_passport(self, roll_code: str) -> dict:
        """Public roll passport — full chain: origin → processing → lots → batches."""
        stmt = (
            select(Roll)
            .where(Roll.roll_code == roll_code)
            .options(
                selectinload(Roll.supplier),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.lot_rolls)
                    .selectinload(LotRoll.lot)
                    .selectinload(Lot.batches)
                    .selectinload(Batch.sku),
                selectinload(Roll.lot_rolls)
                    .selectinload(LotRoll.lot)
                    .selectinload(Lot.batches)
                    .selectinload(Batch.assignments)
                    .selectinload(BatchAssignment.tailor),
            )
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll '{roll_code}' not found")

        # Build lots + batches chain
        lots = []
        batches = []
        seen_batch_ids: set[str] = set()

        for lot_roll in (roll.lot_rolls or []):
            lot = lot_roll.lot
            if not lot:
                continue
            lots.append({
                "id": str(lot.id),
                "lot_code": lot.lot_code,
                "lot_date": lot.lot_date.isoformat() if lot.lot_date else None,
                "design_no": lot.design_no,
                "weight_used": float(lot_roll.weight_used) if lot_roll.weight_used else None,
                "waste_weight": float(lot_roll.waste_weight) if lot_roll.waste_weight else None,
                "pieces_from_roll": lot_roll.pieces_from_roll,
                "status": lot.status,
            })
            for batch in (lot.batches or []):
                bid = str(batch.id)
                if bid in seen_batch_ids:
                    continue
                seen_batch_ids.add(bid)

                tailor = None
                if batch.assignments:
                    a = batch.assignments[0]
                    tailor = {
                        "id": str(a.tailor.id),
                        "full_name": a.tailor.full_name,
                    } if a.tailor else None

                sku_code = batch.sku.sku_code if batch.sku else None
                # Phase 1: effective_sku = base sku_code
                # Phase 2 will append value addition short_codes (+EMB, +DYE, etc.)
                effective_sku = sku_code

                batches.append({
                    "id": bid,
                    "batch_code": batch.batch_code,
                    "sku_code": sku_code,
                    "effective_sku": effective_sku,
                    "quantity": batch.quantity,
                    "status": batch.status,
                    "tailor": tailor,
                })

        # Compute value additions for passport display (all logs have a VA now)
        value_additions = []
        for p in (roll.processing_logs or []):
            entry = self._processing_to_response(p)
            if p.value_addition:
                entry["name"] = p.value_addition.name
                entry["short_code"] = p.value_addition.short_code
            value_additions.append(entry)

        # Compute effective_sku: base sku + received value addition short_codes
        va_suffixes = [
            p.value_addition.short_code
            for p in (roll.processing_logs or [])
            if p.status == "received" and p.value_addition
        ]
        base_sku = batches[0]["sku_code"] if batches else None
        effective_sku = None
        if base_sku:
            effective_sku = base_sku + ("+" + "+".join(va_suffixes) if va_suffixes else "")

        passport = self._to_response(roll)
        passport.update({
            "value_additions": value_additions,
            "lots": lots,
            "batches": batches,
            "orders": [],   # Future: traverse batch → order items
            "effective_sku": effective_sku,
        })
        return passport

    async def stock_in(self, req: RollCreate, received_by: UUID) -> dict:
        roll_code = await next_roll_code(
            self.db,
            challan_no=req.sr_no or "STOCK",
            fabric_type=req.fabric_type,
            color=req.color,
            fabric_code=req.fabric_code,
            color_code=req.color_code,
            color_no=req.color_no,
        )

        roll = Roll(
            roll_code=roll_code,
            fabric_type=req.fabric_type,
            color=req.color,
            total_weight=req.total_weight,
            remaining_weight=req.total_weight,
            current_weight=req.total_weight,
            unit=req.unit or "kg",
            cost_per_unit=req.cost_per_unit,
            total_length=req.total_length,
            supplier_id=req.supplier_id,
            supplier_invoice_no=req.supplier_invoice_no,
            supplier_challan_no=req.supplier_challan_no,
            supplier_invoice_date=req.supplier_invoice_date,
            sr_no=req.sr_no,
            panna=req.panna,
            gsm=req.gsm,
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
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
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
        if roll.remaining_weight < roll.current_weight:
            raise BusinessRuleViolationError(
                "Cannot edit a roll that has been partially or fully consumed"
            )

        updates = req.model_dump(exclude_unset=True)
        weight_changed = False

        for field, value in updates.items():
            setattr(roll, field, value)
            if field == "total_weight":
                weight_changed = True

        # Keep remaining_weight and current_weight in sync when total_weight changes on unused roll
        if weight_changed and req.total_weight is not None:
            roll.remaining_weight = req.total_weight
            roll.current_weight = req.total_weight

        await self.db.flush()

        # Reload with relationships (supplier may have changed)
        stmt = select(Roll).where(Roll.id == roll.id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
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
        if roll.remaining_weight <= 0:
            raise BusinessRuleViolationError("Roll has no remaining weight to send")

        # Determine weight to send — default to full remaining
        weight_to_send = req.weight_to_send if req.weight_to_send is not None else roll.remaining_weight
        if weight_to_send <= 0:
            raise BusinessRuleViolationError("Weight to send must be greater than 0")
        if weight_to_send > roll.remaining_weight:
            raise BusinessRuleViolationError(
                f"Weight to send ({weight_to_send}) exceeds remaining weight ({roll.remaining_weight})"
            )

        log = RollProcessing(
            roll_id=roll_id,
            value_addition_id=req.value_addition_id,
            vendor_name=req.vendor_name,
            vendor_phone=req.vendor_phone,
            sent_date=req.sent_date,
            weight_before=weight_to_send,  # partial amount sent
            length_before=roll.total_length,
            status="sent",
            notes=req.notes,
            job_challan_id=req.job_challan_id,
        )
        self.db.add(log)

        # Deduct remaining weight
        roll.remaining_weight = roll.remaining_weight - weight_to_send
        # Status: sent_for_processing only if nothing remains
        if roll.remaining_weight <= 0:
            roll.status = "sent_for_processing"
        # else stays in_stock (partial send)

        await self.db.flush()

        # Reload with all relationships for full roll response
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
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

        # Add back the returned weight to remaining
        roll.remaining_weight = (roll.remaining_weight or 0) + req.weight_after
        # Adjust current_weight by VA delta (weight change from processing)
        va_delta = req.weight_after - log.weight_before
        roll.current_weight = (roll.current_weight or 0) + va_delta
        if req.length_after:
            roll.total_length = req.length_after
        if req.processing_cost and roll.cost_per_unit and req.weight_after:
            roll.cost_per_unit = float(roll.cost_per_unit) + (float(req.processing_cost) / float(req.weight_after))

        # Status: check if roll has any remaining "sent" processing logs
        sent_logs_stmt = select(func.count()).select_from(RollProcessing).where(
            RollProcessing.roll_id == roll_id,
            RollProcessing.status == "sent",
            RollProcessing.id != processing_id,  # exclude the one we just received
        )
        remaining_sent = (await self.db.execute(sent_logs_stmt)).scalar() or 0
        if remaining_sent == 0:
            roll.status = "in_stock"
        # else keep current status (still has material out)

        await self.db.flush()

        # Reload with all relationships for full roll response
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
        )
        roll = (await self.db.execute(reload)).scalar_one()
        return self._to_response(roll)

    async def update_processing_log(
        self, roll_id: UUID, processing_id: UUID, req: UpdateProcessingLog
    ) -> dict:
        """Update editable fields on a processing log (cost, vendor, dates, notes, etc.)."""
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

        updates = req.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "notes" and value is not None:
                # Replace notes entirely (not append)
                setattr(log, field, value)
            else:
                setattr(log, field, value)

        # If weight_after was edited on a received log, recalculate roll weights
        if "weight_after" in updates and log.status == "received":
            # Recalculate current_weight and remaining_weight from all processing logs
            # current_weight = total_weight + sum(weight_after - weight_before) for all received logs
            # remaining_weight = total_weight + sum(weight_after - weight_before) for received - sum(weight_before) for sent
            all_logs_stmt = select(RollProcessing).where(RollProcessing.roll_id == roll_id)
            all_logs = (await self.db.execute(all_logs_stmt)).scalars().all()
            va_delta_sum = sum(
                (float(p.weight_after) - float(p.weight_before))
                for p in all_logs if p.status == "received" and p.weight_after is not None
            )
            sent_weight_sum = sum(
                float(p.weight_before) for p in all_logs if p.status == "sent"
            )
            roll.current_weight = float(roll.total_weight) + va_delta_sum
            roll.remaining_weight = roll.current_weight - sent_weight_sum

        await self.db.flush()

        # Reload full roll with relationships
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
        )
        roll = (await self.db.execute(reload)).scalar_one()
        return self._to_response(roll)

    def _processing_to_response(self, p: RollProcessing) -> dict:
        va = p.value_addition
        return {
            "id": str(p.id),
            "roll_id": str(p.roll_id),
            "value_addition_id": str(p.value_addition_id),
            "value_addition": {
                "id": str(va.id),
                "name": va.name,
                "short_code": va.short_code,
            } if va else None,
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
            "job_challan_id": str(p.job_challan_id) if p.job_challan_id else None,
        }

    @staticmethod
    def _compute_enhanced_roll_code(roll_code: str, processing_logs) -> str:
        """Compute enhanced roll code: base + received value addition short codes."""
        suffixes = []
        for p in (processing_logs or []):
            if p.status == "received" and p.value_addition:
                suffixes.append(p.value_addition.short_code)
        if suffixes:
            return roll_code + "+" + "+".join(suffixes)
        return roll_code

    def _to_response(self, r: Roll) -> dict:
        enhanced = self._compute_enhanced_roll_code(r.roll_code, r.processing_logs)
        return {
            "id": str(r.id),
            "roll_code": r.roll_code,
            "enhanced_roll_code": enhanced,
            "fabric_type": r.fabric_type,
            "color": r.color,
            "total_weight": float(r.total_weight) if r.total_weight else 0,
            "remaining_weight": float(r.remaining_weight) if r.remaining_weight else 0,
            "current_weight": float(r.current_weight) if r.current_weight else 0,
            "unit": r.unit,
            "cost_per_unit": float(r.cost_per_unit) if r.cost_per_unit else 0,
            "total_length": float(r.total_length) if r.total_length else None,
            "status": r.status,
            "supplier": {
                "id": str(r.supplier.id),
                "name": r.supplier.name,
            } if r.supplier else None,
            "supplier_invoice_no": r.supplier_invoice_no,
            "supplier_challan_no": r.supplier_challan_no,
            "supplier_invoice_date": r.supplier_invoice_date.isoformat() if r.supplier_invoice_date else None,
            "sr_no": r.sr_no,
            "panna": float(r.panna) if r.panna else None,
            "gsm": float(r.gsm) if r.gsm else None,
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
