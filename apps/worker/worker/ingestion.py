"""Main ingestion pipeline: download, parse, chunk, embed, store."""
import hashlib
import json
import logging
import tempfile
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse
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

# Reverse map: Content-Type → extension
_MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "text/csv": ".csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/html": ".html",
}


def _infer_extension(original_filename: str | None, url: str | None) -> str:
    """Infer file extension from original_filename or URL.

    Returns extension like '.pdf' or '' if unknown.
    """
    # 1) From original_filename
    if original_filename:
        ext = Path(original_filename).suffix.lower()
        if ext and ext in EXT_TO_PARSER:
            return ext

    # 2) From URL path (handles URL-encoded paths like QUY%201/FPT_xxx.pdf)
    if url:
        parsed = urlparse(url)
        path = unquote(parsed.path)  # Decode %20, %25 etc.
        ext = Path(path).suffix.lower()
        if ext and ext in EXT_TO_PARSER:
            return ext

    return ""


def _mime_to_ext(content_type: str) -> str:
    """Convert a Content-Type string to a file extension."""
    return _MIME_TO_EXT.get(content_type.lower(), "")


def _infer_filename_from_url(url: str) -> str | None:
    """Extract a meaningful filename from a URL path."""
    parsed = urlparse(url)
    path = unquote(parsed.path)
    name = Path(path).name
    if name and len(name) > 3 and "." in name:
        return name
    return None


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
    db.execute(
        sa_text("DELETE FROM financial_facts WHERE document_id=:id"),
        {"id": document_id},
    )
    db.commit()

    _update_status(db, document_id, "downloading", "downloading", 5)

    # Determine file source: local path or remote URL
    download_url = row["storage_url"] or row["source_url"]
    if not download_url:
        raise ValueError("No download URL and no storage path available")

    # Check if storage_url is a local file path (from file upload)
    local_path = Path(download_url) if not download_url.startswith(("http://", "https://")) else None

    if local_path and local_path.exists():
        # --- Local file upload: use file directly ---
        logger.info("Using local file: %s", local_path.name)
        ext = _infer_extension(row["original_filename"], str(local_path))

        # Copy to temp file (so we can safely delete later without losing the upload)
        import shutil
        with tempfile.NamedTemporaryFile(suffix=ext or local_path.suffix or ".pdf", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        shutil.copy2(local_path, tmp_path)

    else:
        # --- Remote URL: download via HTTP ---
        ext = _infer_extension(row["original_filename"], download_url)

        with tempfile.NamedTemporaryFile(suffix=ext or ".pdf", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            with httpx.Client(timeout=120, follow_redirects=True) as client:
                resp = client.get(download_url)
                resp.raise_for_status()
                tmp.write(resp.content)

                # If still no extension, try Content-Type header
                if not ext:
                    content_type = resp.headers.get("content-type", "").split(";")[0].strip()
                    ext = _mime_to_ext(content_type)
                    if ext:
                        new_path = tmp_path.with_suffix(ext)
                        tmp_path.rename(new_path)
                        tmp_path = new_path
                    if content_type:
                        db.execute(
                            sa_text("UPDATE documents SET mime_type=:mime WHERE id=:id AND mime_type IS NULL"),
                            {"mime": content_type, "id": document_id},
                        )

        # Update original_filename in DB if missing (inferred from URL)
        if not row["original_filename"] and download_url:
            inferred_name = _infer_filename_from_url(download_url)
            if inferred_name:
                db.execute(
                    sa_text("UPDATE documents SET original_filename=:fname WHERE id=:id AND original_filename IS NULL"),
                    {"fname": inferred_name, "id": document_id},
                )

    # Compute SHA-256
    sha256 = hashlib.sha256(tmp_path.read_bytes()).hexdigest()
    db.execute(
        sa_text("UPDATE documents SET file_sha256=:sha WHERE id=:id"),
        {"sha": sha256, "id": document_id},
    )
    db.commit()

    # --- Dedupe: check if another document with the same SHA-256 is already ready ---
    dup_row = db.execute(
        sa_text(
            "SELECT id, title, status FROM documents "
            "WHERE file_sha256=:sha AND id!=:current_id AND status='ready' "
            "LIMIT 1"
        ),
        {"sha": sha256, "current_id": document_id},
    ).mappings().first()

    if dup_row:
        tmp_path.unlink(missing_ok=True)
        dup_id = str(dup_row["id"])
        dup_title = dup_row["title"] or dup_id[:8]
        msg = (
            f"Trùng nội dung với document đã index: {dup_title} "
            f"(id: {dup_id}, SHA-256 match). Bỏ qua xử lý."
        )
        logger.info("Duplicate detected for %s: matches %s", document_id, dup_id)
        _update_status(db, document_id, "failed", "duplicate", 0, msg)
        return

    # Determine parser
    _update_status(db, document_id, "extracting_text", "extracting_text", 15)
    ext = tmp_path.suffix.lower()
    parser = EXT_TO_PARSER.get(ext)
    if not parser and row["mime_type"]:
        parser = MIME_TO_PARSER.get(row["mime_type"])
    # Last resort: try Content-Type from response
    if not parser:
        content_type = resp.headers.get("content-type", "").split(";")[0].strip() if 'resp' in dir() else ""
        parser = MIME_TO_PARSER.get(content_type)
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

    # Extract & Store financial facts
    _update_status(db, document_id, "normalizing_financial_data", "extracting_financial_facts", 90)
    try:
        import asyncio
        from worker.parsers.financial_extractor import extract_financial_facts

        # Helper to run async in sync
        def run_async(coro):
            try:
                return asyncio.run(coro)
            except RuntimeError:
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                return loop.run_until_complete(coro)

        ticker = None
        if row["company_id"]:
            company_row = db.execute(
                sa_text("SELECT ticker FROM companies WHERE id=:cid"),
                {"cid": row["company_id"]}
            ).mappings().first()
            if company_row:
                ticker = company_row["ticker"]

        doc_meta = {
            "ticker": ticker,
            "fiscal_year": row["fiscal_year"],
            "fiscal_quarter": row["fiscal_quarter"],
        }

        facts = run_async(extract_financial_facts(pages, doc_meta))
        for fact in facts:
            metric_name = fact.get("metric_name")
            value = fact.get("value")
            if not metric_name or value is None:
                continue

            db.execute(
                sa_text(
                    "INSERT INTO financial_facts "
                    "(id, document_id, company_id, statement_type, metric_name, metric_alias, "
                    "period, value, currency, unit_scale, source_page, confidence) "
                    "VALUES (gen_random_uuid(), :doc_id, :company_id, :stype, :mname, :malias, "
                    ":period, :val, :curr, :scale, :page, :conf)"
                ),
                {
                    "doc_id": document_id,
                    "company_id": row["company_id"],
                    "stype": fact.get("statement_type"),
                    "mname": metric_name,
                    "malias": fact.get("metric_alias"),
                    "period": fact.get("period") or row["report_period"] or f"{row['fiscal_year']}",
                    "val": float(value),
                    "curr": fact.get("currency") or "VND",
                    "scale": fact.get("unit_scale") or "VND",
                    "page": fact.get("source_page"),
                    "conf": 0.9,
                }
            )
        db.commit()
    except Exception as e:
        logger.exception("Failed to extract or store financial facts: %s", e)

    # Mark ready
    _update_status(db, document_id, "ready", "complete", 100)
    logger.info(f"Document {document_id} ingestion complete: {total_chunks} chunks")
