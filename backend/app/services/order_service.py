"""Order service — lifecycle: create, ship, cancel, return."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.sku import SKU
from app.schemas.order import OrderCreate, ReturnRequest, OrderResponse
from app.schemas import PaginatedParams
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

    async def get_orders(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(Order)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Order, params.sort_by, Order.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Order)
            .options(selectinload(Order.items).selectinload(OrderItem.sku))
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
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

    async def create_order(self, req: OrderCreate, created_by: UUID) -> dict:
        order_number = await next_order_number(self.db)

        total_amount = 0.0
        order_items = []

        for item in req.items:
            # Verify SKU exists
            sku_stmt = select(SKU).where(SKU.id == item.sku_id)
            sku_result = await self.db.execute(sku_stmt)
            sku = sku_result.scalar_one_or_none()
            if not sku:
                raise NotFoundError(f"SKU {item.sku_id} not found")

            total_price = item.quantity * item.unit_price
            total_amount += total_price

            order_items.append(OrderItem(
                sku_id=item.sku_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=total_price,
                fulfilled_qty=0,
            ))

        order = Order(
            order_number=order_number,
            source=req.source or "web",
            customer_name=req.customer_name,
            customer_phone=req.customer_phone,
            customer_address=req.customer_address,
            status="pending",
            total_amount=total_amount,
            notes=req.notes,
            created_by=created_by,
        )
        self.db.add(order)
        await self.db.flush()

        for oi in order_items:
            oi.order_id = order.id
            self.db.add(oi)
        await self.db.flush()

        return await self.get_order(order.id)

    async def ship_order(self, order_id: UUID, user_id: UUID) -> dict:
        order = await self._get_or_404(order_id)
        if order.status not in ("pending", "processing"):
            raise InvalidStateTransitionError(
                f"Cannot ship order in '{order.status}' status (expected 'pending' or 'processing')"
            )

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

        order.status = "shipped"
        order.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Create invoice
        from app.services.invoice_service import InvoiceService
        inv_service = InvoiceService(self.db)
        invoice = await inv_service.create_invoice(order.id, user_id)

        result = await self.get_order(order_id)
        result["invoice"] = invoice
        return result

    async def cancel_order(self, order_id: UUID, user_id: UUID) -> dict:
        order = await self._get_or_404(order_id)
        if order.status not in ("pending", "processing"):
            raise InvalidStateTransitionError(
                f"Cannot cancel order in '{order.status}' status"
            )

        order.status = "cancelled"
        await self.db.flush()

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
            .options(selectinload(Order.items).selectinload(OrderItem.sku))
        )
        result = await self.db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundError(f"Order {order_id} not found")
        return order

    def _to_response(self, o: Order) -> dict:
        return {
            "id": str(o.id),
            "order_number": o.order_number,
            "source": o.source,
            "external_order_ref": o.external_order_ref,
            "customer_name": o.customer_name,
            "customer_phone": o.customer_phone,
            "customer_address": o.customer_address,
            "status": o.status,
            "total_amount": float(o.total_amount) if o.total_amount else 0,
            "notes": o.notes,
            "items": [
                {
                    "id": str(item.id),
                    "sku": {
                        "id": str(item.sku.id),
                        "sku_code": item.sku.sku_code,
                        "product_name": item.sku.product_name,
                    } if item.sku else None,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price) if item.unit_price else 0,
                    "total_price": float(item.total_price) if item.total_price else 0,
                    "fulfilled_qty": item.fulfilled_qty or 0,
                }
                for item in (o.items or [])
            ],
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
