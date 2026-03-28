"""Shipment routes — list per order, update transport/LR/eway."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.shipment import UpdateShipmentRequest
from app.services.shipment_service import ShipmentService

router = APIRouter(tags=["Shipments"])


@router.get("/orders/{order_id}/shipments", response_model=None)
async def list_order_shipments(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """List all shipments for an order."""
    svc = ShipmentService(db)
    result = await svc.get_shipments(order_id)
    return {"success": True, "data": result}


@router.get("/shipments/{shipment_id}", response_model=None)
async def get_shipment(
    shipment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Get single shipment by ID."""
    svc = ShipmentService(db)
    result = await svc.get_shipment(shipment_id)
    return {"success": True, "data": result}


@router.patch("/shipments/{shipment_id}", response_model=None)
async def update_shipment(
    shipment_id: UUID,
    req: UpdateShipmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    """Update transport/LR/eway on a shipment (typically 1-3 days after ship)."""
    svc = ShipmentService(db)
    result = await svc.update_shipment(shipment_id, req)
    return {"success": True, "data": result}
