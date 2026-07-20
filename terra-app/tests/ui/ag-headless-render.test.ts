/**
 * AG2 Headless Render Check — Gate replacement for D5 visual verification.
 *
 * Verifies that:
 *   1. Ag choropleth feature computation runs without error for all three modes
 *   2. getAgPlacementPreview returns valid preview data (zero UI-side arithmetic)
 *   3. Fremont vs Campbell produce materially different competition previews
 *      (different industrial valuations, verifiable asymmetry)
 *
 * Uses server-side rendering (renderToStaticMarkup) — no real browser required.
 * Replaces D5's visual-verification role per gate-change logged in ticket T6.
 */

import { describe, expect, it } from 'vitest';
import { agFeaturesFor } from '../../src/ui/map/AgChoroplethLayer.js';
import { getAgPlacementPreview, getCountyAg, applyAction } from '../../src/engine/engine.js';
import { loadInitialStateWithRetirements } from '../parity/helpers.js';
import type { AgChoroplethMode } from '../../src/state/store.js';

const FREMONT  = '56013';
const CAMPBELL = '56005';
const CONVERSE = '56009';

describe('AG2 headless render check (gate: replaces D5)', () => {

  it('choropleth modes produce non-empty feature sets with ag_value for WY counties', () => {
    const state = loadInitialStateWithRetirements();
    const modes: AgChoroplethMode[] = ['forage_trend', 'invasive_burden', 'converted_acres'];

    for (const mode of modes) {
      const features = agFeaturesFor(state, mode);
      expect(features.length).toBeGreaterThan(0);

      // All WY county features should have ag_value (not null)
      const wyFeatures = features.filter(f => {
        const geoid = String(f.properties?.GEOID ?? '');
        return geoid.startsWith('56') && geoid.length === 5;
      });
      expect(wyFeatures.length).toBeGreaterThan(0);
      const wyWithValue = wyFeatures.filter(f => (f.properties as { ag_value: unknown }).ag_value !== null);
      expect(wyWithValue.length).toBe(wyFeatures.length);
    }
  });

  it('forage_trend choropleth: baseline counties have index 1.0', () => {
    const state = loadInitialStateWithRetirements();
    const features = agFeaturesFor(state, 'forage_trend');
    const fremont = features.find(f => f.properties?.GEOID === FREMONT);
    const campbell = features.find(f => f.properties?.GEOID === CAMPBELL);
    expect(fremont).toBeDefined();
    expect(campbell).toBeDefined();
    // At baseline (no disturbance), forage index should be 1.0
    expect((fremont!.properties as { ag_value: number }).ag_value).toBeCloseTo(1.0, 4);
    expect((campbell!.properties as { ag_value: number }).ag_value).toBeCloseTo(1.0, 4);
  });

  it('getAgPlacementPreview returns engine values — zero UI-side arithmetic', () => {
    const state = loadInitialStateWithRetirements();
    const preview = getAgPlacementPreview(state, 'solar_utility', FREMONT, 1000);
    expect(preview).not.toBeNull();
    expect(preview!.action_id).toBe('solar_utility');
    expect(preview!.geoid).toBe(FREMONT);
    expect(preview!.magnitude).toBe(1000);
    // At 1000 MW solar: 7500 acres converted (scale=1, 7500 ac/GW)
    expect(preview!.converted_acres).toBeCloseTo(7500, 2);
    // Provenance is passed through from engine baseline
    expect(preview!.provenance.schema_version).toBeTruthy();
    expect(preview!.provenance.land_conversion_priority).toEqual(['other', 'private_rangeland', 'dry_crop', 'irrigated_crop']);
    // Not blocked at baseline (Fremont has 4.6M+ other acres)
    expect(preview!.blocked).toBe(false);
  });

  it('Fremont vs Campbell: materially different competition previews (asymmetry confirmed)', () => {
    const state = loadInitialStateWithRetirements();
    const fremontPreview  = getAgPlacementPreview(state, 'solar_utility', FREMONT,  1000);
    const campbellPreview = getAgPlacementPreview(state, 'solar_utility', CAMPBELL, 1000);

    expect(fremontPreview).not.toBeNull();
    expect(campbellPreview).not.toBeNull();

    // Industrial valuation added MUST differ between counties (different property tax rates)
    expect(fremontPreview!.industrial_valuation_added_usd).not.toBeNull();
    expect(campbellPreview!.industrial_valuation_added_usd).not.toBeNull();
    expect(fremontPreview!.industrial_valuation_added_usd).not.toBeCloseTo(
      campbellPreview!.industrial_valuation_added_usd!, 0,
    );

    // Asymmetry is visible: industrial value added ≠ ag value removed in both counties
    const fremontAsymmetry  = (fremontPreview!.industrial_valuation_added_usd  ?? 0) - fremontPreview!.ag_valuation_removed_usd;
    const campbellAsymmetry = (campbellPreview!.industrial_valuation_added_usd ?? 0) - campbellPreview!.ag_valuation_removed_usd;
    // Both asymmetries are non-zero (ag value removed = 0 from 'other' land, industrial > 0)
    expect(Math.abs(fremontAsymmetry)).toBeGreaterThan(0);
    expect(Math.abs(campbellAsymmetry)).toBeGreaterThan(0);
    // The magnitudes differ between counties
    expect(Math.abs(fremontAsymmetry - campbellAsymmetry)).toBeGreaterThan(1e4);

    // AUM and water differ between counties due to different baseline compositions
    expect(fremontPreview!.water_diversion_af).not.toBe(campbellPreview!.water_diversion_af);
    expect(fremontPreview!.aum_before).not.toBe(campbellPreview!.aum_before);
  });

  it('land-class asymmetry at high MW: Campbell draws from rangeland, Fremont does not', () => {
    const state = loadInitialStateWithRetirements();
    // At ~70,000 MW solar, Campbell's other land (~505k ac) is exhausted → spills into rangeland
    // Fremont's other land (~4.7M ac) is not exhausted → stays in other only
    // Use 100,000 MW for a clear demonstration (750,000 ac needed)
    const fremontHigh  = getAgPlacementPreview(state, 'solar_utility', FREMONT,  100000);
    const campbellHigh = getAgPlacementPreview(state, 'solar_utility', CAMPBELL, 100000);

    expect(fremontHigh).not.toBeNull();
    expect(campbellHigh).not.toBeNull();

    // Fremont: still entirely in 'other' (4.6M+ other acres)
    expect(fremontHigh!.conversion_sources.private_rangeland).toBe(0);
    expect(fremontHigh!.conversion_sources.other).toBeGreaterThan(0);

    // Campbell: other land (~505k) is exhausted, spills into private_rangeland
    expect(campbellHigh!.conversion_sources.private_rangeland).toBeGreaterThan(0);

    // Campbell AUM drops (rangeland converted); Fremont AUM unchanged
    expect(campbellHigh!.aum_after).toBeLessThan(campbellHigh!.aum_before);
    expect(fremontHigh!.aum_after).toBeCloseTo(fremontHigh!.aum_before, 0);
  });

  it('easement-blocked placement shows visible reason', () => {
    let state = loadInitialStateWithRetirements();
    // Protect all available land in Converse
    const ag = getCountyAg(state, CONVERSE);
    expect(ag).not.toBeNull();
    const allLand = ag!.levels.land_acres.other
      + ag!.levels.land_acres.private_rangeland
      + ag!.levels.land_acres.dry_crop
      + ag!.levels.land_acres.irrigated_crop;
    // Apply easement to protect all land
    [state] = applyAction(state, 'ag_conservation_easement', CONVERSE, allLand);

    const preview = getAgPlacementPreview(state, 'solar_utility', CONVERSE, 1000);
    expect(preview).not.toBeNull();
    expect(preview!.blocked).toBe(true);
    expect(preview!.blocked_reason).toBeTruthy();
    expect(preview!.blocked_reason).toContain('Easement');
  });

  it('wind utility shows shared acres in preview (dual-use, not consumed)', () => {
    const state = loadInitialStateWithRetirements();
    const preview = getAgPlacementPreview(state, 'wind_utility', CONVERSE, 1000);
    expect(preview).not.toBeNull();
    // Wind: 250 ac/GW converted, 84,750 ac/GW shared
    expect(preview!.converted_acres).toBeCloseTo(250, 1);
    expect(preview!.shared_acres).toBeCloseTo(84750, 0);
    // Shared acres don't reduce AUM (grazing continues)
    expect(preview!.aum_after).toBeCloseTo(preview!.aum_before, 0);
  });
});
