/**
 * W7-F4 / W7-F2-FU-1 — HazardChoroplethLayer through the real paint path.
 *
 * Production white-screen (W7-F2 HANDOFF): the layer resolved its fill colours
 * with getComputedStyle at render time and threw "Missing required --choro-3
 * design token" whenever the token stylesheet had not applied. With no error
 * boundary, the throw unmounted the whole app on entering Free Play.
 *
 * This test renders the real component. Server rendering skips effects, so
 * useEffect is run inline (same vi.mock('react') technique as
 * tests/ui/c5a-climate-ui.test.ts). The component's own addLayer /
 * setPaintProperty / setLayoutProperty calls therefore reach a recording map,
 * which passes every layer spec through MapLibre's style-spec validator
 * (@maplibre/maplibre-gl-style-spec, the validator maplibre-gl itself uses).
 *
 * The DOM is stubbed in the production failure condition: getComputedStyle
 * returns empty strings for every custom property (stylesheet not applied).
 * A layer that depends on runtime CSS fails here; a layer whose colours come
 * from concrete values passes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type maplibregl from 'maplibre-gl';
import { HazardChoroplethLayer } from '../../src/ui/map/HazardChoroplethLayer.js';
import { choroplethMetrics } from '../../src/ui/climate.js';
import type { ClimateEpoch, ClimateLens, ClimateMetric } from '../../src/ui/climate.js';

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Run effects inline during server render so addLayer/setPaintProperty execute.
    useEffect: ((effect: () => void | (() => void)) => { effect(); }) as typeof actual.useEffect,
  };
});

type LayerSpec = maplibregl.LayerSpecification & { source: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };

/** Map stub that records layer specs and validates each one with MapLibre's style-spec validator. */
function recordingMap() {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, LayerSpec>();
  const validationErrors: string[] = [];
  const paintCalls: Array<{ layer: string; property: string; value: unknown }> = [];
  const validate = (layer: LayerSpec) => {
    const style = {
      version: 8 as const,
      sources: { [layer.source]: { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } } },
      layers: [layer],
    };
    for (const error of validateStyleMin(style as maplibregl.StyleSpecification)) validationErrors.push(error.message);
  };
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, spec: unknown) => { sources.set(id, { ...(spec as object), setData: () => undefined }); },
    getLayer: (id: string) => layers.get(id),
    addLayer: (spec: LayerSpec) => {
      validate(spec);
      for (const [property, value] of Object.entries(spec.paint ?? {})) paintCalls.push({ layer: spec.id, property, value });
      layers.set(spec.id, spec);
    },
    setPaintProperty: (id: string, property: string, value: unknown) => {
      const layer = layers.get(id)!;
      const next = { ...layer, paint: { ...layer.paint, [property]: value } } as LayerSpec;
      validate(next);
      paintCalls.push({ layer: id, property, value });
      layers.set(id, next);
    },
    setLayoutProperty: (id: string, property: string, value: unknown) => {
      const layer = layers.get(id)!;
      const next = { ...layer, layout: { ...layer.layout, [property]: value } } as LayerSpec;
      validate(next);
      layers.set(id, next);
    },
    on: () => undefined,
    off: () => undefined,
    removeLayer: (id: string) => { layers.delete(id); },
    removeSource: (id: string) => { sources.delete(id); },
  };
  return { map: map as unknown as maplibregl.Map, layers, validationErrors, paintCalls };
}

const getComputedStyleSpy = vi.fn(() => ({ getPropertyValue: () => '' }));

beforeEach(() => {
  getComputedStyleSpy.mockClear();
  // Production failure condition: the token stylesheet has not applied, so
  // every custom property reads back as ''.
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('getComputedStyle', getComputedStyleSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLayer(lens: ClimateLens, epoch: ClimateEpoch, metric: ClimateMetric, visible = true) {
  const rec = recordingMap();
  renderToStaticMarkup(React.createElement(HazardChoroplethLayer, {
    map: rec.map, visible, lens, epoch, metric, onAttribution: () => undefined,
  }));
  return rec;
}

describe('W7-F2-FU-1: HazardChoroplethLayer paint path', () => {
  it('mounts and adds a MapLibre-valid fill layer when the token stylesheet has not applied', () => {
    const rec = renderLayer('ssp245', '2050', 'high_fire_danger_days');

    const layer = rec.layers.get('climate-hazard-choropleth');
    expect(layer, 'layer was never added').toBeDefined();
    expect(rec.validationErrors).toEqual([]);
    expect(JSON.stringify(layer!.paint)).not.toMatch(/var\(/);
  });

  it('every lens x metric reaches addLayer and setPaintProperty with valid, concrete colours', () => {
    const metrics = choroplethMetrics();
    expect(metrics.length).toBeGreaterThan(1);
    for (const lens of ['historical', 'ssp245', 'ssp370'] as ClimateLens[]) {
      for (const metric of metrics) {
        const rec = renderLayer(lens, '2050', metric);
        expect(rec.validationErrors, `${lens}/${metric}`).toEqual([]);
        const fillColorCalls = rec.paintCalls.filter(call => call.property === 'fill-color');
        // addLayer + the update effect's setPaintProperty.
        expect(fillColorCalls.length, `${lens}/${metric}`).toBe(2);
        for (const call of fillColorCalls) expect(JSON.stringify(call.value)).not.toMatch(/var\(|""/);
      }
    }
  });

  it('the layer reads no CSS at runtime (no getComputedStyle on the paint path)', () => {
    renderLayer('ssp245', '2050', 'cdd', false);
    expect(getComputedStyleSpy).not.toHaveBeenCalled();
  });
});

/**
 * Static guard over the whole map-layer tree: no CSS var() inside a MapLibre
 * paint/layout object literal or a setPaintProperty/setLayoutProperty call.
 * (DOM `style={{ ... }}` props are not MapLibre paint and are not checked.)
 */
function balancedFrom(src: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

describe('W7-F2-FU-1: no CSS var() reaches a MapLibre paint/layout property', () => {
  it('scans every file under src/ui/map', () => {
    const dir = resolve(process.cwd(), 'src/ui/map');
    const hits: string[] = [];
    let blocks = 0;
    for (const file of readdirSync(dir).filter(f => /\.tsx?$/.test(f))) {
      const src = readFileSync(join(dir, file), 'utf8');
      for (const m of src.matchAll(/\b(paint|layout)\s*:\s*\{/g)) {
        const block = balancedFrom(src, m.index! + m[0].length - 1, '{', '}');
        blocks++;
        if (/var\(/.test(block.replace(/\/\/.*$/gm, ''))) hits.push(`${file}: ${m[1]} ${block.slice(0, 80)}`);
      }
      for (const m of src.matchAll(/\bset(Paint|Layout)Property\s*\(/g)) {
        const call = balancedFrom(src, m.index! + m[0].length - 1, '(', ')');
        blocks++;
        if (/var\(/.test(call)) hits.push(`${file}: set${m[1]}Property${call.slice(0, 80)}`);
      }
    }
    expect(blocks).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });
});
