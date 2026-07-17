/* eslint-disable react-refresh/only-export-components -- data-source helpers are discriminating test seams. */
import { useEffect, useMemo } from 'react';
import type maplibregl from 'maplibre-gl';
import countiesGeoJson from '../../data/counties.geojson';
import { climateSurfaceRecordFor, hasClimateBaselineSurface } from '../climate.js';
import type { ClimateEpoch, ClimateLens, ClimateMetric, ClimateRecord } from '../climate.js';

const SOURCE_ID = 'climate-hazard-counties';
const LAYER_ID = 'climate-hazard-choropleth';
const countyFeatures = (countiesGeoJson as unknown as { features: Array<{ properties?: { GEOID?: string }; [key: string]: unknown }> }).features;

function resolvedColor(token: string) {
  const color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!color) throw new Error('Missing required --choro-3 design token');
  return color;
}

export interface HazardFeatureProperties {
  climate_hazard_value: number | null;
  climate_hazard_no_data: boolean;
  climate_hazard_attribution: ClimateRecord | null;
}

export function hazardFeaturesFor(lens: ClimateLens, epoch: ClimateEpoch, metric: ClimateMetric) {
  return countyFeatures.map(feature => {
    const geoid = String(feature.properties?.GEOID ?? '');
    const record = climateSurfaceRecordFor(geoid, lens, metric, epoch);
    const properties: HazardFeatureProperties = {
      climate_hazard_value: record?.value ?? null,
      climate_hazard_no_data: !record,
      climate_hazard_attribution: record ?? null,
    };
    return { ...feature, properties: { ...feature.properties, ...properties } };
  });
}

interface HazardChoroplethLayerProps {
  map: maplibregl.Map;
  visible: boolean;
  lens: ClimateLens;
  epoch: ClimateEpoch;
  metric: ClimateMetric;
  onAttribution: (record: ClimateRecord | null) => void;
}

export function HazardChoroplethLayer({ map, visible, lens, epoch, metric, onAttribution }: HazardChoroplethLayerProps) {
  const data = useMemo(() => ({
    ...(countiesGeoJson as object),
    features: hazardFeaturesFor(lens, epoch, metric),
  }), [lens, epoch, metric]);
  const fillColor = useMemo<maplibregl.ExpressionSpecification>(() => {
    const values = data.features.map(feature => (feature.properties as HazardFeatureProperties).climate_hazard_value).filter((value): value is number => value !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return ['case',
      ['get', 'climate_hazard_no_data'], resolvedColor('--text-muted'),
      ['interpolate', ['linear'], ['get', 'climate_hazard_value'], min, resolvedColor('--choro-1'), max, resolvedColor('--choro-5')],
    ] as maplibregl.ExpressionSpecification;
  }, [data]);

  useEffect(() => {
    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: data as unknown as maplibregl.GeoJSONSourceSpecification['data'] });
    const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
      const record = event.features?.[0]?.properties?.climate_hazard_attribution as ClimateRecord | undefined;
      onAttribution(record ?? null);
    };
    if (!map.getLayer(LAYER_ID)) {
      map.addLayer({ id: LAYER_ID, type: 'fill', source: SOURCE_ID, paint: { 'fill-color': fillColor, 'fill-opacity': 0.42 }, layout: { visibility: 'none' } });
      map.on('click', LAYER_ID, handleClick);
    }
    return () => {
      map.off('click', LAYER_ID, handleClick);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [data, fillColor, map, onAttribution]);

  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data as unknown as maplibregl.GeoJSONSourceSpecification['data']);
    if (map.getLayer(LAYER_ID)) map.setPaintProperty(LAYER_ID, 'fill-color', fillColor);
    if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, 'visibility', visible && (lens !== 'historical' || hasClimateBaselineSurface()) ? 'visible' : 'none');
  }, [data, fillColor, lens, map, visible]);

  return null;
}
