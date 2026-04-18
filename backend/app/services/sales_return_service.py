"""SalesReturn service — CRUD + 5-status lifecycle + inventory/ledger integration."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sales_return import SalesReturn, SalesReturnItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem
from app.models.sku import SKU
from app.schemas.sales_return import (
    CreditNoteFromInvoiceRequest,
    InspectRequest,
    SalesReturnCreate,
    SalesReturnFilterParams,
    SalesReturnUpdate,
)
from app.core.code_generator import next_sales_return_number, next_credit_note_number
from app.core.exceptions import (
    NotFoundError,
    InvalidStateTransitionError,
    ValidationError,
)


class SalesReturnService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── List ──

    async def list_sales_returns(self, params: SalesReturnFilterParams, fy_id: UUID) -> dict:
        stmt = (
            select(SalesReturn)
            .options(
                selectinload(SalesReturn.order),
                selectinload(SalesReturn.customer),
                selectinload(SalesReturn.created_by_user),
                selectinload(SalesReturn.items).selectinload(SalesReturnItem.sku),
            )
            .order_by(SalesReturn.created_at.desc())
        )

        if fy_id:
            stmt = stmt.where(
                or_(
                    SalesReturn.fy_id == fy_id,
                    SalesReturn.status.in_(("draft", "received", "inspected", "restocked")),
                )
            )
        if params.status:
            stmt = stmt.where(SalesReturn.status == params.status)
        if params.customer_id:
            stmt = stmt.where(SalesReturn.customer_id == params.customer_id)
        if params.order_id:
            stmt = stmt.where(SalesReturn.order_id == params.order_id)
        if params.search:
            q = f"%{params.search}%"
            stmt = stmt.where(
                or_(
                    SalesReturn.srn_no.ilike(q),
                    SalesReturn.reason_summary.ilike(q),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        page = params.page
        page_size = params.page_size
        pages = max(1, (total + page_size - 1) // page_size)
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        returns = result.scalars().all()

        return {
            "data": [self._to_response(sr) for sr in returns],
            "total": total,
            "page": page,
            "pages": pages,
        }

    # ── Get ──

    async def get_sales_return(self, sr_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        return self._to_response(sr)

    # ── Create ──

    async def create_sales_return(self, req: SalesReturnCreate, user_id: UUID, fy_id: UUID) -> dict:
        # Validate customer exists
        customer = (await self.db.execute(
            select(Customer).where(Customer.id == req.customer_id)
        )).scalar_one_or_none()
        if not customer:
            raise NotFoundError("Customer not found")

        if not req.items:
            raise ValidationError("At least one return item is required")

        # If order-linked, load order and build lookup
        order = None
        oi_map = {}
        if req.order_id:
            order = (await self.db.execute(
                select(Order)
                .where(Order.id == req.order_id)
                .options(selectinload(Order.items).selectinload(OrderItem.sku))
            )).scalar_one_or_none()
            if not order:
                raise NotFoundError("Order not found")
            allowed = ("shipped", "partially_shipped", "delivered", "partially_returned")
            if order.status not in allowed:
                raise InvalidStateTransitionError(
                    f"Cannot create return for order in '{order.status}' status"
                )
            oi_map = {str(oi.id): oi for oi in order.items}

        srn_no = await next_sales_return_number(self.db, fy_id)

        # Determine GST: from request, or from linked order, or 0
        gst_pct = Decimal(str(float(req.gst_percent))) if req.gst_percent is not None else None
        if gst_pct is None and order and order.gst_percent:
            gst_pct = Decimal(str(float(order.gst_percent)))
        if gst_pct is None:
            gst_pct = Decimal("0")

        sr = SalesReturn(
            srn_no=srn_no,
            order_id=req.order_id,
            customer_id=req.customer_id,
            status="draft",
            return_date=req.return_date or datetime.now(timezone.utc).date(),
            transport_id=req.transport_id,
            lr_number=req.lr_number,
            lr_date=req.lr_date,
            reason_summary=req.reason_summary,
            gst_percent=gst_pct,
            created_by=user_id,
            fy_id=fy_id,
        )
        self.db.add(sr)
        await self.db.flush()

        total_amount = Decimal("0")

        for item_req in req.items:
            if item_req.quantity_returned <= 0:
                raise ValidationError("Return quantity must be > 0")

            item_unit_price = item_req.unit_price
            oi = None

            # Order-linked item: validate returnable qty + reserve
            if item_req.order_item_id and oi_map:
                oi = oi_map.get(str(item_req.order_item_id))
                if not oi:
                    raise ValidationError(f"Order item {item_req.order_item_id} not found in this order")
                max_returnable = (oi.fulfilled_qty or 0) - (oi.returned_qty or 0)
                if item_req.quantity_returned > max_returnable:
                    sku_code = oi.sku.sku_code if oi.sku else str(item_req.sku_id)
                    raise ValidationError(
                        f"Cannot return {item_req.quantity_returned} for {sku_code} — only {max_returnable} returnable"
                    )
                # Reserve returned_qty on order item
                oi.returned_qty = (oi.returned_qty or 0) + item_req.quantity_returned
                # Use order item price if not explicitly provided
                if item_unit_price is None and oi.unit_price:
                    item_unit_price = Decimal(str(float(oi.unit_price)))

            sri = SalesReturnItem(
                sales_return_id=sr.id,
                order_item_id=item_req.order_item_id,
                sku_id=item_req.sku_id,
                unit_price=item_unit_price,
                quantity_returned=item_req.quantity_returned,
                reason=item_req.reason,
                notes=item_req.notes,
            )
            self.db.add(sri)

            if item_unit_price:
                total_amount += item_unit_price * item_req.quantity_returned

        sr.subtotal = total_amount
        sr.tax_amount = (total_amount * gst_pct / Decimal("100")).quantize(Decimal("0.01"))
        sr.total_amount = sr.subtotal + sr.tax_amount

        # Update order status if order-linked
        if order:
            self._recalculate_order_status(order)

        await self.db.flush()

        await self._emit("sales_return_created", sr, user_id)
        return await self.get_sales_return(sr.id)

    # ── Fast-track: create credit note directly against an invoice ──

    async def create_credit_note_from_invoice(
        self,
        invoice_id: UUID,
        req: CreditNoteFromInvoiceRequest,
        user_id: UUID,
        fy_id: UUID,
    ) -> dict:
        """Create a SalesReturn in `closed` state with a CN assigned — skipping
        the 5-step workflow. Used when the credit is purely financial
        (price adjustment, post-filing correction, discount) or when physical
        return inspection isn't needed. Per-item `restore_stock` controls
        whether inventory is added back.
        """
        if not req.items:
            raise ValidationError("At least one credit-note item is required")

        allowed_reasons = {
            "goods_returned", "price_adjustment", "quality_issue",
            "post_filing_correction", "discount", "other",
        }
        reason = (req.reason or "").strip()
        if not reason:
            raise ValidationError("Reason is required")
        if reason not in allowed_reasons:
            reason = "other"

        # Load invoice with items + order (for order-linked returned_qty updates)
        invoice = (await self.db.execute(
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
                selectinload(Invoice.order).selectinload(Order.items).selectinload(OrderItem.sku),
            )
        )).scalar_one_or_none()
        if not invoice:
            raise NotFoundError("Invoice not found")

        # Customer: prefer invoice.customer_id, fall back to order.customer_id
        customer_id = invoice.customer_id or (invoice.order.customer_id if invoice.order else None)
        if not customer_id:
            raise ValidationError("Invoice has no customer linked — cannot raise credit note")

        # Validate each credit-note qty does not exceed the invoice line's qty.
        # (We allow qty > invoice line only if invoice_item_id is None — free items.)
        inv_item_map = {str(ii.id): ii for ii in (invoice.items or [])}
        for line in req.items:
            if line.invoice_item_id:
                ii = inv_item_map.get(str(line.invoice_item_id))
                if not ii:
                    raise ValidationError(f"Invoice item {line.invoice_item_id} not found on this invoice")
                if line.quantity <= 0:
                    raise ValidationError("Credit quantity must be > 0")
                if line.quantity > (ii.quantity or 0):
                    raise ValidationError(
                        f"Cannot credit {line.quantity} for {ii.sku.sku_code if ii.sku else ii.sku_id} — "
                        f"invoiced quantity is only {ii.quantity}"
                    )
            else:
                if line.quantity <= 0:
                    raise ValidationError("Credit quantity must be > 0")

        # Generate both numbers now — SRN for the record, CN for the finance side.
        srn_no = await next_sales_return_number(self.db, fy_id)
        cn_no = await next_credit_note_number(self.db, fy_id)

        gst_pct = (
            Decimal(str(float(req.gst_percent))) if req.gst_percent is not None
            else (Decimal(str(float(invoice.gst_percent))) if invoice.gst_percent else Decimal("0"))
        )

        # Snapshot customer / order context from invoice
        order_id = invoice.order_id
        reason_summary = f"Credit note against {invoice.invoice_number}"
        if req.reason_notes:
            reason_summary = f"{reason_summary} — {req.reason_notes}"

        now_date = datetime.now(timezone.utc).date()
        sr = SalesReturn(
            srn_no=srn_no,
            order_id=order_id,
            invoice_id=invoice.id,
            customer_id=customer_id,
            status="closed",
            return_date=now_date,
            received_date=now_date,
            inspected_date=now_date,
            restocked_date=now_date,
            reason_summary=reason_summary,
            gst_percent=gst_pct,
            credit_note_no=cn_no,
            created_by=user_id,
            received_by=user_id,
            inspected_by=user_id,
            fy_id=fy_id,
        )
        self.db.add(sr)
        await self.db.flush()

        # Order items map (for order_items.returned_qty updates when invoice links to order)
        oi_by_sku: dict = {}
        if invoice.order and invoice.order.items:
            for oi in invoice.order.items:
                oi_by_sku.setdefault(oi.sku_id, []).append(oi)

        total_amount = Decimal("0")

        for line in req.items:
            qty_restock = line.quantity if line.restore_stock else 0
            qty_damage = 0 if line.restore_stock else 0  # damage tracking not surfaced in fast-track
            sri = SalesReturnItem(
                sales_return_id=sr.id,
                order_item_id=None,
                sku_id=line.sku_id,
                unit_price=line.unit_price,
                quantity_returned=line.quantity,
                quantity_restocked=qty_restock,
                quantity_damaged=qty_damage,
                reason=line.reason or reason,
                condition="good" if line.restore_stock else "pending",
            )
            self.db.add(sri)
            total_amount += Decimal(str(float(line.unit_price))) * line.quantity

            # Update linked order_item.returned_qty if this invoice came from an order
            # and we find a matching order_item. Cap at what's actually returnable.
            bucket = oi_by_sku.get(line.sku_id, [])
            remaining = line.quantity
            for oi in bucket:
                if remaining <= 0:
                    break
                returnable = (oi.fulfilled_qty or 0) - (oi.returned_qty or 0)
                if returnable <= 0:
                    continue
                take = min(remaining, returnable)
                oi.returned_qty = (oi.returned_qty or 0) + take
                remaining -= take

        sr.subtotal = total_amount
        sr.tax_amount = (total_amount * gst_pct / Decimal("100")).quantize(Decimal("0.01"))
        sr.total_amount = sr.subtotal + sr.tax_amount

        await self.db.flush()

        # Inventory restore events (per-line restore_stock flag)
        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)
        for line in req.items:
            if not line.restore_stock:
                continue
            await inv_svc.create_event(
                event_type="return",
                item_type="finished_goods",
                reference_type="sales_return",
                reference_id=sr.id,
                sku_id=line.sku_id,
                quantity=line.quantity,
                performed_by=user_id,
                metadata={
                    "srn_no": srn_no,
                    "credit_note_no": cn_no,
                    "invoice_number": invoice.invoice_number,
                    "reason": reason,
                },
            )

        # Ledger entry — credit the customer with the total credit amount
        if sr.total_amount and float(sr.total_amount) > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=now_date,
                party_type="customer",
                party_id=customer_id,
                entry_type="credit_note",
                reference_type="sales_return",
                reference_id=sr.id,
                debit=0,
                credit=float(sr.total_amount),
                description=(
                    f"Credit Note {cn_no} against {invoice.invoice_number} — "
                    f"₹{float(sr.total_amount):,.2f}"
                ),
                fy_id=sr.fy_id or fy_id,
                created_by=user_id,
            ))
            await self.db.flush()

        # Recalc order status if order-linked
        if invoice.order:
            self._recalculate_order_status(invoice.order)
            await self.db.flush()

        await self._emit("sales_return_closed", sr, user_id)
        return await self.get_sales_return(sr.id)

    # ── Update (draft only) ──

    async def update_sales_return(self, sr_id: UUID, req: SalesReturnUpdate) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status != "draft":
            raise InvalidStateTransitionError("Can only edit drafts")

        if req.transport_id is not None:
            sr.transport_id = req.transport_id or None
        if req.lr_number is not None:
            sr.lr_number = req.lr_number or None
        if req.lr_date is not None:
            sr.lr_date = req.lr_date or None
        if req.reason_summary is not None:
            sr.reason_summary = req.reason_summary or None

        await self.db.flush()
        return await self.get_sales_return(sr_id)

    # ── Receive: draft → received ──

    async def receive_sales_return(self, sr_id: UUID, user_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status != "draft":
            raise InvalidStateTransitionError(f"Cannot receive from '{sr.status}' (expected 'draft')")

        sr.status = "received"
        sr.received_date = datetime.now(timezone.utc).date()
        sr.received_by = user_id
        await self.db.flush()

        await self._emit("sales_return_received", sr, user_id)
        return await self.get_sales_return(sr_id)

    # ── Inspect: received → inspected ──

    async def inspect_sales_return(self, sr_id: UUID, req: InspectRequest, user_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status != "received":
            raise InvalidStateTransitionError(f"Cannot inspect from '{sr.status}' (expected 'received')")

        item_map = {str(item.id): item for item in sr.items}

        for insp in req.items:
            item = item_map.get(str(insp.item_id))
            if not item:
                raise ValidationError(f"Sales return item {insp.item_id} not found")

            if insp.condition not in ("good", "damaged", "rejected"):
                raise ValidationError(f"Invalid condition '{insp.condition}' — expected good/damaged/rejected")

            if insp.quantity_restocked + insp.quantity_damaged > item.quantity_returned:
                raise ValidationError(
                    f"Restocked ({insp.quantity_restocked}) + damaged ({insp.quantity_damaged}) "
                    f"exceeds returned qty ({item.quantity_returned})"
                )

            item.condition = insp.condition
            item.quantity_restocked = insp.quantity_restocked
            item.quantity_damaged = insp.quantity_damaged
            if insp.notes:
                item.notes = insp.notes

        sr.status = "inspected"
        sr.inspected_date = datetime.now(timezone.utc).date()
        sr.inspected_by = user_id
        sr.qc_notes = req.qc_notes
        await self.db.flush()

        await self._emit("sales_return_inspected", sr, user_id)
        return await self.get_sales_return(sr_id)

    # ── Restock: inspected → restocked ──

    async def restock_sales_return(self, sr_id: UUID, user_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status != "inspected":
            raise InvalidStateTransitionError(f"Cannot restock from '{sr.status}' (expected 'inspected')")

        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)

        for item in sr.items:
            if item.quantity_restocked > 0:
                await inv_svc.create_event(
                    event_type="return",
                    item_type="finished_goods",
                    reference_type="sales_return",
                    reference_id=sr.id,
                    sku_id=item.sku_id,
                    quantity=item.quantity_restocked,
                    performed_by=user_id,
                    metadata={
                        "srn_no": sr.srn_no,
                        "order_number": sr.order.order_number if sr.order else None,
                        "reason": item.reason,
                        "condition": item.condition,
                    },
                )

        sr.status = "restocked"
        sr.restocked_date = datetime.now(timezone.utc).date()
        await self.db.flush()

        await self._emit("sales_return_restocked", sr, user_id)
        return await self.get_sales_return(sr_id)

    # ── Close: restocked → closed ──

    async def close_sales_return(self, sr_id: UUID, user_id: UUID, fy_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status != "restocked":
            raise InvalidStateTransitionError(f"Cannot close from '{sr.status}' (expected 'restocked')")

        cn_no = await next_credit_note_number(self.db, fy_id)
        sr.credit_note_no = cn_no
        sr.status = "closed"
        await self.db.flush()

        # Credit customer ledger
        if sr.customer_id and sr.total_amount and float(sr.total_amount) > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=datetime.now(timezone.utc).date(),
                party_type="customer",
                party_id=sr.customer_id,
                entry_type="credit_note",
                reference_type="sales_return",
                reference_id=sr.id,
                debit=0,
                credit=float(sr.total_amount),
                description=f"Credit Note {cn_no} against {sr.srn_no} — ₹{float(sr.total_amount):,.2f}",
                fy_id=sr.fy_id or fy_id,
                created_by=user_id,
            ))
            await self.db.flush()

        await self._emit("sales_return_closed", sr, user_id)
        return await self.get_sales_return(sr_id)

    # ── Cancel: draft/received → cancelled ──

    async def cancel_sales_return(self, sr_id: UUID) -> dict:
        sr = await self._get_or_404(sr_id)
        if sr.status not in ("draft", "received"):
            raise InvalidStateTransitionError(f"Cannot cancel from '{sr.status}' (only draft or received)")

        # Reverse returned_qty reservation on order items (only for order-linked returns)
        if sr.order_id:
            order = (await self.db.execute(
                select(Order)
                .where(Order.id == sr.order_id)
                .options(selectinload(Order.items))
            )).scalar_one_or_none()

            if order:
                oi_map = {str(oi.id): oi for oi in order.items}
                for item in sr.items:
                    if item.order_item_id:
                        oi = oi_map.get(str(item.order_item_id))
                        if oi:
                            oi.returned_qty = max(0, (oi.returned_qty or 0) - item.quantity_returned)

                self._recalculate_order_status(order)

        sr.status = "cancelled"
        await self.db.flush()
        await self._emit("sales_return_cancelled", sr)
        return await self.get_sales_return(sr_id)

    # ── Internal ──

    def _recalculate_order_status(self, order: Order):
        """Recalculate order status based on returned_qty vs fulfilled_qty."""
        has_fulfilled = False
        all_returned = True
        any_returned = False

        for item in order.items:
            fulfilled = item.fulfilled_qty or 0
            if fulfilled > 0:
                has_fulfilled = True
                returned = item.returned_qty or 0
                if returned >= fulfilled:
                    any_returned = True
                else:
                    all_returned = False
                    if returned > 0:
                        any_returned = True

        if has_fulfilled and all_returned and any_returned:
            order.status = "returned"
        elif any_returned:
            order.status = "partially_returned"
        elif order.status in ("partially_returned", "returned"):
            # Revert: no items returned anymore (cancel scenario)
            all_shipped = all(
                (item.fulfilled_qty or 0) >= item.quantity
                for item in order.items
            )
            order.status = "shipped" if all_shipped else "partially_shipped"

    async def _get_or_404(self, sr_id: UUID) -> SalesReturn:
        stmt = (
            select(SalesReturn)
            .where(SalesReturn.id == sr_id)
            .options(
                selectinload(SalesReturn.order),
                selectinload(SalesReturn.customer),
                selectinload(SalesReturn.transport),
                selectinload(SalesReturn.created_by_user),
                selectinload(SalesReturn.received_by_user),
                selectinload(SalesReturn.inspected_by_user),
                selectinload(SalesReturn.items).selectinload(SalesReturnItem.sku),
                selectinload(SalesReturn.items).selectinload(SalesReturnItem.order_item),
            )
        )
        result = await self.db.execute(stmt)
        sr = result.scalar_one_or_none()
        if not sr:
            raise NotFoundError(f"Sales return {sr_id} not found")
        return sr

    async def _emit(self, event_type: str, sr: SalesReturn, user_id: UUID | None = None):
        from app.core.event_bus import event_bus
        customer_name = sr.customer.name if sr.customer else "—"
        await event_bus.emit(event_type, {
            "srn_no": sr.srn_no,
            "customer": customer_name,
            "order_number": sr.order.order_number if sr.order else None,
            "status": sr.status,
            "item_count": len(sr.items) if sr.items else 0,
        }, str(user_id) if user_id else None)

    def _to_response(self, sr: SalesReturn) -> dict:
        return {
            "id": str(sr.id),
            "srn_no": sr.srn_no,
            "order": {
                "id": str(sr.order.id),
                "order_number": sr.order.order_number,
                "status": sr.order.status,
            } if sr.order else None,
            "customer": {
                "id": str(sr.customer.id),
                "name": sr.customer.name,
                "phone": sr.customer.phone,
                "city": sr.customer.city,
            } if sr.customer else None,
            "status": sr.status,
            "return_date": sr.return_date.isoformat() if sr.return_date else None,
            "received_date": sr.received_date.isoformat() if sr.received_date else None,
            "inspected_date": sr.inspected_date.isoformat() if sr.inspected_date else None,
            "restocked_date": sr.restocked_date.isoformat() if sr.restocked_date else None,
            "transport": {
                "id": str(sr.transport.id),
                "name": sr.transport.name,
            } if sr.transport else None,
            "lr_number": sr.lr_number,
            "lr_date": sr.lr_date.isoformat() if sr.lr_date else None,
            "reason_summary": sr.reason_summary,
            "qc_notes": sr.qc_notes,
            "gst_percent": float(sr.gst_percent) if sr.gst_percent else 0,
            "subtotal": float(sr.subtotal) if sr.subtotal else 0,
            "tax_amount": float(sr.tax_amount) if sr.tax_amount else 0,
            "total_amount": float(sr.total_amount) if sr.total_amount else 0,
            "credit_note_no": sr.credit_note_no,
            "created_by_user": {
                "id": str(sr.created_by_user.id),
                "full_name": sr.created_by_user.full_name,
            } if sr.created_by_user else None,
            "received_by_user": {
                "id": str(sr.received_by_user.id),
                "full_name": sr.received_by_user.full_name,
            } if sr.received_by_user else None,
            "inspected_by_user": {
                "id": str(sr.inspected_by_user.id),
                "full_name": sr.inspected_by_user.full_name,
            } if sr.inspected_by_user else None,
            "created_at": sr.created_at.isoformat() if sr.created_at else None,
            "items": [
                {
                    "id": str(item.id),
                    "order_item": {
                        "id": str(item.order_item.id),
                        "quantity": item.order_item.quantity,
                        "unit_price": float(item.order_item.unit_price) if item.order_item.unit_price else 0,
                        "fulfilled_qty": item.order_item.fulfilled_qty or 0,
                        "returned_qty": item.order_item.returned_qty or 0,
                    } if item.order_item else None,
                    "sku": {
                        "id": str(item.sku.id),
                        "sku_code": item.sku.sku_code,
                        "product_name": item.sku.product_name,
                        "color": item.sku.color,
                        "size": item.sku.size,
                        "base_price": float(item.sku.base_price) if item.sku.base_price else None,
                    } if item.sku else None,
                    "unit_price": float(item.unit_price) if item.unit_price else None,
                    "quantity_returned": item.quantity_returned,
                    "quantity_restocked": item.quantity_restocked,
                    "quantity_damaged": item.quantity_damaged,
                    "reason": item.reason,
                    "condition": item.condition,
                    "notes": item.notes,
                }
                for item in (sr.items or [])
            ],
        }
