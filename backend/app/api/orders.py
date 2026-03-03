"""Order routes — lifecycle: create, ship, cancel, return."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.order import OrderCreate, OrderFilterParams, ReturnRequest
from app.services.order_service import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("", response_model=None)
async def list_orders(
    params: OrderFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """List orders with pagination. Filters: status, source, search."""
    svc = OrderService(db)
    result = await svc.get_orders(params)
    return {"success": True, **result}


@router.get("/{order_id}", response_model=None)
async def get_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Get single order by ID."""
    svc = OrderService(db)
    result = await svc.get_order(order_id)
    return {"success": True, "data": result}


@router.post("", response_model=None, status_code=201)
async def create_order(
    req: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Create order + reserve stock. Auto-generates order_number."""
    svc = OrderService(db)
    result = await svc.create_order(req, current_user.id)
    return {"success": True, "data": result}


@router.post("/{order_id}/ship", response_model=None)
async def ship_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Ship order → confirm reservations + STOCK_OUT events + auto-invoice."""
    svc = OrderService(db)
    result = await svc.ship_order(order_id, current_user.id)
    return {"success": True, "data": result}


@router.post("/{order_id}/cancel", response_model=None)
async def cancel_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Cancel order → release all reservations."""
    svc = OrderService(db)
    result = await svc.cancel_order(order_id, current_user.id)
    return {"success": True, "data": result}


@router.post("/{order_id}/return", response_model=None)
async def return_order(
    order_id: UUID,
    req: ReturnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Process return → RETURN inventory events."""
    svc = OrderService(db)
    result = await svc.return_order(order_id, req, current_user.id)
    return {"success": True, "data": result}
