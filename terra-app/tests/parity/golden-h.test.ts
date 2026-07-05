/**
 * Golden H — Lincoln County Kemmerer Boomtown 2026-2034
 *
 * Player A: no actions — 2025→2034 do-nothing playthrough
 * Player B: queue smr_advanced 345 MW (op_year=2030), apply housing_retrofit_affordable 300 units,
 *           queue affordable_housing 100 units (op_year=2027); then advance to 2034
 *
 * Asserts housing_stock mutation, fiscal assessed_residential uplift (WY 9.5% ratio),
 * EES divergence, and full digest parity against the Python golden fixture.
 */

import { describe, it, expect } from 'vitest';
import {
  loadFixture,
  loadInitialStateWithRetirements,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
  relClose,
} from './helpers.js';
import {
  advanceYear,
  queueAction,
  applyAction,
} from '../../src/engine/engine.js';
import type { AssetInstance, EngineState } from '../../src/engine/types.js';

// ── Fixture ────────────────────────────────────────────────────────────────────

const fixture = loadFixture('golden_h') as {
  _meta: {
    lincoln_geoid: string;
    start_year: number;
    end_year: number;
  };
  player_a: {
    state_digest_md5: string;
    fiscal_digest_md5: string;
    existing_assets_digest_md5: string;
    lincoln_ees: { E: number; Ec: number; S: number };
    lincoln_housing: {
      housing_total_units: number;
      housing_occupied_units: number;
      housing_convertible_units: number;
      housing_subsidized_units: number;
      housing_permits_per_year: number;
      housing_affordable_added: number;
      housing_pressure_ratio: number;
      housing_seasonal_excluded: number;
    };
    lincoln_fiscal: Record<string, number>;
  };
  player_b: {
    state_digest_md5: string;
    fiscal_digest_md5: string;
    existing_assets_digest_md5: string;
    lincoln_ees: { E: number; Ec: number; S: number };
    lincoln_housing: {
      housing_total_units: number;
      housing_occupied_units: number;
      housing_convertible_units: number;
      housing_subsidized_units: number;
      housing_permits_per_year: number;
      housing_affordable_added: number;
      housing_pressure_ratio: number;
      housing_seasonal_excluded: number;
    };
    lincoln_fiscal: Record<string, number>;
  };
};

const LINCOLN = fixture._meta.lincoln_geoid; // "56023"
const END_YEAR = fixture._meta.end_year;      // 2034

// ── Helpers ────────────────────────────────────────────────────────────────────

function advanceToYear(state: EngineState, targetYear: number): EngineState {
  while (state.year < targetYear) {
    state = advanceYear(state);
  }
  return state;
}

function findHousing(state: EngineState, geoid: string): AssetInstance {
  const h = state.asset_registry.find(
    a => a.asset_class === 'housing_stock' && a.geoid === geoid,
  );
  if (!h) throw new Error(`No housing_stock asset found for geoid ${geoid}`);
  return h;
}

// ── Player A (do-nothing) ──────────────────────────────────────────────────────

describe('Golden H — Player A (no actions) 2025→2034', () => {
  it('(8a) housing_stock asset exists for Lincoln County at init', () => {
    const state = loadInitialStateWithRetirements();
    const h = findHousing(state, LINCOLN);
    expect(h.asset_class).toBe('housing_stock');
    expect(h.lifecycle).toBe('operating');
    expect(h.housing_convertible_units).toBeGreaterThan(0);
    // housing_stock is NOT in existing_assets materialized view
    const ea = state.existing_assets[LINCOLN] ?? [];
    const housingInEA = ea.some((a: Record<string, unknown>) => a.type === 'housing_stock');
    expect(housingInEA).toBe(false);
  });

  it('(8b) Player A 2034 state_digest_md5 matches Python', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const { md5 } = computeDigestMd5(state);
    expect(md5).toBe(fixture.player_a.state_digest_md5);
  });

  it('(8c) Player A 2034 fiscal_digest_md5 matches Python', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const { md5 } = computeFiscalDigestMd5(state);
    expect(md5).toBe(fixture.player_a.fiscal_digest_md5);
  });

  it('(8d) Player A 2034 existing_assets_digest_md5 matches Python', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const { md5 } = computeExistingAssetsDigestMd5(state);
    expect(md5).toBe(fixture.player_a.existing_assets_digest_md5);
  });

  it('(8e) Player A Lincoln EES matches fixture (tol=1e-4)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const ees = state.county_ees[LINCOLN];
    expect(relClose(ees.E,  fixture.player_a.lincoln_ees.E,  1e-4)).toBe(true);
    expect(relClose(ees.Ec, fixture.player_a.lincoln_ees.Ec, 1e-4)).toBe(true);
    expect(relClose(ees.S,  fixture.player_a.lincoln_ees.S,  1e-4)).toBe(true);
  });

  it('(8f) Player A Lincoln housing_pressure_ratio ≈ fixture (no stress)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const h = findHousing(state, LINCOLN);
    expect(h.housing_pressure_ratio).not.toBeNull();
    expect(relClose(h.housing_pressure_ratio!, fixture.player_a.lincoln_housing.housing_pressure_ratio, 1e-3)).toBe(true);
    // No stress — ratio < 1.05 mild threshold
    expect(h.housing_pressure_ratio!).toBeLessThan(1.05);
  });

  it('(8g) Player A Lincoln housing_affordable_added = 0 (no actions)', () => {
    const state = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const h = findHousing(state, LINCOLN);
    expect(h.housing_affordable_added).toBe(0);
    expect(h.housing_convertible_units).toBe(fixture.player_a.lincoln_housing.housing_convertible_units);
  });
});

// ── Player B (retrofit + new-build + SMR) ──────────────────────────────────────

describe('Golden H — Player B (retrofit + SMR) 2025→2034', () => {
  function runPlayerB(): EngineState {
    let state = loadInitialStateWithRetirements();
    // Advance 2025→2026
    state = advanceYear(state);
    expect(state.year).toBe(2026);

    // Queue Kemmerer SMR (345 MW, operational 2030)
    state = queueAction(state, 'smr_advanced', LINCOLN, 345, 2026, 2030);

    // Apply retrofit (consumes 300 convertible units)
    [state] = applyAction(state, 'housing_retrofit_affordable', LINCOLN, 300);

    // Queue affordable housing build (100 units, op_year=2027)
    state = queueAction(state, 'affordable_housing', LINCOLN, 100, 2026, 2027);

    // Advance 2027→2034
    return advanceToYear(state, END_YEAR);
  }

  it('(8h) Player B 2034 state_digest_md5 matches Python', () => {
    const { md5 } = computeDigestMd5(runPlayerB());
    expect(md5).toBe(fixture.player_b.state_digest_md5);
  });

  it('(8i) Player B 2034 fiscal_digest_md5 matches Python', () => {
    const { md5 } = computeFiscalDigestMd5(runPlayerB());
    expect(md5).toBe(fixture.player_b.fiscal_digest_md5);
  });

  it('(8j) Player B 2034 existing_assets_digest_md5 = Player A (housing excluded from view)', () => {
    const { md5 } = computeExistingAssetsDigestMd5(runPlayerB());
    expect(md5).toBe(fixture.player_b.existing_assets_digest_md5);
    expect(md5).toBe(fixture.player_a.existing_assets_digest_md5);
  });

  it('(8k) Player B Lincoln housing: 300 convertible consumed, 400 affordable_added', () => {
    const h = findHousing(runPlayerB(), LINCOLN);
    expect(h.housing_convertible_units).toBe(fixture.player_b.lincoln_housing.housing_convertible_units);
    expect(h.housing_affordable_added).toBe(fixture.player_b.lincoln_housing.housing_affordable_added);
    // retrofit consumed 300; only 115 remain from original 415
    expect(h.housing_convertible_units).toBe(115);
    // 300 retrofit + 100 new-build = 400 affordable_added
    expect(h.housing_affordable_added).toBe(400);
  });

  it('(8l) Player B Lincoln housing_pressure_ratio < Player A (more supply)', () => {
    const stateA = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const stateB = runPlayerB();
    const hA = findHousing(stateA, LINCOLN);
    const hB = findHousing(stateB, LINCOLN);
    expect(hB.housing_pressure_ratio!).toBeLessThan(hA.housing_pressure_ratio!);
    expect(relClose(hB.housing_pressure_ratio!, fixture.player_b.lincoln_housing.housing_pressure_ratio, 1e-3)).toBe(true);
  });

  it('(8m) Player B Lincoln fiscal: assessed_residential increased by retrofit uplift', () => {
    const state = runPlayerB();
    const cf = state.county_fiscal![LINCOLN];
    expect(cf).toBeDefined();
    // 300 units × $150k × 9.5% = $4,275,000 assessed uplift
    const expectedDelta = 300 * 150_000 * 0.095;
    const actualDelta = cf.assessed_residential - fixture.player_a.lincoln_fiscal.assessed_residential;
    expect(relClose(actualDelta, expectedDelta, 1e-4)).toBe(true);
    expect(relClose(cf.assessed_residential, fixture.player_b.lincoln_fiscal.assessed_residential, 1e-6)).toBe(true);
  });

  it('(8n) Player B Lincoln EES: Ec elevated vs Player A (SMR + housing EES)', () => {
    const stateA = advanceToYear(loadInitialStateWithRetirements(), END_YEAR);
    const stateB = runPlayerB();
    const eesA = stateA.county_ees[LINCOLN];
    const eesB = stateB.county_ees[LINCOLN];
    // Player B queued SMR → higher economic capital at commission
    expect(eesB.Ec).toBeGreaterThan(eesA.Ec);
    expect(relClose(eesB.E,  fixture.player_b.lincoln_ees.E,  1e-4)).toBe(true);
    expect(relClose(eesB.Ec, fixture.player_b.lincoln_ees.Ec, 1e-4)).toBe(true);
    expect(relClose(eesB.S,  fixture.player_b.lincoln_ees.S,  1e-4)).toBe(true);
  });

  it('(8o) housing_retrofit_affordable validates convertible_units cap', () => {
    let state = loadInitialStateWithRetirements();
    const h = findHousing(state, LINCOLN);
    const available = h.housing_convertible_units!;
    // Requesting more than available should throw
    expect(() => applyAction(state, 'housing_retrofit_affordable', LINCOLN, available + 1)).toThrow();
  });
});
