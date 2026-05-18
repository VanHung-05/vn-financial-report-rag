"""PDF extraction: text layer first, then OCR for scanned Vietnamese reports."""
import io
import logging
import shutil
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from worker.config import settings

logger = logging.getLogger(__name__)

MIN_TEXT_CHARS = 80


def _parse_pdfplumber(file_path: Path) -> list[dict]:
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


def _parse_ocr(file_path: Path) -> list[dict]:
    import fitz
    import pytesseract
    from PIL import Image

    lang = _tesseract_langs()
    if not lang:
        raise RuntimeError(
            "OCR enabled but tesseract not found. Install: brew install tesseract tesseract-lang"
        )

    doc = fitz.open(file_path)
    scale = max(1.5, min(settings.ocr_dpi / 72.0, 3.0))
    matrix = fitz.Matrix(scale, scale)
    pages = []

    for i, page in enumerate(doc, start=1):
        text = (page.get_text() or "").strip()
        ocr_used = False

        if len(text) < 40:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            try:
                text = pytesseract.image_to_string(img, lang=lang)
                ocr_used = True
            except Exception as e:
                logger.warning("OCR failed page %s: %s", i, e)

        pages.append({
            "page": i,
            "text": text,
            "tables": [],
            "ocr_used": ocr_used,
        })

    doc.close()
    ocr_pages = sum(1 for p in pages if p["ocr_used"])
    logger.info("OCR %s: %s/%s pages", file_path.name, ocr_pages, len(pages))
    return pages


def _total_chars(pages: list[dict]) -> int:
    return sum(len(p.get("text") or "") for p in pages)


def parse_pdf(file_path: str | Path) -> list[dict]:
    """Extract text and tables from PDF; OCR when the file is image-only."""
    file_path = Path(file_path)
    pages = _parse_pdfplumber(file_path)
    best = pages
    best_chars = _total_chars(pages)

    pypdf_pages = _parse_pypdf(file_path)
    pypdf_chars = _total_chars(pypdf_pages)
    if pypdf_chars > best_chars:
        best = pypdf_pages
        best_chars = pypdf_chars

    if best_chars < MIN_TEXT_CHARS and settings.ocr_enabled:
        try:
            ocr_pages = _parse_ocr(file_path)
            ocr_chars = _total_chars(ocr_pages)
            if ocr_chars > best_chars:
                best = ocr_pages
                best_chars = ocr_chars
        except Exception as e:
            logger.warning("OCR skipped for %s: %s", file_path.name, e)

    if best_chars < MIN_TEXT_CHARS:
        logger.warning(
            "Low text yield (%s chars) for %s — PDF may need better OCR or vie tessdata",
            best_chars,
            file_path.name,
        )

    return best
