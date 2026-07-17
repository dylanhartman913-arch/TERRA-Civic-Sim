/* eslint-disable react-hooks/set-state-in-effect -- preserve existing marker synchronization. */
/**
 * SiteMarkers — Retired-asset site markers on the map
 *
 * Renders diamond-shaped markers at county centroids where brownfield
 * site assets exist. Click opens a popover showing interconnection,
 * workforce pool with decay clock, acres, and succession discounts.
 */

import { useEffect, useState, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import type { EngineState, AssetInstance } from '../../engine/types.js';
import { SITE_COMPAT } from '../../engine/engine.js';
import type { SiteCompatEntry } from '../../engine/engine.js';

interface SiteMarkerData {
  siteAsset: AssetInstance;
  x: number;
  y: number;
}

function getCountyCentroid(
  geoid: string,
  engineState: EngineState,
): [number, number] | null {
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

export function SiteMarkers({ map }: Props) {
  const engineState = useTerraStore(s => s.engineState) as EngineState;
  const visible = useTerraStore(s => s.layers.sites);
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const [markers, setMarkers] = useState<SiteMarkerData[]>([]);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);

  const siteAssets = engineState.asset_registry.filter(
    a => a.asset_class === 'site' && a.lifecycle === 'operating',
  );

  const project = useCallback(() => {
    if (!visible || siteAssets.length === 0) {
      setMarkers([]);
      return;
    }
    const projected: SiteMarkerData[] = [];
    for (const site of siteAssets) {
      const lngLat = getCountyCentroid(site.geoid, engineState);
      if (!lngLat) continue;
      const pt = map.project(lngLat as maplibregl.LngLatLike);
      projected.push({ siteAsset: site, x: pt.x, y: pt.y });
    }
    setMarkers(projected);
  }, [map, engineState, visible, siteAssets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    project();
    map.on('move', project);
    map.on('zoom', project);
    return () => {
      map.off('move', project);
      map.off('zoom', project);
    };
  }, [map, project]);

  if (!visible || markers.length === 0) return null;

  return (
    <>
      {markers.map(({ siteAsset: site, x, y }) => {
        const isExpanded = expandedSiteId === site.asset_id;
        const spawnYear = site.site_spawn_year ?? engineState.year;
        const yearsElapsed = engineState.year - spawnYear;
        const halfLife = site.workforce_pool_half_life_years ?? 5;
        const decayPct = halfLife > 0 ? Math.round(100 * Math.pow(0.5, yearsElapsed / halfLife)) : 0;
        const siteClass = site.site_class;
        const compat: SiteCompatEntry | null = siteClass ? (SITE_COMPAT[siteClass] ?? null) : null;

        return (
          <div key={site.asset_id}>
            {/* Diamond marker */}
            <div
              onClick={() => setExpandedSiteId(isExpanded ? null : site.asset_id)}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-50%, -50%) rotate(45deg)',
                width: 12,
                height: 12,
                background: decayPct < 30 ? 'var(--amber)' : 'var(--teal)',
                border: '2px solid var(--bg-elevated)',
                borderRadius: 2,
                cursor: 'pointer',
                boxShadow: `0 0 8px ${decayPct < 30 ? 'rgba(245,158,11,0.5)' : 'rgba(45,212,191,0.5)'}`,
                zIndex: 20,
                pointerEvents: 'all',
              }}
              title={`${site.name} — ${siteClass ?? 'site'} · ${site.interconnection_mw ?? 0} MW`}
            />

            {/* Popover */}
            {isExpanded && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: x + 14,
                  top: y - 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  width: 260,
                  zIndex: 50,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  pointerEvents: 'all',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {site.name}
                  </span>
                  <span onClick={() => setExpandedSiteId(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, marginLeft: 8 }}>×</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Class</span>
                  <span style={{ color: 'var(--teal)' }}>{siteClass ?? '—'}</span>
                </div>

                {site.interconnection_mw != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Interconnection</span>
                    <span>{site.interconnection_mw} MW</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Workforce pool</span>
                  <span>
                    <span style={{ color: decayPct < 50 ? 'var(--amber)' : 'var(--teal)' }}>
                      {site.workforce_pool_current?.toFixed(1) ?? '—'} FTE
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                      ({decayPct}%)
                    </span>
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Decay</span>
                  <span style={{ color: decayPct < 30 ? 'var(--deficit)' : decayPct < 60 ? 'var(--amber)' : 'var(--text-primary)' }}>
                    {yearsElapsed}yr · t½={halfLife}yr
                  </span>
                </div>

                {site.acres != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Acres</span>
                    <span>{site.acres}</span>
                  </div>
                )}

                {compat && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Succession Discounts
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 9 }}>
                      <span style={{ color: 'var(--teal)' }}>TTD -{compat.ttd_reduction_years}yr</span>
                      <span style={{ color: 'var(--teal)' }}>Capex -{(compat.capex_discount_fraction * 100).toFixed(0)}%</span>
                      <span style={{ color: 'var(--teal)' }}>TX ≤{site.interconnection_mw ?? 0}MW</span>
                    </div>
                  </div>
                )}

                {/* Open county card */}
                <button
                  onClick={() => { setSelectedGeoid(site.geoid); setExpandedSiteId(null); }}
                  style={{
                    marginTop: 8,
                    padding: '4px 10px',
                    background: 'transparent',
                    border: '1px solid var(--teal-dim, var(--teal))',
                    borderRadius: 3,
                    color: 'var(--teal)',
                    fontSize: 9,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    width: '100%',
                  }}
                >
                  Open County Card
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
