"""Payment Receipt routes — Tally-style bill-wise receipts."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_fy_id, require_permission
from app.models.user import User
from app.schemas.payment_receipt import (
    PaymentReceiptCancelRequest,
    PaymentReceiptCreate,
    PaymentReceiptFilterParams,
)
from app.services.payment_receipt_service import PaymentReceiptService

router = APIRouter(prefix="/payment-receipts", tags=["Payment Receipts"])


@router.get("", response_model=None)
async def list_receipts(
    params: PaymentReceiptFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """List payment receipts (FY-scoped). Filters: party_type, party_id,
    payment_mode, date range, search."""
    fy_id = get_fy_id(current_user)
    svc = PaymentReceiptService(db)
    result = await svc.list_receipts(params, fy_id)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def record_receipt(
    req: PaymentReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Record a customer payment with one-or-more invoice allocations.

    SUM(allocations) <= amount − TDS + TCS. Residue → on-account credit
    (Tally pattern). Creates atomic ledger + invoice updates.
    """
    fy_id = get_fy_id(current_user)
    svc = PaymentReceiptService(db)
    result = await svc.record(req, fy_id=fy_id, created_by=current_user.id)
    return {"success": True, "data": result}


@router.get("/{receipt_id}", response_model=None)
async def get_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Single receipt with allocations + party brief."""
    svc = PaymentReceiptService(db)
    return {"success": True, "data": await svc.get_receipt(receipt_id)}


@router.post("/{receipt_id}/cancel", response_model=None)
async def cancel_receipt(
    receipt_id: UUID,
    req: PaymentReceiptCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Cancel an active receipt + reverse all allocation effects.

    Atomic: decrements bill.amount_paid per allocation, walks back invoice
    status (paid → partially_paid → issued), posts compensating Dr/Cr
    LedgerEntry rows (reference_type='payment_receipt_cancel'), reverses
    on-account residue + TDS/TCS, and marks the receipt cancelled with
    a reason + audit columns. The original receipt + allocation rows are
    retained for audit (Tally voucher-cancel pattern).
    """
    svc = PaymentReceiptService(db)
    result = await svc.cancel_receipt(receipt_id, req, user_id=current_user.id)
    return {"success": True, "data": result, "message": "Receipt cancelled"}
