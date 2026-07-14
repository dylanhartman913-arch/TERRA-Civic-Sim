/**
 * climate_couplings.ts — TERRA C3 Climate Coupling Functions
 *
 * Pure functions that compute climate-driven modifiers for demand, water-stress,
 * and heat derates. No engine state is stored; every function takes
 * (geoid, year, climate_context) and returns a modifier + attribution dict.
 *
 * Mirrors src/climate_couplings.py exactly for digest parity.
 *
 * Design constraints (C0/C1.6):
 *   - Delta coupling only: Δ = scenario_value − historical_value
 *   - p50 only in physics (p10/p90 are for UI fan displays)
 *   - Epoch interpolation: linear between windows, no extrapolation past last window
 *   - Historical lens → all couplings return identity (1.0)
 */

import type { ClimateContext } from './types.js';

// ── Epoch doctrine (frozen from NB23c / county_climate_projections.json) ─────

export const EPOCH_MIDPOINTS: [string, number][] = [
  ['2030', 2030.0],
  ['2040', 2040.0],
  ['2050', 2050.0],
  ['2065', 2065.0],
];

// Thermal fuel types affected by water-stress and heat derates
export const THERMAL_DERATE_FUELS = new Set(['coal', 'gas', 'nuclear']);

// ── Demand coupling coefficients ─────────────────────────────────────────────

export const DEMAND_COEFFICIENTS = {
  beta_cdd: 0.0001,    // +0.01% demand per CDD of warming
  beta_hdd: 0.00002,   // +0.002% demand per HDD of warming
  confidence: 'medium' as const,
} as const;

// ── Water stress derate coefficients ─────────────────────────────────────────

export const WATER_STRESS_DERATE = {
  sensitivity_per_unit_wsi: 0.30,
  max_derate: 0.15,
  confidence: 'low' as const,
} as const;

// ── Heat derate coefficients ─────────────────────────────────────────────────

export const HEAT_DERATE = {
  sensitivity_per_day_gt_95f: 0.0005,
  max_derate: 0.05,
  confidence: 'medium' as const,
  gaps: [
    'transmission_thermal_limit: no per-branch thermal rating hook exists in engine — deferred to C4/C5',
  ],
} as const;


// ═════════════════════════════════════════════════════════════════════════════
// Epoch interpolation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Linearly interpolate a delta value for a given county and run year.
 * Clamps to endpoints (no extrapolation per doctrine).
 * Returns 0.0 if geoid not in table.
 */
export function interpolateEpochValue(
  variableTable: Record<string, Record<string, number>>,
  geoid: string,
  year: number,
): number {
  const geoidData = variableTable[geoid];
  if (!geoidData) return 0.0;

  const midpoints = EPOCH_MIDPOINTS;
  const n = midpoints.length;

  // Clamp to first epoch
  if (year <= midpoints[0][1]) {
    return geoidData[midpoints[0][0]] ?? 0.0;
  }

  // Clamp to last epoch
  if (year >= midpoints[n - 1][1]) {
    return geoidData[midpoints[n - 1][0]] ?? 0.0;
  }

  // Find bounding epochs and interpolate
  for (let i = 0; i < n - 1; i++) {
    const [eLo, yLo] = midpoints[i];
    const [eHi, yHi] = midpoints[i + 1];
    if (yLo <= year && year <= yHi) {
      const vLo = geoidData[eLo] ?? 0.0;
      const vHi = geoidData[eHi] ?? 0.0;
      const weight = (year - yLo) / (yHi - yLo);
      return vLo + (vHi - vLo) * weight;
    }
  }

  // Fallback (should not reach)
  return 0.0;
}


// ═════════════════════════════════════════════════════════════════════════════
// Coupling functions — each returns {modifier/derate_factor, attribution}
// ═════════════════════════════════════════════════════════════════════════════

export interface DemandModifierResult {
  modifier: number;
  delta_cdd: number;
  delta_hdd: number;
  beta_cdd: number;
  beta_hdd: number;
  confidence: string;
  narrative: string;
}

export function computeDemandModifier(
  geoid: string,
  year: number,
  climateContext: ClimateContext,
): DemandModifierResult {
  if (climateContext.lens === 'historical') {
    return {
      modifier: 1.0,
      delta_cdd: 0.0, delta_hdd: 0.0,
      beta_cdd: DEMAND_COEFFICIENTS.beta_cdd,
      beta_hdd: DEMAND_COEFFICIENTS.beta_hdd,
      confidence: DEMAND_COEFFICIENTS.confidence,
      narrative: 'historical lens — no demand modulation',
    };
  }

  const tables = climateContext.tables ?? {};
  const beta_cdd = DEMAND_COEFFICIENTS.beta_cdd;
  const beta_hdd = DEMAND_COEFFICIENTS.beta_hdd;

  const delta_cdd = interpolateEpochValue(tables['cdd'] ?? {}, geoid, year);
  const delta_hdd = interpolateEpochValue(tables['hdd'] ?? {}, geoid, year);

  const modifier = 1.0 + beta_cdd * delta_cdd + beta_hdd * delta_hdd;

  const cddPct = beta_cdd * delta_cdd * 100.0;
  const hddPct = beta_hdd * delta_hdd * 100.0;
  const totalPct = (modifier - 1.0) * 100.0;

  return {
    modifier,
    delta_cdd, delta_hdd,
    beta_cdd, beta_hdd,
    confidence: DEMAND_COEFFICIENTS.confidence,
    narrative: `demand ${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}% = ΔCDD ${delta_cdd.toFixed(1)} × β ${(beta_cdd * 100).toFixed(3)}%/CDD (${cddPct >= 0 ? '+' : ''}${cddPct.toFixed(2)}%) + ΔHDD ${delta_hdd.toFixed(1)} × β ${(beta_hdd * 100).toFixed(4)}%/HDD (${hddPct >= 0 ? '+' : ''}${hddPct.toFixed(2)}%)`,
  };
}


export interface WaterStressResult {
  derate_factor: number;
  delta_wsi: number;
  sensitivity: number;
  confidence: string;
  narrative: string;
}

export function computeWaterStressDerate(
  geoid: string,
  year: number,
  climateContext: ClimateContext,
): WaterStressResult {
  if (climateContext.lens === 'historical') {
    return {
      derate_factor: 1.0,
      delta_wsi: 0.0,
      sensitivity: WATER_STRESS_DERATE.sensitivity_per_unit_wsi,
      confidence: WATER_STRESS_DERATE.confidence,
      narrative: 'historical lens — no water-stress derate',
    };
  }

  const tables = climateContext.tables ?? {};
  const sensitivity = WATER_STRESS_DERATE.sensitivity_per_unit_wsi;
  const maxDerate = WATER_STRESS_DERATE.max_derate;

  const deltaWsi = interpolateEpochValue(tables['water_stress_index'] ?? {}, geoid, year);

  const rawDerate = sensitivity * Math.max(0.0, deltaWsi);
  const cappedDerate = Math.min(rawDerate, maxDerate);
  const derateFactor = 1.0 - cappedDerate;

  return {
    derate_factor: derateFactor,
    delta_wsi: deltaWsi,
    sensitivity,
    confidence: WATER_STRESS_DERATE.confidence,
    narrative: `water-stress derate ${(-cappedDerate * 100).toFixed(2)}% = ΔWSI ${deltaWsi.toFixed(4)} × sensitivity ${sensitivity}/WSI (capped at ${(maxDerate * 100).toFixed(0)}%)`,
  };
}


export interface HeatDerateResult {
  derate_factor: number;
  delta_days_gt_95f: number;
  sensitivity: number;
  confidence: string;
  narrative: string;
  gaps: string[];
}

export function computeHeatDerate(
  geoid: string,
  year: number,
  climateContext: ClimateContext,
): HeatDerateResult {
  if (climateContext.lens === 'historical') {
    return {
      derate_factor: 1.0,
      delta_days_gt_95f: 0.0,
      sensitivity: HEAT_DERATE.sensitivity_per_day_gt_95f,
      confidence: HEAT_DERATE.confidence,
      narrative: 'historical lens — no heat derate',
      gaps: [],
    };
  }

  const tables = climateContext.tables ?? {};
  const sensitivity = HEAT_DERATE.sensitivity_per_day_gt_95f;
  const maxDerate = HEAT_DERATE.max_derate;

  const deltaD95 = interpolateEpochValue(tables['days_gt_95f'] ?? {}, geoid, year);

  const rawDerate = sensitivity * Math.max(0.0, deltaD95);
  const cappedDerate = Math.min(rawDerate, maxDerate);
  const derateFactor = 1.0 - cappedDerate;

  return {
    derate_factor: derateFactor,
    delta_days_gt_95f: deltaD95,
    sensitivity,
    confidence: HEAT_DERATE.confidence,
    narrative: `heat derate ${(-cappedDerate * 100).toFixed(2)}% = Δdays>95°F ${deltaD95.toFixed(1)} × sensitivity ${sensitivity}/day (capped at ${(maxDerate * 100).toFixed(0)}%)`,
    gaps: [...HEAT_DERATE.gaps],
  };
}
