import { useTerraStore } from '../../state/store.js';

export function BuildQueue() {
  const engineState = useTerraStore(s => s.engineState);
  const active = engineState.build_queue.filter(b => !b.commissioned);

  if (active.length === 0) return null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 12px',
      fontFamily: 'var(--font-mono)',
      maxWidth: 280,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        Build Queue ({active.length})
      </div>
      {active.map((item, i) => {
        const action = engineState.action_library.actions[item.action_id];
        const remaining = item.operational_year - engineState.year;
        return (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
            borderBottom: i < active.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                {action?.action_name ?? item.action_id}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {item.geoid} · {item.magnitude} {action?.unit_label ?? ''}
              </div>
            </div>
            <div style={{
              background: 'var(--bg-elevated)',
              color: 'var(--construction)',
              borderRadius: 3,
              padding: '2px 6px',
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}>
              {remaining > 0 ? `${remaining}yr` : '✓'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
