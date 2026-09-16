"""Build facility-level Ec attribution using the exact 08b generator-capacity term."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from generator_capacity_comparison import county_generator_term, study_tracts


ROOT = Path(__file__).resolve().parents[1]
ANCHORS_PATH = ROOT / "terra-app" / "src" / "data" / "mw_anchor_facilities.geojson"
PROCESSED_ANCHORS_PATH = ROOT / "data" / "processed" / "mw_anchor_facilities.geojson"
PLANTS_PATH = ROOT / "data" / "processed" / "power_plants_with_ba.geojson"
MATCH_AUDIT_PATH = ROOT / "generator_anchor_match_audit.csv"
OUTPUT_PATH = ROOT / "generator_anchor_attribution_audit.csv"


def weighted_average(group: pd.DataFrame, value_column: str) -> float:
    weights = group["population"].fillna(0).clip(lower=0)
    if weights.sum() > 0:
        return float(np.average(group[value_column], weights=weights))
    return float(group[value_column].mean())


def main() -> None:
    tracts = study_tracts()
    _, total_scored = county_generator_term(PLANTS_PATH, tracts)
    minimum = float(total_scored["gen_cap_50km_mw"].min())
    maximum = float(total_scored["gen_cap_50km_mw"].max())
    if not np.isclose(minimum, 0.0, atol=1e-12):
        raise RuntimeError(
            f"Facility decomposition requires the observed zero-capacity minimum; got {minimum}"
        )
    if maximum <= minimum:
        raise RuntimeError(f"Invalid generator-capacity range: {minimum} to {maximum}")
    ec_slope = 10.0 / (maximum - minimum) / 6.0

    match_audit = pd.read_csv(MATCH_AUDIT_PATH, dtype={"source_record_id": str})
    matched = match_audit[match_audit["match_confidence"].isin(["exact_id", "fuzzy"])].copy()
    matched["plantid"] = matched["source_record_id"].str.removeprefix("eia_plant_")
    if matched["plantid"].duplicated().any():
        duplicates = matched.loc[matched["plantid"].duplicated(False), "plantid"].tolist()
        raise RuntimeError(f"Canonical anchor matches still contain duplicate plants: {duplicates}")

    plants = gpd.read_file(PLANTS_PATH)
    plants["plantid"] = plants["plantid"].astype(str)
    plants["capacity_mw"] = pd.to_numeric(plants["capacity_mw"], errors="raise")
    matched_generators = plants[plants["plantid"].isin(matched["plantid"])].to_crs("EPSG:5070")
    buffers = tracts[["GEOID", "geometry"]].copy()
    buffers["geometry"] = buffers.geometry.buffer(50_000)
    within = gpd.sjoin(
        matched_generators[["plantid", "capacity_mw", "geometry"]],
        buffers,
        how="inner",
        predicate="within",
    )
    tract_facility = (
        within.groupby(["plantid", "GEOID"], as_index=False)["capacity_mw"]
        .sum()
        .rename(columns={"capacity_mw": "facility_cap_50km_mw"})
    )

    total_scored = total_scored.copy()
    total_scored["county_geoid"] = total_scored["GEOID"].str[:5]
    county_totals = []
    for geoid, group in total_scored.groupby("county_geoid"):
        county_totals.append(
            {
                "geoid": geoid,
                "county_gen_cap_50km_mw": weighted_average(group, "gen_cap_50km_mw"),
                "county_Ec_gencap": weighted_average(group, "Ec_contribution"),
            }
        )
    county_totals_frame = pd.DataFrame(county_totals).set_index("geoid")

    facility_tract_grid = matched[["registry_facility_id", "plantid"]].assign(_join=1).merge(
        tracts[["GEOID", "population"]].assign(_join=1),
        on="_join",
    ).drop(columns="_join")
    expanded = facility_tract_grid.merge(
        tract_facility,
        on=["plantid", "GEOID"],
        how="left",
    )
    expanded["facility_cap_50km_mw"] = expanded["facility_cap_50km_mw"].fillna(0.0)
    expanded["geoid"] = expanded["GEOID"].str[:5]

    rows: list[dict[str, object]] = []
    for (registry_id, plantid, geoid), group in expanded.groupby(
        ["registry_facility_id", "plantid", "geoid"]
    ):
        facility_capacity = weighted_average(group, "facility_cap_50km_mw")
        if facility_capacity <= 0:
            continue
        county_capacity = float(county_totals_frame.loc[geoid, "county_gen_cap_50km_mw"])
        delta = facility_capacity * ec_slope
        rows.append(
            {
                "registry_facility_id": registry_id,
                "eia_plant_code": plantid,
                "geoid": geoid,
                "facility_cap_50km_mw": facility_capacity,
                "county_gen_cap_50km_mw": county_capacity,
                "facility_share": facility_capacity / county_capacity if county_capacity else 0.0,
                "global_min_gen_cap_50km_mw": minimum,
                "global_max_gen_cap_50km_mw": maximum,
                "ec_slope": ec_slope,
                "delta": delta,
            }
        )

    attribution = pd.DataFrame(rows)
    summed = attribution.groupby("geoid")["delta"].sum()
    comparison = county_totals_frame.join(summed.rename("matched_delta_sum")).fillna(
        {"matched_delta_sum": 0.0}
    )
    over = comparison[
        comparison["matched_delta_sum"] > comparison["county_Ec_gencap"] + 1e-12
    ]
    if not over.empty:
        raise RuntimeError(
            "Matched facility attribution exceeds county Ec_gencap:\n"
            + over.to_string()
        )

    anchor_collection = json.loads(ANCHORS_PATH.read_text())
    by_anchor = {
        registry_id: group
        for registry_id, group in attribution.groupby("registry_facility_id")
    }
    for feature in anchor_collection["features"]:
        props = feature["properties"]
        if props.get("asset_class") != "generator":
            continue
        anchor_id = props.get("anchor_id")
        if props.get("match_confidence") not in ("exact_id", "fuzzy"):
            props["county_ees_contribution"] = []
            continue
        group = by_anchor.get(anchor_id)
        if group is None:
            props["county_ees_contribution"] = []
            continue
        props["county_ees_contribution"] = [
            {"geoid": row.geoid, "capital": "Ec", "delta": row.delta}
            for row in group.sort_values("geoid").itertuples()
        ]

    attribution.to_csv(OUTPUT_PATH, index=False)
    serialized = json.dumps(anchor_collection, separators=(",", ":"))
    ANCHORS_PATH.write_text(serialized)
    PROCESSED_ANCHORS_PATH.write_text(serialized)
    print(f"matched_facilities={len(matched)}")
    print(f"facility_county_attributions={len(attribution)}")
    print(f"global_min={minimum:.12f}")
    print(f"global_max={maximum:.12f}")
    print(f"ec_slope={ec_slope:.15f}")
    print(f"max_structural_ratio={(comparison['matched_delta_sum'] / comparison['county_Ec_gencap'].replace(0, np.nan)).max():.12f}")
    print("\nSample 10:")
    print(attribution.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
