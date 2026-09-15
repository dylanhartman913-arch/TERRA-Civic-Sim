#!/usr/bin/env python3
"""
Sync shared fields from data/processed/mw_county_cards.json (Python, authoritative)
into terra-app/src/data/county_cards.json (TS), preserving TS-only keys
(anchor_facilities, economic_drivers, etc.).
"""
import json
import pathlib

PY_PATH = pathlib.Path("data/processed/mw_county_cards.json")
TS_PATH = pathlib.Path("terra-app/src/data/county_cards.json")

SHARED_KEYS = {
    "E", "Ec", "S", "county_name", "employment", "flagship_assets", "fuel_mix",
    "generation_capacity_mw", "geoid", "median_household_income", "per_capita_income",
    "population", "source_demographics", "source_employment", "state",
    "water_vintage", "water_withdrawals_mgd",
}

py = json.loads(PY_PATH.read_text())
ts = json.loads(TS_PATH.read_text())

changed = 0
for geoid in ts:
    if geoid not in py:
        continue
    for k in SHARED_KEYS:
        if k in py[geoid]:
            if ts[geoid].get(k) != py[geoid][k]:
                changed += 1
            ts[geoid][k] = py[geoid][k]

TS_PATH.write_text(json.dumps(ts, indent=2, ensure_ascii=False) + "\n")
print(f"Synced {len(SHARED_KEYS)} shared keys across {len(ts)} counties ({changed} field-level changes)")
