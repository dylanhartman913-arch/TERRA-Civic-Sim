import { useTerraStore } from '../../state/store.js';
import campaignsData from '../../data/campaigns.json';
import type { Campaign } from '../../engine/types.js';

const campaigns = (campaignsData as { campaigns: Campaign[] }).campaigns;

interface Props {
  onStart: () => void;
  onFreePlay: () => void;
}

export function CampaignSelect({ onStart, onFreePlay }: Props) {
  const startCampaign = useTerraStore(s => s.startCampaign);
  const freePlayUnlocked = useTerraStore(s => s.freePlayUnlocked);

  function handleStart(campaignId: string) {
    startCampaign(campaignId);
    onStart();
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '24px 28px',
    maxWidth: 340,
    flex: '1 1 300px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      padding: 40,
      gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
          Select Campaign
        </div>
        <div style={{ fontSize: 22, color: 'var(--text-primary)', fontWeight: 500 }}>
          TERRA
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Transition. Energy. Resilience. Regional Analysis.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {campaigns.map(c => (
          <div key={c.campaign_id} style={cardStyle}>
            <div>
              {c.is_pitch_demo && (
                <span style={{
                  fontSize: 10, color: 'var(--amber)', border: '1px solid var(--amber-dim)',
                  borderRadius: 3, padding: '1px 6px', marginBottom: 8, display: 'inline-block',
                }}>
                  PITCH DEMO
                </span>
              )}
              <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
                {c.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                {c.subtitle}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
              <span style={{
                background: 'var(--bg-elevated)', borderRadius: 3, padding: '2px 8px',
              }}>
                {c.estimated_time}
              </span>
              <span style={{
                background: 'var(--bg-elevated)', borderRadius: 3, padding: '2px 8px',
                color: c.difficulty === 'Tutorial' ? 'var(--surplus)' : 'var(--amber)',
              }}>
                {c.difficulty}
              </span>
            </div>

            {c.briefing && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {c.briefing.text.slice(0, 200)}…
              </div>
            )}

            <button
              onClick={() => handleStart(c.campaign_id)}
              style={{
                marginTop: 'auto',
                padding: '10px 0',
                background: 'var(--teal-dim)',
                border: 'none',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Start →
            </button>
          </div>
        ))}

        {/* Free Play card */}
        <div style={{
          ...cardStyle,
          opacity: freePlayUnlocked ? 1 : 0.5,
          border: freePlayUnlocked ? '1px solid var(--teal-dim)' : '1px dashed var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>
              Free Play
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
              {freePlayUnlocked
                ? 'Full sandbox — place any action, any county, any year.'
                : 'Unlocked after completing Campaign 1.'}
            </div>
          </div>

          {!freePlayUnlocked && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--amber)' }}>⬡</span>
              Complete "Wyoming Basin Coal Transition" to unlock
            </div>
          )}

          <button
            onClick={onFreePlay}
            disabled={!freePlayUnlocked}
            style={{
              marginTop: 'auto',
              padding: '10px 0',
              background: freePlayUnlocked ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: freePlayUnlocked ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              cursor: freePlayUnlocked ? 'pointer' : 'not-allowed',
            }}
          >
            {freePlayUnlocked ? 'Enter Free Play →' : 'Locked'}
          </button>
        </div>
      </div>

      {/* Skip to free play for dev/debug */}
      <button
        onClick={onFreePlay}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Skip to free play (debug)
      </button>
    </div>
  );
}
