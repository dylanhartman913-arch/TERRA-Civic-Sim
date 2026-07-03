import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, relClose, computeDigestMd5 } from './helpers.js';
import { applyAction, queueAction, advanceYear, injectDisturbance } from '../../src/engine/engine.js';
import type { EngineState } from '../../src/engine/types.js';

const fixtureB = loadFixture('golden_b') as {
  inputs: {
    pre_placed_assets: { action: string; geoid: string; magnitude: number; year: number; override_op?: number }[];
    player_sequence: { action: string; geoid: string; magnitude: number; year: number }[];
  };
};

const fixtureC = loadFixture('golden_c') as {
  inputs: {
    disturbance_type: string;
    severities: number[];
    affected_geoids: string[];
  };
  severity_results: {
    severity: number;
    flexible_load_shed_mw: number;
    firm_load_affected_mw: number;
    deficit_mw_change: number;
    reliability_score_change: number;
  }[];
  assertions: Record<string, boolean>;
  final_state_digest: {
    md5: string;
    [key: string]: unknown;
  };
};

function buildGoldenBState(): EngineState {
  let state = loadInitialState();

  // Pre-place assets
  for (const asset of fixtureB.inputs.pre_placed_assets) {
    state = queueAction(state, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
  }

  // Advance to 2028
  while (state.year < 2028) state = advanceYear(state);

  // Player sequence
  const seq = fixtureB.inputs.player_sequence;
  state = queueAction(state, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
  state = queueAction(state, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
  state = queueAction(state, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
  let s: EngineState;
  [s] = applyAction(state, seq[3].action, seq[3].geoid, seq[3].magnitude);
  [s] = applyAction(s, seq[4].action, seq[4].geoid, seq[4].magnitude);
  [s] = applyAction(s, seq[5].action, seq[5].geoid, seq[5].magnitude);
  state = queueAction(s, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

  // Advance to 2032
  while (state.year < 2032) state = advanceYear(state);

  return state;
}

describe('Golden C — Disturbance Under Load', () => {
  let baseState: EngineState;

  it('should build Golden B state, advance to 2033, add flex loads', () => {
    baseState = buildGoldenBState();

    // Advance to 2033
    baseState = advanceYear(baseState);
    expect(baseState.year).toBe(2033);

    // Add flexible loads (matching the Python fixture setup)
    const flexPlacements: [string, number][] = [
      ['56021', 200],
      ['56005', 100],
      ['56025', 100],
      ['56037', 100],
    ];
    for (const [geoid, mag] of flexPlacements) {
      [baseState] = applyAction(baseState, 'industrial_load_flexible', geoid, mag);
    }
  });

  it('should match final state digest md5 (pre-disturbance)', () => {
    const { md5 } = computeDigestMd5(baseState);
    expect(md5).toBe(fixtureC.final_state_digest.md5);
  });

  it('should produce matching severity results at all 3 levels', () => {
    const { severities, affected_geoids } = fixtureC.inputs;

    for (let i = 0; i < severities.length; i++) {
      const sev = severities[i];
      const expected = fixtureC.severity_results[i];

      const [, delta] = injectDisturbance(baseState, 'heat_wave', sev, affected_geoids);

      expect(
        relClose(delta.flexible_load_shed_mw, expected.flexible_load_shed_mw),
        `Severity ${sev}: flex_shed TS=${delta.flexible_load_shed_mw} PY=${expected.flexible_load_shed_mw}`
      ).toBe(true);

      expect(
        relClose(delta.firm_load_affected_mw, expected.firm_load_affected_mw),
        `Severity ${sev}: firm_affected TS=${delta.firm_load_affected_mw} PY=${expected.firm_load_affected_mw}`
      ).toBe(true);

      expect(
        relClose(delta.deficit_mw_change, expected.deficit_mw_change),
        `Severity ${sev}: deficit_change TS=${delta.deficit_mw_change} PY=${expected.deficit_mw_change}`
      ).toBe(true);

      expect(
        relClose(delta.reliability_score_change, expected.reliability_score_change),
        `Severity ${sev}: reliability_change TS=${delta.reliability_score_change} PY=${expected.reliability_score_change}`
      ).toBe(true);
    }
  });

  it('should have flex shedding at all severities (assertion 1)', () => {
    const { severities, affected_geoids } = fixtureC.inputs;
    for (const sev of severities) {
      const [, delta] = injectDisturbance(baseState, 'heat_wave', sev, affected_geoids);
      expect(delta.flexible_load_shed_mw).toBeGreaterThan(0);
    }
  });

  it('should have flex shed > firm affected at 1σ (assertion 2)', () => {
    const { affected_geoids } = fixtureC.inputs;
    const [, delta] = injectDisturbance(baseState, 'heat_wave', 1.0, affected_geoids);
    expect(delta.flexible_load_shed_mw).toBeGreaterThan(delta.firm_load_affected_mw);
  });

  it('should have deficit change monotonically increasing (assertion 3)', () => {
    const { severities, affected_geoids } = fixtureC.inputs;
    const changes: number[] = [];
    for (const sev of severities) {
      const [, delta] = injectDisturbance(baseState, 'heat_wave', sev, affected_geoids);
      changes.push(delta.deficit_mw_change);
    }
    expect(changes[0]).toBeLessThanOrEqual(changes[1]);
    expect(changes[1]).toBeLessThanOrEqual(changes[2]);
  });

  it('should have reliability change monotonically decreasing (assertion 4)', () => {
    const { severities, affected_geoids } = fixtureC.inputs;
    const changes: number[] = [];
    for (const sev of severities) {
      const [, delta] = injectDisturbance(baseState, 'heat_wave', sev, affected_geoids);
      changes.push(delta.reliability_score_change);
    }
    expect(changes[0]).toBeGreaterThanOrEqual(changes[1]);
    expect(changes[1]).toBeGreaterThanOrEqual(changes[2]);
  });
});
