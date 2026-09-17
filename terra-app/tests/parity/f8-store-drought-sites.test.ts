/**
 * F8-LIVE regression gate — session drought ordering at every store call site.
 *
 * Background: the S3 fix (adcd421) reordered applySessionDrought before
 * engineAdvanceYear in replay.ts and in the advanceYear store action, but left
 * three further sites in store.ts wrong. It went undetected for five sessions
 * because ag4-session-drought.test.ts exercises the engine, replay.ts and one
 * pure helper, and never constructs the Zustand store.
 *
 * This file closes that gap. It drives the STORE, not the engine.
 *
 * The oracle is the F8 bug signature itself: when drought is mis-ordered or
 * absent, the AG digest collapses to the energy-only value
 * 756ec0d2d5ddf481be1331a48b38a1cb. When drought is applied correctly it is the
 * frozen golden value 0c537942942e306a22f04bdc44418b07. Every assertion below
 * checks both directions, so a regression cannot pass by matching "something".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { agDigest } from '../../src/engine/engine.js';
import { computeReplayDigest, replayScenario } from '../../src/engine/replay.js';
import type {
  ActionLibrary, ActionLogEntry, CountyEESBaseline, CrosswalkRow, EngineState,
  FiscalBaseline, FiscalCoefficients, InitialNetwork, ScenarioFile, SessionConfig,
} from '../../src/engine/types.js';
import { useTerraStore } from '../../src/state/store.js';
import { loadFixture } from './helpers.js';

const ROOT = resolve(__dirname, '../..');

const config = JSON.parse(readFileSync(
  resolve(ROOT, 'src/data/session-configs/ranch-country-2040.json'), 'utf-8',
)) as SessionConfig;

const ranchGolden = loadFixture('golden_ranch_country_2040') as {
  digests: { replay_digest: string; ag_digest_md5: string };
};

/** AG digest when drought is correctly applied (frozen golden). */
const AG_WITH_DROUGHT = ranchGolden.digests.ag_digest_md5;
/** AG digest when drought is absent or mis-ordered — the F8 bug signature. */
const AG_ENERGY_ONLY = '756ec0d2d5ddf481be1331a48b38a1cb';

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

function droughtFile(overrides: Partial<ScenarioFile> = {}): ScenarioFile {
  return {
    schema_version: '3.1', terra_version: '1.0', exported_at: '2026-01-01T00:00:00.000Z',
    name: config.title, gameSeed: config.fixed_seed!, start_year: 2025, activeScenario: null,
    actionLog: [], eventHistory: [], year_reached: config.max_year!, replay_digest: '',
    climate_lens: config.climate_lens, session_config: config,
    ...overrides,
  };
}

function energyOnlyFile(): ScenarioFile {
  return droughtFile({ session_config: { ...config, ag_category: false, drought: false } });
}

function droughtCountyCount(state: EngineState): number {
  return Object.values(state.county_ag).filter(ag => ag.drought_events.length > 0).length;
}

describe('F8-LIVE — store.ts:1133 enterReplayMode applies drought before the year advance', () => {
  it('reproduces the engine path exactly, and is NOT the energy-only digest', () => {
    const file = droughtFile();
    useTerraStore.getState().enterReplayMode(file);
    const snaps = useTerraStore.getState().replaySnapshots;
    const final = snaps.get(file.year_reached);

    expect(final, `no snapshot at year_reached=${file.year_reached}`).toBeDefined();
    expect(final!.year).toBe(config.max_year);

    // Correct: matches the frozen golden.
    expect(agDigest(final!).md5).toBe(AG_WITH_DROUGHT);
    // Regression guard: pre-fix ordering collapses to the energy-only value.
    expect(agDigest(final!).md5).not.toBe(AG_ENERGY_ONLY);

    // Dual-path identity against the known-correct engine path.
    const viaEngine = replayScenario(file, ...replayInputs());
    expect(agDigest(final!).md5).toBe(agDigest(viaEngine).md5);
    expect(computeReplayDigest(final!, file.climate_lens))
      .toBe(computeReplayDigest(viaEngine, file.climate_lens));
  });

  it('records drought events in the replay snapshots, not just at the end', () => {
    const file = droughtFile();
    useTerraStore.getState().enterReplayMode(file);
    const snaps = useTerraStore.getState().replaySnapshots;

    // Drought must be visible mid-trajectory — this is what scrubbing shows.
    const midYears = [...snaps.keys()].filter(y => y > file.start_year && y < file.year_reached);
    const anyMidDrought = midYears.some(y => droughtCountyCount(snaps.get(y)!) > 0);
    expect(anyMidDrought, 'no mid-trajectory snapshot carries drought events').toBe(true);
  });

  it('applies no drought when the session config has drought off', () => {
    const file = energyOnlyFile();
    useTerraStore.getState().enterReplayMode(file);
    const final = useTerraStore.getState().replaySnapshots.get(file.year_reached)!;
    expect(agDigest(final).md5).toBe(AG_ENERGY_ONLY);
    expect(droughtCountyCount(final)).toBe(0);
  });
});

describe('F8-LIVE — store.ts:261 computeTrajectory (comparison mode) honors session drought', () => {
  beforeEach(() => {
    useTerraStore.setState({ comparisonFiles: [null, null], comparisonTrajectories: [null, null] });
  });

  /**
   * KNOWN COVERAGE LIMITATION — read before adding assertions here.
   *
   * computeTrajectory now applies session drought (store.ts:261), matching
   * replay.ts. But `Trajectory` carries only years / E / Ec / S /
   * material_ledger / quest_conditions / events — it has NO ag field, and
   * session drought does not move E, Ec or S. Measured on the Ranch Country
   * 2040 scenario, drought-on vs drought-off:
   *
   *     ag_digest  0c537942942e306a22f04bdc44418b07  vs  756ec0d2d5ddf481be1331a48b38a1cb
   *     E          3.1034                            ==  3.1034
   *     Ec         6.9341                            ==  6.9341
   *     S          5.2725                            ==  5.2725
   *     counties with drought events: 23
   *
   * So the drought fix at this site is real in the state computeTrajectory
   * builds, but invisible in what it returns. This test therefore CANNOT
   * distinguish fixed from broken code, and no honest assertion here can until
   * Trajectory carries an ag observable. Tracked as B-11.
   *
   * The assertion below pins the measured fact so that if E/Ec/S ever DO become
   * drought-sensitive, this test fails and forces a real regression gate to be
   * written rather than silently gaining coverage nobody verified.
   */
  it('documents that E/Ec/S are drought-insensitive, so this site has no regression gate', () => {
    const store = useTerraStore.getState();
    store.loadComparisonFile(0, droughtFile());
    store.loadComparisonFile(1, energyOnlyFile());

    const [withDrought, withoutDrought] = useTerraStore.getState().comparisonTrajectories;
    expect(withDrought).not.toBeNull();
    expect(withoutDrought).not.toBeNull();
    expect(withDrought!.years).toEqual(withoutDrought!.years);

    const differs = withDrought!.E.some((v, i) => v !== withoutDrought!.E[i])
      || withDrought!.Ec.some((v, i) => v !== withoutDrought!.Ec[i])
      || withDrought!.S.some((v, i) => v !== withoutDrought!.S[i]);
    expect(
      differs,
      'E/Ec/S became drought-sensitive — replace this test with a real regression gate (B-11)',
    ).toBe(false);
  });

  it('is deterministic for a fixed seed', () => {
    const store = useTerraStore.getState();
    store.loadComparisonFile(0, droughtFile());
    const first = useTerraStore.getState().comparisonTrajectories[0]!;
    store.loadComparisonFile(1, droughtFile());
    const second = useTerraStore.getState().comparisonTrajectories[1]!;
    expect(first.E).toEqual(second.E);
    expect(first.Ec).toEqual(second.Ec);
    expect(first.S).toEqual(second.S);
  });
});

describe('F8-LIVE — store.ts:197 replayLog (undo) re-applies drought during reconstruction', () => {
  const WY_GEOID = '56013'; // Fremont

  function seedSession(log: ActionLogEntry[]) {
    useTerraStore.setState({
      actionLog: log,
      yearSnapshots: new Map<number, EngineState>(),
      redoStack: [],
      sessionConfig: config,
      gameSeed: config.fixed_seed!,
      climateLens: 'ssp370',
    });
  }

  function entry(year: number): ActionLogEntry {
    return {
      type: 'apply', actionId: 'wind_utility', geoid: WY_GEOID,
      magnitude: 1, year, timestamp: year,
    } as ActionLogEntry;
  }

  it('reconstructs a drought-affected state when undoing across advanced years', () => {
    seedSession([entry(2030), entry(2035)]);
    useTerraStore.getState().undoAction();

    const state = useTerraStore.getState().engineState;
    // Undo replays to the first entry's year, advancing 2025 -> 2030.
    expect(state.year).toBe(2030);
    // Those five advanced years must carry drought. Pre-fix: zero.
    expect(droughtCountyCount(state), 'undo reconstruction dropped all drought events').toBeGreaterThan(0);
  });

  it('reconstructs without drought when the session has drought off', () => {
    seedSession([entry(2030), entry(2035)]);
    useTerraStore.setState({ sessionConfig: { ...config, ag_category: false, drought: false } });
    useTerraStore.getState().undoAction();

    const state = useTerraStore.getState().engineState;
    expect(state.year).toBe(2030);
    expect(droughtCountyCount(state)).toBe(0);
  });

  it('is deterministic — undoing the same log twice yields the same AG digest', () => {
    seedSession([entry(2030), entry(2035)]);
    useTerraStore.getState().undoAction();
    const first = agDigest(useTerraStore.getState().engineState).md5;

    seedSession([entry(2030), entry(2035)]);
    useTerraStore.getState().undoAction();
    const second = agDigest(useTerraStore.getState().engineState).md5;

    expect(first).toBe(second);
  });
});
