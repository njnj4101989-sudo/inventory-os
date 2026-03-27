"""Transport API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.transport_service import TransportService
from app.schemas.transport import TransportCreate, TransportUpdate

router = APIRouter(prefix="/transports", tags=["transports"])


@router.get("")
async def list_transports(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=0),
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = TransportService(db)
    return {"success": True, "data": await svc.get_transports(page, page_size, search)}


@router.get("/all")
async def get_all_active_transports(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = TransportService(db)
    return {"success": True, "data": await svc.get_all_active()}


@router.get("/{transport_id}")
async def get_transport(
    transport_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = TransportService(db)
    return {"success": True, "data": await svc.get_transport(transport_id)}


@router.post("")
async def create_transport(
    req: TransportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = TransportService(db)
    obj = await svc.create_transport(req)
    return {"success": True, "data": obj, "message": "Transport created"}


@router.patch("/{transport_id}")
async def update_transport(
    transport_id: UUID,
    req: TransportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = TransportService(db)
    obj = await svc.update_transport(transport_id, req)
    return {"success": True, "data": obj, "message": "Transport updated"}
