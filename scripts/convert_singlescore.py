"""
Combine all singlescore JSON files into one bundle for the front-end.

Source files: singlescore/singlescore_*.json
Output: pivot_app/data/singlescore.json

Run:
    python3 scripts/convert_singlescore.py
"""

from __future__ import annotations

import json
from glob import glob
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
SOURCE_GLOB = str(ROOT / "singlescore" / "singlescore_*.json")
TARGET = ROOT / "pivot_app" / "data" / "singlescore.json"


def load_one(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text())
    data["source"] = path.name
    return data

def merge_records(records: list[Dict[str, Any]], label: str) -> Dict[str, Any]:
    if not records:
        return {}
    categories_map: Dict[str, Dict[str, Any]] = {}
    for rec in records:
        for cat in rec.get("categories", []):
            key = cat.get("impact_category", "Unknown")
            bucket = categories_map.setdefault(
                key,
                {
                    "impact_category": key,
                    "unit": cat.get("unit", ""),
                    "total": 0.0,
                    "contributors": {},
                },
            )
            bucket["total"] += cat.get("total", 0) or 0
            for contrib in cat.get("contributors", []):
                name = contrib.get("name", "Unknown")
                bucket["contributors"].setdefault(name, 0)
                bucket["contributors"][name] += contrib.get("score", 0) or 0
    merged_categories = []
    for cat_name, bucket in categories_map.items():
        total = bucket["total"]
        contributors_list = []
        for name, score in bucket["contributors"].items():
            share = None if total == 0 else score / total
            contributors_list.append({"name": name, "score": score, "share": share})
        merged_categories.append(
            {
                "impact_category": cat_name,
                "unit": bucket["unit"],
                "total": total,
                "contributors": contributors_list,
            }
        )
    merged_categories.sort(key=lambda x: x["impact_category"])
    base_fu = records[0].get("functional_unit", label)
    return {
        "product_id": label,
        "functional_unit": base_fu,
        "categories": merged_categories,
        "source": ",".join(sorted(rec.get("source", "") for rec in records)),
    }


def aggregate_special(records: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    targets = {
        "Insecticide": {"ids": {"singlescore_4_1", "singlescore_5_1"}},
        "Fungicide": {"ids": {"singlescore_6_1", "singlescore_7_1"}},
        "Herbicide": {"ids": {"singlescore_2_1", "singlescore_3_1"}},
    }
    used: set[str] = set()
    combined: list[Dict[str, Any]] = []
    by_id = {rec.get("product_id"): rec for rec in records}
    for label, config in targets.items():
        ids = config["ids"]
        selected = [by_id[i] for i in ids if i in by_id]
        if selected:
            combined.append(merge_records(selected, label))
            used.update(ids)
    for rec in records:
        if rec.get("product_id") not in used:
            combined.append(rec)
    return combined


def main() -> None:
    files = sorted(Path(p) for p in glob(SOURCE_GLOB))
    if not files:
        raise SystemExit("No singlescore files found.")
    records: List[Dict[str, Any]] = [load_one(p) for p in files]
    records = aggregate_special(records)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(records, indent=2))
    print(f"Wrote {len(records)} records to {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
