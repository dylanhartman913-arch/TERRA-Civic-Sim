"""Contract tests for Notebook 24's C2.1 historical baseline and delta surface."""

import json
from pathlib import Path


DATA_DIR = Path(__file__).parent.parent / "data" / "processed"


def _load(name):
    with open(DATA_DIR / name) as handle:
        return json.load(handle)


def test_c21_surface_has_all_attributed_projection_deltas():
    source = _load("county_climate_projections.json")
    output = _load("county_climate_baseline.json")

    assert output["schema_version"] == "C2.1.0"
    assert output["source_schema_version"] == "C1.6"
    assert len(output["deltas"]) == len(source["records"])

    source_keys = {
        (row["geoid"], row["metric"], row["lens"], row["epoch"], row["percentile"])
        for row in source["records"]
    }
    delta_keys = {
        (row["geoid"], row["metric"], row["lens"], row["epoch"], row["percentile"])
        for row in output["deltas"]
    }
    assert delta_keys == source_keys

    source_by_key = {
        (row["geoid"], row["metric"], row["lens"], row["epoch"], row["percentile"]): row
        for row in source["records"]
    }
    for delta in output["deltas"]:
        key = (delta["geoid"], delta["metric"], delta["lens"], delta["epoch"], delta["percentile"])
        projection = source_by_key[key]
        assert delta["projected_value"] == projection["value"]
        assert delta["source"] == projection["source"]
        assert delta["confidence"] == projection["confidence"]
        assert abs(delta["value"] - (delta["projected_value"] - delta["baseline_value"])) < 1e-12


def test_c21_fire_delta_is_arithmetic_and_fully_attributed():
    output = _load("county_climate_baseline.json")
    baseline = next(
        row for row in output["baselines"]
        if (row["geoid"], row["metric"], row["percentile"])
        == ("08001", "high_fire_danger_days", "p50")
    )
    delta = next(
        row for row in output["deltas"]
        if (row["geoid"], row["metric"], row["lens"], row["epoch"], row["percentile"])
        == ("08001", "high_fire_danger_days", "ssp245", "2050", "p50")
    )

    assert abs(delta["value"] - (delta["projected_value"] - baseline["value"])) < 1e-12
    for row in (baseline, delta, delta["baseline_attribution"]):
        for field in ("scenario", "epoch", "percentile", "source", "method", "confidence"):
            assert row[field] is not None
    assert baseline["scenario"] == baseline["epoch"] == "historical"
    assert delta["baseline_key"] == ["08001", "high_fire_danger_days", "p50"]


def test_c21_baselines_cover_each_source_county_metric_percentile():
    source = _load("county_climate_projections.json")
    output = _load("county_climate_baseline.json")

    expected = {(row["geoid"], row["metric"], row["percentile"]) for row in source["records"]}
    actual = {(row["geoid"], row["metric"], row["percentile"]) for row in output["baselines"]}
    assert actual == expected
