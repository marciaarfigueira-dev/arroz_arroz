"""
Parse characterisation Excel sheets into a JSON bundle similar to singlescore.

Source: characterisation/characterisation.xlsx (multiple sheets)
Each sheet contains:
  - Product line (row with "Product:" and the product description)
  - Table headed by "Impact category", "Unit", "Total", ...

Output: pivot_app/data/characterisation.json
  [
    {
      "product_id": "<sheet name>",
      "product_name": "<product description>",
      "categories": [
        {"impact_category": "...", "unit": "...", "total": <float>}
      ]
    },
    ...
  ]
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "characterisation" / "characterisation.xlsx"
TARGET = ROOT / "pivot_app" / "data" / "characterisation.json"


def parse_sheet(xl: pd.ExcelFile, sheet_name: str) -> Dict[str, Any] | None:
  df = xl.parse(sheet_name, header=None)
  product_name = None
  for _, row in df.iterrows():
    if str(row.iloc[0]).strip() == "Product:":
      product_name = str(row.iloc[1]).strip()
      break
  header_row = None
  for idx, row in df.iterrows():
    if str(row.iloc[0]).strip() == "Impact category":
      header_row = idx
      break
  if header_row is None:
    return None
  table = xl.parse(sheet_name, header=header_row)
  # Identify the column holding numeric results: prefer an explicit "Total"
  # column; otherwise take the first column after "Unit".
  candidate_cols = [c for c in table.columns if c not in ("Impact category", "Unit")]
  value_col = None
  for col in candidate_cols:
    if str(col).strip().lower() == "total":
      value_col = col
      break
  if value_col is None and candidate_cols:
    value_col = candidate_cols[0]
  categories: List[Dict[str, Any]] = []
  for _, row in table.iterrows():
    impact = row.get("Impact category")
    unit = row.get("Unit")
    total = row.get(value_col) if value_col is not None else None
    if pd.isna(impact):
      continue
    categories.append(
      {
        "impact_category": str(impact).strip(),
        "unit": "" if pd.isna(unit) else str(unit).strip(),
        "total": None if pd.isna(total) else float(total),
      }
    )
  return {
    "product_id": sheet_name,
    "product_name": product_name or sheet_name,
    "categories": categories,
  }


def main() -> None:
  if not SOURCE.exists():
    raise SystemExit(f"Source file not found: {SOURCE}")
  xl = pd.ExcelFile(SOURCE)
  records: List[Dict[str, Any]] = []
  for sheet in xl.sheet_names:
    parsed = parse_sheet(xl, sheet)
    if parsed:
      records.append(parsed)
  TARGET.parent.mkdir(parents=True, exist_ok=True)
  TARGET.write_text(json.dumps(records, indent=2))
  print(f"Wrote {len(records)} records to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
  main()
