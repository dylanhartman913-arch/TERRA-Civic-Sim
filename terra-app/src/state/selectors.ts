/**
 * Memoized selectors for chart data.
 * All values sourced from engine functions — zero UI-side arithmetic.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { useTerraStore } from './store.js';
import { project, projectDelta } from '../engine/engine.js';
import { computeIndicator } from '../engine/indicators.js';
import type { EngineState, CountyFiscal } from '../engine/types.js';
import type { ChartDatum, EventMarker } from '../ui/charts/types.js';

// ── Snapshot field mapping ───────────────────────────────────────────────────

// Indicators available directly from IndicatorSnapshot.counties[geoid]
const SNAPSHOT_COUNTY_FIELDS: Record<string, string> = {
  E: 'E',
  Ec: 'Ec',
  S: 'S',
  property_tax: 'property_tax',
  cumulative_net: 'cumulative_net',
  labor_utilization: 'labor_utilization',
  service_funding_per_capita: 'service_funding_per_capita',
};

// Indicators available from IndicatorSnapshot.study
const SNAPSHOT_STUDY_FIELDS: Record<string, string> = {
  E: 'E',
  Ec: 'Ec',
  S: 'S',
};

// ── History extraction ───────────────────────────────────────────────────────

/**
 * Extract indicator history from state.history snapshots.
 * Returns empty array for indicators not stored in snapshots.
 */
export function useIndicatorHistory(
  indicatorId: string,
  geoid?: string,
  scale: 'county' | 'study' = 'county',
): ChartDatum[] {
  const engineState = useTerraStore(s => s.engineState);

  return useMemo(() => {
    const history = engineState.history ?? [];
    if (history.length === 0) return [];

    const geoidStr = geoid?.padStart(5, '0');

    if (scale === 'study' && indicatorId in SNAPSHOT_STUDY_FIELDS) {
      const field = SNAPSHOT_STUDY_FIELDS[indicatorId] as 'E' | 'Ec' | 'S';
      return history.map(snap => ({
        year: snap.year,
        value: snap.study[field],
      }));
    }

    if (scale === 'county' && geoidStr && indicatorId in SNAPSHOT_COUNTY_FIELDS) {
      const field = SNAPSHOT_COUNTY_FIELDS[indicatorId];
      return history.map(snap => {
        const county = snap.counties[geoidStr];
        if (!county) return { year: snap.year, value: null };
        return { year: snap.year, value: (county as Record<string, number>)[field] ?? null };
      });
    }

    // Pool utilization from snapshot
    if (indicatorId.startsWith('pool_utilization_')) {
      const shortKey = indicatorId.replace('pool_utilization_', '');
      return history.map(snap => ({
        year: snap.year,
        value: snap.pools[shortKey] ?? null,
      }));
    }

    // Indicator not in snapshot — cannot extract from history
    return [];
  }, [engineState.year, engineState.timestamp, indicatorId, geoid, scale]);
}

// ── Shared projection cache ──────────────────────────────────────────────────

/**
 * Shared projection: calls project() once, caches result.
 * Multiple chart panels on the same county card share this hook's result.
 */
export function useProjection(nYears: number = 20): EngineState[] {
  const engineState = useTerraStore(s => s.engineState);

  return useMemo(
    () => project(engineState, nYears),
    [engineState.year, engineState.timestamp, nYears],
  );
}

/**
 * Extract an indicator time series from projected states.
 */
export function useIndicatorProjection(
  indicatorId: string,
  geoid?: string,
  nYears: number = 20,
  scale: 'county' | 'study' = 'county',
): ChartDatum[] {
  const projectedStates = useProjection(nYears);

  return useMemo(() => {
    return projectedStates.map(s => ({
      year: s.year,
      value: computeIndicator(s, indicatorId, scale, geoid),
    }));
  }, [projectedStates, indicatorId, geoid, scale]);
}

/**
 * Combined history + projection for a single indicator.
 */
export function useIndicatorTrajectory(
  indicatorId: string,
  geoid?: string,
  nYears: number = 20,
  scale: 'county' | 'study' = 'county',
): { history: ChartDatum[]; projection: ChartDatum[] } {
  const history = useIndicatorHistory(indicatorId, geoid, scale);
  const projection = useIndicatorProjection(indicatorId, geoid, nYears, scale);
  return useMemo(() => ({ history, projection }), [history, projection]);
}

// ── Delta projection (debounced) ─────────────────────────────────────────────

interface DeltaResult {
  withAction: ChartDatum[];
  baseline: ChartDatum[];
}

/**
 * Delta projection comparing action-applied vs baseline trajectory.
 * Debounced at 150ms on magnitude changes (slider drags).
 */
export function useDeltaProjection(
  actionId: string,
  geoid: string,
  magnitude: number,
  indicatorId: string,
  nYears: number = 10,
  scale: 'county' | 'study' = 'county',
): DeltaResult | null {
  const engineState = useTerraStore(s => s.engineState);
  const [result, setResult] = useState<DeltaResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const [actionStates, baselineStates] = projectDelta(engineState, actionId, geoid, magnitude, nYears);
      const withAction = actionStates.map(s => ({
        year: s.year,
        value: computeIndicator(s, indicatorId, scale, geoid),
      }));
      const baseline = baselineStates.map(s => ({
        year: s.year,
        value: computeIndicator(s, indicatorId, scale, geoid),
      }));
      setResult({ withAction, baseline });
    }, 150);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [engineState.year, engineState.timestamp, actionId, geoid, magnitude, indicatorId, nYears, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}

// ── Pool sparkline ───────────────────────────────────────────────────────────

/**
 * Pool utilization history for sparkline in ResourceHUD popovers.
 */
export function usePoolHistory(poolId: string): ChartDatum[] {
  const engineState = useTerraStore(s => s.engineState);

  return useMemo(() => {
    const history = engineState.history ?? [];
    const shortKey = poolId.replace('pool_utilization_', '');
    return history.map(snap => ({
      year: snap.year,
      value: snap.pools[shortKey] ?? null,
    }));
  }, [engineState.year, engineState.timestamp, poolId]);
}

// ── Fiscal pure utilities ────────────────────────────────────────────────────

/**
 * Net revenue delta (live minus baseline) for a WY county.
 * Single source of truth — replaces inline .reduce() calls in CountyYields,
 * YieldBadges, and CountyLayer.
 */
export function computeFiscalNetDelta(cf: CountyFiscal): number {
  const ptDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  return (
    ptDeltaSum + suDeltaSum +
    cf.ledger_a_cumulative_delta + cf.ledger_b_cumulative_delta + cf.ledger_c_cumulative_delta
  );
}

/**
 * Pre-action baseline total revenue for a WY county.
 * Reconstructed by reversing all cumulative deltas recorded in fiscal_actions
 * and ledger_*_cumulative_delta fields.
 */
export function computeFiscalBaselineRevenue(cf: CountyFiscal): number {
  const ptDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  return (
    (cf.property_tax   - ptDeltaSum) +
    (cf.sales_use      - suDeltaSum) +
    (cf.advalorem_production - cf.ledger_a_cumulative_delta) +
    (cf.severance_share      - cf.ledger_b_cumulative_delta) +
    (cf.school_finance_net   - cf.ledger_c_cumulative_delta) +
    cf.federal_royalty_share +
    cf.pilt
  );
}

// ── Payback chart data ───────────────────────────────────────────────────────

/**
 * Cumulative property-tax revenue delta series + total capex for a county.
 * Replaces inline domain arithmetic in ChartExpander's PaybackChart component.
 * Shares the useProjection cache — no extra project() call.
 */
export function usePaybackChartData(
  geoid: string,
): { cumulativeRevenue: ChartDatum[]; totalCapex: number } {
  const engineState = useTerraStore(s => s.engineState);
  const projectedStates = useProjection(20);

  return useMemo(() => {
    const history = engineState.history ?? [];
    const geoidStr = geoid.padStart(5, '0');
    const baselinePt = history.length > 0 ? (history[0].counties?.[geoidStr]?.property_tax ?? 0) : 0;

    let cumulative = 0;
    const revData: ChartDatum[] = [];

    for (const snap of history) {
      const pt = snap.counties?.[geoidStr]?.property_tax ?? 0;
      cumulative += (pt - baselinePt);
      revData.push({ year: snap.year, value: cumulative });
    }

    for (const s of projectedStates) {
      const cf = s.county_fiscal[geoidStr];
      const pt = cf?.property_tax ?? 0;
      cumulative += (pt - baselinePt);
      revData.push({ year: s.year, value: cumulative });
    }

    const actionsLib = engineState.action_library.actions;
    let capex = 0;
    for (const record of engineState.action_history) {
      const recGeoid = String(record.geoid ?? record.location ?? '').padStart(5, '0');
      if (recGeoid !== geoidStr) continue;
      const action = actionsLib[record.action_id] || {};
      if ((action as Record<string, unknown>).atb_capex_2025)
        capex += ((action as Record<string, unknown>).atb_capex_2025 as number) * 1000 * record.magnitude;
      else if ((action as Record<string, unknown>).atb_capex_2023)
        capex += ((action as Record<string, unknown>).atb_capex_2023 as number) * 1000 * record.magnitude;
      else if ((action as Record<string, unknown>).cost_2024)
        capex += ((action as Record<string, unknown>).cost_2024 as number) * record.magnitude;
    }

    return { cumulativeRevenue: revData, totalCapex: capex };
  }, [engineState, projectedStates, geoid]);
}

// ── Event markers ────────────────────────────────────────────────────────────

/**
 * Extract commission/retirement event markers for a county from asset_registry.
 */
export function useCountyEventMarkers(geoid: string): EventMarker[] {
  const engineState = useTerraStore(s => s.engineState);

  return useMemo(() => {
    const geoidStr = geoid.padStart(5, '0');
    const markers: EventMarker[] = [];

    for (const a of engineState.asset_registry) {
      if (a.geoid !== geoidStr) continue;
      if (a.asset_class === 'site' || a.asset_class === 'housing_stock') continue;

      if (a.operational_year != null && a.operational_year > 2025) {
        markers.push({
          year: a.operational_year,
          label: `${a.name ?? a.type} online`,
          type: 'commission',
        });
      }
      if (a.scheduled_retirement_year != null) {
        markers.push({
          year: a.scheduled_retirement_year,
          label: `${a.name ?? a.type} retires`,
          type: 'retirement',
        });
      }
    }
    return markers;
  }, [engineState.year, engineState.timestamp, geoid]);
}
