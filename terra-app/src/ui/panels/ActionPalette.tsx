import { useState, useMemo } from 'react';
import { useTerraStore } from '../../state/store.js';

const BUCKET_ORDER = [
  'energy_generation',
  'energy_demand',
  'energy_storage',
  'energy_transmission',
  'nuclear_fuel_cycle',
  'terrestrial_ecosystem',
  'hydrological_restoration',
  'settlement_social',
  'economic_development',
  'transport',
];

export function ActionPalette() {
  const engineState = useTerraStore(s => s.engineState);
  const enterPlacementMode = useTerraStore(s => s.enterPlacementMode);
  const placementMode = useTerraStore(s => s.placementMode);
  const sessionConfig = useTerraStore(s => s.sessionConfig);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['ENERGY_SUPPLY', 'ENERGY_DEMAND']));

  const grouped = useMemo(() => {
    const actions = engineState.action_library.actions;
    const groups: Record<string, {
      id: string; name: string; unitLabel: string; ttd: number;
      decayPct?: number; maintenanceLag?: number; agCoexistence?: boolean;
    }[]> = {};

    for (const [id, action] of Object.entries(actions)) {
      if (action.category === 'agriculture' && sessionConfig && !sessionConfig.ag_category) continue;
      const q = search.toLowerCase();
      const name = action.action_name ?? action.label ?? id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) continue;

      const bucket = action.bucket ?? action.category ?? 'OTHER';
      if (!groups[bucket]) groups[bucket] = [];
      const decay = (action as Record<string, unknown>).reinvasion_decay as { fraction_retreated_per_year?: number } | undefined;
      const pairingRule = (action as Record<string, unknown>).pairing_rule as { max_lag_years?: number } | undefined;
      groups[bucket].push({
        id,
        name,
        unitLabel: action.unit_label ?? action.unit ?? '',
        ttd: action.time_to_deploy ?? 0,
        decayPct: decay?.fraction_retreated_per_year != null ? Math.round(decay.fraction_retreated_per_year * 100) : undefined,
        maintenanceLag: pairingRule?.max_lag_years,
        agCoexistence: !!action.ag_coexistence,
      });
    }
    return groups;
  }, [engineState.action_library.actions, search, sessionConfig?.ag_category]);

  const buckets = BUCKET_ORDER.filter(b => grouped[b]).concat(
    Object.keys(grouped).filter(b => !BUCKET_ORDER.includes(b))
  );

  const toggleExpand = (bucket: string) => {
    const next = new Set(expanded);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    setExpanded(next);
  };

  return (
    <div style={{
      width: 260,
      height: '100%',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px 8px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Action Palette
        </div>
        <input
          type="text"
          placeholder="Search actions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '5px 8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Action list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {buckets.map(bucket => (
          <div key={bucket}>
            <button
              onClick={() => toggleExpand(bucket)}
              style={{
                width: '100%',
                padding: '6px 12px',
                background: 'var(--bg-elevated)',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 1,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{bucket.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {expanded.has(bucket) ? '▲' : '▼'}
              </span>
            </button>

            {expanded.has(bucket) && (grouped[bucket] ?? []).map(action => {
              const isActive = placementMode?.actionId === action.id;
              return (
                <button
                  key={action.id}
                  onClick={() => {
                    if (isActive) {
                      // handled in store
                    } else {
                      enterPlacementMode(action.id);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: isActive ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                >
                  <div style={{
                    color: isActive ? 'var(--teal)' : 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                  }}>
                    {action.name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                    {action.unitLabel} · {action.ttd}yr deploy
                  </div>
                  {action.decayPct != null && (
                    <div style={{ color: 'var(--warning)', fontSize: 9, marginTop: 2 }}>
                      ⚠ {action.decayPct}%/yr re-invasion — pair with maintenance{action.maintenanceLag != null ? ` within ${action.maintenanceLag}yr` : ''}
                    </div>
                  )}
                  {action.agCoexistence && (
                    <div style={{ color: 'rgba(139,92,246,0.8)', fontSize: 9, marginTop: 2 }}>
                      ◈ ag coexistence — check competition preview before commit
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Active placement indicator */}
      {placementMode && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(45, 212, 191, 0.1)',
          borderTop: '1px solid var(--teal-dim)',
          fontSize: 11,
          color: 'var(--teal)',
          fontFamily: 'var(--font-mono)',
        }}>
          Placement mode: {placementMode.action.action_name ?? placementMode.actionId}
          <button
            onClick={() => useTerraStore.getState().exitPlacementMode()}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
