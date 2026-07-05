/**
 * Golden I parity tests — Engine v4.1 (Z4)
 * Site spawning + succession mechanics.
 *
 * Zero-player-action run 2025→2031: Jim Bridger (56037, 2120 MW coal)
 * retires on schedule → site spawns in Sweetwater County.
 *
 * Validates:
 *  i-a  Site spawns with correct fields after JB retirement
 *  i-b  On-site SMR receives succession discount triple (TTD-2yr, capex 15%, TX waiver)
 *  i-c  Greenfield SMR receives no succession discount
 *  i-d  TTD improvement: on-site 2yr faster than greenfield
 *  i-e  TX waiver caps at inherited interconnection_mw (2120 MW) for oversize builds
 *  i-f  coal_to_smr convert path: TX waiver only (no TTD/capex discount)
 *  i-g  Workforce pool decays to 148.4 FTE at 2041 (t=10yr, t½=5yr)
 *  i-h  state/fiscal/ea digests at 2031 identical to Golden G′ (site assets excluded)
 *  i-i  state/fiscal/ea digests at 2041 match frozen fixture values
 *  i-j  Pure function — original state unmodified after all operations
 */
import { describe, it, expect } from 'vitest';
import {
  loadFixture,
  loadInitialStateWithRetirements,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
} from './helpers.js';
import { advanceYear, queueAction } from '../../src/engine/engine.js';
import type { AssetInstance, EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_i') as {
  assertions: {
    jb_site_asset_id: string;
    jb_site_geoid: string;
    jb_site_interconnection_mw: number;
    jb_site_site_class: string;
    jb_site_origin_asset_id: string;
    jb_site_spawn_year: number;
    jb_site_workforce_pool_initial: number;
    jb_site_workforce_pool_at_spawn: number;
    onsite_smr_operational_year: number;
    greenfield_smr_operational_year: number;
    onsite_ttd_reduction_applied: number;
    onsite_capex_discount_fraction: number;
    onsite_tx_waiver_mw: number;
    onsite_succession_site_id: string;
    greenfield_ttd_reduction_applied: null;
    greenfield_capex_discount_fraction: null;
    greenfield_tx_waiver_mw: null;
    ttd_improvement_years: number;
    coal_to_smr_operational_year: number;
    coal_to_smr_ttd_reduction_applied: null;
    coal_to_smr_capex_discount_fraction: null;
    coal_to_smr_tx_waiver_mw: number;
    coal_to_smr_succession_site_id: string;
    coal_to_smr_convert_source_asset_id: string;
    tx_waiver_cap_at_max_magnitude: number;
    workforce_pool_at_2041: number;
    workforce_pool_half_life_years: number;
  };
  digests_yr2031: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2041: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
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

describe('Golden I — site spawning (i-a: JB site fields after 2031 retirement)', () => {
  it('i-a1: Jim Bridger site spawns with correct asset_id and geoid', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.geoid).toBe(a.jb_site_geoid);
  });

  it('i-a2: site has correct interconnection_mw and site_class', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.interconnection_mw).toBe(a.jb_site_interconnection_mw);
    expect(site.site_class).toBe(a.jb_site_site_class);
  });

  it('i-a3: site records origin and spawn year', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.site_origin_asset_id).toBe(a.jb_site_origin_asset_id);
    expect(site.site_spawn_year).toBe(a.jb_site_spawn_year);
  });

  it('i-a4: workforce pool initialised from JB ops jobs at spawn', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.workforce_pool_initial).toBe(a.jb_site_workforce_pool_initial);
    expect(site.workforce_pool_current).toBe(a.jb_site_workforce_pool_at_spawn);
  });

  it('i-a5: site asset_class is "site" and lifecycle is "operating"', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.asset_class).toBe('site');
    expect(site.lifecycle).toBe('operating');
  });
});

describe('Golden I — succession discounts (i-b/c/d: on-site vs greenfield SMR)', () => {
  it('i-b1: on-site SMR receives TTD reduction', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'smr_advanced', '56037', 345, 2031);
    const smr = findAsset(next.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56037');
    expect(smr.ttd_reduction_applied).toBe(a.onsite_ttd_reduction_applied);
    expect(smr.operational_year).toBe(a.onsite_smr_operational_year);
  });

  it('i-b2: on-site SMR receives capex discount', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'smr_advanced', '56037', 345, 2031);
    const smr = findAsset(next.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56037');
    expect(smr.capex_discount_fraction).toBe(a.onsite_capex_discount_fraction);
  });

  it('i-b3: on-site SMR receives TX waiver and correct succession_site_id', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'smr_advanced', '56037', 345, 2031);
    const smr = findAsset(next.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56037');
    expect(smr.tx_waiver_mw).toBe(a.onsite_tx_waiver_mw);
    expect(smr.succession_site_id).toBe(a.onsite_succession_site_id);
  });

  it('i-c: greenfield SMR (Albany, 56001) receives no succession discounts', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'smr_advanced', '56001', 345, 2031);
    const smr = findAsset(next.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56001');
    expect(smr.ttd_reduction_applied).toBeNull();
    expect(smr.capex_discount_fraction).toBeNull();
    expect(smr.tx_waiver_mw).toBeNull();
    expect(smr.operational_year).toBe(a.greenfield_smr_operational_year);
  });

  it('i-d: on-site SMR is 2 years faster than greenfield', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const s1 = queueAction(state, 'smr_advanced', '56037', 345, 2031);
    const s2 = queueAction(state, 'smr_advanced', '56001', 345, 2031);
    const onsite = findAsset(s1.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56037');
    const gf = findAsset(s2.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56001');
    expect(gf.operational_year! - onsite.operational_year!).toBe(a.ttd_improvement_years);
  });
});

describe('Golden I — TX waiver cap (i-e)', () => {
  it('i-e: TX waiver caps at inherited interconnection_mw for oversize builds', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'smr_advanced', '56037', 3000, 2031);
    const smr = findAsset(next.asset_registry, x => x.action_id === 'smr_advanced' && x.geoid === '56037');
    expect(smr.tx_waiver_mw).toBe(a.tx_waiver_cap_at_max_magnitude);
  });
});

describe('Golden I — coal_to_smr convert path (i-f)', () => {
  it('i-f1: coal_to_smr gets TX waiver only (no TTD/capex discount)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'coal_to_smr', '56037', 345, 2031);
    const asset = findAsset(next.asset_registry, x => x.action_id === 'coal_to_smr' && x.geoid === '56037');
    expect(asset.ttd_reduction_applied).toBeNull();
    expect(asset.capex_discount_fraction).toBeNull();
    expect(asset.tx_waiver_mw).toBe(a.coal_to_smr_tx_waiver_mw);
  });

  it('i-f2: coal_to_smr records convert_source_asset_id and succession_site_id', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'coal_to_smr', '56037', 345, 2031);
    const asset = findAsset(next.asset_registry, x => x.action_id === 'coal_to_smr' && x.geoid === '56037');
    expect(asset.convert_source_asset_id).toBe(a.coal_to_smr_convert_source_asset_id);
    expect(asset.succession_site_id).toBe(a.coal_to_smr_succession_site_id);
  });

  it('i-f3: coal_to_smr operational_year uses base TTD (no TTD reduction)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const next = queueAction(state, 'coal_to_smr', '56037', 345, 2031);
    const asset = findAsset(next.asset_registry, x => x.action_id === 'coal_to_smr' && x.geoid === '56037');
    expect(asset.operational_year).toBe(a.coal_to_smr_operational_year);
  });
});

describe('Golden I — workforce pool decay (i-g)', () => {
  it('i-g: workforce pool decays to 148.4 FTE at 2041 (t=10yr, t½=5yr)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2041);
    const site = findAsset(state.asset_registry, x => x.asset_id === a.jb_site_asset_id);
    expect(site.workforce_pool_current).toBe(a.workforce_pool_at_2041);
  });
});

describe('Golden I — digest parity (i-h/i: TS ↔ Python)', () => {
  it('i-h: all three digests at 2031 identical to Golden G′ (site assets excluded)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2031.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2031.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2031.existing_assets_digest_md5);
  });

  it('i-i: all three digests at 2041 match frozen fixture values', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2041);
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2041.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2041.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2041.existing_assets_digest_md5);
  });

  it('i-j: pure function — original state unmodified after all operations', () => {
    const state = loadInitialStateWithRetirements();
    const digestBefore = computeDigestMd5(state).md5;
    const state31 = advanceToYear(state, 2031);
    queueAction(state31, 'smr_advanced', '56037', 345, 2031);
    queueAction(state31, 'coal_to_smr', '56037', 345, 2031);
    advanceToYear(state31, 2041);
    expect(computeDigestMd5(state).md5).toBe(digestBefore);
  });
});
