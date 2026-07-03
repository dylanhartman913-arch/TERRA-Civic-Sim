import { describe, it, expect } from 'vitest';
import { loadFixture, loadInitialState, relClose, computeDigestMd5 } from './helpers.js';
import { applyAction } from '../../src/engine/engine.js';
import type { EngineState } from '../../src/engine/types.js';

const fixture = loadFixture('golden_a') as {
  fixture_id: string;
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
  final_state_digest: {
    md5: string;
    [key: string]: unknown;
  };
};

describe('Golden A — NB11 13-action regression', () => {
  let state: EngineState;

  it('should replay all 13 steps with matching deltas', () => {
    state = loadInitialState();

    for (const step of fixture.steps) {
      const geoid = step.geoid;
      const countyBefore = step.delta.county_ees_before;
      const countyAfter = step.delta.county_ees_after;
      const busDelta = step.delta.bus_state_delta;

      // Check county EES before (if fixture recorded it)
      if (Object.keys(countyBefore).length > 0 && geoid in state.county_ees) {
        for (const [cap, pyVal] of Object.entries(countyBefore)) {
          const tsVal = state.county_ees[geoid][cap as 'E' | 'Ec' | 'S'];
          expect(
            relClose(tsVal, pyVal),
            `Step ${step.step} (${step.action_id}): ${cap} before: TS=${tsVal}, PY=${pyVal}`
          ).toBe(true);
        }
      }

      // Check bus state before (if fixture recorded it)
      if (busDelta.bus_id && busDelta.capacity_before !== undefined) {
        const bs = state.bus_state[busDelta.bus_id];
        if (bs) {
          expect(
            relClose(bs.capacity_mw, busDelta.capacity_before),
            `Step ${step.step}: bus ${busDelta.bus_id} capacity_before: TS=${bs.capacity_mw}, PY=${busDelta.capacity_before}`
          ).toBe(true);
          expect(
            relClose(bs.load_mw, busDelta.load_before!),
            `Step ${step.step}: bus ${busDelta.bus_id} load_before: TS=${bs.load_mw}, PY=${busDelta.load_before}`
          ).toBe(true);
        }
      }

      // Apply action
      const [newState] = applyAction(state, step.action_id, step.geoid, step.magnitude);
      state = newState;

      // Check county EES after (if fixture recorded it)
      if (Object.keys(countyAfter).length > 0 && geoid in state.county_ees) {
        for (const [cap, pyVal] of Object.entries(countyAfter)) {
          const tsVal = state.county_ees[geoid][cap as 'E' | 'Ec' | 'S'];
          expect(
            relClose(tsVal, pyVal),
            `Step ${step.step} (${step.action_id}): ${cap} after: TS=${tsVal}, PY=${pyVal}`
          ).toBe(true);
        }
      }

      // Check bus state after (if fixture recorded it)
      if (busDelta.bus_id && busDelta.capacity_after !== undefined) {
        const bs = state.bus_state[busDelta.bus_id];
        if (bs) {
          expect(
            relClose(bs.capacity_mw, busDelta.capacity_after),
            `Step ${step.step}: bus ${busDelta.bus_id} capacity_after: TS=${bs.capacity_mw}, PY=${busDelta.capacity_after}`
          ).toBe(true);
          expect(
            relClose(bs.load_mw, busDelta.load_after!),
            `Step ${step.step}: bus ${busDelta.bus_id} load_after: TS=${bs.load_mw}, PY=${busDelta.load_after}`
          ).toBe(true);
          expect(
            relClose(bs.deficit_mw, busDelta.deficit_after!),
            `Step ${step.step}: bus ${busDelta.bus_id} deficit_after: TS=${bs.deficit_mw}, PY=${busDelta.deficit_after}`
          ).toBe(true);
        }
      }
    }
  });

  it('should match final state digest md5', () => {
    const { md5 } = computeDigestMd5(state);
    const expected = fixture.final_state_digest.md5;
    expect(md5).toBe(expected);
  });
});
