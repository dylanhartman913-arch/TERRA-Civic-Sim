import { useEffect, useMemo, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { EngineState } from '../../engine/types.js';

const SOURCE_ID = 'couplings';
const LINE_LAYER = 'coupling-lines';

interface CouplingLinksProps {
  map: maplibregl.Map;
  engineState: EngineState;
}

export function CouplingLinks({ map, engineState }: CouplingLinksProps) {
  const initialized = useRef(false);
  const animFrameRef = useRef<number>(0);

  // Build county centroid lookup from crosswalk + bus positions
  const countyCentroids = useMemo(() => {
    const centroids: Record<string, [number, number]> = {};
    for (const row of engineState.crosswalk) {
      if (row.primary_bus) {
        const bus = engineState.buses[String(row.bus_id)];
        if (bus && !centroids[row.geoid]) {
          centroids[row.geoid] = [bus.lon, bus.lat];
        }
      }
    }
    return centroids;
  }, [engineState.crosswalk, engineState.buses]);

  const couplingFeatures = useMemo(() => {
    const features: Feature[] = [];
    for (const coupling of engineState.active_couplings) {
      const from = countyCentroids[coupling.demand_geoid];
      const to = countyCentroids[coupling.supply_geoid];
      if (!from || !to) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [from, to] },
        properties: {
          coupling_id: coupling.coupling_id,
          reasoning: coupling.reasoning,
        },
      });
    }
    return features;
  }, [engineState.active_couplings, countyCentroids]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: couplingFeatures },
    });

    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2dd4bf',
        'line-width': 2,
        'line-dasharray': [2, 2],
        'line-opacity': 0.9,
      },
    });

    // Animate dash offset for pulse effect
    let offset = 0;
    const animate = () => {
      offset = (offset + 0.05) % 4;
      if (map.getLayer(LINE_LAYER)) {
        map.setPaintProperty(LINE_LAYER, 'line-dasharray', [2, 2]);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      initialized.current = false;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: couplingFeatures });
  }, [map, couplingFeatures]);

  return null;
}
