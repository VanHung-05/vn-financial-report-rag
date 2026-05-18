"""Re-enqueue documents stuck in queued/failed after worker crashes."""
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
                "SELECT id FROM documents "
                "WHERE status IN ('queued', 'failed') OR processed_chunks IS NULL "
                "ORDER BY created_at"
            )
        ).fetchall()
    finally:
        db.close()

    if not rows:
        logger.info("No documents to requeue")
        return 0

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("ingestion", connection=redis_conn)

    for (doc_id,) in rows:
        db = SessionLocal()
        try:
            db.execute(
                sa_text(
                    "UPDATE documents SET status='queued', current_step='queued', "
                    "progress=0, error_message=NULL, updated_at=now() WHERE id=:id"
                ),
                {"id": doc_id},
            )
            db.commit()
        finally:
            db.close()
        queue.enqueue("worker.ingestion.process_document", doc_id, job_timeout="30m")
        logger.info("Requeued %s", doc_id)

    logger.info("Requeued %s document(s)", len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
