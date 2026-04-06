"""Invoice service — generation, PDF export, payment tracking."""

import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.customer import Customer
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceFilterParams,
    InvoiceFromOrder,
    InvoiceUpdate,
)
from app.core.code_generator import next_invoice_number
from app.core.exceptions import NotFoundError, InvalidStateTransitionError


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_invoices(self, params: InvoiceFilterParams, fy_id: UUID) -> dict:
        # FY scoping: current FY records + unpaid invoices from any previous FY
        _INVOICE_ACTIVE = ("issued",)
        filters = [or_(Invoice.fy_id == fy_id, Invoice.status.in_(_INVOICE_ACTIVE))]
        if params.status:
            filters.append(Invoice.status == params.status)
        if params.search:
            q = f"%{params.search}%"
            filters.append(
                (Invoice.invoice_number.ilike(q))
                | (Invoice.customer_name.ilike(q))
                | (Order.customer_name.ilike(q))
            )

        count_stmt = select(func.count()).select_from(Invoice)
        if params.search:
            count_stmt = count_stmt.join(Order, Invoice.order_id == Order.id, isouter=True)
        if filters:
            for f in filters:
                count_stmt = count_stmt.where(f)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        stmt = (
            select(Invoice)
            .options(
                selectinload(Invoice.order),
                selectinload(Invoice.shipment),
                selectinload(Invoice.customer),
                selectinload(Invoice.broker),
                selectinload(Invoice.transport),
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
            )
            .order_by(Invoice.created_at.desc())
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        if params.search:
            stmt = stmt.join(Order, Invoice.order_id == Order.id, isouter=True)
        if filters:
            for f in filters:
                stmt = stmt.where(f)
        result = await self.db.execute(stmt)
        invoices = result.scalars().unique().all()

        return {
            "data": [self._to_response(inv) for inv in invoices],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_invoice(self, invoice_id: UUID) -> dict:
        invoice = await self._get_or_404(invoice_id)
        return self._to_response(invoice)

    async def get_invoice_by_no(self, invoice_no: str) -> dict:
        """Lookup invoice by invoice_number (used by QR scan deep-link)."""
        stmt = (
            select(Invoice)
            .where(Invoice.invoice_number == invoice_no)
            .options(
                selectinload(Invoice.order),
                selectinload(Invoice.shipment),
                selectinload(Invoice.customer),
                selectinload(Invoice.broker),
                selectinload(Invoice.transport),
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
            )
        )
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError(f"Invoice {invoice_no} not found")
        return self._to_response(invoice)

    # ── Helpers for customer + due date ──

    async def _get_customer(self, customer_id: UUID | None) -> Customer | None:
        if not customer_id:
            return None
        result = await self.db.execute(select(Customer).where(Customer.id == customer_id))
        return result.scalar_one_or_none()

    def _compute_due_date(self, issued_at: datetime, customer: Customer | None) -> tuple:
        """Returns (due_date, payment_terms) from customer.due_days."""
        if customer and customer.due_days:
            due = (issued_at + timedelta(days=customer.due_days)).date()
            terms = f"Net {customer.due_days}"
            return due, terms
        return None, None

    # ── Order-based invoice (called by ship_order) ──

    async def create_invoice(self, order_id: UUID, created_by: UUID, fy_id: UUID, *, broker_id=None, transport_id=None, lr_number=None, lr_date=None) -> dict:
        # Duplicate guard — one active invoice per order
        dup_stmt = select(Invoice).where(
            Invoice.order_id == order_id,
            Invoice.status.in_(("draft", "issued", "paid")),
        )
        existing = (await self.db.execute(dup_stmt)).scalar_one_or_none()
        if existing:
            raise InvalidStateTransitionError(
                f"Invoice {existing.invoice_number} already exists for this order"
            )

        invoice_number = await next_invoice_number(self.db, fy_id)

        # Load order with items + SKUs
        order_stmt = (
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items).selectinload(OrderItem.sku))
        )
        order_result = await self.db.execute(order_stmt)
        order = order_result.scalar_one_or_none()
        if not order:
            raise NotFoundError(f"Order {order_id} not found")

        # Customer snapshot + due date
        customer = await self._get_customer(order.customer_id)
        issued_at = datetime.now(timezone.utc)
        due_date, payment_terms = self._compute_due_date(issued_at, customer)
        place_of_supply = customer.state_code if customer else None

        subtotal = float(order.total_amount or 0)
        gst_rate = float(order.gst_percent or 0) / 100
        discount_amount = float(order.discount_amount or 0)
        taxable = subtotal - discount_amount
        tax_amount = round(taxable * gst_rate, 2)
        total_amount = taxable + tax_amount

        from app.services.qr_service import QRService
        qr_data = QRService.generate_qr_base64(invoice_number)

        invoice = Invoice(
            invoice_number=invoice_number,
            order_id=order.id,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
            customer_address=order.customer_address,
            qr_code_data=qr_data,
            gst_percent=order.gst_percent or 0,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total_amount=total_amount,
            status="issued",
            issued_at=issued_at,
            due_date=due_date,
            payment_terms=payment_terms,
            place_of_supply=place_of_supply,
            broker_id=broker_id or order.broker_id,
            transport_id=transport_id or order.transport_id,
            lr_number=lr_number or getattr(order, 'lr_number', None),
            lr_date=lr_date or getattr(order, 'lr_date', None),
            created_by=created_by,
            fy_id=fy_id,
        )
        self.db.add(invoice)
        await self.db.flush()

        # Broker commission ledger entry
        effective_broker_id = broker_id or order.broker_id
        if effective_broker_id and total_amount > 0:
            from app.models.broker import Broker
            broker_obj = (await self.db.execute(select(Broker).where(Broker.id == effective_broker_id))).scalar_one_or_none()
            if broker_obj and broker_obj.commission_rate and broker_obj.commission_rate > 0:
                from decimal import Decimal as D
                commission = round(float(total_amount) * float(broker_obj.commission_rate) / 100, 2)
                from app.services.ledger_service import LedgerService
                from app.schemas.ledger import LedgerEntryCreate
                ledger_svc = LedgerService(self.db)
                await ledger_svc.create_entry(LedgerEntryCreate(
                    entry_date=issued_at.date(),
                    party_type="broker",
                    party_id=effective_broker_id,
                    entry_type="commission",
                    reference_type="invoice",
                    reference_id=invoice.id,
                    debit=commission,
                    credit=0,
                    description=f"Commission on {invoice_number} @ {broker_obj.commission_rate}% — ₹{commission:,.2f}",
                    fy_id=fy_id,
                ))
                await self.db.flush()

        # Create invoice items from order items — denormalize HSN from SKU
        for oi in order.items:
            inv_item = InvoiceItem(
                invoice_id=invoice.id,
                sku_id=oi.sku_id,
                hsn_code=oi.sku.hsn_code if oi.sku else None,
                quantity=oi.quantity,
                unit_price=oi.unit_price,
                total_price=oi.total_price,
            )
            self.db.add(inv_item)
        await self.db.flush()

        # Auto-create ledger entry for customer invoice
        if order.customer_id and total_amount > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=issued_at.date(),
                party_type="customer",
                party_id=order.customer_id,
                entry_type="invoice",
                reference_type="invoice",
                reference_id=invoice.id,
                debit=total_amount,
                credit=0,
                description=f"Invoice {invoice_number} — ₹{total_amount:,.2f}",
                fy_id=fy_id,
            ))
            await self.db.flush()

        return await self.get_invoice(invoice.id)

    # ── Shipment-based invoice (called by ship_order for partial/full ship) ──

    async def create_invoice_for_shipment(self, order, shipment, ship_items, created_by: UUID, fy_id: UUID) -> dict:
        """Create invoice for a specific shipment's items only.

        Args:
            order: The Order object (already loaded with relationships).
            shipment: The Shipment object (already flushed with id).
            ship_items: List of (OrderItem, qty_shipped) tuples.
            created_by: User UUID.
            fy_id: Financial year UUID.
        """
        invoice_number = await next_invoice_number(self.db, fy_id)

        # Calculate subtotal for THIS shipment's items
        shipment_subtotal = sum(float(oi.unit_price) * qty for oi, qty in ship_items)

        # Proportional discount: shipment_discount = order.discount × (shipment_subtotal / order_subtotal)
        order_subtotal = float(order.total_amount or 0)
        if order_subtotal > 0:
            discount_ratio = shipment_subtotal / order_subtotal
        else:
            discount_ratio = 0
        discount_amount = round(float(order.discount_amount or 0) * discount_ratio, 2)

        gst_rate = float(order.gst_percent or 0) / 100
        taxable = shipment_subtotal - discount_amount
        tax_amount = round(taxable * gst_rate, 2)
        total_amount = taxable + tax_amount

        # Customer snapshot + due date
        customer = await self._get_customer(order.customer_id)
        issued_at = datetime.now(timezone.utc)
        due_date, payment_terms = self._compute_due_date(issued_at, customer)
        place_of_supply = customer.state_code if customer else None

        from app.services.qr_service import QRService
        qr_data = QRService.generate_qr_base64(invoice_number)

        invoice = Invoice(
            invoice_number=invoice_number,
            order_id=order.id,
            shipment_id=shipment.id,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
            customer_address=order.customer_address,
            qr_code_data=qr_data,
            gst_percent=order.gst_percent or 0,
            subtotal=shipment_subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total_amount=total_amount,
            status="issued",
            issued_at=issued_at,
            due_date=due_date,
            payment_terms=payment_terms,
            place_of_supply=place_of_supply,
            broker_id=order.broker_id,
            transport_id=shipment.transport_id,
            lr_number=shipment.lr_number,
            lr_date=shipment.lr_date,
            created_by=created_by,
            fy_id=fy_id,
        )
        self.db.add(invoice)
        await self.db.flush()

        # Broker commission — proportional to this shipment's invoice value
        if order.broker_id and total_amount > 0:
            from app.models.broker import Broker
            broker_obj = (await self.db.execute(
                select(Broker).where(Broker.id == order.broker_id)
            )).scalar_one_or_none()
            if broker_obj and broker_obj.commission_rate and broker_obj.commission_rate > 0:
                commission = round(float(total_amount) * float(broker_obj.commission_rate) / 100, 2)
                from app.services.ledger_service import LedgerService
                from app.schemas.ledger import LedgerEntryCreate
                ledger_svc = LedgerService(self.db)
                await ledger_svc.create_entry(LedgerEntryCreate(
                    entry_date=issued_at.date(),
                    party_type="broker",
                    party_id=order.broker_id,
                    entry_type="commission",
                    reference_type="invoice",
                    reference_id=invoice.id,
                    debit=commission,
                    credit=0,
                    description=f"Commission on {invoice_number} @ {broker_obj.commission_rate}% — ₹{commission:,.2f}",
                    fy_id=fy_id,
                ))
                await self.db.flush()

        # Create invoice items — only this shipment's items
        for oi, qty in ship_items:
            inv_item = InvoiceItem(
                invoice_id=invoice.id,
                sku_id=oi.sku_id,
                hsn_code=oi.sku.hsn_code if oi.sku else None,
                quantity=qty,
                unit_price=oi.unit_price,
                total_price=oi.unit_price * qty,
            )
            self.db.add(inv_item)
        await self.db.flush()

        # Customer ledger debit — this invoice's total only
        if order.customer_id and total_amount > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=issued_at.date(),
                party_type="customer",
                party_id=order.customer_id,
                entry_type="invoice",
                reference_type="invoice",
                reference_id=invoice.id,
                debit=total_amount,
                credit=0,
                description=f"Invoice {invoice_number} — ₹{total_amount:,.2f}",
                fy_id=fy_id,
            ))
            await self.db.flush()

        return await self.get_invoice(invoice.id)

    # ── Manual "generate from order" ──

    async def create_invoice_from_order(self, req: InvoiceFromOrder, created_by: UUID, fy_id: UUID) -> dict:
        """Generate invoice from an existing order (manual trigger, not auto-ship)."""
        result = await self.create_invoice(req.order_id, created_by, fy_id)
        # Apply optional overrides from request
        if req.payment_terms or req.place_of_supply or req.notes:
            inv = await self._get_or_404_raw(UUID(result["id"]))
            if req.payment_terms:
                inv.payment_terms = req.payment_terms
            if req.place_of_supply:
                inv.place_of_supply = req.place_of_supply
            if req.notes:
                inv.notes = req.notes
            await self.db.flush()
            return await self.get_invoice(inv.id)
        return result

    # ── Standalone invoice (direct sale, no order) ──

    async def create_standalone_invoice(self, req: InvoiceCreate, created_by: UUID, fy_id: UUID) -> dict:
        """Create an invoice without an order (direct sale)."""
        invoice_number = await next_invoice_number(self.db, fy_id)

        subtotal = sum(float(item.quantity * item.unit_price) for item in req.items)
        discount_amount = float(req.discount_amount or 0)
        taxable = subtotal - discount_amount
        gst_rate = float(req.gst_percent or 0) / 100
        tax_amount = round(taxable * gst_rate, 2)
        total_amount = taxable + tax_amount

        # Customer snapshot + due date
        customer = await self._get_customer(req.customer_id)
        issued_at = datetime.now(timezone.utc)
        due_date, payment_terms_auto = self._compute_due_date(issued_at, customer)
        place_of_supply = req.place_of_supply or (customer.state_code if customer else None)

        from app.services.qr_service import QRService
        qr_data = QRService.generate_qr_base64(invoice_number)

        invoice = Invoice(
            invoice_number=invoice_number,
            order_id=None,
            customer_id=req.customer_id,
            customer_name=req.customer_name or (customer.name if customer else None),
            customer_phone=req.customer_phone or (customer.phone if customer else None),
            customer_address=req.customer_address or (customer.city if customer else None),
            qr_code_data=qr_data,
            gst_percent=req.gst_percent or 0,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total_amount=total_amount,
            status="issued",
            issued_at=issued_at,
            due_date=due_date,
            payment_terms=req.payment_terms or payment_terms_auto,
            place_of_supply=place_of_supply,
            notes=req.notes,
            created_by=created_by,
            fy_id=fy_id,
        )
        self.db.add(invoice)
        await self.db.flush()

        # Fetch SKUs for HSN + stock deduction
        from app.models.sku import SKU
        sku_ids = [item.sku_id for item in req.items]
        sku_result = await self.db.execute(select(SKU).where(SKU.id.in_(sku_ids)))
        sku_map = {s.id: s for s in sku_result.scalars().all()}

        for item in req.items:
            sku = sku_map.get(item.sku_id)
            if not sku:
                raise NotFoundError(f"SKU {item.sku_id} not found")
            inv_item = InvoiceItem(
                invoice_id=invoice.id,
                sku_id=item.sku_id,
                hsn_code=sku.hsn_code,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.quantity * item.unit_price,
            )
            self.db.add(inv_item)
        await self.db.flush()

        # Stock deduction — standalone invoices must deduct inventory
        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)
        for item in req.items:
            await inv_svc.create_event(
                event_type="stock_out",
                item_type="finished_goods",
                reference_type="invoice",
                reference_id=invoice.id,
                sku_id=item.sku_id,
                quantity=item.quantity,
                performed_by=created_by,
                metadata={"invoice_number": invoice_number},
            )

        # Ledger entry
        if req.customer_id and total_amount > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=issued_at.date(),
                party_type="customer",
                party_id=req.customer_id,
                entry_type="invoice",
                reference_type="invoice",
                reference_id=invoice.id,
                debit=total_amount,
                credit=0,
                description=f"Invoice {invoice_number} — ₹{total_amount:,.2f}",
                fy_id=fy_id,
            ))
            await self.db.flush()

        return await self.get_invoice(invoice.id)

    # ── Update invoice (draft/issued only) ──

    async def update_invoice(self, invoice_id: UUID, req: InvoiceUpdate) -> dict:
        invoice = await self._get_or_404(invoice_id)
        if invoice.status not in ("draft", "issued"):
            raise InvalidStateTransitionError(
                f"Cannot edit invoice in '{invoice.status}' status (only draft or issued)"
            )

        for field, value in req.model_dump(exclude_unset=True).items():
            setattr(invoice, field, value)

        # Recalculate tax if gst_percent or discount changed
        if req.gst_percent is not None or req.discount_amount is not None:
            subtotal = float(invoice.subtotal)
            discount = float(invoice.discount_amount or 0)
            taxable = subtotal - discount
            gst_rate = float(invoice.gst_percent or 0) / 100
            invoice.tax_amount = round(taxable * gst_rate, 2)
            invoice.total_amount = taxable + float(invoice.tax_amount)

        await self.db.flush()
        return await self.get_invoice(invoice_id)

    # ── Mark paid ──

    async def mark_paid(self, invoice_id: UUID) -> dict:
        invoice = await self._get_or_404(invoice_id)
        if invoice.status == "paid":
            raise InvalidStateTransitionError("Invoice is already paid")

        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self.get_invoice(invoice_id)

    # ── Cancel invoice ──

    async def cancel_invoice(self, invoice_id: UUID) -> dict:
        invoice = await self._get_or_404(invoice_id)
        if invoice.status not in ("draft", "issued"):
            raise InvalidStateTransitionError(
                f"Cannot cancel invoice in '{invoice.status}' status (only draft or issued)"
            )

        invoice.status = "cancelled"
        await self.db.flush()

        # Reverse stock for standalone invoices (no order = direct sale)
        if not invoice.order_id:
            from app.services.inventory_service import InventoryService
            inv_svc = InventoryService(self.db)
            for item in (invoice.items or []):
                await inv_svc.create_event(
                    event_type="return",
                    item_type="finished_goods",
                    reference_type="invoice_cancel",
                    reference_id=invoice.id,
                    sku_id=item.sku_id,
                    quantity=item.quantity,
                    performed_by=invoice.created_by or invoice.id,  # fallback
                    metadata={"invoice_number": invoice.invoice_number},
                )

        # Reverse ledger entry if one exists
        cust_id = invoice.customer_id or (invoice.order.customer_id if invoice.order else None)
        if cust_id and float(invoice.total_amount or 0) > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=datetime.now(timezone.utc).date(),
                party_type="customer",
                party_id=cust_id,
                entry_type="credit_note",
                reference_type="invoice_cancel",
                reference_id=invoice.id,
                debit=0,
                credit=float(invoice.total_amount),
                description=f"Invoice {invoice.invoice_number} cancelled",
                fy_id=invoice.fy_id,
            ))
            await self.db.flush()

        return await self.get_invoice(invoice_id)

    async def generate_pdf(self, invoice_id: UUID) -> bytes:
        # Deferred to Phase 6D — return invoice data as placeholder
        invoice = await self._get_or_404(invoice_id)
        return b"PDF generation deferred to Phase 6D"

    # ── Internal helpers ──

    async def _get_or_404(self, invoice_id: UUID) -> Invoice:
        stmt = (
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(
                selectinload(Invoice.order),
                selectinload(Invoice.shipment),
                selectinload(Invoice.customer),
                selectinload(Invoice.broker),
                selectinload(Invoice.transport),
                selectinload(Invoice.items).selectinload(InvoiceItem.sku),
            )
        )
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError(f"Invoice {invoice_id} not found")
        return invoice

    async def _get_or_404_raw(self, invoice_id: UUID) -> Invoice:
        """Get invoice without eager loading (for quick updates)."""
        result = await self.db.execute(select(Invoice).where(Invoice.id == invoice_id))
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError(f"Invoice {invoice_id} not found")
        return invoice

    def _to_response(self, inv: Invoice) -> dict:
        # Customer info: prefer invoice-level (standalone), fall back to order-level
        cust_name = inv.customer_name or (inv.order.customer_name if inv.order else None)
        cust_phone = inv.customer_phone or (inv.order.customer_phone if inv.order else None)
        cust_address = inv.customer_address or (inv.order.customer_address if inv.order else None)
        cust_gst = None
        if inv.customer and hasattr(inv.customer, 'gst_no'):
            cust_gst = inv.customer.gst_no
        elif inv.order and hasattr(inv.order, 'customer') and inv.order.customer:
            cust_gst = inv.order.customer.gst_no if hasattr(inv.order.customer, 'gst_no') else None

        return {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "gst_percent": float(inv.gst_percent) if inv.gst_percent else 0,
            "order": {
                "id": str(inv.order.id),
                "order_number": inv.order.order_number,
                "customer_name": inv.order.customer_name,
                "customer_phone": inv.order.customer_phone,
                "customer_address": inv.order.customer_address,
            } if inv.order else None,
            "customer_name": cust_name,
            "customer_phone": cust_phone,
            "customer_address": cust_address,
            "customer_gst_no": cust_gst,
            "subtotal": float(inv.subtotal) if inv.subtotal else 0,
            "tax_amount": float(inv.tax_amount) if inv.tax_amount else 0,
            "discount_amount": float(inv.discount_amount) if inv.discount_amount else 0,
            "total_amount": float(inv.total_amount) if inv.total_amount else 0,
            "status": inv.status,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "payment_terms": inv.payment_terms,
            "place_of_supply": inv.place_of_supply,
            "broker_id": str(inv.broker_id) if inv.broker_id else None,
            "broker": {
                "id": str(inv.broker.id), "name": inv.broker.name,
                "phone": inv.broker.phone, "city": inv.broker.city, "gst_no": inv.broker.gst_no,
            } if hasattr(inv, 'broker') and inv.broker else None,
            "transport_id": str(inv.transport_id) if inv.transport_id else None,
            "transport_detail": {
                "id": str(inv.transport.id), "name": inv.transport.name,
                "phone": inv.transport.phone, "city": inv.transport.city, "gst_no": inv.transport.gst_no,
            } if hasattr(inv, 'transport') and inv.transport else None,
            "lr_number": inv.lr_number,
            "lr_date": inv.lr_date.isoformat() if inv.lr_date else None,
            "shipment": {
                "id": str(inv.shipment.id),
                "shipment_no": inv.shipment.shipment_no,
                "shipped_at": inv.shipment.shipped_at.isoformat() if inv.shipment.shipped_at else None,
                "lr_number": inv.shipment.lr_number,
                "lr_date": inv.shipment.lr_date.isoformat() if inv.shipment.lr_date else None,
                "eway_bill_no": inv.shipment.eway_bill_no,
                "eway_bill_date": inv.shipment.eway_bill_date.isoformat() if inv.shipment.eway_bill_date else None,
            } if hasattr(inv, 'shipment') and inv.shipment else None,
            "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "notes": inv.notes,
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
                    "hsn_code": item.hsn_code,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price) if item.unit_price else 0,
                    "total_price": float(item.total_price) if item.total_price else 0,
                }
                for item in (inv.items or [])
            ],
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
