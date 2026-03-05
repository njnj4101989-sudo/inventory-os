"""Batch service — full lifecycle: create, assign, start, submit, check, pack.

State machine: CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → CHECKED → PACKING → PACKED
Full rejection → back to IN_PROGRESS.
VA guard: cannot submit/pack if BatchProcessing records have status='sent'.
"""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_processing import BatchProcessing
from app.models.batch_roll_consumption import BatchRollConsumption
from app.models.lot import Lot
from app.models.roll import Roll
from app.schemas.batch import (
    BatchCreate,
    BatchAssign,
    BatchCheck,
    BatchPack,
    BatchResponse,
    BatchFilterParams,
)
from app.core.code_generator import next_batch_code
from app.core.exceptions import (
    NotFoundError,
    InvalidStateTransitionError,
    ForbiddenError,
    InsufficientStockError,
    BusinessRuleViolationError,
    ValidationError,
)


class BatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Helpers ---

    def _pending_va_count(self, batch: Batch) -> int:
        """Count pieces currently out for VA (status='sent')."""
        if not hasattr(batch, "processing_logs") or not batch.processing_logs:
            return 0
        return sum(
            bp.pieces_sent for bp in batch.processing_logs if bp.status == "sent"
        )

    def _check_va_guard(self, batch: Batch, action: str) -> None:
        """Raise if any BatchProcessing has status='sent'."""
        pending = self._pending_va_count(batch)
        if pending > 0:
            raise BusinessRuleViolationError(
                f"Cannot {action} — {pending} pieces still at VA vendor"
            )

    # --- CRUD ---

    async def get_batches(self, params: BatchFilterParams) -> dict:
        conditions = []
        if params.status:
            conditions.append(Batch.status == params.status)
        if params.lot_id:
            conditions.append(Batch.lot_id == params.lot_id)
        if params.sku_id:
            conditions.append(Batch.sku_id == params.sku_id)
        if params.size:
            conditions.append(Batch.size == params.size)

        # Location filter: SQL subquery instead of fetch-all-then-filter
        if params.location and params.location in ("in_house", "out_house"):
            out_house_ids = (
                select(BatchProcessing.batch_id)
                .where(BatchProcessing.status == "sent")
                .distinct()
            )
            if params.location == "out_house":
                conditions.append(Batch.id.in_(out_house_ids))
            else:
                conditions.append(~Batch.id.in_(out_house_ids))

        count_stmt = select(func.count()).select_from(Batch)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
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
                selectinload(Batch.checked_by_user),
                selectinload(Batch.packed_by_user),
                selectinload(Batch.processing_logs).selectinload(BatchProcessing.value_addition),
                selectinload(Batch.processing_logs).selectinload(BatchProcessing.batch_challan),
            )
            .order_by(order)
        )
        if conditions:
            stmt = stmt.where(*conditions)

        stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
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

    async def update_batch(self, batch_id: UUID, req) -> dict:
        """Update editable fields (notes) on a batch."""
        batch = await self._get_or_404(batch_id)
        if req.notes is not None:
            batch.notes = req.notes
        await self.db.commit()
        await self.db.refresh(batch)
        return self._to_response(batch)

    async def create_batch(self, req: BatchCreate, created_by: UUID) -> dict:
        batch_code = await next_batch_code(self.db)

        lot_stmt = select(Lot).where(Lot.id == req.lot_id)
        lot_result = await self.db.execute(lot_stmt)
        lot = lot_result.scalar_one_or_none()
        if not lot:
            raise NotFoundError(f"Lot {req.lot_id} not found")
        if lot.status not in ("open", "cutting"):
            raise InvalidStateTransitionError(
                f"Lot {lot.lot_code} is in '{lot.status}' status, cannot create batch"
            )

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

        if lot.status == "open":
            lot.status = "cutting"
            await self.db.flush()

        from app.services.qr_service import QRService

        batch.qr_code_data = QRService.generate_batch_qr(batch_code)
        await self.db.flush()

        return await self.get_batch(batch.id)

    # --- State Transitions ---

    async def assign_batch(self, batch_id: UUID, req: BatchAssign) -> dict:
        batch = await self._get_or_404(batch_id)
        if batch.status != "created":
            raise InvalidStateTransitionError(
                f"Cannot assign batch in '{batch.status}' status (expected 'created')"
            )

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
            raise InvalidStateTransitionError(
                f"Cannot start batch in '{batch.status}' status (expected 'assigned')"
            )

        assignment = batch.assignments[0] if batch.assignments else None
        if assignment and assignment.tailor_id != user_id:
            raise ForbiddenError("Only the assigned tailor can start this batch")

        batch.status = "in_progress"
        batch.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def submit_batch(self, batch_id: UUID, user_id: UUID) -> dict:
        """Tailor submits — BLOCKED if VA pending."""
        batch = await self._get_or_404(batch_id)
        if batch.status != "in_progress":
            raise InvalidStateTransitionError(
                f"Cannot submit batch in '{batch.status}' status (expected 'in_progress')"
            )

        assignment = batch.assignments[0] if batch.assignments else None
        if assignment and assignment.tailor_id != user_id:
            raise ForbiddenError("Only the assigned tailor can submit this batch")

        # VA guard
        self._check_va_guard(batch, "submit")

        batch.status = "submitted"
        batch.submitted_at = datetime.now(timezone.utc)
        await self.db.flush()

        from app.core.event_bus import event_bus
        await event_bus.emit("batch_submitted", {
            "batch_code": batch.batch_code,
        }, str(user_id))

        return await self.get_batch(batch_id)

    async def check_batch(self, batch_id: UUID, req: BatchCheck, checker_id: UUID) -> dict:
        """QC check — approved → 'checked', full reject → 'in_progress' (rework).

        Per-color mode: color_qc dict with per-color approved/rejected/reason.
        Legacy flat mode: approved_qty + rejected_qty directly.
        """
        batch = await self._get_or_404(batch_id)
        if batch.status != "submitted":
            raise InvalidStateTransitionError(
                f"Cannot check batch in '{batch.status}' status (expected 'submitted')"
            )

        if req.color_qc:
            # Per-color QC mode
            batch.color_qc = req.color_qc
            batch.approved_qty = sum(c.get("approved", 0) for c in req.color_qc.values())
            batch.rejected_qty = sum(c.get("rejected", 0) for c in req.color_qc.values())
            reasons = [
                f"{color}: {c['reason']}"
                for color, c in req.color_qc.items()
                if c.get("reason")
            ]
            batch.rejection_reason = "; ".join(reasons) if reasons else None
        else:
            # Legacy flat mode (backward compatible)
            batch.approved_qty = req.approved_qty
            batch.rejected_qty = req.rejected_qty
            batch.rejection_reason = req.rejection_reason

        total_check = (batch.approved_qty or 0) + (batch.rejected_qty or 0)
        if total_check != batch.quantity:
            raise ValidationError(
                f"approved_qty ({batch.approved_qty}) + rejected_qty ({batch.rejected_qty}) "
                f"must equal batch quantity ({batch.quantity})"
            )

        batch.checked_at = datetime.now(timezone.utc)
        batch.checked_by = checker_id

        if batch.assignments:
            batch.assignments[0].checker_id = checker_id

        if batch.rejected_qty == batch.quantity:
            # Full rejection → back to in_progress for rework
            batch.status = "in_progress"
        else:
            # Partial or full approval → checked (NOT packed yet)
            batch.status = "checked"
            batch.completed_at = datetime.now(timezone.utc)

        await self.db.flush()

        from app.core.event_bus import event_bus
        await event_bus.emit("batch_checked", {
            "batch_code": batch.batch_code,
            "approved": batch.approved_qty,
            "rejected": batch.rejected_qty,
            "status": batch.status,
        }, str(checker_id))

        return await self.get_batch(batch_id)

    async def ready_for_packing(self, batch_id: UUID, checker_id: UUID) -> dict:
        """Checker marks batch ready for packing — BLOCKED if VA pending."""
        batch = await self._get_or_404(batch_id)
        if batch.status != "checked":
            raise InvalidStateTransitionError(
                f"Cannot mark ready-for-packing in '{batch.status}' status (expected 'checked')"
            )

        # VA guard
        self._check_va_guard(batch, "mark ready for packing")

        batch.status = "packing"
        await self.db.flush()

        return await self.get_batch(batch_id)

    async def pack_batch(self, batch_id: UUID, req: BatchPack, packer_id: UUID) -> dict:
        """Supervisor confirms packed — auto-generates per-color SKUs + inventory events."""
        batch = await self._get_or_404(batch_id)
        if batch.status != "packing":
            raise InvalidStateTransitionError(
                f"Cannot pack batch in '{batch.status}' status (expected 'packing')"
            )

        batch.status = "packed"
        batch.packed_by = packer_id
        batch.packed_at = datetime.now(timezone.utc)
        batch.pack_reference = req.pack_reference
        await self.db.flush()

        # Compute VA codes from received processing logs
        va_codes = sorted([
            log.value_addition.short_code
            for log in (batch.processing_logs or [])
            if log.status == "received" and log.value_addition and log.value_addition.short_code
        ])
        va_suffix = "+" + "+".join(va_codes) if va_codes else ""

        lot = batch.lot

        if batch.color_qc and lot:
            # Per-color SKU generation
            from app.services.sku_service import SKUService
            from app.services.inventory_service import InventoryService

            sku_svc = SKUService(self.db)
            inv_svc = InventoryService(self.db)
            product_type = lot.product_type or "BLS"
            design_no = lot.design_no

            # VA names for product_name
            va_names = sorted([
                log.value_addition.name
                for log in (batch.processing_logs or [])
                if log.status == "received" and log.value_addition
            ])

            for color, qc in batch.color_qc.items():
                approved = qc.get("approved", 0)
                if approved <= 0:
                    continue

                sku_code = f"{product_type}-{design_no}-{color}-{batch.size or 'Free'}{va_suffix}"
                product_name = f"Design {design_no} {color} {batch.size or 'Free'}"
                if va_names:
                    product_name += " + " + " + ".join(va_names)

                sku = await sku_svc.find_or_create(
                    sku_code, product_type, product_name, color, batch.size or "Free"
                )
                await inv_svc.create_event(
                    event_type="ready_stock_in",
                    item_type="finished_goods",
                    reference_type="batch",
                    reference_id=batch.id,
                    sku_id=sku.id,
                    quantity=approved,
                    performed_by=packer_id,
                    metadata={
                        "batch_code": batch.batch_code,
                        "color": color,
                        "pack_reference": req.pack_reference or "N/A",
                    },
                )

            await self.db.flush()

        elif batch.sku_id and batch.approved_qty and batch.approved_qty > 0:
            # Legacy: single SKU (backward compatible)
            from app.services.inventory_service import InventoryService

            inv_svc = InventoryService(self.db)
            await inv_svc.create_event(
                event_type="ready_stock_in",
                item_type="finished_goods",
                reference_type="batch",
                reference_id=batch.id,
                sku_id=batch.sku_id,
                quantity=batch.approved_qty,
                performed_by=packer_id,
                metadata={
                    "batch_code": batch.batch_code,
                    "pack_reference": req.pack_reference or "N/A",
                },
            )
            await self.db.flush()

        from app.core.event_bus import event_bus
        await event_bus.emit("batch_packed", {
            "batch_code": batch.batch_code,
        }, str(packer_id))

        return await self.get_batch(batch_id)

    # --- QR / Scan ---

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
                "sku": {
                    "id": str(b.sku.id),
                    "sku_code": b.sku.sku_code,
                    "product_name": b.sku.product_name,
                }
                if b.sku
                else None,
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
            .options(
                selectinload(Batch.sku),
                selectinload(Batch.lot),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.processing_logs).selectinload(BatchProcessing.value_addition),
            )
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch '{batch_code}' not found")

        role = user.role.name if user.role else ""
        allowed = []
        has_pending = self._pending_va_count(batch) > 0
        if role == "tailor":
            if batch.status == "assigned":
                allowed.append("start")
            elif batch.status == "in_progress" and not has_pending:
                allowed.append("submit")
        elif role == "checker":
            if batch.status == "submitted":
                allowed.append("check")
            elif batch.status == "checked" and not has_pending:
                allowed.append("ready_for_packing")
        elif role in ("supervisor", "admin"):
            if batch.status in ("in_progress", "checked"):
                allowed.append("send_for_va")
            if batch.status == "packing":
                allowed.append("pack")

        return {
            "batch": {
                "id": str(batch.id),
                "batch_code": batch.batch_code,
                "sku": {
                    "id": str(batch.sku.id),
                    "sku_code": batch.sku.sku_code,
                    "product_name": batch.sku.product_name,
                }
                if batch.sku
                else None,
                "quantity": batch.quantity,
                "status": batch.status,
                "has_pending_va": has_pending,
                "assigned_at": batch.assigned_at.isoformat()
                if batch.assigned_at
                else None,
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
                selectinload(Batch.lot),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
            )
        )
        result = await self.db.execute(stmt)
        batches = result.scalars().unique().all()
        return [
            {
                "id": str(b.id),
                "batch_code": b.batch_code,
                "size": b.size,
                "piece_count": b.quantity,
                "quantity": b.quantity,
                "status": b.status,
                "sku": {
                    "id": str(b.sku.id),
                    "sku_code": b.sku.sku_code,
                    "product_name": b.sku.product_name,
                }
                if b.sku
                else None,
                "lot": {
                    "lot_code": b.lot.lot_code,
                    "design_no": b.lot.design_no,
                }
                if b.lot
                else None,
                "tailor": {
                    "id": str(b.assignments[0].tailor.id),
                    "full_name": b.assignments[0].tailor.full_name,
                }
                if b.assignments and b.assignments[0].tailor
                else None,
                "submitted_at": b.submitted_at.isoformat()
                if b.submitted_at
                else None,
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
                selectinload(Batch.checked_by_user),
                selectinload(Batch.packed_by_user),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.value_addition
                ),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.batch_challan
                ),
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
            resp["lot_date"] = (
                batch.lot.lot_date.isoformat() if batch.lot.lot_date else None
            )
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

        from app.core.event_bus import event_bus
        await event_bus.emit("batch_claimed", {
            "batch_code": batch.batch_code,
        }, str(tailor_id))

        return await self.get_batch_passport(batch_code)

    # --- Internal ---

    async def _get_or_404(self, batch_id: UUID) -> Batch:
        stmt = (
            select(Batch)
            .where(Batch.id == batch_id)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.sku),
                selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                selectinload(Batch.created_by_user),
                selectinload(Batch.checked_by_user),
                selectinload(Batch.packed_by_user),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.value_addition
                ),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.batch_challan
                ),
            )
        )
        result = await self.db.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch {batch_id} not found")
        return batch

    def _to_response(self, b: Batch) -> dict:
        assignment = b.assignments[0] if b.assignments else None

        # Build processing_logs for response
        processing_logs = []
        for bp in (b.processing_logs or []):
            va = bp.value_addition
            challan = bp.batch_challan
            processing_logs.append({
                "id": str(bp.id),
                "batch_challan_id": str(bp.batch_challan_id),
                "challan_no": challan.challan_no if challan else None,
                "value_addition": {
                    "id": str(va.id),
                    "name": va.name,
                    "short_code": va.short_code,
                } if va else None,
                "processor_name": challan.processor_name if challan else None,
                "pieces_sent": bp.pieces_sent,
                "pieces_received": bp.pieces_received,
                "cost": float(bp.cost) if bp.cost else None,
                "status": bp.status,
                "phase": bp.phase,
                "sent_date": challan.sent_date.isoformat() if challan and challan.sent_date else None,
                "received_date": challan.received_date.isoformat() if challan and challan.received_date else None,
                "notes": bp.notes,
            })

        has_pending_va = any(bp.status == "sent" for bp in (b.processing_logs or []))

        return {
            "id": str(b.id),
            "batch_code": b.batch_code,
            "size": b.size,
            "lot": {
                "id": str(b.lot.id),
                "lot_code": b.lot.lot_code,
                "design_no": b.lot.design_no,
                "product_type": b.lot.product_type or "BLS",
                "total_pieces": b.lot.total_pieces,
                "status": b.lot.status,
            }
            if b.lot
            else None,
            "sku": {
                "id": str(b.sku.id),
                "sku_code": b.sku.sku_code,
                "product_name": b.sku.product_name,
            }
            if b.sku
            else None,
            "quantity": b.quantity,
            "piece_count": b.piece_count,
            "color_breakdown": b.color_breakdown,
            "status": b.status,
            "qr_code_data": b.qr_code_data,
            "has_pending_va": has_pending_va,
            "processing_logs": processing_logs,
            "created_by_user": {
                "id": str(b.created_by_user.id),
                "full_name": b.created_by_user.full_name,
            }
            if b.created_by_user
            else None,
            "assignment": {
                "tailor": {
                    "id": str(assignment.tailor.id),
                    "full_name": assignment.tailor.full_name,
                }
                if assignment.tailor
                else None,
                "assigned_at": assignment.assigned_at.isoformat()
                if assignment.assigned_at
                else None,
            }
            if assignment
            else None,
            "checked_by": {
                "id": str(b.checked_by_user.id),
                "full_name": b.checked_by_user.full_name,
            }
            if b.checked_by_user
            else None,
            "packed_by": {
                "id": str(b.packed_by_user.id),
                "full_name": b.packed_by_user.full_name,
            }
            if b.packed_by_user
            else None,
            "packed_at": b.packed_at.isoformat() if b.packed_at else None,
            "pack_reference": b.pack_reference,
            "color_qc": b.color_qc,
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
