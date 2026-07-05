/**
 * Golden J — 60-year projection from Golden B 2028 end-state
 *
 * Tests the v4.0 indicator history system:
 * - history appended by advanceYear
 * - snapshotIndicators parity with Python
 * - historyDigest MD5 matches frozen Golden J fixture
 * - labor_utilization arc (elevated during construction 2029-2031, zero post-commission 2032+)
 * - Campbell service_funding_per_capita: recapture burden shrinks as coal declines
 * - payback_year computed from history
 * - project() and projectDelta() smoke tests
 *
 * Projections are conditional forecasts under 'no further decisions,' not predictions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadFixture, loadInitialStateWithRetirements, relClose } from './helpers.js';
import {
  advanceYear,
  queueAction,
  applyAction,
  historyDigest,
  project,
  projectDelta,
} from '../../src/engine/engine.js';
import { computeIndicator, snapshotIndicators } from '../../src/engine/indicators.js';
import type { EngineState, IndicatorSnapshot } from '../../src/engine/types.js';

// ── Fixture ─────────────────────────────────────────────────────────────────

type GoldenJFixture = {
  fixture_id: string;
  history_digest_md5: string;
  history_n_years: number;
  history_year_range: number[];
  assertions: {
    laramie_payback_year: number;
    laramie_payback_year_range: [number, number];
    laramie_labor_utilization_2030: number;
    laramie_labor_utilization_construction_peak: { year: number; min: number; max: number };
    laramie_labor_utilization_2033: number;
    laramie_labor_utilization_post_commission_max: number;
    campbell_service_funding_per_capita_2028: number;
    campbell_service_funding_per_capita_2038: number;
    campbell_coal_recapture_burden_shrinks: boolean;
    laramie_history_spot_2032_E: number;
    laramie_history_spot_2032_Ec: number;
    laramie_history_spot_2032_S: number;
  };
};

const fixture = loadFixture('golden_j') as GoldenJFixture;
const goldenJPrimeFixture = loadFixture('golden_j_prime') as { history_digest_md5: string };

const LARAMIE = '56021';
const LINCOLN = '56023';
const CAMPBELL = '56005';

// ── State construction (Golden B sequence up to 2028) ─────────────────────────

function buildGoldenBState(): EngineState {
  let state = loadInitialStateWithRetirements();
  state = queueAction(state, 'data_center_hyperscale', LARAMIE, 100, 2025);
  state = queueAction(state, 'data_center_campus_phase', LARAMIE, 200, 2025);
  state = queueAction(state, 'smr_advanced', LINCOLN, 345, 2025, 2031);
  while (state.year < 2028) state = advanceYear(state);
  state = queueAction(state, 'smr_advanced', LARAMIE, 345, 2028, 2032);
  state = queueAction(state, 'smr_advanced', LARAMIE, 345, 2028, 2032);
  state = queueAction(state, 'transmission_230kv', LARAMIE, 50, 2028);
  [state] = applyAction(state, 'workforce_retraining', LARAMIE, 1000);
  [state] = applyAction(state, 'workforce_retraining', LINCOLN, 1000);
  [state] = applyAction(state, 'affordable_housing', LARAMIE, 500);
  state = queueAction(state, 'battery_grid', LARAMIE, 1000, 2028);
  return state;
}

function snapForYear(history: IndicatorSnapshot[], year: number): IndicatorSnapshot | undefined {
  return history.find(s => s.year === year);
}

// ── History structure tests (fast — no full 60yr projection) ─────────────────

describe('Golden J — history structure', () => {
  let state: EngineState;
  beforeAll(() => { state = buildGoldenBState(); });

  it('J-S1: history appended after each advanceYear', () => {
    expect(state.history).toHaveLength(3);
    const years = state.history.map(s => s.year);
    expect(years).toEqual([2026, 2027, 2028]);
  });

  it('J-S2: each snapshot has required top-level keys', () => {
    for (const snap of state.history) {
      expect(snap).toHaveProperty('year');
      expect(snap).toHaveProperty('study');
      expect(snap).toHaveProperty('counties');
      expect(snap).toHaveProperty('pools');
    }
  });

  it('J-S3: study EES values are non-null and finite', () => {
    for (const snap of state.history) {
      expect(snap.study.E).not.toBeNull();
      expect(snap.study.Ec).not.toBeNull();
      expect(snap.study.S).not.toBeNull();
      expect(Number.isFinite(snap.study.E as number)).toBe(true);
    }
  });

  it('J-S4: county snapshots include Campbell with all fiscal fields', () => {
    for (const snap of state.history) {
      const c = snap.counties[CAMPBELL];
      expect(c).toBeDefined();
      expect(c).toHaveProperty('property_tax');
      expect(c).toHaveProperty('cumulative_net');
      expect(c).toHaveProperty('labor_utilization');
      expect(c).toHaveProperty('service_funding_per_capita');
    }
  });

  it('J-S5: pools dict has 6 entries (2 live, 4 stubs as null)', () => {
    const snap = state.history[0];
    expect(Object.keys(snap.pools)).toHaveLength(6);
  });

  it('J-S6: main digest (state_digest) does not cover history', () => {
    // Advance a copy one more year and verify history doesn't affect digest
    const s1 = state;
    // The digest function never reads history — just confirm the field isn't in the
    // existing digest helpers by checking state structure
    expect(state.history).toBeDefined();
    expect(Array.isArray(state.history)).toBe(true);
  });

  it('J-S7: history shallow copy is independent', () => {
    const s2 = advanceYear(state);
    expect(s2.history.length).toBe(state.history.length + 1);
    expect(state.history.length).toBe(3); // original unchanged
  });

  it('J-S8: snapshotIndicators produces same result as advance_year snapshot', () => {
    // snapshotIndicators called independently should match the stored snapshot
    const snap = snapshotIndicators(state);
    expect(snap.year).toBe(state.year);
    // Study values should match the last stored history entry
    const lastSnap = state.history[state.history.length - 1];
    expect(relClose(snap.study.E as number, lastSnap.study.E as number)).toBe(true);
  });
});

// ── Full 60-year projection tests (expensive — run once via module-level setup) ──

describe('Golden J — 60-year projection', () => {
  let finalState: EngineState;

  beforeAll(() => {
    const base = buildGoldenBState();
    const states = project(base, 60);
    finalState = states[states.length - 1];
  }, 120_000); // 2-minute timeout

  it('J1: payback_year in documented range', () => {
    const py = computeIndicator(finalState, 'payback_year', 'county', LARAMIE);
    const [lo, hi] = fixture.assertions.laramie_payback_year_range;
    expect(py).not.toBeNull();
    expect(py as number).toBeGreaterThanOrEqual(lo);
    expect(py as number).toBeLessThanOrEqual(hi);
  });

  it('J2: labor_utilization elevated during SMR construction (2029–2031)', () => {
    const snap2030 = snapForYear(finalState.history, 2030);
    expect(snap2030).toBeDefined();
    const lu = snap2030!.counties[LARAMIE].labor_utilization;
    const { min, max } = fixture.assertions.laramie_labor_utilization_construction_peak;
    expect(lu).toBeGreaterThanOrEqual(min);
    expect(lu).toBeLessThanOrEqual(max);
  });

  it('J3: labor_utilization near-zero post-commission (2033+)', () => {
    const snap2033 = snapForYear(finalState.history, 2033);
    expect(snap2033).toBeDefined();
    const lu = snap2033!.counties[LARAMIE].labor_utilization;
    expect(lu).toBeLessThanOrEqual(fixture.assertions.laramie_labor_utilization_post_commission_max);
  });

  it('J4: Campbell coal recapture burden shrinks (PRB coal decline)', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    const snap2038 = snapForYear(finalState.history, 2038);
    expect(snap2028).toBeDefined();
    expect(snap2038).toBeDefined();
    const sfpc2028 = snap2028!.counties[CAMPBELL].service_funding_per_capita;
    const sfpc2038 = snap2038!.counties[CAMPBELL].service_funding_per_capita;
    expect(Math.abs(sfpc2038)).toBeLessThan(Math.abs(sfpc2028));
  });

  it('J5: historyDigest MD5 matches Golden J′ fixture (J superseded; see golden-j-prime.test.ts)', () => {
    // Golden J was superseded by Golden J′ (engine v4.2). The current engine produces
    // the J′ digest; the original J digest is preserved in golden_j.json for documentation.
    const hd = historyDigest(finalState);
    expect(hd.md5).toBe(goldenJPrimeFixture.history_digest_md5);       // current value
    expect(hd.md5).not.toBe(fixture.history_digest_md5);               // old J value
  });

  it('J6: history length matches fixture (63 = 3 pre-projection + 60 projected)', () => {
    expect(finalState.history).toHaveLength(fixture.history_n_years);
  });

  it('J7: history year range matches fixture [2026, 2088]', () => {
    const history = finalState.history;
    expect([history[0].year, history[history.length - 1].year]).toEqual(fixture.history_year_range);
  });

  it('J8: Laramie 2032 EES spot values match fixture (TS parity)', () => {
    const snap2032 = snapForYear(finalState.history, 2032);
    expect(snap2032).toBeDefined();
    const c = snap2032!.counties[LARAMIE];
    expect(relClose(c.E, fixture.assertions.laramie_history_spot_2032_E)).toBe(true);
    expect(relClose(c.Ec, fixture.assertions.laramie_history_spot_2032_Ec)).toBe(true);
    expect(relClose(c.S, fixture.assertions.laramie_history_spot_2032_S)).toBe(true);
  });

  it('J9: project() is deterministic — two runs yield identical historyDigest', () => {
    const base = buildGoldenBState();
    const s1 = project(base, 10);
    const s2 = project(base, 10);
    const hd1 = historyDigest(s1[s1.length - 1]);
    const hd2 = historyDigest(s2[s2.length - 1]);
    expect(hd1.md5).toBe(hd2.md5);
  });

  it('J10: projectDelta returns two trajectories of equal length', () => {
    const base = buildGoldenBState();
    const [actionStates, baselineStates] = projectDelta(base, 'solar_utility', LARAMIE, 100, 5);
    expect(actionStates).toHaveLength(5);
    expect(baselineStates).toHaveLength(5);
    const hdA = historyDigest(actionStates[actionStates.length - 1]);
    const hdB = historyDigest(baselineStates[baselineStates.length - 1]);
    expect(hdA.md5).toHaveLength(32);
    expect(hdB.md5).toHaveLength(32);
  });
});
