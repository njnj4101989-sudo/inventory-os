"""Shipment service — list, get, update shipping details."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.shipment import Shipment
from app.models.shipment_item import ShipmentItem
from app.core.exceptions import NotFoundError, InvalidStateTransitionError


class ShipmentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_shipments(self, order_id: UUID) -> list[dict]:
        stmt = (
            select(Shipment)
            .where(Shipment.order_id == order_id)
            .options(
                selectinload(Shipment.transport_rel),
                selectinload(Shipment.shipped_by_user),
                selectinload(Shipment.invoice),
                selectinload(Shipment.items).selectinload(ShipmentItem.sku),
            )
            .order_by(Shipment.shipped_at.asc())
        )
        result = await self.db.execute(stmt)
        return [self._to_response(s) for s in result.scalars().unique().all()]

    async def get_shipment(self, shipment_id: UUID) -> dict:
        shipment = await self._get_or_404(shipment_id)
        return self._to_response(shipment)

    async def update_shipment(self, shipment_id: UUID, data) -> dict:
        """Update transport/LR/eway on a shipment (typically 1-3 days after ship)."""
        shipment = await self._get_or_404(shipment_id)

        if data.transport_id is not None:
            shipment.transport_id = data.transport_id or None
        if data.lr_number is not None:
            shipment.lr_number = data.lr_number or None
        if data.lr_date is not None:
            shipment.lr_date = data.lr_date
        if data.eway_bill_no is not None:
            shipment.eway_bill_no = data.eway_bill_no or None
        if data.eway_bill_date is not None:
            shipment.eway_bill_date = data.eway_bill_date
        if data.notes is not None:
            shipment.notes = data.notes or None

        await self.db.flush()
        return self._to_response(shipment)

    async def _get_or_404(self, shipment_id: UUID) -> Shipment:
        stmt = (
            select(Shipment)
            .where(Shipment.id == shipment_id)
            .options(
                selectinload(Shipment.transport_rel),
                selectinload(Shipment.shipped_by_user),
                selectinload(Shipment.invoice),
                selectinload(Shipment.items).selectinload(ShipmentItem.sku),
            )
        )
        result = await self.db.execute(stmt)
        shipment = result.scalar_one_or_none()
        if not shipment:
            raise NotFoundError(f"Shipment {shipment_id} not found")
        return shipment

    def _to_response(self, s: Shipment) -> dict:
        return {
            "id": str(s.id),
            "shipment_no": s.shipment_no,
            "order_id": str(s.order_id),
            "transport_id": str(s.transport_id) if s.transport_id else None,
            "transport": {
                "id": str(s.transport_rel.id),
                "name": s.transport_rel.name,
                "phone": s.transport_rel.phone,
                "city": s.transport_rel.city,
                "gst_no": s.transport_rel.gst_no,
            } if hasattr(s, 'transport_rel') and s.transport_rel else None,
            "lr_number": s.lr_number,
            "lr_date": s.lr_date.isoformat() if s.lr_date else None,
            "eway_bill_no": s.eway_bill_no,
            "eway_bill_date": s.eway_bill_date.isoformat() if s.eway_bill_date else None,
            "shipped_by": str(s.shipped_by) if s.shipped_by else None,
            "shipped_at": s.shipped_at.isoformat() if s.shipped_at else None,
            "notes": s.notes,
            "invoice": {
                "id": str(s.invoice.id),
                "invoice_number": s.invoice.invoice_number,
                "total_amount": float(s.invoice.total_amount) if s.invoice.total_amount else 0,
                "status": s.invoice.status,
            } if s.invoice else None,
            "items": [
                {
                    "id": str(si.id),
                    "order_item_id": str(si.order_item_id),
                    "sku_id": str(si.sku_id),
                    "sku": {
                        "id": str(si.sku.id),
                        "sku_code": si.sku.sku_code,
                        "product_name": si.sku.product_name,
                        "color": si.sku.color,
                        "size": si.sku.size,
                        "base_price": float(si.sku.base_price) if si.sku.base_price else None,
                    } if si.sku else None,
                    "quantity": si.quantity,
                }
                for si in (s.items or [])
            ],
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
