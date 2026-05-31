"""Re-embed all document chunks with the current embedding model.

Use this after changing the embedding model (e.g. nomic-embed-text → bge-m3).
Only updates embeddings — does NOT re-parse PDFs or re-chunk.

Usage:
    cd apps/worker && python -m worker.reembed_all [--batch-size 32]
"""
import logging
import sys

from sqlalchemy import text as sa_text

from worker.config import settings
from worker.database import SessionLocal
from worker.embedder import embed_texts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 32


def main() -> int:
    batch_size = BATCH_SIZE
    if "--batch-size" in sys.argv:
        idx = sys.argv.index("--batch-size")
        if idx + 1 < len(sys.argv):
            batch_size = int(sys.argv[idx + 1])

    db = SessionLocal()
    try:
        # Count total chunks needing embedding
        total = db.execute(
            sa_text("SELECT count(*) FROM document_chunks WHERE embedding IS NULL")
        ).scalar()

        if total == 0:
            logger.info("All chunks already have embeddings. Nothing to do.")
            return 0

        logger.info(
            "Re-embedding %d chunks with model=%s (dim=%d), batch_size=%d",
            total, settings.embedding_model, settings.embedding_dimensions, batch_size,
        )

        processed = 0
        errors = 0

        while True:
            # Fetch a batch of chunks without embeddings
            rows = db.execute(
                sa_text(
                    "SELECT id, content FROM document_chunks "
                    "WHERE embedding IS NULL "
                    "ORDER BY chunk_index "
                    "LIMIT :limit"
                ),
                {"limit": batch_size},
            ).fetchall()

            if not rows:
                break

            chunk_ids = [str(r[0]) for r in rows]
            texts = [r[1] for r in rows]

            try:
                embeddings = embed_texts(texts, batch_size=batch_size)
            except Exception as e:
                logger.error("Embedding batch failed: %s", e)
                errors += len(rows)
                # Mark these as attempted by skipping (avoid infinite loop)
                # In practice, if Ollama is down this will keep failing
                break

            for chunk_id, emb in zip(chunk_ids, embeddings):
                emb_str = "[" + ",".join(str(x) for x in emb) + "]"
                db.execute(
                    sa_text(
                        "UPDATE document_chunks "
                        "SET embedding = CAST(:emb AS vector) "
                        "WHERE id = CAST(:id AS uuid)"
                    ),
                    {"emb": emb_str, "id": chunk_id},
                )

            db.commit()
            processed += len(rows)
            pct = round(processed / total * 100, 1)
            logger.info("Progress: %d/%d (%s%%)", processed, total, pct)

        logger.info(
            "Re-embedding complete: %d succeeded, %d errors (model: %s)",
            processed, errors, settings.embedding_model,
        )
        return 0 if errors == 0 else 1

    except Exception as e:
        logger.exception("Re-embedding failed: %s", e)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
