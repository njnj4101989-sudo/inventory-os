"""Mobile-specific routes — tailor batches, QR scan, checker pending."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, require_role
from app.models.user import User
from app.schemas.mobile import ScanRequest
from app.services.batch_service import BatchService

router = APIRouter(prefix="/mobile", tags=["Mobile"])


@router.get("/my-batches", response_model=None)
async def my_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_start"),
):
    """List batches assigned to the current tailor."""
    svc = BatchService(db)
    result = await svc.get_batches_for_tailor(current_user.id)
    return {"success": True, "data": result}


@router.post("/scan", response_model=None)
async def scan_qr(
    req: ScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_role("tailor", "checker"),
):
    """Scan QR code → return batch details + allowed actions for current role."""
    svc = BatchService(db)
    result = await svc.scan_batch_qr(req.qr_data, current_user)
    return {"success": True, "data": result}


@router.get("/pending-checks", response_model=None)
async def pending_checks(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("batch_check"),
):
    """List batches with status=SUBMITTED awaiting QC check."""
    svc = BatchService(db)
    result = await svc.get_pending_checks()
    return {"success": True, "data": result}
