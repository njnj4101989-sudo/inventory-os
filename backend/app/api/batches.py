"""Batch routes — full lifecycle: create, assign, start, submit, check, QR."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.batch import BatchCreate, BatchAssign, BatchCheck
from app.services.batch_service import BatchService

router = APIRouter(prefix="/batches", tags=["Batches"])


# ── Public routes (MUST be before /{batch_id} to avoid UUID parsing) ──

@router.get("/passport/{batch_code}", response_model=None)
async def get_batch_passport(
    batch_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Public batch passport — no auth required. Workers scan QR to view batch info."""
    svc = BatchService(db)
    result = await svc.get_batch_passport(batch_code)
    return {"success": True, "data": result}


@router.post("/claim/{batch_code}", response_model=None)
async def claim_batch(
    batch_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_start"),
):
    """Tailor claims unclaimed batch (CREATED → ASSIGNED)."""
    svc = BatchService(db)
    result = await svc.claim_batch(batch_code, current_user.id)
    return {"success": True, "data": result}


@router.get("", response_model=None)
async def list_batches(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List batches with pagination. Filters: status, sku_id, created_by."""
    svc = BatchService(db)
    result = await svc.get_batches(params)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_batch(
    req: BatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_create"),
):
    """Create batch + cut from rolls. Auto-generates batch_code + QR + STOCK_OUT events."""
    svc = BatchService(db)
    result = await svc.create_batch(req, current_user.id)
    return {"success": True, "data": result}


@router.post("/{batch_id}/assign", response_model=None)
async def assign_batch(
    batch_id: UUID,
    req: BatchAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_assign"),
):
    """Assign batch to tailor (CREATED → ASSIGNED)."""
    svc = BatchService(db)
    result = await svc.assign_batch(batch_id, req)
    return {"success": True, "data": result}


@router.post("/{batch_id}/start", response_model=None)
async def start_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_start"),
):
    """Tailor starts work (ASSIGNED → IN_PROGRESS)."""
    svc = BatchService(db)
    result = await svc.start_batch(batch_id, current_user.id)
    return {"success": True, "data": result}


@router.post("/{batch_id}/submit", response_model=None)
async def submit_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_submit"),
):
    """Tailor submits completed work (IN_PROGRESS → SUBMITTED)."""
    svc = BatchService(db)
    result = await svc.submit_batch(batch_id, current_user.id)
    return {"success": True, "data": result}


@router.post("/{batch_id}/check", response_model=None)
async def check_batch(
    batch_id: UUID,
    req: BatchCheck,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_check"),
):
    """QC check (SUBMITTED → COMPLETED or back to ASSIGNED on full reject)."""
    svc = BatchService(db)
    result = await svc.check_batch(batch_id, req, current_user.id)
    return {"success": True, "data": result}


@router.get("/{batch_id}/qr", response_model=None)
async def get_batch_qr(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_create"),
):
    """Get QR code data for a batch."""
    svc = BatchService(db)
    result = await svc.get_batch_qr(batch_id)
    return {"success": True, "data": result}
