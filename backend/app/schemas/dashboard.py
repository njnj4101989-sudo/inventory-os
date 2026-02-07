from __future__ import annotations

from decimal import Decimal

from app.schemas import BaseSchema
from app.schemas.user import UserBrief


# --- Nested summaries ---


class RollsSummary(BaseSchema):
    total: int
    with_remaining: int


class BatchesSummary(BaseSchema):
    created: int
    assigned: int
    in_progress: int
    submitted: int
    completed_today: int


class InventorySummary(BaseSchema):
    total_skus: int
    low_stock_skus: int


class OrdersSummary(BaseSchema):
    pending: int
    processing: int
    shipped_today: int


# --- Responses ---


class SummaryResponse(BaseSchema):
    """GET /dashboard/summary."""

    rolls: RollsSummary
    batches: BatchesSummary
    inventory: InventorySummary
    orders: OrdersSummary
    revenue_today: Decimal
    revenue_month: Decimal


class PerformanceResponse(BaseSchema):
    """GET /dashboard/tailor-performance — single tailor row."""

    tailor: UserBrief
    batches_completed: int
    pieces_completed: int
    avg_completion_days: float
    rejection_rate: float


class MovementResponse(BaseSchema):
    """GET /dashboard/inventory-movement."""

    sku_code: str
    period: dict  # { "from": "...", "to": "..." }
    stock_in: int
    stock_out: int
    returns: int
    losses: int
    net_change: int
    closing_stock: int
