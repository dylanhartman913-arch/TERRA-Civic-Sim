import { useState, useEffect } from 'react';

const TOOLTIPS = [
  {
    id: 'map',
    title: 'The Map',
    text: 'This is Wyoming and the Mountain West. 157 counties, 75 power system nodes. Click any county to see its energy baseline.',
    position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  },
  {
    id: 'metric',
    title: 'Metric Selector',
    text: 'Change the choropleth to show energy capital (E), equity capital (Ec), or social capital (S).',
    position: { top: 160, left: 12 },
  },
  {
    id: 'palette',
    title: 'Action Palette',
    text: 'Choose an action to place — from utility wind to workforce retraining. Click to enter placement mode.',
    position: { top: '50%', left: 12, transform: 'translateY(-50%)' },
  },
  {
    id: 'turns',
    title: 'Year Controls',
    text: 'Press End Turn to advance one year. Builds queue, events fire, the world changes.',
    position: { bottom: 80, left: '50%', transform: 'translateX(-50%)' },
  },
  {
    id: 'quest',
    title: 'Quest Tracker',
    text: 'Choose a scenario target and watch your progress in real time. Conditions update each year.',
    position: { top: 260, left: 12 },
  },
];

const STORAGE_KEY = 'terra_onboarding_complete';

export function OnboardingTooltips() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch { /* no localStorage */ }
  }, []);

  function skipAll() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
    setVisible(false);
  }

  function next() {
    if (step >= TOOLTIPS.length - 1) {
      skipAll();
    } else {
      setStep(s => s + 1);
    }
  }

  if (!visible) return null;

  const tooltip = TOOLTIPS[step];

  return (
    <>
      {/* Dim overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 400,
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'fixed',
        ...tooltip.position,
        zIndex: 401,
        background: 'var(--bg-surface)',
        border: '1px solid var(--teal-dim)',
        borderRadius: 8,
        padding: '16px 20px',
        maxWidth: 280,
        fontFamily: 'var(--font-mono)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {TOOLTIPS.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: i <= step ? 'var(--teal)' : 'var(--bg-elevated)',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 500, marginBottom: 6 }}>
          {tooltip.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
          {tooltip.text}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={skipAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            Skip all
          </button>
          <button
            onClick={next}
            style={{
              padding: '6px 14px',
              background: 'var(--teal-dim)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {step >= TOOLTIPS.length - 1 ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}
