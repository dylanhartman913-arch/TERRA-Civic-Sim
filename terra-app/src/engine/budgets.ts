/**
 * TERRA Budget Engine — pure functions for era resource accounting.
 * No React imports, no side effects.
 */

import type {
  ActionRecord,
  EraBudget,
  BudgetConsumption,
  ActionLogEntry,
} from './types.js';
import eraBudgetsData from '../data/era_budgets.json';

// ── Era budget data ────────────────────────────────────────────────────────

const ERA_BUDGETS: EraBudget[] = (eraBudgetsData.eras as EraBudget[]);

/** SMR-family actions that consume HALEU */
const SMR_FAMILY = new Set(['smr_advanced', 'coal_to_smr', 'haleu_production', 'fuel_fabrication']);

/** Transmission actions that consume ROW miles */
const TRANSMISSION_ACTIONS = new Set(['transmission_230kv', 'transmission_500kv', 'transmission_buildout']);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract capex (USD/MW or USD/natural-unit) from an action record.
 * Priority:
 *   1. coefficients_per_mw.capex_usd_per_mw (e.g. industrial_load_flexible)
 *   2. coefficients_per_mw_it.capex_usd_per_mw (IT-load actions)
 *   3. cost_2024 * magnitude  — cost_2024 is consistently $/natural-unit
 *      ($/MW for generation, $/mile for tx, $/worker for social actions, etc.)
 *   4. atb_capex_2024 * 1000  — $/kW → $/MW fallback (wind/solar without cost_2024)
 *   5. atb_capex_2025 * 1000
 *   6. 0 + console.warn (unmapped)
 */
function getActionCapex(action: ActionRecord, magnitude: number): number {
  // 1. Structured coefficient: capex_usd_per_mw
  const coeffMw = action.coefficients_per_mw ?? {};
  if (coeffMw.capex_usd_per_mw?.value) {
    return coeffMw.capex_usd_per_mw.value * magnitude;
  }
  const coeffIt = action.coefficients_per_mw_it ?? {};
  if (coeffIt.capex_usd_per_mw?.value) {
    return coeffIt.capex_usd_per_mw.value * magnitude;
  }

  // 2. cost_2024: $/natural-unit (MW, mile, worker, acre, …); scale linearly
  if (action.cost_2024) {
    return action.cost_2024 * magnitude;
  }

  // 3. ATB capex ($/kW → $/MW * magnitude); check 2023 base year for actions like solar_utility
  const atbCapex = action.atb_capex_2024 || action.atb_capex_2025 || action.atb_capex_2023;
  if (atbCapex) {
    return atbCapex * 1000 * magnitude;
  }

  console.warn(`[budgets] unmapped capex for action: ${action.action_id ?? '(unknown)'}`);
  return 0;
}

/**
 * Extract construction jobs per MW from structured coefficients.
 * Returns 0 when not present.
 */
function getConstructionJobsPerMw(action: ActionRecord): number {
  const coeffMw = action.coefficients_per_mw ?? {};
  if (coeffMw.construction_jobs_per_mw?.value) {
    return coeffMw.construction_jobs_per_mw.value;
  }
  const coeffIt = action.coefficients_per_mw_it ?? {};
  if (coeffIt.construction_jobs_per_mw?.value) {
    return coeffIt.construction_jobs_per_mw.value;
  }
  return 0;
}

function getMaterialTons(materials: Record<string, unknown>, key: string): number {
  // Handle both _tons and _tonnes naming
  const v = materials[key] ?? materials[key.replace('_tons', '_tonnes')] ?? 0;
  return typeof v === 'number' ? v : 0;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getEraBudgets(): EraBudget[] {
  return ERA_BUDGETS;
}

export function getEraForYear(year: number): EraBudget {
  for (const era of ERA_BUDGETS) {
    if (year >= era.era_start && year < era.era_end) return era;
  }
  // Default to last era
  return ERA_BUDGETS[ERA_BUDGETS.length - 1];
}

/**
 * Compute resource consumption for a single action placement.
 * Derives from action coefficients; scales linearly with magnitude.
 */
export function computeConsumption(
  action: ActionRecord,
  magnitude: number,
): BudgetConsumption {
  const actionId = action.action_id ?? '';
  const materials = (action.materials ?? {}) as Record<string, unknown>;

  const steelPerUnit = getMaterialTons(materials, 'steel_tons');
  const concretePerUnit = getMaterialTons(materials, 'concrete_tons');

  // HALEU: non-zero only for SMR-family actions
  // smr_advanced uses ~5,000 kg per Natrium-class initial core (345 MW)
  let haleuKg = 0;
  if (SMR_FAMILY.has(actionId)) {
    if (actionId === 'smr_advanced' || actionId === 'coal_to_smr') {
      // ~14.5 kg HALEU per MW (5000 kg / 345 MW)
      haleuKg = magnitude * (5000 / 345);
    } else if (actionId === 'haleu_production') {
      // Production facility itself doesn't consume HALEU
      haleuKg = 0;
    } else if (actionId === 'fuel_fabrication') {
      haleuKg = 0;
    }
  }

  // Transmission ROW miles: only for transmission actions
  let transmissionMiles = 0;
  if (TRANSMISSION_ACTIONS.has(actionId)) {
    // magnitude is in miles for transmission actions
    transmissionMiles = magnitude;
  }

  // Capital
  const capex = getActionCapex(action, magnitude);

  // Labor: prefer construction_jobs_per_mw * magnitude * time_to_deploy (person-years);
  // fall back to capex-to-labor ratio (~$300k/person-year in energy construction).
  const jobsPerMw = getConstructionJobsPerMw(action);
  const timeToDeploy = action.time_to_deploy || 1;
  const laborYears = jobsPerMw > 0
    ? jobsPerMw * magnitude * timeToDeploy
    : capex > 0 ? capex / 300000 : 0;

  // Materials: taken directly from action library (per-project amounts, not per-MW).
  // Matches Python norm_materials() which returns raw dict values without magnitude scaling.
  const steelTons = steelPerUnit;
  const concreteTons = concretePerUnit;

  return {
    action_id: actionId,
    capital_cost_usd: capex,
    labor_years: Math.round(laborYears * 10) / 10,
    steel_tons: steelTons,
    concrete_tons: concreteTons,
    HALEU_kg: Math.round(haleuKg * 10) / 10,
    transmission_row_miles: transmissionMiles,
  };
}

/**
 * Compute remaining budget for an era after subtracting all actions
 * placed within that era's year range.
 */
export function getRemainingBudget(
  era: EraBudget,
  actionLog: ActionLogEntry[],
  actionLibrary: Record<string, ActionRecord>,
): EraBudget {
  let usedCapex = 0;
  let usedLabor = 0;
  let usedSteel = 0;
  let usedConcrete = 0;
  let usedHaleu = 0;
  let usedTxMiles = 0;

  for (const entry of actionLog) {
    if (entry.year >= era.era_start && entry.year < era.era_end) {
      const action = actionLibrary[entry.actionId];
      if (!action) continue;
      const c = computeConsumption(action, entry.magnitude);
      usedCapex += c.capital_cost_usd;
      usedLabor += c.labor_years;
      usedSteel += c.steel_tons;
      usedConcrete += c.concrete_tons;
      usedHaleu += c.HALEU_kg;
      usedTxMiles += c.transmission_row_miles;
    }
  }

  return {
    era_start: era.era_start,
    era_end: era.era_end,
    capital_cost_usd: era.capital_cost_usd - usedCapex,
    labor_years: era.labor_years - usedLabor,
    steel_tons: era.steel_tons - usedSteel,
    concrete_tons: era.concrete_tons - usedConcrete,
    HALEU_kg: era.HALEU_kg - usedHaleu,
    transmission_row_miles: era.transmission_row_miles - usedTxMiles,
  };
}

/**
 * Returns human-readable strings for each non-zero resource consumption
 * as a percentage of remaining era budget.
 */
export function getBudgetShareString(
  consumption: BudgetConsumption,
  remaining: EraBudget,
): string[] {
  const lines: string[] = [];
  const entries: [string, number, number][] = [
    ['capital', consumption.capital_cost_usd, remaining.capital_cost_usd],
    ['labor', consumption.labor_years, remaining.labor_years],
    ['steel', consumption.steel_tons, remaining.steel_tons],
    ['concrete', consumption.concrete_tons, remaining.concrete_tons],
    ['HALEU', consumption.HALEU_kg, remaining.HALEU_kg],
    ['transmission ROW', consumption.transmission_row_miles, remaining.transmission_row_miles],
  ];

  for (const [label, used, total] of entries) {
    if (used > 0 && total > 0) {
      const pct = Math.round((used / Math.max(total, 1)) * 100);
      lines.push(`${pct}% of era ${label}`);
    }
  }

  return lines;
}

/**
 * Check whether a consumption would overflow any remaining era resource.
 */
export function isEraOverflow(
  consumption: BudgetConsumption,
  remaining: EraBudget,
): { overflows: boolean; resources: string[] } {
  const overflowResources: string[] = [];

  if (consumption.capital_cost_usd > remaining.capital_cost_usd && remaining.capital_cost_usd > 0) {
    overflowResources.push('capital');
  }
  if (consumption.labor_years > remaining.labor_years && remaining.labor_years > 0) {
    overflowResources.push('labor');
  }
  if (consumption.steel_tons > remaining.steel_tons && remaining.steel_tons > 0) {
    overflowResources.push('steel');
  }
  if (consumption.concrete_tons > remaining.concrete_tons && remaining.concrete_tons > 0) {
    overflowResources.push('concrete');
  }
  if (consumption.HALEU_kg > remaining.HALEU_kg && remaining.HALEU_kg > 0) {
    overflowResources.push('HALEU');
  }
  if (consumption.transmission_row_miles > remaining.transmission_row_miles && remaining.transmission_row_miles > 0) {
    overflowResources.push('transmission ROW');
  }

  return {
    overflows: overflowResources.length > 0,
    resources: overflowResources,
  };
}
