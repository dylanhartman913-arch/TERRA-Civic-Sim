/**
 * W7-F4 / W7-F2-FU-2 — exposure badges for real tagged anchors.
 *
 * asset_exposure_tags.json is keyed by anchor id (`asset_key_type: "anchor_id"`
 * for every tier-2 anchor row). Registry assets carry their own asset_id
 * (e.g. `anchor_56009_<slug>` or an EIA generator id) plus an `anchor_id`
 * field. ExposureBadges matched tags on `asset.asset_id`, so no real anchor
 * card ever rendered a badge stack.
 *
 * The Wave 5 test (tests/ui/c5a-climate-ui.test.ts) passed because it built a
 * synthetic asset whose `asset_id` WAS an anchor id ('eia860_467_08019'),
 * which no registry asset has.
 *
 * This test uses the real tag file, the app store's real asset registry, and
 * the same anchor -> registry-asset join the anchor card uses
 * (AnchorFacilityLayer: asset.anchor_id === anchor.properties.anchor_id), for
 * the 15 tier-2 anchors whose cards W7-F2 opened in the live probe.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import exposureData from '../../src/data/asset_exposure_tags.json';
import { anchorById } from '../../src/ui/map/anchorFacilities.js';
import { ExposureBadges } from '../../src/ui/map/ExposureBadges.js';
import { useTerraStore } from '../../src/state/store.js';

// W7-F2 live probe (build_log/wave7/snapshots/w7-f2/frame-timing-headed-2026-11-15T22-04-13-541Z.json, anchor_badge_probe).
const W7F2_PROBED_ANCHORS = [
  'eia860_505_56013', 'eia860_4158_56009', 'eia860_4162_56023', 'eia860_4176_56025', 'eia860_6101_56005',
  'eia860_6204_56031', 'eia860_7317_56029', 'eia860_7504_56005', 'eia860_8028_56033', 'eia860_8066_56037',
  'eia860_56093_56041', 'eia860_56312_56023', 'eia860_56596_56005', 'eia860_56609_56005', 'eia860_56841_56009',
];

type TagRow = { asset_id: string; asset_key_type: string; tags: Record<string, { value: string }> };
const tagRows = (exposureData as unknown as { assets: TagRow[] }).assets;

describe('W7-F2-FU-2: exposure badges on real tagged anchor cards', () => {
  const registry = useTerraStore.getState().engineState.asset_registry;
  const cases = W7F2_PROBED_ANCHORS.flatMap(anchorId => {
    const anchor = anchorById(anchorId);
    const asset = registry.find(candidate => candidate.anchor_id === anchor?.properties.anchor_id) ?? null;
    const row = tagRows.find(candidate => candidate.asset_key_type === 'anchor_id' && candidate.asset_id === anchorId);
    return anchor && asset && row ? [{ anchorId, asset, row }] : [];
  });

  it('the fixture is real: >= 3 probed anchors are tagged, linked to a registry asset, and that asset_id is not the anchor id', () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
    for (const { anchorId, asset } of cases) {
      expect(asset.anchor_id).toBe(anchorId);
      expect(asset.asset_id).not.toBe(anchorId);
    }
  });

  it('renders the badge stack with every tag value from the tag file for each linked anchor', () => {
    const missing: string[] = [];
    for (const { anchorId, asset, row } of cases) {
      const html = renderToStaticMarkup(React.createElement(ExposureBadges, { asset }));
      if (!html.includes('data-testid="exposure-badges"')) { missing.push(anchorId); continue; }
      for (const [hazard, tag] of Object.entries(row.tags)) {
        expect(html, `${anchorId} ${hazard}`).toContain(`${hazard.replace(/_/g, ' ')}: ${tag.value}`);
      }
    }
    expect(missing, 'anchors whose card rendered no badge stack').toEqual([]);
  });

  it('renders nothing for a registry asset with no anchor id (no class-default badges invented)', () => {
    const plain = registry.find(asset => !asset.anchor_id);
    expect(plain).toBeDefined();
    expect(renderToStaticMarkup(React.createElement(ExposureBadges, { asset: plain! }))).toBe('');
  });
});
