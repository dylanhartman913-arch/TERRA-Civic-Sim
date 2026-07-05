import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { AnnotationTrigger } from '../../engine/types.js';

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

/** Map AutoPauseReason → AnnotationTrigger (null = no annotation prompt). */
function reasonToTrigger(reason: string): AnnotationTrigger | null {
  if (reason === 'build_complete' || reason === 'coupling_activated') return 'build_decision';
  if (reason === 'event_fired') return 'disturbance_event';
  if (reason === 'era_transition') return 'era_transition';
  return null;
}

export function AutoPauseModal() {
  const pendingAutoPause = useTerraStore(s => s.pendingAutoPause);
  const dismissAutoPause = useTerraStore(s => s.dismissAutoPause);
  const setShowEraReport = useTerraStore(s => s.setShowEraReport);
  const sessionMeta = useTerraStore(s => s.sessionMeta);
  const sessionConfig = useTerraStore(s => s.sessionConfig);
  const addAnnotation = useTerraStore(s => s.addAnnotation);
  const engineState = useTerraStore(s => s.engineState);

  const [annotationText, setAnnotationText] = useState('');

  if (!pendingAutoPause) return null;

  const { reason, event, detail } = pendingAutoPause;
  let icon = REASON_ICONS[reason] ?? '\u2139';
  if (reason === 'event_fired' && event) {
    icon = CATEGORY_ICONS[event.category] ?? icon;
  }
  const title = reason === 'event_fired' && event
    ? event.title
    : REASON_TITLES[reason] ?? reason;

  // Resolve annotation prompt (only in session mode with a matching trigger)
  const triggerType = reasonToTrigger(reason);
  const annotationPrompt = sessionMeta && triggerType
    ? (sessionConfig?.annotation_prompts?.find(p => p.trigger === triggerType)?.prompt ?? null)
    : null;

  // Build trigger_id for the annotation
  const triggerId = event?.event_id ?? `${reason}_y${engineState.year}`;

  function handleContinue() {
    if (annotationPrompt && annotationText.trim() && triggerType) {
      addAnnotation({
        year: engineState.year,
        trigger_type: triggerType,
        trigger_id: triggerId,
        prompt: annotationPrompt,
        text: annotationText.trim(),
      });
    }
    setAnnotationText('');
    if (reason === 'era_transition') setShowEraReport(true);
    dismissAutoPause();
  }

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

        {/* Annotation prompt — only shown in session mode with a matching trigger */}
        {annotationPrompt && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--teal)', marginBottom: 5, letterSpacing: 0.5 }}>
              {annotationPrompt}
            </div>
            <textarea
              value={annotationText}
              onChange={e => setAnnotationText(e.target.value)}
              placeholder="Your response (optional)"
              rows={2}
              style={{
                width: '100%',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '6px 8px',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <button
          onClick={handleContinue}
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
