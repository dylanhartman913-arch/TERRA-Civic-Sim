import { useEffect, useMemo, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { EngineState } from '../../engine/types.js';

const SOURCE_ID = 'buses';
const CIRCLE_LAYER = 'bus-circles';

// Fuel type → CSS variable color (as hex for MapLibre)
const FUEL_COLORS: Record<string, string> = {
  coal:     '#92400e',
  NG:       '#6d28d9',
  nuclear:  '#2dd4bf',
  wind:     '#34d399',
  solar:    '#f59e0b',
  hydro:    '#3b82f6',
  storage:  '#a78bfa',
};
const DEFAULT_FUEL_COLOR = '#484f58';

function dominantFuelColor(fuelMix: Record<string, number>): string {
  let max = -1;
  let dom = '';
  for (const [f, v] of Object.entries(fuelMix)) {
    if (v > max) { max = v; dom = f; }
  }
  // Map common fuel codes
  if (dom === 'SUB' || dom === 'BIT' || dom === 'LIG') return FUEL_COLORS['coal'];
  if (dom === 'NG' || dom === 'GAS') return FUEL_COLORS['NG'];
  return FUEL_COLORS[dom.toLowerCase()] ?? DEFAULT_FUEL_COLOR;
}

interface BusLayerProps {
  map: maplibregl.Map;
  engineState: EngineState;
  visible: boolean;
}

export function BusLayer({ map, engineState, visible }: BusLayerProps) {
  const initialized = useRef(false);

  // Group crosswalk by bus_id → get county centroids
  const busFeatures = useMemo(() => {
    // Build centroid lookup from county geojson is expensive at startup,
    // so we approximate bus position from bus lat/lon directly
    const features: Feature[] = [];
    for (const [busId, bus] of Object.entries(engineState.buses)) {
      const bs = engineState.bus_state[busId];
      const cap = bs?.capacity_mw ?? bus.generation_mw ?? 0;
      const color = dominantFuelColor(bus.fuel_mix ?? {});
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [bus.lon, bus.lat] },
        properties: {
          bus_id: busId,
          capacity_mw: cap,
          color,
          radius: Math.max(3, Math.min(18, Math.sqrt(cap / 50))),
        },
      });
    }
    return features;
  }, [engineState.buses, engineState.bus_state]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: busFeatures },
    });

    map.addLayer({
      id: CIRCLE_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#30363d',
      },
    });

    return () => {
      if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      initialized.current = false;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update features when state changes
  useEffect(() => {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: busFeatures });
  }, [map, busFeatures]);

  // Toggle visibility
  useEffect(() => {
    if (!map.getLayer(CIRCLE_LAYER)) return;
    map.setLayoutProperty(CIRCLE_LAYER, 'visibility', visible ? 'visible' : 'none');
  }, [map, visible]);

  return null;
}
