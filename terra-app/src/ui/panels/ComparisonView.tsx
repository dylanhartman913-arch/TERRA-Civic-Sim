import { useRef } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { Trajectory } from '../../engine/types.js';
import { importFromJson } from '../../engine/persistence.js';

// ── Simple SVG Line Chart ───────────────────────────────────────────────────

function LineChart({
  years,
  seriesA,
  seriesB,
  nameA,
  nameB,
  label,
}: {
  years: number[];
  seriesA: number[];
  seriesB: number[];
  nameA: string;
  nameB: string;
  label: string;
}) {
  const w = 320, h = 80;
  const pad = { top: 8, right: 8, bottom: 20, left: 32 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  if (years.length < 2) return <div style={{ height: h, color: 'var(--text-muted)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data</div>;

  const minY = Math.min(...seriesA, ...seriesB, 0);
  const maxY = Math.max(...seriesA, ...seriesB, 1);
  const yRange = maxY - minY || 1;
  const minX = years[0];
  const maxX = years[years.length - 1];
  const xRange = maxX - minX || 1;

  const px = (year: number) => pad.left + ((year - minX) / xRange) * chartW;
  const py = (val: number) => pad.top + chartH - ((val - minY) / yRange) * chartH;

  const makePath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(years[i]).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  const yTicks = [minY, (minY + maxY) / 2, maxY].map(v => Math.round(v * 100) / 100);

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        {/* Y-axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left - 4} y1={py(t)} x2={pad.left} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 6} y={py(t) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">{t.toFixed(2)}</text>
          </g>
        ))}
        {/* Axis */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="var(--border)" strokeWidth={1} />
        <line x1={pad.left} y1={pad.top + chartH} x2={pad.left + chartW} y2={pad.top + chartH} stroke="var(--border)" strokeWidth={1} />
        {/* X-axis labels */}
        <text x={px(minX)} y={h - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{minX}</text>
        <text x={px(maxX)} y={h - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{maxX}</text>
        {/* Lines */}
        {seriesA.length > 0 && <path d={makePath(seriesA)} fill="none" stroke="var(--teal)" strokeWidth={1.5} />}
        {seriesB.length > 0 && <path d={makePath(seriesB)} fill="none" stroke="var(--amber, #f59e0b)" strokeWidth={1.5} strokeDasharray="4,2" />}
        {/* Legend */}
        <rect x={pad.left + chartW - 80} y={pad.top} width={8} height={4} fill="var(--teal)" />
        <text x={pad.left + chartW - 70} y={pad.top + 4} fontSize={8} fill="var(--text-secondary)">{nameA.slice(0, 12)}</text>
        <rect x={pad.left + chartW - 80} y={pad.top + 10} width={8} height={2} fill="var(--amber, #f59e0b)" />
        <text x={pad.left + chartW - 70} y={pad.top + 14} fontSize={8} fill="var(--text-secondary)">{nameB.slice(0, 12)}</text>
      </svg>
    </div>
  );
}

// ── Bar Chart (material ledger) ─────────────────────────────────────────────

function BarPair({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1);
  const barW = 80;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        <div style={{ width: (a / max) * barW, height: 14, background: 'var(--teal)', opacity: 0.8, minWidth: a > 0 ? 2 : 0 }} />
        <span style={{ fontSize: 10, color: 'var(--teal)', minWidth: 40 }}>{formatNum(a)}</span>
        <div style={{ width: (b / max) * barW, height: 14, background: 'var(--amber, #f59e0b)', opacity: 0.8, minWidth: b > 0 ? 2 : 0 }} />
        <span style={{ fontSize: 10, color: 'var(--amber, #f59e0b)', minWidth: 40 }}>{formatNum(b)}</span>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n === 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(1);
}

// ── Quest checklist ─────────────────────────────────────────────────────────

function QuestList({ traj }: { traj: Trajectory | null }) {
  if (!traj) return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No scenario</div>;
  const finalConditions = traj.quest_conditions_by_year[traj.quest_conditions_by_year.length - 1] ?? [];
  if (finalConditions.length === 0) return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Free Play</div>;
  return (
    <div>
      {finalConditions.map(c => (
        <div key={c.condition_id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: c.met ? 'var(--surplus)' : 'var(--deficit)', fontSize: 12 }}>
            {c.met ? '✓' : '✗'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── File loader button ──────────────────────────────────────────────────────

function FileLoader({ slot, label }: { slot: 0 | 1; label: string }) {
  const loadComparisonFile = useTerraStore(s => s.loadComparisonFile);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      const parsed = importFromJson(json);
      if (parsed) loadComparisonFile(slot, parsed);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept=".json" onChange={handleFile} style={{ display: 'none' }} />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          padding: '4px 10px',
          background: 'var(--teal-dim)',
          border: 'none',
          borderRadius: 4,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}

// ── Main ComparisonView ─────────────────────────────────────────────────────

export function ComparisonView() {
  const comparisonMode = useTerraStore(s => s.comparisonMode);
  const comparisonFiles = useTerraStore(s => s.comparisonFiles);
  const comparisonTrajectories = useTerraStore(s => s.comparisonTrajectories);
  const exitComparisonMode = useTerraStore(s => s.exitComparisonMode);

  if (!comparisonMode) return null;

  const [fileA, fileB] = comparisonFiles;
  const [trajA, trajB] = comparisonTrajectories;

  const nameA = fileA?.name ?? 'Scenario A';
  const nameB = fileB?.name ?? 'Scenario B';

  // Merge year axis
  const allYears = Array.from(new Set([...(trajA?.years ?? []), ...(trajB?.years ?? [])])).sort((a, b) => a - b);

  const interpolate = (traj: Trajectory | null, field: 'E' | 'Ec' | 'S') => {
    if (!traj) return allYears.map(() => 0);
    return allYears.map(y => {
      const idx = traj.years.indexOf(y);
      return idx >= 0 ? traj[field][idx] : 0;
    });
  };

  // Material ledger — derive from action log lengths (simplified since trajectory doesn't store full ledger)
  const haleuA = fileA?.actionLog.filter(e => e.actionId.includes('smr') || e.actionId.includes('nuclear')).length ?? 0;
  const haleuB = fileB?.actionLog.filter(e => e.actionId.includes('smr') || e.actionId.includes('nuclear')).length ?? 0;
  const actionsA = fileA?.actionLog.length ?? 0;
  const actionsB = fileB?.actionLog.length ?? 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(13, 17, 23, 0.95)',
      zIndex: 300,
      overflow: 'auto',
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-primary)',
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Scenario Comparison</div>
          <button
            onClick={exitComparisonMode}
            style={{ padding: '6px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>

        {/* Scenario headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 8, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 12, borderLeft: '2px solid var(--teal)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>SCENARIO A</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{nameA}</div>
            <FileLoader slot={0} label="Load A" />
            {fileA && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Year {fileA.year_reached}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>vs</div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 12, borderLeft: '2px solid var(--amber, #f59e0b)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>SCENARIO B</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{nameB}</div>
            <FileLoader slot={1} label="Load B" />
            {fileB && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Year {fileB.year_reached}</div>}
          </div>
        </div>

        {/* Section 1: EES Trajectories */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>EES Trajectories</div>
          <LineChart years={allYears} seriesA={interpolate(trajA, 'E')} seriesB={interpolate(trajB, 'E')} nameA={nameA} nameB={nameB} label="E — Environmental Capital" />
          <LineChart years={allYears} seriesA={interpolate(trajA, 'Ec')} seriesB={interpolate(trajB, 'Ec')} nameA={nameA} nameB={nameB} label="Ec — Economic Capital" />
          <LineChart years={allYears} seriesA={interpolate(trajA, 'S')} seriesB={interpolate(trajB, 'S')} nameA={nameA} nameB={nameB} label="S — Social Capital" />
        </div>

        {/* Section 2: Material Ledger */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Resource Comparison (final year)</div>
          <BarPair label="Nuclear/SMR Actions" a={haleuA} b={haleuB} />
          <BarPair label="Total Actions Placed" a={actionsA} b={actionsB} />
        </div>

        {/* Section 3: Quest Conditions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 8 }}>A: {nameA}</div>
            <QuestList traj={trajA} />
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--amber, #f59e0b)', marginBottom: 8 }}>B: {nameB}</div>
            <QuestList traj={trajB} />
          </div>
        </div>

        {/* Section 4: Event Histories */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Event Histories</div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {allYears.filter(y => {
              const idxA = trajA?.years.indexOf(y) ?? -1;
              const idxB = trajB?.years.indexOf(y) ?? -1;
              const evA = idxA >= 0 ? (trajA?.events_by_year[idxA] ?? []) : [];
              const evB = idxB >= 0 ? (trajB?.events_by_year[idxB] ?? []) : [];
              return evA.length > 0 || evB.length > 0;
            }).map(y => {
              const idxA = trajA?.years.indexOf(y) ?? -1;
              const idxB = trajB?.years.indexOf(y) ?? -1;
              const evA = idxA >= 0 ? (trajA?.events_by_year[idxA] ?? []) : [];
              const evB = idxB >= 0 ? (trajB?.events_by_year[idxB] ?? []) : [];
              return (
                <div key={y} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>{y}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      {evA.map((e, i) => (
                        <div key={i} style={{ fontSize: 10, color: 'var(--teal)', marginBottom: 2 }}>{e.title}</div>
                      ))}
                    </div>
                    <div>
                      {evB.map((e, i) => (
                        <div key={i} style={{ fontSize: 10, color: 'var(--amber, #f59e0b)', marginBottom: 2 }}>{e.title}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {allYears.every(y => {
              const idxA = trajA?.years.indexOf(y) ?? -1;
              const idxB = trajB?.years.indexOf(y) ?? -1;
              return (idxA < 0 || !trajA?.events_by_year[idxA]?.length) && (idxB < 0 || !trajB?.events_by_year[idxB]?.length);
            }) && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No events recorded</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
