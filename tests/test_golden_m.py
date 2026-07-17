"""Golden M: C4-ii resilience fork, determinism, and four-contract parity."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te
from hazard_events import canonical_event_stream

from c4i_event_harness import load_hazard_baselines, load_projection_points


FIXTURE_PATH = ROOT / "terra-app" / "tests" / "parity" / "fixtures" / "golden_m.json"
SEED = 42
YEARS = tuple(range(2026, 2031))
TARGET_GEOID = "56037"
HISTORICAL_CONTEXT = {"lens": "historical", "tables": {}}


def _digests(state):
    return {
        "state_digest_md5": te.state_digest(state)["md5"],
        "fiscal_digest_md5": te.fiscal_digest(state)["md5"],
        "existing_assets_digest_md5": te.existing_assets_digest(state)["md5"],
        "history_digest_md5": te.history_digest(state)["md5"],
    }


def _adapted_initial_state():
    with (ROOT / "terra-app" / "src" / "data" / "baseline_retirements.json").open() as handle:
        retirements = {
            key: value for key, value in json.load(handle).items() if key != "_meta"
        }
    state = te.initialize_state(baseline_retirements=retirements)
    state, delta = te.apply_action(
        state, "heat_resilience_upgrade", TARGET_GEOID, 1
    )
    assert delta["adaptation_delta"]["affected_asset_ids"]
    return state


def run_golden_m(lens, couple_events=True):
    state = _adapted_initial_state()
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    all_events = []
    all_outcomes = []
    for year in YEARS:
        events = (
            te.sample_hazard_events(
                state,
                seed=SEED,
                lens=lens,
                years=[year],
                county_baselines=baselines,
                projection_points=projections,
            )
            if couple_events
            else []
        )
        all_events.extend(events)
        if couple_events:
            state, outcomes = te.apply_hazard_event_consequences(state, events)
            all_outcomes.extend(outcomes)
        state = te.advance_year(state, climate_context=HISTORICAL_CONTEXT)

    status_counts = {
        status: sum(outcome["status"] == status for outcome in all_outcomes)
        for status in (
            "applied_existing_handler",
            "skipped_no_exposed_assets",
            "skipped_no_existing_handler",
        )
    }
    return {
        **_digests(state),
        "event_count": len(all_events),
        "event_stream_sha256": hashlib.sha256(
            canonical_event_stream(all_events)
        ).hexdigest(),
        "status_counts": status_counts,
    }


def _fixture():
    with FIXTURE_PATH.open() as handle:
        return json.load(handle)


def test_ac3_golden_m_all_four_contracts_match_frozen_fixture():
    fixture = _fixture()
    for lens in ("historical", "ssp245", "ssp370"):
        assert run_golden_m(lens) == fixture["results"][lens]


def test_ac3_same_seed_and_lens_rerun_is_deterministic():
    for lens in ("historical", "ssp245", "ssp370"):
        assert run_golden_m(lens) == run_golden_m(lens)


def test_ac3_resilience_fork_diverges_only_through_events_and_consequences():
    no_event_245 = run_golden_m("ssp245", couple_events=False)
    no_event_370 = run_golden_m("ssp370", couple_events=False)
    historical_control = run_golden_m("historical", couple_events=False)
    ssp245 = run_golden_m("ssp245")
    ssp370 = run_golden_m("ssp370")

    assert no_event_245 == no_event_370 == historical_control
    assert ssp245["event_stream_sha256"] != ssp370["event_stream_sha256"]
    assert ssp245["state_digest_md5"] != ssp370["state_digest_md5"]
    assert ssp245["history_digest_md5"] != ssp370["history_digest_md5"]


def test_ac3_historical_has_zero_events_and_matches_pre_c4_control_exactly():
    historical = run_golden_m("historical")
    control = run_golden_m("historical", couple_events=False)
    assert historical["event_count"] == 0
    assert historical == control
    assert historical == _fixture()["pre_c4_historical_control"]


def test_ac4_ac5_registry_freezes_historical_boundary_without_an_amendment():
    with (ROOT / "data" / "golden" / "fixture_registry.json").open() as handle:
        registry = json.load(handle)
    boundary = registry["climate_lens_contract"]["goldens_a_through_l"]
    golden_m = next(
        item for item in registry["fixtures"]
        if item.get("fixture_id") == "golden_m"
    )

    assert registry["permitted_amendments"] == registry["amendments_used"] == 4
    assert "remain asserted" in boundary["historical"]
    assert boundary["non_historical"].startswith("Not asserted")
    assert golden_m["note"].startswith("New fixture; no A-L fixture regenerated")
    for lens in ("historical", "ssp245", "ssp370"):
        expected = _fixture()["results"][lens]
        assert golden_m[lens]["state_digest_md5"] == expected["state_digest_md5"]
        assert golden_m[lens]["history_digest_md5"] == expected["history_digest_md5"]


if __name__ == "__main__":
    results = {
        lens: run_golden_m(lens)
        for lens in ("historical", "ssp245", "ssp370")
    }
    payload = {
        "schema_version": "golden-m-v1",
        "description": "C4-ii resilience fork; lens enters only through sampled events and existing-handler consequences",
        "script": {
            "seed": SEED,
            "years": list(YEARS),
            "baseline_retirements": True,
            "action_sequence": [
                {
                    "action_id": "heat_resilience_upgrade",
                    "geoid": TARGET_GEOID,
                    "magnitude": 1,
                    "year": 2025,
                }
            ],
        },
        "pre_c4_historical_control": run_golden_m(
            "historical", couple_events=False
        ),
        "results": results,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
