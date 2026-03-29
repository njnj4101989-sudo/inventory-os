"""Roll routes — stock-in, listing, detail with consumption history."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_permission, get_fy_id
from app.models.user import User
from app.schemas.roll import (
    RollCreate, RollUpdate, RollFilterParams,
    ReceiveFromProcessing, UpdateProcessingLog,
    BulkStockIn, SupplierInvoiceParams, SupplierInvoiceUpdate,
)
from app.services.roll_service import RollService

router = APIRouter(prefix="/rolls", tags=["Rolls"])


@router.get("", response_model=None)
async def list_rolls(
    params: RollFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """List rolls with pagination. Filters: fabric_type, color, has_remaining, supplier_id."""
    fy_id = get_fy_id(current_user)
    svc = RollService(db)
    result = await svc.get_rolls(params, fy_id)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def stock_in(
    req: RollCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Register a new roll (stock-in). Auto-generates roll_code + STOCK_IN event."""
    fy_id = get_fy_id(current_user)
    svc = RollService(db)
    result = await svc.stock_in(req, current_user.id, fy_id)
    return {"success": True, "data": result}


@router.post("/bulk-stock-in", response_model=None, status_code=201)
async def bulk_stock_in(
    req: BulkStockIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Atomic bulk stock-in: all rolls in a single transaction. All-or-nothing."""
    fy_id = get_fy_id(current_user)
    svc = RollService(db)
    result = await svc.bulk_stock_in(req, current_user.id, fy_id)
    return {"success": True, "data": result, "message": f"{result['count']} rolls stocked in"}


@router.get("/supplier-invoices", response_model=None)
async def list_supplier_invoices(
    params: SupplierInvoiceParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Server-side grouping of rolls by supplier invoice. Search + pagination."""
    fy_id = get_fy_id(current_user)
    svc = RollService(db)
    result = await svc.get_supplier_invoices(params, fy_id)
    return {"success": True, **result}


@router.patch("/supplier-invoices/{invoice_id}", response_model=None)
async def update_supplier_invoice(
    invoice_id: UUID,
    updates: SupplierInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Update supplier invoice fields (e.g. gst_percent)."""
    svc = RollService(db)
    result = await svc.update_supplier_invoice(invoice_id, updates)
    await db.commit()
    return {"success": True, "data": result}


@router.patch("/{roll_id}", response_model=None)
async def update_roll(
    roll_id: UUID,
    req: RollUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Update an unused roll (all fields optional, only unused rolls editable)."""
    svc = RollService(db)
    result = await svc.update_roll(roll_id, req)
    return {"success": True, "data": result}


@router.delete("/{roll_id}", response_model=None)
async def delete_roll(
    roll_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Delete an unused roll. Only rolls with full remaining weight and no lot/batch usage can be deleted."""
    svc = RollService(db)
    await svc.delete_roll(roll_id)
    return {"success": True, "message": "Roll deleted"}


@router.get("/{roll_code}/passport", response_model=None)
async def get_roll_passport(
    roll_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Roll passport — any authenticated user can view. QR scan on factory floor."""
    svc = RollService(db)
    result = await svc.get_roll_passport(roll_code)
    return {"success": True, "data": result}


@router.get("/{roll_id}", response_model=None)
async def get_roll(
    roll_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Get roll detail with consumption history."""
    svc = RollService(db)
    result = await svc.get_roll(roll_id)
    return {"success": True, "data": result}


@router.patch("/{roll_id}/processing/{processing_id}", response_model=None)
async def receive_from_processing(
    roll_id: UUID,
    processing_id: UUID,
    req: ReceiveFromProcessing,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Mark a processing log as received with updated measurements."""
    svc = RollService(db)
    result = await svc.receive_from_processing(roll_id, processing_id, req)
    return {"success": True, "data": result}


@router.patch("/{roll_id}/processing/{processing_id}/edit", response_model=None)
async def update_processing_log(
    roll_id: UUID,
    processing_id: UUID,
    req: UpdateProcessingLog,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("stock_in"),
):
    """Edit a processing log — update cost, vendor, dates, notes, etc."""
    svc = RollService(db)
    result = await svc.update_processing_log(roll_id, processing_id, req)
    return {"success": True, "data": result}
