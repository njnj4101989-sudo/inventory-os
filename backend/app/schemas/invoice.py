from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.order import OrderBrief
from app.schemas.sku import SKUBrief


# --- Request ---


class InvoiceItemInput(BaseModel):
    """Single item in standalone invoice creation."""

    sku_id: UUID
    quantity: int
    unit_price: Decimal


class InvoiceCreate(BaseModel):
    """POST /invoices — standalone invoice (no order)."""

    customer_id: UUID
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    gst_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    additional_amount: Decimal = Decimal("0")
    payment_terms: str | None = None
    place_of_supply: str | None = None
    items: list[InvoiceItemInput]
    notes: str | None = None


class InvoiceFromOrder(BaseModel):
    """POST /invoices/from-order — generate invoice from existing order."""

    order_id: UUID
    payment_terms: str | None = None
    place_of_supply: str | None = None
    notes: str | None = None


class InvoiceUpdate(BaseModel):
    """PATCH /invoices/:id — edit draft/issued invoices."""

    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    additional_amount: Decimal | None = None
    payment_terms: str | None = None
    place_of_supply: str | None = None
    notes: str | None = None
    due_date: date | None = None


class InvoiceCancelRequest(BaseModel):
    """POST /invoices/{id}/cancel — requires a reason code + optional notes.

    Reason codes (industry-standard GST classification):
      - wrong_amount      : wrong rate, qty, or total
      - wrong_customer    : issued to the wrong party
      - duplicate         : duplicate invoice raised by mistake
      - customer_cancelled: customer cancelled the order pre-delivery
      - data_entry_error  : typo or other clerical mistake
      - other             : any reason not above (notes recommended)
    """

    reason: str
    notes: str | None = None


class MarkPaidRequest(BaseModel):
    """PATCH /invoices/{id}/pay — full-payment receipt against the invoice.

    Records a customer payment ledger entry (Cr customer) via
    LedgerService.record_payment() and flips invoice.status -> 'paid'.
    The ledger row is linked back via reference_type='invoice' so the
    payment shows on the customer ledger and deep-links to the invoice.

    v1 is strict full-payment: amount must equal invoice.total_amount.
    Partial payment / On-Account tracking is Phase 4 of FINANCIAL_SYMMETRY_PLAN.
    """

    payment_date: date
    payment_mode: str | None = None  # cash / neft / upi / cheque
    reference_no: str | None = None  # UTR / cheque #
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    tcs_applicable: bool = False
    tcs_rate: Decimal | None = None
    tcs_section: str | None = None
    notes: str | None = None


# --- Filter Params ---


class InvoiceFilterParams(PaginatedParams):
    """Query parameters for invoice listing."""

    status: str | None = None
    search: str | None = None


# --- Nested ---


class InvoiceItemResponse(BaseSchema):
    """Single item in invoice response."""

    sku: SKUBrief
    hsn_code: str | None = None
    quantity: int
    unit_price: Decimal
    total_price: Decimal


# --- Response ---


class InvoiceResponse(BaseSchema):
    id: UUID
    invoice_number: str
    gst_percent: Decimal = Decimal("0")
    order: OrderBrief | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    additional_amount: Decimal = Decimal("0")
    total_amount: Decimal
    amount_paid: Decimal = Decimal("0")
    outstanding_amount: Decimal = Decimal("0")
    status: str
    due_date: date | None = None
    payment_terms: str | None = None
    place_of_supply: str | None = None
    broker_id: UUID | None = None
    broker: dict | None = None
    transport_id: UUID | None = None
    transport: dict | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    issued_at: datetime | None = None
    paid_at: datetime | None = None
    notes: str | None = None
    cancel_reason: str | None = None
    cancel_notes: str | None = None
    cancelled_at: datetime | None = None
    cancelled_by_name: str | None = None
    items: list[InvoiceItemResponse] = []
    created_at: datetime | None = None
