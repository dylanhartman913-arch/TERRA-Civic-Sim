import { useTerraStore } from '../../state/store.js';

const ERAS: [number, number, string][] = [
  [2025, 2035, 'Foundation Era'],
  [2035, 2045, 'Buildout Era'],
  [2045, 2055, 'Transition Era'],
  [2055, 2075, 'Stabilization Era'],
];

function getEra(year: number): string {
  for (const [start, end, label] of ERAS) {
    if (year >= start && year < end) return `${start}–${end} | ${label}`;
  }
  return `${year} | Post-Era`;
}

export function YearControls() {
  const engineState = useTerraStore(s => s.engineState);
  const advanceYear = useTerraStore(s => s.advanceYear);
  const undoAction = useTerraStore(s => s.undoAction);
  const redoAction = useTerraStore(s => s.redoAction);
  const canUndo = useTerraStore(s => s.canUndo);
  const canRedo = useTerraStore(s => s.canRedo);
  const placementMode = useTerraStore(s => s.placementMode);
  const pendingAutoPause = useTerraStore(s => s.pendingAutoPause);

  const year = engineState.year;
  const activeBuilds = engineState.build_queue.filter(b => !b.commissioned).length;
  const blocked = !!placementMode || !!pendingAutoPause;

  const btnBase: React.CSSProperties = {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: '100%',
      fontFamily: 'var(--font-mono)',
      gap: 20,
    }}>
      {/* Year display */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--teal)', lineHeight: 1 }}>
          {year}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
          {getEra(year)}
        </div>
      </div>

      {/* Build queue badge */}
      {activeBuilds > 0 && (
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--construction)',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11,
          color: 'var(--construction)',
        }}>
          {activeBuilds} active build{activeBuilds > 1 ? 's' : ''}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={undoAction}
          disabled={!canUndo}
          style={{
            ...btnBase,
            color: canUndo ? 'var(--text-secondary)' : 'var(--text-muted)',
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
          title="Undo last action"
        >
          ↩ Undo
        </button>
        <button
          onClick={redoAction}
          disabled={!canRedo}
          style={{
            ...btnBase,
            color: canRedo ? 'var(--text-secondary)' : 'var(--text-muted)',
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
          title="Redo last undone action"
        >
          Redo ↪
        </button>
        <button
          onClick={advanceYear}
          disabled={blocked}
          style={{
            padding: '8px 20px',
            background: blocked ? 'var(--bg-elevated)' : 'var(--teal-dim)',
            border: 'none',
            borderRadius: 4,
            color: blocked ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 500,
            cursor: blocked ? 'not-allowed' : 'pointer',
          }}
        >
          End Turn →
        </button>
      </div>
    </div>
  );
}
