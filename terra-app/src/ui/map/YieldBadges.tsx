/**
 * YieldBadges — Civ-style icon badges at county centroids for counties
 * with active yields (deficit, housing pressure, positive revenue delta).
 *
 * Uses the primary bus lat/lon as county centroid approximation.
 * Toggled via layers.yieldBadges in the store.
 */

import { useEffect, useState, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import type { EngineState } from '../../engine/types.js';
import { JOBS_PER_MW, HOUSING_PRESSURE_THRESHOLD } from '../panels/CountyYields.js';
import { computeFiscalNetDelta } from '../../state/selectors.js';

interface BadgeData {
  geoid: string;
  x: number;
  y: number;
  badges: { icon: string; color: string; title: string }[];
}

function computeBadges(engineState: EngineState): Map<string, { icon: string; color: string; title: string }[]> {
  const result = new Map<string, { icon: string; color: string; title: string }[]>();

  for (const [geoid, ees] of Object.entries(engineState.county_ees)) {
    const badges: { icon: string; color: string; title: string }[] = [];

    // Capacity deficit
    if (ees.deficit_mw > 0) {
      badges.push({
        icon: '⚡',
        color: 'var(--deficit)',
        title: `${ees.deficit_mw.toFixed(0)} MW supply gap`,
      });
    }

    // Housing pressure
    const builds = engineState.build_queue.filter(b => b.geoid === geoid && !b.commissioned);
    const card = engineState.county_cards[geoid] as { employment?: number; state?: string } | undefined;
    const laborForce = card?.employment ?? 0;
    if (laborForce > 0 && builds.length > 0) {
      let constructionJobs = 0;
      for (const b of builds) {
        const rates = JOBS_PER_MW[b.action_id];
        if (rates) constructionJobs += rates.c * b.magnitude;
      }
      if (constructionJobs / laborForce >= HOUSING_PRESSURE_THRESHOLD) {
        badges.push({
          icon: '🏠',
          color: 'var(--amber)',
          title: `Housing pressure: ${((constructionJobs / laborForce) * 100).toFixed(1)}% LF`,
        });
      }
    }

    // Positive revenue (WY only)
    if (card?.state === 'WY') {
      const geoidPadded = geoid.padStart(5, '0');
      const cf = engineState.county_fiscal[geoidPadded];
      if (cf) {
        const netDelta = computeFiscalNetDelta(cf);
        if (netDelta > 0) {
          badges.push({
            icon: '💰',
            color: 'var(--teal)',
            title: `Revenue Δ +$${(netDelta / 1e6).toFixed(1)}M`,
          });
        }
      }
    }

    if (badges.length > 0) {
      result.set(geoid, badges);
    }
  }

  return result;
}

function getCountyCentroid(
  geoid: string,
  engineState: EngineState,
): [number, number] | null {
  // Use primary bus lat/lon as county centroid approximation
  const crosswalkRow = engineState.crosswalk.find(r => r.geoid === geoid && r.primary_bus);
  if (!crosswalkRow) return null;
  const busId = String(crosswalkRow.bus_id);
  const bus = engineState.buses[busId];
  if (!bus) return null;
  return [bus.lon, bus.lat];
}

interface Props {
  map: maplibregl.Map;
}

export function YieldBadges({ map }: Props) {
  const engineState = useTerraStore(s => s.engineState);
  const visible = useTerraStore(s => s.layers.yieldBadges);
  const [badgeData, setBadgeData] = useState<BadgeData[]>([]);

  const project = useCallback(() => {
    if (!visible) {
      setBadgeData([]);
      return;
    }
    const badgeMap = computeBadges(engineState);
    const projected: BadgeData[] = [];
    for (const [geoid, badges] of badgeMap.entries()) {
      const lngLat = getCountyCentroid(geoid, engineState);
      if (!lngLat) continue;
      const pt = map.project(lngLat as maplibregl.LngLatLike);
      projected.push({ geoid, x: pt.x, y: pt.y, badges });
    }
    setBadgeData(projected);
  }, [map, engineState, visible]);

  // Re-project on map move/zoom and when data changes
  useEffect(() => {
    project();
    map.on('move', project);
    map.on('zoom', project);
    return () => {
      map.off('move', project);
      map.off('zoom', project);
    };
  }, [map, project]);

  if (!visible || badgeData.length === 0) return null;

  return (
    <>
      {badgeData.map(({ geoid, x, y, badges }) => (
        <div
          key={geoid}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -100%)',
            display: 'flex',
            gap: 2,
            pointerEvents: 'none',
          }}
        >
          {badges.map((badge, i) => (
            <div
              key={i}
              title={badge.title}
              style={{
                width: 16,
                height: 16,
                background: 'var(--bg-elevated)',
                border: `1px solid ${badge.color}`,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                lineHeight: 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                pointerEvents: 'all',
                cursor: 'default',
              }}
            >
              {badge.icon}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
