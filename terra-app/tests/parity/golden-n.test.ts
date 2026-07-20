/** Golden N: Fremont + Converse agriculture arcs at 1e-6 parity. */

import { describe, expect, it } from 'vitest';
import {
  advanceYear,
  agDigest,
  applyAction,
  applyHazardEventConsequences,
  getCountyAg,
  historyDigest,
} from '../../src/engine/engine.js';
import type { ClimateHazardEvent, ClimateLens, EngineState } from '../../src/engine/types.js';
import {
  computeDigestMd5,
  computeExistingAssetsDigestMd5,
  computeFiscalDigestMd5,
  loadFixture,
  loadInitialStateWithRetirements,
  relClose,
} from './helpers.js';

const CONVERSE = '56009';
const FREMONT = '56013';

function digests(state: EngineState) {
  return {
    state_digest_md5: computeDigestMd5(state).md5,
    fiscal_digest_md5: computeFiscalDigestMd5(state).md5,
    existing_assets_digest_md5: computeExistingAssetsDigestMd5(state).md5,
    history_digest_md5: historyDigest(state).md5,
    ag_digest_md5: agDigest(state).md5,
  };
}

function treatmentArc(maintenance: boolean) {
  let state = loadInitialStateWithRetirements();
  [state] = applyAction(state, 'invasive_species_removal', CONVERSE, 100000);
  if (maintenance) {
    [state] = applyAction(state, 'rangeland_restoration_maintenance', CONVERSE, 100000);
  }
  const arc: Array<{ year: number; forage_index: number; cattle_head: number }> = [];
  for (let index = 0; index < 9; index++) {
    const levels = getCountyAg(state, CONVERSE)!.levels;
    arc.push({
      year: state.year,
      forage_index: levels.forage_aum.index,
      cattle_head: levels.cattle_head,
    });
    state = advanceYear(state);
  }
  return { arc, digests: digests(state) };
}

function irrigationArc() {
  let state = loadInitialStateWithRetirements();
  const before = getCountyAg(state, FREMONT)!.levels.water_acre_feet;
  [state] = applyAction(state, 'irrigation_efficiency', FREMONT, 10000);
  const after = getCountyAg(state, FREMONT)!.levels.water_acre_feet;
  return { before, after, digests: digests(state) };
}

function solarArc() {
  let state = loadInitialStateWithRetirements();
  const land = getCountyAg(state, FREMONT)!.levels.land_acres;
  const protectedAcres = land.other + land.private_rangeland + land.dry_crop;
  [state] = applyAction(state, 'ag_conservation_easement', FREMONT, protectedAcres);
  const before = getCountyAg(state, FREMONT)!.levels;
  const propertyTaxBefore = state.county_fiscal[FREMONT].property_tax;
  const solarResult = applyAction(state, 'solar_utility', FREMONT, 1000);
  state = solarResult[0];
  const delta = solarResult[1];
  const after = getCountyAg(state, FREMONT)!.levels;
  return {
    before,
    after,
    conversion_sources: (delta.ag_delta as Record<string, unknown>).conversion_sources,
    property_tax_before: propertyTaxBefore,
    property_tax_after: state.county_fiscal[FREMONT].property_tax,
    property_tax_delta: delta.fiscal_delta!.property_tax_delta,
    digests: digests(state),
  };
}

function windArc() {
  let state = loadInitialStateWithRetirements();
  const other = getCountyAg(state, CONVERSE)!.levels.land_acres.other;
  [state] = applyAction(state, 'ag_conservation_easement', CONVERSE, other);
  const before = getCountyAg(state, CONVERSE)!.levels;
  const windResult = applyAction(state, 'wind_utility', CONVERSE, 1000);
  state = windResult[0];
  const delta = windResult[1];
  const after = getCountyAg(state, CONVERSE)!.levels;
  return {
    private_aum_before: before.forage_aum.private,
    private_aum_after: after.forage_aum.private,
    shared_energy_acres: after.shared_energy_acres,
    conversion_sources: (delta.ag_delta as Record<string, unknown>).conversion_sources,
    digests: digests(state),
  };
}

function droughtArc(lens: ClimateLens) {
  let state = loadInitialStateWithRetirements();
  const severityMilli = lens === 'historical' ? 1000 : 1250;
  const event: ClimateHazardEvent = {
    event_id: `golden-n:${lens}:17:2026:${CONVERSE}:drought_stress`,
    year: 2026,
    geoid: CONVERSE,
    hazard_kind: 'drought_stress',
    severity_milli: severityMilli,
    annual_probability_ppm: 1_000_000,
    baseline_frequency_micros: 1_000_000,
    projection_factor_ppm: severityMilli * 1000,
    lens,
    seed: 17,
    consequence_multiplier_ppm: 0,
    ag_drought_tier: 'D1',
    duration_years: 2,
  };
  const droughtResult = applyHazardEventConsequences(state, [event]);
  state = droughtResult[0];
  const outcomes = droughtResult[1];
  const arc: Array<{
    year: number;
    forage_index: number;
    cattle_head: number;
    years_remaining: number;
  }> = [];
  for (let index = 0; index < 4; index++) {
    const levels = getCountyAg(state, CONVERSE)!.levels;
    arc.push({
      year: state.year,
      forage_index: levels.forage_aum.index,
      cattle_head: levels.cattle_head,
      years_remaining: levels.drought.years_remaining,
    });
    state = advanceYear(state);
  }
  return { handler: outcomes[0].handler, arc, digests: digests(state) };
}

function runGoldenN(lens: ClimateLens) {
  return {
    treatment_without_maintenance: treatmentArc(false),
    treatment_with_maintenance: treatmentArc(true),
    irrigation_efficiency: irrigationArc(),
    utility_solar: solarArc(),
    wind_shared_land: windArc(),
    two_year_drought: droughtArc(lens),
  };
}

const fixture = loadFixture('golden_n') as {
  results: Record<'historical' | 'ssp370', ReturnType<typeof runGoldenN>>;
};

describe('Golden N — Wyoming county agriculture', () => {
  it('all scenario arcs and five digests match the frozen Python fixture', () => {
    for (const lens of ['historical', 'ssp370'] as const) {
      expect(runGoldenN(lens)).toEqual(fixture.results[lens]);
    }
  });

  it('numeric cross-runtime parity is within 1e-6', () => {
    const actual = runGoldenN('ssp370');
    const expected = fixture.results.ssp370;
    for (const scenario of [
      'treatment_without_maintenance', 'treatment_with_maintenance',
    ] as const) {
      actual[scenario].arc.forEach((point, index) => {
        expect(relClose(point.forage_index, expected[scenario].arc[index].forage_index, 1e-6)).toBe(true);
        expect(relClose(point.cattle_head, expected[scenario].arc[index].cattle_head, 1e-6)).toBe(true);
      });
    }
    actual.two_year_drought.arc.forEach((point, index) => {
      expect(relClose(point.forage_index, expected.two_year_drought.arc[index].forage_index, 1e-6)).toBe(true);
      expect(relClose(point.cattle_head, expected.two_year_drought.arc[index].cattle_head, 1e-6)).toBe(true);
    });
  });

  it('same lens rerun is deterministic and SSP3-7.0 drought is more severe', () => {
    expect(runGoldenN('ssp370')).toEqual(runGoldenN('ssp370'));
    const historical = runGoldenN('historical').two_year_drought.arc;
    const ssp370 = runGoldenN('ssp370').two_year_drought.arc;
    expect(ssp370[1].forage_index).toBeLessThan(historical[1].forage_index);
    expect(ssp370[1].cattle_head).toBeLessThan(historical[1].cattle_head);
  });

  it('reads irrigation, reinvasion, and D1 coefficients from the action library', () => {
    let state = loadInitialStateWithRetirements();
    const water = state.action_library.actions.irrigation_efficiency.water_coefficients!;
    water.diversion_reduction_fraction = 0.20;
    water.consumptive_use_reduction_fraction = 0.05;
    const waterBefore = getCountyAg(state, FREMONT)!.levels.water_acre_feet;
    [state] = applyAction(state, 'irrigation_efficiency', FREMONT, 10000);
    const waterAfter = getCountyAg(state, FREMONT)!.levels.water_acre_feet;
    expect(waterBefore.ag_diversion - waterAfter.ag_diversion).toBeCloseTo(4000, 6);
    expect(waterBefore.ag_consumptive - waterAfter.ag_consumptive).toBeCloseTo(600, 6);

    state = loadInitialStateWithRetirements();
    state.action_library.actions.invasive_species_removal
      .reinvasion_decay!.fraction_retreated_per_year = 0.50;
    [state] = applyAction(state, 'invasive_species_removal', CONVERSE, 100000);
    const peakDelta = getCountyAg(state, CONVERSE)!.levels.forage_aum.index - 1;
    state = advanceYear(state);
    const decayedDelta = getCountyAg(state, CONVERSE)!.levels.forage_aum.index - 1;
    expect(decayedDelta).toBeCloseTo(peakDelta * 0.5, 6);

    state = loadInitialStateWithRetirements();
    const drought = state.action_library.disturbances!.drought_d1_ag as {
      lens_delta_parameters: {
        D1: { forage_production_delta: number; irrigation_demand_delta: number };
      };
    };
    drought.lens_delta_parameters.D1.forage_production_delta = -0.10;
    drought.lens_delta_parameters.D1.irrigation_demand_delta = 0.25;
    const event: ClimateHazardEvent = {
      event_id: 'ag-drought-data-driven', year: 2026, geoid: CONVERSE,
      hazard_kind: 'drought_stress', severity_milli: 1000,
      annual_probability_ppm: 1_000_000, baseline_frequency_micros: 1_000_000,
      projection_factor_ppm: 1_000_000, lens: 'historical', seed: 7,
      consequence_multiplier_ppm: 0, ag_drought_tier: 'D1', duration_years: 1,
    };
    [state] = applyHazardEventConsequences(state, [event]);
    state = advanceYear(state);
    const droughtLevels = getCountyAg(state, CONVERSE)!.levels;
    expect(droughtLevels.forage_aum.index).toBeCloseTo(0.9, 6);
    expect(droughtLevels.drought.water_curtailment_fraction).toBeCloseTo(0.25, 6);
  });
});
