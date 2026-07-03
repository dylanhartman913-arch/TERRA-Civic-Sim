import { useTerraStore } from '../../state/store.js';
import { computeEesSummary } from '../../engine/engine.js';

interface Props {
  onExport: () => void;
  onPlayAgain: () => void;
  onFreePlay: () => void;
}

export function CampaignOutcome({ onExport, onPlayAgain, onFreePlay }: Props) {
  const campaignOutcome = useTerraStore(s => s.campaignOutcome);
  const questConditions = useTerraStore(s => s.questConditions);
  const engineState = useTerraStore(s => s.engineState);
  const activeCampaign = useTerraStore(s => s.activeCampaign);

  if (!campaignOutcome || !activeCampaign) return null;

  const isVictory = campaignOutcome === 'victory';
  const summary = computeEesSummary(engineState);
  const sa = summary.study_area;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 500,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isVictory ? 'var(--surplus)' : 'var(--deficit)'}`,
        borderRadius: 12,
        padding: '36px 40px',
        maxWidth: 520,
        width: '90%',
      }}>
        {/* Header */}
        <div style={{
          fontSize: 11,
          color: isVictory ? 'var(--surplus)' : 'var(--deficit)',
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginBottom: 10,
        }}>
          {isVictory ? 'Victory' : 'Defeat'}
        </div>
        <div style={{ fontSize: 20, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 8 }}>
          {isVictory
            ? 'Supply gap closed. Coupling activated. Wyoming 2032.'
            : 'The gap wasn\'t closed in time.'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>
          {activeCampaign.title} — Year {engineState.year}
        </div>

        {/* Win/loss condition checklist */}
        <div style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '16px 0',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Conditions
          </div>
          {questConditions.map(cond => (
            <div key={cond.condition_id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '6px 0',
            }}>
              <span style={{
                color: cond.met ? 'var(--surplus)' : 'var(--deficit)',
                fontSize: 14,
                flexShrink: 0,
              }}>
                {cond.met ? '✓' : '✗'}
              </span>
              <div>
                <div style={{ fontSize: 11, color: cond.met ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {cond.label}
                </div>
                {!cond.met && cond.unit !== 'boolean' && (
                  <div style={{ fontSize: 10, color: 'var(--deficit)', marginTop: 2 }}>
                    {cond.current_value.toFixed(2)} / target {cond.target_value} {cond.unit}
                    {' — gap: '}{Math.abs(cond.distance).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* EES summary */}
        {isVictory && (
          <div style={{
            display: 'flex',
            gap: 20,
            marginBottom: 24,
          }}>
            {[
              { label: 'E', value: sa.E, base: sa.E_baseline, color: 'var(--teal)' },
              { label: 'Ec', value: sa.Ec, base: sa.Ec_baseline, color: 'var(--purple)' },
              { label: 'S', value: sa.S, base: sa.S_baseline, color: 'var(--amber)' },
            ].map(({ label, value, base, color }) => (
              <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, color, fontWeight: 500 }}>{value.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: value >= base ? 'var(--surplus)' : 'var(--deficit)', marginTop: 2 }}>
                  {value >= base ? '▲' : '▼'} vs {base.toFixed(2)} baseline
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {isVictory && (
            <button
              onClick={onExport}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Export run
            </button>
          )}
          <button
            onClick={onPlayAgain}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {isVictory ? 'Play again' : 'Try again'}
          </button>
          {isVictory && (
            <button
              onClick={onFreePlay}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'var(--teal-dim)',
                border: 'none',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Free play →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
