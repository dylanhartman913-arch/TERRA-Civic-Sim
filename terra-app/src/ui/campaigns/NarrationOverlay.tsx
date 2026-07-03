import { useEffect } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { NarrationStep } from '../../engine/types.js';
import countiesGeoJson from '../../data/counties.geojson';

// Compute bbox-center centroid for a GeoJSON feature
function getFeatureCentroid(geoid: string): [number, number] | null {
  const features = (countiesGeoJson as GeoJSON.FeatureCollection).features;
  const feature = features.find(f => f.properties?.GEOID === geoid);
  if (!feature || !feature.geometry) return null;

  const coords: number[][] = [];
  function collectCoords(geometry: GeoJSON.Geometry) {
    if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates) {
        coords.push(...(ring as number[][]));
      }
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates) {
        for (const ring of poly) {
          coords.push(...(ring as number[][]));
        }
      }
    }
  }
  collectCoords(feature.geometry);
  if (coords.length === 0) return null;

  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  return [lng, lat];
}

interface Props {
  onSkip: () => void;
}

export function NarrationOverlay({ onSkip }: Props) {
  const activeCampaign = useTerraStore(s => s.activeCampaign);
  const narrationStep = useTerraStore(s => s.narrationStep);
  const advanceNarrationStep = useTerraStore(s => s.advanceNarrationStep);
  const advanceYear = useTerraStore(s => s.advanceYear);
  const engineState = useTerraStore(s => s.engineState);
  const setCampaignFlyTarget = useTerraStore(s => s.setCampaignFlyTarget);
  const setActiveMetric = useTerraStore(s => s.setActiveMetric);

  const act1 = activeCampaign?.acts?.['act_1'];
  const steps: NarrationStep[] = act1?.narration_steps ?? [];
  const currentStep = steps[narrationStep];
  const isLast = narrationStep >= steps.length - 1;

  // Fly to current step geoid and set metric
  useEffect(() => {
    if (!currentStep) return;
    const centroid = getFeatureCentroid(currentStep.geoid);
    if (centroid) {
      setCampaignFlyTarget({ lng: centroid[0], lat: centroid[1], zoom: 8 });
    }
    if (currentStep.highlight_metric === 'E' || currentStep.highlight_metric === 'Ec' || currentStep.highlight_metric === 'S') {
      setActiveMetric(currentStep.highlight_metric as 'E' | 'Ec' | 'S');
    } else if (currentStep.highlight_metric === 'firm_capacity_margin') {
      setActiveMetric('firm_capacity_margin');
    }
  }, [narrationStep, currentStep, setCampaignFlyTarget, setActiveMetric]);

  function handleNext() {
    // If next step is year 2026, advance the year first
    const nextStep = steps[narrationStep + 1];
    if (nextStep && nextStep.year > engineState.year) {
      advanceYear();
    }
    advanceNarrationStep();
  }

  if (!currentStep) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 64,
      left: 0,
      right: 0,
      zIndex: 200,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '18px 24px',
        maxWidth: 560,
        width: '90%',
        fontFamily: 'var(--font-mono)',
        pointerEvents: 'all',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i <= narrationStep ? 'var(--teal)' : 'var(--bg-elevated)',
              transition: 'background 0.3s',
            }} />
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {currentStep.year}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 16 }}>
          {currentStep.text}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Skip tour
          </button>

          <button
            onClick={handleNext}
            style={{
              padding: '7px 18px',
              background: 'var(--teal-dim)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Begin →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
