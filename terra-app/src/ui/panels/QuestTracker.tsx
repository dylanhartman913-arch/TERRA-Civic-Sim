import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { ScenarioProfile } from '../../engine/types.js';
import scenarioData from '../../data/scenario_profiles.json';

const profiles = scenarioData.profiles as ScenarioProfile[];

export function QuestTracker() {
  const activeScenario = useTerraStore(s => s.activeScenario);
  const questConditions = useTerraStore(s => s.questConditions);
  const setActiveScenario = useTerraStore(s => s.setActiveScenario);
  const [collapsed, setCollapsed] = useState(false);

  if (!activeScenario) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Scenario
        </div>
        {profiles.map(p => (
          <button
            key={p.profile_id}
            onClick={() => setActiveScenario(p)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              marginBottom: 4,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 500 }}>{p.name}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>
              Target: {p.target_year}
            </div>
          </button>
        ))}
      </div>
    );
  }

  const metCount = questConditions.filter(c => c.met).length;
  const totalCount = questConditions.length;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>{activeScenario.name}</span>
        <span style={{
          color: metCount === totalCount ? 'var(--surplus)' : 'var(--teal)',
          fontWeight: 500,
        }}>
          {metCount}/{totalCount}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <div
        onClick={() => setCollapsed(true)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
            Quest
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 }}>
            {activeScenario.name}
          </div>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
          Target {activeScenario.target_year}
        </div>
      </div>

      {questConditions.map(cond => {
        const progress = cond.target_value !== 0
          ? Math.min(1, Math.max(0, cond.current_value / cond.target_value))
          : cond.met ? 1 : 0;

        return (
          <div key={cond.condition_id} style={{
            padding: '6px 0',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                color: cond.met ? 'var(--surplus)' : 'var(--deficit)',
                fontSize: 12,
              }}>
                {cond.met ? '\u2713' : '\u2717'}
              </span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>
                {cond.label}
              </span>
            </div>
            <div style={{ paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>
              {typeof cond.current_value === 'number' && cond.unit !== 'boolean'
                ? `${cond.current_value.toFixed(2)} / ${cond.target_value} ${cond.unit}`
                : cond.met ? 'Yes' : 'No'}
            </div>
            {cond.unit !== 'boolean' && (
              <div style={{
                marginTop: 3,
                marginLeft: 18,
                height: 3,
                background: 'var(--bg-elevated)',
                borderRadius: 2,
                overflow: 'hidden',
                width: '80%',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: cond.met ? 'var(--surplus)' : 'var(--teal)',
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
