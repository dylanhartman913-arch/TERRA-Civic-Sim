import { useTerraStore, type ActiveMetric } from '../../state/store.js';

const METRICS: { id: ActiveMetric; label: string; fullLabel: string; group?: string }[] = [
  { id: 'E',                    label: 'E',        fullLabel: 'Environmental Capital (E)',        group: 'EES' },
  { id: 'Ec',                   label: 'Ec',       fullLabel: 'Economic Capital (Ec)',            group: 'EES' },
  { id: 'S',                    label: 'S',        fullLabel: 'Social Capital (S)',               group: 'EES' },
  { id: 'firm_capacity_margin', label: 'Cap',      fullLabel: 'Firm Capacity Margin',             group: 'Grid' },
  { id: 'load_growth',          label: 'Load',     fullLabel: 'Load Growth (MW)',                 group: 'Grid' },
  { id: 'delta_jobs',           label: 'Jobs',     fullLabel: 'Δ Jobs (% county labor force)',   group: 'Yields' },
  { id: 'delta_revenue',        label: 'Rev',      fullLabel: 'Δ Revenue (% baseline, WY only)', group: 'Yields' },
  { id: 'construction_activity',label: 'Build',    fullLabel: 'Active construction builds',      group: 'Yields' },
];

export function MetricSelector() {
  const activeMetric = useTerraStore(s => s.activeMetric);
  const setActiveMetric = useTerraStore(s => s.setActiveMetric);

  const activeFullLabel = METRICS.find(m => m.id === activeMetric)?.fullLabel ?? '';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: 6,
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', gap: 4, padding: 4 }}>
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => setActiveMetric(m.id)}
            title={m.fullLabel}
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: 4,
              border: 'none',
              background: activeMetric === m.id ? 'var(--teal-dim)' : 'transparent',
              color: activeMetric === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{
        fontSize: 9,
        color: 'var(--text-muted)',
        paddingLeft: 8,
        paddingBottom: 5,
        letterSpacing: 0.5,
      }}>
        {activeFullLabel}
      </div>
    </div>
  );
}
