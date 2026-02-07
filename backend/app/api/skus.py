"""SKU routes — product CRUD with auto-code generation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.sku import SKUCreate, SKUUpdate
from app.services.sku_service import SKUService

router = APIRouter(prefix="/skus", tags=["SKUs"])


@router.get("", response_model=None)
async def list_skus(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("inventory_view"),
):
    """List SKUs with stock levels. Filters: product_type, color, size, is_active, search."""
    svc = SKUService(db)
    result = await svc.get_skus(params)
    return {"success": True, **result}


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
