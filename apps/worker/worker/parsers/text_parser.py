from pathlib import Path


def parse_text(file_path: str | Path) -> list[dict]:
    """Parse plain text file.

    Returns [{"page": 1, "text": str, "tables": []}]
    """
    file_path = Path(file_path)
    text = file_path.read_text(encoding="utf-8", errors="replace")
    return [{"page": 1, "text": text, "tables": []}]
