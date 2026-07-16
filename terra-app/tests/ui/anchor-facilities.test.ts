/**
 * anchor-facilities.test.ts
 *
 * Covers the exported filtering, sizing, and lookup contracts in
 * anchorFacilities.ts — the canonical anchor-feature module consumed by
 * the F2 map layer, F2 economy card, and C5a.
 *
 * Originally scoped in H1.1 as anchor-facilities.test.ts; filed here after
 * the H1.1 type-canonicalization amendment (2026-07-16) consolidated the
 * AnchorFeature type in anchorFacilities.ts and removed the stale duplicate
 * from snapTarget.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  ANCHOR_FACILITIES,
  anchorById,
  anchorSize,
  visibleAnchorsForZoom,
} from '../../src/ui/map/anchorFacilities.js';

// ── ANCHOR_FACILITIES export ─────────────────────────────────────────────────

describe('ANCHOR_FACILITIES', () => {
  it('is non-empty', () => {
    expect(ANCHOR_FACILITIES.length).toBeGreaterThan(0);
  });

  it('contains only Point geometry features', () => {
    for (const f of ANCHOR_FACILITIES) {
      expect(f.geometry.type).toBe('Point');
      expect(f.geometry.coordinates).toHaveLength(2);
    }
  });

  it('has a non-empty anchor_id on every feature', () => {
    for (const f of ANCHOR_FACILITIES) {
      expect(typeof f.properties.anchor_id).toBe('string');
      expect(f.properties.anchor_id.length).toBeGreaterThan(0);
    }
  });

  it('contains both Tier-1 and Tier-2 facilities', () => {
    const tiers = new Set(ANCHOR_FACILITIES.map(f => f.properties.tier));
    expect(tiers.has(1)).toBe(true);
    expect(tiers.has(2)).toBe(true);
  });
});

// ── visibleAnchorsForZoom ─────────────────────────────────────────────────────

describe('visibleAnchorsForZoom', () => {
  const tier2 = ANCHOR_FACILITIES.filter(f => f.properties.tier === 2);

  it('returns all Tier-2 facilities at zoom 8.2 (boundary)', () => {
    const result = visibleAnchorsForZoom(ANCHOR_FACILITIES, 8.2);
    // Same set as tier2, order may differ — compare sorted anchor_ids
    const resultIds = result.map(f => f.properties.anchor_id).sort();
    const tier2Ids = tier2.map(f => f.properties.anchor_id).sort();
    expect(resultIds).toEqual(tier2Ids);
  });

  it('returns only Tier-2 facilities at all zoom levels', () => {
    for (const zoom of [4.5, 5.6, 6.8, 7.5, 8.2, 10.0]) {
      const result = visibleAnchorsForZoom(ANCHOR_FACILITIES, zoom);
      expect(result.every(f => f.properties.tier === 2)).toBe(true);
    }
  });

  it('caps at 3 per county at zoom 7.0 (6.8 ≤ zoom < 8.2)', () => {
    const result = visibleAnchorsForZoom(ANCHOR_FACILITIES, 7.0);
    const byCounty = new Map<string, number>();
    for (const f of result) {
      byCounty.set(f.properties.geoid, (byCounty.get(f.properties.geoid) ?? 0) + 1);
    }
    for (const [, count] of byCounty) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('caps at 2 per county at zoom 6.0 (5.6 ≤ zoom < 6.8)', () => {
    const result = visibleAnchorsForZoom(ANCHOR_FACILITIES, 6.0);
    const byCounty = new Map<string, number>();
    for (const f of result) {
      byCounty.set(f.properties.geoid, (byCounty.get(f.properties.geoid) ?? 0) + 1);
    }
    for (const [, count] of byCounty) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('caps at 1 per county below zoom 5.6', () => {
    const result = visibleAnchorsForZoom(ANCHOR_FACILITIES, 5.0);
    const geoids = result.map(f => f.properties.geoid);
    // No duplicate geoids — exactly one facility per represented county
    expect(geoids.length).toBe(new Set(geoids).size);
  });

  it('returns fewer facilities at lower zoom levels', () => {
    const atHigh = visibleAnchorsForZoom(ANCHOR_FACILITIES, 8.2);
    const atMid = visibleAnchorsForZoom(ANCHOR_FACILITIES, 7.0);
    const atLow = visibleAnchorsForZoom(ANCHOR_FACILITIES, 5.0);
    // Fixture has counties with >3 tier-2 anchors, so counts must decrease
    expect(atLow.length).toBeLessThan(atMid.length);
    expect(atMid.length).toBeLessThanOrEqual(atHigh.length);
  });
});

// ── anchorById ───────────────────────────────────────────────────────────────

describe('anchorById', () => {
  it('finds a known anchor by anchor_id', () => {
    const known = ANCHOR_FACILITIES[0];
    const result = anchorById(known.properties.anchor_id);
    expect(result).toEqual(known);
  });

  it('returns null for an unknown anchor_id', () => {
    expect(anchorById('anchor_definitely_does_not_exist')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(anchorById(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(anchorById(undefined)).toBeNull();
  });
});

// ── anchorSize ───────────────────────────────────────────────────────────────

describe('anchorSize', () => {
  it('returns a positive number for every anchor in the fixture', () => {
    for (const f of ANCHOR_FACILITIES) {
      expect(anchorSize(f)).toBeGreaterThan(0);
    }
  });

  it('returns a larger size for high-capacity facilities (≥1000 MW basis)', () => {
    // Construct a synthetic anchor with basis >= 1000 to hit the 88px branch
    const large = {
      ...ANCHOR_FACILITIES[0],
      properties: { ...ANCHOR_FACILITIES[0].properties, capacity_or_load_mw: 1500, employment_est: null },
    };
    expect(anchorSize(large)).toBe(88);
  });

  it('returns 38 for a Tier-2 anchor with zero capacity and employment', () => {
    const tier2zero = {
      ...ANCHOR_FACILITIES[0],
      properties: {
        ...ANCHOR_FACILITIES[0].properties,
        tier: 2,
        capacity_or_load_mw: null,
        employment_est: null,
      },
    };
    expect(anchorSize(tier2zero)).toBe(38);
  });
});
