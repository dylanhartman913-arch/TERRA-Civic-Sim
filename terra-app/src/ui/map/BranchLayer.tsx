import { useEffect, useMemo, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { EngineState } from '../../engine/types.js';

const SOURCE_ID = 'branches';
const LINE_LAYER = 'branch-lines';

interface BranchLayerProps {
  map: maplibregl.Map;
  engineState: EngineState;
  visible: boolean;
}

export function BranchLayer({ map, engineState, visible }: BranchLayerProps) {
  const initialized = useRef(false);

  const branchFeatures = useMemo(() => {
    const features: Feature[] = [];
    const buses = engineState.buses;

    for (const [branchId, branch] of Object.entries(engineState.branches)) {
      if (!branch.active) continue;
      const fromBus = buses[branch.from_bus];
      const toBus = buses[branch.to_bus];
      if (!fromBus || !toBus) continue;

      const thermal = branch.thermal_limit_mw ?? 0;
      // Width 1–6 proportional to thermal limit (typical range 0–2000 MW)
      const width = Math.max(1, Math.min(6, 1 + (thermal / 400)));

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [fromBus.lon, fromBus.lat],
            [toBus.lon, toBus.lat],
          ],
        },
        properties: {
          branch_id: branchId,
          thermal_limit_mw: thermal,
          width,
        },
      });
    }
    return features;
  }, [engineState.branches, engineState.buses]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: branchFeatures },
    });

    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      layout: { visibility: 'none', 'line-cap': 'round' },
      paint: {
        'line-color': 'rgba(72, 79, 88, 0.6)',
        'line-width': ['get', 'width'],
      },
    });

    return () => {
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      initialized.current = false;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: branchFeatures });
  }, [map, branchFeatures]);

  useEffect(() => {
    if (!map.getLayer(LINE_LAYER)) return;
    map.setLayoutProperty(LINE_LAYER, 'visibility', visible ? 'visible' : 'none');
  }, [map, visible]);

  return null;
}
