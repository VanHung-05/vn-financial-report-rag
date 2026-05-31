"""PDF extraction: text layer first, per-page OCR fallback for scanned Vietnamese reports.

Improvements over v1:
- Per-page OCR: only OCR pages with insufficient text (not the whole file)
- Image preprocessing before OCR (grayscale + auto-contrast)
- Dynamic DPI scaling for small pages
- Hybrid extraction: merge text-layer + OCR when page has partial text
- Quality logging per page
"""
import io
import logging
import shutil
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from worker.config import settings

logger = logging.getLogger(__name__)

# Minimum chars for a page to be considered "has enough text"
MIN_PAGE_CHARS = 80
# Minimum chars for a page to attempt hybrid (text + OCR) merge
HYBRID_THRESHOLD = 40


def _parse_pdfplumber(file_path: Path) -> list[dict]:
    """Extract text + tables per page using pdfplumber."""
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            tables = []
            for table in page.extract_tables():
                if table:
                    tables.append(table)
            pages.append({
                "page": i,
                "text": text,
                "tables": tables,
                "ocr_used": False,
            })
    return pages


def _parse_pypdf(file_path: Path) -> list[dict]:
    """Extract text per page using pypdf (fallback, no table extraction)."""
    reader = PdfReader(str(file_path))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append({
            "page": i,
            "text": text,
            "tables": [],
            "ocr_used": False,
        })
    return pages


# ---------------------------------------------------------------------------
# OCR helpers
# ---------------------------------------------------------------------------

def _tesseract_langs() -> str:
    """Pick OCR languages; fall back to eng if vie is not installed."""
    preferred = settings.ocr_lang.strip() or "vie+eng"
    if not shutil.which("tesseract"):
        return ""
    try:
        import pytesseract

        installed = pytesseract.get_languages(config="")
        parts = [p.strip() for p in preferred.replace(",", "+").split("+") if p.strip()]
        available = [p for p in parts if p in installed]
        if available:
            return "+".join(available)
        if "eng" in installed:
            return "eng"
    except Exception:
        pass
    return preferred


def _preprocess_image(img):
    """Preprocess image for better OCR: grayscale + auto-contrast."""
    from PIL import ImageOps

    # Convert to grayscale
    if img.mode != "L":
        img = img.convert("L")

    # Auto-contrast to normalize brightness/contrast
    img = ImageOps.autocontrast(img, cutoff=1)

    return img


def _ocr_single_page(fitz_page, lang: str, scale: float) -> str:
    """OCR a single page with image preprocessing."""
    import fitz
    import pytesseract
    from PIL import Image

    matrix = fitz.Matrix(scale, scale)
    pix = fitz_page.get_pixmap(matrix=matrix, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png")))

    # Preprocess for better OCR quality
    img = _preprocess_image(img)

    # Dynamic DPI: increase scale for small pages
    width = img.width
    if width < 800:
        # Re-render at higher scale for very small pages
        higher_scale = min(scale * 2.0, 4.0)
        matrix = fitz.Matrix(higher_scale, higher_scale)
        pix = fitz_page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        img = _preprocess_image(img)

    try:
        text = pytesseract.image_to_string(img, lang=lang)
        return text.strip()
    except Exception as e:
        logger.warning("OCR failed: %s", e)
        return ""


def _compute_scale() -> float:
    """Compute rendering scale from configured DPI."""
    return max(1.5, min(settings.ocr_dpi / 72.0, 3.0))


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_pdf(file_path: str | Path) -> list[dict]:
    """Extract text and tables from PDF; per-page OCR when text layer is weak.

    Strategy:
    1. Parse all pages with pdfplumber (text + tables) and pypdf (text only)
    2. For each page, pick the best text between pdfplumber/pypdf
    3. For pages with insufficient text (< MIN_PAGE_CHARS), OCR only that page
    4. For pages with partial text (HYBRID_THRESHOLD < chars < MIN_PAGE_CHARS),
       try hybrid merge: keep existing text + append OCR-only content
    """
    file_path = Path(file_path)

    # Step 1: Parse with both extractors
    plumber_pages = _parse_pdfplumber(file_path)
    pypdf_pages = _parse_pypdf(file_path)

    # Step 2: Merge — per page, pick the best text source
    best_pages = _merge_text_sources(plumber_pages, pypdf_pages)

    # Step 3: Per-page OCR for weak pages
    if settings.ocr_enabled:
        best_pages = _apply_per_page_ocr(file_path, best_pages)

    # Log quality summary
    _log_quality(file_path, best_pages)

    return best_pages


def _merge_text_sources(plumber_pages: list[dict], pypdf_pages: list[dict]) -> list[dict]:
    """For each page, keep the text source with more content. Preserve pdfplumber tables."""
    merged = []
    max_pages = max(len(plumber_pages), len(pypdf_pages))

    for i in range(max_pages):
        plumber = plumber_pages[i] if i < len(plumber_pages) else None
        pypdf = pypdf_pages[i] if i < len(pypdf_pages) else None

        if plumber and pypdf:
            plumber_len = len(plumber.get("text") or "")
            pypdf_len = len(pypdf.get("text") or "")

            if pypdf_len > plumber_len * 1.2:
                # pypdf extracted significantly more text
                merged.append({
                    "page": plumber["page"],
                    "text": pypdf["text"],
                    "tables": plumber["tables"],  # Keep pdfplumber tables
                    "ocr_used": False,
                })
            else:
                merged.append(plumber)
        elif plumber:
            merged.append(plumber)
        elif pypdf:
            merged.append(pypdf)

    return merged


def _ocr_gemini_vision(img_bytes: bytes, api_key: str, model: str) -> str:
    """OCR a single page image using Gemini Vision API."""
    import base64
    import httpx
    
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    params = {"key": api_key}
    
    prompt = (
        "Bạn là một công cụ OCR chuyên nghiệp được tối ưu cho các tài liệu và báo cáo tài chính tiếng Việt. "
        "Hãy trích xuất toàn bộ chữ viết và tất cả số liệu trong ảnh báo cáo tài chính này một cách cực kỳ chính xác. "
        "LƯU Ý CỰC KỲ QUAN TRỌNG:\n"
        "- Giữ nguyên các chữ tiếng Việt có dấu (diacritics), không làm mất dấu hay sai chính tả.\n"
        "- Giữ cấu trúc dòng và bảng số liệu nếu có để dễ dàng đọc và đối chiếu số liệu.\n"
        "- Chỉ trả về văn bản trích xuất được từ tài liệu, không giải thích dài dòng hay thêm bớt gì khác ngoài nội dung tài liệu."
    )
    
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": img_b64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 4096
        }
    }
    
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, params=params, json=body)
            resp.raise_for_status()
            data = resp.json()
            
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts if "text" in p]
                return "".join(text_parts).strip()
    except Exception as e:
        logger.warning("Gemini Vision OCR failed, falling back: %s", e)
    return ""


def _apply_per_page_ocr(file_path: Path, pages: list[dict]) -> list[dict]:
    """Apply OCR only to pages with insufficient text."""
    # Check if any page needs OCR
    pages_needing_ocr = [
        i for i, p in enumerate(pages)
        if len(p.get("text") or "") < MIN_PAGE_CHARS
    ]

    if not pages_needing_ocr:
        return pages

    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed — skipping OCR")
        return pages

    doc = fitz.open(file_path)
    ocr_count = 0

    has_gemini = bool(settings.gemini_api_key)
    lang = _tesseract_langs()
    scale = _compute_scale()

    try:
        for page_idx in pages_needing_ocr:
            if page_idx >= len(doc):
                continue

            fitz_page = doc[page_idx]
            existing_text = pages[page_idx].get("text") or ""
            existing_len = len(existing_text)

            ocr_text = ""

            # Try Gemini Vision OCR first if enabled
            if has_gemini:
                logger.info("Page %d has insufficient text. Attempting Gemini Vision OCR...", page_idx + 1)
                try:
                    # Render at slightly higher quality for Gemini
                    gemini_matrix = fitz.Matrix(2.0, 2.0)
                    pix = fitz_page.get_pixmap(matrix=gemini_matrix, alpha=False)
                    img_bytes = pix.tobytes("png")
                    model = settings.llm_model or "gemini-3.1-flash-lite"
                    ocr_text = _ocr_gemini_vision(img_bytes, settings.gemini_api_key, model)
                except Exception as e:
                    logger.warning("Failed to render page or call Gemini Vision OCR: %s", e)

            # Fallback to local Tesseract OCR
            if not ocr_text.strip() and lang:
                logger.info("Falling back to local Tesseract OCR for page %d...", page_idx + 1)
                ocr_text = _ocr_single_page(fitz_page, lang, scale)

            if not ocr_text.strip():
                continue

            if existing_len < HYBRID_THRESHOLD:
                # Very little text — replace with OCR
                pages[page_idx]["text"] = ocr_text
                pages[page_idx]["ocr_used"] = True
                ocr_count += 1
            elif existing_len < MIN_PAGE_CHARS and len(ocr_text) > existing_len:
                # Partial text — use OCR if it has more content
                pages[page_idx]["text"] = ocr_text
                pages[page_idx]["ocr_used"] = True
                ocr_count += 1
    finally:
        doc.close()

    if ocr_count:
        logger.info(
            "OCR %s: %d/%d pages OCR'd (of %d needing OCR)",
            file_path.name, ocr_count, len(pages_needing_ocr), len(pages),
        )

    return pages


def _log_quality(file_path: Path, pages: list[dict]) -> None:
    """Log extraction quality summary."""
    total = len(pages)
    if total == 0:
        logger.warning("No pages extracted from %s", file_path.name)
        return

    total_chars = sum(len(p.get("text") or "") for p in pages)
    ocr_pages = sum(1 for p in pages if p.get("ocr_used"))
    empty_pages = sum(1 for p in pages if len(p.get("text") or "") < MIN_PAGE_CHARS)
    table_pages = sum(1 for p in pages if p.get("tables"))

    if total_chars < MIN_PAGE_CHARS:
        logger.warning(
            "Low text yield (%d chars) for %s — "
            "PDF may need better OCR or vie tessdata",
            total_chars, file_path.name,
        )
    else:
        logger.info(
            "Parsed %s: %d pages, %d chars, %d OCR'd, %d with tables, %d empty",
            file_path.name, total, total_chars, ocr_pages, table_pages, empty_pages,
        )
