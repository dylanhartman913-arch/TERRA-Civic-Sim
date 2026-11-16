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
