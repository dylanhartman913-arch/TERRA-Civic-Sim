/**
 * EraReport — Summary sheet shown at era transitions.
 * Shows the indicators that moved most during the completed era,
 * each with sparkline and delta value.
 */

import { useTerraStore } from '../../state/store.js';
import { INDICATOR_CATALOG } from '../../engine/indicators.js';
import { useIndicatorHistory } from '../../state/selectors.js';
import { TrajectoryPanel } from '../charts/TrajectoryPanel.js';
import type { ConfidenceLevel } from '../charts/types.js';

const ERA_NAMES: Record<number, string> = {
  2025: 'Foundation Era',
  2035: 'Transition Era',
  2045: 'Buildout Era',
  2055: 'Steady State Era',
};

// Indicators to rank for era report (county-scale, exclude stubs)
const RANKED_INDICATORS = [
  'E', 'Ec', 'S', 'fiscal_balance', 'cumulative_net',
  'labor_utilization', 'service_funding_per_capita',
];

function IndicatorCard({
  indicatorId,
  delta,
  geoid,
  currentYear,
  onChartOpen,
}: {
  indicatorId: string;
  delta: number;
  geoid: string;
  currentYear: number;
  onChartOpen: (id: string) => void;
}) {
  const catalog = INDICATOR_CATALOG[indicatorId];
  const history = useIndicatorHistory(indicatorId, geoid);
  const confidenceLevel: ConfidenceLevel = catalog?.confidence_inputs?.length > 2 ? 'low' : 'medium';
  const isPositive = delta >= 0;

  return (
    <div
      onClick={() => onChartOpen(indicatorId)}
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '8px 10px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 500 }}>
          {catalog?.label ?? indicatorId}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 10,
            color: isPositive ? 'var(--teal)' : 'var(--deficit)',
            fontWeight: 500,
          }}>
            {isPositive ? '+' : ''}{delta.toFixed(3)}
          </span>
          <span style={{
            fontSize: 7,
            padding: '0 3px',
            borderRadius: 2,
            background: 'var(--bg-elevated)',
            color: confidenceLevel === 'low' ? 'var(--amber)' : 'var(--text-muted)',
            textTransform: 'uppercase',
          }}>
            {confidenceLevel}
          </span>
        </div>
      </div>

      {/* Mini sparkline */}
      <TrajectoryPanel
        config={{ title: '', units: catalog?.units ?? '', width: 140, height: 32 }}
        history={history}
        projection={[]}
        currentYear={currentYear}
        compact
        width={140}
        height={32}
      />
    </div>
  );
}

export function EraReport() {
  const showEraReport = useTerraStore(s => s.showEraReport);
  const setShowEraReport = useTerraStore(s => s.setShowEraReport);
  const setOpenChartIndicator = useTerraStore(s => s.setOpenChartIndicator);
  const engineState = useTerraStore(s => s.engineState);
  const selectedGeoid = useTerraStore(s => s.selectedGeoid);

  if (!showEraReport) return null;

  const currentYear = engineState.year;
  const history = engineState.history ?? [];

  // Determine completed era
  const eraStarts = [2025, 2035, 2045, 2055];
  let eraStartYear = 2025;
  for (const s of eraStarts) {
    if (s < currentYear) eraStartYear = s;
  }
  const eraName = ERA_NAMES[eraStartYear] ?? `Era ${eraStartYear}`;

  // Find history snapshots for the era window
  const eraSnapshots = history.filter(s => s.year >= eraStartYear && s.year <= currentYear);
  if (eraSnapshots.length < 2) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(13, 17, 23, 0.7)', zIndex: 210, fontFamily: 'var(--font-mono)',
      }} onClick={() => setShowEraReport(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 360, color: 'var(--text-primary)' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Era Report: {eraName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Not enough history data for this era.</div>
          <button onClick={() => setShowEraReport(false)} style={closeBtnStyle}>Close</button>
        </div>
      </div>
    );
  }

  // Use first WY county with data (or selectedGeoid)
  const geoid = selectedGeoid ?? Object.keys(eraSnapshots[0].counties)[0] ?? '';
  const firstSnap = eraSnapshots[0].counties[geoid.padStart(5, '0')];
  const lastSnap = eraSnapshots[eraSnapshots.length - 1].counties[geoid.padStart(5, '0')];

  // Compute deltas and rank
  const deltas: { indicatorId: string; delta: number }[] = [];
  if (firstSnap && lastSnap) {
    for (const id of RANKED_INDICATORS) {
      const first = (firstSnap as Record<string, number>)[id];
      const last = (lastSnap as Record<string, number>)[id];
      if (first != null && last != null) {
        deltas.push({ indicatorId: id, delta: last - first });
      }
    }
  }
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top5 = deltas.slice(0, 5);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(13, 17, 23, 0.7)', zIndex: 210, fontFamily: 'var(--font-mono)',
    }} onClick={() => setShowEraReport(false)}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 20,
        width: 400,
        maxHeight: '80vh',
        overflow: 'auto',
        color: 'var(--text-primary)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Era Report</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {eraName} Complete ({eraStartYear}&ndash;{currentYear})
            </div>
          </div>
          <span onClick={() => setShowEraReport(false)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>&times;</span>
        </div>

        {top5.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No indicator movement recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top5.map(({ indicatorId, delta }) => (
              <IndicatorCard
                key={indicatorId}
                indicatorId={indicatorId}
                delta={delta}
                geoid={geoid}
                currentYear={currentYear}
                onChartOpen={(id) => { setOpenChartIndicator(id); setShowEraReport(false); }}
              />
            ))}
          </div>
        )}

        <button onClick={() => setShowEraReport(false)} style={{ ...closeBtnStyle, marginTop: 12 }}>
          Continue
        </button>
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  background: 'var(--teal-dim)',
  color: 'var(--text-primary)',
  border: 'none',
  borderRadius: 4,
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  cursor: 'pointer',
};
