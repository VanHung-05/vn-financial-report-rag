import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.chat import ChatSession, ChatMessage
from app.services.embeddings import embed_text, embedding_to_pgvector_literal
from app.services.llm import generate_answer as gemini_generate

router = APIRouter()
logger = logging.getLogger(__name__)

NO_DATA_RESPONSE = (
    "Tôi không tìm thấy thông tin liên quan đến câu hỏi này trong dữ liệu hiện có. "
    "Hệ thống hiện có báo cáo tài chính của các công ty VN30/HOSE giai đoạn 2025-2026. "
    "Nếu bạn cần thông tin từ báo cáo khác, vui lòng upload thêm file báo cáo tài chính."
)

SYSTEM_PROMPT = """Bạn là trợ lý phân tích báo cáo tài chính doanh nghiệp Việt Nam.
Trả lời DỰA TRÊN context được cung cấp. Không bịa số liệu.
Mỗi câu trả lời phải có trích dẫn nguồn [Nguồn N] (công ty, kỳ báo cáo, trang nếu có).

LƯU Ý QUAN TRỌNG:
- Context có thể từ PDF scan (OCR), nên label và số liệu có thể bị tách rời hoặc sai dấu.
- Khi thấy bảng tài chính, ghép mã số (VD: 310, 311) với tên chỉ tiêu và giá trị tương ứng.
- Nếu label nằm ở nguồn khác với số liệu, hãy ghép chúng lại.
- Nếu context không đủ thông tin để trả lời, nói rõ là chưa có dữ liệu và gợi ý upload thêm báo cáo.

Trả lời bằng tiếng Việt, rõ ràng, có trích dẫn nguồn."""


class SessionCreate(BaseModel):
    title: str | None = None
    scope: str | None = None
    scope_filter: dict | None = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    title: str | None
    scope: str | None
    scope_filter: dict | None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    citations: dict | None

    class Config:
        from_attributes = True


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = ChatSession(**body.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).order_by(ChatSession.updated_at.desc()))
    return result.scalars().all()


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def list_messages(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


@router.post("/sessions/{session_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    session_id: uuid.UUID,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_msg = ChatMessage(session_id=session_id, role="user", content=body.content)
    db.add(user_msg)
    await db.flush()

    # Retrieve relevant chunks
    chunks = await _retrieve_chunks(db, body.content, session.scope_filter)

    if not chunks:
        assistant_msg = ChatMessage(
            session_id=session_id,
            role="assistant",
            content=NO_DATA_RESPONSE,
            citations=None,
        )
        db.add(assistant_msg)
        await db.commit()
        await db.refresh(assistant_msg)
        return assistant_msg

    # Build context and generate answer
    context, citations_data = _build_context(chunks)
    answer = await _generate_answer(body.content, context)

    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=answer,
        citations=citations_data,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)
    return assistant_msg


def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy Row/Mapping to a plain dict with JSON-safe types."""
    from decimal import Decimal
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, Decimal):
            d[k] = float(v)
        elif isinstance(v, uuid.UUID):
            d[k] = str(v)
    return d


async def _retrieve_chunks(db: AsyncSession, query: str, scope_filter: dict | None = None) -> list[dict]:
    """Retrieve relevant chunks using Ollama embeddings + pgvector.

    Uses a two-phase approach:
    1) Vector similarity search to find top-matching chunks
    2) Same-document expansion: for the top-scoring document, also fetch
       key financial section chunks that may not rank high by embedding
       similarity but contain the actual financial data.
    """
    relevant = []

    if settings.embedding_provider == "ollama":
        try:
            # Phase 1: Vector similarity search
            async with db.begin_nested():
                query_embedding = await embed_text(query)
                emb_str = embedding_to_pgvector_literal(query_embedding)

                sql = text(
                    "SELECT c.id, c.document_id, c.content, c.chunk_type, c.section_title, "
                    "c.page_start, c.page_end, c.metadata, "
                    "d.title as doc_title, d.original_filename, "
                    "1 - (c.embedding <=> CAST(:emb AS vector)) as score "
                    "FROM document_chunks c "
                    "JOIN documents d ON d.id = c.document_id "
                    "WHERE c.embedding IS NOT NULL "
                    "ORDER BY c.embedding <=> CAST(:emb AS vector) "
                    "LIMIT 20"
                )
                result = await db.execute(sql, {"emb": emb_str})
                rows = result.mappings().all()

                relevant = [_row_to_dict(r) for r in rows if r["score"] is not None and r["score"] > 0.3]
                if not relevant and rows:
                    relevant = [_row_to_dict(r) for r in rows[:10]]

                logger.info("Phase 1: found %d relevant chunks (from %d total)", len(relevant), len(rows))

        except Exception as e:
            logger.warning("Vector search failed: %s", e)

        # Phase 2: Same-document expansion (outside the nested transaction)
        if relevant:
            try:
                seen_ids = {str(r["id"]) for r in relevant}
                top_doc_id = str(relevant[0]["document_id"])
                logger.info("Phase 2: expanding top doc %s", top_doc_id)

                expansion_sql = text(
                    "SELECT c.id, c.document_id, c.content, c.chunk_type, c.section_title, "
                    "c.page_start, c.page_end, c.metadata, "
                    "d.title as doc_title, d.original_filename, "
                    "0.5 as score "
                    "FROM document_chunks c "
                    "JOIN documents d ON d.id = c.document_id "
                    "WHERE c.document_id = CAST(:doc_id AS uuid) "
                    "AND c.section_title IS NOT NULL "
                    "AND length(c.content) > 200 "
                    "ORDER BY c.chunk_index "
                    "LIMIT 15"
                )
                expansion_result = await db.execute(expansion_sql, {"doc_id": top_doc_id})
                expansion_rows = expansion_result.mappings().all()

                added = 0
                for r in expansion_rows:
                    if str(r["id"]) not in seen_ids:
                        relevant.append(_row_to_dict(r))
                        seen_ids.add(str(r["id"]))
                        added += 1

                logger.info("Phase 2: added %d expansion chunks (from %d in doc)", added, len(expansion_rows))

            except Exception as e:
                logger.warning("Document expansion failed: %s", e)

            return relevant

    # Fallback: text search when Ollama down or chưa có embedding
    sql = text(
        "SELECT c.id, c.document_id, c.content, c.chunk_type, c.section_title, "
        "c.page_start, c.page_end, c.metadata, "
        "d.title as doc_title, d.original_filename, "
        "NULL as score "
        "FROM document_chunks c "
        "JOIN documents d ON d.id = c.document_id "
        "WHERE c.content ILIKE :q "
        "LIMIT 15"
    )
    result = await db.execute(sql, {"q": f"%{query}%"})
    rows = result.mappings().all()
    return [_row_to_dict(r) for r in rows]


def _build_context(chunks: list[dict]) -> tuple[str, dict]:
    """Build context string and citations from retrieved chunks."""
    context_parts = []
    sources = []

    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata") or {}
        source_info = {
            "chunk_id": str(chunk["id"]),
            "document_id": str(chunk["document_id"]),
            "section": chunk.get("section_title"),
            "page_start": chunk.get("page_start"),
            "page_end": chunk.get("page_end"),
            "company_id": meta.get("company_id"),
            "fiscal_year": meta.get("fiscal_year"),
            "fiscal_quarter": meta.get("fiscal_quarter"),
            "report_type": meta.get("report_type"),
            "report_period": meta.get("report_period"),
            "score": chunk.get("score"),
        }
        sources.append(source_info)

        # Build rich header with document title for better LLM context
        header = f"[Nguồn {i}]"
        doc_title = chunk.get("doc_title") or chunk.get("original_filename") or ""
        if doc_title:
            header += f" {doc_title}"
        if meta.get("report_period"):
            header += f" · Kỳ: {meta['report_period']}"
        elif meta.get("fiscal_year"):
            period = str(meta['fiscal_year'])
            if meta.get("fiscal_quarter"):
                period += f"-Q{meta['fiscal_quarter']}"
            header += f" · Kỳ: {period}"
        if chunk.get("section_title"):
            header += f" · {chunk['section_title']}"
        if chunk.get("page_start"):
            header += f" · trang {chunk['page_start']}"
            if chunk.get("page_end") and chunk["page_end"] != chunk["page_start"]:
                header += f"–{chunk['page_end']}"

        context_parts.append(f"{header}\n{chunk['content']}")

    context = "\n\n---\n\n".join(context_parts)
    citations = {"sources": sources}
    return context, citations


async def _generate_answer(question: str, context: str) -> str:
    """Generate answer using Gemini with retrieved context."""
    if not settings.gemini_api_key:
        return (
            "[Chưa cấu hình GEMINI_API_KEY trong .env]\n\n"
            f"Đã tìm thấy thông tin liên quan. Trích xuất:\n\n{context[:2000]}"
        )

    try:
        user_prompt = f"Context:\n{context}\n\nCâu hỏi: {question}"
        return await gemini_generate(SYSTEM_PROMPT, user_prompt)
    except Exception as e:
        return f"Lỗi khi gọi Gemini: {str(e)[:200]}. Kiểm tra GEMINI_API_KEY và LLM_MODEL trong .env."
