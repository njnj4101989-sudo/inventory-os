"""Invoice service — generation, PDF export, payment tracking."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.schemas.invoice import InvoiceResponse
from app.schemas import PaginatedParams
from app.core.code_generator import next_invoice_number
from app.core.exceptions import NotFoundError, InvalidStateTransitionError


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_invoices(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(Invoice)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            select(Invoice)
            .options(
                selectinload(Invoice.order),
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
            )
            .order_by(Invoice.created_at.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        invoices = result.scalars().unique().all()

        return {
            "data": [self._to_response(inv) for inv in invoices],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_invoice(self, invoice_id: UUID) -> dict:
        invoice = await self._get_or_404(invoice_id)
        return self._to_response(invoice)

    async def create_invoice(self, order_id: UUID, created_by: UUID) -> dict:
        invoice_number = await next_invoice_number(self.db)

        # Load order with items
        order_stmt = (
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items).selectinload(OrderItem.sku))
        )
        order_result = await self.db.execute(order_stmt)
        order = order_result.scalar_one_or_none()
        if not order:
            raise NotFoundError(f"Order {order_id} not found")

        subtotal = float(order.total_amount or 0)
        tax_amount = round(subtotal * 0.18, 2)  # 18% GST
        discount_amount = 0.0
        total_amount = subtotal + tax_amount - discount_amount

        from app.services.qr_service import QRService
        qr_data = QRService.generate_qr_base64(invoice_number)

        invoice = Invoice(
            invoice_number=invoice_number,
            order_id=order.id,
            qr_code_data=qr_data,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total_amount=total_amount,
            status="issued",
            issued_at=datetime.now(timezone.utc),
        )
        self.db.add(invoice)
        await self.db.flush()

        # Create invoice items from order items
        for oi in order.items:
            inv_item = InvoiceItem(
                invoice_id=invoice.id,
                sku_id=oi.sku_id,
                quantity=oi.quantity,
                unit_price=oi.unit_price,
                total_price=oi.total_price,
            )
            self.db.add(inv_item)
        await self.db.flush()

        return await self.get_invoice(invoice.id)

    async def mark_paid(self, invoice_id: UUID) -> dict:
        invoice = await self._get_or_404(invoice_id)
        if invoice.status == "paid":
            raise InvalidStateTransitionError("Invoice is already paid")

        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_invoice(invoice_id)

    async def generate_pdf(self, invoice_id: UUID) -> bytes:
        # Deferred to Phase 6D — return invoice data as placeholder
        invoice = await self._get_or_404(invoice_id)
        return b"PDF generation deferred to Phase 6D"

    async def _get_or_404(self, invoice_id: UUID) -> Invoice:
        stmt = (
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(
                selectinload(Invoice.order),
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
            )
        )
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError(f"Invoice {invoice_id} not found")
        return invoice

    def _to_response(self, inv: Invoice) -> dict:
        return {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "order": {
                "id": str(inv.order.id),
                "order_number": inv.order.order_number,
                "customer_name": inv.order.customer_name,
            } if inv.order else None,
            "subtotal": float(inv.subtotal) if inv.subtotal else 0,
            "tax_amount": float(inv.tax_amount) if inv.tax_amount else 0,
            "discount_amount": float(inv.discount_amount) if inv.discount_amount else 0,
            "total_amount": float(inv.total_amount) if inv.total_amount else 0,
            "status": inv.status,
            "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "items": [
                {
                    "id": str(item.id),
                    "sku": {
                        "id": str(item.sku.id),
                        "sku_code": item.sku.sku_code,
                        "product_name": item.sku.product_name,
                    } if item.sku else None,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price) if item.unit_price else 0,
                    "total_price": float(item.total_price) if item.total_price else 0,
                }
                for item in (inv.items or [])
            ],
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
