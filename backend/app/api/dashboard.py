"""Dashboard routes — summary, tailor performance, inventory movement."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=None)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Aggregate counts for dashboard cards."""
    svc = DashboardService(db)
    result = await svc.get_summary()
    return {"success": True, "data": result}


@router.get("/tailor-performance", response_model=None)
async def tailor_performance(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Per-tailor stats over a date range."""
    svc = DashboardService(db)
    result = await svc.get_tailor_performance(from_date, to_date)
    return {"success": True, "data": result}


@router.get("/inventory-movement", response_model=None)
async def inventory_movement(
    sku_id: str = Query(...),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Stock movement report for a single SKU over a date range."""
    svc = DashboardService(db)
    result = await svc.get_inventory_movement(sku_id, from_date, to_date)
    return {"success": True, "data": result}
