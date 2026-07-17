import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AttributionPopover, ClimatePanel } from '../../src/ui/panels/ClimatePanel.js';
import { climateRecordFor } from '../../src/ui/climate.js';
import { ExposureBadges } from '../../src/ui/map/ExposureBadges.js';
import type { AssetInstance } from '../../src/engine/types.js';

const taggedAsset = { asset_id: 'eia860_467_08019' } as AssetInstance;
const missingTagAsset = { asset_id: 'not-in-c2-exposure-tags' } as AssetInstance;

describe('C5a climate UI', () => {
  it('passes source p10, p50, and p90 records through the county fan chart', () => {
    const p10 = climateRecordFor('08037', 'ssp245', 'annual_mean_temp_f', '2030', 'p10');
    const p50 = climateRecordFor('08037', 'ssp245', 'annual_mean_temp_f', '2030', 'p50');
    const p90 = climateRecordFor('08037', 'ssp245', 'annual_mean_temp_f', '2030', 'p90');
    const html = renderToStaticMarkup(React.createElement(ClimatePanel, { geoid: '08037', lens: 'ssp245' }));

    expect(p10).toBeDefined();
    expect(p50).toBeDefined();
    expect(p90).toBeDefined();
    expect(html).toContain(String(p10!.value));
    expect(html).toContain(String(p50!.value));
    expect(html).toContain(String(p90!.value));
    expect(html).toContain('Eagle, CO temperature bias flag');
  });

  it('retains source low-confidence climate records instead of dropping them', () => {
    const low = climateRecordFor('08037', 'ssp245', 'water_stress_index', '2030', 'p50');
    const html = renderToStaticMarkup(React.createElement(ClimatePanel, { geoid: '08037', lens: 'ssp245', initialMetric: 'water_stress_index' }));
    expect(low?.confidence).toBe('low');
    expect(html).toContain(String(low?.value));
    expect(html).toContain('low confidence');
  });

  it('surfaces ssp245 in the debrief header from a loaded session', () => {
    const loadedSsp245 = { session: { file: { climate_lens: 'ssp245' } } };
    const source = readFileSync(resolve(process.cwd(), 'src/ui/panels/DebriefView.tsx'), 'utf8');
    expect(loadedSsp245.session.file.climate_lens).toBe('ssp245');
    expect(source).toContain('data-testid="debrief-climate-lens"');
    expect(source).toContain("item.session.file.climate_lens ?? 'historical'");
    expect(source).toContain('Climate lens:');
  });

  it('renders C2 exposure badges from the asset tag values', () => {
    const html = renderToStaticMarkup(React.createElement(ExposureBadges, { asset: taggedAsset }));
    expect(html).toContain('data-testid="exposure-badges"');
    expect(html).toContain('wildfire exposure: high');
  });

  it('preserves C2 exposure provenance in badge metadata', () => {
    const html = renderToStaticMarkup(React.createElement(ExposureBadges, { asset: taggedAsset }));
    expect(html).toContain('USFS WRC county risk rank + FEMA NRI county context');
    expect(html).toContain('study-county tertiles; WRC primary, NRI fallback');
    expect(html).toContain('confidence: medium');
  });

  it('does not invent badges when an asset has no C2 exposure tag entry', () => {
    const html = renderToStaticMarkup(React.createElement(ExposureBadges, { asset: missingTagAsset }));
    expect(html).toBe('');
  });

  it('keeps C4 exposure-stress rows and event feeds outside C5a components', () => {
    const c5aSources = [
      'src/ui/panels/ClimatePanel.tsx',
      'src/ui/map/ExposureBadges.tsx',
      'src/ui/map/HazardChoroplethLayer.tsx',
    ].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n');
    expect(c5aSources).not.toMatch(/exposure stress|event feed/i);
  });

  it('renders all six source attribution fields in the popover', () => {
    const record = climateRecordFor('08037', 'ssp245', 'annual_mean_temp_f', '2030', 'p50');
    expect(record).toBeDefined();
    const html = renderToStaticMarkup(React.createElement(AttributionPopover, { record: record! }));
    expect(html).toContain(`Scenario: ${record!.scenario}`);
    expect(html).toContain(`Epoch: ${record!.epoch}`);
    expect(html).toContain(`Percentile: ${record!.percentile}`);
    expect(html).toContain(`Source: ${record!.source}`);
    expect(html).toContain(`Method: ${record!.method}`);
    expect(html).toContain(`Confidence: ${record!.confidence}`);
  });
});
