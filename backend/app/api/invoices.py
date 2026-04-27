"""Invoice routes — listing, payment, PDF generation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.schemas.invoice import (
    InvoiceCancelRequest,
    InvoiceCreate,
    InvoiceFilterParams,
    InvoiceFromOrder,
    InvoiceUpdate,
    MarkPaidRequest,
)
from app.schemas.sales_return import CreditNoteFromInvoiceRequest
from app.services.invoice_service import InvoiceService
from app.services.sales_return_service import SalesReturnService

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("", response_model=None)
async def list_invoices(
    params: InvoiceFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """List invoices with pagination. Filters: status, search."""
    fy_id = get_fy_id(current_user)
    svc = InvoiceService(db)
    result = await svc.get_invoices(params, fy_id)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_invoice(
    req: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Create a standalone invoice (direct sale, no order)."""
    fy_id = get_fy_id(current_user)
    svc = InvoiceService(db)
    result = await svc.create_standalone_invoice(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.post("/from-order", response_model=None, status_code=201)
async def create_from_order(
    req: InvoiceFromOrder,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Generate invoice from an existing order."""
    fy_id = get_fy_id(current_user)
    svc = InvoiceService(db)
    result = await svc.create_invoice_from_order(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.get("/by-no/{invoice_no}", response_model=None)
async def get_invoice_by_no(
    invoice_no: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Get single invoice by invoice_number (used by QR scan deep-link)."""
    svc = InvoiceService(db)
    result = await svc.get_invoice_by_no(invoice_no)
    return {"success": True, "data": result}


@router.get("/{invoice_id}", response_model=None)
async def get_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Get single invoice by ID."""
    svc = InvoiceService(db)
    result = await svc.get_invoice(invoice_id)
    return {"success": True, "data": result}


@router.patch("/{invoice_id}/pay", response_model=None)
async def mark_paid(
    invoice_id: UUID,
    req: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Mark invoice as paid by recording a payment receipt.

    Posts a customer-side payment ledger entry (Cr customer) for
    `invoice.total_amount`, optionally with TDS/TCS split, then flips
    invoice.status -> 'paid'. The ledger row is linked back via
    `reference_type='invoice'` for deep-link from customer ledger.
    """
    fy_id = get_fy_id(current_user)
    svc = InvoiceService(db)
    result = await svc.mark_paid(invoice_id, req, fy_id=fy_id, user_id=current_user.id)
    return {"success": True, "data": result}


@router.patch("/{invoice_id}", response_model=None)
async def update_invoice(
    invoice_id: UUID,
    req: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Edit a draft or issued invoice."""
    svc = InvoiceService(db)
    result = await svc.update_invoice(invoice_id, req)
    return {"success": True, "data": result}


@router.post("/{invoice_id}/cancel", response_model=None)
async def cancel_invoice(
    invoice_id: UUID,
    req: InvoiceCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Cancel an issued or draft invoice with a reason. Reverses ledger entry.

    Cancelled invoices are retained (GST requirement) with a reason code,
    optional notes, timestamp, and the cancelling user captured for audit.
    """
    svc = InvoiceService(db)
    result = await svc.cancel_invoice(invoice_id, req, current_user.id)
    return {"success": True, "data": result}


@router.post("/{invoice_id}/credit-note", response_model=None, status_code=201)
async def create_credit_note_from_invoice(
    invoice_id: UUID,
    req: CreditNoteFromInvoiceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Raise a credit note directly against an invoice (fast-track path).

    Creates a closed SalesReturn + CN-XXXX in one step. Per-item
    `restore_stock` controls whether inventory is added back. Used for
    price adjustments, discount-after-billing, or clean goods-return
    scenarios that don't need a full QC workflow.
    """
    fy_id = get_fy_id(current_user)
    svc = SalesReturnService(db)
    result = await svc.create_credit_note_from_invoice(invoice_id, req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.get("/{invoice_id}/pdf")
async def download_pdf(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Download invoice as PDF."""
    svc = InvoiceService(db)
    pdf_bytes = await svc.generate_pdf(invoice_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice_id}.pdf"},
    )
