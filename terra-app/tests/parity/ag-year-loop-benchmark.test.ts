/** T5-FU-1 regression gate: sampling + consequences + AG2 full-year dynamics. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advanceYear,
  agDigest,
  applyHazardEventConsequences,
  sampleHazardEvents,
} from '../../src/engine/engine.js';
import type {
  ClimateHazardBaseline,
  ClimateHazardEvent,
  ClimateProjectionPoint,
} from '../../src/engine/types.js';
import { loadInitialStateWithAnchorsAndTags } from './helpers.js';

const ROOT = resolve(__dirname, '../../..');
const DATA_DIR = resolve(ROOT, 'data/processed');
const MEDIAN_BUDGET_MS = 45;
const P90_BUDGET_MS = 60;

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
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
}

function loadProjections(): ClimateProjectionPoint[] {
  const payload = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'county_climate_projections.json'), 'utf-8'),
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

function classifyWyDrought(events: ClimateHazardEvent[]): ClimateHazardEvent[] {
  return events.map((event) => (
    event.hazard_kind === 'drought_stress' && event.geoid.startsWith('56')
      ? { ...event, ag_drought_tier: 'D1' as const, duration_years: 1 }
      : event
  ));
}

function percentile50(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile90(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) * 0.9)];
}

describe('T5-FU-1 full-year consequence + agriculture benchmark', () => {
  it('keeps the 2050 SSP3-7.0 year loop inside the committed regression budget', () => {
    const baselines = loadBaselines();
    const projections = loadProjections();
    const timings: number[] = [];
    let observedEventCount = 0;
    let observedAgChange = false;

    for (let run = 0; run < 13; run++) {
      let state = loadInitialStateWithAnchorsAndTags();
      // Benchmark one complete 2050 loop. Projection from 2025 to 2049 is
      // setup work and would measure 25 loops rather than the T5 consequence
      // path this gate replaces.
      state.year = 2049;
      const agBefore = agDigest(state).md5;
      const start = performance.now();
      const events = classifyWyDrought(sampleHazardEvents(state, {
        seed: 42,
        lens: 'ssp370',
        years: [2050],
        countyBaselines: baselines,
        projectionPoints: projections,
      }));
      [state] = applyHazardEventConsequences(state, events);
      state = advanceYear(state);
      const elapsed = performance.now() - start;

      observedEventCount = events.length;
      observedAgChange ||= agDigest(state).md5 !== agBefore;
      if (run >= 3) timings.push(elapsed); // three warm-up runs, ten measured
    }

    timings.sort((left, right) => left - right);
    const medianMs = percentile50(timings);
    const p90Ms = percentile90(timings);
    const maxMs = timings[timings.length - 1];
    console.info(
      `AG2 full-year benchmark: events=${observedEventCount} median=${medianMs.toFixed(3)}ms p90=${p90Ms.toFixed(3)}ms max=${maxMs.toFixed(3)}ms`,
    );
    expect(observedEventCount).toBe(314);
    expect(observedAgChange).toBe(true);
    expect(medianMs).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(p90Ms).toBeLessThan(P90_BUDGET_MS);
  });
});
