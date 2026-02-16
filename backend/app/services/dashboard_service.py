"""Dashboard service — stats, reports, aggregations."""

from datetime import date, datetime, timezone

from sqlalchemy import func, select, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.sku import SKU
from app.models.inventory_state import InventoryState
from app.models.inventory_event import InventoryEvent
from app.models.order import Order
from app.models.invoice import Invoice
from app.models.user import User
from app.schemas.dashboard import SummaryResponse, PerformanceResponse, MovementResponse


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_summary(self) -> dict:
        now = datetime.now(timezone.utc)
        today = now.date()

        # Rolls
        rolls_total = (await self.db.execute(
            select(func.count()).select_from(Roll)
        )).scalar() or 0
        rolls_with_remaining = (await self.db.execute(
            select(func.count()).select_from(Roll).where(Roll.remaining_weight > 0)
        )).scalar() or 0

        # Batches by status
        batch_counts = {}
        for status in ("created", "assigned", "in_progress", "submitted", "completed"):
            count = (await self.db.execute(
                select(func.count()).select_from(Batch).where(Batch.status == status)
            )).scalar() or 0
            batch_counts[status] = count

        completed_today = (await self.db.execute(
            select(func.count()).select_from(Batch).where(
                Batch.status == "completed",
                func.date(Batch.completed_at) == today,
            )
        )).scalar() or 0

        # Inventory
        total_skus = (await self.db.execute(
            select(func.count()).select_from(SKU).where(SKU.is_active == True)
        )).scalar() or 0
        low_stock = (await self.db.execute(
            select(func.count()).select_from(InventoryState).where(
                InventoryState.available_qty <= 10,
                InventoryState.available_qty > 0,
            )
        )).scalar() or 0

        # Orders
        pending_orders = (await self.db.execute(
            select(func.count()).select_from(Order).where(Order.status == "pending")
        )).scalar() or 0
        processing_orders = (await self.db.execute(
            select(func.count()).select_from(Order).where(Order.status == "processing")
        )).scalar() or 0
        shipped_today = (await self.db.execute(
            select(func.count()).select_from(Order).where(
                Order.status == "shipped",
                func.date(Order.created_at) == today,
            )
        )).scalar() or 0

        # Revenue
        revenue_today = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "paid",
                func.date(Invoice.paid_at) == today,
            )
        )).scalar() or 0
        # Monthly revenue (current month)
        first_of_month = today.replace(day=1)
        revenue_month = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "paid",
                func.date(Invoice.paid_at) >= first_of_month,
            )
        )).scalar() or 0

        return {
            "rolls": {
                "total": rolls_total,
                "with_remaining": rolls_with_remaining,
            },
            "batches": {
                "created": batch_counts.get("created", 0),
                "assigned": batch_counts.get("assigned", 0),
                "in_progress": batch_counts.get("in_progress", 0),
                "submitted": batch_counts.get("submitted", 0),
                "completed_today": completed_today,
            },
            "inventory": {
                "total_skus": total_skus,
                "low_stock_skus": low_stock,
            },
            "orders": {
                "pending": pending_orders,
                "processing": processing_orders,
                "shipped_today": shipped_today,
            },
            "revenue_today": float(revenue_today),
            "revenue_month": float(revenue_month),
        }

    async def get_tailor_performance(
        self, from_date: date, to_date: date
    ) -> list:
        # Get all tailors (users with tailor role)
        tailor_stmt = (
            select(User)
            .join(User.role)
            .where(User.role.has(name="tailor"))
        )
        tailor_result = await self.db.execute(tailor_stmt)
        tailors = tailor_result.scalars().all()

        performances = []
        for tailor in tailors:
            # Get completed batches for this tailor in date range
            batch_stmt = (
                select(Batch)
                .join(BatchAssignment, BatchAssignment.batch_id == Batch.id)
                .where(
                    BatchAssignment.tailor_id == tailor.id,
                    Batch.status == "completed",
                    func.date(Batch.completed_at) >= from_date,
                    func.date(Batch.completed_at) <= to_date,
                )
            )
            batch_result = await self.db.execute(batch_stmt)
            completed_batches = batch_result.scalars().all()

            batches_completed = len(completed_batches)
            pieces_completed = sum(b.approved_qty or 0 for b in completed_batches)
            total_rejected = sum(b.rejected_qty or 0 for b in completed_batches)
            total_produced = pieces_completed + total_rejected
            rejection_rate = round((total_rejected / total_produced * 100), 1) if total_produced > 0 else 0.0

            # Average completion days
            durations = []
            for b in completed_batches:
                if b.started_at and b.completed_at:
                    days = (b.completed_at - b.started_at).total_seconds() / 86400
                    durations.append(days)
            avg_days = round(sum(durations) / len(durations), 1) if durations else 0.0

            performances.append({
                "tailor": {
                    "id": str(tailor.id),
                    "full_name": tailor.full_name,
                },
                "batches_completed": batches_completed,
                "pieces_completed": pieces_completed,
                "avg_completion_days": avg_days,
                "rejection_rate": rejection_rate,
            })

        return performances

    async def get_inventory_movement(
        self, sku_id: str, from_date: date, to_date: date
    ) -> dict:
        from uuid import UUID as UUIDType
        sku_uuid = UUIDType(sku_id) if sku_id else None

        # Get SKU info
        if sku_uuid:
            sku_stmt = select(SKU).where(SKU.id == sku_uuid)
            sku_result = await self.db.execute(sku_stmt)
            sku = sku_result.scalar_one_or_none()
            sku_code = sku.sku_code if sku else "Unknown"
        else:
            sku_code = "All SKUs"

        # Aggregate events by type in date range
        evt_stmt = select(
            InventoryEvent.event_type,
            func.sum(InventoryEvent.quantity).label("total"),
        ).where(
            func.date(InventoryEvent.performed_at) >= from_date,
            func.date(InventoryEvent.performed_at) <= to_date,
        )
        if sku_uuid:
            evt_stmt = evt_stmt.where(InventoryEvent.sku_id == sku_uuid)
        evt_stmt = evt_stmt.group_by(InventoryEvent.event_type)

        evt_result = await self.db.execute(evt_stmt)
        totals = {row.event_type: int(row.total) for row in evt_result}

        stock_in = totals.get("stock_in", 0)
        stock_out = totals.get("stock_out", 0)
        returns = totals.get("return", 0)
        losses = totals.get("loss", 0)
        net_change = stock_in + returns - stock_out - losses

        # Get closing stock from inventory_state
        closing_stock = 0
        if sku_uuid:
            inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_uuid)
            inv_result = await self.db.execute(inv_stmt)
            inv = inv_result.scalar_one_or_none()
            closing_stock = inv.total_qty if inv else 0

        return {
            "sku_code": sku_code,
            "period": {"from": from_date.isoformat(), "to": to_date.isoformat()},
            "stock_in": stock_in,
            "stock_out": stock_out,
            "returns": returns,
            "losses": losses,
            "net_change": net_change,
            "closing_stock": closing_stock,
        }
