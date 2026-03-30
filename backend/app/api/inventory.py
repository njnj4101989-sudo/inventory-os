"""Inventory routes — stock levels, event history, adjustments, reconciliation, verification."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_fy_id, require_permission, require_role
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.inventory import AdjustRequest, InventoryFilterParams, OpeningStockRequest
from app.schemas.stock_verification import CreateVerificationRequest, UpdateCountsRequest
from app.services.inventory_service import InventoryService
from app.services.stock_verification_service import StockVerificationService

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


@router.post("/opening-stock", response_model=None, status_code=201)
async def opening_stock(
    req: OpeningStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Bulk opening stock entry for Day 1 setup. Creates opening_stock events."""
    if not req.items:
        return {"success": False, "detail": "No items provided"}
    svc = InventoryService(db)
    result = await svc.create_opening_stock(req.items, current_user.id)
    return {"success": True, "data": result, "message": result["message"]}


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


# ── Stock Verification (Physical Count) ────────────────────

@router.get("/verifications", response_model=None)
async def list_verifications(
    verification_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List all stock verifications."""
    svc = StockVerificationService(db)
    result = await svc.list_verifications(verification_type)
    return {"success": True, "data": result}


@router.post("/verifications", response_model=None, status_code=201)
async def create_verification(
    req: CreateVerificationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Create a new stock verification — auto-populates items from current stock."""
    fy_id = get_fy_id(current_user)
    svc = StockVerificationService(db)
    result = await svc.create(req.verification_type, fy_id, current_user.id, req.notes)
    return {"success": True, "data": result}


@router.get("/verifications/{verification_id}", response_model=None)
async def get_verification(
    verification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Get verification detail with all items."""
    svc = StockVerificationService(db)
    result = await svc.get_verification(verification_id)
    return {"success": True, "data": result}


@router.post("/verifications/{verification_id}/counts", response_model=None)
async def update_counts(
    verification_id: UUID,
    req: UpdateCountsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Enter physical quantities for verification items."""
    svc = StockVerificationService(db)
    counts = [{"item_id": c.item_id, "physical_qty": c.physical_qty, "notes": c.notes} for c in req.counts]
    result = await svc.update_counts(verification_id, counts)
    return {"success": True, "data": result}


@router.post("/verifications/{verification_id}/complete", response_model=None)
async def complete_verification(
    verification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Mark verification as complete (lock for review)."""
    svc = StockVerificationService(db)
    result = await svc.complete(verification_id)
    return {"success": True, "data": result}


@router.post("/verifications/{verification_id}/approve", response_model=None)
async def approve_verification(
    verification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_role("admin"),
):
    """Approve verification and create adjustment events. Admin only."""
    svc = StockVerificationService(db)
    result = await svc.approve(verification_id, current_user.id)
    return {"success": True, "data": result}
