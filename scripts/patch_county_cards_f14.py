#!/usr/bin/env python3
"""
Patch data/processed/mw_county_cards.json to restore W7-0 flagship
capacity corrections that S7a's nb14 re-run regressed.

F14 — same defect class as F1 (capacity mismatch vs authoritative
mw_anchor_facilities.geojson), but in mw_county_cards.json.

Capacity fixes:
  Dave Johnston Power Plant:          762 → 816.7  (nameplate total)
  Meta AI Data Center (Cheyenne):     100 → 152    (load estimate)
  Jade/Crusoe Campus Phase 1:        200 → 1800   (load estimate)

Provenance field restoration (all five flagship records that W7-0 corrected):
  capacity_basis, capacity_vintage — restored to W7-0 values.
"""
import json
import pathlib

TARGET = pathlib.Path("data/processed/mw_county_cards.json")

# Each entry: (geoid, name, field_patches)
PATCHES = [
    ("56009", "Dave Johnston Power Plant", {
        "capacity_or_load_mw": 816.7,
        "capacity_basis": "nameplate",
        "capacity_vintage": "2026-05",
        "notes": (
            "PacifiCorp / Pacific Power; Glenrock WY. The selected value is the "
            "four-unit EIA operating-generator nameplate total (816.7 MW) for "
            "2026-05. The same source reports 745 MW net summer and 755 MW net "
            "winter capacity."
        ),
    }),
    ("56021", "Meta AI Data Center (Cheyenne)", {
        "capacity_or_load_mw": 152,
        "capacity_basis": "load",
        "capacity_vintage": "2026-07",
    }),
    ("56021", "Jade/Crusoe Campus Phase 1 (Cheyenne)", {
        "capacity_or_load_mw": 1800,
        "capacity_basis": "load",
        "capacity_vintage": "2025-07",
    }),
    ("56023", "Kemmerer Unit 1 (Natrium)", {
        "capacity_basis": "planning",
        "capacity_vintage": "2025-01",
    }),
    ("56037", "Jim Bridger Power Plant", {
        "capacity_basis": "planning",
        "capacity_vintage": "2024",
    }),
]

data = json.loads(TARGET.read_text())

patched = 0
for geoid, name, fields in PATCHES:
    card = data.get(geoid)
    if not card:
        raise ValueError(f"County {geoid} not found")
    flagships = card.get("flagship_assets", [])
    found = False
    for fa in flagships:
        if fa.get("name") == name:
            for field, new_val in fields.items():
                old_val = fa.get(field)
                if old_val != new_val:
                    print(f"  {name}: {field} {old_val!r} → {new_val!r}")
                fa[field] = new_val
            found = True
            patched += 1
            break
    if not found:
        raise ValueError(f"Flagship '{name}' not found in {geoid}")

assert patched == len(PATCHES), f"Expected {len(PATCHES)} patches, got {patched}"

TARGET.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print(f"\nPatched {patched} records in {TARGET}")
