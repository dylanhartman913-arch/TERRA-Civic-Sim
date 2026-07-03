import { useEffect, useMemo, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { EngineState } from '../../engine/types.js';
import type { ActiveMetric } from '../../state/store.js';
import { useTerraStore } from '../../state/store.js';
import countiesGeoJson from '../../data/counties.geojson';
import { JOBS_PER_MW } from '../panels/CountyYields.js';

const SOURCE_ID = 'counties';
const FILL_LAYER = 'county-fill';
const BORDER_LAYER = 'county-border';
const HOVER_LAYER = 'county-hover';
const HINT_LAYER = 'county-hint-glow';
const POOL_LAYER = 'county-pool-highlight';

// Choropleth: 5-step sequential scale
const CHORO = [
  '#0d1117',
  '#0d3d38',
  '#0d6b5e',
  '#0d9488',
  '#2dd4bf',
  '#99f6e4',
];

// Diverging: surplus (green) → neutral → deficit (red), 5 stops
const CAPACITY_DIVERGE = [
  '#f87171', // heavy deficit
  '#fbbf24', // slight deficit
  '#484f58', // neutral
  '#34d399', // surplus
  '#99f6e4', // heavy surplus
];

function metricValue(
  ees: EngineState['county_ees'][string],
  metric: ActiveMetric,
  baseLoad: number,
  geoid?: string,
  engineState?: EngineState,
): number {
  if (metric === 'E') return ees.E;
  if (metric === 'Ec') return ees.Ec;
  if (metric === 'S') return ees.S;
  if (metric === 'firm_capacity_margin') {
    const cap = ees.added_firm_mw;
    const load = ees.load_mw;
    if (cap + load === 0) return 0;
    return (cap - load) / Math.max(cap + load, 1);
  }
  if (metric === 'load_growth') {
    return ees.load_mw - baseLoad;
  }
  if (!geoid || !engineState) return 0;

  if (metric === 'delta_jobs') {
    const countyBuilds = engineState.build_queue.filter(b => b.geoid === geoid && b.commissioned);
    const card = engineState.county_cards[geoid] as { employment?: number } | undefined;
    const laborForce = card?.employment ?? 0;
    if (laborForce === 0) return 0;
    let opsJobs = 0;
    for (const b of countyBuilds) {
      const rates = JOBS_PER_MW[b.action_id];
      if (rates) opsJobs += rates.o * b.magnitude;
    }
    return opsJobs / laborForce;
  }

  if (metric === 'delta_revenue') {
    const card = engineState.county_cards[geoid] as { state?: string } | undefined;
    if (card?.state !== 'WY') return 0;
    const geoidPadded = geoid.padStart(5, '0');
    const cf = engineState.county_fiscal[geoidPadded];
    if (!cf) return 0;
    const ptDelta = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
    const suDelta = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
    const netDelta = ptDelta + suDelta + cf.ledger_a_cumulative_delta + cf.ledger_b_cumulative_delta + cf.ledger_c_cumulative_delta;
    // Baseline revenue for normalization
    const baselineAdv = cf.advalorem_production - cf.ledger_a_cumulative_delta;
    const baseSev = cf.severance_share - cf.ledger_b_cumulative_delta;
    const baseSF  = cf.school_finance_net - cf.ledger_c_cumulative_delta;
    const basePT  = cf.property_tax - ptDelta;
    const baseSU  = cf.sales_use - suDelta;
    const baselineTotal = baselineAdv + baseSev + baseSF + basePT + baseSU + cf.federal_royalty_share + cf.pilt;
    return baselineTotal !== 0 ? netDelta / Math.abs(baselineTotal) : 0;
  }

  if (metric === 'construction_activity') {
    return engineState.build_queue.filter(b => b.geoid === geoid && !b.commissioned).length;
  }

  return 0;
}

function colorForValue(val: number, metric: ActiveMetric, min: number, max: number): string {
  if (metric === 'firm_capacity_margin') {
    // -1 to +1, center 0
    const t = Math.max(-1, Math.min(1, val));
    const idx = Math.round(((t + 1) / 2) * (CAPACITY_DIVERGE.length - 1));
    return CAPACITY_DIVERGE[idx];
  }
  if (metric === 'load_growth') {
    // amber scale
    const range = max - min || 1;
    const t = Math.max(0, Math.min(1, (val - min) / range));
    const r = Math.round(13 + t * (245 - 13));
    const g = Math.round(17 + t * (158 - 17));
    const b = Math.round(23 + t * (11 - 23));
    return `rgb(${r},${g},${b})`;
  }
  if (metric === 'delta_revenue') {
    // Diverging: red → gray → teal centered on 0
    const t = Math.max(-1, Math.min(1, val));
    const idx = Math.round(((t + 1) / 2) * (CAPACITY_DIVERGE.length - 1));
    return CAPACITY_DIVERGE[idx];
  }
  if (metric === 'delta_jobs') {
    // Teal sequential: 0 = dark, high = bright
    const range = max - min || 1;
    const t = Math.max(0, Math.min(1, (val - min) / range));
    const idx = Math.round(t * (CHORO.length - 1));
    return CHORO[idx];
  }
  if (metric === 'construction_activity') {
    // Amber sequential: 0 = dark, more builds = amber
    if (val === 0) return '#0d1117';
    const range = max || 1;
    const t = Math.max(0, Math.min(1, val / range));
    const r = Math.round(13 + t * (245 - 13));
    const g = Math.round(17 + t * (158 - 17));
    const b = Math.round(23 + t * (11 - 23));
    return `rgb(${r},${g},${b})`;
  }
  // EES scale (0 to ~10 typical)
  const range = max - min || 1;
  const t = Math.max(0, Math.min(1, (val - min) / range));
  const idx = Math.round(t * (CHORO.length - 1));
  return CHORO[idx];
}

interface CountyLayerProps {
  map: maplibregl.Map;
  engineState: EngineState;
  activeMetric: ActiveMetric;
  onTooltip: (state: { x: number; y: number; geoid: string } | null) => void;
}

export function CountyLayer({ map, engineState, activeMetric, onTooltip }: CountyLayerProps) {
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const setHoveredGeoid = useTerraStore(s => s.setHoveredGeoid);
  const activeCampaign = useTerraStore(s => s.activeCampaign);
  const campaignAct = useTerraStore(s => s.campaignAct);
  const campaignHintIndex = useTerraStore(s => s.campaignHintIndex);
  const poolHighlightGeoids = useTerraStore(s => s.poolHighlightGeoids);
  const hoveredRef = useRef<string | null>(null);
  const initialized = useRef(false);

  // Compute color lookup table keyed by GEOID
  const colorTable = useMemo(() => {
    const vals = Object.entries(engineState.county_ees).map(([geoid, ees]) =>
      metricValue(ees, activeMetric, ees.load_mw, geoid, engineState)
    );
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    const table: Record<string, string> = {};
    for (const [geoid, ees] of Object.entries(engineState.county_ees)) {
      const val = metricValue(ees, activeMetric, ees.load_mw, geoid, engineState);
      table[geoid] = colorForValue(val, activeMetric, min, max);
    }
    return table;
  }, [engineState, activeMetric]);

  // Build MapLibre match expression from color table — <16ms via setPaintProperty
  const fillColorExpr = useMemo<maplibregl.ExpressionSpecification>(() => {
    const expr: unknown[] = ['match', ['get', 'GEOID']];
    for (const [geoid, color] of Object.entries(colorTable)) {
      expr.push(geoid, color);
    }
    expr.push('#161b22'); // default for unmatched
    return expr as maplibregl.ExpressionSpecification;
  }, [colorTable]);

  // Initialize source + layers once
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: countiesGeoJson as unknown as maplibregl.GeoJSONSourceSpecification['data'],
      promoteId: 'GEOID',
    });

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      maxzoom: 10,
      paint: {
        'fill-color': '#0d3d38',
        'fill-opacity': 0.75,
      },
    });

    map.addLayer({
      id: BORDER_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#30363d',
        'line-width': 0.5,
      },
    });

    map.addLayer({
      id: HOVER_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#2dd4bf',
        'line-width': ['case', ['boolean', ['feature-state', 'hovered'], false], 2.5, 0],
      },
    });

    map.addLayer({
      id: HINT_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#f59e0b',
        'line-width': 3,
        'line-opacity': 0,
      },
      filter: ['==', ['get', 'GEOID'], ''],
    });

    // Pool highlight: teal fill driven by ResourceHUD chip click
    map.addLayer({
      id: POOL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': '#2dd4bf', // var(--teal)
        'fill-opacity': 0,
      },
      filter: ['==', ['get', 'GEOID'], ''],
    });

    // Hover handling
    map.on('mousemove', FILL_LAYER, (e) => {
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (hoveredRef.current !== geoid) {
        if (hoveredRef.current) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredRef.current },
            { hovered: false }
          );
        }
        hoveredRef.current = geoid;
        map.setFeatureState({ source: SOURCE_ID, id: geoid }, { hovered: true });
        map.getCanvas().style.cursor = 'pointer';
        setHoveredGeoid(geoid);
      }
      onTooltip({ x: e.point.x, y: e.point.y, geoid });
    });

    map.on('mouseleave', FILL_LAYER, () => {
      if (hoveredRef.current) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredRef.current },
          { hovered: false }
        );
        hoveredRef.current = null;
      }
      map.getCanvas().style.cursor = '';
      setHoveredGeoid(null);
      onTooltip(null);
    });

    map.on('click', FILL_LAYER, (e) => {
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      setSelectedGeoid(geoid);
    });

    return () => {
      if (map.getLayer(POOL_LAYER)) map.removeLayer(POOL_LAYER);
      if (map.getLayer(HINT_LAYER)) map.removeLayer(HINT_LAYER);
      if (map.getLayer(HOVER_LAYER)) map.removeLayer(HOVER_LAYER);
      if (map.getLayer(BORDER_LAYER)) map.removeLayer(BORDER_LAYER);
      if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      initialized.current = false;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update choropleth color on metric/state change (< 16ms via setPaintProperty)
  useEffect(() => {
    if (!map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(FILL_LAYER, 'fill-color', fillColorExpr);
  }, [map, fillColorExpr]);

  // Pool highlight: teal fill on counties drawn from the selected pool
  useEffect(() => {
    if (!map.getLayer(POOL_LAYER)) return;
    if (poolHighlightGeoids && poolHighlightGeoids.length > 0) {
      map.setFilter(POOL_LAYER, ['in', ['get', 'GEOID'], ['literal', poolHighlightGeoids]]);
      map.setPaintProperty(POOL_LAYER, 'fill-opacity', 0.3);
    } else {
      map.setFilter(POOL_LAYER, ['==', ['get', 'GEOID'], '']);
      map.setPaintProperty(POOL_LAYER, 'fill-opacity', 0);
    }
  }, [map, poolHighlightGeoids]);

  // Amber hint glow on active campaign Act 3 target county
  useEffect(() => {
    if (!map.getLayer(HINT_LAYER)) return;
    const hints = activeCampaign?.acts?.['act_3']?.hints ?? [];
    const targetGeoid = campaignAct === 3 ? hints[campaignHintIndex]?.target_geoid : undefined;
    if (targetGeoid) {
      map.setFilter(HINT_LAYER, ['==', ['get', 'GEOID'], targetGeoid]);
      map.setPaintProperty(HINT_LAYER, 'line-opacity', 1);
    } else {
      map.setFilter(HINT_LAYER, ['==', ['get', 'GEOID'], '']);
      map.setPaintProperty(HINT_LAYER, 'line-opacity', 0);
    }
  }, [map, activeCampaign, campaignAct, campaignHintIndex]);

  return null;
}
