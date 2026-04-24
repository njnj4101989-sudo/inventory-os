"""Lot routes — create, list, detail, update, manage rolls in lot."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.schemas.lot import LotCreate, LotFilterParams, LotUpdate, LotRollUpdate
from app.services.lot_service import LotService

router = APIRouter(prefix="/lots", tags=["Lots"])


@router.get("", response_model=None)
async def list_lots(
    params: LotFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """List lots with pagination. Filters: status, sku_id."""
    fy_id = get_fy_id(current_user)
    svc = LotService(db)
    result = await svc.get_lots(params, fy_id)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_lot(
    req: LotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """Create lot with rolls. Auto-calculates pallas and pieces."""
    fy_id = get_fy_id(current_user)
    svc = LotService(db)
    result = await svc.create_lot(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.get("/{lot_id}", response_model=None)
async def get_lot(
    lot_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """Get lot detail with rolls and calculations."""
    svc = LotService(db)
    result = await svc.get_lot(lot_id)
    return {"success": True, "data": result}


@router.post("/{lot_id}/distribute", response_model=None, status_code=201)
async def distribute_lot(
    lot_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """Distribute cutting lot — auto-creates batches from size pattern."""
    fy_id = get_fy_id(current_user)
    svc = LotService(db)
    result = await svc.distribute_lot(lot_id, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.patch("/{lot_id}", response_model=None)
async def update_lot(
    lot_id: UUID,
    req: LotUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """Update lot metadata or status."""
    svc = LotService(db)
    result = await svc.update_lot(lot_id, req)
    return {"success": True, "data": result}


@router.patch("/{lot_id}/rolls/{lot_roll_id}", response_model=None)
async def update_lot_roll(
    lot_id: UUID,
    lot_roll_id: UUID,
    req: LotRollUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("lot_manage"),
):
    """Override num_pallas on a lot-roll. Lot must be in 'open' status."""
    svc = LotService(db)
    result = await svc.update_lot_roll(lot_id, lot_roll_id, req)
    return {"success": True, "data": result}
