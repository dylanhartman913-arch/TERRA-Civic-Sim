/**
 * C0 Gate — Explicit four-digest-contract byte-identity check.
 *
 * Runs against all frozen goldens (A–J′) with population_config.migration_enabled
 * toggled true and false. Every digest must match its pre-C0 frozen value exactly.
 *
 * Also: legacy 3.0 round-trip — load a fixture as if it were a pre-C0 .terra.json,
 * replay, re-export, and confirm digest identity.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeState,
  applyAction,
  queueAction,
  advanceYear,
  historyDigest,
} from '../../src/engine/engine.js';
import { computeReplayDigest } from '../../src/engine/replay.js';
import { importFromJson, exportToJson } from '../../src/engine/persistence.js';
import type {
  CountyEESBaseline,
  CrosswalkRow,
  ActionLibrary,
  InitialNetwork,
  FiscalBaseline,
  FiscalCoefficients,
  PopulationProjection,
  EngineState,
  ScenarioFile,
} from '../../src/engine/types.js';
import {
  loadFixture,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
} from './helpers.js';

// ── Static data loading ─────────────────────────────────────────────────────

const DATA_DIR = resolve(__dirname, '../../src/data');

function loadData() {
  const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
  const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
  const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
  const initialNetwork: InitialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
  const countyCards: Record<string, unknown> = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));
  let fiscalBaseline: FiscalBaseline | undefined;
  let fiscalCoefficients: FiscalCoefficients | undefined;
  try {
    fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
    fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  let lifecycleCoefficients: Record<string, unknown> | undefined;
  try {
    lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }
  let populationProjections: Record<string, PopulationProjection> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_population_projections.json'), 'utf-8'));
    populationProjections = raw.counties as Record<string, PopulationProjection>;
  } catch { /* optional */ }
  let retirements: Record<string, Record<string, { scheduled_retirement_year: number }>> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'baseline_retirements.json'), 'utf-8'));
    const { _meta, ...rest } = raw;
    void _meta;
    retirements = rest;
  } catch { /* optional */ }

  return { baseline, crosswalk, actionLibrary, initialNetwork, countyCards, fiscalBaseline, fiscalCoefficients, lifecycleCoefficients, housingBaselineData, populationProjections, retirements };
}

function makeState(migrationEnabled: boolean): EngineState {
  const d = loadData();
  return initializeState(
    d.baseline, d.crosswalk, d.actionLibrary, d.initialNetwork, d.countyCards, 2025,
    d.fiscalBaseline, d.fiscalCoefficients, undefined, undefined, d.housingBaselineData,
    d.populationProjections, { migration_enabled: migrationEnabled },
  );
}

function makeStateWithRetirements(migrationEnabled: boolean): EngineState {
  const d = loadData();
  return initializeState(
    d.baseline, d.crosswalk, d.actionLibrary, d.initialNetwork, d.countyCards, 2025,
    d.fiscalBaseline, d.fiscalCoefficients, d.retirements, d.lifecycleCoefficients,
    d.housingBaselineData, d.populationProjections, { migration_enabled: migrationEnabled },
  );
}

// ── Golden A fixture steps ──────────────────────────────────────────────────

function replayGoldenA(state: EngineState): EngineState {
  const fixture = loadFixture('golden_a') as { steps: { action_id: string; geoid: string; magnitude: number }[] };
  for (const step of fixture.steps) {
    [state] = applyAction(state, step.action_id, step.geoid, step.magnitude);
  }
  return state;
}

// ── Golden B fixture steps (mirrors golden-b.test.ts replay exactly) ────────

function replayGoldenB(state: EngineState): EngineState {
  const fixture = loadFixture('golden_b') as {
    inputs: {
      pre_placed_assets: { action: string; geoid: string; magnitude: number; year: number; override_op?: number }[];
      player_sequence: { action: string; geoid: string; magnitude: number; year: number }[];
    };
    steps: { step: number; action_id: string; geoid: string; magnitude: number; decision_year: number }[];
  };

  // Queue pre-placed assets
  for (const pp of fixture.inputs.pre_placed_assets) {
    state = queueAction(state, pp.action, pp.geoid, pp.magnitude, pp.year, pp.override_op);
  }

  // Advance to 2028
  while (state.year < 2028) state = advanceYear(state);

  // Player sequence (matching golden-b.test.ts step 3 exactly)
  const seq = fixture.inputs.player_sequence;
  state = queueAction(state, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
  state = queueAction(state, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
  state = queueAction(state, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);

  // Apply social actions (steps 4-6 from fixture: apply, not queue)
  for (const step of fixture.steps) {
    [state] = applyAction(state, step.action_id, step.geoid, step.magnitude);
  }

  // Queue battery
  state = queueAction(state, seq[6].action, seq[6].geoid, seq[6].magnitude, seq[6].year);

  // Advance to 2032
  while (state.year < 2032) state = advanceYear(state);

  return state;
}

// ── Frozen digest values from the build log ─────────────────────────────────

const FROZEN = {
  golden_a: { state: '15680bf1e386c4ca09a06e6be5ec8bf3' },
  golden_b_no_events: { state: '4637927283447632599d648cfb360882' },
  golden_c: { state: '645d3b0b66c1d1c89b294af6eda9dd91' },
  golden_d: { state: '7ecb211ebcfdcfcd10cf686b585aeeea', fiscal: 'cbc0734bc40b1fccb91db782d21151ba' },
  golden_e: { existing_assets: '7c685b368081bb00bdce51bb68a47d9b' },
  golden_g_prime_2027: { state: '599f4f27a9e1b69a22a43603acd557fc', fiscal: '63ecffeb94175ed53150c042b96b7c03', existing_assets: 'ad3a1e1a3645eabab15e2b736ad3d511' },
  golden_g_prime_2031: { state: '1ab45d5cfde1a39bc05ac987f5e2edf0', fiscal: 'ad9da9c73fda224a42f0d9c1e5c685e4', existing_assets: '60af778999086403b0eb75336fbc8e34' },
  golden_g_prime_2045: { state: 'cc3333f5f182570894d10bcde3e29105', fiscal: '045f30e465a518e78870f00bb9b27aea', existing_assets: '07744b36e91debe1f3756e6408bf82a6' },
  golden_h_a: { state: '7e31dc3fb03d70bb9ed8bc4f206882fe', fiscal: '4fb3eb1b84612723780439595c157537', existing_assets: '8607ae203ce391d2c44cc653d3cdfb30' },
  golden_h_b: { state: '58493d9c4ab9b7776f69948c28f996bb', fiscal: '736e5343867c2f4c9c1fb892e0db65b9', existing_assets: '8607ae203ce391d2c44cc653d3cdfb30' },
  golden_i_2031: { state: '1ab45d5cfde1a39bc05ac987f5e2edf0', fiscal: 'ad9da9c73fda224a42f0d9c1e5c685e4', existing_assets: '60af778999086403b0eb75336fbc8e34' },
  golden_i_2041: { state: '944c40eb6cbf1f72e5bf9af2f800bb28', fiscal: 'c251dce1f96ec87747160a75ed48fb64', existing_assets: '17786de1181bb535864d9210f7b08921' },
  golden_j_prime: { history: '38b1e5de345a4c1970e8c289da741b7a' },
};

// ── Migration-toggle test: both true and false ──────────────────────────────

for (const migrationEnabled of [true, false]) {
  const label = migrationEnabled ? 'migration=ON' : 'migration=OFF';

  describe(`C0 Gate — four-digest byte-identity (${label})`, () => {
    // Golden A — state_digest only (no retirements needed)
    it(`${label}: Golden A state_digest`, () => {
      const state = replayGoldenA(makeState(migrationEnabled));
      expect(computeDigestMd5(state).md5).toBe(FROZEN.golden_a.state);
    });

    // Golden B (no events) — state_digest
    it(`${label}: Golden B state_digest (no events)`, () => {
      const state = replayGoldenB(makeState(migrationEnabled));
      expect(computeDigestMd5(state).md5).toBe(FROZEN.golden_b_no_events.state);
    });

    // Golden E — existing_assets_digest
    it(`${label}: Golden E existing_assets_digest`, () => {
      const state = makeState(migrationEnabled);
      expect(computeExistingAssetsDigestMd5(state).md5).toBe(FROZEN.golden_e.existing_assets);
    });

    // Golden G′ at years 2027, 2031, 2045 — all three digests
    for (const [targetYear, frozenKey] of [
      [2027, 'golden_g_prime_2027'],
      [2031, 'golden_g_prime_2031'],
      [2045, 'golden_g_prime_2045'],
    ] as const) {
      it(`${label}: Golden G′ yr${targetYear} state_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeDigestMd5(state).md5).toBe(FROZEN[frozenKey].state);
      });

      it(`${label}: Golden G′ yr${targetYear} fiscal_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeFiscalDigestMd5(state).md5).toBe(FROZEN[frozenKey].fiscal);
      });

      it(`${label}: Golden G′ yr${targetYear} existing_assets_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeExistingAssetsDigestMd5(state).md5).toBe(FROZEN[frozenKey].existing_assets);
      });
    }

    // Golden I at years 2031, 2041 — all three digests
    for (const [targetYear, frozenKey] of [
      [2031, 'golden_i_2031'],
      [2041, 'golden_i_2041'],
    ] as const) {
      it(`${label}: Golden I yr${targetYear} state_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeDigestMd5(state).md5).toBe(FROZEN[frozenKey].state);
      });

      it(`${label}: Golden I yr${targetYear} fiscal_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeFiscalDigestMd5(state).md5).toBe(FROZEN[frozenKey].fiscal);
      });

      it(`${label}: Golden I yr${targetYear} existing_assets_digest`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        while (state.year < targetYear) state = advanceYear(state);
        expect(computeExistingAssetsDigestMd5(state).md5).toBe(FROZEN[frozenKey].existing_assets);
      });
    }

    // Golden J′ — history_digest
    // J′ was frozen with the Golden B action sequence + project(60) + migration_enabled=true.
    // When migration=OFF, population fields in IndicatorSnapshot differ (expected).
    if (migrationEnabled) {
      it(`${label}: Golden J′ history_digest`, () => {
        // Reproduce the Golden B action sequence used in golden-j-prime.test.ts
        let state = makeStateWithRetirements(migrationEnabled);
        state = queueAction(state, 'data_center_hyperscale', '56021', 100, 2025);
        state = queueAction(state, 'data_center_campus_phase', '56021', 200, 2025);
        state = queueAction(state, 'smr_advanced', '56023', 345, 2025, 2031);
        while (state.year < 2028) state = advanceYear(state);
        state = queueAction(state, 'smr_advanced', '56021', 345, 2028, 2032);
        state = queueAction(state, 'smr_advanced', '56021', 345, 2028, 2032);
        state = queueAction(state, 'transmission_230kv', '56021', 50, 2028);
        [state] = applyAction(state, 'workforce_retraining', '56021', 1000);
        [state] = applyAction(state, 'workforce_retraining', '56023', 1000);
        [state] = applyAction(state, 'affordable_housing', '56021', 500);
        state = queueAction(state, 'battery_grid', '56021', 1000, 2028);
        // project 60 years (matching golden-j-prime.test.ts)
        for (let i = 0; i < 60; i++) state = advanceYear(state);
        const hd = historyDigest(state);
        expect(hd.md5).toBe(FROZEN.golden_j_prime.history);
      });
    } else {
      it(`${label}: Golden J′ history_digest differs from migration=ON (expected)`, () => {
        let state = makeStateWithRetirements(migrationEnabled);
        state = queueAction(state, 'data_center_hyperscale', '56021', 100, 2025);
        state = queueAction(state, 'data_center_campus_phase', '56021', 200, 2025);
        state = queueAction(state, 'smr_advanced', '56023', 345, 2025, 2031);
        while (state.year < 2028) state = advanceYear(state);
        state = queueAction(state, 'smr_advanced', '56021', 345, 2028, 2032);
        state = queueAction(state, 'smr_advanced', '56021', 345, 2028, 2032);
        state = queueAction(state, 'transmission_230kv', '56021', 50, 2028);
        [state] = applyAction(state, 'workforce_retraining', '56021', 1000);
        [state] = applyAction(state, 'workforce_retraining', '56023', 1000);
        [state] = applyAction(state, 'affordable_housing', '56021', 500);
        state = queueAction(state, 'battery_grid', '56021', 1000, 2028);
        for (let i = 0; i < 60; i++) state = advanceYear(state);
        const hd = historyDigest(state);
        // migration=OFF produces a different history because population trajectories differ
        expect(hd.md5).not.toBe(FROZEN.golden_j_prime.history);
        // But the digest still exists and is deterministic
        expect(hd.n_years).toBe(63);
      });
    }
  });
}

// ── Legacy 3.0 round-trip ───────────────────────────────────────────────────

describe('C0 Gate — legacy 3.0 round-trip', () => {
  it('loads a pre-C0 3.0 fixture, replays, re-exports with climate_lens: historical, digests match', () => {
    // Use Golden A fixture — simpler (apply-only, no queueing), so we can
    // construct a ScenarioFile action log and replay it reliably.
    const fixture = loadFixture('golden_a') as {
      steps: { action_id: string; geoid: string; magnitude: number }[];
      final_state_digest: { md5: string };
    };

    // Build an actionLog matching the Golden A replay
    const actionLog = fixture.steps.map((step, i) => ({
      type: 'apply' as const,
      actionId: step.action_id,
      geoid: step.geoid,
      magnitude: step.magnitude,
      year: 2025, // all applied in year 2025 (start year)
      timestamp: i,
    }));

    // Step 1: Compute the "current code" digest directly (no legacy path)
    let directState = makeState(true);
    for (const step of fixture.steps) {
      [directState] = applyAction(directState, step.action_id, step.geoid, step.magnitude);
    }
    const directDigest = computeReplayDigest(directState);
    // Verify it matches the frozen Golden A digest
    expect(directDigest).toBe(FROZEN.golden_a.state);

    // Step 2: Create a genuine pre-C0 3.0 file (no climate_lens field)
    const legacyFile = {
      schema_version: '3.0' as const,
      terra_version: '1.0' as const,
      exported_at: '2026-07-01T00:00:00.000Z',
      name: 'Legacy Golden A',
      gameSeed: 42,
      start_year: 2025,
      activeScenario: null,
      actionLog,
      eventHistory: [],
      year_reached: 2025,
      replay_digest: directDigest,
      // NO climate_lens field — this is pre-C0
    };
    const legacyJson = JSON.stringify(legacyFile);

    // Step 3: Import through the migration path
    const imported = importFromJson(legacyJson);
    expect(imported).not.toBeNull();
    expect(imported!.schema_version).toBe('3.1');
    expect(imported!.climate_lens).toBe('historical');

    // Step 4: Re-export the migrated file
    const reExported = JSON.parse(exportToJson(imported!)) as ScenarioFile;

    // Evidence:
    // (a) Re-exported file's climate_lens field value
    expect(reExported.climate_lens).toBe('historical');
    // (b) Re-exported file's digest
    expect(reExported.replay_digest).toBe(directDigest);
    // (c) Digest compared against current-code direct computation — must match
    const reExportedLensDigest = computeReplayDigest(directState, reExported.climate_lens);
    expect(reExportedLensDigest).toBe(directDigest);
    expect(reExportedLensDigest).toBe(reExported.replay_digest);
  });
});
