"""Seed essential master data (Product Types, Colors, Value Additions).

Idempotent — skips records that already exist (matched by code / short_code).
Run via: python -m seeds.seed_all

NOTE: Suppliers, SKUs, and Fabrics are NOT seeded — add real data from the Masters page.
SKUs are auto-generated at batch pack time.
"""

import asyncio
import sys

from sqlalchemy import select

sys.path.insert(0, ".")

from app.database import async_session_factory
from app.models.product_type import ProductType
from app.models.color import Color
from app.models.value_addition import ValueAddition

PRODUCT_TYPES = [
    {"code": "BLS", "name": "Blouse", "description": "Traditional and modern blouse designs"},
    {"code": "KRT", "name": "Kurti", "description": "Kurti and kurta designs"},
    {"code": "SAR", "name": "Saree", "description": "Saree blouse and saree pieces"},
    {"code": "DRS", "name": "Dress", "description": "Western and Indo-western dresses"},
    {"code": "OTH", "name": "Other", "description": "Other garment types"},
]

COLORS = [
    {"name": "Green",   "code": "GREEN", "hex_code": "#22c55e"},
    {"name": "Red",     "code": "RED",   "hex_code": "#ef4444"},
    {"name": "Blue",    "code": "BLUE",  "hex_code": "#3b82f6"},
    {"name": "Black",   "code": "BLACK", "hex_code": "#000000"},
    {"name": "White",   "code": "WHITE", "hex_code": "#ffffff"},
    {"name": "Yellow",  "code": "YELLW", "hex_code": "#eab308"},
    {"name": "Pink",    "code": "PINK",  "hex_code": "#ec4899"},
    {"name": "Orange",  "code": "ORNGE", "hex_code": "#f97316"},
    {"name": "Purple",  "code": "PURPL", "hex_code": "#a855f7"},
    {"name": "Brown",   "code": "BROWN", "hex_code": "#92400e"},
    {"name": "Grey",    "code": "GREY",  "hex_code": "#6b7280"},
    {"name": "Gray",    "code": "GRAY",  "hex_code": "#9ca3af"},
    {"name": "Mehandi", "code": "MHNDI", "hex_code": "#65a30d"},
    {"name": "Maroon",  "code": "MROON", "hex_code": "#881337"},
    {"name": "Beige",   "code": "BEIGE", "hex_code": "#d4c5a9"},
    {"name": "Magenta", "code": "MGNTA", "hex_code": "#d946ef"},
    {"name": "Peach",   "code": "PEACH", "hex_code": "#fdba74"},
    {"name": "Cream",   "code": "CREAM", "hex_code": "#fef3c7"},
    {"name": "Navy",    "code": "NAVY",  "hex_code": "#1e3a5f"},
    {"name": "Teal",    "code": "TEAL",  "hex_code": "#14b8a6"},
    {"name": "Coral",   "code": "CORAL", "hex_code": "#f87171"},
    {"name": "Rust",    "code": "RUST",  "hex_code": "#b45309"},
    {"name": "Ivory",   "code": "IVORY", "hex_code": "#fffff0"},
    {"name": "Olive",   "code": "OLIVE", "hex_code": "#65a30d"},
    {"name": "Wine",    "code": "WINE",  "hex_code": "#722f37"},
]

VALUE_ADDITIONS = [
    # Roll-level VAs (fabric processing before cutting)
    {"name": "Embroidery",    "short_code": "EMB",  "applicable_to": "both",    "description": "Machine or hand embroidery work"},
    {"name": "Dying",         "short_code": "DYE",  "applicable_to": "roll",    "description": "Fabric dying / color treatment"},
    {"name": "Digital Print", "short_code": "DPT",  "applicable_to": "both",    "description": "Digital printing on fabric"},
    {"name": "Handwork",      "short_code": "HWK",  "applicable_to": "both",    "description": "Manual handwork / embellishment"},
    {"name": "Sequin Work",   "short_code": "SQN",  "applicable_to": "both",    "description": "Sequin application work"},
    {"name": "Batik",         "short_code": "BTC",  "applicable_to": "roll",    "description": "Batik dyeing technique"},
    # Garment-level VAs (post-cutting, during/after stitching)
    {"name": "Hand Stones",   "short_code": "HST",  "applicable_to": "garment", "description": "Decorative stones placed by hand"},
    {"name": "Button Work",   "short_code": "BTN",  "applicable_to": "garment", "description": "Button, hook, and fastener attachment"},
    {"name": "Lace Work",     "short_code": "LCW",  "applicable_to": "garment", "description": "Lace border and trim application"},
    {"name": "Finishing",     "short_code": "FIN",  "applicable_to": "garment", "description": "Final touch-ups, thread cutting, ironing"},
]


async def seed_data() -> None:
    """Insert essential master data: Product Types, Colors, Value Additions."""
    async with async_session_factory() as session:
        # --- Product Types ---
        result = await session.execute(select(ProductType))
        existing_pt = {pt.code for pt in result.scalars().all()}
        for pt in PRODUCT_TYPES:
            if pt["code"] in existing_pt:
                print(f"  ProductType '{pt['code']}' already exists — skipped")
                continue
            session.add(ProductType(**pt))
            print(f"  ProductType '{pt['code']}' ({pt['name']}) created")

        # --- Colors ---
        result = await session.execute(select(Color))
        existing_colors = {c.code for c in result.scalars().all()}
        for c in COLORS:
            if c["code"] in existing_colors:
                print(f"  Color '{c['code']}' already exists — skipped")
                continue
            session.add(Color(**c))
            print(f"  Color '{c['name']}' ({c['code']}) created")

        # --- Value Additions ---
        result = await session.execute(select(ValueAddition))
        existing_va = {va.short_code for va in result.scalars().all()}
        for va in VALUE_ADDITIONS:
            if va["short_code"] in existing_va:
                print(f"  ValueAddition '{va['short_code']}' already exists — skipped")
                continue
            session.add(ValueAddition(**va))
            print(f"  ValueAddition '{va['name']}' ({va['short_code']}) created")

        await session.commit()


if __name__ == "__main__":
    print("Seeding master data...")
    asyncio.run(seed_data())
    print("Done.")
