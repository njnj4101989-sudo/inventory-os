from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.schemas import BaseSchema
from app.schemas.supplier import SupplierBrief


# --- Brief ---


class SKUBrief(BaseSchema):
    """Nested SKU info in batch, order, inventory responses."""

    id: UUID
    sku_code: str
    product_name: str
    color: str | None = None
    size: str | None = None
    base_price: Decimal | None = None


class StockBrief(BaseSchema):
    """Nested stock levels in SKU listing."""

    total_qty: int = 0
    available_qty: int = 0
    reserved_qty: int = 0


# --- Requests ---


class SKUCreate(BaseModel):
    product_type: str
    product_name: str
    color: str
    color_id: UUID | None = None
    size: str
    description: str | None = None
    base_price: Decimal | None = None
    hsn_code: str | None = None
    gst_percent: Decimal | None = None
    mrp: Decimal | None = None
    sale_rate: Decimal | None = None
    unit: str | None = None


class SKUUpdate(BaseModel):
    product_name: str | None = None
    description: str | None = None
    base_price: Decimal | None = None
    hsn_code: str | None = None
    gst_percent: Decimal | None = None
    mrp: Decimal | None = None
    sale_rate: Decimal | None = None
    stitching_cost: Decimal | None = None
    other_cost: Decimal | None = None
    unit: str | None = None
    is_active: bool | None = None


# --- Response ---


class SKUResponse(BaseSchema):
    id: UUID
    sku_code: str
    product_type: str
    product_name: str
    color: str
    color_id: UUID | None = None
    design_id: UUID | None = None
    size: str
    description: str | None = None
    base_price: Decimal | None = None
    hsn_code: str | None = None
    gst_percent: Decimal | None = None
    mrp: Decimal | None = None
    sale_rate: Decimal | None = None
    stitching_cost: Decimal | None = None
    other_cost: Decimal | None = None
    unit: str | None = None
    is_active: bool
    stock: StockBrief | None = None


# --- Purchase Ready Stock ---


class PurchaseLineItem(BaseModel):
    product_type: str
    design_no: str
    design_id: UUID | None = None
    color: str
    color_id: UUID | None = None
    size: str
    qty: int
    unit_price: Decimal
    hsn_code: str | None = None
    gst_percent: Decimal | None = None

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v

    @field_validator("unit_price")
    @classmethod
    def unit_price_positive(cls, v):
        if v <= 0:
            raise ValueError("Unit price must be positive")
        return v


class PurchaseStockRequest(BaseModel):
    supplier_id: UUID
    invoice_no: str | None = None
    challan_no: str | None = None
    invoice_date: date | None = None
    sr_no: str | None = None
    gst_percent: Decimal = Decimal("0")
    notes: str | None = None
    line_items: list[PurchaseLineItem]

    @field_validator("line_items")
    @classmethod
    def at_least_one(cls, v):
        if not v:
            raise ValueError("At least one line item is required")
        return v


class PurchaseItemBrief(BaseSchema):
    id: UUID
    sku_id: UUID
    sku_code: str
    product_type: str
    design_no: str
    color: str
    size: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    hsn_code: str | None = None
    gst_percent: Decimal | None = None


class PurchaseInvoiceResponse(BaseSchema):
    id: UUID
    supplier: SupplierBrief | None = None
    invoice_no: str | None = None
    challan_no: str | None = None
    invoice_date: date | None = None
    sr_no: str | None = None
    gst_percent: Decimal = Decimal("0")
    received_at: datetime | None = None
    notes: str | None = None
    items: list[PurchaseItemBrief] = []
    item_count: int = 0
    total_amount: Decimal = Decimal("0")


# --- Opening Stock ---


class OpeningStockLineItem(BaseModel):
    """Single line for bulk SKU opening stock entry."""

    product_type: str
    design_no: str
    design_id: UUID | None = None
    color: str
    size: str
    qty: int
    unit_cost: Decimal | None = None

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v


class SKUOpeningStockRequest(BaseModel):
    """POST /skus/opening-stock — bulk create SKUs + opening stock events."""

    line_items: list[OpeningStockLineItem]

    @field_validator("line_items")
    @classmethod
    def at_least_one(cls, v):
        if not v:
            raise ValueError("At least one line item is required")
        return v
