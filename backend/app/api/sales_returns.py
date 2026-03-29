"""Sales Returns API — customer return CRUD + 5-status lifecycle."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.schemas.sales_return import (
    InspectRequest,
    SalesReturnCreate,
    SalesReturnFilterParams,
    SalesReturnUpdate,
)
from app.services.sales_return_service import SalesReturnService

router = APIRouter(prefix="/sales-returns", tags=["Sales Returns"])


@router.get("", response_model=None)
async def list_sales_returns(
    params: SalesReturnFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = SalesReturnService(db)
    return await svc.list_sales_returns(params, fy_id)


@router.get("/next-number", response_model=None)
async def get_next_number(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    from app.core.code_generator import next_sales_return_number
    fy_id = get_fy_id(current_user)
    num = await next_sales_return_number(db, fy_id)
    return {"success": True, "data": {"next_number": num}}


@router.get("/{sr_id}", response_model=None)
async def get_sales_return(
    sr_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.get_sales_return(sr_id)
    return {"success": True, "data": result}


@router.post("", response_model=None)
async def create_sales_return(
    req: SalesReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = SalesReturnService(db)
    result = await svc.create_sales_return(req, current_user.id, fy_id)
    return {"success": True, "data": result, "message": "Sales return created"}


@router.patch("/{sr_id}", response_model=None)
async def update_sales_return(
    sr_id: UUID,
    req: SalesReturnUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.update_sales_return(sr_id, req)
    return {"success": True, "data": result}


@router.post("/{sr_id}/receive", response_model=None)
async def receive_sales_return(
    sr_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.receive_sales_return(sr_id, current_user.id)
    return {"success": True, "data": result, "message": "Goods received"}


@router.post("/{sr_id}/inspect", response_model=None)
async def inspect_sales_return(
    sr_id: UUID,
    req: InspectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.inspect_sales_return(sr_id, req, current_user.id)
    return {"success": True, "data": result, "message": "Inspection complete"}


@router.post("/{sr_id}/restock", response_model=None)
async def restock_sales_return(
    sr_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.restock_sales_return(sr_id, current_user.id)
    return {"success": True, "data": result, "message": "Items restocked"}


@router.post("/{sr_id}/close", response_model=None)
async def close_sales_return(
    sr_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = SalesReturnService(db)
    result = await svc.close_sales_return(sr_id, current_user.id, fy_id)
    return {"success": True, "data": result, "message": "Sales return closed — credit note generated"}


@router.post("/{sr_id}/cancel", response_model=None)
async def cancel_sales_return(
    sr_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = SalesReturnService(db)
    result = await svc.cancel_sales_return(sr_id)
    return {"success": True, "data": result, "message": "Sales return cancelled"}
