import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialStateWithRetirements, computeDigestMd5, computeFiscalDigestMd5, computeExistingAssetsDigestMd5 } from './helpers.js';
import { advanceYear } from '../../src/engine/engine.js';
import type { AssetInstance } from '../../src/engine/types.js';

// Assertion fixture (structural assertions — same in Golden G and G′)
const fixture = loadFixture('golden_g') as {
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
  };
  digests_yr2027: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2031: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2045: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
};

// Digest fixture — engine v3.1 (autonomous decline active); use Golden G′ for digest checks
const primeFixture = loadFixture('golden_g_prime') as {
  digests_yr2027: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2031: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
  digests_yr2045: { state_digest_md5: string; fiscal_digest_md5: string; existing_assets_digest_md5: string };
};

function findAsset(registry: AssetInstance[], predicate: (a: AssetInstance) => boolean): AssetInstance {
  const found = registry.find(predicate);
  if (!found) throw new Error('Asset not found in registry');
  return found;
}

function advanceToYear(startState: ReturnType<typeof loadInitialStateWithRetirements>, targetYear: number) {
  let state = startState;
  while (state.year < targetYear) {
    state = advanceYear(state);
  }
  return state;
}

describe('Golden G — Scheduled Baseline Retirements 2025→2045', () => {
  it('(7a) Dave Johnston and Jim Bridger have scheduled retirements at init', () => {
    const state = loadInitialStateWithRetirements();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const jb = findAsset(state.asset_registry, a => a.name.includes('Jim Bridger'));
    expect(dj.scheduled_retirement_year).toBe(2027);
    expect(jb.scheduled_retirement_year).toBe(2031);
    expect(dj.capacity_mw).toBe(fixture.assertions.dj_capacity_drop_mw);
    expect(jb.capacity_mw).toBe(fixture.assertions.jb_capacity_drop_mw);
  });

  it('(7b) Initial bus capacities match fixture', () => {
    const state = loadInitialStateWithRetirements();
    const bus56009 = fixture.assertions.bus_56009_id;
    const bus56037 = fixture.assertions.bus_56037_id;
    expect(state.bus_state[bus56009].capacity_mw).toBe(fixture.assertions.bus_56009_init_capacity_mw);
    expect(state.bus_state[bus56037].capacity_mw).toBe(fixture.assertions.bus_56037_init_capacity_mw);
  });

  it('(7c) Dave Johnston retires at year 2027 — capacity drops 816.7 MW', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    expect(dj.lifecycle).toBe(fixture.assertions.yr2027_dj_lifecycle);
    expect(state.bus_state[fixture.assertions.bus_56009_id].capacity_mw)
      .toBe(fixture.assertions.yr2027_bus_56009_capacity_mw);
  });

  it('(7d) Jim Bridger still operating at year 2027', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    const jb = findAsset(state.asset_registry, a => a.name.includes('Jim Bridger'));
    expect(jb.lifecycle).toBe(fixture.assertions.yr2027_jb_lifecycle);
    expect(state.bus_state[fixture.assertions.bus_56037_id].capacity_mw)
      .toBe(fixture.assertions.yr2027_bus_56037_capacity_mw);
  });

  it('(7e) Jim Bridger retires at year 2031 — capacity drops 2120 MW', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    const jb = findAsset(state.asset_registry, a => a.name.includes('Jim Bridger'));
    expect(jb.lifecycle).toBe(fixture.assertions.yr2031_jb_lifecycle);
    expect(state.bus_state[fixture.assertions.bus_56037_id].capacity_mw)
      .toBe(fixture.assertions.yr2031_bus_56037_capacity_mw);
  });

  it('(7f) Capacity remains reduced through year 2045', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    expect(state.bus_state[fixture.assertions.bus_56009_id].capacity_mw)
      .toBe(fixture.assertions.yr2045_bus_56009_capacity_mw);
    expect(state.bus_state[fixture.assertions.bus_56037_id].capacity_mw)
      .toBe(fixture.assertions.yr2045_bus_56037_capacity_mw);
  });

  it('(7g) Digests match Golden G′ at year 2027 (engine v3.1 — autonomous decline active)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2027);
    expect(computeDigestMd5(state).md5).toBe(primeFixture.digests_yr2027.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(primeFixture.digests_yr2027.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(primeFixture.digests_yr2027.existing_assets_digest_md5);
  });

  it('(7h) Digests match Golden G′ at year 2031', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2031);
    expect(computeDigestMd5(state).md5).toBe(primeFixture.digests_yr2031.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(primeFixture.digests_yr2031.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(primeFixture.digests_yr2031.existing_assets_digest_md5);
  });

  it('(7i) Digests match Golden G′ at year 2045', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), 2045);
    expect(computeDigestMd5(state).md5).toBe(primeFixture.digests_yr2045.state_digest_md5);
    expect(computeFiscalDigestMd5(state).md5).toBe(primeFixture.digests_yr2045.fiscal_digest_md5);
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(primeFixture.digests_yr2045.existing_assets_digest_md5);
  });

  it('(7j) Original state is unmodified (pure function)', () => {
    const state = loadInitialStateWithRetirements();
    const { md5: beforeMd5 } = computeDigestMd5(state);
    advanceToYear(state, 2045);
    const { md5: afterMd5 } = computeDigestMd5(state);
    expect(afterMd5).toBe(beforeMd5);
  });
});
