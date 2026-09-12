/** Session-only bridge from the C4 hazard sampler to AG2 drought consequences. */

import hazardCsv from '../../../data/processed/nri_wrc_county_hazard_summary.csv?raw';
import projectionData from '../../../data/processed/county_climate_projections.json';
import { applyHazardEventConsequences, sampleHazardEvents } from './engine.js';
import type { ClimateHazardBaseline, ClimateHazardEvent, ClimateLens, ClimateProjectionPoint, EngineState } from './types.js';

function parseCsv(csv: string): Record<string, string>[] {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const headings = header.split(',');
  return rows.map(row => Object.fromEntries(headings.map((heading, index) => [heading, row.split(',')[index]])));
}

const countyBaselines: ClimateHazardBaseline[] = parseCsv(hazardCsv).map(row => ({
  geoid: row.geoid.padStart(5, '0'),
  heat_wave_frequency: Number(row.heat_wave_annualized_frequency), heat_wave_risk_score: Number(row.heat_wave_risk_score),
  wildfire_frequency: Number(row.wildfire_annualized_frequency), wildfire_risk_score: Number(row.wildfire_risk_score),
  drought_frequency: Number(row.drought_annualized_frequency), drought_risk_score: Number(row.drought_risk_score),
  severe_storm_frequency: Number(row.hail_annualized_frequency) + Number(row.strong_wind_annualized_frequency),
  severe_storm_risk_score: Math.max(Number(row.hail_risk_score), Number(row.strong_wind_risk_score)),
})).sort((a, b) => a.geoid.localeCompare(b.geoid));

const projectionPoints = (projectionData as { records: Array<Record<string, unknown>> }).records.map(record => ({
  geoid: String(record.geoid), lens: String(record.lens) as ClimateLens,
  metric: String(record.metric), epoch: Number(record.epoch), percentile: String(record.percentile), value: Number(record.value),
})) as ClimateProjectionPoint[];

/** Sample deterministic yearly hazards and apply AG2 D1 consequences to Wyoming droughts.
 *
 * @param targetYear - Year to sample drought events for. Defaults to state.year.
 *   Pass `state.year + 1` when calling *before* engineAdvanceYear so that drought events are
 *   in place when advanceCountyAg runs and records trajectory snapshots for the new year.
 */
export function applySessionDrought(state: EngineState, seed: number, lens: ClimateLens, targetYear?: number): [EngineState, ClimateHazardEvent[]] {
  const year = targetYear ?? state.year;
  const droughts = sampleHazardEvents(state, { seed, lens, years: [year], countyBaselines, projectionPoints })
    .filter(event => event.hazard_kind === 'drought_stress' && event.geoid.startsWith('56'))
    .map(event => ({ ...event, ag_drought_tier: 'D1' as const, duration_years: 1 }));
  if (droughts.length === 0) return [state, droughts];
  const [next] = applyHazardEventConsequences(state, droughts);
  return [next, droughts];
}
