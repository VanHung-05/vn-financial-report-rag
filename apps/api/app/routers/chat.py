import json
import logging
import re
import uuid
import httpx

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

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

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

ROUTER_PROMPT = """Bạn là một bộ định tuyến truy vấn báo cáo tài chính.
Hãy phân tích câu hỏi của người dùng và xác định xem họ có đang hỏi về một số liệu tài chính cụ thể (doanh thu thuần, lợi nhuận gộp, lợi nhuận sau thuế, tổng tài sản, nợ phải trả, vốn chủ sở hữu) của một công ty (mã chứng khoán) và một kỳ báo cáo cụ thể (quý, năm) hay không.

Nếu đúng như vậy, hãy trả về kết quả dưới dạng một đối tượng JSON duy nhất có cấu trúc sau:
{
  "is_structured": true,
  "ticker": "MÃ CỔ PHIẾU VIẾT HOA (ví dụ: HPG, FPT)",
  "fiscal_year": năm tài chính dưới dạng số nguyên (ví dụ: 2025),
  "fiscal_quarter": quý dưới dạng số nguyên (1, 2, 3, 4 hoặc null nếu hỏi cả năm),
  "metric": "doanh_thu" | "loi_nhuan_gop" | "loi_nhuan_sau_thue" | "tong_tai_san" | "no_phai_tra" | "von_chu_so_huu"
}

Hãy phân loại metric chính xác theo quy tắc:
- Doanh thu thuần, doanh thu thuần về bán hàng -> "doanh_thu"
- Lợi nhuận gộp -> "loi_nhuan_gop"
- Lợi nhuận sau thuế, lợi nhuận sau thuế TNDN, lợi nhuận ròng -> "loi_nhuan_sau_thue"
- Tổng tài sản, tổng cộng tài sản -> "tong_tai_san"
- Nợ phải trả, tổng nợ -> "no_phai_tra"
- Vốn chủ sở hữu -> "von_chu_so_huu"

Nếu câu hỏi mang tính thảo luận chung, giải thích thuyết minh, hỏi về chính sách kế toán, rủi ro, ý kiến kiểm toán, hoặc không rõ mã cổ phiếu/năm báo cáo, hãy trả về:
{
  "is_structured": false
}

LƯU Ý: Chỉ trả về chuỗi JSON thô duy nhất, không giải thích dài dòng, không có markdown code block."""

FACT_PROMPT = """Bạn là trợ lý phân tích tài chính cao cấp của doanh nghiệp Việt Nam.
Hãy trình bày chỉ tiêu tài chính này cho người dùng dựa trên thông tin chính thức được xác thực từ Database dưới đây.

Thông tin chỉ tiêu:
- Tên công ty: {company_name} ({ticker})
- Chỉ tiêu: {metric_alias} ({metric_name})
- Kỳ báo cáo: {period}
- Số liệu: {value_formatted} (Số gốc: {value} {currency})
- Trang gốc trong tài liệu: trang {source_page}
- Tên tài liệu: {doc_title}

Hãy viết câu trả lời ngắn gọn, chuyên nghiệp, thông báo rõ ràng con số này được xác thực từ cơ sở dữ liệu hệ thống [Nguồn DB], kèm theo thông tin chi tiết về kỳ báo cáo và trang gốc.

Đồng thời, hãy hiển thị số liệu này dưới dạng một BẢNG số liệu Markdown tuyệt đẹp với định dạng:
| Công ty | Chỉ tiêu | Kỳ báo cáo | Giá trị (VND) | Rút gọn | Trang |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

Không thêm bớt số liệu bên ngoài."""


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


def format_vnd_amount(val: float) -> str:
    if val >= 1e12:
        return f"{val / 1e12:,.2f} nghìn tỷ VND".replace(",", ".")
    if val >= 1e9:
        return f"{val / 1e9:,.2f} tỷ VND".replace(",", ".")
    if val >= 1e6:
        return f"{val / 1e6:,.2f} triệu VND".replace(",", ".")
    return f"{val:,.0f} VND".replace(",", ".")


async def _route_query(query: str) -> dict:
    """Route query using Gemini to check if it seeks structured metrics."""
    if not settings.gemini_api_key:
        return {"is_structured": False}
    try:
        url = f"{GEMINI_BASE}/models/{settings.llm_model}:generateContent"
        params = {"key": settings.gemini_api_key}
        body = {
            "systemInstruction": {"parts": [{"text": ROUTER_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": f"Câu hỏi: {query}"}]}],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 256,
                "responseMimeType": "application/json"
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, params=params, json=body)
            response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return {"is_structured": False}

        parts = candidates[0].get("content", {}).get("parts", [])
        text_parts = [p.get("text", "") for p in parts if "text" in p]
        raw_ans = "".join(text_parts).strip()

        # strip markdown code blocks if present
        if raw_ans.startswith("```json"):
            raw_ans = raw_ans[7:]
        elif raw_ans.startswith("```"):
            raw_ans = raw_ans[3:]
        if raw_ans.endswith("```"):
            raw_ans = raw_ans[:-3]

        parsed = json.loads(raw_ans.strip())
        return parsed
    except Exception as e:
        logger.warning("Routing agent failed: %s", e)
        return {"is_structured": False}


async def _fetch_financial_fact(db: AsyncSession, route_info: dict) -> dict | None:
    """Fetch financial facts from DB using routed info."""
    ticker = route_info.get("ticker", "").strip().upper()
    fiscal_year = route_info.get("fiscal_year")
    fiscal_quarter = route_info.get("fiscal_quarter")
    metric = route_info.get("metric")

    metric_map = {
        "doanh_thu": "Doanh thu thuần",
        "loi_nhuan_gop": "Lợi nhuận gộp",
        "loi_nhuan_sau_thue": "Lợi nhuận sau thuế",
        "tong_tai_san": "Tổng tài sản",
        "no_phai_tra": "Nợ phải trả",
        "von_chu_so_huu": "Vốn chủ sở hữu"
    }

    db_metric = metric_map.get(metric)
    if not ticker or not fiscal_year or not db_metric:
        return None

    period_options = []
    if fiscal_quarter is not None:
        period_options.append(f"{fiscal_year}-Q{fiscal_quarter}")
    else:
        # Fallbacks: check Q4 or check full year period
        period_options.append(str(fiscal_year))
        period_options.append(f"{fiscal_year}-Q4")

    sql = text(
        "SELECT f.value, f.currency, f.unit_scale, f.metric_alias, f.metric_name, f.period, f.source_page, "
        "d.title as doc_title, d.original_filename, d.id as doc_id, c.name as company_name, c.ticker "
        "FROM financial_facts f "
        "JOIN documents d ON d.id = f.document_id "
        "JOIN companies c ON c.id = f.company_id "
        "WHERE c.ticker = :ticker "
        "AND f.metric_name = :metric "
        "AND f.period IN :periods "
        "LIMIT 1"
    )

    result = await db.execute(sql, {"ticker": ticker, "metric": db_metric, "periods": tuple(period_options)})
    row = result.mappings().first()
    if row:
        return dict(row)
    return None


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

    # Step 1: Query routing to SQL Fact Database
    route_info = await _route_query(body.content)
    if route_info.get("is_structured"):
        logger.info("Routed query to SQL facts: %s", route_info)
        fact_data = await _fetch_financial_fact(db, route_info)
        if fact_data:
            logger.info("Found exact structured fact: %s", fact_data)
            value_formatted = format_vnd_amount(fact_data["value"])
            user_prompt = FACT_PROMPT.format(
                company_name=fact_data["company_name"],
                ticker=fact_data["ticker"],
                metric_alias=fact_data["metric_alias"] or fact_data["metric_name"],
                metric_name=fact_data["metric_name"],
                period=fact_data["period"],
                value_formatted=value_formatted,
                value=f"{fact_data['value']:,.0f}".replace(",", "."),
                currency=fact_data["currency"] or "VND",
                source_page=fact_data["source_page"] or "—",
                doc_title=fact_data["doc_title"] or fact_data["original_filename"] or "Báo cáo"
            )
            answer = await gemini_generate(SYSTEM_PROMPT, user_prompt)
            
            citations_data = {
                "is_db_verified": True,
                "sources": [
                    {
                        "chunk_id": "db_fact",
                        "document_id": str(fact_data["doc_id"]),
                        "section": fact_data["metric_alias"] or fact_data["metric_name"],
                        "page_start": fact_data["source_page"],
                        "page_end": fact_data["source_page"],
                        "company_id": None,
                        "fiscal_year": None,
                        "fiscal_quarter": None,
                        "report_type": None,
                        "report_period": fact_data["period"],
                        "score": 1.0,
                        "ticker": fact_data["ticker"],
                        "company_name": fact_data["company_name"],
                        "doc_title": fact_data["doc_title"] or fact_data["original_filename"] or "Báo cáo",
                        "content": f"Chỉ tiêu trích xuất chính thức: {fact_data['metric_alias'] or fact_data['metric_name']}\nSố liệu: {value_formatted} ({fact_data['value']:,.0f} {fact_data['currency']})\nTài liệu: {fact_data['doc_title'] or fact_data['original_filename'] or 'Báo cáo'} · trang {fact_data['source_page'] or '—'}"
                    }
                ]
            }

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

    # Step 2: Hybrid RAG fallback
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
    """Retrieve relevant chunks using Vector (Ollama) + Full-Text Search combined with RRF.

    Two-phase approach:
    1) Vector + Keyword FTS Hybrid search with RRF sorting
    2) Same-document expansion on top match
    """
    # 1. Vector Search
    vector_results = []
    if settings.embedding_provider == "ollama":
        try:
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
                "LIMIT 30"
            )
            result = await db.execute(sql, {"emb": emb_str})
            vector_results = [_row_to_dict(r) for r in result.mappings().all()]
        except Exception as e:
            logger.warning("Vector search failed in hybrid: %s", e)

    # 2. Full-Text Search
    fts_results = []
    try:
        sql = text(
            "SELECT c.id, c.document_id, c.content, c.chunk_type, c.section_title, "
            "c.page_start, c.page_end, c.metadata, "
            "d.title as doc_title, d.original_filename, "
            "ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', :q)) as score "
            "FROM document_chunks c "
            "JOIN documents d ON d.id = c.document_id "
            "WHERE to_tsvector('simple', c.content) @@ plainto_tsquery('simple', :q) "
            "OR c.content ILIKE :q_like "
            "ORDER BY score DESC "
            "LIMIT 30"
        )
        result = await db.execute(sql, {"q": query, "q_like": f"%{query}%"})
        fts_results = [_row_to_dict(r) for r in result.mappings().all()]
    except Exception as e:
        logger.warning("FTS search failed in hybrid: %s", e)

    # 3. Reciprocal Rank Fusion (RRF)
    rrf_scores = {}
    item_map = {}

    def add_to_rrf(rank_list):
        for rank, item in enumerate(rank_list, start=1):
            item_id = str(item["id"])
            item_map[item_id] = item
            rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + (1.0 / (60.0 + rank))

    add_to_rrf(vector_results)
    add_to_rrf(fts_results)

    sorted_ids = sorted(rrf_scores.keys(), key=lambda k: rrf_scores[k], reverse=True)

    hybrid_results = []
    for item_id in sorted_ids[:15]:
        item = item_map[item_id]
        item["score"] = round(rrf_scores[item_id] * 30, 2)
        hybrid_results.append(item)

    # 4. Phase 2: Same-document expansion
    if hybrid_results:
        try:
            seen_ids = {str(r["id"]) for r in hybrid_results}
            top_doc_id = str(hybrid_results[0]["document_id"])
            logger.info("Phase 2: expanding top doc %s in hybrid mode", top_doc_id)

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
                    hybrid_results.append(_row_to_dict(r))
                    seen_ids.add(str(r["id"]))
                    added += 1

            logger.info("Phase 2 in hybrid: added %d expansion chunks", added)
        except Exception as e:
            logger.warning("Document expansion failed: %s", e)

    # Fallback to plain ILIKE when both search engines yielded nothing
    if not hybrid_results:
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
        hybrid_results = [_row_to_dict(r) for r in rows]

    return hybrid_results


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
            "content": chunk.get("content"),
            "doc_title": chunk.get("doc_title") or chunk.get("original_filename") or "Báo cáo"
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
