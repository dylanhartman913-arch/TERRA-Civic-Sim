import { useTerraStore } from '../../state/store.js';

const REASON_ICONS: Record<string, string> = {
  build_complete: '\u{1F3D7}',
  coupling_activated: '\u26A1',
  deficit_threshold: '\u26A0',
  era_transition: '\u{1F4C5}',
  quest_condition_met: '\u2713',
  event_fired: '\u{1F321}',
};

const REASON_TITLES: Record<string, string> = {
  build_complete: 'Build Complete',
  coupling_activated: 'Coupling Activated',
  deficit_threshold: 'Supply Gap Warning',
  era_transition: 'New Era',
  quest_condition_met: 'Condition Met',
  event_fired: 'Event',
};

const CATEGORY_ICONS: Record<string, string> = {
  heat_wave: '\u{1F321}',
  drought: '\u{1F4A7}',
  policy_shock: '\u{1F4CB}',
  supply_chain_disruption: '\u{1F6E0}',
  labor_shortage: '\u{1F477}',
  transmission_outage: '\u26A1',
  build_complete: '\u{1F3D7}',
  coupling_activated: '\u26A1',
  asset_operational: '\u{1F3ED}',
};

export function AutoPauseModal() {
  const pendingAutoPause = useTerraStore(s => s.pendingAutoPause);
  const dismissAutoPause = useTerraStore(s => s.dismissAutoPause);

  if (!pendingAutoPause) return null;

  const { reason, event, detail } = pendingAutoPause;
  let icon = REASON_ICONS[reason] ?? '\u2139';
  if (reason === 'event_fired' && event) {
    icon = CATEGORY_ICONS[event.category] ?? icon;
  }
  const title = reason === 'event_fired' && event
    ? event.title
    : REASON_TITLES[reason] ?? reason;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(13, 17, 23, 0.7)',
      zIndex: 200,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 24,
        width: 360,
        color: 'var(--text-primary)',
      }}>
        <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>
          {icon}
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, textAlign: 'center', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16, lineHeight: 1.5 }}>
          {detail}
        </div>
        {event && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-base)',
            borderRadius: 4,
            padding: '8px 10px',
            marginBottom: 16,
            lineHeight: 1.5,
          }}>
            {event.description}
          </div>
        )}
        <button
          onClick={dismissAutoPause}
          style={{
            width: '100%',
            padding: '10px 0',
            background: 'var(--teal-dim)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
