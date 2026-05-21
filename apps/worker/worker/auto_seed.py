"""Auto-seed: automatically download and index reports from manifest on first startup."""
import json
import logging
import time
import uuid
from pathlib import Path

from redis import Redis
from rq import Queue
from sqlalchemy import text as sa_text

from worker.config import settings
from worker.database import SessionLocal

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MANIFEST_DIRS = [
    Path(__file__).parent.parent / "samples" / "manifests",  # Docker: /app/samples/manifests
    _REPO_ROOT / "samples" / "manifests",
]


def _find_manifest(manifest_name: str) -> Path | None:
    for base in _MANIFEST_DIRS:
        path = base / manifest_name
        if path.exists():
            return path
    return None


def should_auto_seed() -> bool:
    if not settings.auto_seed_enabled:
        return False
    db = SessionLocal()
    try:
        result = db.execute(sa_text("SELECT COUNT(*) FROM documents")).scalar()
        return result == 0
    except Exception:
        return False
    finally:
        db.close()


def auto_seed():
    """Enqueue ingestion jobs from manifest when DB is empty."""
    if not settings.auto_seed_enabled:
        logger.info("AUTO_SEED_ENABLED=false, skipping auto-seed")
        return

    if not should_auto_seed():
        logger.info("Database already has documents, skipping auto-seed")
        return

    manifest_path = _find_manifest(settings.auto_seed_manifest)
    if not manifest_path:
        logger.warning(
            "Manifest %s not found, skipping auto-seed",
            settings.auto_seed_manifest,
        )
        return

    records = []
    with manifest_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    limit = settings.auto_seed_limit
    if limit and limit > 0:
        records = records[:limit]

    logger.info(
        "Auto-seed from %s: enqueuing %s report(s) (limit=%s)",
        manifest_path.name,
        len(records),
        limit if limit and limit > 0 else "none",
    )

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("ingestion", connection=redis_conn)
    db = SessionLocal()

    created = 0
    try:
        for i, record in enumerate(records):
            source_url = record.get("source_url")
            if not source_url:
                continue

            # --- Dedupe: skip if source_url already exists ---
            url_exists = db.execute(
                sa_text("SELECT id FROM documents WHERE source_url=:url LIMIT 1"),
                {"url": source_url},
            ).first()
            if url_exists:
                logger.debug("Auto-seed skip (URL duplicate): %s", record.get("ticker"))
                continue

            # --- Dedupe: skip if file_sha256 already exists ---
            file_sha256 = record.get("file_sha256")
            if file_sha256:
                sha_exists = db.execute(
                    sa_text("SELECT id FROM documents WHERE file_sha256=:sha LIMIT 1"),
                    {"sha": file_sha256},
                ).first()
                if sha_exists:
                    logger.debug("Auto-seed skip (SHA-256 duplicate): %s", record.get("ticker"))
                    continue

            ticker = record.get("ticker")
            company_id = None
            if ticker:
                company_row = db.execute(
                    sa_text("SELECT id FROM companies WHERE ticker=:t LIMIT 1"),
                    {"t": ticker},
                ).first()
                if company_row:
                    company_id = company_row[0]
                else:
                    company_id = str(uuid.uuid4())
                    db.execute(
                        sa_text(
                            "INSERT INTO companies (id, ticker, name, exchange) "
                            "VALUES (:id, :ticker, :name, :exchange)"
                        ),
                        {
                            "id": company_id,
                            "ticker": ticker,
                            "name": record.get("company_name", ticker),
                            "exchange": record.get("exchange"),
                        },
                    )
                    db.commit()

            doc_id = str(uuid.uuid4())
            db.execute(
                sa_text(
                    "INSERT INTO documents "
                    "(id, company_id, title, original_filename, source_type, source_url, "
                    "report_type, report_period, fiscal_year, fiscal_quarter, language, status) "
                    "VALUES (:id, :cid, :title, :fname, :stype, :surl, :rtype, :period, :fy, :fq, :lang, 'queued')"
                ),
                {
                    "id": doc_id,
                    "cid": company_id,
                    "title": record.get("title") or record.get("full_name"),
                    "fname": record.get("original_filename"),
                    "stype": "pre_indexed",
                    "surl": source_url,
                    "rtype": record.get("report_type"),
                    "period": record.get("period"),
                    "fy": record.get("fiscal_year"),
                    "fq": record.get("fiscal_quarter"),
                    "lang": record.get("language", "vi"),
                },
            )
            db.commit()

            queue.enqueue("worker.ingestion.process_document", doc_id, job_timeout="30m")
            created += 1

            if i < len(records) - 1 and settings.seed_data_rate_limit > 0:
                time.sleep(settings.seed_data_rate_limit)

    finally:
        db.close()

    logger.info("Auto-seed complete: enqueued %s report(s)", created)
