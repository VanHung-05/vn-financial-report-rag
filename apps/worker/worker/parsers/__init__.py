from worker.parsers.pdf_parser import parse_pdf
from worker.parsers.excel_parser import parse_excel
from worker.parsers.text_parser import parse_text
from worker.parsers.docx_parser import parse_docx
from worker.parsers.html_parser import parse_html

__all__ = ["parse_pdf", "parse_excel", "parse_text", "parse_docx", "parse_html"]
