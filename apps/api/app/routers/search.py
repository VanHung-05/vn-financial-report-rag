from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.embeddings import embed_text, embedding_to_pgvector_literal

router = APIRouter()


class SearchResult(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    chunk_type: str | None
    section_title: str | None
    page_start: int | None
    page_end: int | None
    score: float | None
    metadata: dict | None


@router.get("", response_model=list[SearchResult])
async def semantic_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search document chunks by Ollama embedding similarity."""

    if settings.embedding_provider == "ollama":
        try:
            query_embedding = await embed_text(q)
            emb_str = embedding_to_pgvector_literal(query_embedding)

            sql = text(
                "SELECT id, document_id, content, chunk_type, section_title, "
                "page_start, page_end, metadata, "
                "1 - (embedding <=> CAST(:emb AS vector)) as score "
                "FROM document_chunks "
                "WHERE embedding IS NOT NULL "
                "ORDER BY embedding <=> CAST(:emb AS vector) "
                "LIMIT :lim"
            )
            result = await db.execute(sql, {"emb": emb_str, "lim": limit})
            rows = result.mappings().all()

            return [
                SearchResult(
                    chunk_id=str(r["id"]),
                    document_id=str(r["document_id"]),
                    content=r["content"][:500],
                    chunk_type=r["chunk_type"],
                    section_title=r["section_title"],
                    page_start=r["page_start"],
                    page_end=r["page_end"],
                    score=round(r["score"], 4) if r["score"] else None,
                    metadata=r["metadata"],
                )
                for r in rows
            ]
        except Exception:
            pass

    sql = text(
        "SELECT id, document_id, content, chunk_type, section_title, "
        "page_start, page_end, metadata "
        "FROM document_chunks "
        "WHERE content ILIKE :q "
        "LIMIT :lim"
    )
    result = await db.execute(sql, {"q": f"%{q}%", "lim": limit})
    rows = result.mappings().all()

    return [
        SearchResult(
            chunk_id=str(r["id"]),
            document_id=str(r["document_id"]),
            content=r["content"][:500],
            chunk_type=r["chunk_type"],
            section_title=r["section_title"],
            page_start=r["page_start"],
            page_end=r["page_end"],
            score=None,
            metadata=r["metadata"],
        )
        for r in rows
    ]
