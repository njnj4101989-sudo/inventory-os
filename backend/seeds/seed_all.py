"""Run all seed scripts in order.

Usage:  cd backend && python -m seeds.seed_all
"""

import asyncio
import sys

sys.path.insert(0, ".")

from seeds.seed_roles import seed_roles
from seeds.seed_users import seed_users
from seeds.seed_data import seed_data


async def main():
    print("=" * 50)
    print("Inventory-OS — Seed Runner")
    print("=" * 50)

    print("\n[1/3] Seeding roles...")
    await seed_roles()

    print("\n[2/3] Seeding test users...")
    await seed_users()

    print("\n[3/3] Seeding sample data...")
    await seed_data()

    print("\n" + "=" * 50)
    print("All seeds complete.")
    print("Test login: username='admin' password='test1234'")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
