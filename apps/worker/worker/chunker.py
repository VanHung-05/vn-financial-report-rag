"""Financial-aware chunker for Vietnamese financial reports.

Splits extracted pages into semantically meaningful chunks based on
financial report structure rather than naive token-based splitting.

Improvements over v1:
- 35+ section patterns covering Vietnamese BCTC variants + banking reports
- Section title normalization (regex → human-readable names)
- Sub-section detection for Thuyết minh (I., II., 1., 2.)
- Paragraph-aware splitting (cut at \\n\\n or sentence boundaries)
- Table chunks with context headers
- Empty/short chunk filtering
"""
import re

import tiktoken

# ---------------------------------------------------------------------------
# Section detection — patterns mapped to normalized names
# ---------------------------------------------------------------------------

# Each tuple: (compiled regex, normalized Vietnamese title)
_SECTION_MAP: list[tuple[re.Pattern, str]] = [
    # --- Bảng cân đối kế toán / Statement of Financial Position ---
    (re.compile(r"BẢNG\s*CÂN\s*ĐỐI\s*KẾ\s*TOÁN", re.I), "Bảng cân đối kế toán"),
    (re.compile(r"BÁO\s*CÁO\s*TÌNH\s*HÌNH\s*TÀI\s*CHÍNH", re.I), "Bảng cân đối kế toán"),
    (re.compile(r"BALANCE\s*SHEET", re.I), "Bảng cân đối kế toán"),
    (re.compile(r"STATEMENT\s*OF\s*FINANCIAL\s*POSITION", re.I), "Bảng cân đối kế toán"),

    # --- Báo cáo kết quả kinh doanh / Income Statement ---
    (re.compile(r"BÁO\s*CÁO\s*KẾT\s*QUẢ\s*HOẠT\s*ĐỘNG\s*KINH\s*DOANH", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"KẾT\s*QUẢ\s*HOẠT\s*ĐỘNG\s*KINH\s*DOANH", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"INCOME\s*STATEMENT", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"STATEMENT\s*OF\s*(COMPREHENSIVE\s*)?INCOME", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"PROFIT\s*AND\s*LOSS", re.I), "Báo cáo kết quả kinh doanh"),

    # --- Báo cáo lưu chuyển tiền tệ / Cash Flow ---
    (re.compile(r"BÁO\s*CÁO\s*LƯU\s*CHUYỂN\s*TIỀN\s*TỆ", re.I), "Báo cáo lưu chuyển tiền tệ"),
    (re.compile(r"LƯU\s*CHUYỂN\s*TIỀN\s*TỆ", re.I), "Báo cáo lưu chuyển tiền tệ"),
    (re.compile(r"CASH\s*FLOW\s*STATEMENT", re.I), "Báo cáo lưu chuyển tiền tệ"),
    (re.compile(r"STATEMENT\s*OF\s*CASH\s*FLOW", re.I), "Báo cáo lưu chuyển tiền tệ"),

    # --- Thuyết minh BCTC / Notes ---
    (re.compile(r"THUYẾT\s*MINH\s*BÁO\s*CÁO\s*TÀI\s*CHÍNH", re.I), "Thuyết minh BCTC"),
    (re.compile(r"BẢN\s*THUYẾT\s*MINH", re.I), "Thuyết minh BCTC"),
    (re.compile(r"NOTES\s*TO\s*(THE\s*)?FINANCIAL\s*STATEMENTS?", re.I), "Thuyết minh BCTC"),

    # --- Báo cáo thay đổi vốn chủ sở hữu ---
    (re.compile(r"BÁO\s*CÁO\s*THAY\s*ĐỔI\s*VỐN\s*CHỦ\s*SỞ\s*HỮU", re.I), "Báo cáo thay đổi vốn chủ sở hữu"),
    (re.compile(r"STATEMENT\s*OF\s*CHANGES\s*IN\s*EQUITY", re.I), "Báo cáo thay đổi vốn chủ sở hữu"),

    # --- Ý kiến kiểm toán / Auditor's Report ---
    (re.compile(r"Ý\s*KIẾN\s*(CỦA\s*)?KIỂM\s*TOÁN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"BÁO\s*CÁO\s*KIỂM\s*TOÁN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"BÁO\s*CÁO\s*CỦA\s*KIỂM\s*TOÁN\s*VIÊN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"AUDITOR.?S?\s*REPORT", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"INDEPENDENT\s*AUDITOR", re.I), "Ý kiến kiểm toán"),

    # --- Báo cáo Ban Giám đốc / Ban TGĐ / HĐQT ---
    (re.compile(r"BÁO\s*CÁO\s*CỦA\s*BAN\s*GIÁM\s*ĐỐC", re.I), "Báo cáo Ban Giám đốc"),
    (re.compile(r"BÁO\s*CÁO\s*CỦA\s*BAN\s*TỔNG\s*GIÁM\s*ĐỐC", re.I), "Báo cáo Ban Giám đốc"),
    (re.compile(r"BÁO\s*CÁO\s*CỦA\s*HỘI\s*ĐỒNG\s*QUẢN\s*TRỊ", re.I), "Báo cáo Hội đồng quản trị"),
    (re.compile(r"MANAGEMENT\s*REPORT", re.I), "Báo cáo Ban Giám đốc"),
    (re.compile(r"BOARD\s*OF\s*DIRECTORS?\s*REPORT", re.I), "Báo cáo Hội đồng quản trị"),

    # --- Thông tin chung / General Information ---
    (re.compile(r"THÔNG\s*TIN\s*CHUNG", re.I), "Thông tin chung"),
    (re.compile(r"THÔNG\s*TIN\s*DOANH\s*NGHIỆP", re.I), "Thông tin chung"),
    (re.compile(r"GENERAL\s*INFORMATION", re.I), "Thông tin chung"),
    (re.compile(r"CORPORATE\s*INFORMATION", re.I), "Thông tin chung"),

    # --- Banking-specific ---
    (re.compile(r"BÁO\s*CÁO\s*AN\s*TOÀN\s*VỐN", re.I), "Báo cáo an toàn vốn"),
    (re.compile(r"THUYẾT\s*MINH.*RỦI\s*RO", re.I), "Thuyết minh rủi ro"),
    (re.compile(r"TÀI\s*SẢN\s*CÓ", re.I), "Tài sản có"),
    (re.compile(r"TÀI\s*SẢN\s*NỢ", re.I), "Tài sản nợ"),

    # --- Phụ lục / Appendix ---
    (re.compile(r"PHỤ\s*LỤC", re.I), "Phụ lục"),
]

# Sub-section patterns for Thuyết minh BCTC
_SUBSECTION_RE = re.compile(
    r"^(?:"
    r"(?P<roman>[IVXLC]+)\.\s+"                   # I. II. III. IV. V. ...
    r"|(?P<num>\d+)\.\s+"                           # 1. 2. 3. ...
    r"|(?P<dotnum>\d+\.\d+)\s+"                     # 1.1 1.2 2.1 ...
    r")"
    r"(?P<title>[A-ZÀ-Ỹa-zà-ỹ][\w\s,()–\-:]+)",  # Title text
    re.MULTILINE,
)

# ---------------------------------------------------------------------------
# Token handling
# ---------------------------------------------------------------------------

MAX_CHUNK_TOKENS = 800
OVERLAP_TOKENS = 100
MIN_CHUNK_CHARS = 30  # Skip chunks shorter than this

_enc = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


# ---------------------------------------------------------------------------
# Section detection
# ---------------------------------------------------------------------------

def remove_vietnamese_accents(text: str) -> str:
    """Strip all accents from Vietnamese text."""
    s1 = 'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ'
    s0 = 'AAAAEEEIIOOOOUUYaaaaeeeiioooouuyAaDdIiUuOoUuaaaaaaaaaaaaeeeeeeeeeeeeeeiiiooooooooooooouuuuuuuuuuuuyyyyyy'
    table = str.maketrans(s1, s0)
    return text.translate(table)


_UNACCENTED_SECTION_MAP: list[tuple[re.Pattern, str]] = [
    (re.compile(r"BANG\s*CAN\s*DOI\s*KE\s*TOAN", re.I), "Bảng cân đối kế toán"),
    (re.compile(r"BAO\s*CAO\s*TINH\s*HINH\s*TAI\s*CHINH", re.I), "Bảng cân đối kế toán"),
    (re.compile(r"BAO\s*CAO\s*KET\s*QUA\s*HOAT\s*DONG\s*KINH\s*DOANH", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"KET\s*QUA\s*HOAT\s*DONG\s*KINH\s*DOANH", re.I), "Báo cáo kết quả kinh doanh"),
    (re.compile(r"BAO\s*CAO\s*LUU\s*CHUYEN\s*TIEN\s*TE", re.I), "Báo cáo lưu chuyển tiền tệ"),
    (re.compile(r"LUU\s*CHUYEN\s*TIEN\s*TE", re.I), "Báo cáo lưu chuyển tiền tệ"),
    (re.compile(r"THUYET\s*MINH\s*BAO\s*CAO\s*TAI\s*CHINH", re.I), "Thuyết minh BCTC"),
    (re.compile(r"BAN\s*THUYET\s*MINH", re.I), "Thuyết minh BCTC"),
    (re.compile(r"BAO\s*CAO\s*THAY\s*DOI\s*VON\s*CHU\s*SO\s*HUU", re.I), "Báo cáo thay đổi vốn chủ sở hữu"),
    (re.compile(r"Y\s*KIEN\s*(CUA\s*)?KIEM\s*TOAN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"BAO\s*CAO\s*KIEM\s*TOAN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"BAO\s*CAO\s*CUA\s*KIEM\s*TOAN\s*VIEN", re.I), "Ý kiến kiểm toán"),
    (re.compile(r"BAO\s*CAO\s*CUA\s*BAN\s*GIAM\s*DOC", re.I), "Báo cáo Ban Giám đốc"),
    (re.compile(r"BAO\s*CAO\s*CUA\s*BAN\s*TONG\s*GIAM\s*DOC", re.I), "Báo cáo Ban Giám đốc"),
    (re.compile(r"BAO\s*CAO\s*CUA\s*HOI\s*DONG\s*QUAN\s*TRI", re.I), "Báo cáo Hội đồng quản trị"),
    (re.compile(r"THONG\s*TIN\s*CHUNG", re.I), "Thông tin chung"),
    (re.compile(r"THONG\s*TIN\s*DOANH\s*NGHIEP", re.I), "Thông tin chung"),
    (re.compile(r"BAO\s*CAO\s*AN\s*TOAN\s*VON", re.I), "Báo cáo an toàn vốn"),
    (re.compile(r"THUYET\s*MINH.*RUI\s*RO", re.I), "Thuyết minh rủi ro"),
    (re.compile(r"TAI\s*SAN\s*CO", re.I), "Tài sản có"),
    (re.compile(r"TAI\s*SAN\s*NO", re.I), "Tài sản nợ"),
    (re.compile(r"PHU\s*LUC", re.I), "Phụ lục"),
]


def detect_section(text: str) -> str | None:
    """Detect which financial report section this text belongs to.

    Returns the normalized section title or None.
    """
    # 1. Primary check: first 600 chars with original patterns
    snippet = text[:600].upper()
    for pattern, _name in _SECTION_MAP:
        if pattern.search(snippet):
            return _name

    # 2. Secondary check: unaccented regex check (for garbled OCR diacritics)
    unaccented_snippet = remove_vietnamese_accents(snippet)
    for pattern, _name in _UNACCENTED_SECTION_MAP:
        if pattern.search(unaccented_snippet):
            return _name

    # 3. Fallback signature check: check keyword density over the whole page (or first 2000 chars)
    # This prevents carry-forward issues when a page doesn't have an explicit header
    upper_text = remove_vietnamese_accents(text[:2500]).upper()
    
    # Signatures for Báo cáo kết quả kinh doanh (Income Statement / P&L)
    is_signatures = [
        "DOANH THU BAN HANG", "DOANH THU THUAN", "GIA VON HANG BAN", "LOI NHUAN GOP",
        "NET REVENUE", "COST OF GOODS SOLD", "GROSS PROFIT", "REVENUE DEDUCTION",
        "LOI NHUAN THUAN", "LOI NHUAN TRUOC THUE", "PROFIT BEFORE TAX", "LOI NHUAN SAU THUE"
    ]
    # Signatures for Bảng cân đối kế toán (Balance Sheet)
    bs_signatures = [
        "TONG CONG TAI SAN", "NO PHAI TRA", "VON CHU SO HUU", "TOTAL ASSETS", 
        "CURRENT ASSETS", "NON-CURRENT ASSETS", "LIABILITIES", "OWNERS EQUITY",
        "TAI SAN NGAN HAN", "TAI SAN DAI HAN"
    ]
    # Signatures for Báo cáo lưu chuyển tiền tệ (Cash Flow)
    cf_signatures = [
        "LUU CHUYEN TIEN TU", "LUU CHUYEN TIEN THUAN", "NET CASH FLOWS",
        "TIEN VA TUONG DUONG TIEN CUOI KY", "CASH AND CASH EQUIVALENTS AT THE END"
    ]
    
    is_count = sum(1 for sig in is_signatures if sig in upper_text)
    bs_count = sum(1 for sig in bs_signatures if sig in upper_text)
    cf_count = sum(1 for sig in cf_signatures if sig in upper_text)
    
    # Require at least 2 distinct signatures on the page to trigger fallback classification
    if is_count >= 2 and is_count > bs_count and is_count > cf_count:
        return "Báo cáo kết quả kinh doanh"
    elif bs_count >= 2 and bs_count > is_count and bs_count > cf_count:
        return "Bảng cân đối kế toán"
    elif cf_count >= 2 and cf_count > is_count and cf_count > bs_count:
        return "Báo cáo lưu chuyển tiền tệ"

    return None


def normalize_section_title(raw: str) -> str:
    """Map raw text to a normalized section title.

    If the text matches a known pattern, return the clean name.
    Otherwise return the raw text title-cased.
    """
    upper = raw.strip().upper()
    for pattern, name in _SECTION_MAP:
        if pattern.search(upper):
            return name
            
    # Try unaccented matching
    unaccented_upper = remove_vietnamese_accents(upper)
    for pattern, name in _UNACCENTED_SECTION_MAP:
        if pattern.search(unaccented_upper):
            return name
            
    return raw.strip()


# ---------------------------------------------------------------------------
# Sub-section detection for Thuyết minh
# ---------------------------------------------------------------------------

def _detect_subsections(text: str) -> list[tuple[int, str]]:
    """Find sub-section headings in text (for Thuyết minh BCTC).

    Returns list of (char_offset, heading_text).
    """
    results = []
    for m in _SUBSECTION_RE.finditer(text):
        heading = m.group(0).strip()
        # Only consider headings where the title part is mostly uppercase or title-case
        title_part = m.group("title").strip()
        if len(title_part) >= 4:
            results.append((m.start(), heading))
    return results


# ---------------------------------------------------------------------------
# Main chunking
# ---------------------------------------------------------------------------

def chunk_pages(pages: list[dict], doc_metadata: dict | None = None) -> list[dict]:
    """Chunk extracted pages into financial-aware chunks.

    Args:
        pages: list of {"page": int, "text": str, "tables": list}
        doc_metadata: metadata to attach to each chunk (ticker, period, etc.)

    Returns:
        list of chunk dicts ready to store
    """
    chunks: list[dict] = []
    current_section: str | None = None
    current_text = ""
    current_page_start = 1
    current_page_end = 1
    chunk_index = 0
    prev_line = ""  # Track last text line before a table (used as table context)

    for page_data in pages:
        page_num = page_data["page"]
        text = page_data.get("text", "")
        tables = page_data.get("tables", [])

        # Detect section change
        section = detect_section(text)
        if section and section != current_section:
            # Flush accumulated text as chunks
            if current_text.strip():
                new_chunks = _split_section_text(
                    current_text, chunk_index, current_section,
                    current_page_start, current_page_end, doc_metadata,
                )
                chunks.extend(new_chunks)
                chunk_index += len(new_chunks)
                current_text = ""
            current_section = section
            current_page_start = page_num

        current_text += f"\n{text}"
        current_page_end = page_num

        # Extract last non-empty line as potential table title context
        text_lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
        if text_lines:
            prev_line = text_lines[-1]

        # Process tables
        for table in tables:
            table_text = _table_to_text(table, current_section, page_num, prev_line)
            if table_text.strip() and len(table_text.strip()) >= MIN_CHUNK_CHARS:
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

    # Flush remaining text
    if current_text.strip():
        new_chunks = _split_section_text(
            current_text, chunk_index, current_section,
            current_page_start, current_page_end, doc_metadata,
        )
        chunks.extend(new_chunks)
        chunk_index += len(new_chunks)

    return chunks


def _split_section_text(
    text: str,
    start_index: int,
    section: str | None,
    page_start: int,
    page_end: int,
    metadata: dict | None,
) -> list[dict]:
    """Split section text into chunks.

    For Thuyết minh BCTC, tries to split by sub-sections first.
    Otherwise uses paragraph-aware token splitting.
    """
    text = text.strip()
    if not text or len(text) < MIN_CHUNK_CHARS:
        return []

    # For Thuyết minh, try sub-section splitting
    if section and "thuyết minh" in section.lower():
        subsection_chunks = _split_by_subsections(
            text, start_index, section, page_start, page_end, metadata,
        )
        if subsection_chunks:
            return subsection_chunks

    # Default: paragraph-aware token splitting
    return _split_paragraph_aware(
        text, start_index, section, page_start, page_end, metadata,
    )


def _split_by_subsections(
    text: str,
    start_index: int,
    section: str,
    page_start: int,
    page_end: int,
    metadata: dict | None,
) -> list[dict]:
    """Split Thuyết minh BCTC text by sub-section headings (I., II., 1., etc.)."""
    subsections = _detect_subsections(text)
    if len(subsections) < 2:
        return []  # Not enough sub-sections; fall back to default splitting

    results: list[dict] = []
    idx = start_index

    for i, (offset, heading) in enumerate(subsections):
        # Determine text range for this sub-section
        end_offset = subsections[i + 1][0] if i + 1 < len(subsections) else len(text)
        sub_text = text[offset:end_offset].strip()

        if len(sub_text) < MIN_CHUNK_CHARS:
            continue

        sub_title = f"{section} > {heading[:80]}"

        # If sub-section is small enough, keep as one chunk
        tokens = _enc.encode(sub_text)
        if len(tokens) <= MAX_CHUNK_TOKENS:
            results.append({
                "chunk_index": idx,
                "content": sub_text,
                "chunk_type": "text",
                "section_title": sub_title,
                "page_start": page_start,
                "page_end": page_end,
                "token_count": len(tokens),
                "metadata": metadata,
            })
            idx += 1
        else:
            # Further split large sub-sections
            for chunk in _split_paragraph_aware(
                sub_text, idx, sub_title, page_start, page_end, metadata,
            ):
                results.append(chunk)
                idx += 1

    # Handle text before the first sub-section
    if subsections and subsections[0][0] > MIN_CHUNK_CHARS:
        preamble = text[:subsections[0][0]].strip()
        if len(preamble) >= MIN_CHUNK_CHARS:
            for chunk in _split_paragraph_aware(
                preamble, idx, section, page_start, page_end, metadata,
            ):
                results.append(chunk)
                idx += 1

    return results


def _split_paragraph_aware(
    text: str,
    start_index: int,
    section: str | None,
    page_start: int,
    page_end: int,
    metadata: dict | None,
) -> list[dict]:
    """Split long text into chunks, preferring paragraph/sentence boundaries.

    Instead of cutting mid-token, tries to find a natural break point
    (double newline or period+space) within a ±100 token window.
    """
    text = text.strip()
    if not text or len(text) < MIN_CHUNK_CHARS:
        return []

    tokens = _enc.encode(text)
    if len(tokens) <= MAX_CHUNK_TOKENS:
        return [{
            "chunk_index": start_index,
            "content": text,
            "chunk_type": "text",
            "section_title": section,
            "page_start": page_start,
            "page_end": page_end,
            "token_count": len(tokens),
            "metadata": metadata,
        }]

    results: list[dict] = []
    idx = start_index
    pos = 0

    while pos < len(tokens):
        end = min(pos + MAX_CHUNK_TOKENS, len(tokens))
        chunk_tokens = tokens[pos:end]
        chunk_text = _enc.decode(chunk_tokens)

        # Try to find a natural break point near the end of the chunk
        if end < len(tokens):
            chunk_text = _find_break_point(chunk_text)
            # Re-encode to get actual token count after trimming
            chunk_tokens = _enc.encode(chunk_text)

        chunk_text = chunk_text.strip()
        if chunk_text and len(chunk_text) >= MIN_CHUNK_CHARS:
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

        # Advance with overlap
        actual_tokens_used = len(chunk_tokens)
        if end < len(tokens):
            pos = pos + max(actual_tokens_used - OVERLAP_TOKENS, 1)
        else:
            pos = end

    return results


def _find_break_point(text: str) -> str:
    """Find a natural break point near the end of the text.

    Looks for paragraph breaks (\\n\\n), then sentence endings (. ),
    then single newlines (\\n) in the last ~20% of the text.
    """
    search_start = max(0, int(len(text) * 0.75))
    tail = text[search_start:]

    # Priority 1: paragraph break
    para_pos = tail.rfind("\n\n")
    if para_pos > 0:
        return text[:search_start + para_pos]

    # Priority 2: sentence ending (Vietnamese sentences often end with ". ")
    for sep in [". ", ".\n", ";\n", ";\n"]:
        sent_pos = tail.rfind(sep)
        if sent_pos > 0:
            return text[:search_start + sent_pos + len(sep)]

    # Priority 3: any newline
    nl_pos = tail.rfind("\n")
    if nl_pos > 0:
        return text[:search_start + nl_pos]

    # No good break found → return as-is
    return text


# ---------------------------------------------------------------------------
# Table → text conversion
# ---------------------------------------------------------------------------

def _table_to_text(
    table: list[list],
    section: str | None = None,
    page_num: int | None = None,
    context_line: str | None = None,
) -> str:
    """Convert a table (list of rows) to a text representation with context.

    Adds a header with section and page info, plus context from surrounding text.
    """
    if not table:
        return ""

    # Filter out rows that are completely empty
    filtered = [row for row in table if any(str(cell).strip() for cell in row if cell)]
    if not filtered:
        return ""

    # Skip tables with only 1 cell (usually not a real table)
    if len(filtered) <= 1 and all(len(row) <= 1 for row in filtered):
        return ""

    parts: list[str] = []

    # Header with context
    header_parts = ["[Bảng]"]
    if section:
        header_parts.append(section)
    if page_num:
        header_parts.append(f"Trang {page_num}")
    parts.append(" — ".join(header_parts))

    # Context line (often the table title from text above)
    if context_line and len(context_line) > 5 and len(context_line) < 200:
        parts.append(context_line)

    parts.append("")  # blank line before table data

    # Table rows
    for row in filtered:
        line = " | ".join(str(cell).strip() if cell else "" for cell in row)
        parts.append(line)

    return "\n".join(parts)
