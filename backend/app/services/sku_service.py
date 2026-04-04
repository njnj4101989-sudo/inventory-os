"""SKU service — CRUD, auto-code generation, and purchase stock."""

import math
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sku import SKU
from app.models.design import Design
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_processing import BatchProcessing
from app.models.lot import Lot
from app.models.inventory_state import InventoryState
from app.models.inventory_event import InventoryEvent
from app.models.supplier_invoice import SupplierInvoice
from app.models.purchase_item import PurchaseItem
from app.models.shipment_item import ShipmentItem
from app.schemas.sku import SKUCreate, SKUUpdate, SKUResponse, PurchaseStockRequest, SKUOpeningStockRequest, SKUFilterParams
from app.schemas import PaginatedParams
from app.core.exceptions import AppException, DuplicateError, NotFoundError


class SKUService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_skus(self, params: SKUFilterParams) -> dict:
        from sqlalchemy import or_

        conditions = []
        if params.search:
            # Normalize: collapse whitespace, treat dots as wildcards
            # so "b.green" matches "B. GREEN" and "sbl-1072-b.green" matches "SBL-1072-B. GREEN"
            normalized = ' '.join(params.search.strip().split())
            normalized = normalized.replace('.', '%')
            s = f"%{normalized}%"
            conditions.append(
                or_(
                    SKU.sku_code.ilike(s),
                    SKU.product_name.ilike(s),
                    SKU.color.ilike(s),
                    SKU.size.ilike(s),
                )
            )
        if params.product_type:
            conditions.append(SKU.product_type == params.product_type)
        if params.is_active is not None:
            conditions.append(SKU.is_active == params.is_active)

        where_clause = conditions if conditions else []

        count_stmt = select(func.count()).select_from(SKU)
        if where_clause:
            count_stmt = count_stmt.where(*where_clause)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(SKU, params.sort_by, SKU.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = select(SKU).order_by(order)
        if where_clause:
            stmt = stmt.where(*where_clause)
        stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)

        result = await self.db.execute(stmt)
        skus = result.scalars().all()

        # Get inventory states
        sku_ids = [s.id for s in skus]
        inv_stmt = select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
        inv_result = await self.db.execute(inv_stmt)
        inv_map = {inv.sku_id: inv for inv in inv_result.scalars().all()}

        # Pipeline qty: batches not yet packed, aggregated by expected SKU code
        pipeline_map = await self._compute_pipeline_map()

        return {
            "data": [
                self._to_response(s, inv_map.get(s.id), pipeline_map.get(s.sku_code, 0))
                for s in skus
            ],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_sku(self, sku_id: UUID) -> dict:
        sku = await self._get_or_404(sku_id)
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()

        # Load source batches with lot, assignments (tailor), processing logs (VA)
        batch_stmt = (
            select(Batch)
            .where(Batch.sku_id == sku_id)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.assignments).selectinload(
                    BatchAssignment.tailor
                ),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.value_addition
                ),
            )
        )
        batch_result = await self.db.execute(batch_stmt)
        batches = batch_result.scalars().all()

        pipeline_map = await self._compute_pipeline_map()
        resp = self._to_response(sku, inv, pipeline_map.get(sku.sku_code, 0))
        resp["source_batches"] = [self._batch_brief(b) for b in batches]

        # Check if identity fields (color/size) are editable — blocked if shipped
        shipped_count = await self.db.scalar(
            select(func.count(ShipmentItem.id)).where(ShipmentItem.sku_id == sku_id)
        )
        resp["is_identity_editable"] = (shipped_count or 0) == 0

        return resp

    async def get_cost_history(self, sku_id: UUID) -> dict:
        """Per-batch cost breakdown from ready_stock_in event metadata."""
        sku = await self._get_or_404(sku_id)

        # Get all stock-adding events for this SKU
        events = (await self.db.execute(
            select(InventoryEvent)
            .where(
                InventoryEvent.sku_id == sku_id,
                InventoryEvent.event_type.in_(("ready_stock_in", "opening_stock", "stock_in", "adjustment")),
            )
            .order_by(InventoryEvent.performed_at.desc())
        )).scalars().all()

        batches = []
        total_pieces = 0
        total_cost = 0.0

        for evt in events:
            meta = evt.metadata_ or {}
            cb = meta.get("cost_breakdown", {})
            unit_cost = float(meta.get("unit_cost", 0))
            qty = evt.quantity or 0

            batches.append({
                "batch_code": meta.get("batch_code", meta.get("reference", "—")),
                "event_type": evt.event_type,
                "date": evt.performed_at.strftime("%Y-%m-%d") if evt.performed_at else None,
                "pieces": qty,
                "material_cost": round(float(cb.get("material_cost", 0)), 2),
                "roll_va_cost": round(float(cb.get("roll_va_cost", 0)), 2),
                "stitching_cost": round(float(cb.get("stitching_cost", 0)), 2),
                "batch_va_cost": round(float(cb.get("batch_va_cost", 0)), 2),
                "other_cost": round(float(cb.get("other_cost", 0)), 2),
                "total_cost_per_piece": round(unit_cost, 2),
                "line_total": round(unit_cost * qty, 2),
                "rate_pending": unit_cost == 0 and qty > 0,
            })
            total_pieces += qty
            total_cost += unit_cost * qty

        wac = round(total_cost / total_pieces, 2) if total_pieces > 0 else 0

        return {
            "sku_id": str(sku_id),
            "sku_code": sku.sku_code,
            "current_stitching_cost": float(sku.stitching_cost) if sku.stitching_cost else None,
            "current_other_cost": float(sku.other_cost) if sku.other_cost else None,
            "total_batches": len(batches),
            "total_pieces": total_pieces,
            "total_cost": round(total_cost, 2),
            "wac_per_piece": wac,
            "batches": batches,
        }

    async def create_sku(self, req: SKUCreate) -> dict:
        # Auto-generate sku_code: ProductType-DesignNo-Color-Size
        sku_code = f"{req.product_type}-{req.product_name}-{req.color}-{req.size}"

        existing = await self.db.execute(
            select(SKU).where(SKU.sku_code == sku_code)
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"SKU code '{sku_code}' already exists")

        sku = SKU(
            sku_code=sku_code,
            product_type=req.product_type,
            product_name=req.product_name,
            color=req.color,
            color_id=req.color_id,
            size=req.size,
            description=req.description,
            base_price=req.base_price,
        )
        self.db.add(sku)
        await self.db.flush()

        # Create initial inventory state
        inv = InventoryState(
            sku_id=sku.id,
            total_qty=0,
            available_qty=0,
            reserved_qty=0,
        )
        self.db.add(inv)
        await self.db.flush()

        return self._to_response(sku, inv)

    async def update_sku(self, sku_id: UUID, req: SKUUpdate) -> dict:
        sku = await self._get_or_404(sku_id)

        update_data = req.model_dump(exclude_unset=True)
        identity_fields = {'color', 'color_id', 'size', 'design_id'}
        has_identity_change = bool(identity_fields & update_data.keys())

        # Guard: block identity edits if SKU has shipped/invoiced orders
        if has_identity_change:
            shipped_count = await self.db.scalar(
                select(func.count(ShipmentItem.id)).where(ShipmentItem.sku_id == sku_id)
            )
            if shipped_count and shipped_count > 0:
                raise AppException(
                    status_code=409,
                    detail="Cannot edit color/size — this SKU has shipped orders. Create a new SKU instead.",
                )

        for field, value in update_data.items():
            setattr(sku, field, value)

        # Regenerate sku_code if identity fields changed
        if has_identity_change:
            product_type = sku.product_type
            # Get design_no — from Design model if design_id exists
            design_no = None
            if sku.design_id:
                design_obj = await self.db.get(Design, sku.design_id)
                if design_obj:
                    design_no = design_obj.design_no
            if not design_no:
                # Fallback: parse from current sku_code
                parts = sku.sku_code.split('-')
                design_no = parts[1] if len(parts) >= 2 else ''
            new_code = f"{product_type}-{design_no}-{sku.color}-{sku.size}"
            # Duplicate check
            existing = await self.db.scalar(
                select(SKU.id).where(SKU.sku_code == new_code, SKU.id != sku_id)
            )
            if existing:
                raise DuplicateError(f"SKU '{new_code}' already exists")
            sku.sku_code = new_code

        await self.db.flush()

        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()
        return self._to_response(sku, inv)

    async def find_or_create(
        self, sku_code: str, product_type: str, product_name: str, color: str, size: str,
        color_id: UUID | None = None, design_id: UUID | None = None,
    ) -> SKU:
        """Find existing SKU by code, or create new one with InventoryState."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if sku:
            # Backfill FKs if not set yet
            if color_id and not sku.color_id:
                sku.color_id = color_id
            if design_id and not sku.design_id:
                sku.design_id = design_id
            return sku

        sku = SKU(
            sku_code=sku_code,
            product_type=product_type,
            product_name=product_name,
            color=color,
            color_id=color_id,
            design_id=design_id,
            size=size,
            is_active=True,
        )
        self.db.add(sku)
        await self.db.flush()

        # Auto-create InventoryState
        state = InventoryState(
            sku_id=sku.id,
            total_qty=0,
            available_qty=0,
            reserved_qty=0,
        )
        self.db.add(state)
        await self.db.flush()
        return sku

    async def purchase_stock(
        self, req: PurchaseStockRequest, received_by: UUID, fy_id: UUID
    ) -> dict:
        """Create purchase invoice + SKUs + inventory events + ledger entry."""
        now = datetime.now(timezone.utc)

        # Duplicate check
        if req.invoice_no and req.supplier_id:
            dup_stmt = select(SupplierInvoice).where(
                SupplierInvoice.supplier_id == req.supplier_id,
                SupplierInvoice.invoice_no == req.invoice_no,
                SupplierInvoice.type == "item_purchase",
            )
            if req.challan_no:
                dup_stmt = dup_stmt.where(SupplierInvoice.challan_no == req.challan_no)
            dup = await self.db.execute(dup_stmt)
            if dup.scalar_one_or_none():
                raise DuplicateError(
                    f"Purchase invoice {req.invoice_no} already exists for this supplier"
                )

        # Create SupplierInvoice
        supplier_inv = SupplierInvoice(
            supplier_id=req.supplier_id,
            invoice_no=req.invoice_no,
            challan_no=req.challan_no,
            invoice_date=req.invoice_date,
            sr_no=req.sr_no,
            gst_percent=req.gst_percent,
            received_by=received_by,
            received_at=now,
            notes=req.notes,
            type="item_purchase",
            fy_id=fy_id,
        )
        self.db.add(supplier_inv)
        await self.db.flush()

        # Process line items
        from app.services.inventory_service import InventoryService
        inv_svc = InventoryService(self.db)

        created_items = []
        for item in req.line_items:
            sku_code = f"{item.product_type}-{item.design_no}-{item.color}-{item.size}"
            sku = await self.find_or_create(
                sku_code=sku_code,
                product_type=item.product_type,
                product_name=item.design_no,
                color=item.color,
                size=item.size,
                color_id=item.color_id,
                design_id=item.design_id,
            )

            # Set pricing/tax if not already set
            if sku.base_price is None:
                sku.base_price = item.unit_price
            if item.hsn_code and not sku.hsn_code:
                sku.hsn_code = item.hsn_code
            if item.gst_percent is not None and sku.gst_percent is None:
                sku.gst_percent = item.gst_percent

            total_price = item.qty * item.unit_price
            pi = PurchaseItem(
                supplier_invoice_id=supplier_inv.id,
                sku_id=sku.id,
                quantity=item.qty,
                unit_price=item.unit_price,
                total_price=total_price,
                hsn_code=item.hsn_code,
                gst_percent=item.gst_percent,
            )
            self.db.add(pi)
            await self.db.flush()

            # Fire inventory event
            await inv_svc.create_event(
                event_type="ready_stock_in",
                item_type="finished_goods",
                reference_type="purchase_item",
                reference_id=pi.id,
                sku_id=sku.id,
                quantity=item.qty,
                performed_by=received_by,
                metadata={"invoice_no": req.invoice_no, "sku_code": sku_code},
            )

            created_items.append({
                "sku_id": str(sku.id),
                "sku_code": sku_code,
                "quantity": item.qty,
                "total_price": total_price,
            })

        # Ledger entry — keep Decimal throughout for precision
        subtotal = sum((it["total_price"] for it in created_items), Decimal("0"))
        if subtotal > 0:
            gst_pct = req.gst_percent or Decimal("0")
            gst_amt = (subtotal * gst_pct / Decimal("100")).quantize(Decimal("0.01"))
            total = subtotal + gst_amt
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=req.invoice_date or now.date(),
                party_type="supplier",
                party_id=req.supplier_id,
                entry_type="invoice",
                reference_type="supplier_invoice",
                reference_id=supplier_inv.id,
                debit=0,
                credit=total,
                description=f"Purchase stock-in {req.invoice_no or 'N/A'} — {len(created_items)} items, ₹{float(total):,.2f}",
                created_by=received_by,
                fy_id=fy_id,
            ))
            await self.db.flush()

        return {
            "invoice_id": str(supplier_inv.id),
            "invoice_no": req.invoice_no,
            "items_created": len(created_items),
            "items": [
                {**it, "total_price": float(it["total_price"])} for it in created_items
            ],
            "subtotal": float(subtotal),
        }

    async def create_opening_stock(
        self, req: SKUOpeningStockRequest, performed_by: UUID
    ) -> dict:
        """Bulk opening stock: find/create SKUs + create opening_stock events."""
        import uuid as _uuid
        from app.services.inventory_service import InventoryService

        inv_svc = InventoryService(self.db)
        created = 0
        skipped = []
        results = []

        for item in req.line_items:
            sku_code = f"{item.product_type}-{item.design_no}-{item.color}-{item.size}"

            # Check if SKU exists before find_or_create (to track created_new_sku)
            existing_sku = (await self.db.execute(
                select(SKU).where(SKU.sku_code == sku_code)
            )).scalar_one_or_none()
            created_new_sku = existing_sku is None

            sku = await self.find_or_create(
                sku_code=sku_code,
                product_type=item.product_type,
                product_name=item.design_no,
                color=item.color,
                size=item.size,
                color_id=item.color_id,
                design_id=item.design_id,
            )

            # Check for existing opening_stock event
            has_opening = (await self.db.execute(
                select(func.count()).select_from(InventoryEvent).where(
                    InventoryEvent.sku_id == sku.id,
                    InventoryEvent.event_type == "opening_stock",
                )
            )).scalar() or 0

            if has_opening > 0:
                # Get current qty for the skip response
                inv_state = (await self.db.execute(
                    select(InventoryState).where(InventoryState.sku_id == sku.id)
                )).scalar_one_or_none()
                skipped.append({
                    "sku_code": sku_code,
                    "sku_id": str(sku.id),
                    "existing_qty": inv_state.total_qty if inv_state else 0,
                })
                continue

            # Set base_price if not already set
            if sku.base_price is None and item.unit_cost is not None:
                sku.base_price = item.unit_cost

            metadata = {"is_opening_stock": True}
            if item.unit_cost is not None:
                metadata["unit_cost"] = float(item.unit_cost)

            await inv_svc.create_event(
                event_type="opening_stock",
                item_type="finished_goods",
                reference_type="opening_stock",
                reference_id=_uuid.uuid4(),
                sku_id=sku.id,
                quantity=item.qty,
                performed_by=performed_by,
                metadata=metadata,
            )
            created += 1
            results.append({
                "sku_code": sku_code,
                "sku_id": str(sku.id),
                "created_new_sku": created_new_sku,
                "qty": item.qty,
                "unit_cost": float(item.unit_cost) if item.unit_cost else None,
            })

        skip_msg = f", {len(skipped)} skipped (already have opening stock)" if skipped else ""
        return {
            "created": created,
            "skipped": skipped,
            "results": results,
            "message": f"{created} opening stock entries created{skip_msg}",
        }

    async def get_purchase_invoices(self, params, fy_id: UUID) -> dict:
        """List item_purchase invoices with items."""
        base = select(SupplierInvoice).where(
            SupplierInvoice.type == "item_purchase",
        )
        if fy_id:
            base = base.where(SupplierInvoice.fy_id == fy_id)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            base
            .options(
                selectinload(SupplierInvoice.supplier),
                selectinload(SupplierInvoice.purchase_items).selectinload(PurchaseItem.sku),
            )
            .order_by(SupplierInvoice.received_at.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        invoices = result.scalars().all()

        return {
            "data": [self._purchase_invoice_to_response(inv) for inv in invoices],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    def _purchase_invoice_to_response(self, inv: SupplierInvoice) -> dict:
        items = []
        total_amount = Decimal("0")
        for pi in (inv.purchase_items or []):
            total_amount += pi.total_price or 0
            items.append({
                "id": str(pi.id),
                "sku_id": str(pi.sku_id),
                "sku_code": pi.sku.sku_code if pi.sku else "",
                "product_type": pi.sku.product_type if pi.sku else "",
                "design_no": pi.sku.product_name if pi.sku else "",
                "color": pi.sku.color if pi.sku else "",
                "size": pi.sku.size if pi.sku else "",
                "quantity": pi.quantity,
                "unit_price": float(pi.unit_price),
                "total_price": float(pi.total_price),
                "hsn_code": pi.hsn_code,
                "gst_percent": float(pi.gst_percent) if pi.gst_percent else None,
            })
        return {
            "id": str(inv.id),
            "supplier": {"id": str(inv.supplier.id), "name": inv.supplier.name} if inv.supplier else None,
            "invoice_no": inv.invoice_no,
            "challan_no": inv.challan_no,
            "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
            "sr_no": inv.sr_no,
            "gst_percent": float(inv.gst_percent),
            "received_at": inv.received_at.isoformat() if inv.received_at else None,
            "notes": inv.notes,
            "items": items,
            "item_count": len(items),
            "total_amount": float(total_amount),
        }

    async def get_sku_by_code(self, sku_code: str) -> dict:
        """Lookup SKU by code — returns SKU + stock + price. Used by sales return form."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU '{sku_code}' not found")

        inv = (await self.db.execute(
            select(InventoryState).where(InventoryState.sku_id == sku.id)
        )).scalar_one_or_none()

        return self._to_response(sku, inv)

    async def get_sku_passport(self, sku_code: str) -> dict:
        """Full SKU passport — details, stock, source breakdown, production chain."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU '{sku_code}' not found")

        # Inventory state
        inv = (await self.db.execute(
            select(InventoryState).where(InventoryState.sku_id == sku.id)
        )).scalar_one_or_none()

        # Inventory events for source breakdown
        events_result = await self.db.execute(
            select(InventoryEvent)
            .where(InventoryEvent.sku_id == sku.id)
            .order_by(InventoryEvent.performed_at.desc())
        )
        events = events_result.scalars().all()

        production_qty = sum(e.quantity for e in events if e.reference_type == "batch")
        purchase_qty = sum(e.quantity for e in events if e.reference_type == "purchase_invoice")
        returned_qty = sum(e.quantity for e in events if e.event_type == "return")
        sold_qty = sum(e.quantity for e in events if e.event_type == "stock_out")

        # Source batches with full chain
        batch_ids = [e.reference_id for e in events if e.reference_type == "batch"]
        source_batches = []
        if batch_ids:
            batch_stmt = (
                select(Batch)
                .where(Batch.id.in_(batch_ids))
                .options(
                    selectinload(Batch.lot),
                    selectinload(Batch.assignments).selectinload(BatchAssignment.tailor),
                    selectinload(Batch.processing_logs).selectinload(BatchProcessing.value_addition),
                )
            )
            batch_result = await self.db.execute(batch_stmt)
            source_batches = [self._batch_brief(b) for b in batch_result.scalars().all()]

        # Purchase invoices
        purchase_events = [e for e in events if e.reference_type == "purchase_invoice"]
        purchase_info = []
        if purchase_events:
            inv_ids = [e.reference_id for e in purchase_events]
            pi_result = await self.db.execute(
                select(SupplierInvoice).where(SupplierInvoice.id.in_(inv_ids))
            )
            for si in pi_result.scalars().all():
                purchase_info.append({
                    "id": str(si.id),
                    "invoice_no": si.invoice_no,
                    "supplier_id": str(si.supplier_id) if si.supplier_id else None,
                    "total_amount": float(si.total_amount) if si.total_amount else 0,
                    "invoice_date": si.invoice_date.isoformat() if si.invoice_date else None,
                })

        resp = self._to_response(sku, inv)
        resp["source_breakdown"] = {
            "production_qty": production_qty,
            "purchase_qty": purchase_qty,
            "returned_qty": returned_qty,
            "sold_qty": sold_qty,
        }
        resp["source_batches"] = source_batches
        resp["purchase_invoices"] = purchase_info
        resp["events"] = [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "reference_type": e.reference_type,
                "quantity": e.quantity,
                "performed_at": e.performed_at.isoformat() if e.performed_at else None,
                "metadata": e.metadata_ if hasattr(e, 'metadata_') else None,
            }
            for e in events[:20]  # Last 20 events
        ]
        return resp

    def _batch_brief(self, b: Batch) -> dict:
        """Compact batch info for SKU detail view."""
        tailor = None
        if b.assignments:
            a = b.assignments[-1]  # latest assignment
            if a.tailor:
                tailor = {"id": str(a.tailor.id), "full_name": a.tailor.full_name}

        lot_brief = None
        if b.lot:
            lot_brief = {
                "id": str(b.lot.id),
                "lot_code": b.lot.lot_code,
                "designs": b.lot.designs or [],
            }

        processing = []
        for p in (b.processing_logs or []):
            va_info = None
            if p.value_addition:
                va_info = {
                    "name": p.value_addition.name,
                    "short_code": p.value_addition.short_code,
                }
            processing.append({
                "id": str(p.id),
                "value_addition": va_info,
                "status": p.status,
                "pieces_sent": p.pieces_sent,
                "pieces_received": p.pieces_received,
                "cost": float(p.cost) if p.cost else None,
                "phase": p.phase,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            })

        return {
            "id": str(b.id),
            "batch_code": b.batch_code,
            "status": b.status,
            "size": b.size,
            "piece_count": b.piece_count,
            "color_qc": b.color_qc,
            "approved_qty": b.approved_qty,
            "rejected_qty": b.rejected_qty,
            "lot": lot_brief,
            "tailor": tailor,
            "packed_at": b.packed_at.isoformat() if b.packed_at else None,
            "processing_logs": processing,
        }

    async def _get_or_404(self, sku_id: UUID) -> SKU:
        stmt = select(SKU).where(SKU.id == sku_id)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU {sku_id} not found")
        return sku

    async def _compute_pipeline_map(self) -> dict[str, int]:
        """Compute pipeline qty per expected SKU code from in-progress batches."""
        pipeline_statuses = (
            "created", "assigned", "in_progress", "submitted", "checked", "packing",
        )
        stmt = (
            select(Batch)
            .join(Lot, Batch.lot_id == Lot.id)
            .options(
                selectinload(Batch.lot),
                selectinload(Batch.processing_logs).selectinload(
                    BatchProcessing.value_addition
                ),
            )
            .where(Batch.status.in_(pipeline_statuses))
        )
        result = await self.db.execute(stmt)
        batches = result.scalars().unique().all()

        pipeline_map: dict[str, int] = {}
        for batch in batches:
            lot = batch.lot
            if not lot:
                continue
            product_type = lot.product_type or "FBL"
            design_no = batch.design_no or (
                lot.designs[0]["design_no"] if lot.designs else ""
            )
            size = batch.size or "Free"

            # VA suffix from received processing logs (same logic as pack_batch)
            va_codes = sorted([
                log.value_addition.short_code
                for log in (batch.processing_logs or [])
                if log.status == "received"
                and log.value_addition
                and log.value_addition.short_code
            ])
            va_suffix = "+" + "+".join(va_codes) if va_codes else ""

            # Colors from color_qc (post-QC) or color_breakdown (pre-QC)
            color_qty_map: dict[str, int] = {}
            if batch.color_qc:
                for color, qc in batch.color_qc.items():
                    color_qty_map[color] = qc.get("approved", 0)
            elif batch.color_breakdown:
                for color, qty in batch.color_breakdown.items():
                    color_qty_map[color] = qty
            else:
                continue

            for color, qty in color_qty_map.items():
                if qty <= 0:
                    continue
                expected_code = f"{product_type}-{design_no}-{color}-{size}{va_suffix}"
                pipeline_map[expected_code] = pipeline_map.get(expected_code, 0) + qty

        return pipeline_map

    def _to_response(self, s: SKU, inv: InventoryState | None = None, pipeline_qty: int = 0) -> dict:
        return {
            "id": str(s.id),
            "sku_code": s.sku_code,
            "product_type": s.product_type,
            "product_name": s.product_name,
            "color": s.color,
            "color_id": str(s.color_id) if s.color_id else None,
            "design_id": str(s.design_id) if s.design_id else None,
            "size": s.size,
            "description": s.description,
            "base_price": float(s.base_price) if s.base_price else 0,
            "hsn_code": s.hsn_code,
            "gst_percent": float(s.gst_percent) if s.gst_percent else None,
            "mrp": float(s.mrp) if s.mrp else None,
            "sale_rate": float(s.sale_rate) if s.sale_rate else None,
            "stitching_cost": float(s.stitching_cost) if s.stitching_cost else None,
            "other_cost": float(s.other_cost) if s.other_cost else None,
            "is_active": s.is_active,
            "stock": {
                "total_qty": inv.total_qty if inv else 0,
                "available_qty": inv.available_qty if inv else 0,
                "reserved_qty": inv.reserved_qty if inv else 0,
                "pipeline_qty": pipeline_qty,
            },
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
