"""Structural and behavioral acceptance tests for the AG2 county-ag layer."""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te


def test_all_23_wy_counties_have_balanced_separate_ledgers():
    state = te.initialize_state()
    assert len(state["county_ag"]) == 23
    for geoid, ag in state["county_ag"].items():
        assert geoid.startswith("56")
        land = ag["land_acres"]
        assert set(land) == {
            "irrigated_crop", "dry_crop", "private_rangeland",
            "easement_protected", "converted_to_energy", "other",
        }
        assert sum(land.values()) == pytest.approx(
            sum(ag["baseline"]["land_acres"].values()), abs=1e-6
        )
        water = ag["water_acre_feet"]
        assert set(water) == {
            "ag_consumptive", "ag_diversion", "energy", "other", "county_supply",
        }
        assert water["ag_consumptive"] <= water["ag_diversion"]
        assert water["county_supply"] == pytest.approx(
            water["ag_consumptive"] + water["ag_diversion"]
            + water["energy"] + water["other"]
        )
        assert set(te.get_county_ag(state, geoid)["levels"]["forage_aum"]) == {
            "private", "federal", "index",
        }


def test_get_county_ag_shape_is_frozen_and_unknown_is_null():
    state = te.initialize_state()
    result = te.get_county_ag(state, "56013")
    assert set(result) == {"geoid", "year", "levels", "trajectories"}
    assert set(result["levels"]) == {
        "land_acres", "water_acre_feet", "forage_aum", "cattle_head",
        "ag_valuation_usd", "shared_energy_acres", "drought",
    }
    assert set(result["trajectories"]) == {
        "land", "water", "forage", "cattle", "valuation",
    }
    assert te.get_county_ag(state, "08001") is None


def test_land_conversion_priority_and_easement_exclusion():
    state = te.initialize_state()
    ag = state["county_ag"]["56013"]
    protect = ag["land_acres"]["other"] + ag["land_acres"]["private_rangeland"]
    state, _ = te.apply_action(state, "ag_conservation_easement", "56013", protect)
    easement_before = state["county_ag"]["56013"]["land_acres"]["easement_protected"]
    state, delta = te.apply_action(state, "solar_utility", "56013", 1000)
    sources = delta["ag_delta"]["conversion_sources"]
    assert sources["other"] == sources["private_rangeland"] == 0
    assert sources["dry_crop"] > 0
    assert state["county_ag"]["56013"]["land_acres"]["easement_protected"] == easement_before


def test_wind_shared_acres_consume_nothing_and_only_direct_acres_affect_forage():
    state = te.initialize_state()
    other = state["county_ag"]["56009"]["land_acres"]["other"]
    state, _ = te.apply_action(state, "ag_conservation_easement", "56009", other)
    before = te.get_county_ag(state, "56009")["levels"]
    state, delta = te.apply_action(state, "wind_utility", "56009", 1000)
    after = te.get_county_ag(state, "56009")["levels"]
    assert delta["ag_delta"]["converted_acres"] == 250
    assert delta["ag_delta"]["shared_acres"] == 84750
    assert after["land_acres"]["private_rangeland"] == pytest.approx(
        before["land_acres"]["private_rangeland"] - 250
    )
    assert after["shared_energy_acres"] == 84750


def test_irrigation_efficiency_moves_both_separate_water_fields():
    state = te.initialize_state()
    before = te.get_county_ag(state, "56013")["levels"]["water_acre_feet"]
    state, _ = te.apply_action(state, "irrigation_efficiency", "56013", 10000)
    after = te.get_county_ag(state, "56013")["levels"]["water_acre_feet"]
    assert before["ag_diversion"] - after["ag_diversion"] == pytest.approx(7000)
    assert before["ag_consumptive"] - after["ag_consumptive"] == pytest.approx(1440)
    assert after["county_supply"] == before["county_supply"]


def test_irrigation_efficiency_reads_both_action_library_coefficients():
    state = te.initialize_state()
    coefficients = state["action_library"]["actions"]["irrigation_efficiency"][
        "water_coefficients"
    ]
    coefficients["diversion_reduction_fraction"] = 0.20
    coefficients["consumptive_use_reduction_fraction"] = 0.05
    before = te.get_county_ag(state, "56013")["levels"]["water_acre_feet"]
    state, _ = te.apply_action(state, "irrigation_efficiency", "56013", 10000)
    after = te.get_county_ag(state, "56013")["levels"]["water_acre_feet"]
    assert before["ag_diversion"] - after["ag_diversion"] == pytest.approx(4000)
    assert before["ag_consumptive"] - after["ag_consumptive"] == pytest.approx(600)


def test_no_engine_path_can_omit_treatment_decay_or_maintenance_guard():
    advance_source = inspect.getsource(te.advance_year)
    dynamics_source = inspect.getsource(te._advance_county_ag)
    assert "_advance_county_ag(state, current_year)" in advance_source
    assert "decay_factor = 1.0 - _reinvasion_fraction(state)" in dynamics_source
    assert 'cohort["remaining_fraction"] * decay_factor' in dynamics_source
    assert 'cohort.get("maintenance_acres", 0.0) < cohort["acres"]' in dynamics_source


def test_treatment_rises_then_decays_but_maintenance_holds():
    untreated = te.initialize_state()
    untreated, _ = te.apply_action(
        untreated, "invasive_species_removal", "56009", 100000
    )
    treated_peak = te.get_county_ag(untreated, "56009")["levels"]["forage_aum"]["index"]
    untreated = te.advance_year(untreated)
    decayed = te.get_county_ag(untreated, "56009")["levels"]["forage_aum"]["index"]
    assert treated_peak > decayed > 1

    maintained = te.initialize_state()
    maintained, _ = te.apply_action(
        maintained, "invasive_species_removal", "56009", 100000
    )
    maintained, _ = te.apply_action(
        maintained, "rangeland_restoration_maintenance", "56009", 100000
    )
    held_peak = te.get_county_ag(maintained, "56009")["levels"]["forage_aum"]["index"]
    maintained = te.advance_year(maintained)
    assert te.get_county_ag(maintained, "56009")["levels"]["forage_aum"]["index"] == held_peak


def test_treatment_decay_reads_the_action_reinvasion_schedule():
    state = te.initialize_state()
    state["action_library"]["actions"]["invasive_species_removal"][
        "reinvasion_decay"
    ]["fraction_retreated_per_year"] = 0.50
    state, _ = te.apply_action(
        state, "invasive_species_removal", "56009", 100000
    )
    peak_delta = (
        te.get_county_ag(state, "56009")["levels"]["forage_aum"]["index"] - 1
    )
    state = te.advance_year(state)
    decayed_delta = (
        te.get_county_ag(state, "56009")["levels"]["forage_aum"]["index"] - 1
    )
    assert decayed_delta == pytest.approx(peak_delta * 0.5, abs=1e-6)


def test_maintenance_without_prior_treatment_fails_loudly():
    with pytest.raises(ValueError, match="requires invasive_species_removal"):
        te.apply_action(
            te.initialize_state(),
            "rangeland_restoration_maintenance", "56009", 10000,
        )


def test_d1_two_year_event_depresses_and_recovers_only_through_hazard_path():
    state = te.initialize_state()
    event = {
        "event_id": "ag-drought-1", "year": 2026, "geoid": "56009",
        "hazard_kind": "drought_stress", "severity_milli": 1000,
        "consequence_multiplier_ppm": 0, "ag_drought_tier": "D1",
        "duration_years": 2, "lens": "historical", "seed": 7,
    }
    state, outcomes = te.apply_hazard_event_consequences(state, [event])
    assert outcomes[0]["handler"] == "county_ag_d1"
    state = te.advance_year(state)
    y1 = te.get_county_ag(state, "56009")["levels"]
    state = te.advance_year(state)
    y2 = te.get_county_ag(state, "56009")["levels"]
    state = te.advance_year(state)
    recovered = te.get_county_ag(state, "56009")["levels"]
    assert y1["forage_aum"]["index"] == y2["forage_aum"]["index"] == pytest.approx(0.8)
    assert y1["cattle_head"] < recovered["cattle_head"]
    assert recovered["forage_aum"]["index"] == pytest.approx(1.0)
    assert recovered["drought"]["years_remaining"] == 0


def test_d1_hazard_reads_forage_and_water_coefficients_from_action_library():
    state = te.initialize_state()
    parameters = state["action_library"]["disturbances"]["drought_d1_ag"][
        "lens_delta_parameters"
    ]["D1"]
    parameters["forage_production_delta"] = -0.10
    parameters["irrigation_demand_delta"] = 0.25
    event = {
        "event_id": "ag-drought-data-driven", "year": 2026, "geoid": "56009",
        "hazard_kind": "drought_stress", "severity_milli": 1000,
        "consequence_multiplier_ppm": 0, "ag_drought_tier": "D1",
        "duration_years": 1, "lens": "historical", "seed": 7,
    }
    state, _ = te.apply_hazard_event_consequences(state, [event])
    state = te.advance_year(state)
    levels = te.get_county_ag(state, "56009")["levels"]
    assert levels["forage_aum"]["index"] == pytest.approx(0.9)
    assert levels["drought"]["water_curtailment_fraction"] == pytest.approx(0.25)


def test_reclamation_returns_converted_acres_to_rangeland():
    state = te.initialize_state()
    state, _ = te.apply_action(state, "solar_utility", "56013", 1000)
    before = te.get_county_ag(state, "56013")["levels"]["land_acres"]
    state, delta = te.apply_action(state, "mine_land_reclamation", "56013", 2000)
    after = te.get_county_ag(state, "56013")["levels"]["land_acres"]
    assert delta["ag_delta"]["reclaimed_to_rangeland_acres"] == 2000
    assert after["converted_to_energy"] == before["converted_to_energy"] - 2000
    assert after["private_rangeland"] == before["private_rangeland"] + 2000


def test_ag_valuation_is_on_existing_fiscal_ledger_not_parallel_state():
    state = te.initialize_state()
    assert "ag_valuation_usd" in state["county_fiscal"]["56013"]
    assert "ag_valuation_usd" not in state["county_ag"]["56013"]
    assert "county_ag_fiscal" not in state
    before_tax = state["county_fiscal"]["56013"]["property_tax"]
    before_value = state["county_fiscal"]["56013"]["ag_valuation_usd"]["total"]
    state, delta = te.apply_action(state, "solar_utility", "56013", 1000)
    assert state["county_fiscal"]["56013"]["property_tax"] > before_tax
    assert state["county_fiscal"]["56013"]["ag_valuation_usd"]["total"] <= before_value
    displaced_assessed = (
        before_value
        - state["county_fiscal"]["56013"]["ag_valuation_usd"]["total"]
    ) * 0.095
    displaced_tax = (
        displaced_assessed
        * state["county_fiscal"]["56013"]["mill_levy_mills"] / 1000
    )
    gross_industrial_tax = state["fiscal_coefficients"]["solar_utility"][
        "property_tax_annual"
    ]["56013"]["value"]
    assert delta["fiscal_delta"]["property_tax_delta"] == pytest.approx(
        gross_industrial_tax - displaced_tax
    )
    assert state["county_fiscal"]["56013"]["property_tax"] - before_tax == pytest.approx(
        gross_industrial_tax - displaced_tax
    )


def test_partial_maintenance_does_not_hold_the_unmaintained_treatment_for_free():
    state = te.initialize_state()
    state, _ = te.apply_action(
        state, "invasive_species_removal", "56009", 100000
    )
    state, _ = te.apply_action(
        state, "rangeland_restoration_maintenance", "56009", 25000
    )
    peak = te.get_county_ag(state, "56009")["levels"]["forage_aum"]["index"]
    state = te.advance_year(state)
    partial = te.get_county_ag(state, "56009")["levels"]["forage_aum"]["index"]
    assert 1 < partial < peak


def test_ag_action_is_pure_and_does_not_change_input_state():
    original = te.initialize_state()
    before = te.ag_digest(original)["md5"]
    changed, _ = te.apply_action(
        original, "invasive_species_removal", "56009", 100000
    )
    assert te.ag_digest(original)["md5"] == before
    assert te.ag_digest(changed)["md5"] != before


def test_hazard_sampling_is_exogenous_to_ag_state():
    state = te.initialize_state()
    changed, _ = te.apply_action(
        state, "invasive_species_removal", "56009", 100000
    )
    baselines = [{
        "geoid": "56009", "heat_wave_frequency": 0,
        "heat_wave_risk_score": 0, "wildfire_frequency": 0,
        "wildfire_risk_score": 0, "drought_frequency": 1,
        "drought_risk_score": 50, "severe_storm_frequency": 0,
        "severe_storm_risk_score": 0,
    }]
    kwargs = dict(
        seed=11, lens="ssp370", years=[2026, 2027],
        county_baselines=baselines, projection_points=[],
    )
    assert te.sample_hazard_events(state, **kwargs) == te.sample_hazard_events(changed, **kwargs)
