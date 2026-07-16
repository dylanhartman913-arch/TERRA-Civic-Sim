import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClimatePanel } from '../../src/ui/panels/ClimatePanel.js';
import { DebriefView } from '../../src/ui/panels/DebriefView.js';
import { climateRecordFor } from '../../src/ui/climate.js';

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

  it('surfaces the session climate lens in the debrief header', () => {
    const html = renderToStaticMarkup(React.createElement(DebriefView, { onClose: () => undefined }));
    expect(html).toContain('data-testid="debrief-climate-lens"');
    expect(html).toContain('Climate lens: awaiting session file');
  });
});
