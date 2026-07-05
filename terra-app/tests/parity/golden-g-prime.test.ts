/**
 * Golden G′ parity tests — Engine v3.1
 * Zero-player-action run 2025→2045 with EIA-860 baseline retirements
 * AND autonomous PRB coal surface decline (-2.0%/yr compound, geoid 56005).
 * Amends Golden G (v3.0). Second permitted fixture amendment.
 */
import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialStateWithRetirements, computeDigestMd5, computeFiscalDigestMd5, computeExistingAssetsDigestMd5 } from './helpers.js';
import { advanceYear } from '../../src/engine/engine.js';
import type { AssetInstance, EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_g_prime') as {
  fixture_id: string;
  assertions: {
    bus_56009_id: string;
    bus_56037_id: string;
    bus_56009_init_capacity_mw: number;
    bus_56037_init_capacity_mw: number;
    yr2027_dj_lifecycle: string;
    yr2027_jb_lifecycle: string;
    yr2027_bus_56009_capacity_mw: number;
    yr2027_bus_56037_capacity_mw: number;
    yr2031_dj_lifecycle: string;
    yr2031_jb_lifecycle: string;
    yr2031_bus_56009_capacity_mw: number;
    yr2031_bus_56037_capacity_mw: number;
    yr2045_bus_56009_capacity_mw: number;
    yr2045_bus_56037_capacity_mw: number;
    dj_capacity_drop_mw: number;
    jb_capacity_drop_mw: number;
    prb_geoid: string;
    prb_init_production_volume: number;
    yr2027_prb_production_volume: number;
    yr2027_prb_active_reclamation_acres: number;
    yr2027_prb_reclamation_jobs_direct: number;
    yr2031_prb_production_volume: number;
    yr2031_prb_active_reclamation_acres: number;
    yr2031_prb_reclamation_jobs_direct: number;
    yr2045_prb_production_volume: number;
    yr2045_prb_active_reclamation_acres: number;
    yr2045_prb_reclamation_jobs_direct: number;
  };
  digests_yr2027: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2031: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2045: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
};

const goldenGFixture = loadFixture('golden_g') as {
  digests_yr2027: { fiscal_digest_md5: string };
  digests_yr2031: { fiscal_digest_md5: string };
  digests_yr2045: { fiscal_digest_md5: string };
};

function findAsset(registry: AssetInstance[], pred: (a: AssetInstance) => boolean): AssetInstance {
  const found = registry.find(pred);
  if (!found) throw new Error('Asset not found in registry');
  return found;
}

function advanceToYear(state: EngineState, targetYear: number): EngineState {
  while (state.year < targetYear) {
    state = advanceYear(state);
  }
  return state;
}

const a = fixture.assertions;

describe('Golden G′ — scheduled retirements (unchanged from Golden G)', () => {
  it('7a: scheduled retirements at init', () => {
    const state = loadInitialStateWithRetirements();
    const dj = findAsset(state.asset_registry, x => x.name.includes('Dave Johnston'));
    const jb = findAsset(state.asset_registry, x => x.name.includes('Jim Bridger'));
    expect(dj.scheduled_retirement_year).toBe(2027);
    expect(jb.scheduled_retirement_year).toBe(2031);
  });

  it('7b: initial bus capacities', () => {
    const state = loadInitialStateWithRetirements();
    expect(state.bus_state[a.bus_56009_id].capacity_mw).toBe(a.bus_56009_init_capacity_mw);
    expect(state.bus_state[a.bus_56037_id].capacity_mw).toBe(a.bus_56037_init_capacity_mw);
  });

  it('7c: Dave Johnston retires 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const dj = findAsset(state.asset_registry, x => x.name.includes('Dave Johnston'));
    expect(dj.lifecycle).toBe(a.yr2027_dj_lifecycle);
    expect(state.bus_state[a.bus_56009_id].capacity_mw).toBe(a.yr2027_bus_56009_capacity_mw);
  });

  it('7d: Jim Bridger still operating 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const jb = findAsset(state.asset_registry, x => x.name.includes('Jim Bridger'));
    expect(jb.lifecycle).toBe(a.yr2027_jb_lifecycle);
    expect(state.bus_state[a.bus_56037_id].capacity_mw).toBe(a.yr2027_bus_56037_capacity_mw);
  });

  it('7e: Jim Bridger retires 2031', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const jb = findAsset(state.asset_registry, x => x.name.includes('Jim Bridger'));
    expect(jb.lifecycle).toBe(a.yr2031_jb_lifecycle);
    expect(state.bus_state[a.bus_56037_id].capacity_mw).toBe(a.yr2031_bus_56037_capacity_mw);
  });

  it('7f: capacity reduced through 2045', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    expect(state.bus_state[a.bus_56009_id].capacity_mw).toBe(a.yr2045_bus_56009_capacity_mw);
    expect(state.bus_state[a.bus_56037_id].capacity_mw).toBe(a.yr2045_bus_56037_capacity_mw);
  });
});

describe("Golden G′ — autonomous PRB coal decline + reclamation arc", () => {
  it('gp-a: PRB production declines by 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(prb.production_volume).toBe(a.yr2027_prb_production_volume);
  });

  it('gp-b: reclamation acres accumulate by 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(prb.active_reclamation_acres).toBe(a.yr2027_prb_active_reclamation_acres);
  });

  it('gp-c: reclamation jobs appear by 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(prb.reclamation_jobs_direct).toBe(a.yr2027_prb_reclamation_jobs_direct);
  });

  it('gp-d: PRB production declines further by 2031', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(Math.abs(prb.production_volume! - a.yr2031_prb_production_volume)).toBeLessThan(1.0);
  });

  it('gp-e: reclamation grows through 2031', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(prb.active_reclamation_acres).toBe(a.yr2031_prb_active_reclamation_acres);
    expect(prb.reclamation_jobs_direct).toBe(a.yr2031_prb_reclamation_jobs_direct);
  });

  it('gp-f: PRB production eroded by 2045', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(Math.abs(prb.production_volume! - a.yr2045_prb_production_volume)).toBeLessThan(1.0);
  });

  it('gp-g: reclamation steady-state by 2045 (10-yr bond cohorts expiring)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    const prb = findAsset(state.asset_registry, x => x.asset_class === 'production');
    expect(prb.active_reclamation_acres).toBe(a.yr2045_prb_active_reclamation_acres);
    expect(prb.reclamation_jobs_direct).toBe(a.yr2045_prb_reclamation_jobs_direct);
  });
});

describe("Golden G′ — digest parity (TS ↔ Python)", () => {
  it('gp-h: state_digest matches Golden G′ at 2027 (identical to Golden G)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2027.state_digest_md5);
  });

  it('gp-i: fiscal_digest matches Golden G′ at 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2027.fiscal_digest_md5);
  });

  it('gp-j: existing_assets_digest matches Golden G′ at 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2027.existing_assets_digest_md5);
  });

  it('gp-k: all three digests match at 2031', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2031.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2031.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2031.existing_assets_digest_md5);
  });

  it('gp-l: all three digests match at 2045', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2045.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2045.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2045.existing_assets_digest_md5);
  });

  it('gp-m: fiscal_digest differs from Golden G (confirms decline is modifying county_fiscal)', () => {
    expect(goldenGFixture.digests_yr2027.fiscal_digest_md5).not.toBe(fixture.digests_yr2027.fiscal_digest_md5);
    expect(goldenGFixture.digests_yr2031.fiscal_digest_md5).not.toBe(fixture.digests_yr2031.fiscal_digest_md5);
    expect(goldenGFixture.digests_yr2045.fiscal_digest_md5).not.toBe(fixture.digests_yr2045.fiscal_digest_md5);
  });

  it('gp-n: pure function — original state unmodified after advance to 2045', () => {
    const state = loadInitialStateWithRetirements();
    const digestBefore = computeDigestMd5(state).md5;
    advanceToYear(state, 2045);
    expect(computeDigestMd5(state).md5).toBe(digestBefore);
  });
});
