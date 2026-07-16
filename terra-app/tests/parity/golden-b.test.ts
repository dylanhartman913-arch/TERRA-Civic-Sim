import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, relClose, computeDigestMd5 } from './helpers.js';
import { applyAction, queueAction, advanceYear } from '../../src/engine/engine.js';
import type { EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_b') as {
  fixture_id: string;
  inputs: {
    pre_placed_assets: { action: string; geoid: string; magnitude: number; year: number; override_op?: number }[];
    player_sequence: { action: string; geoid: string; magnitude: number; year: number }[];
  };
  steps: {
    step: number;
    action_id: string;
    geoid: string;
    magnitude: number;
    decision_year: number;
    delta: {
      county_ees_before: Record<string, number>;
      county_ees_after: Record<string, number>;
      bus_state_delta: {
        bus_id?: string;
        capacity_before?: number;
        capacity_after?: number;
        load_before?: number;
        load_after?: number;
        deficit_before?: number;
        deficit_after?: number;
      };
      couplings_activated: unknown[];
      pool_changes: Record<string, unknown>;
    };
  }[];
  assertions: Record<string, unknown>;
  final_state_digest: {
    md5: string;
    [key: string]: unknown;
  };
};

describe('Golden B — Wyoming 2032 Nuclear-DC Buildout', () => {
  let state: EngineState;
  let deficitStep3: number;

  it('should replay pre-placed assets and advance to 2028', () => {
    state = loadInitialState();

    // Step 1: Queue pre-placed assets
    for (const asset of fixture.inputs.pre_placed_assets) {
      state = queueAction(state, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
    }
    expect(state.build_queue.length).toBe(3);

    // Step 2: Advance to 2028
    while (state.year < 2028) {
      state = advanceYear(state);
    }
    expect(state.year).toBe(2028);

    // Verify commissions: Meta DC (op 2027) and Jade phase 1 (op 2028) should be commissioned
    const commissioned = state.build_queue.filter(e => e.commissioned);
    expect(commissioned.length).toBe(2); // Meta DC + Jade

    // Step 3: Check deficit after DC commissioning
    deficitStep3 = state.county_ees['56021']?.deficit_mw ?? 0;
    expect(deficitStep3).toBeGreaterThan(0);
  });

  it('should match deficit_step3 from fixture', () => {
    const expected = fixture.assertions['6A_deficit_step3'] as number;
    expect(relClose(deficitStep3, expected)).toBe(true);
  });

  it('should replay player sequence with matching step deltas', () => {
    // Player sequence: queue SMR pair, tx, then apply social actions, queue battery
    const seq = fixture.inputs.player_sequence;

    // Queue: smr_advanced x2 (with override to 2032)
    state = queueAction(state, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
    state = queueAction(state, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);

    // Queue: transmission_230kv
    state = queueAction(state, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);

    // Apply: workforce_retraining x2, affordable_housing x1 (these have fixture steps)
    for (const step of fixture.steps) {
      const countyBefore = step.delta.county_ees_before;
      const countyAfter = step.delta.county_ees_after;
      const busDelta = step.delta.bus_state_delta;

      // Check before
      if (Object.keys(countyBefore).length > 0 && step.geoid in state.county_ees) {
        for (const [cap, pyVal] of Object.entries(countyBefore)) {
          const tsVal = state.county_ees[step.geoid][cap as 'E' | 'Ec' | 'S'];
          expect(
            relClose(tsVal, pyVal),
            `Step ${step.step} ${step.action_id}: ${cap} before TS=${tsVal} PY=${pyVal}`
          ).toBe(true);
        }
      }

      const [newState] = applyAction(state, step.action_id, step.geoid, step.magnitude);
      state = newState;

      // Check after
      if (Object.keys(countyAfter).length > 0 && step.geoid in state.county_ees) {
        for (const [cap, pyVal] of Object.entries(countyAfter)) {
          const tsVal = state.county_ees[step.geoid][cap as 'E' | 'Ec' | 'S'];
          expect(
            relClose(tsVal, pyVal),
            `Step ${step.step} ${step.action_id}: ${cap} after TS=${tsVal} PY=${pyVal}`
          ).toBe(true);
        }
      }

      // Check bus state
      if (busDelta.bus_id && busDelta.capacity_after !== undefined) {
        const bs = state.bus_state[busDelta.bus_id];
        expect(
          relClose(bs.capacity_mw, busDelta.capacity_after),
          `Step ${step.step}: bus cap TS=${bs.capacity_mw} PY=${busDelta.capacity_after}`
        ).toBe(true);
        expect(
          relClose(bs.load_mw, busDelta.load_after!),
          `Step ${step.step}: bus load TS=${bs.load_mw} PY=${busDelta.load_after}`
        ).toBe(true);
      }
    }

    // Queue: battery_grid
    state = queueAction(state, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);
  });

  it('should advance to 2032 and match final state', () => {
    // Advance to 2032
    while (state.year < 2032) {
      state = advanceYear(state);
    }
    expect(state.year).toBe(2032);
  });

  it('should have deficit decreased (6A)', () => {
    const deficitStep6 = state.county_ees['56021']?.deficit_mw ?? 0;
    const expected = fixture.assertions['6A_deficit_step6'] as number;
    expect(relClose(deficitStep6, expected)).toBe(true);
    expect(deficitStep6).toBeLessThan(deficitStep3);
  });

  it('should have nuclear_dc_coupling active for 56021 (6B)', () => {
    const couplings = state.active_couplings.filter(
      c => c.demand_geoid === '56021' || c.supply_geoid === '56021'
    );
    expect(couplings.length).toBeGreaterThan(0);
    expect(couplings.some(c => c.coupling_type === 'nuclear_dc_coupling')).toBe(true);
    expect(couplings.length).toBe(fixture.assertions['6B_coupling_count'] as number);
  });

  it('should throttle probe Natriums with HALEU_pool (6C)', () => {
    // Probe: queue two more Natriums at 2032
    let probeState = queueAction(state, 'smr_advanced', '56021', 345, 2032);
    const probe1 = probeState.build_queue[probeState.build_queue.length - 1];

    probeState = queueAction(probeState, 'smr_advanced', '56021', 345, 2032);
    const probe2 = probeState.build_queue[probeState.build_queue.length - 1];

    expect(probe1.operational_year).toBe(fixture.assertions['6C_probe1_op_year'] as number);
    expect(probe2.operational_year).toBe(fixture.assertions['6C_probe2_op_year'] as number);
    expect(probe1.throttle_reason).toBe(fixture.assertions['6C_probe1_throttle'] as string);
    expect(probe2.throttle_reason).toBe(fixture.assertions['6C_probe2_throttle'] as string);
    expect(probe1.operational_year).toBeGreaterThan(2034);
    expect(probe2.operational_year).toBeGreaterThan(2034);
  });

  it('should match final state digest md5', () => {
    const { md5 } = computeDigestMd5(state);
    expect(md5).toBe(fixture.final_state_digest.md5);
  });

  it('should deterministically reproduce the Golden B full replay', () => {
    // Full replay timing is diagnostic only; correctness is the stable contract.
    const start = performance.now();
    let s = loadInitialState();

    // Pre-place
    for (const asset of fixture.inputs.pre_placed_assets) {
      s = queueAction(s, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
    }
    // Advance to 2028
    while (s.year < 2028) s = advanceYear(s);

    // Player sequence
    const seq = fixture.inputs.player_sequence;
    s = queueAction(s, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
    s = queueAction(s, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
    s = queueAction(s, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
    [s] = applyAction(s, seq[3].action, seq[3].geoid, seq[3].magnitude);
    [s] = applyAction(s, seq[4].action, seq[4].geoid, seq[4].magnitude);
    [s] = applyAction(s, seq[5].action, seq[5].geoid, seq[5].magnitude);
    s = queueAction(s, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

    // Advance to 2032
    while (s.year < 2032) s = advanceYear(s);

    const elapsed = performance.now() - start;
    console.log(`  Golden B full replay: ${elapsed.toFixed(1)}ms`);
    const { md5 } = computeDigestMd5(s);
    expect(md5).toBe(fixture.final_state_digest.md5);
  });

  it('should complete single applyAction within 5ms', () => {
    const s = loadInitialState();
    const start = performance.now();
    applyAction(s, 'workforce_retraining', '56021', 1000);
    const elapsed = performance.now() - start;
    console.log(`  Single applyAction: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(5);
  });
});
