/** Golden M: C4-ii resilience fork, determinism, and four-contract parity. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advanceYear,
  applyAction,
  applyHazardEventConsequences,
  historyDigest,
  sampleHazardEvents,
} from '../../src/engine/engine.js';
import { canonicalClimateEventStream } from '../../src/engine/events.js';
import type {
  ClimateConsequenceStatus,
  ClimateHazardBaseline,
  ClimateHazardEvent,
  ClimateLens,
  ClimateProjectionPoint,
} from '../../src/engine/types.js';
import {
  computeDigestMd5,
  computeExistingAssetsDigestMd5,
  computeFiscalDigestMd5,
  loadFixture,
  loadInitialStateWithAnchorsAndTags,
} from './helpers.js';

const ROOT = resolve(__dirname, '../../..');
const DATA_DIR = resolve(ROOT, 'data/processed');
const SEED = 42;
const YEARS = [2026, 2027, 2028, 2029, 2030] as const;

interface GoldenMResult {
  state_digest_md5: string;
  fiscal_digest_md5: string;
  existing_assets_digest_md5: string;
  history_digest_md5: string;
  event_count: number;
  event_stream_sha256: string;
  status_counts: Record<ClimateConsequenceStatus, number>;
}

interface GoldenMFixture {
  pre_c4_historical_control: GoldenMResult;
  results: Record<ClimateLens, GoldenMResult>;
}

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
        Number(row.hail_annualized_frequency) + Number(row.strong_wind_annualized_frequency),
      severe_storm_risk_score: Math.max(
        Number(row.hail_risk_score), Number(row.strong_wind_risk_score),
      ),
    }))
    .sort((left, right) => left.geoid < right.geoid ? -1 : left.geoid > right.geoid ? 1 : 0);
}

function loadProjections(): ClimateProjectionPoint[] {
  const payload = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'county_climate_projections.json'), 'utf-8'),
  ) as { records: Array<Record<string, unknown>> };
  return payload.records.map((record) => ({
    geoid: String(record.geoid),
    lens: String(record.lens) as ClimateLens,
    metric: String(record.metric),
    epoch: Number(record.epoch),
    percentile: String(record.percentile),
    value: Number(record.value),
  }));
}

function runGoldenM(lens: ClimateLens, coupleEvents = true): GoldenMResult {
  let state = loadInitialStateWithAnchorsAndTags();
  const [adapted, adaptationDelta] = applyAction(
    state, 'heat_resilience_upgrade', '56037', 1,
  );
  expect(adaptationDelta.adaptation_delta?.affected_asset_ids.length).toBeGreaterThan(0);
  state = adapted;

  const baselines = loadBaselines();
  const projections = loadProjections();
  const allEvents: ClimateHazardEvent[] = [];
  const statusCounts: Record<ClimateConsequenceStatus, number> = {
    applied_existing_handler: 0,
    skipped_no_exposed_assets: 0,
    skipped_no_existing_handler: 0,
  };
  for (const year of YEARS) {
    const events = coupleEvents
      ? sampleHazardEvents(state, {
          seed: SEED,
          lens,
          years: [year],
          countyBaselines: baselines,
          projectionPoints: projections,
        })
      : [];
    allEvents.push(...events);
    if (coupleEvents) {
      const [coupled, outcomes] = applyHazardEventConsequences(state, events);
      state = coupled;
      for (const outcome of outcomes) statusCounts[outcome.status] += 1;
    }
    // Intentionally historical for every fork: lens enters only through events above.
    state = advanceYear(state);
  }

  return {
    state_digest_md5: computeDigestMd5(state).md5,
    fiscal_digest_md5: computeFiscalDigestMd5(state).md5,
    existing_assets_digest_md5: computeExistingAssetsDigestMd5(state).md5,
    history_digest_md5: historyDigest(state).md5,
    event_count: allEvents.length,
    event_stream_sha256: createHash('sha256')
      .update(canonicalClimateEventStream(allEvents)).digest('hex'),
    status_counts: statusCounts,
  };
}

const fixture = loadFixture('golden_m') as unknown as GoldenMFixture;

describe('Golden M — resilience fork', () => {
  it('AC3: all four contracts match the frozen Python fixture for every lens', () => {
    for (const lens of ['historical', 'ssp245', 'ssp370'] as const) {
      expect(runGoldenM(lens)).toEqual(fixture.results[lens]);
    }
  });

  it('AC3: same seed and lens rerun is deterministic', () => {
    for (const lens of ['historical', 'ssp245', 'ssp370'] as const) {
      expect(runGoldenM(lens)).toEqual(runGoldenM(lens));
    }
  });

  it('AC3: ssp245 and ssp370 diverge only through events/consequences', () => {
    const noEvent245 = runGoldenM('ssp245', false);
    const noEvent370 = runGoldenM('ssp370', false);
    const historicalControl = runGoldenM('historical', false);
    const ssp245 = runGoldenM('ssp245');
    const ssp370 = runGoldenM('ssp370');

    expect(noEvent245).toEqual(noEvent370);
    expect(noEvent245).toEqual(historicalControl);
    expect(ssp245.event_stream_sha256).not.toBe(ssp370.event_stream_sha256);
    expect(ssp245.state_digest_md5).not.toBe(ssp370.state_digest_md5);
    expect(ssp245.history_digest_md5).not.toBe(ssp370.history_digest_md5);
  });

  it('AC3: historical has zero events and matches the pre-C4 control exactly', () => {
    const historical = runGoldenM('historical');
    expect(historical.event_count).toBe(0);
    expect(historical).toEqual(runGoldenM('historical', false));
    expect(historical).toEqual(fixture.pre_c4_historical_control);
  });
});
