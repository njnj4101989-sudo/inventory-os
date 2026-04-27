"""Ledger service — journal entries, payment recording, balance computation.

fy_id is set via auto-entries from stock-in, invoice, challan receive (S77).
"""
from __future__ import annotations

import math
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger_entry import LedgerEntry
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.va_party import VAParty
from app.models.broker import Broker
from app.models.financial_year import FinancialYear
from app.schemas.ledger import LedgerEntryCreate, PaymentCreate
from app.core.exceptions import NotFoundError, ValidationError


class LedgerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Create entry (internal — called by other services or payment endpoint) ──

    async def create_entry(self, data: LedgerEntryCreate) -> LedgerEntry:
        entry = LedgerEntry(**data.model_dump())
        self.db.add(entry)
        await self.db.flush()
        return entry

    # ── Record payment (with TDS/TCS) ──

    async def record_payment(
        self,
        data: PaymentCreate,
        fy_id: UUID,
        created_by: UUID | None = None,
        reference_type: str | None = None,
        reference_id: UUID | None = None,
    ) -> list[LedgerEntry]:
        """Record payment + optional TDS/TCS as separate entries.

        `reference_type`/`reference_id` are optional source-document links
        (e.g. `'invoice'` + invoice.id when the payment is recorded from
        the invoice's "Mark as Paid" flow). Defaults to `'manual'` for
        ad-hoc receipts via the LedgerPanel.
        """
        entries = []
        amount = data.amount
        tds_amount = Decimal("0")
        tcs_amount = Decimal("0")
        net_amount = amount

        # TDS calculation
        if data.tds_applicable and data.tds_rate:
            tds_amount = (amount * data.tds_rate / 100).quantize(Decimal("0.01"))
            net_amount = amount - tds_amount

        # TCS calculation (for customer receipts)
        if data.tcs_applicable and data.tcs_rate:
            tcs_amount = (amount * data.tcs_rate / 100).quantize(Decimal("0.01"))
            net_amount = amount + tcs_amount

        mode_str = f" ({data.payment_mode.upper()})" if data.payment_mode else ""
        ref_str = f" Ref: {data.reference_no}" if data.reference_no else ""

        ref_t = reference_type or "manual"

        # Main payment entry
        if data.party_type == "customer":
            # Customer pays us → credit
            entry = await self.create_entry(LedgerEntryCreate(
                entry_date=data.payment_date,
                party_type=data.party_type,
                party_id=data.party_id,
                entry_type="payment",
                reference_type=ref_t,
                reference_id=reference_id,
                debit=Decimal("0"),
                credit=net_amount,
                net_amount=net_amount,
                description=f"Payment received{mode_str}{ref_str}",
                created_by=created_by,
                fy_id=fy_id,
                notes=data.notes,
            ))
        else:
            # We pay supplier/va_party → debit
            entry = await self.create_entry(LedgerEntryCreate(
                entry_date=data.payment_date,
                party_type=data.party_type,
                party_id=data.party_id,
                entry_type="payment",
                reference_type=ref_t,
                reference_id=reference_id,
                debit=net_amount,
                credit=Decimal("0"),
                net_amount=net_amount,
                description=f"Payment made{mode_str}{ref_str}",
                created_by=created_by,
                fy_id=fy_id,
                notes=data.notes,
            ))
        entries.append(entry)

        # TDS entry (separate line)
        if tds_amount > 0:
            tds_entry = await self.create_entry(LedgerEntryCreate(
                entry_date=data.payment_date,
                party_type=data.party_type,
                party_id=data.party_id,
                entry_type="tds",
                reference_type=ref_t,
                reference_id=reference_id,
                debit=tds_amount if data.party_type != "customer" else Decimal("0"),
                credit=Decimal("0") if data.party_type != "customer" else tds_amount,
                tds_amount=tds_amount,
                tds_section=data.tds_section,
                description=f"TDS @{data.tds_rate}% u/s {data.tds_section or '—'}",
                created_by=created_by,
                fy_id=fy_id,
            ))
            entries.append(tds_entry)

        # TCS entry (separate line)
        if tcs_amount > 0:
            tcs_entry = await self.create_entry(LedgerEntryCreate(
                entry_date=data.payment_date,
                party_type=data.party_type,
                party_id=data.party_id,
                entry_type="tcs",
                reference_type=ref_t,
                reference_id=reference_id,
                debit=Decimal("0"),
                credit=tcs_amount,
                tcs_amount=tcs_amount,
                description=f"TCS @{data.tcs_rate}% u/s {data.tcs_section or '—'}",
                created_by=created_by,
                fy_id=fy_id,
            ))
            entries.append(tcs_entry)

        await self.db.flush()
        return entries

    # ── Get ledger entries for a party ──

    async def get_ledger(
        self,
        party_type: str,
        party_id: UUID,
        fy_id: UUID,
        page: int = 1,
        page_size: int = 50,
        entry_type: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict:
        q = select(LedgerEntry).where(
            LedgerEntry.party_type == party_type,
            LedgerEntry.party_id == party_id,
            LedgerEntry.fy_id == fy_id,
        )
        count_q = select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.party_type == party_type,
            LedgerEntry.party_id == party_id,
            LedgerEntry.fy_id == fy_id,
        )

        if entry_type:
            q = q.where(LedgerEntry.entry_type == entry_type)
            count_q = count_q.where(LedgerEntry.entry_type == entry_type)
        if date_from:
            q = q.where(LedgerEntry.entry_date >= date_from)
            count_q = count_q.where(LedgerEntry.entry_date >= date_from)
        if date_to:
            q = q.where(LedgerEntry.entry_date <= date_to)
            count_q = count_q.where(LedgerEntry.entry_date <= date_to)

        total = (await self.db.execute(count_q)).scalar() or 0
        pages = max(1, math.ceil(total / page_size)) if page_size > 0 else 1

        q = q.order_by(LedgerEntry.entry_date.asc(), LedgerEntry.created_at.asc())
        if page_size > 0:
            q = q.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(q)
        entries = result.scalars().all()

        return {"data": entries, "total": total, "page": page, "pages": pages}

    # ── Balance for a single party ──

    async def get_party_balance(self, party_type: str, party_id: UUID, fy_id: UUID) -> dict:
        q = select(
            func.coalesce(func.sum(LedgerEntry.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LedgerEntry.credit), 0).label("total_credit"),
        ).where(
            LedgerEntry.party_type == party_type,
            LedgerEntry.party_id == party_id,
            LedgerEntry.fy_id == fy_id,
        )
        row = (await self.db.execute(q)).one()
        total_debit = Decimal(str(row.total_debit))
        total_credit = Decimal(str(row.total_credit))

        if party_type == "customer":
            # Customer: debit - credit → positive = they owe us
            balance = total_debit - total_credit
            balance_type = "dr" if balance >= 0 else "cr"
        else:
            # Supplier/VA: credit - debit → positive = we owe them
            balance = total_credit - total_debit
            balance_type = "cr" if balance >= 0 else "dr"

        return {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "balance": abs(balance),
            "balance_type": balance_type,
        }

    # ── Balances for all parties of a type (for list view badges) ──

    async def get_all_balances(self, party_type: str, fy_id: UUID) -> list[dict]:
        q = select(
            LedgerEntry.party_id,
            func.coalesce(func.sum(LedgerEntry.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LedgerEntry.credit), 0).label("total_credit"),
        ).where(
            LedgerEntry.party_type == party_type,
            LedgerEntry.fy_id == fy_id,
        ).group_by(LedgerEntry.party_id)

        rows = (await self.db.execute(q)).all()
        results = []
        for row in rows:
            td = Decimal(str(row.total_debit))
            tc = Decimal(str(row.total_credit))
            if party_type == "customer":
                bal = td - tc
                bt = "dr" if bal >= 0 else "cr"
            else:
                bal = tc - td
                bt = "cr" if bal >= 0 else "dr"
            results.append({
                "party_id": row.party_id,
                "total_debit": td,
                "total_credit": tc,
                "balance": abs(bal),
                "balance_type": bt,
            })
        return results

    # ── Opening Balance ──

    PARTY_MODELS = {
        "supplier": Supplier,
        "customer": Customer,
        "va_party": VAParty,
        "broker": Broker,
    }

    async def _resolve_party_name(self, party_type: str, party_id: UUID) -> str:
        model = self.PARTY_MODELS.get(party_type)
        if not model:
            return "Unknown"
        row = (await self.db.execute(select(model.name).where(model.id == party_id))).scalar()
        return row or "Unknown"

    async def _get_fy_start_date(self, fy_id: UUID) -> date:
        row = (await self.db.execute(select(FinancialYear.start_date).where(FinancialYear.id == fy_id))).scalar()
        if not row:
            raise NotFoundError("Financial year not found. Please select a company with an active financial year.")
        return row

    async def create_opening_balance(
        self, party_type: str, party_id: UUID, amount: Decimal,
        balance_type: str, fy_id: UUID, entry_date: date | None = None,
        notes: str | None = None, created_by: UUID | None = None,
        force: bool = False,
    ) -> dict:
        """Create an opening balance ledger entry for a party."""
        if party_type not in self.PARTY_MODELS:
            raise ValidationError(f"Invalid party type '{party_type}'. Must be one of: supplier, customer, va_party, broker")
        if balance_type not in ("dr", "cr"):
            raise ValidationError("Balance type must be 'dr' or 'cr'")
        if amount <= 0:
            raise ValidationError("Amount must be greater than 0")

        # Verify party exists
        party_name = await self._resolve_party_name(party_type, party_id)
        if party_name == "Unknown":
            raise NotFoundError(f"{party_type.replace('_', ' ').title()} not found")

        # Check for existing opening entry in this FY
        existing = (await self.db.execute(
            select(func.count()).select_from(LedgerEntry).where(
                LedgerEntry.party_type == party_type,
                LedgerEntry.party_id == party_id,
                LedgerEntry.entry_type == "opening",
                LedgerEntry.fy_id == fy_id,
            )
        )).scalar() or 0

        if existing > 0 and not force:
            return {
                "created": False,
                "party_name": party_name,
                "message": f"Opening balance already exists for {party_name}. Use force=true to override.",
                "existing": True,
            }

        # Delete existing opening entries if force override
        if existing > 0 and force:
            from sqlalchemy import delete
            await self.db.execute(
                delete(LedgerEntry).where(
                    LedgerEntry.party_type == party_type,
                    LedgerEntry.party_id == party_id,
                    LedgerEntry.entry_type == "opening",
                    LedgerEntry.fy_id == fy_id,
                )
            )
            await self.db.flush()

        if not entry_date:
            entry_date = await self._get_fy_start_date(fy_id)

        debit = amount if balance_type == "dr" else Decimal("0")
        credit = amount if balance_type == "cr" else Decimal("0")

        await self.create_entry(LedgerEntryCreate(
            entry_date=entry_date,
            party_type=party_type,
            party_id=party_id,
            entry_type="opening",
            reference_type="manual_opening",
            debit=debit,
            credit=credit,
            description=f"Opening balance — {party_name}",
            fy_id=fy_id,
            created_by=created_by,
            notes=notes,
        ))

        return {
            "created": True,
            "party_name": party_name,
            "message": f"Opening balance set for {party_name}: ₹{amount:,.2f} {balance_type.upper()}",
        }

    async def create_opening_balance_bulk(
        self, entries: list, fy_id: UUID, created_by: UUID | None = None,
    ) -> dict:
        """Bulk opening balance entry. Single transaction."""
        if not entries:
            raise ValidationError("Please provide at least one opening balance entry")

        created = 0
        skipped = []
        total_debit = Decimal("0")
        total_credit = Decimal("0")

        for i, entry in enumerate(entries, 1):
            if entry.amount <= 0:
                raise ValidationError(f"Row {i}: Amount must be greater than 0")

            result = await self.create_opening_balance(
                party_type=entry.party_type,
                party_id=entry.party_id,
                amount=entry.amount,
                balance_type=entry.balance_type,
                fy_id=fy_id,
                entry_date=entry.entry_date,
                notes=entry.notes,
                created_by=created_by,
                force=True,  # bulk always overwrites
            )

            if result["created"]:
                created += 1
                if entry.balance_type == "dr":
                    total_debit += entry.amount
                else:
                    total_credit += entry.amount
            else:
                skipped.append(result["party_name"])

        return {
            "created": created,
            "skipped": skipped,
            "total_debit": float(total_debit),
            "total_credit": float(total_credit),
            "message": f"{created} opening balances saved (₹{total_debit:,.0f} Dr, ₹{total_credit:,.0f} Cr)",
        }

    async def get_opening_balance_status(self, fy_id: UUID) -> dict:
        """Per party_type: how many parties have opening balance vs total parties."""
        result = {}
        for party_type, model in self.PARTY_MODELS.items():
            # Total active parties
            total = (await self.db.execute(
                select(func.count()).select_from(model).where(model.is_active == True)
            )).scalar() or 0

            # Parties with opening entry in this FY
            with_opening = (await self.db.execute(
                select(func.count(func.distinct(LedgerEntry.party_id))).where(
                    LedgerEntry.party_type == party_type,
                    LedgerEntry.entry_type == "opening",
                    LedgerEntry.fy_id == fy_id,
                )
            )).scalar() or 0

            result[party_type] = {
                "total": total,
                "with_opening": with_opening,
                "without_opening": total - with_opening,
            }

        return result

    # ── Party Balance Confirmation Report ──

    async def get_party_confirmation(self, party_type: str, party_id: UUID, fy_id: UUID) -> dict:
        """Generate balance confirmation data for a party — opening, transactions, closing."""
        if party_type not in self.PARTY_MODELS:
            raise ValidationError(f"Invalid party_type: {party_type}")

        party_name = await self._resolve_party_name(party_type, party_id)

        # Get party details (address, GST)
        model = self.PARTY_MODELS[party_type]
        party_row = (await self.db.execute(select(model).where(model.id == party_id))).scalar_one_or_none()
        if not party_row:
            raise NotFoundError(f"{party_type} not found")

        party_info = {
            "name": party_row.name,
            "phone": getattr(party_row, "phone", None),
            "city": getattr(party_row, "city", None),
            "address": getattr(party_row, "address", None),
            "gst_no": getattr(party_row, "gst_no", None),
        }

        # FY info
        fy = (await self.db.execute(select(FinancialYear).where(FinancialYear.id == fy_id))).scalar_one_or_none()
        if not fy:
            raise NotFoundError("Financial year not found")

        # All ledger entries for this party in this FY, ordered by date
        entries = (await self.db.execute(
            select(LedgerEntry)
            .where(LedgerEntry.party_type == party_type, LedgerEntry.party_id == party_id, LedgerEntry.fy_id == fy_id)
            .order_by(LedgerEntry.entry_date, LedgerEntry.created_at)
        )).scalars().all()

        # Separate opening from transactions
        opening_debit = Decimal("0")
        opening_credit = Decimal("0")
        transactions = []

        for e in entries:
            if e.entry_type == "opening":
                opening_debit += e.debit or Decimal("0")
                opening_credit += e.credit or Decimal("0")
            else:
                transactions.append({
                    "date": str(e.entry_date),
                    "entry_type": e.entry_type,
                    "reference_type": e.reference_type,
                    "description": e.description,
                    "debit": float(e.debit or 0),
                    "credit": float(e.credit or 0),
                })

        total_debit = sum(float(e.debit or 0) for e in entries)
        total_credit = sum(float(e.credit or 0) for e in entries)
        closing_net = total_debit - total_credit

        if party_type == "customer":
            closing_balance = abs(closing_net)
            closing_type = "dr" if closing_net >= 0 else "cr"
        else:
            closing_balance = abs(closing_net)
            closing_type = "cr" if closing_net <= 0 else "dr"

        # Unpaid invoices (for customers only)
        unpaid_invoices = []
        if party_type == "customer":
            from app.models.invoice import Invoice
            inv_rows = (await self.db.execute(
                select(Invoice)
                .where(Invoice.customer_id == party_id, Invoice.status == "issued", Invoice.fy_id == fy_id)
                .order_by(Invoice.created_at)
            )).scalars().all()
            for inv in inv_rows:
                unpaid_invoices.append({
                    "invoice_no": inv.invoice_number,
                    "date": str(inv.created_at.date()) if inv.created_at else None,
                    "amount": float(inv.total_amount),
                    "due_date": str(inv.due_date) if hasattr(inv, "due_date") and inv.due_date else None,
                })

        return {
            "party_type": party_type,
            "party": party_info,
            "fy": {"code": fy.code, "start_date": str(fy.start_date), "end_date": str(fy.end_date)},
            "opening_balance": {
                "debit": float(opening_debit),
                "credit": float(opening_credit),
                "net": float(opening_debit - opening_credit),
            },
            "transactions": transactions,
            "summary": {
                "total_debit": round(total_debit, 2),
                "total_credit": round(total_credit, 2),
                "transaction_count": len(transactions),
            },
            "closing_balance": {
                "amount": round(closing_balance, 2),
                "type": closing_type,
            },
            "unpaid_invoices": unpaid_invoices,
        }
