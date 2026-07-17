import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, relClose, computeDigestMd5, computeFiscalDigestMd5 } from './helpers.js';
import { applyAction, queueAction, advanceYear } from '../../src/engine/engine.js';
import type { EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_d') as {
  fixture_id: string;
  inputs: {
    pre_placed_assets: { action: string; geoid: string; magnitude: number; year: number; override_op?: number }[];
    player_sequence: { action: string; geoid: string; magnitude: number; year: number }[];
    campbell_retirements: { action: string; geoid: string; magnitude: number; year: number }[];
  };
  fiscal_snapshots: Record<string, Record<string, {
    ledger_a: number;
    ledger_b: number;
    ledger_c: number;
    assessed_mineral: number;
    ledger_a_cumulative_delta: number;
    ledger_b_cumulative_delta: number;
    ledger_c_cumulative_delta: number;
  }>>;
  assertions: Record<string, unknown>;
  final_state_digest: { md5: string };
  final_fiscal_digest: { md5: string };
};

describe('Golden D — Campbell & Laramie Fiscal Arcs', () => {
  let state: EngineState;

  it('should initialize with 23 WY counties in county_fiscal', () => {
    state = loadInitialState();
    const fiscalGeoids = Object.keys(state.county_fiscal);
    expect(fiscalGeoids.length).toBe(23);
    // Campbell should have initial assessed_mineral
    expect(state.county_fiscal['56005'].assessed_mineral).toBeGreaterThan(0);
    expect(state.county_fiscal['56005'].advalorem_production).toBeGreaterThan(0);
  });

  it('should replay Golden B pre-placed assets + player sequence + Campbell retirements', () => {
    // Queue pre-placed assets
    for (const asset of fixture.inputs.pre_placed_assets) {
      state = queueAction(state, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
    }

    // Queue Campbell retirements (coal_to_solar, time_to_deploy=3)
    for (const ret of fixture.inputs.campbell_retirements) {
      state = queueAction(state, ret.action, ret.geoid, ret.magnitude, ret.year);
    }

    // Advance to 2028
    while (state.year < 2028) {
      state = advanceYear(state);
    }
    expect(state.year).toBe(2028);

    // Player sequence (same as Golden B)
    const seq = fixture.inputs.player_sequence;
    // Queue: smr_advanced x2 (with override to 2032)
    state = queueAction(state, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
    state = queueAction(state, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
    // Queue: transmission_230kv
    state = queueAction(state, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
    // Apply: workforce_retraining x2, affordable_housing x1
    [state] = applyAction(state, seq[3].action, seq[3].geoid, seq[3].magnitude);
    [state] = applyAction(state, seq[4].action, seq[4].geoid, seq[4].magnitude);
    [state] = applyAction(state, seq[5].action, seq[5].geoid, seq[5].magnitude);
    // Queue: battery_grid
    state = queueAction(state, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

    // Advance to 2045 (past all retirements)
    while (state.year < 2045) {
      state = advanceYear(state);
    }
    expect(state.year).toBe(2045);
  });

  it('(4a) Campbell Ledger A declines monotonically at each retirement commission', () => {
    const expected = fixture.assertions['4a_ledger_a_at_commissions'] as number[];
    // Get Campbell fiscal state

    // Filter to coal_to_solar commission years — fiscal_actions from coal_to_solar only
    const cf = state.county_fiscal['56005'];
    const coalActions = cf.fiscal_actions.filter(fa => fa.action_id === 'coal_to_solar');
    expect(coalActions.length).toBe(4);

    // Check monotonic decline using the cumulative advalorem level at each coal_to_solar action
    // The expected values are the advalorem_production level at each commission
    // Build running level from baseline
    const baselineAv = cf.advalorem_production - cf.ledger_a_cumulative_delta;
    let runningAv = baselineAv;
    const avLevels: number[] = [];
    for (const fa of cf.fiscal_actions) {
      runningAv += fa.ledger_a_delta;
      if (fa.action_id === 'coal_to_solar') {
        avLevels.push(Math.round(runningAv * 100) / 100);
      }
    }

    for (let i = 0; i < expected.length; i++) {
      expect(
        relClose(avLevels[i], expected[i]),
        `4a ledger_a at commission ${i}: TS=${avLevels[i]} PY=${expected[i]}`
      ).toBe(true);
    }

    // Monotonic decline
    for (let i = 1; i < avLevels.length; i++) {
      expect(avLevels[i]).toBeLessThan(avLevels[i - 1]);
    }
    expect(fixture.assertions['4a_monotonic_decline']).toBe(true);
  });

  it('(4b) Laramie property tax rises at Natrium commission (2032)', () => {
    // Re-replay to capture Laramie property tax at years 2031 and 2032
    let s = loadInitialState();

    for (const asset of fixture.inputs.pre_placed_assets) {
      s = queueAction(s, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
    }
    for (const ret of fixture.inputs.campbell_retirements) {
      s = queueAction(s, ret.action, ret.geoid, ret.magnitude, ret.year);
    }
    while (s.year < 2028) s = advanceYear(s);

    const seq = fixture.inputs.player_sequence;
    s = queueAction(s, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
    s = queueAction(s, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
    s = queueAction(s, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
    [s] = applyAction(s, seq[3].action, seq[3].geoid, seq[3].magnitude);
    [s] = applyAction(s, seq[4].action, seq[4].geoid, seq[4].magnitude);
    [s] = applyAction(s, seq[5].action, seq[5].geoid, seq[5].magnitude);
    s = queueAction(s, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

    // Advance to 2031
    while (s.year < 2031) s = advanceYear(s);
    const pt2031 = Math.round(s.county_fiscal['56021'].property_tax * 100) / 100;

    // Advance to 2032
    s = advanceYear(s);
    const pt2032 = Math.round(s.county_fiscal['56021'].property_tax * 100) / 100;

    expect(
      relClose(pt2031, fixture.assertions['4b_laramie_pt_2031'] as number),
      `4b pt_2031: TS=${pt2031} PY=${fixture.assertions['4b_laramie_pt_2031']}`
    ).toBe(true);
    expect(
      relClose(pt2032, fixture.assertions['4b_laramie_pt_2032'] as number),
      `4b pt_2032: TS=${pt2032} PY=${fixture.assertions['4b_laramie_pt_2032']}`
    ).toBe(true);
    expect(pt2032).toBeGreaterThan(pt2031);
  });

  it('(4c) DC adds fiscal actions for Laramie', () => {
    const laramieFiscal = state.county_fiscal['56021'];
    const dcActions = laramieFiscal.fiscal_actions.filter(
      fa => fa.action_id === 'data_center_hyperscale' || fa.action_id === 'data_center_campus_phase'
    );
    expect(dcActions.length).toBeGreaterThan(0);
    expect(fixture.assertions['4c_dc_fiscal_actions_found']).toBe(true);
  });

  it('(4d) Campbell recapture (Ledger C) decreases in magnitude as coal retires', () => {
    const cf = state.county_fiscal['56005'];
    const cDelta = Math.round(cf.ledger_c_cumulative_delta * 100) / 100;
    const cFinal = Math.round(cf.school_finance_net * 100) / 100;

    expect(
      relClose(cDelta, fixture.assertions['4d_ledger_c_cumulative_delta'] as number),
      `4d ledger_c_cumulative_delta: TS=${cDelta} PY=${fixture.assertions['4d_ledger_c_cumulative_delta']}`
    ).toBe(true);
    expect(
      relClose(cFinal, fixture.assertions['4d_ledger_c_final'] as number),
      `4d ledger_c_final: TS=${cFinal} PY=${fixture.assertions['4d_ledger_c_final']}`
    ).toBe(true);
  });

  it('(4e) Sign relationship: A<0, B<0, C>0 for Campbell coal retirement', () => {
    const cf = state.county_fiscal['56005'];

    const aDelta = Math.round(cf.ledger_a_cumulative_delta * 100) / 100;
    const bDelta = Math.round(cf.ledger_b_cumulative_delta * 100) / 100;
    const cDelta = Math.round(cf.ledger_c_cumulative_delta * 100) / 100;

    expect(
      relClose(aDelta, fixture.assertions['4e_ledger_a_cumulative_delta'] as number),
      `4e A delta: TS=${aDelta} PY=${fixture.assertions['4e_ledger_a_cumulative_delta']}`
    ).toBe(true);
    expect(
      relClose(bDelta, fixture.assertions['4e_ledger_b_cumulative_delta'] as number),
      `4e B delta: TS=${bDelta} PY=${fixture.assertions['4e_ledger_b_cumulative_delta']}`
    ).toBe(true);
    expect(
      relClose(cDelta, fixture.assertions['4e_ledger_c_cumulative_delta'] as number),
      `4e C delta: TS=${cDelta} PY=${fixture.assertions['4e_ledger_c_cumulative_delta']}`
    ).toBe(true);

    // Sign assertions
    expect(aDelta).toBeLessThan(0);
    expect(bDelta).toBeLessThan(0);
    expect(cDelta).toBeGreaterThan(0);
  });

  it('should match final state digest md5 (A/B/C unchanged)', () => {
    const { md5 } = computeDigestMd5(state);
    expect(md5).toBe(fixture.final_state_digest.md5);
  });

  it('should match final fiscal digest md5', () => {
    const { md5 } = computeFiscalDigestMd5(state);
    expect(md5).toBe(fixture.final_fiscal_digest.md5);
  });

  it('should match fiscal snapshots at key years', () => {
    // Full re-replay to capture snapshots at specific years
    let s = loadInitialState();

    for (const asset of fixture.inputs.pre_placed_assets) {
      s = queueAction(s, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
    }
    for (const ret of fixture.inputs.campbell_retirements) {
      s = queueAction(s, ret.action, ret.geoid, ret.magnitude, ret.year);
    }
    while (s.year < 2028) s = advanceYear(s);

    const seq = fixture.inputs.player_sequence;
    s = queueAction(s, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
    s = queueAction(s, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
    s = queueAction(s, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
    [s] = applyAction(s, seq[3].action, seq[3].geoid, seq[3].magnitude);
    [s] = applyAction(s, seq[4].action, seq[4].geoid, seq[4].magnitude);
    [s] = applyAction(s, seq[5].action, seq[5].geoid, seq[5].magnitude);
    s = queueAction(s, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

    const snapshotYears = Object.keys(fixture.fiscal_snapshots).map(Number).sort((a, b) => a - b);

    for (const targetYear of snapshotYears) {
      while (s.year < targetYear) s = advanceYear(s);

      const snap = fixture.fiscal_snapshots[String(targetYear)];
      for (const [label, expected] of Object.entries(snap)) {
        const geoid = label.split('_').pop()!; // e.g. "campbell_56005" -> "56005"
        const cf = s.county_fiscal[geoid];
        if (!cf) continue;

        const cfRounded: Record<string, number> = {
          property_tax: Math.round(cf.property_tax * 100) / 100,
          ledger_a: Math.round(cf.advalorem_production * 100) / 100,
          ledger_b: Math.round(cf.severance_share * 100) / 100,
          ledger_c: Math.round(cf.school_finance_net * 100) / 100,
          assessed_mineral: Math.round(cf.assessed_mineral * 100) / 100,
          ledger_a_cumulative_delta: Math.round(cf.ledger_a_cumulative_delta * 100) / 100,
          ledger_b_cumulative_delta: Math.round(cf.ledger_b_cumulative_delta * 100) / 100,
          ledger_c_cumulative_delta: Math.round(cf.ledger_c_cumulative_delta * 100) / 100,
        };

        for (const [field, pyVal] of Object.entries(expected)) {
          const tsVal = cfRounded[field];
          expect(
            relClose(tsVal, pyVal),
            `Snapshot yr=${targetYear} ${label} ${field}: TS=${tsVal} PY=${pyVal}`
          ).toBe(true);
        }
      }
    }
  });
});
