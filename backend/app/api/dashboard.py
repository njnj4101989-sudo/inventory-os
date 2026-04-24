"""Dashboard routes — summary, reports, tailor performance, inventory movement."""

import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _resolve_period(
    period: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> tuple[date, date]:
    """Convert frontend 'period' shorthand OR explicit dates to a (from, to) pair."""
    if from_date and to_date:
        return from_date, to_date
    today = date.today()
    if period == "7d":
        return today - timedelta(days=7), today
    elif period == "90d":
        return today - timedelta(days=90), today
    else:  # default 30d
        return today - timedelta(days=30), today


@router.get("/summary", response_model=None)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Aggregate counts for dashboard cards."""
    svc = DashboardService(db)
    result = await svc.get_summary()
    return {"success": True, "data": result}


@router.get("/enhanced", response_model=None)
async def enhanced_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Enhanced dashboard — smart alerts, revenue trend, production gauges."""
    fy_id = get_fy_id(current_user)
    svc = DashboardService(db)
    result = await svc.get_dashboard_enhanced(fy_id)
    return {"success": True, "data": result}


@router.get("/inventory-summary", response_model=None)
async def inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Inventory KPI cards: total, available, reserved, value."""
    svc = DashboardService(db)
    result = await svc.get_inventory_summary()
    return {"success": True, "data": result}


@router.get("/production-report", response_model=None)
async def production_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Production report: lots, pallas, fabric, approval rate."""
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_production_report(fd, td)
    return {"success": True, "data": result}


@router.get("/financial-report", response_model=None)
async def financial_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Financial report: revenue, costs, invoices — scoped to current FY."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_financial_report(fd, td, fy_id)
    return {"success": True, "data": result}


@router.get("/tailor-performance", response_model=None)
async def tailor_performance(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Per-tailor stats over a date range."""
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_tailor_performance(fd, td)
    return {"success": True, "data": result}


@router.get("/inventory-movement", response_model=None)
async def inventory_movement(
    sku_id: str | None = Query(None),
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Stock movement report for a single SKU over a date range."""
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_inventory_movement(sku_id or "", fd, td)
    return {"success": True, "data": result}


@router.get("/inventory-position", response_model=None)
async def inventory_position(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    product_type: str | None = Query(None),
    fabric_type: str | None = Query(None),
    stock_status: str | None = Query(None, regex="^(has|zero|negative)?$"),
    min_value: float | None = Query(None),
    search: str | None = Query(None),
    dead_days: int = Query(60, ge=1, le=365),
    low_stock: int = Query(5, ge=0, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """P4.1 — Grouped inventory position with ₹ valuation, ageing, 8 KPIs.

    Filters: product_type, fabric_type, stock_status, min_value, search.
    Thresholds: dead_days (default 60, 1-365), low_stock (default 5, 0-1000).
    """
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_inventory_position(
        fd, td,
        product_type=product_type,
        fabric_type=fabric_type,
        stock_status=stock_status,
        min_value_inr=min_value,
        search=search,
        dead_stock_days=dead_days,
        low_stock_threshold=low_stock,
    )
    return {"success": True, "data": result}


@router.get("/inventory-position.csv", response_model=None)
async def inventory_position_csv(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    product_type: str | None = Query(None),
    fabric_type: str | None = Query(None),
    stock_status: str | None = Query(None, regex="^(has|zero|negative)?$"),
    min_value: float | None = Query(None),
    search: str | None = Query(None),
    dead_days: int = Query(60, ge=1, le=365),
    low_stock: int = Query(5, ge=0, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """CSV export — same filters as inventory-position. Streams a single sheet."""
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_inventory_position(
        fd, td,
        product_type=product_type,
        fabric_type=fabric_type,
        stock_status=stock_status,
        min_value_inr=min_value,
        search=search,
        dead_stock_days=dead_days,
        low_stock_threshold=low_stock,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Design", "SKU Code", "Product", "Color", "Size",
        "Opening", "Stock In", "Stock Out", "Returns", "Losses", "Net",
        "Closing", "Reserved", "Available", "WAC (₹)", "Value (₹)", "Ageing (days)",
    ])
    for g in result["groups"]:
        for s in g["skus"]:
            writer.writerow([
                g["design_no"] or "", s["sku_code"], s["product_name"], s["color"], s["size"],
                s["opening_stock"], s["stock_in"], s["stock_out"], s["returns"], s["losses"], s["net_change"],
                s["closing_stock"], s["reserved_qty"], s["available_qty"],
                f"{s['wac']:.2f}", f"{s['value_inr']:.2f}",
                s["ageing_days"] if s["ageing_days"] is not None else "",
            ])
    buf.seek(0)
    filename = f"inventory-position_{fd.isoformat()}_{td.isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sales-report", response_model=None)
async def sales_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Sales & Orders report: KPIs, customer ranking, fulfillment funnel, broker commission."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_sales_report(fd, td, fy_id)
    return {"success": True, "data": result}


@router.get("/accounting-report", response_model=None)
async def accounting_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Accounting report: receivables, payables, GST summary, credit/debit notes."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_accounting_report(fd, td, fy_id)
    return {"success": True, "data": result}


@router.get("/raw-material-summary", response_model=None)
async def raw_material_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Raw material (roll) inventory summary — status/fabric/supplier breakdown."""
    svc = DashboardService(db)
    result = await svc.get_raw_material_summary()
    return {"success": True, "data": result}


@router.get("/wip-summary", response_model=None)
async def wip_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Work-in-progress inventory — batches in pipeline by status/product type/tailor."""
    svc = DashboardService(db)
    result = await svc.get_wip_summary()
    return {"success": True, "data": result}


@router.get("/va-report", response_model=None)
async def va_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """VA Processing report: cost analysis, turnaround, damage tracking."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_va_report(fd, td, fy_id)
    return {"success": True, "data": result}


@router.get("/purchase-report", response_model=None)
async def purchase_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Purchases & Suppliers report: purchase register, supplier quality, fabric utilization."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_purchase_report(fd, td, fy_id)
    return {"success": True, "data": result}


@router.get("/closing-stock-report", response_model=None)
async def closing_stock_report(
    as_of_date: date | None = Query(None, description="Valuation date (default: today)"),
    fy_id: str | None = Query(None, description="FY ID — if closed FY, returns frozen snapshot"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Closing stock valuation — Raw Materials + WIP + Finished Goods (AS-2 WAC).
    For closed FYs, returns the frozen snapshot captured at close time."""
    # Check if requesting a closed FY's snapshot
    if fy_id:
        from uuid import UUID as UUIDType
        from app.models.financial_year import FinancialYear
        from sqlalchemy import select
        try:
            fy = (await db.execute(
                select(FinancialYear).where(FinancialYear.id == UUIDType(fy_id))
            )).scalar_one_or_none()
            if fy and fy.status == "closed" and fy.closing_snapshot and "stock_valuation" in fy.closing_snapshot:
                return {"success": True, "data": {
                    "as_of_date": str(fy.end_date),
                    "valuation_method": "weighted_average_cost",
                    "source": "fy_closing_snapshot",
                    "fy_code": fy.code,
                    **fy.closing_snapshot["stock_valuation"],
                }}
        except (ValueError, Exception):
            pass  # fall through to live computation

    svc = DashboardService(db)
    result = await svc.get_closing_stock_report(as_of_date)
    result["source"] = "live"
    return {"success": True, "data": result}


@router.get("/returns-report", response_model=None)
async def returns_report(
    period: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Returns analysis: customer returns by SKU/customer, supplier returns, recovery rate."""
    fy_id = get_fy_id(current_user)
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_returns_report(fd, td, fy_id)
    return {"success": True, "data": result}
