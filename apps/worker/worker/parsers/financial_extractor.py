"""Financial facts extractor using Gemini structured outputs."""
import json
import logging
import re
from pathlib import Path

import httpx

from worker.config import settings

logger = logging.getLogger(__name__)


def select_candidate_pages(pages: list[dict]) -> list[dict]:
    """Select pages that are highly likely to contain the Balance Sheet or Income Statement."""
    candidates = []
    keywords = [
        "bảng cân đối kế toán",
        "cân đối kế toán",
        "kết quả hoạt động kinh doanh",
        "kết quả kinh doanh",
        "báo cáo kết quả hoạt động"
    ]
    for p in pages:
        text = (p.get("text") or "").lower()
        # Look for these exact phrases
        if any(kw in text for kw in keywords):
            candidates.append(p)
            
    # If no pages found (e.g. OCR is weak or headings are structured differently),
    # use the first 8 pages which typically contain the main sheets
    if not candidates and pages:
        candidates = pages[:8]
        
    # Limit to maximum 12 pages to avoid overwhelming the LLM prompt
    return candidates[:12]


def clean_gemini_json(text: str) -> str:
    """Strip markdown codeblock formatting if present."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


async def extract_financial_facts(pages: list[dict], doc_metadata: dict) -> list[dict]:
    """Call Gemini to extract core financial facts from candidate pages."""
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Skipping financial facts extraction.")
        return []

    candidates = select_candidate_pages(pages)
    if not candidates:
        return []

    # Compile the text from candidates
    compiled_text_parts = []
    for p in candidates:
        page_num = p["page"]
        text_content = p.get("text") or ""
        compiled_text_parts.append(f"--- TRANG {page_num} ---\n{text_content}")

    context_text = "\n\n".join(compiled_text_parts)

    ticker = doc_metadata.get("ticker") or "N/A"
    fiscal_year = doc_metadata.get("fiscal_year") or "N/A"
    fiscal_quarter = doc_metadata.get("fiscal_quarter") or ""
    period = f"{fiscal_year}"
    if fiscal_quarter:
        period += f"-Q{fiscal_quarter}"

    system_prompt = """Bạn là chuyên gia phân tích báo cáo tài chính Việt Nam.
Từ văn bản được cung cấp (là các trang chứa Bảng cân đối kế toán và Báo cáo kết quả kinh doanh), hãy trích xuất các chỉ tiêu tài chính chính dưới dạng một mảng JSON (JSON Array).

Hãy chỉ trích xuất các chỉ tiêu sau:
1. Doanh thu thuần về bán hàng và cung cấp dịch vụ (chuẩn hóa tên cột: Doanh thu thuần)
2. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (chuẩn hóa tên cột: Lợi nhuận gộp)
3. Lợi nhuận sau thuế thu nhập doanh nghiệp (chuẩn hóa tên cột: Lợi nhuận sau thuế)
4. Tổng cộng tài sản (chuẩn hóa tên cột: Tổng tài sản)
5. Nợ phải trả (chuẩn hóa tên cột: Nợ phải trả)
6. Vốn chủ sở hữu (chuẩn hóa tên cột: Vốn chủ sở hữu)

Đối với mỗi chỉ tiêu được trích xuất, hãy tạo một đối tượng JSON có cấu trúc chính xác như sau:
{
  "statement_type": "income_statement" hoặc "balance_sheet",
  "metric_name": "Doanh thu thuần" | "Lợi nhuận gộp" | "Lợi nhuận sau thuế" | "Tổng tài sản" | "Nợ phải trả" | "Vốn chủ sở hữu",
  "metric_alias": "tên chỉ tiêu thực tế tiếng Việt viết trong tài liệu",
  "period": "kỳ báo cáo (ví dụ: '2025' hoặc '2025-Q1')",
  "value": số tiền thực tế (kiểu float, BẮT BUỘC quy đổi về đơn vị đồng VND. Ví dụ nếu tài liệu ghi đơn vị tính là 'Triệu đồng' và số là '15.000', giá trị phải là 15000000000. Nếu đơn vị tính là 'Đồng' thì giữ nguyên),
  "currency": "VND",
  "unit_scale": "VND",
  "source_page": số trang chứa thông tin này (kiểu int)
}

LƯU Ý CỰC KỲ QUAN TRỌNG:
- Chỉ trích xuất số liệu của kỳ hiện tại (kỳ đang báo cáo). Không trích xuất số liệu kỳ trước/năm trước (cột so sánh).
- Luôn kiểm tra kỹ đơn vị tính của báo cáo (Đồng, Nghìn đồng, Triệu đồng, Tỷ đồng) ở phần đầu trang để quy đổi giá trị về VND chuẩn xác.
- Nếu không tìm thấy chỉ tiêu nào, hãy trả về mảng rỗng `[]`.
- Trả về JSON thô duy nhất, không giải thích dài dòng, không nằm trong các block markdown khác ngoại trừ json."""

    user_prompt = f"""Thông tin báo cáo:
- Mã CK: {ticker}
- Kỳ báo cáo: {period}

Văn bản báo cáo tài chính trích xuất:
{context_text}"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.llm_model}:generateContent"
    params = {"key": settings.gemini_api_key}
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json"
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, params=params, json=body)
            response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return []

        parts = candidates[0].get("content", {}).get("parts", [])
        text_parts = [p.get("text", "") for p in parts if "text" in p]
        raw_answer = "".join(text_parts).strip()
        
        cleaned_json = clean_gemini_json(raw_answer)
        facts = json.loads(cleaned_json)
        
        if isinstance(facts, dict) and "facts" in facts:
            facts = facts["facts"]
            
        if not isinstance(facts, list):
            logger.warning("Gemini did not return a list of facts: %s", cleaned_json)
            return []

        logger.info("Successfully extracted %d financial facts using Gemini for ticker %s, period %s", len(facts), ticker, period)
        return facts

    except Exception as e:
        logger.error("Failed to extract financial facts: %s", e)
        return []
