/* eslint-disable react-refresh/only-export-components -- feature helpers are discriminating test seams. */
/**
 * AgChoroplethLayer — county-level choropleth for three AG2 metrics.
 *
 * Modes:
 *   forage_trend      — forage_aum.index (1 = baseline; <1 = decline; >1 = growth)
 *   invasive_burden   — converted_to_energy / total_ag_land (fraction)
 *   converted_acres   — land_acres.converted_to_energy (absolute)
 *
 * Built on the same MapLibre pattern as HazardChoroplethLayer. Reuses badge-stack
 * choropleth infrastructure — no forked components.
 */
import { useEffect, useMemo } from 'react';
import type maplibregl from 'maplibre-gl';
import countiesGeoJson from '../../data/counties.geojson';
import type { EngineState } from '../../engine/types.js';
import { getCountyAg } from '../../engine/engine.js';
import type { AgChoroplethMode } from '../../state/store.js';

const SOURCE_ID = 'ag-choropleth-counties';
const LAYER_ID = 'ag-choropleth';

const countyFeatures = (countiesGeoJson as unknown as {
  features: Array<{ properties?: { GEOID?: string }; [key: string]: unknown }>;
}).features;

export interface AgFeatureProperties {
  ag_value: number | null;
  ag_no_data: boolean;
  ag_mode: AgChoroplethMode;
  ag_label: string;
}

export function agFeaturesFor(engineState: EngineState, mode: AgChoroplethMode) {
  return countyFeatures.map(feature => {
    const geoid = String(feature.properties?.GEOID ?? '');
    const ag = getCountyAg(engineState, geoid);
    let value: number | null = null;
    let label = '';

    if (ag) {
      const land = ag.levels.land_acres;
      const totalLand = land.irrigated_crop + land.dry_crop + land.private_rangeland
        + land.other + land.converted_to_energy + land.easement_protected;

      if (mode === 'forage_trend') {
        value = ag.levels.forage_aum.index;
        label = `Forage index: ${(value * 100).toFixed(1)}%`;
      } else if (mode === 'invasive_burden') {
        value = totalLand > 0 ? land.converted_to_energy / totalLand : 0;
        label = `Converted: ${(value * 100).toFixed(2)}% of ag land`;
      } else if (mode === 'converted_acres') {
        value = land.converted_to_energy;
        label = `${Math.round(value).toLocaleString()} ac converted`;
      }
    }

    const properties: AgFeatureProperties = {
      ag_value: value,
      ag_no_data: value === null,
      ag_mode: mode,
      ag_label: label,
    };
    return { ...feature, properties: { ...feature.properties, ...properties } };
  });
}

interface AgChoroplethLayerProps {
  map: maplibregl.Map;
  visible: boolean;
  engineState: EngineState;
  mode: AgChoroplethMode;
}

export function AgChoroplethLayer({ map, visible, engineState, mode }: AgChoroplethLayerProps) {
  const data = useMemo(() => ({
    ...(countiesGeoJson as object),
    features: agFeaturesFor(engineState, mode),
  }), [engineState, mode]);

  const fillColor = useMemo<maplibregl.ExpressionSpecification>(() => {
    const values = data.features
      .map(f => (f.properties as AgFeatureProperties).ag_value)
      .filter((v): v is number => v !== null);
    if (values.length === 0) {
      return ['case', ['get', 'ag_no_data'], '#333', '#2dd4bf'] as maplibregl.ExpressionSpecification;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Color scale: forage_trend → green=good/red=bad; others → white=low/amber=high
    const lowColor = mode === 'forage_trend' ? '#ef4444' : '#1a1a2e';
    const highColor = mode === 'forage_trend' ? '#2dd4bf' : '#f59e0b';
    return ['case',
      ['get', 'ag_no_data'], '#2a2a3a',
      min === max
        ? highColor
        : ['interpolate', ['linear'], ['get', 'ag_value'], min, lowColor, max, highColor],
    ] as maplibregl.ExpressionSpecification;
  }, [data, mode]);

  useEffect(() => {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: data as unknown as maplibregl.GeoJSONSourceSpecification['data'],
      });
    }
    if (!map.getLayer(LAYER_ID)) {
      map.addLayer({
        id: LAYER_ID, type: 'fill', source: SOURCE_ID,
        paint: { 'fill-color': fillColor, 'fill-opacity': 0.50 },
        layout: { visibility: 'none' },
      });
    }
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as unknown as maplibregl.GeoJSONSourceSpecification['data']);
    if (map.getLayer(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, 'fill-color', fillColor);
      map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    }
  }, [data, fillColor, map, visible]);

  return null;
}
