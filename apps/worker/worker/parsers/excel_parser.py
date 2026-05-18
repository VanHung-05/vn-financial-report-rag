from pathlib import Path

import pandas as pd


def parse_excel(file_path: str | Path) -> list[dict]:
    """Extract tables from Excel files (xlsx/xls/csv).

    Returns list of sheet dicts: [{"sheet": str, "tables": list[list[list]]}]
    """
    file_path = Path(file_path)
    suffix = file_path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(file_path, dtype=str)
        table = [df.columns.tolist()] + df.values.tolist()
        return [{"sheet": "Sheet1", "tables": [table]}]

    xls = pd.ExcelFile(file_path)
    results = []
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, dtype=str)
        df = df.dropna(how="all")
        if df.empty:
            continue
        table = [df.columns.tolist()] + df.fillna("").values.tolist()
        results.append({"sheet": sheet_name, "tables": [table]})

    return results
