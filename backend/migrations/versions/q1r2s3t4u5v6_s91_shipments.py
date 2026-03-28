"""S91: Shipment + ShipmentItem tables, partially_shipped status, invoice.shipment_id, backfill."""

revision = "q1r2s3t4u5v6"
down_revision = "p0j1k2l3m4n5"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, constraint_exists, index_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. CREATE TABLE shipments
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.shipments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_no VARCHAR(50) NOT NULL,
                order_id UUID NOT NULL REFERENCES {s}.orders(id) ON DELETE RESTRICT,
                transport_id UUID REFERENCES {s}.transports(id) ON DELETE SET NULL,
                lr_number VARCHAR(50),
                lr_date TIMESTAMPTZ,
                eway_bill_no VARCHAR(50),
                eway_bill_date TIMESTAMPTZ,
                shipped_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                shipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                notes TEXT,
                invoice_id UUID,
                fy_id UUID REFERENCES {s}.financial_years(id) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_shipments_shipment_no UNIQUE (shipment_no)
            )
        """))
        # Indexes for shipments
        if not index_exists(conn, s, "ix_shipments_order_id"):
            conn.execute(text(f"CREATE INDEX ix_shipments_order_id ON {s}.shipments (order_id)"))
        if not index_exists(conn, s, "ix_shipments_fy_id"):
            conn.execute(text(f"CREATE INDEX ix_shipments_fy_id ON {s}.shipments (fy_id)"))

        # 2. CREATE TABLE shipment_items
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.shipment_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id UUID NOT NULL REFERENCES {s}.shipments(id) ON DELETE CASCADE,
                order_item_id UUID NOT NULL REFERENCES {s}.order_items(id) ON DELETE RESTRICT,
                sku_id UUID NOT NULL REFERENCES {s}.skus(id) ON DELETE RESTRICT,
                quantity INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        if not index_exists(conn, s, "ix_shipment_items_shipment_id"):
            conn.execute(text(f"CREATE INDEX ix_shipment_items_shipment_id ON {s}.shipment_items (shipment_id)"))
        if not index_exists(conn, s, "ix_shipment_items_order_item_id"):
            conn.execute(text(f"CREATE INDEX ix_shipment_items_order_item_id ON {s}.shipment_items (order_item_id)"))

        # 3. ALTER orders CHECK constraint — add partially_shipped
        # Drop old constraint (may have either name depending on when schema was created)
        conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT IF EXISTS ord_valid_status"))
        conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT IF EXISTS ck_orders_ord_valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.orders ADD CONSTRAINT ck_orders_ord_valid_status
            CHECK (status IN ('pending', 'confirmed', 'processing', 'partially_shipped', 'shipped', 'delivered', 'cancelled', 'returned'))
        """))

        # 4. ALTER invoices — add shipment_id FK
        if not col_exists(conn, s, "invoices", "shipment_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN shipment_id UUID"))
            conn.execute(text(f"""
                ALTER TABLE {s}.invoices ADD CONSTRAINT fk_invoices_shipment_id_shipments
                FOREIGN KEY (shipment_id) REFERENCES {s}.shipments(id) ON DELETE SET NULL
            """))
            conn.execute(text(f"CREATE INDEX ix_invoices_shipment_id ON {s}.invoices (shipment_id)"))

        # 5. Add invoice_id FK on shipments (now that invoices table has shipment_id)
        # We add it as a simple FK (not done in CREATE TABLE to avoid circular dependency with invoices)
        conn.execute(text(f"""
            DO $$ BEGIN
                ALTER TABLE {s}.shipments ADD CONSTRAINT fk_shipments_invoice_id_invoices
                FOREIGN KEY (invoice_id) REFERENCES {s}.invoices(id) ON DELETE SET NULL;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """))
        if not index_exists(conn, s, "ix_shipments_invoice_id"):
            conn.execute(text(f"CREATE INDEX ix_shipments_invoice_id ON {s}.shipments (invoice_id)"))

        # 6. Backfill: create 1 Shipment per existing shipped order
        conn.execute(text(f"""
            INSERT INTO {s}.shipments (id, shipment_no, order_id, transport_id, lr_number, lr_date, eway_bill_no, eway_bill_date, shipped_by, shipped_at, invoice_id, fy_id, created_at)
            SELECT
                gen_random_uuid(),
                'SHP-' || LPAD(ROW_NUMBER() OVER (ORDER BY o.created_at)::TEXT, 4, '0'),
                o.id,
                o.transport_id,
                o.lr_number,
                o.lr_date,
                o.eway_bill_no,
                o.eway_bill_date,
                o.created_by,
                o.updated_at,
                (SELECT i.id FROM {s}.invoices i WHERE i.order_id = o.id AND i.status IN ('draft','issued','paid') LIMIT 1),
                o.fy_id,
                COALESCE(o.updated_at, o.created_at)
            FROM {s}.orders o
            WHERE o.status IN ('shipped', 'delivered', 'returned')
            AND NOT EXISTS (SELECT 1 FROM {s}.shipments sh WHERE sh.order_id = o.id)
        """))

        # 7. Backfill shipment_items from order_items for backfilled shipments
        conn.execute(text(f"""
            INSERT INTO {s}.shipment_items (id, shipment_id, order_item_id, sku_id, quantity, created_at)
            SELECT
                gen_random_uuid(),
                sh.id,
                oi.id,
                oi.sku_id,
                oi.quantity,
                sh.created_at
            FROM {s}.shipments sh
            JOIN {s}.order_items oi ON oi.order_id = sh.order_id
            WHERE NOT EXISTS (
                SELECT 1 FROM {s}.shipment_items si WHERE si.shipment_id = sh.id AND si.order_item_id = oi.id
            )
        """))

        # 8. Backfill invoice.shipment_id for existing invoices linked to orders
        conn.execute(text(f"""
            UPDATE {s}.invoices inv
            SET shipment_id = sh.id
            FROM {s}.shipments sh
            WHERE inv.order_id = sh.order_id
            AND inv.shipment_id IS NULL
            AND sh.invoice_id = inv.id
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # Drop shipment_items first (FK to shipments)
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.shipment_items CASCADE"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.shipments CASCADE"))

        # Remove shipment_id from invoices
        if col_exists(conn, s, "invoices", "shipment_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN shipment_id"))

        # Restore old CHECK constraint
        if constraint_exists(conn, s, "ck_orders_ord_valid_status"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT ck_orders_ord_valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.orders ADD CONSTRAINT ck_orders_ord_valid_status
            CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'))
        """))
