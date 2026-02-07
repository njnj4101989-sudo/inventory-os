"""Seed 5 default roles with permissions from the RBAC matrix.

Idempotent — skips roles that already exist (matched by name).
Run via: python -m seeds.seed_all
"""

import asyncio
import sys

from sqlalchemy import select

# Allow running from backend/ directory
sys.path.insert(0, ".")

from app.database import async_session_factory
from app.models.role import Role
from app.core.permissions import ROLE_PERMISSIONS, get_role_permissions


ROLES = ["admin", "supervisor", "tailor", "checker", "billing"]


async def seed_roles() -> list[Role]:
    """Insert the 5 default roles. Returns all role objects (existing + new)."""
    async with async_session_factory() as session:
        result = await session.execute(select(Role))
        existing = {r.name: r for r in result.scalars().all()}

        created = []
        for name in ROLES:
            if name in existing:
                print(f"  Role '{name}' already exists — skipped")
                created.append(existing[name])
                continue

            role = Role(
                name=name,
                permissions=get_role_permissions(name),
            )
            session.add(role)
            created.append(role)
            print(f"  Role '{name}' created ({len(ROLE_PERMISSIONS[name])} permissions)")

        await session.commit()

        # Refresh to get DB-generated ids
        for r in created:
            await session.refresh(r)

        return created


if __name__ == "__main__":
    print("Seeding roles...")
    asyncio.run(seed_roles())
    print("Done.")
