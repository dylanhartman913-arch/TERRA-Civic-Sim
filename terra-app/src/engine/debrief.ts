/**
 * W6 debrief analysis — pure functions, no React, no Zustand.
 * Called by DebriefView after replaying session files client-side.
 */

import type { ScenarioFile, ActionLogEntry, EngineState, IndicatorSnapshot, CountyFiscal } from './types.js';
import { computeReplayDigest } from './replay.js';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface LoadedSession {
  file: ScenarioFile;
  label: string;   // session_meta.participant_label
  code: string;    // session_meta.session_code
  finalYear: number;
}

export interface SessionOutcome {
  label: string;
  code: string;
  finalYear: number;
  E: number;
  Ec: number;
  S: number;
  fiscalNet: number;
  laborUtil: number;
  housingPressure: number;
  totalBuiltMw: number;
  digest: string;
}

export interface DivergenceResult {
  year: number;
  labelA: string;
  labelB: string;
  actionsA: string[];   // canonical "type:actionId:geoid:magnitude" strings
  actionsB: string[];
  message: string;
}

export interface ConsensusRow {
  geoid: string;
  values: number[];
  mean: number;
  stdDev: number;
  agreement: 'high' | 'medium' | 'low';
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function serializeEntry(e: ActionLogEntry): string {
  return `${e.type}:${e.actionId}:${e.geoid}:${e.magnitude}`;
}

function groupByYear(log: ActionLogEntry[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const e of log) {
    if (!map.has(e.year)) map.set(e.year, []);
    map.get(e.year)!.push(serializeEntry(e));
  }
  for (const [y, actions] of map) {
    map.set(y, [...actions].sort());
  }
  return map;
}

/** Find the earliest divergence year between two sessions. */
function findDivergenceBetween(a: LoadedSession, b: LoadedSession): DivergenceResult | null {
  const logsA = groupByYear(a.file.actionLog);
  const logsB = groupByYear(b.file.actionLog);

  const startYear = Math.min(a.file.start_year, b.file.start_year);
  const endYear = Math.min(a.finalYear, b.finalYear);

  for (let y = startYear; y <= endYear; y++) {
    const actA = logsA.get(y) ?? [];
    const actB = logsB.get(y) ?? [];
    if (JSON.stringify(actA) !== JSON.stringify(actB)) {
      return {
        year: y,
        labelA: a.label,
        labelB: b.label,
        actionsA: actA,
        actionsB: actB,
        message:
          `${a.label} and ${b.label} diverged in ${y}: ` +
          `${a.label} chose [${actA.join(', ') || 'nothing'}], ` +
          `${b.label} chose [${actB.join(', ') || 'nothing'}]`,
      };
    }
  }
  return null;
}

// ── Public: divergence ───────────────────────────────────────────────────────

/**
 * Scan all pairs and return the single earliest divergence found.
 * Returns null when fewer than 2 sessions are loaded or all logs are identical.
 */
export function findEarliestDivergence(sessions: LoadedSession[]): DivergenceResult | null {
  if (sessions.length < 2) return null;
  let earliest: DivergenceResult | null = null;
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const fork = findDivergenceBetween(sessions[i], sessions[j]);
      if (fork && (!earliest || fork.year < earliest.year)) earliest = fork;
    }
  }
  return earliest;
}

/**
 * Return all pair-wise divergences, sorted by year ascending.
 */
export function findAllDivergences(sessions: LoadedSession[]): DivergenceResult[] {
  const results: DivergenceResult[] = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const fork = findDivergenceBetween(sessions[i], sessions[j]);
      if (fork) results.push(fork);
    }
  }
  return results.sort((a, b) => a.year - b.year);
}

// ── Public: outcome extraction ────────────────────────────────────────────────

/** Replicate selectors.computeFiscalNetDelta without importing React. */
function fiscalNetDelta(cf: CountyFiscal): number {
  const ptDelta = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDelta = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  return ptDelta + suDelta + cf.ledger_a_cumulative_delta + cf.ledger_b_cumulative_delta + cf.ledger_c_cumulative_delta;
}

/**
 * Extract summary outcome metrics from a replayed EngineState.
 * digest should be computeReplayDigest(state) — caller can pre-compute and pass in.
 */
export function extractOutcome(
  session: LoadedSession,
  state: EngineState,
  digest: string,
): SessionOutcome {
  const history = state.history ?? [];
  const lastSnap = history[history.length - 1];

  // Study-area EES (null if no history)
  const E = lastSnap?.study.E ?? 0;
  const Ec = lastSnap?.study.Ec ?? 0;
  const S = lastSnap?.study.S ?? 0;

  // Average county labor utilization in last snapshot
  let laborSum = 0, laborCount = 0;
  if (lastSnap) {
    for (const c of Object.values(lastSnap.counties)) {
      laborSum += c.labor_utilization;
      laborCount++;
    }
  }
  const laborUtil = laborCount > 0 ? laborSum / laborCount : 0;

  // Average housing pressure across housing_stock assets
  const housingAssets = state.asset_registry.filter(a => a.asset_class === 'housing_stock');
  const housingPressure =
    housingAssets.length > 0
      ? housingAssets.reduce((s, a) => s + (a.housing_pressure_ratio ?? 0), 0) / housingAssets.length
      : 0;

  // Player-built MW (non-retired, non-site, non-housing)
  const totalBuiltMw = state.asset_registry
    .filter(a => a.origin === 'player' && a.asset_class !== 'site' && a.asset_class !== 'housing_stock' && a.lifecycle !== 'retired')
    .reduce((s, a) => s + (a.capacity_mw ?? 0), 0);

  // Study-area fiscal net delta
  let fiscalNet = 0;
  for (const cf of Object.values(state.county_fiscal)) {
    fiscalNet += fiscalNetDelta(cf as CountyFiscal);
  }

  return {
    label: session.label,
    code: session.code,
    finalYear: session.finalYear,
    E: E ?? 0,
    Ec: Ec ?? 0,
    S: S ?? 0,
    fiscalNet,
    laborUtil,
    housingPressure,
    totalBuiltMw,
    digest,
  };
}

// ── Public: county consensus ──────────────────────────────────────────────────

export type ConsensusIndicator = 'E' | 'Ec' | 'S' | 'labor_utilization' | 'cumulative_net';

/**
 * For each county, compute mean and standard deviation of the selected indicator
 * across all loaded sessions at the target year.
 * Returns rows sorted by stdDev descending (most contested first).
 */
export function computeCountyConsensus(
  sessions: LoadedSession[],
  histories: IndicatorSnapshot[][],
  indicator: ConsensusIndicator,
  targetYear: number,
): ConsensusRow[] {
  // Collect all geoids present in any session's history
  const geoids = new Set<string>();
  for (const hist of histories) {
    const snap = hist.find(s => s.year === targetYear) ?? hist[hist.length - 1];
    if (snap) for (const g of Object.keys(snap.counties)) geoids.add(g);
  }

  const rows: ConsensusRow[] = [];
  for (const geoid of geoids) {
    const values: number[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const hist = histories[i];
      if (!hist) continue;
      const snap = hist.find(s => s.year === targetYear) ?? hist[hist.length - 1];
      if (!snap) continue;
      const c = snap.counties[geoid];
      if (!c) continue;
      values.push(c[indicator]);
    }
    if (values.length === 0) continue;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    // Coefficient of variation determines agreement tier
    const cv = mean !== 0 ? stdDev / Math.abs(mean) : stdDev;
    const agreement: ConsensusRow['agreement'] = cv < 0.05 ? 'high' : cv < 0.20 ? 'medium' : 'low';
    rows.push({ geoid, values, mean, stdDev, agreement });
  }

  return rows.sort((a, b) => b.stdDev - a.stdDev);
}

// Re-export for convenience
export { computeReplayDigest };
