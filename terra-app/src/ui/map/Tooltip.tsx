import type { EngineState } from '../../engine/types.js';
import type { ActiveMetric } from '../../state/store.js';

interface TooltipProps {
  x: number;
  y: number;
  geoid: string;
  engineState: EngineState;
  activeMetric: ActiveMetric;
  countyCards: Record<string, { county_name?: string; state?: string }>;
  /** When set, replaces the metric line with this reason text (used for ineligible placement hover). */
  reason?: string;
}

const METRIC_LABELS: Record<ActiveMetric, string> = {
  E:                    'Environmental Capital (E)',
  Ec:                   'Economic Capital (Ec)',
  S:                    'Social Capital (S)',
  firm_capacity_margin: 'Firm Capacity Margin',
  load_growth:          'Load Growth (MW)',
  delta_jobs:           'Δ Jobs (% labor force)',
  delta_revenue:        'Δ Revenue (% baseline)',
  construction_activity:'Active builds',
};

export function Tooltip({ x, y, geoid, engineState, activeMetric, countyCards, reason }: TooltipProps) {
  const ees = engineState.county_ees[geoid];
  const card = countyCards[geoid];
  if (!ees || !card) return null;

  let value: number;
  let displayStr: string | null = null;
  if (activeMetric === 'E') value = ees.E;
  else if (activeMetric === 'Ec') value = ees.Ec;
  else if (activeMetric === 'S') value = ees.S;
  else if (activeMetric === 'firm_capacity_margin') {
    const cap = ees.added_firm_mw;
    const load = ees.load_mw;
    value = cap + load > 0 ? (cap - load) / Math.max(cap + load, 1) : 0;
  } else if (activeMetric === 'delta_jobs') {
    // % of labor force with operations jobs from commissioned builds
    const card2 = countyCards[geoid] as { employment?: number } | undefined;
    const laborForce = card2?.employment ?? 0;
    value = laborForce > 0 ? ees.added_firm_mw / laborForce : 0; // placeholder; real calc in CountyLayer
    displayStr = laborForce > 0 ? `${(value * 100).toFixed(2)}%` : '—';
    value = 0; // suppress default .toFixed(2)
  } else if (activeMetric === 'delta_revenue') {
    value = 0;
    displayStr = (countyCards[geoid] as { state?: string } | undefined)?.state === 'WY' ? 'WY fiscal' : '—';
  } else if (activeMetric === 'construction_activity') {
    value = engineState.build_queue.filter(b => b.geoid === geoid && !b.commissioned).length;
    displayStr = `${value} active build${value !== 1 ? 's' : ''}`;
    value = 0;
  } else {
    value = ees.load_mw;
  }

  const countyName = ees.county_name || card.county_name || geoid;
  const state = card.state ?? '';

  // Keep tooltip inside viewport
  const offsetX = x > window.innerWidth - 220 ? -200 : 16;
  const offsetY = y > window.innerHeight - 120 ? -100 : 12;

  return (
    <div
      style={{
        position: 'absolute',
        left: x + offsetX,
        top: y + offsetY,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-primary)',
        pointerEvents: 'none',
        zIndex: 50,
        minWidth: 180,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
        {countyName}{state ? `, ${state}` : ''}
      </div>
      {reason != null ? (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {reason}
        </div>
      ) : (
        <>
          <div style={{ color: 'var(--text-secondary)' }}>
            {METRIC_LABELS[activeMetric]}: <span style={{ color: 'var(--teal)' }}>
              {displayStr ?? value.toFixed(2)}
            </span>
          </div>
          {ees.deficit_mw > 0 && (
            <div style={{ color: 'var(--deficit)', marginTop: 4 }}>
              ⚡ {ees.deficit_mw.toFixed(1)} MW gap
            </div>
          )}
        </>
      )}
    </div>
  );
}
