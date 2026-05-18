"""Initial schema with pgvector

Revision ID: 001
Revises: None
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ticker", sa.String(20), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("exchange", sa.String(20)),
        sa.Column("industry", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id")),
        sa.Column("title", sa.String(1000)),
        sa.Column("original_filename", sa.String(500)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("source_type", sa.String(50)),
        sa.Column("source_url", sa.Text),
        sa.Column("storage_public_id", sa.String(500)),
        sa.Column("storage_url", sa.Text),
        sa.Column("file_sha256", sa.String(64), index=True),
        sa.Column("report_type", sa.String(100)),
        sa.Column("report_period", sa.String(20)),
        sa.Column("fiscal_year", sa.Integer),
        sa.Column("fiscal_quarter", sa.Integer),
        sa.Column("language", sa.String(10), server_default="vi"),
        sa.Column("currency", sa.String(10), server_default="VND"),
        sa.Column("unit_scale", sa.String(20)),
        sa.Column("status", sa.String(50), nullable=False, server_default="uploaded", index=True),
        sa.Column("progress", sa.Integer, server_default="0"),
        sa.Column("current_step", sa.String(100)),
        sa.Column("error_message", sa.Text),
        sa.Column("total_chunks", sa.Integer, server_default="0"),
        sa.Column("processed_chunks", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "document_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer, nullable=False),
        sa.Column("text", sa.Text),
        sa.Column("ocr_used", sa.Boolean, server_default="false"),
        sa.Column("extraction_quality", sa.String(20)),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "financial_tables",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer),
        sa.Column("table_index", sa.Integer),
        sa.Column("title", sa.String(500)),
        sa.Column("raw_table_json", postgresql.JSONB),
        sa.Column("normalized_table_json", postgresql.JSONB),
        sa.Column("extraction_method", sa.String(50)),
        sa.Column("confidence", sa.Float),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "financial_facts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id")),
        sa.Column("statement_type", sa.String(100)),
        sa.Column("metric_name", sa.String(300), nullable=False, index=True),
        sa.Column("metric_alias", sa.String(300)),
        sa.Column("period", sa.String(20), index=True),
        sa.Column("value", sa.Float),
        sa.Column("currency", sa.String(10), server_default="VND"),
        sa.Column("unit_scale", sa.String(20)),
        sa.Column("source_table_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("financial_tables.id")),
        sa.Column("source_page", sa.Integer),
        sa.Column("confidence", sa.Float),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("chunk_type", sa.String(50)),
        sa.Column("section_title", sa.String(500)),
        sa.Column("page_start", sa.Integer),
        sa.Column("page_end", sa.Integer),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("financial_tables.id")),
        sa.Column("token_count", sa.Integer),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(768)")

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(500)),
        sa.Column("scope", sa.String(50)),
        sa.Column("scope_filter", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Index for vector similarity search
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding "
        "ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("document_chunks")
    op.drop_table("financial_facts")
    op.drop_table("financial_tables")
    op.drop_table("document_pages")
    op.drop_table("documents")
    op.drop_table("companies")
    op.execute("DROP EXTENSION IF EXISTS vector")
