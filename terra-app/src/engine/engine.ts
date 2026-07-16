/**
 * TERRA Engine v4.1 — TypeScript port.
 * Pure functions only. No mutation of input state, no React imports, no side effects.
 * Uses structural sharing (deep-clone mutable stores, share immutable references).
 * v2.4 adds full three-ledger X2 support: Ledger A (advalorem) + Ledger C (school finance
 * recapture sensitivity) wired into reduceProductionAsset alongside Ledger B (severance).
 * v3.0: unified asset_registry; v3.1: PRB coal decline + reclamation arc; v3.3: housing_stock.
 * v4.0 (Z3): indicator catalog, per-year history snapshots, projection API, Golden J.
 * v4.1 (Z4): site asset class, succession discounts in queueAction, workforce pool decay
 * in advanceYear. coal_to_smr generalised as convert transition (TX waiver from site;
 * TTD/capex NOT discounted — brownfield premium already in cost_2024). Golden I.
 */

import { snapshotIndicators } from './indicators.js';
import {
  computeDemandModifier,
  computeWaterStressDerate,
  computeHeatDerate,
  THERMAL_DERATE_FUELS,
} from './climate_couplings.js';
import { sampleClimateHazardEvents } from './events.js';

// ── Pure-JS MD5 (RFC 1321) — browser + Node compatible ─────────────────────
// Produces byte-identical output to Node's createHash('md5').update(s).digest('hex').
function computeMd5Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const msgLen = bytes.length;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[msgLen] = 0x80;
  const bitLen = msgLen * 8;
  padded[paddedLen - 8] = bitLen & 0xff;
  padded[paddedLen - 7] = (bitLen >>> 8) & 0xff;
  padded[paddedLen - 6] = (bitLen >>> 16) & 0xff;
  padded[paddedLen - 5] = (bitLen >>> 24) & 0xff;
  const T = Array.from({ length: 64 }, (_, i) => (Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)) | 0);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M.push(view.getUint32(offset + j * 4, true) | 0);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const temp = (f + a + T[i] + M[g]) | 0;
      const s = S[i];
      a = d; d = c; c = b;
      b = (b + ((temp << s) | (temp >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map(x => {
    const bs = [(x) & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff];
    return bs.map(n => (n & 0xff).toString(16).padStart(2, '0')).join('');
  }).join('');
}
import type {
  EngineState,
  IndicatorSnapshot,
  CountyEES,
  CountyEESBaseline,
  PopulationProjection,
  PopulationConfig,
  ClimateContext,
  EcoregionEES,
  Bus,
  Branch,
  BusState,
  ActiveCoupling,
  BuildQueueItem,
  ScPools,
  ScPool,
  CrosswalkRow,
  ActionLibrary,
  ActionRecord,
  InitialNetwork,
  DeltaSummary,
  DisturbanceDeltaSummary,
  ActionHistoryRecord,
  DisturbanceHistoryRecord,
  MaterialLedgerEntry,
  MaterialLedgerSummary,
  EESSummary,
  EESSummaryLevel,
  EcoregionSummaryLevel,
  BASummaryLevel,
  StudyAreaSummary,
  NearestScenario,
  CountyCard,
  CountyFiscal,
  FiscalAction,
  FiscalBaseline,
  FiscalCoefficients,
  FiscalDelta,
  PathwayConditions,
  ScenarioProfile,
  TargetGap,
  ExistingAsset,
  ProductionAsset,
  AnyExistingAsset,
  AssetInstance,
  ExposureTagSet,
  ClimateHazardEvent,
  ClimateHazardSamplingInput,
} from './types.js';
import { EMPTY_CLIMATE_CONTEXT } from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const FIRM_FUEL_TYPES = new Set(['nuclear', 'gas', 'coal', 'hydro', 'geothermal', 'storage']);

const PRB_COAL_TONS_PER_MW_YR = 3743.4; // EIA-923 heat-rate proxy (W2 severance source)

/** C4-i engine boundary: pure event sampling, with no consequence coupling. */
export function sampleHazardEvents(
  state: EngineState,
  input: ClimateHazardSamplingInput,
): ClimateHazardEvent[] {
  // Deliberately read no state fields: action history and decisions are exogenous.
  void state;
  return sampleClimateHazardEvents(input);
}

// EIA-7A / MSHA 2024 county coal production (X2 production_asset seeds)
// Source: EIA Annual Coal Report Table 2 (2024); MSHA Form 7000-2; released Nov 2025
const EIA_7A_CAMPBELL_COAL_2024 = 170_045_000; // short tons/yr (surface, 11 mines)
const EIA_7A_WY_COAL_2024       = 190_731_000; // short tons/yr WY state total

// Static production_asset data keyed by "geoid|name".
// Only entries with confirmed EIA-7A/MSHA figures. Others deferred (MANUAL_FETCH Item 1).
const PRODUCTION_ASSET_DATA: Record<string, Omit<ProductionAsset,
  'asset_kind' | 'name' | 'geoid' | 'county_name' | 'state' | 'type' |
  'status' | 'source_url' | 'operational_year' |
  'capacity_mw' | 'coal_tons_yr' | 'production_proxy' | 'fiscal_action_id' | 'excluded'
>> = {
  '56005|Powder River Basin Coal Mines': {
    commodity: 'coal_surface',
    production_volume: EIA_7A_CAMPBELL_COAL_2024,
    production_unit: 'tons_yr',
    production_confidence: 'high',
    production_source: 'EIA Annual Coal Report Table 2 (2024); MSHA Form 7000-2; EIA release Nov 2025',
    data_year: 2024,
    effective_severance_rate_per_unit: 0.5683,
    county_distribution_share: Math.round(EIA_7A_CAMPBELL_COAL_2024 / EIA_7A_WY_COAL_2024 * 1e8) / 1e8,
    // Ad valorem: (assessed_mineral × 0.90 coal fraction × 62.836 mills) / production_volume
    // = $214,770,174 / 170,045,000 = $1.263020/ton (confidence: low — uses W2 90% proxy)
    advalorem_rate_per_unit: 1.263020,
    // Mineral AV change per ton: -(assessed_mineral × 0.90) / production_volume
    // = -$3,417,947,903 / 170,045,000 = -$20.100255/ton  (for Ledger C recapture sensitivity)
    assessed_delta_per_unit: -20.100255,
    // Direct mining employment: BLS QCEW 2022, NAICS 2121, Campbell County WY.
    // 11 surface mines; figure is consistent with EIA-7A productivity ratios.
    // Confidence: medium (BLS QCEW establishment-level suppression may affect total).
    employment_direct: 4200,
  },
};

const ASSET_TYPE_TO_FISCAL_ACTION: Record<string, string | null> = {
  coal: 'coal_to_solar',
  nuclear: 'smr_advanced',
  data_center: 'data_center_hyperscale',
};

const DISTURBANCE_COEFFICIENTS: Record<string, Record<string, number>> = {
  heat_wave: {
    E_per_severity: -0.05,
    Ec_per_severity: -0.03,
    S_per_severity: -0.08,
    load_spike_fraction: 0.08,
  },
  drought: {
    E_per_year: -0.15, Ec_per_year: -0.10, S_per_year: -0.05,
    hydro_reduction_per_year: 0.15, max_hydro_reduction: 0.80,
  },
  mine_closure: {
    Ec_immediate: -0.25, S_immediate: -0.15, E_recovery_per_500mw: 0.10,
  },
  transmission_failure: {
    Ec_per_week: -0.05, S_per_week: -0.10,
  },
};

const BUCKET_TO_TIER: Record<string, string> = {
  energy_generation: 'energy', energy_storage: 'energy',
  energy_transmission: 'energy', energy_demand: 'energy',
  nuclear_fuel_cycle: 'energy',
  terrestrial_ecosystem: 'ecological', hydrological_restoration: 'ecological',
  settlement_social: 'social', economic_development: 'social',
  transport: 'social',
};

// ── Housing Stock Constants (v3.3) ──────────────────────────────────────────
// Construction workforce per MW by asset type — for boomtown housing-pressure model.
// Source: NREL JEDI model v2023; TerraPower Kemmerer Final EIS (nuclear: ~1,800 peak/345 MW ≈ 5.2)
const HOUSING_CONSTRUCTION_JOBS_PER_MW: Record<string, number> = {
  nuclear:     5.2,   // TerraPower Kemmerer EIS; NREL JEDI Nuclear
  coal:        2.0,   // NREL JEDI Coal
  gas:         1.4,   // NREL JEDI Natural Gas
  wind:        0.4,   // NREL JEDI Wind
  solar:       2.5,   // NREL JEDI Solar PV Utility
  storage:     0.5,   // Proxy; NREL ATB battery storage
  data_center: 3.0,   // Dodge Construction Network 2023; CBRE Data Center Report
  hydro:       1.5,   // NREL JEDI Hydropower
};
const HOUSEHOLD_FACTOR = 0.65; // Share of incoming workers forming separate households
                                // Source: NAHB "New Home Buyer Profile" 2023
const HOUSING_PRESSURE_THRESHOLDS = {
  mild:     1.05,
  moderate: 1.15,
  stressed: 1.25,
  crisis:   1.40,
};
const WY_RESIDENTIAL_ASSESSMENT_RATIO = 0.095; // W.S. 39-13-103
const HOUSING_UNIT_REHAB_VALUE_USD = 150_000;   // Enterprise Community Partners LIHTC 2022
// S-capital penalty per 0.05 step of pressure above moderate threshold (confidence: low)
const HOUSING_PRESSURE_S_PENALTY_PER_STEP = -0.005;

// ── Site Spawning / Succession Constants (v4.1) ─────────────────────────────
// Literature anchor — Kemmerer/Naughton brownfield precedent:
//   DOE (2022) coal-to-nuclear siting study; Gorman et al. (2022) LBNL.
//   Magnitudes are judgment-based (confidence: low throughout).
export interface SiteCompatEntry {
  compatible_actions: Set<string>;
  ttd_reduction_years: number;
  capex_discount_fraction: number;
  confidence: string;
}
export const SITE_COMPAT: Record<string, SiteCompatEntry> = {
  thermal: {
    compatible_actions: new Set(['smr_advanced', 'gas_combined_cycle']),
    ttd_reduction_years: 2,        // DOE (2022): 2-3 yr faster NRC permitting
    capex_discount_fraction: 0.15, // Gorman et al. (2022): ~15% overnight cost saving
    confidence: 'low',
  },
  generator: {
    compatible_actions: new Set([
      'battery_grid', 'pumped_hydro',
      'data_center_hyperscale', 'data_center_campus_phase',
    ]),
    ttd_reduction_years: 1,
    capex_discount_fraction: 0.10,
    confidence: 'low',
  },
  mine: {
    compatible_actions: new Set(['prairie_restoration', 'solar_utility', 'reclamation_tech']),
    ttd_reduction_years: 1,
    capex_discount_fraction: 0.20,
    confidence: 'low',
  },
  // v4.3 (F1): anchor-derived site classes
  industrial: {
    // Retired industrial_load anchor — DOE (2022); Gorman et al. (2022) brownfield analogues
    // NOTE: captive generation (smr_advanced) flagged but not listed — no precedent
    compatible_actions: new Set(['battery_grid', 'industrial_load_flexible']),
    ttd_reduction_years: 1,
    capex_discount_fraction: 0.10,
    confidence: 'low',
  },
  commercial: {
    // Retired commercial_anchor_load — DOE (2022); Carley et al. (2018)
    // NOTE: efficiency retrofit action not in library — flagged as known debt
    compatible_actions: new Set(['battery_grid', 'community_solar']),
    ttd_reduction_years: 1,
    capex_discount_fraction: 0.05,
    confidence: 'low',
  },
};

// coal_to_smr: TX waiver only (no TTD/capex — brownfield premium in cost_2024=$8,500,000/MW)
const COAL_TO_SMR_SITE_CLASS_COMPAT = 'thermal';

// ── Population / Migration Constants (v4.2) ─────────────────────────────────
// Employment-linked permanent in-migration from player-added operations jobs.
// Literature: Headwaters Economics (2017) "Energy Development and the Economy
//   in the West" — rural energy employment multipliers 1.4–2.0 for Mountain West.
//   Power et al. (2013) "Economic Assessment of Fossil Fuel Development in the
//   Mountain West" — household formation rates for energy-sector in-migrants.
// ACS 2022 Table B25010: 2.51 persons per occupied housing unit (national).
const AVG_HOUSEHOLD_SIZE = 2.51;        // ACS 2022 Table B25010
const ECONOMIC_BASE_MULTIPLIER = 1.5;   // Headwaters Economics (2017); confidence: low
const WORKING_AGE_SHARE_DEFAULT = 0.573; // ACS 2022 national; county overrides in projection file

// Ops workforce per MW by asset type — extends SITE_OPS_JOBS_PER_MW for population model.
// data_center added here (not in SITE_OPS_JOBS_PER_MW, which covers site-asset spawning).
const MIGRATION_OPS_JOBS_PER_MW: Record<string, number> = {
  coal: 0.28, gas: 0.10, nuclear: 0.38,
  wind: 0.04, solar: 0.02, hydro: 0.15,
  data_center: 3.0,  // CBRE Data Center Employment Trends Report (2023); O&M-only headcount
  storage: 0.05,     // Proxy (minimal O&M staff); NREL ATB
};

// Map action_id → fuel-type key for MIGRATION_OPS_JOBS_PER_MW lookup
const ACTION_ID_TO_MIGRATION_FUEL: Record<string, string> = {
  smr_advanced: 'nuclear', coal_to_smr: 'nuclear', fusion_pilot: 'nuclear',
  wind_utility: 'wind', offshore_wind_great_lakes: 'wind',
  solar_utility: 'solar', coal_to_solar: 'solar',
  gas_combined_cycle: 'gas',
  battery_grid: 'storage', hydrogen_electrolysis: 'storage',
  pumped_hydro: 'hydro', hydropower_small: 'hydro',
  data_center_hyperscale: 'data_center', data_center_campus_phase: 'data_center',
  industrial_load_flexible: 'data_center',
};

// Operations workforce proxy by asset type (NREL JEDI v2023, O&M only)
const SITE_OPS_JOBS_PER_MW: Record<string, number> = {
  coal: 0.28, gas: 0.10, nuclear: 0.38,
  wind: 0.04, solar: 0.02, hydro: 0.15,
};
const SITE_WORKFORCE_HALF_LIFE_YEARS = 5; // Carley et al. (2018) ~5 yr median attrition

// ── Asset Registry (v3.0) ──────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function resolveAssetClass(assetType: string, assetKind?: string): import('./types.js').AssetClass {
  if (assetKind === 'production_asset') return 'production';
  if (assetType === 'data_center') return 'demand';
  if (assetType === 'site') return 'site';
  return 'generator';
}

function seedAssetRegistry(
  countyCards: Record<string, unknown>,
  retirements?: Record<string, Record<string, { scheduled_retirement_year: number }>>,
): AssetInstance[] {
  const registry: AssetInstance[] = [];
  for (const [geoid, card] of Object.entries(countyCards)) {
    const cardObj = card as Record<string, unknown>;
    const flagships = (cardObj.flagship_assets as unknown[]) || [];
    if (!flagships.length) continue;
    const countyRetirements = retirements?.[geoid];
    for (const rawAsset of flagships) {
      const asset = rawAsset as Record<string, unknown>;
      const cap = asset.capacity_or_load_mw as number | null | undefined;
      const assetType = (asset.type as string) || 'unknown';
      const name = (asset.name as string) || '';
      const retirementEntry = countyRetirements?.[name];
      const retirementYear = retirementEntry?.scheduled_retirement_year ?? null;
      const base = {
        name,
        geoid,
        county_name: (asset.county_name as string) || '',
        state: (asset.state as string) || '',
        type: assetType,
        status: (asset.status as string) || '',
        source_url: (asset.source_url as string) || '',
        operational_year: (asset.operational_year as number | null) ?? null,
      };

      // Check production_asset data first
      const prodData = PRODUCTION_ASSET_DATA[`${geoid}|${name}`];
      if (prodData !== undefined) {
        registry.push({
          asset_id: `baseline_${geoid}_${slugify(name)}`,
          origin: 'baseline',
          lifecycle: 'operating',
          asset_class: 'production',
          ...base,
          capacity_mw: null,
          coal_tons_yr: null,
          production_proxy: null,
          fiscal_action_id: null,
          excluded: null,
          commodity: prodData.commodity,
          production_volume: prodData.production_volume,
          production_unit: prodData.production_unit,
          production_confidence: prodData.production_confidence,
          production_source: prodData.production_source,
          data_year: prodData.data_year,
          effective_severance_rate_per_unit: prodData.effective_severance_rate_per_unit,
          county_distribution_share: prodData.county_distribution_share,
          advalorem_rate_per_unit: prodData.advalorem_rate_per_unit ?? null,
          assessed_delta_per_unit: prodData.assessed_delta_per_unit ?? null,
          employment_direct: prodData.employment_direct ?? null,
          action_id: null,
          magnitude: null,
          decision_year: null,
          throttle_reason: null,
          commissioned: null,
          scheduled_retirement_year: retirementYear,
          // v3.1 reclamation tracking
          reclamation_year_log: [],
          active_reclamation_acres: 0.0,
          reclamation_jobs_direct: 0.0,
          // v3.2 decommissioning (null for production assets)
          decommissioning_cost_usd: null,
          decommissioning_labor_usd: null,
          decommissioning_duration_years: null,
          decommissioning_start_year: null,
          // v3.3 housing (null for production assets)
          housing_total_units: null, housing_occupied_units: null,
          housing_convertible_units: null, housing_subsidized_units: null,
          housing_permits_per_year: null, housing_affordable_added: null,
          housing_pressure_ratio: null, housing_seasonal_excluded: null,
          // v4.1 site mechanics (null for all non-site baseline assets)
          site_origin_asset_id: null, site_origin_type: null, site_class: null,
          interconnection_mw: null, water_rights_flag: null, acres: null,
          workforce_pool_initial: null, workforce_pool_current: null,
          workforce_pool_half_life_years: null, site_spawn_year: null,
          restoration_eligibility: null,
          // v4.1 succession discount tracking (null for baseline assets)
          succession_site_id: null, ttd_reduction_applied: null,
          capex_discount_fraction: null, tx_waiver_mw: null,
          convert_source_asset_id: null,
        });
      } else if (cap == null) {
        // Excluded entry (no MW conversion)
        registry.push({
          asset_id: `baseline_${geoid}_${slugify(name)}`,
          origin: 'baseline',
          lifecycle: 'operating',
          asset_class: resolveAssetClass(assetType),
          ...base,
          capacity_mw: null,
          coal_tons_yr: null,
          production_proxy: null,
          fiscal_action_id: null,
          excluded: 'no_mw_conversion',
          commodity: null,
          production_volume: null,
          production_unit: null,
          production_confidence: null,
          production_source: null,
          data_year: null,
          effective_severance_rate_per_unit: null,
          county_distribution_share: null,
          advalorem_rate_per_unit: null,
          assessed_delta_per_unit: null,
          employment_direct: null,
          action_id: null,
          magnitude: null,
          decision_year: null,
          throttle_reason: null,
          commissioned: null,
          scheduled_retirement_year: retirementYear,
          reclamation_year_log: null,
          active_reclamation_acres: null,
          reclamation_jobs_direct: null,
          decommissioning_cost_usd: null,
          decommissioning_labor_usd: null,
          decommissioning_duration_years: null,
          decommissioning_start_year: null,
          // v3.3 housing (null for excluded assets)
          housing_total_units: null, housing_occupied_units: null,
          housing_convertible_units: null, housing_subsidized_units: null,
          housing_permits_per_year: null, housing_affordable_added: null,
          housing_pressure_ratio: null, housing_seasonal_excluded: null,
          // v4.1 site mechanics (null for all non-site baseline assets)
          site_origin_asset_id: null, site_origin_type: null, site_class: null,
          interconnection_mw: null, water_rights_flag: null, acres: null,
          workforce_pool_initial: null, workforce_pool_current: null,
          workforce_pool_half_life_years: null, site_spawn_year: null,
          restoration_eligibility: null,
          // v4.1 succession discount tracking (null for baseline assets)
          succession_site_id: null, ttd_reduction_applied: null,
          capex_discount_fraction: null, tx_waiver_mw: null,
          convert_source_asset_id: null,
        });
      } else {
        // MW-based asset
        const capacity_mw = Number(cap);
        let coal_tons_yr: number | null = null;
        let production_proxy: number | null = null;
        if (assetType === 'coal') {
          coal_tons_yr = Math.round(capacity_mw * PRB_COAL_TONS_PER_MW_YR * 100) / 100;
          production_proxy = coal_tons_yr;
        }
        let fiscal_action_id: string | null = null;
        if (assetType === 'data_center') {
          fiscal_action_id = capacity_mw >= 150 ? 'data_center_campus_phase' : 'data_center_hyperscale';
        } else {
          fiscal_action_id = ASSET_TYPE_TO_FISCAL_ACTION[assetType] ?? null;
        }
        registry.push({
          asset_id: `baseline_${geoid}_${slugify(name)}`,
          origin: 'baseline',
          lifecycle: 'operating',
          asset_class: resolveAssetClass(assetType),
          ...base,
          capacity_mw,
          coal_tons_yr,
          production_proxy,
          fiscal_action_id,
          excluded: null,
          commodity: null,
          production_volume: null,
          production_unit: null,
          production_confidence: null,
          production_source: null,
          data_year: null,
          effective_severance_rate_per_unit: null,
          county_distribution_share: null,
          advalorem_rate_per_unit: null,
          assessed_delta_per_unit: null,
          employment_direct: null,
          action_id: null,
          magnitude: null,
          decision_year: null,
          throttle_reason: null,
          commissioned: null,
          scheduled_retirement_year: retirementYear,
          reclamation_year_log: null,
          active_reclamation_acres: null,
          reclamation_jobs_direct: null,
          decommissioning_cost_usd: null,
          decommissioning_labor_usd: null,
          decommissioning_duration_years: null,
          decommissioning_start_year: null,
          // v3.3 housing (null for MW-based generator assets)
          housing_total_units: null, housing_occupied_units: null,
          housing_convertible_units: null, housing_subsidized_units: null,
          housing_permits_per_year: null, housing_affordable_added: null,
          housing_pressure_ratio: null, housing_seasonal_excluded: null,
          // v4.1 site mechanics (null for all non-site baseline assets)
          site_origin_asset_id: null, site_origin_type: null, site_class: null,
          interconnection_mw: null, water_rights_flag: null, acres: null,
          workforce_pool_initial: null, workforce_pool_current: null,
          workforce_pool_half_life_years: null, site_spawn_year: null,
          restoration_eligibility: null,
          // v4.1 succession discount tracking (null for baseline assets)
          succession_site_id: null, ttd_reduction_applied: null,
          capex_discount_fraction: null, tx_waiver_mw: null,
          convert_source_asset_id: null,
        });
      }
    }
  }
  return registry;
}

// ── Housing Stock Seeding + Helpers (v3.3) ──────────────────────────────────

/** Seed one housing_stock AssetInstance per study county from ACS baseline. */
function seedHousingAssets(
  countyCards: Record<string, unknown>,
  housingBaseline: Record<string, unknown>,
): AssetInstance[] {
  const assets: AssetInstance[] = [];
  for (const [geoid, card] of Object.entries(countyCards)) {
    const cardObj = card as Record<string, unknown>;
    const hb = (housingBaseline[geoid] ?? {}) as Record<string, Record<string, unknown>>;
    const countyName = (cardObj.county_name as string) || geoid;
    const stateCode  = (cardObj.state as string) || '';

    const totalUnits   = (hb.total_units?.value   as number | null | undefined) ?? 0;
    const occupied     = (hb.occupied_units?.value as number | null | undefined) ?? 0;
    const convertible  = (hb.convertible_units?.value as number | null | undefined) ?? 0;
    const subsidized   = (hb.subsidized_units?.value  as number | null | undefined) ?? 0;
    const permitsVal   = (hb.permits_per_year?.value  as number | null | undefined) ?? 0;
    const seasonal     = (hb.seasonal_recreational_vacant?.value as number | null | undefined) ?? 0;

    assets.push({
      asset_id: `housing_${geoid}`,
      origin: 'baseline',
      lifecycle: 'operating',
      asset_class: 'housing_stock',
      name: `${countyName} Housing Stock`,
      geoid,
      county_name: countyName,
      state: stateCode,
      type: 'housing_stock',
      status: 'operating',
      source_url: 'ACS 2022 5-year',
      operational_year: null,
      // Non-applicable standard fields
      capacity_mw: null, coal_tons_yr: null, production_proxy: null,
      fiscal_action_id: null, excluded: null,
      commodity: null, production_volume: null, production_unit: null,
      production_confidence: null, production_source: null, data_year: null,
      effective_severance_rate_per_unit: null, county_distribution_share: null,
      advalorem_rate_per_unit: null, assessed_delta_per_unit: null, employment_direct: null,
      action_id: null, magnitude: null, decision_year: null,
      throttle_reason: null, commissioned: null, scheduled_retirement_year: null,
      reclamation_year_log: null, active_reclamation_acres: null, reclamation_jobs_direct: null,
      decommissioning_cost_usd: null, decommissioning_labor_usd: null,
      decommissioning_duration_years: null, decommissioning_start_year: null,
      // v3.3 housing stock fields
      housing_total_units:       Math.round(totalUnits),
      housing_occupied_units:    Math.round(occupied),
      housing_convertible_units: Math.round(convertible),
      housing_subsidized_units:  Math.round(subsidized),
      housing_permits_per_year:  permitsVal,
      housing_affordable_added:  0,
      housing_pressure_ratio:    null,
      housing_seasonal_excluded: Math.round(seasonal),
      // v4.1 site mechanics (null for housing_stock)
      site_origin_asset_id: null, site_origin_type: null, site_class: null,
      interconnection_mw: null, water_rights_flag: null, acres: null,
      workforce_pool_initial: null, workforce_pool_current: null,
      workforce_pool_half_life_years: null, site_spawn_year: null,
      restoration_eligibility: null,
      // v4.1 succession discount tracking (null for housing_stock)
      succession_site_id: null, ttd_reduction_applied: null,
      capex_discount_fraction: null, tx_waiver_mw: null,
      convert_source_asset_id: null,
    });
  }
  return assets;
}

// ── v4.3 (F1): Anchor Facility Commodity Lookup ─────────────────────────────
// DERIVED FIELD — inferred from facility name, NOT sourced from the geojson
// (mw_anchor_facilities.geojson has no 'commodity' field). If NB 22 is ever
// regenerated with different mine names or new mines added, this table must
// be reviewed by a human.
// Key: MSHA mine ID (anchor_id in geojson). Value: commodity string.
// See Python ANCHOR_MINE_COMMODITY for full citation block.
const ANCHOR_MINE_COMMODITY: Record<string, string> = {
  // Coal: Colorado (6)
  msha_0502838: 'coal', msha_0502962: 'coal', msha_0503505: 'coal',
  msha_0503672: 'coal', msha_0503836: 'coal', msha_0504864: 'coal',
  // Coal: Montana (6)
  msha_2400839: 'coal', msha_2400910: 'coal', msha_2401457: 'coal',
  msha_2401747: 'coal', msha_2401950: 'coal', msha_2402703: 'coal',
  // Coal: Wyoming Campbell (11)
  msha_4800083: 'coal', msha_4800732: 'coal', msha_4800977: 'coal',
  msha_4800992: 'coal', msha_4800993: 'coal', msha_4801034: 'coal',
  msha_4801078: 'coal', msha_4801200: 'coal', msha_4801215: 'coal',
  msha_4801337: 'coal', msha_4801353: 'coal', msha_4801429: 'coal',
  // Coal: Wyoming other (3)
  msha_4800086: 'coal', msha_4800677: 'coal', msha_4801180: 'coal',
  // Trona: Sweetwater (4)
  msha_4800152: 'trona', msha_4800154: 'trona', msha_4800155: 'trona', msha_4801295: 'trona',
  // Bentonite: Big Horn (9)
  msha_4800057: 'bentonite', msha_4800602: 'bentonite', msha_4800603: 'bentonite',
  msha_4800607: 'bentonite', msha_4800611: 'bentonite', msha_4800612: 'bentonite',
  msha_4800974: 'bentonite', msha_4801016: 'bentonite', msha_4801405: 'bentonite',
  // Bentonite: Crook (4)
  msha_4800070: 'bentonite', msha_4800245: 'bentonite', msha_4800594: 'bentonite', msha_4800888: 'bentonite',
  // Bentonite: Hot Springs, Natrona, Washakie (6)
  msha_4801191: 'bentonite', msha_4800243: 'bentonite', msha_4800617: 'bentonite',
  msha_4801539: 'bentonite', msha_4800954: 'bentonite', msha_4800987: 'bentonite',
};

// Asset classes excluded from the existing_assets materialized view.
const EA_EXCLUDED_CLASSES = new Set<string>([
  'housing_stock',           // v3.3
  'site',                    // v4.1
  'mine',                    // v4.3 (F1)
  'industrial_load',         // v4.3 (F1)
  'commercial_anchor_load',  // v4.3 (F1)
]);

// Namespace note: asset_class 'mine' (operating mine anchor from F1 geojson) is
// a DIFFERENT concept from site_class 'mine' (Z4 reclaimed-mine successor site).
// asset_class is the type of asset in the registry; site_class is a field on
// spawned site assets that drives SITE_COMPAT lookup for succession actions.

// ── C2: Exposure tag data schema ────────────────────────────────────────────

/** Shape of asset_exposure_tags.json loaded from data/processed. */
interface AssetExposureTagData {
  schema_version: string;
  class_defaults: Record<string, ExposureTagSet>;
  assets: Array<{
    asset_id: string;       // matches anchor_id on registry assets
    asset_key_type: string;
    asset_class: string;
    tags: ExposureTagSet;
  }>;
}

/**
 * Apply hazard exposure tags to every asset in the registry.
 * v4.4 (C2): read-only data field — excluded from all four digest surfaces.
 *
 * Lookup priority:
 *  1. Per-asset row keyed by anchor_id (Tier 2 anchor facilities)
 *  2. class_defaults[asset_class] (covers all other registry assets)
 *  3. null (asset_class not covered, e.g. site)
 *
 * Mutates registry in place (same pattern as F1's anchor field attachment).
 */
function applyExposureTags(
  registry: AssetInstance[],
  exposureTagData: AssetExposureTagData,
): void {
  // Build anchor_id → tags lookup from per-asset rows
  const byAnchorId: Record<string, ExposureTagSet> = {};
  for (const entry of exposureTagData.assets) {
    byAnchorId[entry.asset_id] = entry.tags;
  }

  for (const a of registry) {
    const anchorId = a.anchor_id;
    if (anchorId && byAnchorId[anchorId]) {
      a.exposure_tags = byAnchorId[anchorId];
    } else if (exposureTagData.class_defaults[a.asset_class]) {
      a.exposure_tags = exposureTagData.class_defaults[a.asset_class];
    } else {
      a.exposure_tags = null;
    }
  }
}

interface AnchorFeatureProps {
  anchor_id?: string;
  name?: string;
  geoid?: string;
  tier?: number;
  asset_class?: string | null;
  capacity_or_load_mw?: number | null;
  employment_est?: number | null;
  co2e_tpy?: number | null;
  source?: string;
  display_sector?: string;
  confidence?: string;
}

/**
 * Seed Tier 2 anchor facilities into the asset registry.
 * Generators get anchor_id + co2e_tpy attached (not re-seeded).
 * New asset_classes: mine, industrial_load, commercial_anchor_load.
 * Zero flow deltas — anchors carry marginal handles only.
 */
function seedAnchorFacilities(
  anchorData: { features: Array<{ properties: AnchorFeatureProps }> } | null,
  registry: AssetInstance[],
): AssetInstance[] {
  if (!anchorData) return [];
  const newAssets: AssetInstance[] = [];

  for (const feat of anchorData.features) {
    const props = feat.properties;
    if (props.tier !== 2) continue;
    const ac = props.asset_class;
    if (ac == null) continue;

    const anchorId = props.anchor_id ?? '';
    const geoid = String(props.geoid ?? '').padStart(5, '0');
    const name = props.name ?? '';

    if (ac === 'generator') {
      for (const a of registry) {
        if (a.geoid === geoid && a.name === name && a.origin === 'baseline'
            && (a.asset_class === 'generator' || a.asset_class === 'demand')) {
          a.anchor_id = anchorId;
          a.co2e_tpy = props.co2e_tpy ?? null;
          break;
        }
      }
      continue;
    }

    if (ac === 'data_center') {
      for (const a of registry) {
        if (a.geoid === geoid && a.name === name && a.origin === 'baseline') {
          a.anchor_id = anchorId;
          a.co2e_tpy = props.co2e_tpy ?? null;
          break;
        }
      }
      continue;
    }

    // New asset classes: mine, industrial_load, commercial_anchor_load
    const capacityOrLoad = props.capacity_or_load_mw ?? null;
    const employment = props.employment_est ?? null;
    const commodity = ac === 'mine' ? (ANCHOR_MINE_COMMODITY[anchorId] ?? null) : null;

    newAssets.push({
      asset_id: `anchor_${geoid}_${slugify(name)}`,
      origin: 'baseline',
      lifecycle: 'operating',
      asset_class: ac as AssetInstance['asset_class'],
      name,
      geoid,
      county_name: '',
      state: '',
      type: ac,
      status: 'operating',
      source_url: props.source ?? '',
      operational_year: null,
      capacity_mw: capacityOrLoad != null ? Number(capacityOrLoad) : null,
      coal_tons_yr: null, production_proxy: null,
      fiscal_action_id: null, excluded: null,
      commodity,
      production_volume: null, production_unit: null,
      production_confidence: null, production_source: null, data_year: null,
      effective_severance_rate_per_unit: null, county_distribution_share: null,
      advalorem_rate_per_unit: null, assessed_delta_per_unit: null,
      employment_direct: employment != null ? Math.round(employment) : null,
      action_id: null, magnitude: null, decision_year: null,
      throttle_reason: null, commissioned: null, scheduled_retirement_year: null,
      reclamation_year_log: null, active_reclamation_acres: null, reclamation_jobs_direct: null,
      decommissioning_cost_usd: null, decommissioning_labor_usd: null,
      decommissioning_duration_years: null, decommissioning_start_year: null,
      housing_total_units: null, housing_occupied_units: null,
      housing_convertible_units: null, housing_subsidized_units: null,
      housing_permits_per_year: null, housing_affordable_added: null,
      housing_pressure_ratio: null, housing_seasonal_excluded: null,
      site_origin_asset_id: null, site_origin_type: null, site_class: null,
      interconnection_mw: null, water_rights_flag: null, acres: null,
      workforce_pool_initial: null, workforce_pool_current: null,
      workforce_pool_half_life_years: null, site_spawn_year: null,
      restoration_eligibility: null,
      succession_site_id: null, ttd_reduction_applied: null,
      capex_discount_fraction: null, tx_waiver_mw: null,
      convert_source_asset_id: null,
      // v4.3 (F1) anchor-specific fields
      anchor_id: anchorId,
      co2e_tpy: props.co2e_tpy ?? null,
      display_sector: props.display_sector ?? null,
      confidence: props.confidence ?? 'high',
    });
  }

  return newAssets;
}

/** Find housing_stock AssetInstance for a county, or null. */
function findHousingAsset(state: EngineState, geoid: string): AssetInstance | null {
  return state.asset_registry.find(
    a => a.asset_class === 'housing_stock' && a.geoid === geoid
  ) ?? null;
}

/** Compute demand/supply housing pressure ratio for a county.
 *  demand = occupied + incoming_workforce × HOUSEHOLD_FACTOR
 *  supply = occupied + convertible + affordable_added
 */
function computeHousingPressure(state: EngineState, geoid: string, currentYear: number): number | null {
  const housing = findHousingAsset(state, geoid);
  if (!housing) return null;

  const occupied    = housing.housing_occupied_units    ?? 0;
  const convertible = housing.housing_convertible_units ?? 0;
  const affordable  = housing.housing_affordable_added  ?? 0;

  let incomingWorkforce = 0;
  for (const a of state.asset_registry) {
    if (a.geoid !== geoid) continue;
    if (['housing_stock', 'production', 'mine', 'industrial_load', 'commercial_anchor_load'].includes(a.asset_class)) continue;
    const opYear = a.operational_year;
    const capMw  = a.capacity_mw ?? a.magnitude ?? 0;

    const isUnderConstruction = (
      a.origin === 'baseline' &&
      a.status === 'under_construction' &&
      opYear != null && opYear > currentYear
    );
    const isPlayerQueued = (
      a.origin === 'player' &&
      a.lifecycle !== 'retired' &&
      a.commissioned === false &&
      opYear != null && opYear > currentYear
    );

    if (isUnderConstruction || isPlayerQueued) {
      const assetType = a.type ?? '';
      const jobsPerMw = HOUSING_CONSTRUCTION_JOBS_PER_MW[assetType] ?? 0;
      incomingWorkforce += capMw * jobsPerMw;
    }
  }

  const demand = occupied + incomingWorkforce * HOUSEHOLD_FACTOR;
  const supply = occupied + convertible + affordable;
  if (supply <= 0) return null;
  return Math.round((demand / supply) * 10000) / 10000;
}

// ── Site Spawning + Succession Helpers (v4.1) ────────────────────────────────

function siteClassForAsset(a: AssetInstance): 'thermal' | 'generator' | 'mine' | 'industrial' | 'commercial' {
  if (a.asset_class === 'production') return 'mine';
  // v4.3 (F1) anchor classes → distinct site classes
  if (a.asset_class === 'mine') return 'mine';
  if (a.asset_class === 'industrial_load') return 'industrial';
  if (a.asset_class === 'commercial_anchor_load') return 'commercial';
  const t = (a.type ?? '').toLowerCase();
  if (t === 'coal' || t === 'gas' || t === 'nuclear') return 'thermal';
  return 'generator';
}

/** Create a site AssetInstance from a just-retired generator, production, or anchor asset. */
function spawnSiteFromRetired(retired: AssetInstance, spawnYear: number): AssetInstance {
  const ANCHOR_CLASSES = new Set(['mine', 'industrial_load', 'commercial_anchor_load']);
  const siteClass = siteClassForAsset(retired);
  const capMw = retired.capacity_mw ?? 0;

  // v4.3 (F1): anchor assets use employment_direct directly for workforce pool
  let workforceInitial: number;
  if (ANCHOR_CLASSES.has(retired.asset_class)) {
    workforceInitial = retired.employment_direct ?? 0;
  } else {
    const assetTypeLow = (retired.type ?? '').toLowerCase();
    const opsJobsPerMw = SITE_OPS_JOBS_PER_MW[assetTypeLow] ?? 0.1;
    workforceInitial = Math.round(capMw * opsJobsPerMw * 10) / 10;
  }
  const assetId = `site_${retired.geoid}_${slugify(retired.name)}_${spawnYear}`;

  return {
    asset_id: assetId,
    origin: 'baseline',
    lifecycle: 'operating',
    asset_class: 'site',
    name: `${retired.name} Site`,
    geoid: retired.geoid,
    county_name: retired.county_name,
    state: retired.state,
    type: 'site',
    status: 'available',
    source_url: retired.source_url,
    operational_year: null,
    capacity_mw: null, coal_tons_yr: null, production_proxy: null,
    fiscal_action_id: null, excluded: null,
    commodity: null, production_volume: null, production_unit: null,
    production_confidence: null, production_source: null, data_year: null,
    effective_severance_rate_per_unit: null, county_distribution_share: null,
    advalorem_rate_per_unit: null, assessed_delta_per_unit: null, employment_direct: null,
    action_id: null, magnitude: null, decision_year: null,
    throttle_reason: null, commissioned: null, scheduled_retirement_year: null,
    reclamation_year_log: null, active_reclamation_acres: null, reclamation_jobs_direct: null,
    decommissioning_cost_usd: null, decommissioning_labor_usd: null,
    decommissioning_duration_years: null, decommissioning_start_year: null,
    housing_total_units: null, housing_occupied_units: null,
    housing_convertible_units: null, housing_subsidized_units: null,
    housing_permits_per_year: null, housing_affordable_added: null,
    housing_pressure_ratio: null, housing_seasonal_excluded: null,
    // v4.1 site-specific fields
    site_origin_asset_id: retired.asset_id,
    site_origin_type: siteClass === 'mine' ? 'mine'
      : (siteClass === 'industrial' || siteClass === 'commercial') ? 'anchor' : 'generator',
    site_class: siteClass,
    interconnection_mw: capMw > 0 && siteClass !== 'mine' ? capMw : null,
    water_rights_flag: null,         // known debt: populate from county data
    acres: null,                     // known debt: populate from county data
    workforce_pool_initial: workforceInitial,
    workforce_pool_current: workforceInitial,
    workforce_pool_half_life_years: SITE_WORKFORCE_HALF_LIFE_YEARS,
    site_spawn_year: spawnYear,
    restoration_eligibility: siteClass === 'mine',
    // succession fields (null on site itself)
    succession_site_id: null, ttd_reduction_applied: null,
    capex_discount_fraction: null, tx_waiver_mw: null,
    convert_source_asset_id: null,
    // v4.4 (C2): inherit origin asset's exposure context (county/class already captured)
    exposure_tags: retired.exposure_tags ?? null,
  };
}

/** Return compatible site + compat entry for the given county+action, or null pair. */
export function findSiteForAction(
  state: EngineState,
  geoid: string,
  actionId: string,
): [AssetInstance, SiteCompatEntry] | [null, null] {
  for (const a of state.asset_registry) {
    if (a.asset_class !== 'site') continue;
    if (a.geoid !== geoid || a.lifecycle !== 'operating') continue;
    const siteClass = a.site_class;
    if (!siteClass) continue;
    const compat = SITE_COMPAT[siteClass];
    if (compat?.compatible_actions.has(actionId)) return [a, compat];
  }
  return [null, null];
}

/** Materialize build_queue view from asset_registry (player-origin assets only). */
function materializeBuildQueue(registry: AssetInstance[]): BuildQueueItem[] {
  return registry
    .filter(a => a.origin === 'player' && a.lifecycle !== 'retired')
    .map(a => ({
      action_id: a.action_id!,
      geoid: a.geoid,
      magnitude: a.magnitude!,
      decision_year: a.decision_year!,
      operational_year: a.operational_year!,
      throttle_reason: a.throttle_reason,
      commissioned: a.commissioned ?? false,
    }));
}

/** Materialize existing_assets view from asset_registry (baseline-origin assets only).
 *  Housing stock assets are excluded so existing_assets_digest remains stable (v3.3).
 *  Site assets are also excluded (v4.1) — they are a derived/ephemeral registry class. */
function materializeExistingAssets(registry: AssetInstance[]): Record<string, AnyExistingAsset[]> {
  const result: Record<string, AnyExistingAsset[]> = {};
  for (const a of registry) {
    if (a.origin !== 'baseline') continue;
    if (EA_EXCLUDED_CLASSES.has(a.asset_class)) continue; // v3.3/v4.1/v4.3: excluded from digest
    if (!result[a.geoid]) result[a.geoid] = [];
    if (a.asset_class === 'production') {
      const pa: ProductionAsset = {
        asset_kind: 'production_asset',
        name: a.name,
        geoid: a.geoid,
        county_name: a.county_name,
        state: a.state,
        type: a.type,
        status: a.status,
        source_url: a.source_url,
        operational_year: a.operational_year,
        capacity_mw: null,
        coal_tons_yr: null,
        production_proxy: null,
        fiscal_action_id: null,
        excluded: null,
        commodity: a.commodity as ProductionAsset['commodity'],
        production_volume: a.production_volume!,
        production_unit: a.production_unit as ProductionAsset['production_unit'],
        production_confidence: a.production_confidence as ProductionAsset['production_confidence'],
        production_source: a.production_source!,
        data_year: a.data_year!,
        effective_severance_rate_per_unit: a.effective_severance_rate_per_unit!,
        county_distribution_share: a.county_distribution_share!,
        advalorem_rate_per_unit: a.advalorem_rate_per_unit,
        assessed_delta_per_unit: a.assessed_delta_per_unit,
        employment_direct: a.employment_direct,
      };
      result[a.geoid].push(pa);
    } else {
      if (a.excluded !== null) {
        // Excluded entry — no asset_kind
        const ea: ExistingAsset = {
          name: a.name,
          geoid: a.geoid,
          county_name: a.county_name,
          state: a.state,
          type: a.type,
          status: a.status,
          source_url: a.source_url,
          operational_year: a.operational_year,
          capacity_mw: a.capacity_mw,
          coal_tons_yr: a.coal_tons_yr,
          production_proxy: a.production_proxy,
          fiscal_action_id: a.fiscal_action_id,
          excluded: a.excluded,
        };
        result[a.geoid].push(ea);
      } else {
        const ea: ExistingAsset = {
          asset_kind: 'mw_asset',
          name: a.name,
          geoid: a.geoid,
          county_name: a.county_name,
          state: a.state,
          type: a.type,
          status: a.status,
          source_url: a.source_url,
          operational_year: a.operational_year,
          capacity_mw: a.capacity_mw,
          coal_tons_yr: a.coal_tons_yr,
          production_proxy: a.production_proxy,
          fiscal_action_id: a.fiscal_action_id,
          excluded: null,
        };
        result[a.geoid].push(ea);
      }
    }
  }
  return result;
}

// ── Deep Clone Helpers ──────────────────────────────────────────────────────

function cloneRecord<V>(rec: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const k in rec) out[k] = { ...rec[k] as object } as V;
  return out;
}

function cloneMaterialLedger(ml: Record<string, MaterialLedgerEntry>): Record<string, MaterialLedgerEntry> {
  const out: Record<string, MaterialLedgerEntry> = {};
  for (const k in ml) out[k] = { ...ml[k], by_action: [...ml[k].by_action] };
  return out;
}

function cloneCountyFiscal(cf: Record<string, CountyFiscal>): Record<string, CountyFiscal> {
  const out: Record<string, CountyFiscal> = {};
  for (const k in cf) {
    out[k] = { ...cf[k], fiscal_actions: [...cf[k].fiscal_actions] };
  }
  return out;
}

function shallowCopyState(state: EngineState): EngineState {
  // Clone sc_pools (each pool has only primitives)
  const scPools = {} as unknown as ScPools;
  for (const k in state.sc_pools) {
    (scPools as unknown as Record<string, ScPool>)[k] = { ...(state.sc_pools as unknown as Record<string, ScPool>)[k] };
  }

  // v3.0/3.1: deep-copy registry; reclamation_year_log is an array and must be copied
  const registry = state.asset_registry.map(a => ({
    ...a,
    reclamation_year_log: a.reclamation_year_log ? [...a.reclamation_year_log] : a.reclamation_year_log,
  }));

  return {
    // Shallow-spread clone for flat-valued Records
    county_ees: cloneRecord(state.county_ees),
    bus_state: cloneRecord(state.bus_state),
    ecoregion_ees: cloneRecord(state.ecoregion_ees),
    // v2.1 fiscal layer — deep-clone mutable fiscal data, share coefficients by reference
    county_fiscal: cloneCountyFiscal(state.county_fiscal),
    fiscal_coefficients: state.fiscal_coefficients,
    // Array shallow copies (elements are pushed, not mutated in place)
    active_couplings: [...state.active_couplings],
    build_queue: materializeBuildQueue(registry),
    material_ledger: cloneMaterialLedger(state.material_ledger),
    action_history: [...state.action_history],
    disturbance_history: [...state.disturbance_history],
    sc_pools: scPools,
    // Share large read-mostly structures by reference (copy-on-write in applyAction/injectDisturbance)
    buses: state.buses,
    branches: state.branches,
    // Share immutable references
    ba_flows: state.ba_flows,
    study_area_buses: state.study_area_buses,
    action_library: state.action_library,
    crosswalk: state.crosswalk,
    county_cards: state.county_cards,
    // v3.0: existing_assets materialized from registry
    existing_assets: materializeExistingAssets(registry),
    // Copy scalars
    year: state.year,
    timestamp: state.timestamp,
    last_delta: state.last_delta,
    // v3.0 asset registry — source of truth
    asset_registry: registry,
    // v3.1 lifecycle coefficients (shared by reference — read-only)
    lifecycle_coefficients: state.lifecycle_coefficients,
    // v3.3 housing baseline (shared by reference — read-only)
    housing_baseline: state.housing_baseline,
    // v4.2 population projections (shared by reference — read-only)
    population_projections: state.population_projections,
    // v4.2 population config (shallow copy — session-mutable off-switch)
    population_config: state.population_config ? { ...state.population_config } : state.population_config,
    // v4.0: history — shallow copy (snapshots are immutable; never mutated after creation)
    history: [...(state.history ?? [])],
  };
}

// ── Resolution Helpers ──────────────────────────────────────────────────────

function resolveGeoidToBus(state: EngineState, geoid: string): string | null {
  const xw = state.crosswalk;
  if (!xw) return null;
  for (const row of xw) {
    if (row.geoid === geoid && row.primary_bus) {
      return String(row.bus_id);
    }
  }
  return null;
}

/** Inverse crosswalk: return county GEOIDs whose primary bus is busId. */
function resolveBusToGeoids(state: EngineState, busId: string): string[] {
  const xw = state.crosswalk;
  if (!xw) return [];
  const geoids = new Set<string>();
  const numBusId = Number(busId);
  for (const row of xw) {
    if (row.bus_id === numBusId && row.primary_bus) {
      geoids.add(row.geoid);
    }
  }
  return [...geoids].sort();
}

function getBusEcoregion(state: EngineState, busId: string): string | null {
  const bus = state.buses[busId];
  if (!bus) return null;
  return bus.ecoregion_code;
}

function getCountyEcoregions(state: EngineState, geoid: string): string[] {
  const xw = state.crosswalk;
  if (!xw) return [];
  const codes = new Set<string>();
  for (const row of xw) {
    if (row.geoid === geoid) {
      codes.add(row.ecoregion_code);
    }
  }
  return Array.from(codes).sort();
}

function getNeighbors(state: EngineState, busId: string): Set<string> {
  const neighbors = new Set<string>();
  const busIdStr = String(busId);
  for (const br of Object.values(state.branches)) {
    if (!br.active) continue;
    const fb = String(br.from_bus);
    const tb = String(br.to_bus);
    if (fb === busIdStr) neighbors.add(tb);
    else if (tb === busIdStr) neighbors.add(fb);
  }
  return neighbors;
}

// ── Initialize State ────────────────────────────────────────────────────────

export function initializeState(
  countyEesBaseline: CountyEESBaseline[],
  crosswalk: CrosswalkRow[],
  actionLibrary: ActionLibrary,
  initialNetwork: InitialNetwork,
  countyCards: Record<string, unknown>,
  startYear: number = 2025,
  fiscalBaseline?: FiscalBaseline,
  fiscalCoefficients?: FiscalCoefficients,
  baselineRetirements?: Record<string, Record<string, { scheduled_retirement_year: number }>>,
  lifecycleCoefficients?: Record<string, unknown>,
  housingBaselineData?: Record<string, unknown>,
  populationProjections?: Record<string, PopulationProjection>,
  populationConfig?: Partial<PopulationConfig>,
  anchorFacilities?: { features: Array<{ properties: AnchorFeatureProps }> } | null,
  exposureTagData?: AssetExposureTagData | null,  // v4.4 (C2) hazard exposure tags
): EngineState {
  const popProj = populationProjections ?? {};
  // County EES (primary capital store)
  const county_ees: Record<string, CountyEES> = {};
  for (const row of countyEesBaseline) {
    const geoid = row.geoid.padStart(5, '0');
    const waShare = (popProj[geoid] as PopulationProjection | undefined)?.working_age_share
      ?? WORKING_AGE_SHARE_DEFAULT;
    county_ees[geoid] = {
      E: row.E, Ec: row.Ec, S: row.S,
      E_baseline: row.E, Ec_baseline: row.Ec, S_baseline: row.S,
      county_name: row.county_name,
      population: row.population,
      working_age_population: Math.round(row.population * waShare),
      load_mw: 0.0,
      added_firm_mw: 0.0,
      deficit_mw: 0.0,
    };
  }

  // Buses and branches from pre-computed network
  const buses: Record<string, Bus> = {};
  for (const [bid, b] of Object.entries(initialNetwork.buses)) {
    buses[bid] = { ...b };
  }

  const branches: Record<string, Branch> = {};
  for (const [brid, br] of Object.entries(initialNetwork.branches)) {
    branches[brid] = { ...br };
  }

  // Bus state
  const bus_state: Record<string, BusState> = {};
  for (const [bid, b] of Object.entries(buses)) {
    let firm_cap = 0;
    for (const [fuel, mw] of Object.entries(b.fuel_mix)) {
      if (FIRM_FUEL_TYPES.has(fuel)) firm_cap += mw;
    }
    bus_state[bid] = {
      capacity_mw: b.generation_mw,
      firm_capacity_mw: firm_cap,
      firm_capacity_mw_nominal: firm_cap,  // C3: pre-derate baseline
      load_mw: b.load_mw,
      deficit_mw: Math.max(0.0, b.load_mw - firm_cap),
      storage_mwh: b.storage_mwh || 0.0,
    };
  }

  // Ensure all actions have a tier field
  for (const action of Object.values(actionLibrary.actions)) {
    if (!action.tier) {
      action.tier = BUCKET_TO_TIER[action.bucket || ''] || 'social';
    }
  }

  // Supply chain pools
  const couplingRules = actionLibrary.coupling_rules || {};
  const scThroughput = couplingRules.supply_chain_throughput;
  const pools = scThroughput?.pools || {};

  const sc_pools: ScPools = {
    HALEU_kg_per_year: {
      capacity_per_year: pools.HALEU_kg_per_year?.initial_value || 900,
      used_this_year: 0,
      operational_year: pools.HALEU_kg_per_year?.operational_year ?? null,
      initial_value: pools.HALEU_kg_per_year?.initial_value || 900,
    },
    fuel_fabrication_units_per_year: {
      capacity_per_year: pools.fuel_fabrication_units_per_year?.initial_value || 0,
      used_this_year: 0,
      operational_year: pools.fuel_fabrication_units_per_year?.operational_year ?? 2029,
      initial_value: pools.fuel_fabrication_units_per_year?.initial_value || 0,
    },
  };

  // Ecoregion EES
  const ecoregion_ees: Record<string, EcoregionEES> = {};
  for (const [code, ees] of Object.entries(initialNetwork.ecoregion_ees)) {
    ecoregion_ees[code] = { ...ees };
  }

  // Fiscal layer (v2.1)
  const county_fiscal: Record<string, CountyFiscal> = {};
  const fc = fiscalCoefficients || {};
  if (fiscalBaseline) {
    for (const [geoid, cb] of Object.entries(fiscalBaseline)) {
      const assessed_mineral = cb.assessed_mineral || 0;
      const assessed_industrial = cb.assessed_industrial || 0;
      const assessed_commercial = cb.assessed_commercial || 0;
      const assessed_residential = cb.assessed_residential || 0;
      const assessed_agricultural = cb.assessed_agricultural || 0;
      const assessed_all_other = cb.assessed_all_other || 0;
      const mill = cb.mill_levy_mills || 0;
      const total_assessed = assessed_mineral + assessed_industrial + assessed_commercial
        + assessed_residential + assessed_agricultural + assessed_all_other;

      // Production ad valorem (Ledger A baseline)
      const prod_tax_assessed = cb.production_tax_assessed || 0;
      const mineral_mill = cb.mineral_weighted_mill_levy || mill;
      const advalorem_production = prod_tax_assessed * mineral_mill / 1000.0;

      // Severance share (Ledger B baseline)
      const severance_share = cb.severance_share || 0;
      const federal_royalty = cb.federal_royalty_share || 0;
      const sales_use = cb.sales_use || 0;
      const pilt = cb.pilt || 0;

      // School finance net (Ledger C) from fiscal coefficients
      let sf_net = 0;
      let sf_mineral_share = 0;
      for (const acoeffs of Object.values(fc)) {
        const sfEntry = acoeffs.school_finance_net?.[geoid];
        if (sfEntry) {
          sf_net = sfEntry.net_total || 0;
          sf_mineral_share = sfEntry.mineral_share || 0;
          break;
        }
      }

      county_fiscal[geoid] = {
        assessed_mineral,
        assessed_industrial,
        assessed_commercial,
        assessed_residential,
        assessed_agricultural,
        assessed_all_other,
        mill_levy_mills: mill,
        property_tax: total_assessed * mill / 1000.0,
        advalorem_production,
        severance_share,
        federal_royalty_share: federal_royalty,
        sales_use,
        pilt,
        school_finance_net: sf_net,
        school_finance_mineral_share: sf_mineral_share,
        assessed_mineral_baseline: assessed_mineral,
        ledger_a_cumulative_delta: 0,
        ledger_b_cumulative_delta: 0,
        ledger_c_cumulative_delta: 0,
        fiscal_actions: [],
      };
    }
  }

  // ── Asset registry (v3.0) — source of truth for all assets ─────────────────
  const asset_registry = seedAssetRegistry(countyCards, baselineRetirements);

  // ── v3.3: Housing baseline + housing_stock assets ─────────────────────────
  const housingBaseline = (housingBaselineData ?? {}) as Record<string, unknown>;
  if (housingBaselineData) {
    asset_registry.push(...seedHousingAssets(countyCards, housingBaseline));
  }

  // ── v4.3 (F1): Seed Tier 2 anchor facilities ─────────────────────────────
  // New asset_classes: mine, industrial_load, commercial_anchor_load.
  // Generators get anchor_id + co2e_tpy attached (not re-seeded).
  // Anchors excluded from existing_assets view → digest-stable.
  asset_registry.push(...seedAnchorFacilities(anchorFacilities ?? null, asset_registry));

  // ── v4.4 (C2): Apply hazard exposure tags ────────────────────────────────
  // Tags are read-only data on registry rows. Excluded from all digest surfaces:
  // ExistingAsset/ProductionAsset/IndicatorSnapshot do not carry exposure_tags.
  if (exposureTagData) {
    applyExposureTags(asset_registry, exposureTagData);
  }

  const existing_assets = materializeExistingAssets(asset_registry);

  return {
    county_ees,
    bus_state,
    active_couplings: [],
    build_queue: [],
    year: startYear,
    sc_pools,
    county_fiscal,
    fiscal_coefficients: fc,
    buses,
    branches,
    ba_flows: initialNetwork.ba_flows,
    ecoregion_ees,
    material_ledger: {},
    action_history: [],
    disturbance_history: [],
    timestamp: 0,
    study_area_buses: initialNetwork.study_area_buses,
    action_library: actionLibrary,
    crosswalk,
    county_cards: countyCards,
    existing_assets,
    last_delta: null,
    asset_registry,
    lifecycle_coefficients: lifecycleCoefficients ?? null,
    housing_baseline: housingBaseline,
    // v4.0: per-year indicator snapshots (appended by advanceYear; never in main digest)
    history: [],
    // v4.2: demographic denominators — one population state, no forks
    population_projections: popProj,
    population_config: {
      migration_enabled: populationConfig?.migration_enabled ?? true,
      labor_migration_multiplier: populationConfig?.labor_migration_multiplier ?? ECONOMIC_BASE_MULTIPLIER,
      migration_confidence: 'low',
    },
  };
}

// ── Apply Action ────────────────────────────────────────────────────────────

export function applyAction(
  inputState: EngineState,
  actionId: string,
  location: string | number,
  magnitude: number,
  _skipCoupling: boolean = false,
  _climateContext: ClimateContext = EMPTY_CLIMATE_CONTEXT,
  // C0: climate_context accepted but unused under historical lens.
  // C3 will add demand modulation coupling here (CDD/HDD × population).
): [EngineState, DeltaSummary] {
  const state = shallowCopyState(inputState);

  const actions = state.action_library.actions;
  if (!(actionId in actions)) {
    throw new Error(`Unknown action_id '${actionId}'`);
  }
  if (magnitude <= 0) {
    throw new Error(`magnitude must be positive, got ${magnitude}`);
  }

  const action = actions[actionId];
  const tier = action.tier || 'social';
  const unitScale = action.unit_scale || 1000;
  const scaleFactor = magnitude / unitScale;
  const eesEffects = action.ees_effects || {};
  const networkEffect = action.network_effect || null;

  // Determine location type and resolve
  const locationStr = String(location);
  const isGeoid = locationStr.length === 5 && /^\d{5}$/.test(locationStr);
  const isBus = locationStr in state.buses;
  const isEcoregion = locationStr in state.ecoregion_ees;

  let geoid: string | null = null;
  let busId: string | null = null;
  let ecoCode: string | null = null;

  if (isGeoid && locationStr in state.county_ees) {
    geoid = locationStr;
    busId = resolveGeoidToBus(state, geoid);
    const ecoCodes = getCountyEcoregions(state, geoid);
    ecoCode = ecoCodes.length > 0 ? ecoCodes[0] : null;
  } else if (isBus && tier === 'energy') {
    busId = locationStr;
    ecoCode = getBusEcoregion(state, busId);
  } else if (isEcoregion) {
    ecoCode = locationStr;
  } else {
    geoid = locationStr;
    busId = resolveGeoidToBus(state, geoid);
  }

  // Apply EES delta
  const eesDelta: Record<string, Record<string, number>> = {};

  if (geoid && geoid in state.county_ees) {
    const countyDelta: Record<string, number> = {};
    for (const capital of ['E', 'Ec', 'S'] as const) {
      const delta = (eesEffects[capital] || 0.0) * scaleFactor;
      const oldVal = state.county_ees[geoid][capital];
      const newVal = Math.max(0.0, Math.min(10.0, oldVal + delta));
      state.county_ees[geoid][capital] = newVal;
      countyDelta[capital] = newVal - oldVal;
    }
    eesDelta[geoid] = countyDelta;

    if (ecoCode && ecoCode in state.ecoregion_ees) {
      for (const capital of ['E', 'Ec', 'S'] as const) {
        const delta = (eesEffects[capital] || 0.0) * scaleFactor;
        const oldVal = state.ecoregion_ees[ecoCode][capital];
        const newVal = Math.max(0.0, Math.min(10.0, oldVal + delta));
        state.ecoregion_ees[ecoCode][capital] = newVal;
      }
    }
  } else if (ecoCode && ecoCode in state.ecoregion_ees) {
    const ecoDelta: Record<string, number> = {};
    for (const capital of ['E', 'Ec', 'S'] as const) {
      const delta = (eesEffects[capital] || 0.0) * scaleFactor;
      const oldVal = state.ecoregion_ees[ecoCode][capital];
      const newVal = Math.max(0.0, Math.min(10.0, oldVal + delta));
      state.ecoregion_ees[ecoCode][capital] = newVal;
      ecoDelta[capital] = newVal - oldVal;
    }
    eesDelta[ecoCode] = ecoDelta;
  }

  // Update bus/network state
  const networkDelta: Record<string, Record<string, number>> = {};
  if (busId && busId in state.buses) {
    // Copy-on-write: clone buses dict and the target bus (fuel_mix is nested)
    state.buses = { ...state.buses };
    state.buses[busId] = { ...state.buses[busId], fuel_mix: { ...state.buses[busId].fuel_mix } };
    const bus = state.buses[busId];

    if (networkEffect === 'bus_load_add') {
      let pue = 1.25;
      const coeffs = action.coefficients_per_mw_it || action.coefficients_per_mw || {};
      const gridLoadCoeff = coeffs.grid_load_mw;
      if (gridLoadCoeff) {
        if (typeof gridLoadCoeff === 'object' && 'value' in gridLoadCoeff) {
          pue = (gridLoadCoeff as { value: number }).value;
        } else if (typeof gridLoadCoeff === 'number') {
          pue = gridLoadCoeff;
        }
      }

      const gridLoadMw = magnitude * pue;
      bus.load_mw += gridLoadMw;

      const bs = state.bus_state[busId] || {} as BusState;
      bs.load_mw = bus.load_mw;
      const firmCap = bs.firm_capacity_mw || 0.0;
      bs.deficit_mw = Math.max(0.0, bs.load_mw - firmCap);
      state.bus_state[busId] = bs;

      if (geoid && geoid in state.county_ees) {
        state.county_ees[geoid].load_mw += gridLoadMw;
        const countyLoad = state.county_ees[geoid].load_mw;
        const countyFirm = state.county_ees[geoid].added_firm_mw || 0.0;
        state.county_ees[geoid].deficit_mw = Math.max(0.0, countyLoad - countyFirm);
      }

      networkDelta[busId] = { load_mw_change: gridLoadMw };

    } else if (actionId === 'wind_utility' || actionId === 'solar_utility') {
      bus.generation_mw += magnitude;
      const fuelType = actionId === 'wind_utility' ? 'wind' : 'solar';
      bus.fuel_mix[fuelType] = (bus.fuel_mix[fuelType] || 0.0) + magnitude;
      const bs = state.bus_state[busId] || {} as BusState;
      bs.capacity_mw = bus.generation_mw;
      state.bus_state[busId] = bs;

    } else if (actionId === 'coal_repowering') {
      const coalMw = bus.fuel_mix.coal || 0.0;
      const reduction = Math.min(magnitude, coalMw);
      bus.fuel_mix.coal = coalMw - reduction;
      bus.fuel_mix.gas = (bus.fuel_mix.gas || 0.0) + reduction;

    } else if (actionId === 'smr_advanced' || actionId === 'coal_to_smr' || actionId === 'geothermal_utility') {
      bus.generation_mw += magnitude;
      const fuel = (actionId === 'smr_advanced' || actionId === 'coal_to_smr') ? 'nuclear' : 'geothermal';
      bus.fuel_mix[fuel] = (bus.fuel_mix[fuel] || 0.0) + magnitude;
      const bs = state.bus_state[busId] || {} as BusState;
      bs.capacity_mw = bus.generation_mw;
      bs.firm_capacity_mw = (bs.firm_capacity_mw || 0.0) + magnitude;
      bs.firm_capacity_mw_nominal = (bs.firm_capacity_mw_nominal || 0.0) + magnitude;  // C3
      bs.deficit_mw = Math.max(0.0, (bs.load_mw || 0.0) - bs.firm_capacity_mw);
      state.bus_state[busId] = bs;

      if (geoid && geoid in state.county_ees) {
        state.county_ees[geoid].added_firm_mw = (state.county_ees[geoid].added_firm_mw || 0.0) + magnitude;
        const countyLoad = state.county_ees[geoid].load_mw || 0.0;
        const countyFirm = state.county_ees[geoid].added_firm_mw;
        state.county_ees[geoid].deficit_mw = Math.max(0.0, countyLoad - countyFirm);
      }

    } else if (actionId === 'battery_grid') {
      bus.storage_mwh += magnitude;
      const firmAdd = magnitude / 4.0;
      const bs = state.bus_state[busId] || {} as BusState;
      bs.storage_mwh = bus.storage_mwh;
      bs.firm_capacity_mw = (bs.firm_capacity_mw || 0.0) + firmAdd;
      bs.firm_capacity_mw_nominal = (bs.firm_capacity_mw_nominal || 0.0) + firmAdd;  // C3
      bs.deficit_mw = Math.max(0.0, (bs.load_mw || 0.0) - bs.firm_capacity_mw);
      state.bus_state[busId] = bs;

      if (geoid && geoid in state.county_ees) {
        state.county_ees[geoid].added_firm_mw = (state.county_ees[geoid].added_firm_mw || 0.0) + firmAdd;
        const countyLoad = state.county_ees[geoid].load_mw || 0.0;
        const countyFirm = state.county_ees[geoid].added_firm_mw;
        state.county_ees[geoid].deficit_mw = Math.max(0.0, countyLoad - countyFirm);
      }

    } else if (actionId === 'transmission_230kv' || actionId === 'transmission_500kv' || actionId === 'transmission_buildout') {
      const voltage = actionId.includes('500') ? 500.0 : 230.0;
      const newBranchId = `new_branch_${String(state.timestamp).padStart(4, '0')}`;
      state.branches = { ...state.branches }; // copy-on-write
      state.branches[newBranchId] = {
        from_bus: busId, to_bus: busId,
        thermal_limit_mw: magnitude * 2.0,
        voltage_kv: voltage, active: true,
      };

    } else if (actionId === 'hydropower_small') {
      bus.generation_mw += magnitude;
      bus.fuel_mix.hydro = (bus.fuel_mix.hydro || 0.0) + magnitude;
      const bs = state.bus_state[busId] || {} as BusState;
      bs.capacity_mw = bus.generation_mw;
      bs.firm_capacity_mw = (bs.firm_capacity_mw || 0.0) + magnitude;
      bs.firm_capacity_mw_nominal = (bs.firm_capacity_mw_nominal || 0.0) + magnitude;  // C3
      bs.deficit_mw = Math.max(0.0, (bs.load_mw || 0.0) - bs.firm_capacity_mw);
      state.bus_state[busId] = bs;

    } else if (actionId === 'pumped_hydro') {
      bus.storage_mwh += magnitude;
      const firmAdd = magnitude / 4.0;
      bus.generation_mw += firmAdd;
      bus.fuel_mix.hydro = (bus.fuel_mix.hydro || 0.0) + firmAdd;
      const bs = state.bus_state[busId] || {} as BusState;
      bs.capacity_mw = bus.generation_mw;
      bs.storage_mwh = bus.storage_mwh;
      bs.firm_capacity_mw = (bs.firm_capacity_mw || 0.0) + firmAdd;
      bs.firm_capacity_mw_nominal = (bs.firm_capacity_mw_nominal || 0.0) + firmAdd;  // C3
      bs.deficit_mw = Math.max(0.0, (bs.load_mw || 0.0) - bs.firm_capacity_mw);
      state.bus_state[busId] = bs;

    } else {
      // Generic energy action: add generation
      if (tier === 'energy' && !['transmission_230kv', 'transmission_500kv', 'transmission_buildout', 'microgrid'].includes(actionId)) {
        bus.generation_mw += magnitude;
        const bs = state.bus_state[busId] || {} as BusState;
        bs.capacity_mw = bus.generation_mw;
        state.bus_state[busId] = bs;
      }
    }
  }

  // v3.3: housing_retrofit_affordable — consume convertible units, update fiscal
  if (actionId === 'housing_retrofit_affordable' && geoid) {
    const housingAsset = findHousingAsset(state, geoid);
    if (housingAsset) {
      const units = Math.round(magnitude);
      const available = housingAsset.housing_convertible_units ?? 0;
      if (units > available) {
        throw new Error(
          `housing_retrofit_affordable: requested ${units} units but only ${available} convertible available in ${geoid}`,
        );
      }
      housingAsset.housing_convertible_units = available - units;
      housingAsset.housing_affordable_added  = Math.round(((housingAsset.housing_affordable_added ?? 0) + units) * 100) / 100;
      // WY fiscal: assessed_residential + property_tax (23 WY counties only)
      if (geoid in (state.county_fiscal ?? {})) {
        const fmvAdded = units * HOUSING_UNIT_REHAB_VALUE_USD;
        const assessedAdded = Math.round(fmvAdded * WY_RESIDENTIAL_ASSESSMENT_RATIO * 100) / 100;
        const mill = (state.county_fiscal![geoid].mill_levy_mills ?? 0);
        state.county_fiscal![geoid].assessed_residential =
          Math.round(((state.county_fiscal![geoid].assessed_residential ?? 0) + assessedAdded) * 100) / 100;
        state.county_fiscal![geoid].property_tax =
          Math.round(((state.county_fiscal![geoid].property_tax ?? 0) + assessedAdded * mill / 1000) * 100) / 100;
      }
    }
  }
  // v3.3: affordable_housing (generic new-build) — update housing_affordable_added
  if (actionId === 'affordable_housing' && geoid) {
    const housingAsset = findHousingAsset(state, geoid);
    if (housingAsset) {
      const units = Math.round(magnitude);
      housingAsset.housing_affordable_added = Math.round(((housingAsset.housing_affordable_added ?? 0) + units) * 100) / 100;
    }
  }

  // Update material ledger
  const materials = action.materials || {};
  const materialConsumed: Record<string, { quantity: number; unit: string }> = {};
  for (const [matType, matSpec] of Object.entries(materials)) {
    if (['primary_input', 'unit', 'source'].includes(matType)) continue;
    let qtyPerUnit = 0;
    let unitLabel = 'tonnes';
    if (typeof matSpec === 'object' && matSpec !== null && !Array.isArray(matSpec)) {
      qtyPerUnit = (matSpec as Record<string, unknown>).tonnes_per_unit as number || 0;
      unitLabel = (matSpec as Record<string, unknown>).unit as string || 'tonnes';
    } else if (typeof matSpec === 'number') {
      qtyPerUnit = matSpec;
      unitLabel = 'tonnes';
    } else {
      continue;
    }
    if (qtyPerUnit === 0) continue;
    const totalQty = qtyPerUnit * scaleFactor;
    if (!(matType in state.material_ledger)) {
      state.material_ledger[matType] = { total: 0.0, unit: unitLabel, by_action: [] };
    }
    state.material_ledger[matType].total += totalQty;
    state.material_ledger[matType].by_action.push({
      action_id: actionId, location: locationStr,
      quantity: totalQty, timestamp: state.timestamp,
    });
    materialConsumed[matType] = { quantity: totalQty, unit: unitLabel };
  }

  // Apply fiscal effects
  const fiscalDelta = applyFiscalEffects(state, actionId, geoid, magnitude);

  // Record history
  const actionRecord: ActionHistoryRecord = {
    action_id: actionId, location: locationStr,
    geoid, magnitude,
    unit: action.unit || '', ees_delta: eesDelta,
    network_delta: networkDelta, timestamp: state.timestamp,
  };
  state.action_history.push(actionRecord);
  state.timestamp += 1;

  // Build delta summary
  const deltaSummary: DeltaSummary = {
    action_id: actionId, location: locationStr, geoid,
    magnitude, ees_delta: eesDelta,
    network_delta: networkDelta, material_consumed: materialConsumed,
    bus_id: busId,
    fiscal_delta: fiscalDelta,
  };
  state.last_delta = deltaSummary;

  // Evaluate couplings
  if (!_skipCoupling) {
    evaluateCouplings(state);
  }

  return [state, deltaSummary];
}

// ── Evaluate Couplings (internal) ───────────────────────────────────────────

function evaluateCouplings(state: EngineState): void {
  const couplingRules = state.action_library.coupling_rules || {};
  const ndcRule = couplingRules.nuclear_dc_coupling;
  if (!ndcRule) return;

  const trigger = ndcRule.trigger;
  const demandActions = new Set(trigger.demand_actions);
  const supplyActions = new Set(trigger.supply_actions);

  const demandsByBus: Record<string, [string, ActionHistoryRecord][]> = {};
  const suppliesByBus: Record<string, [string, ActionHistoryRecord][]> = {};

  for (const record of state.action_history) {
    const aid = record.action_id;
    const recGeoid = record.geoid;

    let recBus: string | null = null;
    if (recGeoid) {
      recBus = resolveGeoidToBus(state, recGeoid);
    } else if (record.location in state.buses) {
      recBus = record.location;
    }
    if (recBus === null) continue;

    const locId = recGeoid || record.location;
    if (demandActions.has(aid)) {
      if (!demandsByBus[recBus]) demandsByBus[recBus] = [];
      demandsByBus[recBus].push([locId, record]);
    }
    if (supplyActions.has(aid)) {
      if (!suppliesByBus[recBus]) suppliesByBus[recBus] = [];
      suppliesByBus[recBus].push([locId, record]);
    }
  }

  const existingKeys = new Set(state.active_couplings.map(c => c.coupling_id));
  const effects = ndcRule.effects;
  const txReduction = effects.transmission_requirement_reduction_pct?.value ?? 20;
  const reliabilityCredit = effects.reliability_credit?.value ?? 0.2;

  for (const [busId, demandList] of Object.entries(demandsByBus)) {
    const candidateBuses = new Set([busId, ...getNeighbors(state, busId)]);
    for (const checkBus of candidateBuses) {
      if (!suppliesByBus[checkBus]) continue;
      for (const [dGeoid, dRec] of demandList) {
        for (const [sGeoid, sRec] of suppliesByBus[checkBus]) {
          const couplingId = `ndc_${dGeoid}_${sGeoid}_${busId}`;
          if (existingKeys.has(couplingId)) continue;
          const coupling: ActiveCoupling = {
            coupling_id: couplingId,
            coupling_type: 'nuclear_dc_coupling',
            demand_geoid: dGeoid,
            demand_action: dRec.action_id,
            supply_geoid: sGeoid,
            supply_action: sRec.action_id,
            bus_id: busId,
            tx_reduction_pct: txReduction,
            reliability_credit: reliabilityCredit,
            activated_year: state.year,
            reasoning: 'see coupling_rules.nuclear_dc_coupling.rationale',
          };
          state.active_couplings.push(coupling);
          existingKeys.add(couplingId);
        }
      }
    }
  }
}

// ── Queue Action ────────────────────────────────────────────────────────────

export function queueAction(
  inputState: EngineState,
  actionId: string,
  geoid: string,
  magnitude: number,
  decisionYear: number,
  overrideOperationalYear?: number,
  _climateContext: ClimateContext = EMPTY_CLIMATE_CONTEXT,
  // C0: climate_context accepted but unused under historical lens.
): EngineState {
  const state = shallowCopyState(inputState);

  const actions = state.action_library.actions;
  if (!(actionId in actions)) {
    throw new Error(`Unknown action_id '${actionId}'`);
  }

  const action = actions[actionId];
  const ttd = action.time_to_deploy || 1;

  let operationalYear = overrideOperationalYear ?? (decisionYear + ttd);
  let throttleReason: string | null = null;

  // Supply chain throttle for SMR-family
  if (overrideOperationalYear === undefined) {
    const couplingRules = state.action_library.coupling_rules || {};
    const scRules = couplingRules.supply_chain_throughput;
    const smrFamily = new Set(scRules?.smr_family_actions || []);

    if (smrFamily.has(actionId)) {
      const haleuPerBuild = scRules?.smr_haleu_per_build?.value ?? 5000;
      const pool = state.sc_pools.HALEU_kg_per_year;
      const poolCap = pool.capacity_per_year;
      const poolUsed = pool.used_this_year;

      if (poolCap > 0 && (poolUsed + haleuPerBuild) > poolCap) {
        let yearsNeeded = 0;
        let accumulated = poolCap - poolUsed;
        while (accumulated < haleuPerBuild) {
          yearsNeeded += 1;
          accumulated += poolCap;
        }
        operationalYear = Math.max(operationalYear, decisionYear + ttd + yearsNeeded);
        throttleReason = 'HALEU_pool';
      } else {
        pool.used_this_year = poolUsed + haleuPerBuild;
      }
    }
  }

  // v4.1: succession discounts — check for compatible site OR coal_to_smr convert
  const gid = String(geoid);
  let successionSiteId: string | null = null;
  let ttdReductionApplied: number | null = null;
  let capexDiscountFractionVal: number | null = null;
  let txWaiverMw: number | null = null;
  let convertSourceAssetId: string | null = null;

  if (actionId === 'coal_to_smr') {
    // coal_to_smr TX waiver: look for a live thermal site, else operating coal plant.
    // TTD/capex NOT discounted — brownfield premium already in cost_2024=$8,500,000/MW.
    for (const a of state.asset_registry) {
      if (a.asset_class === 'site' && a.geoid === gid &&
          a.lifecycle === 'operating' && a.site_class === COAL_TO_SMR_SITE_CLASS_COMPAT) {
        txWaiverMw = Math.min(a.interconnection_mw ?? 0, magnitude);
        successionSiteId = a.asset_id;
        convertSourceAssetId = a.site_origin_asset_id;
        break;
      }
    }
    if (successionSiteId === null) {
      // No site yet — look for an operating coal baseline plant
      for (const a of state.asset_registry) {
        if (a.geoid === gid && a.asset_class === 'generator' &&
            (a.type ?? '').toLowerCase() === 'coal' &&
            a.lifecycle === 'operating' && a.origin === 'baseline') {
          txWaiverMw = Math.min(a.capacity_mw ?? 0, magnitude);
          convertSourceAssetId = a.asset_id;
          break;
        }
      }
    }
  } else {
    // Standard succession: find compatible site
    const [siteAsset, compat] = findSiteForAction(state, gid, actionId);
    if (siteAsset !== null && compat !== null) {
      ttdReductionApplied = compat.ttd_reduction_years;
      capexDiscountFractionVal = compat.capex_discount_fraction;
      txWaiverMw = Math.min(siteAsset.interconnection_mw ?? 0, magnitude);
      successionSiteId = siteAsset.asset_id;
      if (overrideOperationalYear === undefined) {
        operationalYear = Math.max(decisionYear + 1, operationalYear - compat.ttd_reduction_years);
      }
    }
  }

  // v3.0: push to asset_registry, then re-materialize build_queue view
  const registryEntry: AssetInstance = {
    asset_id: `player_${gid}_${slugify(actionId)}_${decisionYear}`,
    origin: 'player',
    lifecycle: 'queued',
    asset_class: resolveAssetClass(action.bucket === 'energy_demand' ? 'data_center' : (action.bucket || '')),
    name: actionId,
    geoid: gid,
    county_name: '',
    state: '',
    type: actionId,
    status: 'queued',
    source_url: '',
    operational_year: operationalYear,
    capacity_mw: null,
    coal_tons_yr: null,
    production_proxy: null,
    fiscal_action_id: null,
    excluded: null,
    commodity: null,
    production_volume: null,
    production_unit: null,
    production_confidence: null,
    production_source: null,
    data_year: null,
    effective_severance_rate_per_unit: null,
    county_distribution_share: null,
    advalorem_rate_per_unit: null,
    assessed_delta_per_unit: null,
    employment_direct: null,
    action_id: actionId,
    magnitude,
    decision_year: decisionYear,
    throttle_reason: throttleReason,
    commissioned: false,
    scheduled_retirement_year: null,
    reclamation_year_log: null,
    active_reclamation_acres: null,
    reclamation_jobs_direct: null,
    decommissioning_cost_usd: null,
    decommissioning_labor_usd: null,
    decommissioning_duration_years: null,
    decommissioning_start_year: null,
    // v3.3 housing (null for player-queued assets)
    housing_total_units: null, housing_occupied_units: null,
    housing_convertible_units: null, housing_subsidized_units: null,
    housing_permits_per_year: null, housing_affordable_added: null,
    housing_pressure_ratio: null, housing_seasonal_excluded: null,
    // v4.1 site mechanics (null for player-queued assets)
    site_origin_asset_id: null, site_origin_type: null, site_class: null,
    interconnection_mw: null, water_rights_flag: null, acres: null,
    workforce_pool_initial: null, workforce_pool_current: null,
    workforce_pool_half_life_years: null, site_spawn_year: null,
    restoration_eligibility: null,
    // v4.1 succession discount tracking
    succession_site_id: successionSiteId,
    ttd_reduction_applied: ttdReductionApplied,
    capex_discount_fraction: capexDiscountFractionVal,
    tx_waiver_mw: txWaiverMw,
    convert_source_asset_id: convertSourceAssetId,
  };
  state.asset_registry.push(registryEntry);
  state.build_queue = materializeBuildQueue(state.asset_registry);

  return state;
}

// ── Population Advancement (v4.2) ──────────────────────────────────────────

/**
 * Count operations jobs from player-origin, operating (commissioned) assets at geoid.
 * Uses MIGRATION_OPS_JOBS_PER_MW. Construction workers excluded — they are temporary
 * (already modelled in housing pressure) and do not create permanent in-migration.
 */
function countPlayerOpsJobs(state: EngineState, geoid: string): number {
  let total = 0.0;
  const gid = geoid.padStart(5, '0');
  for (const asset of state.asset_registry) {
    if (asset.geoid !== gid) continue;
    if (asset.origin !== 'player') continue;
    if (asset.lifecycle !== 'operating') continue;
    if (['housing_stock', 'production', 'site',
         'mine', 'industrial_load', 'commercial_anchor_load'].includes(asset.asset_class)) continue;
    // Player queued assets store MW in `magnitude`; `capacity_mw` is null until commission
    const capMw = (asset.capacity_mw ?? asset.magnitude ?? 0.0) as number;
    if (capMw <= 0) continue;
    const rawType = asset.type ?? '';
    const fuelKey = MIGRATION_OPS_JOBS_PER_MW[rawType] !== undefined
      ? rawType
      : ACTION_ID_TO_MIGRATION_FUEL[rawType] ?? '';
    const jobsPerMw = MIGRATION_OPS_JOBS_PER_MW[fuelKey] ?? 0.0;
    total += capMw * jobsPerMw;
  }
  return total;
}

/**
 * Advance county population by one year (mutates state in place).
 *
 * Step 1 — Baseline projection: apply annual_growth_rate from population_projections
 *           (WY EAD 2022 / CO SDO 2022 / constant-share fallback).
 * Step 2 — Migration adjustment (if migration_enabled):
 *           permanent in-migrants from player-added ops jobs.
 *           Formula: ops_jobs × HOUSEHOLD_FACTOR × AVG_HOUSEHOLD_SIZE × ECONOMIC_BASE_MULTIPLIER
 *           Only player-origin, operating assets counted. Confidence: low.
 * Step 3 — Update working_age_population proportionally from projection's working_age_share.
 *
 * Called by advanceYear BEFORE snapshotIndicators so history reflects end-of-year state.
 */
function advancePopulation(state: EngineState, _year: number): void {
  const config = state.population_config;
  const migrationEnabled = config?.migration_enabled !== false;
  const laborMult = config?.labor_migration_multiplier ?? ECONOMIC_BASE_MULTIPLIER;
  const projections = state.population_projections ?? {};

  for (const [geoid, ees] of Object.entries(state.county_ees)) {
    const proj = projections[geoid] as PopulationProjection | undefined;
    const rate = proj?.annual_growth_rate ?? 0.0;
    const waShare = proj?.working_age_share ?? WORKING_AGE_SHARE_DEFAULT;

    // Step 1: baseline projection
    let newPop = Math.round(ees.population * (1.0 + rate));

    // Step 2: migration from player-added ops jobs
    if (migrationEnabled) {
      const opsJobs = countPlayerOpsJobs(state, geoid);
      if (opsJobs > 0) {
        const migrationHeads = Math.round(
          opsJobs * HOUSEHOLD_FACTOR * AVG_HOUSEHOLD_SIZE * laborMult,
        );
        newPop = Math.max(0, newPop + migrationHeads);
      }
    }

    // Step 3: advance population and working-age
    ees.population = newPop;
    ees.working_age_population = Math.round(newPop * waShare);
  }
}

// ── Advance Year ────────────────────────────────────────────────────────────

export function advanceYear(
  inputState: EngineState,
  _climateContext: ClimateContext = EMPTY_CLIMATE_CONTEXT,
  // C0: climate_context accepted but unused under historical lens.
  // C3 will add CDD/HDD demand modulation and climate-linked hazard injection here.
): EngineState {
  let state = shallowCopyState(inputState);
  state.year += 1;
  const currentYear = state.year;

  // Reset HALEU pool usage for the new year
  for (const [poolName, pool] of Object.entries(state.sc_pools) as [string, ScPool][]) {
    pool.used_this_year = 0;
    const opYear = pool.operational_year;
    if (opYear !== null && currentYear >= opYear) {
      if (poolName === 'fuel_fabrication_units_per_year') {
        pool.capacity_per_year = Math.max(pool.capacity_per_year, 1);
      }
    }
  }

  // Commission completed builds — iterate asset_registry (source of truth)
  const toCommission: number[] = [];
  for (let i = 0; i < state.asset_registry.length; i++) {
    const entry = state.asset_registry[i];
    if (entry.origin !== 'player' || entry.commissioned === true || entry.lifecycle === 'retired') continue;
    if (entry.operational_year !== null && entry.operational_year <= currentYear) {
      toCommission.push(i);
    }
  }

  for (const idx of toCommission) {
    const entry = state.asset_registry[idx];
    const [newState] = applyAction(state, entry.action_id!, entry.geoid, entry.magnitude!, true);
    state = newState;
    state.asset_registry[idx].commissioned = true;
    state.asset_registry[idx].lifecycle = 'operating';
  }
  // Re-materialize build_queue view after commissions
  state.build_queue = materializeBuildQueue(state.asset_registry);

  // Re-evaluate couplings after all commissions
  evaluateCouplings(state);

  // Apply depreciation (0.1% per year on all EES above baseline)
  for (const ees of Object.values(state.county_ees)) {
    for (const cap of ['E', 'Ec', 'S'] as const) {
      const baseline = ees[`${cap}_baseline`];
      const current = ees[cap];
      if (current > baseline) {
        ees[cap] = Math.max(baseline, current * 0.999);
      }
    }
  }

  // v3.1: autonomous PRB coal surface decline
  const lc = state.lifecycle_coefficients as Record<string, unknown> | null;
  const adCfg = (lc?.autonomous_decline as Record<string, unknown> | undefined)
    ?.coal_surface as Record<string, unknown> | undefined;
  if (adCfg?.enabled === true) {
    const annualRate = Math.abs((adCfg.annual_rate as number) ?? 0.02);
    const geoidFilter = new Set<string>((adCfg.geoid_filter as string[]) ?? []);
    for (const prodAsset of [...state.asset_registry]) {
      if (
        prodAsset.asset_class === 'production' &&
        prodAsset.commodity === 'coal_surface' &&
        geoidFilter.has(prodAsset.geoid) &&
        prodAsset.lifecycle === 'operating' &&
        prodAsset.production_volume !== null &&
        prodAsset.production_volume > 0
      ) {
        const declineDelta = Math.round(prodAsset.production_volume * annualRate * 100) / 100;
        if (declineDelta > 0) {
          [state] = reduceProductionAsset(state, prodAsset.geoid, 'coal_surface', declineDelta, currentYear);
        }
      }
    }
  }

  // v3.1: bond release expiry — recompute active_reclamation_acres for production assets
  // (handles years where reduce_production_asset was NOT called for that asset)
  const recCfg = (lc?.reclamation as Record<string, unknown> | undefined);
  const bondReleaseYears = (recCfg?.bond_release_duration_years as number | undefined) ?? 10;
  const jobsPer100Acres = (recCfg?.jobs_per_100_acres_yr as number | undefined) ?? 2.5;
  for (const prodAsset of state.asset_registry) {
    if (prodAsset.asset_class === 'production' && prodAsset.reclamation_year_log?.length) {
      const activeAcres = prodAsset.reclamation_year_log.reduce(
        (sum, e) => sum + (currentYear - e.year < bondReleaseYears ? e.acres : 0),
        0,
      );
      prodAsset.active_reclamation_acres = Math.round(activeAcres * 10000) / 10000;
      prodAsset.reclamation_jobs_direct = Math.round(activeAcres * jobsPer100Acres / 100 * 100) / 100;
    }
  }

  // v3.0: execute scheduled retirements
  let retiredAny = false;
  for (const asset of state.asset_registry) {
    if (asset.scheduled_retirement_year === currentYear && asset.lifecycle === 'operating') {
      asset.lifecycle = 'retired';
      retiredAny = true;
      // v3.2: decommissioning cost draw — price from lifecycle_coefficients.decommissioning
      // v4.3: anchor classes excluded — no MW-based decommissioning cost model
      const DECOM_EXCLUDED: Set<string> = new Set(['production', 'mine', 'industrial_load', 'commercial_anchor_load']);
      if (!DECOM_EXCLUDED.has(asset.asset_class) && asset.capacity_mw !== null && asset.capacity_mw > 0) {
        const decomSection = (lc?.decommissioning as Record<string, unknown> | undefined);
        const techKey = z1TechKey(asset.type);
        const decomEntry = techKey && decomSection ? (decomSection[techKey] as Record<string, unknown> | undefined) : undefined;
        if (decomEntry) {
          const costPerMw = (decomEntry.cost_usd_per_mw as number | undefined) ?? 0;
          const laborFrac = (decomEntry.labor_fraction as number | undefined) ?? 0;
          const durationYrs = (decomEntry.duration_years_midpoint as number | undefined) ?? 1;
          if (costPerMw > 0) {
            const totalCost = Math.round(asset.capacity_mw * costPerMw * 100) / 100;
            asset.decommissioning_cost_usd = totalCost;
            asset.decommissioning_labor_usd = Math.round(totalCost * laborFrac * 100) / 100;
            asset.decommissioning_duration_years = durationYrs;
            asset.decommissioning_start_year = currentYear;
          }
        }
      }
      // Reverse capacity through existing network heuristic
      // v4.3: anchor loads are demand, not generation — do NOT reverse bus capacity
      const ANCHOR_LOAD_CLASSES = new Set(['mine', 'industrial_load', 'commercial_anchor_load']);
      if (asset.capacity_mw !== null && asset.capacity_mw > 0
          && !ANCHOR_LOAD_CLASSES.has(asset.asset_class)) {
        const busId = resolveGeoidToBus(state, asset.geoid);
        if (busId && state.bus_state[busId]) {
          state.bus_state[busId].capacity_mw -= asset.capacity_mw;
          state.bus_state[busId].firm_capacity_mw -= asset.capacity_mw;
          state.bus_state[busId].firm_capacity_mw_nominal =
            (state.bus_state[busId].firm_capacity_mw_nominal || 0.0) - asset.capacity_mw;  // C3
        }
      }
    }
  }
  // v4.1+v4.3: spawn site assets from retirements that fired this year
  // MW-based: generator/demand/storage with capacity_mw > 0
  // Anchor (F1): mine/industrial_load/commercial_anchor_load (may have no MW)
  const ANCHOR_SPAWN_CLASSES = new Set(['mine', 'industrial_load', 'commercial_anchor_load']);
  const spawnedSites: AssetInstance[] = [];
  for (const asset of state.asset_registry) {
    if (asset.scheduled_retirement_year !== currentYear) continue;
    const ac = asset.asset_class;
    if (['generator', 'demand', 'storage'].includes(ac) && (asset.capacity_mw ?? 0) > 0) {
      spawnedSites.push(spawnSiteFromRetired(asset, currentYear));
    } else if (ANCHOR_SPAWN_CLASSES.has(ac)) {
      spawnedSites.push(spawnSiteFromRetired(asset, currentYear));
    }
  }
  if (spawnedSites.length > 0) {
    state.asset_registry.push(...spawnedSites);
    retiredAny = true;
  }

  if (retiredAny) {
    state.build_queue = materializeBuildQueue(state.asset_registry);
    state.existing_assets = materializeExistingAssets(state.asset_registry);
  }

  // v3.3: housing supply trend + pressure recompute
  for (const housing of state.asset_registry) {
    if (housing.asset_class !== 'housing_stock') continue;
    if (housing.lifecycle !== 'operating') continue;
    const gid = housing.geoid;
    const permits = housing.housing_permits_per_year ?? 0;
    if (permits > 0) {
      housing.housing_total_units    = (housing.housing_total_units    ?? 0) + Math.round(permits);
      housing.housing_occupied_units = (housing.housing_occupied_units ?? 0) + Math.round(permits);
    }
    const ratio = computeHousingPressure(state, gid, currentYear);
    housing.housing_pressure_ratio = ratio;
    if (ratio !== null && ratio >= HOUSING_PRESSURE_THRESHOLDS.stressed) {
      if (gid in state.county_ees) {
        const oldS = state.county_ees[gid].S;
        const excess = ratio - HOUSING_PRESSURE_THRESHOLDS.moderate;
        const steps = Math.max(0, excess / 0.05);
        const sPenalty = HOUSING_PRESSURE_S_PENALTY_PER_STEP * steps;
        state.county_ees[gid].S = Math.max(0, Math.round((oldS + sPenalty) * 1e6) / 1e6);
      }
    }
  }

  // v4.1: workforce pool decay for live site assets
  // N(t) = N0 × (0.5)^(t / t½)  — Carley et al. (2018)
  for (const siteAsset of state.asset_registry) {
    if (siteAsset.asset_class !== 'site' || siteAsset.lifecycle !== 'operating') continue;
    const spawnYear = siteAsset.site_spawn_year ?? currentYear;
    const initial = siteAsset.workforce_pool_initial ?? 0;
    const halfLife = siteAsset.workforce_pool_half_life_years ?? SITE_WORKFORCE_HALF_LIFE_YEARS;
    const yearsElapsed = currentYear - spawnYear;
    if (yearsElapsed > 0 && initial > 0 && halfLife > 0) {
      const decayed = initial * Math.pow(0.5, yearsElapsed / halfLife);
      siteAsset.workforce_pool_current = Math.round(decayed * 10) / 10;
    }
  }

  // v4.2: advance population (baseline projection + migration adjustment)
  // Must run BEFORE snapshotIndicators so history captures end-of-year demographic state.
  advancePopulation(state, currentYear);

  // ── v4.4 (C3): Climate coupling block ────────────────────────────────────
  // Applies demand modulation and supply derates from climate projections.
  // Under historical lens (or missing tables), this is a complete no-op.
  const climateCtx = _climateContext;
  if (climateCtx.lens !== 'historical' && Object.keys(climateCtx.tables).length > 0) {
    const buses = state.buses;
    for (const bid of Object.keys(state.bus_state)) {
      const bs = state.bus_state[bid];
      const geoids = resolveBusToGeoids(state, bid);
      if (geoids.length === 0) continue;

      // ── Demand modulation (population-weighted across counties on bus) ──
      let totalPop = 0.0;
      let weightedMod = 0.0;
      for (const gid of geoids) {
        const pop = state.county_ees[gid]?.population ?? 1.0;
        const dm = computeDemandModifier(gid, currentYear, climateCtx);
        weightedMod += dm.modifier * pop;
        totalPop += pop;
      }
      const busModifier = totalPop > 0 ? weightedMod / totalPop : 1.0;
      // Recompute from nominal load (buses dict) — never compound
      const nominalLoad = buses[bid].load_mw;
      bs.load_mw = Math.round(nominalLoad * busModifier * 10000) / 10000;

      // ── Supply derates (worst-case county on bus) ────────────────────
      const nominalFirm = bs.firm_capacity_mw_nominal ?? bs.firm_capacity_mw ?? 0.0;
      const fuelMix = buses[bid].fuel_mix ?? {};
      let thermalFirm = 0.0;
      for (const fuel of THERMAL_DERATE_FUELS) {
        thermalFirm += fuelMix[fuel] ?? 0.0;
      }
      thermalFirm = Math.min(thermalFirm, nominalFirm);
      const nonThermalFirm = nominalFirm - thermalFirm;

      let worstDerate = 1.0;
      for (const gid of geoids) {
        const ws = computeWaterStressDerate(gid, currentYear, climateCtx);
        const ht = computeHeatDerate(gid, currentYear, climateCtx);
        const countyDerate = ws.derate_factor * ht.derate_factor;
        worstDerate = Math.min(worstDerate, countyDerate);
      }

      bs.firm_capacity_mw = Math.round((nonThermalFirm + thermalFirm * worstDerate) * 10000) / 10000;
      bs.deficit_mw = Math.max(0.0, bs.load_mw - bs.firm_capacity_mw);
    }
  }

  // v4.0: append indicator snapshot at end of year
  state.history = [...(state.history ?? []), snapshotIndicators(state)];

  return state;
}

// ── Retirement Transitions (v3.0) ──────────────────────────────────────────

/**
 * Schedule a retirement for an operating baseline asset.
 * Pure function — returns new state with updated registry.
 */
export function scheduleRetirement(
  inputState: EngineState,
  asset_id: string,
  year: number,
): EngineState {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.lifecycle !== 'operating') {
    throw new Error(`Cannot schedule retirement for asset in lifecycle '${asset.lifecycle}'`);
  }
  if (!['generator', 'demand', 'storage', 'mine', 'industrial_load', 'commercial_anchor_load'].includes(asset.asset_class)) {
    throw new Error(`Cannot schedule retirement for asset_class '${asset.asset_class}'`);
  }
  state.asset_registry[idx].scheduled_retirement_year = year;
  return state;
}

/**
 * Move a scheduled retirement earlier.
 * Pure function — returns new state.
 */
export function accelerateRetirement(
  inputState: EngineState,
  asset_id: string,
  new_year: number,
): EngineState {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.scheduled_retirement_year === null) {
    throw new Error(`Asset ${asset_id} has no scheduled retirement to accelerate`);
  }
  if (new_year >= asset.scheduled_retirement_year) {
    throw new Error(`new_year ${new_year} must be earlier than current ${asset.scheduled_retirement_year}`);
  }
  state.asset_registry[idx].scheduled_retirement_year = new_year;
  return state;
}

/** Map asset type string to lifecycle_coefficients.z1_hooks tech key. */
function z1TechKey(assetType: string | null): string | null {
  if (!assetType) return null;
  const t = assetType.toLowerCase();
  if (t.includes('coal')) return 'coal';
  if (t.includes('gas') || t.includes('natural_gas')) return 'gas';
  if (t.includes('wind')) return 'wind';
  if (t.includes('solar') || t.includes('pv')) return 'solar';
  if (t.includes('nuclear') || t.includes('smr')) return 'nuclear_smr';
  return null;
}

/**
 * Push a scheduled retirement later.
 * Returns [newState, { delay_cost_hook, confidence }].
 * Cost priced from lifecycle_coefficients.z1_hooks.delay_retirement (confidence: low).
 */
export function delayRetirement(
  inputState: EngineState,
  asset_id: string,
  new_year: number,
): [EngineState, { delay_cost_hook: number; confidence: string }] {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.scheduled_retirement_year === null) {
    throw new Error(`Asset ${asset_id} has no scheduled retirement to delay`);
  }
  const oldYear = asset.scheduled_retirement_year;
  if (new_year <= oldYear) {
    throw new Error(`new_year ${new_year} must be later than current ${oldYear}`);
  }
  state.asset_registry[idx].scheduled_retirement_year = new_year;

  // Z1 hook pricing (confidence: low)
  const lc = state.lifecycle_coefficients as Record<string, unknown> | null;
  const delayRates = (lc?.z1_hooks as Record<string, unknown> | undefined)
    ?.delay_retirement as Record<string, unknown> | undefined;
  const techKey = z1TechKey(asset.type);
  const costPerMwYr = techKey && delayRates?.[techKey]
    ? ((delayRates[techKey] as Record<string, unknown>).cost_usd_per_mw_yr as number) ?? 0
    : 0;
  const capacityMw = asset.capacity_mw ?? 0;
  const yearsExtended = new_year - oldYear;
  const delayCost = Math.round(costPerMwYr * capacityMw * yearsExtended * 100) / 100;

  return [state, { delay_cost_hook: delayCost, confidence: 'low' }];
}

/**
 * Cancel a player-queued asset before commissioning.
 * Returns [newState, { sunk_cost_fraction, sunk_cost_usd, confidence }].
 * Sunk cost priced from lifecycle_coefficients.z1_hooks.cancellation_sunk_cost (confidence: low).
 */
export function cancelQueued(
  inputState: EngineState,
  asset_id: string,
): [EngineState, { sunk_cost_fraction: number; sunk_cost_usd: number; confidence: string }] {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.origin !== 'player') {
    throw new Error(`cancelQueued only applies to player-origin assets, got '${asset.origin}'`);
  }
  const lifecycleStage = asset.lifecycle;
  if (lifecycleStage !== 'queued' && lifecycleStage !== 'under_construction') {
    throw new Error(`Cannot cancel asset in lifecycle '${lifecycleStage}'`);
  }
  state.asset_registry[idx].lifecycle = 'retired';
  state.build_queue = materializeBuildQueue(state.asset_registry);

  // Z1 hook pricing (confidence: low)
  const lc = state.lifecycle_coefficients as Record<string, unknown> | null;
  const stages = ((lc?.z1_hooks as Record<string, unknown> | undefined)
    ?.cancellation_sunk_cost as Record<string, unknown> | undefined)
    ?.stages as Record<string, unknown> | undefined;
  const stageCfg = stages?.[lifecycleStage] as Record<string, unknown> | undefined;
  const sunkCostFraction = (stageCfg?.sunk_cost_fraction as number | undefined) ?? 0;
  const capexPerMw = (asset as unknown as Record<string, unknown>).capex_per_mw as number | undefined ?? 0;
  const magnitude = asset.magnitude ?? 0;
  const sunkCostUsd = Math.round(sunkCostFraction * capexPerMw * magnitude * 100) / 100;

  return [state, { sunk_cost_fraction: sunkCostFraction, sunk_cost_usd: sunkCostUsd, confidence: 'low' }];
}

// ── Inject Disturbance ──────────────────────────────────────────────────────

export function injectDisturbance(
  inputState: EngineState,
  disturbanceType: string,
  severity: number,
  geoids?: string[],
): [EngineState, DisturbanceDeltaSummary] {
  const state = shallowCopyState(inputState);

  const coeffs = DISTURBANCE_COEFFICIENTS[disturbanceType];
  if (!coeffs) {
    throw new Error(`Unknown disturbance_type '${disturbanceType}'`);
  }

  const targetGeoids = geoids || Object.keys(state.county_ees);
  const eesDelta: Record<string, Record<string, number>> = {};
  let flexibleLoadShedMw = 0.0;
  let firmLoadAffectedMw = 0.0;
  let totalDeficitChange = 0.0;
  let reliabilityScoreChange = 0.0;

  if (disturbanceType === 'heat_wave') {
    // Apply EES impacts to affected counties
    for (const gid of targetGeoids) {
      if (!(gid in state.county_ees)) continue;
      const countyDelta: Record<string, number> = {};
      for (const capital of ['E', 'Ec', 'S'] as const) {
        const coeffKey = `${capital}_per_severity`;
        const delta = (coeffs[coeffKey] || 0.0) * severity;
        const oldVal = state.county_ees[gid][capital];
        const newVal = Math.max(0.0, Math.min(10.0, oldVal + delta));
        state.county_ees[gid][capital] = newVal;
        countyDelta[capital] = newVal - oldVal;
      }
      eesDelta[gid] = countyDelta;
    }

    // Load spike on affected buses
    const affectedBuses = new Set<string>();
    for (const gid of targetGeoids) {
      const bid = resolveGeoidToBus(state, gid);
      if (bid) affectedBuses.add(bid);
    }

    // Copy-on-write: clone buses dict and affected bus entries
    state.buses = { ...state.buses };
    for (const bid of affectedBuses) {
      if (bid in state.buses) {
        state.buses[bid] = { ...state.buses[bid], fuel_mix: { ...state.buses[bid].fuel_mix } };
      }
    }

    // Snapshot pre-disturbance load
    const preLoad: Record<string, number> = {};
    for (const bid of affectedBuses) {
      if (!(bid in state.buses)) continue;
      const bus = state.buses[bid];
      preLoad[bid] = bus.load_mw;
      const loadSpike = bus.load_mw * coeffs.load_spike_fraction * severity;
      bus.load_mw += loadSpike;

      const bs = state.bus_state[bid] || {} as BusState;
      bs.load_mw = bus.load_mw;
      state.bus_state[bid] = bs;
    }

    // Flexible load shedding: from action_history
    for (const record of state.action_history) {
      if (record.action_id === 'industrial_load_flexible') {
        const recGeoid = record.geoid || record.location;
        if (targetGeoids.includes(recGeoid)) {
          const flexAttr = state.action_library.actions.industrial_load_flexible?.flexibility ?? 0.4;
          const shedMw = record.magnitude * flexAttr * Math.min(severity / 3.0, 1.0);
          flexibleLoadShedMw += shedMw;

          const bid = resolveGeoidToBus(state, recGeoid);
          if (bid && bid in state.buses) {
            state.buses[bid].load_mw -= shedMw;
            const bs = state.bus_state[bid] || {} as BusState;
            bs.load_mw = state.buses[bid].load_mw;
            state.bus_state[bid] = bs;
          }
        }
      }
    }

    // Also check build_queue for commissioned flexible loads
    for (const entry of state.build_queue) {
      if (entry.commissioned && entry.action_id === 'industrial_load_flexible') {
        const recGeoid = entry.geoid;
        if (targetGeoids.includes(recGeoid)) {
          const flexAttr = state.action_library.actions.industrial_load_flexible?.flexibility ?? 0.4;
          const shedMw = entry.magnitude * flexAttr * Math.min(severity / 3.0, 1.0);
          flexibleLoadShedMw += shedMw;

          const bid = resolveGeoidToBus(state, recGeoid);
          if (bid && bid in state.buses) {
            state.buses[bid].load_mw -= shedMw;
            const bs = state.bus_state[bid] || {} as BusState;
            bs.load_mw = state.buses[bid].load_mw;
            state.bus_state[bid] = bs;
          }
        }
      }
    }

    // Compute firm load affected: disturbance-caused excess
    for (const bid of affectedBuses) {
      const bs = state.bus_state[bid];
      if (!bs) continue;
      const firmCap = bs.firm_capacity_mw || 0.0;
      const loadBefore = preLoad[bid];
      const loadAfter = bs.load_mw || 0.0;
      const preExcess = Math.max(0.0, loadBefore - firmCap);
      const postExcess = Math.max(0.0, loadAfter - firmCap);
      firmLoadAffectedMw += Math.max(0.0, postExcess - preExcess);
    }

    // Deficit change
    for (const bid of affectedBuses) {
      const bs = state.bus_state[bid];
      if (!bs) continue;
      const oldDeficit = bs.deficit_mw || 0.0;
      const newDeficit = Math.max(0.0, (bs.load_mw || 0.0) - (bs.firm_capacity_mw || 0.0));
      bs.deficit_mw = newDeficit;
      totalDeficitChange += newDeficit - oldDeficit;
      state.bus_state[bid] = bs;
    }

    // Reliability score change
    reliabilityScoreChange = -0.05 * severity;
  }

  // Record
  const disturbanceRecord: DisturbanceHistoryRecord = {
    disturbance_type: disturbanceType,
    severity,
    geoids: targetGeoids,
    ees_delta: eesDelta,
    flexible_load_shed_mw: flexibleLoadShedMw,
    firm_load_affected_mw: firmLoadAffectedMw,
    deficit_mw_change: totalDeficitChange,
    reliability_score_change: reliabilityScoreChange,
    timestamp: state.timestamp,
  };
  state.disturbance_history.push(disturbanceRecord);
  state.timestamp += 1;

  const deltaSummary: DisturbanceDeltaSummary = {
    disturbance_type: disturbanceType,
    severity,
    geoids: targetGeoids,
    ees_delta: eesDelta,
    flexible_load_shed_mw: flexibleLoadShedMw,
    firm_load_affected_mw: firmLoadAffectedMw,
    deficit_mw_change: totalDeficitChange,
    reliability_score_change: reliabilityScoreChange,
  };

  return [state, deltaSummary];
}

// ── Compute EES Summary ─────────────────────────────────────────────────────

function nearestScenario(_state: EngineState): NearestScenario | null {
  // Scenario profiles not included in TS data export — return null
  return null;
}

export function computeEesSummary(state: EngineState): EESSummary {
  // County-level
  const countySummary: Record<string, EESSummaryLevel> = {};
  for (const [geoid, ees] of Object.entries(state.county_ees)) {
    countySummary[geoid] = {
      E: Math.round(ees.E * 10000) / 10000,
      Ec: Math.round(ees.Ec * 10000) / 10000,
      S: Math.round(ees.S * 10000) / 10000,
    };
  }

  // By ecoregion
  const byEcoregion: Record<string, EcoregionSummaryLevel> = {};
  for (const [code, ees] of Object.entries(state.ecoregion_ees)) {
    byEcoregion[code] = {
      E: Math.round(ees.E * 10000) / 10000,
      Ec: Math.round(ees.Ec * 10000) / 10000,
      S: Math.round(ees.S * 10000) / 10000,
      E_baseline: Math.round(ees.E_baseline * 10000) / 10000,
      Ec_baseline: Math.round(ees.Ec_baseline * 10000) / 10000,
      S_baseline: Math.round(ees.S_baseline * 10000) / 10000,
      E_delta: Math.round((ees.E - ees.E_baseline) * 10000) / 10000,
      Ec_delta: Math.round((ees.Ec - ees.Ec_baseline) * 10000) / 10000,
      S_delta: Math.round((ees.S - ees.S_baseline) * 10000) / 10000,
    };
  }

  // By BA
  const byBa: Record<string, BASummaryLevel> = {};
  const primaryXw = state.crosswalk.filter(r => r.primary_bus);
  const seenGeoids = new Set<string>();
  const baAcc: Record<string, { E: number; Ec: number; S: number; pop: number; n: number }> = {};
  for (const row of primaryXw) {
    if (seenGeoids.has(row.geoid)) continue;
    seenGeoids.add(row.geoid);
    const gid = row.geoid;
    const bid = String(row.bus_id);
    const bus = state.buses[bid];
    if (!bus || !(gid in state.county_ees)) continue;
    const ba = bus.ba_code;
    const pop = state.county_ees[gid].population || 1;
    const ees = state.county_ees[gid];
    if (!baAcc[ba]) baAcc[ba] = { E: 0, Ec: 0, S: 0, pop: 0, n: 0 };
    baAcc[ba].E += ees.E * pop;
    baAcc[ba].Ec += ees.Ec * pop;
    baAcc[ba].S += ees.S * pop;
    baAcc[ba].pop += pop;
    baAcc[ba].n += 1;
  }
  for (const [ba, acc] of Object.entries(baAcc)) {
    if (acc.pop > 0) {
      byBa[ba] = {
        E: Math.round((acc.E / acc.pop) * 10000) / 10000,
        Ec: Math.round((acc.Ec / acc.pop) * 10000) / 10000,
        S: Math.round((acc.S / acc.pop) * 10000) / 10000,
        n_counties: acc.n,
      };
    }
  }

  // Study area
  const countyVals = Object.values(state.county_ees);
  let studyArea: StudyAreaSummary;
  if (countyVals.length > 0) {
    const pops = countyVals.map(v => v.population || 1);
    const totalPop = pops.reduce((a, b) => a + b, 0);
    if (totalPop > 0) {
      studyArea = {
        E: Math.round(countyVals.reduce((s, v, i) => s + v.E * pops[i], 0) / totalPop * 10000) / 10000,
        Ec: Math.round(countyVals.reduce((s, v, i) => s + v.Ec * pops[i], 0) / totalPop * 10000) / 10000,
        S: Math.round(countyVals.reduce((s, v, i) => s + v.S * pops[i], 0) / totalPop * 10000) / 10000,
        E_baseline: Math.round(countyVals.reduce((s, v, i) => s + v.E_baseline * pops[i], 0) / totalPop * 10000) / 10000,
        Ec_baseline: Math.round(countyVals.reduce((s, v, i) => s + v.Ec_baseline * pops[i], 0) / totalPop * 10000) / 10000,
        S_baseline: Math.round(countyVals.reduce((s, v, i) => s + v.S_baseline * pops[i], 0) / totalPop * 10000) / 10000,
      };
    } else {
      const n = countyVals.length;
      studyArea = {
        E: Math.round(countyVals.reduce((s, v) => s + v.E, 0) / n * 10000) / 10000,
        Ec: Math.round(countyVals.reduce((s, v) => s + v.Ec, 0) / n * 10000) / 10000,
        S: Math.round(countyVals.reduce((s, v) => s + v.S, 0) / n * 10000) / 10000,
        E_baseline: Math.round(countyVals.reduce((s, v) => s + v.E_baseline, 0) / n * 10000) / 10000,
        Ec_baseline: Math.round(countyVals.reduce((s, v) => s + v.Ec_baseline, 0) / n * 10000) / 10000,
        S_baseline: Math.round(countyVals.reduce((s, v) => s + v.S_baseline, 0) / n * 10000) / 10000,
      };
    }
  } else {
    studyArea = { E: 0, Ec: 0, S: 0, E_baseline: 0, Ec_baseline: 0, S_baseline: 0 };
  }

  const nearest = nearestScenario(state);

  return {
    county: countySummary,
    by_ecoregion: byEcoregion,
    by_ba: byBa,
    study_area: studyArea,
    nearest_scenario: nearest,
    unmet_conditions: [],
  };
}

// ── Get County Card ─────────────────────────────────────────────────────────

export function getCountyCard(state: EngineState, geoid: string): CountyCard {
  const gid = geoid.padStart(5, '0');
  const baseline = (state.county_cards[gid] || {}) as Record<string, unknown>;
  const liveEes = state.county_ees[gid] || {} as CountyEES;

  const busId = resolveGeoidToBus(state, gid);
  let busLive: Partial<BusState> & { bus_id?: string } = {};
  if (busId) {
    const bs = state.bus_state[busId] || {} as BusState;
    busLive = {
      bus_id: busId,
      capacity_mw: bs.capacity_mw || 0.0,
      firm_capacity_mw: bs.firm_capacity_mw || 0.0,
      load_mw: bs.load_mw || 0.0,
      deficit_mw: bs.deficit_mw || 0.0,
      storage_mwh: bs.storage_mwh || 0.0,
    };
  }

  const queued = state.build_queue
    .filter(e => e.geoid === gid)
    .map(e => ({
      action_id: e.action_id,
      magnitude: e.magnitude,
      decision_year: e.decision_year,
      operational_year: e.operational_year,
      throttle_reason: e.throttle_reason,
      commissioned: e.commissioned,
    }));

  const couplings = state.active_couplings.filter(
    c => c.demand_geoid === gid || c.supply_geoid === gid
  );

  return {
    ...baseline,
    E: liveEes.E ?? (baseline.E as number) ?? 0.0,
    Ec: liveEes.Ec ?? (baseline.Ec as number) ?? 0.0,
    S: liveEes.S ?? (baseline.S as number) ?? 0.0,
    county_load_mw: liveEes.load_mw ?? 0.0,
    county_added_firm_mw: liveEes.added_firm_mw ?? 0.0,
    county_deficit_mw: liveEes.deficit_mw ?? 0.0,
    bus_state: busLive,
    queued_builds: queued,
    active_couplings: couplings,
  };
}

// ── Get Material Ledger ─────────────────────────────────────────────────────

function computeActionCapex(action: ActionRecord, magnitude: number): number {
  if (action.atb_capex_2025) return action.atb_capex_2025 * 1000.0 * magnitude;
  if (action.atb_capex_2023) return action.atb_capex_2023 * 1000.0 * magnitude;
  if (action.cost_2024) return action.cost_2024 * magnitude;
  return 0.0;
}

export function getMaterialLedger(state: EngineState): MaterialLedgerSummary {
  const actionsLib = state.action_library.actions;
  const summary: Record<string, { total: number; unit: string }> = {};
  for (const [matType, v] of Object.entries(state.material_ledger)) {
    summary[matType] = { total: Math.round(v.total * 100) / 100, unit: v.unit };
  }

  const byActionType: Record<string, { capex_usd: number; count: number; materials: Record<string, number> }> = {};
  const byLocation: Record<string, { capex_usd: number; count: number; materials: Record<string, number> }> = {};
  let totalCapexUsd = 0.0;

  for (const record of state.action_history) {
    const actionId = record.action_id;
    const loc = record.location;
    const magnitude = record.magnitude;
    const action = actionsLib[actionId] || {};
    const capex = computeActionCapex(action, magnitude);
    totalCapexUsd += capex;

    if (!byActionType[actionId]) byActionType[actionId] = { capex_usd: 0, count: 0, materials: {} };
    byActionType[actionId].capex_usd += capex;
    byActionType[actionId].count += 1;

    if (!byLocation[loc]) byLocation[loc] = { capex_usd: 0, count: 0, materials: {} };
    byLocation[loc].capex_usd += capex;
    byLocation[loc].count += 1;
  }

  for (const [matType, matData] of Object.entries(state.material_ledger)) {
    for (const entry of matData.by_action) {
      const aid = entry.action_id;
      const loc = entry.location;
      const qty = entry.quantity;
      if (byActionType[aid]) {
        byActionType[aid].materials[matType] = Math.round(((byActionType[aid].materials[matType] || 0) + qty) * 100) / 100;
      }
      if (byLocation[loc]) {
        byLocation[loc].materials[matType] = Math.round(((byLocation[loc].materials[matType] || 0) + qty) * 100) / 100;
      }
    }
  }

  for (const v of Object.values(byActionType)) v.capex_usd = Math.round(v.capex_usd * 100) / 100;
  for (const v of Object.values(byLocation)) v.capex_usd = Math.round(v.capex_usd * 100) / 100;

  return {
    summary, by_action_type: byActionType,
    by_location: byLocation, total_capex_usd: Math.round(totalCapexUsd * 100) / 100,
  };
}

// ── Get Pathway Conditions ──────────────────────────────────────────────────

export function getPathwayConditions(state: EngineState, _scenarioProfile?: ScenarioProfile): PathwayConditions {
  const nearest = nearestScenario(state);

  const countyVals = Object.values(state.county_ees);
  let eCurr = 0, ecCurr = 0, sCurr = 0;
  if (countyVals.length > 0) {
    const pops = countyVals.map(v => v.population || 1);
    const totalPop = pops.reduce((a, b) => a + b, 0);
    if (totalPop > 0) {
      eCurr = countyVals.reduce((s, v, i) => s + v.E * pops[i], 0) / totalPop;
      ecCurr = countyVals.reduce((s, v, i) => s + v.Ec * pops[i], 0) / totalPop;
      sCurr = countyVals.reduce((s, v, i) => s + v.S * pops[i], 0) / totalPop;
    } else {
      const n = countyVals.length;
      eCurr = countyVals.reduce((s, v) => s + v.E, 0) / n;
      ecCurr = countyVals.reduce((s, v) => s + v.Ec, 0) / n;
      sCurr = countyVals.reduce((s, v) => s + v.S, 0) / n;
    }
  }

  const currentEes: EESSummaryLevel = {
    E: Math.round(eCurr * 10000) / 10000,
    Ec: Math.round(ecCurr * 10000) / 10000,
    S: Math.round(sCurr * 10000) / 10000,
  };

  let targets: Record<string, TargetGap> = {};
  let conditions: Record<string, unknown>[] = [];
  let ecoregionGaps: Record<string, unknown> = {};
  let scenarioSummary: PathwayConditions['nearest_scenario'] = null;

  if (nearest) {
    const t = nearest.targets;
    for (const [cap, curr] of [['E', eCurr], ['Ec', ecCurr], ['S', sCurr]] as const) {
      const tgt = t[cap] ?? 5.0;
      targets[cap] = {
        target: tgt, current: Math.round(curr * 10000) / 10000,
        gap: Math.round((tgt - curr) * 10000) / 10000, met: curr >= tgt,
      };
    }
    conditions = (nearest.conditions || []) as Record<string, unknown>[];
    ecoregionGaps = nearest.ecoregion_gaps || {};
    scenarioSummary = {
      scenario_id: nearest.scenario_id,
      scenario_name: nearest.scenario_name,
      distance: nearest.distance,
      targets: nearest.targets,
      group: nearest.group,
    };
  }

  return {
    nearest_scenario: scenarioSummary,
    current_ees: currentEes,
    targets,
    conditions,
    ecoregion_gaps: ecoregionGaps,
  };
}

// ── Apply Fiscal Effects (internal) ────────────────────────────────────────

function applyFiscalEffects(
  state: EngineState,
  actionId: string,
  geoid: string | null,
  magnitude: number,
): FiscalDelta | null {
  if (!geoid || !(geoid in state.county_fiscal)) return null;

  const actionCoeffs = state.fiscal_coefficients[actionId];
  if (!actionCoeffs) return null;

  const cf = state.county_fiscal[geoid];
  const currentYear = state.year;

  let ledger_a_delta = 0;
  let ledger_b_delta = 0;
  let ledger_c_delta = 0;
  let property_tax_delta = 0;
  let sales_use_delta = 0;

  // Property tax (from new assessed value)
  const ptValue = actionCoeffs.property_tax_annual?.[geoid];
  if (ptValue !== undefined && ptValue !== null) {
    property_tax_delta = ptValue;
    cf.property_tax += ptValue;
  }

  // Sales/use tax (one-time construction)
  const sucValue = actionCoeffs.sales_use_construction;
  if (sucValue !== undefined && sucValue !== null) {
    sales_use_delta = sucValue;
    cf.sales_use += sucValue;
  }

  // Ledger A: coal retirement ad valorem production delta
  const avEntry = actionCoeffs.coal_retirement_advalorem_delta_per_mw?.[geoid];
  if (avEntry) {
    const avPerMw = avEntry.value || 0;
    ledger_a_delta = avPerMw * magnitude;
    cf.advalorem_production += ledger_a_delta;
    cf.ledger_a_cumulative_delta += ledger_a_delta;

    // Update assessed mineral value proportionally
    const assessed_delta_per_mw = avEntry.assessed_delta_per_mw || 0;
    const mineral_av_change = assessed_delta_per_mw * magnitude;
    cf.assessed_mineral += mineral_av_change;
  }

  // Ledger B: coal retirement severance delta
  const sevEntry = actionCoeffs.coal_retirement_severance_delta_per_mw?.[geoid];
  if (sevEntry) {
    const sevPerMw = sevEntry.value || 0;
    ledger_b_delta = sevPerMw * magnitude;
    cf.severance_share += ledger_b_delta;
    cf.ledger_b_cumulative_delta += ledger_b_delta;
  }

  // Ledger C: school finance net sensitivity
  const sfEntry = actionCoeffs.school_finance_net?.[geoid];
  if (sfEntry && avEntry) {
    const sf_net_total = sfEntry.net_total || 0;
    const sf_mineral_share = sfEntry.mineral_share || 0;
    const baseline_mineral_av = cf.assessed_mineral_baseline || 1;

    if (baseline_mineral_av > 0 && sf_mineral_share > 0) {
      const assessed_delta_per_mw = avEntry.assessed_delta_per_mw || 0;
      const mineral_av_change = assessed_delta_per_mw * magnitude;
      const mineral_frac_change = mineral_av_change / baseline_mineral_av;
      ledger_c_delta = sf_net_total * sf_mineral_share * mineral_frac_change;
      cf.school_finance_net += ledger_c_delta;
      cf.ledger_c_cumulative_delta += ledger_c_delta;
    }
  }

  // Record fiscal action
  const fiscalAction: FiscalAction = {
    action_id: actionId,
    commission_year: currentYear,
    magnitude,
    ledger_a_delta,
    ledger_b_delta,
    ledger_c_delta,
    property_tax_delta,
    sales_use_delta,
  };
  cf.fiscal_actions.push(fiscalAction);

  return {
    geoid,
    ledger_a_delta,
    ledger_b_delta,
    ledger_c_delta,
    property_tax_delta,
    sales_use_delta,
  };
}

// ── Get County Fiscal ──────────────────────────────────────────────────────

export function getCountyFiscal(state: EngineState, geoid: string): Record<string, unknown> | null {
  const gid = geoid.padStart(5, '0');
  const cf = state.county_fiscal[gid];
  if (!cf) return null;

  // Build trajectories from fiscal_actions
  const a_traj: { year: number; level: number }[] = [];
  const b_traj: { year: number; level: number }[] = [];
  const c_traj: { year: number; level: number }[] = [];
  let a_running = cf.advalorem_production - cf.ledger_a_cumulative_delta;
  let b_running = cf.severance_share - cf.ledger_b_cumulative_delta;
  let c_running = cf.school_finance_net - cf.ledger_c_cumulative_delta;

  for (const fa of cf.fiscal_actions) {
    a_running += fa.ledger_a_delta;
    b_running += fa.ledger_b_delta;
    c_running += fa.ledger_c_delta;
    a_traj.push({ year: fa.commission_year, level: Math.round(a_running * 100) / 100 });
    b_traj.push({ year: fa.commission_year, level: Math.round(b_running * 100) / 100 });
    c_traj.push({ year: fa.commission_year, level: Math.round(c_running * 100) / 100 });
  }

  return {
    geoid: gid,
    assessed_values: {
      mineral: Math.round(cf.assessed_mineral * 100) / 100,
      industrial: Math.round(cf.assessed_industrial * 100) / 100,
      commercial: Math.round(cf.assessed_commercial * 100) / 100,
      residential: Math.round(cf.assessed_residential * 100) / 100,
      agricultural: Math.round(cf.assessed_agricultural * 100) / 100,
      all_other: Math.round(cf.assessed_all_other * 100) / 100,
    },
    revenue_by_source: {
      property_tax: Math.round(cf.property_tax * 100) / 100,
      advalorem_production: Math.round(cf.advalorem_production * 100) / 100,
      severance_share: Math.round(cf.severance_share * 100) / 100,
      federal_royalty_share: Math.round(cf.federal_royalty_share * 100) / 100,
      sales_use: Math.round(cf.sales_use * 100) / 100,
      pilt: Math.round(cf.pilt * 100) / 100,
      school_finance_net: Math.round(cf.school_finance_net * 100) / 100,
    },
    ledger_a: Math.round(cf.advalorem_production * 100) / 100,
    ledger_b: Math.round(cf.severance_share * 100) / 100,
    ledger_c: Math.round(cf.school_finance_net * 100) / 100,
    ledger_a_cumulative_delta: Math.round(cf.ledger_a_cumulative_delta * 100) / 100,
    ledger_b_cumulative_delta: Math.round(cf.ledger_b_cumulative_delta * 100) / 100,
    ledger_c_cumulative_delta: Math.round(cf.ledger_c_cumulative_delta * 100) / 100,
    ledger_a_trajectory: a_traj,
    ledger_b_trajectory: b_traj,
    ledger_c_trajectory: c_traj,
  };
}

// ── Compute Fiscal Delta (pure preview — no state mutation) ─────────────────

export function computeFiscalDelta(
  state: EngineState,
  actionId: string,
  geoid: string | null,
  magnitude: number,
): FiscalDelta | null {
  if (!geoid || !(geoid in state.county_fiscal)) return null;

  const actionCoeffs = state.fiscal_coefficients[actionId];
  if (!actionCoeffs) return null;

  const cf = state.county_fiscal[geoid];

  let ledger_a_delta = 0;
  let ledger_b_delta = 0;
  let ledger_c_delta = 0;
  let property_tax_delta = 0;
  let sales_use_delta = 0;

  const ptValue = actionCoeffs.property_tax_annual?.[geoid];
  if (ptValue !== undefined && ptValue !== null) {
    property_tax_delta = ptValue;
  }

  const sucValue = actionCoeffs.sales_use_construction;
  if (sucValue !== undefined && sucValue !== null) {
    sales_use_delta = sucValue;
  }

  const avEntry = actionCoeffs.coal_retirement_advalorem_delta_per_mw?.[geoid];
  if (avEntry) {
    ledger_a_delta = (avEntry.value || 0) * magnitude;
  }

  const sevEntry = actionCoeffs.coal_retirement_severance_delta_per_mw?.[geoid];
  if (sevEntry) {
    ledger_b_delta = (sevEntry.value || 0) * magnitude;
  }

  const sfEntry = actionCoeffs.school_finance_net?.[geoid];
  if (sfEntry && avEntry) {
    const sf_net_total = sfEntry.net_total || 0;
    const sf_mineral_share = sfEntry.mineral_share || 0;
    const baseline_mineral_av = cf.assessed_mineral_baseline || 1;
    if (baseline_mineral_av > 0 && sf_mineral_share > 0) {
      const assessed_delta_per_mw = avEntry.assessed_delta_per_mw || 0;
      const mineral_av_change = assessed_delta_per_mw * magnitude;
      const mineral_frac_change = mineral_av_change / baseline_mineral_av;
      ledger_c_delta = sf_net_total * sf_mineral_share * mineral_frac_change;
    }
  }

  return { geoid, ledger_a_delta, ledger_b_delta, ledger_c_delta, property_tax_delta, sales_use_delta };
}

// ── Existing Assets API (Phase W5) ──────────────────────────────────────────

export function getExistingAssets(state: EngineState, geoid: string): AnyExistingAsset[] {
  const padded = geoid.padStart(5, '0');
  const all = state.existing_assets[padded] || [];
  return all.filter(e => e.excluded === null);
}

// ── Reduce Production Asset (X2) ────────────────────────────────────────────

export function reduceProductionAsset(
  inputState: EngineState,
  geoid: string,
  commodity: string,
  delta_volume: number,
  year?: number,
): [EngineState, Record<string, unknown>] {
  const padded = geoid.padStart(5, '0');
  const assets = inputState.existing_assets[padded] || [];
  const idx = assets.findIndex(
    e => e.asset_kind === 'production_asset' && (e as ProductionAsset).commodity === commodity,
  );
  if (idx === -1) {
    throw new Error(`No production_asset found for geoid=${padded}, commodity=${commodity}`);
  }

  const state = shallowCopyState(inputState);
  // Copy-on-write: new array + new asset object (existing_assets view)
  const newAssets = [...(state.existing_assets[padded] || [])];
  const pa: ProductionAsset = { ...(newAssets[idx] as ProductionAsset) };
  const actual_delta = Math.min(delta_volume, pa.production_volume);
  pa.production_volume = pa.production_volume - actual_delta;
  newAssets[idx] = pa;
  state.existing_assets = { ...state.existing_assets, [padded]: newAssets };

  // v3.0: also update registry source of truth
  const regIdx = state.asset_registry.findIndex(
    a => a.origin === 'baseline' && a.asset_class === 'production' && a.geoid === padded && a.commodity === commodity,
  );
  if (regIdx !== -1) {
    state.asset_registry[regIdx].production_volume = pa.production_volume;
  }

  // Ledger B: severance (per-unit rate × county distribution share)
  const ledger_b_delta = Math.round(
    -actual_delta * pa.effective_severance_rate_per_unit * pa.county_distribution_share * 100,
  ) / 100;

  // Ledger A: advalorem production tax — county direct, no distribution share
  const ledger_a_delta = pa.advalorem_rate_per_unit !== null
    ? Math.round(-actual_delta * pa.advalorem_rate_per_unit * 100) / 100
    : 0.0;
  const ledger_a_status = pa.advalorem_rate_per_unit !== null ? 'applied' : 'deferred_pending_dor';

  // Mineral AV change (drives assessed_mineral update + Ledger C)
  const mineral_av_change = pa.assessed_delta_per_unit !== null
    ? pa.assessed_delta_per_unit * actual_delta
    : 0.0;

  // Apply to county_fiscal (shallowCopyState already cloned fiscal layer)
  let ledger_c_delta = 0.0;
  if (padded in state.county_fiscal) {
    const cf = state.county_fiscal[padded];

    // Ledger B
    cf.severance_share += ledger_b_delta;
    cf.ledger_b_cumulative_delta += ledger_b_delta;

    // Ledger A + assessed_mineral update
    if (ledger_a_delta !== 0) {
      cf.advalorem_production += ledger_a_delta;
      cf.ledger_a_cumulative_delta += ledger_a_delta;
      if (mineral_av_change !== 0) {
        // Round to 2dp after each accumulation to match Python's round() behavior
        cf.assessed_mineral = Math.round((cf.assessed_mineral + mineral_av_change) * 100) / 100;
      }
    }

    // Ledger C: school finance recapture sensitivity
    if (mineral_av_change !== 0 && cf.assessed_mineral_baseline > 0 && cf.school_finance_mineral_share > 0) {
      const mineral_frac_change = mineral_av_change / cf.assessed_mineral_baseline;
      // Back-calculate baseline school finance net
      const sf_net_baseline = cf.school_finance_net - cf.ledger_c_cumulative_delta;
      ledger_c_delta = Math.round(sf_net_baseline * cf.school_finance_mineral_share * mineral_frac_change * 100) / 100;
      cf.school_finance_net += ledger_c_delta;
      cf.ledger_c_cumulative_delta += ledger_c_delta;
    }

    const fiscalAction: FiscalAction = {
      action_id: `production_decline_${commodity}`,
      commission_year: year ?? state.year,
      magnitude: actual_delta,
      ledger_a_delta,
      ledger_b_delta,
      ledger_c_delta,
      property_tax_delta: 0,
      sales_use_delta: 0,
    };
    cf.fiscal_actions.push(fiscalAction);
  }

  // v3.1: reclamation obligation tracking
  const lcState = state.lifecycle_coefficients as Record<string, unknown> | null;
  const recCfgState = (lcState?.reclamation as Record<string, unknown> | undefined);
  const tonsPerAcre = (recCfgState?.tons_per_acre as number | undefined) ?? 10000;
  const jobsPer100 = (recCfgState?.jobs_per_100_acres_yr as number | undefined) ?? 2.5;
  const bondYears = (recCfgState?.bond_release_duration_years as number | undefined) ?? 10;
  const effectiveYear = year ?? state.year;
  const newAcres = tonsPerAcre > 0 ? Math.round((actual_delta / tonsPerAcre) * 10000) / 10000 : 0;

  if (regIdx !== -1) {
    const regAsset = state.asset_registry[regIdx];
    const log: Array<{ year: number; acres: number }> = regAsset.reclamation_year_log
      ? [...regAsset.reclamation_year_log]
      : [];
    if (newAcres > 0) {
      log.push({ year: effectiveYear, acres: newAcres });
    }
    regAsset.reclamation_year_log = log;
    const activeAcres = log.reduce(
      (sum, e) => sum + (effectiveYear - e.year < bondYears ? e.acres : 0),
      0,
    );
    regAsset.active_reclamation_acres = Math.round(activeAcres * 10000) / 10000;
    regAsset.reclamation_jobs_direct = Math.round(activeAcres * jobsPer100 / 100 * 100) / 100;
  }

  const delta_summary: Record<string, unknown> = {
    action: 'reduce_production_asset',
    geoid: padded,
    commodity,
    delta_volume: actual_delta,
    new_volume: pa.production_volume,
    ledger_a_delta,
    ledger_b_delta,
    ledger_c_delta,
    ledger_a_status,
  };

  return [state, delta_summary];
}

// ── Preview Production Reduction (pure — no state mutation) ─────────────────

export interface ProductionReductionPreview {
  actual_delta: number;
  new_volume: number;
  ledger_a_delta: number;
  ledger_b_delta: number;
  ledger_c_delta: number;
}

/**
 * Compute the three-ledger fiscal impact of a production reduction without
 * mutating state. Mirrors reduceProductionAsset math exactly; use this for
 * impact preview modals.
 */
export function previewProductionReduction(
  state: EngineState,
  geoid: string,
  commodity: string,
  delta_volume: number,
): ProductionReductionPreview | null {
  const padded = geoid.padStart(5, '0');
  const assets = state.existing_assets[padded] || [];
  const pa = assets.find(
    e => e.asset_kind === 'production_asset' && (e as ProductionAsset).commodity === commodity,
  ) as ProductionAsset | undefined;
  if (!pa) return null;

  const actual_delta = Math.min(delta_volume, pa.production_volume);
  const new_volume = pa.production_volume - actual_delta;

  const ledger_b_delta = Math.round(
    -actual_delta * pa.effective_severance_rate_per_unit * pa.county_distribution_share * 100,
  ) / 100;

  const ledger_a_delta = pa.advalorem_rate_per_unit !== null
    ? Math.round(-actual_delta * pa.advalorem_rate_per_unit * 100) / 100
    : 0;

  const mineral_av_change = pa.assessed_delta_per_unit !== null
    ? pa.assessed_delta_per_unit * actual_delta
    : 0;

  let ledger_c_delta = 0;
  const cf = state.county_fiscal[padded];
  if (cf && mineral_av_change !== 0 && cf.assessed_mineral_baseline > 0 && cf.school_finance_mineral_share > 0) {
    const mineral_frac_change = mineral_av_change / cf.assessed_mineral_baseline;
    const sf_net_baseline = cf.school_finance_net - cf.ledger_c_cumulative_delta;
    ledger_c_delta = Math.round(sf_net_baseline * cf.school_finance_mineral_share * mineral_frac_change * 100) / 100;
  }

  return { actual_delta, new_volume, ledger_a_delta, ledger_b_delta, ledger_c_delta };
}

// ── History Digest + Projection API (v4.0) ───────────────────────────────────

/**
 * Serialize history with sorted keys matching Python's json.dumps(sort_keys=True, separators=(',',':')).
 *
 * Key type rule:
 *   - "year" field (integer concept): no decimal point → 2027
 *   - All other numbers: Python float serialization → whole numbers get ".0" suffix
 *   - null → "null"
 *
 * This matches Python's behavior: integer values serialize as "2027", float values
 * as "0.0", "47401088.09", etc.
 */
function serializeHistoryCanonical(history: IndicatorSnapshot[]): string {
  const INTEGER_KEYS = new Set(['year']);

  function ser(val: unknown, key?: string): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') {
      if (key && INTEGER_KEYS.has(key)) {
        // Python int serialization — no decimal
        return String(Math.round(val));
      }
      // Python float serialization — integers get ".0" suffix
      if (Number.isInteger(val) && Math.abs(val) < Number.MAX_SAFE_INTEGER) {
        return val.toFixed(1);
      }
      return JSON.stringify(val);
    }
    if (typeof val === 'string') return JSON.stringify(val);
    if (Array.isArray(val)) return '[' + val.map(v => ser(v)).join(',') + ']';
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const pairs = keys.map(k => JSON.stringify(k) + ':' + ser((val as Record<string, unknown>)[k], k));
    return '{' + pairs.join(',') + '}';
  }

  return '[' + history.map(snap => ser(snap)).join(',') + ']';
}

/**
 * Create a digest of state.history.
 *
 * Separate from stateDigest / fiscalDigest / existingAssetsDigest — those three
 * are the main digest set (Golden A–H contract). historyDigest is additive:
 * adding history to state does not change any of A–H's md5 values.
 *
 * The phrasing for UI: projections are "conditional forecasts under 'no further
 * decisions,' not predictions" — this exact phrasing ships to the UI verbatim.
 */
export function historyDigest(state: EngineState): { n_years: number; year_range: number[]; md5: string } {
  const history = state.history ?? [];
  if (history.length === 0) {
    const md5 = computeMd5Hex('[]');
    return { n_years: 0, year_range: [], md5 };
  }
  const canonical = serializeHistoryCanonical(history);
  const md5 = computeMd5Hex(canonical);
  return {
    n_years: history.length,
    year_range: [history[0].year, history[history.length - 1].year],
    md5,
  };
}

/**
 * Project state forward n_years with no further decisions.
 *
 * This is a CONDITIONAL FORECAST under 'no further decisions,' not a prediction.
 * The distinction matters for UI display: projections show likely trajectories
 * given the current action set and autonomous dynamics (coal decline, depreciation,
 * housing permits). They are NOT predictions of what will happen — player decisions,
 * market shifts, and policy changes not captured in the model will alter outcomes.
 */
export function project(state: EngineState, nYears: number): EngineState[] {
  const states: EngineState[] = [];
  let s = state;
  for (let i = 0; i < nYears; i++) {
    s = advanceYear(s);
    states.push(s);
  }
  return states;
}

/**
 * Project n_years forward with one action applied, returning both the action
 * trajectory and the baseline trajectory.
 *
 * This is a CONDITIONAL FORECAST under 'no further decisions,' not a prediction.
 * The delta shows the marginal impact of a single action vs. the do-nothing baseline
 * under the same autonomous dynamics.
 *
 * Returns [actionStates, baselineStates] — both length-nYears arrays.
 */
export function projectDelta(
  state: EngineState,
  actionId: string,
  geoid: string,
  magnitude: number,
  nYears: number,
): [EngineState[], EngineState[]] {
  const [stateWithAction] = applyAction(state, actionId, geoid, magnitude);
  const baselineStates = project(state, nYears);
  const actionStates = project(stateWithAction, nYears);
  return [actionStates, baselineStates];
}
