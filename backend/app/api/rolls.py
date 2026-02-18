"""Roll routes — stock-in, listing, detail with consumption history."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.roll import RollCreate, RollUpdate, RollFilterParams, SendForProcessing, ReceiveFromProcessing, UpdateProcessingLog
from app.services.roll_service import RollService

router = APIRouter(prefix="/rolls", tags=["Rolls"])


@router.get("", response_model=None)
async def list_rolls(
    params: RollFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """List rolls with pagination. Filters: fabric_type, color, has_remaining, supplier_id."""
    svc = RollService(db)
    result = await svc.get_rolls(params)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def stock_in(
    req: RollCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Register a new roll (stock-in). Auto-generates roll_code + STOCK_IN event."""
    svc = RollService(db)
    result = await svc.stock_in(req, current_user.id)
    return {"success": True, "data": result}


@router.patch("/{roll_id}", response_model=None)
async def update_roll(
    roll_id: UUID,
    req: RollUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Update an unused roll (all fields optional, only unused rolls editable)."""
    svc = RollService(db)
    result = await svc.update_roll(roll_id, req)
    return {"success": True, "data": result}


@router.get("/{roll_code}/passport", response_model=None)
async def get_roll_passport(
    roll_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Public roll passport — no auth required. Used for QR scan on factory floor."""
    svc = RollService(db)
    result = await svc.get_roll_passport(roll_code)
    return {"success": True, "data": result}


@router.get("/{roll_id}", response_model=None)
async def get_roll(
    roll_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Get roll detail with consumption history."""
    svc = RollService(db)
    result = await svc.get_roll(roll_id)
    return {"success": True, "data": result}


@router.post("/{roll_id}/processing", response_model=None, status_code=201)
async def send_for_processing(
    roll_id: UUID,
    req: SendForProcessing,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Send an in-stock roll for external processing (embroidery, dyeing, etc.)."""
    svc = RollService(db)
    result = await svc.send_for_processing(roll_id, req)
    return {"success": True, "data": result}


@router.patch("/{roll_id}/processing/{processing_id}", response_model=None)
async def receive_from_processing(
    roll_id: UUID,
    processing_id: UUID,
    req: ReceiveFromProcessing,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Mark a processing log as received with updated measurements."""
    svc = RollService(db)
    result = await svc.receive_from_processing(roll_id, processing_id, req)
    return {"success": True, "data": result}


@router.patch("/{roll_id}/processing/{processing_id}/edit", response_model=None)
async def update_processing_log(
    roll_id: UUID,
    processing_id: UUID,
    req: UpdateProcessingLog,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Edit a processing log — update cost, vendor, dates, notes, etc."""
    svc = RollService(db)
    result = await svc.update_processing_log(roll_id, processing_id, req)
    return {"success": True, "data": result}
