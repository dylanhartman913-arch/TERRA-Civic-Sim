/* eslint-disable react-hooks/set-state-in-effect -- preserve existing marker synchronization. */
/**
 * QueuedBuildMarkers — F3 sub-county pin rendering
 *
 * Renders map markers for queued / under-construction player assets.
 * When an ActionLogEntry carries site_coords, the marker is placed at
 * the exact pin coordinates. When absent, it falls back to the county
 * centroid (bus lat/lon) — identical to the pre-F3 county-level default.
 *
 * Completed builds keep their pin; old saves without pins render at centroid.
 * Engine-inert: reads only from actionLog and engineState, never writes
 * to any engine numeric path.
 */

import { useEffect, useState, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import type { EngineState } from '../../engine/types.js';

interface MarkerData {
  assetId: string;
  actionId: string;
  lifecycle: string;      // 'queued' | 'under_construction' | 'operating' (with pin)
  yearsRemaining: number | null;
  x: number;
  y: number;
  isPinned: boolean;
}

function getCountyCentroid(geoid: string, engineState: EngineState): [number, number] | null {
  const row = engineState.crosswalk.find(r => r.geoid === geoid && r.primary_bus);
  if (!row) return null;
  const bus = engineState.buses[String(row.bus_id)];
  if (!bus) return null;
  return [bus.lon, bus.lat];
}

const LIFECYCLE_COLOR: Record<string, string> = {
  queued: 'var(--amber)',
  under_construction: 'var(--construction)',
  operating: 'var(--teal)',
};

interface Props { map: maplibregl.Map }

export function QueuedBuildMarkers({ map }: Props) {
  const engineState = useTerraStore(s => s.engineState) as EngineState;
  const actionLog = useTerraStore(s => s.actionLog);
  const [markers, setMarkers] = useState<MarkerData[]>([]);

  const project = useCallback(() => {
    const result: MarkerData[] = [];

    // Only player assets that are queued, under construction, or recently commissioned
    const playerAssets = engineState.asset_registry.filter(
      a => a.origin === 'player' &&
        (a.lifecycle === 'queued' || a.lifecycle === 'under_construction'),
    );

    for (const asset of playerAssets) {
      // Find matching log entry to get site_coords
      const logEntry = actionLog.find(
        e => e.type === 'queue' &&
          e.actionId === asset.action_id &&
          e.geoid === asset.geoid &&
          e.decisionYear === asset.decision_year,
      );

      const siteCoords = logEntry?.site_coords ?? null;
      const lngLat: [number, number] | null =
        siteCoords ?? getCountyCentroid(asset.geoid, engineState);
      if (!lngLat) continue;

      const pt = map.project(lngLat as maplibregl.LngLatLike);
      const yearsRemaining = asset.operational_year != null
        ? Math.max(0, asset.operational_year - engineState.year)
        : null;

      result.push({
        assetId: asset.asset_id,
        actionId: asset.action_id ?? '',
        lifecycle: asset.lifecycle,
        yearsRemaining,
        x: pt.x,
        y: pt.y,
        isPinned: !!siteCoords,
      });
    }

    setMarkers(result);
  }, [map, engineState, actionLog]);

  useEffect(() => {
    project();
    map.on('move', project);
    map.on('zoom', project);
    return () => {
      map.off('move', project);
      map.off('zoom', project);
    };
  }, [map, project]);

  if (markers.length === 0) return null;

  return (
    <>
      {markers.map(m => {
        const color = LIFECYCLE_COLOR[m.lifecycle] ?? 'var(--amber)';
        const label = m.actionId.replace(/_/g, ' ').slice(0, 16);

        return (
          <div key={m.assetId}>
            {/* Pin icon */}
            <div
              title={`${label}${m.yearsRemaining != null ? ` · ${m.yearsRemaining}yr` : ''}`}
              style={{
                position: 'absolute',
                left: m.x,
                top: m.y,
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'none',
                zIndex: 25,
              }}
            >
              {/* Pin body */}
              <div style={{
                width: 10, height: 10,
                borderRadius: '50% 50% 50% 0',
                background: color,
                border: '1.5px solid var(--bg-elevated)',
                transform: 'rotate(-45deg)',
                boxShadow: `0 0 6px ${color}88`,
              }} />
              {/* Countdown badge */}
              {m.yearsRemaining != null && m.yearsRemaining > 0 && (
                <div style={{
                  position: 'absolute',
                  left: 10, top: -6,
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${color}`,
                  borderRadius: 3,
                  fontSize: 8,
                  padding: '0 3px',
                  color,
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {m.yearsRemaining}yr
                </div>
              )}
              {/* Pinned indicator dot */}
              {m.isPinned && (
                <div style={{
                  position: 'absolute', bottom: -3, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 3, height: 3, borderRadius: '50%',
                  background: 'var(--teal)',
                }} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
