"""
Convert the fertilisation pivot table CSV into JSON for the front-end.

Run:
    python3 scripts/convert_fertilisation.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "pivot_tables" / "operations_mastersheet - FERTILISATION.csv"
TARGET = ROOT / "pivot_app" / "data" / "fertilisation.json"

NUMERIC_FIELDS = {
    "area_TOTAL",
    "productivity_weighted",
    "dose_kg_ha",
    "covered_area",
    "area_tonne",
    "n_density",
    "p_density",
    "k_density",
    "so4_density",
    "n_kg_ha_weight",
    "p_kg_ha_weight",
    "k_kg_ha_weight",
    "so4_kg_ha_weight",
    "n_kg_t",
    "p_kg_t",
    "k_kg_t",
    "so4_kg_t",
    "year",
    "month",
    "day",
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
    if key in NUMERIC_FIELDS:
        return key, parse_number(value)
    if value is None:
        return key, ""
    return key, value.strip()


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
