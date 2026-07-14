import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScatterplotLayer } from '@deck.gl/layers';
import countyCards from '../../src/data/county_cards.json';
import {
  ANCHOR_FACILITIES,
  ANCHOR_TAXONOMY,
  anchorSize,
  sectorTokenForAnchor,
  visibleAnchorsForZoom,
} from '../../src/ui/map/anchorFacilities.js';
import { EconomyDrivers } from '../../src/ui/panels/CountyCardDrawer.js';
import { useTerraStore } from '../../src/state/store.js';

describe('F2 anchor facility layer helpers', () => {
  it('builds a deck.gl scatterplot layer from fixture geojson', () => {
    const anchors = visibleAnchorsForZoom(ANCHOR_FACILITIES, 9);
    const layer = new ScatterplotLayer({
      id: 'test-anchor-facilities',
      data: anchors,
      getPosition: anchor => anchor.geometry.coordinates,
      getRadius: anchor => anchorSize(anchor),
    });

    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.some(anchor => anchor.properties.anchor_id === 'eia860_8066_56037')).toBe(true);
    expect(layer.id).toBe('test-anchor-facilities');
  });

  it('resolves taxonomy tokens for every sector present in the geojson', () => {
    const tokens = new Set(Object.values(ANCHOR_TAXONOMY).map(entry => entry.color_token));
    for (const anchor of ANCHOR_FACILITIES) {
      const token = sectorTokenForAnchor(anchor);
      expect(token).toMatch(/^sector_/);
      expect(tokens.has(token) || token === 'sector_other').toBe(true);
    }
  });
});

describe('F2 economy card block', () => {
  it('renders every driver_source variant in county card data', () => {
    type CardWithEconomy = { economic_drivers?: React.ComponentProps<typeof EconomyDrivers>['drivers'] };
    const variants = new Map<string, React.ComponentProps<typeof EconomyDrivers>['drivers']>();
    for (const card of Object.values(countyCards as Record<string, CardWithEconomy>)) {
      if (card.economic_drivers?.driver_source) {
        variants.set(card.economic_drivers.driver_source, card.economic_drivers);
      }
    }

    expect(variants.size).toBeGreaterThan(0);
    for (const [source, drivers] of variants) {
      const html = renderToStaticMarkup(React.createElement(EconomyDrivers, { drivers }));
      expect(html).toContain(source);
      expect(html).toContain(drivers.vintage);
    }
  });

  it('renders government and military as a normal sector row', () => {
    const html = renderToStaticMarkup(React.createElement(EconomyDrivers, { drivers: {
      driver_source: 'synthetic_variant',
      vintage: 'CBP_2023+QCEW_2024',
      top_by_share: [{ display_sector: 'government/military', employment: 120, share: 0.31, lq: 2.2 }],
      top_by_lq: [{ display_sector: 'government/military', employment: 120, share: 0.31, lq: 2.2 }],
    } }));

    expect(html).toContain('Government / Military');
    expect(html).toContain('31.0%');
    expect(html).toContain('2.20');
  });
});

describe('F2 Tier 2 registry click-through lookup', () => {
  it('reaches the registry asset by anchor_id', () => {
    const state = useTerraStore.getState().engineState;
    const tronaAnchor = ANCHOR_FACILITIES.find(anchor => anchor.properties.anchor_id === 'msha_4800152');
    const registryAsset = state.asset_registry.find(asset => asset.anchor_id === tronaAnchor?.properties.anchor_id);

    expect(tronaAnchor?.properties.tier).toBe(2);
    expect(registryAsset?.name).toBe('WE Soda @ WESTVACO');
    expect(registryAsset?.asset_class).toBe('mine');
    expect(registryAsset?.confidence).toBe('high');
  });
});
