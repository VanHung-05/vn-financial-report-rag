"""Seed runner: reads manifest, creates document records, and enqueues ingestion jobs."""
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


def run_seed(
    manifest_path: str,
    dry_run: bool = False,
    limit: int | None = None,
    rate_limit: float = 1.0,
):
    """Read a JSONL manifest and enqueue ingestion jobs.

    Args:
        manifest_path: path to .jsonl manifest file
        dry_run: if True, only validate without creating records
        limit: max number of records to process
        rate_limit: seconds between enqueue operations
    """
    manifest = Path(manifest_path)
    if not manifest.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest}")

    records = []
    with manifest.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    if limit:
        records = records[:limit]

    logger.info(f"Loaded {len(records)} records from {manifest_path}")

    if dry_run:
        return _dry_run(records)

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("ingestion", connection=redis_conn)
    db = SessionLocal()

    results = {"created": 0, "skipped": 0, "errors": []}

    try:
        for i, record in enumerate(records):
            try:
                _process_record(db, queue, record, results)
            except Exception as e:
                results["errors"].append({"id": record.get("id"), "error": str(e)})
                logger.error(f"Error processing {record.get('id')}: {e}")

            if i < len(records) - 1:
                time.sleep(rate_limit)

    finally:
        db.close()

    logger.info(f"Seed complete: {results['created']} created, {results['skipped']} skipped, {len(results['errors'])} errors")
    return results


def _process_record(db, queue, record: dict, results: dict):
    source_url = record.get("source_url")
    if not source_url:
        results["skipped"] += 1
        logger.debug("Skipped: no source_url in record %s", record.get("id"))
        return

    # Check if already exists by source_url
    existing = db.execute(
        sa_text("SELECT id FROM documents WHERE source_url=:url LIMIT 1"),
        {"url": source_url},
    ).first()

    if existing:
        results["skipped"] += 1
        logger.debug("Skipped (source_url duplicate): %s", record.get("ticker"))
        return

    # Check if file_sha256 already exists (if manifest provides it)
    file_sha256 = record.get("file_sha256")
    if file_sha256:
        sha_existing = db.execute(
            sa_text("SELECT id FROM documents WHERE file_sha256=:sha LIMIT 1"),
            {"sha": file_sha256},
        ).first()
        if sha_existing:
            results["skipped"] += 1
            logger.debug("Skipped (SHA-256 duplicate): %s — %s", record.get("ticker"), file_sha256[:12])
            return

    # Ensure company exists
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

    # Create document
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
            "stype": "public_seed",
            "surl": source_url,
            "rtype": record.get("report_type"),
            "period": record.get("period"),
            "fy": record.get("fiscal_year"),
            "fq": record.get("fiscal_quarter"),
            "lang": record.get("language", "vi"),
        },
    )
    db.commit()

    # Enqueue ingestion job
    queue.enqueue("worker.ingestion.process_document", doc_id, job_timeout="30m")
    results["created"] += 1
    logger.info(f"Enqueued {doc_id} for {ticker} - {record.get('period')}")


def _dry_run(records: list[dict]) -> dict:
    """Validate manifest without making changes."""
    results = {
        "total": len(records),
        "valid": 0,
        "missing_url": 0,
        "missing_ticker": 0,
        "tickers": set(),
        "periods": set(),
    }

    for r in records:
        if not r.get("source_url"):
            results["missing_url"] += 1
            continue
        if not r.get("ticker"):
            results["missing_ticker"] += 1
        results["valid"] += 1
        results["tickers"].add(r.get("ticker"))
        results["periods"].add(r.get("period"))

    results["tickers"] = sorted(results["tickers"])
    results["periods"] = sorted(p for p in results["periods"] if p)
    logger.info(f"Dry run: {results['valid']} valid, {results['missing_url']} missing URL")
    return results


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Seed financial reports from manifest")
    parser.add_argument("manifest", help="Path to JSONL manifest file")
    parser.add_argument("--dry-run", action="store_true", help="Validate only")
    parser.add_argument("--limit", type=int, help="Max records to process")
    parser.add_argument("--rate-limit", type=float, default=1.0, help="Seconds between operations")

    args = parser.parse_args()
    result = run_seed(args.manifest, dry_run=args.dry_run, limit=args.limit, rate_limit=args.rate_limit)
    print(json.dumps(result, indent=2, default=str))
