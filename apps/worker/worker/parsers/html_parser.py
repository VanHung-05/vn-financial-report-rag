from pathlib import Path

from bs4 import BeautifulSoup


def parse_html(file_path: str | Path) -> list[dict]:
    """Extract text and tables from HTML file.

    Returns [{"page": 1, "text": str, "tables": list[list[list]]}]
    """
    file_path = Path(file_path)
    html = file_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "lxml")

    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    tables = []
    for table_el in soup.find_all("table"):
        rows = []
        for tr in table_el.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)

    return [{"page": 1, "text": text, "tables": tables}]
