import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';

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

export function EventLog() {
  const eventHistory = useTerraStore(s => s.eventHistory);
  const [expanded, setExpanded] = useState(false);

  if (eventHistory.length === 0) return null;

  // Group by year, most recent first
  const byYear = new Map<number, typeof eventHistory>();
  for (const evt of eventHistory) {
    const arr = byYear.get(evt.year) ?? [];
    arr.push(evt);
    byYear.set(evt.year, arr);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  const displayYears = expanded ? years : years.slice(0, 2);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      maxHeight: expanded ? 300 : 160,
      overflowY: 'auto',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: 6,
        }}
      >
        <span style={{
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: 10,
        }}>
          Event Log ({eventHistory.length})
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {displayYears.map(year => (
        <div key={year}>
          <div style={{
            display: 'inline-block',
            background: 'var(--teal-dim)',
            color: 'var(--text-primary)',
            borderRadius: 3,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 500,
            marginBottom: 4,
            marginTop: 4,
          }}>
            {year}
          </div>
          {byYear.get(year)!.map(evt => (
            <div key={evt.event_id} style={{
              padding: '4px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{CATEGORY_ICONS[evt.category] ?? '\u2139'}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {evt.title}
                </span>
                {evt.severity && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    sev {evt.severity}
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2, paddingLeft: 18 }}>
                {evt.description.length > 120
                  ? evt.description.slice(0, 120) + '...'
                  : evt.description}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
