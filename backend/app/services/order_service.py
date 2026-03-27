"""Order service — lifecycle: create, ship, cancel, return."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.sku import SKU
from app.models.customer import Customer
from app.schemas.order import OrderCreate, OrderFilterParams, ReturnRequest, OrderResponse
from app.core.code_generator import next_order_number
from app.core.exceptions import (
    NotFoundError,
    InvalidStateTransitionError,
    InsufficientStockError,
    ValidationError,
)


class OrderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_orders(self, params: OrderFilterParams, fy_id: UUID) -> dict:
        # FY scoping: current FY records + unfulfilled orders from any previous FY
        _ORDER_ACTIVE = ("pending", "processing")
        filters = [or_(Order.fy_id == fy_id, Order.status.in_(_ORDER_ACTIVE))]
        if params.status:
            filters.append(Order.status == params.status)
        if params.source:
            filters.append(Order.source == params.source)
        if params.search:
            q = f"%{params.search}%"
            filters.append(
                (Order.order_number.ilike(q)) | (Order.customer_name.ilike(q))
            )

        count_stmt = select(func.count()).select_from(Order)
        if filters:
            for f in filters:
                count_stmt = count_stmt.where(f)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Order, params.sort_by, Order.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Order)
            .options(
                selectinload(Order.customer),
                selectinload(Order.broker),
                selectinload(Order.transport_rel),
                selectinload(Order.items).selectinload(OrderItem.sku),
                selectinload(Order.invoices),
            )
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        if filters:
            for f in filters:
                stmt = stmt.where(f)
        result = await self.db.execute(stmt)
        orders = result.scalars().unique().all()

        return {
            "data": [self._to_response(o) for o in orders],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_order(self, order_id: UUID) -> dict:
        order = await self._get_or_404(order_id)
        return self._to_response(order)

    async def create_order(self, req: OrderCreate, created_by: UUID, fy_id: UUID) -> dict:
        order_number = await next_order_number(self.db, fy_id)

        total_amount = 0
        order_items = []

        from app.models.inventory_state import InventoryState

        # Batch-fetch all SKUs and inventory states in 2 queries instead of 2N
        sku_ids = [item.sku_id for item in req.items]
        sku_result = await self.db.execute(select(SKU).where(SKU.id.in_(sku_ids)))
        sku_map = {s.id: s for s in sku_result.scalars().all()}

        inv_result = await self.db.execute(
            select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
        )
        inv_map = {s.sku_id: s for s in inv_result.scalars().all()}

        for item in req.items:
            sku = sku_map.get(item.sku_id)
            if not sku:
                raise NotFoundError(f"SKU {item.sku_id} not found")

            inv_state = inv_map.get(item.sku_id)
            available = inv_state.available_qty if inv_state else 0
            short = max(0, item.quantity - available)

            total_price = item.quantity * item.unit_price
            total_amount += total_price

            order_items.append(OrderItem(
                sku_id=item.sku_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=total_price,
                fulfilled_qty=0,
                short_qty=short,
            ))

        # Resolve broker/transport names from masters for backward compat
        broker_name_resolved = req.broker_name
        transport_resolved = req.transport
        if req.broker_id and not broker_name_resolved:
            from app.models.broker import Broker
            b = (await self.db.execute(select(Broker).where(Broker.id == req.broker_id))).scalar_one_or_none()
            if b:
                broker_name_resolved = b.name
        if req.transport_id and not transport_resolved:
            from app.models.transport import Transport
            t = (await self.db.execute(select(Transport).where(Transport.id == req.transport_id))).scalar_one_or_none()
            if t:
                transport_resolved = t.name

        order = Order(
            order_number=order_number,
            order_date=req.order_date or datetime.now(timezone.utc).date(),
            source=req.source or "web",
            customer_id=req.customer_id,
            customer_name=req.customer_name,
            customer_phone=req.customer_phone,
            customer_address=req.customer_address,
            broker_name=broker_name_resolved,
            broker_id=req.broker_id,
            transport=transport_resolved,
            transport_id=req.transport_id,
            gst_percent=req.gst_percent,
            status="pending",
            total_amount=total_amount,
            discount_amount=req.discount_amount,
            notes=req.notes,
            created_by=created_by,
            fy_id=fy_id,
        )
        self.db.add(order)
        await self.db.flush()

        for oi in order_items:
            oi.order_id = order.id
            self.db.add(oi)
        await self.db.flush()

        # Reserve available stock for each item
        from app.services.reservation_service import ReservationService
        res_svc = ReservationService(self.db)

        for oi in order_items:
            reservable = oi.quantity - oi.short_qty
            if reservable <= 0:
                continue
            try:
                await res_svc.create_reservation(
                    sku_id=oi.sku_id,
                    quantity=reservable,
                    order_id=order.id,
                    permanent=True,
                )
            except InsufficientStockError:
                # Race: stock reserved between read and reserve — re-read and try remainder
                fresh_inv = await self.db.execute(
                    select(InventoryState).where(InventoryState.sku_id == oi.sku_id)
                )
                current = fresh_inv.scalar_one_or_none()
                current_available = current.available_qty if current else 0
                if current_available > 0:
                    await res_svc.create_reservation(
                        sku_id=oi.sku_id,
                        quantity=current_available,
                        order_id=order.id,
                        permanent=True,
                    )
                    oi.short_qty = oi.quantity - current_available
                else:
                    oi.short_qty = oi.quantity
                await self.db.flush()

        return await self.get_order(order.id)

    async def ship_order(self, order_id: UUID, user_id: UUID, fy_id: UUID, ship_data=None) -> dict:
        order = await self._get_or_404(order_id)
        if order.status not in ("pending", "processing"):
            raise InvalidStateTransitionError(
                f"Cannot ship order in '{order.status}' status (expected 'pending' or 'processing')"
            )

        # Confirm all active reservations for this order
        from app.models.reservation import Reservation
        from app.services.reservation_service import ReservationService
        res_svc = ReservationService(self.db)
        res_stmt = select(Reservation).where(
            Reservation.order_id == order_id,
            Reservation.status == "active",
        )
        res_result = await self.db.execute(res_stmt)
        for res in res_result.scalars().all():
            await res_svc.confirm_reservation(res.id)

        # Create STOCK_OUT events per item
        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)

        for item in order.items:
            if item.sku_id and item.quantity > 0:
                await inv_svc.create_event(
                    event_type="stock_out",
                    item_type="finished_goods",
                    reference_type="order",
                    reference_id=order.id,
                    sku_id=item.sku_id,
                    quantity=item.quantity,
                    performed_by=user_id,
                    metadata={"order_number": order.order_number},
                )
                item.fulfilled_qty = item.quantity

        # Apply LR / transport from ship_data
        if ship_data:
            if ship_data.transport_id:
                order.transport_id = ship_data.transport_id
                # Also resolve transport name for backward compat
                from app.models.transport import Transport
                t = (await self.db.execute(select(Transport).where(Transport.id == ship_data.transport_id))).scalar_one_or_none()
                if t:
                    order.transport = t.name
            if ship_data.lr_number:
                order.lr_number = ship_data.lr_number
            if ship_data.lr_date:
                order.lr_date = ship_data.lr_date

        order.status = "shipped"
        order.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Create invoice with broker/transport/LR data
        from app.services.invoice_service import InvoiceService
        inv_service = InvoiceService(self.db)
        invoice = await inv_service.create_invoice(
            order.id, user_id, fy_id,
            broker_id=order.broker_id,
            transport_id=order.transport_id,
            lr_number=order.lr_number,
            lr_date=order.lr_date,
        )

        result = await self.get_order(order_id)
        result["invoice"] = invoice
        return result

    async def cancel_order(self, order_id: UUID, user_id: UUID) -> dict:
        order = await self._get_or_404(order_id)
        if order.status not in ("pending", "processing"):
            raise InvalidStateTransitionError(
                f"Cannot cancel order in '{order.status}' status"
            )

        # Release all active reservations for this order
        from app.models.reservation import Reservation
        from app.services.reservation_service import ReservationService
        res_svc = ReservationService(self.db)
        res_stmt = select(Reservation).where(
            Reservation.order_id == order_id,
            Reservation.status == "active",
        )
        res_result = await self.db.execute(res_stmt)
        for res in res_result.scalars().all():
            await res_svc.release_reservation(res.id)

        order.status = "cancelled"
        await self.db.flush()

        # Cascade: cancel any linked draft/issued invoices (not paid)
        from app.services.invoice_service import InvoiceService
        inv_svc = InvoiceService(self.db)
        inv_stmt = select(Invoice).where(
            Invoice.order_id == order_id,
            Invoice.status.in_(("draft", "issued")),
        )
        inv_result = await self.db.execute(inv_stmt)
        for inv in inv_result.scalars().all():
            await inv_svc.cancel_invoice(inv.id)

        return await self.get_order(order_id)

    async def return_order(self, order_id: UUID, req: ReturnRequest, user_id: UUID) -> dict:
        order = await self._get_or_404(order_id)
        if order.status != "shipped":
            raise InvalidStateTransitionError(
                f"Cannot return order in '{order.status}' status (expected 'shipped')"
            )

        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)

        for return_item in req.items:
            await inv_svc.create_event(
                event_type="return",
                item_type="finished_goods",
                reference_type="order_return",
                reference_id=order.id,
                sku_id=return_item.sku_id,
                quantity=return_item.quantity,
                performed_by=user_id,
                metadata={
                    "order_number": order.order_number,
                    "reason": return_item.reason,
                },
            )

            # Update fulfilled_qty
            for item in order.items:
                if item.sku_id == return_item.sku_id:
                    item.fulfilled_qty = max(0, (item.fulfilled_qty or 0) - return_item.quantity)

        order.status = "returned"
        await self.db.flush()

        return await self.get_order(order_id)

    async def process_external_return(self, req) -> dict:
        """Process return from external order (by external_order_ref)."""
        import uuid as uuid_mod
        from app.services.inventory_service import InventoryService

        inv_svc = InventoryService(self.db)
        events = []
        for item in req.items:
            from app.models.sku import SKU
            sku_stmt = select(SKU).where(SKU.sku_code == item.sku_code)
            sku_result = await self.db.execute(sku_stmt)
            sku = sku_result.scalar_one_or_none()
            if not sku:
                raise NotFoundError(f"SKU '{item.sku_code}' not found")

            event = await inv_svc.create_event(
                event_type="return",
                item_type="finished_goods",
                reference_type="external_return",
                reference_id=uuid_mod.uuid4(),
                sku_id=sku.id,
                quantity=item.quantity,
                performed_by=uuid_mod.uuid4(),  # system user
                metadata={"external_order_ref": req.external_order_ref, "reason": item.reason},
            )
            events.append({"sku_code": item.sku_code, "quantity": item.quantity})

        return {"external_order_ref": req.external_order_ref, "returned_items": events}

    async def _get_or_404(self, order_id: UUID) -> Order:
        stmt = (
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.customer),
                selectinload(Order.broker),
                selectinload(Order.transport_rel),
                selectinload(Order.items).selectinload(OrderItem.sku),
                selectinload(Order.invoices),
            )
        )
        result = await self.db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundError(f"Order {order_id} not found")
        return order

    def _to_response(self, o: Order) -> dict:
        cust = o.customer if hasattr(o, 'customer') and o.customer else None
        return {
            "id": str(o.id),
            "order_number": o.order_number,
            "order_date": o.order_date.isoformat() if o.order_date else None,
            "source": o.source,
            "external_order_ref": o.external_order_ref,
            "customer_id": str(o.customer_id) if o.customer_id else None,
            "customer": {
                "id": str(cust.id),
                "name": cust.name,
                "phone": cust.phone,
                "city": cust.city,
                "gst_no": cust.gst_no,
            } if cust else None,
            "customer_name": o.customer_name,
            "customer_phone": o.customer_phone,
            "customer_address": o.customer_address,
            "broker_name": o.broker_name,
            "broker_id": str(o.broker_id) if o.broker_id else None,
            "broker": {
                "id": str(o.broker.id),
                "name": o.broker.name,
                "phone": o.broker.phone,
                "city": o.broker.city,
                "gst_no": o.broker.gst_no,
                "commission_rate": float(o.broker.commission_rate) if o.broker.commission_rate else None,
            } if hasattr(o, 'broker') and o.broker else None,
            "transport": o.transport,
            "transport_id": str(o.transport_id) if o.transport_id else None,
            "transport_detail": {
                "id": str(o.transport_rel.id),
                "name": o.transport_rel.name,
                "phone": o.transport_rel.phone,
                "city": o.transport_rel.city,
                "gst_no": o.transport_rel.gst_no,
            } if hasattr(o, 'transport_rel') and o.transport_rel else None,
            "lr_number": o.lr_number,
            "lr_date": o.lr_date.isoformat() if o.lr_date else None,
            "gst_percent": float(o.gst_percent) if o.gst_percent else 0,
            "status": o.status,
            "total_amount": float(o.total_amount) if o.total_amount else 0,
            "discount_amount": float(o.discount_amount) if o.discount_amount else 0,
            "notes": o.notes,
            "items": [
                {
                    "id": str(item.id),
                    "sku": {
                        "id": str(item.sku.id),
                        "sku_code": item.sku.sku_code,
                        "product_name": item.sku.product_name,
                        "color": item.sku.color,
                        "size": item.sku.size,
                        "base_price": float(item.sku.base_price) if item.sku.base_price else None,
                    } if item.sku else None,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price) if item.unit_price else 0,
                    "total_price": float(item.total_price) if item.total_price else 0,
                    "fulfilled_qty": item.fulfilled_qty or 0,
                    "short_qty": item.short_qty or 0,
                }
                for item in (o.items or [])
            ],
            "has_shortage": any((item.short_qty or 0) > 0 for item in (o.items or [])),
            "invoices": [
                {
                    "id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "total_amount": float(inv.total_amount) if inv.total_amount else 0,
                    "status": inv.status,
                }
                for inv in (o.invoices or [])
            ],
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
