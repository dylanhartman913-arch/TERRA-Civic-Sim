/** AG4 session wiring: deterministic drought, lens modulation, and .terra persistence. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agDigest } from '../../src/engine/engine.js';
import { applySessionDrought } from '../../src/engine/session_drought.js';
import { computeReplayDigest, replayScenario } from '../../src/engine/replay.js';
import { exportToJson, importFromJson } from '../../src/engine/persistence.js';
import type { ActionLibrary, CountyEESBaseline, CrosswalkRow, EngineState, FiscalBaseline, FiscalCoefficients, InitialNetwork, ScenarioFile, SessionConfig } from '../../src/engine/types.js';
import { loadInitialStateWithAnchorsAndTags } from './helpers.js';
import { detectAutoPause } from '../../src/state/store.js';
import { loadFixture } from './helpers.js';

const ROOT = resolve(__dirname, '../..');
const config = JSON.parse(readFileSync(
  resolve(ROOT, 'src/data/session-configs/ranch-country-2040.json'), 'utf-8',
)) as SessionConfig;
const ranchGolden = loadFixture('golden_ranch_country_2040') as {
  digests: { replay_digest: string; ag_digest_md5: string };
};

function atYear(year: number) {
  const state = loadInitialStateWithAnchorsAndTags();
  state.year = year;
  return state;
}

describe('AG4 Ranch Country drought session', () => {
  it('uses the Ranch Country config flags and annotation prompts', () => {
    expect(config.ag_category).toBe(true);
    expect(config.drought).toBe(true);
    expect(config.fixed_seed).toBeTypeOf('number');
    expect(config.annotation_prompts).toContainEqual({ trigger: 'drought_onset', prompt: 'How are you responding?' });
    expect(config.annotation_prompts).toContainEqual({ trigger: 'irrigated_conversion', prompt: 'Why here?' });
  });

  it('produces the identical AG drought result for a fixed seed', () => {
    const [a, eventsA] = applySessionDrought(atYear(2040), config.fixed_seed!, 'ssp370');
    const [b, eventsB] = applySessionDrought(atYear(2040), config.fixed_seed!, 'ssp370');
    expect(eventsA).toEqual(eventsB);
    expect(agDigest(a).md5).toBe(agDigest(b).md5);
  });

  it('modulates drought under an SSP lens', () => {
    let modulated = false;
    let droughtEventCount = 0;
    for (let year = 2026; year <= 2050; year++) {
      const [, ssp245Events] = applySessionDrought(atYear(year), config.fixed_seed!, 'ssp245');
      const [, ssp370Events] = applySessionDrought(atYear(year), config.fixed_seed!, 'ssp370');
      droughtEventCount += ssp370Events.length;
      if (ssp245Events.length > 0 && ssp370Events.length > 0
        && ssp245Events.some(event => {
          const matchingSsp = ssp370Events.find(sspEvent => sspEvent.geoid === event.geoid);
          return matchingSsp?.projection_factor_ppm !== event.projection_factor_ppm;
        })) {
        modulated = true;
        break;
      }
    }
    expect(modulated, `sampled Wyoming drought events: ${droughtEventCount}`).toBe(true);
  });

  it('keeps drought session settings and annotations through export/import and replay', () => {
    const baseFile: ScenarioFile = {
      schema_version: '3.1', terra_version: '1.0', exported_at: '2026-01-01T00:00:00.000Z',
      name: 'Ranch Country gate', gameSeed: config.fixed_seed!, start_year: 2025,
      activeScenario: null, actionLog: [], eventHistory: [], year_reached: 2040,
      replay_digest: '', climate_lens: 'ssp370', session_config: config,
      session_meta: { session_code: config.session_code, participant_label: 'Gate', started_at: '2026-01-01T00:00:00.000Z', app_version: '1.0' },
      annotations: [{ id: 'ann-1', year: 2030, trigger_type: 'drought_onset', trigger_id: 'drought', prompt: 'How are you responding?', text: 'Water plan.', timestamp: 1 }],
    };
    const before = replayScenario(baseFile, ...replayInputs());
    // Assert against the frozen golden fixture (not self-referential).
    expect(computeReplayDigest(before, baseFile.climate_lens)).toBe(ranchGolden.digests.replay_digest);
    expect(agDigest(before).md5).toBe(ranchGolden.digests.ag_digest_md5);
    // Round-trip: verify export/import is stable.
    const file = { ...baseFile, replay_digest: ranchGolden.digests.replay_digest };
    const imported = importFromJson(exportToJson(file));
    expect(imported?.session_config?.drought).toBe(true);
    expect(imported?.annotations).toEqual(file.annotations);
    const after = replayScenario(imported!, ...replayInputs());
    expect(computeReplayDigest(after, imported?.climate_lens)).toBe(ranchGolden.digests.replay_digest);
    expect(agDigest(after).md5).toBe(ranchGolden.digests.ag_digest_md5);
  });

  it('replays the Ranch Country base scenario without AG4 drought effects when AG flags are off', () => {
    const droughtEnabledFile: ScenarioFile = {
      schema_version: '3.1', terra_version: '1.0', exported_at: '2026-01-01T00:00:00.000Z',
      name: config.title, gameSeed: config.fixed_seed!, start_year: 2025, activeScenario: null,
      actionLog: [], eventHistory: [], year_reached: config.max_year!, replay_digest: '',
      climate_lens: config.climate_lens, session_config: config,
    };
    const energyOnlyConfig: SessionConfig = { ...config, ag_category: false, drought: false };
    const energyOnlyFile: ScenarioFile = { ...droughtEnabledFile, session_config: energyOnlyConfig };

    const droughtEnabledState = replayScenario(droughtEnabledFile, ...replayInputs());
    const energyOnlyState = replayScenario(energyOnlyFile, ...replayInputs());

    expect(droughtEnabledState.year).toBe(config.max_year);
    expect(Object.keys(energyOnlyState.county_ag)).not.toEqual([]);
    expect(Object.values(droughtEnabledState.county_ag).some(ag => ag.drought_events.length > 0)).toBe(true);
    expect(Object.values(energyOnlyState.county_ag).every(ag => ag.drought_events.length === 0)).toBe(true);
    // Pre-AG4 baseline for Ranch Country's identical base replay with AG flags disabled.
    expect(computeReplayDigest(energyOnlyState, energyOnlyFile.climate_lens)).toBe('3fa8757964e2d10ff60a00556fe7c613');
    expect(agDigest(energyOnlyState).md5).toBe('756ec0d2d5ddf481be1331a48b38a1cb');
    // Drought-enabled state asserts against the frozen golden fixture.
    expect(computeReplayDigest(droughtEnabledState, droughtEnabledFile.climate_lens)).toBe(ranchGolden.digests.replay_digest);
    expect(agDigest(droughtEnabledState).md5).toBe(ranchGolden.digests.ag_digest_md5);
  });
});

describe('detectAutoPause — drought_onset and irrigated_conversion paths', () => {
  /** Minimal EngineState stub covering only the fields detectAutoPause reads. */
  function baseState(countyAg: Record<string, {
    county_name: string;
    drought: { years_remaining: number };
    land_acres: { irrigated_crop: number };
  }>): EngineState {
    return {
      year: 2030,
      build_queue: [],
      active_couplings: [],
      bus_state: {},
      action_library: { actions: {} },
      county_ag: countyAg,
    } as unknown as EngineState;
  }

  it('fires drought_onset when drought begins in a county', () => {
    const prev = baseState({ '56025': { county_name: 'Natrona', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 5000 } } });
    const next = baseState({ '56025': { county_name: 'Natrona', drought: { years_remaining: 2 }, land_acres: { irrigated_crop: 5000 } } });
    expect(detectAutoPause(prev, next, [], [], [])).toEqual({
      reason: 'drought_onset',
      detail: 'Drought conditions begin in Natrona',
    });
  });

  it('fires irrigated_conversion when irrigated acreage decreases', () => {
    const prev = baseState({ '56013': { county_name: 'Fremont', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 12000 } } });
    const next = baseState({ '56013': { county_name: 'Fremont', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 11500 } } });
    expect(detectAutoPause(prev, next, [], [], [])).toEqual({
      reason: 'irrigated_conversion',
      detail: 'Irrigated land converted in Fremont',
    });
  });

  it('does NOT fire on unrelated state changes (irrigated acreage stable, drought continues)', () => {
    // drought already ongoing (years_remaining > 0 in both) — onset already fired last year
    const prev = baseState({ '56025': { county_name: 'Natrona', drought: { years_remaining: 1 }, land_acres: { irrigated_crop: 5000 } } });
    const next = baseState({ '56025': { county_name: 'Natrona', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 5000 } } });
    expect(detectAutoPause(prev, next, [], [], [])).toBeNull();
  });

  it('does NOT fire irrigated_conversion when irrigated acreage is unchanged', () => {
    const prev = baseState({ '56013': { county_name: 'Fremont', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 12000 } } });
    const next = baseState({ '56013': { county_name: 'Fremont', drought: { years_remaining: 0 }, land_acres: { irrigated_crop: 12000 } } });
    expect(detectAutoPause(prev, next, [], [], [])).toBeNull();
  });
});

function replayInputs() {
  const data = resolve(ROOT, 'src/data');
  return [
    JSON.parse(readFileSync(resolve(data, 'county_ees_baseline.json'), 'utf-8')) as CountyEESBaseline[],
    JSON.parse(readFileSync(resolve(data, 'county_crosswalk.json'), 'utf-8')) as CrosswalkRow[],
    JSON.parse(readFileSync(resolve(data, 'action_library_v3.json'), 'utf-8')) as ActionLibrary,
    JSON.parse(readFileSync(resolve(data, 'initial_network.json'), 'utf-8')) as InitialNetwork,
    JSON.parse(readFileSync(resolve(data, 'county_cards.json'), 'utf-8')) as Record<string, unknown>,
    JSON.parse(readFileSync(resolve(data, 'fiscal_baseline.json'), 'utf-8')) as FiscalBaseline,
    JSON.parse(readFileSync(resolve(data, 'fiscal_coefficients.json'), 'utf-8')) as FiscalCoefficients,
  ] as const;
}
