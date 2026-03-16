from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


# --- Filter Params ---


class LedgerFilterParams(PaginatedParams):
    party_type: str  # supplier / customer / va_party
    party_id: UUID
    entry_type: str | None = None
    date_from: date | None = None
    date_to: date | None = None


# --- Requests ---


class PaymentCreate(BaseModel):
    """POST /ledger/payment — record a payment to/from a party."""

    party_type: str  # supplier / customer / va_party
    party_id: UUID
    amount: Decimal
    payment_date: date
    payment_mode: str | None = None  # cash / neft / upi / cheque
    reference_no: str | None = None  # cheque no, UTR, etc.
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    tcs_applicable: bool = False
    tcs_rate: Decimal | None = None
    tcs_section: str | None = None
    notes: str | None = None


class LedgerEntryCreate(BaseModel):
    """Internal use — auto-created entries from services."""

    entry_date: date
    party_type: str
    party_id: UUID
    entry_type: str
    reference_type: str | None = None
    reference_id: UUID | None = None
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    tds_amount: Decimal | None = None
    tds_section: str | None = None
    tcs_amount: Decimal | None = None
    net_amount: Decimal | None = None
    description: str
    fy_id: UUID | None = None
    created_by: UUID | None = None
    notes: str | None = None


# --- Response ---


class LedgerEntryResponse(BaseSchema):
    id: UUID
    entry_date: date
    party_type: str
    party_id: UUID
    entry_type: str
    reference_type: str | None = None
    reference_id: UUID | None = None
    debit: Decimal
    credit: Decimal
    tds_amount: Decimal | None = None
    tds_section: str | None = None
    tcs_amount: Decimal | None = None
    net_amount: Decimal | None = None
    description: str
    fy_id: UUID | None = None
    created_by: UUID | None = None
    notes: str | None = None
    created_at: datetime


class PartyBalanceResponse(BaseSchema):
    party_type: str
    party_id: UUID
    party_name: str
    total_debit: Decimal
    total_credit: Decimal
    balance: Decimal  # positive = party owes us (customer) or we owe them (supplier/va)
    balance_type: str  # "dr" or "cr"
