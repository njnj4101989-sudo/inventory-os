"""Payment Receipt schemas — Tally-style bill-wise receipt voucher.

Mirrors `LedgerService.PaymentCreate` for TDS/TCS handling but adds the
allocations[] list for splitting one receipt across multiple invoices.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.customer import CustomerBrief


# --- Filter Params ---


class PaymentReceiptFilterParams(PaginatedParams):
    party_type: str | None = None
    party_id: UUID | None = None
    payment_mode: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    search: str | None = None  # matches receipt_no or reference_no


# --- Request ---


class PaymentAllocationInput(BaseModel):
    """Single allocation line — apply ₹X of this receipt to that invoice."""

    invoice_id: UUID
    amount_applied: Decimal

    @field_validator("amount_applied")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount_applied must be greater than 0")
        return v


class PaymentReceiptCreate(BaseModel):
    """POST /payment-receipts — record a customer/supplier/va_party payment.

    Math contract:
        SUM(allocations.amount_applied) <= amount - tds_amount + tcs_amount
        residue → on_account_amount on the receipt
    """

    party_type: str  # customer | supplier | va_party
    party_id: UUID
    payment_date: date
    payment_mode: str  # neft | upi | cash | cheque | card
    reference_no: str | None = None  # UTR / cheque #

    amount: Decimal  # gross amount received

    # TDS / TCS — same contract as LedgerService.PaymentCreate
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    tcs_applicable: bool = False
    tcs_rate: Decimal | None = None
    tcs_section: str | None = None

    allocations: list[PaymentAllocationInput] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be greater than 0")
        return v

    @field_validator("party_type")
    @classmethod
    def party_type_valid(cls, v: str) -> str:
        if v not in ("customer", "supplier", "va_party"):
            raise ValueError("party_type must be one of: customer, supplier, va_party")
        return v


# --- Nested Briefs (used in responses) ---


class OpenInvoiceBrief(BaseSchema):
    """Single open invoice for the customer-payment allocation table."""

    id: UUID
    invoice_number: str
    issued_at: datetime | None = None
    due_date: date | None = None
    total_amount: Decimal
    amount_paid: Decimal
    outstanding_amount: Decimal
    status: str  # issued | partially_paid


class PaymentAllocationBrief(BaseSchema):
    """Single allocation line in a receipt detail/list response."""

    id: UUID
    invoice_id: UUID
    invoice_number: str | None = None
    amount_applied: Decimal


class PartyBrief(BaseSchema):
    """Polymorphic party brief — name + light identifiers."""

    id: UUID
    name: str
    phone: str | None = None
    city: str | None = None
    gst_no: str | None = None


# --- Responses ---


class PaymentReceiptResponse(BaseSchema):
    id: UUID
    receipt_no: str
    party_type: str
    party_id: UUID
    party: PartyBrief | None = None

    payment_date: date
    payment_mode: str
    reference_no: str | None = None

    amount: Decimal
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    tds_amount: Decimal = Decimal("0")
    tcs_applicable: bool = False
    tcs_rate: Decimal | None = None
    tcs_section: str | None = None
    tcs_amount: Decimal = Decimal("0")

    allocated_amount: Decimal = Decimal("0")  # SUM(allocations) — derived
    on_account_amount: Decimal = Decimal("0")
    net_amount: Decimal = Decimal("0")  # amount - tds + tcs — derived

    allocations: list[PaymentAllocationBrief] = []
    notes: str | None = None
    fy_id: UUID | None = None
    created_at: datetime | None = None


class OnAccountBalance(BaseSchema):
    """GET /customers/{id}/on-account-balance response."""

    party_type: str
    party_id: UUID
    balance: Decimal
