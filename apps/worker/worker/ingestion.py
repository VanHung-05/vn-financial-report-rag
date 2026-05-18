"""Main ingestion pipeline: download, parse, chunk, embed, store."""
import hashlib
import json
import logging
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

import httpx
from sqlalchemy import update
from sqlalchemy.orm import Session

from worker.config import settings
from worker.database import SessionLocal
from worker.parsers import parse_pdf, parse_excel, parse_text, parse_docx, parse_html
from worker.chunker import chunk_pages
from worker.embedder import embed_texts

logger = logging.getLogger(__name__)

MIME_TO_PARSER = {
    "application/pdf": parse_pdf,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": parse_excel,
    "application/vnd.ms-excel": parse_excel,
    "text/csv": parse_excel,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": parse_docx,
    "text/plain": parse_text,
    "text/html": parse_html,
}

EXT_TO_PARSER = {
    ".pdf": parse_pdf,
    ".xlsx": parse_excel,
    ".xls": parse_excel,
    ".csv": parse_excel,
    ".docx": parse_docx,
    ".txt": parse_text,
    ".html": parse_html,
    ".htm": parse_html,
}


def _update_status(db: Session, doc_id: str, status: str, step: str, progress: int, error: str | None = None):
    from sqlalchemy import text as sa_text
    db.execute(
        sa_text(
            "UPDATE documents SET status=:status, current_step=:step, progress=:progress, "
            "error_message=:error, updated_at=now() WHERE id=:id"
        ),
        {"status": status, "step": step, "progress": progress, "error": error, "id": doc_id},
    )
    db.commit()


def process_document(document_id: str | UUID):
    """Main ingestion job: called by RQ worker."""
    document_id = str(document_id)
    db = SessionLocal()
    try:
        _run_ingestion(db, document_id)
    except Exception as e:
        logger.exception(f"Ingestion failed for {document_id}")
        _update_status(db, document_id, "failed", "error", 0, str(e)[:2000])
    finally:
        db.close()


def _run_ingestion(db: Session, document_id: str):
    from sqlalchemy import text as sa_text

    row = db.execute(
        sa_text("SELECT id, source_url, storage_url, mime_type, original_filename, "
                "company_id, fiscal_year, fiscal_quarter, report_type, report_period "
                "FROM documents WHERE id=:id"),
        {"id": document_id},
    ).mappings().first()

    if not row:
        raise ValueError(f"Document {document_id} not found")

    # Re-run safe: drop prior extraction for this document
    db.execute(
        sa_text("DELETE FROM document_chunks WHERE document_id=:id"),
        {"id": document_id},
    )
    db.execute(
        sa_text("DELETE FROM document_pages WHERE document_id=:id"),
        {"id": document_id},
    )
    db.commit()

    _update_status(db, document_id, "downloading", "downloading", 5)

    # Download file
    download_url = row["storage_url"] or row["source_url"]
    if not download_url:
        raise ValueError("No download URL available")

    with tempfile.NamedTemporaryFile(suffix=Path(row["original_filename"] or "file").suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            resp = client.get(download_url)
            resp.raise_for_status()
            tmp.write(resp.content)

    # Compute SHA-256
    sha256 = hashlib.sha256(tmp_path.read_bytes()).hexdigest()
    db.execute(
        sa_text("UPDATE documents SET file_sha256=:sha WHERE id=:id"),
        {"sha": sha256, "id": document_id},
    )
    db.commit()

    # Determine parser
    _update_status(db, document_id, "extracting_text", "extracting_text", 15)
    ext = tmp_path.suffix.lower()
    parser = EXT_TO_PARSER.get(ext)
    if not parser and row["mime_type"]:
        parser = MIME_TO_PARSER.get(row["mime_type"])
    if not parser:
        raise ValueError(f"No parser for extension={ext} mime={row['mime_type']}")

    # Parse
    pages = parser(tmp_path)
    tmp_path.unlink(missing_ok=True)

    # Store pages
    _update_status(db, document_id, "extracting_text", "storing_pages", 30)
    for page_data in pages:
        page_id = str(uuid.uuid4())
        text = page_data.get("text") or ""
        ocr_used = bool(page_data.get("ocr_used"))
        if ocr_used and text.strip():
            quality = "ocr"
        elif text.strip():
            quality = "text_ok"
        else:
            quality = "empty"
        db.execute(
            sa_text(
                "INSERT INTO document_pages (id, document_id, page_number, text, ocr_used, extraction_quality) "
                "VALUES (:id, :doc_id, :page, :text, :ocr, :quality)"
            ),
            {
                "id": page_id,
                "doc_id": document_id,
                "page": page_data["page"],
                "text": text,
                "ocr": ocr_used,
                "quality": quality,
            },
        )
    db.commit()

    # Chunk
    _update_status(db, document_id, "chunking", "chunking", 50)
    doc_metadata = {
        "document_id": str(document_id),
        "company_id": str(row["company_id"]) if row["company_id"] else None,
        "fiscal_year": row["fiscal_year"],
        "fiscal_quarter": row["fiscal_quarter"],
        "report_type": row["report_type"],
        "report_period": row["report_period"],
    }
    chunks = chunk_pages(pages, doc_metadata)

    total_chunks = len(chunks)
    db.execute(
        sa_text("UPDATE documents SET total_chunks=:tc WHERE id=:id"),
        {"tc": total_chunks, "id": document_id},
    )
    db.commit()

    if not chunks:
        _update_status(
            db,
            document_id,
            "ready",
            "complete",
            100,
            "Không trích xuất được text (PDF scan?). Cài tesseract-lang và bật OCR_ENABLED.",
        )
        return

    # Embed
    _update_status(db, document_id, "embedding", "embedding", 65)
    texts = [c["content"] for c in chunks]

    try:
        embeddings = embed_texts(texts)
    except Exception as e:
        logger.warning("Ollama embedding failed (is Ollama running? ollama pull %s): %s",
                       settings.embedding_model, e)
        embeddings = [None] * len(texts)

    # Store chunks
    _update_status(db, document_id, "indexed", "storing_chunks", 85)
    for i, chunk in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        emb = embeddings[i] if embeddings[i] else None
        emb_str = f"[{','.join(str(x) for x in emb)}]" if emb else None

        params = {
            "id": chunk_id,
            "doc_id": document_id,
            "idx": chunk["chunk_index"],
            "content": chunk["content"],
            "ctype": chunk["chunk_type"],
            "section": chunk.get("section_title"),
            "ps": chunk.get("page_start"),
            "pe": chunk.get("page_end"),
            "tc": chunk.get("token_count"),
            "meta": json.dumps(chunk.get("metadata") or {}, default=str),
        }
        if emb_str:
            sql = (
                "INSERT INTO document_chunks "
                "(id, document_id, chunk_index, content, chunk_type, section_title, "
                "page_start, page_end, token_count, metadata, embedding) "
                "VALUES (:id, :doc_id, :idx, :content, :ctype, :section, "
                ":ps, :pe, :tc, CAST(:meta AS jsonb), CAST(:emb AS vector))"
            )
            params["emb"] = emb_str
        else:
            sql = (
                "INSERT INTO document_chunks "
                "(id, document_id, chunk_index, content, chunk_type, section_title, "
                "page_start, page_end, token_count, metadata, embedding) "
                "VALUES (:id, :doc_id, :idx, :content, :ctype, :section, "
                ":ps, :pe, :tc, CAST(:meta AS jsonb), NULL)"
            )
        db.execute(sa_text(sql), params)

    db.execute(
        sa_text("UPDATE documents SET processed_chunks=:pc WHERE id=:id"),
        {"pc": total_chunks, "id": document_id},
    )
    db.commit()

    # Mark ready
    _update_status(db, document_id, "ready", "complete", 100)
    logger.info(f"Document {document_id} ingestion complete: {total_chunks} chunks")
