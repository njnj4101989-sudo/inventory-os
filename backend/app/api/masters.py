"""Master data routes — Product Types, Colors, Fabrics."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.master import (
    ProductTypeCreate, ProductTypeUpdate, ProductTypeResponse,
    ColorCreate, ColorUpdate, ColorResponse,
    FabricCreate, FabricUpdate, FabricResponse,
)
from app.services.master_service import MasterService

router = APIRouter(prefix="/masters", tags=["Masters"])


# ── Product Types ────────────────────────────────────────


@router.get("/product-types", response_model=None)
async def list_product_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_product_types(db)
    return {"success": True, "data": [ProductTypeResponse.model_validate(i) for i in items]}


@router.get("/product-types/all", response_model=None)
async def all_active_product_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_product_types(db)
    return {"success": True, "data": [ProductTypeResponse.model_validate(i) for i in items]}


@router.post("/product-types", response_model=None, status_code=201)
async def create_product_type(
    req: ProductTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_product_type(db, req)
    return {"success": True, "data": ProductTypeResponse.model_validate(obj)}


@router.patch("/product-types/{pt_id}", response_model=None)
async def update_product_type(
    pt_id: UUID,
    req: ProductTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_product_type(db, pt_id, req)
    return {"success": True, "data": ProductTypeResponse.model_validate(obj)}


# ── Colors ───────────────────────────────────────────────


@router.get("/colors", response_model=None)
async def list_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_colors(db)
    return {"success": True, "data": [ColorResponse.model_validate(i) for i in items]}


@router.get("/colors/all", response_model=None)
async def all_active_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_colors(db)
    return {"success": True, "data": [ColorResponse.model_validate(i) for i in items]}


@router.post("/colors", response_model=None, status_code=201)
async def create_color(
    req: ColorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_color(db, req)
    return {"success": True, "data": ColorResponse.model_validate(obj)}


@router.patch("/colors/{color_id}", response_model=None)
async def update_color(
    color_id: UUID,
    req: ColorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_color(db, color_id, req)
    return {"success": True, "data": ColorResponse.model_validate(obj)}


# ── Fabrics ──────────────────────────────────────────────


@router.get("/fabrics", response_model=None)
async def list_fabrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_fabrics(db)
    return {"success": True, "data": [FabricResponse.model_validate(i) for i in items]}


@router.get("/fabrics/all", response_model=None)
async def all_active_fabrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_fabrics(db)
    return {"success": True, "data": [FabricResponse.model_validate(i) for i in items]}


@router.post("/fabrics", response_model=None, status_code=201)
async def create_fabric(
    req: FabricCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_fabric(db, req)
    return {"success": True, "data": FabricResponse.model_validate(obj)}


@router.patch("/fabrics/{fabric_id}", response_model=None)
async def update_fabric(
    fabric_id: UUID,
    req: FabricUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_fabric(db, fabric_id, req)
    return {"success": True, "data": FabricResponse.model_validate(obj)}
