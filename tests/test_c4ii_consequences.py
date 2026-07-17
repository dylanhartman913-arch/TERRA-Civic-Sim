"""Discriminating C4-ii consequence and adaptation boundary tests."""

from __future__ import annotations

import copy
import inspect
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te

from c4i_event_harness import load_hazard_baselines, load_projection_points


def _event(kind="heat_wave", geoid="56037", severity_milli=2_000):
    return {
        "event_id": f"c4ii:ssp370:42:2026:{geoid}:{kind}",
        "year": 2026,
        "geoid": geoid,
        "hazard_kind": kind,
        "severity_milli": severity_milli,
        "annual_probability_ppm": 500_000,
        "baseline_frequency_micros": 1_000_000,
        "projection_factor_ppm": 1_000_000,
        "lens": "ssp370",
        "seed": 42,
        "consequence_multiplier_ppm": 0,
    }


def test_ac1_heat_consequence_uses_existing_handler_and_c2_selects_anchor_victims():
    state = te.initialize_state()
    before = te.state_digest(state)["md5"]

    coupled, outcomes = te.apply_hazard_event_consequences(
        state, [_event()]
    )

    assert te.state_digest(state)["md5"] == before
    assert outcomes[0]["status"] == "applied_existing_handler"
    assert outcomes[0]["handler"] == "inject_disturbance"
    assert outcomes[0]["delta"]["disturbance_type"] == "heat_wave"
    assert any(asset_id.startswith("anchor_56037_") for asset_id in outcomes[0]["victim_asset_ids"])
    assert coupled["disturbance_history"][-1]["disturbance_type"] == "heat_wave"
    assert te.state_digest(coupled)["md5"] != before


def test_ac1_unsupported_consequence_is_logged_and_skipped_without_parallel_mechanic():
    state = te.initialize_state()
    digests_before = (
        te.state_digest(state)["md5"],
        te.fiscal_digest(state)["md5"],
        te.existing_assets_digest(state)["md5"],
        te.history_digest(state)["md5"],
    )

    skipped, outcomes = te.apply_hazard_event_consequences(
        state, [_event("wildfire_smoke_proximity")]
    )

    assert outcomes[0]["status"] == "skipped_no_existing_handler"
    assert outcomes[0]["handler"] is None
    assert outcomes[0]["victim_asset_ids"]
    assert "no existing derate/outage/damage handler" in outcomes[0]["reason"]
    assert skipped is state
    assert not hasattr(te, "apply_climate_damage")
    assert not hasattr(te, "apply_climate_outage")
    assert (
        te.state_digest(skipped)["md5"],
        te.fiscal_digest(skipped)["md5"],
        te.existing_assets_digest(skipped)["md5"],
        te.history_digest(skipped)["md5"],
    ) == digests_before


def test_ac2_adaptation_has_structural_write_allowlist_and_cannot_accept_hazard_inputs():
    state = te.initialize_state()
    action = state["action_library"]["actions"]["heat_resilience_upgrade"]
    effect = action["climate_adaptation"]
    helper_parameters = tuple(inspect.signature(te._apply_climate_adaptation).parameters)

    assert helper_parameters == ("state", "action", "geoid")
    assert te.CLIMATE_ADAPTATION_WRITABLE_FIELDS == {
        "climate_vulnerability_ppm"
    }
    assert effect["writable_asset_field"] in te.CLIMATE_ADAPTATION_WRITABLE_FIELDS
    assert not {
        "climate_context",
        "county_baselines",
        "projection_points",
        "seed",
        "lens",
        "years",
    }.intersection(effect)

    poisoned = copy.deepcopy(state)
    poisoned["action_library"] = copy.deepcopy(state["action_library"])
    poisoned["action_library"]["actions"]["heat_resilience_upgrade"][
        "climate_adaptation"
    ]["climate_context"] = {"lens": "ssp370", "tables": {}}
    with pytest.raises(ValueError, match="cannot write"):
        te.apply_action(poisoned, "heat_resilience_upgrade", "56037", 1)


def test_ac2_adaptation_reduces_vulnerability_but_raw_sampling_is_exogenous():
    state = te.initialize_state()
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    sample_kwargs = {
        "seed": 42,
        "lens": "ssp370",
        "years": [2026],
        "county_baselines": baselines,
        "projection_points": projections,
    }
    raw_before = te.sample_hazard_events(state, **sample_kwargs)
    climate_context = {"lens": "ssp370", "tables": {"sentinel": {}}}
    context_before = copy.deepcopy(climate_context)

    adapted, delta = te.apply_action(
        state,
        "heat_resilience_upgrade",
        "56037",
        1,
        climate_context=climate_context,
    )
    raw_after = te.sample_hazard_events(adapted, **sample_kwargs)

    assert raw_after == raw_before
    assert climate_context == context_before
    assert delta["adaptation_delta"]["affected_asset_ids"]
    assert all(
        asset.get("climate_vulnerability_ppm", {}).get("heat_wave") == 500_000
        for asset in adapted["asset_registry"]
        if asset["asset_id"] in delta["adaptation_delta"]["affected_asset_ids"]
    )

    _, baseline_outcomes = te.apply_hazard_event_consequences(state, [_event()])
    _, adapted_outcomes = te.apply_hazard_event_consequences(adapted, [_event()])
    assert adapted_outcomes[0]["consequence_multiplier_ppm"] < baseline_outcomes[0]["consequence_multiplier_ppm"]


def test_consequence_normalization_has_a_discriminating_severity_ceiling():
    state = te.initialize_state()
    at_ceiling, _ = te.apply_hazard_event_consequences(
        state, [_event(severity_milli=te.CONSEQUENCE_SEVERITY_CEILING_MILLI)]
    )
    over_ceiling, _ = te.apply_hazard_event_consequences(
        state, [_event(severity_milli=9_000)]
    )
    assert te.state_digest(at_ceiling)["md5"] == te.state_digest(over_ceiling)["md5"]


def test_coupling_rejects_a_pre_coupled_event_instead_of_double_applying():
    state = te.initialize_state()
    pre_coupled = {**_event(), "consequence_multiplier_ppm": 500_000}
    with pytest.raises(ValueError, match="inert consequence multiplier"):
        te.apply_hazard_event_consequences(state, [pre_coupled])


def test_ac6_adaptation_price_is_explicitly_flagged():
    state = te.initialize_state()
    action = state["action_library"]["actions"]["heat_resilience_upgrade"]
    assert action["cost_2024"] == action["cost_2035"] == action["cost_2050"] == 0
    assert action["confidence"] == "flagged"
    assert action["cost_source"].startswith("FLAGGED")
