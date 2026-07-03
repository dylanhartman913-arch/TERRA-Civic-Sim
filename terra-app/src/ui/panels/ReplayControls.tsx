import { useTerraStore } from '../../state/store.js';

const EVENT_COLORS: Record<string, string> = {
  heat_wave: 'var(--amber)',
  drought: 'var(--amber)',
  policy_shock: 'var(--purple, #a78bfa)',
  supply_chain_disruption: 'var(--purple, #a78bfa)',
  labor_shortage: 'var(--purple, #a78bfa)',
  transmission_outage: 'var(--amber)',
  build_complete: 'var(--construction, #f59e0b)',
  coupling_activated: 'var(--teal)',
  asset_operational: 'var(--teal)',
};

export function ReplayControls() {
  const replayFile = useTerraStore(s => s.replayFile);
  const replayCursor = useTerraStore(s => s.replayCursor);
  const exitReplayMode = useTerraStore(s => s.exitReplayMode);
  const scrubReplayTo = useTerraStore(s => s.scrubReplayTo);
  const stepReplayForward = useTerraStore(s => s.stepReplayForward);
  const stepReplayBackward = useTerraStore(s => s.stepReplayBackward);
  const eventHistory = useTerraStore(s => s.eventHistory);

  if (!replayFile) return null;

  const startYear = replayFile.start_year;
  const endYear = replayFile.year_reached;
  const range = endYear - startYear || 1;

  // Build event dots
  const eventDots = eventHistory.map(evt => ({
    pct: (evt.year - startYear) / range,
    color: EVENT_COLORS[evt.category] ?? 'var(--text-muted)',
    title: evt.title,
  }));

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      height: '100%',
      fontFamily: 'var(--font-mono)',
      gap: 16,
      background: 'var(--bg-surface)',
    }}>
      {/* Step controls */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={stepReplayBackward}
          disabled={replayCursor <= startYear}
          style={stepBtn(replayCursor > startYear)}
        >
          ←
        </button>
        <button
          onClick={stepReplayForward}
          disabled={replayCursor >= endYear}
          style={stepBtn(replayCursor < endYear)}
        >
          →
        </button>
      </div>

      {/* Year display */}
      <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--teal)', flexShrink: 0, minWidth: 56 }}>
        {replayCursor}
      </div>

      {/* Timeline scrubber */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Event dots */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, pointerEvents: 'none' }}>
          {eventDots.map((dot, i) => (
            <div
              key={i}
              title={dot.title}
              style={{
                position: 'absolute',
                left: `${Math.max(0, Math.min(100, dot.pct * 100))}%`,
                width: 6, height: 6,
                borderRadius: '50%',
                background: dot.color,
                transform: 'translate(-50%, 0)',
              }}
            />
          ))}
        </div>
        <input
          type="range"
          min={startYear}
          max={endYear}
          value={replayCursor}
          onChange={e => scrubReplayTo(Number(e.target.value))}
          style={{ width: '100%', marginTop: 10, accentColor: 'var(--teal)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
          <span>{startYear}</span>
          <span>{endYear}</span>
        </div>
      </div>

      {/* Scenario name */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {replayFile.name}
      </div>

      {/* Exit button */}
      <button
        onClick={exitReplayMode}
        style={{
          padding: '6px 14px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Exit Replay
      </button>
    </div>
  );
}

function stepBtn(active: boolean): React.CSSProperties {
  return {
    width: 32, height: 32,
    background: active ? 'var(--teal-dim)' : 'var(--bg-elevated)',
    border: 'none',
    borderRadius: 4,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
    cursor: active ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}
