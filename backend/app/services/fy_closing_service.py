"""Financial Year Closing Service — close FY, carry forward balances, create new FY."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_year import FinancialYear
from app.models.ledger_entry import LedgerEntry
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.va_party import VAParty
from app.models.job_challan import JobChallan
from app.models.batch_challan import BatchChallan
from app.core.exceptions import BusinessRuleViolationError, NotFoundError, ValidationError


class FYClosingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def validate_closing(self, fy_id: UUID) -> dict:
        """Pre-flight checks before closing. Returns warnings (not blockers)."""
        fy = await self._get_fy(fy_id)

        if fy.status == "closed":
            raise ValidationError(f"{fy.code} is already closed")
        if not fy.is_current:
            raise ValidationError("Can only close the current financial year")

        warnings = []

        # Check open job challans (sent but not fully received)
        open_jc = await self.db.execute(
            select(func.count()).select_from(JobChallan)
            .where(JobChallan.status.in_(["sent", "partially_received"]))
        )
        jc_count = open_jc.scalar() or 0
        if jc_count > 0:
            warnings.append(f"{jc_count} job challan(s) still open (sent/partially received)")

        # Check open batch challans
        open_bc = await self.db.execute(
            select(func.count()).select_from(BatchChallan)
            .where(BatchChallan.status.in_(["sent", "partially_received"]))
        )
        bc_count = open_bc.scalar() or 0
        if bc_count > 0:
            warnings.append(f"{bc_count} batch challan(s) still open (sent/partially received)")

        # Compute party balances for preview
        balances = await self._compute_all_balances()

        return {
            "fy": {"id": str(fy.id), "code": fy.code, "start_date": str(fy.start_date), "end_date": str(fy.end_date)},
            "warnings": warnings,
            "can_close": True,  # warnings don't block — just inform
            "balances": balances,
        }

    async def close_fy(
        self,
        fy_id: UUID,
        new_fy_code: str,
        new_start_date: date,
        new_end_date: date,
        closed_by_user_id: UUID,
    ) -> dict:
        """Close the current FY and open a new one.

        All mutations happen in the same DB transaction (committed by route).
        If anything fails, the entire transaction rolls back — no partial state.

        1. Validate everything FIRST (read-only)
        2. Snapshot all party balances (read-only)
        3. Mark old FY as closed
        4. Create new FY
        5. Create opening balance ledger entries
        6. Return (route commits all at once)
        """
        # === VALIDATION PHASE (lock row to prevent concurrent close) ===
        old_fy = await self._get_fy(fy_id, for_update=True)

        if old_fy.status == "closed":
            raise ValidationError(f"{old_fy.code} is already closed")

        if new_start_date >= new_end_date:
            raise ValidationError("New FY start date must be before end date")

        existing = await self.db.execute(
            select(FinancialYear).where(FinancialYear.code == new_fy_code)
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"Financial year '{new_fy_code}' already exists")

        # Snapshot balances (read-only — no writes yet)
        balances = await self._compute_all_balances()

        closing_snapshot = {
            "closed_at": datetime.now(timezone.utc).isoformat(),
            "supplier_balances": balances["suppliers"],
            "customer_balances": balances["customers"],
            "va_party_balances": balances["va_parties"],
            "summary": balances["summary"],
        }

        # === MUTATION PHASE (all in one transaction, commits at route level) ===

        # Close old FY
        old_fy.status = "closed"
        old_fy.is_current = False
        old_fy.closed_by = closed_by_user_id
        old_fy.closed_at = datetime.now(timezone.utc)
        old_fy.closing_snapshot = closing_snapshot

        # Create new FY
        new_fy = FinancialYear(
            code=new_fy_code,
            start_date=new_start_date,
            end_date=new_end_date,
            status="open",
            is_current=True,
        )
        self.db.add(new_fy)
        await self.db.flush()  # get new_fy.id for opening entries

        # Create opening balance ledger entries
        opening_count = await self._create_opening_entries(new_fy.id, new_start_date, balances)

        # If we reach here, everything succeeded. Route will commit.
        return {
            "closed_fy": {"id": str(old_fy.id), "code": old_fy.code},
            "new_fy": {"id": str(new_fy.id), "code": new_fy.code, "start_date": str(new_start_date), "end_date": str(new_end_date)},
            "opening_entries_created": opening_count,
            "snapshot": closing_snapshot,
        }

    async def _get_fy(self, fy_id: UUID, for_update: bool = False) -> FinancialYear:
        stmt = select(FinancialYear).where(FinancialYear.id == fy_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self.db.execute(stmt)
        fy = result.scalar_one_or_none()
        if not fy:
            raise NotFoundError("Financial year not found")
        return fy

    async def _compute_all_balances(self) -> dict:
        """Compute net balance for every party across all ledger entries."""
        party_types = [
            ("supplier", "suppliers"),
            ("customer", "customers"),
            ("va_party", "va_parties"),
        ]

        result = {}
        total_debit = Decimal("0")
        total_credit = Decimal("0")

        for party_type, key in party_types:
            q = select(
                LedgerEntry.party_id,
                func.coalesce(func.sum(LedgerEntry.debit), 0).label("td"),
                func.coalesce(func.sum(LedgerEntry.credit), 0).label("tc"),
            ).where(
                LedgerEntry.party_type == party_type,
            ).group_by(LedgerEntry.party_id)

            rows = (await self.db.execute(q)).all()
            entries = []
            for row in rows:
                td = Decimal(str(row.td))
                tc = Decimal(str(row.tc))
                net = td - tc  # positive = debit balance, negative = credit balance

                if abs(net) < Decimal("0.01"):
                    continue  # skip zero balances

                # Fetch party name
                name = await self._get_party_name(party_type, row.party_id)

                entries.append({
                    "party_id": str(row.party_id),
                    "name": name,
                    "total_debit": float(td),
                    "total_credit": float(tc),
                    "net": float(net),
                    "balance": float(abs(net)),
                    "balance_type": "dr" if net > 0 else "cr",
                })
                total_debit += td
                total_credit += tc

            result[key] = entries

        result["summary"] = {
            "total_debit": float(total_debit),
            "total_credit": float(total_credit),
            "parties_with_balance": sum(len(v) for k, v in result.items() if k != "summary"),
        }

        return result

    async def _get_party_name(self, party_type: str, party_id: UUID) -> str:
        model = {"supplier": Supplier, "customer": Customer, "va_party": VAParty}.get(party_type)
        if not model:
            return "Unknown"
        result = await self.db.execute(select(model.name).where(model.id == party_id))
        name = result.scalar_one_or_none()
        return name or "Unknown"

    async def _create_opening_entries(
        self, new_fy_id: UUID, opening_date: date, balances: dict
    ) -> int:
        """Create opening balance ledger entries for each party with a balance."""
        count = 0

        for party_type, key in [("supplier", "suppliers"), ("customer", "customers"), ("va_party", "va_parties")]:
            for entry in balances.get(key, []):
                net = Decimal(str(entry["net"]))
                if abs(net) < Decimal("0.01"):
                    continue

                # Opening entry mirrors the closing balance
                ledger = LedgerEntry(
                    entry_date=opening_date,
                    party_type=party_type,
                    party_id=entry["party_id"],
                    entry_type="opening",
                    reference_type="fy_closing",
                    debit=max(net, Decimal("0")),
                    credit=max(-net, Decimal("0")),
                    net_amount=abs(net),
                    description=f"Opening balance carried forward from previous FY",
                    fy_id=new_fy_id,
                )
                self.db.add(ledger)
                count += 1

        return count
