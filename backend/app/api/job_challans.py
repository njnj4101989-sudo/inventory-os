"""Job Challan routes — create (with bulk roll send), list, get, receive."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.job_challan import (
    JobChallanCreate, JobChallanFilterParams, JobChallanReceive, JobChallanUpdate,
)
from app.services.job_challan_service import JobChallanService

router = APIRouter(prefix="/job-challans", tags=["Job Challans"])


@router.get("/next-number", response_model=None)
async def next_challan_number(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Peek at the next auto-sequential job challan number."""
    svc = JobChallanService(db)
    next_no = await svc._next_challan_no()
    return {"success": True, "data": {"next_challan_no": next_no}}


@router.get("", response_model=None)
async def list_challans(
    params: JobChallanFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """List job challans with pagination."""
    svc = JobChallanService(db)
    result = await svc.get_challans(params)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_challan(
    req: JobChallanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Create a job challan and send all specified rolls for processing."""
    svc = JobChallanService(db)
    result = await svc.create_challan(req, current_user.id)
    return {"success": True, "data": result}


@router.post("/{challan_id}/receive", response_model=None)
async def receive_challan(
    challan_id: UUID,
    req: JobChallanReceive,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Receive rolls back from VA vendor — bulk, single transaction."""
    svc = JobChallanService(db)
    result = await svc.receive_challan(challan_id, req, current_user.id)
    return {"success": True, "data": result}


@router.patch("/{challan_id}", response_model=None)
async def update_challan(
    challan_id: UUID,
    req: JobChallanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Edit a job challan (va_party, value_addition, sent_date, notes)."""
    svc = JobChallanService(db)
    result = await svc.update_challan(challan_id, req)
    return {"success": True, "data": result}


@router.get("/{challan_id}", response_model=None)
async def get_challan(
    challan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Get a single job challan with full roll details."""
    svc = JobChallanService(db)
    result = await svc.get_challan(challan_id)
    return {"success": True, "data": result}
