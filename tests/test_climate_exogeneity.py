"""
Python climate exogeneity tests — mirrors TS climate-exogeneity.test.ts.

Asserts that climate_context is never mutated by engine functions.
The climate context is exogenous to player decisions.
"""
import copy
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import terra_engine as te

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
if not (DATA_DIR / "synthetic_buses.geojson").exists():
    _main = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                 "Research/Energy Modeling/energy-map/data/processed")
    if (_main / "synthetic_buses.geojson").exists():
        DATA_DIR = _main
TS_DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"


def load_state():
    return te.initialize_state(data_dir=DATA_DIR)


def load_state_with_retirements():
    with open(TS_DATA_DIR / "baseline_retirements.json") as f:
        retirements_raw = json.load(f)
    retirements = {k: v for k, v in retirements_raw.items() if k != "_meta"}
    return te.initialize_state(data_dir=DATA_DIR, baseline_retirements=retirements)


class TestClimateExogeneity:
    """C0 port — 6 exogeneity tests mirroring climate-exogeneity.test.ts."""

    def test_ex1_empty_climate_context_shape(self):
        """EX-1: EMPTY_CLIMATE_CONTEXT has expected shape."""
        ctx = te.EMPTY_CLIMATE_CONTEXT
        assert ctx['lens'] == 'historical'
        assert ctx['tables'] == {}
        assert len(ctx) == 2

    def test_ex2_climate_context_unchanged_after_apply_action(self):
        """EX-2: climate_context is unchanged after apply_action."""
        state = load_state()
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        snapshot = json.dumps(ctx, sort_keys=True)

        new_state, _ = te.apply_action(state, 'solar_utility', '56005', 200,
                                       climate_context=ctx)

        assert json.dumps(ctx, sort_keys=True) == snapshot
        assert ctx['lens'] == 'historical'
        assert ctx['tables'] == {}

    def test_ex3_climate_context_unchanged_after_queue_action(self):
        """EX-3: climate_context is unchanged after queue_action."""
        state = load_state()
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        snapshot = json.dumps(ctx, sort_keys=True)

        new_state = te.queue_action(state, 'smr_advanced', '56023', 345, 2026,
                                    climate_context=ctx)

        assert json.dumps(ctx, sort_keys=True) == snapshot
        assert new_state['year'] == state['year']

    def test_ex4_climate_context_unchanged_after_advance_year(self):
        """EX-4: climate_context is unchanged after advance_year."""
        state = load_state()
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        snapshot = json.dumps(ctx, sort_keys=True)

        new_state = te.advance_year(state, climate_context=ctx)

        assert json.dumps(ctx, sort_keys=True) == snapshot
        assert new_state['year'] == state['year'] + 1

    def test_ex5_divergent_action_logs_identical_context(self):
        """EX-5: divergent action logs produce bit-identical climate contexts."""
        state_a = load_state_with_retirements()
        state_b = load_state_with_retirements()
        ctx_a = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        ctx_b = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)

        # Path A: queue several actions, advance years
        state_a = te.queue_action(state_a, 'solar_utility', '56005', 500, 2026,
                                  climate_context=ctx_a)
        state_a = te.queue_action(state_a, 'smr_advanced', '56023', 345, 2026,
                                  climate_context=ctx_a)
        state_a = te.queue_action(state_a, 'data_center_hyperscale', '56021', 100, 2026,
                                  climate_context=ctx_a)
        for _ in range(5):
            state_a = te.advance_year(state_a, climate_context=ctx_a)

        # Path B: advance years with no actions
        for _ in range(5):
            state_b = te.advance_year(state_b, climate_context=ctx_b)

        assert ctx_a == ctx_b
        assert ctx_a['lens'] == ctx_b['lens']
        assert ctx_a['tables'] == ctx_b['tables']

    def test_ex6_nonhistorical_context_also_exogenous(self):
        """EX-6: non-historical climate context with tables is not mutated."""
        synthetic_ctx = {
            'lens': 'ssp245',
            'tables': {
                'cdd': {
                    '56005': {'2040': 188.0, '2050': 310.0},
                    '56023': {'2040': 120.0, '2050': 200.0},
                },
            },
        }
        snapshot = json.dumps(synthetic_ctx, sort_keys=True)

        state = load_state()
        state = te.queue_action(state, 'solar_utility', '56005', 300, 2026,
                                climate_context=synthetic_ctx)
        state = te.advance_year(state, climate_context=synthetic_ctx)
        state, _ = te.apply_action(state, 'prairie_restoration', '56005', 1,
                                   climate_context=synthetic_ctx)
        state = te.advance_year(state, climate_context=synthetic_ctx)

        assert json.dumps(synthetic_ctx, sort_keys=True) == snapshot
        assert synthetic_ctx['lens'] == 'ssp245'
