"""Discriminating contract tests for NB 25's Wyoming agricultural baseline."""

import csv
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "data/processed/wy_county_ag_baseline.json"
ALLOTMENTS = ROOT / "data/processed/wy_grazing_allotments.csv"
SOURCES = ROOT / "data/processed/wy_ag_sources.csv"
PROVISION = ROOT / "scripts/provision_worktree.sh"


def test_ag_baseline_has_complete_county_contract_and_no_combined_water_metric():
    payload = json.loads(BASELINE.read_text())
    assert payload["schema_version"] == "wy_county_ag_baseline_v1"
    assert payload["consumers"] == ["AG1 Dispatch — Wave 6 agricultural scenario layer"]
    assert len(payload["counties"]) == 23
    assert set(payload["counties"]) == {f"56{i:03d}" for i in range(1, 46, 2)}
    serialized = json.dumps(payload).lower()
    assert "qcew" not in serialized
    assert "combined_water" not in serialized
    for county in payload["counties"].values():
        land = county["land_by_use"]
        assert "other_land_acres" in land
        assert land["other_land_acres"]["is_residual_pool"] is True
        water = county["water"]
        assert set(water) == {"diversion_acre_feet", "consumptive_use_acre_feet"}
        assert county["cattle_and_forage"]["aum_capacity"]["confidence"] == "low"
        assert county["dor_ag_productive_value_coefficients_usd_per_acre"]["linked_ledger"] == "data/processed/wy_fiscal_coefficients.json"


def test_allotment_and_source_contracts_keep_subcounty_detail_and_blocked_sources_explicit():
    with ALLOTMENTS.open(newline="") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == [
            "allotment_id", "agency", "allotment_name", "county_geoid", "county_name",
            "authorized_aum", "authorized_use_acres", "source_url", "vintage", "status",
            "manual_fetch_id",
        ]
        assert list(reader) == []
    with SOURCES.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert {row["source_id"] for row in rows} >= {
        "census_ag_2022", "nass_quickstats", "blm_ras", "usfs_grazing", "wy_water_rights", "rap",
        "bea_farm_proprietor_income", "wy_dor_ag_valuation",
    }
    VALID_STATUSES = {
        "sandbox_blocked", "success", "api_key_required", "no_programmatic_api",
        "download_available", "url_404", "no_public_api", "dns_not_found",
    }
    for row in rows:
        assert row["fetch_status"] in VALID_STATUSES, f"Unknown fetch_status {row['fetch_status']!r} for {row['source_id']}"
    # census_ag_2022 must have succeeded (bulk download path)
    census_row = next(r for r in rows if r["source_id"] == "census_ag_2022")
    assert census_row["fetch_status"] == "success"
    # No source may cite QCEW (D4 contract)
    assert all("qcew" not in row["source_url"].lower() for row in rows)


def test_provision_manifest_has_current_sha256_for_each_required_output():
    manifest = PROVISION.read_text()
    for artifact in (BASELINE, ALLOTMENTS, SOURCES):
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        pattern = rf'{re.escape(artifact.relative_to(ROOT).as_posix())}\|{digest}'
        assert re.search(pattern, manifest), artifact
