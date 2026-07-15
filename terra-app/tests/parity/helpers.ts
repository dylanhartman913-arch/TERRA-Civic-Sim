/**
 * Shared helpers for golden-file parity tests.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeState } from '../../src/engine/engine.js';
import type { EngineState, CountyEESBaseline, CrosswalkRow, ActionLibrary, InitialNetwork, FiscalBaseline, FiscalCoefficients, AnyExistingAsset, ProductionAsset, PopulationProjection } from '../../src/engine/types.js';

/** Marker: serialize a JS number as Python would serialize a float (e.g. 0 → "0.0"). */
class PyFloat {
  constructor(public readonly value: number) {}
}

const DATA_DIR = resolve(__dirname, '../../src/data');
const FIXTURE_DIR = resolve(__dirname, 'fixtures');

export function loadFixture(name: string): Record<string, unknown> {
  const raw = readFileSync(resolve(FIXTURE_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw);
}

/** Load county_population_projections.json (v4.2). Optional — returns undefined if not present. */
function loadPopulationProjections(): Record<string, PopulationProjection> | undefined {
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_population_projections.json'), 'utf-8'));
    return raw.counties as Record<string, PopulationProjection>;
  } catch { return undefined; }
}

export function loadInitialState(): EngineState {
  const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
  const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
  const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
  const initialNetwork: InitialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
  const countyCards: Record<string, unknown> = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));

  // v2.1 fiscal data
  let fiscalBaseline: FiscalBaseline | undefined;
  let fiscalCoefficients: FiscalCoefficients | undefined;
  try {
    fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
    fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
  } catch {
    // Fiscal data optional — existing tests still work without it
  }

  // v3.3 housing baseline
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }

  return initializeState(baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025, fiscalBaseline, fiscalCoefficients, undefined, undefined, housingBaselineData, loadPopulationProjections());
}

/** Load initial state with EIA-860 baseline retirement schedules applied. */
export function loadInitialStateWithRetirements(): EngineState {
  const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
  const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
  const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
  const initialNetwork: InitialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
  const countyCards: Record<string, unknown> = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));
  let fiscalBaseline: FiscalBaseline | undefined;
  let fiscalCoefficients: FiscalCoefficients | undefined;
  try {
    fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
    fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  const retirements = JSON.parse(readFileSync(resolve(DATA_DIR, 'baseline_retirements.json'), 'utf-8'));
  // Strip _meta key — only geoid keys pass through
  const { _meta, ...retirementData } = retirements;

  // v3.1 lifecycle coefficients
  let lifecycleCoefficients: Record<string, unknown> | undefined;
  try {
    lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }

  // v3.3 housing baseline
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }

  return initializeState(baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025, fiscalBaseline, fiscalCoefficients, retirementData, lifecycleCoefficients, housingBaselineData, loadPopulationProjections());
}

/** Load initial state with anchors + exposure tags (for C2 coverage and inertness tests). */
export function loadInitialStateWithAnchorsAndTags(): EngineState {
  const baseline: CountyEESBaseline[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'));
  const crosswalk: CrosswalkRow[] = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'));
  const actionLibrary: ActionLibrary = JSON.parse(readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'));
  const initialNetwork: InitialNetwork = JSON.parse(readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'));
  const countyCards: Record<string, unknown> = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'));
  let fiscalBaseline: FiscalBaseline | undefined;
  let fiscalCoefficients: FiscalCoefficients | undefined;
  try {
    fiscalBaseline = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_baseline.json'), 'utf-8'));
    fiscalCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'fiscal_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  const retirements = JSON.parse(readFileSync(resolve(DATA_DIR, 'baseline_retirements.json'), 'utf-8'));
  const { _meta, ...retirementData } = retirements;
  let lifecycleCoefficients: Record<string, unknown> | undefined;
  try {
    lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }
  const anchorFacilities = JSON.parse(readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'));
  const exposureTagData = JSON.parse(readFileSync(resolve(DATA_DIR, 'asset_exposure_tags.json'), 'utf-8'));

  return initializeState(
    baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025,
    fiscalBaseline, fiscalCoefficients, retirementData, lifecycleCoefficients,
    housingBaselineData, loadPopulationProjections(), undefined, anchorFacilities, exposureTagData,
  );
}

/**
 * Relative tolerance check matching the Python golden fixture contract.
 * |ts_value - py_value| / max(|py_value|, 1e-10) < tolerance
 */
export function relClose(tsVal: number, pyVal: number, tol: number = 1e-6): boolean {
  return Math.abs(tsVal - pyVal) / Math.max(Math.abs(pyVal), 1e-10) < tol;
}

/**
 * Compute the canonical state digest md5, matching the Python state_digest() exactly.
 *
 * Digest structure:
 * - county_ees: {geoid: {E: round(6), Ec: round(6), S: round(6)}}
 * - bus_state_summary: for buses with cap>0 OR load>0 OR deficit>0: {bid: {capacity_mw: round(4), load_mw: round(4), deficit_mw: round(4)}}
 * - active_couplings: array of coupling objects
 * - sc_pools: {pool_name: {capacity_per_year, used_this_year}}
 * - year: number
 *
 * MD5 of JSON.stringify with sorted keys and no whitespace.
 */
export function computeDigestMd5(state: EngineState, climateLens?: string): { digest: Record<string, unknown>; md5: string } {
  // County EES
  const countyEes: Record<string, { E: PyFloat; Ec: PyFloat; S: PyFloat }> = {};
  for (const [geoid, ees] of Object.entries(state.county_ees)) {
    countyEes[geoid] = {
      E: new PyFloat(roundTo(ees.E, 6)),
      Ec: new PyFloat(roundTo(ees.Ec, 6)),
      S: new PyFloat(roundTo(ees.S, 6)),
    };
  }

  // Bus state summary (only buses with non-zero activity)
  const busSummary: Record<string, { capacity_mw: PyFloat; load_mw: PyFloat; deficit_mw: PyFloat }> = {};
  for (const [bid, bs] of Object.entries(state.bus_state)) {
    const cap = bs.capacity_mw || 0;
    const load = bs.load_mw || 0;
    const deficit = bs.deficit_mw || 0;
    if (cap > 0 || load > 0 || deficit > 0) {
      busSummary[bid] = {
        capacity_mw: new PyFloat(roundTo(cap, 4)),
        load_mw: new PyFloat(roundTo(load, 4)),
        deficit_mw: new PyFloat(roundTo(deficit, 4)),
      };
    }
  }

  const scPools: Record<string, { capacity_per_year: number; used_this_year: number }> = {};
  for (const [k, v] of Object.entries(state.sc_pools)) {
    scPools[k] = {
      capacity_per_year: (v as { capacity_per_year: number }).capacity_per_year || 0,
      used_this_year: (v as { used_this_year: number }).used_this_year || 0,
    };
  }

  const digest: Record<string, unknown> = {
    county_ees: countyEes,
    bus_state_summary: busSummary,
    active_couplings: state.active_couplings,
    sc_pools: scPools,
    year: state.year,
  };

  // C0/C3: lens contributes to digest ONLY when non-historical.
  const effectiveLens = climateLens ?? 'historical';
  if (effectiveLens !== 'historical') {
    digest['climate_lens'] = effectiveLens;
  }

  // Canonical JSON: sorted keys, no whitespace (matches Python's json.dumps(sort_keys=True, separators=(',',':')))
  const canonical = canonicalJson(digest);
  const md5 = createHash('md5').update(canonical).digest('hex');

  return { digest, md5 };
}

/**
 * Produce a canonical JSON string with sorted keys at all levels and no whitespace,
 * matching Python's json.dumps(obj, sort_keys=True, separators=(',', ':')).
 */
function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (obj instanceof PyFloat) {
    const n = obj.value;
    // Python: json.dumps(float) always includes decimal point for whole numbers
    if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
      return n.toFixed(1); // 0 → "0.0", 50 → "50.0"
    }
    return JSON.stringify(n);
  }
  if (typeof obj === 'number') return formatNumber(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  // Object with sorted keys
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Format a number to match Python's JSON serialization behavior.
 * Python uses repr-style float formatting: no trailing zeros beyond what's needed,
 * integers render as "1" not "1.0".
 */
function formatNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
    return String(n);
  }
  // Match Python's default float formatting
  // Python json.dumps produces things like "2.3531", "0.0", "1208.3"
  // JSON.stringify in JS matches this for most cases
  const s = JSON.stringify(n);
  return s;
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Compute the fiscal digest md5, matching the Python fiscal_digest() exactly.
 * Covers state.county_fiscal: assessed values, revenue fields, ledger deltas.
 */
export function computeFiscalDigestMd5(state: EngineState): { digest: Record<string, unknown>; md5: string } {
  const countyFiscal = state.county_fiscal || {};
  if (Object.keys(countyFiscal).length === 0) {
    const md5 = createHash('md5').update('{}').digest('hex');
    return { digest: { county_fiscal: {} }, md5 };
  }

  const digestData: Record<string, Record<string, PyFloat>> = {};
  const geoids = Object.keys(countyFiscal).sort();
  for (const geoid of geoids) {
    const cf = countyFiscal[geoid];
    digestData[geoid] = {
      assessed_mineral: new PyFloat(roundTo(cf.assessed_mineral, 2)),
      assessed_industrial: new PyFloat(roundTo(cf.assessed_industrial, 2)),
      assessed_commercial: new PyFloat(roundTo(cf.assessed_commercial, 2)),
      assessed_residential: new PyFloat(roundTo(cf.assessed_residential, 2)),
      assessed_agricultural: new PyFloat(roundTo(cf.assessed_agricultural, 2)),
      assessed_all_other: new PyFloat(roundTo(cf.assessed_all_other, 2)),
      mill_levy_mills: new PyFloat(roundTo(cf.mill_levy_mills, 6)),
      property_tax: new PyFloat(roundTo(cf.property_tax, 2)),
      advalorem_production: new PyFloat(roundTo(cf.advalorem_production, 2)),
      severance_share: new PyFloat(roundTo(cf.severance_share, 2)),
      federal_royalty_share: new PyFloat(roundTo(cf.federal_royalty_share, 2)),
      sales_use: new PyFloat(roundTo(cf.sales_use, 2)),
      pilt: new PyFloat(roundTo(cf.pilt, 2)),
      school_finance_net: new PyFloat(roundTo(cf.school_finance_net, 2)),
      school_finance_mineral_share: new PyFloat(roundTo(cf.school_finance_mineral_share, 6)),
      ledger_a_cumulative_delta: new PyFloat(roundTo(cf.ledger_a_cumulative_delta, 2)),
      ledger_b_cumulative_delta: new PyFloat(roundTo(cf.ledger_b_cumulative_delta, 2)),
      ledger_c_cumulative_delta: new PyFloat(roundTo(cf.ledger_c_cumulative_delta, 2)),
    };
  }

  const digest: Record<string, unknown> = {
    county_fiscal: digestData,
    year: state.year,
  };

  const canonical = canonicalJson(digest);
  const md5 = createHash('md5').update(canonical).digest('hex');

  return { digest, md5 };
}

/**
 * Compute the existing_assets digest md5, matching the Python existing_assets_digest() exactly.
 * Uses PyFloat for numeric fields to match Python's JSON float serialization.
 */
export function computeExistingAssetsDigestMd5(state: EngineState): { digest: Record<string, unknown>; md5: string } {
  const ea = state.existing_assets || {};
  const digestData: Record<string, unknown[]> = {};
  const geoids = Object.keys(ea).sort();
  for (const geoid of geoids) {
    digestData[geoid] = (ea[geoid] as AnyExistingAsset[]).map((e: AnyExistingAsset) => {
      const pa = e.asset_kind === 'production_asset' ? (e as ProductionAsset) : null;
      return {
        advalorem_rate_per_unit: pa && pa.advalorem_rate_per_unit !== null ? new PyFloat(pa.advalorem_rate_per_unit) : null,
        assessed_delta_per_unit: pa && pa.assessed_delta_per_unit !== null ? new PyFloat(pa.assessed_delta_per_unit) : null,
        asset_kind: e.asset_kind ?? null,
        capacity_mw: e.capacity_mw !== null ? new PyFloat(e.capacity_mw as number) : null,
        coal_tons_yr: e.coal_tons_yr !== null ? new PyFloat(e.coal_tons_yr as number) : null,
        commodity: pa ? pa.commodity : null,
        county_distribution_share: pa ? new PyFloat(pa.county_distribution_share) : null,
        excluded: e.excluded ?? null,
        fiscal_action_id: e.fiscal_action_id ?? null,
        name: e.name,
        production_unit: pa ? pa.production_unit : null,
        production_volume: pa ? new PyFloat(pa.production_volume) : null,
        status: e.status,
        type: e.type,
      };
    });
  }
  const digest: Record<string, unknown> = { existing_assets: digestData };
  const canonical = canonicalJson(digest);
  const md5 = createHash('md5').update(canonical).digest('hex');
  return { digest, md5 };
}
