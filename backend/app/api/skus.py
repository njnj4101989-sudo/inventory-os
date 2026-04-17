"""SKU routes — product CRUD with auto-code generation."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_fy_id, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.sku import SKUCreate, SKUUpdate, PurchaseStockRequest, SKUOpeningStockRequest, SKUFilterParams
from app.services.sku_service import SKUService

router = APIRouter(prefix="/skus", tags=["SKUs"])


# --- Purchase stock routes MUST be before /{sku_id} to avoid UUID parse ---


@router.post("/purchase-stock", response_model=None, status_code=201)
async def purchase_stock(
    req: PurchaseStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Purchase finished goods: create invoice + SKUs + inventory events."""
    fy_id = get_fy_id(current_user)
    svc = SKUService(db)
    result = await svc.purchase_stock(req, current_user.id, fy_id)
    return {"success": True, "data": result, "message": f"{len(req.line_items)} items stocked in"}


@router.post("/opening-stock", response_model=None, status_code=201)
async def sku_opening_stock(
    req: SKUOpeningStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_adjust"),
):
    """Bulk opening stock: find/create SKUs + create opening_stock events."""
    svc = SKUService(db)
    result = await svc.create_opening_stock(req, current_user.id)
    return {"success": True, "data": result, "message": result["message"]}


@router.get("/purchase-invoices", response_model=None)
async def list_purchase_invoices(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List purchase invoices for finished goods."""
    fy_id = get_fy_id(current_user)
    svc = SKUService(db)
    result = await svc.get_purchase_invoices(params, fy_id)
    return {"success": True, **result}


@router.get("", response_model=None)
async def list_skus(
    params: SKUFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List SKUs with stock levels. Filters: product_type, is_active, search."""
    svc = SKUService(db)
    result = await svc.get_skus(params)
    return {"success": True, **result}


@router.get("/passport/{sku_code:path}", response_model=None)
async def get_sku_passport(
    sku_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SKU passport — any authenticated user can view. Full chain traceability."""
    svc = SKUService(db)
    result = await svc.get_sku_passport(sku_code)
    return {"success": True, "data": result}


@router.get("/by-code/{sku_code:path}", response_model=None)
async def get_sku_by_code(
    sku_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Lookup SKU by code — for sales return form auto-fill."""
    svc = SKUService(db)
    result = await svc.get_sku_by_code(sku_code)
    return {"success": True, "data": result}


@router.post("/stock-check", response_model=None)
async def stock_check(
    sku_ids: List[UUID] = Body(...),
    order_id: UUID | None = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Bulk stock check — returns {sku_id: available_qty} map. If order_id provided, includes that order's reservations as available."""
    svc = SKUService(db)
    result = await svc.stock_check(sku_ids, order_id)
    return {"success": True, "data": result}


@router.get("/grouped", response_model=None)
async def list_skus_grouped(
    params: SKUFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List SKUs grouped by design — N design rows per page, nested SKUs inside each group.
    Filters: search, product_type, is_active, stock_status (in_stock/out_of_stock)."""
    svc = SKUService(db)
    result = await svc.list_skus_grouped(params)
    return {"success": True, **result}


@router.get("/summary", response_model=None)
async def get_sku_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Global SKU KPIs: total_skus, in_stock_skus, total_pieces, auto_generated."""
    svc = SKUService(db)
    result = await svc.get_sku_summary()
    return {"success": True, "data": result}


@router.get("/{sku_id}/cost-history", response_model=None)
async def get_cost_history(
    sku_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Per-batch cost breakdown for a SKU — from event metadata."""
    svc = SKUService(db)
    result = await svc.get_cost_history(sku_id)
    return {"success": True, "data": result}


@router.get("/{sku_id}/open-demand", response_model=None)
async def get_open_demand(
    sku_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Open (unfulfilled, non-cancelled) orders demanding this SKU."""
    svc = SKUService(db)
    result = await svc.get_open_demand(sku_id)
    return {"success": True, "data": result}


@router.get("/{sku_id}", response_model=None)
async def get_sku(
    sku_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """Get single SKU with stock levels and source batch traceability."""
    svc = SKUService(db)
    result = await svc.get_sku(sku_id)
    return {"success": True, "data": result}


@router.post("", response_model=None, status_code=201)
async def create_sku(
    req: SKUCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Create SKU with auto-generated sku_code (e.g. 101-Red-M)."""
    svc = SKUService(db)
    result = await svc.create_sku(req)
    return {"success": True, "data": result}


@router.patch("/{sku_id}", response_model=None)
async def update_sku(
    sku_id: UUID,
    req: SKUUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Partial update SKU fields."""
    svc = SKUService(db)
    result = await svc.update_sku(sku_id, req)
    return {"success": True, "data": result}
