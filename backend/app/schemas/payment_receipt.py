"""Payment Receipt schemas — Tally-style bill-wise receipt voucher.

Polymorphic since S125: each allocation references a bill via `bill_type` +
`bill_id`. Supported bill types:
    invoice          — customer sale (party_type='customer')
    supplier_invoice — purchase / stock-in (party_type='supplier')
    job_challan      — roll-level VA (party_type='va_party')
    batch_challan    — garment-level VA (party_type='va_party')
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas import BaseSchema, PaginatedParams


_VALID_BILL_TYPES = ("invoice", "supplier_invoice", "job_challan", "batch_challan")
_VALID_PARTY_TYPES = ("customer", "supplier", "va_party")


# --- Filter Params ---


class PaymentReceiptFilterParams(PaginatedParams):
    party_type: str | None = None
    party_id: UUID | None = None
    payment_mode: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    search: str | None = None  # matches receipt_no or reference_no
    # S126: 'active' (default), 'cancelled', or 'all' to include both
    status: str | None = None


# --- Request ---


class PaymentAllocationInput(BaseModel):
    """Single allocation line — apply ₹X of this receipt to that bill."""

    bill_type: str  # invoice | supplier_invoice | job_challan | batch_challan
    bill_id: UUID
    amount_applied: Decimal

    @field_validator("amount_applied")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount_applied must be greater than 0")
        return v

    @field_validator("bill_type")
    @classmethod
    def bill_type_valid(cls, v: str) -> str:
        if v not in _VALID_BILL_TYPES:
            raise ValueError(f"bill_type must be one of: {', '.join(_VALID_BILL_TYPES)}")
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

    amount: Decimal  # gross amount (received from customer / paid to supplier|VA)

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
        if v not in _VALID_PARTY_TYPES:
            raise ValueError(f"party_type must be one of: {', '.join(_VALID_PARTY_TYPES)}")
        return v


# --- Cancel Request (S126) ---


_VALID_CANCEL_REASONS = (
    "wrong_customer",
    "wrong_amount",
    "duplicate",
    "bounced_cheque",
    "payment_reversed",
    "data_entry_error",
    "other",
)


class PaymentReceiptCancelRequest(BaseModel):
    """POST /payment-receipts/{id}/cancel — voids a receipt + reverses all
    allocation effects (bills' amount_paid decremented + invoice statuses
    rolled back + compensating Dr/Cr ledger rows posted)."""

    cancel_reason: str
    cancel_notes: str | None = None

    @field_validator("cancel_reason")
    @classmethod
    def reason_valid(cls, v: str) -> str:
        if v not in _VALID_CANCEL_REASONS:
            raise ValueError(
                f"cancel_reason must be one of: {', '.join(_VALID_CANCEL_REASONS)}"
            )
        return v


# --- Nested Briefs (used in responses) ---


class OpenBillBrief(BaseSchema):
    """Single open bill (any of 4 types) for the allocation table.

    `bill_type` + `bill_id` is the polymorphic ref; `bill_no` is the
    human-readable code (INV-XXXX / SI/Inv. # / JC-XXXX / BC-XXXX).
    """

    bill_type: str
    bill_id: UUID
    bill_no: str
    bill_date: date | None = None  # invoice_date / sent_date / issued_at
    due_date: date | None = None  # invoices only — None for SI/JC/BC
    total_amount: Decimal
    amount_paid: Decimal
    outstanding_amount: Decimal
    status: str


class PaymentAllocationBrief(BaseSchema):
    """Single allocation line in a receipt detail/list response."""

    id: UUID
    bill_type: str
    bill_id: UUID
    bill_no: str | None = None
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

    # S126 — cancel audit
    status: str = "active"
    cancel_reason: str | None = None
    cancel_notes: str | None = None
    cancelled_at: datetime | None = None
    cancelled_by_name: str | None = None


class OnAccountBalance(BaseSchema):
    """GET /<party-type>/{id}/on-account-balance response."""

    party_type: str
    party_id: UUID
    balance: Decimal
