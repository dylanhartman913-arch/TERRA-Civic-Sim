/**
 * Golden L parity tests — Engine v4.4 (C3)
 * Climate coupling: demand + water-stress + heat derates.
 *
 * Scenario: queue data_center_hyperscale in Laramie (56021) and
 * smr_advanced in Lincoln (56023), advance to 2050.
 * Run twice: once under EMPTY_CLIMATE_CONTEXT (historical),
 * once under ssp370 with embedded climate_table_slice.
 *
 * Validates:
 *  L-1   Historical lens → state digest matches frozen value
 *  L-2   SSP370 lens → state digest matches frozen value
 *  L-3   State digest differs between lenses
 *  L-4   Fiscal digest identical under both lenses
 *  L-5   Existing assets digest identical under both lenses
 *  L-6   Probe-year state digests match (historical)
 *  L-7   Probe-year state digests match (ssp370)
 *  L-8   Hand-check demand modifier
 *  L-9   Hand-check water stress derate
 *  L-10  Hand-check heat derate
 *  L-11  Deterministic — two runs produce identical state_digest
 *  L-12  TS-Python digest parity (state, both lenses)
 */
import { describe, it, expect } from 'vitest';
import {
  loadFixture,
  loadInitialStateWithRetirements,
  computeDigestMd5,
  computeFiscalDigestMd5,
  computeExistingAssetsDigestMd5,
} from './helpers.js';
import {
  advanceYear,
  queueAction,
} from '../../src/engine/engine.js';
import { EMPTY_CLIMATE_CONTEXT } from '../../src/engine/types.js';
import type { ClimateContext, EngineState } from '../../src/engine/types.js';
import {
  computeDemandModifier,
  computeWaterStressDerate,
  computeHeatDerate,
} from '../../src/engine/climate_couplings.js';

interface GoldenLFixture {
  fixture_id: string;
  engine_version: string;
  climate_table_slice: {
    ssp370: Record<string, Record<string, Record<string, number>>>;
  };
  action_log: { action: string; action_id: string; geoid: string; magnitude: number; decision_year: number }[];
  probe_years: number[];
  hand_check_arithmetic: Record<string, Record<string, { demand_modifier: number; water_derate: number; heat_derate: number }>>;
  digests_historical: {
    state_md5: string;
    fiscal_md5: string;
    existing_assets_md5: string;
    history_md5: string;
    probe_year_state_md5s: Record<string, string>;
  };
  digests_ssp370: {
    state_md5: string;
    fiscal_md5: string;
    existing_assets_md5: string;
    history_md5: string;
    probe_year_state_md5s: Record<string, string>;
  };
}

const fixture = loadFixture('golden_l') as unknown as GoldenLFixture;

function replay(climateContext: ClimateContext): { state: EngineState; probeDigests: Record<string, string> } {
  let state = loadInitialStateWithRetirements();
  for (const entry of fixture.action_log) {
    state = queueAction(state, entry.action_id, entry.geoid, entry.magnitude, entry.decision_year, undefined, climateContext);
  }
  const probeDigests: Record<string, string> = {};
  const targetYear = 2050;
  while (state.year < targetYear) {
    state = advanceYear(state, climateContext);
    if (fixture.probe_years.includes(state.year)) {
      const lens = climateContext.lens !== 'historical' ? climateContext.lens : undefined;
      probeDigests[String(state.year)] = computeDigestMd5(state, lens).md5;
    }
  }
  return { state, probeDigests };
}

describe('Golden L — C3 Climate Coupling', () => {
  it('L-1: historical lens → state digest matches frozen value', () => {
    const { state } = replay(EMPTY_CLIMATE_CONTEXT);
    const { md5 } = computeDigestMd5(state);
    expect(md5).toBe(fixture.digests_historical.state_md5);
  });

  it('L-2: ssp370 lens → state digest matches frozen value', () => {
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    const { state } = replay(ctx);
    const { md5 } = computeDigestMd5(state, 'ssp370');
    expect(md5).toBe(fixture.digests_ssp370.state_md5);
  });

  it('L-3: state digest differs between lenses', () => {
    expect(fixture.digests_historical.state_md5).not.toBe(fixture.digests_ssp370.state_md5);
  });

  it('L-4: fiscal digest identical under both lenses', () => {
    const { state: stateH } = replay(EMPTY_CLIMATE_CONTEXT);
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    const { state: stateS } = replay(ctx);
    const fiscH = computeFiscalDigestMd5(stateH).md5;
    const fiscS = computeFiscalDigestMd5(stateS).md5;
    expect(fiscH).toBe(fiscS);
    expect(fiscH).toBe(fixture.digests_historical.fiscal_md5);
  });

  it('L-5: existing assets digest identical under both lenses', () => {
    const { state: stateH } = replay(EMPTY_CLIMATE_CONTEXT);
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    const { state: stateS } = replay(ctx);
    const eaH = computeExistingAssetsDigestMd5(stateH).md5;
    const eaS = computeExistingAssetsDigestMd5(stateS).md5;
    expect(eaH).toBe(eaS);
    expect(eaH).toBe(fixture.digests_historical.existing_assets_md5);
  });

  it('L-6: probe-year state digests match (historical)', () => {
    const { probeDigests } = replay(EMPTY_CLIMATE_CONTEXT);
    for (const [yr, expected] of Object.entries(fixture.digests_historical.probe_year_state_md5s)) {
      expect(probeDigests[yr]).toBe(expected);
    }
  });

  it('L-7: probe-year state digests match (ssp370)', () => {
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    const { probeDigests } = replay(ctx);
    for (const [yr, expected] of Object.entries(fixture.digests_ssp370.probe_year_state_md5s)) {
      expect(probeDigests[yr]).toBe(expected);
    }
  });

  it('L-8: hand-check demand modifier', () => {
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    for (const [yrStr, counties] of Object.entries(fixture.hand_check_arithmetic)) {
      const year = Number(yrStr);
      for (const [gid, expected] of Object.entries(counties)) {
        const dm = computeDemandModifier(gid, year, ctx);
        expect(Math.abs(dm.modifier - expected.demand_modifier)).toBeLessThan(1e-5);
      }
    }
  });

  it('L-9: hand-check water stress derate', () => {
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    for (const [yrStr, counties] of Object.entries(fixture.hand_check_arithmetic)) {
      const year = Number(yrStr);
      for (const [gid, expected] of Object.entries(counties)) {
        const ws = computeWaterStressDerate(gid, year, ctx);
        expect(Math.abs(ws.derate_factor - expected.water_derate)).toBeLessThan(1e-5);
      }
    }
  });

  it('L-10: hand-check heat derate', () => {
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    for (const [yrStr, counties] of Object.entries(fixture.hand_check_arithmetic)) {
      const year = Number(yrStr);
      for (const [gid, expected] of Object.entries(counties)) {
        const ht = computeHeatDerate(gid, year, ctx);
        expect(Math.abs(ht.derate_factor - expected.heat_derate)).toBeLessThan(1e-5);
      }
    }
  });

  it('L-11: deterministic — two runs produce identical state_digest', () => {
    const ctx1: ClimateContext = { lens: 'ssp370', tables: { ...fixture.climate_table_slice.ssp370 } };
    const ctx2: ClimateContext = { lens: 'ssp370', tables: { ...fixture.climate_table_slice.ssp370 } };
    const { state: s1 } = replay(ctx1);
    const { state: s2 } = replay(ctx2);
    expect(computeDigestMd5(s1, 'ssp370').md5).toBe(computeDigestMd5(s2, 'ssp370').md5);
  });

  it('L-12: TS-Python digest parity (state, both lenses)', () => {
    // Historical
    const { state: stateH } = replay(EMPTY_CLIMATE_CONTEXT);
    expect(computeDigestMd5(stateH).md5).toBe(fixture.digests_historical.state_md5);

    // SSP370
    const ctx: ClimateContext = { lens: 'ssp370', tables: fixture.climate_table_slice.ssp370 };
    const { state: stateS } = replay(ctx);
    expect(computeDigestMd5(stateS, 'ssp370').md5).toBe(fixture.digests_ssp370.state_md5);
  });
});
