"""
Convert the sowing pivot table CSV into a JSON file for the front-end.

Run:
    python3 scripts/convert_sowing.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "pivot_tables" / "operations_mastersheet - SOWING.csv"
TARGET = ROOT / "pivot_app" / "data" / "sowing.json"

NUMERIC_FIELDS = {
    "area_ha",
    "productivity",
    "year",
    "month",
    "day",
    "dose_kg_ha",
    "dose_kg_per_t",
    "repetitions",
    "covered_area",
}

RENAMED_FIELDS = {
    "dose_kg/t": "dose_kg_per_t",
}


def parse_number(value: str | None) -> float | int | None:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    normalized = stripped.replace(",", "")
    try:
        number = float(normalized)
    except ValueError:
        return None
    if number.is_integer():
        return int(number)
    return number


def normalize_field(key: str, value: str | None) -> tuple[str, Any]:
    target_key = RENAMED_FIELDS.get(key, key)
    if target_key in NUMERIC_FIELDS:
        return target_key, parse_number(value)
    if value is None:
        return target_key, ""
    return target_key, value.strip()


def build_records() -> list[Dict[str, Any]]:
    if not SOURCE.exists():
        raise SystemExit(f"Source file not found: {SOURCE}")
    records: list[Dict[str, Any]] = []
    with SOURCE.open(newline="", encoding="utf-8") as src:
        reader = csv.DictReader(src)
        for row in reader:
            cleaned: Dict[str, Any] = {}
            for key, value in row.items():
                target_key, normalized_value = normalize_field(key, value)
                cleaned[target_key] = normalized_value
            dmu_id = cleaned.get("dmu_id", "")
            cleaned["farmer_id"] = base_farmer_id(dmu_id)
            year = cleaned.get("year")
            month = cleaned.get("month")
            day = cleaned.get("day")
            if all(isinstance(v, int) for v in (year, month, day)):
                cleaned["date"] = f"{year:04d}-{month:02d}-{day:02d}"
            if isinstance(year, int):
                cleaned["season"] = year
            if "operation" in cleaned and isinstance(cleaned["operation"], str):
                cleaned["operation_normalized"] = cleaned["operation"].lower().strip()
                cleaned["operation_display"] = cleaned["operation"].title()
            records.append(cleaned)
    return records


def base_farmer_id(dmu_id: str | None) -> str:
    if not dmu_id:
        return ""
    parts = dmu_id.split("_")
    if len(parts) >= 2 and parts[-1].isdigit():
        return "_".join(parts[:-1])
    return dmu_id


def main() -> None:
    records = build_records()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with TARGET.open("w", encoding="utf-8") as dest:
        json.dump(records, dest, indent=2)
    print(f"Wrote {len(records)} records to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
