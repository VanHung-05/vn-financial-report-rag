"""Enqueue ingestion jobs to Redis/RQ."""
import redis
from rq import Queue

from app.config import settings

_redis_conn = None
_queue = None


def get_queue() -> Queue:
    global _redis_conn, _queue
    if _queue is None:
        _redis_conn = redis.Redis.from_url(settings.redis_url)
        _queue = Queue("ingestion", connection=_redis_conn)
    return _queue


def enqueue_ingestion(document_id: str):
    """Enqueue a document for ingestion processing."""
    queue = get_queue()
    queue.enqueue("worker.ingestion.process_document", document_id, job_timeout="30m")
