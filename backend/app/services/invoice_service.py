"""Invoice service — generation, PDF export, payment tracking."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem
from app.schemas.invoice import InvoiceResponse
from app.schemas import PaginatedParams


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_invoices(self, params: PaginatedParams) -> dict:
        """List invoices with pagination. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_invoice(self, invoice_id: UUID) -> InvoiceResponse:
        """Get single invoice with items. Raises NotFoundError."""
        raise NotImplementedError

    async def create_invoice(self, order_id: UUID, created_by: UUID) -> InvoiceResponse:
        """Generate invoice from order.

        Steps:
        1. Generate next_invoice_number via core/code_generator
        2. Load order + items
        3. Create Invoice record (subtotal, tax, discount, total)
        4. Create InvoiceItem records
        5. Generate QR code for invoice
        6. Return InvoiceResponse
        Raises: NotFoundError (order).
        """
        raise NotImplementedError

    async def mark_paid(self, invoice_id: UUID) -> InvoiceResponse:
        """Mark invoice as paid. Updates status + paid_at. Raises NotFoundError."""
        raise NotImplementedError

    async def generate_pdf(self, invoice_id: UUID) -> bytes:
        """Generate PDF binary for invoice. Uses reportlab. Raises NotFoundError."""
        raise NotImplementedError
