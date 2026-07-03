import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';

export function HintToast() {
  const activeCampaign = useTerraStore(s => s.activeCampaign);
  const campaignAct = useTerraStore(s => s.campaignAct);
  const campaignHintIndex = useTerraStore(s => s.campaignHintIndex);
  const campaignComplete = useTerraStore(s => s.campaignComplete);
  const [dismissed, setDismissed] = useState(false);

  const act3 = activeCampaign?.acts?.['act_3'];
  const hints = act3?.hints ?? [];
  const currentHint = hints[campaignHintIndex];

  if (!activeCampaign || campaignAct !== 3 || !currentHint || campaignComplete) {
    return null;
  }

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        style={{
          position: 'fixed',
          bottom: 80,
          left: 12,
          zIndex: 150,
          background: 'var(--bg-surface)',
          border: '1px solid var(--amber-dim)',
          borderRadius: 4,
          padding: '6px 12px',
          color: 'var(--amber)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Show hint ({campaignHintIndex + 1}/{hints.length})
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 12,
      zIndex: 150,
      maxWidth: 300,
      background: 'var(--bg-surface)',
      border: '1px solid var(--amber-dim)',
      borderRadius: 8,
      padding: '14px 16px',
      fontFamily: 'var(--font-mono)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--amber)', fontSize: 12 }}>→</span>
          <span style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Hint {campaignHintIndex + 1} of {hints.length}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
          title="Dismiss hint"
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 500, marginBottom: 6 }}>
        {currentHint.action_id.replace(/_/g, ' ')}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {currentHint.text}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        Target: county {currentHint.target_geoid}
      </div>

      {/* Pulsing border animation for target emphasis */}
      <style>{`
        @keyframes hint-pulse {
          0%, 100% { border-color: var(--amber-dim); }
          50% { border-color: var(--amber); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .hint-toast-active {
            animation: hint-pulse 2s ease-in-out infinite;
          }
        }
      `}</style>
    </div>
  );
}
