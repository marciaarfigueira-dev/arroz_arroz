"""
Convert the crop protection pivot table CSV into a JSON file the front-end can consume.

Run:
    python3 scripts/convert_operations.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "pivot_tables" / "operations_mastersheet - CROP_PROTECTION.csv"
TARGET = ROOT / "pivot_app" / "data" / "operations.json"

# Column names to coerce into numeric values after stripping commas.
NUMERIC_FIELDS = {
    "area_ha",
    "productivity",
    "year",
    "month",
    "day",
    "dose_kg_ha",
    "dose_kg_per_t",
    "milha",
    "junca",
    "pyricularia",
    "wild_rice",
    "gramineae",
    "broadleaves",
    "general_weeds",
    "piolho",
    "aphids",
    "lagarta_arroz",
    "lagarta_cartuxo",
    "heteranthera",
    "repetitions",
    "covered_area",
    "area_per_tonne",
}

# Keep the CSV keys tidy for JS consumption.
RENAMED_FIELDS = {
    "dose_kg/t": "dose_kg_per_t",
}

# Map enemy columns to slugs for consistent keys.
ENEMY_RENAMES = {
    "Digitaria sanguinalis": "digitaria_sanguinalis",
    "Cyperus esculentus": "cyperus_esculentus",
    "Pyricularia": "pyricularia",
    "Wild Rice": "wild_rice",
    "Gramineae": "gramineae",
    "Broadleaves": "broadleaves",
    "General Weeds": "general_weeds",
    "Weevil": "weevil",
    "Aphids": "aphids",
    "Rice Worms": "rice_worms",
    "Spodoptera frugiperda": "spodoptera_frugiperda",
    "Heteranthera": "heteranthera",
}

NUMERIC_FIELDS.update(ENEMY_RENAMES.values())


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


def normalize_field(key: str, value: str | None) -> Any:
    target_key = RENAMED_FIELDS.get(key, ENEMY_RENAMES.get(key, key))
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
            # Helpful denormalized values for the front-end.
            year = cleaned.get("year")
            month = cleaned.get("month")
            day = cleaned.get("day")
            season = season_from_dmu_or_year(dmu_id, year)
            date_year = season if isinstance(season, int) else year
            if all(isinstance(v, int) for v in (date_year, month, day)):
                cleaned["date"] = f"{date_year:04d}-{month:02d}-{day:02d}"
            if season is not None:
                cleaned["season"] = season
            # Normalize operation casing for predictable filtering.
            if "operation" in cleaned and isinstance(cleaned["operation"], str):
                cleaned["operation"] = cleaned["operation"].strip()
                cleaned["operation_normalized"] = cleaned["operation"].lower()
            records.append(cleaned)
    return records


def base_farmer_id(dmu_id: str | None) -> str:
    if not dmu_id:
        return ""
    parts = dmu_id.split("_")
    if len(parts) >= 2 and parts[-1].isdigit():
        return "_".join(parts[:-1])
    return dmu_id


def season_from_dmu_or_year(dmu_id: str | None, year: int | None) -> int | None:
    if dmu_id:
        parts = dmu_id.split("_")
        if len(parts) >= 2 and parts[-1].isdigit():
            return int(parts[-1])
    return year if isinstance(year, int) else None


def main() -> None:
    records = build_records()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with TARGET.open("w", encoding="utf-8") as dest:
        json.dump(records, dest, indent=2)
    print(f"Wrote {len(records)} records to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
