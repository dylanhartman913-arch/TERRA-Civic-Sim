/**
 * W7-F4 / W7-F2-FU-1 — supporting gates for the white-screen fix.
 *
 * 1. src/ui/theme.ts (concrete token values for GL layers) cannot drift from
 *    src/ui/tokens.css.
 * 2. MapLayerBoundary swallows a layer failure into a hidden marker instead of
 *    propagating it, and MapView wraps every map layer in one.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_TOKENS } from '../../src/ui/theme.js';
import { MapLayerBoundary } from '../../src/ui/map/MapLayerBoundary.js';

function rootTokens(): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!root) throw new Error(':root block not found in tokens.css');
  const tokens: Record<string, string> = {};
  for (const m of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

describe('theme.ts mirrors tokens.css', () => {
  it('every theme value equals its tokens.css :root value', () => {
    const css = rootTokens();
    for (const [token, value] of Object.entries(COLOR_TOKENS)) {
      expect(css[token], `${token} missing from tokens.css`).toBeDefined();
      expect(value.toLowerCase(), token).toBe(css[token].toLowerCase());
    }
  });

  it('every colour token in tokens.css :root is in theme.ts', () => {
    const colourTokens = Object.entries(rootTokens()).filter(([, value]) => /^#[0-9a-f]{3,8}$/i.test(value)).map(([token]) => token);
    expect(colourTokens.length).toBeGreaterThan(30);
    expect(colourTokens.filter(token => !(token in COLOR_TOKENS))).toEqual([]);
  });
});

describe('MapLayerBoundary', () => {
  it('turns a thrown layer error into state instead of propagating it', () => {
    const error = new Error('layer exploded');
    expect(MapLayerBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it('renders children while healthy and a hidden marker (not the layer) after a failure', () => {
    const child = React.createElement('i', null, 'layer');
    const boundary = new MapLayerBoundary({ name: 'climate-hazards', children: child });
    expect(boundary.render()).toBe(child);

    boundary.state = { error: new Error('boom') };
    const marker = boundary.render() as React.ReactElement<{ hidden: boolean; 'data-map-layer-error': string }>;
    expect(marker.type).toBe('span');
    expect(marker.props.hidden).toBe(true);
    expect(marker.props['data-map-layer-error']).toBe('climate-hazards');
  });

  it('reports the failure with the layer name', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new MapLayerBoundary({ name: 'climate-hazards', children: null });
    boundary.componentDidCatch(new Error('boom'), { componentStack: '\n  at HazardChoroplethLayer' } as React.ErrorInfo);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('climate-hazards');
    spy.mockRestore();
  });

  it('MapView wraps every map layer component in its own MapLayerBoundary', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/ui/map/MapView.tsx'), 'utf8');
    const layerComponents = [...src.matchAll(/^import \{ (\w+) \} from '\.\/(\w+)\.js';$/gm)]
      .map(m => m[1])
      .filter(name => !['MapLayerBoundary', 'Tooltip'].includes(name));
    expect(layerComponents.length).toBeGreaterThanOrEqual(13);
    for (const name of layerComponents) {
      const uses = [...src.matchAll(new RegExp(`<${name}\\b`, 'g'))];
      expect(uses.length, `${name} not rendered`).toBeGreaterThan(0);
      for (const use of uses) {
        const before = src.slice(0, use.index);
        const opened = before.lastIndexOf('<MapLayerBoundary');
        const closed = before.lastIndexOf('</MapLayerBoundary>');
        expect(opened > closed, `${name} is not inside a MapLayerBoundary`).toBe(true);
      }
    }
  });
});
