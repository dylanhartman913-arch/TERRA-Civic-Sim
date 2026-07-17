/** Discriminating C4-ii consequence and adaptation boundary tests. */

import { describe, expect, it } from 'vitest';
import {
  CLIMATE_ADAPTATION_WRITABLE_FIELDS,
  applyAction,
  applyHazardEventConsequences,
  sampleHazardEvents,
} from '../../src/engine/engine.js';
import type {
  ActionRecord,
  ClimateContext,
  ClimateHazardEvent,
  ClimateHazardSamplingInput,
  EngineState,
} from '../../src/engine/types.js';
import { computeDigestMd5, loadInitialStateWithAnchorsAndTags } from './helpers.js';

function event(
  hazard_kind: ClimateHazardEvent['hazard_kind'] = 'heat_wave',
  severity_milli = 2_000,
): ClimateHazardEvent {
  return {
    event_id: `c4ii:ssp370:42:2026:56037:${hazard_kind}`,
    year: 2026,
    geoid: '56037',
    hazard_kind,
    severity_milli,
    annual_probability_ppm: 500_000,
    baseline_frequency_micros: 1_000_000,
    projection_factor_ppm: 1_000_000,
    lens: 'ssp370',
    seed: 42,
    consequence_multiplier_ppm: 0,
  };
}

const syntheticSamplingInput: ClimateHazardSamplingInput = {
  seed: 42,
  lens: 'ssp370',
  years: [2026],
  countyBaselines: [{
    geoid: '56037',
    heat_wave_frequency: 100,
    heat_wave_risk_score: 50,
    wildfire_frequency: 100,
    wildfire_risk_score: 50,
    drought_frequency: 100,
    drought_risk_score: 50,
    severe_storm_frequency: 100,
    severe_storm_risk_score: 50,
  }],
  projectionPoints: [],
};

describe('C4-ii consequence coupling', () => {
  it('AC1: heat delegates to the existing handler and C2 tags include F1 anchors', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const before = computeDigestMd5(state).md5;
    const [coupled, outcomes] = applyHazardEventConsequences(state, [event()]);

    expect(computeDigestMd5(state).md5).toBe(before);
    expect(outcomes[0].status).toBe('applied_existing_handler');
    expect(outcomes[0].handler).toBe('inject_disturbance');
    expect(outcomes[0].delta?.disturbance_type).toBe('heat_wave');
    expect(outcomes[0].victim_asset_ids.some((id) => id.startsWith('anchor_56037_'))).toBe(true);
    expect(coupled.disturbance_history.at(-1)?.disturbance_type).toBe('heat_wave');
    expect(computeDigestMd5(coupled).md5).not.toBe(before);
  });

  it('AC1: unsupported hazards are explicit skips and do not create state mechanics', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const before = computeDigestMd5(state).md5;
    const [skipped, outcomes] = applyHazardEventConsequences(
      state,
      [event('wildfire_smoke_proximity')],
    );

    expect(outcomes[0].status).toBe('skipped_no_existing_handler');
    expect(outcomes[0].handler).toBeNull();
    expect(outcomes[0].victim_asset_ids.length).toBeGreaterThan(0);
    expect(outcomes[0].reason).toContain('no existing derate/outage/damage handler');
    expect(skipped).toBe(state);
    expect(computeDigestMd5(skipped).md5).toBe(before);
    expect((skipped as unknown as Record<string, unknown>).climate_damage).toBeUndefined();
    expect((skipped as unknown as Record<string, unknown>).climate_outages).toBeUndefined();
  });

  it('AC2: adaptation has a structural asset-field allowlist and rejects hazard-input keys', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const action = state.action_library.actions.heat_resilience_upgrade;
    expect(CLIMATE_ADAPTATION_WRITABLE_FIELDS).toEqual(['climate_vulnerability_ppm']);
    expect(action.climate_adaptation?.writable_asset_field).toBe('climate_vulnerability_ppm');

    const poisonedEffect = {
      ...action.climate_adaptation,
      climate_context: { lens: 'ssp370', tables: {} },
    } as unknown as NonNullable<ActionRecord['climate_adaptation']>;
    const poisoned: EngineState = {
      ...state,
      action_library: {
        ...state.action_library,
        actions: {
          ...state.action_library.actions,
          heat_resilience_upgrade: { ...action, climate_adaptation: poisonedEffect },
        },
      },
    };
    expect(() => applyAction(poisoned, 'heat_resilience_upgrade', '56037', 1))
      .toThrow(/cannot write 'climate_context'/);
  });

  it('AC2: adaptation changes vulnerability only; sampling and climate context stay exogenous', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const rawBefore = sampleHazardEvents(state, syntheticSamplingInput);
    const climateContext: ClimateContext = Object.freeze({
      lens: 'ssp370',
      tables: Object.freeze({ sentinel: Object.freeze({}) }),
    });
    const contextBefore = JSON.stringify(climateContext);

    const [adapted, delta] = applyAction(
      state,
      'heat_resilience_upgrade',
      '56037',
      1,
      false,
      climateContext,
    );

    expect(sampleHazardEvents(adapted, syntheticSamplingInput)).toEqual(rawBefore);
    expect(JSON.stringify(climateContext)).toBe(contextBefore);
    expect(delta.adaptation_delta?.affected_asset_ids.length).toBeGreaterThan(0);
    const affected = new Set(delta.adaptation_delta?.affected_asset_ids);
    expect(adapted.asset_registry
      .filter((asset) => affected.has(asset.asset_id))
      .every((asset) => asset.climate_vulnerability_ppm?.heat_wave === 500_000))
      .toBe(true);

    const [, baselineOutcomes] = applyHazardEventConsequences(state, [event()]);
    const [, adaptedOutcomes] = applyHazardEventConsequences(adapted, [event()]);
    expect(adaptedOutcomes[0].consequence_multiplier_ppm)
      .toBeLessThan(baselineOutcomes[0].consequence_multiplier_ppm);
  });

  it('normalization caps severity at the documented existing-handler ceiling', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const [atCeiling] = applyHazardEventConsequences(state, [event('heat_wave', 3_000)]);
    const [overCeiling] = applyHazardEventConsequences(state, [event('heat_wave', 9_000)]);
    expect(computeDigestMd5(atCeiling).md5).toBe(computeDigestMd5(overCeiling).md5);
  });

  it('rejects a pre-coupled event instead of double-applying it', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const preCoupled = {
      ...event(),
      consequence_multiplier_ppm: 500_000,
    } as unknown as ClimateHazardEvent;
    expect(() => applyHazardEventConsequences(state, [preCoupled]))
      .toThrow(/inert consequence multiplier/);
  });

  it('AC6: adaptation price is explicitly flagged', () => {
    const action = loadInitialStateWithAnchorsAndTags()
      .action_library.actions.heat_resilience_upgrade;
    expect([action.cost_2024, action.cost_2035, action.cost_2050]).toEqual([0, 0, 0]);
    expect(action.confidence).toBe('flagged');
    expect(action.cost_source).toMatch(/^FLAGGED/);
  });
});
