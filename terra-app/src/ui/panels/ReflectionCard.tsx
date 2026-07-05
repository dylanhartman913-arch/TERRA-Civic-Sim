/**
 * ReflectionCard — session-end summary panel.
 *
 * Reads directly from engine state (not selectors) so it works regardless
 * of which county is selected. All derived values use the same arithmetic
 * as CountyYields / EraReport to guarantee consistency.
 *
 * Sources:
 *   Built assets  — asset_registry (origin=player, lifecycle≠retired, class≠site)
 *   Retired assets — asset_registry (lifecycle=retired, or scheduled before max_year)
 *   Fiscal delta   — county_fiscal.ledger_*_cumulative_delta + property_tax_delta sum
 *   Jobs           — history[last].counties[geoid].labor_utilization × population
 *   Annotations    — store.annotations (chronological)
 */

import { useMemo } from 'react';
import { useTerraStore } from '../../state/store.js';
import { computeFiscalNetDelta } from '../../state/selectors.js';

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtMw(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} GW`;
  return `${Math.round(v)} MW`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9,
      color: 'var(--text-muted)',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)',
      paddingBottom: 4,
      marginBottom: 8,
      marginTop: 16,
    }}>
      {children}
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive == null ? 'var(--text-primary)' : positive ? 'var(--teal)' : 'var(--deficit)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ReflectionCard() {
  const showReflectionCard = useTerraStore(s => s.showReflectionCard);
  const setShowReflectionCard = useTerraStore(s => s.setShowReflectionCard);
  const sessionMeta = useTerraStore(s => s.sessionMeta);
  const annotations = useTerraStore(s => s.annotations);
  const engineState = useTerraStore(s => s.engineState);
  const activeScenario = useTerraStore(s => s.activeScenario);
  const exportScenario = useTerraStore(s => s.exportScenario);

  // Derive built/retired asset summaries
  const { builtAssets, retiredAssets, fiscalNet, totalBuiltMw, eesDeltas } = useMemo(() => {
    const reg = engineState.asset_registry;
    const year = engineState.year;

    const built = reg.filter(
      a => a.origin === 'player' &&
           a.asset_class !== 'site' &&
           a.asset_class !== 'housing_stock' &&
           a.lifecycle !== 'retired',
    );

    const retired = reg.filter(
      a => a.lifecycle === 'retired' ||
           (a.scheduled_retirement_year != null && a.scheduled_retirement_year <= year),
    );

    // Aggregate fiscal delta across all WY counties
    let totalFiscalNet = 0;
    for (const cf of Object.values(engineState.county_fiscal)) {
      totalFiscalNet += computeFiscalNetDelta(cf);
    }

    // Total player-built MW
    const mw = built.reduce((s, a) => s + (a.capacity_mw ?? 0), 0);

    // Study-area EES at start vs now
    const history = engineState.history ?? [];
    const firstSnap = history[0]?.study;
    const lastSnap = history[history.length - 1]?.study;
    const eesDelta = firstSnap && lastSnap ? {
      E:  (lastSnap.E  ?? 0) - (firstSnap.E  ?? 0),
      Ec: (lastSnap.Ec ?? 0) - (firstSnap.Ec ?? 0),
      S:  (lastSnap.S  ?? 0) - (firstSnap.S  ?? 0),
    } : null;

    return {
      builtAssets: built,
      retiredAssets: retired,
      fiscalNet: totalFiscalNet,
      totalBuiltMw: mw,
      eesDeltas: eesDelta,
    };
  }, [engineState]);

  if (!showReflectionCard) return null;

  const label = sessionMeta?.participant_label ?? 'Anonymous';
  const code  = sessionMeta?.session_code ?? '';
  const year  = engineState.year;
  const scenarioName = activeScenario?.name ?? 'Free Play';

  // Group built assets by type for a compact display
  const builtByType: Record<string, { count: number; mw: number }> = {};
  for (const a of builtAssets) {
    const key = a.action_id ?? a.type ?? 'unknown';
    if (!builtByType[key]) builtByType[key] = { count: 0, mw: 0 };
    builtByType[key].count++;
    builtByType[key].mw += a.capacity_mw ?? 0;
  }

  // Retired asset names (de-duped)
  const retiredNames = [...new Set(retiredAssets.map(a => a.name ?? a.type))];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(13, 17, 23, 0.8)',
      zIndex: 250,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 24,
        width: 480,
        maxHeight: '88vh',
        overflowY: 'auto',
        color: 'var(--text-primary)',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Session Report</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
            {label}{code ? ` · ${code}` : ''} · {scenarioName} · Year {year}
          </div>
        </div>

        {/* EES trajectory */}
        {eesDeltas && (
          <>
            <SectionHeader>Energy · Equity · Stability</SectionHeader>
            <Row
              label="Energy Capital (E)"
              value={(eesDeltas.E >= 0 ? '+' : '') + eesDeltas.E.toFixed(3)}
              positive={eesDeltas.E >= 0}
            />
            <Row
              label="Economic Capital (Ec)"
              value={(eesDeltas.Ec >= 0 ? '+' : '') + eesDeltas.Ec.toFixed(3)}
              positive={eesDeltas.Ec >= 0}
            />
            <Row
              label="Social Capital (S)"
              value={(eesDeltas.S >= 0 ? '+' : '') + eesDeltas.S.toFixed(3)}
              positive={eesDeltas.S >= 0}
            />
          </>
        )}

        {/* Fiscal summary */}
        <SectionHeader>Fiscal Impact (study area)</SectionHeader>
        <Row
          label="Net revenue delta"
          value={fmt$(fiscalNet)}
          positive={fiscalNet >= 0}
        />

        {/* Built assets */}
        <SectionHeader>
          Built — {fmtMw(totalBuiltMw)} across {builtAssets.length} project{builtAssets.length !== 1 ? 's' : ''}
        </SectionHeader>
        {Object.entries(builtByType).length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No player-built projects yet.</div>
        )}
        {Object.entries(builtByType).map(([type, { count, mw }]) => (
          <Row
            key={type}
            label={type.replace(/_/g, ' ')}
            value={`${count}× · ${fmtMw(mw)}`}
          />
        ))}

        {/* Retired assets */}
        {retiredNames.length > 0 && (
          <>
            <SectionHeader>Retired / Decommissioned</SectionHeader>
            {retiredNames.slice(0, 8).map(name => (
              <div key={name} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>
                · {name}
              </div>
            ))}
            {retiredNames.length > 8 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                +{retiredNames.length - 8} more
              </div>
            )}
          </>
        )}

        {/* Annotations — chronological narrative thread */}
        {annotations.length > 0 && (
          <>
            <SectionHeader>Your Notes</SectionHeader>
            {annotations.map(ann => (
              <div key={ann.id} style={{
                background: 'var(--bg-base)',
                borderRadius: 4,
                padding: '8px 10px',
                marginBottom: 6,
                borderLeft: '2px solid var(--teal-dim)',
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Year {ann.year} · {ann.trigger_type.replace('_', ' ')}
                  {ann.prompt ? ` — ${ann.prompt}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {ann.text}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => { exportScenario(); }}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'var(--teal-dim)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Export .terra.json
          </button>
          <button
            onClick={() => setShowReflectionCard(false)}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Continue Playing
          </button>
        </div>
      </div>
    </div>
  );
}
