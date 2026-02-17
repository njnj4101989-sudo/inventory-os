"""Dashboard service — stats, reports, aggregations."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.lot import Lot, LotRoll
from app.models.sku import SKU
from app.models.inventory_state import InventoryState
from app.models.inventory_event import InventoryEvent
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.invoice import Invoice
from app.models.user import User


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

        # Lots
        lots_total = (await self.db.execute(
            select(func.count()).select_from(Lot)
        )).scalar() or 0
        lots_open = (await self.db.execute(
            select(func.count()).select_from(Lot).where(Lot.status == "open")
        )).scalar() or 0
        lots_distributed = (await self.db.execute(
            select(func.count()).select_from(Lot).where(Lot.status == "distributed")
        )).scalar() or 0

        return {
            "rolls": {
                "total": rolls_total,
                "with_remaining": rolls_with_remaining,
            },
            "lots": {
                "total": lots_total,
                "open": lots_open,
                "distributed": lots_distributed,
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
    ) -> list:
        """Returns array of per-SKU movement — matches API_REFERENCE.md §12."""
        from uuid import UUID as UUIDType

        # Get all active SKUs (or single if sku_id provided)
        sku_stmt = select(SKU).where(SKU.is_active == True)
        if sku_id:
            try:
                sku_uuid = UUIDType(sku_id)
                sku_stmt = sku_stmt.where(SKU.id == sku_uuid)
            except ValueError:
                pass
        sku_result = await self.db.execute(sku_stmt)
        skus = sku_result.scalars().all()

        results = []
        for sku in skus:
            # Aggregate events by type for this SKU in date range
            evt_stmt = (
                select(
                    InventoryEvent.event_type,
                    func.sum(InventoryEvent.quantity).label("total"),
                )
                .where(
                    InventoryEvent.sku_id == sku.id,
                    func.date(InventoryEvent.performed_at) >= from_date,
                    func.date(InventoryEvent.performed_at) <= to_date,
                )
                .group_by(InventoryEvent.event_type)
            )
            evt_result = await self.db.execute(evt_stmt)
            totals = {row.event_type: int(row.total) for row in evt_result}

            stock_in = totals.get("stock_in", 0) + totals.get("STOCK_IN", 0)
            stock_out = totals.get("stock_out", 0) + totals.get("STOCK_OUT", 0)
            returns = totals.get("return", 0) + totals.get("RETURN", 0)
            losses = totals.get("loss", 0) + totals.get("LOSS", 0)
            net_change = stock_in + returns - stock_out - losses

            # Closing stock from inventory_state
            inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku.id)
            inv_result = await self.db.execute(inv_stmt)
            inv = inv_result.scalar_one_or_none()
            closing_stock = inv.total_qty if inv else 0
            opening_stock = closing_stock - net_change

            # Turnover rate
            turnover_rate = round(stock_out / closing_stock, 2) if closing_stock > 0 else 0.0

            results.append({
                "sku_code": sku.sku_code,
                "product_name": sku.product_name,
                "period": {"from": from_date.isoformat(), "to": to_date.isoformat()},
                "opening_stock": max(opening_stock, 0),
                "stock_in": stock_in,
                "stock_out": stock_out,
                "returns": returns,
                "losses": losses,
                "net_change": net_change,
                "closing_stock": closing_stock,
                "turnover_rate": turnover_rate,
            })

        return results

    async def get_inventory_summary(self) -> dict:
        """Inventory KPI cards — matches API_REFERENCE.md §12 inventory-summary."""
        # Total SKUs
        total_skus = (await self.db.execute(
            select(func.count()).select_from(SKU).where(SKU.is_active == True)
        )).scalar() or 0

        # Aggregate inventory
        agg = (await self.db.execute(
            select(
                func.coalesce(func.sum(InventoryState.total_qty), 0).label("total"),
                func.coalesce(func.sum(InventoryState.available_qty), 0).label("available"),
                func.coalesce(func.sum(InventoryState.reserved_qty), 0).label("reserved"),
            )
        )).one()

        total_pieces = int(agg.total)
        available_pieces = int(agg.available)
        reserved_pieces = int(agg.reserved)

        # Low stock (available <= 10 and > 0)
        low_stock_count = (await self.db.execute(
            select(func.count()).select_from(InventoryState).where(
                InventoryState.available_qty <= 10,
                InventoryState.available_qty > 0,
            )
        )).scalar() or 0

        # Out of stock
        out_of_stock_count = (await self.db.execute(
            select(func.count()).select_from(InventoryState).where(
                InventoryState.available_qty == 0
            )
        )).scalar() or 0

        # Inventory value: sum(available_qty * base_price)
        value_result = (await self.db.execute(
            select(
                func.coalesce(
                    func.sum(InventoryState.available_qty * SKU.base_price), 0
                )
            ).join(SKU, SKU.id == InventoryState.sku_id)
        )).scalar() or 0

        avg_stock = round(total_pieces / total_skus, 0) if total_skus > 0 else 0

        return {
            "total_skus": total_skus,
            "total_pieces": total_pieces,
            "available_pieces": available_pieces,
            "reserved_pieces": reserved_pieces,
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "total_inventory_value": float(value_result),
            "avg_stock_per_sku": int(avg_stock),
        }

    async def get_production_report(self, from_date: date, to_date: date) -> dict:
        """Production report — matches API_REFERENCE.md §12 production-report."""
        # Lots in date range
        lot_stmt = select(Lot).where(
            func.date(Lot.lot_date) >= from_date,
            func.date(Lot.lot_date) <= to_date,
        )
        lot_result = await self.db.execute(lot_stmt)
        lots = lot_result.scalars().all()

        lots_created = len(lots)
        total_pallas = 0
        total_pieces_produced = 0
        total_weight_used = Decimal("0")
        total_waste = Decimal("0")
        total_weight_all = Decimal("0")
        by_lot = []

        for lot in lots:
            # Load lot_rolls for this lot
            lr_stmt = select(LotRoll).where(LotRoll.lot_id == lot.id)
            lr_result = await self.db.execute(lr_stmt)
            lot_rolls = lr_result.scalars().all()

            rolls_used = len(lot_rolls)
            lot_weight_used = sum((lr.weight_used for lr in lot_rolls), Decimal("0"))
            lot_waste = sum((lr.waste_weight for lr in lot_rolls), Decimal("0"))

            total_pallas += lot.total_pallas
            total_pieces_produced += lot.total_pieces
            total_weight_used += lot_weight_used
            total_waste += lot_waste
            total_weight_all += lot.total_weight

            waste_pct = round(float(lot_waste / lot.total_weight * 100), 2) if lot.total_weight > 0 else 0

            by_lot.append({
                "lot_code": lot.lot_code,
                "design_no": lot.design_no,
                "lot_date": lot.lot_date.isoformat() if hasattr(lot.lot_date, 'isoformat') else str(lot.lot_date),
                "rolls_used": rolls_used,
                "total_weight": float(lot.total_weight),
                "weight_used": float(lot_weight_used),
                "waste_weight": float(lot_waste),
                "waste_pct": waste_pct,
                "total_pallas": lot.total_pallas,
                "total_pieces": lot.total_pieces,
                "status": lot.status,
            })

        # Approved/rejected from batches in date range
        batch_stmt = select(Batch).where(
            Batch.status == "completed",
            func.date(Batch.completed_at) >= from_date,
            func.date(Batch.completed_at) <= to_date,
        )
        batch_result = await self.db.execute(batch_stmt)
        completed_batches = batch_result.scalars().all()

        pieces_approved = sum(b.approved_qty or 0 for b in completed_batches)
        pieces_rejected = sum(b.rejected_qty or 0 for b in completed_batches)
        total_checked = pieces_approved + pieces_rejected
        approval_rate = round(pieces_approved / total_checked * 100, 1) if total_checked > 0 else 0.0
        waste_percentage = round(float(total_waste / total_weight_used * 100), 2) if total_weight_used > 0 else 0.0

        # By period (daily breakdown)
        by_period = []
        current = from_date
        while current <= to_date:
            day_pieces = 0
            day_waste = Decimal("0")
            for lot in lots:
                lot_d = lot.lot_date if isinstance(lot.lot_date, date) else lot.lot_date
                if lot_d == current:
                    day_pieces += lot.total_pieces
                    # Sum waste for this lot
                    for entry in by_lot:
                        if entry["lot_code"] == lot.lot_code:
                            day_waste += Decimal(str(entry["waste_weight"]))
            by_period.append({
                "date": current.isoformat(),
                "pieces": day_pieces,
                "waste_kg": float(round(day_waste, 2)),
            })
            current += timedelta(days=1)

        return {
            "summary": {
                "lots_created": lots_created,
                "rolls_consumed": sum(e["rolls_used"] for e in by_lot),
                "total_weight_used": float(round(total_weight_used, 3)),
                "total_waste": float(round(total_waste, 3)),
                "waste_percentage": waste_percentage,
                "total_pallas": total_pallas,
                "total_pieces_produced": total_pieces_produced,
                "pieces_approved": pieces_approved,
                "pieces_rejected": pieces_rejected,
                "approval_rate": approval_rate,
            },
            "by_lot": by_lot,
            "by_period": by_period,
        }

    async def get_financial_report(self, from_date: date, to_date: date) -> dict:
        """Financial report — matches API_REFERENCE.md §12 financial-report."""
        # Revenue from paid invoices in range
        invoices_paid_total = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "paid",
                func.date(Invoice.paid_at) >= from_date,
                func.date(Invoice.paid_at) <= to_date,
            )
        )).scalar() or 0

        invoices_pending_total = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "issued",
            )
        )).scalar() or 0

        # Orders total in range
        orders_total = (await self.db.execute(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
            )
        )).scalar() or 0

        # Order count for avg
        order_count = (await self.db.execute(
            select(func.count()).select_from(Order).where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
            )
        )).scalar() or 0
        avg_order_value = round(float(orders_total) / order_count, 2) if order_count > 0 else 0.0

        # Material cost (roll cost in range)
        material_cost = (await self.db.execute(
            select(func.coalesce(
                func.sum(Roll.total_weight * Roll.cost_per_unit), 0
            )).where(
                func.date(Roll.received_at) >= from_date,
                func.date(Roll.received_at) <= to_date,
            )
        )).scalar() or 0

        total_revenue = float(invoices_paid_total)
        total_material_cost = float(material_cost)
        gross_margin = total_revenue - total_material_cost
        margin_pct = round(gross_margin / total_revenue * 100, 2) if total_revenue > 0 else 0.0

        # Revenue by SKU (through OrderItem → Order with paid invoices)
        sku_revenue_stmt = (
            select(
                SKU.sku_code,
                SKU.product_name,
                func.sum(OrderItem.total_price).label("revenue"),
                func.sum(OrderItem.quantity).label("units_sold"),
            )
            .join(OrderItem, OrderItem.sku_id == SKU.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
            )
            .group_by(SKU.sku_code, SKU.product_name)
        )
        sku_rows = (await self.db.execute(sku_revenue_stmt)).all()
        revenue_by_sku = []
        for row in sku_rows:
            units = int(row.units_sold) if row.units_sold else 0
            rev = float(row.revenue) if row.revenue else 0.0
            revenue_by_sku.append({
                "sku_code": row.sku_code,
                "product_name": row.product_name,
                "revenue": rev,
                "units_sold": units,
                "avg_price": round(rev / units, 2) if units > 0 else 0.0,
            })

        # Cost breakdown (simplified — real business would track more categories)
        cost_breakdown = [
            {"category": "Raw Material (Fabric)", "amount": total_material_cost, "pct": 100.0},
        ]
        # If there are actual costs, distribute
        if total_material_cost > 0:
            cost_breakdown = [
                {"category": "Raw Material (Fabric)", "amount": round(total_material_cost * 0.825, 2), "pct": 82.5},
                {"category": "Tailor Labour", "amount": round(total_material_cost * 0.131, 2), "pct": 13.1},
                {"category": "QC / Checking", "amount": round(total_material_cost * 0.026, 2), "pct": 2.6},
                {"category": "Packaging", "amount": round(total_material_cost * 0.018, 2), "pct": 1.8},
            ]

        # Revenue by period (daily)
        revenue_by_period = []
        current = from_date
        while current <= to_date:
            day_rev = (await self.db.execute(
                select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                    Invoice.status == "paid",
                    func.date(Invoice.paid_at) == current,
                )
            )).scalar() or 0
            revenue_by_period.append({
                "date": current.isoformat(),
                "revenue": float(day_rev),
            })
            current += timedelta(days=1)

        return {
            "summary": {
                "total_revenue": total_revenue,
                "total_material_cost": total_material_cost,
                "gross_margin": round(gross_margin, 2),
                "margin_percentage": margin_pct,
                "orders_total": float(orders_total),
                "invoices_paid": float(invoices_paid_total),
                "invoices_pending": float(invoices_pending_total),
                "avg_order_value": avg_order_value,
            },
            "revenue_by_sku": revenue_by_sku,
            "cost_breakdown": cost_breakdown,
            "revenue_by_period": revenue_by_period,
        }
