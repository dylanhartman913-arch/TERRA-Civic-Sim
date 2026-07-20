/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- preserve existing map event lifecycle. */
import { useEffect, useRef, useState, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import type { ActionRecord, CrosswalkRow, CountyFiscal } from '../../engine/types.js';
import { Tooltip } from './Tooltip.js';
import { computeConsumption, getBudgetShareString, isEraOverflow, getEraForYear } from '../../engine/budgets.js';
import { computeFiscalDelta, getAgPlacementPreview } from '../../engine/engine.js';
import { JOBS_PER_MW, HOUSING_PRESSURE_THRESHOLD } from '../panels/CountyYields.js';
import { DeltaProjectionStrip } from './DeltaProjectionStrip.js';
import { findSnapTarget } from './snapTarget.js';

// ── F3 constants ─────────────────────────────────────────────────────────────

/** MapLibre zoom at which basemap towns become legible on Stadia Alidade Dark. */
const PIN_ZOOM_THRESHOLD = 9.0;

// ── Existing layer IDs ────────────────────────────────────────────────────────

const ERA_NAMES: Record<number, string> = {
  2025: 'Foundation Era (2025–2035)',
  2035: 'Transition Era (2035–2045)',
  2045: 'Buildout Era (2045–2055)',
  2055: 'Steady State Era (2055–2075)',
};

const RESOURCE_TO_CHIP: Record<string, string> = {
  capital: 'capital',
  labor: 'labor',
  steel: 'steel',
  concrete: 'concrete',
  HALEU: 'HALEU',
  'transmission ROW': 'tx_row',
};

const ELIGIBLE_FILL = 'placement-eligible-fill';
const ELIGIBLE_BORDER = 'placement-eligible-border';
const INELIGIBLE_FILL = 'placement-ineligible-fill';
const GHOST_FILL = 'placement-ghost-fill';
const FILL_LAYER = 'county-fill';  // underlying county fill for queryRenderedFeatures

const ECOREGION_NAMES: Record<number, string> = {
  12: 'Snake River Plain',
  13: 'Central Basin and Range',
  14: 'Mojave Basin and Range',
  15: 'Northern Rockies',
  16: 'Idaho Batholith',
  17: 'Middle Rockies',
  18: 'Wyoming Basin',
  19: 'Wasatch and Uinta Mountains',
  20: 'Colorado Plateaus',
  21: 'Southern Rockies',
  22: 'Arizona/New Mexico Plateau',
  23: 'Arizona/New Mexico Mountains',
  25: 'High Plains',
  26: 'Southwestern Tablelands',
  27: 'Central Great Plains',
  42: 'Northwestern Glaciated Plains',
  43: 'Northwestern Great Plains',
  44: 'Nebraska Sand Hills',
  46: 'Northern Glaciated Plains',
  80: 'Northern Basin and Range',
};

function deriveIneligibleReason(
  geoid: string,
  action: ActionRecord,
  crosswalk: CrosswalkRow[],
): string {
  const countyEcoregionCodes = [
    ...new Set(
      crosswalk
        .filter(r => r.geoid === geoid && r.ecoregion_area_share > 0.15)
        .map(r => Number(r.ecoregion_code)),
    ),
  ];
  const applicable = (action.applicable_ecoregions ?? []).map(Number);
  if (applicable.length > 0) {
    const hasMatch = countyEcoregionCodes.some(code => applicable.includes(code));
    if (!hasMatch) {
      const names = applicable.map((code: number) => ECOREGION_NAMES[code] ?? `Ecoregion ${code}`);
      return `Outside ${names.join(', ')}`;
    }
  }
  if (action.bucket === 'energy_demand') return 'BA not served by this action type';
  return 'Not eligible for this action';
}

// ── Ghost cursor icon ─────────────────────────────────────────────────────────

interface GhostCursorProps {
  x: number;
  y: number;
  snapping: boolean;
  snapName?: string;
}

function GhostCursor({ x, y, snapping, snapName }: GhostCursorProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 80,
      }}
    >
      {/* Outer ring */}
      <div style={{
        width: snapping ? 28 : 18,
        height: snapping ? 28 : 18,
        borderRadius: '50%',
        border: `2px solid ${snapping ? 'var(--amber)' : 'var(--teal)'}`,
        background: snapping ? 'rgba(245,158,11,0.15)' : 'rgba(45,212,191,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
        boxShadow: snapping
          ? '0 0 12px rgba(245,158,11,0.6)'
          : '0 0 8px rgba(45,212,191,0.4)',
      }}>
        {/* Center dot */}
        <div style={{
          width: 4, height: 4, borderRadius: '50%',
          background: snapping ? 'var(--amber)' : 'var(--teal)',
        }} />
      </div>
      {/* Crosshair lines */}
      <div style={{
        position: 'absolute', top: '50%', left: -8,
        width: snapping ? 44 : 34, height: 1,
        background: snapping ? 'var(--amber)' : 'var(--teal)',
        opacity: 0.6, transform: 'translateY(-50%)',
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: -8,
        width: 1, height: snapping ? 44 : 34,
        background: snapping ? 'var(--amber)' : 'var(--teal)',
        opacity: 0.6, transform: 'translateX(-50%)',
      }} />
      {/* Snap label */}
      {snapping && snapName && (
        <div style={{
          position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(245,158,11,0.9)', color: '#0d1117',
          fontSize: 9, padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)', fontWeight: 600,
        }}>
          ⬡ {snapName}
        </div>
      )}
    </div>
  );
}

// ── Nudge toast ───────────────────────────────────────────────────────────────

interface NudgeToastProps { message: string }

function NudgeToast({ message }: NudgeToastProps) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(248,113,113,0.9)', color: '#fff',
      fontSize: 11, padding: '6px 14px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontWeight: 500,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      pointerEvents: 'none', zIndex: 200,
      animation: 'nudge-fade 3s ease forwards',
    }}>
      {message}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface PlacementOverlayProps {
  map: maplibregl.Map;
}

export function PlacementOverlay({ map }: PlacementOverlayProps) {
  const placementMode = useTerraStore(s => s.placementMode);
  const gameYear = useTerraStore(s => s.engineState.year);
  const engineState = useTerraStore(s => s.engineState);
  const exitPlacementMode = useTerraStore(s => s.exitPlacementMode);
  const confirmPlacement = useTerraStore(s => s.confirmPlacement);
  const remainingBudget = useTerraStore(s => s.remainingBudget);
  const setHudOpenChip = useTerraStore(s => s.setHudOpenChip);
  const setPlacementPin = useTerraStore(s => s.setPlacementPin);
  const setGhostCursorCoords = useTerraStore(s => s.setGhostCursorCoords);
  const setPlacementZoomAbove = useTerraStore(s => s.setPlacementZoomAbove);

  const [showModal, setShowModal] = useState<{ geoid: string } | null>(null);
  const [modalMagnitude, setModalMagnitude] = useState(100);
  const [ineligibleHover, setIneligibleHover] = useState<{ x: number; y: number; geoid: string } | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);
  const [ghostScreenPos, setGhostScreenPos] = useState<{ x: number; y: number } | null>(null);

  const initialized = useRef(false);
  const ghostRef = useRef<string | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to avoid stale closures
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;
  const engineStateRef = useRef(engineState);
  engineStateRef.current = engineState;

  // ── Layer setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (initialized.current || !map.getSource('counties')) return;
    initialized.current = true;

    map.addLayer({ id: INELIGIBLE_FILL, type: 'fill', source: 'counties',
      paint: { 'fill-color': '#0d1117', 'fill-opacity': 0.6 } });
    map.addLayer({ id: ELIGIBLE_FILL, type: 'fill', source: 'counties',
      paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.2 },
      filter: ['==', ['get', 'GEOID'], ''] });
    map.addLayer({ id: ELIGIBLE_BORDER, type: 'line', source: 'counties',
      paint: { 'line-color': '#2dd4bf', 'line-width': 1.5 },
      filter: ['==', ['get', 'GEOID'], ''] });
    map.addLayer({ id: GHOST_FILL, type: 'fill', source: 'counties',
      paint: { 'fill-color': '#2dd4bf', 'fill-opacity': 0.4, 'fill-outline-color': '#2dd4bf' },
      filter: ['==', ['get', 'GEOID'], ''] });

    return () => {
      [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      initialized.current = false;
    };
  }, [map]);

  // ── Zoom threshold tracking ────────────────────────────────────────────────

  useEffect(() => {
    const onZoom = () => {
      const above = map.getZoom() >= PIN_ZOOM_THRESHOLD;
      setPlacementZoomAbove(above);
    };
    map.on('zoom', onZoom);
    // Initialise immediately
    onZoom();
    return () => { map.off('zoom', onZoom); };
  }, [map, setPlacementZoomAbove]);

  // ── Ghost cursor + snap (above zoom threshold) ────────────────────────────

  useEffect(() => {
    if (!placementMode) {
      setGhostScreenPos(null);
      return;
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const pm = placementModeRef.current;
      if (!pm || !pm.zoomAboveThreshold) {
        setGhostScreenPos(null);
        return;
      }

      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const snap = findSnapTarget(lngLat, engineStateRef.current);

      if (snap) {
        // Project snap target coords to screen
        const pt = map.project(snap.coords as maplibregl.LngLatLike);
        setGhostScreenPos({ x: pt.x, y: pt.y });
        setPlacementPin(snap.coords, snap);
        setGhostCursorCoords(snap.coords);
      } else {
        setGhostScreenPos({ x: e.point.x, y: e.point.y });
        setPlacementPin(null, null);
        setGhostCursorCoords(lngLat);
      }
    };

    const handleMouseLeave = () => {
      setGhostScreenPos(null);
      setGhostCursorCoords(null);
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseLeave);
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseLeave);
    };
  }, [map, placementMode, setPlacementPin, setGhostCursorCoords]);

  // ── Nudge helper ───────────────────────────────────────────────────────────

  const showNudge = useCallback((msg: string) => {
    setNudgeMessage(msg);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgeMessage(null), 3000);
  }, []);

  // ── Ineligible county hover ────────────────────────────────────────────────

  useEffect(() => {
    const handleIneligibleMove = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const pm = placementModeRef.current;
      if (!pm || !e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (pm.eligibleGeoids.has(geoid)) return;
      setIneligibleHover({ x: e.point.x, y: e.point.y, geoid });
    };
    const handleIneligibleLeave = () => setIneligibleHover(null);
    map.on('mousemove', INELIGIBLE_FILL, handleIneligibleMove);
    map.on('mouseleave', INELIGIBLE_FILL, handleIneligibleLeave);
    return () => {
      map.off('mousemove', INELIGIBLE_FILL, handleIneligibleMove);
      map.off('mouseleave', INELIGIBLE_FILL, handleIneligibleLeave);
    };
  }, [map]);

  // ── Click handling (zoom-aware) ────────────────────────────────────────────

  useEffect(() => {
    setIneligibleHover(null);
    if (!placementMode) {
      [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      return;
    }

    const eligible = Array.from(placementMode.eligibleGeoids);
    setModalMagnitude(placementMode.magnitude);

    [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    });

    const eligibleFilter: maplibregl.FilterSpecification =
      eligible.length > 0
        ? ['in', ['get', 'GEOID'], ['literal', eligible]]
        : ['==', ['get', 'GEOID'], ''];

    const ineligibleFilter: maplibregl.FilterSpecification =
      eligible.length > 0
        ? ['!', ['in', ['get', 'GEOID'], ['literal', eligible]]]
        : ['!=', ['get', 'GEOID'], ''];

    if (map.getLayer(ELIGIBLE_FILL)) map.setFilter(ELIGIBLE_FILL, eligibleFilter);
    if (map.getLayer(ELIGIBLE_BORDER)) map.setFilter(ELIGIBLE_BORDER, eligibleFilter);
    if (map.getLayer(INELIGIBLE_FILL)) map.setFilter(INELIGIBLE_FILL, ineligibleFilter);

    // ── Above-threshold click: exact coords + PiP ──────────────────────────
    const handlePreciseClick = (e: maplibregl.MapMouseEvent) => {
      const pm = placementModeRef.current;
      if (!pm || !pm.zoomAboveThreshold) return;

      // Determine county via rendered features (MapLibre spatial index)
      const features = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER] });
      const clickedGeoid = features[0]?.properties?.GEOID
        ? String(features[0].properties.GEOID)
        : null;

      if (!clickedGeoid || !pm.eligibleGeoids.has(clickedGeoid)) {
        // Outside eligible county — nudge
        const countyCards = engineStateRef.current.county_cards as Record<string, { county_name?: string }>;
        const nearestEligible = eligible[0];
        const nearestName = nearestEligible
          ? (countyCards[nearestEligible]?.county_name ?? nearestEligible)
          : 'an eligible county';
        showNudge(`outside ${clickedGeoid
          ? (countyCards[clickedGeoid]?.county_name ?? clickedGeoid)
          : 'county boundary'} — pin must be in ${nearestName}`);
        return;
      }

      // Determine pin coords: snap if active, otherwise exact click
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const snap = findSnapTarget(lngLat, engineStateRef.current);
      const pinCoords = snap ? snap.coords : lngLat;
      setPlacementPin(pinCoords, snap ?? null);
      setShowModal({ geoid: clickedGeoid });
    };

    // ── Below-threshold click: county-level (existing behaviour) ──────────
    const handleCountyClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const pm = placementModeRef.current;
      if (!pm || pm.zoomAboveThreshold) return; // precise handler takes over above threshold
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (!pm.eligibleGeoids.has(geoid)) return;
      // No pin coords at county level — existing flow
      setPlacementPin(null, null);
      setShowModal({ geoid });
    };

    const handleEligibleHover = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const pm = placementModeRef.current;
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (!pm || !pm.eligibleGeoids.has(geoid)) {
        ghostRef.current = null;
        if (map.getLayer(GHOST_FILL)) map.setFilter(GHOST_FILL, ['==', ['get', 'GEOID'], '']);
        return;
      }
      setIneligibleHover(null);
      if (!pm.zoomAboveThreshold && ghostRef.current !== geoid) {
        ghostRef.current = geoid;
        if (map.getLayer(GHOST_FILL)) map.setFilter(GHOST_FILL, ['==', ['get', 'GEOID'], geoid]);
      }
    };

    // Precise click fires on the whole map canvas
    map.on('click', handlePreciseClick);
    // County-level click fires on ELIGIBLE_FILL only (below threshold)
    map.on('click', ELIGIBLE_FILL, handleCountyClick);
    map.on('mousemove', ELIGIBLE_FILL, handleEligibleHover);

    return () => {
      map.off('click', handlePreciseClick);
      map.off('click', ELIGIBLE_FILL, handleCountyClick);
      map.off('mousemove', ELIGIBLE_FILL, handleEligibleHover);
    };
  }, [map, placementMode, showNudge, setPlacementPin]);

  // ── Derive helpers ─────────────────────────────────────────────────────────

  const ineligibleReason =
    ineligibleHover && placementMode
      ? deriveIneligibleReason(ineligibleHover.geoid, placementMode.action, engineState.crosswalk)
      : null;

  const countyCards = engineState.county_cards as Record<string, { county_name?: string; state?: string }>;

  const isSnapping = !!placementMode?.snapTarget;
  const snapName = placementMode?.snapTarget?.name ?? undefined;

  return (
    <>
      {/* ── Nudge toast ── */}
      {nudgeMessage && <NudgeToast message={nudgeMessage} />}

      {/* ── Ghost cursor (above zoom threshold only) ── */}
      {placementMode?.zoomAboveThreshold && ghostScreenPos && !showModal && (
        <GhostCursor
          x={ghostScreenPos.x}
          y={ghostScreenPos.y}
          snapping={isSnapping}
          snapName={isSnapping ? snapName : undefined}
        />
      )}

      {/* ── Ineligible county reason tooltip ── */}
      {ineligibleHover && ineligibleReason && (
        <Tooltip
          x={ineligibleHover.x}
          y={ineligibleHover.y}
          geoid={ineligibleHover.geoid}
          engineState={engineState}
          activeMetric="E"
          countyCards={countyCards}
          reason={ineligibleReason}
        />
      )}

      {/* ── Placement modal ── */}
      {placementMode && showModal && (() => {
        const { action } = placementMode;
        const agPreviewModal = getAgPlacementPreview(engineState, action.action_id ?? '', showModal.geoid, modalMagnitude);
        const agBlocked = agPreviewModal?.blocked ?? false;
        const unitScale = action.unit_scale ?? 100;
        const unitLabel = action.unit_label ?? 'units';
        const ttd = action.time_to_deploy ?? 2;
        const consumption = computeConsumption(action, modalMagnitude);
        const budgetStrings = getBudgetShareString(consumption, remainingBudget);
        const overflow = isEraOverflow(consumption, remainingBudget);
        const currentEra = getEraForYear(gameYear);
        const currentEraName = ERA_NAMES[currentEra.era_start] ?? `Era ${currentEra.era_start}–${currentEra.era_end}`;
        const nextEraStart = currentEra.era_end;

        const bindingResource = overflow.resources.reduce((worst, res) => {
          const budgetMap: Record<string, { c: number; r: number }> = {
            capital: { c: consumption.capital_cost_usd, r: remainingBudget.capital_cost_usd },
            labor: { c: consumption.labor_years, r: remainingBudget.labor_years },
            steel: { c: consumption.steel_tons, r: remainingBudget.steel_tons },
            concrete: { c: consumption.concrete_tons, r: remainingBudget.concrete_tons },
            HALEU: { c: consumption.HALEU_kg, r: remainingBudget.HALEU_kg },
            'transmission ROW': { c: consumption.transmission_row_miles, r: remainingBudget.transmission_row_miles },
          };
          const cur = budgetMap[res];
          const curPct = cur ? (cur.c - cur.r) / Math.max(cur.r, 1) : 0;
          if (!worst) return { res, pct: curPct };
          const prev = budgetMap[worst.res];
          const prevPct = prev ? (prev.c - prev.r) / Math.max(prev.r, 1) : 0;
          return curPct > prevPct ? { res, pct: curPct } : worst;
        }, null as { res: string; pct: number } | null);

        // F3: pin info for snap disclosure in modal header
        const pinLabel = placementMode.pinCoords
          ? placementMode.snapTarget
            ? `pinned → ${placementMode.snapTarget.name}`
            : `pinned ${placementMode.pinCoords[0].toFixed(2)}, ${placementMode.pinCoords[1].toFixed(2)}`
          : null;

        return (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(13, 17, 23, 0.6)', zIndex: 100,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowModal(null); }}
          >
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 24, width: 340,
              fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {action.bucket ?? action.category}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>
                  {action.action_name ?? action.label ?? action.action_id}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  County: {showModal.geoid}
                </div>
                {/* F3: pin / snap disclosure */}
                {pinLabel && (
                  <div style={{
                    fontSize: 10, marginTop: 4,
                    color: placementMode.snapTarget ? 'var(--amber)' : 'var(--teal)',
                  }}>
                    {placementMode.snapTarget
                      ? `⬡ snapped to ${placementMode.snapTarget.type === 'site' ? 'site' : 'anchor'}`
                      : '📍'} {pinLabel}
                  </div>
                )}
                {/* Snap succession discount reminder */}
                {placementMode.snapTarget?.type === 'site' && (
                  <div style={{
                    marginTop: 4, padding: '4px 8px',
                    background: 'rgba(45,212,191,0.05)',
                    border: '1px solid var(--teal-dim)',
                    borderRadius: 3, fontSize: 9, color: 'var(--teal)',
                  }}>
                    Site succession discount applies — TTD, capex, TX waiver itemized below.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  MAGNITUDE
                </label>
                <input
                  type="range"
                  min={unitScale / 10} max={unitScale * 5} step={unitScale / 10}
                  value={modalMagnitude}
                  onChange={(e) => setModalMagnitude(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--teal)' }}
                />
                <div style={{ fontSize: 13, color: 'var(--teal)', marginTop: 4 }}>
                  {modalMagnitude.toFixed(0)} {unitLabel} — Deploy time: {ttd} yr
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Operational: {gameYear + ttd}
                </div>
              </div>

              {budgetStrings.length > 0 && (
                <div style={{ marginBottom: 16, fontSize: 11 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>ERA RESOURCE USAGE</div>
                  {budgetStrings.map((s, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)', padding: '1px 0' }}>{s}</div>
                  ))}
                </div>
              )}

              {/* Impact preview card */}
              {(() => {
                const geoid = showModal.geoid;
                const card = engineState.county_cards[geoid] as {
                  county_name?: string; state?: string; employment?: number;
                } | undefined;
                const isWY = card?.state === 'WY';
                const geoidPadded = geoid.padStart(5, '0');
                const cf = isWY ? (engineState.county_fiscal[geoidPadded] as CountyFiscal | undefined) : undefined;

                const rates = JOBS_PER_MW[action.action_id ?? ''];
                const constructionJobs = rates ? rates.c * modalMagnitude : 0;
                const operationsJobs = rates ? rates.o * modalMagnitude : 0;
                const laborForce = card?.employment ?? 0;
                const jobsPctLF = laborForce > 0 ? constructionJobs / laborForce : 0;
                const housingFlag = jobsPctLF >= HOUSING_PRESSURE_THRESHOLD;

                const fiscalDelta = cf ? computeFiscalDelta(engineState, action.action_id ?? '', geoid, modalMagnitude) : null;
                const propTaxDelta = fiscalDelta?.property_tax_delta ?? null;
                const ledgerCDelta = fiscalDelta?.ledger_c_delta ?? null;
                const ledgerADelta = fiscalDelta?.ledger_a_delta ?? null;
                const netFiscalDelta = fiscalDelta
                  ? fiscalDelta.property_tax_delta + fiscalDelta.sales_use_delta +
                    fiscalDelta.ledger_a_delta + fiscalDelta.ledger_b_delta + fiscalDelta.ledger_c_delta
                  : null;

                const showFiscal = isWY && (netFiscalDelta != null && netFiscalDelta !== 0);
                const hasFirmMw = (action.bucket ?? action.category) === 'energy_generation';

                const era = getEraForYear(gameYear);
                const eraPoolShares: { label: string; pct: number }[] = [];
                if (consumption.capital_cost_usd > 0) {
                  const pct = era.capital_cost_usd > 0 ? consumption.capital_cost_usd / era.capital_cost_usd : 0;
                  eraPoolShares.push({ label: 'Capital', pct });
                }
                if (consumption.labor_years > 0) {
                  const pct = era.labor_years > 0 ? consumption.labor_years / era.labor_years : 0;
                  eraPoolShares.push({ label: 'Labor', pct });
                }

                const fmt$ = (v: number) => {
                  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
                  const abs = Math.abs(v);
                  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
                  return `${sign}$${Math.round(abs)}`;
                };

                if (constructionJobs === 0 && !showFiscal) return null;

                const cellLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 };
                const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderTop: '1px solid var(--border)', fontSize: 11 };

                return (
                  <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(45, 212, 191, 0.05)', border: '1px solid var(--teal-dim)', borderRadius: 4, fontSize: 11 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}><div style={cellLabel}>This county</div></div>
                      <div style={{ flex: 1 }}><div style={cellLabel}>Era budget share</div></div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        {constructionJobs > 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Construction jobs
                              {housingFlag && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>⚠</span>}
                            </span>
                            <span style={{ color: housingFlag ? 'var(--amber)' : 'var(--construction)' }}>
                              {Math.round(constructionJobs)}
                              {laborForce > 0 && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                                  ({(jobsPctLF * 100).toFixed(1)}% LF)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {operationsJobs > 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Ops jobs at comm.</span>
                            <span style={{ color: 'var(--teal)' }}>{Math.round(operationsJobs)} FTE</span>
                          </div>
                        )}
                        {hasFirmMw && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Firm capacity</span>
                            <span style={{ color: 'var(--teal)' }}>+{modalMagnitude.toFixed(0)} MW</span>
                          </div>
                        )}
                        {showFiscal && netFiscalDelta != null && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Δ revenue/yr</span>
                            <span style={{ color: netFiscalDelta >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>{fmt$(netFiscalDelta)}</span>
                          </div>
                        )}
                        {showFiscal && propTaxDelta != null && propTaxDelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ Property tax Δ</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{fmt$(propTaxDelta)}</span>
                          </div>
                        )}
                        {showFiscal && ledgerADelta != null && ledgerADelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ Ad valorem Δ (A)</span>
                            <span style={{ color: ledgerADelta >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>{fmt$(ledgerADelta)}</span>
                          </div>
                        )}
                        {showFiscal && ledgerCDelta != null && ledgerCDelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ School finance Δ (C)</span>
                            <span style={{ color: ledgerCDelta >= 0 ? 'var(--teal)' : 'var(--deficit)', fontWeight: 500 }}>
                              {fmt$(ledgerCDelta)}
                            </span>
                          </div>
                        )}
                        {showFiscal && ledgerCDelta != null && ledgerCDelta !== 0 && ledgerADelta != null && (
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                            Ledger C can diverge from A in sign — see methods.
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        {eraPoolShares.map(p => (
                          <div key={p.label} style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>{p.label}</span>
                            <span style={{ color: p.pct > 0.2 ? 'var(--warning)' : 'var(--text-primary)' }}>
                              {(p.pct * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                        {eraPoolShares.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>No era budget impact</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Ag competition preview (placement-time, engine pass-through) ── */}
              {(() => {
                const fmt$ = (v: number) => {
                  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
                  const abs = Math.abs(v);
                  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
                  return `${sign}$${Math.round(abs)}`;
                };
                const agPreview = agPreviewModal;
                if (!agPreview) return null;
                if (agPreview.converted_acres === 0 && agPreview.shared_acres === 0) return null;

                const fmtAc = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k ac` : `${Math.round(v)} ac`;
                const fmtAum = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k AUM` : `${Math.round(v)} AUM`;
                const fmtAfWater = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k AF` : `${Math.round(v)} AF`;

                const rowSty: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderTop: '1px solid var(--border)', fontSize: 10 };
                const indentSty: React.CSSProperties = { color: 'var(--text-muted)', paddingLeft: 8, fontSize: 9 };

                const sources = agPreview.conversion_sources;
                const hasNonOther = sources.private_rangeland > 0 || sources.dry_crop > 0 || sources.irrigated_crop > 0;
                const aumDelta = agPreview.aum_after - agPreview.aum_before;
                const valueDelta = agPreview.industrial_valuation_added_usd != null
                  ? agPreview.industrial_valuation_added_usd - agPreview.ag_valuation_removed_usd
                  : null;

                return (
                  <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(139, 92, 246, 0.05)', border: `1px solid ${agPreview.blocked ? 'var(--deficit)' : 'rgba(139,92,246,0.3)'}`, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Ag competition preview
                      <span style={{ float: 'right', color: 'var(--text-muted)', fontSize: 8 }}>engine · zero UI arithmetic</span>
                    </div>

                    {agPreview.blocked && (
                      <div style={{ color: 'var(--deficit)', fontSize: 10, marginBottom: 6, padding: '4px 6px', background: 'rgba(248,113,113,0.1)', borderRadius: 3 }}>
                        {agPreview.blocked_reason}
                      </div>
                    )}

                    {/* Converted acres by source class */}
                    {agPreview.converted_acres > 0 && (
                      <>
                        <div style={rowSty}>
                          <span style={{ color: 'var(--text-secondary)' }}>Converted (permanent)</span>
                          <span style={{ color: 'var(--deficit)' }}>
                            {fmtAc(agPreview.converted_acres)} / {fmtAc(Object.values(agPreview.current_land_by_class).reduce((a, b) => a + b, 0))} total
                          </span>
                        </div>
                        {sources.other > 0 && <div style={rowSty}><span style={indentSty}>↳ other land</span><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{fmtAc(sources.other)}</span></div>}
                        {sources.private_rangeland > 0 && <div style={rowSty}><span style={{ ...indentSty, color: 'var(--warning)' }}>↳ rangeland</span><span style={{ color: 'var(--warning)', fontSize: 10 }}>{fmtAc(sources.private_rangeland)} / {fmtAc(agPreview.current_land_by_class.private_rangeland)}</span></div>}
                        {sources.dry_crop > 0 && <div style={rowSty}><span style={{ ...indentSty, color: 'var(--amber)' }}>↳ dry cropland</span><span style={{ color: 'var(--amber)', fontSize: 10 }}>{fmtAc(sources.dry_crop)} / {fmtAc(agPreview.current_land_by_class.dry_crop)}</span></div>}
                        {sources.irrigated_crop > 0 && <div style={rowSty}><span style={{ ...indentSty, color: 'var(--deficit)' }}>↳ irrigated crop</span><span style={{ color: 'var(--deficit)', fontSize: 10 }}>{fmtAc(sources.irrigated_crop)} / {fmtAc(agPreview.current_land_by_class.irrigated_crop)}</span></div>}
                      </>
                    )}

                    {/* Shared acres (dual-use, not consumed) */}
                    {agPreview.shared_acres > 0 && (
                      <div style={rowSty}>
                        <span style={{ color: 'var(--text-secondary)' }}>Shared (not consumed)</span>
                        <span style={{ color: 'var(--teal)' }}>{fmtAc(agPreview.shared_acres)}</span>
                      </div>
                    )}

                    {/* Valuation asymmetry */}
                    <div style={{ marginTop: 4 }}>
                      <div style={rowSty}>
                        <span style={{ color: 'var(--text-secondary)' }}>Ag valuation removed</span>
                        <span style={{ color: agPreview.ag_valuation_removed_usd > 0 ? 'var(--deficit)' : 'var(--text-muted)' }}>
                          {agPreview.ag_valuation_removed_usd > 0 ? fmt$(agPreview.ag_valuation_removed_usd) : '—'} / {fmt$(agPreview.current_ag_valuation_total_usd)}
                        </span>
                      </div>
                      {agPreview.industrial_valuation_added_usd != null && (
                        <div style={rowSty}>
                          <span style={{ color: 'var(--text-secondary)' }}>Industrial valuation added</span>
                          <span style={{ color: 'var(--teal)' }}>{fmt$(agPreview.industrial_valuation_added_usd)}</span>
                        </div>
                      )}
                      {valueDelta != null && (
                        <div style={{ ...rowSty, fontWeight: 500 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>Net Δ (asymmetry)</span>
                          <span style={{ color: valueDelta >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>{fmt$(valueDelta)}</span>
                        </div>
                      )}
                    </div>

                    {/* AUM impact */}
                    {(aumDelta !== 0 || hasNonOther) && (
                      <div style={rowSty}>
                        <span style={{ color: 'var(--text-secondary)' }}>AUM affected</span>
                        <span style={{ color: aumDelta < 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {fmtAum(agPreview.aum_before)} → {fmtAum(agPreview.aum_after)}
                          {aumDelta !== 0 && <span style={{ marginLeft: 4, color: aumDelta < 0 ? 'var(--warning)' : 'var(--teal)' }}>({aumDelta > 0 ? '+' : ''}{fmtAum(aumDelta)})</span>}
                        </span>
                      </div>
                    )}

                    {/* Water */}
                    {agPreview.water_county_supply_af > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={rowSty}>
                          <span style={{ color: 'var(--text-secondary)' }}>Ag diversion</span>
                          <span style={{ color: 'var(--text-muted)' }}>{fmtAfWater(agPreview.water_diversion_af)} / {fmtAfWater(agPreview.water_county_supply_af)}</span>
                        </div>
                        <div style={rowSty}>
                          <span style={{ color: 'var(--text-secondary)' }}>Ag consumptive</span>
                          <span style={{ color: 'var(--text-muted)' }}>{fmtAfWater(agPreview.water_consumptive_af)}</span>
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                          Return flow = diversion − consumptive; reallocation from this placement is not consumptive.
                        </div>
                      </div>
                    )}

                    {/* Debug provenance */}
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 8, color: 'var(--text-muted)', cursor: 'pointer' }}>Debug provenance</summary>
                      <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                        schema: {agPreview.provenance.schema_version} · vintage: {agPreview.provenance.vintage}<br />
                        federal AUM proxy: {String(agPreview.provenance.federal_aum_is_proxy)} · water proxy: {String(agPreview.provenance.water_is_proxy)}<br />
                        draw priority: {agPreview.provenance.land_conversion_priority.join(' → ')}
                      </div>
                    </details>
                  </div>
                );
              })()}

              {showModal && (
                <DeltaProjectionStrip
                  actionId={action.action_id ?? ''}
                  geoid={showModal.geoid}
                  magnitude={modalMagnitude}
                />
              )}

              {overflow.overflows && bindingResource && (
                <div style={{ marginBottom: 16, padding: '8px 10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', borderRadius: 4, fontSize: 11 }}>
                  <div style={{ color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>
                    {bindingResource.res.charAt(0).toUpperCase() + bindingResource.res.slice(1)} pool exhausted for {currentEraName}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    This build is scheduled to begin {nextEraStart}.
                    {overflow.resources.length > 1 && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                        Also constrained: {overflow.resources.filter(r => r !== bindingResource.res).join(', ')}.
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { const chipKey = RESOURCE_TO_CHIP[bindingResource.res] ?? bindingResource.res; setHudOpenChip(chipKey); }}
                    style={{ marginTop: 6, background: 'transparent', border: 'none', color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    View {bindingResource.res} pool breakdown ↑
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  disabled={agBlocked}
                  onClick={() => { if (!agBlocked) { confirmPlacement(showModal.geoid, modalMagnitude); setShowModal(null); } }}
                  style={{ flex: 1, padding: '8px 0', background: agBlocked ? 'var(--border)' : 'var(--teal-dim)', color: agBlocked ? 'var(--text-muted)' : 'var(--text-primary)', border: 'none', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: agBlocked ? 'not-allowed' : 'pointer', opacity: agBlocked ? 0.5 : 1 }}
                  title={agBlocked ? (agPreviewModal?.blocked_reason ?? 'Placement blocked') : undefined}
                >
                  {agBlocked ? 'Blocked' : 'Confirm'}
                </button>
                <button
                  onClick={() => { setShowModal(null); exitPlacementMode(); }}
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
