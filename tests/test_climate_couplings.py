"""
Unit tests for climate_couplings.py — coupling functions, delta table builder,
epoch interpolation, and historical baseline back-derivation.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from climate_couplings import (
    DEMAND_COEFFICIENTS,
    WATER_STRESS_DERATE,
    HEAT_DERATE,
    EPOCH_MIDPOINTS,
    _back_derive_window_values,
    _derive_historical_baselines,
    build_delta_tables,
    interpolate_epoch_value,
    compute_demand_modifier,
    compute_water_stress_derate,
    compute_heat_derate,
)

DATA_DIR = Path(__file__).parent.parent / "data" / "processed"


# ── Back-derivation tests ────────────────────────────────────────────────────

class TestBackDerivation:
    def test_round_trip_synthetic(self):
        """Back-derived window values reconstruct the epoch values."""
        # Synthetic window values
        w_hist, w35, w50, w65 = 500.0, 700.0, 900.0, 1000.0
        # Compute epoch values using the doctrine weights
        ep2030 = w_hist * (1 - 49/60) + w35 * (49/60)
        ep2040 = w35 * 0.7 + w50 * 0.3
        ep2050 = w35 * (1/30) + w50 * (29/30)
        ep2065 = w50 * (1/30) + w65 * (29/30)
        # Back-derive
        h, w35r, w50r, w65r = _back_derive_window_values(ep2030, ep2040, ep2050, ep2065)
        assert abs(h - w_hist) < 1e-8
        assert abs(w35r - w35) < 1e-8
        assert abs(w50r - w50) < 1e-8
        assert abs(w65r - w65) < 1e-8

    def test_historical_baselines_physically_plausible(self):
        """Back-derived historical CDD/HDD are in plausible range."""
        with open(DATA_DIR / "county_climate_projections.json") as f:
            data = json.load(f)
        baselines = _derive_historical_baselines(data['records'])

        # Campbell WY (56005): continental semi-arid, moderate CDD, high HDD
        cdd_camp = baselines['cdd']['56005']
        hdd_camp = baselines['hdd']['56005']
        assert 300 < cdd_camp < 800, f"CDD {cdd_camp} outside plausible range"
        assert 6000 < hdd_camp < 9000, f"HDD {hdd_camp} outside plausible range"

        # Eagle CO (08037): mountain, very low CDD, very high HDD
        cdd_eagle = baselines['cdd']['08037']
        hdd_eagle = baselines['hdd']['08037']
        assert cdd_eagle < 100, f"Eagle CO CDD {cdd_eagle} too high for mountain county"
        assert hdd_eagle > 9000, f"Eagle CO HDD {hdd_eagle} too low for mountain county"


# ── Epoch interpolation tests ────────────────────────────────────────────────

class TestEpochInterpolation:
    def setup_method(self):
        self.table = {
            '56005': {'2030': 100.0, '2040': 200.0, '2050': 300.0, '2065': 400.0},
        }

    def test_exact_epoch_midpoint(self):
        """Interpolation at exact midpoint returns epoch value."""
        assert interpolate_epoch_value(self.table, '56005', 2030) == 100.0
        assert interpolate_epoch_value(self.table, '56005', 2050) == 300.0

    def test_midpoint_between_epochs(self):
        """Linear interpolation between 2030 and 2040."""
        val = interpolate_epoch_value(self.table, '56005', 2035)
        assert abs(val - 150.0) < 1e-10

    def test_clamp_before_first(self):
        """Year before first epoch clamps to first value."""
        val = interpolate_epoch_value(self.table, '56005', 2020)
        assert val == 100.0

    def test_clamp_after_last(self):
        """Year after last epoch clamps to last value."""
        val = interpolate_epoch_value(self.table, '56005', 2080)
        assert val == 400.0

    def test_missing_geoid(self):
        """Unknown geoid returns 0.0."""
        val = interpolate_epoch_value(self.table, '99999', 2040)
        assert val == 0.0


# ── Demand modifier tests ────────────────────────────────────────────────────

class TestDemandModifier:
    def test_historical_returns_identity(self):
        ctx = {'lens': 'historical', 'tables': {}}
        result = compute_demand_modifier('56005', 2040, ctx)
        assert result['modifier'] == 1.0

    def test_positive_cdd_increases_demand(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'cdd': {'56005': {'2030': 100.0, '2040': 200.0, '2050': 300.0, '2065': 400.0}},
                'hdd': {'56005': {'2030': 0.0, '2040': 0.0, '2050': 0.0, '2065': 0.0}},
            },
        }
        result = compute_demand_modifier('56005', 2040, ctx)
        expected = 1.0 + DEMAND_COEFFICIENTS['beta_cdd'] * 200.0
        assert abs(result['modifier'] - expected) < 1e-10

    def test_negative_hdd_decreases_demand(self):
        """Warming reduces HDD → demand decreases (positive beta × negative delta)."""
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'cdd': {'56005': {'2030': 0.0, '2040': 0.0, '2050': 0.0, '2065': 0.0}},
                'hdd': {'56005': {'2030': -500.0, '2040': -800.0, '2050': -1000.0, '2065': -1200.0}},
            },
        }
        result = compute_demand_modifier('56005', 2040, ctx)
        expected = 1.0 + DEMAND_COEFFICIENTS['beta_hdd'] * (-800.0)
        assert abs(result['modifier'] - expected) < 1e-10
        assert result['modifier'] < 1.0

    def test_attribution_narrative_present(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'cdd': {'56005': {'2030': 100.0, '2040': 200.0, '2050': 300.0, '2065': 400.0}},
                'hdd': {},
            },
        }
        result = compute_demand_modifier('56005', 2040, ctx)
        assert 'ΔCDD' in result['narrative']
        assert 'ΔHDD' in result['narrative']
        assert result['confidence'] == 'medium'


# ── Water stress derate tests ────────────────────────────────────────────────

class TestWaterStressDerate:
    def test_historical_returns_identity(self):
        ctx = {'lens': 'historical', 'tables': {}}
        result = compute_water_stress_derate('56005', 2040, ctx)
        assert result['derate_factor'] == 1.0

    def test_positive_delta_derates(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'water_stress_index': {
                    '56005': {'2030': 0.01, '2040': 0.05, '2050': 0.10, '2065': 0.15},
                },
            },
        }
        result = compute_water_stress_derate('56005', 2040, ctx)
        expected = 1.0 - WATER_STRESS_DERATE['sensitivity_per_unit_wsi'] * 0.05
        assert abs(result['derate_factor'] - expected) < 1e-10

    def test_derate_capped(self):
        """Derate is capped at max_derate (15%)."""
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'water_stress_index': {
                    '56005': {'2030': 1.0, '2040': 2.0, '2050': 3.0, '2065': 4.0},
                },
            },
        }
        result = compute_water_stress_derate('56005', 2040, ctx)
        assert result['derate_factor'] == 1.0 - WATER_STRESS_DERATE['max_derate']

    def test_confidence_is_low(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {'water_stress_index': {'56005': {'2040': 0.05}}},
        }
        result = compute_water_stress_derate('56005', 2040, ctx)
        assert result['confidence'] == 'low'


# ── Heat derate tests ────────────────────────────────────────────────────────

class TestHeatDerate:
    def test_historical_returns_identity(self):
        ctx = {'lens': 'historical', 'tables': {}}
        result = compute_heat_derate('56005', 2040, ctx)
        assert result['derate_factor'] == 1.0
        assert result['gaps'] == []

    def test_positive_delta_derates(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'days_gt_95f': {
                    '56005': {'2030': 5.0, '2040': 10.0, '2050': 20.0, '2065': 30.0},
                },
            },
        }
        result = compute_heat_derate('56005', 2040, ctx)
        expected = 1.0 - HEAT_DERATE['sensitivity_per_day_gt_95f'] * 10.0
        assert abs(result['derate_factor'] - expected) < 1e-10

    def test_derate_capped(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {
                'days_gt_95f': {
                    '56005': {'2030': 200.0, '2040': 300.0, '2050': 400.0, '2065': 500.0},
                },
            },
        }
        result = compute_heat_derate('56005', 2040, ctx)
        assert result['derate_factor'] == 1.0 - HEAT_DERATE['max_derate']

    def test_gaps_logged_for_nonhistorical(self):
        ctx = {
            'lens': 'ssp370',
            'tables': {'days_gt_95f': {'56005': {'2040': 10.0}}},
        }
        result = compute_heat_derate('56005', 2040, ctx)
        assert len(result['gaps']) == 1
        assert 'transmission_thermal_limit' in result['gaps'][0]


# ── Delta table builder integration test ─────────────────────────────────────

class TestDeltaTableBuilder:
    def test_build_from_real_data(self):
        """build_delta_tables produces tables for all 157 counties."""
        with open(DATA_DIR / "county_climate_projections.json") as f:
            data = json.load(f)
        tables = build_delta_tables(data, 'ssp370')

        assert 'cdd' in tables
        assert 'hdd' in tables
        assert 'water_stress_index' in tables
        assert 'days_gt_95f' in tables
        assert len(tables['cdd']) == 157

    def test_deltas_are_positive_for_cdd(self):
        """CDD deltas should be positive (warming → more CDD)."""
        with open(DATA_DIR / "county_climate_projections.json") as f:
            data = json.load(f)
        tables = build_delta_tables(data, 'ssp370')

        # Most counties at 2065 should have positive CDD delta
        positive_count = sum(
            1 for geoid in tables['cdd']
            if tables['cdd'][geoid].get('2065', 0) > 0
        )
        assert positive_count > 150  # nearly all 157 counties

    def test_state_digest_historical_unchanged(self):
        """state_digest with climate_lens=None matches without climate_lens."""
        import terra_engine as te
        DATA = Path(__file__).parent.parent / "data" / "processed"
        if not (DATA / "synthetic_buses.geojson").exists():
            DATA = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                        "Research/Energy Modeling/energy-map/data/processed")
        state = te.initialize_state(data_dir=DATA)
        d1 = te.state_digest(state)
        d2 = te.state_digest(state, climate_lens=None)
        d3 = te.state_digest(state, climate_lens='historical')
        assert d1['md5'] == d2['md5'] == d3['md5']

    def test_state_digest_nonhistorical_differs(self):
        """state_digest with non-historical lens produces different digest."""
        import terra_engine as te
        DATA = Path(__file__).parent.parent / "data" / "processed"
        if not (DATA / "synthetic_buses.geojson").exists():
            DATA = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                        "Research/Energy Modeling/energy-map/data/processed")
        state = te.initialize_state(data_dir=DATA)
        d_hist = te.state_digest(state, climate_lens='historical')
        d_ssp = te.state_digest(state, climate_lens='ssp370')
        assert d_hist['md5'] != d_ssp['md5']
        assert 'climate_lens' not in d_hist
        assert d_ssp.get('climate_lens') == 'ssp370'
