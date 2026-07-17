import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { climateSurfaceRecordFor } from '../../src/ui/climate.js';
import { AttributionPopover } from '../../src/ui/panels/ClimatePanel.js';
import { hazardFeaturesFor } from '../../src/ui/map/HazardChoroplethLayer.js';

describe('C5b full climate choropleth', () => {
  it('changes the rendered map-cell value and its attribution when the selector changes', () => {
    const ssp245 = hazardFeaturesFor('ssp245', '2030', 'annual_mean_temp_f')
      .find(feature => feature.properties?.GEOID === '08001')!.properties!;
    const ssp370 = hazardFeaturesFor('ssp370', '2065', 'annual_mean_temp_f')
      .find(feature => feature.properties?.GEOID === '08001')!.properties!;

    expect(ssp245.climate_hazard_value).not.toBe(ssp370.climate_hazard_value);
    expect(ssp245.climate_hazard_attribution).toMatchObject({ scenario: 'ssp245', epoch: '2030', metric: 'annual_mean_temp_f' });
    expect(ssp370.climate_hazard_attribution).toMatchObject({ scenario: 'ssp370', epoch: '2065', metric: 'annual_mean_temp_f' });
    const html = renderToStaticMarkup(React.createElement(AttributionPopover, { record: ssp370.climate_hazard_attribution! }));
    expect(html).toContain('Scenario: ssp370');
    expect(html).toContain('Epoch: 2065');
    expect(html).toContain(`Source: ${ssp370.climate_hazard_attribution!.source}`);
    expect(html).toContain(`Downscaling: ${ssp370.climate_hazard_attribution!.downscaling_method}`);
  });

  it('marks counties outside SNOTEL coverage as explicit no-data cells', () => {
    const absent = hazardFeaturesFor('ssp245', '2050', 'snotel_swe_baseline_in')
      .find(feature => feature.properties?.GEOID === '08001')!.properties!;
    const present = hazardFeaturesFor('ssp245', '2050', 'snotel_swe_baseline_in')
      .find(feature => feature.properties?.GEOID === '08007')!.properties!;

    expect(absent.climate_hazard_no_data).toBe(true);
    expect(absent.climate_hazard_value).toBeNull();
    expect(absent.climate_hazard_attribution).toBeNull();
    expect(present.climate_hazard_no_data).toBe(false);
  });

  it('retains the C5a 2050 fire-only source when the C2.1 surface is unavailable', () => {
    const fallback = climateSurfaceRecordFor('08001', 'ssp245', 'high_fire_danger_days', '2050', 'p50', false);
    expect(fallback).toMatchObject({ lens: 'ssp245', metric: 'high_fire_danger_days', epoch: '2050', percentile: 'p50' });
    expect(climateSurfaceRecordFor('08001', 'ssp245', 'annual_mean_temp_f', '2050', 'p50', false)).toBeUndefined();
    expect(climateSurfaceRecordFor('08001', 'historical', 'high_fire_danger_days', '2050', 'p50', false)).toBeUndefined();
  });
});
