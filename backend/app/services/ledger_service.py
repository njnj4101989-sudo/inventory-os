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
from app.schemas.ledger import LedgerEntryCreate, PaymentCreate


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

    async def record_payment(self, data: PaymentCreate, fy_id: UUID, created_by: UUID | None = None) -> list[LedgerEntry]:
        """Record payment + optional TDS/TCS as separate entries. Returns all created entries."""
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

        # Main payment entry
        if data.party_type == "customer":
            # Customer pays us → credit
            entry = await self.create_entry(LedgerEntryCreate(
                entry_date=data.payment_date,
                party_type=data.party_type,
                party_id=data.party_id,
                entry_type="payment",
                reference_type="manual",
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
                reference_type="manual",
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
                reference_type="manual",
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
                reference_type="manual",
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
