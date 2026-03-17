"""s77_db_hardening

Full DB hardening for all tenant schemas:
- Add missing fy_id columns (S77 migration only touched public schema)
- ondelete rules on all FKs
- Missing indexes on FK columns + party masters
- CHECK constraints on 6 status columns
- Unique constraints on master names + lot_rolls

Revision ID: c6e9f4a3b2d1
Revises: b5d8e3f2a1c0
Create Date: 2026-03-17 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = 'c6e9f4a3b2d1'
down_revision: Union[str, None] = 'b5d8e3f2a1c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_tenant_schemas():
    conn = op.get_bind()
    rows = conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'co_%'"
    ))
    return [row[0] for row in rows]


def _col_exists(conn, schema, table, column):
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.columns "
        f"WHERE table_schema='{schema}' AND table_name='{table}' AND column_name='{column}'"
    ))
    return r.fetchone() is not None


def _constraint_exists(conn, schema, name):
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.table_constraints "
        f"WHERE constraint_schema='{schema}' AND constraint_name='{name}'"
    ))
    return r.fetchone() is not None


def _index_exists(conn, schema, name):
    r = conn.execute(text(
        f"SELECT 1 FROM pg_indexes WHERE schemaname='{schema}' AND indexname='{name}'"
    ))
    return r.fetchone() is not None


def _replace_fk(conn, s, table, col, ref_table, ondelete, ref_schema=None):
    fk_name = f"fk_{table}_{col}_{ref_table}"
    ref_full = f"{ref_schema}.{ref_table}" if ref_schema else f"{s}.{ref_table}"
    conn.execute(text(f'ALTER TABLE {s}.{table} DROP CONSTRAINT IF EXISTS {fk_name}'))
    conn.execute(text(
        f'ALTER TABLE {s}.{table} ADD CONSTRAINT {fk_name} '
        f'FOREIGN KEY ({col}) REFERENCES {ref_full} (id) ON DELETE {ondelete}'
    ))


def _apply_tenant(s):
    conn = op.get_bind()

    # =====================================================================
    # 0. ADD MISSING fy_id COLUMNS (S77 migration only touched default schema)
    # =====================================================================
    for table in ["lots", "batches", "job_challans", "batch_challans"]:
        if not _col_exists(conn, s, table, "fy_id"):
            conn.execute(text(f'ALTER TABLE {s}.{table} ADD COLUMN fy_id UUID'))
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS ix_{table}_fy_id ON {s}.{table} (fy_id)'))

    # =====================================================================
    # 1. ONDELETE RULES
    # =====================================================================
    # User FKs (nullable → SET NULL)
    for t, c in [
        ("rolls", "received_by"), ("lots", "created_by"),
        ("batches", "created_by"), ("batches", "checked_by"), ("batches", "packed_by"),
        ("batch_assignments", "checker_id"), ("batch_roll_consumption", "cut_by"),
        ("orders", "created_by"), ("invoices", "created_by"),
        ("inventory_events", "performed_by"), ("supplier_invoices", "received_by"),
    ]:
        _replace_fk(conn, s, t, c, "users", "SET NULL", ref_schema="public")

    # User FKs (non-nullable → RESTRICT)
    for t, c in [
        ("batch_assignments", "tailor_id"), ("batch_assignments", "assigned_by"),
        ("batch_challans", "created_by_id"), ("batch_processing", "created_by_id"),
        ("job_challans", "created_by_id"),
    ]:
        _replace_fk(conn, s, t, c, "users", "RESTRICT", ref_schema="public")

    # FY.closed_by → SET NULL
    _replace_fk(conn, s, "financial_years", "closed_by", "users", "SET NULL", ref_schema="public")

    # FY FKs (nullable → RESTRICT)
    for t in ["rolls", "lots", "batches", "orders", "invoices",
              "supplier_invoices", "ledger_entries", "job_challans", "batch_challans"]:
        if _col_exists(conn, s, t, "fy_id"):
            _replace_fk(conn, s, t, "fy_id", "financial_years", "RESTRICT")

    # Child tables (CASCADE)
    for t, c, r in [
        ("order_items", "order_id", "orders"),
        ("invoice_items", "invoice_id", "invoices"),
        ("batch_assignments", "batch_id", "batches"),
        ("batch_roll_consumption", "batch_id", "batches"),
        ("batch_processing", "batch_id", "batches"),
        ("batch_processing", "batch_challan_id", "batch_challans"),
    ]:
        _replace_fk(conn, s, t, c, r, "CASCADE")

    # Master references (RESTRICT)
    for t, c, r in [
        ("roll_processing", "roll_id", "rolls"),
        ("roll_processing", "value_addition_id", "value_additions"),
        ("roll_processing", "va_party_id", "va_parties"),
        ("roll_processing", "job_challan_id", "job_challans"),
        ("batch_roll_consumption", "roll_id", "rolls"),
        ("batch_challans", "va_party_id", "va_parties"),
        ("batch_challans", "value_addition_id", "value_additions"),
        ("batch_processing", "value_addition_id", "value_additions"),
        ("job_challans", "va_party_id", "va_parties"),
        ("job_challans", "value_addition_id", "value_additions"),
        ("lots", "sku_id", "skus"),
        ("batches", "sku_id", "skus"),
        ("orders", "customer_id", "customers"),
        ("order_items", "sku_id", "skus"),
        ("invoices", "order_id", "orders"),
        ("invoice_items", "sku_id", "skus"),
        ("invoice_items", "batch_id", "batches"),
        ("inventory_events", "sku_id", "skus"),
        ("inventory_events", "roll_id", "rolls"),
        ("inventory_state", "sku_id", "skus"),
        ("reservations", "sku_id", "skus"),
        ("reservations", "order_id", "orders"),
        ("supplier_invoices", "supplier_id", "suppliers"),
    ]:
        _replace_fk(conn, s, t, c, r, "RESTRICT")

    # =====================================================================
    # 2. INDEXES
    # =====================================================================
    for idx, t, c in [
        ("ix_roll_processing_value_addition_id", "roll_processing", "value_addition_id"),
        ("ix_roll_processing_status", "roll_processing", "status"),
        ("ix_batch_assignments_checker_id", "batch_assignments", "checker_id"),
        ("ix_batch_assignments_assigned_by", "batch_assignments", "assigned_by"),
        ("ix_batch_roll_consumption_cut_by", "batch_roll_consumption", "cut_by"),
        ("ix_invoices_status", "invoices", "status"),
        ("ix_invoice_items_sku_id", "invoice_items", "sku_id"),
        ("ix_invoice_items_batch_id", "invoice_items", "batch_id"),
        ("ix_inventory_events_performed_by", "inventory_events", "performed_by"),
        ("ix_reservations_order_id", "reservations", "order_id"),
        ("ix_financial_years_is_current", "financial_years", "is_current"),
        ("ix_suppliers_name", "suppliers", "name"),
        ("ix_suppliers_gst_no", "suppliers", "gst_no"),
        ("ix_customers_name", "customers", "name"),
        ("ix_customers_gst_no", "customers", "gst_no"),
        ("ix_va_parties_name", "va_parties", "name"),
    ]:
        if not _index_exists(conn, s, idx):
            conn.execute(text(f'CREATE INDEX {idx} ON {s}.{t} ({c})'))

    # =====================================================================
    # 3. CHECK CONSTRAINTS
    # =====================================================================
    for t, name, expr in [
        ("roll_processing", "rp_valid_status", "status IN ('sent', 'received')"),
        ("batch_processing", "bp_valid_status", "status IN ('sent', 'received')"),
        ("orders", "ord_valid_status", "status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')"),
        ("invoices", "inv_valid_status", "status IN ('draft', 'issued', 'paid', 'cancelled')"),
        ("reservations", "res_valid_status", "status IN ('reserved', 'confirmed', 'released', 'cancelled', 'expired')"),
        ("financial_years", "fy_valid_status", "status IN ('open', 'closed')"),
    ]:
        if not _constraint_exists(conn, s, name):
            conn.execute(text(f'ALTER TABLE {s}.{t} ADD CONSTRAINT {name} CHECK ({expr})'))

    # =====================================================================
    # 4. UNIQUE CONSTRAINTS
    # =====================================================================
    for t, name, cols in [
        ("colors", "uq_colors_name", "name"),
        ("fabrics", "uq_fabrics_name", "name"),
        ("product_types", "uq_product_types_name", "name"),
        ("value_additions", "uq_value_additions_name", "name"),
        ("lot_rolls", "uq_lot_rolls_lot_roll", "lot_id, roll_id"),
    ]:
        if not _constraint_exists(conn, s, name):
            conn.execute(text(f'ALTER TABLE {s}.{t} ADD CONSTRAINT {name} UNIQUE ({cols})'))


def upgrade() -> None:
    conn = op.get_bind()

    # === PUBLIC SCHEMA ===
    conn.execute(text('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS fk_users_role_id_roles'))
    conn.execute(text(
        'ALTER TABLE public.users ADD CONSTRAINT fk_users_role_id_roles '
        'FOREIGN KEY (role_id) REFERENCES public.roles (id) ON DELETE SET NULL'
    ))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_users_role_id ON public.users (role_id)'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_user_companies_user_id ON public.user_companies (user_id)'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_user_companies_company_id ON public.user_companies (company_id)'))

    # === TENANT SCHEMAS ===
    for schema in _get_tenant_schemas():
        _apply_tenant(schema)


def downgrade() -> None:
    conn = op.get_bind()
    for schema in _get_tenant_schemas():
        for t, name in [
            ("roll_processing", "rp_valid_status"), ("batch_processing", "bp_valid_status"),
            ("orders", "ord_valid_status"), ("invoices", "inv_valid_status"),
            ("reservations", "res_valid_status"), ("financial_years", "fy_valid_status"),
            ("colors", "uq_colors_name"), ("fabrics", "uq_fabrics_name"),
            ("product_types", "uq_product_types_name"), ("value_additions", "uq_value_additions_name"),
            ("lot_rolls", "uq_lot_rolls_lot_roll"),
        ]:
            conn.execute(text(f'ALTER TABLE {schema}.{t} DROP CONSTRAINT IF EXISTS {name}'))
