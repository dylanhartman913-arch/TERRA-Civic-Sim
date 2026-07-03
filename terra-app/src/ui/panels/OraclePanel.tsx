import { useTerraStore } from '../../state/store.js';

export function OraclePanel() {
  const visible = useTerraStore(s => s.layers.oracle);

  if (!visible) return null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <div style={{
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: 10,
        marginBottom: 8,
      }}>
        E4ST Oracle
      </div>
      <div style={{
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
        lineHeight: 1.5,
      }}>
        E4ST oracle comparison available after model validation (Phase 6).
        Current values are heuristic estimates.
      </div>
    </div>
  );
}
