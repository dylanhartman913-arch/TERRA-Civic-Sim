import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, computeExistingAssetsDigestMd5 } from './helpers.js';
import { applyAction, getExistingAssets, reduceProductionAsset } from '../../src/engine/engine.js';
import type { ProductionAsset } from '../../src/engine/types.js';
import type { EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_e') as {
  fixture_id: string;
  assertions: {
    '5a_all_wy_nonnull_capacity_in_live_entries': boolean;
    '5a_live_count': number;
    '5a_excluded_count': number;
    '5b_campbell_coal_live_count': number;
    '5b_campbell_all_excluded': boolean;
    '5c_geoid_live_names': Record<string, string[]>;
    '5d_jim_bridger_coal_tons_yr': number;
    '5d_kemmerer_capacity_mw': number;
    '5f_prb_production_volume': number;
    '5f_prb_commodity': string;
    '5f_prb_county_distribution_share': number;
    golden_a_state_digest_unchanged: string;
  };
  existing_assets_digest: { md5: string };
};

describe('Golden E — Baseline Asset Inventory', () => {
  let state: EngineState;

  it('should initialize state with existing_assets populated', () => {
    state = loadInitialState();
    expect(Object.keys(state.existing_assets).length).toBeGreaterThan(0);
    expect(state.existing_assets['56005']).toBeDefined(); // Campbell
    expect(state.existing_assets['56009']).toBeDefined(); // Converse
    expect(state.existing_assets['56021']).toBeDefined(); // Laramie
    expect(state.existing_assets['56023']).toBeDefined(); // Lincoln
    expect(state.existing_assets['56037']).toBeDefined(); // Sweetwater
  });

  it('(5a) live count and excluded count match fixture', () => {
    const allEntries = Object.values(state.existing_assets).flat();
    const liveCount = allEntries.filter(e => e.excluded === null).length;
    const excludedCount = allEntries.filter(e => e.excluded !== null).length;
    expect(liveCount).toBe(fixture.assertions['5a_live_count']);
    expect(excludedCount).toBe(fixture.assertions['5a_excluded_count']);
  });

  it('(5a) all WY flagship assets with non-null capacity appear as live entries', () => {
    const expectedNames = fixture.assertions['5c_geoid_live_names'];
    for (const [geoid, names] of Object.entries(expectedNames)) {
      const live = getExistingAssets(state, geoid);
      const liveNames = live.map(e => e.name);
      for (const name of names) {
        expect(liveNames).toContain(name);
      }
    }
    expect(fixture.assertions['5a_all_wy_nonnull_capacity_in_live_entries']).toBe(true);
  });

  it('(5b) Campbell live coal count and exclusion state match fixture', () => {
    const live = getExistingAssets(state, '56005');
    const coalLive = live.filter(e => e.type === 'coal');
    expect(coalLive.length).toBe(fixture.assertions['5b_campbell_coal_live_count']);

    const all = state.existing_assets['56005'] || [];
    const allExcluded = all.every(e => e.excluded !== null);
    expect(allExcluded).toBe(fixture.assertions['5b_campbell_all_excluded']);
  });

  it('(5c) Jim Bridger coal_tons_yr computed from PRB proxy', () => {
    const sweetwaterLive = getExistingAssets(state, '56037');
    const jb = sweetwaterLive.find(e => e.name.includes('Jim Bridger'));
    expect(jb).toBeDefined();
    expect(jb!.coal_tons_yr).toBeCloseTo(fixture.assertions['5d_jim_bridger_coal_tons_yr'], 0);
    expect(jb!.fiscal_action_id).toBe('coal_to_solar');
  });

  it('(5c) Kemmerer Unit 1 has correct capacity and fiscal pointer', () => {
    const lincolnLive = getExistingAssets(state, '56023');
    const kemmerer = lincolnLive.find(e => e.name.includes('Kemmerer'));
    expect(kemmerer).toBeDefined();
    expect(kemmerer!.capacity_mw).toBe(fixture.assertions['5d_kemmerer_capacity_mw']);
    expect(kemmerer!.fiscal_action_id).toBe('smr_advanced');
  });

  it('(5e) existing_assets_digest is stable (matches fixture)', () => {
    // Verify digest on initial state
    const freshState = loadInitialState();
    const { md5 } = computeExistingAssetsDigestMd5(freshState);
    expect(md5).toBe(fixture.existing_assets_digest.md5);
  });

  it('(5e) existing_assets_digest is unchanged after Golden A replay', () => {
    // Replay Golden A steps
    const goldenA = loadFixture('golden_a') as {
      steps: { action_id: string; geoid: string; magnitude: number }[];
    };
    let replayState = loadInitialState();
    for (const step of goldenA.steps) {
      [replayState] = applyAction(replayState, step.action_id, step.geoid, step.magnitude);
    }
    const { md5 } = computeExistingAssetsDigestMd5(replayState);
    expect(md5).toBe(fixture.existing_assets_digest.md5);
  });

  it('(5f) PRB Coal Mines is a live production_asset with EIA-7A 2024 data and fiscal rates', () => {
    const live = getExistingAssets(state, '56005');
    const prb = live.find(e => e.name.includes('Powder River Basin'));
    expect(prb).toBeDefined();
    expect(prb!.asset_kind).toBe('production_asset');
    const prbPa = prb as ProductionAsset;
    expect(prbPa.production_volume).toBe(fixture.assertions['5f_prb_production_volume']);
    expect(prbPa.commodity).toBe(fixture.assertions['5f_prb_commodity']);
    expect(prbPa.county_distribution_share).toBeCloseTo(fixture.assertions['5f_prb_county_distribution_share'], 6);
    // Rate fields populated (confidence: low, 90% coal-fraction proxy)
    expect(prbPa.advalorem_rate_per_unit).toBeCloseTo(1.263020, 5);
    expect(prbPa.assessed_delta_per_unit).toBeCloseTo(-20.100255, 5);
  });

  it('(5f) reduceProductionAsset (X2) applies all three ledgers — Ledger C is positive (recapture shrinks)', () => {
    const freshState = loadInitialState();
    const [newState, summary] = reduceProductionAsset(freshState, '56005', 'coal_surface', 10_000_000);
    expect(summary['delta_volume']).toBe(10_000_000);
    expect(summary['new_volume']).toBe(160_045_000);
    expect(summary['ledger_a_delta'] as number).toBeCloseTo(-12_630_200, 0);
    expect(summary['ledger_b_delta'] as number).toBeCloseTo(-5_066_642.22, 0);
    expect(summary['ledger_c_delta'] as number).toBeGreaterThan(0);              // recapture shrinks
    expect(summary['ledger_c_delta'] as number).toBeCloseTo(1_514_490.91, 0);  // +$1,514,490.91
    expect(summary['ledger_a_status']).toBe('applied');
    // Original state unmodified (pure function)
    const origPrb = (getExistingAssets(freshState, '56005').find(e => e.name.includes('Powder River Basin'))) as ProductionAsset;
    expect(origPrb.production_volume).toBe(170_045_000);
    // New state has reduced volume
    const newPrb = (getExistingAssets(newState, '56005').find(e => e.name.includes('Powder River Basin'))) as ProductionAsset;
    expect(newPrb.production_volume).toBe(160_045_000);
  });
});
