"""Authentication service — login, company select, token refresh, logout."""

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.company import Company
from app.models.user_company import UserCompany
from app.models.financial_year import FinancialYear
from app.schemas.auth import LoginRequest, TokenResponse, RefreshResponse, UserBriefAuth
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
    build_token_payload,
)
from app.core.permissions import get_role_permissions, get_role_permission_list, ALL_PERMISSIONS
from app.core.exceptions import UnauthorizedError, TokenExpiredError, NotFoundError
from app.config import get_settings

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _build_permissions(self, user: User) -> tuple[list[str], dict]:
        """Extract merged permission list + frontend map from user's role."""
        role_name = user.role.name if user.role else "unknown"

        hardcoded = set(get_role_permission_list(role_name))
        db_permissions = user.role.permissions if user.role and user.role.permissions else None
        if db_permissions and isinstance(db_permissions, dict):
            merged = set(hardcoded)
            for perm_name, granted in db_permissions.items():
                if granted:
                    merged.add(perm_name)
                else:
                    merged.discard(perm_name)
            permissions = list(merged)
        else:
            permissions = list(hardcoded)

        permissions_map = {perm: perm in permissions for perm in ALL_PERMISSIONS}
        return permissions, permissions_map

    async def _get_user_companies(self, user_id: UUID) -> list[dict]:
        """Fetch companies a user has access to."""
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
                "is_default": is_default,
            }
            for company, is_default in result.all()
        ]

    async def _get_current_fy(self, company_schema: str) -> dict | None:
        """Fetch current FY from a tenant schema using the existing session."""
        # Temporarily switch search_path, then restore
        await self.db.execute(text(f"SET search_path TO {company_schema}, public"))
        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.is_current == True)
        )
        fy = result.scalar_one_or_none()
        # Restore to public (login runs in public context)
        await self.db.execute(text("SET search_path TO public"))
        if fy:
            return {"id": str(fy.id), "code": fy.code}
        return None

    async def _get_all_fys(self, company_schema: str) -> list[dict]:
        """Fetch all FYs from a tenant schema using the existing session."""
        await self.db.execute(text(f"SET search_path TO {company_schema}, public"))
        result = await self.db.execute(
            select(FinancialYear).order_by(FinancialYear.start_date.desc())
        )
        fys = [
            {"id": str(fy.id), "code": fy.code, "is_current": fy.is_current, "status": fy.status}
            for fy in result.scalars().all()
        ]
        await self.db.execute(text("SET search_path TO public"))
        return fys

    async def login(self, req: LoginRequest) -> dict:
        """Authenticate user. Returns user + companies list.

        If user has 1 company: auto-selects it, returns full JWT with company context.
        If user has N companies: returns company list for picker (no JWT yet).
        If user has 0 companies: returns JWT without company context (admin setup mode).
        """
        stmt = (
            select(User)
            .where(User.username == req.username)
            .options(selectinload(User.role))
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None or not verify_password(req.password, user.password_hash):
            raise UnauthorizedError("Invalid username or password")

        if not user.is_active:
            raise UnauthorizedError("User account is deactivated")

        role_name = user.role.name if user.role else "unknown"
        permissions, permissions_map = self._build_permissions(user)

        companies = await self._get_user_companies(user.id)

        user_brief = UserBriefAuth(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=role_name,
            role_display_name=user.role.display_name if user.role else None,
            permissions=permissions_map,
        )

        if len(companies) == 1:
            # Auto-select single company — return full JWT
            company = companies[0]
            current_fy = await self._get_current_fy(company["schema_name"])
            fys = await self._get_all_fys(company["schema_name"])

            payload = build_token_payload(
                user_id=str(user.id),
                username=user.username,
                role=role_name,
                permissions=permissions,
                company_id=company["id"],
                company_schema=company["schema_name"],
                company_name=company["name"],
                fy_id=current_fy["id"] if current_fy else None,
                fy_code=current_fy["code"] if current_fy else None,
            )

            return {
                "access_token": create_access_token(payload),
                "refresh_token": create_refresh_token(payload),
                "user": user_brief,
                "company": company,
                "companies": companies,
                "fy": current_fy,
                "fys": fys,
                "needs_company_select": False,
            }

        elif len(companies) > 1:
            # Multiple companies — frontend must show picker
            # Issue a temporary JWT without company context
            payload = build_token_payload(
                user_id=str(user.id),
                username=user.username,
                role=role_name,
                permissions=permissions,
            )

            return {
                "access_token": create_access_token(payload),
                "refresh_token": create_refresh_token(payload),
                "user": user_brief,
                "company": None,
                "companies": companies,
                "fy": None,
                "fys": [],
                "needs_company_select": True,
            }

        else:
            # No companies — admin setup mode (first run)
            payload = build_token_payload(
                user_id=str(user.id),
                username=user.username,
                role=role_name,
                permissions=permissions,
            )

            return {
                "access_token": create_access_token(payload),
                "refresh_token": create_refresh_token(payload),
                "user": user_brief,
                "company": None,
                "companies": [],
                "fy": None,
                "fys": [],
                "needs_company_select": False,
            }

    async def select_company(self, user_id: UUID, company_id: UUID, fy_id: UUID | None = None) -> dict:
        """Select company (and optionally FY). Re-issues JWT with full context."""
        # Verify user has access to this company
        result = await self.db.execute(
            select(UserCompany)
            .where(UserCompany.user_id == user_id, UserCompany.company_id == company_id)
        )
        uc = result.scalar_one_or_none()
        if not uc:
            raise UnauthorizedError("User does not have access to this company")

        # Fetch company
        result = await self.db.execute(select(Company).where(Company.id == company_id))
        company = result.scalar_one_or_none()
        if not company or not company.is_active:
            raise NotFoundError("Company not found")

        # Fetch user with role
        result = await self.db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.role))
        )
        user = result.scalar_one()
        role_name = user.role.name if user.role else "unknown"
        permissions, permissions_map = self._build_permissions(user)

        # Fetch FYs
        fys = await self._get_all_fys(company.schema_name)
        current_fy = await self._get_current_fy(company.schema_name)

        # Use requested FY or default to current
        selected_fy = None
        if fy_id:
            selected_fy = next((f for f in fys if f["id"] == str(fy_id)), None)
        if not selected_fy and current_fy:
            selected_fy = current_fy

        company_dict = {
            "id": str(company.id),
            "name": company.name,
            "slug": company.slug,
            "schema_name": company.schema_name,
            "is_default": uc.is_default,
        }

        payload = build_token_payload(
            user_id=str(user.id),
            username=user.username,
            role=role_name,
            permissions=permissions,
            company_id=str(company.id),
            company_schema=company.schema_name,
            company_name=company.name,
            fy_id=selected_fy["id"] if selected_fy else None,
            fy_code=selected_fy["code"] if selected_fy else None,
        )

        user_brief = UserBriefAuth(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=role_name,
            role_display_name=user.role.display_name if user.role else None,
            permissions=permissions_map,
        )

        return {
            "access_token": create_access_token(payload),
            "refresh_token": create_refresh_token(payload),
            "user": user_brief,
            "company": company_dict,
            "companies": await self._get_user_companies(user.id),
            "fy": selected_fy,
            "fys": fys,
            "needs_company_select": False,
        }

    async def refresh_from_token(self, refresh_token_str: str) -> RefreshResponse:
        """Issue new access token from a refresh token string (cookie-based).

        Preserves company/FY context from the refresh token.
        """
        from jose import JWTError, ExpiredSignatureError

        try:
            payload = verify_token(refresh_token_str)
        except ExpiredSignatureError:
            raise TokenExpiredError("Refresh token expired, please login again")
        except JWTError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type — expected refresh token")

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise UnauthorizedError("Invalid token payload")

        from uuid import UUID as PyUUID
        try:
            user_id = PyUUID(user_id_str)
        except ValueError:
            raise UnauthorizedError("Invalid user ID in token")

        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.role))
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None:
            raise UnauthorizedError("User not found")
        if not user.is_active:
            raise UnauthorizedError("User account is deactivated")

        role_name = user.role.name if user.role else "unknown"
        permissions, _ = self._build_permissions(user)

        # Preserve company/FY context from refresh token
        new_payload = build_token_payload(
            user_id=str(user.id),
            username=user.username,
            role=role_name,
            permissions=permissions,
            company_id=payload.get("company_id"),
            company_schema=payload.get("company_schema"),
            company_name=payload.get("company_name"),
            fy_id=payload.get("fy_id"),
            fy_code=payload.get("fy_code"),
        )

        access_token = create_access_token(new_payload)

        return RefreshResponse(
            access_token=access_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(self, user_id: UUID) -> None:
        # MVP: no-op. Future: add token jti to blacklist table/cache.
        pass
