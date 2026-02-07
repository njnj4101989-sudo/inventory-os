"""Invoice routes — listing, payment, PDF generation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.services.invoice_service import InvoiceService

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("", response_model=None)
async def list_invoices(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """List invoices with pagination. Filters: status."""
    svc = InvoiceService(db)
    result = await svc.get_invoices(params)
    return {"success": True, **result}


@router.patch("/{invoice_id}/pay", response_model=None)
async def mark_paid(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("invoice_manage"),
):
    """Mark invoice as paid."""
    svc = InvoiceService(db)
    result = await svc.mark_paid(invoice_id)
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
