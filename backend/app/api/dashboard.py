"""Dashboard routes — summary, reports, tailor performance, inventory movement."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
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
    """Financial report: revenue, costs, invoices."""
    fd, td = _resolve_period(period, from_date, to_date)
    svc = DashboardService(db)
    result = await svc.get_financial_report(fd, td)
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
