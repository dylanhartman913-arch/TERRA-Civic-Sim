"""Golden N: Fremont + Converse agriculture arcs and cross-runtime fixture."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te


FIXTURE_PATH = ROOT / "terra-app" / "tests" / "parity" / "fixtures" / "golden_n.json"
CONVERSE = "56009"
FREMONT = "56013"


def _initial_state():
    retirements_path = ROOT / "terra-app" / "src" / "data" / "baseline_retirements.json"
    retirements = {
        key: value for key, value in json.loads(retirements_path.read_text()).items()
        if key != "_meta"
    }
    return te.initialize_state(baseline_retirements=retirements)


def _digests(state):
    return {
        "state_digest_md5": te.state_digest(state)["md5"],
        "fiscal_digest_md5": te.fiscal_digest(state)["md5"],
        "existing_assets_digest_md5": te.existing_assets_digest(state)["md5"],
        "history_digest_md5": te.history_digest(state)["md5"],
        "ag_digest_md5": te.ag_digest(state)["md5"],
    }


def _treatment_arc(maintenance):
    state = _initial_state()
    state, _ = te.apply_action(
        state, "invasive_species_removal", CONVERSE, 100000
    )
    if maintenance:
        state, _ = te.apply_action(
            state, "rangeland_restoration_maintenance", CONVERSE, 100000
        )
    arc = []
    for _ in range(9):
        levels = te.get_county_ag(state, CONVERSE)["levels"]
        arc.append({
            "year": state["year"],
            "forage_index": levels["forage_aum"]["index"],
            "cattle_head": levels["cattle_head"],
        })
        state = te.advance_year(state)
    return {"arc": arc, "digests": _digests(state)}


def _irrigation_arc():
    state = _initial_state()
    before = te.get_county_ag(state, FREMONT)["levels"]["water_acre_feet"]
    state, _ = te.apply_action(state, "irrigation_efficiency", FREMONT, 10000)
    after = te.get_county_ag(state, FREMONT)["levels"]["water_acre_feet"]
    return {"before": before, "after": after, "digests": _digests(state)}


def _solar_arc():
    state = _initial_state()
    land = te.get_county_ag(state, FREMONT)["levels"]["land_acres"]
    # Freeze all lower-priority developable acres under easement so this
    # scenario specifically exercises irrigated-crop conversion.
    protected = land["other"] + land["private_rangeland"] + land["dry_crop"]
    state, _ = te.apply_action(
        state, "ag_conservation_easement", FREMONT, protected
    )
    before = te.get_county_ag(state, FREMONT)["levels"]
    before_tax = state["county_fiscal"][FREMONT]["property_tax"]
    state, delta = te.apply_action(state, "solar_utility", FREMONT, 1000)
    after = te.get_county_ag(state, FREMONT)["levels"]
    return {
        "before": before,
        "after": after,
        "conversion_sources": delta["ag_delta"]["conversion_sources"],
        "property_tax_before": before_tax,
        "property_tax_after": state["county_fiscal"][FREMONT]["property_tax"],
        "property_tax_delta": delta["fiscal_delta"]["property_tax_delta"],
        "digests": _digests(state),
    }


def _wind_arc():
    state = _initial_state()
    other = te.get_county_ag(state, CONVERSE)["levels"]["land_acres"]["other"]
    state, _ = te.apply_action(
        state, "ag_conservation_easement", CONVERSE, other
    )
    before = te.get_county_ag(state, CONVERSE)["levels"]
    state, delta = te.apply_action(state, "wind_utility", CONVERSE, 1000)
    after = te.get_county_ag(state, CONVERSE)["levels"]
    return {
        "private_aum_before": before["forage_aum"]["private"],
        "private_aum_after": after["forage_aum"]["private"],
        "shared_energy_acres": after["shared_energy_acres"],
        "conversion_sources": delta["ag_delta"]["conversion_sources"],
        "digests": _digests(state),
    }


def _drought_arc(lens):
    state = _initial_state()
    severity_milli = 1000 if lens == "historical" else 1250
    event = {
        "event_id": f"golden-n:{lens}:17:2026:{CONVERSE}:drought_stress",
        "year": 2026, "geoid": CONVERSE, "hazard_kind": "drought_stress",
        "severity_milli": severity_milli, "annual_probability_ppm": 1_000_000,
        "baseline_frequency_micros": 1_000_000,
        "projection_factor_ppm": severity_milli * 1000,
        "lens": lens, "seed": 17, "consequence_multiplier_ppm": 0,
        "ag_drought_tier": "D1", "duration_years": 2,
    }
    state, outcomes = te.apply_hazard_event_consequences(state, [event])
    arc = []
    for _ in range(4):
        levels = te.get_county_ag(state, CONVERSE)["levels"]
        arc.append({
            "year": state["year"],
            "forage_index": levels["forage_aum"]["index"],
            "cattle_head": levels["cattle_head"],
            "years_remaining": levels["drought"]["years_remaining"],
        })
        state = te.advance_year(state)
    return {
        "handler": outcomes[0]["handler"],
        "arc": arc,
        "digests": _digests(state),
    }


def run_golden_n(lens):
    return {
        "treatment_without_maintenance": _treatment_arc(False),
        "treatment_with_maintenance": _treatment_arc(True),
        "irrigation_efficiency": _irrigation_arc(),
        "utility_solar": _solar_arc(),
        "wind_shared_land": _wind_arc(),
        "two_year_drought": _drought_arc(lens),
    }


def _fixture():
    return json.loads(FIXTURE_PATH.read_text())


def test_golden_n_historical_and_ssp370_match_frozen_fixture():
    fixture = _fixture()
    for lens in ("historical", "ssp370"):
        assert run_golden_n(lens) == fixture["results"][lens]


def test_treatment_decay_and_maintenance_hold_contract():
    result = run_golden_n("historical")
    decay = result["treatment_without_maintenance"]["arc"]
    hold = result["treatment_with_maintenance"]["arc"]
    assert decay[0]["forage_index"] > decay[-1]["forage_index"]
    assert decay[-1]["forage_index"] - 1 < 0.001
    assert all(point["forage_index"] == hold[0]["forage_index"] for point in hold)


def test_irrigation_full_and_smaller_coefficients_both_move():
    result = run_golden_n("historical")["irrigation_efficiency"]
    assert result["before"]["ag_diversion"] - result["after"]["ag_diversion"] == 7000
    assert result["before"]["ag_consumptive"] - result["after"]["ag_consumptive"] == 1440


def test_solar_irrigated_swap_direction_and_magnitude():
    result = run_golden_n("historical")["utility_solar"]
    assert result["conversion_sources"]["irrigated_crop"] == 7500
    assert result["before"]["ag_valuation_usd"]["total"] - result["after"]["ag_valuation_usd"]["total"] == 13_252_500
    assert result["property_tax_after"] > result["property_tax_before"]
    assert result["property_tax_after"] - result["property_tax_before"] == pytest.approx(
        result["property_tax_delta"]
    )
    assert 13_000_000 < result["property_tax_delta"] < 13_600_000


def test_wind_shared_acres_do_not_consume_aums():
    result = run_golden_n("historical")["wind_shared_land"]
    assert result["shared_energy_acres"] == 84750
    expected_direct_loss = result["private_aum_before"] * (250 / 2_308_574)
    assert result["private_aum_before"] - result["private_aum_after"] == pytest.approx(
        expected_direct_loss, abs=1e-6
    )


def test_drought_depresses_recovers_and_ssp370_is_more_severe():
    historical = run_golden_n("historical")["two_year_drought"]["arc"]
    ssp370 = run_golden_n("ssp370")["two_year_drought"]["arc"]
    assert historical[1]["forage_index"] == historical[2]["forage_index"] < 1
    assert historical[3]["forage_index"] == 1
    assert ssp370[1]["forage_index"] < historical[1]["forage_index"]
    assert ssp370[1]["cattle_head"] < historical[1]["cattle_head"]


def test_same_lens_rerun_is_pure_and_deterministic():
    for lens in ("historical", "ssp370"):
        assert run_golden_n(lens) == run_golden_n(lens)


def test_fixture_registry_adds_n_without_consuming_amendment():
    registry = json.loads((ROOT / "data" / "golden" / "fixture_registry.json").read_text())
    assert registry["permitted_amendments"] == registry["amendments_used"] == 4
    golden_n = next(item for item in registry["fixtures"] if item.get("fixture_id") == "golden_n")
    assert golden_n["note"].startswith("New fixture; no A-M fixture regenerated")


if __name__ == "__main__":
    payload = {
        "schema_version": "golden-n-v1",
        "description": "Fremont and Converse county-ag arcs",
        "results": {
            lens: run_golden_n(lens) for lens in ("historical", "ssp370")
        },
    }
    rendered = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if "--write" in sys.argv:
        FIXTURE_PATH.write_text(rendered)
    else:
        print(rendered, end="")
