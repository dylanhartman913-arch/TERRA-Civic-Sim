/** Focused C4-i climate hazard event tests and TypeScript stream emitter. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInitialState } from './helpers.js';
import {
  canonicalClimateEventStream,
  sampleClimateHazardEvents,
} from '../../src/engine/events.js';
import {
  advanceYear,
  applyAction,
  sampleHazardEvents,
} from '../../src/engine/engine.js';
import type {
  ClimateHazardBaseline,
  ClimateHazardEvent,
  ClimateProjectionPoint,
} from '../../src/engine/types.js';

const ROOT = resolve(__dirname, '../../..');
const DATA_DIR = resolve(ROOT, 'data/processed');
const ACTIVE_LENSES = ['ssp245', 'ssp370'] as const;
const ACTIVE_SEEDS = [0, 1, 42, 2_147_483_647] as const;
const MATRIX_YEARS = [2025, 2030, 2040, 2050, 2065, 2088] as const;
const FULL_YEAR_RANGE = Array.from({ length: 64 }, (_, index) => 2025 + index);
const HAZARD_KINDS = [
  'heat_wave',
  'wildfire_smoke_proximity',
  'drought_stress',
  'severe_storm',
] as const;

function parseCsv(path: string): Record<string, string>[] {
  const lines = readFileSync(path, 'utf-8').trim().split(/\r?\n/);
  const headings = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const fields = line.split(',');
    return Object.fromEntries(headings.map((heading, index) => [heading, fields[index]]));
  });
}

function loadBaselines(): ClimateHazardBaseline[] {
  return parseCsv(resolve(DATA_DIR, 'nri_wrc_county_hazard_summary.csv'))
    .map((row) => ({
      geoid: row.geoid.padStart(5, '0'),
      heat_wave_frequency: Number(row.heat_wave_annualized_frequency),
      heat_wave_risk_score: Number(row.heat_wave_risk_score),
      wildfire_frequency: Number(row.wildfire_annualized_frequency),
      wildfire_risk_score: Number(row.wildfire_risk_score),
      drought_frequency: Number(row.drought_annualized_frequency),
      drought_risk_score: Number(row.drought_risk_score),
      severe_storm_frequency:
        Number(row.hail_annualized_frequency) +
        Number(row.strong_wind_annualized_frequency),
      severe_storm_risk_score: Math.max(
        Number(row.hail_risk_score),
        Number(row.strong_wind_risk_score),
      ),
    }))
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
}

function loadProjectionPoints(): ClimateProjectionPoint[] {
  const payload = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'county_climate_projections.json'), 'utf-8'),
  ) as { records: Array<Record<string, unknown>> };
  return payload.records.map((record) => ({
    geoid: String(record.geoid),
    lens: String(record.lens) as ClimateProjectionPoint['lens'],
    metric: String(record.metric),
    epoch: Number(record.epoch),
    percentile: String(record.percentile),
    value: Number(record.value),
  }));
}

function activeEventMatrix(): ClimateHazardEvent[] {
  const countyBaselines = loadBaselines();
  const projectionPoints = loadProjectionPoints();
  const events: ClimateHazardEvent[] = [];
  for (const lens of ACTIVE_LENSES) {
    for (const seed of ACTIVE_SEEDS) {
      events.push(
        ...sampleClimateHazardEvents({
          seed,
          lens,
          years: MATRIX_YEARS,
          countyBaselines,
          projectionPoints,
        }),
      );
    }
  }
  return events;
}

function canonicalActionLog(value: Array<Record<string, unknown>>): string {
  const canonical = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    const object = item as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  };
  return `${canonical(value)}\n`;
}

describe('C4-i climate hazard events', () => {
  it('AC1: active matrix covers every hazard, multiple counties, and multiple years', () => {
    const events = activeEventMatrix();
    expect(new Set(events.map((event) => event.hazard_kind))).toEqual(
      new Set(HAZARD_KINDS),
    );
    expect(new Set(events.map((event) => event.geoid)).size).toBeGreaterThan(1);
    expect(new Set(events.map((event) => event.year)).size).toBeGreaterThan(1);
    expect(new Set(events.map((event) => event.lens))).toEqual(
      new Set(ACTIVE_LENSES),
    );
    expect(new Set(events.map((event) => event.seed))).toEqual(
      new Set(ACTIVE_SEEDS),
    );
    expect(events.every((event) => event.consequence_multiplier_ppm === 0)).toBe(true);
    const stream = canonicalClimateEventStream(events);
    expect(stream.endsWith('\n')).toBe(true);
    expect(stream.includes(' ')).toBe(false);
    expect(JSON.parse(stream)).toStrictEqual(events);
  });

  it('AC2: each seed/lens cell is deterministic and different seeds diverge', () => {
    const countyBaselines = loadBaselines();
    const projectionPoints = loadProjectionPoints();
    const digests = new Map<string, string>();
    for (const lens of ACTIVE_LENSES) {
      for (const seed of ACTIVE_SEEDS) {
        const first = canonicalClimateEventStream(
          sampleClimateHazardEvents({
            seed,
            lens,
            years: [...MATRIX_YEARS],
            countyBaselines: structuredClone(countyBaselines),
            projectionPoints: structuredClone(projectionPoints),
          }),
        );
        const second = canonicalClimateEventStream(
          sampleClimateHazardEvents({
            seed,
            lens,
            years: [...MATRIX_YEARS],
            countyBaselines: structuredClone(countyBaselines),
            projectionPoints: structuredClone(projectionPoints),
          }),
        );
        expect(first).toBe(second);
        digests.set(
          `${lens}:${seed}`,
          createHash('sha256').update(first).digest('hex'),
        );
      }
    }
    expect(
      ACTIVE_LENSES.some((lens) =>
        ACTIVE_SEEDS.slice(1).some(
          (seed) => digests.get(`${lens}:0`) !== digests.get(`${lens}:${seed}`),
        ),
      ),
    ).toBe(true);
  });

  it('AC3: historical is exactly empty for all years and signed seed classes', () => {
    const countyBaselines = loadBaselines();
    const projectionPoints = loadProjectionPoints();
    expect(
      sampleClimateHazardEvents({
        seed: ACTIVE_SEEDS[0],
        lens: 'ssp370',
        years: MATRIX_YEARS,
        countyBaselines,
        projectionPoints,
      }).length,
    ).toBeGreaterThan(0);
    for (const seed of [0, -1, -2_147_483_648, 42, 2_147_483_647]) {
      const withTables = sampleClimateHazardEvents({
        seed,
        lens: 'historical',
        years: FULL_YEAR_RANGE,
        countyBaselines,
        projectionPoints,
      });
      const emptyContext = sampleClimateHazardEvents({
        seed,
        lens: 'historical',
        years: FULL_YEAR_RANGE,
        countyBaselines,
        projectionPoints: [],
      });
      const history = FULL_YEAR_RANGE.flatMap((year) =>
        sampleClimateHazardEvents({
          seed,
          lens: 'historical',
          years: [year],
          countyBaselines,
          projectionPoints,
        }),
      );
      expect(withTables).toStrictEqual([]);
      expect(emptyContext).toStrictEqual([]);
      expect(history).toStrictEqual([]);
      expect(canonicalClimateEventStream(withTables)).toBe('[]\n');
    }
  });

  it('AC5: materially different action logs cannot alter non-empty event streams', () => {
    const countyBaselines = loadBaselines();
    const projectionPoints = loadProjectionPoints();
    const controlLog: Array<Record<string, unknown>> = [];
    const mutatedLog = [
      { action_id: 'solar_utility', geoid: '56005', magnitude: 100, year: 2026 },
      { action_id: 'smr_advanced', geoid: '56023', magnitude: 345, year: 2028 },
      { action_id: 'affordable_housing', geoid: '56021', magnitude: 500, year: 2027 },
    ];
    const transformedLog = [
      { ...mutatedLog[2], magnitude: 350, geoid: '56023' },
      { ...mutatedLog[0], year: 2029 },
    ];
    expect(
      new Set(
        [controlLog, mutatedLog, transformedLog].map((log) => canonicalActionLog(log)),
      ).size,
    ).toBe(3);
    const controlState = loadInitialState();
    let mutatedState = applyAction(
      controlState,
      'solar_utility',
      '56005',
      100,
    )[0];
    mutatedState = applyAction(
      mutatedState,
      'workforce_retraining',
      '56023',
      345,
    )[0];
    mutatedState = applyAction(
      mutatedState,
      'affordable_housing',
      '56021',
      500,
    )[0];
    const transformedState = {
      ...mutatedState,
      action_history: [
        {
          ...mutatedState.action_history[2],
          magnitude: 350,
          location: '56023',
          geoid: '56023',
        },
        {
          ...mutatedState.action_history[0],
          timestamp: 2029,
        },
      ],
    };
    const advancedState = advanceYear(transformedState);
    expect(
      new Set(
        [controlState, mutatedState, advancedState].map((state) =>
          canonicalActionLog(state.action_history),
        ),
      ).size,
    ).toBe(3);
    for (const lens of ACTIVE_LENSES) {
      for (const seed of [0, 42]) {
        const input = {
          seed,
          lens,
          years: MATRIX_YEARS,
          countyBaselines,
          projectionPoints,
        };
        const before = canonicalClimateEventStream(sampleHazardEvents(controlState, input));
        expect(JSON.parse(before).length).toBeGreaterThan(0);
        const mutated = canonicalClimateEventStream(sampleHazardEvents(mutatedState, input));
        const after = canonicalClimateEventStream(sampleHazardEvents(advancedState, input));
        expect(advancedState.year).toBe(controlState.year + 1);
        expect(mutated).toBe(before);
        expect(after).toBe(before);
      }
    }
  });

  it('uses p50 physics only and the engine wrapper returns the module stream', () => {
    const countyBaselines = loadBaselines();
    const projectionPoints = loadProjectionPoints();
    const input = {
      seed: 42,
      lens: 'ssp370' as const,
      years: MATRIX_YEARS,
      countyBaselines,
      projectionPoints,
    };
    const expected = sampleClimateHazardEvents(input);
    const nonP50Mutation = [
      ...projectionPoints,
      {
        geoid: '56005',
        lens: 'ssp370' as const,
        metric: 'days_gt_95f',
        epoch: 2050,
        percentile: 'p90',
        value: 1_000_000,
      },
    ];
    expect(
      sampleClimateHazardEvents({ ...input, projectionPoints: nonP50Mutation }),
    ).toStrictEqual(expected);
    expect(sampleHazardEvents(loadInitialState(), input)).toStrictEqual(expected);
  });

  it('emits the canonical active matrix for the cross-runtime verifier', () => {
    const output = process.env.C4I_EVENT_OUTPUT;
    if (!output) return;
    writeFileSync(output, canonicalClimateEventStream(activeEventMatrix()), 'utf-8');
    expect(readFileSync(output, 'utf-8').endsWith('\n')).toBe(true);
  });
});
