"""S107: Add upi_id to public.companies for invoice payment QR.

UPI VPA stored on Company. Invoice print encodes UPI deep link
(upi://pay?pa=...&pn=...&am=...) into a QR code so customers can
scan and pay directly. Nullable — backwards compatible.

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "d4e5f6g7h8i9"
down_revision = "c3d4e5f6g7h8"
branch_labels = None
depends_on = None


def _col_exists(conn, schema: str, table: str, column: str) -> bool:
    result = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = :s AND table_name = :t AND column_name = :c"
    ), {"s": schema, "t": table, "c": column})
    return result.scalar() is not None


def upgrade():
    conn = op.get_bind()
    if not _col_exists(conn, "public", "companies", "upi_id"):
        op.add_column(
            "companies",
            sa.Column("upi_id", sa.String(length=100), nullable=True),
            schema="public",
        )


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "public", "companies", "upi_id"):
        op.drop_column("companies", "upi_id", schema="public")
