import { useEffect, useMemo } from 'react';
import type maplibregl from 'maplibre-gl';
import countiesGeoJson from '../../data/counties.geojson';
import { climateRecordFor } from '../climate.js';
import type { ClimateLens } from '../climate.js';

const SOURCE_ID = 'climate-hazard-counties';
const LAYER_ID = 'climate-hazard-choropleth';
const countyFeatures = (countiesGeoJson as unknown as { features: Array<{ properties?: { GEOID?: string }; [key: string]: unknown }> }).features;

function resolvedChoroplethColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--choro-3').trim();
  if (!color) throw new Error('Missing required --choro-3 design token');
  return color;
}

export function HazardChoroplethLayer({ map, visible, lens }: { map: maplibregl.Map; visible: boolean; lens: ClimateLens }) {
  const data = useMemo(() => ({
    ...(countiesGeoJson as object),
    features: countyFeatures.map(feature => {
      const geoid = String(feature.properties?.GEOID ?? '');
      const record = climateRecordFor(geoid, lens, 'high_fire_danger_days', '2050');
      return { ...feature, properties: { ...feature.properties, climate_hazard_value: record?.value ?? null } };
    }),
  }), [lens]);

  useEffect(() => {
    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: data as unknown as maplibregl.GeoJSONSourceSpecification['data'] });
    if (!map.getLayer(LAYER_ID)) map.addLayer({ id: LAYER_ID, type: 'fill', source: SOURCE_ID, paint: { 'fill-color': resolvedChoroplethColor(), 'fill-opacity': 0.42 }, layout: { visibility: 'none' } });
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [data, map]);

  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as unknown as maplibregl.GeoJSONSourceSpecification['data']);
    if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, 'visibility', visible && lens !== 'historical' ? 'visible' : 'none');
  }, [data, lens, map, visible]);

  return null;
}
