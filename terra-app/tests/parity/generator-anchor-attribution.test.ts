import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadInitialStateWithAnchorsAndTags } from './helpers.js';
import { advanceYear } from '../../src/engine/engine.js';


const DATA_DIR = resolve(__dirname, '../../src/data');

describe('generator anchor identity materialization', () => {
  it('materializes every matched generator anchor and excludes unmatched records', () => {
    const anchors = JSON.parse(
      readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'),
    ).features.filter((feature: { properties: { asset_class?: string } }) => (
      feature.properties.asset_class === 'generator'
    ));
    const matchedIds = anchors
      .filter((feature: { properties: { match_confidence?: string } }) => (
        feature.properties.match_confidence === 'exact_id'
        || feature.properties.match_confidence === 'fuzzy'
      ))
      .map((feature: { properties: { anchor_id: string } }) => feature.properties.anchor_id);
    const unmatchedIds = anchors
      .filter((feature: { properties: { match_confidence?: string } }) => (
        feature.properties.match_confidence === 'unmatched'
      ))
      .map((feature: { properties: { anchor_id: string } }) => feature.properties.anchor_id);

    const state = loadInitialStateWithAnchorsAndTags();
    const runtimeIds = new Set(
      state.asset_registry
        .filter(asset => asset.asset_class === 'generator' && asset.anchor_id)
        .map(asset => asset.anchor_id),
    );

    expect(matchedIds).toHaveLength(99);
    expect(matchedIds.every((id: string) => runtimeIds.has(id))).toBe(true);
    expect(unmatchedIds).toHaveLength(5);
    expect(unmatchedIds.every((id: string) => !runtimeIds.has(id))).toBe(true);
  });

  it('keeps corrected Jim Bridger identity and retirement schedule consistent', () => {
    const anchors = JSON.parse(
      readFileSync(resolve(DATA_DIR, 'mw_anchor_facilities.geojson'), 'utf-8'),
    ).features;
    const jimAnchor = anchors.find((feature: { properties: { anchor_id?: string } }) => (
      feature.properties.anchor_id === 'flagship_jim_bridger_power_plant'
    ));
    const retirements = JSON.parse(
      readFileSync(resolve(DATA_DIR, 'baseline_retirements.json'), 'utf-8'),
    );
    const state = loadInitialStateWithAnchorsAndTags();
    const runtimeJim = state.asset_registry.find(asset => (
      asset.anchor_id === 'flagship_jim_bridger_power_plant'
    ));

    expect(jimAnchor.properties.matched_source_record_id).toBe('eia_plant_8066');
    expect(jimAnchor.properties.match_confidence).toBe('fuzzy');
    expect(retirements['56037']['Jim Bridger Power Plant'].plant_id).toBe('8066');
    expect(runtimeJim?.scheduled_retirement_year).toBe(2031);
  });

  it('materializes multi-county Ec-only contributions on matched generators', () => {
    const state = loadInitialStateWithAnchorsAndTags();
    const dave = state.asset_registry.find(asset => (
      asset.anchor_id === 'flagship_dave_johnston_power_plant'
    ));
    const jim = state.asset_registry.find(asset => (
      asset.anchor_id === 'flagship_jim_bridger_power_plant'
    ));

    expect(dave?.county_ees_contribution).toEqual([
      { geoid: '56009', capital: 'Ec', delta: 0.2348094096269846 },
      { geoid: '56025', capital: 'Ec', delta: 0.17577480482943733 },
    ]);
    expect(jim?.county_ees_contribution).toEqual([
      { geoid: '56037', capital: 'Ec', delta: 0.45319576946603357 },
    ]);
    for (const asset of state.asset_registry.filter(asset => (
      asset.asset_class === 'generator' && asset.match_confidence !== undefined
    ))) {
      expect(asset.county_ees_contribution?.every(item => item.capital === 'Ec')).toBe(true);
    }
  });

  it('subtracts only the retiring generator contribution from live county Ec', () => {
    let state = loadInitialStateWithAnchorsAndTags();
    const initial = {
      converse: { ...state.county_ees['56009'] },
      natrona: { ...state.county_ees['56025'] },
      sweetwater: { ...state.county_ees['56037'] },
    };
    while (state.year < 2027) state = advanceYear(state);

    expect(state.county_ees['56009'].Ec).toBeCloseTo(
      initial.converse.Ec - 0.2348094096269846,
      12,
    );
    expect(state.county_ees['56025'].Ec).toBeCloseTo(
      initial.natrona.Ec - 0.17577480482943733,
      12,
    );
    expect(state.county_ees['56037'].Ec).toBe(initial.sweetwater.Ec);
    expect(state.county_ees['56009'].E).toBe(initial.converse.E);
    expect(state.county_ees['56009'].S).toBe(initial.converse.S);

    while (state.year < 2031) state = advanceYear(state);
    expect(state.county_ees['56037'].Ec).toBeCloseTo(
      initial.sweetwater.Ec - 0.45319576946603357,
      12,
    );
    expect(state.county_ees['56037'].E).toBe(initial.sweetwater.E);
    expect(state.county_ees['56037'].S).toBe(initial.sweetwater.S);
  });
});
