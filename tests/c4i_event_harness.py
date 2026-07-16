"""Shared checked-in C4-i event fixtures built from the C1/C2 inputs."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "processed"
ACTIVE_LENSES = ("ssp245", "ssp370")
ACTIVE_SEEDS = (0, 1, 42, 2_147_483_647)
MATRIX_YEARS = (2025, 2030, 2040, 2050, 2065, 2088)
FULL_YEAR_RANGE = tuple(range(2025, 2089))
HAZARD_KINDS = (
    "heat_wave",
    "wildfire_smoke_proximity",
    "drought_stress",
    "severe_storm",
)


def load_hazard_baselines() -> list[dict]:
    path = DATA_DIR / "nri_wrc_county_hazard_summary.csv"
    rows = []
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            rows.append(
                {
                    "geoid": row["geoid"].zfill(5),
                    "heat_wave_frequency": float(
                        row["heat_wave_annualized_frequency"]
                    ),
                    "heat_wave_risk_score": float(row["heat_wave_risk_score"]),
                    "wildfire_frequency": float(
                        row["wildfire_annualized_frequency"]
                    ),
                    "wildfire_risk_score": float(row["wildfire_risk_score"]),
                    "drought_frequency": float(
                        row["drought_annualized_frequency"]
                    ),
                    "drought_risk_score": float(row["drought_risk_score"]),
                    "severe_storm_frequency": (
                        float(row["hail_annualized_frequency"])
                        + float(row["strong_wind_annualized_frequency"])
                    ),
                    "severe_storm_risk_score": max(
                        float(row["hail_risk_score"]),
                        float(row["strong_wind_risk_score"]),
                    ),
                }
            )
    rows.sort(key=lambda row: row["geoid"])
    return rows


def load_projection_points() -> list[dict]:
    path = DATA_DIR / "county_climate_projections.json"
    with path.open() as handle:
        records = json.load(handle)["records"]
    return [
        {
            "geoid": record["geoid"],
            "lens": record["lens"],
            "metric": record["metric"],
            "epoch": int(record["epoch"]),
            "percentile": record["percentile"],
            "value": float(record["value"]),
        }
        for record in records
    ]


def active_event_matrix(sample_events) -> list[dict]:
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    events = []
    for lens in ACTIVE_LENSES:
        for seed in ACTIVE_SEEDS:
            events.extend(
                sample_events(
                    seed=seed,
                    lens=lens,
                    years=MATRIX_YEARS,
                    county_baselines=baselines,
                    projection_points=projections,
                )
            )
    return events
