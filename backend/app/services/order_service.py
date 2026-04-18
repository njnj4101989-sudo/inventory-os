"""Order service — lifecycle: create, edit, ship, cancel."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.shipment import Shipment
from app.models.shipment_item import ShipmentItem
from app.models.sku import SKU
from app.models.customer import Customer
from app.schemas.order import OrderCreate, OrderFilterParams, OrderResponse, OrderUpdate
from app.core.code_generator import next_order_number, next_shipment_number
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
        _ORDER_ACTIVE = ("pending", "processing", "partially_shipped")
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
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

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
                selectinload(Order.shipments).selectinload(Shipment.items).selectinload(ShipmentItem.sku),
                selectinload(Order.shipments).selectinload(Shipment.transport_rel),
                selectinload(Order.shipments).selectinload(Shipment.invoice),
                selectinload(Order.sales_returns),
            )
            .order_by(order)
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
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
        if order.status not in ("pending", "processing", "partially_shipped"):
            raise InvalidStateTransitionError(
                f"Cannot ship order in '{order.status}' status (expected 'pending', 'processing', or 'partially_shipped')"
            )

        # Build item→qty map for this shipment
        item_map = {item.id: item for item in order.items}

        if ship_data and ship_data.items:
            # Partial ship — validate each requested item
            ship_items = []
            for si in ship_data.items:
                oi = item_map.get(si.order_item_id)
                if not oi:
                    raise ValidationError(f"Order item {si.order_item_id} not found in this order")
                remaining = oi.quantity - (oi.fulfilled_qty or 0)
                if si.quantity <= 0:
                    raise ValidationError(f"Ship quantity must be > 0 for {oi.sku.sku_code if oi.sku else oi.sku_id}")
                if si.quantity > remaining:
                    raise ValidationError(
                        f"Cannot ship {si.quantity} of {oi.sku.sku_code if oi.sku else oi.sku_id} — only {remaining} remaining"
                    )
                ship_items.append((oi, si.quantity))
        else:
            # Ship all remaining (backward compatible)
            ship_items = []
            for oi in order.items:
                remaining = oi.quantity - (oi.fulfilled_qty or 0)
                if remaining > 0:
                    ship_items.append((oi, remaining))

        if not ship_items:
            raise ValidationError("No items to ship — all items are already fulfilled")

        # Validate stock availability for each item
        # NOTE: available_qty excludes reserved stock, but THIS order's reservations
        # are "available" for this order — add them back before checking.
        from app.models.inventory_state import InventoryState
        from app.models.reservation import Reservation as ReservationModel
        ship_sku_ids = [oi.sku_id for oi, _ in ship_items]
        inv_result = await self.db.execute(
            select(InventoryState).where(InventoryState.sku_id.in_(ship_sku_ids)).with_for_update()
        )
        inv_map = {s.sku_id: s for s in inv_result.scalars().all()}

        # Fetch this order's active reservations per SKU
        res_result = await self.db.execute(
            select(ReservationModel.sku_id, func.sum(ReservationModel.quantity).label("qty"))
            .where(ReservationModel.order_id == order_id, ReservationModel.status == "active")
            .group_by(ReservationModel.sku_id)
        )
        order_reserved = {row.sku_id: row.qty for row in res_result.all()}

        insufficient = []
        for oi, qty in ship_items:
            state = inv_map.get(oi.sku_id)
            base_available = state.available_qty if state else 0
            total = state.total_qty if state else 0
            effective_available = min(base_available + order_reserved.get(oi.sku_id, 0), total)
            if qty > effective_available:
                sku_code = oi.sku.sku_code if oi.sku else str(oi.sku_id)
                insufficient.append(f"{sku_code}: need {qty}, available {effective_available}")
        if insufficient:
            raise ValidationError(
                f"Insufficient stock to ship: {'; '.join(insufficient)}"
            )

        # Create Shipment record
        shipment_no = await next_shipment_number(self.db, fy_id)
        shipment = Shipment(
            shipment_no=shipment_no,
            order_id=order.id,
            transport_id=ship_data.transport_id if ship_data else None,
            lr_number=ship_data.lr_number if ship_data else None,
            lr_date=ship_data.lr_date if ship_data else None,
            eway_bill_no=ship_data.eway_bill_no if ship_data else None,
            eway_bill_date=ship_data.eway_bill_date if ship_data else None,
            shipped_by=user_id,
            shipped_at=datetime.now(timezone.utc),
            notes=ship_data.notes if ship_data else None,
            fy_id=fy_id,
        )
        self.db.add(shipment)
        await self.db.flush()

        # Create ShipmentItems + STOCK_OUT events + update fulfilled_qty
        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)

        shipment_subtotal = 0
        for oi, qty in ship_items:
            si = ShipmentItem(
                shipment_id=shipment.id,
                order_item_id=oi.id,
                sku_id=oi.sku_id,
                quantity=qty,
            )
            self.db.add(si)

            await inv_svc.create_event(
                event_type="stock_out",
                item_type="finished_goods",
                reference_type="shipment",
                reference_id=shipment.id,
                sku_id=oi.sku_id,
                quantity=qty,
                performed_by=user_id,
                metadata={"order_number": order.order_number, "shipment_no": shipment_no},
            )

            oi.fulfilled_qty = (oi.fulfilled_qty or 0) + qty
            if oi.fulfilled_qty >= oi.quantity:
                oi.short_qty = 0
            shipment_subtotal += float(oi.unit_price) * qty

        await self.db.flush()

        # Confirm proportional reservations
        from app.models.reservation import Reservation
        from app.services.reservation_service import ReservationService
        res_svc = ReservationService(self.db)

        # Build sku→shipped qty map for this shipment
        shipped_by_sku = {}
        for oi, qty in ship_items:
            shipped_by_sku[oi.sku_id] = shipped_by_sku.get(oi.sku_id, 0) + qty

        res_stmt = select(Reservation).where(
            Reservation.order_id == order_id,
            Reservation.status == "active",
        )
        res_result = await self.db.execute(res_stmt)
        for res in res_result.scalars().all():
            if res.sku_id in shipped_by_sku:
                needed = shipped_by_sku[res.sku_id]
                if needed >= res.quantity:
                    # Fully confirm this reservation
                    await res_svc.confirm_reservation(res.id)
                    shipped_by_sku[res.sku_id] = needed - res.quantity
                else:
                    # Partial: split reservation — confirm shipped portion, keep remainder active
                    # For simplicity, confirm the full reservation if shipped >= reserved
                    # (reservations are per-order, not per-shipment, so confirm as we go)
                    await res_svc.confirm_reservation(res.id)
                    shipped_by_sku[res.sku_id] = 0

        # Determine new order status
        all_fulfilled = all(
            (item.fulfilled_qty or 0) >= item.quantity for item in order.items
        )
        order.status = "shipped" if all_fulfilled else "partially_shipped"
        order.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Create invoice for THIS shipment's items only
        from app.services.invoice_service import InvoiceService
        inv_service = InvoiceService(self.db)
        invoice = await inv_service.create_invoice_for_shipment(
            order=order,
            shipment=shipment,
            ship_items=ship_items,
            created_by=user_id,
            fy_id=fy_id,
        )

        # Link invoice to shipment
        shipment.invoice_id = invoice.get("id") if isinstance(invoice.get("id"), UUID) else UUID(invoice["id"])
        await self.db.flush()

        result = await self.get_order(order_id)
        result["invoice"] = invoice
        return result

    async def update_shipping(self, order_id: UUID, data) -> dict:
        """Update transport/LR/eway on a shipped order."""
        order = await self._get_or_404(order_id)
        if order.status not in ("partially_shipped", "shipped", "delivered"):
            raise InvalidStateTransitionError(
                f"Can only update shipping details on shipped/delivered orders (current: '{order.status}')"
            )

        if data.transport_id is not None:
            order.transport_id = data.transport_id or None
            if data.transport_id:
                from app.models.transport import Transport
                t = (await self.db.execute(select(Transport).where(Transport.id == data.transport_id))).scalar_one_or_none()
                if t:
                    order.transport = t.name
        if data.lr_number is not None:
            order.lr_number = data.lr_number or None
        if data.lr_date is not None:
            order.lr_date = data.lr_date
        if data.eway_bill_no is not None:
            order.eway_bill_no = data.eway_bill_no or None
        if data.eway_bill_date is not None:
            order.eway_bill_date = data.eway_bill_date

        order.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return await self.get_order(order_id)

    async def update_order(self, order_id: UUID, req: OrderUpdate, user_id: UUID) -> dict:
        """Edit a pending/processing order — header fields and/or items."""
        order = await self._get_or_404(order_id)
        if order.status not in ("pending", "processing"):
            raise InvalidStateTransitionError(
                f"Cannot edit order in '{order.status}' status (only pending/processing)"
            )

        # --- Update header fields (only non-None) ---
        if req.customer_id is not None:
            order.customer_id = req.customer_id
            # Resolve customer name/phone from master
            cust = (await self.db.execute(
                select(Customer).where(Customer.id == req.customer_id)
            )).scalar_one_or_none()
            if cust:
                order.customer_name = cust.name
                order.customer_phone = cust.phone
        if req.customer_name is not None:
            order.customer_name = req.customer_name
        if req.customer_phone is not None:
            order.customer_phone = req.customer_phone
        if req.customer_address is not None:
            order.customer_address = req.customer_address
        if req.order_date is not None:
            order.order_date = req.order_date
        if req.broker_id is not None:
            order.broker_id = req.broker_id
            from app.models.broker import Broker
            b = (await self.db.execute(select(Broker).where(Broker.id == req.broker_id))).scalar_one_or_none()
            order.broker_name = b.name if b else None
        if req.transport_id is not None:
            order.transport_id = req.transport_id
            from app.models.transport import Transport
            t = (await self.db.execute(select(Transport).where(Transport.id == req.transport_id))).scalar_one_or_none()
            order.transport = t.name if t else None
        if req.gst_percent is not None:
            order.gst_percent = req.gst_percent
        if req.discount_amount is not None:
            order.discount_amount = req.discount_amount
        if req.notes is not None:
            order.notes = req.notes

        # --- Update items (if provided) — DIFF-based reservation handling ---
        # Only touches reservations for rows that actually changed. Unchanged rows
        # keep their existing reservation untouched. This prevents the reservation
        # table from bloating (old release-all + recreate-all pattern created N new
        # RES rows per edit, even for 1-line changes).
        if req.items is not None:
            from app.models.inventory_state import InventoryState
            from app.models.reservation import Reservation
            from app.services.reservation_service import ReservationService
            res_svc = ReservationService(self.db)

            # Load this order's active reservations, bucketed by sku_id.
            # List-per-sku handles the rare dup-SKU row case deterministically.
            res_stmt = select(Reservation).where(
                Reservation.order_id == order_id,
                Reservation.status == "active",
            )
            res_result = await self.db.execute(res_stmt)
            res_by_sku: dict = {}
            for r in res_result.scalars().all():
                res_by_sku.setdefault(r.sku_id, []).append(r)

            existing_map = {item.id: item for item in order.items}
            incoming_ids = {it.id for it in req.items if it.id is not None}

            # Step 1: Released removed items + their reservations
            for item_id, item in list(existing_map.items()):
                if item_id not in incoming_ids:
                    bucket = res_by_sku.get(item.sku_id, [])
                    if bucket:
                        await res_svc.release_reservation(bucket.pop(0).id)
                    await self.db.delete(item)

            # Step 2: Batch-fetch SKUs referenced by the incoming payload
            sku_ids = list({it.sku_id for it in req.items})
            sku_result = await self.db.execute(select(SKU).where(SKU.id.in_(sku_ids)))
            sku_map = {s.id: s for s in sku_result.scalars().all()}

            total_amount = 0
            final_items = []
            # Rows whose reservation needs a fresh create (new row, sku swap, or qty change)
            needs_fresh_reservation: list = []

            for it in req.items:
                if it.sku_id not in sku_map:
                    raise NotFoundError(f"SKU {it.sku_id} not found")

                total_price = it.quantity * it.unit_price
                total_amount += total_price

                if it.id and it.id in existing_map:
                    oi = existing_map[it.id]
                    sku_changed = oi.sku_id != it.sku_id
                    qty_changed = oi.quantity != it.quantity

                    if sku_changed or qty_changed:
                        # Release this row's current reservation (tied to its current sku)
                        bucket = res_by_sku.get(oi.sku_id, [])
                        if bucket:
                            await res_svc.release_reservation(bucket.pop(0).id)
                        needs_fresh_reservation.append((oi, it.quantity, it.sku_id))
                    # else: nothing changed on this row → reservation stays

                    oi.sku_id = it.sku_id
                    oi.quantity = it.quantity
                    oi.unit_price = it.unit_price
                    oi.total_price = total_price
                    # short_qty is recomputed below only if we re-reserve; otherwise keep prior value
                    final_items.append(oi)
                else:
                    oi = OrderItem(
                        order_id=order_id,
                        sku_id=it.sku_id,
                        quantity=it.quantity,
                        unit_price=it.unit_price,
                        total_price=total_price,
                        fulfilled_qty=0,
                        short_qty=0,  # filled in below when reservation is attempted
                    )
                    self.db.add(oi)
                    needs_fresh_reservation.append((oi, it.quantity, it.sku_id))
                    final_items.append(oi)

            order.total_amount = total_amount
            await self.db.flush()

            # Step 3: Create reservations only for changed/new rows
            for oi, qty, sku_id in needs_fresh_reservation:
                inv_stmt = (
                    select(InventoryState)
                    .where(InventoryState.sku_id == sku_id)
                    .with_for_update()
                )
                inv_state = (await self.db.execute(inv_stmt)).scalar_one_or_none()
                available = inv_state.available_qty if inv_state else 0
                reservable = min(qty, available)
                oi.short_qty = max(0, qty - reservable)
                if reservable > 0:
                    await res_svc.create_reservation(
                        sku_id=sku_id,
                        quantity=reservable,
                        order_id=order_id,
                        permanent=True,
                    )

        order.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return await self.get_order(order_id)

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
                selectinload(Order.shipments).selectinload(Shipment.items).selectinload(ShipmentItem.sku),
                selectinload(Order.shipments).selectinload(Shipment.transport_rel),
                selectinload(Order.shipments).selectinload(Shipment.invoice),
                selectinload(Order.sales_returns),
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
            "eway_bill_no": o.eway_bill_no,
            "eway_bill_date": o.eway_bill_date.isoformat() if o.eway_bill_date else None,
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
                    "returned_qty": item.returned_qty or 0,
                    "short_qty": item.short_qty or 0,
                }
                for item in (o.items or [])
            ],
            "has_shortage": any(
                (item.short_qty or 0) > 0 and (item.fulfilled_qty or 0) < item.quantity
                for item in (o.items or [])
            ),
            "invoices": [
                {
                    "id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "total_amount": float(inv.total_amount) if inv.total_amount else 0,
                    "status": inv.status,
                    "cancel_reason": inv.cancel_reason,
                    "cancel_notes": inv.cancel_notes,
                    "cancelled_at": inv.cancelled_at.isoformat() if inv.cancelled_at else None,
                }
                for inv in (o.invoices or [])
            ],
            "shipments": [
                {
                    "id": str(shp.id),
                    "shipment_no": shp.shipment_no,
                    "transport_id": str(shp.transport_id) if shp.transport_id else None,
                    "transport": {
                        "id": str(shp.transport_rel.id),
                        "name": shp.transport_rel.name,
                        "phone": shp.transport_rel.phone,
                        "city": shp.transport_rel.city,
                    } if hasattr(shp, 'transport_rel') and shp.transport_rel else None,
                    "lr_number": shp.lr_number,
                    "lr_date": shp.lr_date.isoformat() if shp.lr_date else None,
                    "eway_bill_no": shp.eway_bill_no,
                    "eway_bill_date": shp.eway_bill_date.isoformat() if shp.eway_bill_date else None,
                    "shipped_at": shp.shipped_at.isoformat() if shp.shipped_at else None,
                    "notes": shp.notes,
                    "invoice": {
                        "id": str(shp.invoice.id),
                        "invoice_number": shp.invoice.invoice_number,
                        "total_amount": float(shp.invoice.total_amount) if shp.invoice.total_amount else 0,
                        "status": shp.invoice.status,
                    } if shp.invoice else None,
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
                            } if si.sku else None,
                            "quantity": si.quantity,
                        }
                        for si in (shp.items or [])
                    ],
                }
                for shp in (o.shipments or [])
            ],
            "sales_returns": [
                {
                    "id": str(sr.id),
                    "srn_no": sr.srn_no,
                    "status": sr.status,
                    "return_date": sr.return_date.isoformat() if sr.return_date else None,
                    "total_amount": float(sr.total_amount) if sr.total_amount else 0,
                    "credit_note_no": sr.credit_note_no,
                    "item_count": len(sr.items) if hasattr(sr, 'items') and sr.items else 0,
                }
                for sr in (o.sales_returns or [])
            ] if hasattr(o, 'sales_returns') and o.sales_returns else [],
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
