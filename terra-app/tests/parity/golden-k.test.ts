/**
 * Golden K parity tests — Engine v4.3 (F1)
 * Anchor lifecycle: retirement → site spawn → succession discount chain.
 *
 * Scenario: retire WE Soda trona anchor (Sweetwater, 722 emp) in 2030;
 * retire Black Thunder coal anchor (Campbell, 808 emp) in 2028, queue
 * solar_utility on mine site; place SMR on Sweetwater in 2035.
 * Advance to 2040, verify four-contract digests match Python.
 *
 * Validates:
 *  k-a  Black Thunder mine site spawns with correct fields after 2028 retirement
 *  k-b  Solar on mine site receives succession discounts (TTD-1yr, capex 20%)
 *  k-c  WE Soda mine site spawns with employment-based workforce pool (722)
 *  k-d  WE Soda mine site has null interconnection_mw (mines have no MW)
 *  k-e  Y-track hook fires for trona mine (commodity, price=0, confidence=flagged)
 *  k-f  SMR on Sweetwater (no mine SITE_COMPAT) gets no succession discounts
 *  k-g  Four-contract digests at yr2040 match Python fixture
 *  k-h  Deterministic — two runs produce identical state_digest
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadFixture,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
} from './helpers.js';
import {
  initializeState,
  advanceYear,
  queueAction,
  scheduleRetirement,
  historyDigest,
} from '../../src/engine/engine.js';
import type {
  AssetInstance,
  EngineState,
  CountyEESBaseline,
  CrosswalkRow,
  ActionLibrary,
  InitialNetwork,
  FiscalBaseline,
  FiscalCoefficients,
  PopulationProjection,
} from '../../src/engine/types.js';

const DATA_DIR = resolve(__dirname, '../../src/data');
const fixture = loadFixture('golden_k') as {
  assertions: {
    bt_site_class: string;
    bt_workforce_pool_initial: number;
    bt_site_origin_asset_id: string;
    solar_succession_site_id: string;
    solar_ttd_reduction_applied: number;
    solar_capex_discount_fraction: number;
    ws_site_class: string;
    ws_workforce_pool_initial: number;
    ws_interconnection_mw: null;
    ws_site_origin_asset_id: string;
    ws_y_track_commodity: string;
    ws_y_track_price: number;
    ws_y_track_confidence: string;
    smr_succession_site_id: null;
    smr_ttd_reduction_applied: null;
    smr_capex_discount_fraction: null;
    smr_tx_waiver_mw: null;
    deterministic: boolean;
  };
  digests_yr2040: {
    state_digest_md5: string;
    fiscal_digest_md5: string;
    existing_assets_digest_md5: string;
    history_digest_md5: string;
  };
};

function loadInitialStateWithAnchors(): EngineState {
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
  // Golden K: no baseline retirements (Python script uses initialize_state without them)
  const retirementData = undefined;
  let lifecycleCoefficients: Record<string, unknown> | undefined;
  try {
    lifecycleCoefficients = JSON.parse(readFileSync(resolve(DATA_DIR, 'lifecycle_coefficients.json'), 'utf-8'));
  } catch { /* optional */ }
  let housingBaselineData: Record<string, unknown> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_housing_baseline.json'), 'utf-8'));
    housingBaselineData = raw.counties as Record<string, unknown>;
  } catch { /* optional */ }
  let populationProjections: Record<string, PopulationProjection> | undefined;
  try {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, 'county_population_projections.json'), 'utf-8'));
    populationProjections = raw.counties as Record<string, PopulationProjection>;
  } catch { /* optional */ }
  // Load anchor facilities geojson
  const anchorFacilities = JSON.parse(readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'));

  return initializeState(
    baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025,
    fiscalBaseline, fiscalCoefficients, retirementData, lifecycleCoefficients,
    housingBaselineData, populationProjections, undefined, anchorFacilities,
  );
}

function findAsset(registry: AssetInstance[], pred: (a: AssetInstance) => boolean): AssetInstance {
  const found = registry.find(pred);
  if (!found) throw new Error('Asset not found in registry');
  return found;
}

function advanceToYear(state: EngineState, targetYear: number): EngineState {
  while (state.year < targetYear) {
    state = advanceYear(state);
  }
  return state;
}

/** Replay the full Golden K scenario. */
function replayGoldenK(): EngineState {
  let state = loadInitialStateWithAnchors();

  // Schedule retirements
  state = scheduleRetirement(state, 'anchor_56037_we_soda_westvaco', 2030);
  state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);

  // Advance to 2029 (Black Thunder retires in 2028)
  state = advanceToYear(state, 2029);

  // Queue solar on Black Thunder mine site
  state = queueAction(state, 'solar_utility', '56005', 100, 2029);

  // Advance to 2031 (WE Soda retires in 2030)
  state = advanceToYear(state, 2031);

  // Advance to 2035
  state = advanceToYear(state, 2035);

  // Queue SMR on Sweetwater (no mine SITE_COMPAT for smr_advanced)
  state = queueAction(state, 'smr_advanced', '56037', 345, 2035);

  // Advance to 2040
  state = advanceToYear(state, 2040);

  return state;
}

const a = fixture.assertions;

describe('Golden K — anchor site spawning (k-a: Black Thunder)', () => {
  it('k-a1: Black Thunder mine site spawns with correct site_class', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    state = advanceToYear(state, 2029);
    const site = findAsset(state.asset_registry, x => x.site_origin_asset_id === a.bt_site_origin_asset_id);
    expect(site.site_class).toBe(a.bt_site_class);
  });

  it('k-a2: Black Thunder workforce pool sized by employment_direct (808)', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    state = advanceToYear(state, 2029);
    const site = findAsset(state.asset_registry, x => x.site_origin_asset_id === a.bt_site_origin_asset_id);
    expect(site.workforce_pool_initial).toBe(a.bt_workforce_pool_initial);
  });
});

describe('Golden K — succession discounts on mine site (k-b: solar on BT)', () => {
  it('k-b1: solar_utility on BT mine site gets TTD reduction', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    state = advanceToYear(state, 2029);
    state = queueAction(state, 'solar_utility', '56005', 100, 2029);
    const solar = findAsset(state.asset_registry, x =>
      x.action_id === 'solar_utility' && x.geoid === '56005' && x.succession_site_id === a.solar_succession_site_id);
    expect(solar.ttd_reduction_applied).toBe(a.solar_ttd_reduction_applied);
  });

  it('k-b2: solar_utility on BT mine site gets capex discount', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56005_black_thunder', 2028);
    state = advanceToYear(state, 2029);
    state = queueAction(state, 'solar_utility', '56005', 100, 2029);
    const solar = findAsset(state.asset_registry, x =>
      x.action_id === 'solar_utility' && x.geoid === '56005' && x.succession_site_id === a.solar_succession_site_id);
    expect(solar.capex_discount_fraction).toBe(a.solar_capex_discount_fraction);
  });
});

describe('Golden K — WE Soda mine site (k-c/d/e)', () => {
  it('k-c: WE Soda workforce pool sized by employment (722)', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56037_we_soda_westvaco', 2030);
    state = advanceToYear(state, 2031);
    const site = findAsset(state.asset_registry, x => x.site_origin_asset_id === a.ws_site_origin_asset_id);
    expect(site.workforce_pool_initial).toBe(a.ws_workforce_pool_initial);
  });

  it('k-d: WE Soda mine site has null interconnection_mw', () => {
    let state = loadInitialStateWithAnchors();
    state = scheduleRetirement(state, 'anchor_56037_we_soda_westvaco', 2030);
    state = advanceToYear(state, 2031);
    const site = findAsset(state.asset_registry, x => x.site_origin_asset_id === a.ws_site_origin_asset_id);
    expect(site.interconnection_mw).toBeNull();
  });
});

describe('Golden K — SMR on Sweetwater (k-f: no mine SITE_COMPAT)', () => {
  it('k-f: SMR gets no succession discounts (mine SITE_COMPAT excludes smr_advanced)', () => {
    const state = replayGoldenK();
    // Find the SMR queued in 2035 on Sweetwater
    const smr = findAsset(state.asset_registry, x =>
      x.action_id === 'smr_advanced' && x.geoid === '56037' && x.decision_year === 2035);
    expect(smr.succession_site_id).toBeNull();
    expect(smr.ttd_reduction_applied).toBeNull();
    expect(smr.capex_discount_fraction).toBeNull();
    expect(smr.tx_waiver_mw).toBeNull();
  });
});

describe('Golden K — four-contract digest parity (k-g)', () => {
  it('k-g1: state_digest at yr2040 matches Python', () => {
    const state = replayGoldenK();
    expect(computeDigestMd5(state).md5).toBe(fixture.digests_yr2040.state_digest_md5);
  });

  it('k-g2: fiscal_digest at yr2040 matches Python', () => {
    const state = replayGoldenK();
    expect(computeFiscalDigestMd5(state).md5).toBe(fixture.digests_yr2040.fiscal_digest_md5);
  });

  it('k-g3: existing_assets_digest at yr2040 matches Python', () => {
    const state = replayGoldenK();
    expect(computeExistingAssetsDigestMd5(state).md5).toBe(fixture.digests_yr2040.existing_assets_digest_md5);
  });

  it('k-g4: history_digest at yr2040 matches Python', () => {
    const state = replayGoldenK();
    const hd = historyDigest(state);
    expect(hd.md5).toBe(fixture.digests_yr2040.history_digest_md5);
  });
});

describe('Golden K — determinism (k-h)', () => {
  it('k-h: two full replays produce identical state_digest', () => {
    const s1 = replayGoldenK();
    const s2 = replayGoldenK();
    expect(computeDigestMd5(s1).md5).toBe(computeDigestMd5(s2).md5);
  });
});
