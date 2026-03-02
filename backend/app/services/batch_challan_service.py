"""Batch Challan service — create challan + bulk send batches for VA, receive back, list, get.

Mirrors JobChallanService pattern but for garment-level VA (pieces, not weight).
Auto-sequential challan_no: BC-001, BC-002, ...
"""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch
from app.models.batch_challan import BatchChallan
from app.models.batch_processing import BatchProcessing
from app.models.value_addition import ValueAddition
from app.schemas.batch_challan import (
    BatchChallanCreate,
    BatchChallanFilterParams,
    BatchChallanReceive,
)
from app.core.exceptions import (
    BusinessRuleViolationError,
    NotFoundError,
    ValidationError,
)


class BatchChallanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _next_challan_no(self) -> str:
        """Generate next sequential challan number: BC-001, BC-002, etc."""
        stmt = (
            select(func.max(BatchChallan.challan_no))
            .where(BatchChallan.challan_no.like("BC-%"))
        )
        result = await self.db.execute(stmt)
        last = result.scalar_one_or_none()
        if last:
            try:
                num = int(last.replace("BC-", ""))
                return f"BC-{num + 1:03d}"
            except ValueError:
                pass
        return "BC-001"

    async def create_challan(self, req: BatchChallanCreate, created_by: UUID) -> dict:
        """Create a batch challan and send batches for VA in one transaction."""
        if not req.batches:
            raise BusinessRuleViolationError("At least one batch is required")

        # Validate VA exists and is applicable to garments
        va_stmt = select(ValueAddition).where(ValueAddition.id == req.value_addition_id)
        va_result = await self.db.execute(va_stmt)
        va = va_result.scalar_one_or_none()
        if not va:
            raise NotFoundError(f"Value addition {req.value_addition_id} not found")
        if va.applicable_to == "roll":
            raise BusinessRuleViolationError(
                f"VA '{va.name}' is roll-only — cannot be used for garment batches"
            )

        # Validate all batches exist and are in a VA-eligible status
        batch_ids = [entry.batch_id for entry in req.batches]
        batch_stmt = select(Batch).where(Batch.id.in_(batch_ids))
        batch_result = await self.db.execute(batch_stmt)
        batches = batch_result.scalars().all()

        batch_map = {b.id: b for b in batches}
        missing = [str(bid) for bid in batch_ids if bid not in batch_map]
        if missing:
            raise NotFoundError(f"Batches not found: {', '.join(missing)}")

        # VA allowed during in_progress (stitching) and checked (post-QC)
        va_eligible = {"in_progress", "checked"}
        ineligible = [
            b.batch_code for b in batches if b.status not in va_eligible
        ]
        if ineligible:
            raise BusinessRuleViolationError(
                f"Batches must be in_progress or checked to send for VA: {', '.join(ineligible)}"
            )

        # Generate challan number
        challan_no = await self._next_challan_no()
        total_pieces = sum(entry.pieces_to_send for entry in req.batches)

        challan = BatchChallan(
            challan_no=challan_no,
            processor_name=req.processor_name,
            value_addition_id=req.value_addition_id,
            total_pieces=total_pieces,
            status="sent",
            notes=req.notes,
            created_by_id=created_by,
        )
        self.db.add(challan)
        await self.db.flush()

        # Create BatchProcessing records
        for entry in req.batches:
            batch = batch_map[entry.batch_id]
            # Determine phase based on batch status
            phase = "post_qc" if batch.status == "checked" else "stitching"

            bp = BatchProcessing(
                batch_id=entry.batch_id,
                batch_challan_id=challan.id,
                value_addition_id=req.value_addition_id,
                pieces_sent=entry.pieces_to_send,
                status="sent",
                phase=phase,
                created_by_id=created_by,
            )
            self.db.add(bp)

        await self.db.flush()

        # Return response
        return await self.get_challan(challan.id)

    async def receive_challan(self, challan_id: UUID, req: BatchChallanReceive, received_by: UUID) -> dict:
        """Receive all batches back from VA vendor."""
        challan = await self._get_or_404(challan_id)
        if challan.status == "received":
            raise BusinessRuleViolationError("Challan already received")

        # Build lookup of BatchProcessing items by batch_id
        bp_map = {bp.batch_id: bp for bp in challan.batch_items}

        total_cost = 0
        for entry in req.batches:
            bp = bp_map.get(entry.batch_id)
            if not bp:
                raise ValidationError(
                    f"Batch {entry.batch_id} is not on this challan"
                )
            if bp.status == "received":
                continue  # already received — skip

            bp.pieces_received = entry.pieces_received
            bp.cost = entry.cost
            bp.status = "received"
            if entry.cost:
                total_cost += float(entry.cost)

        # Check if all items received
        all_received = all(bp.status == "received" for bp in challan.batch_items)
        if all_received:
            challan.status = "received"
            challan.received_date = datetime.now(timezone.utc).date()

        challan.total_cost = total_cost or challan.total_cost
        if req.notes:
            challan.notes = (challan.notes or "") + f"\nReceived: {req.notes}"

        await self.db.flush()
        return await self.get_challan(challan_id)

    async def get_challans(self, params: BatchChallanFilterParams) -> dict:
        """List batch challans with pagination and optional filters."""
        conditions = []
        if params.processor_name:
            conditions.append(BatchChallan.processor_name.ilike(f"%{params.processor_name}%"))
        if params.value_addition_id:
            conditions.append(BatchChallan.value_addition_id == params.value_addition_id)
        if params.status:
            conditions.append(BatchChallan.status == params.status)

        count_stmt = select(func.count()).select_from(BatchChallan)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            select(BatchChallan)
            .options(
                selectinload(BatchChallan.value_addition),
                selectinload(BatchChallan.created_by_user),
                selectinload(BatchChallan.batch_items).selectinload(BatchProcessing.batch),
            )
            .order_by(BatchChallan.created_at.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        if conditions:
            stmt = stmt.where(*conditions)

        result = await self.db.execute(stmt)
        challans = result.scalars().unique().all()

        return {
            "data": [self._to_response(c) for c in challans],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_challan(self, challan_id: UUID) -> dict:
        """Get a single batch challan by ID with full batch details."""
        challan = await self._get_or_404(challan_id)
        return self._to_response(challan)

    async def _get_or_404(self, challan_id: UUID) -> BatchChallan:
        stmt = (
            select(BatchChallan)
            .where(BatchChallan.id == challan_id)
            .options(
                selectinload(BatchChallan.value_addition),
                selectinload(BatchChallan.created_by_user),
                selectinload(BatchChallan.batch_items).selectinload(BatchProcessing.batch),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Batch challan {challan_id} not found")
        return challan

    def _to_response(self, challan: BatchChallan) -> dict:
        va = challan.value_addition
        user = challan.created_by_user

        batch_items = []
        for bp in (challan.batch_items or []):
            b = bp.batch
            batch_items.append({
                "id": str(bp.id),
                "batch": {
                    "id": str(b.id),
                    "batch_code": b.batch_code,
                    "size": b.size,
                } if b else None,
                "pieces_sent": bp.pieces_sent,
                "pieces_received": bp.pieces_received,
                "cost": float(bp.cost) if bp.cost else None,
                "status": bp.status,
                "phase": bp.phase,
            })

        return {
            "id": str(challan.id),
            "challan_no": challan.challan_no,
            "processor_name": challan.processor_name,
            "value_addition": {
                "id": str(va.id),
                "name": va.name,
                "short_code": va.short_code,
            } if va else None,
            "total_pieces": challan.total_pieces,
            "total_cost": float(challan.total_cost) if challan.total_cost else None,
            "status": challan.status,
            "sent_date": challan.sent_date.isoformat() if challan.sent_date else None,
            "received_date": challan.received_date.isoformat() if challan.received_date else None,
            "notes": challan.notes,
            "created_by_user": {
                "id": str(user.id),
                "full_name": user.full_name,
            } if user else None,
            "created_at": challan.created_at.isoformat() if challan.created_at else None,
            "batch_items": batch_items,
        }
