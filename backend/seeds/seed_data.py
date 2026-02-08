"""Seed sample suppliers and SKUs for development/testing.

Idempotent — skips records that already exist (matched by name / sku_code).
Run via: python -m seeds.seed_all
"""

import asyncio
import sys
from decimal import Decimal

from sqlalchemy import select

sys.path.insert(0, ".")

from app.database import async_session_factory
from app.models.supplier import Supplier
from app.models.sku import SKU


SUPPLIERS = [
    {
        "name": "Lakshmi Textiles",
        "contact_person": "Ramesh Kumar",
        "phone": "9100000001",
        "address": "Erode, Tamil Nadu",
    },
    {
        "name": "Bharat Fabrics",
        "contact_person": "Suresh Patel",
        "phone": "9100000002",
        "address": "Surat, Gujarat",
    },
]

SKUS = [
    {
        "sku_code": "BLS-101-White-M",
        "product_type": "BLS",
        "product_name": "White Cotton Blouse",
        "color": "White",
        "size": "M",
        "description": "Standard white cotton blouse, medium size",
        "base_price": Decimal("250.00"),
    },
    {
        "sku_code": "BLS-102-Black-L",
        "product_type": "BLS",
        "product_name": "Black Silk Blouse",
        "color": "Black",
        "size": "L",
        "description": "Premium black silk blouse, large size",
        "base_price": Decimal("450.00"),
    },
    {
        "sku_code": "BLS-103-Red-S",
        "product_type": "BLS",
        "product_name": "Red Cotton Blouse",
        "color": "Red",
        "size": "S",
        "description": "Standard red cotton blouse, small size",
        "base_price": Decimal("230.00"),
    },
]


async def seed_data() -> None:
    """Insert sample suppliers and SKUs."""
    async with async_session_factory() as session:
        # --- Suppliers ---
        result = await session.execute(select(Supplier))
        existing_suppliers = {s.name for s in result.scalars().all()}

        for s in SUPPLIERS:
            if s["name"] in existing_suppliers:
                print(f"  Supplier '{s['name']}' already exists — skipped")
                continue
            session.add(Supplier(**s))
            print(f"  Supplier '{s['name']}' created")

        # --- SKUs ---
        result = await session.execute(select(SKU))
        existing_skus = {s.sku_code for s in result.scalars().all()}

        for s in SKUS:
            if s["sku_code"] in existing_skus:
                print(f"  SKU '{s['sku_code']}' already exists — skipped")
                continue
            session.add(SKU(**s))
            print(f"  SKU '{s['sku_code']}' created ({s['product_name']})")

        await session.commit()


if __name__ == "__main__":
    print("Seeding sample data...")
    asyncio.run(seed_data())
    print("Done.")
