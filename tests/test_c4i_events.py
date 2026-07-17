"""Focused C4-i climate hazard event tests."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te
from hazard_events import (
    INERT_CONSEQUENCE_MULTIPLIER_PPM,
    canonical_event_stream,
    sample_climate_hazard_events,
)

from c4i_event_harness import (
    ACTIVE_LENSES,
    ACTIVE_SEEDS,
    FULL_YEAR_RANGE,
    HAZARD_KINDS,
    MATRIX_YEARS,
    active_event_matrix,
    load_hazard_baselines,
    load_projection_points,
)


def _canonical_action_log(value: list[dict]) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def test_ac1_active_matrix_has_required_coverage_and_canonical_bytes():
    events = active_event_matrix(sample_climate_hazard_events)
    assert {event["hazard_kind"] for event in events} == set(HAZARD_KINDS)
    assert len({event["geoid"] for event in events}) > 1
    assert len({event["year"] for event in events}) > 1
    assert {event["lens"] for event in events} == set(ACTIVE_LENSES)
    assert {event["seed"] for event in events} == set(ACTIVE_SEEDS)

    stream = canonical_event_stream(events)
    assert stream.endswith(b"\n")
    assert b" " not in stream
    assert json.loads(stream) == events
    assert INERT_CONSEQUENCE_MULTIPLIER_PPM == 0
    assert all(
        event["consequence_multiplier_ppm"]
        == INERT_CONSEQUENCE_MULTIPLIER_PPM
        for event in events
    )


def test_ac2_seed_lens_determinism_and_seed_negative_control():
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    digests = {}
    for lens in ACTIVE_LENSES:
        for seed in ACTIVE_SEEDS:
            kwargs = {
                "seed": seed,
                "lens": lens,
                "years": list(MATRIX_YEARS),
                "county_baselines": copy.deepcopy(baselines),
                "projection_points": copy.deepcopy(projections),
            }
            first = canonical_event_stream(sample_climate_hazard_events(**kwargs))
            second = canonical_event_stream(
                sample_climate_hazard_events(
                    **{
                        **kwargs,
                        "county_baselines": copy.deepcopy(baselines),
                        "projection_points": copy.deepcopy(projections),
                    }
                )
            )
            assert first == second
            digests[(lens, seed)] = hashlib.sha256(first).hexdigest()
    assert any(
        digests[(lens, ACTIVE_SEEDS[0])] != digests[(lens, seed)]
        for lens in ACTIVE_LENSES
        for seed in ACTIVE_SEEDS[1:]
    )


def test_ac3_historical_lens_is_exact_empty_stream_for_all_years_and_seed_classes():
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    active_control = sample_climate_hazard_events(
        seed=ACTIVE_SEEDS[0],
        lens="ssp370",
        years=MATRIX_YEARS,
        county_baselines=baselines,
        projection_points=projections,
    )
    assert active_control

    for seed in (0, -1, -2_147_483_648, 42, 2_147_483_647):
        with_tables = sample_climate_hazard_events(
            seed=seed,
            lens="historical",
            years=FULL_YEAR_RANGE,
            county_baselines=baselines,
            projection_points=projections,
        )
        empty_context = sample_climate_hazard_events(
            seed=seed,
            lens="historical",
            years=FULL_YEAR_RANGE,
            county_baselines=baselines,
            projection_points=[],
        )
        history = []
        for year in FULL_YEAR_RANGE:
            history.extend(
                sample_climate_hazard_events(
                    seed=seed,
                    lens="historical",
                    years=[year],
                    county_baselines=baselines,
                    projection_points=projections,
                )
            )
        assert with_tables == empty_context == history == []
        assert canonical_event_stream(with_tables) == b"[]\n"


def test_ac5_action_log_mutations_cannot_change_event_stream_before_or_after_advance():
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    control_log: list[dict] = []
    mutated_log = [
        {
            "action_id": "solar_utility",
            "geoid": "56005",
            "magnitude": 100,
            "year": 2026,
        },
        {
            "action_id": "smr_advanced",
            "geoid": "56023",
            "magnitude": 345,
            "year": 2028,
        },
        {
            "action_id": "affordable_housing",
            "geoid": "56021",
            "magnitude": 500,
            "year": 2027,
        },
    ]
    transformed_log = [
        {**mutated_log[2], "magnitude": 350, "geoid": "56023"},
        {**mutated_log[0], "year": 2029},
    ]
    action_bytes = {
        _canonical_action_log(control_log),
        _canonical_action_log(mutated_log),
        _canonical_action_log(transformed_log),
    }
    assert len(action_bytes) == 3

    control_state = te.initialize_state()
    mutated_state, _ = te.apply_action(
        control_state, "solar_utility", "56005", 100
    )
    mutated_state, _ = te.apply_action(
        mutated_state, "workforce_retraining", "56023", 345
    )
    mutated_state, _ = te.apply_action(
        mutated_state, "affordable_housing", "56021", 500
    )
    transformed_state = copy.deepcopy(mutated_state)
    transformed_state["action_history"] = [
        {
            **transformed_state["action_history"][2],
            "magnitude": 350,
            "location": "56023",
            "geoid": "56023",
        },
        {
            **transformed_state["action_history"][0],
            "timestamp": 2029,
        },
    ]
    advanced_state = te.advance_year(transformed_state)
    engine_action_bytes = {
        _canonical_action_log(control_state["action_history"]),
        _canonical_action_log(mutated_state["action_history"]),
        _canonical_action_log(advanced_state["action_history"]),
    }
    assert len(engine_action_bytes) == 3
    for lens in ACTIVE_LENSES:
        for seed in (0, 42):
            kwargs = {
                "seed": seed,
                "lens": lens,
                "years": MATRIX_YEARS,
                "county_baselines": baselines,
                "projection_points": projections,
            }
            before = canonical_event_stream(
                te.sample_hazard_events(control_state, **kwargs)
            )
            assert json.loads(before)
            mutated = canonical_event_stream(
                te.sample_hazard_events(mutated_state, **kwargs)
            )
            after = canonical_event_stream(
                te.sample_hazard_events(advanced_state, **kwargs)
            )
            assert advanced_state["year"] == control_state["year"] + 1
            assert before == mutated == after


def test_p50_only_physics_and_engine_wrapper_match_event_module():
    baselines = load_hazard_baselines()
    projections = load_projection_points()
    kwargs = {
        "seed": 42,
        "lens": "ssp370",
        "years": MATRIX_YEARS,
        "county_baselines": baselines,
        "projection_points": projections,
    }
    expected = sample_climate_hazard_events(**kwargs)
    non_p50_mutation = copy.deepcopy(projections)
    non_p50_mutation.append(
        {
            "geoid": "56005",
            "lens": "ssp370",
            "metric": "days_gt_95f",
            "epoch": 2050,
            "percentile": "p90",
            "value": 1_000_000.0,
        }
    )
    assert expected == sample_climate_hazard_events(
        **{**kwargs, "projection_points": non_p50_mutation}
    )
    assert expected == te.sample_hazard_events(te.initialize_state(), **kwargs)
