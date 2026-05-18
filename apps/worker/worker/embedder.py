"""Generate embeddings via Ollama (local)."""
import logging

import httpx

from worker.config import settings

logger = logging.getLogger(__name__)


def _ollama_embed_batch(texts: list[str]) -> list[list[float]]:
    """Call Ollama /api/embed. See: https://github.com/ollama/ollama/blob/main/docs/api.md"""
    url = f"{settings.ollama_base_url.rstrip('/')}/api/embed"
    payload = {
        "model": settings.embedding_model,
        "input": texts if len(texts) > 1 else texts[0],
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    embeddings = data.get("embeddings")
    if embeddings is None and "embedding" in data:
        embeddings = [data["embedding"]]
    if not embeddings:
        raise ValueError(f"Ollama returned no embeddings: {data}")

    if len(embeddings) != len(texts):
        raise ValueError(f"Expected {len(texts)} embeddings, got {len(embeddings)}")

    for i, vec in enumerate(embeddings):
        if len(vec) != settings.embedding_dimensions:
            logger.warning(
                "Embedding dim mismatch for item %s: got %s, EMBEDDING_DIMENSIONS=%s. "
                "Update .env to match model.",
                i,
                len(vec),
                settings.embedding_dimensions,
            )

    return embeddings


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """Generate embeddings for a list of texts using Ollama."""
    if not texts:
        return []

    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        all_embeddings.extend(_ollama_embed_batch(batch))

    return all_embeddings


def embed_single(text: str) -> list[float]:
    result = embed_texts([text])
    return result[0] if result else []
