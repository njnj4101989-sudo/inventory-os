"""Payment Receipt service — Tally-style bill-wise receipt voucher.

Single point of truth for recording customer / supplier / va_party payments
with multi-bill allocation, partial payment, and on-account residue.

Polymorphic since S125: bills are referenced by (`bill_type`, `bill_id`) and
the four supported types are:
    invoice          (party_type='customer')   — sales receipt
    supplier_invoice (party_type='supplier')   — supplier payout
    job_challan      (party_type='va_party')   — roll-VA payout
    batch_challan    (party_type='va_party')   — garment-VA payout

Math invariants enforced atomically inside record():
    SUM(allocations.amount_applied) <= amount - tds_amount + tcs_amount
    on_account_amount = amount - tds_amount + tcs_amount - SUM(allocations)
    bill.amount_paid is bumped per-allocation; status flips
    issued/partially_paid/paid (invoice) — challans/SI keep status, just bump.

Each allocation generates one LedgerEntry with reference_type='payment_allocation'.
On-account residue (if any) generates one extra LedgerEntry with
reference_type='payment_receipt'. TDS/TCS entries are posted by LedgerService
the same way S119 did them.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.code_generator import next_receipt_number
from app.core.exceptions import NotFoundError, ValidationError
from app.models.batch_challan import BatchChallan
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.job_challan import JobChallan
from app.models.ledger_entry import LedgerEntry
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_receipt import PaymentReceipt
from app.models.supplier import Supplier
from app.models.supplier_invoice import SupplierInvoice
from app.models.va_party import VAParty
from app.schemas.payment_receipt import (
    OnAccountBalance,
    OpenBillBrief,
    PaymentReceiptCreate,
    PaymentReceiptFilterParams,
)


_PARTY_MODELS = {
    "customer": Customer,
    "supplier": Supplier,
    "va_party": VAParty,
}

# Which bill types are valid for which party type. The receipt service
# rejects mismatches (e.g. a 'customer' receipt allocating to a 'job_challan').
_PARTY_BILL_MAP: dict[str, set[str]] = {
    "customer": {"invoice"},
    "supplier": {"supplier_invoice"},
    "va_party": {"job_challan", "batch_challan"},
}

# Bill model + human label resolution. Each entry is (model, code_attr,
# date_attr, allocatable_status_set or None for "any not cancelled").
_BILL_MODELS: dict[str, dict] = {
    "invoice": {
        "model": Invoice,
        "code_attr": "invoice_number",
        "date_attr": "issued_at",
        "allocatable_status": {"issued", "partially_paid"},
    },
    "supplier_invoice": {
        "model": SupplierInvoice,
        "code_attr": "invoice_no",
        "date_attr": "invoice_date",
        "allocatable_status": None,  # SI has no payment-state column
    },
    "job_challan": {
        "model": JobChallan,
        "code_attr": "challan_no",
        "date_attr": "sent_date",
        # Only pay for work that's actually been done. Open VA work is paid
        # later as it gets received.
        "allocatable_status": {"received", "partially_received"},
    },
    "batch_challan": {
        "model": BatchChallan,
        "code_attr": "challan_no",
        "date_attr": "sent_date",
        "allocatable_status": {"received", "partially_received"},
    },
}


def _bill_meta(bill_type: str) -> dict:
    meta = _BILL_MODELS.get(bill_type)
    if not meta:
        raise ValidationError(f"Unsupported bill_type: {bill_type}")
    return meta


class PaymentReceiptService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Record (the only mutating entry point) ───────────────────────────────

    async def record(
        self,
        data: PaymentReceiptCreate,
        fy_id: UUID,
        created_by: UUID | None = None,
    ) -> dict:
        """Atomic: create receipt + allocations + ledger entries + bill updates."""
        # 1. Resolve party
        party_model = _PARTY_MODELS.get(data.party_type)
        if not party_model:
            raise ValidationError(f"Unsupported party_type: {data.party_type}")
        party = (
            await self.db.execute(select(party_model).where(party_model.id == data.party_id))
        ).scalar_one_or_none()
        if not party:
            raise NotFoundError(f"{data.party_type.replace('_', ' ').title()} not found")

        # 2. Compute TDS/TCS — gross math, mirrors LedgerService.record_payment
        amount = Decimal(str(data.amount))
        tds_amount = Decimal("0")
        tcs_amount = Decimal("0")

        if data.tds_applicable and data.tds_rate:
            tds_amount = (amount * Decimal(str(data.tds_rate)) / Decimal("100")).quantize(Decimal("0.01"))
        if data.tcs_applicable and data.tcs_rate:
            tcs_amount = (amount * Decimal(str(data.tcs_rate)) / Decimal("100")).quantize(Decimal("0.01"))

        # Allocatable cash = gross - TDS + TCS
        allocatable = (amount - tds_amount + tcs_amount).quantize(Decimal("0.01"))

        # 3. Validate allocations
        allocations_input = data.allocations or []
        sum_allocated = sum(
            (Decimal(str(a.amount_applied)) for a in allocations_input),
            start=Decimal("0"),
        )
        if sum_allocated > allocatable:
            raise ValidationError(
                f"Allocations (₹{sum_allocated:,.2f}) exceed allocatable "
                f"amount (₹{allocatable:,.2f} = receipt − TDS + TCS)"
            )

        # All allocation rows must be of bill types the party type supports.
        valid_for_party = _PARTY_BILL_MAP.get(data.party_type, set())
        for a in allocations_input:
            if a.bill_type not in valid_for_party:
                raise ValidationError(
                    f"bill_type '{a.bill_type}' is not allowed for party_type "
                    f"'{data.party_type}' — expected one of: {sorted(valid_for_party)}"
                )

        # 4. Lock + load all referenced bills, grouped by type
        bills_by_ref: dict[tuple[str, UUID], object] = {}
        for bill_type in {a.bill_type for a in allocations_input}:
            ids = [a.bill_id for a in allocations_input if a.bill_type == bill_type]
            if not ids:
                continue
            meta = _bill_meta(bill_type)
            stmt = (
                select(meta["model"])
                .where(meta["model"].id.in_(ids))
                .with_for_update()
            )
            for row in (await self.db.execute(stmt)).scalars().all():
                bills_by_ref[(bill_type, row.id)] = row

        # 5. Validate each allocation against its bill
        for a in allocations_input:
            bill = bills_by_ref.get((a.bill_type, a.bill_id))
            if bill is None:
                raise NotFoundError(
                    f"{a.bill_type.replace('_', ' ').title()} {a.bill_id} not found"
                )
            self._assert_bill_belongs_to_party(bill, a.bill_type, data.party_type, data.party_id)

            meta = _bill_meta(a.bill_type)
            allowed = meta["allocatable_status"]
            if allowed is not None:
                status = getattr(bill, "status", None)
                if status not in allowed:
                    code = getattr(bill, meta["code_attr"], None) or "(no code)"
                    raise ValidationError(
                        f"{a.bill_type.replace('_', ' ').title()} {code} is in '{status}' "
                        f"status — cannot accept payment"
                    )

            outstanding = (
                Decimal(str(getattr(bill, "total_amount", 0) or 0))
                - Decimal(str(getattr(bill, "amount_paid", 0) or 0))
            ).quantize(Decimal("0.01"))
            if Decimal(str(a.amount_applied)) > outstanding + Decimal("0.01"):
                code = getattr(bill, meta["code_attr"], None) or "(no code)"
                raise ValidationError(
                    f"Allocation ₹{a.amount_applied:,.2f} exceeds outstanding "
                    f"₹{outstanding:,.2f} on {code}"
                )

        # 6. Create the receipt (header)
        on_account_amount = (allocatable - sum_allocated).quantize(Decimal("0.01"))
        receipt_no = await next_receipt_number(self.db, fy_id)

        receipt = PaymentReceipt(
            receipt_no=receipt_no,
            party_type=data.party_type,
            party_id=data.party_id,
            payment_date=data.payment_date,
            payment_mode=data.payment_mode,
            reference_no=data.reference_no,
            amount=amount,
            tds_applicable=data.tds_applicable,
            tds_rate=data.tds_rate,
            tds_section=data.tds_section,
            tds_amount=tds_amount,
            tcs_applicable=data.tcs_applicable,
            tcs_rate=data.tcs_rate,
            tcs_section=data.tcs_section,
            tcs_amount=tcs_amount,
            on_account_amount=on_account_amount,
            notes=data.notes,
            fy_id=fy_id,
            created_by=created_by,
        )
        self.db.add(receipt)
        await self.db.flush()  # populate receipt.id

        # 7. Per-allocation: create row + ledger entry + bump bill
        mode_str = f" ({data.payment_mode.upper()})" if data.payment_mode else ""
        ref_str = f" Ref: {data.reference_no}" if data.reference_no else ""

        is_customer = data.party_type == "customer"
        for a in allocations_input:
            bill = bills_by_ref[(a.bill_type, a.bill_id)]
            applied = Decimal(str(a.amount_applied)).quantize(Decimal("0.01"))
            meta = _bill_meta(a.bill_type)
            bill_code = getattr(bill, meta["code_attr"], None) or str(bill.id)

            alloc = PaymentAllocation(
                payment_receipt_id=receipt.id,
                bill_type=a.bill_type,
                bill_id=bill.id,
                amount_applied=applied,
            )
            self.db.add(alloc)
            await self.db.flush()  # populate alloc.id for ledger reference

            # Bump bill.amount_paid + (invoice only) flip status
            new_paid = (
                Decimal(str(getattr(bill, "amount_paid", 0) or 0)) + applied
            ).quantize(Decimal("0.01"))
            bill.amount_paid = new_paid

            if a.bill_type == "invoice":
                outstanding_after = Decimal(str(bill.total_amount or 0)) - new_paid
                if outstanding_after <= Decimal("0.005"):
                    bill.status = "paid"
                    bill.paid_at = datetime.now(timezone.utc)
                else:
                    bill.status = "partially_paid"

            # Ledger row for this allocation — debit/credit by party convention
            debit = Decimal("0") if is_customer else applied
            credit = applied if is_customer else Decimal("0")
            description = (
                f"Payment {('received' if is_customer else 'made')}{mode_str}{ref_str} "
                f"→ {bill_code}"
            )
            self.db.add(
                LedgerEntry(
                    entry_date=data.payment_date,
                    party_type=data.party_type,
                    party_id=data.party_id,
                    entry_type="payment",
                    reference_type="payment_allocation",
                    reference_id=alloc.id,
                    debit=debit,
                    credit=credit,
                    net_amount=applied,
                    description=description,
                    created_by=created_by,
                    fy_id=fy_id,
                    notes=data.notes,
                )
            )

        # 8. On-account residue → one extra ledger entry against the receipt
        if on_account_amount > Decimal("0"):
            debit = Decimal("0") if is_customer else on_account_amount
            credit = on_account_amount if is_customer else Decimal("0")
            description = (
                f"Payment {('received' if is_customer else 'made')}{mode_str}{ref_str} "
                f"→ On-account ({receipt_no})"
            )
            self.db.add(
                LedgerEntry(
                    entry_date=data.payment_date,
                    party_type=data.party_type,
                    party_id=data.party_id,
                    entry_type="payment",
                    reference_type="payment_receipt",
                    reference_id=receipt.id,
                    debit=debit,
                    credit=credit,
                    net_amount=on_account_amount,
                    description=description,
                    created_by=created_by,
                    fy_id=fy_id,
                    notes=data.notes,
                )
            )

        # 9. TDS / TCS lines (separate ledger rows, party-side)
        if tds_amount > 0:
            self.db.add(
                LedgerEntry(
                    entry_date=data.payment_date,
                    party_type=data.party_type,
                    party_id=data.party_id,
                    entry_type="tds",
                    reference_type="payment_receipt",
                    reference_id=receipt.id,
                    debit=tds_amount if not is_customer else Decimal("0"),
                    credit=Decimal("0") if not is_customer else tds_amount,
                    tds_amount=tds_amount,
                    tds_section=data.tds_section,
                    description=f"TDS @{data.tds_rate}% u/s {data.tds_section or '—'} ({receipt_no})",
                    created_by=created_by,
                    fy_id=fy_id,
                )
            )
        if tcs_amount > 0:
            self.db.add(
                LedgerEntry(
                    entry_date=data.payment_date,
                    party_type=data.party_type,
                    party_id=data.party_id,
                    entry_type="tcs",
                    reference_type="payment_receipt",
                    reference_id=receipt.id,
                    debit=Decimal("0"),
                    credit=tcs_amount,
                    tcs_amount=tcs_amount,
                    description=f"TCS @{data.tcs_rate}% u/s {data.tcs_section or '—'} ({receipt_no})",
                    created_by=created_by,
                    fy_id=fy_id,
                )
            )

        await self.db.flush()

        # 10. SSE emit (best-effort)
        try:
            from app.core.event_bus import event_bus
            await event_bus.emit("payment_received", {
                "receipt_no": receipt_no,
                "party_type": data.party_type,
                "party_name": getattr(party, "name", None),
                "amount": float(amount),
                "allocation_count": len(allocations_input),
                "on_account": float(on_account_amount),
            })
        except Exception:
            pass

        return await self.get_receipt(receipt.id)

    @staticmethod
    def _assert_bill_belongs_to_party(
        bill: object, bill_type: str, party_type: str, party_id: UUID
    ) -> None:
        """Defends against cross-party allocation attempts."""
        if bill_type == "invoice":
            if getattr(bill, "customer_id", None) != party_id:
                raise ValidationError("Invoice does not belong to this customer")
        elif bill_type == "supplier_invoice":
            if getattr(bill, "supplier_id", None) != party_id:
                raise ValidationError("Supplier invoice does not belong to this supplier")
        elif bill_type in ("job_challan", "batch_challan"):
            if getattr(bill, "va_party_id", None) != party_id:
                raise ValidationError("Challan does not belong to this VA party")

    # ── List ─────────────────────────────────────────────────────────────────

    async def list_receipts(self, params: PaymentReceiptFilterParams, fy_id: UUID) -> dict:
        filters = [PaymentReceipt.fy_id == fy_id]
        if params.party_type:
            filters.append(PaymentReceipt.party_type == params.party_type)
        if params.party_id:
            filters.append(PaymentReceipt.party_id == params.party_id)
        if params.payment_mode:
            filters.append(PaymentReceipt.payment_mode == params.payment_mode)
        if params.date_from:
            filters.append(PaymentReceipt.payment_date >= params.date_from)
        if params.date_to:
            filters.append(PaymentReceipt.payment_date <= params.date_to)
        if params.search:
            q = f"%{params.search}%"
            filters.append(
                or_(PaymentReceipt.receipt_no.ilike(q), PaymentReceipt.reference_no.ilike(q))
            )

        count_stmt = select(func.count()).select_from(PaymentReceipt)
        for f in filters:
            count_stmt = count_stmt.where(f)
        total = (await self.db.execute(count_stmt)).scalar() or 0

        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        stmt = (
            select(PaymentReceipt)
            .options(selectinload(PaymentReceipt.allocations))
            .order_by(PaymentReceipt.payment_date.desc(), PaymentReceipt.created_at.desc())
        )
        for f in filters:
            stmt = stmt.where(f)
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)

        rows = (await self.db.execute(stmt)).scalars().unique().all()

        receipts = list(rows)
        parties_index = await self._resolve_party_briefs(receipts)
        bill_index = await self._resolve_allocation_bill_codes(receipts)

        return {
            "data": [self._to_response(r, parties_index, bill_index) for r in receipts],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    # ── Detail ───────────────────────────────────────────────────────────────

    async def get_receipt(self, receipt_id: UUID) -> dict:
        stmt = (
            select(PaymentReceipt)
            .where(PaymentReceipt.id == receipt_id)
            .options(selectinload(PaymentReceipt.allocations))
        )
        receipt = (await self.db.execute(stmt)).scalar_one_or_none()
        if not receipt:
            raise NotFoundError("Payment receipt not found")
        parties_index = await self._resolve_party_briefs([receipt])
        bill_index = await self._resolve_allocation_bill_codes([receipt])
        return self._to_response(receipt, parties_index, bill_index)

    # ── Open bills for a party (for the allocation table on the form) ───────

    async def get_open_bills_for_party(
        self, party_type: str, party_id: UUID, fy_id: UUID
    ) -> list[dict]:
        """Returns FIFO-ordered open bills for the party (across applicable types).

        - customer  → invoices (issued / partially_paid)
        - supplier  → supplier_invoices with outstanding > 0
        - va_party  → job_challans + batch_challans (received / partially_received)
                       with outstanding > 0
        """
        out: list[dict] = []

        if party_type == "customer":
            stmt = (
                select(Invoice)
                .where(
                    Invoice.customer_id == party_id,
                    Invoice.status.in_(("issued", "partially_paid")),
                    or_(Invoice.fy_id == fy_id, Invoice.status == "issued"),
                )
                .order_by(Invoice.issued_at.asc().nulls_last(), Invoice.created_at.asc())
            )
            for inv in (await self.db.execute(stmt)).scalars().all():
                total = Decimal(str(inv.total_amount or 0))
                paid = Decimal(str(inv.amount_paid or 0))
                outstanding = (total - paid).quantize(Decimal("0.01"))
                if outstanding <= Decimal("0.005"):
                    continue
                out.append(
                    OpenBillBrief(
                        bill_type="invoice",
                        bill_id=inv.id,
                        bill_no=inv.invoice_number,
                        bill_date=inv.issued_at.date() if inv.issued_at else None,
                        due_date=inv.due_date,
                        total_amount=total,
                        amount_paid=paid,
                        outstanding_amount=outstanding,
                        status=inv.status,
                    ).model_dump()
                )

        elif party_type == "supplier":
            stmt = (
                select(SupplierInvoice)
                .where(
                    SupplierInvoice.supplier_id == party_id,
                    or_(SupplierInvoice.fy_id == fy_id, SupplierInvoice.fy_id.is_(None)),
                )
                .order_by(
                    SupplierInvoice.invoice_date.asc().nulls_last(),
                    SupplierInvoice.received_at.asc(),
                )
            )
            for si in (await self.db.execute(stmt)).scalars().all():
                total = Decimal(str(si.total_amount or 0))
                paid = Decimal(str(si.amount_paid or 0))
                outstanding = (total - paid).quantize(Decimal("0.01"))
                if outstanding <= Decimal("0.005"):
                    continue
                code = si.invoice_no or si.challan_no or f"SI-{str(si.id)[:8]}"
                out.append(
                    OpenBillBrief(
                        bill_type="supplier_invoice",
                        bill_id=si.id,
                        bill_no=code,
                        bill_date=si.invoice_date,
                        due_date=None,
                        total_amount=total,
                        amount_paid=paid,
                        outstanding_amount=outstanding,
                        status="open",
                    ).model_dump()
                )

        elif party_type == "va_party":
            jc_stmt = (
                select(JobChallan)
                .where(
                    JobChallan.va_party_id == party_id,
                    JobChallan.status.in_(("received", "partially_received")),
                    or_(JobChallan.fy_id == fy_id, JobChallan.fy_id.is_(None)),
                )
                .order_by(JobChallan.sent_date.asc(), JobChallan.created_at.asc())
            )
            for jc in (await self.db.execute(jc_stmt)).scalars().all():
                total = Decimal(str(jc.total_amount or 0))
                paid = Decimal(str(jc.amount_paid or 0))
                outstanding = (total - paid).quantize(Decimal("0.01"))
                if outstanding <= Decimal("0.005"):
                    continue
                out.append(
                    OpenBillBrief(
                        bill_type="job_challan",
                        bill_id=jc.id,
                        bill_no=jc.challan_no,
                        bill_date=jc.sent_date,
                        due_date=None,
                        total_amount=total,
                        amount_paid=paid,
                        outstanding_amount=outstanding,
                        status=jc.status,
                    ).model_dump()
                )

            bc_stmt = (
                select(BatchChallan)
                .where(
                    BatchChallan.va_party_id == party_id,
                    BatchChallan.status.in_(("received", "partially_received")),
                    or_(BatchChallan.fy_id == fy_id, BatchChallan.fy_id.is_(None)),
                )
                .order_by(BatchChallan.sent_date.asc(), BatchChallan.created_at.asc())
            )
            for bc in (await self.db.execute(bc_stmt)).scalars().all():
                total = Decimal(str(bc.total_amount or 0))
                paid = Decimal(str(bc.amount_paid or 0))
                outstanding = (total - paid).quantize(Decimal("0.01"))
                if outstanding <= Decimal("0.005"):
                    continue
                out.append(
                    OpenBillBrief(
                        bill_type="batch_challan",
                        bill_id=bc.id,
                        bill_no=bc.challan_no,
                        bill_date=bc.sent_date,
                        due_date=None,
                        total_amount=total,
                        amount_paid=paid,
                        outstanding_amount=outstanding,
                        status=bc.status,
                    ).model_dump()
                )

            # Combined FIFO sort across both challan types
            out.sort(key=lambda b: (b["bill_date"] or date_min(), b["bill_no"]))

        return out

    # ── On-account credit balance for a party ────────────────────────────────

    async def get_on_account_balance(
        self, party_type: str, party_id: UUID, fy_id: UUID
    ) -> dict:
        """Sum of on_account_amount across all receipts for this party + FY."""
        stmt = select(func.coalesce(func.sum(PaymentReceipt.on_account_amount), 0)).where(
            PaymentReceipt.party_type == party_type,
            PaymentReceipt.party_id == party_id,
            PaymentReceipt.fy_id == fy_id,
        )
        balance = Decimal(str((await self.db.execute(stmt)).scalar() or 0))
        return OnAccountBalance(
            party_type=party_type, party_id=party_id, balance=balance
        ).model_dump()

    # ── Helpers ──────────────────────────────────────────────────────────────

    async def _resolve_party_briefs(
        self, receipts: list[PaymentReceipt]
    ) -> dict[tuple[str, UUID], dict]:
        """Batch-load party briefs grouped by type."""
        index: dict[tuple[str, UUID], dict] = {}
        if not receipts:
            return index
        by_type: dict[str, set[UUID]] = {}
        for r in receipts:
            by_type.setdefault(r.party_type, set()).add(r.party_id)
        for ptype, ids in by_type.items():
            model = _PARTY_MODELS.get(ptype)
            if not model:
                continue
            rows = (
                await self.db.execute(select(model).where(model.id.in_(ids)))
            ).scalars().all()
            for row in rows:
                index[(ptype, row.id)] = {
                    "id": str(row.id),
                    "name": row.name,
                    "phone": getattr(row, "phone", None),
                    "city": getattr(row, "city", None),
                    "gst_no": getattr(row, "gst_no", None),
                }
        return index

    async def _resolve_allocation_bill_codes(
        self, receipts: list[PaymentReceipt]
    ) -> dict[tuple[str, UUID], str]:
        """Batch-load human-readable bill code (one query per bill type)."""
        if not receipts:
            return {}
        ids_by_type: dict[str, set[UUID]] = {}
        for r in receipts:
            for a in (r.allocations or []):
                ids_by_type.setdefault(a.bill_type, set()).add(a.bill_id)
        index: dict[tuple[str, UUID], str] = {}
        for bill_type, ids in ids_by_type.items():
            meta = _BILL_MODELS.get(bill_type)
            if not meta:
                continue
            model = meta["model"]
            code_col = getattr(model, meta["code_attr"])
            rows = (
                await self.db.execute(select(model.id, code_col).where(model.id.in_(ids)))
            ).all()
            for row in rows:
                index[(bill_type, row[0])] = row[1]
        return index

    def _to_response(
        self,
        r: PaymentReceipt,
        parties_index: dict[tuple[str, UUID], dict],
        bill_index: dict[tuple[str, UUID], str],
    ) -> dict:
        amount = Decimal(str(r.amount or 0))
        tds = Decimal(str(r.tds_amount or 0))
        tcs = Decimal(str(r.tcs_amount or 0))
        net = (amount - tds + tcs).quantize(Decimal("0.01"))
        allocated = sum(
            (Decimal(str(a.amount_applied)) for a in (r.allocations or [])),
            start=Decimal("0"),
        )
        return {
            "id": str(r.id),
            "receipt_no": r.receipt_no,
            "party_type": r.party_type,
            "party_id": str(r.party_id),
            "party": parties_index.get((r.party_type, r.party_id)),
            "payment_date": r.payment_date.isoformat() if r.payment_date else None,
            "payment_mode": r.payment_mode,
            "reference_no": r.reference_no,
            "amount": float(amount),
            "tds_applicable": bool(r.tds_applicable),
            "tds_rate": float(r.tds_rate) if r.tds_rate is not None else None,
            "tds_section": r.tds_section,
            "tds_amount": float(tds),
            "tcs_applicable": bool(r.tcs_applicable),
            "tcs_rate": float(r.tcs_rate) if r.tcs_rate is not None else None,
            "tcs_section": r.tcs_section,
            "tcs_amount": float(tcs),
            "allocated_amount": float(allocated),
            "on_account_amount": float(r.on_account_amount or 0),
            "net_amount": float(net),
            "allocations": [
                {
                    "id": str(a.id),
                    "bill_type": a.bill_type,
                    "bill_id": str(a.bill_id),
                    "bill_no": bill_index.get((a.bill_type, a.bill_id)),
                    "amount_applied": float(a.amount_applied),
                }
                for a in (r.allocations or [])
            ],
            "notes": r.notes,
            "fy_id": str(r.fy_id) if r.fy_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }


def date_min():
    """Sentinel for sorting bills with no bill_date (very rare)."""
    from datetime import date as _date
    return _date(1970, 1, 1)
