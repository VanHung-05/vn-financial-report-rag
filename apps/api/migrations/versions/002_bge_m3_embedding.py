"""Change embedding dimensions from 768 (nomic-embed-text) to 1024 (bge-m3)

Revision ID: 002
Revises: 001
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old ivfflat index (dimension-dependent)
    op.execute("DROP INDEX IF EXISTS idx_document_chunks_embedding")

    # Clear old embeddings (incompatible dimensions, need re-embedding)
    op.execute("UPDATE document_chunks SET embedding = NULL")

    # Change vector column from 768 to 1024 dimensions
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024)")

    # Recreate ivfflat index with new dimensions
    # Use lists=100 for good recall; requires >= 100 rows to build
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_document_chunks_embedding")
    op.execute("UPDATE document_chunks SET embedding = NULL")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
