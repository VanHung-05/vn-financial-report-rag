"""Worker entrypoint: auto-seeds on first run, then starts RQ worker.

Improvements:
- Graceful shutdown with SIGTERM/SIGINT handling
- Stale job cleanup on startup (documents stuck in processing > 30 min)
"""
import logging
import signal
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from redis import Redis
from rq import Worker

from worker.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Documents stuck in these states for > STALE_THRESHOLD are reset to 'queued'
_PROCESSING_STATES = (
    "downloading", "extracting_text", "extracting_tables",
    "ocr_processing", "normalizing_financial_data",
    "chunking", "embedding", "indexed",
)
_STALE_THRESHOLD_MINUTES = 30


def _run_auto_seed_subprocess() -> None:
    """Auto-seed in a child process so the worker parent never opens PostgreSQL before fork."""
    if not settings.auto_seed_enabled:
        return
    script = Path(__file__).resolve().parent / "run_auto_seed.py"
    logger.info("Running auto-seed subprocess...")
    result = subprocess.run([sys.executable, str(script)], check=False)
    if result.returncode != 0:
        logger.warning("Auto-seed subprocess exited with code %s", result.returncode)


def _cleanup_stale_jobs() -> None:
    """Reset documents stuck in processing states for too long.

    This handles cases where the worker was killed mid-ingestion,
    leaving documents in states like 'embedding' forever.
    """
    from worker.database import SessionLocal
    from sqlalchemy import text as sa_text

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=_STALE_THRESHOLD_MINUTES)
        states_str = ", ".join(f"'{s}'" for s in _PROCESSING_STATES)

        result = db.execute(
            sa_text(
                f"UPDATE documents SET status='queued', current_step='reset_stale', "
                f"progress=0, error_message='Tự động reset: xử lý quá {_STALE_THRESHOLD_MINUTES} phút', "
                f"updated_at=now() "
                f"WHERE status IN ({states_str}) "
                f"AND updated_at < :cutoff "
                f"RETURNING id, title"
            ),
            {"cutoff": cutoff},
        )
        stale_docs = result.fetchall()
        db.commit()

        if stale_docs:
            logger.info(
                "Reset %d stale document(s) to 'queued': %s",
                len(stale_docs),
                ", ".join(str(row[1] or row[0]) for row in stale_docs),
            )
        else:
            logger.info("No stale documents found")
    except Exception as e:
        logger.warning("Stale job cleanup failed: %s", e)
    finally:
        db.close()


def _create_worker(redis_conn: Redis) -> Worker:
    """Create the appropriate worker type for the current platform."""
    # macOS: fork + psycopg2/SQLAlchemy in parent → SIGSEGV in RQ work horse
    if sys.platform == "darwin":
        from rq import SimpleWorker

        logger.info("Using SimpleWorker (no fork) on macOS")
        return SimpleWorker(["ingestion"], connection=redis_conn)
    return Worker(["ingestion"], connection=redis_conn)


def _setup_signal_handlers(worker: Worker) -> None:
    """Set up graceful shutdown handlers for SIGTERM and SIGINT.

    On receiving these signals, the worker will finish the current job
    before exiting, instead of being killed mid-ingestion.
    """
    def _handle_shutdown(signum, frame):
        sig_name = signal.Signals(signum).name
        logger.info(
            "Received %s — finishing current job and shutting down gracefully...",
            sig_name,
        )
        # RQ Worker handles shutdown via request_stop
        worker.request_stop(signum, frame)

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)
    logger.info("Graceful shutdown handlers installed (SIGTERM, SIGINT)")


def main():
    _run_auto_seed_subprocess()
    _cleanup_stale_jobs()

    redis_conn = Redis.from_url(settings.redis_url)
    worker = _create_worker(redis_conn)
    _setup_signal_handlers(worker)

    logger.info("Worker started — listening on 'ingestion' queue")
    worker.work()


if __name__ == "__main__":
    main()
