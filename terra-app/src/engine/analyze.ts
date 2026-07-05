/**
 * analyze.ts — pure data helpers for the /analyze Tradeoff Workspace.
 *
 * Exported so tests can exercise the comparison-overlay path directly.
 * No React / store imports — all functions are pure (EngineState → ChartDatum[]).
 */

import { computeIndicator } from './indicators.js';
import { project } from './engine.js';
import type { EngineState, IndicatorSnapshot } from './types.js';
import type { ChartDatum } from '../ui/charts/types.js';

// ── Field maps (mirrors selectors.ts — keeps them in sync) ───────────────────

const SNAPSHOT_COUNTY_FIELDS: Record<string, string> = {
  E: 'E',
  Ec: 'Ec',
  S: 'S',
  property_tax: 'property_tax',
  cumulative_net: 'cumulative_net',
  labor_utilization: 'labor_utilization',
  service_funding_per_capita: 'service_funding_per_capita',
};

const SNAPSHOT_STUDY_FIELDS = new Set(['E', 'Ec', 'S']);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract an indicator time series from a static EngineState's history array.
 * Mirrors useIndicatorHistory but takes a plain EngineState instead of the store.
 */
export function extractHistoryFromState(
  state: EngineState,
  indicatorId: string,
  geoid?: string,
  scale: 'county' | 'study' = 'county',
): ChartDatum[] {
  const history: IndicatorSnapshot[] = state.history ?? [];
  if (history.length === 0) return [];
  const g = geoid?.padStart(5, '0');

  if (scale === 'study' && SNAPSHOT_STUDY_FIELDS.has(indicatorId)) {
    return history.map(snap => ({
      year: snap.year,
      value: snap.study[indicatorId as 'E' | 'Ec' | 'S'],
    }));
  }

  if (scale === 'county' && g && indicatorId in SNAPSHOT_COUNTY_FIELDS) {
    const field = SNAPSHOT_COUNTY_FIELDS[indicatorId];
    return history.map(snap => {
      const county = snap.counties[g];
      if (!county) return { year: snap.year, value: null };
      return {
        year: snap.year,
        value: (county as Record<string, number>)[field] ?? null,
      };
    });
  }

  if (indicatorId.startsWith('pool_utilization_')) {
    const key = indicatorId.replace('pool_utilization_', '');
    return history.map(snap => ({
      year: snap.year,
      value: snap.pools[key] ?? null,
    }));
  }

  return [];
}

/**
 * Run project() on a static EngineState and extract an indicator series.
 * Used to generate the comparison-scenario projection overlay.
 */
export function extractProjectionFromState(
  state: EngineState,
  indicatorId: string,
  geoid?: string,
  nYears = 20,
  scale: 'county' | 'study' = 'county',
): ChartDatum[] {
  const projected = project(state, nYears);
  return projected.map(s => ({
    year: s.year,
    value: computeIndicator(s, indicatorId, scale, geoid),
  }));
}

/**
 * For a given year, find the IndicatorSnapshot in state.history closest to it.
 * Returns null when history is empty.
 */
export function snapClosestToYear(
  state: EngineState,
  year: number,
): IndicatorSnapshot | null {
  const history: IndicatorSnapshot[] = state.history ?? [];
  if (history.length === 0) return null;
  return history.reduce((best, snap) =>
    Math.abs(snap.year - year) < Math.abs(best.year - year) ? snap : best,
  );
}
