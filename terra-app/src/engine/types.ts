/**
 * TERRA Engine v2.1 TypeScript types.
 * Mirrors the Python engine state and v3 JSON schema exactly.
 */

// ── EES Capital Scores ──────────────────────────────────────────────────────

export interface CountyEES {
  E: number;
  Ec: number;
  S: number;
  E_baseline: number;
  Ec_baseline: number;
  S_baseline: number;
  county_name: string;
  population: number;              // total population; advanced each year by advanceYear (v4.2)
  working_age_population: number;  // ages 18-64; ACS B01001 base; advanced proportionally (v4.2)
  load_mw: number;
  added_firm_mw: number;
  deficit_mw: number;
}

// ── Population Projection (v4.2) ────────────────────────────────────────────

/** Per-county baseline projection data. Loaded from county_population_projections.json. */
export interface PopulationProjection {
  county_name: string;
  source: string;                  // "WY_EAD_2022" | "CO_SDO_2022" | "ACS_2022_trend"
  confidence: string;
  method: 'official_projection' | 'acs_trend' | 'constant_share';
  base_population: number;
  base_year: number;
  working_age_share: number;       // fraction of population aged 18-64 (ACS B01001)
  annual_growth_rate: number;      // compound annual rate; engine uses (1 + r) per step
  note?: string;
  flag?: string;                   // "no_published_projection_constant_share" for derived counties
}

/**
 * Session-level population model configuration.
 * Stored on EngineState; can be overridden in session config to pin population
 * to the baseline projection (disable employment-linked migration).
 */
export interface PopulationConfig {
  migration_enabled: boolean;
  /** Economic-base multiplier for ops-job → permanent-resident link.
   *  Headwaters Economics (2017) rural energy multiplier range: 1.4–2.0.
   *  confidence: low — highly uncertain for small western counties. */
  labor_migration_multiplier: number;
  migration_confidence: 'low';
}

export interface EcoregionEES {
  E: number;
  Ec: number;
  S: number;
  E_baseline: number;
  Ec_baseline: number;
  S_baseline: number;
}

// ── Bus and Branch State ────────────────────────────────────────────────────

export interface BusState {
  capacity_mw: number;
  firm_capacity_mw: number;
  load_mw: number;
  deficit_mw: number;
  storage_mwh: number;
}

export interface Bus {
  ba_code: string;
  ecoregion_code: string | null;
  lat: number;
  lon: number;
  generation_mw: number;
  load_mw: number;
  storage_mwh: number;
  role: string;
  fuel_mix: Record<string, number>;
}

export interface Branch {
  from_bus: string;
  to_bus: string;
  thermal_limit_mw: number;
  voltage_kv: number;
  active: boolean;
}

// ── Coupling ────────────────────────────────────────────────────────────────

export interface ActiveCoupling {
  coupling_id: string;
  coupling_type: string;
  demand_geoid: string;
  demand_action: string;
  supply_geoid: string;
  supply_action: string;
  bus_id: string;
  tx_reduction_pct: number;
  reliability_credit: number;
  activated_year: number;
  reasoning: string;
}

// ── Build Queue ─────────────────────────────────────────────────────────────

export interface BuildQueueItem {
  action_id: string;
  geoid: string;
  magnitude: number;
  decision_year: number;
  operational_year: number;
  throttle_reason: string | null;
  commissioned: boolean;
}

// ── Supply Chain Pools ──────────────────────────────────────────────────────

export interface ScPool {
  capacity_per_year: number;
  used_this_year: number;
  operational_year: number | null;
  initial_value: number;
}

export interface ScPools {
  HALEU_kg_per_year: ScPool;
  fuel_fabrication_units_per_year: ScPool;
}

// ── Action Library v3 ───────────────────────────────────────────────────────

export interface CoefficientEntry {
  value: number;
  unit?: string;
  basis?: string;
  source?: string;
  year?: number;
  confidence?: string;
}

export interface MaterialSpec {
  unit?: string;
  primary_input?: string;
  source?: string;
  [key: string]: number | string | undefined;
}

export interface EESEffects {
  E?: number;
  Ec?: number;
  S?: number;
}

export interface ActionRecord {
  action_id?: string;
  action_name?: string;
  label?: string;
  bucket?: string;
  category?: string;
  subcategory?: string;
  tier?: string;
  unit?: string;
  unit_label?: string;
  unit_scale?: number;
  time_to_deploy?: number;
  design_life?: number;
  placement_scale?: string;
  placement_scale_secondary?: string;
  resolves_to?: string;
  network_effect?: string;
  flexibility?: number;
  applicable_ecoregions?: string[];
  applicable_counties?: string[];
  materials?: MaterialSpec;
  coefficients_per_mw?: Record<string, CoefficientEntry>;
  coefficients_per_mw_it?: Record<string, CoefficientEntry>;
  ees_effects?: EESEffects;
  ees_confidence?: Record<string, string>;
  ees_notes?: string;
  ees_sources?: string;
  synergy_groups?: string[];
  note?: string;
  atb_capex_2023?: number;
  atb_capex_2024?: number;
  atb_capex_2025?: number;
  atb_capex_2035?: number;
  atb_capex_2050?: number;
  atb_capex_unit?: string;
  atb_cf?: number;
  atb_cf_wacm?: number;
  atb_fom_2023?: number;
  atb_fom_2025?: number;
  atb_fom_2035?: number;
  atb_fom_2050?: number;
  atb_note?: string;
  atb_source?: string;
  atb_tech?: string;
  in_local_atb_file?: boolean;
  cost_2024?: number;
  cost_2035?: number;
  cost_2050?: number;
  capex_per_mw?: number;
  cost_source?: string;
  cost_unit?: string;
  confidence?: string;
  maturation_years?: number;
  requires_review_by?: string;
  suitability_source?: string;
  session3_note?: string;
  dissertation_note?: string;
}

export interface CouplingTrigger {
  demand_actions: string[];
  supply_actions: string[];
  supply_actions_with_threshold?: Record<string, { min_magnitude_mwh: number }>;
  spatial_condition: string;
}

export interface CouplingEffects {
  transmission_requirement_reduction_pct?: { value: number; unit?: string; confidence?: string };
  reliability_credit?: { value: number; unit?: string; confidence?: string };
  time_to_deploy_pair?: { formula?: string; note?: string; confidence?: string };
}

export interface NuclearDcCoupling {
  trigger: CouplingTrigger;
  effects: CouplingEffects;
  rationale?: string;
  confidence?: string;
}

export interface SupplyChainPool {
  initial_value: number;
  unit: string;
  source?: string;
  year?: number;
  confidence?: string;
  note?: string;
  operational_year?: number;
}

export interface SupplyChainThroughput {
  description?: string;
  pools: Record<string, SupplyChainPool>;
  smr_haleu_per_build: { value: number; unit?: string; source?: string; year?: number; confidence?: string; note?: string };
  queue_behavior?: string;
  smr_family_actions: string[];
  confidence?: string;
}

export interface CouplingRules {
  nuclear_dc_coupling?: NuclearDcCoupling;
  firm_supply_gap?: Record<string, unknown>;
  supply_chain_throughput?: SupplyChainThroughput;
}

export interface ActionLibrary {
  schema_version: string;
  changelog?: unknown;
  metadata?: unknown;
  actions: Record<string, ActionRecord>;
  coupling_rules: CouplingRules;
  disturbances?: Record<string, unknown>;
  _coefficient_audit?: unknown;
}

// ── Crosswalk ───────────────────────────────────────────────────────────────

export interface CrosswalkRow {
  geoid: string;
  bus_id: number;
  bus_weight: number;
  ecoregion_code: string;
  ecoregion_area_share: number;
  primary_bus: boolean;
}

// ── County EES Baseline (input) ─────────────────────────────────────────────

export interface CountyEESBaseline {
  geoid: string;
  county_name: string;
  E: number;
  Ec: number;
  S: number;
  population: number;
  n_tracts: number;
}

// ── Initial Network Data ────────────────────────────────────────────────────

export interface InitialNetwork {
  buses: Record<string, Bus>;
  branches: Record<string, Branch>;
  ba_flows: Record<string, number>;
  ecoregion_ees: Record<string, EcoregionEES>;
  study_area_buses: string[];
}

// ── Action History ──────────────────────────────────────────────────────────

export interface ActionHistoryRecord {
  action_id: string;
  location: string;
  geoid: string | null;
  magnitude: number;
  unit: string;
  ees_delta: Record<string, Record<string, number>>;
  network_delta: Record<string, Record<string, number>>;
  timestamp: number;
}

export interface DisturbanceHistoryRecord {
  disturbance_type: string;
  severity: number;
  geoids: string[];
  ees_delta: Record<string, Record<string, number>>;
  flexible_load_shed_mw: number;
  firm_load_affected_mw: number;
  deficit_mw_change: number;
  reliability_score_change: number;
  timestamp: number;
}

// ── County Fiscal State ─────────────────────────────────────────────────────

export interface FiscalAction {
  action_id: string;
  commission_year: number;
  magnitude: number;
  ledger_a_delta: number;
  ledger_b_delta: number;
  ledger_c_delta: number;
  property_tax_delta: number;
  sales_use_delta: number;
}

export interface CountyFiscal {
  assessed_mineral: number;
  assessed_industrial: number;
  assessed_commercial: number;
  assessed_residential: number;
  assessed_agricultural: number;
  assessed_all_other: number;
  mill_levy_mills: number;
  property_tax: number;
  advalorem_production: number;
  severance_share: number;
  federal_royalty_share: number;
  sales_use: number;
  pilt: number;
  school_finance_net: number;
  school_finance_mineral_share: number;
  assessed_mineral_baseline: number;
  ledger_a_cumulative_delta: number;
  ledger_b_cumulative_delta: number;
  ledger_c_cumulative_delta: number;
  fiscal_actions: FiscalAction[];
}

// ── Fiscal Coefficients (slimmed TS format) ─────────────────────────────────

export interface CoalRetirementAdValoremCoeff {
  value: number;
  assessed_delta_per_mw: number;
}

export interface CoalRetirementSeveranceCoeff {
  value: number;
}

export interface SchoolFinanceNetCoeff {
  net_total: number;
  mineral_share: number;
}

export interface FiscalActionCoeffs {
  property_tax_annual?: Record<string, number>;
  sales_use_construction?: number;
  coal_retirement_advalorem_delta_per_mw?: Record<string, CoalRetirementAdValoremCoeff>;
  coal_retirement_severance_delta_per_mw?: Record<string, CoalRetirementSeveranceCoeff>;
  school_finance_net?: Record<string, SchoolFinanceNetCoeff>;
}

export type FiscalCoefficients = Record<string, FiscalActionCoeffs>;

// ── Fiscal Baseline (slimmed TS format) ─────────────────────────────────────

export interface FiscalBaselineEntry {
  assessed_mineral: number;
  assessed_industrial: number;
  assessed_commercial: number;
  assessed_residential: number;
  assessed_agricultural: number;
  assessed_all_other: number;
  mill_levy_mills: number;
  production_tax_assessed: number;
  mineral_weighted_mill_levy: number;
  severance_share: number;
  federal_royalty_share: number;
  sales_use: number;
  pilt: number;
}

export type FiscalBaseline = Record<string, FiscalBaselineEntry>;

// ── Existing Assets (flagship baseline inventory) ──────────────────────────

/** MW-based asset (coal plant, nuclear, data center, gas) or excluded entry. */
export interface ExistingAsset {
  asset_kind?: 'mw_asset';   // undefined on excluded entries (no production volume data)
  name: string;
  geoid: string;
  county_name: string;
  state: string;
  type: string;
  status: string;
  capacity_mw: number | null;
  coal_tons_yr: number | null;
  production_proxy: number | null;
  fiscal_action_id: string | null;
  source_url: string;
  operational_year: number | null;
  excluded: 'no_mw_conversion' | null;
}

/**
 * Production-measured asset (mine, field) seeded from EIA-7A / MSHA data.
 * Phase X2 — parallel to ExistingAsset; keyed on commodity volume not MW.
 */
export interface ProductionAsset {
  asset_kind: 'production_asset';
  name: string;
  geoid: string;
  county_name: string;
  state: string;
  type: string;
  status: string;
  source_url: string;
  operational_year: number | null;
  // MW-based fields — null (not applicable)
  capacity_mw: null;
  coal_tons_yr: null;
  production_proxy: null;
  fiscal_action_id: null;
  excluded: null;
  // Production-specific fields
  commodity: 'coal_surface' | 'coal_underground' | 'oil' | 'natural_gas' | 'trona' | 'uranium';
  production_volume: number;
  production_unit: 'tons_yr' | 'bbl_yr' | 'mcf_yr' | 'lbs_u3o8_yr';
  production_confidence: 'high' | 'medium' | 'low';
  production_source: string;
  data_year: number;
  effective_severance_rate_per_unit: number;
  county_distribution_share: number;
  advalorem_rate_per_unit: number | null;
  assessed_delta_per_unit: number | null;
  /** Direct mining/operations jobs at this asset. Source: BLS QCEW. */
  employment_direct: number | null;
}

/** Union of all entry kinds that can appear in existing_assets[geoid]. */
export type AnyExistingAsset = ExistingAsset | ProductionAsset;

// ── Asset Registry (v3.0) ──────────────────────────────────────────────────

export type AssetOrigin = 'baseline' | 'player';
export type AssetLifecycle = 'operating' | 'queued' | 'under_construction' | 'retired';
export type AssetClass = 'generator' | 'demand' | 'production' | 'storage' | 'housing_stock' | 'site'
  | 'mine' | 'industrial_load' | 'commercial_anchor_load';  // v4.3 (F1) anchor classes

/** Unified asset instance — replaces BuildQueueItem + AnyExistingAsset as source of truth. */
export interface AssetInstance {
  asset_id: string;
  origin: AssetOrigin;
  lifecycle: AssetLifecycle;
  asset_class: AssetClass;

  // Common identity fields
  name: string;
  geoid: string;
  county_name: string;
  state: string;
  type: string;
  status: string;
  source_url: string;
  operational_year: number | null;

  // MW-based fields (null for production assets)
  capacity_mw: number | null;
  coal_tons_yr: number | null;
  production_proxy: number | null;
  fiscal_action_id: string | null;
  excluded: 'no_mw_conversion' | null;

  // ProductionAsset-specific (null for non-production)
  commodity: string | null;
  production_volume: number | null;
  production_unit: string | null;
  production_confidence: string | null;
  production_source: string | null;
  data_year: number | null;
  effective_severance_rate_per_unit: number | null;
  county_distribution_share: number | null;
  advalorem_rate_per_unit: number | null;
  assessed_delta_per_unit: number | null;
  employment_direct: number | null;

  // BuildQueueItem-specific (null for baseline)
  action_id: string | null;
  magnitude: number | null;
  decision_year: number | null;
  throttle_reason: string | null;
  commissioned: boolean | null;

  // Retirement scheduling (v3.0 Step 2+)
  scheduled_retirement_year: number | null;

  // v3.1 reclamation obligation tracking (production assets only; null for others)
  reclamation_year_log: Array<{ year: number; acres: number }> | null;
  active_reclamation_acres: number | null;
  reclamation_jobs_direct: number | null;

  // v3.2 decommissioning cost draw (MW-based generator assets only; null until retirement)
  decommissioning_cost_usd: number | null;
  decommissioning_labor_usd: number | null;
  decommissioning_duration_years: number | null;
  decommissioning_start_year: number | null;

  // v3.3 housing stock detail (housing_stock asset_class only; null for all other assets)
  housing_total_units: number | null;
  housing_occupied_units: number | null;
  housing_convertible_units: number | null;
  housing_subsidized_units: number | null;
  housing_permits_per_year: number | null;
  housing_affordable_added: number | null;
  housing_pressure_ratio: number | null;
  housing_seasonal_excluded: number | null;

  // v4.1 site mechanics (site asset_class only; null for all other assets)
  // Literature: DOE (2022) coal-to-nuclear siting study; Gorman et al. (2022) LBNL;
  // Kemmerer/Naughton brownfield reuse as validation anchor.
  site_origin_asset_id: string | null;          // asset_id of the retired asset that spawned this site
  site_origin_type: 'generator' | 'mine' | 'anchor' | null;
  site_class: 'thermal' | 'generator' | 'mine' | 'industrial' | 'commercial' | null;  // for SITE_COMPAT lookup
  interconnection_mw: number | null;            // inherited nameplate from retired generator
  water_rights_flag: boolean | null;            // known debt: populate from county data
  acres: number | null;                         // known debt: populate from county data
  workforce_pool_initial: number | null;        // ops jobs at retirement (NREL JEDI proxy)
  workforce_pool_current: number | null;        // decayed ops jobs (half-life 5 yr; Carley 2018)
  workforce_pool_half_life_years: number | null;
  site_spawn_year: number | null;
  restoration_eligibility: boolean | null;      // true for mine sites

  // v4.1 succession discount tracking (player-queued assets only; null for baseline/site)
  succession_site_id: string | null;            // site asset_id providing discounts
  ttd_reduction_applied: number | null;         // years subtracted from time_to_deploy
  capex_discount_fraction: number | null;       // fraction of overnight cost saved (confidence: low)
  tx_waiver_mw: number | null;                  // MW waived up to site.interconnection_mw
  convert_source_asset_id: string | null;       // coal_to_smr: the coal asset being converted

  // v4.3 (F1) anchor facility fields (anchor classes + generators with anchor_id attached)
  anchor_id?: string | null;                    // MSHA mine ID or EIA-860 plant code
  co2e_tpy?: number | null;                     // CO2-equivalent emissions (tons/yr)
  display_sector?: string | null;               // 'mining/extraction', 'utilities/power', etc.
  confidence?: string | null;                   // 'high' | 'low' | 'medium' | 'curated'
}

// ── Engine State ────────────────────────────────────────────────────────────

export interface EngineState {
  // v2 primary stores
  county_ees: Record<string, CountyEES>;
  bus_state: Record<string, BusState>;
  active_couplings: ActiveCoupling[];
  build_queue: BuildQueueItem[];
  year: number;
  sc_pools: ScPools;
  // Retained from v1
  buses: Record<string, Bus>;
  branches: Record<string, Branch>;
  ba_flows: Record<string, number>;
  ecoregion_ees: Record<string, EcoregionEES>;
  // v2.1 fiscal layer
  county_fiscal: Record<string, CountyFiscal>;
  fiscal_coefficients: FiscalCoefficients;
  // Tracking
  material_ledger: Record<string, MaterialLedgerEntry>;
  action_history: ActionHistoryRecord[];
  disturbance_history: DisturbanceHistoryRecord[];
  timestamp: number;
  study_area_buses: string[];
  action_library: ActionLibrary;
  crosswalk: CrosswalkRow[];
  county_cards: Record<string, unknown>;
  // v2.2 existing assets layer (v2.3 adds ProductionAsset variant)
  existing_assets: Record<string, AnyExistingAsset[]>;
  last_delta: DeltaSummary | null;
  // v3.0 unified asset registry — source of truth; build_queue & existing_assets are materialized views
  asset_registry: AssetInstance[];
  // v3.1 lifecycle coefficients (decommissioning, reclamation, autonomous decline, Z1 hooks)
  lifecycle_coefficients: Record<string, unknown> | null;
  // v3.3 housing baseline (read-only reference; indexed by geoid)
  housing_baseline: Record<string, unknown>;
  // v4.0 indicator history — appended by advanceYear; additive read, never in main digest
  history: IndicatorSnapshot[];
  // v4.2 demographic denominators — one population state shared by housing and indicators
  population_projections: Record<string, PopulationProjection>;
  population_config: PopulationConfig;
}

// ── Indicator Snapshot (per-year history entry) ─────────────────────────────

export interface IndicatorSnapshot {
  year: number;
  study: { E: number | null; Ec: number | null; S: number | null };
  counties: Record<string, {
    E: number;
    Ec: number;
    S: number;
    property_tax: number;
    cumulative_net: number;
    labor_utilization: number;
    service_funding_per_capita: number;
    population: number;              // live population after this year's advance_year step (v4.2)
    working_age_population: number;  // ages 18-64 after this year's step (v4.2)
  }>;
  pools: Record<string, number | null>;
}

// ── Delta Summary (returned by applyAction) ─────────────────────────────────

export interface FiscalDelta {
  geoid: string;
  ledger_a_delta: number;
  ledger_b_delta: number;
  ledger_c_delta: number;
  property_tax_delta: number;
  sales_use_delta: number;
}

export interface DeltaSummary {
  action_id: string;
  location: string;
  geoid: string | null;
  magnitude: number;
  ees_delta: Record<string, Record<string, number>>;
  network_delta: Record<string, Record<string, number>>;
  material_consumed: Record<string, { quantity: number; unit: string }>;
  bus_id: string | null;
  fiscal_delta?: FiscalDelta | null;
}

export interface DisturbanceDeltaSummary {
  disturbance_type: string;
  severity: number;
  geoids: string[];
  ees_delta: Record<string, Record<string, number>>;
  flexible_load_shed_mw: number;
  firm_load_affected_mw: number;
  deficit_mw_change: number;
  reliability_score_change: number;
}

// ── Material Ledger ─────────────────────────────────────────────────────────

export interface MaterialLedgerByAction {
  action_id: string;
  location: string;
  quantity: number;
  timestamp: number;
}

export interface MaterialLedgerEntry {
  total: number;
  unit: string;
  by_action: MaterialLedgerByAction[];
}

export interface MaterialLedgerSummary {
  summary: Record<string, { total: number; unit: string }>;
  by_action_type: Record<string, { capex_usd: number; count: number; materials: Record<string, number> }>;
  by_location: Record<string, { capex_usd: number; count: number; materials: Record<string, number> }>;
  total_capex_usd: number;
}

// ── EES Summary ─────────────────────────────────────────────────────────────

export interface EESSummaryLevel {
  E: number;
  Ec: number;
  S: number;
}

export interface EcoregionSummaryLevel extends EESSummaryLevel {
  E_baseline: number;
  Ec_baseline: number;
  S_baseline: number;
  E_delta: number;
  Ec_delta: number;
  S_delta: number;
}

export interface BASummaryLevel extends EESSummaryLevel {
  n_counties: number;
}

export interface StudyAreaSummary extends EESSummaryLevel {
  E_baseline: number;
  Ec_baseline: number;
  S_baseline: number;
}

export interface NearestScenario {
  scenario_id: string;
  scenario_name: string;
  distance: number;
  targets: Record<string, number>;
  group: string;
  conditions: Record<string, unknown>[];
  ecoregion_gaps?: Record<string, unknown>;
}

export interface EESSummary {
  county: Record<string, EESSummaryLevel>;
  by_ecoregion: Record<string, EcoregionSummaryLevel>;
  by_ba: Record<string, BASummaryLevel>;
  study_area: StudyAreaSummary;
  nearest_scenario: NearestScenario | null;
  unmet_conditions: Record<string, unknown>[];
}

// ── County Card ─────────────────────────────────────────────────────────────

export interface CountyCard {
  E: number;
  Ec: number;
  S: number;
  county_load_mw: number;
  county_added_firm_mw: number;
  county_deficit_mw: number;
  bus_state: Partial<BusState> & { bus_id?: string };
  queued_builds: Partial<BuildQueueItem>[];
  active_couplings: ActiveCoupling[];
  [key: string]: unknown;
}

// ── Pathway Conditions ──────────────────────────────────────────────────────

export interface TargetGap {
  target: number;
  current: number;
  gap: number;
  met: boolean;
}

export interface PathwayConditions {
  nearest_scenario: {
    scenario_id: string;
    scenario_name: string;
    distance: number;
    targets: Record<string, number>;
    group: string;
  } | null;
  current_ees: EESSummaryLevel;
  targets: Record<string, TargetGap>;
  conditions: Record<string, unknown>[];
  ecoregion_gaps: Record<string, unknown>;
}

// ── Scenario Profile (from mw_scenario_profiles.json) ───────────────────────

export interface ScenarioProfile {
  scenario_name?: string;
  group?: string;
  targets?: Record<string, number>;
  conditions?: Record<string, unknown>[];
  ecoregion_gaps?: Record<string, unknown>;
  profile_id?: string;
  name?: string;
  description?: string;
  target_year?: number;
  quest_conditions?: QuestCondition[];
}

// ── Era Budgets ────────────────────────────────────────────────────────────

export interface EraBudget {
  era_start: number;
  era_end: number;
  capital_cost_usd: number;
  labor_years: number;
  steel_tons: number;
  concrete_tons: number;
  HALEU_kg: number;
  transmission_row_miles: number;
}

export interface BudgetConsumption {
  action_id: string;
  capital_cost_usd: number;
  labor_years: number;
  steel_tons: number;
  concrete_tons: number;
  HALEU_kg: number;
  transmission_row_miles: number;
}

// ── Game Events ────────────────────────────────────────────────────────────

export type GameEventCategory =
  | 'heat_wave'
  | 'drought'
  | 'policy_shock'
  | 'supply_chain_disruption'
  | 'labor_shortage'
  | 'transmission_outage'
  | 'build_complete'
  | 'coupling_activated'
  | 'asset_operational';

export interface GameEvent {
  event_id: string;
  type: 'stochastic' | 'deterministic';
  category: GameEventCategory;
  severity?: number;
  affected_geoids?: string[];
  title: string;
  description: string;
  year: number;
  engine_effect?: {
    fn: 'injectDisturbance' | 'applyAction' | null;
    args: Record<string, unknown>;
  } | null;
}

// ── Auto-Pause ─────────────────────────────────────────────────────────────

export type AutoPauseReason =
  | 'build_complete'
  | 'coupling_activated'
  | 'deficit_threshold'
  | 'event_fired'
  | 'era_transition'
  | 'quest_condition_met';

export interface AutoPause {
  reason: AutoPauseReason;
  event?: GameEvent;
  detail: string;
}

// ── Quest Conditions ───────────────────────────────────────────────────────

export interface QuestCondition {
  condition_id: string;
  label: string;
  met: boolean;
  current_value: number;
  target_value: number;
  distance: number;
  unit: string;
}

// ── EES Band (honesty surface) ─────────────────────────────────────────────

export interface EesBand {
  E: { value: number; low: number; high: number };
  Ec: { value: number; low: number; high: number };
  S: { value: number; low: number; high: number };
}

// ── Action Log Entry (shared between store and budget engine) ──────────────

export interface ActionLogEntry {
  type: 'apply' | 'queue';
  actionId: string;
  geoid: string;
  magnitude: number;
  year: number;
  decisionYear?: number;
  overrideOp?: number;
  timestamp: number;
  /** F3: Sub-county pin coordinates [lon, lat]. UI-only — excluded from replay digest
   *  and invisible to all engine functions. Resolution remains county → primary_bus. */
  site_coords?: [number, number];
}

// ── Climate Lens (C0) ──────────────────────────────────────────────────────

/** Climate forcing scenario lens. "historical" = no climate modulation (baseline). */
export type ClimateLens = 'historical' | 'ssp245' | 'ssp370';

/**
 * Read-only, stateless climate context passed alongside engine state.
 * Under "historical" lens this is EMPTY_CLIMATE_CONTEXT (no tables, no modulation).
 *
 * Design note (C0→C3 interaction): C3 demand modulation will layer CDD/HDD on
 * top of V2's dynamic population (demand baseline × climate factor × migrating
 * population). The context is read-only and stateless so that interaction lives
 * entirely in C3's coupling functions — the engine never writes to this object.
 *
 * Table schema (populated in C1/C2): tables[variable][geoid][epoch] = value
 * where variable ∈ {"cdd_delta_pct", "hdd_delta_pct", "precip_delta_pct", ...},
 * geoid is 5-digit FIPS, epoch is e.g. "2040" or "2050" (decadal midpoint).
 */
export interface ClimateContext {
  readonly lens: ClimateLens;
  /** County × epoch × variable lookup tables. Empty under "historical". */
  readonly tables: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
}

/** Sentinel: no climate modulation. All coupling hooks are no-ops with this context. */
export const EMPTY_CLIMATE_CONTEXT: ClimateContext = Object.freeze({
  lens: 'historical' as const,
  tables: Object.freeze({}),
});

// ── Scenario File (export / import / localStorage format) ──────────────────

export interface ScenarioFile {
  schema_version: '3.0' | '3.1';
  terra_version: '1.0';
  exported_at: string;
  name: string;
  gameSeed: number;
  start_year: number;
  activeScenario: ScenarioProfile | null;
  actionLog: ActionLogEntry[];
  eventHistory: GameEvent[];   // display only — events re-drawn from seed on replay
  year_reached: number;
  replay_digest: string;       // md5 of canonical final state
  /** Climate lens (C0). Absent in legacy files → defaults to "historical". */
  climate_lens?: ClimateLens;
  // Session mode (optional — only present in workshop sessions)
  session_meta?: SessionMeta;
  annotations?: Annotation[];
}

// ── Save Slot Metadata ─────────────────────────────────────────────────────

export interface SaveSlotMeta {
  slot_id: string;
  name: string;
  year_reached: number;
  exported_at: string;
  scenario_name: string | null;
  schema_version: string;
}

// ── Trajectory (comparison mode) ───────────────────────────────────────────

export interface Trajectory {
  years: number[];
  E: number[];
  Ec: number[];
  S: number[];
  material_ledger_by_year: MaterialLedgerSummary[];
  quest_conditions_by_year: QuestCondition[][];
  events_by_year: GameEvent[][];
}

// ── Session Mode (workshop) ───────────────────────────────────────────────────

/** Metadata stamped into the ScenarioFile when playing in a facilitated session. */
export interface SessionMeta {
  session_code: string;
  participant_label: string;
  started_at: string;     // ISO timestamp
  app_version: string;
}

/** Which auto-pause moment triggers an annotation prompt. */
export type AnnotationTrigger =
  | 'build_decision'     // build_complete or coupling_activated auto-pause
  | 'disturbance_event'  // event_fired auto-pause
  | 'era_transition'     // era_transition auto-pause
  | 'manual';            // participant-initiated from reflection card

export interface SessionAnnotationPrompt {
  trigger: AnnotationTrigger;
  prompt: string;        // e.g. "Why this move?" or "How are you responding?"
}

export interface SessionLockedSettings {
  disable_stress_test?: boolean;   // hide stress-test panel
  disable_comparison?: boolean;    // hide comparison mode
  max_year?: number;               // also in root; repeated here for panel-level checks
}

/** Facilitator-authored config loaded from the session start screen. */
export interface SessionConfig {
  schema_version: '1.0';
  session_code: string;
  title: string;
  description?: string;
  campaign_id?: string;           // if set, auto-starts this campaign on session enter
  scenario_profile_id?: string;   // ignored if campaign_id present
  fixed_seed?: number;            // ensures identical event draws across participants
  max_year?: number;              // session ends (reflection card shown) at this year
  annotation_prompts?: SessionAnnotationPrompt[];
  locked_settings?: SessionLockedSettings;
}

/** A participant's free-text annotation attached to an auto-pause moment. */
export interface Annotation {
  id: string;
  year: number;
  trigger_type: AnnotationTrigger;
  trigger_id: string;    // event_id, action name, or era label
  prompt: string;
  text: string;
  timestamp: number;
}

// ── Campaign types (Phase 5) ───────────────────────────────────────────────

export interface NarrationStep {
  year: number;
  geoid: string;
  text: string;
  highlight_metric: string;
}

export interface HintSpec {
  action_id: string;
  target_geoid: string;
  text: string;
}

export interface SliderSpec {
  metric: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

export interface CampaignConfigurator {
  show_scenario_matrix: boolean;
  preselected_profile: string;
  sliders: SliderSpec[];
  confirm_button: string;
  on_confirm: string;
}

export interface CampaignAct {
  id: string;
  title: string;
  narration_mode: 'auto' | 'interactive' | 'guided';
  description: string;
  auto_advance_to_year?: number;
  narration_steps?: NarrationStep[];
  configurator?: CampaignConfigurator;
  hints?: HintSpec[];
}

export interface PrePlacedAsset {
  action_id: string;
  geoid: string;
  magnitude: number;
  decision_year: number;
  operational_year_override?: number;
}

export interface CampaignWinCondition {
  id: string;
  description: string;
}

export interface Campaign {
  campaign_id: string;
  title: string;
  subtitle: string;
  scenario_profile_id: string;
  unlocks_free_play: boolean;
  is_pitch_demo?: boolean;
  estimated_time?: string;
  difficulty?: string;
  briefing?: { text: string };
  pre_placed_assets?: PrePlacedAsset[];
  acts?: Record<string, CampaignAct>;
  win_conditions?: CampaignWinCondition[];
  loss_condition?: { description: string; year?: number };
  non_triviality_note?: string;
}

export interface CampaignFlyTarget {
  lng: number;
  lat: number;
  zoom: number;
}
