import logging
import sys
from pathlib import Path
from redis import Redis
from rq import Queue
from sqlalchemy import text as sa_text

# Adjust paths to match repo root
from worker.config import settings
from worker.database import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("reindex_all")

def main() -> int:
    db = SessionLocal()
    try:
        # Fetch all documents in database
        rows = db.execute(
            sa_text("SELECT id, title, original_filename FROM documents ORDER BY created_at")
        ).fetchall()
    finally:
        db.close()

    if not rows:
        logger.info("No documents in database to reindex")
        return 0

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("ingestion", connection=redis_conn)

    logger.info("Starting force reindexing of %d documents...", len(rows))

    for doc_id, title, fname in rows:
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
        logger.info("Queued for reindex: %s (%s)", title or fname or doc_id, doc_id)

    logger.info("Enqueued %d documents for reindex. Processing will start shortly...", len(rows))
    return 0

if __name__ == "__main__":
    sys.exit(main())
