"""Resolve generator anchor facilities to the pinned EIA operating-plant inventory."""

from __future__ import annotations

import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
ANCHORS_PATH = ROOT / "terra-app" / "src" / "data" / "mw_anchor_facilities.geojson"
PROCESSED_ANCHORS_PATH = ROOT / "data" / "processed" / "mw_anchor_facilities.geojson"
PLANTS_PATH = ROOT / "data" / "processed" / "power_plants_with_ba.geojson"
COUNTIES_PATH = ROOT / "data" / "processed" / "mw_county_ees_summary.csv"
OUTPUT_PATH = ROOT / "generator_anchor_match_audit.csv"
EIA_ANCHOR_PATTERN = re.compile(r"^eia860_(\d+)_(\d{5})$")
STATE_BY_FIPS = {
    "08": "CO",
    "16": "ID",
    "30": "MT",
    "31": "NE",
    "32": "NV",
    "35": "NM",
    "46": "SD",
    "49": "UT",
    "56": "WY",
}


def normalize_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    normalized = re.sub(r"\bpower plant\b", "", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def aggregate_plants() -> pd.DataFrame:
    plants = gpd.read_file(PLANTS_PATH)
    plants["plantid"] = plants["plantid"].astype(str)
    plants["capacity_mw"] = pd.to_numeric(plants["capacity_mw"], errors="raise")
    return (
        plants.groupby("plantid", as_index=False)
        .agg(
            plant_name=("plantName", "first"),
            state=("stateid", "first"),
            county=("county", "first"),
            capacity_mw=("capacity_mw", "sum"),
        )
        .assign(normalized_name=lambda frame: frame["plant_name"].map(normalize_name))
    )


def main() -> None:
    anchor_collection = json.loads(ANCHORS_PATH.read_text())
    anchors = anchor_collection["features"]
    generators = [
        feature["properties"]
        for feature in anchors
        if feature["properties"].get("asset_class") == "generator"
    ]
    counties = pd.read_csv(COUNTIES_PATH, dtype={"geoid": str}).set_index("geoid")
    plants = aggregate_plants()
    rows: list[dict[str, object]] = []

    for anchor in generators:
        anchor_id = str(anchor.get("anchor_id", ""))
        geoid = str(anchor.get("geoid", "")).zfill(5)
        registry_capacity = anchor.get("capacity_or_load_mw")
        match = EIA_ANCHOR_PATTERN.fullmatch(anchor_id)
        matched: pd.Series | None = None
        method = "no_match"
        confidence = "unmatched"
        source_record_id: str | None = None

        if match:
            plant_code = match.group(1)
            candidates = plants[plants["plantid"] == plant_code]
            if len(candidates) == 1:
                matched = candidates.iloc[0]
                method = "eia_plant_code"
                confidence = "exact_id"
                source_record_id = f"eia_plant_{plant_code}"

        if matched is None and registry_capacity is not None:
            county_name = str(counties.loc[geoid, "county_name"])
            normalized_name = normalize_name(str(anchor.get("name", "")))
            candidates = plants[
                (plants["state"] == STATE_BY_FIPS.get(geoid[:2]))
                & (plants["county"].str.casefold() == county_name.casefold())
                & (plants["normalized_name"] == normalized_name)
            ].copy()
            candidates["capacity_delta_pct"] = (
                (candidates["capacity_mw"] - float(registry_capacity))
                / float(registry_capacity)
                * 100.0
            )
            candidates = candidates[candidates["capacity_delta_pct"].abs() <= 25.0]
            if len(candidates) == 1:
                matched = candidates.iloc[0]
                method = "normalized_name_county_capacity"
                confidence = "fuzzy"
                source_record_id = f"eia_plant_{matched['plantid']}"

        source_capacity = float(matched["capacity_mw"]) if matched is not None else None
        capacity_delta_pct = None
        if source_capacity is not None and registry_capacity not in (None, 0):
            capacity_delta_pct = (
                (source_capacity - float(registry_capacity))
                / float(registry_capacity)
                * 100.0
            )
        rows.append(
            {
                "source_record_id": source_record_id,
                "registry_facility_id": anchor_id,
                "match_method": method,
                "match_confidence": confidence,
                "capacity_mw_source": source_capacity,
                "capacity_mw_registry": registry_capacity,
                "capacity_delta_pct": capacity_delta_pct,
            }
        )
    audit = pd.DataFrame(rows)
    matched = audit[audit["match_confidence"].isin(["exact_id", "fuzzy"])]
    for _, duplicates in matched.groupby("source_record_id"):
        if len(duplicates) <= 1:
            continue
        flagship = duplicates[
            duplicates["registry_facility_id"].str.startswith("flagship_")
        ]
        keep_index = flagship.index[0] if len(flagship) == 1 else duplicates.index[0]
        drop_indexes = duplicates.index.difference([keep_index])
        audit.loc[drop_indexes, "match_method"] = "duplicate_registry_alias"
        audit.loc[drop_indexes, "match_confidence"] = "unmatched"

    audit_by_anchor = audit.set_index("registry_facility_id")
    for anchor in generators:
        anchor_id = str(anchor.get("anchor_id", ""))
        row = audit_by_anchor.loc[anchor_id]
        anchor["matched_source_record_id"] = (
            None if pd.isna(row["source_record_id"]) else row["source_record_id"]
        )
        anchor["match_method"] = row["match_method"]
        anchor["match_confidence"] = row["match_confidence"]
        anchor["capacity_mw_eia"] = (
            None if pd.isna(row["capacity_mw_source"]) else float(row["capacity_mw_source"])
        )
        anchor["capacity_delta_pct"] = (
            None if pd.isna(row["capacity_delta_pct"]) else float(row["capacity_delta_pct"])
        )

    audit.to_csv(OUTPUT_PATH, index=False)
    serialized = json.dumps(anchor_collection, separators=(",", ":"))
    ANCHORS_PATH.write_text(serialized)
    PROCESSED_ANCHORS_PATH.write_text(serialized)
    print(f"generator_anchors={len(audit)}")
    print(audit["match_confidence"].value_counts(dropna=False).to_string())
    fuzzy = audit[audit["match_confidence"] == "fuzzy"]
    if not fuzzy.empty:
        print("\nFuzzy matches:")
        print(fuzzy.to_string(index=False))
    unmatched = audit[audit["match_confidence"] == "unmatched"]
    if not unmatched.empty:
        print("\nUnmatched:")
        print(unmatched[["registry_facility_id", "capacity_mw_registry"]].to_string(index=False))


if __name__ == "__main__":
    main()
