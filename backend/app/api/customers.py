"""Customer API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_fy_id, require_permission
from app.models.user import User
from app.services.customer_service import CustomerService
from app.services.payment_receipt_service import PaymentReceiptService
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


@router.get("/{customer_id}/open-invoices")
async def get_open_invoices(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Open invoices (issued + partially_paid) for the receipt-allocation form.

    Ordered FIFO by issued_at (oldest first — Tally convention) so the
    auto-allocate button can apply against this list in order.
    """
    fy_id = get_fy_id(current_user)
    svc = PaymentReceiptService(db)
    return {
        "success": True,
        "data": await svc.get_open_invoices_for_party("customer", customer_id, fy_id),
    }


@router.get("/{customer_id}/on-account-balance")
async def get_on_account_balance(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Sum of unallocated payment residue for this customer in the current FY."""
    fy_id = get_fy_id(current_user)
    svc = PaymentReceiptService(db)
    return {
        "success": True,
        "data": await svc.get_on_account_balance("customer", customer_id, fy_id),
    }
