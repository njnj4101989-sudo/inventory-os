"""Company + FinancialYear service — multi-tenant aware."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import (
    create_schema,
    create_tenant_tables,
    async_session_factory,
    validate_schema_name,
)
from app.models.company import Company, slugify
from app.models.user import User
from app.models.user_company import UserCompany
from app.models.financial_year import FinancialYear
from app.schemas.company import CompanyUpdate
from app.schemas.financial_year import FinancialYearCreate, FinancialYearUpdate
from app.core.exceptions import ValidationError


class CompanyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Single-company (legacy Settings page) ---

    async def get_company(self, company_id: str | None = None) -> Company | None:
        if company_id:
            result = await self.db.execute(select(Company).where(Company.id == company_id))
        else:
            result = await self.db.execute(select(Company).limit(1))
        return result.scalar_one_or_none()

    async def upsert_company(self, data: CompanyUpdate, company_id: str | None = None) -> Company:
        company = await self.get_company(company_id=company_id)
        if not company:
            raise ValidationError(
                "No company exists yet. Please create one from Settings → Companies tab first."
            )

        for k, v in data.model_dump(exclude_unset=True).items():
            if hasattr(company, k):
                setattr(company, k, v)

        await self.db.flush()
        return company

    # --- Multi-company ---

    # Master types that can be inherited from source company
    ITEM_MASTERS = ["colors", "fabrics", "product_types", "value_additions"]
    PARTY_MASTERS = ["suppliers", "customers", "va_parties"]
    ALL_MASTERS = ITEM_MASTERS + PARTY_MASTERS

    async def create_company(
        self,
        name: str,
        created_by_user_id: UUID,
        copy_from_company_id: UUID | None = None,
        inherit_masters: list[str] | None = None,
        address: str | None = None,
        city: str | None = None,
        state: str | None = None,
        pin_code: str | None = None,
        gst_no: str | None = None,
        state_code: str | None = None,
        pan_no: str | None = None,
        phone: str | None = None,
        email: str | None = None,
    ) -> Company:
        """Create a new company with its own PostgreSQL schema.

        Args:
            copy_from_company_id: Source company to copy masters from.
            inherit_masters: Which master types to copy. Defaults to ALL_MASTERS.
                Options: "colors", "fabrics", "product_types", "value_additions",
                         "suppliers", "customers", "va_parties"
                If None and copy_from_company_id is set, copies all.
                If no source company, seeds minimal defaults (first company).
        """
        slug = slugify(name)
        schema_name = f"co_{slug}"
        validate_schema_name(schema_name)

        # Check for duplicate slug
        existing = await self.db.execute(select(Company).where(Company.slug == slug))
        if existing.scalar_one_or_none():
            raise ValidationError(f"Company with slug '{slug}' already exists")

        # Resolve source company schema if copying
        source_schema = None
        if copy_from_company_id:
            result = await self.db.execute(
                select(Company).where(Company.id == copy_from_company_id)
            )
            source = result.scalar_one_or_none()
            if not source:
                raise ValidationError("Source company not found")
            source_schema = source.schema_name

        # Schema provisioning is outside the ORM transaction, so we handle
        # cleanup manually if any step fails.
        schema_created = False

        try:
            # 1. Create PostgreSQL schema + tenant tables FIRST (before ORM records)
            await create_schema(schema_name)
            schema_created = True
            await create_tenant_tables(schema_name)

            # 2. Populate masters
            if source_schema:
                masters_to_copy = inherit_masters or self.ALL_MASTERS
                await self._copy_masters_from(source_schema, schema_name, masters_to_copy)
            else:
                await self._seed_tenant_defaults(schema_name)

            # 3. Create company record in public schema (ORM — commits with route)
            company = Company(
                name=name,
                slug=slug,
                schema_name=schema_name,
                address=address,
                city=city,
                state=state,
                pin_code=pin_code,
                gst_no=gst_no,
                state_code=state_code,
                pan_no=pan_no,
                phone=phone,
                email=email,
            )
            self.db.add(company)
            await self.db.flush()

            # 4. Link creating user (keep existing default untouched)
            has_default = await self.db.execute(
                select(UserCompany)
                .where(UserCompany.user_id == created_by_user_id, UserCompany.is_default == True)
                .limit(1)
            )
            first_company = has_default.scalar_one_or_none() is None

            # 4a. Link creating user — only default if this is their first company
            user_company = UserCompany(
                user_id=created_by_user_id,
                company_id=company.id,
                is_default=first_company,
            )
            self.db.add(user_company)

            # 4b. Link ALL other active users to this company
            all_users = await self.db.execute(
                select(User).where(User.is_active == True, User.id != created_by_user_id)
            )
            for user in all_users.scalars().all():
                self.db.add(UserCompany(
                    user_id=user.id,
                    company_id=company.id,
                    is_default=False,
                ))

            return company

        except Exception as e:
            # Rollback: drop the schema if it was created
            if schema_created:
                try:
                    from app.database import engine
                    async with engine.begin() as conn:
                        await conn.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))
                except Exception:
                    pass  # log but don't mask original error
            raise ValidationError(f"Failed to create company: {e}")

    # Table name → (Model class, columns to copy — excludes id/created_at)
    _MASTER_MODELS = None

    @classmethod
    def _get_master_models(cls):
        """Lazy-load model mapping to avoid circular imports."""
        if cls._MASTER_MODELS is None:
            from app.models.color import Color
            from app.models.fabric import Fabric
            from app.models.product_type import ProductType
            from app.models.value_addition import ValueAddition
            from app.models.supplier import Supplier
            from app.models.customer import Customer
            from app.models.va_party import VAParty

            cls._MASTER_MODELS = {
                "colors": Color,
                "fabrics": Fabric,
                "product_types": ProductType,
                "value_additions": ValueAddition,
                "suppliers": Supplier,
                "customers": Customer,
                "va_parties": VAParty,
            }
        return cls._MASTER_MODELS

    async def _copy_masters_from(
        self, source_schema: str, target_schema: str, master_types: list[str]
    ) -> None:
        """Copy master records from source company schema to target schema.

        Creates new records with new UUIDs — no FK dependency on source.
        Only copies active records.
        """
        models = self._get_master_models()

        async with async_session_factory() as source_session:
            await source_session.execute(
                text(f"SET search_path TO {validate_schema_name(source_schema)}, public")
            )

            async with async_session_factory() as target_session:
                await target_session.execute(
                    text(f"SET search_path TO {validate_schema_name(target_schema)}, public")
                )

                for master_type in master_types:
                    model = models.get(master_type)
                    if not model:
                        continue

                    # Read all active records from source
                    result = await source_session.execute(
                        select(model).where(model.is_active == True)
                    )
                    source_records = result.scalars().all()

                    # Get copyable columns (exclude id, created_at — auto-generated)
                    skip = {"id", "created_at"}
                    columns = [
                        c.key for c in model.__table__.columns
                        if c.key not in skip
                    ]

                    # Create new records in target with fresh UUIDs
                    for record in source_records:
                        data = {col: getattr(record, col) for col in columns}
                        # Reset financial fields for party masters (new company, fresh start)
                        if master_type in ("suppliers", "customers", "va_parties"):
                            data["opening_balance"] = None
                            data["balance_type"] = None
                        target_session.add(model(**data))

                await target_session.commit()

    async def _seed_tenant_defaults(self, schema_name: str) -> None:
        """Seed essential master data into a tenant schema."""
        from app.models.product_type import ProductType
        from app.models.color import Color
        from app.models.value_addition import ValueAddition

        async with async_session_factory() as session:
            await session.execute(text(f"SET search_path TO {schema_name}, public"))

            for pt in [
                {"code": "FBL", "name": "Fancy Blouse", "description": "Fancy blouse designs (meter rolls)", "palla_mode": "meter"},
                {"code": "SBL", "name": "Stretchable Blouse", "description": "Stretchable blouse designs", "palla_mode": "both"},
                {"code": "LHG", "name": "Lehenga", "description": "Lehenga designs (weight or meter)", "palla_mode": "both"},
                {"code": "SAR", "name": "Saree", "description": "Saree pieces (meter rolls)", "palla_mode": "meter"},
            ]:
                session.add(ProductType(**pt))

            for c in [
                {"name": "Green", "code": "GREEN", "hex_code": "#22c55e"},
                {"name": "Red", "code": "RED", "hex_code": "#ef4444"},
                {"name": "Blue", "code": "BLUE", "hex_code": "#3b82f6"},
                {"name": "Black", "code": "BLACK", "hex_code": "#000000"},
                {"name": "White", "code": "WHITE", "hex_code": "#ffffff"},
                {"name": "Pink", "code": "PINK", "hex_code": "#ec4899"},
                {"name": "Maroon", "code": "MROON", "hex_code": "#881337"},
                {"name": "Yellow", "code": "YELLW", "hex_code": "#eab308"},
                {"name": "Orange", "code": "ORNGE", "hex_code": "#f97316"},
                {"name": "Purple", "code": "PURPL", "hex_code": "#a855f7"},
            ]:
                session.add(Color(**c))

            for va in [
                {"name": "Embroidery", "short_code": "EMB", "applicable_to": "both"},
                {"name": "Dying", "short_code": "DYE", "applicable_to": "roll"},
                {"name": "Digital Print", "short_code": "DPT", "applicable_to": "both"},
                {"name": "Handwork", "short_code": "HWK", "applicable_to": "both"},
                {"name": "Sequin Work", "short_code": "SQN", "applicable_to": "both"},
                {"name": "Batik", "short_code": "BTC", "applicable_to": "roll"},
                {"name": "Hand Stones", "short_code": "HST", "applicable_to": "garment"},
                {"name": "Button Work", "short_code": "BTN", "applicable_to": "garment"},
                {"name": "Lace Work", "short_code": "LCW", "applicable_to": "garment"},
                {"name": "Finishing", "short_code": "FIN", "applicable_to": "garment"},
            ]:
                session.add(ValueAddition(**va))

            await session.commit()

    async def get_companies(self) -> list[Company]:
        """List all active companies."""
        result = await self.db.execute(
            select(Company).where(Company.is_active == True).order_by(Company.name)
        )
        return list(result.scalars().all())

    async def get_user_companies(self, user_id: UUID) -> list[dict]:
        """Get companies a user has access to."""
        result = await self.db.execute(
            select(Company, UserCompany.is_default)
            .join(UserCompany, UserCompany.company_id == Company.id)
            .where(UserCompany.user_id == user_id)
            .where(Company.is_active == True)
            .order_by(Company.name)
        )
        return [
            {
                "id": str(company.id),
                "name": company.name,
                "slug": company.slug,
                "schema_name": company.schema_name,
                "is_active": company.is_active,
                "city": company.city,
                "gst_no": company.gst_no,
                "is_default": is_default,
            }
            for company, is_default in result.all()
        ]

    async def set_default_company(self, user_id: UUID, company_id: UUID) -> None:
        """Set a company as the user's default (unset all others)."""
        # Verify link exists
        result = await self.db.execute(
            select(UserCompany).where(
                UserCompany.user_id == user_id,
                UserCompany.company_id == company_id,
            )
        )
        target = result.scalar_one_or_none()
        if not target:
            raise ValidationError("User is not linked to this company")

        # Unset all defaults for this user
        all_links = await self.db.execute(
            select(UserCompany).where(
                UserCompany.user_id == user_id,
                UserCompany.is_default == True,
            )
        )
        for uc in all_links.scalars().all():
            uc.is_default = False

        target.is_default = True
        await self.db.flush()

    async def link_user_to_company(
        self, user_id: UUID, company_id: UUID, is_default: bool = False
    ) -> UserCompany:
        """Link a user to a company."""
        uc = UserCompany(user_id=user_id, company_id=company_id, is_default=is_default)
        self.db.add(uc)
        return uc


class FinancialYearService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _validate_dates(self, start_date, end_date, code: str | None = None):
        """Validate FY dates — start < end, reasonable span."""
        if start_date >= end_date:
            raise ValidationError("Start date must be before end date")
        span_days = (end_date - start_date).days
        if span_days < 28:
            raise ValidationError("Financial year must span at least 1 month")
        if span_days > 400:
            raise ValidationError("Financial year cannot span more than ~13 months")

    async def get_all(self) -> list[FinancialYear]:
        result = await self.db.execute(
            select(FinancialYear).order_by(FinancialYear.start_date.desc())
        )
        return list(result.scalars().all())

    async def get_current(self) -> FinancialYear | None:
        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.is_current == True)
        )
        return result.scalar_one_or_none()

    async def create(self, data: FinancialYearCreate) -> FinancialYear:
        self._validate_dates(data.start_date, data.end_date, data.code)

        # Check duplicate code
        existing_code = await self.db.execute(
            select(FinancialYear).where(FinancialYear.code == data.code)
        )
        if existing_code.scalar_one_or_none():
            raise ValidationError(f"Financial year '{data.code}' already exists")

        if data.is_current:
            existing = await self.get_current()
            if existing:
                existing.is_current = False

        fy = FinancialYear(**data.model_dump())
        self.db.add(fy)
        await self.db.flush()
        return fy

    async def update(self, fy_id: UUID, data: FinancialYearUpdate) -> FinancialYear:
        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.id == fy_id)
        )
        fy = result.scalar_one_or_none()
        if not fy:
            raise ValidationError(f"Financial year not found")

        if fy.status == "closed":
            raise ValidationError("Cannot edit a closed financial year")

        # Validate dates if provided
        new_start = data.start_date if data.start_date else fy.start_date
        new_end = data.end_date if data.end_date else fy.end_date
        if data.start_date or data.end_date:
            self._validate_dates(new_start, new_end)

        # Check duplicate code if changing
        if data.code and data.code != fy.code:
            dup = await self.db.execute(
                select(FinancialYear).where(FinancialYear.code == data.code)
            )
            if dup.scalar_one_or_none():
                raise ValidationError(f"Financial year '{data.code}' already exists")

        if data.is_current:
            existing = await self.get_current()
            if existing and existing.id != fy_id:
                existing.is_current = False

        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(fy, k, v)

        await self.db.flush()
        return fy

    async def delete(self, fy_id: UUID) -> None:
        """Delete an FY only if it has no linked data (ledger entries, rolls, orders, etc.)."""
        from app.models.ledger_entry import LedgerEntry
        from app.models.roll import Roll
        from app.models.order import Order
        from app.models.invoice import Invoice
        from app.models.supplier_invoice import SupplierInvoice
        from app.models.lot import Lot
        from app.models.batch import Batch
        from app.models.job_challan import JobChallan
        from app.models.batch_challan import BatchChallan

        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.id == fy_id)
        )
        fy = result.scalar_one_or_none()
        if not fy:
            raise ValidationError("Financial year not found")

        if fy.status == "closed":
            raise ValidationError("Cannot delete a closed financial year")

        if fy.is_current:
            raise ValidationError("Cannot delete the current financial year. Set another as current first.")

        # Check for linked data
        for model, label in [
            (LedgerEntry, "ledger entries"),
            (Roll, "rolls"),
            (Order, "orders"),
            (Invoice, "invoices"),
            (SupplierInvoice, "supplier invoices"),
            (Lot, "lots"),
            (Batch, "batches"),
            (JobChallan, "job challans"),
            (BatchChallan, "batch challans"),
        ]:
            count_result = await self.db.execute(
                select(func.count()).select_from(model).where(model.fy_id == fy_id)
            )
            count = count_result.scalar() or 0
            if count > 0:
                raise ValidationError(f"Cannot delete — {count} {label} linked to {fy.code}")

        await self.db.delete(fy)
        await self.db.flush()
