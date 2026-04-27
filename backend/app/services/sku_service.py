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
from app.models.product_type import ProductType
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_processing import BatchProcessing
from app.models.lot import Lot
from app.models.inventory_state import InventoryState
from app.models.inventory_event import InventoryEvent
from app.models.supplier_invoice import SupplierInvoice
from app.models.purchase_item import PurchaseItem
from app.models.shipment_item import ShipmentItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.customer import Customer
from app.schemas.sku import SKUCreate, SKUUpdate, SKUResponse, PurchaseStockRequest, SKUOpeningStockRequest, SKUFilterParams
from app.schemas import PaginatedParams
from app.core.exceptions import AppException, DuplicateError, NotFoundError


# Canonical garment size ordering — small → large. Used for group row size
# chips and for ordering expanded SKU rows. Mirrors frontend SIZES constant.
SIZE_ORDER = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"]
_SIZE_RANK = {s: i for i, s in enumerate(SIZE_ORDER)}


def _size_rank(size: str | None) -> tuple[int, str]:
    """Sort key: known sizes by canonical order, unknown sizes after them alphabetically."""
    if size and size in _SIZE_RANK:
        return (_SIZE_RANK[size], "")
    return (len(SIZE_ORDER), size or "")


class SKUService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_skus(self, params: SKUFilterParams) -> dict:
        conditions = self._sku_filter_conditions(params)
        where_clause = conditions if conditions else []

        count_stmt = select(func.count()).select_from(SKU)
        if where_clause:
            count_stmt = count_stmt.where(*where_clause)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        sort_col = getattr(SKU, params.sort_by, SKU.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = select(SKU).order_by(order)
        if where_clause:
            stmt = stmt.where(*where_clause)
        if not no_limit:
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

    async def list_skus_grouped(self, params: SKUFilterParams) -> dict:
        """Paginate SKUs by design group — each page returns N design rows with
        nested SKUs. Group key = (product_type, SPLIT_PART(sku_code, '-', 2)).
        Preserves all filters from list_skus + stock_status. Sort: newest design first.
        """
        from sqlalchemy import or_, tuple_, desc
        from collections import defaultdict

        conditions = self._sku_filter_conditions(params)

        pt_col = SKU.product_type
        design_col = func.split_part(SKU.sku_code, "-", 2)

        # Count distinct design groups
        count_subq = (
            select(pt_col, design_col.label("design_no"))
            .where(*conditions)
            .group_by(pt_col, design_col)
            .subquery()
        )
        total = (await self.db.execute(select(func.count()).select_from(count_subq))).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        # Page of design groups, newest first
        group_stmt = (
            select(
                pt_col.label("product_type"),
                design_col.label("design_no"),
                func.max(SKU.created_at).label("latest_created"),
            )
            .where(*conditions)
            .group_by(pt_col, design_col)
            .order_by(desc(func.max(SKU.created_at)))
        )
        if not no_limit:
            group_stmt = group_stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        group_rows = (await self.db.execute(group_stmt)).all()

        if not group_rows:
            return {"data": [], "total": total, "page": params.page, "pages": pages}

        # Batch-fetch SKUs in those groups — same filters applied. DB can't sort
        # sizes logically (alphabetical would give 3XL,4XL,L,XL,XXL), so we sort
        # in Python using SIZE_ORDER below.
        group_keys = [(r.product_type, r.design_no) for r in group_rows]
        sku_stmt = (
            select(SKU)
            .where(*conditions, tuple_(pt_col, design_col).in_(group_keys))
            .order_by(SKU.color)
        )
        skus = (await self.db.execute(sku_stmt)).scalars().all()

        # Batch-fetch inventory states
        sku_ids = [s.id for s in skus]
        inv_map: dict = {}
        if sku_ids:
            inv_rows = (await self.db.execute(
                select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
            )).scalars().all()
            inv_map = {inv.sku_id: inv for inv in inv_rows}

        pipeline_map = await self._compute_pipeline_map()

        # Bucket SKUs by (product_type, design_no)
        by_key: dict[tuple[str, str], list] = defaultdict(list)
        for s in skus:
            parts = (s.sku_code or "").split("-", 2)
            d_no = parts[1] if len(parts) >= 2 else ""
            by_key[(s.product_type, d_no)].append(s)

        data = []
        for r in group_rows:
            grp_skus = by_key.get((r.product_type, r.design_no), [])
            # Sort by canonical size order (small → large), then color for stability
            grp_skus = sorted(grp_skus, key=lambda x: (_size_rank(x.size), x.color or ""))
            sku_responses = [
                self._to_response(s, inv_map.get(s.id), pipeline_map.get(s.sku_code, 0))
                for s in grp_skus
            ]
            colors = list(dict.fromkeys(s.color for s in grp_skus if s.color))
            # Unique sizes in canonical order (grp_skus is already sorted)
            sizes = list(dict.fromkeys(s.size for s in grp_skus if s.size))
            # Price column = selling price, not cost. Same fallback as order form (S110).
            def _sku_price(x):
                for p in (x.sale_rate, x.mrp, x.base_price):
                    if p and p > 0:
                        return float(p)
                return 0.0
            prices = [p for p in (_sku_price(s) for s in grp_skus) if p > 0]
            total_qty = sum(x["stock"]["total_qty"] for x in sku_responses)
            available_qty = sum(x["stock"]["available_qty"] for x in sku_responses)
            reserved_qty = sum(x["stock"]["reserved_qty"] for x in sku_responses)

            data.append({
                "design_key": f"{r.product_type}-{r.design_no}",
                "product_type": r.product_type,
                "design_no": r.design_no,
                "sku_count": len(grp_skus),
                "colors": colors,
                "sizes": sizes,
                "price_min": min(prices) if prices else 0,
                "price_max": max(prices) if prices else 0,
                "total_qty": total_qty,
                "available_qty": available_qty,
                "reserved_qty": reserved_qty,
                "skus": sku_responses,
            })

        return {"data": data, "total": total, "page": params.page, "pages": pages}

    async def compute_wac_map(self, sku_ids: list) -> dict:
        """Return {sku_id: wac_per_piece} for given SKUs. WAC = Σ(unit_cost × qty) / Σ(qty)
        across cost-bearing stock-in events (ready_stock_in, opening_stock, stock_in).

        Used for inventory valuation (FY closing, dashboard) — NOT pricing. Pricing uses
        sku.base_price (Last Cost). SKUs with no cost-bearing events return 0.0 — caller
        can fall back to base_price if needed.
        """
        if not sku_ids:
            return {}
        rows = (await self.db.execute(
            select(InventoryEvent.sku_id, InventoryEvent.quantity, InventoryEvent.metadata_)
            .where(
                InventoryEvent.sku_id.in_(sku_ids),
                InventoryEvent.event_type.in_(("ready_stock_in", "opening_stock", "stock_in")),
            )
        )).all()
        from collections import defaultdict
        acc = defaultdict(lambda: {"cost": 0.0, "qty": 0})
        for r in rows:
            meta = r.metadata_ or {}
            uc = meta.get("unit_cost") or meta.get("cost_per_piece")
            if uc is None or not r.quantity:
                continue
            acc[r.sku_id]["cost"] += float(uc) * r.quantity
            acc[r.sku_id]["qty"] += r.quantity
        return {sid: (a["cost"] / a["qty"]) for sid, a in acc.items() if a["qty"] > 0}

    async def get_sku_summary(self) -> dict:
        """Global SKU KPIs — scoped per company/FY via tenant middleware."""
        total_skus = await self.db.scalar(select(func.count(SKU.id))) or 0
        in_stock_skus = await self.db.scalar(
            select(func.count(func.distinct(InventoryState.sku_id)))
            .where(InventoryState.available_qty > 0)
        ) or 0
        total_pieces = await self.db.scalar(
            select(func.coalesce(func.sum(InventoryState.total_qty), 0))
        ) or 0
        auto_generated = await self.db.scalar(
            select(func.count(SKU.id)).where(SKU.sku_code.like("%+%"))
        ) or 0
        return {
            "total_skus": int(total_skus),
            "in_stock_skus": int(in_stock_skus),
            "total_pieces": int(total_pieces),
            "auto_generated": int(auto_generated),
        }

    def _sku_filter_conditions(self, params: SKUFilterParams) -> list:
        """Shared WHERE conditions for flat + grouped list. Uses subquery for
        stock_status so grouping SQL stays clean (no JOIN needed)."""
        from sqlalchemy import or_

        conditions = []
        if params.search:
            normalized = " ".join(params.search.strip().split()).replace(".", "%")
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
        if params.stock_status == "in_stock":
            conditions.append(
                SKU.id.in_(
                    select(InventoryState.sku_id).where(InventoryState.available_qty > 0)
                )
            )
        elif params.stock_status == "out_of_stock":
            conditions.append(
                SKU.id.not_in(
                    select(InventoryState.sku_id).where(InventoryState.available_qty > 0)
                )
            )
        return conditions

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

    async def get_open_demand(self, sku_id: UUID) -> dict:
        """Unfulfilled order items demanding this SKU (not cancelled)."""
        await self._get_or_404(sku_id)

        rows = (await self.db.execute(
            select(OrderItem, Order, Customer)
            .join(Order, Order.id == OrderItem.order_id)
            .outerjoin(Customer, Customer.id == Order.customer_id)
            .where(
                OrderItem.sku_id == sku_id,
                OrderItem.fulfilled_qty < OrderItem.quantity,
                Order.status != "cancelled",
            )
            .order_by(Order.order_date.desc(), Order.order_number)
        )).all()

        orders = []
        total_outstanding = 0
        for oi, o, c in rows:
            outstanding = (oi.quantity or 0) - (oi.fulfilled_qty or 0)
            total_outstanding += outstanding
            orders.append({
                "order_id": str(o.id),
                "order_number": o.order_number,
                "order_date": o.order_date.isoformat() if o.order_date else None,
                "customer_name": (c.name if c else None) or o.customer_name or "—",
                "status": o.status,
                "ordered_qty": oi.quantity,
                "fulfilled_qty": oi.fulfilled_qty,
                "short_qty": oi.short_qty,
                "outstanding_qty": outstanding,
                "unit_price": float(oi.unit_price) if oi.unit_price else 0,
            })

        return {
            "sku_id": str(sku_id),
            "total_orders": len(orders),
            "total_outstanding": total_outstanding,
            "orders": orders,
        }

    async def create_sku(self, req: SKUCreate) -> dict:
        # Auto-generate sku_code: ProductType-DesignNo-Color-Size
        sku_code = f"{req.product_type}-{req.product_name}-{req.color}-{req.size}"

        existing = await self.db.execute(
            select(SKU).where(SKU.sku_code == sku_code)
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"SKU code '{sku_code}' already exists")

        # HSN: explicit request value takes precedence, else inherit from ProductType
        hsn = req.hsn_code
        if not hsn:
            pt_result = await self.db.execute(
                select(ProductType).where(ProductType.code == req.product_type)
            )
            pt = pt_result.scalar_one_or_none()
            hsn = pt.hsn_code if pt else None

        sku = SKU(
            sku_code=sku_code,
            product_type=req.product_type,
            product_name=req.product_name,
            color=req.color,
            color_id=req.color_id,
            size=req.size,
            description=req.description,
            base_price=req.base_price,
            hsn_code=hsn,
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
        """Find existing SKU by code, or create new one with InventoryState.

        New SKUs inherit hsn_code from the matching ProductType (by code).
        Existing SKUs are NOT modified — preserves any explicit HSN already set.
        """
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

        # Lookup ProductType for HSN inheritance
        pt_stmt = select(ProductType).where(ProductType.code == product_type)
        pt_result = await self.db.execute(pt_stmt)
        pt = pt_result.scalar_one_or_none()

        sku = SKU(
            sku_code=sku_code,
            product_type=product_type,
            product_name=product_name,
            color=color,
            color_id=color_id,
            design_id=design_id,
            size=size,
            hsn_code=pt.hsn_code if pt else None,
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

        # Create SupplierInvoice. Totals (subtotal/tax/total) populated below
        # after line items are flushed.
        supplier_inv = SupplierInvoice(
            supplier_id=req.supplier_id,
            invoice_no=req.invoice_no,
            challan_no=req.challan_no,
            invoice_date=req.invoice_date,
            sr_no=req.sr_no,
            gst_percent=req.gst_percent,
            discount_amount=req.discount_amount,
            additional_amount=req.additional_amount,
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

            # Last Cost semantic (Option D): base_price = latest stock-in cost.
            # Pricing signal only — inventory valuation uses event WAC, not this.
            # Always overwrite so the 1696 S110-migrated SKUs (base_price=0) get updated too.
            sku.base_price = item.unit_price
            if item.hsn_code and not sku.hsn_code:
                sku.hsn_code = item.hsn_code
            # SKU.gst_percent inheritance (Phase 4.2 — S122-3 fix):
            #   - Per-line `item.gst_percent` wins if provided (forward-compat
            #     with Phase 4.1 multi-rate invoicing — see PurchaseItem model).
            #   - Otherwise fall back to header `req.gst_percent` so SKUs
            #     created via the purchase form inherit the SI's GST rate.
            #   - Only fires on first creation — never overwrites a manually
            #     edited rate (SKUsPage detail edit form).
            #   - Opening-stock SKUs stay NULL (correct — no purchase = no GST).
            #
            # Math is unaffected: Order.gst_percent / Invoice.gst_percent /
            # SupplierInvoice.gst_percent still drive all tax calculation.
            # SKU.gst_percent is a per-SKU reference / display value that can
            # later become a default-suggestion source for the order form.
            if sku.gst_percent is None:
                sku.gst_percent = (
                    item.gst_percent if item.gst_percent is not None else req.gst_percent
                )

            total_price = item.qty * item.unit_price
            pi = PurchaseItem(
                supplier_invoice_id=supplier_inv.id,
                sku_id=sku.id,
                quantity=item.qty,
                unit_price=item.unit_price,
                total_price=total_price,
                hsn_code=item.hsn_code,
                gst_percent=item.gst_percent,  # reserved — see PurchaseItem model + Phase 4.1
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

        # Compute + store totals on the SupplierInvoice. Math mirrors sales-side
        # Invoice (S117): taxable = subtotal - discount + additional → +GST → total.
        subtotal = sum((it["total_price"] for it in created_items), Decimal("0"))
        gst_pct = req.gst_percent or Decimal("0")
        disc = req.discount_amount or Decimal("0")
        addl = req.additional_amount or Decimal("0")
        taxable = subtotal - disc + addl
        gst_amt = (taxable * gst_pct / Decimal("100")).quantize(Decimal("0.01"))
        total = taxable + gst_amt

        supplier_inv.subtotal = subtotal
        supplier_inv.tax_amount = gst_amt
        supplier_inv.total_amount = total
        await self.db.flush()

        if total > 0:
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
            "discount_amount": float(disc),
            "additional_amount": float(addl),
            "tax_amount": float(gst_amt),
            "total_amount": float(total),
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

            # Last Cost semantic (Option D): overwrite base_price with latest stock-in cost.
            # sale_rate + mrp stay first-writer-wins — those are user-set selling prices, not cost signals.
            if item.unit_cost is not None:
                sku.base_price = item.unit_cost
            if sku.sale_rate is None and item.sale_rate is not None:
                sku.sale_rate = item.sale_rate
            if sku.mrp is None and item.mrp is not None:
                sku.mrp = item.mrp

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
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        stmt = (
            base
            .options(
                selectinload(SupplierInvoice.supplier),
                selectinload(SupplierInvoice.purchase_items).selectinload(PurchaseItem.sku),
            )
            .order_by(SupplierInvoice.received_at.desc())
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
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
        line_subtotal = Decimal("0")
        for pi in (inv.purchase_items or []):
            line_subtotal += pi.total_price or 0
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

        # Prefer stored totals (S118+); fall back to line-aggregate for legacy SIs.
        stored_subtotal = float(inv.subtotal) if inv.subtotal else 0.0
        stored_total = float(inv.total_amount) if inv.total_amount else 0.0
        subtotal_val = stored_subtotal if stored_subtotal > 0 else float(line_subtotal)
        if stored_total > 0:
            total_val = stored_total
            tax_val = float(inv.tax_amount) if inv.tax_amount else 0.0
        else:
            gst_pct = float(inv.gst_percent or 0)
            tax_val = round(subtotal_val * gst_pct / 100, 2)
            total_val = round(subtotal_val + tax_val, 2)

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
            "subtotal": subtotal_val,
            "discount_amount": float(inv.discount_amount) if inv.discount_amount else 0.0,
            "additional_amount": float(inv.additional_amount) if inv.additional_amount else 0.0,
            "tax_amount": tax_val,
            "total_amount": total_val,
        }

    async def stock_check(self, sku_ids: list, order_id=None) -> dict:
        """Bulk stock check — returns {sku_id: available_qty} map.
        If order_id provided, adds back that order's active reservations
        (reserved stock belongs to the order requesting the check)."""
        if not sku_ids:
            return {}
        result = await self.db.execute(
            select(InventoryState.sku_id, InventoryState.available_qty, InventoryState.total_qty)
            .where(InventoryState.sku_id.in_(sku_ids))
        )
        stock_map = {row.sku_id: {"available": row.available_qty, "total": row.total_qty} for row in result.all()}

        # Add back this order's own reservations (they're "available" for this order)
        order_reserved = {}
        if order_id:
            from app.models.reservation import Reservation
            res_result = await self.db.execute(
                select(Reservation.sku_id, func.sum(Reservation.quantity).label("qty"))
                .where(Reservation.order_id == order_id, Reservation.status == "active")
                .group_by(Reservation.sku_id)
            )
            order_reserved = {row.sku_id: row.qty for row in res_result.all()}

        output = {}
        for sku_id, info in stock_map.items():
            effective = info["available"] + order_reserved.get(sku_id, 0)
            # Cap at total_qty — can't ship more than physically exists
            output[str(sku_id)] = min(effective, info["total"])

        return output

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
