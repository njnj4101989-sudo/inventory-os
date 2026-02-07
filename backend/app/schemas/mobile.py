from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.sku import SKUBrief
from app.schemas.user import UserBrief


# --- Requests ---


class ScanRequest(BaseModel):
    """POST /mobile/scan — QR code scan."""

    qr_data: str


# --- Responses ---


class MyBatchResponse(BaseSchema):
    """GET /mobile/my-batches — single batch for tailor."""

    id: UUID
    batch_code: str
    sku: SKUBrief
    quantity: int
    status: str
    assigned_at: datetime | None = None


class ScanResponse(BaseSchema):
    """POST /mobile/scan response."""

    batch: MyBatchResponse
    allowed_actions: list[str] = []


class PendingCheckResponse(BaseSchema):
    """GET /mobile/pending-checks — single batch for checker."""

    id: UUID
    batch_code: str
    sku: SKUBrief
    quantity: int
    status: str
    tailor: UserBrief
    submitted_at: datetime | None = None
