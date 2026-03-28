from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.sku import SKUBrief


# --- Nested ---


class ShipItemInput(BaseModel):
    """Single item in a partial ship request."""

    order_item_id: UUID
    quantity: int  # must be > 0 and <= remaining (quantity - fulfilled_qty)


class ShipmentItemResponse(BaseSchema):
    """Single item in shipment response."""

    id: UUID
    sku: SKUBrief
    order_item_id: UUID
    quantity: int


# --- Request ---


class UpdateShipmentRequest(BaseModel):
    """PATCH /shipments/{id} — update transport/LR/eway after ship."""

    transport_id: UUID | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    eway_bill_no: str | None = None
    eway_bill_date: date | None = None
    notes: str | None = None


# --- Response ---


class ShipmentBrief(BaseSchema):
    """Nested shipment info in invoice responses."""

    id: UUID
    shipment_no: str
    shipped_at: datetime


class ShipmentResponse(BaseSchema):
    """Full shipment detail."""

    id: UUID
    shipment_no: str
    order_id: UUID
    transport_id: UUID | None = None
    transport: dict | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    eway_bill_no: str | None = None
    eway_bill_date: date | None = None
    shipped_by: UUID | None = None
    shipped_at: datetime
    notes: str | None = None
    invoice: dict | None = None
    items: list[ShipmentItemResponse] = []
    created_at: datetime
