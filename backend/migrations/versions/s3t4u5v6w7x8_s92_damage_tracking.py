"""S92: Add damage tracking fields to roll_processing and batch_processing."""

revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # Roll processing: weight_damaged + damage_reason
        if not col_exists(conn, s, 'roll_processing', 'weight_damaged'):
            conn.execute(text(
                f"ALTER TABLE {s}.roll_processing ADD COLUMN weight_damaged NUMERIC(10,3)"
            ))
        if not col_exists(conn, s, 'roll_processing', 'damage_reason'):
            conn.execute(text(
                f"ALTER TABLE {s}.roll_processing ADD COLUMN damage_reason VARCHAR(50)"
            ))

        # Batch processing: pieces_damaged + damage_reason
        if not col_exists(conn, s, 'batch_processing', 'pieces_damaged'):
            conn.execute(text(
                f"ALTER TABLE {s}.batch_processing ADD COLUMN pieces_damaged INTEGER"
            ))
        if not col_exists(conn, s, 'batch_processing', 'damage_reason'):
            conn.execute(text(
                f"ALTER TABLE {s}.batch_processing ADD COLUMN damage_reason VARCHAR(50)"
            ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if col_exists(conn, s, 'roll_processing', 'weight_damaged'):
            conn.execute(text(f"ALTER TABLE {s}.roll_processing DROP COLUMN weight_damaged"))
        if col_exists(conn, s, 'roll_processing', 'damage_reason'):
            conn.execute(text(f"ALTER TABLE {s}.roll_processing DROP COLUMN damage_reason"))
        if col_exists(conn, s, 'batch_processing', 'pieces_damaged'):
            conn.execute(text(f"ALTER TABLE {s}.batch_processing DROP COLUMN pieces_damaged"))
        if col_exists(conn, s, 'batch_processing', 'damage_reason'):
            conn.execute(text(f"ALTER TABLE {s}.batch_processing DROP COLUMN damage_reason"))
