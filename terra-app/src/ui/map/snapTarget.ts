/**
 * Snap-target resolution for pin placement — production module.
 *
 * Provides TIER2_ANCHORS and findSnapTarget, consumed by PlacementOverlay
 * and C5a. The anchor-feature type is AnchorFacility from anchorFacilities.ts
 * (single canonical definition for the full property schema including
 * anchor_id, commodity, display_sector, etc.).
 *
 * SnapEngineSlice and SnapTarget are snap-specific types; they have no
 * overlap with anchorFacilities.ts.
 */

import { ANCHOR_FACILITIES, type AnchorFacility } from './anchorFacilities.js';

/** Snap radius in geographic degrees (~5.5 km at 43°N). Configurable here. */
export const SNAP_RADIUS_DEG = 0.05;

/** Tier-2 anchor facilities available for snap detection. */
export const TIER2_ANCHORS: AnchorFacility[] = ANCHOR_FACILITIES.filter(
  f => f.properties.tier === 2,
);

/** Structural subset of EngineState consumed by the snap functions. */
export interface SnapEngineSlice {
  crosswalk: Array<{ geoid: string; primary_bus?: boolean; bus_id: string | number }>;
  buses: Record<string, { lon: number; lat: number }>;
  asset_registry: Array<{
    asset_class: string;
    lifecycle: string;
    geoid: string;
    asset_id: string;
    name: string;
  }>;
}

export interface SnapTarget {
  type: 'site' | 'anchor';
  id: string;
  name: string;
  coords: [number, number];
  siteAssetId?: string;
}

export function getCountyCentroid(
  geoid: string,
  engineState: SnapEngineSlice,
): [number, number] | null {
  const row = engineState.crosswalk.find(r => r.geoid === geoid && r.primary_bus);
  if (!row) return null;
  const bus = engineState.buses[String(row.bus_id)];
  if (!bus) return null;
  return [bus.lon, bus.lat];
}

export function findSnapTarget(
  lngLat: [number, number],
  engineState: SnapEngineSlice,
): SnapTarget | null {
  const [lon, lat] = lngLat;

  // Sites first (higher priority — succession discount)
  const sites = engineState.asset_registry.filter(
    a => a.asset_class === 'site' && a.lifecycle === 'operating',
  );
  for (const site of sites) {
    const centroid = getCountyCentroid(site.geoid, engineState);
    if (!centroid) continue;
    const dist = Math.sqrt(
      Math.pow(lon - centroid[0], 2) + Math.pow(lat - centroid[1], 2),
    );
    if (dist < SNAP_RADIUS_DEG) {
      return {
        type: 'site',
        id: site.asset_id,
        name: site.name,
        coords: centroid,
        siteAssetId: site.asset_id,
      };
    }
  }

  // Tier-2 anchor facilities
  for (const anchor of TIER2_ANCHORS) {
    const [aLon, aLat] = anchor.geometry.coordinates;
    const dist = Math.sqrt(
      Math.pow(lon - aLon, 2) + Math.pow(lat - aLat, 2),
    );
    if (dist < SNAP_RADIUS_DEG) {
      return {
        type: 'anchor',
        id: anchor.properties.name,
        name: anchor.properties.name,
        coords: [aLon, aLat],
      };
    }
  }

  return null;
}
