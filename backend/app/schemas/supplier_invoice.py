from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.supplier import SupplierBrief


class SupplierInvoiceCreate(BaseModel):
    """Used internally — not exposed as API endpoint."""

    supplier_id: UUID | None = None
    invoice_no: str | None = None
    challan_no: str | None = None
    invoice_date: date | None = None
    sr_no: str | None = None
    gst_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    additional_amount: Decimal = Decimal("0")
    notes: str | None = None


class SupplierInvoiceResponse(BaseSchema):
    id: UUID
    supplier: SupplierBrief | None = None
    invoice_no: str | None = None
    challan_no: str | None = None
    invoice_date: date | None = None
    sr_no: str | None = None
    gst_percent: Decimal = Decimal("0")
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    additional_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    received_at: datetime | None = None
    notes: str | None = None
