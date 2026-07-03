import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';
import scenarioData from '../../data/scenario_profiles.json';
import type { ScenarioProfile } from '../../engine/types.js';
import type { Campaign } from '../../engine/types.js';

interface Props {
  campaign: Campaign;
}

export function ConfiguratorScreen({ campaign }: Props) {
  const advanceCampaignAct = useTerraStore(s => s.advanceCampaignAct);
  const setActiveScenario = useTerraStore(s => s.setActiveScenario);
  const profiles = (scenarioData as { profiles: ScenarioProfile[] }).profiles;

  const cfg = campaign.acts?.['act_2']?.configurator;
  const sliders = cfg?.sliders ?? [];

  const [sliderValues, setSliderValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of sliders) init[s.metric] = s.default;
    return init;
  });

  function handleConfirm() {
    // Set the preselected profile as active scenario
    const profile = profiles.find(p => p.profile_id === cfg?.preselected_profile);
    if (profile) setActiveScenario(profile);
    advanceCampaignAct();
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '32px 36px',
        maxWidth: 500,
        width: '90%',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>
          Act II
        </div>
        <div style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 8 }}>
          {campaign.acts?.['act_2']?.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          {campaign.acts?.['act_2']?.description}
        </div>

        {/* Sliders */}
        {sliders.map(slider => (
          <div key={slider.metric} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{slider.label}</span>
              <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 500 }}>
                {sliderValues[slider.metric]?.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={0.05}
              value={sliderValues[slider.metric] ?? slider.default}
              onChange={e => setSliderValues(v => ({ ...v, [slider.metric]: parseFloat(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--teal)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>{slider.min}</span>
              <span>{slider.max}</span>
            </div>
          </div>
        ))}

        {/* Scenario matrix reference */}
        {cfg?.show_scenario_matrix && (
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Reference Scenarios
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {profiles.map(p => (
                <div key={p.profile_id} style={{
                  background: p.profile_id === cfg.preselected_profile ? 'var(--teal-dim)' : 'var(--bg-elevated)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 10,
                  color: p.profile_id === cfg.preselected_profile ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleConfirm}
          style={{
            width: '100%',
            padding: '12px 0',
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
          {cfg?.confirm_button ?? 'Lock in my targets'}
        </button>
      </div>
    </div>
  );
}
