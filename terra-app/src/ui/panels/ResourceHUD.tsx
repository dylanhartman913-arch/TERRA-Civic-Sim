import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTerraStore } from '../../state/store.js';
import { computeConsumption, getEraForYear } from '../../engine/budgets.js';
import { usePoolHistory } from '../../state/selectors.js';

// Pool definitions — order matches EraBudget field order
interface PoolDef {
  key: string;
  label: string;
  budgetKey: 'capital_cost_usd' | 'labor_years' | 'steel_tons' | 'concrete_tons' | 'HALEU_kg' | 'transmission_row_miles';
  consumedKey: 'capital_cost_usd' | 'labor_years' | 'steel_tons' | 'concrete_tons' | 'HALEU_kg' | 'transmission_row_miles';
  format: (v: number) => string;
}

const POOLS: PoolDef[] = [
  {
    key: 'capital',
    label: 'Capital',
    budgetKey: 'capital_cost_usd',
    consumedKey: 'capital_cost_usd',
    format: (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`,
  },
  {
    key: 'labor',
    label: 'Labor',
    budgetKey: 'labor_years',
    consumedKey: 'labor_years',
    format: (v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M yr` : v >= 1000 ? `${(v / 1000).toFixed(0)}k yr` : `${Math.round(v)} yr`,
  },
  {
    key: 'steel',
    label: 'Steel',
    budgetKey: 'steel_tons',
    consumedKey: 'steel_tons',
    format: (v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}Mt` : v >= 1000 ? `${(v / 1000).toFixed(0)}kt` : `${Math.round(v)}t`,
  },
  {
    key: 'concrete',
    label: 'Concrete',
    budgetKey: 'concrete_tons',
    consumedKey: 'concrete_tons',
    format: (v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}Mt` : v >= 1000 ? `${(v / 1000).toFixed(0)}kt` : `${Math.round(v)}t`,
  },
  {
    key: 'HALEU',
    label: 'HALEU',
    budgetKey: 'HALEU_kg',
    consumedKey: 'HALEU_kg',
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)} kg`,
  },
  {
    key: 'tx_row',
    label: 'TX ROW',
    budgetKey: 'transmission_row_miles',
    consumedKey: 'transmission_row_miles',
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k mi` : `${Math.round(v)} mi`,
  },
];

// Threshold colors using CSS variables
function chipColor(pct: number): string {
  if (pct >= 0.85) return 'var(--deficit)';
  if (pct >= 0.60) return 'var(--warning)';
  return 'var(--teal)';
}

// Percentage-safe integer allocation: ensures shares sum exactly to 100
function allocateShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floored = raw.map(Math.floor);
  const remainder = 100 - floored.reduce((s, v) => s + v, 0);
  // Add 1 to the entries with the largest fractional part
  const indexed = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }));
  indexed.sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < remainder; j++) {
    floored[indexed[j].i] += 1;
  }
  return floored;
}

interface ItemizedEntry {
  actionName: string;
  geoid: string;
  amount: number;
  share: number; // integer percentage
}

// Pool utilization sparkline — mini 80x20 SVG
const POOL_INDICATOR_MAP: Record<string, string> = {
  HALEU: 'pool_utilization_HALEU_kg_per_year',
  fuel_fab: 'pool_utilization_fuel_fabrication_units_per_year',
};

function PoolSparkline({ poolKey }: { poolKey: string }) {
  const indicatorId = POOL_INDICATOR_MAP[poolKey];
  const poolData = usePoolHistory(indicatorId ?? '');

  const svgContent = useMemo(() => {
    if (poolData.length < 2) return null;
    const values = poolData.filter(d => d.value != null).map(d => d.value as number);
    if (values.length < 2) return null;
    const w = 80, h = 20;
    const minV = 0;
    const maxV = Math.max(...values, 0.01);
    const xStep = w / (values.length - 1);
    const points = values.map((v, i) => `${(i * xStep).toFixed(1)},${(h - ((v - minV) / (maxV - minV || 1)) * h).toFixed(1)}`).join(' ');
    return points;
  }, [poolData]);

  if (!indicatorId || !svgContent) return null;

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>Utilization history</div>
      <svg width={80} height={20} style={{ display: 'block' }}>
        <polyline points={svgContent} fill="none" stroke="var(--teal)" strokeWidth={1} opacity={0.7} />
      </svg>
    </div>
  );
}

interface PopoverProps {
  pool: PoolDef;
  consumed: number;
  items: ItemizedEntry[];
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function PoolPopover({ pool, consumed, items, onClose, anchorRef }: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
        minWidth: 220,
        zIndex: 400,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'all',
      }}
    >
      <div style={{ color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 9 }}>
        {pool.label} · {pool.format(consumed)} consumed
      </div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No builds queued this era</div>
      ) : (
        items.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {item.actionName}
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{item.geoid.slice(-5)}</span>
            </span>
            <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {pool.format(item.amount)} <span style={{ color: 'var(--text-muted)' }}>{item.share}%</span>
            </span>
          </div>
        ))
      )}
      {/* Pool utilization sparkline */}
      <PoolSparkline poolKey={pool.key} />
    </div>
  );
}

export function ResourceHUD() {
  const actionLog = useTerraStore(s => s.actionLog);
  const engineState = useTerraStore(s => s.engineState);
  const remainingBudget = useTerraStore(s => s.remainingBudget);
  const hudOpenChip = useTerraStore(s => s.hudOpenChip);
  const setPoolHighlightGeoids = useTerraStore(s => s.setPoolHighlightGeoids);
  const setHudOpenChip = useTerraStore(s => s.setHudOpenChip);

  const [hoverChip, setHoverChip] = useState<string | null>(null);
  const [clickChip, setClickChip] = useState<string | null>(null);

  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // When hudOpenChip is set externally (e.g., from PlacementOverlay overflow), open that chip
  useEffect(() => {
    if (hudOpenChip && hudOpenChip !== clickChip) {
      setClickChip(hudOpenChip);
    }
  }, [hudOpenChip]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentYear = engineState.year;
  const currentEra = getEraForYear(currentYear);

  // Compute consumed = total - remaining for each pool
  const consumed: Record<string, number> = {
    capital: currentEra.capital_cost_usd - remainingBudget.capital_cost_usd,
    labor: currentEra.labor_years - remainingBudget.labor_years,
    steel: currentEra.steel_tons - remainingBudget.steel_tons,
    concrete: currentEra.concrete_tons - remainingBudget.concrete_tons,
    HALEU: currentEra.HALEU_kg - remainingBudget.HALEU_kg,
    tx_row: currentEra.transmission_row_miles - remainingBudget.transmission_row_miles,
  };

  // Compute itemized breakdown per pool from current-era action log
  const itemizedByPool = useCallback((pool: PoolDef): ItemizedEntry[] => {
    const actionLibrary = engineState.action_library.actions;
    const eraEntries = actionLog.filter(
      (e) => e.year >= currentEra.era_start && e.year < currentEra.era_end
    );

    const raw: { actionName: string; geoid: string; amount: number }[] = [];
    for (const entry of eraEntries) {
      const action = actionLibrary[entry.actionId];
      if (!action) continue;
      const consumption = computeConsumption(action, entry.magnitude);
      const amount = consumption[pool.consumedKey] as number;
      if (amount > 0) {
        raw.push({
          actionName: action.action_name ?? action.action_id ?? entry.actionId,
          geoid: entry.geoid,
          amount,
        });
      }
    }

    // Enforce exact share allocation
    const amounts = raw.map((r) => r.amount);
    const shares = allocateShares(amounts);
    return raw.map((r, i) => ({ ...r, share: shares[i] }));
  }, [actionLog, engineState.action_library.actions, currentEra]);

  const handleChipClick = useCallback((pool: PoolDef) => {
    const isOpen = clickChip === pool.key;
    if (isOpen) {
      setClickChip(null);
      setHudOpenChip(null);
      setPoolHighlightGeoids(null);
    } else {
      setClickChip(pool.key);
      setHudOpenChip(null); // clear external request
      // Compute highlight geoids: counties with any draw from this pool this era
      const actionLibrary = engineState.action_library.actions;
      const eraEntries = actionLog.filter(
        (e) => e.year >= currentEra.era_start && e.year < currentEra.era_end
      );
      const geoids = new Set<string>();
      for (const entry of eraEntries) {
        const action = actionLibrary[entry.actionId];
        if (!action) continue;
        const c = computeConsumption(action, entry.magnitude);
        if ((c[pool.consumedKey] as number) > 0) {
          geoids.add(entry.geoid);
        }
      }
      setPoolHighlightGeoids(geoids.size > 0 ? Array.from(geoids) : null);
    }
  }, [clickChip, actionLog, engineState.action_library.actions, currentEra, setPoolHighlightGeoids, setHudOpenChip]);

  const openChipKey = clickChip ?? hoverChip;

  // Era name for display
  const ERA_NAMES: Record<number, string> = {
    2025: 'Foundation Era',
    2035: 'Transition Era',
    2045: 'Buildout Era',
    2055: 'Steady State Era',
  };
  const eraName = ERA_NAMES[currentEra.era_start] ?? `Era ${currentEra.era_start}`;

  return (
    <div
      style={{
        height: 44,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 12px',
        flexShrink: 0,
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        position: 'relative',
      }}
      // Click on HUD background clears chip selection
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setClickChip(null);
          setHudOpenChip(null);
          setPoolHighlightGeoids(null);
        }
      }}
    >
      {/* Era label */}
      <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5, marginRight: 8, whiteSpace: 'nowrap' }}>
        {eraName}
      </div>

      {POOLS.map((pool) => {
        const cons = Math.max(0, consumed[pool.key] ?? 0);
        const total = currentEra[pool.budgetKey] as number;
        const pct = total > 0 ? cons / total : 0;
        const color = chipColor(pct);
        const isOpen = openChipKey === pool.key;
        const items = isOpen ? itemizedByPool(pool) : [];
        const chipRef = { current: chipRefs.current[pool.key] ?? null } as React.RefObject<HTMLDivElement | null>;

        return (
          <div
            key={pool.key}
            ref={(el) => { chipRefs.current[pool.key] = el; }}
            style={{ position: 'relative' }}
            onMouseEnter={() => !clickChip && setHoverChip(pool.key)}
            onMouseLeave={() => setHoverChip(null)}
          >
            {/* Chip */}
            <div
              onClick={() => handleChipClick(pool)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: isOpen ? 'var(--bg-elevated)' : 'transparent',
                border: `1px solid ${isOpen ? 'var(--border)' : 'transparent'}`,
                minWidth: 80,
                transition: 'background 0.15s',
              }}
            >
              {/* Label + value row */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {pool.label}
                </span>
                <span style={{ fontSize: 11, color, fontWeight: 500 }}>
                  {pool.format(cons)}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  / {pool.format(total)}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                width: '100%',
                height: 3,
                background: 'var(--bg-elevated)',
                borderRadius: 2,
                marginTop: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(100, pct * 100).toFixed(1)}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>

            {/* Popover — shown on hover or click */}
            {isOpen && (
              <PoolPopover
                pool={pool}
                consumed={cons}
                items={items}
                onClose={() => {
                  setClickChip(null);
                  setHudOpenChip(null);
                  setPoolHighlightGeoids(null);
                }}
                anchorRef={chipRef}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
