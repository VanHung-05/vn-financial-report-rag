"""Re-enqueue documents that finished with zero chunks (e.g. before OCR was added)."""
import logging
import sys

from redis import Redis
from rq import Queue
from sqlalchemy import text as sa_text

from worker.config import settings
from worker.database import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    db = SessionLocal()
    try:
        rows = db.execute(
            sa_text(
                "SELECT id, title FROM documents "
                "WHERE total_chunks = 0 OR processed_chunks = 0 "
                "   OR id NOT IN (SELECT DISTINCT document_id FROM document_chunks) "
                "ORDER BY created_at"
            )
        ).fetchall()
    finally:
        db.close()

    if not rows:
        logger.info("No empty documents to reindex")
        return 0

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("ingestion", connection=redis_conn)

    for doc_id, title in rows:
        db = SessionLocal()
        try:
            db.execute(
                sa_text(
                    "UPDATE documents SET status='queued', current_step='reindex', "
                    "progress=0, error_message=NULL, total_chunks=0, processed_chunks=0, "
                    "updated_at=now() WHERE id=:id"
                ),
                {"id": doc_id},
            )
            db.commit()
        finally:
            db.close()
        queue.enqueue("worker.ingestion.process_document", doc_id, job_timeout="60m")
        logger.info("Reindex queued: %s (%s)", title or doc_id, doc_id)

    logger.info("Queued %s document(s) for reindex (OCR may take several min each)", len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
