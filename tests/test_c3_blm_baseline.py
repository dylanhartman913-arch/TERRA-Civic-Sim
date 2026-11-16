"""W7-F3 / C-3 contract tests: BLM RAS AUMs in the Wyoming ag baseline (schema v2).

Uses only tracked files, so it runs in CI without the 19 MB polygon pull.
"""

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "data/processed/wy_county_ag_baseline.json"
ENGINE = ROOT / "data/processed/wy_county_ag_engine_baseline.json"
APP_ENGINE = ROOT / "terra-app/src/data/county_ag_baseline.json"
ALLOT = ROOT / "data/processed/wy_blm_allotment_aum.csv"
ALLOT_CTY = ROOT / "data/processed/wy_blm_allotment_county_aum.csv"
RAS = ROOT / "data/raw/blm_ras/Allotment Information Report BLM WY State Office 2026-11-15.csv"
BEFORE = ROOT / "build_log/wave7/snapshots/w7-f3/before_federal_aum.json"
PUBLISHED_WY_ACTIVE_AUM = 1_920_781  # BLM Public Land Statistics 2025, Table 3-9c


def test_baseline_v2_has_separate_blm_usfs_private_fields_and_never_invents_usfs():
    payload = json.loads(BASELINE.read_text())
    assert payload["schema_version"] == "wy_county_ag_baseline_v2"
    assert payload["schema_changelog"][0]["version"] == "wy_county_ag_baseline_v2"
    for geoid, county in payload["counties"].items():
        own = county["aum_by_ownership"]
        assert set(own) == {"blm_active_aum", "usfs_active_aum", "private_aum_capacity", "blm_share_of_forage_capacity"}
        assert own["blm_active_aum"]["value"] is not None, geoid
        assert own["usfs_active_aum"]["value"] is None and own["usfs_active_aum"]["notes"], geoid
        assert county["federal_aums"]["usfs_authorized_aum"]["value"] is None
        assert county["federal_aums"]["federal_aum_share"]["value"] is None
        assert own["private_aum_capacity"]["value"] == county["cattle_and_forage"]["aum_capacity"]["value"]


def test_statewide_blm_total_is_within_two_percent_of_blm_published_and_teton_is_near_zero():
    counties = json.loads(BASELINE.read_text())["counties"]
    total = sum(c["aum_by_ownership"]["blm_active_aum"]["value"] for c in counties.values())
    assert abs(total / PUBLISHED_WY_ACTIVE_AUM - 1) <= 0.02, total
    assert counties["56039"]["aum_by_ownership"]["blm_active_aum"]["value"] < 1000
    for geoid in ("56037", "56007", "56013", "56023"):  # Sweetwater, Carbon, Fremont, Lincoln
        c = counties[geoid]
        area = c["land_by_use"]["county_area_acres"]["value"]
        assert c["federal_aums"]["blm_public_acres"]["value"] / area >= 0.25, geoid


def test_c3_is_not_promoted_engine_federal_forage_is_still_the_before_snapshot():
    before = json.loads(BEFORE.read_text())
    engine = json.loads(ENGINE.read_text())
    assert ENGINE.read_text() == APP_ENGINE.read_text()
    assert engine["schema_version"] == "county-ag-engine-v1"
    for geoid, row in engine["counties"].items():
        assert row["forage_aum"] == before["counties"][geoid]["engine_forage_aum"], geoid
    assert hashlib.sha256(ENGINE.read_bytes()).hexdigest() == before["sources"]["data/processed/wy_county_ag_engine_baseline.json"]


def test_county_apportionment_conserves_allotment_aums():
    allot = {}
    with ALLOT.open(newline="") as handle:
        for row in csv.DictReader(handle):
            allot[row["st_allot"]] = row
    by_allot: dict[str, float] = {}
    with ALLOT_CTY.open(newline="") as handle:
        for row in csv.DictReader(handle):
            assert row["county_geoid"].startswith("56")
            by_allot[row["st_allot"]] = by_allot.get(row["st_allot"], 0.0) + float(row["active_aum_county"])
    assert by_allot
    for st, got in by_allot.items():
        a = allot[st]
        assert a["join"] == "matched"
        assert got <= float(a["active_aum"]) + 0.01, st
        assert abs(got - float(a["active_aum"]) * float(a["wy_share"])) < 0.05, st


def test_ras_export_matches_its_sidecar_and_carries_no_operator_fields():
    sidecar = json.loads(RAS.with_name(RAS.name + ".sidecar.json").read_text())
    assert hashlib.sha256(RAS.read_bytes()).hexdigest() == sidecar["sha256"]
    assert sidecar["original_filename"] == RAS.name
    with RAS.open(newline="", encoding="utf-8-sig") as handle:
        header = next(csv.reader(handle))
    lowered = " ".join(header).lower()
    for banned in ("operator", "address", "applicant", "permittee", "phone", "city", "zip"):
        assert banned not in lowered, banned
    for path in (ALLOT, ALLOT_CTY):
        assert "operator" not in path.read_text().splitlines()[0].lower()


# --- W7-F5: amended credibility gate (replaces the F3 named-county gate; see DECISIONS.md 2026-11-16 b) ---

def _c3():
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    import build_c3_blm_grazing as c3
    return c3


def test_amended_gate_per_county_acres_22_of_23_with_johnson_a_recorded_exception():
    import pandas as pd
    c3 = _c3()
    assert (c3.ACRE_TOL_PCT, c3.ACRE_TOL_FLOOR) == (0.05, 5_000.0), "tolerances must not be widened"
    # tracked snapshot carries both the apportioned and the independent (SMA) acres, so no raw pull is needed
    cf = pd.read_csv(ROOT / "build_log/wave7/snapshots/w7-f3/c3_county_credibility.csv", dtype={"county_geoid": str})
    cf["county_name"] = cf["county_name"].astype(str)
    gate = c3.county_acre_gate(cf)
    assert len(gate) == 23
    failed = gate[gate.result == "FAIL"]
    assert list(failed.county_name) == ["Johnson"]
    assert set(failed.county_name) <= set(c3.ACCEPTED_EXCEPTIONS)
    j = failed.iloc[0]
    assert round(j.blm_public_acres) == 477_775 and round(j.sma_blm_acres) == 504_541
    assert round(j.tolerance_acres) == 25_227 and round(j.dev_pct, 1) == -5.3
    # Goshen and Teton pass only through the 5,000-acre floor
    floor = set(gate[(gate.result == "PASS") & gate.via_floor].county_name)
    assert {"Goshen", "Teton"} <= floor
    assert round(float(gate[gate.county_name == "Goshen"].dev_pct.iloc[0]), 1) == -10.9
    report = json.loads((ROOT / "build_log/wave7/snapshots/w7-f3/c3_report.json").read_text())
    assert (report["gate_county_pass_count"], report["gate_county_count"]) == (22, 23)
    assert report["gate_pass"] is False  # recorded as FAIL, not masked by the exception


def test_amended_gate_statewide_aums_within_two_percent_for_apportioned_and_ras():
    c3 = _c3()
    counties = json.loads(BASELINE.read_text())["counties"]
    apportioned = sum(c["aum_by_ownership"]["blm_active_aum"]["value"] for c in counties.values())
    assert abs(apportioned / c3.PUBLISHED_WY_ACTIVE_AUM - 1) <= c3.GATE_TOLERANCE
    report = json.loads((ROOT / "build_log/wave7/snapshots/w7-f3/c3_report.json").read_text())
    stat_rows = [r for r in report["gate"] if r["check"].startswith("Statewide")]
    assert len(stat_rows) == 3 and all(r["result"] == "PASS" for r in stat_rows)
