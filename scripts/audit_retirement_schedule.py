"""Audit baseline retirement identities against the pinned operating-generator file."""

from __future__ import annotations

import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RETIREMENTS_PATH = ROOT / "terra-app" / "src" / "data" / "baseline_retirements.json"
PLANTS_PATH = ROOT / "data" / "processed" / "power_plants_with_ba.geojson"
COUNTIES_PATH = ROOT / "data" / "processed" / "mw_county_ees_summary.csv"
OUTPUT_PATH = ROOT / "retirement_schedule_audit.csv"


def normalize_plant_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return re.sub(r"\bpower plant\b", "", normalized).strip()


def main() -> None:
    retirements = json.loads(RETIREMENTS_PATH.read_text())
    county_names = pd.read_csv(COUNTIES_PATH, dtype={"geoid": str}).set_index("geoid")
    plants = gpd.read_file(PLANTS_PATH)
    plants["plantid"] = plants["plantid"].astype(str)
    plants["capacity_mw"] = pd.to_numeric(plants["capacity_mw"], errors="raise")
    plants["normalized_name"] = plants["plantName"].map(normalize_plant_name)

    rows: list[dict[str, object]] = []
    for geoid, county_entries in retirements.items():
        if geoid == "_meta":
            continue
        county_in_file = str(county_names.loc[geoid, "county_name"])
        for entry_name, entry in county_entries.items():
            normalized_entry_name = normalize_plant_name(entry_name)
            candidates = plants[
                (plants["stateid"] == "WY")
                & (plants["county"].str.casefold() == county_in_file.casefold())
                & (plants["normalized_name"] == normalized_entry_name)
            ]
            candidate_codes = candidates["plantid"].drop_duplicates().tolist()
            capacity_in_file = sum(float(unit["capacity_mw"]) for unit in entry["units"])
            unit_count_in_file = len(entry["units"])

            matched_code: str | None = None
            capacity_eia: float | None = None
            unit_count_eia: int | None = None
            county_eia: str | None = None
            if len(candidate_codes) == 1:
                matched_code = candidate_codes[0]
                matched = candidates[candidates["plantid"] == matched_code]
                capacity_eia = float(matched["capacity_mw"].sum())
                unit_count_eia = int(matched["generatorid"].astype(str).nunique())
                county_eia = str(matched["county"].iloc[0])

            code_in_file = str(entry["plant_id"])
            if matched_code is None:
                match_status = "no_unique_name_state_county_match"
                verdict = "unresolved_no_confident_match"
            elif code_in_file != matched_code:
                match_status = "name_state_county_match_code_differs"
                verdict = "wrong_plant_code"
            elif capacity_eia != capacity_in_file or unit_count_eia != unit_count_in_file:
                match_status = "name_state_county_match_capacity_or_units_differ"
                verdict = "capacity_mismatch"
            else:
                match_status = "name_state_county_match_all_fields_agree"
                verdict = "confirmed_correct"

            rows.append(
                {
                    "entry_name_in_file": entry_name,
                    "plant_code_in_file": code_in_file,
                    "eia_plant_code_by_name_match": matched_code,
                    "match_status": match_status,
                    "capacity_mw_in_file": capacity_in_file,
                    "capacity_mw_eia": capacity_eia,
                    "unit_count_in_file": unit_count_in_file,
                    "unit_count_eia": unit_count_eia,
                    "county_in_file": county_in_file,
                    "county_eia": county_eia,
                    "verdict": verdict,
                }
            )

    audit = pd.DataFrame(rows)
    audit.to_csv(OUTPUT_PATH, index=False)
    print(audit.to_string(index=False))


if __name__ == "__main__":
    main()
