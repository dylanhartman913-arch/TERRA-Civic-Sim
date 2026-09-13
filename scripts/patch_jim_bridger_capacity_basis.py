#!/usr/bin/env python3
"""
Patch Jim Bridger Power Plant capacity_basis in
data/processed/mw_anchor_facilities.geojson.

Decision (documented in DECISIONS.md):
  Use capacity_basis = "net_summer" with capacity_basis_vintage = "2024"
  and a new capacity_basis_note field explaining that net winter capability
  matches net summer (both 2,119 MW in the 2024 EIA-860 workbook; rounded
  to 2,120 MW here).

  Rationale for choosing "net_summer" over a new "net_summer_winter" enum:
  - "net_summer" is the primary EIA-860 reporting field and already a
    well-understood term for generator capacity.
  - The note field carries the winter agreement without inflating the enum.
  - Introducing "net_summer_winter" as a new schema value adds ambiguity
    about whether it means "minimum of the two" or "both are equal".
"""
import json
import pathlib

TARGETS = [
    pathlib.Path("data/processed/mw_anchor_facilities.geojson"),
    pathlib.Path("terra-app/src/data/mw_anchor_facilities.geojson"),
]

NOTE = (
    "2024 EIA-860 reports 2,119 MW net summer AND net winter capability "
    "(both identical); rounded to 2,120 MW. Net summer used as basis per "
    "EIA primary reporting convention; winter agreement noted here."
)

for TARGET in TARGETS:
    data = json.loads(TARGET.read_text())
    patched = 0
    for feature in data["features"]:
        props = feature["properties"]
        if props.get("name") == "Jim Bridger Power Plant":
            props["capacity_basis"] = "net_summer"
            props["capacity_basis_vintage"] = "2024"
            props["capacity_basis_note"] = NOTE
            print(f"Patched {TARGET}: {props['name']}")
            patched += 1
    assert patched == 1, f"Expected 1 record patched in {TARGET}, got {patched}"
    TARGET.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"  Written to {TARGET}")
