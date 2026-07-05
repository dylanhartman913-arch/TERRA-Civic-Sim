/**
 * DecompositionView — Modal showing E/Ec/S constituent indicators
 * with trajectory sparklines, weights, and confidence.
 */

import { useTerraStore } from '../../state/store.js';
import { computeIndicator, INDICATOR_CATALOG } from '../../engine/indicators.js';
import { EES_DECOMPOSITION } from '../../engine/decomposition.js';
import { useIndicatorTrajectory } from '../../state/selectors.js';
import { TrajectoryPanel } from '../charts/TrajectoryPanel.js';
import type { ConfidenceLevel } from '../charts/types.js';

const CAPITAL_COLORS: Record<string, string> = {
  E: 'var(--teal)',
  Ec: 'var(--purple)',
  S: 'var(--amber)',
};

function ConstituentCard({
  indicatorId,
  label,
  weight,
  relationship,
  geoid,
  currentYear,
}: {
  indicatorId: string;
  label: string;
  weight: number;
  relationship: 'positive' | 'negative' | 'complex';
  geoid?: string;
  currentYear: number;
}) {
  const engineState = useTerraStore(s => s.engineState);
  const currentValue = computeIndicator(engineState, indicatorId, 'county', geoid);
  const { history, projection } = useIndicatorTrajectory(indicatorId, geoid, 15);
  const catalog = INDICATOR_CATALOG[indicatorId];
  const confidenceLevel: ConfidenceLevel = catalog?.confidence_inputs?.length > 2 ? 'low' : catalog?.confidence_inputs?.length > 1 ? 'medium' : 'high';

  const arrow = relationship === 'positive' ? '\u2191' : relationship === 'negative' ? '\u2193' : '\u2194';
  const arrowColor = relationship === 'positive' ? 'var(--teal)' : relationship === 'negative' ? 'var(--deficit)' : 'var(--amber)';

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: '8px 10px',
    }}>
      {/* Header: label + current value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: arrowColor, fontSize: 12 }}>{arrow}</span>
          <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {currentValue != null ? currentValue.toFixed(3) : '—'}
        </span>
      </div>

      {/* Weight bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${weight * 100}%`, height: '100%', background: 'var(--teal-dim)', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 8, color: 'var(--text-muted)', minWidth: 24 }}>
          {(weight * 100).toFixed(0)}%
        </span>
        <span style={{
          fontSize: 7,
          padding: '0 3px',
          borderRadius: 2,
          background: 'var(--bg-elevated)',
          color: confidenceLevel === 'low' ? 'var(--amber)' : confidenceLevel === 'high' ? 'var(--teal)' : 'var(--text-muted)',
          textTransform: 'uppercase',
        }}>
          {confidenceLevel}
        </span>
      </div>

      {/* Mini sparkline */}
      <TrajectoryPanel
        config={{ title: '', units: catalog?.units ?? '', width: 120, height: 40 }}
        history={history}
        projection={projection}
        currentYear={currentYear}
        compact
        width={120}
        height={40}
      />
    </div>
  );
}

export function DecompositionView() {
  const decompositionCapital = useTerraStore(s => s.decompositionCapital);
  const setDecompositionCapital = useTerraStore(s => s.setDecompositionCapital);
  const engineState = useTerraStore(s => s.engineState);
  const selectedGeoid = useTerraStore(s => s.selectedGeoid);

  if (!decompositionCapital) return null;

  const decomp = EES_DECOMPOSITION[decompositionCapital];
  const capitalValue = computeIndicator(
    engineState,
    decompositionCapital,
    selectedGeoid ? 'county' : 'study',
    selectedGeoid ?? undefined,
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(13, 17, 23, 0.7)',
      zIndex: 250,
      fontFamily: 'var(--font-mono)',
    }}
      onClick={() => setDecompositionCapital(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          width: 380,
          maxHeight: '80vh',
          overflow: 'auto',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: CAPITAL_COLORS[decompositionCapital] }}>
              {decomp.label} ({decompositionCapital})
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Current: {capitalValue != null ? capitalValue.toFixed(3) : '—'} / 10
            </div>
          </div>
          <span
            onClick={() => setDecompositionCapital(null)}
            style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}
          >
            &times;
          </span>
        </div>

        {/* Constituent grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {decomp.constituents.map(c => (
            <ConstituentCard
              key={c.indicatorId}
              indicatorId={c.indicatorId}
              label={c.label}
              weight={c.weight}
              relationship={c.relationship}
              geoid={selectedGeoid ?? undefined}
              currentYear={engineState.year}
            />
          ))}
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: 12,
          padding: '8px 10px',
          background: 'var(--bg-base)',
          borderRadius: 4,
          fontSize: 9,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          Weights are narrative, not computational. EES scores are updated via per-action
          ees_effects coefficients — this decomposition shows which system indicators
          are most conceptually related to each capital. See Methods for EES computation details.
        </div>
      </div>
    </div>
  );
}
