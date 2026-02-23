"""Batch service — full lifecycle: create, assign, start, submit, check.

State machine: CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → COMPLETED
Full rejection → back to ASSIGNED.
"""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_roll_consumption import BatchRollConsumption
from app.models.lot import Lot
from app.models.roll import Roll
from app.schemas.batch import BatchCreate, BatchAssign, BatchCheck, BatchResponse
from app.schemas import PaginatedParams
from app.core.code_generator import next_batch_code
from app.core.exceptions import (
    NotFoundError,
    InvalidStateTransitionError,
    ForbiddenError,
    InsufficientStockError,
    ValidationError,
)


class BatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_batches(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(Batch)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Batch, params.sort_by, Batch.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Batch)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.created_by_user),
            )
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        batches = result.scalars().unique().all()

        return {
            "data": [self._to_response(b) for b in batches],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_batch(self, batch_id: UUID) -> dict:
        batch = await self._get_or_404(batch_id)
        return self._to_response(batch)

    async def create_batch(self, req: BatchCreate, created_by: UUID) -> dict:
        batch_code = await next_batch_code(self.db)

        # Validate lot
        lot_stmt = select(Lot).where(Lot.id == req.lot_id)
        lot_result = await self.db.execute(lot_stmt)
        lot = lot_result.scalar_one_or_none()
        if not lot:
            raise NotFoundError(f"Lot {req.lot_id} not found")
        if lot.status not in ("open", "cutting"):
            raise InvalidStateTransitionError(f"Lot {lot.lot_code} is in '{lot.status}' status, cannot create batch")

        batch = Batch(
            batch_code=batch_code,
            lot_id=req.lot_id,
            sku_id=req.sku_id,
            size=req.size,
            quantity=req.piece_count or 0,
            piece_count=req.piece_count,
            color_breakdown=req.color_breakdown,
            status="created",
            notes=req.notes,
            created_by=created_by,
        )
        self.db.add(batch)
        await self.db.flush()

        # Update lot status to cutting if it was open
        if lot.status == "open":
            lot.status = "cutting"
            await self.db.flush()

        # Generate QR
        from app.services.qr_service import QRService
        batch.qr_code_data = QRService.generate_batch_qr(batch_code)
        await self.db.flush()

        return await self.get_batch(batch.id)

    async def assign_batch(self, batch_id: UUID, req: BatchAssign) -> dict:
        batch = await self._get_or_404(batch_id)
        if batch.status != "created":
            raise InvalidStateTransitionError(f"Cannot assign batch in '{batch.status}' status (expected 'created')")

        assignment = BatchAssignment(
            batch_id=batch.id,
            tailor_id=req.tailor_id,
            assigned_at=datetime.now(timezone.utc),
        )
        self.db.add(assignment)

        batch.status = "assigned"
        batch.assigned_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def start_batch(self, batch_id: UUID, user_id: UUID) -> dict:
        batch = await self._get_or_404(batch_id)
        if batch.status != "assigned":
            raise InvalidStateTransitionError(f"Cannot start batch in '{batch.status}' status (expected 'assigned')")

        # Verify the tailor is the assigned one
        assignment = batch.assignments[0] if batch.assignments else None
        if assignment and assignment.tailor_id != user_id:
            raise ForbiddenError("Only the assigned tailor can start this batch")

        batch.status = "in_progress"
        batch.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def submit_batch(self, batch_id: UUID, user_id: UUID) -> dict:
        batch = await self._get_or_404(batch_id)
        if batch.status != "in_progress":
            raise InvalidStateTransitionError(f"Cannot submit batch in '{batch.status}' status (expected 'in_progress')")

        assignment = batch.assignments[0] if batch.assignments else None
        if assignment and assignment.tailor_id != user_id:
            raise ForbiddenError("Only the assigned tailor can submit this batch")

        batch.status = "submitted"
        batch.submitted_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def check_batch(self, batch_id: UUID, req: BatchCheck, checker_id: UUID) -> dict:
        batch = await self._get_or_404(batch_id)
        if batch.status != "submitted":
            raise InvalidStateTransitionError(f"Cannot check batch in '{batch.status}' status (expected 'submitted')")

        total_check = (req.approved_qty or 0) + (req.rejected_qty or 0)
        if total_check != batch.quantity:
            raise ValidationError(
                f"approved_qty ({req.approved_qty}) + rejected_qty ({req.rejected_qty}) "
                f"must equal batch quantity ({batch.quantity})"
            )

        batch.approved_qty = req.approved_qty
        batch.rejected_qty = req.rejected_qty
        batch.rejection_reason = req.rejection_reason
        batch.checked_at = datetime.now(timezone.utc)

        # Update assignment checker
        if batch.assignments:
            batch.assignments[0].checker_id = checker_id

        if req.rejected_qty == batch.quantity:
            # Full rejection → back to assigned
            batch.status = "assigned"
        else:
            # Partial or full approval → completed
            batch.status = "completed"
            batch.completed_at = datetime.now(timezone.utc)

            # Create inventory event for approved pieces
            if batch.sku_id and req.approved_qty > 0:
                from app.services.inventory_service import InventoryService
                inv_svc = InventoryService(self.db)
                await inv_svc.create_event(
                    event_type="stock_in",
                    item_type="finished_goods",
                    reference_type="batch",
                    reference_id=batch.id,
                    sku_id=batch.sku_id,
                    quantity=req.approved_qty,
                    performed_by=checker_id,
                    metadata={"batch_code": batch.batch_code},
                )

        await self.db.flush()
        return await self.get_batch(batch_id)

    async def get_batch_qr(self, batch_id: UUID) -> str:
        batch = await self._get_or_404(batch_id)
        if batch.qr_code_data:
            return batch.qr_code_data
        from app.services.qr_service import QRService
        qr = QRService.generate_batch_qr(batch.batch_code)
        batch.qr_code_data = qr
        await self.db.flush()
        return qr

    async def get_batches_for_tailor(self, tailor_id: UUID) -> list:
        """Get batches assigned to a specific tailor."""
        stmt = (
            select(Batch)
            .join(BatchAssignment, BatchAssignment.batch_id == Batch.id)
            .where(
                BatchAssignment.tailor_id == tailor_id,
                Batch.status.in_(["assigned", "in_progress", "submitted"]),
            )
            .options(selectinload(Batch.sku), selectinload(Batch.lot))
        )
        result = await self.db.execute(stmt)
        batches = result.scalars().all()
        return [
            {
                "id": str(b.id),
                "batch_code": b.batch_code,
                "sku": {"id": str(b.sku.id), "sku_code": b.sku.sku_code, "product_name": b.sku.product_name} if b.sku else None,
                "quantity": b.quantity,
                "status": b.status,
                "assigned_at": b.assigned_at.isoformat() if b.assigned_at else None,
            }
            for b in batches
        ]

    async def scan_batch_qr(self, qr_data: str, user) -> dict:
        """Decode QR data and return batch with allowed actions."""
        import json
        try:
            data = json.loads(qr_data)
            batch_code = data.get("batch_code")
        except (json.JSONDecodeError, TypeError):
            batch_code = qr_data

        stmt = (
            select(Batch)
            .where(Batch.batch_code == batch_code)
            .options(selectinload(Batch.sku), selectinload(Batch.lot), selectinload(Batch.assignments))
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch '{batch_code}' not found")

        role = user.role.name if user.role else ""
        allowed = []
        if role == "tailor":
            if batch.status == "assigned":
                allowed.append("start")
            elif batch.status == "in_progress":
                allowed.append("submit")
        elif role == "checker":
            if batch.status == "submitted":
                allowed.append("check")

        return {
            "batch": {
                "id": str(batch.id),
                "batch_code": batch.batch_code,
                "sku": {"id": str(batch.sku.id), "sku_code": batch.sku.sku_code, "product_name": batch.sku.product_name} if batch.sku else None,
                "quantity": batch.quantity,
                "status": batch.status,
                "assigned_at": batch.assigned_at.isoformat() if batch.assigned_at else None,
            },
            "allowed_actions": allowed,
        }

    async def get_pending_checks(self) -> list:
        """Get batches with status=submitted awaiting QC."""
        stmt = (
            select(Batch)
            .where(Batch.status == "submitted")
            .options(
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
            )
        )
        result = await self.db.execute(stmt)
        batches = result.scalars().unique().all()
        return [
            {
                "id": str(b.id),
                "batch_code": b.batch_code,
                "sku": {"id": str(b.sku.id), "sku_code": b.sku.sku_code, "product_name": b.sku.product_name} if b.sku else None,
                "quantity": b.quantity,
                "status": b.status,
                "tailor": {
                    "id": str(b.assignments[0].tailor.id),
                    "full_name": b.assignments[0].tailor.full_name,
                } if b.assignments and b.assignments[0].tailor else None,
                "submitted_at": b.submitted_at.isoformat() if b.submitted_at else None,
            }
            for b in batches
        ]

    async def get_batch_passport(self, batch_code: str) -> dict:
        """Public batch passport — lookup by batch_code (not UUID)."""
        stmt = (
            select(Batch)
            .where(Batch.batch_code == batch_code)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.created_by_user),
            )
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch '{batch_code}' not found")

        resp = self._to_response(batch)
        # Add lot-derived fields for passport display
        if batch.lot:
            resp["design_no"] = batch.lot.design_no
            resp["lot_date"] = batch.lot.lot_date.isoformat() if batch.lot.lot_date else None
            resp["default_size_pattern"] = batch.lot.default_size_pattern
        return resp

    async def claim_batch(self, batch_code: str, tailor_id: UUID) -> dict:
        """Tailor claims an unclaimed batch by scanning its QR."""
        stmt = (
            select(Batch)
            .where(Batch.batch_code == batch_code)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.created_by_user),
            )
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch '{batch_code}' not found")
        if batch.status != "created":
            raise InvalidStateTransitionError(
                f"Cannot claim batch in '{batch.status}' status (must be 'created')"
            )

        assignment = BatchAssignment(
            batch_id=batch.id,
            tailor_id=tailor_id,
            assigned_by=tailor_id,
            assigned_at=datetime.now(timezone.utc),
        )
        self.db.add(assignment)

        batch.status = "assigned"
        batch.assigned_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Reload to get fresh relationships
        return await self.get_batch_passport(batch_code)

    async def _get_or_404(self, batch_id: UUID) -> Batch:
        stmt = (
            select(Batch)
            .where(Batch.id == batch_id)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.created_by_user),
            )
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch {batch_id} not found")
        return batch

    def _to_response(self, b: Batch) -> dict:
        assignment = b.assignments[0] if b.assignments else None
        return {
            "id": str(b.id),
            "batch_code": b.batch_code,
            "size": b.size,
            "lot": {
                "id": str(b.lot.id),
                "lot_code": b.lot.lot_code,
                "design_no": b.lot.design_no,
                "total_pieces": b.lot.total_pieces,
                "status": b.lot.status,
            } if b.lot else None,
            "sku": {
                "id": str(b.sku.id),
                "sku_code": b.sku.sku_code,
                "product_name": b.sku.product_name,
            } if b.sku else None,
            "quantity": b.quantity,
            "piece_count": b.piece_count,
            "color_breakdown": b.color_breakdown,
            "status": b.status,
            "qr_code_data": b.qr_code_data,
            "created_by_user": {
                "id": str(b.created_by_user.id),
                "full_name": b.created_by_user.full_name,
            } if b.created_by_user else None,
            "assignment": {
                "tailor": {
                    "id": str(assignment.tailor.id),
                    "full_name": assignment.tailor.full_name,
                } if assignment.tailor else None,
                "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
            } if assignment else None,
            "rolls_used": [],
            "assigned_at": b.assigned_at.isoformat() if b.assigned_at else None,
            "started_at": b.started_at.isoformat() if b.started_at else None,
            "submitted_at": b.submitted_at.isoformat() if b.submitted_at else None,
            "checked_at": b.checked_at.isoformat() if b.checked_at else None,
            "completed_at": b.completed_at.isoformat() if b.completed_at else None,
            "approved_qty": b.approved_qty,
            "rejected_qty": b.rejected_qty,
            "rejection_reason": b.rejection_reason,
            "notes": b.notes,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
