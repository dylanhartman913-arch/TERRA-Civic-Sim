/**
 * B-11 regression gate — comparison mode (computeTrajectory) honours session
 * drought, and that is now OBSERVABLE in what it returns.
 *
 * Background: S16a (016b36f) made computeTrajectory apply session drought
 * before engineAdvanceYear, but Trajectory carried only E / Ec / S (which
 * drought does not move), so the fix could not be distinguished from its
 * absence (see f8-store-drought-sites.test.ts, "KNOWN COVERAGE LIMITATION").
 * W7-F1 added the optional `Trajectory.ag` field: per-year forage index per
 * county (via getCountyAg) plus the drought events applied.
 *
 * These assertions are discriminating: with the applySessionDrought call
 * removed from computeTrajectory, the ON-vs-OFF and engine-path tests fail.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCountyAg } from '../../src/engine/engine.js';
import { replayScenario } from '../../src/engine/replay.js';
import type {
  ActionLibrary, CountyEESBaseline, CrosswalkRow, FiscalBaseline,
  FiscalCoefficients, InitialNetwork, ScenarioFile, SessionConfig, Trajectory,
  TrajectoryAg,
} from '../../src/engine/types.js';
import { useTerraStore } from '../../src/state/store.js';

const ROOT = resolve(__dirname, '../..');

const config = JSON.parse(readFileSync(
  resolve(ROOT, 'src/data/session-configs/ranch-country-2040.json'), 'utf-8',
)) as SessionConfig;

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

function scenarioFile(overrides: Partial<SessionConfig> = {}): ScenarioFile {
  return {
    schema_version: '3.1', terra_version: '1.0', exported_at: '2026-01-01T00:00:00.000Z',
    name: config.title, gameSeed: config.fixed_seed!, start_year: 2025, activeScenario: null,
    actionLog: [], eventHistory: [], year_reached: config.max_year!, replay_digest: '',
    climate_lens: config.climate_lens, session_config: { ...config, ...overrides },
  };
}

const droughtOn = () => scenarioFile();
const droughtOff = () => scenarioFile({ drought: false });
const energyOnly = () => scenarioFile({ ag_category: false, drought: false });

function trajectoryOf(file: ScenarioFile, slot: 0 | 1 = 0): Trajectory {
  useTerraStore.getState().loadComparisonFile(slot, file);
  const traj = useTerraStore.getState().comparisonTrajectories[slot];
  expect(traj, 'computeTrajectory returned null').not.toBeNull();
  expect(traj!.ag, 'Trajectory.ag missing').toBeDefined();
  return traj!;
}

describe('B-11 — comparison-mode drought is observable in Trajectory.ag', () => {
  beforeEach(() => {
    useTerraStore.setState({ comparisonFiles: [null, null], comparisonTrajectories: [null, null] });
  });

  it('is shape-aligned with years and covers the run\'s counties', () => {
    const traj = trajectoryOf(droughtOn());
    expect(config.drought).toBe(true); // precondition: the fixture session has drought on
    expect(traj.ag!.forage_index_by_year.length).toBe(traj.years.length);
    for (const snap of traj.ag!.forage_index_by_year) {
      expect(Object.keys(snap).length).toBeGreaterThan(0);
    }
  });

  it('drought ON vs OFF — the ag field differs (forage index and events)', () => {
    const on = trajectoryOf(droughtOn(), 0);
    const off = trajectoryOf(droughtOff(), 1);

    expect(on.years).toEqual(off.years);
    // Events: ON applied some, OFF applied none.
    expect(on.ag!.drought_events.length, 'drought ON applied no drought events').toBeGreaterThan(0);
    expect(off.ag!.drought_events).toEqual([]);
    // Forage index: at least one county-year differs, and the trajectories
    // as a whole are not equal.
    const forageDiffers = on.ag!.forage_index_by_year.some((snap, i) =>
      Object.keys(snap).some(g => snap[g] !== off.ag!.forage_index_by_year[i][g]));
    expect(forageDiffers, 'forage index identical with drought on and off').toBe(true);
    expect(on.ag).not.toEqual(off.ag);
  });

  it('drought ON matches the known-correct engine path (replay.ts) at the final year', () => {
    const on = trajectoryOf(droughtOn());
    const viaEngine = replayScenario(droughtOn(), ...replayInputs());
    expect(viaEngine.year).toBe(on.years[on.years.length - 1]);

    const engineForage: Record<string, number> = {};
    const engineEvents: TrajectoryAg['drought_events'] = [];
    for (const geoid of Object.keys(viaEngine.county_ag).sort()) {
      const ag = getCountyAg(viaEngine, geoid);
      if (ag) engineForage[ag.geoid] = ag.levels.forage_aum.index;
      for (const evt of viaEngine.county_ag[geoid].drought_events) engineEvents.push({ geoid, ...evt });
    }
    expect(on.ag!.forage_index_by_year[on.ag!.forage_index_by_year.length - 1]).toEqual(engineForage);
    expect(on.ag!.drought_events).toEqual(engineEvents);
  });

  it('drought OFF is identical to an energy-only run (whole trajectory)', () => {
    const off = trajectoryOf(droughtOff(), 0);
    const energy = trajectoryOf(energyOnly(), 1);
    expect(off).toEqual(energy);
  });

  it('is deterministic — same seed twice yields an identical trajectory', () => {
    const first = trajectoryOf(droughtOn(), 0);
    const second = trajectoryOf(droughtOn(), 1);
    expect(first).not.toBe(second); // two independent computations, not one object
    expect(first).toEqual(second);
  });
});
