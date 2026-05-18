"""Worker entrypoint: auto-seeds on first run, then starts RQ worker."""
import logging
import subprocess
import sys
from pathlib import Path

from redis import Redis
from rq import Worker

from worker.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _run_auto_seed_subprocess() -> None:
    """Auto-seed in a child process so the worker parent never opens PostgreSQL before fork."""
    if not settings.auto_seed_enabled:
        return
    script = Path(__file__).resolve().parent / "run_auto_seed.py"
    logger.info("Running auto-seed subprocess...")
    result = subprocess.run([sys.executable, str(script)], check=False)
    if result.returncode != 0:
        logger.warning("Auto-seed subprocess exited with code %s", result.returncode)


def _create_worker(redis_conn: Redis) -> Worker:
    # macOS: fork + psycopg2/SQLAlchemy in parent → SIGSEGV in RQ work horse
    if sys.platform == "darwin":
        from rq import SimpleWorker

        logger.info("Using SimpleWorker (no fork) on macOS")
        return SimpleWorker(["ingestion"], connection=redis_conn)
    return Worker(["ingestion"], connection=redis_conn)


def main():
    _run_auto_seed_subprocess()

    redis_conn = Redis.from_url(settings.redis_url)
    worker = _create_worker(redis_conn)
    worker.work()


if __name__ == "__main__":
    main()
