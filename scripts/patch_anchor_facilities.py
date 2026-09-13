#!/usr/bin/env python3
"""
Patch data/processed/mw_anchor_facilities.geojson to match
terra-app/src/data/mw_anchor_facilities.geojson (F1 fix).

Changes:
  Dave Johnston Power Plant:    capacity_or_load_mw 762 → 816.7
                                capacity_delta_pct  7.178… → 0
  Meta AI Data Center (Cheyenne): capacity_or_load_mw 100 → 152
  Jade/Crusoe Campus Phase 1 (Cheyenne): capacity_or_load_mw 200 → 1800
"""
import json
import pathlib

TARGET = pathlib.Path("data/processed/mw_anchor_facilities.geojson")

PATCHES = {
    "Dave Johnston Power Plant": {
        "capacity_or_load_mw": 816.7,
        "capacity_delta_pct": 0,
    },
    "Meta AI Data Center (Cheyenne)": {
        "capacity_or_load_mw": 152,
    },
    "Jade/Crusoe Campus Phase 1 (Cheyenne)": {
        "capacity_or_load_mw": 1800,
    },
}

data = json.loads(TARGET.read_text())

patched = 0
for feature in data["features"]:
    name = feature["properties"].get("name")
    if name in PATCHES:
        for field, new_val in PATCHES[name].items():
            old_val = feature["properties"].get(field)
            print(f"  {name}: {field} {old_val!r} → {new_val!r}")
            feature["properties"][field] = new_val
        patched += 1

assert patched == len(PATCHES), f"Expected {len(PATCHES)} records patched, got {patched}"

TARGET.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
print(f"\nPatched {patched} records. Written to {TARGET}")
