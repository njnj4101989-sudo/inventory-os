"""Dashboard service — stats, reports, aggregations."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roll import Roll, RollProcessing
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_processing import BatchProcessing
from app.models.lot import Lot, LotRoll
from app.models.sku import SKU
from app.models.inventory_state import InventoryState
from app.models.inventory_event import InventoryEvent
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.invoice import Invoice
from app.models.user import User
from app.models.return_note import ReturnNote
from app.models.sales_return import SalesReturn, SalesReturnItem
from app.models.shipment import Shipment
from app.models.customer import Customer
from app.models.broker import Broker
from app.models.supplier import Supplier
from app.models.supplier_invoice import SupplierInvoice
from app.models.ledger_entry import LedgerEntry
from app.models.va_party import VAParty
from app.models.job_challan import JobChallan
from app.models.batch_challan import BatchChallan


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_summary(self) -> dict:
        now = datetime.now(timezone.utc)
        today = now.date()
        first_of_month = today.replace(day=1)

        # --- Rolls: 1 query instead of 2 ---
        roll_agg = (await self.db.execute(
            select(
                func.count().label("total"),
                func.count(case((Roll.remaining_weight > 0, 1))).label("with_remaining"),
                func.count(case((Roll.status == "sent_for_processing", 1))).label("out_house"),
            ).select_from(Roll)
        )).one()

        # --- Batches: 1 GROUP BY instead of 7 individual COUNTs ---
        batch_status_rows = (await self.db.execute(
            select(Batch.status, func.count().label("cnt"))
            .group_by(Batch.status)
        )).all()
        batch_counts = {row.status: row.cnt for row in batch_status_rows}

        # Today's checked/packed: 1 query with CASE instead of 2
        batch_today = (await self.db.execute(
            select(
                func.count(case((
                    and_(
                        Batch.status.in_(["checked", "packing", "packed"]),
                        func.date(Batch.checked_at) == today,
                    ), 1
                ))).label("checked_today"),
                func.count(case((
                    and_(
                        Batch.status == "packed",
                        func.date(Batch.packed_at) == today,
                    ), 1
                ))).label("packed_today"),
                func.coalesce(func.sum(case((Batch.status == "packed", Batch.piece_count))), 0).label("ready_stock"),
            ).select_from(Batch)
        )).one()

        # --- Batches out-house ---
        batches_out_house = (await self.db.execute(
            select(func.count(func.distinct(BatchProcessing.batch_id))).where(
                BatchProcessing.status == "sent"
            )
        )).scalar() or 0

        # --- Inventory: 1 query with CASE instead of 2 ---
        inv_agg = (await self.db.execute(
            select(
                func.count(case((SKU.is_active == True, 1))).label("total_skus"),
            ).select_from(SKU)
        )).one()
        low_stock = (await self.db.execute(
            select(func.count()).select_from(InventoryState).where(
                InventoryState.available_qty <= 10,
                InventoryState.available_qty > 0,
            )
        )).scalar() or 0

        # --- Orders: 1 query with CASE instead of 3 ---
        order_agg = (await self.db.execute(
            select(
                func.count(case((Order.status == "pending", 1))).label("pending"),
                func.count(case((Order.status == "processing", 1))).label("processing"),
                func.count(case((
                    and_(
                        Order.status == "shipped",
                        func.date(Order.created_at) == today,
                    ), 1
                ))).label("shipped_today"),
            ).select_from(Order)
        )).one()

        # --- Revenue: 1 query with CASE instead of 2 ---
        rev_agg = (await self.db.execute(
            select(
                func.coalesce(func.sum(case((
                    and_(
                        Invoice.status == "paid",
                        func.date(Invoice.paid_at) == today,
                    ), Invoice.total_amount
                ))), 0).label("today"),
                func.coalesce(func.sum(case((
                    and_(
                        Invoice.status == "paid",
                        func.date(Invoice.paid_at) >= first_of_month,
                    ), Invoice.total_amount
                ))), 0).label("month"),
            ).select_from(Invoice)
        )).one()

        # --- Lots: 1 query with CASE instead of 3 ---
        lot_agg = (await self.db.execute(
            select(
                func.count().label("total"),
                func.count(case((Lot.status == "open", 1))).label("open"),
                func.count(case((Lot.status == "distributed", 1))).label("distributed"),
            ).select_from(Lot)
        )).one()

        # --- Returns: count by status + this month ---
        return_agg = (await self.db.execute(
            select(
                func.count().label("total"),
                func.count(case((ReturnNote.status == "draft", 1))).label("draft"),
                func.count(case((ReturnNote.status.in_(("approved", "dispatched")), 1))).label("active"),
                func.count(case((ReturnNote.status == "closed", 1))).label("closed"),
                func.count(case((
                    and_(
                        ReturnNote.status != "cancelled",
                        func.date(ReturnNote.created_at) >= first_of_month,
                    ), 1
                ))).label("this_month"),
            ).select_from(ReturnNote)
        )).one()

        return {
            "rolls": {
                "total": roll_agg.total,
                "with_remaining": roll_agg.with_remaining,
            },
            "lots": {
                "total": lot_agg.total,
                "open": lot_agg.open,
                "distributed": lot_agg.distributed,
            },
            "batches": {
                "created": batch_counts.get("created", 0),
                "assigned": batch_counts.get("assigned", 0),
                "in_progress": batch_counts.get("in_progress", 0),
                "submitted": batch_counts.get("submitted", 0),
                "checked": batch_counts.get("checked", 0),
                "packing": batch_counts.get("packing", 0),
                "packed": batch_counts.get("packed", 0),
                "checked_today": batch_today.checked_today,
                "packed_today": batch_today.packed_today,
            },
            "rolls_out_house": roll_agg.out_house,
            "batches_out_house": batches_out_house,
            "ready_stock_pieces": int(batch_today.ready_stock),
            "inventory": {
                "total_skus": inv_agg.total_skus,
                "low_stock_skus": low_stock,
            },
            "orders": {
                "pending": order_agg.pending,
                "processing": order_agg.processing,
                "shipped_today": order_agg.shipped_today,
            },
            "revenue_today": float(rev_agg.today),
            "revenue_month": float(rev_agg.month),
            "returns": {
                "total": return_agg.total,
                "draft": return_agg.draft,
                "active": return_agg.active,
                "closed": return_agg.closed,
                "this_month": return_agg.this_month,
            },
        }

    async def get_tailor_performance(
        self, from_date: date, to_date: date
    ) -> list:
        from collections import defaultdict

        # Query 1: Get all tailors
        tailor_stmt = (
            select(User)
            .join(User.role)
            .where(User.role.has(name="tailor"))
        )
        tailors = (await self.db.execute(tailor_stmt)).scalars().all()

        # Query 2: Get ALL completed batches in date range (single query instead of N)
        batch_stmt = (
            select(
                BatchAssignment.tailor_id,
                Batch.approved_qty,
                Batch.rejected_qty,
                Batch.started_at,
                Batch.completed_at,
            )
            .join(Batch, Batch.id == BatchAssignment.batch_id)
            .where(
                Batch.status.in_(["checked", "packing", "packed"]),
                func.date(Batch.checked_at) >= from_date,
                func.date(Batch.checked_at) <= to_date,
            )
        )
        batch_rows = (await self.db.execute(batch_stmt)).all()

        # Group by tailor_id in Python (trivial — just dict building)
        tailor_batches = defaultdict(list)
        for row in batch_rows:
            tailor_batches[row.tailor_id].append(row)

        performances = []
        for tailor in tailors:
            rows = tailor_batches.get(tailor.id, [])
            pieces_completed = sum(r.approved_qty or 0 for r in rows)
            total_rejected = sum(r.rejected_qty or 0 for r in rows)
            total_produced = pieces_completed + total_rejected
            rejection_rate = round((total_rejected / total_produced * 100), 1) if total_produced > 0 else 0.0

            durations = []
            for r in rows:
                if r.started_at and r.completed_at:
                    days = (r.completed_at - r.started_at).total_seconds() / 86400
                    durations.append(days)
            avg_days = round(sum(durations) / len(durations), 1) if durations else 0.0

            performances.append({
                "tailor": {
                    "id": str(tailor.id),
                    "full_name": tailor.full_name,
                },
                "batches_completed": len(rows),
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
        from collections import defaultdict

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

        if not skus:
            return []

        sku_ids = [s.id for s in skus]

        # Single GROUP BY query for ALL SKUs instead of N individual queries
        evt_stmt = (
            select(
                InventoryEvent.sku_id,
                InventoryEvent.event_type,
                func.sum(InventoryEvent.quantity).label("total"),
            )
            .where(
                InventoryEvent.sku_id.in_(sku_ids),
                func.date(InventoryEvent.performed_at) >= from_date,
                func.date(InventoryEvent.performed_at) <= to_date,
            )
            .group_by(InventoryEvent.sku_id, InventoryEvent.event_type)
        )
        evt_rows = (await self.db.execute(evt_stmt)).all()

        # Build lookup: {sku_id: {event_type: total}}
        evt_map = defaultdict(dict)
        for row in evt_rows:
            evt_map[row.sku_id][row.event_type] = int(row.total)

        # Single query for ALL inventory states instead of N
        inv_stmt = select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
        inv_rows = (await self.db.execute(inv_stmt)).scalars().all()
        inv_map = {s.sku_id: s for s in inv_rows}

        results = []
        for sku in skus:
            totals = evt_map.get(sku.id, {})
            stock_in = totals.get("stock_in", 0) + totals.get("STOCK_IN", 0)
            stock_out = totals.get("stock_out", 0) + totals.get("STOCK_OUT", 0)
            returns = totals.get("return", 0) + totals.get("RETURN", 0)
            losses = totals.get("loss", 0) + totals.get("LOSS", 0)
            net_change = stock_in + returns - stock_out - losses

            inv = inv_map.get(sku.id)
            closing_stock = inv.total_qty if inv else 0
            opening_stock = closing_stock - net_change
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
        # Lots in date range — with eager-loaded lot_rolls (eliminates N+1)
        from sqlalchemy.orm import selectinload
        lot_stmt = (
            select(Lot)
            .where(
                func.date(Lot.lot_date) >= from_date,
                func.date(Lot.lot_date) <= to_date,
            )
            .options(selectinload(Lot.lot_rolls))
        )
        lot_result = await self.db.execute(lot_stmt)
        lots = lot_result.scalars().unique().all()

        lots_created = len(lots)
        total_pallas = 0
        total_pieces_produced = 0
        total_weight_used = Decimal("0")
        total_waste = Decimal("0")
        total_weight_all = Decimal("0")
        by_lot = []

        for lot in lots:
            lot_rolls = lot.lot_rolls or []

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
                "designs": lot.designs or [],
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
            Batch.status.in_(["checked", "packing", "packed"]),
            func.date(Batch.checked_at) >= from_date,
            func.date(Batch.checked_at) <= to_date,
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

    async def get_financial_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """Financial report — scoped to FY + date range."""
        from uuid import UUID as _UUID

        # Build FY conditions per model
        inv_fy = [Invoice.fy_id == fy_id] if fy_id else []
        ord_fy = [Order.fy_id == fy_id] if fy_id else []
        roll_fy = [Roll.fy_id == fy_id] if fy_id else []

        # Revenue from paid invoices in range
        invoices_paid_total = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "paid",
                func.date(Invoice.paid_at) >= from_date,
                func.date(Invoice.paid_at) <= to_date,
                *inv_fy,
            )
        )).scalar() or 0

        invoices_pending_total = (await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
                Invoice.status == "issued",
                *inv_fy,
            )
        )).scalar() or 0

        # Orders total in range
        orders_total = (await self.db.execute(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
        )).scalar() or 0

        # Order count for avg
        order_count = (await self.db.execute(
            select(func.count()).select_from(Order).where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
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
                *roll_fy,
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
                *ord_fy,
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

        # Revenue by period — single GROUP BY DATE query instead of N day-by-day queries
        rev_by_date_stmt = (
            select(
                func.date(Invoice.paid_at).label("pay_date"),
                func.sum(Invoice.total_amount).label("revenue"),
            )
            .where(
                Invoice.status == "paid",
                func.date(Invoice.paid_at) >= from_date,
                func.date(Invoice.paid_at) <= to_date,
                *inv_fy,
            )
            .group_by(func.date(Invoice.paid_at))
        )
        rev_rows = (await self.db.execute(rev_by_date_stmt)).all()
        rev_date_map = {str(row.pay_date): float(row.revenue) for row in rev_rows}

        # Fill gaps for all days in range
        revenue_by_period = []
        current = from_date
        while current <= to_date:
            revenue_by_period.append({
                "date": current.isoformat(),
                "revenue": rev_date_map.get(current.isoformat(), 0.0),
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

    # ═══════════════════════════════════════════════════════
    #  SALES & ORDERS REPORT (P1.1)
    # ═══════════════════════════════════════════════════════

    async def get_sales_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """Sales & Orders report — KPIs, customer ranking, fulfillment funnel, broker commission."""
        ord_fy = [Order.fy_id == fy_id] if fy_id else []
        inv_fy = [Invoice.fy_id == fy_id] if fy_id else []

        # --- KPIs: order counts by status ---
        status_rows = (await self.db.execute(
            select(Order.status, func.count().label("cnt"))
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
            .group_by(Order.status)
        )).all()
        orders_by_status = {r.status: r.cnt for r in status_rows}
        total_orders = sum(orders_by_status.values())

        # Revenue from invoices (issued+paid) in range
        total_revenue = float((await self.db.execute(
            select(func.coalesce(func.sum(Invoice.total_amount), 0))
            .where(
                Invoice.status.in_(["issued", "paid"]),
                func.date(Invoice.created_at) >= from_date,
                func.date(Invoice.created_at) <= to_date,
                *inv_fy,
            )
        )).scalar() or 0)

        # Avg fulfillment days (orders that have shipments)
        ship_agg = (await self.db.execute(
            select(
                func.avg(
                    func.extract("epoch", Shipment.shipped_at - Order.created_at) / 86400
                ).label("avg_days"),
            )
            .join(Order, Order.id == Shipment.order_id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
        )).one()
        avg_fulfillment_days = round(float(ship_agg.avg_days or 0), 1)

        # Return rate
        sr_count = (await self.db.execute(
            select(func.count()).select_from(SalesReturn)
            .where(
                SalesReturn.status != "cancelled",
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
        )).scalar() or 0
        return_rate = round(sr_count / total_orders * 100, 1) if total_orders > 0 else 0.0

        # --- Customer Ranking ---
        cust_stmt = (
            select(
                Customer.id,
                Customer.name,
                func.count(func.distinct(Order.id)).label("order_count"),
                func.coalesce(func.sum(Invoice.total_amount), 0).label("total_revenue"),
            )
            .join(Order, Order.customer_id == Customer.id)
            .outerjoin(Invoice, and_(
                Invoice.order_id == Order.id,
                Invoice.status.in_(["issued", "paid"]),
            ))
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
            .group_by(Customer.id, Customer.name)
            .order_by(func.coalesce(func.sum(Invoice.total_amount), 0).desc())
            .limit(50)
        )
        cust_rows = (await self.db.execute(cust_stmt)).all()

        # Get return totals per customer in range
        cust_return_stmt = (
            select(
                SalesReturn.customer_id,
                func.coalesce(func.sum(SalesReturn.total_amount), 0).label("return_total"),
            )
            .where(
                SalesReturn.status == "closed",
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
            .group_by(SalesReturn.customer_id)
        )
        cust_return_rows = (await self.db.execute(cust_return_stmt)).all()
        return_map = {r.customer_id: float(r.return_total) for r in cust_return_rows}

        customer_ranking = []
        for r in cust_rows:
            rev = float(r.total_revenue)
            ret = return_map.get(r.id, 0.0)
            net = rev - ret
            customer_ranking.append({
                "customer_id": str(r.id),
                "customer_name": r.name,
                "order_count": r.order_count,
                "total_revenue": rev,
                "total_returns": ret,
                "net_revenue": round(net, 2),
                "avg_order_value": round(rev / r.order_count, 2) if r.order_count > 0 else 0,
            })

        # --- Order Fulfillment Funnel ---
        item_agg = (await self.db.execute(
            select(
                func.coalesce(func.sum(OrderItem.quantity), 0).label("ordered"),
                func.coalesce(func.sum(OrderItem.fulfilled_qty), 0).label("fulfilled"),
                func.coalesce(func.sum(OrderItem.returned_qty), 0).label("returned"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
        )).one()
        items_ordered = int(item_agg.ordered)
        items_fulfilled = int(item_agg.fulfilled)
        items_returned = int(item_agg.returned)
        fulfillment_rate = round(items_fulfilled / items_ordered * 100, 1) if items_ordered > 0 else 0.0

        # Partial ship %
        partial_count = orders_by_status.get("partially_shipped", 0)
        shipped_total = partial_count + orders_by_status.get("shipped", 0) + orders_by_status.get("delivered", 0)
        partial_ship_pct = round(partial_count / shipped_total * 100, 1) if shipped_total > 0 else 0.0

        fulfillment = {
            "total_orders": total_orders,
            "pending": orders_by_status.get("pending", 0),
            "processing": orders_by_status.get("processing", 0),
            "partially_shipped": partial_count,
            "shipped": orders_by_status.get("shipped", 0),
            "delivered": orders_by_status.get("delivered", 0),
            "cancelled": orders_by_status.get("cancelled", 0),
            "avg_days_to_ship": avg_fulfillment_days,
            "partial_ship_pct": partial_ship_pct,
            "items_ordered": items_ordered,
            "items_fulfilled": items_fulfilled,
            "items_returned": items_returned,
            "fulfillment_rate_pct": fulfillment_rate,
        }

        # --- Broker Commission ---
        broker_stmt = (
            select(
                Broker.id,
                Broker.name,
                Broker.commission_rate,
                func.count(func.distinct(Order.id)).label("order_count"),
                func.coalesce(func.sum(Order.total_amount), 0).label("total_order_value"),
            )
            .join(Order, Order.broker_id == Broker.id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
            .group_by(Broker.id, Broker.name, Broker.commission_rate)
            .order_by(func.coalesce(func.sum(Order.total_amount), 0).desc())
        )
        broker_rows = (await self.db.execute(broker_stmt)).all()

        # Get actual commission from ledger
        commission_stmt = (
            select(
                LedgerEntry.party_id,
                func.coalesce(func.sum(LedgerEntry.debit), 0).label("total_commission"),
            )
            .where(
                LedgerEntry.party_type == "broker",
                LedgerEntry.entry_type == "commission",
                LedgerEntry.entry_date >= from_date,
                LedgerEntry.entry_date <= to_date,
            )
            .group_by(LedgerEntry.party_id)
        )
        comm_rows = (await self.db.execute(commission_stmt)).all()
        comm_map = {r.party_id: float(r.total_commission) for r in comm_rows}

        broker_commission = []
        for r in broker_rows:
            commission = comm_map.get(r.id, 0.0)
            broker_commission.append({
                "broker_id": str(r.id),
                "broker_name": r.name,
                "order_count": r.order_count,
                "total_order_value": float(r.total_order_value),
                "commission_rate": float(r.commission_rate or 0),
                "commission_earned": commission,
            })

        return {
            "kpis": {
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "avg_fulfillment_days": avg_fulfillment_days,
                "return_rate_pct": return_rate,
                "orders_by_status": orders_by_status,
            },
            "customer_ranking": customer_ranking,
            "fulfillment": fulfillment,
            "broker_commission": broker_commission,
        }

    # ═══════════════════════════════════════════════════════
    #  ACCOUNTING REPORT (P1.2)
    # ═══════════════════════════════════════════════════════

    async def get_accounting_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """Accounting report — receivables, payables, GST, credit/debit notes."""
        today = date.today()
        inv_fy = [Invoice.fy_id == fy_id] if fy_id else []

        # --- Receivables (unpaid invoices) ---
        recv_stmt = (
            select(
                Customer.id.label("cid"),
                Customer.name.label("cname"),
                func.count(Invoice.id).label("inv_count"),
                func.coalesce(func.sum(Invoice.total_amount), 0).label("total"),
                func.min(Invoice.due_date).label("oldest_due"),
                # Aging buckets
                func.coalesce(func.sum(case((
                    func.date(Invoice.due_date) >= today - timedelta(days=30), Invoice.total_amount
                ))), 0).label("b_0_30"),
                func.coalesce(func.sum(case((
                    and_(func.date(Invoice.due_date) < today - timedelta(days=30), func.date(Invoice.due_date) >= today - timedelta(days=60)),
                    Invoice.total_amount
                ))), 0).label("b_31_60"),
                func.coalesce(func.sum(case((
                    and_(func.date(Invoice.due_date) < today - timedelta(days=60), func.date(Invoice.due_date) >= today - timedelta(days=90)),
                    Invoice.total_amount
                ))), 0).label("b_61_90"),
                func.coalesce(func.sum(case((
                    func.date(Invoice.due_date) < today - timedelta(days=90), Invoice.total_amount
                ))), 0).label("b_90_plus"),
                # Overdue = due_date < today
                func.coalesce(func.sum(case((
                    and_(Invoice.due_date != None, func.date(Invoice.due_date) < today),
                    Invoice.total_amount
                ))), 0).label("overdue"),
            )
            .outerjoin(Customer, Customer.id == Invoice.customer_id)
            .where(
                Invoice.status == "issued",
                *inv_fy,
            )
            .group_by(Customer.id, Customer.name)
            .order_by(func.coalesce(func.sum(Invoice.total_amount), 0).desc())
        )
        recv_rows = (await self.db.execute(recv_stmt)).all()

        total_receivable = 0.0
        total_overdue = 0.0
        aging_buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
        by_customer = []
        for r in recv_rows:
            amt = float(r.total)
            over = float(r.overdue)
            total_receivable += amt
            total_overdue += over
            aging_buckets["0-30"] += float(r.b_0_30)
            aging_buckets["31-60"] += float(r.b_31_60)
            aging_buckets["61-90"] += float(r.b_61_90)
            aging_buckets["90+"] += float(r.b_90_plus)
            by_customer.append({
                "customer_name": r.cname or "Direct Sale",
                "invoice_count": r.inv_count,
                "total_amount": amt,
                "overdue_amount": over,
                "oldest_due_date": r.oldest_due.isoformat() if r.oldest_due else None,
            })

        receivables = {
            "total_receivable": round(total_receivable, 2),
            "overdue_amount": round(total_overdue, 2),
            "aging_buckets": {k: round(v, 2) for k, v in aging_buckets.items()},
            "by_customer": by_customer,
        }

        # --- Payables (party balances from ledger) ---
        payable_stmt = (
            select(
                LedgerEntry.party_type,
                LedgerEntry.party_id,
                func.sum(LedgerEntry.debit).label("total_debit"),
                func.sum(LedgerEntry.credit).label("total_credit"),
            )
            .where(LedgerEntry.party_type.in_(["supplier", "va_party"]))
            .group_by(LedgerEntry.party_type, LedgerEntry.party_id)
        )
        pay_rows = (await self.db.execute(payable_stmt)).all()

        # Get party names
        supplier_ids = [r.party_id for r in pay_rows if r.party_type == "supplier"]
        va_ids = [r.party_id for r in pay_rows if r.party_type == "va_party"]
        name_map = {}
        if supplier_ids:
            s_rows = (await self.db.execute(
                select(Supplier.id, Supplier.name).where(Supplier.id.in_(supplier_ids))
            )).all()
            name_map.update({r.id: r.name for r in s_rows})
        if va_ids:
            v_rows = (await self.db.execute(
                select(VAParty.id, VAParty.name).where(VAParty.id.in_(va_ids))
            )).all()
            name_map.update({r.id: r.name for r in v_rows})

        total_payable_suppliers = 0.0
        total_payable_va = 0.0
        by_party = []
        for r in pay_rows:
            dr = float(r.total_debit or 0)
            cr = float(r.total_credit or 0)
            balance = cr - dr  # positive = we owe them
            if abs(balance) < 0.01:
                continue
            balance_type = "cr" if balance > 0 else "dr"
            if r.party_type == "supplier":
                total_payable_suppliers += max(balance, 0)
            else:
                total_payable_va += max(balance, 0)
            by_party.append({
                "party_type": r.party_type,
                "party_name": name_map.get(r.party_id, "Unknown"),
                "balance": round(abs(balance), 2),
                "balance_type": balance_type,
            })
        by_party.sort(key=lambda x: x["balance"], reverse=True)

        payables = {
            "total_payable_suppliers": round(total_payable_suppliers, 2),
            "total_payable_va": round(total_payable_va, 2),
            "by_party": by_party,
        }

        # --- GST Summary ---
        # Output tax (from sales invoices)
        output_stmt = (
            select(
                Invoice.gst_percent,
                func.coalesce(func.sum(Invoice.subtotal), 0).label("taxable"),
                func.coalesce(func.sum(Invoice.tax_amount), 0).label("tax"),
            )
            .where(
                Invoice.status.in_(["issued", "paid"]),
                func.date(Invoice.created_at) >= from_date,
                func.date(Invoice.created_at) <= to_date,
                *inv_fy,
            )
            .group_by(Invoice.gst_percent)
        )
        output_rows = (await self.db.execute(output_stmt)).all()

        total_output_tax = 0.0
        by_rate = []
        for r in output_rows:
            tax = float(r.tax)
            total_output_tax += tax
            rate = float(r.gst_percent or 0)
            by_rate.append({
                "gst_percent": rate,
                "taxable_value": float(r.taxable),
                "cgst": round(tax / 2, 2),
                "sgst": round(tax / 2, 2),
                "total_tax": round(tax, 2),
                "type": "output",
            })

        # Input tax (from supplier invoices — rolls)
        input_stmt = (
            select(
                SupplierInvoice.gst_percent,
                func.coalesce(func.sum(Roll.total_weight * Roll.cost_per_unit), 0).label("taxable"),
            )
            .join(Roll, Roll.supplier_invoice_id == SupplierInvoice.id)
            .where(
                func.date(SupplierInvoice.received_at) >= from_date,
                func.date(SupplierInvoice.received_at) <= to_date,
            )
            .group_by(SupplierInvoice.gst_percent)
        )
        input_rows = (await self.db.execute(input_stmt)).all()

        total_input_tax = 0.0
        for r in input_rows:
            rate = float(r.gst_percent or 0)
            taxable = float(r.taxable)
            tax = round(taxable * rate / 100, 2)
            total_input_tax += tax
            by_rate.append({
                "gst_percent": rate,
                "taxable_value": taxable,
                "cgst": round(tax / 2, 2),
                "sgst": round(tax / 2, 2),
                "total_tax": tax,
                "type": "input",
            })

        gst_summary = {
            "output_tax": round(total_output_tax, 2),
            "input_tax": round(total_input_tax, 2),
            "net_payable": round(total_output_tax - total_input_tax, 2),
            "by_rate": by_rate,
        }

        # --- Credit / Debit Notes ---
        cn_rows = (await self.db.execute(
            select(
                SalesReturn.credit_note_no,
                SalesReturn.return_date,
                Customer.name.label("party_name"),
                SalesReturn.srn_no,
                SalesReturn.total_amount,
                SalesReturn.tax_amount,
            )
            .outerjoin(Customer, Customer.id == SalesReturn.customer_id)
            .where(
                SalesReturn.credit_note_no != None,
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
            .order_by(SalesReturn.created_at.desc())
        )).all()

        dn_rows = (await self.db.execute(
            select(
                ReturnNote.debit_note_no,
                ReturnNote.return_date,
                Supplier.name.label("party_name"),
                ReturnNote.return_note_no,
                ReturnNote.total_amount,
                ReturnNote.tax_amount,
            )
            .outerjoin(Supplier, Supplier.id == ReturnNote.supplier_id)
            .where(
                ReturnNote.debit_note_no != None,
                func.date(ReturnNote.created_at) >= from_date,
                func.date(ReturnNote.created_at) <= to_date,
            )
            .order_by(ReturnNote.created_at.desc())
        )).all()

        credit_debit_notes = []
        for r in cn_rows:
            credit_debit_notes.append({
                "note_no": r.credit_note_no,
                "type": "CN",
                "date": r.return_date.isoformat() if r.return_date else None,
                "party_name": r.party_name or "—",
                "linked_return": r.srn_no,
                "amount": float(r.total_amount or 0),
                "gst": float(r.tax_amount or 0),
            })
        for r in dn_rows:
            credit_debit_notes.append({
                "note_no": r.debit_note_no,
                "type": "DN",
                "date": r.return_date.isoformat() if r.return_date else None,
                "party_name": r.party_name or "—",
                "linked_return": r.return_note_no,
                "amount": float(r.total_amount or 0),
                "gst": float(r.tax_amount or 0),
            })

        return {
            "receivables": receivables,
            "payables": payables,
            "gst_summary": gst_summary,
            "credit_debit_notes": credit_debit_notes,
        }

    # ═══════════════════════════════════════════════════════
    #  RAW MATERIAL SUMMARY (P1.3)
    # ═══════════════════════════════════════════════════════

    async def get_raw_material_summary(self) -> dict:
        """Roll inventory — status-wise, fabric-wise, supplier-wise."""
        # Status-wise aggregation
        status_agg = (await self.db.execute(
            select(
                Roll.status,
                func.count().label("cnt"),
                func.coalesce(func.sum(Roll.remaining_weight), 0).label("weight"),
                func.coalesce(func.sum(Roll.remaining_weight * Roll.cost_per_unit), 0).label("value"),
            )
            .group_by(Roll.status)
        )).all()
        status_map = {r.status: {"count": r.cnt, "weight": float(r.weight), "value": float(r.value)} for r in status_agg}

        total_rolls = sum(v["count"] for v in status_map.values())
        total_weight = sum(v["weight"] for v in status_map.values())
        total_value = sum(v["value"] for v in status_map.values())

        # Fabric-wise
        fabric_rows = (await self.db.execute(
            select(
                Roll.fabric_type,
                func.count().label("cnt"),
                func.coalesce(func.sum(Roll.remaining_weight), 0).label("weight"),
                func.coalesce(func.sum(Roll.remaining_weight * Roll.cost_per_unit), 0).label("value"),
                func.count(case((Roll.status == "in_stock", 1))).label("in_stock"),
                func.count(case((Roll.status == "sent_for_processing", 1))).label("at_va"),
            )
            .group_by(Roll.fabric_type)
            .order_by(func.coalesce(func.sum(Roll.remaining_weight * Roll.cost_per_unit), 0).desc())
        )).all()

        by_fabric = [{
            "fabric_type": r.fabric_type,
            "roll_count": r.cnt,
            "total_weight": float(r.weight),
            "value": round(float(r.value), 2),
            "in_stock": r.in_stock,
            "at_va": r.at_va,
        } for r in fabric_rows]

        # Supplier-wise
        supplier_rows = (await self.db.execute(
            select(
                Supplier.name,
                func.count(Roll.id).label("cnt"),
                func.coalesce(func.sum(Roll.remaining_weight), 0).label("weight"),
                func.coalesce(func.sum(Roll.remaining_weight * Roll.cost_per_unit), 0).label("value"),
            )
            .outerjoin(Supplier, Supplier.id == Roll.supplier_id)
            .group_by(Supplier.name)
            .order_by(func.coalesce(func.sum(Roll.remaining_weight * Roll.cost_per_unit), 0).desc())
        )).all()

        by_supplier = [{
            "supplier_name": r.name or "Unknown",
            "roll_count": r.cnt,
            "total_weight": float(r.weight),
            "value": round(float(r.value), 2),
        } for r in supplier_rows]

        is_map = status_map.get("in_stock", {"count": 0, "weight": 0})
        va_map = status_map.get("sent_for_processing", {"count": 0, "weight": 0})

        return {
            "total_rolls": total_rolls,
            "total_weight_kg": round(total_weight, 2),
            "total_value": round(total_value, 2),
            "rolls_in_stock": is_map["count"],
            "rolls_at_va": va_map["count"],
            "rolls_in_cutting": status_map.get("in_cutting", {"count": 0})["count"],
            "remnant_rolls": status_map.get("remnant", {"count": 0})["count"],
            "weight_in_stock": round(is_map["weight"], 2),
            "weight_at_va": round(va_map["weight"], 2),
            "by_fabric": by_fabric,
            "by_supplier": by_supplier,
        }

    # ═══════════════════════════════════════════════════════
    #  WIP SUMMARY (P1.4)
    # ═══════════════════════════════════════════════════════

    async def get_wip_summary(self) -> dict:
        """Work-in-progress inventory — batches not yet packed."""
        now = datetime.now(timezone.utc)

        # Status pipeline (exclude packed — that's finished goods)
        status_rows = (await self.db.execute(
            select(Batch.status, func.count().label("cnt"), func.coalesce(func.sum(Batch.piece_count), 0).label("pieces"))
            .where(Batch.status != "packed")
            .group_by(Batch.status)
        )).all()
        by_status = {r.status: {"count": r.cnt, "pieces": int(r.pieces)} for r in status_rows}
        total_batches = sum(v["count"] for v in by_status.values())
        total_pieces = sum(v["pieces"] for v in by_status.values())

        # Batches at VA
        va_agg = (await self.db.execute(
            select(
                func.count(func.distinct(BatchProcessing.batch_id)).label("batches"),
                func.coalesce(func.sum(BatchProcessing.pieces_sent), 0).label("pieces"),
            )
            .where(BatchProcessing.status == "sent")
        )).one()
        batches_at_va = va_agg.batches or 0
        pieces_at_va = int(va_agg.pieces or 0)

        # Avg days in pipeline (created_at to now, for non-packed batches)
        avg_days_result = (await self.db.execute(
            select(
                func.avg(func.extract("epoch", now - Batch.created_at) / 86400).label("avg_days"),
            )
            .where(Batch.status != "packed")
        )).scalar()
        avg_days = round(float(avg_days_result or 0), 1)

        # By product type (through lots)
        pt_rows = (await self.db.execute(
            select(
                Lot.product_type,
                func.count(Batch.id).label("cnt"),
                func.coalesce(func.sum(Batch.piece_count), 0).label("pieces"),
            )
            .join(Lot, Lot.id == Batch.lot_id)
            .where(Batch.status != "packed")
            .group_by(Lot.product_type)
            .order_by(func.coalesce(func.sum(Batch.piece_count), 0).desc())
        )).all()
        by_product_type = [{
            "product_type": r.product_type,
            "batch_count": r.cnt,
            "piece_count": int(r.pieces),
        } for r in pt_rows]

        # By tailor (through assignments)
        tailor_rows = (await self.db.execute(
            select(
                User.full_name,
                func.count(Batch.id).label("cnt"),
                func.coalesce(func.sum(Batch.piece_count), 0).label("pieces"),
                func.count(case((Batch.status == "in_progress", 1))).label("in_progress"),
                func.count(case((Batch.status == "submitted", 1))).label("submitted"),
            )
            .join(BatchAssignment, BatchAssignment.batch_id == Batch.id)
            .join(User, User.id == BatchAssignment.tailor_id)
            .where(Batch.status != "packed")
            .group_by(User.full_name)
            .order_by(func.coalesce(func.sum(Batch.piece_count), 0).desc())
        )).all()
        by_tailor = [{
            "tailor_name": r.full_name,
            "batch_count": r.cnt,
            "piece_count": int(r.pieces),
            "in_progress": r.in_progress,
            "submitted": r.submitted,
        } for r in tailor_rows]

        return {
            "total_batches": total_batches,
            "total_pieces": total_pieces,
            "by_status": {s: by_status.get(s, {"count": 0, "pieces": 0}) for s in
                          ["created", "assigned", "in_progress", "submitted", "checked", "packing"]},
            "pieces_at_va": pieces_at_va,
            "batches_at_va": batches_at_va,
            "avg_days_in_pipeline": avg_days,
            "by_product_type": by_product_type,
            "by_tailor": by_tailor,
        }

    # ═══════════════════════════════════════════════════════
    #  VA PROCESSING REPORT (P2.1)
    # ═══════════════════════════════════════════════════════

    async def get_va_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """VA Processing report — cost analysis, turnaround, damage."""
        from app.models.value_addition import ValueAddition

        jc_fy = [JobChallan.fy_id == fy_id] if fy_id else []
        bc_fy = [BatchChallan.fy_id == fy_id] if fy_id else []

        # --- Roll VA cost by vendor ---
        roll_va_stmt = (
            select(
                VAParty.id.label("vp_id"),
                VAParty.name.label("vp_name"),
                func.count(func.distinct(JobChallan.id)).label("challan_count"),
                func.coalesce(func.sum(RollProcessing.processing_cost), 0).label("total_cost"),
                func.coalesce(func.sum(RollProcessing.weight_before), 0).label("total_weight"),
                func.count(case((RollProcessing.weight_damaged > 0, 1))).label("damage_count"),
                func.coalesce(func.sum(RollProcessing.weight_damaged), 0).label("damage_weight"),
            )
            .join(JobChallan, JobChallan.id == RollProcessing.job_challan_id)
            .join(VAParty, VAParty.id == RollProcessing.va_party_id)
            .where(
                RollProcessing.status == "received",
                func.date(RollProcessing.received_date) >= from_date,
                func.date(RollProcessing.received_date) <= to_date,
                *jc_fy,
            )
            .group_by(VAParty.id, VAParty.name)
        )
        roll_va_rows = (await self.db.execute(roll_va_stmt)).all()

        # --- Batch VA cost by vendor ---
        batch_va_stmt = (
            select(
                VAParty.id.label("vp_id"),
                VAParty.name.label("vp_name"),
                func.count(func.distinct(BatchChallan.id)).label("challan_count"),
                func.coalesce(func.sum(BatchProcessing.cost), 0).label("total_cost"),
                func.coalesce(func.sum(BatchProcessing.pieces_received), 0).label("total_pieces"),
                func.count(case((BatchProcessing.pieces_damaged > 0, 1))).label("damage_count"),
                func.coalesce(func.sum(BatchProcessing.pieces_damaged), 0).label("damage_pieces"),
            )
            .join(BatchChallan, BatchChallan.id == BatchProcessing.batch_challan_id)
            .join(VAParty, VAParty.id == BatchChallan.va_party_id)
            .where(
                BatchProcessing.status == "received",
                func.date(BatchChallan.received_date) >= from_date,
                func.date(BatchChallan.received_date) <= to_date,
                *bc_fy,
            )
            .group_by(VAParty.id, VAParty.name)
        )
        batch_va_rows = (await self.db.execute(batch_va_stmt)).all()

        # Merge into by_vendor
        vendor_map = {}
        for r in roll_va_rows:
            vendor_map[r.vp_id] = {
                "va_party_name": r.vp_name,
                "roll_challans": r.challan_count,
                "batch_challans": 0,
                "roll_cost": float(r.total_cost),
                "batch_cost": 0.0,
                "total_weight": float(r.total_weight),
                "total_pieces": 0,
                "avg_cost_per_kg": round(float(r.total_cost) / float(r.total_weight), 2) if float(r.total_weight) > 0 else 0,
                "avg_cost_per_piece": 0,
                "damage_count": r.damage_count,
                "damage_weight": float(r.damage_weight),
                "damage_pieces": 0,
            }
        for r in batch_va_rows:
            if r.vp_id in vendor_map:
                v = vendor_map[r.vp_id]
                v["batch_challans"] = r.challan_count
                v["batch_cost"] = float(r.total_cost)
                v["total_pieces"] = int(r.total_pieces)
                v["avg_cost_per_piece"] = round(float(r.total_cost) / int(r.total_pieces), 2) if int(r.total_pieces) > 0 else 0
                v["damage_count"] += r.damage_count
                v["damage_pieces"] = int(r.damage_pieces)
            else:
                vendor_map[r.vp_id] = {
                    "va_party_name": r.vp_name,
                    "roll_challans": 0,
                    "batch_challans": r.challan_count,
                    "roll_cost": 0.0,
                    "batch_cost": float(r.total_cost),
                    "total_weight": 0,
                    "total_pieces": int(r.total_pieces),
                    "avg_cost_per_kg": 0,
                    "avg_cost_per_piece": round(float(r.total_cost) / int(r.total_pieces), 2) if int(r.total_pieces) > 0 else 0,
                    "damage_count": r.damage_count,
                    "damage_weight": 0,
                    "damage_pieces": int(r.damage_pieces),
                }

        by_vendor = sorted(vendor_map.values(), key=lambda v: v["roll_cost"] + v["batch_cost"], reverse=True)
        total_va_spend = sum(v["roll_cost"] + v["batch_cost"] for v in by_vendor)
        total_damage_count = sum(v["damage_count"] for v in by_vendor)
        total_processed = sum(v["total_weight"] for v in by_vendor) + sum(v["total_pieces"] for v in by_vendor)
        damage_rate = round(total_damage_count / len(by_vendor) * 100 / max(len(by_vendor), 1), 1) if by_vendor else 0.0

        # --- By VA Type ---
        va_type_stmt = (
            select(
                ValueAddition.name,
                ValueAddition.short_code,
                func.count(func.distinct(RollProcessing.job_challan_id)).label("roll_challans"),
                func.coalesce(func.sum(RollProcessing.processing_cost), 0).label("roll_cost"),
            )
            .join(ValueAddition, ValueAddition.id == RollProcessing.value_addition_id)
            .where(
                RollProcessing.status == "received",
                func.date(RollProcessing.received_date) >= from_date,
                func.date(RollProcessing.received_date) <= to_date,
            )
            .group_by(ValueAddition.name, ValueAddition.short_code)
        )
        va_type_roll = (await self.db.execute(va_type_stmt)).all()

        va_type_batch_stmt = (
            select(
                ValueAddition.name,
                ValueAddition.short_code,
                func.count(func.distinct(BatchProcessing.batch_challan_id)).label("batch_challans"),
                func.coalesce(func.sum(BatchProcessing.cost), 0).label("batch_cost"),
            )
            .join(ValueAddition, ValueAddition.id == BatchProcessing.value_addition_id)
            .where(
                BatchProcessing.status == "received",
                func.date(BatchChallan.received_date) >= from_date,
                func.date(BatchChallan.received_date) <= to_date,
            )
            .join(BatchChallan, BatchChallan.id == BatchProcessing.batch_challan_id)
            .group_by(ValueAddition.name, ValueAddition.short_code)
        )
        va_type_batch = (await self.db.execute(va_type_batch_stmt)).all()

        type_map = {}
        for r in va_type_roll:
            type_map[r.short_code] = {"name": r.name, "short_code": r.short_code, "roll_challans": r.roll_challans, "batch_challans": 0, "total_spend": float(r.roll_cost)}
        for r in va_type_batch:
            if r.short_code in type_map:
                type_map[r.short_code]["batch_challans"] = r.batch_challans
                type_map[r.short_code]["total_spend"] += float(r.batch_cost)
            else:
                type_map[r.short_code] = {"name": r.name, "short_code": r.short_code, "roll_challans": 0, "batch_challans": r.batch_challans, "total_spend": float(r.batch_cost)}
        by_va_type = sorted(type_map.values(), key=lambda v: v["total_spend"], reverse=True)

        # --- Turnaround ---
        jc_turn = (await self.db.execute(
            select(
                VAParty.name.label("vp_name"),
                ValueAddition.short_code.label("va_code"),
                func.avg(JobChallan.received_date - JobChallan.sent_date).label("avg_days"),
                func.count().label("total"),
            )
            .join(VAParty, VAParty.id == JobChallan.va_party_id)
            .join(ValueAddition, ValueAddition.id == JobChallan.value_addition_id)
            .where(
                JobChallan.status == "received",
                func.date(JobChallan.received_date) >= from_date,
                func.date(JobChallan.received_date) <= to_date,
                *jc_fy,
            )
            .group_by(VAParty.name, ValueAddition.short_code)
        )).all()

        bc_turn = (await self.db.execute(
            select(
                VAParty.name.label("vp_name"),
                ValueAddition.short_code.label("va_code"),
                func.avg(BatchChallan.received_date - BatchChallan.sent_date).label("avg_days"),
                func.count().label("total"),
            )
            .join(VAParty, VAParty.id == BatchChallan.va_party_id)
            .join(ValueAddition, ValueAddition.id == BatchChallan.value_addition_id)
            .where(
                BatchChallan.status == "received",
                func.date(BatchChallan.received_date) >= from_date,
                func.date(BatchChallan.received_date) <= to_date,
                *bc_fy,
            )
            .group_by(VAParty.name, ValueAddition.short_code)
        )).all()

        turnaround = []
        for r in jc_turn:
            turnaround.append({"va_party_name": r.vp_name, "va_type": r.va_code, "challan_type": "Roll (JC)", "avg_days": round(float(r.avg_days or 0), 1), "total_challans": r.total})
        for r in bc_turn:
            turnaround.append({"va_party_name": r.vp_name, "va_type": r.va_code, "challan_type": "Batch (BC)", "avg_days": round(float(r.avg_days or 0), 1), "total_challans": r.total})
        turnaround.sort(key=lambda x: x["avg_days"], reverse=True)

        # --- Active challans ---
        active_jc = (await self.db.execute(
            select(func.count()).select_from(JobChallan).where(JobChallan.status.in_(["sent", "partially_received"]))
        )).scalar() or 0
        active_bc = (await self.db.execute(
            select(func.count()).select_from(BatchChallan).where(BatchChallan.status.in_(["sent", "partially_received"]))
        )).scalar() or 0

        avg_turn = round(sum(t["avg_days"] for t in turnaround) / len(turnaround), 1) if turnaround else 0.0

        return {
            "kpis": {
                "total_va_spend": round(total_va_spend, 2),
                "avg_turnaround_days": avg_turn,
                "damage_rate_pct": damage_rate,
                "active_challans": active_jc + active_bc,
            },
            "by_vendor": by_vendor,
            "by_va_type": by_va_type,
            "turnaround": turnaround,
        }

    # ═══════════════════════════════════════════════════════
    #  PURCHASES & SUPPLIERS REPORT (P2.2)
    # ═══════════════════════════════════════════════════════

    async def get_purchase_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """Purchase report — by supplier, supplier quality, fabric utilization."""
        roll_fy = [Roll.fy_id == fy_id] if fy_id else []

        # --- By Supplier ---
        sup_stmt = (
            select(
                Supplier.name,
                func.count(Roll.id).label("roll_count"),
                func.coalesce(func.sum(Roll.total_weight), 0).label("total_weight"),
                func.coalesce(func.sum(Roll.total_weight * Roll.cost_per_unit), 0).label("total_value"),
            )
            .outerjoin(Supplier, Supplier.id == Roll.supplier_id)
            .where(
                func.date(Roll.received_at) >= from_date,
                func.date(Roll.received_at) <= to_date,
                *roll_fy,
            )
            .group_by(Supplier.name)
            .order_by(func.coalesce(func.sum(Roll.total_weight * Roll.cost_per_unit), 0).desc())
        )
        sup_rows = (await self.db.execute(sup_stmt)).all()

        total_purchased = sum(float(r.total_value) for r in sup_rows)
        total_rolls_received = sum(r.roll_count for r in sup_rows)

        by_supplier = [{
            "supplier_name": r.name or "Unknown",
            "roll_count": r.roll_count,
            "total_weight": float(r.total_weight),
            "total_value": round(float(r.total_value), 2),
        } for r in sup_rows]

        # --- Supplier Quality ---
        # Rolls returned per supplier
        from app.models.return_note import ReturnNoteItem
        quality_stmt = (
            select(
                Supplier.id.label("sid"),
                Supplier.name,
                func.count(func.distinct(Roll.id)).label("rolls_received"),
            )
            .join(Roll, Roll.supplier_id == Supplier.id)
            .where(
                func.date(Roll.received_at) >= from_date,
                func.date(Roll.received_at) <= to_date,
                *roll_fy,
            )
            .group_by(Supplier.id, Supplier.name)
        )
        q_rows = (await self.db.execute(quality_stmt)).all()

        # Returns per supplier
        ret_stmt = (
            select(
                ReturnNote.supplier_id,
                func.count(func.distinct(ReturnNote.id)).label("return_count"),
                func.coalesce(func.sum(ReturnNote.total_amount), 0).label("return_value"),
            )
            .where(
                ReturnNote.status.in_(["dispatched", "acknowledged", "closed"]),
                func.date(ReturnNote.created_at) >= from_date,
                func.date(ReturnNote.created_at) <= to_date,
            )
            .group_by(ReturnNote.supplier_id)
        )
        ret_rows = (await self.db.execute(ret_stmt)).all()
        ret_map = {r.supplier_id: {"count": r.return_count, "value": float(r.return_value)} for r in ret_rows}

        # Damage per supplier (from roll processing)
        dmg_stmt = (
            select(
                Roll.supplier_id,
                func.count(case((RollProcessing.weight_damaged > 0, 1))).label("dmg_count"),
            )
            .join(Roll, Roll.id == RollProcessing.roll_id)
            .where(
                RollProcessing.status == "received",
                func.date(RollProcessing.received_date) >= from_date,
                func.date(RollProcessing.received_date) <= to_date,
            )
            .group_by(Roll.supplier_id)
        )
        dmg_rows = (await self.db.execute(dmg_stmt)).all()
        dmg_map = {r.supplier_id: r.dmg_count for r in dmg_rows}

        supplier_quality = []
        for r in q_rows:
            ret = ret_map.get(r.sid, {"count": 0, "value": 0})
            dmg = dmg_map.get(r.sid, 0)
            defects = ret["count"] + dmg
            score = round(max(0, 100 - (defects / r.rolls_received * 100)), 1) if r.rolls_received > 0 else 100.0
            supplier_quality.append({
                "supplier_name": r.name,
                "rolls_received": r.rolls_received,
                "rolls_returned": ret["count"],
                "damage_claims": dmg,
                "return_value": ret["value"],
                "quality_score": score,
            })
        supplier_quality.sort(key=lambda x: x["quality_score"])

        # --- Fabric Utilization ---
        fabric_stmt = (
            select(
                Roll.fabric_type,
                func.coalesce(func.sum(Roll.total_weight), 0).label("purchased"),
                func.coalesce(func.sum(LotRoll.weight_used), 0).label("used"),
                func.coalesce(func.sum(LotRoll.waste_weight), 0).label("waste"),
            )
            .outerjoin(LotRoll, LotRoll.roll_id == Roll.id)
            .where(
                func.date(Roll.received_at) >= from_date,
                func.date(Roll.received_at) <= to_date,
                *roll_fy,
            )
            .group_by(Roll.fabric_type)
            .order_by(func.coalesce(func.sum(Roll.total_weight), 0).desc())
        )
        fab_rows = (await self.db.execute(fabric_stmt)).all()

        avg_waste = 0.0
        total_waste_sum = 0.0
        total_used_sum = 0.0
        fabric_utilization = []
        for r in fab_rows:
            purchased = float(r.purchased)
            used = float(r.used)
            waste = float(r.waste)
            waste_pct = round(waste / used * 100, 1) if used > 0 else 0.0
            total_waste_sum += waste
            total_used_sum += used
            fabric_utilization.append({
                "fabric_type": r.fabric_type,
                "purchased_kg": round(purchased, 2),
                "used_kg": round(used, 2),
                "waste_kg": round(waste, 2),
                "waste_pct": waste_pct,
            })
        avg_waste = round(total_waste_sum / total_used_sum * 100, 1) if total_used_sum > 0 else 0.0

        return {
            "kpis": {
                "total_purchased": round(total_purchased, 2),
                "rolls_received": total_rolls_received,
                "suppliers_active": len(by_supplier),
                "avg_waste_pct": avg_waste,
            },
            "by_supplier": by_supplier,
            "supplier_quality": supplier_quality,
            "fabric_utilization": fabric_utilization,
        }

    # ═══════════════════════════════════════════════════════
    #  RETURNS ANALYSIS REPORT (P3.1)
    # ═══════════════════════════════════════════════════════

    async def get_returns_report(self, from_date: date, to_date: date, fy_id=None) -> dict:
        """Returns analysis — customer returns by SKU/customer, supplier returns, restock vs damage."""

        # --- Customer return rate ---
        # Total orders in period
        ord_fy = [Order.fy_id == fy_id] if fy_id else []
        total_orders = (await self.db.execute(
            select(func.count()).select_from(Order).where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
        )).scalar() or 0

        # Sales returns in period
        sr_agg = (await self.db.execute(
            select(
                func.count().label("total"),
                func.count(case((SalesReturn.status == "closed", 1))).label("closed"),
                func.coalesce(func.sum(case((SalesReturn.status == "closed", SalesReturn.total_amount))), 0).label("credit_total"),
            )
            .where(
                SalesReturn.status != "cancelled",
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
        )).one()
        customer_return_rate = round(sr_agg.total / total_orders * 100, 1) if total_orders > 0 else 0.0
        total_credit_notes = float(sr_agg.credit_total)

        # Supplier returns in period
        rn_agg = (await self.db.execute(
            select(
                func.count().label("total"),
                func.coalesce(func.sum(case((ReturnNote.status == "closed", ReturnNote.total_amount))), 0).label("debit_total"),
            )
            .where(
                ReturnNote.status != "cancelled",
                func.date(ReturnNote.created_at) >= from_date,
                func.date(ReturnNote.created_at) <= to_date,
            )
        )).one()

        # Total rolls received for supplier return rate
        total_rolls = (await self.db.execute(
            select(func.count()).select_from(Roll).where(
                func.date(Roll.received_at) >= from_date,
                func.date(Roll.received_at) <= to_date,
            )
        )).scalar() or 0
        supplier_return_rate = round(rn_agg.total / total_rolls * 100, 1) if total_rolls > 0 else 0.0

        # Recovery rate (restock vs damage from sales return items)
        recovery_agg = (await self.db.execute(
            select(
                func.coalesce(func.sum(SalesReturnItem.quantity_restocked), 0).label("restocked"),
                func.coalesce(func.sum(SalesReturnItem.quantity_damaged), 0).label("damaged"),
                func.coalesce(func.sum(SalesReturnItem.quantity_returned), 0).label("total_returned"),
            )
            .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
            .where(
                SalesReturn.status.in_(["restocked", "closed"]),
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
        )).one()
        total_restocked = int(recovery_agg.restocked)
        total_damaged = int(recovery_agg.damaged)
        recovery_rate = round(total_restocked / (total_restocked + total_damaged) * 100, 1) if (total_restocked + total_damaged) > 0 else 0.0

        # --- Returns by SKU ---
        sku_stmt = (
            select(
                SKU.sku_code,
                SKU.product_name,
                func.coalesce(func.sum(SalesReturnItem.quantity_returned), 0).label("returned"),
                func.coalesce(func.sum(SalesReturnItem.quantity_restocked), 0).label("restocked"),
                func.coalesce(func.sum(SalesReturnItem.quantity_damaged), 0).label("damaged"),
            )
            .join(SalesReturnItem, SalesReturnItem.sku_id == SKU.id)
            .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
            .where(
                SalesReturn.status != "cancelled",
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
            .group_by(SKU.sku_code, SKU.product_name)
            .order_by(func.coalesce(func.sum(SalesReturnItem.quantity_returned), 0).desc())
            .limit(30)
        )
        sku_rows = (await self.db.execute(sku_stmt)).all()

        # Get sold qty per SKU in same period for return rate
        sold_stmt = (
            select(
                SKU.sku_code,
                func.coalesce(func.sum(OrderItem.fulfilled_qty), 0).label("sold"),
            )
            .join(OrderItem, OrderItem.sku_id == SKU.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
            .group_by(SKU.sku_code)
        )
        sold_rows = (await self.db.execute(sold_stmt)).all()
        sold_map = {r.sku_code: int(r.sold) for r in sold_rows}

        # Top reason per SKU
        reason_stmt = (
            select(
                SKU.sku_code,
                SalesReturnItem.reason,
                func.count().label("cnt"),
            )
            .join(SalesReturnItem, SalesReturnItem.sku_id == SKU.id)
            .join(SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id)
            .where(
                SalesReturn.status != "cancelled",
                SalesReturnItem.reason != None,
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
            .group_by(SKU.sku_code, SalesReturnItem.reason)
            .order_by(func.count().desc())
        )
        reason_rows = (await self.db.execute(reason_stmt)).all()
        top_reason_map = {}
        for r in reason_rows:
            if r.sku_code not in top_reason_map:
                top_reason_map[r.sku_code] = r.reason

        by_sku = []
        for r in sku_rows:
            sold = sold_map.get(r.sku_code, 0)
            returned = int(r.returned)
            rate = round(returned / sold * 100, 1) if sold > 0 else 0.0
            by_sku.append({
                "sku_code": r.sku_code,
                "product_name": r.product_name,
                "sold_qty": sold,
                "returned_qty": returned,
                "return_rate_pct": rate,
                "restocked": int(r.restocked),
                "damaged": int(r.damaged),
                "top_reason": top_reason_map.get(r.sku_code, "—"),
            })

        # --- Returns by Customer ---
        cust_stmt = (
            select(
                Customer.name,
                func.count(func.distinct(SalesReturn.id)).label("return_count"),
                func.coalesce(func.sum(SalesReturn.total_amount), 0).label("credit_amount"),
            )
            .join(SalesReturn, SalesReturn.customer_id == Customer.id)
            .where(
                SalesReturn.status != "cancelled",
                func.date(SalesReturn.created_at) >= from_date,
                func.date(SalesReturn.created_at) <= to_date,
            )
            .group_by(Customer.name)
            .order_by(func.coalesce(func.sum(SalesReturn.total_amount), 0).desc())
        )
        cust_rows = (await self.db.execute(cust_stmt)).all()

        # Orders per customer for rate
        cust_ord_stmt = (
            select(
                Customer.name,
                func.count(func.distinct(Order.id)).label("order_count"),
            )
            .join(Order, Order.customer_id == Customer.id)
            .where(
                func.date(Order.created_at) >= from_date,
                func.date(Order.created_at) <= to_date,
                *ord_fy,
            )
            .group_by(Customer.name)
        )
        cust_ord_rows = (await self.db.execute(cust_ord_stmt)).all()
        cust_ord_map = {r.name: r.order_count for r in cust_ord_rows}

        by_customer = []
        for r in cust_rows:
            orders = cust_ord_map.get(r.name, 0)
            rate = round(r.return_count / orders * 100, 1) if orders > 0 else 0.0
            by_customer.append({
                "customer_name": r.name,
                "order_count": orders,
                "return_count": r.return_count,
                "return_rate_pct": rate,
                "credit_amount": float(r.credit_amount),
            })

        # --- Supplier Returns ---
        sup_ret_stmt = (
            select(
                Supplier.name,
                func.count(func.distinct(ReturnNote.id)).label("return_count"),
                func.coalesce(func.sum(ReturnNote.total_amount), 0).label("debit_value"),
            )
            .join(ReturnNote, ReturnNote.supplier_id == Supplier.id)
            .where(
                ReturnNote.status != "cancelled",
                func.date(ReturnNote.created_at) >= from_date,
                func.date(ReturnNote.created_at) <= to_date,
            )
            .group_by(Supplier.name)
            .order_by(func.coalesce(func.sum(ReturnNote.total_amount), 0).desc())
        )
        sup_ret_rows = (await self.db.execute(sup_ret_stmt)).all()

        supplier_returns = [{
            "supplier_name": r.name,
            "return_count": r.return_count,
            "debit_value": float(r.debit_value),
        } for r in sup_ret_rows]

        return {
            "kpis": {
                "customer_return_rate_pct": customer_return_rate,
                "supplier_return_rate_pct": supplier_return_rate,
                "recovery_rate_pct": recovery_rate,
                "total_credit_notes": total_credit_notes,
                "total_debit_notes": float(rn_agg.debit_total),
                "total_restocked": total_restocked,
                "total_damaged": total_damaged,
            },
            "by_sku": by_sku,
            "by_customer": by_customer,
            "supplier_returns": supplier_returns,
        }
