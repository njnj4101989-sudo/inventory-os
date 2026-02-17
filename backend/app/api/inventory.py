"""Inventory routes — stock levels, event history, adjustments, reconciliation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, require_role
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.inventory import AdjustRequest, InventoryFilterParams
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("", response_model=None)
async def list_inventory(
    params: InventoryFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List all SKU stock levels. Filters: sku_code, product_type, stock_status."""
    svc = InventoryService(db)
    result = await svc.get_inventory(params)
    return {"success": True, **result}


@router.get("/{sku_id}/events", response_model=None)
async def list_events(
    sku_id: UUID,
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Get inventory event history for a SKU. Filters: event_type."""
    svc = InventoryService(db)
    result = await svc.get_events(sku_id, params)
    return {"success": True, **result}


@router.post("/adjust", response_model=None, status_code=201)
async def adjust_inventory(
    req: AdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Manual stock adjustment (loss, correction)."""
    svc = InventoryService(db)
    result = await svc.adjust_inventory(req, current_user.id)
    return {"success": True, "data": result}


@router.post("/reconcile", response_model=None)
async def reconcile(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_role("admin"),
):
    """Recompute all inventory states from event stream. Admin only."""
    svc = InventoryService(db)
    result = await svc.reconcile()
    return {"success": True, "data": result}
