"""Roll routes — stock-in, listing, detail with consumption history."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.roll import RollCreate
from app.services.roll_service import RollService

router = APIRouter(prefix="/rolls", tags=["Rolls"])


@router.get("", response_model=None)
async def list_rolls(
    params: PaginatedParams = Depends(),
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
