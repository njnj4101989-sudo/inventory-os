"""Broker API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.broker_service import BrokerService
from app.schemas.broker import BrokerCreate, BrokerUpdate

router = APIRouter(prefix="/brokers", tags=["brokers"])


@router.get("")
async def list_brokers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=0),
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = BrokerService(db)
    return {"success": True, "data": await svc.get_brokers(page, page_size, search)}


@router.get("/all")
async def get_all_active_brokers(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = BrokerService(db)
    return {"success": True, "data": await svc.get_all_active()}


@router.get("/{broker_id}")
async def get_broker(
    broker_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = BrokerService(db)
    return {"success": True, "data": await svc.get_broker(broker_id)}


@router.post("")
async def create_broker(
    req: BrokerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = BrokerService(db)
    obj = await svc.create_broker(req)
    return {"success": True, "data": obj, "message": "Broker created"}


@router.patch("/{broker_id}")
async def update_broker(
    broker_id: UUID,
    req: BrokerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = BrokerService(db)
    obj = await svc.update_broker(broker_id, req)
    return {"success": True, "data": obj, "message": "Broker updated"}
