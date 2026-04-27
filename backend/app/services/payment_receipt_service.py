"""Payment Receipt service — Tally-style bill-wise receipt voucher.

Single point of truth for recording customer (and later supplier/VA) payments
with multi-invoice allocation, partial payment, and on-account residue.

Math invariants enforced atomically inside record():
    SUM(allocations.amount_applied) <= amount - tds_amount + tcs_amount
    on_account_amount = amount - tds_amount + tcs_amount - SUM(allocations)
    invoice.amount_paid is bumped per-allocation; status flips
    issued/partially_paid/paid based on outstanding.

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
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.ledger_entry import LedgerEntry
from app.models.payment_allocation import PaymentAllocation
from app.models.payment_receipt import PaymentReceipt
from app.models.supplier import Supplier
from app.models.va_party import VAParty
from app.schemas.ledger import LedgerEntryCreate
from app.schemas.payment_receipt import (
    OnAccountBalance,
    OpenInvoiceBrief,
    PaymentReceiptCreate,
    PaymentReceiptFilterParams,
)


_PARTY_MODELS = {
    "customer": Customer,
    "supplier": Supplier,
    "va_party": VAParty,
}


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
        """Atomic: create receipt + allocations + ledger entries + invoice updates.

        Customer-side semantics (the only `party_type` wired in v1):
            - Each allocation is a Cr to customer linked to that invoice
              (clears the corresponding portion of the AR debit).
            - On-account residue is a separate Cr with
              reference_type='payment_receipt'.
            - TDS/TCS are split off from the allocated amount via
              `LedgerService.record_payment` semantics — handled inline here
              so the bill-wise reference_id stays accurate.
        """
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
        # (TDS reduces the actual cash you receive; TCS adds to it)
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

        # 4. Lock + load all referenced invoices in one shot
        invoice_ids = [a.invoice_id for a in allocations_input]
        invoices_by_id: dict[UUID, Invoice] = {}
        if invoice_ids:
            stmt = (
                select(Invoice)
                .where(Invoice.id.in_(invoice_ids))
                .with_for_update()
            )
            for inv in (await self.db.execute(stmt)).scalars().all():
                invoices_by_id[inv.id] = inv

        for a in allocations_input:
            inv = invoices_by_id.get(a.invoice_id)
            if inv is None:
                raise NotFoundError(f"Invoice {a.invoice_id} not found")
            if data.party_type == "customer":
                if inv.customer_id != data.party_id:
                    raise ValidationError(
                        f"Invoice {inv.invoice_number} does not belong to this customer"
                    )
                if inv.status not in ("issued", "partially_paid"):
                    raise ValidationError(
                        f"Invoice {inv.invoice_number} is in '{inv.status}' status — cannot accept payment"
                    )
                outstanding = (
                    Decimal(str(inv.total_amount or 0)) - Decimal(str(inv.amount_paid or 0))
                ).quantize(Decimal("0.01"))
                if Decimal(str(a.amount_applied)) > outstanding:
                    raise ValidationError(
                        f"Allocation ₹{a.amount_applied:,.2f} exceeds outstanding "
                        f"₹{outstanding:,.2f} on {inv.invoice_number}"
                    )

        # 5. Create the receipt (header)
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

        # 6. Per-allocation: create row + ledger entry + bump invoice
        mode_str = f" ({data.payment_mode.upper()})" if data.payment_mode else ""
        ref_str = f" Ref: {data.reference_no}" if data.reference_no else ""

        is_customer = data.party_type == "customer"
        for a in allocations_input:
            inv = invoices_by_id[a.invoice_id]
            applied = Decimal(str(a.amount_applied)).quantize(Decimal("0.01"))

            alloc = PaymentAllocation(
                payment_receipt_id=receipt.id,
                invoice_id=inv.id,
                amount_applied=applied,
            )
            self.db.add(alloc)
            await self.db.flush()  # populate alloc.id for ledger reference

            # Bump invoice.amount_paid + flip status
            new_paid = (Decimal(str(inv.amount_paid or 0)) + applied).quantize(Decimal("0.01"))
            inv.amount_paid = new_paid
            outstanding_after = Decimal(str(inv.total_amount or 0)) - new_paid
            if outstanding_after <= Decimal("0.005"):
                inv.status = "paid"
                inv.paid_at = datetime.now(timezone.utc)
            else:
                inv.status = "partially_paid"

            # Ledger row for this allocation — debit/credit by party convention
            debit = Decimal("0") if is_customer else applied
            credit = applied if is_customer else Decimal("0")
            description = (
                f"Payment {('received' if is_customer else 'made')}{mode_str}{ref_str} "
                f"→ {inv.invoice_number}"
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

        # 7. On-account residue → one extra ledger entry against the receipt
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

        # 8. TDS / TCS lines (separate ledger rows, party-side)
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

        # 9. SSE emit (best-effort, non-blocking-on-failure)
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

        # Resolve party briefs in batch (per type) + allocation invoice_numbers
        receipts = list(rows)
        parties_index = await self._resolve_party_briefs(receipts)
        invoice_index = await self._resolve_allocation_invoices(receipts)

        return {
            "data": [self._to_response(r, parties_index, invoice_index) for r in receipts],
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
        invoice_index = await self._resolve_allocation_invoices([receipt])
        return self._to_response(receipt, parties_index, invoice_index)

    # ── Open invoices for a party (for the allocation table on the form) ────

    async def get_open_invoices_for_party(
        self, party_type: str, party_id: UUID, fy_id: UUID
    ) -> list[dict]:
        """Returns issued / partially_paid invoices ordered FIFO by invoice_date."""
        if party_type != "customer":
            # Supplier / VA-party flow lands later. Return empty for now.
            return []

        # FY scope: current FY rows + cross-FY active rows (mirrors invoice list)
        stmt = (
            select(Invoice)
            .where(
                Invoice.customer_id == party_id,
                Invoice.status.in_(("issued", "partially_paid")),
                or_(Invoice.fy_id == fy_id, Invoice.status == "issued"),
            )
            .order_by(Invoice.issued_at.asc().nulls_last(), Invoice.created_at.asc())
        )
        invoices = (await self.db.execute(stmt)).scalars().all()
        out: list[dict] = []
        for inv in invoices:
            total = Decimal(str(inv.total_amount or 0))
            paid = Decimal(str(inv.amount_paid or 0))
            outstanding = (total - paid).quantize(Decimal("0.01"))
            if outstanding <= Decimal("0.005"):
                continue
            out.append(
                OpenInvoiceBrief(
                    id=inv.id,
                    invoice_number=inv.invoice_number,
                    issued_at=inv.issued_at,
                    due_date=inv.due_date,
                    total_amount=total,
                    amount_paid=paid,
                    outstanding_amount=outstanding,
                    status=inv.status,
                ).model_dump()
            )
        return out

    # ── On-account credit balance for a party ────────────────────────────────

    async def get_on_account_balance(
        self, party_type: str, party_id: UUID, fy_id: UUID
    ) -> dict:
        """Sum of on_account_amount across all receipts for this party + FY.

        v1 — no consumption tracking yet (Q4: surface on next-receipt as a
        pill, user manually allocates against new invoices). v2 will subtract
        consumed amounts when on-account auto-application lands.
        """
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

    async def _resolve_allocation_invoices(
        self, receipts: list[PaymentReceipt]
    ) -> dict[UUID, str]:
        """Batch-load invoice_number for every allocation row across all receipts."""
        if not receipts:
            return {}
        invoice_ids: set[UUID] = set()
        for r in receipts:
            for a in (r.allocations or []):
                invoice_ids.add(a.invoice_id)
        if not invoice_ids:
            return {}
        rows = (
            await self.db.execute(
                select(Invoice.id, Invoice.invoice_number).where(Invoice.id.in_(invoice_ids))
            )
        ).all()
        return {row.id: row.invoice_number for row in rows}

    def _to_response(
        self,
        r: PaymentReceipt,
        parties_index: dict[tuple[str, UUID], dict],
        invoice_index: dict[UUID, str],
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
                    "invoice_id": str(a.invoice_id),
                    "invoice_number": invoice_index.get(a.invoice_id),
                    "amount_applied": float(a.amount_applied),
                }
                for a in (r.allocations or [])
            ],
            "notes": r.notes,
            "fy_id": str(r.fy_id) if r.fy_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
