"""Dashboard service — stats, reports, aggregations."""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import SummaryResponse, PerformanceResponse, MovementResponse


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_summary(self) -> SummaryResponse:
        """Aggregate counts for dashboard cards.

        Queries: rolls (total, with_remaining), batches (by status, completed_today),
        inventory (total_skus, low_stock), orders (pending, processing, shipped_today),
        revenue (today, month from paid invoices).
        """
        raise NotImplementedError

    async def get_tailor_performance(
        self, from_date: date, to_date: date
    ) -> list[PerformanceResponse]:
        """Per-tailor stats: batches_completed, pieces, avg_days, rejection_rate."""
        raise NotImplementedError

    async def get_inventory_movement(
        self, sku_id: str, from_date: date, to_date: date
    ) -> MovementResponse:
        """Stock movement report for a single SKU over a date range.

        Sums events by type: stock_in, stock_out, returns, losses → net_change.
        """
        raise NotImplementedError
