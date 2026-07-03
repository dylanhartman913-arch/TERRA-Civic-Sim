/**
 * TERRA Engine v2.4 — TypeScript port.
 * Pure functions only. No mutation of input state, no React imports, no side effects.
 * Uses structural sharing (deep-clone mutable stores, share immutable references).
 * v2.4 adds full three-ledger X2 support: Ledger A (advalorem) + Ledger C (school finance
 * recapture sensitivity) wired into reduceProductionAsset alongside Ledger B (severance).
 */

import type {
  EngineState,
  CountyEES,
  CountyEESBaseline,
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
} from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const FIRM_FUEL_TYPES = new Set(['nuclear', 'gas', 'coal', 'hydro', 'geothermal', 'storage']);

const PRB_COAL_TONS_PER_MW_YR = 3743.4; // EIA-923 heat-rate proxy (W2 severance source)

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

// ── Existing Assets Seeding ─────────────────────────────────────────────────

function seedExistingAssets(countyCards: Record<string, unknown>): Record<string, AnyExistingAsset[]> {
  const existing: Record<string, AnyExistingAsset[]> = {};
  for (const [geoid, card] of Object.entries(countyCards)) {
    const cardObj = card as Record<string, unknown>;
    const flagships = (cardObj.flagship_assets as unknown[]) || [];
    if (!flagships.length) continue;
    const entries: AnyExistingAsset[] = [];
    for (const rawAsset of flagships) {
      const asset = rawAsset as Record<string, unknown>;
      const cap = asset.capacity_or_load_mw as number | null | undefined;
      const assetType = (asset.type as string) || 'unknown';
      const name = (asset.name as string) || '';
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

      // Check production_asset data first (EIA-7A/MSHA sourced; MW conversion not applicable)
      const prodData = PRODUCTION_ASSET_DATA[`${geoid}|${name}`];
      if (prodData !== undefined) {
        const pa: ProductionAsset = {
          ...base,
          asset_kind: 'production_asset',
          capacity_mw: null,
          coal_tons_yr: null,
          production_proxy: null,
          fiscal_action_id: null,
          excluded: null,
          employment_direct: null,
          ...prodData,
        };
        entries.push(pa);
      } else if (cap == null) {
        entries.push({ ...base, capacity_mw: null, coal_tons_yr: null, production_proxy: null, fiscal_action_id: null, excluded: 'no_mw_conversion' });
      } else {
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
        entries.push({ ...base, asset_kind: 'mw_asset', capacity_mw, coal_tons_yr, production_proxy, fiscal_action_id, excluded: null });
      }
    }
    if (entries.length > 0) existing[geoid] = entries;
  }
  return existing;
}

// ── Asset Registry (v3.0) ──────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function resolveAssetClass(assetType: string, assetKind?: string): 'generator' | 'demand' | 'production' | 'storage' {
  if (assetKind === 'production_asset') return 'production';
  if (assetType === 'data_center') return 'demand';
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
        });
      }
    }
  }
  return registry;
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

/** Materialize existing_assets view from asset_registry (baseline-origin assets only). */
function materializeExistingAssets(registry: AssetInstance[]): Record<string, AnyExistingAsset[]> {
  const result: Record<string, AnyExistingAsset[]> = {};
  for (const a of registry) {
    if (a.origin !== 'baseline') continue;
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

  // v3.0: deep-copy registry (each entry is a flat object with only primitives/nulls)
  const registry = state.asset_registry.map(a => ({ ...a }));

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
): EngineState {
  // County EES (primary capital store)
  const county_ees: Record<string, CountyEES> = {};
  for (const row of countyEesBaseline) {
    const geoid = row.geoid.padStart(5, '0');
    county_ees[geoid] = {
      E: row.E, Ec: row.Ec, S: row.S,
      E_baseline: row.E, Ec_baseline: row.Ec, S_baseline: row.S,
      county_name: row.county_name,
      population: row.population,
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
  };
}

// ── Apply Action ────────────────────────────────────────────────────────────

export function applyAction(
  inputState: EngineState,
  actionId: string,
  location: string | number,
  magnitude: number,
  _skipCoupling: boolean = false,
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

  // v3.0: push to asset_registry, then re-materialize build_queue view
  const gid = String(geoid);
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
  };
  state.asset_registry.push(registryEntry);
  state.build_queue = materializeBuildQueue(state.asset_registry);

  return state;
}

// ── Advance Year ────────────────────────────────────────────────────────────

export function advanceYear(inputState: EngineState): EngineState {
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

  // v3.0: execute scheduled retirements
  let retiredAny = false;
  for (const asset of state.asset_registry) {
    if (asset.scheduled_retirement_year === currentYear && asset.lifecycle === 'operating') {
      asset.lifecycle = 'retired';
      retiredAny = true;
      // Reverse capacity through existing network heuristic
      if (asset.capacity_mw !== null && asset.capacity_mw > 0) {
        const busId = resolveGeoidToBus(state, asset.geoid);
        if (busId && state.bus_state[busId]) {
          state.bus_state[busId].capacity_mw -= asset.capacity_mw;
          state.bus_state[busId].firm_capacity_mw -= asset.capacity_mw;
        }
      }
    }
  }
  if (retiredAny) {
    state.build_queue = materializeBuildQueue(state.asset_registry);
    state.existing_assets = materializeExistingAssets(state.asset_registry);
  }

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
  if (!['generator', 'demand', 'storage'].includes(asset.asset_class)) {
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

/**
 * Push a scheduled retirement later. Returns [newState, { delay_cost_hook }].
 * delay_cost_hook is zeroed out (coefficient placeholder, confidence: low).
 */
export function delayRetirement(
  inputState: EngineState,
  asset_id: string,
  new_year: number,
): [EngineState, { delay_cost_hook: number }] {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.scheduled_retirement_year === null) {
    throw new Error(`Asset ${asset_id} has no scheduled retirement to delay`);
  }
  if (new_year <= asset.scheduled_retirement_year) {
    throw new Error(`new_year ${new_year} must be later than current ${asset.scheduled_retirement_year}`);
  }
  state.asset_registry[idx].scheduled_retirement_year = new_year;
  return [state, { delay_cost_hook: 0 }];
}

/**
 * Cancel a player-queued asset before commissioning.
 * Returns [newState, { sunk_cost_fraction }].
 * sunk_cost_fraction is zeroed out (price hook for Z2).
 */
export function cancelQueued(
  inputState: EngineState,
  asset_id: string,
): [EngineState, { sunk_cost_fraction: number }] {
  const state = shallowCopyState(inputState);
  const idx = state.asset_registry.findIndex(a => a.asset_id === asset_id);
  if (idx === -1) throw new Error(`Asset not found: ${asset_id}`);
  const asset = state.asset_registry[idx];
  if (asset.origin !== 'player') {
    throw new Error(`cancelQueued only applies to player-origin assets, got '${asset.origin}'`);
  }
  if (asset.lifecycle !== 'queued' && asset.lifecycle !== 'under_construction') {
    throw new Error(`Cannot cancel asset in lifecycle '${asset.lifecycle}'`);
  }
  state.asset_registry[idx].lifecycle = 'retired';
  state.build_queue = materializeBuildQueue(state.asset_registry);
  return [state, { sunk_cost_fraction: 0 }];
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
        cf.assessed_mineral += mineral_av_change;
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
