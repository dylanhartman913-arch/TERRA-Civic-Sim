import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import ecoregionsGeoJson from '../../data/mw_ecoregions.geojson';

const SOURCE_ID = 'ecoregions';
const FILL_LAYER = 'ecoregion-fill';
const LINE_LAYER = 'ecoregion-border';

interface EcoregionLayerProps {
  map: maplibregl.Map;
  visible: boolean;
}

export function EcoregionLayer({ map, visible }: EcoregionLayerProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: ecoregionsGeoJson as unknown as maplibregl.GeoJSONSourceSpecification['data'],
    });

    map.addLayer(
      {
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#0d9488',
          'fill-opacity': 0,
        },
        layout: { visibility: 'none' },
      },
      'county-fill' // insert below county fill
    );

    map.addLayer(
      {
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#2dd4bf',
          'line-width': 1,
          'line-dasharray': [3, 3],
          'line-opacity': 0.4,
        },
        layout: { visibility: 'none' },
      },
      'county-fill'
    );

    return () => {
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      initialized.current = false;
    };
  }, [map]);

  // Toggle visibility
  useEffect(() => {
    if (!map.getLayer(FILL_LAYER)) return;
    const v = visible ? 'visible' : 'none';
    map.setLayoutProperty(FILL_LAYER, 'visibility', v);
    map.setLayoutProperty(LINE_LAYER, 'visibility', v);
    if (visible) {
      map.setPaintProperty(FILL_LAYER, 'fill-opacity', 0.12);
    }
  }, [map, visible]);

  return null;
}
