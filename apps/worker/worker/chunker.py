"""Financial-aware chunker for Vietnamese financial reports.

Splits extracted pages into semantically meaningful chunks based on
financial report structure rather than naive token-based splitting.
"""
import re

import tiktoken

SECTION_PATTERNS = [
    r"BẢNG CÂN ĐỐI KẾ TOÁN",
    r"BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
    r"BÁO CÁO LƯU CHUYỂN TIỀN TỆ",
    r"THUYẾT MINH BÁO CÁO TÀI CHÍNH",
    r"BÁO CÁO CỦA BAN GIÁM ĐỐC",
    r"Ý KIẾN CỦA KIỂM TOÁN",
    r"BÁO CÁO KIỂM TOÁN",
    r"THÔNG TIN CHUNG",
    r"BALANCE\s*SHEET",
    r"INCOME\s*STATEMENT",
    r"CASH\s*FLOW",
    r"NOTES\s*TO.*FINANCIAL",
]

MAX_CHUNK_TOKENS = 800
OVERLAP_TOKENS = 100

_enc = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def detect_section(text: str) -> str | None:
    """Try to detect which financial report section this text belongs to."""
    upper = text[:500].upper()
    for pattern in SECTION_PATTERNS:
        if re.search(pattern, upper):
            return pattern
    return None


def chunk_pages(pages: list[dict], doc_metadata: dict | None = None) -> list[dict]:
    """Chunk extracted pages into financial-aware chunks.

    Args:
        pages: list of {"page": int, "text": str, "tables": list}
        doc_metadata: metadata to attach to each chunk (ticker, period, etc.)

    Returns:
        list of chunk dicts ready to store
    """
    chunks = []
    current_section = None
    current_text = ""
    current_page_start = 1
    current_page_end = 1
    chunk_index = 0

    for page_data in pages:
        page_num = page_data["page"]
        text = page_data.get("text", "")
        tables = page_data.get("tables", [])

        section = detect_section(text)
        if section and section != current_section:
            if current_text.strip():
                for c in _split_to_max_tokens(current_text, chunk_index, current_section, current_page_start, current_page_end, doc_metadata):
                    chunks.append(c)
                    chunk_index += 1
                current_text = ""
            current_section = section
            current_page_start = page_num

        current_text += f"\n{text}"
        current_page_end = page_num

        for table in tables:
            table_text = _table_to_text(table)
            if table_text.strip():
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": table_text,
                    "chunk_type": "table",
                    "section_title": current_section,
                    "page_start": page_num,
                    "page_end": page_num,
                    "token_count": count_tokens(table_text),
                    "metadata": doc_metadata,
                })
                chunk_index += 1

    if current_text.strip():
        for c in _split_to_max_tokens(current_text, chunk_index, current_section, current_page_start, current_page_end, doc_metadata):
            chunks.append(c)
            chunk_index += 1

    return chunks


def _split_to_max_tokens(
    text: str,
    start_index: int,
    section: str | None,
    page_start: int,
    page_end: int,
    metadata: dict | None,
) -> list[dict]:
    """Split long text into chunks respecting token limits."""
    tokens = _enc.encode(text)
    if len(tokens) <= MAX_CHUNK_TOKENS:
        return [{
            "chunk_index": start_index,
            "content": text.strip(),
            "chunk_type": "text",
            "section_title": section,
            "page_start": page_start,
            "page_end": page_end,
            "token_count": len(tokens),
            "metadata": metadata,
        }]

    results = []
    idx = start_index
    pos = 0
    while pos < len(tokens):
        end = min(pos + MAX_CHUNK_TOKENS, len(tokens))
        chunk_tokens = tokens[pos:end]
        chunk_text = _enc.decode(chunk_tokens).strip()
        if chunk_text:
            results.append({
                "chunk_index": idx,
                "content": chunk_text,
                "chunk_type": "text",
                "section_title": section,
                "page_start": page_start,
                "page_end": page_end,
                "token_count": len(chunk_tokens),
                "metadata": metadata,
            })
            idx += 1
        pos = end - OVERLAP_TOKENS if end < len(tokens) else end

    return results


def _table_to_text(table: list[list]) -> str:
    """Convert a table (list of rows) to a text representation."""
    if not table:
        return ""
    lines = []
    for row in table:
        line = " | ".join(str(cell) if cell else "" for cell in row)
        lines.append(line)
    return "\n".join(lines)
