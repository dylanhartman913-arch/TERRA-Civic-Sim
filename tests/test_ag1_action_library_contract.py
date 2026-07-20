"""Contract tests for NB 26 — AG1 Ag Action Family + Coefficients."""
import hashlib, json
from pathlib import Path

ROOT   = Path(__file__).resolve().parents[1]
LIB    = ROOT / "data/processed/mw_action_library_v3.json"
FISCAL = ROOT / "data/processed/wy_fiscal_coefficients.json"
SRC    = ROOT / "data/processed/wy_ag_sources.csv"

AG_ACTIONS = [
    "invasive_species_removal",
    "irrigation_efficiency",
    "rangeland_restoration_maintenance",
    "ag_conservation_easement",
]
ENERGY_COEX_ACTIONS = [
    "wind_utility", "solar_utility", "transmission_230kv", "transmission_500kv",
]


def test_schema_version_bumped_to_3_3():
    lib = json.loads(LIB.read_text())
    assert lib["schema_version"] == "3.3", f"Expected 3.3, got {lib['schema_version']}"


def test_four_ag_actions_present_with_required_fields():
    lib = json.loads(LIB.read_text())
    for action_id in AG_ACTIONS:
        assert action_id in lib["actions"], f"Missing action: {action_id}"
        a = lib["actions"][action_id]
        assert a["bucket"] == "agriculture", f"{action_id}: bucket != agriculture"
        assert a["category"] == "agriculture"
        # Cost bounds both present
        assert a.get("cost_low_2024") is not None, f"{action_id}: missing cost_low_2024"
        assert a.get("cost_high_2024") is not None, f"{action_id}: missing cost_high_2024"
        assert a["cost_low_2024"] < a["cost_high_2024"], f"{action_id}: cost_low >= cost_high"
        # Jobs and capex for Resource HUD
        assert "jobs_direct_per_1000_acres" in a, f"{action_id}: missing jobs field"
        assert "capex_usd_per_acre_low" in a, f"{action_id}: missing capex_low"
        assert "capex_usd_per_acre_high" in a, f"{action_id}: missing capex_high"
        # All WY counties present
        wy_in = [c for c in a["applicable_counties"] if c.startswith("56")]
        assert len(wy_in) == 23, f"{action_id}: expected 23 WY counties, got {len(wy_in)}"


def test_invasive_removal_has_reinvasion_decay_schedule():
    lib = json.loads(LIB.read_text())
    a = lib["actions"]["invasive_species_removal"]
    decay = a.get("reinvasion_decay", {})
    assert "fraction_retreated_per_year" in decay
    assert "paired_maintenance_action" in decay
    assert decay["paired_maintenance_action"] == "rangeland_restoration_maintenance"


def test_irrigation_efficiency_has_separate_water_coefficients_never_combined():
    lib = json.loads(LIB.read_text())
    a = lib["actions"]["irrigation_efficiency"]
    wc = a.get("water_coefficients", {})
    assert "diversion_reduction_fraction" in wc, "Missing diversion coefficient"
    assert "consumptive_use_reduction_fraction" in wc, "Missing consumptive use coefficient"
    # They must be separate (no field KEY named combined_*)
    assert not any("combined" in k.lower() for k in wc.keys()), "Forbidden combined water field key found"
    assert wc["diversion_reduction_fraction"] > wc["consumptive_use_reduction_fraction"], \
        "Diversion reduction should exceed consumptive use reduction"


def test_rangeland_maintenance_has_pairing_rule():
    lib = json.loads(LIB.read_text())
    a = lib["actions"]["rangeland_restoration_maintenance"]
    pr = a.get("pairing_rule", {})
    assert pr.get("requires_prior_action") == "invasive_species_removal"
    assert pr.get("max_lag_years") is not None


def test_ag_conservation_easement_not_on_fiscal_ledger():
    lib = json.loads(LIB.read_text())
    a = lib["actions"]["ag_conservation_easement"]
    lpe = a.get("land_pool_effect", {})
    assert lpe.get("affects_fiscal_ledger") is False, \
        "Easement must NOT affect fiscal ledger"
    assert lpe.get("removes_from_development_pool") is True


def test_ag_coexistence_on_energy_actions_data_only():
    lib = json.loads(LIB.read_text())
    for action_id in ENERGY_COEX_ACTIONS:
        a = lib["actions"][action_id]
        coex = a.get("ag_coexistence")
        assert coex is not None, f"{action_id}: missing ag_coexistence block"
        assert coex.get("engine_active") is False, f"{action_id}: engine_active should be False"
        assert "land_acres_converted_from_ag" in coex
        assert "land_acres_shared_with_ag" in coex


def test_wind_utility_coexistence_distinguishes_direct_and_total():
    lib = json.loads(LIB.read_text())
    coex = lib["actions"]["wind_utility"]["ag_coexistence"]
    # Direct (converted) must be far less than total shared
    assert coex["land_acres_converted_from_ag"] < coex["land_acres_shared_with_ag"], \
        "Wind: direct converted should be much less than shared (grazing continues)"
    assert "direct" in coex.get("wind_direct_vs_total_note", "").lower()


def test_existing_action_data_unchanged():
    """Spot-check that adding ag actions did not modify existing action bodies."""
    lib = json.loads(LIB.read_text())
    assert lib["actions"]["wind_utility"]["label"] == "Utility-Scale Wind"
    assert lib["actions"]["prairie_restoration"]["cost_2024"] == 150
    assert lib["actions"]["invasive_treatment"]["cost_2024"] == 80
    # Pre-run digest of EXISTING data (ag actions + ag_coexistence additions are expected)
    # We verify by field value, not digest, since the library was modified.


def test_fiscal_coefficients_extended_with_ag_block():
    fiscal = json.loads(FISCAL.read_text())
    ag = fiscal.get("_ag_fiscal_coefficients")
    assert ag is not None, "Missing _ag_fiscal_coefficients block"
    pv = ag["ag_productive_value_by_class_usd_per_acre"]
    assert pv["irrigated"] == 1767
    assert pv["dryland"] == 376
    assert pv["grazing_land"] == 126
    # Assessed values = productive × 9.5%
    av = ag["ag_assessed_value_by_class_usd_per_acre"]
    assert abs(av["irrigated"] - 1767 * 0.095) < 0.01
    # Conversion delta shows INCREASE
    delta = ag["conversion_delta_to_industrial"]
    assert delta["net_direction"].startswith("INCREASE")
    # Existing wind_utility block must still be present
    assert "wind_utility" in fiscal


def test_drought_d1_ag_disturbance_defined():
    lib = json.loads(LIB.read_text())
    d = lib["disturbances"].get("drought_d1_ag")
    assert d is not None
    tiers = d.get("baseline_tiers", {})
    assert set(tiers.keys()) >= {"D0", "D1", "D2", "D3", "D4"}
    deltas = d.get("lens_delta_parameters", {})
    assert deltas.get("_engine_active") is False
    d1 = deltas.get("D1", {})
    assert "irrigation_demand_delta" in d1
    assert "forage_production_delta" in d1
    assert d1["forage_production_delta"] < 0  # production decreases


def test_all_ag_coefficients_traceable_in_sources():
    import csv
    with SRC.open(newline="") as f:
        rows = list(csv.DictReader(f))
    source_ids = {r["source_id"] for r in rows}
    REQUIRED_AG_SOURCES = {
        "usda_eqip_practice_315",
        "usda_eqip_practice_441_449",
        "usda_eqip_practice_643",
        "usda_fsa_crp_rates",
        "noaa_drought_monitor",
        "wy_dor_ag_valuation",
    }
    missing = REQUIRED_AG_SOURCES - source_ids
    assert not missing, f"Sources missing from wy_ag_sources.csv: {missing}"


def test_provision_manifest_has_current_sha256_for_ag1_outputs():
    """Library and fiscal files must be tracked in the provision manifest."""
    import hashlib, re
    provision = ROOT / "scripts/provision_worktree.sh"
    text = provision.read_text()
    for artifact in (LIB, FISCAL, SRC):
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        rel = artifact.relative_to(ROOT).as_posix()
        pattern = rf'{re.escape(rel)}\|{digest}'
        assert re.search(pattern, text), f"Stale or missing manifest entry for {rel}"
