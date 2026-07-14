"""
Golden L — C3 climate coupling parity fixture.

Tests demand modulation, water-stress derate, and heat derate under both
historical (identity) and ssp370 (active) lenses. Verifies:
  - Digest parity across lenses where expected
  - Fiscal and existing-assets digests are lens-invariant
  - State digest diverges under non-historical lens
  - Probe-year digests match frozen values
  - Hand-check arithmetic for coupling functions
  - Deterministic replay
"""
import copy
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import terra_engine as te
from climate_couplings import (
    compute_demand_modifier,
    compute_water_stress_derate,
    compute_heat_derate,
)

# ── Load fixture ────────────────────────────────────────────────────────────

FIXTURE_PATH = Path(__file__).parent.parent / "terra-app" / "tests" / "parity" / "fixtures" / "golden_l.json"
with open(FIXTURE_PATH) as f:
    FIXTURE = json.load(f)

DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
if not (DATA_DIR / "synthetic_buses.geojson").exists():
    _main = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                 "Research/Energy Modeling/energy-map/data/processed")
    if (_main / "synthetic_buses.geojson").exists():
        DATA_DIR = _main

TS_DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"


def _load_retirements():
    with open(TS_DATA_DIR / "baseline_retirements.json") as f:
        raw = json.load(f)
    return {k: v for k, v in raw.items() if k != "_meta"}


def _replay(climate_context):
    """Replay the Golden L action log under the given climate context."""
    retirements = _load_retirements()
    state = te.initialize_state(data_dir=DATA_DIR, baseline_retirements=retirements)
    for entry in FIXTURE['action_log']:
        state = te.queue_action(
            state, entry['action_id'], entry['geoid'],
            entry['magnitude'], entry['decision_year'],
            climate_context=climate_context,
        )
    probe_digests = {}
    for _ in range(state['year'], 2050):
        state = te.advance_year(state, climate_context=climate_context)
        if state['year'] in FIXTURE['probe_years']:
            lens = climate_context.get('lens', 'historical')
            cl = lens if lens != 'historical' else None
            probe_digests[str(state['year'])] = te.state_digest(state, climate_lens=cl)['md5']
    return state, probe_digests


# ── Tests ───────────────────────────────────────────────────────────────────

class TestGoldenL:
    def test_l1_historical_state_digest(self):
        """L-1: Historical lens → state digest matches frozen value."""
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        state, probes = _replay(ctx)
        assert te.state_digest(state)['md5'] == FIXTURE['digests_historical']['state_md5']

    def test_l2_ssp370_state_digest(self):
        """L-2: SSP370 lens → state digest matches frozen value."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx = {'lens': 'ssp370', 'tables': tables}
        state, probes = _replay(ctx)
        assert te.state_digest(state, climate_lens='ssp370')['md5'] == FIXTURE['digests_ssp370']['state_md5']

    def test_l3_state_digest_differs_between_lenses(self):
        """L-3: State digest differs between historical and ssp370."""
        assert FIXTURE['digests_historical']['state_md5'] != FIXTURE['digests_ssp370']['state_md5']

    def test_l4_fiscal_digest_identical(self):
        """L-4: Fiscal digest is identical under both lenses."""
        ctx_hist = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        state_h, _ = _replay(ctx_hist)
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx_ssp = {'lens': 'ssp370', 'tables': tables}
        state_s, _ = _replay(ctx_ssp)
        assert te.fiscal_digest(state_h)['md5'] == te.fiscal_digest(state_s)['md5']
        assert te.fiscal_digest(state_h)['md5'] == FIXTURE['digests_historical']['fiscal_md5']

    def test_l5_existing_assets_digest_identical(self):
        """L-5: Existing assets digest is identical under both lenses."""
        ctx_hist = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        state_h, _ = _replay(ctx_hist)
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx_ssp = {'lens': 'ssp370', 'tables': tables}
        state_s, _ = _replay(ctx_ssp)
        assert te.existing_assets_digest(state_h)['md5'] == te.existing_assets_digest(state_s)['md5']
        assert te.existing_assets_digest(state_h)['md5'] == FIXTURE['digests_historical']['existing_assets_md5']

    def test_l6_probe_year_digests_historical(self):
        """L-6: Probe-year state digests match under historical lens."""
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        _, probes = _replay(ctx)
        for yr, expected_md5 in FIXTURE['digests_historical']['probe_year_state_md5s'].items():
            assert probes[yr] == expected_md5, f"Year {yr} mismatch"

    def test_l7_probe_year_digests_ssp370(self):
        """L-7: Probe-year state digests match under ssp370 lens."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx = {'lens': 'ssp370', 'tables': tables}
        _, probes = _replay(ctx)
        for yr, expected_md5 in FIXTURE['digests_ssp370']['probe_year_state_md5s'].items():
            assert probes[yr] == expected_md5, f"Year {yr} mismatch"

    def test_l8_hand_check_demand_modifier(self):
        """L-8: Demand modifier matches hand-check arithmetic."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx = {'lens': 'ssp370', 'tables': tables}
        for yr_str, counties in FIXTURE['hand_check_arithmetic'].items():
            year = int(yr_str)
            for gid, expected in counties.items():
                dm = compute_demand_modifier(gid, year, ctx)
                assert abs(dm['modifier'] - expected['demand_modifier']) < 1e-5, (
                    f"Demand mismatch {gid}@{year}: {dm['modifier']} != {expected['demand_modifier']}"
                )

    def test_l9_hand_check_water_derate(self):
        """L-9: Water stress derate matches hand-check arithmetic."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx = {'lens': 'ssp370', 'tables': tables}
        for yr_str, counties in FIXTURE['hand_check_arithmetic'].items():
            year = int(yr_str)
            for gid, expected in counties.items():
                ws = compute_water_stress_derate(gid, year, ctx)
                assert abs(ws['derate_factor'] - expected['water_derate']) < 1e-5, (
                    f"Water mismatch {gid}@{year}: {ws['derate_factor']} != {expected['water_derate']}"
                )

    def test_l10_hand_check_heat_derate(self):
        """L-10: Heat derate matches hand-check arithmetic."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx = {'lens': 'ssp370', 'tables': tables}
        for yr_str, counties in FIXTURE['hand_check_arithmetic'].items():
            year = int(yr_str)
            for gid, expected in counties.items():
                ht = compute_heat_derate(gid, year, ctx)
                assert abs(ht['derate_factor'] - expected['heat_derate']) < 1e-5, (
                    f"Heat mismatch {gid}@{year}: {ht['derate_factor']} != {expected['heat_derate']}"
                )

    def test_l11_deterministic(self):
        """L-11: Two identical replays produce identical digests."""
        tables = FIXTURE['climate_table_slice']['ssp370']
        ctx1 = {'lens': 'ssp370', 'tables': copy.deepcopy(tables)}
        ctx2 = {'lens': 'ssp370', 'tables': copy.deepcopy(tables)}
        state1, _ = _replay(ctx1)
        state2, _ = _replay(ctx2)
        assert te.state_digest(state1, climate_lens='ssp370')['md5'] == \
               te.state_digest(state2, climate_lens='ssp370')['md5']
