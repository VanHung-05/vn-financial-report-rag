"""Embedding service — Ollama (async)."""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def embed_text(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0] if vectors else []


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    url = f"{settings.ollama_base_url.rstrip('/')}/api/embed"
    payload = {
        "model": settings.embedding_model,
        "input": texts if len(texts) > 1 else texts[0],
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    embeddings = data.get("embeddings")
    if embeddings is None and "embedding" in data:
        embeddings = [data["embedding"]]
    if not embeddings:
        raise ValueError(f"Ollama returned no embeddings: {data}")

    return embeddings


def embedding_to_pgvector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"
