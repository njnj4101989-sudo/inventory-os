"""Seed 1 test user per role (5 total).

Idempotent — skips users that already exist (matched by username).
Run via: python -m seeds.seed_all
"""

import asyncio
import sys

from sqlalchemy import select

sys.path.insert(0, ".")

from app.database import async_session_factory
from app.models.role import Role
from app.models.user import User
from app.core.security import hash_password


TEST_PASSWORD = "test1234"

# username, full_name, phone, role_name
TEST_USERS = [
    ("admin", "Admin User", "9000000001", "admin"),
    ("supervisor", "Supervisor User", "9000000002", "supervisor"),
    ("tailor1", "Tailor One", "9000000003", "tailor"),
    ("checker1", "Checker One", "9000000004", "checker"),
    ("billing", "Billing User", "9000000005", "billing"),
]


async def seed_users() -> list[User]:
    """Insert 5 test users. Returns all user objects."""
    async with async_session_factory() as session:
        # Load roles into a name→id map
        result = await session.execute(select(Role))
        role_map = {r.name: r.id for r in result.scalars().all()}

        if not role_map:
            print("  ERROR: No roles found — run seed_roles first")
            return []

        result = await session.execute(select(User))
        existing = {u.username: u for u in result.scalars().all()}

        hashed = hash_password(TEST_PASSWORD)
        created = []

        for username, full_name, phone, role_name in TEST_USERS:
            if username in existing:
                print(f"  User '{username}' already exists — skipped")
                created.append(existing[username])
                continue

            role_id = role_map.get(role_name)
            if not role_id:
                print(f"  ERROR: Role '{role_name}' not found — skipping user '{username}'")
                continue

            user = User(
                username=username,
                password_hash=hashed,
                full_name=full_name,
                phone=phone,
                role_id=role_id,
                is_active=True,
            )
            session.add(user)
            created.append(user)
            print(f"  User '{username}' created (role: {role_name})")

        await session.commit()
        return created


if __name__ == "__main__":
    print("Seeding users...")
    asyncio.run(seed_users())
    print("Done.")
