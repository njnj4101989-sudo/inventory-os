"""Supplier routes — CRUD for suppliers."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.services.supplier_service import SupplierService

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=None)
async def list_suppliers(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """List suppliers with pagination. Filters: is_active, search."""
    svc = SupplierService(db)
    result = await svc.get_suppliers(params)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_supplier(
    req: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Create a new supplier."""
    svc = SupplierService(db)
    result = await svc.create_supplier(req)
    return {"success": True, "data": result}


@router.patch("/{supplier_id}", response_model=None)
async def update_supplier(
    supplier_id: UUID,
    req: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Partial update supplier fields."""
    svc = SupplierService(db)
    result = await svc.update_supplier(supplier_id, req)
    return {"success": True, "data": result}
