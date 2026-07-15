"""
C2 Exposure Tag Tests — Python parity for TERRA engine v4.4.

Mirrors c2-exposure-tags.test.ts. Verifies:
  C2-a  Seeded registry has exposure_tags on all baseline generator assets
  C2-b  Tier 2 anchor coverage >= 95%
  C2-c  Class-default fallback: assets with no anchor_id get class tags
  C2-d  Tags carry correct schema fields
  C2-e  Digest identity: all four contracts unchanged with tags applied
  C2-f  Golden K frozen digests unchanged after C2 (regression gate)
  C2-g  Site spawn inherits origin asset's exposure_tags
  C2-h  Deterministic — two initializations produce identical tag values
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
# Worktree fallback
if not (DATA_DIR / "synthetic_buses.geojson").exists():
    _main = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                 "Research/Energy Modeling/energy-map/data/processed")
    if (_main / "synthetic_buses.geojson").exists():
        DATA_DIR = _main

TS_DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"
FIXTURE_DIR = Path(__file__).parent.parent / "terra-app" / "tests" / "parity" / "fixtures"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_retirements():
    with open(TS_DATA_DIR / "baseline_retirements.json") as f:
        raw = json.load(f)
    return {k: v for k, v in raw.items() if k != "_meta"}


def load_state_with_anchors_and_tags(retirements=True):
    """Initialize state with anchors and exposure tags (full C2 state)."""
    r = _load_retirements() if retirements else None
    return te.initialize_state(data_dir=DATA_DIR, baseline_retirements=r)


def load_state_without_tags():
    """Initialize state with anchors but WITHOUT exposure tags — control for inertness.

    We patch _apply_exposure_tags temporarily to skip tag assignment.
    """
    orig = te._apply_exposure_tags

    def _noop(registry, data_dir):
        pass  # skip tag assignment

    te._apply_exposure_tags = _noop
    try:
        state = te.initialize_state(data_dir=DATA_DIR, baseline_retirements=_load_retirements())
    finally:
        te._apply_exposure_tags = orig
    return state


def find_assets(registry, pred):
    return [a for a in registry if pred(a)]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestC2ExposureTags:

    def test_c2a_generator_assets_have_tags(self):
        """C2-a: Baseline generator assets carry exposure_tags."""
        state = load_state_with_anchors_and_tags()
        generators = find_assets(
            state['asset_registry'],
            lambda a: (a.get('origin') == 'baseline'
                       and a.get('asset_class') == 'generator'
                       and a.get('lifecycle') == 'operating'),
        )
        assert len(generators) > 0
        with_tags = [a for a in generators if a.get('exposure_tags') is not None]
        assert len(with_tags) == len(generators), (
            f"Expected all {len(generators)} generators to have tags, "
            f"got {len(with_tags)}"
        )

    def test_c2b_tier2_anchor_coverage(self):
        """C2-b: >= 95% of Tier 2 anchor assets have exposure tags."""
        state = load_state_with_anchors_and_tags()
        anchor_classes = {'mine', 'industrial_load', 'commercial_anchor_load'}
        tier2_anchors = find_assets(
            state['asset_registry'],
            lambda a: a.get('asset_class') in anchor_classes and a.get('origin') == 'baseline',
        )
        tier2_generators = find_assets(
            state['asset_registry'],
            lambda a: (a.get('asset_class') == 'generator'
                       and a.get('anchor_id') is not None
                       and a.get('origin') == 'baseline'),
        )
        all_tier2 = tier2_anchors + tier2_generators
        assert len(all_tier2) > 0

        with_tags = [a for a in all_tier2 if a.get('exposure_tags') is not None]
        coverage = len(with_tags) / len(all_tier2)
        assert coverage >= 0.95, (
            f"Tier 2 coverage {coverage:.1%} < 95% "
            f"({len(with_tags)}/{len(all_tier2)} tagged)"
        )

    def test_c2c_class_default_fallback(self):
        """C2-c: Assets without anchor_id get class-default tags."""
        state = load_state_with_anchors_and_tags()
        gen_no_anchor = find_assets(
            state['asset_registry'],
            lambda a: (a.get('asset_class') == 'generator'
                       and not a.get('anchor_id')
                       and a.get('origin') == 'baseline'),
        )
        if gen_no_anchor:
            sample = gen_no_anchor[0]
            assert sample.get('exposure_tags') is not None
            assert 'wildfire_exposure' in (sample.get('exposure_tags') or {})

    def test_c2d_tag_schema_fields(self):
        """C2-d: Exposure tags carry correct schema fields."""
        state = load_state_with_anchors_and_tags()
        with_tags = [a for a in state['asset_registry'] if a.get('exposure_tags') is not None]
        assert len(with_tags) > 0
        sample_tags = with_tags[0].get('exposure_tags')
        # At least one tag dimension should be present
        assert sample_tags is not None
        for dim in ['wildfire_exposure', 'water_dependency', 'flood_zone', 'heat_sensitivity']:
            tag = sample_tags.get(dim)
            if tag is not None:
                assert 'value' in tag
                assert 'source' in tag
                assert 'method' in tag
                assert 'confidence' in tag
                assert 'judgment_call' in tag
                assert isinstance(tag['judgment_call'], bool)
                break

    def test_c2e_digest_identity(self):
        """C2-e: All four digest contracts unchanged with vs without exposure tags."""
        state_with = load_state_with_anchors_and_tags()
        state_without = load_state_without_tags()

        # Advance 3 years to exercise history digest
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        for _ in range(3):
            state_with = te.advance_year(state_with, climate_context=ctx)
            state_without = te.advance_year(state_without, climate_context=ctx)

        assert te.state_digest(state_with)['md5'] == te.state_digest(state_without)['md5']
        assert te.fiscal_digest(state_with)['md5'] == te.fiscal_digest(state_without)['md5']
        assert te.existing_assets_digest(state_with)['md5'] == te.existing_assets_digest(state_without)['md5']
        assert te.history_digest(state_with)['md5'] == te.history_digest(state_without)['md5']

    def test_c2f_golden_k_regression_gate(self):
        """C2-f: Golden K frozen digests unchanged after C2 merge.

        Golden K was built WITHOUT baseline retirements. Full replay matches
        golden-k.test.ts replayGoldenK() step-for-step.
        """
        with open(FIXTURE_DIR / "golden_k.json") as f:
            fixture = json.load(f)
        digests = fixture['digests_yr2040']

        # No baseline retirements — matches the Golden K spec
        state = load_state_with_anchors_and_tags(retirements=False)

        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)

        # Full Golden K replay
        state = te.schedule_retirement(state, 'anchor_56037_we_soda_westvaco', 2030)
        state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
        while state['year'] < 2029:
            state = te.advance_year(state, climate_context=ctx)
        state = te.queue_action(state, 'solar_utility', '56005', 100, 2029)
        while state['year'] < 2031:
            state = te.advance_year(state, climate_context=ctx)
        while state['year'] < 2035:
            state = te.advance_year(state, climate_context=ctx)
        state = te.queue_action(state, 'smr_advanced', '56037', 345, 2035)
        while state['year'] < 2040:
            state = te.advance_year(state, climate_context=ctx)

        assert te.state_digest(state)['md5'] == digests['state_digest_md5']
        assert te.fiscal_digest(state)['md5'] == digests['fiscal_digest_md5']
        assert te.existing_assets_digest(state)['md5'] == digests['existing_assets_digest_md5']
        assert te.history_digest(state)['md5'] == digests['history_digest_md5']

    def test_c2g_site_spawn_inherits_tags(self):
        """C2-g: Spawned site inherits origin asset's exposure_tags."""
        state = load_state_with_anchors_and_tags()

        # Find Black Thunder anchor
        bt = next(
            (a for a in state['asset_registry']
             if a.get('asset_id') == 'anchor_56005_black_thunder'),
            None,
        )
        assert bt is not None
        bt_tags = bt.get('exposure_tags')
        assert bt_tags is not None

        # Retire Black Thunder → site spawns
        state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
        ctx = copy.deepcopy(te.EMPTY_CLIMATE_CONTEXT)
        while state['year'] < 2029:
            state = te.advance_year(state, climate_context=ctx)

        # Find spawned site
        site = next(
            (a for a in state['asset_registry']
             if (a.get('asset_class') == 'site'
                 and a.get('geoid') == '56005'
                 and a.get('site_origin_asset_id') == 'anchor_56005_black_thunder')),
            None,
        )
        assert site is not None
        assert site.get('exposure_tags') == bt_tags

    def test_c2h_deterministic(self):
        """C2-h: Two initializations produce identical exposure_tags."""
        s1 = load_state_with_anchors_and_tags()
        s2 = load_state_with_anchors_and_tags()

        # Compare a generator with anchor_id
        gen1 = next(
            (a for a in s1['asset_registry']
             if a.get('anchor_id') and a.get('asset_class') == 'generator'),
            None,
        )
        if gen1:
            gen2 = next(
                (a for a in s2['asset_registry']
                 if a.get('asset_id') == gen1['asset_id']),
                None,
            )
            assert gen1.get('exposure_tags') == gen2.get('exposure_tags')

        # Compare a mine anchor
        mine1 = next(
            (a for a in s1['asset_registry'] if a.get('asset_class') == 'mine'),
            None,
        )
        if mine1:
            mine2 = next(
                (a for a in s2['asset_registry']
                 if a.get('asset_id') == mine1['asset_id']),
                None,
            )
            assert mine1.get('exposure_tags') == mine2.get('exposure_tags')
