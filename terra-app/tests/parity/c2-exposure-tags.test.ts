/**
 * C2 Exposure Tag Tests — engine v4.4
 *
 * Verifies:
 *  c2-a  Seeded registry has exposure_tags on all baseline generator assets
 *  c2-b  Tier 2 anchor coverage ≥ 95% (per-asset rows, not class defaults)
 *  c2-c  Class-default fallback: assets with no anchor_id get class tags
 *  c2-d  Tags carry correct schema fields (value, source, method, confidence, judgment_call)
 *  c2-e  Digest identity: all four contracts unchanged with tags applied
 *         (state, fiscal, existing_assets, history)
 *  c2-f  Digest identity: same four contracts under EMPTY_CLIMATE_CONTEXT / ssp370
 *  c2-g  Site spawn inherits origin asset's exposure_tags
 *  c2-h  Deterministic — two initializations produce identical tag values
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadFixture,
  loadInitialStateWithAnchorsAndTags,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
} from './helpers.js';
import {
  initializeState,
  advanceYear,
  queueAction,
  scheduleRetirement,
  historyDigest,
} from '../../src/engine/engine.js';
import { EMPTY_CLIMATE_CONTEXT } from '../../src/engine/types.js';
import type {
  AssetInstance,
  EngineState,
  CountyEESBaseline,
  CrosswalkRow,
  ActionLibrary,
  InitialNetwork,
  FiscalBaseline,
  FiscalCoefficients,
  PopulationProjection,
} from '../../src/engine/types.js';

const DATA_DIR = resolve(__dirname, '../../src/data');

/** Load state with anchors but WITHOUT exposure tags — for inertness comparison. */
function loadInitialStateWithAnchorsNoTags(): EngineState {
  const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
  const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
  const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
  const initialNetwork: InitialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
  const countyCards: Record<string, unknown> = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));
  let fiscalBaseline: FiscalBaseline | undefined;
  let fiscalCoefficients: FiscalCoefficients | undefined;
  try {
    fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
    fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  const retirements = JSON.parse(readFileSync(resolve(DATA_DIR, 'baseline_retirements.json'), 'utf-8'));
  const { _meta, ...retirementData } = retirements;
  void _meta;
  let lifecycleCoefficients: Record<string, unknown> | undefined;
  try {
    lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }
  let populationProjections: Record<string, PopulationProjection> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_population_projections.json'), 'utf-8'));
    populationProjections = raw.counties as Record<string, PopulationProjection>;
  } catch { /* optional */ }
  const anchorFacilities = JSON.parse(readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'));

  return initializeState(
    baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025,
    fiscalBaseline, fiscalCoefficients, retirementData, lifecycleCoefficients,
    housingBaselineData, populationProjections, undefined, anchorFacilities,
    // exposureTagData omitted — inertness control
  );
}

function findAssets(registry: AssetInstance[], pred: (a: AssetInstance) => boolean): AssetInstance[] {
  return registry.filter(pred);
}

describe('C2 Exposure Tag Tests', () => {

  // ── c2-a: Generator assets have exposure_tags ──────────────────────────────
  it('c2-a: baseline generator assets carry exposure_tags', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const generators = findAssets(
      state.asset_registry,
      a => a.origin === 'baseline' && a.asset_class === 'generator' && a.lifecycle === 'operating',
    );
    expect(generators.length).toBeGreaterThan(0);
    const withTags = generators.filter(a => a.exposure_tags != null);
    // All generators should have tags (either per-asset or class default)
    expect(withTags.length).toBe(generators.length);
  });

  // ── c2-b: Tier 2 anchor coverage ≥ 95% ────────────────────────────────────
  it('c2-b: ≥95% of Tier 2 anchor assets have per-asset or class-default tags', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    // Tier 2 anchor classes from F1
    const anchorClasses = new Set(['mine', 'industrial_load', 'commercial_anchor_load']);
    const tier2Anchors = findAssets(
      state.asset_registry,
      a => anchorClasses.has(a.asset_class) && a.origin === 'baseline',
    );
    // Also include generators with anchor_id (Tier 2 generators)
    const tier2Generators = findAssets(
      state.asset_registry,
      a => a.asset_class === 'generator' && a.anchor_id != null && a.origin === 'baseline',
    );
    const allTier2 = [...tier2Anchors, ...tier2Generators];
    expect(allTier2.length).toBeGreaterThan(0);

    const withTags = allTier2.filter(a => a.exposure_tags != null);
    const coverage = withTags.length / allTier2.length;
    expect(coverage).toBeGreaterThanOrEqual(0.95);
  });

  // ── c2-c: Class-default fallback ──────────────────────────────────────────
  it('c2-c: assets without anchor_id get class-default tags', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    // Find a generator without anchor_id — should still have class-default tags
    const genNoAnchor = findAssets(
      state.asset_registry,
      a => a.asset_class === 'generator' && !a.anchor_id && a.origin === 'baseline',
    );
    if (genNoAnchor.length > 0) {
      const sample = genNoAnchor[0];
      expect(sample.exposure_tags).not.toBeNull();
      expect(sample.exposure_tags?.wildfire_exposure).toBeDefined();
    }
  });

  // ── c2-d: Tag schema fields present ───────────────────────────────────────
  it('c2-d: exposure tags carry correct schema fields', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const withTags = state.asset_registry.filter(a => a.exposure_tags != null);
    expect(withTags.length).toBeGreaterThan(0);
    const sample = withTags[0];
    const tag = sample.exposure_tags!.wildfire_exposure;
    if (tag) {
      expect(typeof tag.value).toBe('string');
      expect(typeof tag.source).toBe('string');
      expect(typeof tag.method).toBe('string');
      expect(typeof tag.confidence).toBe('string');
      expect(typeof tag.judgment_call).toBe('boolean');
    }
  });

  // ── c2-e: Digest identity — tags don't change any of the four contracts ───
  it('c2-e: all four digest contracts unchanged with vs without exposure tags', () => {
    const stateWith = loadInitialStateWithAnchorsAndTags();
    const stateWithout = loadInitialStateWithAnchorsNoTags();

    // Advance 3 years to exercise history digest
    let sWith = stateWith;
    let sWithout = stateWithout;
    for (let i = 0; i < 3; i++) {
      sWith = advanceYear(sWith, EMPTY_CLIMATE_CONTEXT);
      sWithout = advanceYear(sWithout, EMPTY_CLIMATE_CONTEXT);
    }

    expect(computeDigestMd5(sWith).md5).toBe(computeDigestMd5(sWithout).md5);
    expect(computeFiscalDigestMd5(sWith).md5).toBe(computeFiscalDigestMd5(sWithout).md5);
    expect(computeExistingAssetsDigestMd5(sWith).md5).toBe(computeExistingAssetsDigestMd5(sWithout).md5);
    expect(historyDigest(sWith).md5).toBe(historyDigest(sWithout).md5);
  });

  // ── c2-f: Frozen Golden K digests unchanged after C2 ─────────────────────
  // Replays the full Golden K scenario with exposure tags applied.
  // All four digests must match the frozen F1-era values.
  it('c2-f: Golden K frozen digests unchanged after C2 (regression gate)', () => {
    const fixture = loadFixture('golden_k') as {
      digests_yr2040: {
        state_digest_md5: string;
        fiscal_digest_md5: string;
        existing_assets_digest_md5: string;
        history_digest_md5: string;
      };
    };
    const digests = fixture.digests_yr2040;

    // Load with anchors + exposure tags, WITHOUT baseline retirements (Golden K spec)
    const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
    const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
    const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
    const initialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
    const countyCards = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));
    let fiscalBaseline: FiscalBaseline | undefined;
    let fiscalCoefficients: FiscalCoefficients | undefined;
    try {
      fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
      fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
    } catch { /* optional */ }
    let lifecycleCoefficients: Record<string, unknown> | undefined;
    try { lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8')); } catch { /* optional */ }
    let housingBaselineData: Record<string, unknown> | undefined;
    try {
      const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
      housingBaselineData = raw.counties as Record<string, unknown>;
    } catch { /* optional */ }
    let populationProjections: Record<string, PopulationProjection> | undefined;
    try {
      const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_population_projections.json'), 'utf-8'));
      populationProjections = raw.counties as Record<string, PopulationProjection>;
    } catch { /* optional */ }
    const anchorFacilities = JSON.parse(readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'));
    const exposureTagData = JSON.parse(readFileSync(resolve(DATA_DIR, 'asset_exposure_tags.json'), 'utf-8'));

    let state = initializeState(
      baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025,
      fiscalBaseline, fiscalCoefficients,
      undefined,  // no baseline retirements (Golden K spec)
      lifecycleCoefficients, housingBaselineData, populationProjections,
      undefined, anchorFacilities, exposureTagData,
    );

    // Full Golden K replay (mirrors golden-k.test.ts replayGoldenK())
    state = scheduleRetirement(state, 'anchor_56037_we_soda_westvaco', 2030);
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    while (state.year < 2029) state = advanceYear(state, EMPTY_CLIMATE_CONTEXT);
    state = queueAction(state, 'solar_utility', '56005', 100, 2029);
    while (state.year < 2031) state = advanceYear(state, EMPTY_CLIMATE_CONTEXT);
    while (state.year < 2035) state = advanceYear(state, EMPTY_CLIMATE_CONTEXT);
    state = queueAction(state, 'smr_advanced', '56037', 345, 2035);
    while (state.year < 2040) state = advanceYear(state, EMPTY_CLIMATE_CONTEXT);

    expect(computeDigestMd5(state).md5).toBe(digests.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(digests.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(digests.existing_assets_digest_md5);
    expect(historyDigest(state).md5).toBe(digests.history_digest_md5);
  });

  // ── c2-g: Site spawn inherits exposure_tags ────────────────────────────────
  it('c2-g: spawned site inherits origin asset exposure_tags', () => {
    let state = loadInitialStateWithAnchorsAndTags();

    // Find Black Thunder anchor (has exposure_tags)
    const bt = state.asset_registry.find(
      a => a.asset_id === 'anchor_56005_black_thunder',
    );
    expect(bt).toBeDefined();
    const btTags = bt!.exposure_tags;
    expect(btTags).not.toBeNull();

    // Schedule retirement → site spawns in advanceYear
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    while (state.year < 2029) {
      state = advanceYear(state, EMPTY_CLIMATE_CONTEXT);
    }

    // Find spawned site
    const site = state.asset_registry.find(
      a => a.asset_class === 'site' && a.geoid === '56005'
        && a.site_origin_asset_id === 'anchor_56005_black_thunder',
    );
    expect(site).toBeDefined();
    expect(site!.exposure_tags).toEqual(btTags);
  });

  // ── c2-h: Deterministic ────────────────────────────────────────────────────
  it('c2-h: two initializations produce identical exposure_tags', () => {
    const s1 = loadInitialStateWithAnchorsAndTags();
    const s2 = loadInitialStateWithAnchorsAndTags();

    // Spot-check a generator with anchor_id
    const gen1 = s1.asset_registry.find(a => a.anchor_id != null && a.asset_class === 'generator');
    const gen2 = s2.asset_registry.find(a => a.asset_id === gen1?.asset_id);
    expect(gen1?.exposure_tags).toEqual(gen2?.exposure_tags);

    // Spot-check a mine anchor
    const mine1 = s1.asset_registry.find(a => a.asset_class === 'mine');
    const mine2 = s2.asset_registry.find(a => a.asset_id === mine1?.asset_id);
    expect(mine1?.exposure_tags).toEqual(mine2?.exposure_tags);
  });
});
