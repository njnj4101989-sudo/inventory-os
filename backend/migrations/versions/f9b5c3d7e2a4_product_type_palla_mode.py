"""Add palla_mode to product_types + update to 4 product types

- Add palla_mode column (weight/meter/both) to product_types
- Update existing product types: BLS→FBL (Fancy Blouse, meter),
  KRT→SBL (Stretchable Blouse, weight), SAR stays (meter),
  DRS→LHG (Lehenga, both), OTH deactivated

Revision ID: f9b5c3d7e2a4
Revises: e8a4b2c6d9f1
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


revision = "f9b5c3d7e2a4"
down_revision = "e8a4b2c6d9f1"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # 1. Add palla_mode column
        if not col_exists(conn, s, "product_types", "palla_mode"):
            conn.execute(text(
                f"ALTER TABLE {s}.product_types ADD COLUMN palla_mode VARCHAR(10) DEFAULT 'weight' NOT NULL"
            ))

        # 2. Update existing product types to new codes/names/modes
        # BLS → FBL (Fancy Blouse, meter)
        conn.execute(text(
            f"UPDATE {s}.product_types SET code='FBL', name='Fancy Blouse', "
            f"description='Fancy blouse designs (meter rolls)', palla_mode='meter' "
            f"WHERE code='BLS'"
        ))
        # KRT → SBL (Stretchable Blouse, weight)
        conn.execute(text(
            f"UPDATE {s}.product_types SET code='SBL', name='Stretchable Blouse', "
            f"description='Stretchable blouse designs (weight rolls)', palla_mode='weight' "
            f"WHERE code='KRT'"
        ))
        # SAR stays SAR (meter)
        conn.execute(text(
            f"UPDATE {s}.product_types SET palla_mode='meter', "
            f"description='Saree pieces (meter rolls)' "
            f"WHERE code='SAR'"
        ))
        # DRS → LHG (Lehenga, both)
        conn.execute(text(
            f"UPDATE {s}.product_types SET code='LHG', name='Lehenga', "
            f"description='Lehenga designs (weight or meter)', palla_mode='both' "
            f"WHERE code='DRS'"
        ))
        # OTH → deactivate
        conn.execute(text(
            f"UPDATE {s}.product_types SET is_active=false WHERE code='OTH'"
        ))

        # 3. Update lot codes that reference old product type codes
        conn.execute(text(f"UPDATE {s}.lots SET product_type='FBL' WHERE product_type='BLS'"))
        conn.execute(text(f"UPDATE {s}.lots SET product_type='SBL' WHERE product_type='KRT'"))
        conn.execute(text(f"UPDATE {s}.lots SET product_type='LHG' WHERE product_type='DRS'"))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Reverse product type changes
        conn.execute(text(f"UPDATE {s}.product_types SET code='BLS', name='Blouse', palla_mode='weight' WHERE code='FBL'"))
        conn.execute(text(f"UPDATE {s}.product_types SET code='KRT', name='Kurti', palla_mode='weight' WHERE code='SBL'"))
        conn.execute(text(f"UPDATE {s}.product_types SET code='DRS', name='Dress', palla_mode='weight' WHERE code='LHG'"))
        conn.execute(text(f"UPDATE {s}.product_types SET is_active=true WHERE code='OTH'"))

        # Reverse lot codes
        conn.execute(text(f"UPDATE {s}.lots SET product_type='BLS' WHERE product_type='FBL'"))
        conn.execute(text(f"UPDATE {s}.lots SET product_type='KRT' WHERE product_type='SBL'"))
        conn.execute(text(f"UPDATE {s}.lots SET product_type='DRS' WHERE product_type='LHG'"))

        # Drop column
        conn.execute(text(f"ALTER TABLE {s}.product_types DROP COLUMN IF EXISTS palla_mode"))
