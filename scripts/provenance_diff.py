"""Reproduce the 08b generator-capacity term and compare pinned vs baseline data."""

from __future__ import annotations

from pathlib import Path
import os

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
STAGING = ROOT / "data" / "staging"

STATE_FIPS = {
    "WY": "56",
    "CO": "08",
    "MT": "30",
    "UT": "49",
    "NM": "35",
    "ID": "16",
    "NV": "32",
    "NE": "31",
    "SD": "46",
}
TARGET_ECO_CODES = ["17", "18", "20", "21", "25", "43", "80"]
B_VARS = {
    "B01003_001E": "population",
    "B19013_001E": "median_hh_income",
    "B25002_003E": "vacant_units",
    "B25002_001E": "total_units",
    "B23025_004E": "employed",
    "B23025_003E": "labor_force",
    "B25035_001E": "median_year_built",
}
S_VARS = {
    "S1701_C03_001E": "poverty_rate",
    "S1501_C02_015E": "pct_bachelor_plus",
    "S2701_C03_001E": "pct_health_insurance",
    "S2801_C02_014E": "pct_internet",
}
PRIMARY_INDICATORS = [
    "median_hh_income",
    "poverty_rate",
    "vacancy_rate",
    "employment_rate",
    "pct_bachelor_plus",
    "pct_health_insurance",
    "median_year_built",
    "pct_internet",
]
SENTINEL = -666666000


def fetch_acs_table(base_url: str, variables: dict[str, str], fips: str) -> pd.DataFrame:
    params = {
        "get": ",".join(variables),
        "for": "tract:*",
        "in": f"state:{fips}",
    }
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        params["key"] = key
    response = requests.get(base_url, params=params, timeout=120)
    response.raise_for_status()
    payload = response.json()
    frame = pd.DataFrame(payload[1:], columns=payload[0])
    frame["GEOID"] = frame["state"] + frame["county"] + frame["tract"]
    frame = frame.drop(columns=["state", "county", "tract"]).rename(columns=variables)
    for column in variables.values():
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame.loc[frame[column] <= SENTINEL, column] = np.nan
    return frame


def load_acs() -> pd.DataFrame:
    cache = STAGING / "acs_tract_2022_for_provenance.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    load_dotenv(ROOT / ".env")
    basic = []
    subject = []
    for fips in STATE_FIPS.values():
        basic.append(fetch_acs_table("https://api.census.gov/data/2022/acs/acs5", B_VARS, fips))
        subject.append(
            fetch_acs_table(
                "https://api.census.gov/data/2022/acs/acs5/subject", S_VARS, fips
            )
        )
    acs = pd.concat(basic, ignore_index=True).merge(
        pd.concat(subject, ignore_index=True), on="GEOID", how="outer"
    )
    acs["vacancy_rate"] = acs["vacant_units"] / acs["total_units"].replace(0, np.nan) * 100
    acs["employment_rate"] = acs["employed"] / acs["labor_force"].replace(0, np.nan) * 100
    acs["n_missing"] = acs[PRIMARY_INDICATORS].isna().sum(axis=1).astype(int)
    acs.to_parquet(cache, index=False)
    return acs


def study_tracts() -> gpd.GeoDataFrame:
    tracts = gpd.read_parquet(RAW / "census_tracts" / "mw_tracts_2020.parquet")
    ecoregions = gpd.read_file(PROCESSED / "mw_ecoregions.geojson")
    ecoregions = ecoregions[ecoregions["US_L3CODE"].astype(str).isin(TARGET_ECO_CODES)]
    centroids = gpd.GeoDataFrame(
        {"GEOID": tracts["GEOID"].astype(str)},
        geometry=tracts.to_crs("EPSG:5070").geometry.centroid,
        crs="EPSG:5070",
    )
    joined = gpd.sjoin(
        centroids.to_crs("EPSG:4326"),
        ecoregions[["US_L3CODE", "geometry"]],
        how="left",
        predicate="within",
    ).drop(columns=["index_right"])
    joined = joined.drop_duplicates("GEOID", keep="first")
    study_ids = joined.loc[joined["US_L3CODE"].notna(), "GEOID"]
    study = centroids[centroids["GEOID"].isin(study_ids)].copy()
    acs = load_acs()
    study = study.merge(acs[["GEOID", "population", "n_missing"]], on="GEOID", how="left")
    study["n_missing"] = study["n_missing"].fillna(len(PRIMARY_INDICATORS)).astype(int)
    return study[study["n_missing"] <= 3].copy()


def county_generator_term(
    plants_path: Path, tracts: gpd.GeoDataFrame
) -> tuple[pd.DataFrame, pd.DataFrame]:
    plants = gpd.read_file(plants_path)
    plants["capacity_mw"] = pd.to_numeric(plants["capacity_mw"], errors="coerce")
    generators = plants.dropna(subset=["geometry", "capacity_mw"]).to_crs("EPSG:5070")
    buffers = tracts[["GEOID", "geometry"]].copy()
    buffers["geometry"] = buffers.geometry.buffer(50_000)
    within = gpd.sjoin(
        generators[["plantid", "capacity_mw", "geometry"]],
        buffers,
        how="inner",
        predicate="within",
    )
    capacities = within.groupby("GEOID")["capacity_mw"].sum()
    scored = tracts.copy()
    scored["gen_cap_50km_mw"] = scored["GEOID"].map(capacities).fillna(0.0)
    minimum = scored["gen_cap_50km_mw"].min()
    maximum = scored["gen_cap_50km_mw"].max()
    if maximum == minimum:
        scored["Ec_gencap"] = 5.0
    else:
        scored["Ec_gencap"] = (
            (scored["gen_cap_50km_mw"] - minimum) / (maximum - minimum) * 10.0
        )
    scored["Ec_contribution"] = scored["Ec_gencap"] / 6.0
    scored["county_geoid"] = scored["GEOID"].str[:5]

    records = []
    for geoid, group in scored[scored["county_geoid"].str.startswith("56")].groupby(
        "county_geoid"
    ):
        weights = group["population"].fillna(0).clip(lower=0)
        if weights.sum() > 0:
            cap = np.average(group["gen_cap_50km_mw"], weights=weights)
            contribution = np.average(group["Ec_contribution"], weights=weights)
        else:
            cap = group["gen_cap_50km_mw"].mean()
            contribution = group["Ec_contribution"].mean()
        records.append(
            {
                "geoid": geoid,
                "gen_cap_50km_mw": cap,
                "Ec_contribution": contribution,
            }
        )
    return pd.DataFrame(records), scored


def generator_inventory_diff(existing_path: Path, staged_path: Path) -> pd.DataFrame:
    columns = [
        "plantid",
        "generatorid",
        "plantName",
        "stateid",
        "county",
        "status",
        "capacity_mw",
    ]
    existing = gpd.read_file(existing_path)[columns].copy()
    staged = gpd.read_file(staged_path)[columns].copy()
    for frame in (existing, staged):
        frame["source_key"] = frame["plantid"].astype(str) + ":" + frame["generatorid"].astype(str)
        frame["capacity_mw"] = pd.to_numeric(frame["capacity_mw"], errors="coerce")
    existing = existing.drop_duplicates("source_key").set_index("source_key")
    staged = staged.drop_duplicates("source_key").set_index("source_key")
    keys = existing.index.union(staged.index)
    rows = []
    for key in keys:
        old = existing.loc[key] if key in existing.index else None
        new = staged.loc[key] if key in staged.index else None
        if old is not None and new is not None:
            old_capacity = float(old["capacity_mw"])
            new_capacity = float(new["capacity_mw"])
            status = "capacity_or_status_changed" if (
                old_capacity != new_capacity or old["status"] != new["status"]
            ) else "unchanged"
        elif new is not None:
            old_capacity = np.nan
            new_capacity = float(new["capacity_mw"])
            status = "staged_only"
        else:
            old_capacity = float(old["capacity_mw"])
            new_capacity = np.nan
            status = "existing_only"
        if status == "unchanged":
            continue
        row = new if new is not None else old
        rows.append(
            {
                "source_record_id": key,
                "plant_name": row["plantName"],
                "state": row["stateid"],
                "county": row["county"],
                "difference": status,
                "capacity_mw_existing": old_capacity,
                "capacity_mw_staged": new_capacity,
                "status_existing": old["status"] if old is not None else None,
                "status_staged": new["status"] if new is not None else None,
            }
        )
    return pd.DataFrame(rows)


def main() -> None:
    tracts = study_tracts()
    existing_path = PROCESSED / "power_plants_with_ba.geojson"
    staged_path = STAGING / "power_plants_with_ba.geojson"
    existing, _ = county_generator_term(existing_path, tracts)
    staged, _ = county_generator_term(staged_path, tracts)
    county_names = pd.read_csv(PROCESSED / "mw_county_ees_summary.csv", dtype={"geoid": str})[
        ["geoid", "county_name"]
    ]
    report = county_names[county_names["geoid"].str.startswith("56")].merge(
        existing.rename(
            columns={
                "gen_cap_50km_mw": "gen_cap_50km_mw_existing",
                "Ec_contribution": "Ec_existing",
            }
        ),
        on="geoid",
        how="left",
    ).merge(
        staged.rename(
            columns={
                "gen_cap_50km_mw": "gen_cap_50km_mw_staged",
                "Ec_contribution": "Ec_staged",
            }
        ),
        on="geoid",
        how="left",
    )
    denominator = report["gen_cap_50km_mw_existing"]
    report["pct_change"] = np.where(
        denominator != 0,
        (report["gen_cap_50km_mw_staged"] - denominator) / denominator * 100,
        np.where(report["gen_cap_50km_mw_staged"] == 0, 0.0, np.inf),
    )
    report["Ec_delta"] = report["Ec_staged"] - report["Ec_existing"]
    report = report[
        [
            "geoid",
            "county_name",
            "gen_cap_50km_mw_existing",
            "gen_cap_50km_mw_staged",
            "pct_change",
            "Ec_existing",
            "Ec_staged",
            "Ec_delta",
        ]
    ]
    report.to_csv(ROOT / "provenance_diff_report.csv", index=False)
    inventory = generator_inventory_diff(existing_path, staged_path)
    inventory.to_csv(STAGING / "generator_inventory_diff.csv", index=False)
    print(report.to_string(index=False))
    print(f"\nInventory differences: {len(inventory):,}")
    print(inventory["difference"].value_counts().to_string())


if __name__ == "__main__":
    main()
