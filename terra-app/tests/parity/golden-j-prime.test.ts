/**
 * Golden J′ parity tests — Engine v4.2
 * Re-run of Golden J with dynamic population advancement.
 * Static-denominator values superseded; history_digest_md5 reflects population
 * and working_age_population fields now included in IndicatorSnapshot.
 * Fourth permitted fixture amendment.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadFixture, loadInitialStateWithRetirements, relClose } from './helpers.js';
import {
  advanceYear,
  queueAction,
  applyAction,
  historyDigest,
  project,
} from '../../src/engine/engine.js';
import { computeIndicator } from '../../src/engine/indicators.js';
import type { EngineState, IndicatorSnapshot } from '../../src/engine/types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

type GoldenJPrimeFixture = {
  fixture_id: string;
  history_digest_md5: string;
  history_n_years: number;
  history_year_range: number[];
  assertions: {
    laramie_payback_year_range: [number, number];
    laramie_labor_utilization_2030: number;
    laramie_labor_utilization_construction_peak: { year: number; min: number; max: number };
    laramie_labor_utilization_2033: number;
    laramie_labor_utilization_post_commission_max: number;
    campbell_service_funding_per_capita_2028: number;
    campbell_service_funding_per_capita_2038: number;
    campbell_coal_recapture_burden_shrinks: boolean;
    campbell_population_2028: number;
    campbell_working_age_population_2028: number;
    laramie_population_2028: number;
    laramie_working_age_population_2028: number;
    laramie_population_2038: number;
    laramie_working_age_population_2038: number;
    laramie_population_monotone_2028_2038: boolean;
    laramie_history_spot_2032_E: number;
    laramie_history_spot_2032_Ec: number;
    laramie_history_spot_2032_S: number;
  };
};

const fixture = loadFixture('golden_j_prime') as GoldenJPrimeFixture;
const goldenJFixture = loadFixture('golden_j') as { history_digest_md5: string };

const LARAMIE = '56021';
const CAMPBELL = '56005';

// ── State construction (same Golden B sequence as Golden J) ───────────────────

function buildGoldenBState(): EngineState {
  let state = loadInitialStateWithRetirements();
  state = queueAction(state, 'data_center_hyperscale', LARAMIE, 100, 2025);
  state = queueAction(state, 'data_center_campus_phase', LARAMIE, 200, 2025);
  state = queueAction(state, 'smr_advanced', '56023', 345, 2025, 2031);
  while (state.year < 2028) state = advanceYear(state);
  state = queueAction(state, 'smr_advanced', LARAMIE, 345, 2028, 2032);
  state = queueAction(state, 'smr_advanced', LARAMIE, 345, 2028, 2032);
  state = queueAction(state, 'transmission_230kv', LARAMIE, 50, 2028);
  [state] = applyAction(state, 'workforce_retraining', LARAMIE, 1000);
  [state] = applyAction(state, 'workforce_retraining', '56023', 1000);
  [state] = applyAction(state, 'affordable_housing', LARAMIE, 500);
  state = queueAction(state, 'battery_grid', LARAMIE, 1000, 2028);
  return state;
}

function snapForYear(history: IndicatorSnapshot[], year: number): IndicatorSnapshot | undefined {
  return history.find(s => s.year === year);
}

// ── Full 60-year projection (run once) ───────────────────────────────────────

describe('Golden J′ — 60-year projection', () => {
  let finalState: EngineState;

  beforeAll(() => {
    const base = buildGoldenBState();
    const states = project(base, 60);
    finalState = states[states.length - 1];
  }, 120_000);

  // ── history_digest: confirms v4.2 snapshot fields changed the digest ──────

  it('Jp-1: historyDigest MD5 matches frozen Golden J′ fixture', () => {
    const hd = historyDigest(finalState);
    expect(hd.md5).toBe(fixture.history_digest_md5);
  });

  it('Jp-2: historyDigest differs from Golden J (population fields now in snapshot)', () => {
    const hd = historyDigest(finalState);
    expect(hd.md5).not.toBe(goldenJFixture.history_digest_md5);
  });

  it('Jp-3: history length matches fixture', () => {
    expect(finalState.history).toHaveLength(fixture.history_n_years);
  });

  it('Jp-4: history year range matches fixture', () => {
    const h = finalState.history;
    expect([h[0].year, h[h.length - 1].year]).toEqual(fixture.history_year_range);
  });

  // ── Population dynamics ───────────────────────────────────────────────────

  it('Jp-5: Campbell population declining by 2028 (PRB-linked outmigration)', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    expect(snap2028).toBeDefined();
    expect(snap2028!.counties[CAMPBELL].population).toBe(fixture.assertions.campbell_population_2028);
  });

  it('Jp-6: Campbell working_age_population present and proportional', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    expect(snap2028).toBeDefined();
    expect(snap2028!.counties[CAMPBELL].working_age_population).toBe(fixture.assertions.campbell_working_age_population_2028);
  });

  it('Jp-7: Laramie population growing by 2028 (SMR ops migration)', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    expect(snap2028).toBeDefined();
    expect(snap2028!.counties[LARAMIE].population).toBe(fixture.assertions.laramie_population_2028);
  });

  it('Jp-8: Laramie working_age_population present 2028', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    expect(snap2028).toBeDefined();
    expect(snap2028!.counties[LARAMIE].working_age_population).toBe(fixture.assertions.laramie_working_age_population_2028);
  });

  it('Jp-9: Laramie population monotonically growing 2028→2038', () => {
    const pops: number[] = [];
    for (let yr = 2028; yr <= 2038; yr++) {
      const snap = snapForYear(finalState.history, yr);
      expect(snap).toBeDefined();
      pops.push(snap!.counties[LARAMIE].population as number);
    }
    for (let i = 1; i < pops.length; i++) {
      expect(pops[i]).toBeGreaterThanOrEqual(pops[i - 1]);
    }
  });

  it('Jp-10: Laramie population and working_age 2038 match fixture', () => {
    const snap2038 = snapForYear(finalState.history, 2038);
    expect(snap2038).toBeDefined();
    expect(snap2038!.counties[LARAMIE].population).toBe(fixture.assertions.laramie_population_2038);
    expect(snap2038!.counties[LARAMIE].working_age_population).toBe(fixture.assertions.laramie_working_age_population_2038);
  });

  // ── Per-capita denominators changed ──────────────────────────────────────

  it('Jp-11: Campbell service_funding_per_capita 2028 matches J′ fixture (more negative than J)', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    expect(snap2028).toBeDefined();
    const sfpc = snap2028!.counties[CAMPBELL].service_funding_per_capita;
    expect(relClose(sfpc, fixture.assertions.campbell_service_funding_per_capita_2028, 1e-4)).toBe(true);
  });

  it('Jp-12: Campbell coal recapture burden still shrinks 2028→2038 (PRB decline dominates)', () => {
    const snap2028 = snapForYear(finalState.history, 2028);
    const snap2038 = snapForYear(finalState.history, 2038);
    expect(snap2028).toBeDefined();
    expect(snap2038).toBeDefined();
    const sfpc2028 = snap2028!.counties[CAMPBELL].service_funding_per_capita;
    const sfpc2038 = snap2038!.counties[CAMPBELL].service_funding_per_capita;
    expect(Math.abs(sfpc2038)).toBeLessThan(Math.abs(sfpc2028));
  });

  // ── EES spot values unchanged (population does not directly alter E/Ec/S) ─

  it('Jp-13: Laramie 2032 EES spot values stable (EES not population-indexed)', () => {
    const snap2032 = snapForYear(finalState.history, 2032);
    expect(snap2032).toBeDefined();
    const c = snap2032!.counties[LARAMIE];
    expect(relClose(c.E, fixture.assertions.laramie_history_spot_2032_E)).toBe(true);
    expect(relClose(c.Ec, fixture.assertions.laramie_history_spot_2032_Ec)).toBe(true);
    expect(relClose(c.S, fixture.assertions.laramie_history_spot_2032_S)).toBe(true);
  });

  // ── Labor utilization unchanged ───────────────────────────────────────────

  it('Jp-14: labor_utilization elevated during SMR construction (2030)', () => {
    const snap2030 = snapForYear(finalState.history, 2030);
    expect(snap2030).toBeDefined();
    const lu = snap2030!.counties[LARAMIE].labor_utilization;
    const { min, max } = fixture.assertions.laramie_labor_utilization_construction_peak;
    expect(lu).toBeGreaterThanOrEqual(min);
    expect(lu).toBeLessThanOrEqual(max);
  });

  it('Jp-15: labor_utilization near-zero post-commission (2033+)', () => {
    const snap2033 = snapForYear(finalState.history, 2033);
    expect(snap2033).toBeDefined();
    const lu = snap2033!.counties[LARAMIE].labor_utilization;
    expect(lu).toBeLessThanOrEqual(fixture.assertions.laramie_labor_utilization_post_commission_max);
  });

  // ── Payback year (uses raw cumulative_net, not per-capita) ───────────────

  it('Jp-16: payback_year in documented range (unaffected by population)', () => {
    const py = computeIndicator(finalState, 'payback_year', 'county', LARAMIE);
    const [lo, hi] = fixture.assertions.laramie_payback_year_range;
    expect(py).not.toBeNull();
    expect(py as number).toBeGreaterThanOrEqual(lo);
    expect(py as number).toBeLessThanOrEqual(hi);
  });

  // ── Off-switch: migration_enabled = false ────────────────────────────────

  it('Jp-17: off-switch — migration disabled produces lower Laramie pop post-SMR commission', () => {
    // Golden B has 2x SMR at Laramie commissioning in 2032. Advance 5 years past 2028 end-state
    // (to 2033) with migration ON vs OFF. After commission, ops migration inflates pop; off-switch stops it.
    const base = buildGoldenBState();
    let stateOn = base;
    let stateOff: EngineState = base.population_config
      ? { ...base, population_config: { ...base.population_config, migration_enabled: false } }
      : base;
    for (let i = 0; i < 5; i++) {
      stateOn = advanceYear(stateOn);
      stateOff = advanceYear(stateOff);
    }
    const popOn = stateOn.county_ees[LARAMIE].population;
    const popOff = stateOff.county_ees[LARAMIE].population;
    // Migration-enabled run should have grown more (SMR ops migration contributes)
    expect(popOn).toBeGreaterThan(popOff);
  });
});
