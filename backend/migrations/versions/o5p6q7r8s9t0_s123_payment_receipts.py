"""S123: Payment Receipts + Allocations + invoice.amount_paid.

Phase 1 of PAYMENTS_AND_ALLOCATIONS_PLAN — backend foundation for the
Tally-style bill-wise receipt voucher.

Schema changes (per tenant schema co_*):
  + payment_receipts table         (Tally Receipt Voucher header)
  + payment_allocations table      (bill-wise allocation lines)
  invoices
    + amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0
    extend status CHECK to allow 'partially_paid'

Backfill:
  None. Production has 0 paid invoices (verified 2026-04-27 RDS query) so
  there are no S119 historical payments to synthesise. New `amount_paid`
  column lands with server_default '0'; existing rows therefore start at 0
  consistent with their status (all 'issued' or 'cancelled').

Idempotent. Safe round-trip (downgrade reverses cleanly).

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import (
    col_exists,
    constraint_exists,
    get_tenant_schemas,
    index_exists,
)

revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def _table_exists(conn, schema: str, table: str) -> bool:
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.tables "
        f"WHERE table_schema='{schema}' AND table_name='{table}'"
    ))
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. invoices.amount_paid — default 0, NOT NULL, idempotent
        if not col_exists(conn, s, "invoices", "amount_paid"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices "
                f"ADD COLUMN amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0"
            ))

        # 2. Extend invoices status check to include 'partially_paid'.
        # Per ck_-prefix memory: drop BOTH the prefixed and unprefixed names
        # so older schemas (pre-naming-convention) get cleaned up too.
        conn.execute(text(
            f"ALTER TABLE {s}.invoices DROP CONSTRAINT IF EXISTS ck_invoices_inv_valid_status"
        ))
        conn.execute(text(
            f"ALTER TABLE {s}.invoices DROP CONSTRAINT IF EXISTS inv_valid_status"
        ))
        conn.execute(text(f"""
            ALTER TABLE {s}.invoices ADD CONSTRAINT ck_invoices_inv_valid_status
            CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled'))
        """))

        # 3. CREATE TABLE payment_receipts
        if not _table_exists(conn, s, "payment_receipts"):
            conn.execute(text(f"""
                CREATE TABLE {s}.payment_receipts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    receipt_no VARCHAR(50) NOT NULL,
                    party_type VARCHAR(20) NOT NULL,
                    party_id UUID NOT NULL,
                    payment_date DATE NOT NULL,
                    payment_mode VARCHAR(20) NOT NULL,
                    reference_no VARCHAR(100),
                    amount NUMERIC(12, 2) NOT NULL,
                    tds_applicable BOOLEAN NOT NULL DEFAULT false,
                    tds_rate NUMERIC(5, 2),
                    tds_section VARCHAR(10),
                    tds_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                    tcs_applicable BOOLEAN NOT NULL DEFAULT false,
                    tcs_rate NUMERIC(5, 2),
                    tcs_section VARCHAR(10),
                    tcs_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                    on_account_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                    notes TEXT,
                    fy_id UUID REFERENCES {s}.financial_years(id) ON DELETE RESTRICT,
                    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_payment_receipts_receipt_no UNIQUE (receipt_no),
                    CONSTRAINT pr_valid_party_type
                        CHECK (party_type IN ('customer', 'supplier', 'va_party')),
                    CONSTRAINT pr_amount_positive CHECK (amount > 0)
                )
            """))

        if not index_exists(conn, s, "ix_payment_receipts_receipt_no"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_receipt_no "
                f"ON {s}.payment_receipts (receipt_no)"
            ))
        if not index_exists(conn, s, "ix_payment_receipts_party_type"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_party_type "
                f"ON {s}.payment_receipts (party_type)"
            ))
        if not index_exists(conn, s, "ix_payment_receipts_party_id"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_party_id "
                f"ON {s}.payment_receipts (party_id)"
            ))
        if not index_exists(conn, s, "ix_payment_receipts_fy_id"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_fy_id "
                f"ON {s}.payment_receipts (fy_id)"
            ))
        if not index_exists(conn, s, "ix_payment_receipts_created_by"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_created_by "
                f"ON {s}.payment_receipts (created_by)"
            ))

        # 4. CREATE TABLE payment_allocations
        if not _table_exists(conn, s, "payment_allocations"):
            conn.execute(text(f"""
                CREATE TABLE {s}.payment_allocations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    payment_receipt_id UUID NOT NULL
                        REFERENCES {s}.payment_receipts(id) ON DELETE CASCADE,
                    invoice_id UUID NOT NULL
                        REFERENCES {s}.invoices(id) ON DELETE RESTRICT,
                    amount_applied NUMERIC(12, 2) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT pa_amount_positive CHECK (amount_applied > 0)
                )
            """))

        if not index_exists(conn, s, "ix_payment_allocations_payment_receipt_id"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_allocations_payment_receipt_id "
                f"ON {s}.payment_allocations (payment_receipt_id)"
            ))
        if not index_exists(conn, s, "ix_payment_allocations_invoice_id"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_allocations_invoice_id "
                f"ON {s}.payment_allocations (invoice_id)"
            ))
        if not index_exists(conn, s, "ix_pa_receipt_invoice"):
            conn.execute(text(
                f"CREATE INDEX ix_pa_receipt_invoice "
                f"ON {s}.payment_allocations (payment_receipt_id, invoice_id)"
            ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # Drop allocations first (FK → receipts)
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.payment_allocations CASCADE"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.payment_receipts CASCADE"))

        # Restore invoice status check to pre-S123 form
        if constraint_exists(conn, s, "ck_invoices_inv_valid_status"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices DROP CONSTRAINT ck_invoices_inv_valid_status"
            ))
        # If any partially_paid rows exist (shouldn't in fresh prod), demote
        # them to 'issued' before re-adding the narrower check.
        conn.execute(text(
            f"UPDATE {s}.invoices SET status = 'issued' WHERE status = 'partially_paid'"
        ))
        conn.execute(text(f"""
            ALTER TABLE {s}.invoices ADD CONSTRAINT ck_invoices_inv_valid_status
            CHECK (status IN ('draft', 'issued', 'paid', 'cancelled'))
        """))

        # Drop amount_paid
        if col_exists(conn, s, "invoices", "amount_paid"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN amount_paid"))
