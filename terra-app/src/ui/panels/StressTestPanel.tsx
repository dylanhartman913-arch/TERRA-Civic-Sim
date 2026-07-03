import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';

const DISTURBANCE_TYPES = [
  'heat_wave',
  'drought',
  'policy_shock',
  'supply_chain_disruption',
  'labor_shortage',
  'transmission_outage',
] as const;

export function StressTestPanel() {
  const [visible, setVisible] = useState(false);
  const [distType, setDistType] = useState<string>('heat_wave');
  const [severity, setSeverity] = useState(1.0);
  const [selectedGeoids, setSelectedGeoids] = useState<Set<string>>(new Set());
  const engineState = useTerraStore(s => s.engineState);
  const injectManualDisturbance = useTerraStore(s => s.injectManualDisturbance);

  const studyGeoids = Object.keys(engineState.county_ees)
    .filter(g => g.startsWith('56'))
    .sort();

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '4px 10px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        Debug: Stress Test
      </button>
    );
  }

  const toggleGeoid = (g: string) => {
    const next = new Set(selectedGeoids);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setSelectedGeoids(next);
  };

  const handleInject = () => {
    const geoids = selectedGeoids.size > 0
      ? [...selectedGeoids]
      : studyGeoids.slice(0, 5);
    injectManualDisturbance(distType, severity, geoids);
  };

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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: 10,
        }}>
          Stress Test
        </span>
        <span
          onClick={() => setVisible(false)}
          style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
        >
          ×
        </span>
      </div>

      {/* Type */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>TYPE</div>
        <select
          value={distType}
          onChange={e => setDistType(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '4px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          {DISTURBANCE_TYPES.map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Severity */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>
          SEVERITY: {severity.toFixed(1)}
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={1}
          value={severity}
          onChange={e => setSeverity(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--deficit)' }}
        />
      </div>

      {/* County select */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>
          COUNTIES ({selectedGeoids.size || 'auto'})
        </div>
        <div style={{
          maxHeight: 80,
          overflowY: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
        }}>
          {studyGeoids.map(g => (
            <span
              key={g}
              onClick={() => toggleGeoid(g)}
              style={{
                padding: '1px 4px',
                borderRadius: 2,
                fontSize: 9,
                cursor: 'pointer',
                background: selectedGeoids.has(g) ? 'var(--teal-dim)' : 'transparent',
                color: selectedGeoids.has(g) ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${selectedGeoids.has(g) ? 'var(--teal)' : 'var(--border)'}`,
              }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={handleInject}
        style={{
          width: '100%',
          padding: '6px 0',
          background: 'var(--deficit)',
          color: 'var(--bg-base)',
          border: 'none',
          borderRadius: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Inject Disturbance
      </button>
    </div>
  );
}
