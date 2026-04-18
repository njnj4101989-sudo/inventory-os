from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


class SalesReturnFilterParams(PaginatedParams):
    status: str | None = None
    customer_id: UUID | None = None
    order_id: UUID | None = None
    search: str | None = None


class SalesReturnItemInput(BaseModel):
    sku_id: UUID
    quantity_returned: int
    order_item_id: UUID | None = None  # optional — set when return is linked to a specific order
    unit_price: Decimal | None = None  # required for standalone returns (no order), optional if order-linked
    reason: str | None = None  # defective, wrong_item, size_mismatch, color_mismatch, damaged_in_transit, customer_changed_mind, other
    notes: str | None = None


class SalesReturnCreate(BaseModel):
    customer_id: UUID
    order_id: UUID | None = None  # optional — link to source order
    return_date: date | None = None
    transport_id: UUID | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None
    gst_percent: Decimal | None = None  # auto-populated from order if linked, else user-specified
    items: list[SalesReturnItemInput]


class SalesReturnUpdate(BaseModel):
    transport_id: UUID | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None


# ── Fast-track credit note against an invoice ──
# Skips the 5-step workflow (draft → received → inspected → restocked → closed)
# and creates the SalesReturn in `closed` status directly with a CN-XXXX assigned.
# Used for: price adjustments, post-GSTR-1 corrections, discount-after-invoice,
# and clean customer-return cases where physical inspection isn't needed.

class CreditNoteFromInvoiceItemInput(BaseModel):
    """Single line on the credit note. Pre-filled from invoice_items but editable."""

    invoice_item_id: UUID | None = None
    sku_id: UUID
    quantity: int                         # qty being credited
    unit_price: Decimal                   # usually the invoice line's rate
    restore_stock: bool = False           # add this qty back to inventory (goods returned)
    reason: str | None = None             # per-line reason (optional)


class CreditNoteFromInvoiceRequest(BaseModel):
    """POST /invoices/{invoice_id}/credit-note — raise a credit note directly."""

    reason: str                           # goods_returned | price_adjustment | quality_issue |
                                          # post_filing_correction | discount | other
    reason_notes: str | None = None
    items: list[CreditNoteFromInvoiceItemInput]
    gst_percent: Decimal | None = None    # defaults to invoice.gst_percent if not provided


class InspectItemInput(BaseModel):
    item_id: UUID  # sales_return_item id
    condition: str  # good | damaged | rejected
    quantity_restocked: int = 0
    quantity_damaged: int = 0
    notes: str | None = None


class InspectRequest(BaseModel):
    items: list[InspectItemInput]
    qc_notes: str | None = None


class SalesReturnItemResponse(BaseSchema):
    id: UUID
    order_item: dict | None = None
    sku: dict | None = None
    unit_price: Decimal | None = None
    quantity_returned: int
    quantity_restocked: int = 0
    quantity_damaged: int = 0
    reason: str | None = None
    condition: str = "pending"
    notes: str | None = None


class SalesReturnResponse(BaseSchema):
    id: UUID
    srn_no: str
    order: dict | None = None
    customer: dict | None = None
    status: str
    return_date: date | None = None
    received_date: date | None = None
    inspected_date: date | None = None
    restocked_date: date | None = None
    transport: dict | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None
    qc_notes: str | None = None
    gst_percent: Decimal | None = None
    subtotal: Decimal | None = None
    discount_amount: Decimal | None = None
    workflow_type: str | None = None
    tax_amount: Decimal | None = None
    total_amount: Decimal | None = None
    credit_note_no: str | None = None
    created_by_user: dict | None = None
    received_by_user: dict | None = None
    inspected_by_user: dict | None = None
    created_at: datetime | None = None
    items: list[dict] = []
