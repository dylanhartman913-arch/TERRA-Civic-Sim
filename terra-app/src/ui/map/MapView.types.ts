import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';

export interface MapRef {
  mapRef: MutableRefObject<maplibregl.Map | null>;
}

export interface MapChildProps {
  map: maplibregl.Map;
}
