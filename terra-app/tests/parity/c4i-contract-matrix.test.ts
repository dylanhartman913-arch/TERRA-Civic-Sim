/** Emit TypeScript four-contract replay artifacts for the A-M inertness matrix. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeDigestMd5,
  computeExistingAssetsDigestMd5,
  computeFiscalDigestMd5,
  loadFixture,
  loadInitialState,
  loadInitialStateWithRetirements,
  loadInitialStateWithAnchorsAndTags,
} from './helpers.js';
import {
  advanceYear,
  applyAction,
  applyHazardEventConsequences,
  historyDigest,
  initializeState,
  queueAction,
  reduceProductionAsset,
  scheduleRetirement,
  sampleHazardEvents,
} from '../../src/engine/engine.js';
import type {
  ActionLibrary,
  ClimateContext,
  CountyEESBaseline,
  CrosswalkRow,
  EngineState,
  FiscalBaseline,
  FiscalCoefficients,
  InitialNetwork,
  PopulationProjection,
  ClimateHazardBaseline,
  ClimateProjectionPoint,
} from '../../src/engine/types.js';

const FIXTURE_IDS = [
  'golden_a',
  'golden_b',
  'golden_c',
  'golden_d',
  'golden_e',
  'golden_f',
  'golden_g',
  'golden_g_prime',
  'golden_h',
  'golden_i',
  'golden_j',
  'golden_j_prime',
  'golden_k',
  'golden_l',
  'golden_m',
] as const;

type FixtureId = (typeof FIXTURE_IDS)[number];
type FixtureEntry = Record<string, unknown>;

function parseCsv(path: string): Record<string, string>[] {
  const lines = readFileSync(path, 'utf-8').trim().split(/\r?\n/);
  const headings = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const fields = line.split(',');
    return Object.fromEntries(headings.map((heading, index) => [heading, fields[index]]));
  });
}

function loadHazardBaselines(): ClimateHazardBaseline[] {
  const dataDir = resolve(__dirname, '../../../data/processed');
  return parseCsv(resolve(dataDir, 'nri_wrc_county_hazard_summary.csv'))
    .map((row) => ({
      geoid: row.geoid.padStart(5, '0'),
      heat_wave_frequency: Number(row.heat_wave_annualized_frequency),
      heat_wave_risk_score: Number(row.heat_wave_risk_score),
      wildfire_frequency: Number(row.wildfire_annualized_frequency),
      wildfire_risk_score: Number(row.wildfire_risk_score),
      drought_frequency: Number(row.drought_annualized_frequency),
      drought_risk_score: Number(row.drought_risk_score),
      severe_storm_frequency:
        Number(row.hail_annualized_frequency) + Number(row.strong_wind_annualized_frequency),
      severe_storm_risk_score: Math.max(
        Number(row.hail_risk_score), Number(row.strong_wind_risk_score),
      ),
    }))
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
}

function loadClimateProjections(): ClimateProjectionPoint[] {
  const dataDir = resolve(__dirname, '../../../data/processed');
  const payload = JSON.parse(
    readFileSync(resolve(dataDir, 'county_climate_projections.json'), 'utf-8'),
  ) as { records: Array<Record<string, unknown>> };
  return payload.records.map((record) => ({
    geoid: String(record.geoid),
    lens: String(record.lens) as 'historical' | 'ssp245' | 'ssp370',
    metric: String(record.metric),
    epoch: Number(record.epoch),
    percentile: String(record.percentile),
    value: Number(record.value),
  }));
}

function configured(state: EngineState, migrationEnabled: boolean): EngineState {
  return {
    ...state,
    population_config: {
      ...state.population_config,
      migration_enabled: migrationEnabled,
    },
  };
}

function advanceTo(
  state: EngineState,
  targetYear: number,
  climateContext: ClimateContext,
): EngineState {
  let current = state;
  while (current.year < targetYear) current = advanceYear(current, climateContext);
  return current;
}

function queueEntry(
  state: EngineState,
  entry: FixtureEntry,
  climateContext: ClimateContext,
  override?: number,
): EngineState {
  return queueAction(
    state,
    String(entry.action_id ?? entry.action),
    String(entry.geoid),
    Number(entry.magnitude),
    Number(entry.year ?? entry.decision_year ?? state.year),
    override,
    climateContext,
  );
}

function applyEntry(
  state: EngineState,
  entry: FixtureEntry,
  climateContext: ClimateContext,
): EngineState {
  return applyAction(
    state,
    String(entry.action_id ?? entry.action),
    String(entry.geoid ?? entry.location),
    Number(entry.magnitude),
    false,
    climateContext,
  )[0];
}

function replayGoldenB(
  climateContext: ClimateContext,
  migrationEnabled: boolean,
  withRetirements = false,
): EngineState {
  const fixture = loadFixture('golden_b') as {
    inputs: {
      pre_placed_assets: FixtureEntry[];
      player_sequence: FixtureEntry[];
    };
  };
  let state = configured(
    withRetirements ? loadInitialStateWithRetirements() : loadInitialState(),
    migrationEnabled,
  );
  for (const entry of fixture.inputs.pre_placed_assets) {
    state = queueEntry(
      state,
      entry,
      climateContext,
      entry.override_op === undefined ? undefined : Number(entry.override_op),
    );
  }
  state = advanceTo(state, 2028, climateContext);
  const sequence = fixture.inputs.player_sequence;
  state = queueEntry(state, sequence[0], climateContext, 2032);
  state = queueEntry(state, sequence[1], climateContext, 2032);
  state = queueEntry(state, sequence[2], climateContext);
  for (const entry of sequence.slice(3, 6)) {
    state = applyEntry(state, entry, climateContext);
  }
  state = queueEntry(state, sequence[6], climateContext);
  return advanceTo(state, 2032, climateContext);
}

function loadInitialStateWithAnchors(): EngineState {
  const dataDir = resolve(__dirname, '../../src/data');
  const read = <T,>(name: string): T =>
    JSON.parse(readFileSync(resolve(dataDir, name), 'utf-8')) as T;
  const baseline = read<CountyEESBaseline[]>('county_ees_baseline.json');
  const crosswalk = read<CrosswalkRow[]>('county_crosswalk.json');
  const actionLibrary = read<ActionLibrary>('action_library_v3.json');
  const initialNetwork = read<InitialNetwork>('initial_network.json');
  const countyCards = read<Record<string, unknown>>('county_cards.json');
  const fiscalBaseline = read<FiscalBaseline>('fiscal_baseline.json');
  const fiscalCoefficients = read<FiscalCoefficients>('fiscal_coefficients.json');
  const lifecycleCoefficients = read<Record<string, unknown>>('lifecycle_coefficients.json');
  const housingBaseline = read<{ counties: Record<string, unknown> }>(
    'county_housing_baseline.json',
  ).counties;
  const populationProjections = read<{
    counties: Record<string, PopulationProjection>;
  }>('county_population_projections.json').counties;
  const anchors = read<Record<string, unknown>>('mw_anchor_facilities.geojson');
  return initializeState(
    baseline,
    crosswalk,
    actionLibrary,
    initialNetwork,
    countyCards,
    2025,
    fiscalBaseline,
    fiscalCoefficients,
    undefined,
    lifecycleCoefficients,
    housingBaseline,
    populationProjections,
    undefined,
    anchors,
  );
}

function goldenJBase(
  climateContext: ClimateContext,
  migrationEnabled: boolean,
): EngineState {
  let state = configured(loadInitialStateWithRetirements(), migrationEnabled);
  state = queueAction(
    state,
    'data_center_hyperscale',
    '56021',
    100,
    2025,
    undefined,
    climateContext,
  );
  state = queueAction(
    state,
    'data_center_campus_phase',
    '56021',
    200,
    2025,
    undefined,
    climateContext,
  );
  state = queueAction(
    state,
    'smr_advanced',
    '56023',
    345,
    2025,
    2031,
    climateContext,
  );
  state = advanceTo(state, 2028, climateContext);
  for (const [actionId, geoid, magnitude, override] of [
    ['smr_advanced', '56021', 345, 2032],
    ['smr_advanced', '56021', 345, 2032],
    ['transmission_230kv', '56021', 50, undefined],
  ] as const) {
    state = queueAction(
      state,
      actionId,
      geoid,
      magnitude,
      2028,
      override,
      climateContext,
    );
  }
  for (const [actionId, geoid, magnitude] of [
    ['workforce_retraining', '56021', 1000],
    ['workforce_retraining', '56023', 1000],
    ['affordable_housing', '56021', 500],
  ] as const) {
    state = applyAction(
      state,
      actionId,
      geoid,
      magnitude,
      false,
      climateContext,
    )[0];
  }
  return queueAction(
    state,
    'battery_grid',
    '56021',
    1000,
    2028,
    undefined,
    climateContext,
  );
}

function replayFixture(
  fixtureId: FixtureId,
  climateContext: ClimateContext,
  migrationEnabled: boolean,
): EngineState {
  if (fixtureId === 'golden_a') {
    let state = configured(loadInitialState(), migrationEnabled);
    const steps = loadFixture(fixtureId).steps as FixtureEntry[];
    for (const entry of steps) state = applyEntry(state, entry, climateContext);
    return state;
  }
  if (fixtureId === 'golden_b') {
    return replayGoldenB(climateContext, migrationEnabled);
  }
  if (fixtureId === 'golden_c') {
    let state = advanceTo(
      replayGoldenB(climateContext, migrationEnabled),
      2033,
      climateContext,
    );
    for (const [geoid, magnitude] of [
      ['56021', 200],
      ['56005', 100],
      ['56025', 100],
      ['56037', 100],
    ] as const) {
      state = applyAction(
        state,
        'industrial_load_flexible',
        geoid,
        magnitude,
        false,
        climateContext,
      )[0];
    }
    return state;
  }
  if (fixtureId === 'golden_d') {
    const fixture = loadFixture(fixtureId) as {
      inputs: {
        pre_placed_assets: FixtureEntry[];
        player_sequence: FixtureEntry[];
        campbell_retirements: FixtureEntry[];
      };
    };
    let state = configured(loadInitialState(), migrationEnabled);
    for (const entry of fixture.inputs.pre_placed_assets) {
      state = queueEntry(
        state,
        entry,
        climateContext,
        entry.override_op === undefined ? undefined : Number(entry.override_op),
      );
    }
    for (const entry of fixture.inputs.campbell_retirements) {
      state = queueEntry(state, entry, climateContext);
    }
    state = advanceTo(state, 2028, climateContext);
    const sequence = fixture.inputs.player_sequence;
    state = queueEntry(state, sequence[0], climateContext, 2032);
    state = queueEntry(state, sequence[1], climateContext, 2032);
    state = queueEntry(state, sequence[2], climateContext);
    for (const entry of sequence.slice(3, 6)) {
      state = applyEntry(state, entry, climateContext);
    }
    state = queueEntry(state, sequence[6], climateContext);
    return advanceTo(state, 2045, climateContext);
  }
  if (fixtureId === 'golden_e') {
    return configured(loadInitialState(), migrationEnabled);
  }
  if (fixtureId === 'golden_f') {
    return reduceProductionAsset(
      configured(loadInitialState(), migrationEnabled),
      '56005',
      'coal_surface',
      10_000_000,
    )[0];
  }
  if (fixtureId === 'golden_g' || fixtureId === 'golden_g_prime') {
    return advanceTo(
      configured(loadInitialStateWithRetirements(), migrationEnabled),
      2045,
      climateContext,
    );
  }
  if (fixtureId === 'golden_h') {
    let state = advanceTo(
      configured(loadInitialStateWithRetirements(), migrationEnabled),
      2026,
      climateContext,
    );
    state = queueAction(
      state,
      'smr_advanced',
      '56023',
      345,
      2026,
      2030,
      climateContext,
    );
    state = applyAction(
      state,
      'housing_retrofit_affordable',
      '56023',
      300,
      false,
      climateContext,
    )[0];
    state = queueAction(
      state,
      'affordable_housing',
      '56023',
      100,
      2026,
      2027,
      climateContext,
    );
    return advanceTo(state, 2034, climateContext);
  }
  if (fixtureId === 'golden_i') {
    return advanceTo(
      configured(loadInitialStateWithRetirements(), migrationEnabled),
      2041,
      climateContext,
    );
  }
  if (fixtureId === 'golden_j' || fixtureId === 'golden_j_prime') {
    return advanceTo(
      goldenJBase(climateContext, migrationEnabled),
      2088,
      climateContext,
    );
  }
  if (fixtureId === 'golden_k') {
    let state = configured(loadInitialStateWithAnchors(), migrationEnabled);
    state = scheduleRetirement(state, 'anchor_56037_we_soda_westvaco', 2030);
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    state = advanceTo(state, 2029, climateContext);
    state = queueAction(
      state,
      'solar_utility',
      '56005',
      100,
      2029,
      undefined,
      climateContext,
    );
    state = advanceTo(state, 2035, climateContext);
    state = queueAction(
      state,
      'smr_advanced',
      '56037',
      345,
      2035,
      undefined,
      climateContext,
    );
    return advanceTo(state, 2040, climateContext);
  }
  if (fixtureId === 'golden_m') {
    let state = configured(loadInitialStateWithAnchorsAndTags(), migrationEnabled);
    [state] = applyAction(state, 'heat_resilience_upgrade', '56037', 1);
    const baselines = loadHazardBaselines();
    const projections = loadClimateProjections();
    for (let year = 2026; year <= 2030; year++) {
      const events = sampleHazardEvents(state, {
        seed: 42,
        lens: climateContext.lens,
        years: [year],
        countyBaselines: baselines,
        projectionPoints: projections,
      });
      [state] = applyHazardEventConsequences(state, events);
      state = advanceYear(state);
    }
    return state;
  }
  const fixture = loadFixture('golden_l');
  let state = configured(loadInitialStateWithRetirements(), migrationEnabled);
  for (const entry of fixture.action_log as FixtureEntry[]) {
    state = queueEntry(state, entry, climateContext);
  }
  return advanceTo(state, 2050, climateContext);
}

function pythonFloat(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
    return value.toFixed(1);
  }
  return JSON.stringify(value);
}

function canonicalDigest(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalDigest).join(',')}]`;
  const object = value as Record<string, unknown>;
  if (value.constructor?.name === 'PyFloat') {
    return pythonFloat(object.value as number);
  }
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalDigest(object[key])}`)
    .join(',')}}`;
}

function canonicalHistory(value: unknown, key?: string): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return key === 'year' ? String(Math.round(value)) : pythonFloat(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalHistory(item)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((childKey) =>
      `${JSON.stringify(childKey)}:${canonicalHistory(object[childKey], childKey)}`,
    )
    .join(',')}}`;
}

interface ContractArtifact {
  contract: string;
  contract_md5: string;
  payload: string;
}

function contractArtifacts(state: EngineState, lens: string): ContractArtifact[] {
  const stateResult = computeDigestMd5(
    state,
    lens === 'historical' ? undefined : lens,
  );
  const fiscalResult = computeFiscalDigestMd5(state);
  const assetsResult = computeExistingAssetsDigestMd5(state);
  const historyResult = historyDigest(state);
  return [
    {
      contract: 'state_digest',
      contract_md5: stateResult.md5,
      payload: `${canonicalDigest(stateResult.digest)}\n`,
    },
    {
      contract: 'fiscal_digest',
      contract_md5: fiscalResult.md5,
      payload: `${canonicalDigest(fiscalResult.digest)}\n`,
    },
    {
      contract: 'existing_assets_digest',
      contract_md5: assetsResult.md5,
      payload: `${canonicalDigest(assetsResult.digest)}\n`,
    },
    {
      contract: 'history_digest',
      contract_md5: historyResult.md5,
      payload: `${canonicalHistory({
        history: state.history ?? [],
        n_years: historyResult.n_years,
        year_range: historyResult.year_range,
      })}\n`,
    },
  ];
}

interface ManifestRow {
  contract: string;
  contract_md5: string;
  fixture: string;
  lens: string;
  migration_enabled: boolean;
  payload_bytes: number;
  payload_file: string;
  payload_sha256: string;
  runtime: 'typescript';
}

function emit(outputDir: string): ManifestRow[] {
  mkdirSync(outputDir, { recursive: true });
  const tables = (
    loadFixture('golden_l').climate_table_slice as {
      ssp370: ClimateContext['tables'];
    }
  ).ssp370;
  const rows: ManifestRow[] = [];
  for (const fixtureId of FIXTURE_IDS) {
    for (const lens of ['historical', 'ssp370'] as const) {
      const context: ClimateContext = {
        lens,
        tables: lens === 'historical' ? {} : tables,
      };
      for (const migrationEnabled of [false, true]) {
        const state = replayFixture(fixtureId, context, migrationEnabled);
        for (const artifact of contractArtifacts(state, lens)) {
          const migration = migrationEnabled ? 'on' : 'off';
          const filename =
            `${fixtureId}__${lens}__migration-${migration}__typescript__` +
            `${artifact.contract}.json`;
          const bytes = Buffer.from(artifact.payload, 'utf-8');
          writeFileSync(resolve(outputDir, filename), bytes);
          rows.push({
            contract: artifact.contract,
            contract_md5: artifact.contract_md5,
            fixture: fixtureId,
            lens,
            migration_enabled: migrationEnabled,
            payload_bytes: bytes.length,
            payload_file: filename,
            payload_sha256: createHash('sha256').update(bytes).digest('hex'),
            runtime: 'typescript',
          });
        }
      }
    }
  }
  rows.sort((left, right) =>
    [
      left.fixture,
      left.lens,
      String(left.migration_enabled),
      left.runtime,
      left.contract,
    ]
      .join('|')
      .localeCompare(
        [
          right.fixture,
          right.lens,
          String(right.migration_enabled),
          right.runtime,
          right.contract,
        ].join('|'),
      ),
  );
  const manifest = `${canonicalDigest(rows)}\n`;
  writeFileSync(resolve(outputDir, 'manifest.json'), manifest, 'utf-8');
  return rows;
}

describe('C4-i four-contract matrix emitter', () => {
  it('emits every fixture/lens/migration/contract cell when requested', () => {
    const outputDir = process.env.C4I_CONTRACT_OUTPUT_DIR;
    if (!outputDir) {
      expect(FIXTURE_IDS).toHaveLength(15);
      return;
    }
    const rows = emit(outputDir);
    expect(rows).toHaveLength(15 * 2 * 2 * 4);
    expect(new Set(rows.map((row) => row.fixture))).toHaveLength(15);
    expect(new Set(rows.map((row) => row.contract))).toHaveLength(4);
    const manifest = readFileSync(resolve(outputDir, 'manifest.json'));
    const artifactBytes = rows.reduce((sum, row) => sum + row.payload_bytes, 0);
    console.log(
      JSON.stringify({
        artifact_bytes: artifactBytes,
        manifest_sha256: createHash('sha256').update(manifest).digest('hex'),
        matrix_cells: rows.length,
        runtime: 'typescript',
      }),
    );
  }, 20_000);
});
