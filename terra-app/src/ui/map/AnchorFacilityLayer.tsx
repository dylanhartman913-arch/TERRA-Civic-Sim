import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import { useTerraStore } from '../../state/store.js';
import type { AssetInstance } from '../../engine/types.js';
import {
  ANCHOR_FACILITIES,
  type AnchorFacility,
  anchorSize,
  formatSectorName,
  resolveAnchorColor,
  visibleAnchorsForZoom,
} from './anchorFacilities.js';

interface Props {
  map: maplibregl.Map;
}

export function AnchorFacilityLayer({ map }: Props) {
  const visible = useTerraStore(s => s.layers.anchors);
  const engineState = useTerraStore(s => s.engineState);
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const scheduleRetirement = useTerraStore(s => s.scheduleRetirement);
  const accelerateRetirement = useTerraStore(s => s.accelerateRetirement);
  const delayRetirement = useTerraStore(s => s.delayRetirement);
  const [selected, setSelected] = useState<AnchorFacility | null>(null);
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [screenPoint, setScreenPoint] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const styles = typeof window === 'undefined'
    ? null
    : window.getComputedStyle(document.documentElement);

  const anchors = useMemo(() => (
    visible && zoom >= 4.8 ? visibleAnchorsForZoom(ANCHOR_FACILITIES, zoom) : []
  ), [visible, zoom]);

  const linkedAsset = selected
    ? engineState.asset_registry.find(asset => asset.anchor_id === selected.properties.anchor_id) ?? null
    : null;

  useEffect(() => {
    const handleMove = () => {
      setZoom(map.getZoom());
      if (!selected) return;
      const pt = map.project(selected.geometry.coordinates as maplibregl.LngLatLike);
      setScreenPoint({ x: pt.x, y: pt.y });
    };
    handleMove();
    map.on('move', handleMove);
    map.on('zoom', handleMove);
    return () => {
      map.off('move', handleMove);
      map.off('zoom', handleMove);
    };
  }, [map, selected]);

  useEffect(() => {
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    overlayRef.current = overlay;
    map.addControl(overlay as unknown as maplibregl.IControl);
    return () => {
      overlay.finalize();
      overlayRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.setProps({
      layers: [
        new ScatterplotLayer<AnchorFacility>({
          id: 'anchor-facilities',
          data: anchors,
          pickable: true,
          radiusUnits: 'pixels',
          stroked: true,
          filled: true,
          opacity: 0.92,
          getPosition: anchor => anchor.geometry.coordinates,
          getRadius: anchor => anchorSize(anchor) / 4,
          getLineWidth: anchor => anchor.properties.tier === 2 ? 2 : 1,
          lineWidthUnits: 'pixels',
          getFillColor: anchor => styles ? resolveAnchorColor(anchor, styles) : [139, 148, 158, 220],
          getLineColor: [230, 237, 243, 230],
          onClick: info => {
            const anchor = info.object as AnchorFacility | undefined;
            if (!anchor) return false;
            setSelected(anchor);
            setSelectedGeoid(anchor.properties.geoid);
            const pt = map.project(anchor.geometry.coordinates as maplibregl.LngLatLike);
            setScreenPoint({ x: pt.x, y: pt.y });
            return true;
          },
        }),
      ],
    });
  }, [map, anchors, styles, setSelectedGeoid]);

  useEffect(() => {
    const handleFly = (event: Event) => {
      const detail = (event as CustomEvent<{ anchorId?: string }>).detail;
      const anchor = ANCHOR_FACILITIES.find(candidate => candidate.properties.anchor_id === detail?.anchorId);
      if (!anchor) return;
      setSelected(anchor);
      setSelectedGeoid(anchor.properties.geoid);
      map.flyTo({ center: anchor.geometry.coordinates, zoom: Math.max(map.getZoom(), 9.5), duration: 900 });
      const pt = map.project(anchor.geometry.coordinates as maplibregl.LngLatLike);
      setScreenPoint({ x: pt.x, y: pt.y });
    };
    window.addEventListener('terra:focus-anchor', handleFly);
    return () => window.removeEventListener('terra:focus-anchor', handleFly);
  }, [map, setSelectedGeoid]);

  if (!visible || !selected || !screenPoint) return null;

  return (
    <AnchorCard
      anchor={selected}
      asset={linkedAsset}
      x={screenPoint.x}
      y={screenPoint.y}
      onClose={() => setSelected(null)}
      onSchedule={(assetId) => scheduleRetirement(assetId, engineState.year + 5)}
      onAccelerate={(asset) => {
        if (asset.scheduled_retirement_year == null) return;
        accelerateRetirement(asset.asset_id, Math.max(engineState.year + 1, asset.scheduled_retirement_year - 2));
      }}
      onDelay={(asset) => {
        if (asset.scheduled_retirement_year == null) return;
        delayRetirement(asset.asset_id, asset.scheduled_retirement_year + 3);
      }}
    />
  );
}

function AnchorCard({
  anchor,
  asset,
  x,
  y,
  onClose,
  onSchedule,
  onAccelerate,
  onDelay,
}: {
  anchor: AnchorFacility;
  asset: AssetInstance | null;
  x: number;
  y: number;
  onClose: () => void;
  onSchedule: (assetId: string) => void;
  onAccelerate: (asset: AssetInstance) => void;
  onDelay: (asset: AssetInstance) => void;
}) {
  const props = anchor.properties;
  const tier2 = props.tier === 2;
  const hasRetirement = asset?.scheduled_retirement_year != null;
  const confidence = asset?.confidence ?? props.confidence ?? 'unknown';
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;

  return (
    <div
      data-anchor-card={props.anchor_id}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        left: Math.min(x + 14, viewportWidth - 310),
        top: Math.max(12, y - 20),
        width: 292,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 12,
        zIndex: 55,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        boxShadow: '0 8px 24px color-mix(in srgb, var(--bg-base) 75%, transparent)',
        pointerEvents: 'all',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {props.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
            {formatSectorName(props.display_sector)} · Tier {props.tier}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      <div style={{ marginTop: 9, display: 'grid', gap: 4, fontSize: 10 }}>
        <AnchorRow label="Employment" value={props.employment_est != null ? `${Math.round(props.employment_est).toLocaleString()} est.` : '—'} />
        <AnchorRow label="Capacity/load" value={props.capacity_or_load_mw != null ? `${props.capacity_or_load_mw.toFixed(1)} MW` : '—'} />
        <AnchorRow label="Source" value={props.source ?? '—'} />
        <AnchorRow label="Confidence" value={<ConfidenceBadge confidence={confidence} />} />
      </div>

      {tier2 && asset && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
            Registry Asset
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
            <span>{asset.lifecycle.replace(/_/g, ' ')}</span>
          </div>
          {asset.capacity_mw != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>MW</span>
              <span>
                {asset.capacity_mw.toFixed(1)}
                {confidence === 'low' && <ConfidenceBadge confidence="low" />}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
            {asset.lifecycle === 'operating' && !hasRetirement && (
              <button onClick={() => onSchedule(asset.asset_id)} style={anchorButtonStyle('var(--amber)')}>Schedule Retirement</button>
            )}
            {asset.lifecycle === 'operating' && hasRetirement && (
              <>
                <button onClick={() => onAccelerate(asset)} style={anchorButtonStyle('var(--construction)')}>Accelerate</button>
                <button onClick={() => onDelay(asset)} style={anchorButtonStyle('var(--text-secondary)')}>Delay</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnchorRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const color = confidence === 'low' ? 'var(--amber)' : confidence === 'high' ? 'var(--teal)' : 'var(--text-secondary)';
  return (
    <span style={{
      marginLeft: 5,
      color,
      border: `1px solid ${color}`,
      borderRadius: 3,
      padding: '0 4px',
      fontSize: 8,
      textTransform: 'uppercase',
    }}>
      {confidence}
    </span>
  );
}

function anchorButtonStyle(color: string): React.CSSProperties {
  return {
    padding: '3px 7px',
    background: 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 3,
    color,
    fontSize: 9,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
  };
}
