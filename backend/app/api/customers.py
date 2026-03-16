"""Customer API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.core.auth import require_permission
from app.services.customer_service import CustomerService
from app.schemas.customer import CustomerCreate, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=0),
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CustomerService(db)
    return {"success": True, "data": await svc.get_customers(page, page_size, search)}


@router.get("/all")
async def get_all_active_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CustomerService(db)
    return {"success": True, "data": await svc.get_all_active()}


@router.get("/{customer_id}")
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CustomerService(db)
    return {"success": True, "data": await svc.get_customer(customer_id)}


@router.post("")
async def create_customer(
    req: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CustomerService(db)
    obj = await svc.create_customer(req)
    return {"success": True, "data": obj, "message": "Customer created"}


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: UUID,
    req: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CustomerService(db)
    obj = await svc.update_customer(customer_id, req)
    return {"success": True, "data": obj, "message": "Customer updated"}
