"""Order routes — lifecycle: create, edit, ship, cancel."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.schemas.order import OrderCancelRequest, OrderCreate, OrderFilterParams, OrderUpdate, ShipOrderRequest, UpdateShippingRequest
from app.services.order_service import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("", response_model=None)
async def list_orders(
    params: OrderFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """List orders with pagination. Filters: status, source, search."""
    fy_id = get_fy_id(current_user)
    svc = OrderService(db)
    result = await svc.get_orders(params, fy_id)
    return {"success": True, **result}


@router.get("/next-number", response_model=None)
async def next_number(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Preview next order number."""
    from app.core.code_generator import next_order_number
    fy_id = get_fy_id(current_user)
    number = await next_order_number(db, fy_id)
    return {"success": True, "data": {"next_number": number}}


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
    fy_id = get_fy_id(current_user)
    svc = OrderService(db)
    result = await svc.create_order(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.post("/{order_id}/ship", response_model=None)
async def ship_order(
    order_id: UUID,
    req: ShipOrderRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Ship order → confirm reservations + STOCK_OUT events + auto-invoice."""
    fy_id = get_fy_id(current_user)
    svc = OrderService(db)
    result = await svc.ship_order(order_id, current_user.id, fy_id, ship_data=req)
    return {"success": True, "data": result}


@router.patch("/{order_id}/shipping", response_model=None)
async def update_shipping(
    order_id: UUID,
    req: UpdateShippingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Update transport/LR/eway bill on shipped order."""
    svc = OrderService(db)
    result = await svc.update_shipping(order_id, req)
    return {"success": True, "data": result}


@router.patch("/{order_id}", response_model=None)
async def update_order(
    order_id: UUID,
    req: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Edit order — header fields and/or items. Only pending/processing."""
    svc = OrderService(db)
    result = await svc.update_order(order_id, req, current_user.id)
    return {"success": True, "data": result}


@router.post("/{order_id}/cancel", response_model=None)
async def cancel_order(
    order_id: UUID,
    req: OrderCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Cancel an order with a required reason + optional notes (S120).

    Releases all active reservations and cascades cancel to any draft/issued
    invoices linked to this order. Audit columns (cancel_reason / cancel_notes
    / cancelled_at / cancelled_by) are populated for the GST-style trail.
    """
    svc = OrderService(db)
    result = await svc.cancel_order(order_id, req, current_user.id)
    return {"success": True, "data": result}


