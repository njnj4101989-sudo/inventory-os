"""Inventory service — event processing, state computation, reconciliation.

Core principle: all stock changes flow through inventory events.
State is always recomputable from the event stream.

Formula: total = STOCK_IN + OPENING_STOCK + ADJUSTMENT + RETURN − STOCK_OUT − LOSS
         reserved = SUM(active reservations)
         available = total − reserved
"""

import math
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory_event import InventoryEvent
from app.models.inventory_state import InventoryState
from app.models.sku import SKU
from app.models.supplier_invoice import SupplierInvoice
from app.schemas.inventory import AdjustRequest, InventoryFilterParams, InventoryResponse, EventResponse, ReconcileResponse
from app.schemas import PaginatedParams
from app.core.exceptions import AppException, NotFoundError, ValidationError


class InventoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_inventory(self, params: InventoryFilterParams) -> dict:
        conditions = []

        if params.sku_code:
            search = f"%{params.sku_code}%"
            conditions.append(
                SKU.sku_code.ilike(search) | SKU.product_name.ilike(search)
            )

        if params.product_type:
            conditions.append(SKU.product_type == params.product_type)

        if params.stock_status == "healthy":
            # available > 60% of total (and total > 0)
            conditions.append(InventoryState.total_qty > 0)
            conditions.append(
                InventoryState.available_qty * 100 >= InventoryState.total_qty * 60
            )
        elif params.stock_status == "low":
            conditions.append(InventoryState.total_qty > 0)
            conditions.append(InventoryState.available_qty > 0)
            conditions.append(
                InventoryState.available_qty * 100 < InventoryState.total_qty * 60
            )
        elif params.stock_status == "critical":
            conditions.append(
                (InventoryState.available_qty <= 0) | (InventoryState.total_qty == 0)
            )

        # Build base query joining SKU for filtering
        base = select(InventoryState).join(SKU, InventoryState.sku_id == SKU.id)
        if conditions:
            base = base.where(*conditions)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        stmt = (
            base
            .options(selectinload(InventoryState.sku))
            .order_by(InventoryState.last_updated.desc())
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        result = await self.db.execute(stmt)
        states = result.scalars().all()

        return {
            "data": [self._state_to_response(s) for s in states],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_sku_inventory(self, sku_id: UUID) -> dict:
        stmt = (
            select(InventoryState)
            .where(InventoryState.sku_id == sku_id)
            .options(selectinload(InventoryState.sku))
        )
        result = await self.db.execute(stmt)
        state = result.scalar_one_or_none()
        if not state:
            raise NotFoundError(f"Inventory state for SKU {sku_id} not found")
        return self._state_to_response(state)

    async def get_events(self, sku_id: UUID, params: PaginatedParams) -> dict:
        count_stmt = (
            select(func.count())
            .select_from(InventoryEvent)
            .where(InventoryEvent.sku_id == sku_id)
        )
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        stmt = (
            select(InventoryEvent)
            .where(InventoryEvent.sku_id == sku_id)
            .options(selectinload(InventoryEvent.performed_by_user))
            .order_by(InventoryEvent.performed_at.desc())
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        result = await self.db.execute(stmt)
        events = result.scalars().all()

        ref_map = await self._resolve_event_references(events)

        return {
            "data": [self._event_to_response(e, ref_map.get(e.id)) for e in events],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def _resolve_event_references(self, events) -> dict:
        """Batch-resolve event.reference_id into human-readable {kind, code, extra, deep_link}.

        Returns {event.id: info_dict}. One query per referenced table — no N+1.
        """
        by_type: dict[str, set] = {}
        for e in events:
            if e.reference_type and e.reference_id:
                by_type.setdefault(e.reference_type, set()).add(e.reference_id)

        ref_info: dict = {}  # reference_id UUID -> info

        if "shipment" in by_type:
            from app.models.shipment import Shipment
            shipments = (await self.db.execute(
                select(Shipment)
                .where(Shipment.id.in_(by_type["shipment"]))
                .options(selectinload(Shipment.order))
            )).scalars().all()
            for s in shipments:
                ref_info[s.id] = {
                    "kind": "shipment",
                    "code": s.shipment_no,
                    "extra": s.order.order_number if s.order else None,
                    "order_id": str(s.order.id) if s.order else None,
                }

        batch_ids = by_type.get("batch", set()) | by_type.get("batch_pack", set())
        if batch_ids:
            from app.models.batch import Batch
            batches = (await self.db.execute(
                select(Batch)
                .where(Batch.id.in_(batch_ids))
                .options(selectinload(Batch.lot))
            )).scalars().all()
            for b in batches:
                ref_info[b.id] = {
                    "kind": "batch",
                    "code": b.batch_code,
                    "extra": b.lot.lot_code if b.lot else None,
                    "batch_id": str(b.id),
                }

        if "purchase_item" in by_type:
            from app.models.purchase_item import PurchaseItem
            pis = (await self.db.execute(
                select(PurchaseItem)
                .where(PurchaseItem.id.in_(by_type["purchase_item"]))
                .options(selectinload(PurchaseItem.supplier_invoice).selectinload(SupplierInvoice.supplier))
            )).scalars().all()
            for pi in pis:
                inv = pi.supplier_invoice
                ref_info[pi.id] = {
                    "kind": "purchase_item",
                    "code": inv.invoice_no if inv and inv.invoice_no else "Purchase",
                    "extra": inv.supplier.name if inv and inv.supplier else None,
                    "supplier_invoice_id": str(inv.id) if inv else None,
                }

        if "supplier_invoice" in by_type:
            sis = (await self.db.execute(
                select(SupplierInvoice)
                .where(SupplierInvoice.id.in_(by_type["supplier_invoice"]))
                .options(selectinload(SupplierInvoice.supplier))
            )).scalars().all()
            for si in sis:
                ref_info[si.id] = {
                    "kind": "supplier_invoice",
                    "code": si.invoice_no or "Purchase",
                    "extra": si.supplier.name if si.supplier else None,
                    "supplier_invoice_id": str(si.id),
                }

        if "sales_return" in by_type:
            from app.models.sales_return import SalesReturn
            srs = (await self.db.execute(
                select(SalesReturn)
                .where(SalesReturn.id.in_(by_type["sales_return"]))
                .options(selectinload(SalesReturn.invoice), selectinload(SalesReturn.order))
            )).scalars().all()
            for sr in srs:
                # Prefer the CN number as the user-facing code — it's the GST
                # document. Fall back to SRN if CN not yet assigned (should
                # not happen for closed returns, but kept defensive).
                code = sr.credit_note_no or sr.srn_no
                # Extra context: invoice it reverses, falling back to the
                # linked order so the row is always useful.
                extra = None
                if sr.invoice and sr.invoice.invoice_number:
                    extra = sr.invoice.invoice_number
                elif sr.order and sr.order.order_number:
                    extra = sr.order.order_number
                ref_info[sr.id] = {
                    "kind": "sales_return",
                    "code": code,
                    "extra": extra,
                    "sales_return_id": str(sr.id),
                }

        # Build per-event map (static labels for types without FK lookup)
        out: dict = {}
        for e in events:
            if e.reference_type == "manual_adjustment":
                out[e.id] = {
                    "kind": "manual_adjustment",
                    "code": "Manual",
                    "extra": (e.metadata_ or {}).get("reason"),
                }
            elif e.reference_type == "opening_stock":
                out[e.id] = {"kind": "opening_stock", "code": "Opening Stock", "extra": None}
            elif e.reference_id in ref_info:
                out[e.id] = ref_info[e.reference_id]
        return out

    async def create_event(
        self,
        event_type: str,
        item_type: str,
        reference_type: str,
        reference_id: UUID,
        sku_id: UUID,
        quantity: int,
        performed_by: UUID,
        metadata: dict | None = None,
    ) -> InventoryEvent:
        event = InventoryEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            item_type=item_type,
            reference_type=reference_type,
            reference_id=reference_id,
            sku_id=sku_id,
            quantity=quantity,
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc),
            metadata_=metadata or {},
        )
        self.db.add(event)
        await self.db.flush()

        # Upsert inventory state (FOR UPDATE prevents concurrent stock corruption)
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id).with_for_update()
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()

        if not state:
            state = InventoryState(
                sku_id=sku_id,
                total_qty=0,
                available_qty=0,
                reserved_qty=0,
            )
            self.db.add(state)
            await self.db.flush()

        # Update based on event type
        if event_type == "adjustment":
            # Adjustment supports both positive (add) and negative (subtract)
            state.total_qty = max(0, state.total_qty + quantity)
        elif event_type in ("stock_in", "return", "ready_stock_in", "opening_stock"):
            state.total_qty += quantity
        elif event_type in ("stock_out", "loss"):
            state.total_qty = max(0, state.total_qty - quantity)

        state.available_qty = max(0, state.total_qty - state.reserved_qty)
        state.last_updated = datetime.now(timezone.utc)
        await self.db.flush()

        return event

    async def adjust_inventory(self, req: AdjustRequest, user_id: UUID) -> dict:
        valid_types = ("stock_in", "stock_out", "loss", "return", "adjustment", "opening_stock")
        if req.event_type not in valid_types:
            raise ValidationError(f"Invalid event_type '{req.event_type}'. Must be one of: {valid_types}")

        # Verify SKU exists
        sku_stmt = select(SKU).where(SKU.id == req.sku_id)
        sku_result = await self.db.execute(sku_stmt)
        if not sku_result.scalar_one_or_none():
            raise NotFoundError(f"SKU {req.sku_id} not found")

        # Negative adjustment: validate against available stock
        if req.quantity < 0:
            inv_stmt = select(InventoryState).where(InventoryState.sku_id == req.sku_id)
            inv_result = await self.db.execute(inv_stmt)
            inv_state = inv_result.scalar_one_or_none()
            available = inv_state.available_qty if inv_state else 0
            reserved = inv_state.reserved_qty if inv_state else 0
            if abs(req.quantity) > available:
                msg = f"Cannot reduce by {abs(req.quantity)} — only {available} available"
                if reserved > 0:
                    msg += f" ({reserved} reserved for orders — cancel/edit orders first)"
                raise AppException(msg)

        event = await self.create_event(
            event_type=req.event_type,
            item_type=req.item_type or "finished_goods",
            reference_type="manual_adjustment",
            reference_id=uuid.uuid4(),
            sku_id=req.sku_id,
            quantity=req.quantity,
            performed_by=user_id,
            metadata={"reason": req.reason} if req.reason else None,
        )

        inv = await self.get_sku_inventory(req.sku_id)
        return {
            "event": self._event_to_response(event),
            "inventory": inv,
        }

    async def create_opening_stock(self, items: list, performed_by: UUID) -> dict:
        """Bulk opening stock entry for Day 1 setup."""
        created = 0
        skipped = []

        for item in items:
            # Check for existing opening_stock event for this SKU (prevent duplicates)
            existing = (await self.db.execute(
                select(func.count()).select_from(InventoryEvent).where(
                    InventoryEvent.sku_id == item.sku_id,
                    InventoryEvent.event_type == "opening_stock",
                )
            )).scalar() or 0
            if existing > 0:
                # Get SKU code for message
                sku = (await self.db.execute(
                    select(SKU.sku_code).where(SKU.id == item.sku_id)
                )).scalar()
                skipped.append(sku or str(item.sku_id))
                continue

            # Verify SKU exists
            sku_row = (await self.db.execute(
                select(SKU).where(SKU.id == item.sku_id)
            )).scalar_one_or_none()
            if not sku_row:
                raise ValidationError(f"SKU {item.sku_id} not found")

            if item.quantity <= 0:
                raise ValidationError(f"Quantity must be > 0 for SKU {sku_row.sku_code}")

            metadata = {"is_opening_stock": True}
            if item.unit_cost is not None:
                metadata["unit_cost"] = item.unit_cost

            await self.create_event(
                event_type="opening_stock",
                item_type="finished_goods",
                reference_type="opening_stock",
                reference_id=uuid.uuid4(),
                sku_id=item.sku_id,
                quantity=item.quantity,
                performed_by=performed_by,
                metadata=metadata,
            )
            created += 1

        return {
            "created": created,
            "skipped": skipped,
            "message": f"{created} SKU opening stock entries created" + (f", {len(skipped)} skipped (already exist)" if skipped else ""),
        }

    async def reconcile(self) -> dict:
        from collections import defaultdict

        # Get all inventory states
        stmt = select(InventoryState)
        result = await self.db.execute(stmt)
        states = result.scalars().all()

        skus_checked = len(states)
        if skus_checked == 0:
            return {"skus_checked": 0, "mismatches_found": 0, "mismatches_fixed": 0}

        # Single GROUP BY query for ALL SKUs instead of N individual queries
        evt_stmt = (
            select(
                InventoryEvent.sku_id,
                InventoryEvent.event_type,
                func.sum(InventoryEvent.quantity).label("total"),
            )
            .group_by(InventoryEvent.sku_id, InventoryEvent.event_type)
        )
        evt_rows = (await self.db.execute(evt_stmt)).all()

        # Build lookup: {sku_id: {event_type: total}}
        evt_map = defaultdict(dict)
        for row in evt_rows:
            evt_map[row.sku_id][row.event_type] = row.total

        mismatches_found = 0
        mismatches_fixed = 0

        for state in states:
            totals = evt_map.get(state.sku_id, {})
            computed_total = (
                (totals.get("stock_in", 0) or 0)
                + (totals.get("return", 0) or 0)
                + (totals.get("ready_stock_in", 0) or 0)
                + (totals.get("opening_stock", 0) or 0)
                + (totals.get("adjustment", 0) or 0)
                - (totals.get("stock_out", 0) or 0)
                - (totals.get("loss", 0) or 0)
            )
            computed_total = max(0, computed_total)

            if state.total_qty != computed_total:
                mismatches_found += 1
                state.total_qty = computed_total
                state.available_qty = max(0, computed_total - state.reserved_qty)
                state.last_updated = datetime.now(timezone.utc)
                mismatches_fixed += 1

        await self.db.flush()

        return {
            "skus_checked": skus_checked,
            "mismatches_found": mismatches_found,
            "mismatches_fixed": mismatches_fixed,
        }

    async def get_stock_by_code(self, sku_code: str) -> dict:
        """Get stock level for a SKU by its code (for external API)."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU '{sku_code}' not found")

        inv_stmt = (
            select(InventoryState)
            .where(InventoryState.sku_id == sku.id)
            .options(selectinload(InventoryState.sku))
        )
        inv_result = await self.db.execute(inv_stmt)
        state = inv_result.scalar_one_or_none()

        return {
            "sku_code": sku.sku_code,
            "product_name": sku.product_name,
            "available_qty": state.available_qty if state else 0,
            "total_qty": state.total_qty if state else 0,
            "reserved_qty": state.reserved_qty if state else 0,
        }

    def _state_to_response(self, s: InventoryState) -> dict:
        return {
            "id": str(s.id),
            "sku": {
                "id": str(s.sku.id),
                "sku_code": s.sku.sku_code,
                "product_name": s.sku.product_name,
                "base_price": float(s.sku.base_price) if s.sku.base_price else None,
            } if s.sku else None,
            "sku_id": str(s.sku_id),
            "total_qty": s.total_qty,
            "available_qty": s.available_qty,
            "reserved_qty": s.reserved_qty,
            "last_updated": s.last_updated.isoformat() if s.last_updated else None,
        }

    def _event_to_response(self, e: InventoryEvent, reference: dict | None = None) -> dict:
        return {
            "id": str(e.id),
            "event_id": e.event_id,
            "event_type": e.event_type,
            "item_type": e.item_type,
            "reference_type": e.reference_type,
            "reference_id": str(e.reference_id) if e.reference_id else None,
            "reference": reference,
            "sku_id": str(e.sku_id) if e.sku_id else None,
            "quantity": e.quantity,
            "performed_by": {
                "id": str(e.performed_by_user.id),
                "full_name": e.performed_by_user.full_name,
            } if e.performed_by_user else None,
            "performed_at": e.performed_at.isoformat() if e.performed_at else None,
            "metadata": e.metadata_,
        }
