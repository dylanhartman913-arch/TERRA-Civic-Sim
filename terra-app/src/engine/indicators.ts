/**
 * indicators.ts — TERRA Engine v4.0 Indicator Catalog (TypeScript mirror of indicators.py)
 * Additive companion to engine.ts. Does NOT modify any existing digest.
 * Golden A–H fixtures remain byte-identical.
 */

import type { EngineState, IndicatorSnapshot } from './types.js';

// ── Construction workforce constants (KEEP IN SYNC with terra_engine.py) ─────
const HOUSING_CONSTRUCTION_JOBS_PER_MW: Record<string, number> = {
  nuclear: 5.2,
  coal: 2.0,
  gas: 1.4,
  wind: 0.4,
  solar: 2.5,
  storage: 0.5,
  data_center: 3.0,
  hydro: 1.5,
};
// ── Pool utilization indicator IDs ────────────────────────────────────────────
export const POOL_UTILIZATION_IDS: string[] = [
  'pool_utilization_HALEU_kg_per_year',
  'pool_utilization_fuel_fabrication_units_per_year',
  'pool_utilization_capital_cost_usd',
  'pool_utilization_labor_years',
  'pool_utilization_steel_tons',
  'pool_utilization_transmission_row_miles',
];

// Map pool indicator ID → sc_pools key (only for 2 live pools)
const POOL_INDICATOR_TO_KEY: Record<string, string> = {
  pool_utilization_HALEU_kg_per_year: 'HALEU_kg_per_year',
  pool_utilization_fuel_fabrication_units_per_year: 'fuel_fabrication_units_per_year',
};

// ── Indicator catalog ─────────────────────────────────────────────────────────

export const INDICATOR_CATALOG: Record<string, {
  label: string;
  formula: string;
  units: string;
  scale: string[];
  confidence_inputs: string[];
  note?: string;
}> = {
  E: {
    label: 'Economic Energy Score',
    formula: 'county_ees[geoid]["E"] (direct). Study scale: population-weighted mean.',
    units: 'dimensionless (0–10)',
    scale: ['county', 'study'],
    confidence_inputs: ['county_ees'],
  },
  Ec: {
    label: 'Ecological Energy Score',
    formula: 'county_ees[geoid]["Ec"] (direct). Study scale: population-weighted mean.',
    units: 'dimensionless (0–10)',
    scale: ['county', 'study'],
    confidence_inputs: ['county_ees'],
  },
  S: {
    label: 'Social Energy Score',
    formula: 'county_ees[geoid]["S"] (direct). Study scale: population-weighted mean.',
    units: 'dimensionless (0–10)',
    scale: ['county', 'study'],
    confidence_inputs: ['county_ees'],
  },
  fiscal_balance: {
    label: 'Total Fiscal Balance',
    formula:
      'property_tax + advalorem_production + severance_share + federal_royalty_share ' +
      '+ pilt + sales_use + school_finance_net. ' +
      'Note: school_finance_net is negative for mineral recapture counties.',
    units: 'USD/yr',
    scale: ['county'],
    confidence_inputs: ['county_fiscal'],
  },
  cumulative_net: {
    label: 'Cumulative Three-Ledger Net',
    formula:
      'ledger_a_cumulative_delta + ledger_b_cumulative_delta + ledger_c_cumulative_delta',
    units: 'USD (cumulative since baseline)',
    scale: ['county'],
    confidence_inputs: ['county_fiscal'],
  },
  payback_year: {
    label: 'Property-Tax Payback Year',
    formula:
      'First year in state.history where cumulative ' +
      '(property_tax[t] - property_tax[history[0]]) >= capex_for_county. ' +
      'Returns null if no history, capex=0, or threshold not reached.',
    units: 'year (int) or null',
    scale: ['county'],
    confidence_inputs: ['county_fiscal', 'action_history', 'history'],
    note:
      'Property-tax-based payback, not investor IRR. ' +
      'Nuclear capital intensity means payback_year > 2070 for Wyoming mill-levy rates ' +
      'with dual-SMR investment.',
  },
  service_funding_per_capita: {
    label: 'Service Funding Per Capita',
    formula: 'school_finance_net / max(population, 1)',
    units: 'USD/person/yr',
    scale: ['county'],
    confidence_inputs: ['county_fiscal', 'county_ees'],
  },
  labor_utilization: {
    label: 'Labor Utilization (Construction)',
    formula:
      'incoming_construction_workforce / max(baseline_employment, 1). ' +
      'incoming_construction_workforce: sum capacity_mw × HOUSING_CONSTRUCTION_JOBS_PER_MW[type] ' +
      'for assets under construction or player-queued not yet commissioned.',
    units: 'ratio (0–∞, typically 0–0.5)',
    scale: ['county'],
    confidence_inputs: ['asset_registry', 'county_cards'],
  },
  labor_headroom: {
    label: 'Labor Headroom',
    formula: 'max(0, 1 - labor_utilization)',
    units: 'ratio (0–1)',
    scale: ['county'],
    confidence_inputs: ['asset_registry', 'county_cards'],
  },
  firm_margin: {
    label: 'Firm Capacity Margin',
    formula:
      '(firm_capacity_mw - load_mw) / max(firm_capacity_mw, 1) using primary bus for county.',
    units: 'ratio (can be negative for deficits)',
    scale: ['county'],
    confidence_inputs: ['bus_state', 'crosswalk'],
  },
  housing_pressure: {
    label: 'Housing Pressure Ratio',
    formula:
      'housing_stock.housing_pressure_ratio from asset_registry. ' +
      'Reuses _compute_housing_pressure demand/supply computation from terra_engine.py (Z3). ' +
      'demand = occupied + incoming_workforce × HOUSEHOLD_FACTOR. ' +
      'supply = occupied + convertible + affordable_added.',
    units: 'ratio (1.0 = balanced; >1.25 = stressed)',
    scale: ['county'],
    confidence_inputs: ['asset_registry'],
  },
  pool_utilization_HALEU_kg_per_year: {
    label: 'HALEU Pool Utilization',
    formula: 'used_this_year / max(capacity_per_year, 1); null if pool absent.',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: ['sc_pools'],
  },
  pool_utilization_fuel_fabrication_units_per_year: {
    label: 'Fuel Fabrication Pool Utilization',
    formula: 'used_this_year / max(capacity_per_year, 1); null if pool absent.',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: ['sc_pools'],
  },
  pool_utilization_capital_cost_usd: {
    label: 'Capital Cost Pool Utilization (stub)',
    formula: 'stub: returns null (pool not yet in engine, planned Session 3).',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: [],
    note: 'Stub: capital_cost_usd pool not yet implemented in engine.',
  },
  pool_utilization_labor_years: {
    label: 'Labor Years Pool Utilization (stub)',
    formula: 'stub: returns null.',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: [],
    note: 'Stub: labor_years pool not yet implemented in engine.',
  },
  pool_utilization_steel_tons: {
    label: 'Steel Tons Pool Utilization (stub)',
    formula: 'stub: returns null.',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: [],
    note: 'Stub: steel_tons pool not yet implemented in engine.',
  },
  pool_utilization_transmission_row_miles: {
    label: 'Transmission ROW Pool Utilization (stub)',
    formula: 'stub: returns null.',
    units: 'ratio (0–1)',
    scale: ['study'],
    confidence_inputs: [],
    note: 'Stub: transmission_row_miles pool not yet implemented in engine.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Private helpers
// ═══════════════════════════════════════════════════════════════════════════════

// Map action IDs → fuel-type keys used in HOUSING_CONSTRUCTION_JOBS_PER_MW.
// Player assets use action_id as their 'type' field; this normalizes them.
const ACTION_ID_TO_FUEL_TYPE: Record<string, string> = {
  smr_advanced: 'nuclear',
  coal_to_smr: 'nuclear',
  fusion_pilot: 'nuclear',
  wind_utility: 'wind',
  offshore_wind_great_lakes: 'wind',
  solar_utility: 'solar',
  coal_to_solar: 'solar',
  coal_repowering: 'coal',
  geothermal_utility: 'gas',
  hydropower_small: 'hydro',
  pumped_hydro: 'hydro',
  battery_grid: 'storage',
  hydrogen_electrolysis: 'storage',
  data_center_hyperscale: 'data_center',
  data_center_campus_phase: 'data_center',
  industrial_load_flexible: 'data_center',
};

function normalizeAssetType(rawType: string): string {
  if (rawType in HOUSING_CONSTRUCTION_JOBS_PER_MW) return rawType;
  return ACTION_ID_TO_FUEL_TYPE[rawType] ?? rawType;
}

function incomingConstructionWorkforce(state: EngineState, geoid: string): number {
  const currentYear = state.year;
  let total = 0.0;
  for (const a of state.asset_registry) {
    if (a.geoid !== geoid) continue;
    if (a.asset_class === 'housing_stock' || a.asset_class === 'production') continue;
    const opYear = a.operational_year;
    const capMw = a.capacity_mw ?? (a as unknown as Record<string, number>).magnitude ?? 0.0;

    const isUnderConstruction =
      a.origin === 'baseline' &&
      a.status === 'under_construction' &&
      opYear !== null && opYear > currentYear;

    const isPlayerQueued =
      a.origin === 'player' &&
      a.lifecycle !== 'retired' &&
      a.commissioned === false &&
      opYear !== null && opYear > currentYear;

    if (isUnderConstruction || isPlayerQueued) {
      const fuelType = normalizeAssetType(a.type);
      const jobsPerMw = HOUSING_CONSTRUCTION_JOBS_PER_MW[fuelType] ?? 0.0;
      total += capMw * jobsPerMw;
    }
  }
  return total;
}

function baselineEmployment(state: EngineState, geoid: string): number {
  const card = (state.county_cards as Record<string, Record<string, unknown>>)[geoid];
  if (!card) return 1;
  const emp = (card as Record<string, unknown>).employment as number | undefined;
  return emp && emp > 0 ? emp : 1;
}

function capexForGeoid(state: EngineState, geoid: string): number {
  const geoidStr = geoid.padStart(5, '0');
  const actionsLib = state.action_library.actions;
  let total = 0.0;
  for (const record of state.action_history) {
    const recGeoid = String(
      (record as unknown as Record<string, unknown>).geoid ?? record.location ?? '',
    ).padStart(5, '0');
    if (recGeoid !== geoidStr) continue;
    const action = actionsLib[record.action_id] || {};
    const magnitude = record.magnitude;
    // Inline formula matching computeActionCapex in engine.ts
    if (action.atb_capex_2025) total += action.atb_capex_2025 * 1000.0 * magnitude;
    else if (action.atb_capex_2023) total += action.atb_capex_2023 * 1000.0 * magnitude;
    else if (action.cost_2024) total += action.cost_2024 * magnitude;
  }
  return total;
}

function primaryBusForGeoid(state: EngineState, geoid: string): string | null {
  const g = geoid.padStart(5, '0');
  const row = state.crosswalk.find(r => r.geoid === g && r.primary_bus === true);
  return row ? String(row.bus_id) : null;
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a single indicator from the current engine state.
 *
 * @param state    TERRA engine state
 * @param indicatorId  from INDICATOR_CATALOG
 * @param scale    'county' | 'study'
 * @param geoid    5-char FIPS, required for county-scale indicators
 * @param denominator  override denominator for per-capita calculations
 * @returns number | null. Throws for unknown indicatorId.
 */
export function computeIndicator(
  state: EngineState,
  indicatorId: string,
  scale: string = 'county',
  geoid?: string,
  denominator?: number,
): number | null {
  if (!(indicatorId in INDICATOR_CATALOG)) {
    throw new Error(`Unknown indicatorId: "${indicatorId}". Valid IDs: ${Object.keys(INDICATOR_CATALOG).sort().join(', ')}`);
  }

  const geoidStr = geoid ? geoid.padStart(5, '0') : undefined;

  // ── Raw EES ──────────────────────────────────────────────────────────────
  if (indicatorId === 'E' || indicatorId === 'Ec' || indicatorId === 'S') {
    if (scale === 'study') {
      const vals = Object.values(state.county_ees);
      if (!vals.length) return null;
      const totalPop = vals.reduce((s, v) => s + (v.population || 1), 0);
      if (totalPop > 0) {
        return vals.reduce((s, v) => s + (v[indicatorId as 'E' | 'Ec' | 'S'] ?? 0) * (v.population || 1), 0) / totalPop;
      }
      return vals.reduce((s, v) => s + (v[indicatorId as 'E' | 'Ec' | 'S'] ?? 0), 0) / vals.length;
    }
    if (!geoidStr) return null;
    const ees = state.county_ees[geoidStr];
    if (!ees) return null;
    return ees[indicatorId as 'E' | 'Ec' | 'S'] ?? null;
  }

  // ── Fiscal balance ────────────────────────────────────────────────────────
  if (indicatorId === 'fiscal_balance') {
    if (!geoidStr) return null;
    const cf = state.county_fiscal[geoidStr];
    if (!cf) return null;
    return (
      (cf.property_tax ?? 0) +
      (cf.advalorem_production ?? 0) +
      (cf.severance_share ?? 0) +
      (cf.federal_royalty_share ?? 0) +
      (cf.pilt ?? 0) +
      (cf.sales_use ?? 0) +
      (cf.school_finance_net ?? 0)
    );
  }

  // ── Cumulative net ────────────────────────────────────────────────────────
  if (indicatorId === 'cumulative_net') {
    if (!geoidStr) return null;
    const cf = state.county_fiscal[geoidStr];
    if (!cf) return null;
    return (
      (cf.ledger_a_cumulative_delta ?? 0) +
      (cf.ledger_b_cumulative_delta ?? 0) +
      (cf.ledger_c_cumulative_delta ?? 0)
    );
  }

  // ── Payback year ──────────────────────────────────────────────────────────
  if (indicatorId === 'payback_year') {
    if (!geoidStr) return null;
    const history = state.history ?? [];
    if (!history.length) return null;
    const capex = capexForGeoid(state, geoidStr);
    if (capex <= 0) return null;
    if (!state.county_fiscal[geoidStr]) return null;
    const baselinePt = history[0]?.counties?.[geoidStr]?.property_tax ?? 0;
    let cumulative = 0;
    for (const snap of history) {
      const pt = snap.counties?.[geoidStr]?.property_tax ?? 0;
      cumulative += (pt - baselinePt);
      if (cumulative >= capex) return snap.year;
    }
    return null;
  }

  // ── Service funding per capita ─────────────────────────────────────────────
  if (indicatorId === 'service_funding_per_capita') {
    if (!geoidStr) return null;
    const cf = state.county_fiscal[geoidStr];
    if (!cf) return null;
    const sfn = cf.school_finance_net ?? 0;
    const pop = denominator !== undefined
      ? denominator
      : (state.county_ees[geoidStr]?.population || 1);
    return sfn / Math.max(pop, 1);
  }

  // ── Labor utilization ─────────────────────────────────────────────────────
  if (indicatorId === 'labor_utilization') {
    if (!geoidStr) return null;
    const workforce = incomingConstructionWorkforce(state, geoidStr);
    const emp = baselineEmployment(state, geoidStr);
    return workforce / Math.max(emp, 1);
  }

  // ── Labor headroom ────────────────────────────────────────────────────────
  if (indicatorId === 'labor_headroom') {
    if (!geoidStr) return null;
    const lu = computeIndicator(state, 'labor_utilization', scale, geoidStr, denominator);
    if (lu === null) return null;
    return Math.max(0, 1 - lu);
  }

  // ── Firm margin ───────────────────────────────────────────────────────────
  if (indicatorId === 'firm_margin') {
    if (!geoidStr) return null;
    const busId = primaryBusForGeoid(state, geoidStr);
    if (!busId) return null;
    const bs = state.bus_state[busId];
    if (!bs) return null;
    const firmCap = bs.firm_capacity_mw ?? 0;
    const load = bs.load_mw ?? 0;
    return (firmCap - load) / Math.max(firmCap, 1);
  }

  // ── Housing pressure ──────────────────────────────────────────────────────
  if (indicatorId === 'housing_pressure') {
    if (!geoidStr) return null;
    const housing = state.asset_registry.find(
      a => a.asset_class === 'housing_stock' && a.geoid === geoidStr,
    );
    return housing?.housing_pressure_ratio ?? null;
  }

  // ── Pool utilization ──────────────────────────────────────────────────────
  if (POOL_UTILIZATION_IDS.includes(indicatorId)) {
    const poolKey = POOL_INDICATOR_TO_KEY[indicatorId];
    if (!poolKey) return null; // stub
    const pools = state.sc_pools as unknown as Record<string, { capacity_per_year: number; used_this_year: number }>;
    const pool = pools[poolKey];
    if (!pool) return null;
    return pool.used_this_year / Math.max(pool.capacity_per_year, 1);
  }

  // Should not reach here
  throw new Error(`Unhandled indicatorId: "${indicatorId}"`);
}

/**
 * Compact per-year snapshot for history recording.
 * Called by advanceYear at the END of the year.
 */
export function snapshotIndicators(state: EngineState): IndicatorSnapshot {
  const year = state.year;

  // Study-scale EES (population-weighted mean)
  const vals = Object.values(state.county_ees);
  let studyE: number | null = null;
  let studyEc: number | null = null;
  let studyS: number | null = null;
  if (vals.length > 0) {
    const totalPop = vals.reduce((s, v) => s + (v.population || 1), 0);
    if (totalPop > 0) {
      studyE  = vals.reduce((s, v) => s + v.E  * (v.population || 1), 0) / totalPop;
      studyEc = vals.reduce((s, v) => s + v.Ec * (v.population || 1), 0) / totalPop;
      studyS  = vals.reduce((s, v) => s + v.S  * (v.population || 1), 0) / totalPop;
    } else {
      const n = vals.length;
      studyE  = vals.reduce((s, v) => s + v.E,  0) / n;
      studyEc = vals.reduce((s, v) => s + v.Ec, 0) / n;
      studyS  = vals.reduce((s, v) => s + v.S,  0) / n;
    }
  }

  const study = {
    E:  studyE  !== null ? roundTo(studyE,  6) : null,
    Ec: studyEc !== null ? roundTo(studyEc, 6) : null,
    S:  studyS  !== null ? roundTo(studyS,  6) : null,
  };

  // Per-county snapshots (fiscal counties only = WY)
  const counties: IndicatorSnapshot['counties'] = {};
  for (const [geoid, cf] of Object.entries(state.county_fiscal)) {
    const ees = state.county_ees[geoid] ?? { E: 0, Ec: 0, S: 0, population: 1 };
    const pop = ees.population || 1;

    const cumulativeNet =
      (cf.ledger_a_cumulative_delta ?? 0) +
      (cf.ledger_b_cumulative_delta ?? 0) +
      (cf.ledger_c_cumulative_delta ?? 0);

    const workforce = incomingConstructionWorkforce(state, geoid);
    const emp = baselineEmployment(state, geoid);
    const laborUtil = workforce / Math.max(emp, 1);

    const sfpc = (cf.school_finance_net ?? 0) / Math.max(pop, 1);

    counties[geoid] = {
      E:  roundTo(ees.E  ?? 0, 6),
      Ec: roundTo(ees.Ec ?? 0, 6),
      S:  roundTo(ees.S  ?? 0, 6),
      property_tax:               roundTo(cf.property_tax ?? 0, 2),
      cumulative_net:             roundTo(cumulativeNet, 2),
      labor_utilization:          roundTo(laborUtil, 6),
      service_funding_per_capita: roundTo(sfpc, 4),
      // v4.2: live demographic denominators — advance_population runs before this snapshot
      population:              ees.population ?? 0,
      working_age_population:  ees.working_age_population ?? 0,
    };
  }

  // Pool utilization (short-name keys, strip "pool_utilization_" prefix)
  const pools: Record<string, number | null> = {};
  const scPools = state.sc_pools as unknown as Record<string, { capacity_per_year: number; used_this_year: number }>;
  for (const indicatorId of POOL_UTILIZATION_IDS) {
    const shortKey = indicatorId.replace('pool_utilization_', '');
    const poolKey = POOL_INDICATOR_TO_KEY[indicatorId];
    if (!poolKey) {
      pools[shortKey] = null;
    } else {
      const pool = scPools[poolKey];
      pools[shortKey] = pool
        ? pool.used_this_year / Math.max(pool.capacity_per_year, 1)
        : null;
    }
  }

  return { year, study, counties, pools };
}
