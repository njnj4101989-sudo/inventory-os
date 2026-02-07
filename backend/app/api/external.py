"""External API routes for drsblouse.com — API key auth, no JWT."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db
from app.core.exceptions import UnauthorizedError
from app.schemas.external import (
    ReserveRequest,
    ConfirmRequest,
    ReleaseRequest,
    ReturnExternalRequest,
)
from app.services.reservation_service import ReservationService
from app.services.order_service import OrderService
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/external", tags=["External"])

settings = get_settings()


async def verify_api_key(x_api_key: str = Header(...)) -> str:
    """Validate X-API-Key header against configured API_KEY."""
    if x_api_key != settings.API_KEY:
        raise UnauthorizedError("Invalid API key")
    return x_api_key


@router.get("/stock/{sku_code}", response_model=None)
async def check_stock(
    sku_code: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Check available stock for a SKU code."""
    svc = InventoryService(db)
    result = await svc.get_stock_by_code(sku_code)
    return {"success": True, "data": result}


@router.post("/reserve", response_model=None, status_code=201)
async def reserve_stock(
    req: ReserveRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Reserve stock for an external order."""
    svc = ReservationService(db)
    result = await svc.create_external_reservation(req)
    return {"success": True, "data": result}


@router.post("/confirm", response_model=None)
async def confirm_reservation(
    req: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Confirm a reservation → creates internal order."""
    svc = ReservationService(db)
    result = await svc.confirm_external_reservation(req.reservation_code)
    return {"success": True, "data": result}


@router.post("/release", response_model=None)
async def release_reservation(
    req: ReleaseRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Release a reservation → frees reserved stock."""
    svc = ReservationService(db)
    result = await svc.release_external_reservation(req.reservation_code)
    return {"success": True, "data": result}


@router.post("/return", response_model=None)
async def return_items(
    req: ReturnExternalRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Process return from external order."""
    svc = OrderService(db)
    result = await svc.process_external_return(req)
    return {"success": True, "data": result}
