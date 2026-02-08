"""Batch service — full lifecycle: create, assign, start, submit, check.

State machine: CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → COMPLETED
Full rejection → back to ASSIGNED.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_roll_consumption import BatchRollConsumption
from app.models.roll import Roll
from app.schemas.batch import BatchCreate, BatchAssign, BatchCheck, BatchResponse
from app.schemas import PaginatedParams


class BatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_batches(self, params: PaginatedParams) -> dict:
        """List batches with pagination + filters (status, sku_id). Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_batch(self, batch_id: UUID) -> BatchResponse:
        """Get single batch with SKU, assignment, rolls_used. Raises NotFoundError."""
        raise NotImplementedError

    async def create_batch(self, req: BatchCreate, created_by: UUID) -> dict:
        """Create batch from a lot (assigns pieces from lot to tailor).

        Steps:
        1. Generate next_batch_code via core/code_generator
        2. Validate lot exists, is in 'open' or 'cutting' status
        3. Validate piece_count doesn't exceed lot's remaining pieces
        4. Create Batch record (status=CREATED, lot_id, piece_count, color_breakdown)
        5. Generate QR code via qr_service
        6. Return {batch: BatchResponse}
        Raises: NotFoundError (lot/sku), InsufficientStockError.
        """
        raise NotImplementedError

    async def assign_batch(self, batch_id: UUID, req: BatchAssign) -> BatchResponse:
        """Assign batch to tailor (CREATED → ASSIGNED).

        Creates BatchAssignment record, updates status + assigned_at.
        Raises: NotFoundError, InvalidStateTransitionError, AlreadyAssignedError.
        """
        raise NotImplementedError

    async def start_batch(self, batch_id: UUID, user_id: UUID) -> BatchResponse:
        """Tailor starts work (ASSIGNED → IN_PROGRESS).

        Updates status + started_at. Only the assigned tailor can start.
        Raises: NotFoundError, InvalidStateTransitionError, ForbiddenError.
        """
        raise NotImplementedError

    async def submit_batch(self, batch_id: UUID, user_id: UUID) -> BatchResponse:
        """Tailor submits completed work (IN_PROGRESS → SUBMITTED).

        Updates status + submitted_at. Only the assigned tailor can submit.
        Raises: NotFoundError, InvalidStateTransitionError, ForbiddenError.
        """
        raise NotImplementedError

    async def check_batch(self, batch_id: UUID, req: BatchCheck, checker_id: UUID) -> dict:
        """QC check (SUBMITTED → COMPLETED or SUBMITTED → ASSIGNED on full reject).

        Steps:
        1. Validate approved_qty + rejected_qty == batch.quantity
        2. Update batch fields (approved_qty, rejected_qty, rejection_reason)
        3. If rejected_qty == quantity: status → ASSIGNED (back to tailor)
        4. Else: status → COMPLETED, create STOCK_IN event for finished_goods
        5. Update checked_at / completed_at timestamps
        6. Return {batch: BatchResponse, event: EventResponse | None}
        Raises: NotFoundError, InvalidStateTransitionError, ValidationError.
        """
        raise NotImplementedError

    async def get_batch_qr(self, batch_id: UUID) -> str:
        """Get QR code data for a batch. Raises NotFoundError."""
        raise NotImplementedError
