import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import { CountyLayer } from './CountyLayer.js';
import { EcoregionLayer } from './EcoregionLayer.js';
import { BusLayer } from './BusLayer.js';
import { BranchLayer } from './BranchLayer.js';
import { PlacementOverlay } from './PlacementOverlay.js';
import { CouplingLinks } from './CouplingLinks.js';
import { Tooltip } from './Tooltip.js';
import { YieldBadges } from './YieldBadges.js';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tooltipState, setTooltipState] = useState<{
    x: number; y: number; geoid: string;
  } | null>(null);

  const engineState = useTerraStore(s => s.engineState);
  const layers = useTerraStore(s => s.layers);
  const placementMode = useTerraStore(s => s.placementMode);
  const activeMetric = useTerraStore(s => s.activeMetric);
  const countyCards = engineState.county_cards as Record<string, { county_name?: string; state?: string }>;
  const campaignFlyTarget = useTerraStore(s => s.campaignFlyTarget);

  // Fly to campaign narration target
  useEffect(() => {
    if (!campaignFlyTarget || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [campaignFlyTarget.lng, campaignFlyTarget.lat],
      zoom: campaignFlyTarget.zoom,
      duration: 1500,
    });
  }, [campaignFlyTarget]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',
      center: [-106.5, 43.0],
      zoom: 5.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-base)',
      }}
    >
      {mapLoaded && mapRef.current && (
        <>
          <EcoregionLayer map={mapRef.current} visible={layers.ecoregions} />
          <CountyLayer
            map={mapRef.current}
            engineState={engineState}
            activeMetric={activeMetric}
            onTooltip={setTooltipState}
          />
          {placementMode && (
            <PlacementOverlay map={mapRef.current} />
          )}
          <BusLayer map={mapRef.current} engineState={engineState} visible={layers.buses} />
          <BranchLayer map={mapRef.current} engineState={engineState} visible={layers.branches} />
          <CouplingLinks map={mapRef.current} engineState={engineState} />
          <YieldBadges map={mapRef.current} />
        </>
      )}
      {tooltipState && (
        <Tooltip
          x={tooltipState.x}
          y={tooltipState.y}
          geoid={tooltipState.geoid}
          engineState={engineState}
          activeMetric={activeMetric}
          countyCards={countyCards}
        />
      )}
    </div>
  );
}
