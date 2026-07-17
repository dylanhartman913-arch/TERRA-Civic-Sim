/**
 * H1.1 pre-refactor characterization baseline for snap priority and radius.
 *
 * These tests must pass before H1.1 implementation begins and must continue
 * to pass after the refactor moves this logic into anchorFacilities.ts.
 * They are the regression guard for snap-priority ordering and radius behavior.
 *
 * Jim Bridger Power Plant (Sweetwater County, WY) sits at exactly
 * [-108.414461, 41.550134] — the same coordinates used in the priority test —
 * so test 1 exercises a genuine site-vs-anchor contention scenario.
 */

import { describe, expect, it } from 'vitest';
import { findSnapTarget } from '../../src/ui/map/snapTarget.js';
import type { SnapEngineSlice } from '../../src/ui/map/snapTarget.js';
import anchorFacilitiesData from '../../src/data/mw_anchor_facilities.geojson';

describe('H1.1 pre-refactor snap behavior baseline', () => {
  it('prefers an operating site over a tier-2 anchor at the same location', () => {
    // Jim Bridger Power Plant (Tier-2 anchor) is at exactly these coordinates.
    // The engine state places an operating site at the same point via its bus.
    // The function must return the site, proving sites-first priority ordering.
    const state: SnapEngineSlice = {
      crosswalk: [{ geoid: '56037', primary_bus: true, bus_id: 'bus-1' }],
      buses: { 'bus-1': { lon: -108.414461, lat: 41.550134 } },
      asset_registry: [{
        asset_class: 'site', lifecycle: 'operating', geoid: '56037',
        asset_id: 'site-1', name: 'Existing site',
      }],
    };
    const result = findSnapTarget([-108.414461, 41.550134], state);
    expect(result).toMatchObject({ type: 'site', id: 'site-1', siteAssetId: 'site-1' });
  });

  it('accepts points strictly inside the radius and rejects points at or beyond it', () => {
    const state: SnapEngineSlice = {
      crosswalk: [],
      buses: {},
      asset_registry: [],
    };
    const anchor = (anchorFacilitiesData as { features: Array<{
      properties: { tier?: number };
      geometry: { coordinates: [number, number] };
    }> }).features.find(feature => feature.properties.tier === 2);
    if (!anchor) throw new Error('Expected a Tier-2 anchor fixture');
    const [lon, lat] = anchor.geometry.coordinates;
    // One unit inside boundary: strictly less than SNAP_RADIUS_DEG → snap
    expect(findSnapTarget([lon + 0.049, lat], state)?.type).toBe('anchor');
    // Outside boundary: (lon + 0.049) snaps but (lon + 0.051) does not.
    // We use 0.051 rather than 0.05 exactly because floating-point arithmetic
    // on lon values like -105.7088 means (lon + 0.05) - lon ≠ 0.05 exactly;
    // a boundary probe at exactly SNAP_RADIUS_DEG is unreliable.
    expect(findSnapTarget([lon + 0.051, lat], state)).toBeNull();
  });
});
