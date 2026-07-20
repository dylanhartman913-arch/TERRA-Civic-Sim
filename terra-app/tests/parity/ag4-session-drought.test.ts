/** AG4 session wiring: deterministic drought, lens modulation, and .terra persistence. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agDigest } from '../../src/engine/engine.js';
import { applySessionDrought } from '../../src/engine/session_drought.js';
import { computeReplayDigest, replayScenario } from '../../src/engine/replay.js';
import { exportToJson, importFromJson } from '../../src/engine/persistence.js';
import type { ActionLibrary, CountyEESBaseline, CrosswalkRow, InitialNetwork, ScenarioFile, SessionConfig } from '../../src/engine/types.js';
import { loadInitialStateWithAnchorsAndTags } from './helpers.js';

const ROOT = resolve(__dirname, '../..');
const config = JSON.parse(readFileSync(
  resolve(ROOT, 'src/data/session-configs/ranch-country-2040.json'), 'utf-8',
)) as SessionConfig;

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
    const file = { ...baseFile, replay_digest: computeReplayDigest(before, baseFile.climate_lens) };
    const imported = importFromJson(exportToJson(file));
    expect(imported?.session_config?.drought).toBe(true);
    expect(imported?.annotations).toEqual(file.annotations);
    const after = replayScenario(imported!, ...replayInputs());
    expect(computeReplayDigest(after, imported?.climate_lens)).toBe(file.replay_digest);
    expect(agDigest(after).md5).toBe(agDigest(before).md5);
  });

  it('leaves an energy-only replay digest unchanged when drought is omitted', () => {
    const file: ScenarioFile = {
      schema_version: '3.1', terra_version: '1.0', exported_at: '2026-01-01T00:00:00.000Z',
      name: 'Energy only', gameSeed: 42, start_year: 2025, activeScenario: null,
      actionLog: [], eventHistory: [], year_reached: 2030, replay_digest: '', climate_lens: 'historical',
    };
    const stateBefore = replayScenario(file, ...replayInputs());
    const stateAfter = replayScenario({ ...file, session_config: undefined }, ...replayInputs());
    expect(computeReplayDigest(stateAfter)).toBe(computeReplayDigest(stateBefore));
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
  ] as const;
}
