"""Batch Challan routes — send/receive garment batches for VA processing.

4 endpoints:
  POST   /batch-challans           Create challan + send batches for VA
  GET    /batch-challans           List challans (paginated, filterable)
  GET    /batch-challans/{id}      Get single challan with batch items
  POST   /batch-challans/{id}/receive   Receive batches back from VA vendor
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, require_any_permission, get_fy_id
from app.models.user import User
from app.schemas.batch_challan import (
    BatchChallanCreate,
    BatchChallanFilterParams,
    BatchChallanReceive,
    BatchChallanUpdate,
)
from app.services.batch_challan_service import BatchChallanService

router = APIRouter(prefix="/batch-challans", tags=["Batch Challans"])


@router.get("/next-number", response_model=None)
async def next_challan_number(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_any_permission("batch_send_va", "batch_receive_va"),
):
    """Peek at the next auto-sequential batch challan number."""
    fy_id = get_fy_id(current_user)
    svc = BatchChallanService(db)
    next_no = await svc._next_challan_no(fy_id)
    return {"success": True, "data": {"next_challan_no": next_no}}


@router.post("", response_model=None, status_code=201)
async def create_batch_challan(
    req: BatchChallanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_send_va"),
):
    """Create a batch challan and send batches for VA (atomic)."""
    fy_id = get_fy_id(current_user)
    svc = BatchChallanService(db)
    result = await svc.create_challan(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.get("", response_model=None)
async def list_batch_challans(
    params: BatchChallanFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_any_permission("batch_send_va", "batch_receive_va"),
):
    """List batch challans with pagination and filters."""
    fy_id = get_fy_id(current_user)
    svc = BatchChallanService(db)
    result = await svc.get_challans(params, fy_id)
    return {"success": True, **result}


@router.patch("/{challan_id}", response_model=None)
async def update_batch_challan(
    challan_id: UUID,
    req: BatchChallanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_send_va"),
):
    """Edit a batch challan (va_party, value_addition, notes)."""
    svc = BatchChallanService(db)
    result = await svc.update_challan(challan_id, req)
    return {"success": True, "data": result}


@router.get("/{challan_id}", response_model=None)
async def get_batch_challan(
    challan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_any_permission("batch_send_va", "batch_receive_va"),
):
    """Get a single batch challan with all batch processing records."""
    svc = BatchChallanService(db)
    result = await svc.get_challan(challan_id)
    return {"success": True, "data": result}


@router.post("/{challan_id}/receive", response_model=None)
async def receive_batch_challan(
    challan_id: UUID,
    req: BatchChallanReceive,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_receive_va"),
):
    """Receive all batches back from VA vendor."""
    fy_id = get_fy_id(current_user)
    svc = BatchChallanService(db)
    result = await svc.receive_challan(challan_id, req, current_user.id, fy_id)
    return {"success": True, "data": result}
