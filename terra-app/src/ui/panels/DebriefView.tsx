/**
 * W6 Debrief View — facilitator post-workshop analysis panel.
 *
 * Loads multiple .terra.json session files entirely client-side,
 * replays each to extract outcomes, and renders six views:
 *   1. Loader — drag-and-drop / file picker with validation feedback
 *   2. Convergence Table — sortable per-session outcome summary + CSV
 *   3. Divergence Finder — earliest decision fork across all session pairs
 *   4. Outcome Scatter — any two indicators across sessions, SVG
 *   5. County Consensus — per-county agreement heat table + CSV
 *   6. Annotation Reader — chronological annotation feed, filterable
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useTerraStore } from '../../state/store.js';
import { importFromJson } from '../../engine/persistence.js';
import { ScatterView, type ScatterPoint } from '../charts/ScatterView.js';
import { computeReplayDigest } from '../../engine/replay.js';
import {
  findEarliestDivergence,
  findAllDivergences,
  extractOutcome,
  computeCountyConsensus,
  type LoadedSession,
  type SessionOutcome,
  type ConsensusIndicator,
} from '../../engine/debrief.js';
import type { EngineState, IndicatorSnapshot, Annotation, AnnotationTrigger } from '../../engine/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'loader' | 'convergence' | 'divergence' | 'scatter' | 'consensus' | 'annotations';

type SortKey = keyof SessionOutcome;

interface ReplayedSession {
  session: LoadedSession;
  state: EngineState;
  outcome: SessionOutcome;
  history: IndicatorSnapshot[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<keyof SessionOutcome, string> = {
  label: 'Participant',
  code: 'Code',
  finalYear: 'Year',
  E: 'E',
  Ec: 'Ec',
  S: 'S',
  fiscalNet: 'Fiscal Net ($)',
  laborUtil: 'Labor Util',
  housingPressure: 'Housing Pressure',
  totalBuiltMw: 'Built MW',
  digest: 'Digest',
};

const SCATTER_OPTIONS: { key: keyof SessionOutcome; label: string }[] = [
  { key: 'E', label: 'Energy Capital (E)' },
  { key: 'Ec', label: 'Economic Capital (Ec)' },
  { key: 'S', label: 'Social Capital (S)' },
  { key: 'fiscalNet', label: 'Fiscal Net ($)' },
  { key: 'laborUtil', label: 'Labor Utilization' },
  { key: 'totalBuiltMw', label: 'Total Built MW' },
];

const CONSENSUS_OPTIONS: { key: ConsensusIndicator; label: string }[] = [
  { key: 'E', label: 'Energy Capital' },
  { key: 'Ec', label: 'Economic Capital' },
  { key: 'S', label: 'Social Capital' },
  { key: 'labor_utilization', label: 'Labor Utilization' },
  { key: 'cumulative_net', label: 'Cumulative Fiscal Net' },
];

const SESSION_COLORS = [
  'var(--teal)',
  '#f59e0b',
  '#a78bfa',
  '#34d399',
  '#f87171',
  '#60a5fa',
  '#fb923c',
  '#e879f9',
];

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'loader', label: 'Load Files' },
  { id: 'convergence', label: 'Convergence' },
  { id: 'divergence', label: 'Divergence' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'consensus', label: 'Consensus' },
  { id: 'annotations', label: 'Annotations' },
];

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtVal(key: keyof SessionOutcome, v: number): string {
  if (key === 'fiscalNet') return fmt$(v);
  if (key === 'totalBuiltMw') return v >= 1000 ? `${(v / 1000).toFixed(1)} GW` : `${Math.round(v)} MW`;
  if (key === 'laborUtil' || key === 'housingPressure') return (v * 100).toFixed(1) + '%';
  if (key === 'finalYear') return String(Math.round(v));
  return v.toFixed(3);
}

function triggerLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9,
      color: 'var(--text-muted)',
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
      borderBottom: '1px solid var(--border)',
      paddingBottom: 4,
      marginBottom: 10,
      marginTop: 16,
    }}>
      {children}
    </div>
  );
}

function StatusChip({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span style={{
      fontSize: 8,
      padding: '1px 5px',
      borderRadius: 2,
      background: ok ? 'rgba(45,212,191,0.15)' : 'rgba(248,113,113,0.15)',
      color: ok ? 'var(--teal)' : 'var(--deficit)',
      fontFamily: 'var(--font-mono)',
    }}>
      {text}
    </span>
  );
}

function BtnSmall({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 10,
        padding: '4px 10px',
        border: '1px solid var(--border)',
        borderRadius: 3,
        background: variant === 'primary' ? 'var(--teal-dim)' : 'transparent',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        cursor: disabled ? 'default' : 'pointer',
        letterSpacing: 0.3,
      }}
    >
      {children}
    </button>
  );
}

// ScatterPlot is now provided by the shared ScatterView component.
// DebriefView builds ScatterPoint[] from SessionOutcome[] and delegates rendering.

// ── Main component ────────────────────────────────────────────────────────────

export function DebriefView({ onClose }: { onClose: () => void }) {
  const replaySessionFile = useTerraStore(s => s.replaySessionFile);

  const [activeTab, setActiveTab] = useState<Tab>('loader');
  const [replayed, setReplayed] = useState<ReplayedSession[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);

  // Convergence table sort
  const [sortKey, setSortKey] = useState<SortKey>('finalYear');
  const [sortAsc, setSortAsc] = useState(true);

  // Scatter selectors
  const [scatterX, setScatterX] = useState<keyof SessionOutcome>('Ec');
  const [scatterY, setScatterY] = useState<keyof SessionOutcome>('S');

  // Consensus selectors
  const [consensusIndicator, setConsensusIndicator] = useState<ConsensusIndicator>('E');
  const [consensusYear, setConsensusYear] = useState<number | null>(null);

  // Annotation filter
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationTrigger | 'all'>('all');

  const dropRef = useRef<HTMLDivElement>(null);

  // ── File loading ──────────────────────────────────────────────────────────

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.name.endsWith('.json'));
    if (fileArr.length === 0) return;

    setIsReplaying(true);
    const newErrors: string[] = [];
    const newReplayed: ReplayedSession[] = [];

    const readers = fileArr.map(file =>
      new Promise<void>(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          const parsed = importFromJson(text);
          if (!parsed) {
            newErrors.push(`${file.name}: schema_version !== 3.0 or parse error`);
            resolve();
            return;
          }
          if (!parsed.session_meta) {
            newErrors.push(`${file.name}: missing session_meta — not a session export`);
            resolve();
            return;
          }
          // Check for duplicate label
          const label = parsed.session_meta.participant_label;
          const alreadyLoaded = replayed.some(r => r.session.label === label);
          if (alreadyLoaded) {
            newErrors.push(`${file.name}: duplicate participant label "${label}" — skipped`);
            resolve();
            return;
          }
          try {
            const state = replaySessionFile(parsed);
            const digest = computeReplayDigest(state, parsed.climate_lens);
            const session: LoadedSession = {
              file: parsed,
              label,
              code: parsed.session_meta.session_code,
              finalYear: parsed.year_reached,
            };
            const outcome = extractOutcome(session, state, digest);
            newReplayed.push({ session, state, outcome, history: state.history ?? [] });
          } catch (err) {
            newErrors.push(`${file.name}: replay failed — ${String(err)}`);
          }
          resolve();
        };
        reader.onerror = () => {
          newErrors.push(`${file.name}: file read error`);
          resolve();
        };
        reader.readAsText(file);
      })
    );

    Promise.all(readers).then(() => {
      setReplayed(prev => {
        const combined = [...prev, ...newReplayed];
        // Update consensus year to last year of first session if not yet set
        if (combined.length > 0 && consensusYear === null) {
          setConsensusYear(combined[0].session.finalYear);
        }
        return combined;
      });
      setLoadErrors(prev => [...prev, ...newErrors]);
      setIsReplaying(false);
    });
  }, [replaySessionFile, replayed, consensusYear]);

  const handleFilePicker = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  }, [processFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const sessions = useMemo(() => replayed.map(r => r.session), [replayed]);
  const outcomes = useMemo(() => replayed.map(r => r.outcome), [replayed]);
  const histories = useMemo(() => replayed.map(r => r.history), [replayed]);

  const sortedOutcomes = useMemo(() => {
    return [...outcomes].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [outcomes, sortKey, sortAsc]);

  const earliestFork = useMemo(() => findEarliestDivergence(sessions), [sessions]);
  const allForks = useMemo(() => findAllDivergences(sessions), [sessions]);

  const consensusRows = useMemo(() => {
    if (histories.length === 0 || consensusYear === null) return [];
    return computeCountyConsensus(sessions, histories, consensusIndicator, consensusYear);
  }, [sessions, histories, consensusIndicator, consensusYear]);

  const allAnnotations = useMemo(() => {
    const anns: Array<Annotation & { sessionLabel: string }> = [];
    for (const r of replayed) {
      for (const ann of r.session.file.annotations ?? []) {
        anns.push({ ...ann, sessionLabel: r.session.label });
      }
    }
    anns.sort((a, b) => a.year !== b.year ? a.year - b.year : a.timestamp - b.timestamp);
    return anns;
  }, [replayed]);

  const filteredAnnotations = useMemo(() =>
    annotationFilter === 'all'
      ? allAnnotations
      : allAnnotations.filter(a => a.trigger_type === annotationFilter),
    [allAnnotations, annotationFilter]);

  const sharedSeed = useMemo(() => {
    if (sessions.length < 2) return null;
    const seed = sessions[0].file.gameSeed;
    return sessions.every(s => s.file.gameSeed === seed) ? seed : null;
  }, [sessions]);

  const availableYears = useMemo(() => {
    if (histories.length === 0) return [];
    const years = new Set<number>();
    for (const hist of histories) {
      for (const snap of hist) years.add(snap.year);
    }
    return [...years].sort((a, b) => a - b);
  }, [histories]);

  // ── CSV exports ───────────────────────────────────────────────────────────

  function exportConvergenceCsv() {
    const cols: (keyof SessionOutcome)[] = ['label', 'code', 'finalYear', 'E', 'Ec', 'S', 'fiscalNet', 'laborUtil', 'totalBuiltMw'];
    const header = cols.map(k => OUTCOME_LABELS[k]).join(',');
    const rows = sortedOutcomes.map(o =>
      cols.map(k => {
        const v = o[k];
        if (typeof v === 'string') return `"${v}"`;
        return String(v);
      }).join(',')
    );
    downloadCsv([header, ...rows].join('\n'), `terra_debrief_convergence_${Date.now()}.csv`);
  }

  function exportScatterCsv() {
    const header = `"Participant","${OUTCOME_LABELS[scatterX]}","${OUTCOME_LABELS[scatterY]}"`;
    const rows = outcomes.map(o => `"${o.label}",${o[scatterX]},${o[scatterY]}`);
    downloadCsv([header, ...rows].join('\n'), `terra_debrief_scatter_${Date.now()}.csv`);
  }

  function exportConsensusCsv() {
    const header = `"GEOID","Mean","StdDev","Agreement",${sessions.map(s => `"${s.label}"`).join(',')}`;
    const rows = consensusRows.map(r =>
      `"${r.geoid}",${r.mean.toFixed(4)},${r.stdDev.toFixed(4)},"${r.agreement}",${r.values.map(v => v.toFixed(4)).join(',')}`
    );
    downloadCsv([header, ...rows].join('\n'), `terra_debrief_consensus_${Date.now()}.csv`);
  }

  function handleSortClick(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
      zIndex: 300,
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', letterSpacing: 1 }}>
            TERRA Debrief
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {replayed.length} session{replayed.length !== 1 ? 's' : ''} loaded
            {sharedSeed != null ? ` · shared seed ${sharedSeed}` : ''}
          </span>
          <span data-testid="debrief-climate-lens" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            Climate lens: {replayed.length === 0 ? 'awaiting session file' : [...new Set(replayed.map(item => item.session.file.climate_lens ?? 'historical'))].join(', ')}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        overflowX: 'auto' as const,
      }}>
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === id ? '2px solid var(--teal)' : '2px solid transparent',
              color: activeTab === id ? 'var(--teal)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 0.5,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ── Tab: Loader ────────────────────────────────────────────────── */}
        {activeTab === 'loader' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Load exported <code style={{ color: 'var(--teal)' }}>.terra.json</code> session files from participants.
              Each file must contain a <code style={{ color: 'var(--teal)' }}>session_meta</code> block
              (present in any file exported from session mode).
            </div>

            {/* Drop zone */}
            <div
              ref={dropRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 6,
                padding: '32px 24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 11,
                marginBottom: 16,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onClick={() => document.getElementById('debrief-file-input')?.click()}
            >
              {isReplaying
                ? '⟳ Replaying sessions…'
                : 'Drop .terra.json files here or click to browse'}
            </div>
            <input
              id="debrief-file-input"
              type="file"
              accept=".json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFilePicker}
            />

            {/* Loaded sessions */}
            {replayed.length > 0 && (
              <>
                <SectionHeader>Loaded Sessions</SectionHeader>
                {replayed.map((r, i) => (
                  <div key={r.session.label} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    marginBottom: 4,
                    fontSize: 11,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: SESSION_COLORS[i % SESSION_COLORS.length],
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.session.label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.session.code}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Year {r.session.finalYear}</span>
                      <StatusChip ok={true} text="OK" />
                      <button
                        onClick={() => setReplayed(prev => prev.filter(x => x.session.label !== r.session.label))}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--text-muted)',
                          cursor: 'pointer', fontSize: 10, padding: '0 2px',
                        }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <BtnSmall onClick={() => { setReplayed([]); setLoadErrors([]); }}>Clear All</BtnSmall>
                </div>
              </>
            )}

            {/* Errors */}
            {loadErrors.length > 0 && (
              <>
                <SectionHeader>Load Errors</SectionHeader>
                {loadErrors.map((e, i) => (
                  <div key={i} style={{
                    fontSize: 10, color: 'var(--deficit)', marginBottom: 3,
                    padding: '4px 8px', background: 'rgba(248,113,113,0.08)',
                    borderRadius: 3, borderLeft: '2px solid var(--deficit)',
                  }}>
                    {e}
                  </div>
                ))}
                <div style={{ marginTop: 6 }}>
                  <BtnSmall onClick={() => setLoadErrors([])}>Clear Errors</BtnSmall>
                </div>
              </>
            )}

            {replayed.length === 0 && loadErrors.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8 }}>
                No sessions loaded yet. Use the drop zone above.
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Convergence Table ─────────────────────────────────────── */}
        {activeTab === 'convergence' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {outcomes.length} session{outcomes.length !== 1 ? 's' : ''} · click column headers to sort
              </span>
              <BtnSmall onClick={exportConvergenceCsv} disabled={outcomes.length === 0}>Export CSV</BtnSmall>
            </div>

            {outcomes.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Load sessions in the Loader tab first.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', color: 'var(--text-secondary)' }}>
                  <thead>
                    <tr>
                      {(['label', 'code', 'finalYear', 'E', 'Ec', 'S', 'fiscalNet', 'laborUtil', 'totalBuiltMw'] as (keyof SessionOutcome)[]).map(key => (
                        <th
                          key={key}
                          onClick={() => handleSortClick(key)}
                          style={{
                            textAlign: 'left', padding: '6px 8px',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', fontWeight: 500,
                            color: sortKey === key ? 'var(--teal)' : 'var(--text-muted)',
                            whiteSpace: 'nowrap' as const,
                            letterSpacing: 0.5, fontSize: 9, textTransform: 'uppercase' as const,
                          }}
                        >
                          {OUTCOME_LABELS[key]} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOutcomes.map((o, i) => (
                      <tr key={o.label} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <span style={{
                            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                            background: SESSION_COLORS[outcomes.indexOf(o) % SESSION_COLORS.length],
                            marginRight: 6, verticalAlign: 'middle',
                          }} />
                          {o.label}
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{o.code}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{o.finalYear}</td>
                        {(['E', 'Ec', 'S'] as const).map(k => (
                          <td key={k} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: (o[k] ?? 0) >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>
                            {o[k].toFixed(3)}
                          </td>
                        ))}
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: o.fiscalNet >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>
                          {fmt$(o.fiscalNet)}
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
                          {(o.laborUtil * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
                          {o.totalBuiltMw >= 1000 ? `${(o.totalBuiltMw / 1000).toFixed(1)} GW` : `${Math.round(o.totalBuiltMw)} MW`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Divergence Finder ─────────────────────────────────────── */}
        {activeTab === 'divergence' && (
          <div>
            {sessions.length < 2 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Load at least 2 sessions to compare decisions.</div>
            ) : (
              <>
                {/* Shared seed notice */}
                {sharedSeed != null && (
                  <div style={{
                    padding: '8px 12px', marginBottom: 16,
                    background: 'rgba(45,212,191,0.08)',
                    border: '1px solid rgba(45,212,191,0.3)',
                    borderRadius: 4, fontSize: 10, color: 'var(--teal)',
                  }}>
                    All sessions share gameSeed {sharedSeed} — stochastic events are identical across participants. Divergence reflects player decisions only.
                  </div>
                )}

                {/* Earliest fork callout */}
                {earliestFork ? (
                  <div style={{
                    padding: '12px 16px', marginBottom: 20,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--amber, #f59e0b)',
                    borderRadius: 4,
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                      Earliest Fork — Year {earliestFork.year}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>
                      {earliestFork.message}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 10 }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>{earliestFork.labelA}: </span>
                        {earliestFork.actionsA.length > 0
                          ? earliestFork.actionsA.map(a => {
                              const parts = a.split(':');
                              return `${parts[1]} @ ${parts[2]}`;
                            }).join(', ')
                          : <em style={{ color: 'var(--text-muted)' }}>no action</em>
                        }
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>{earliestFork.labelB}: </span>
                        {earliestFork.actionsB.length > 0
                          ? earliestFork.actionsB.map(a => {
                              const parts = a.split(':');
                              return `${parts[1]} @ ${parts[2]}`;
                            }).join(', ')
                          : <em style={{ color: 'var(--text-muted)' }}>no action</em>
                        }
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '12px 16px', marginBottom: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                    No divergence found — all sessions made identical decisions through their shared years.
                  </div>
                )}

                {/* All pair forks */}
                {allForks.length > 0 && (
                  <>
                    <SectionHeader>All Pair Divergences ({allForks.length})</SectionHeader>
                    {allForks.map((fork, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', marginBottom: 4,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 4, fontSize: 10,
                      }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>Year {fork.year}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{fork.labelA}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>vs</span>
                        <span style={{ color: 'var(--text-primary)' }}>{fork.labelB}</span>
                        <div style={{ color: 'var(--text-muted)', marginTop: 3, fontSize: 9 }}>
                          {fork.actionsA.join(', ') || 'nothing'} → {fork.actionsB.join(', ') || 'nothing'}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Outcome Scatter ───────────────────────────────────────── */}
        {activeTab === 'scatter' && (
          <div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>X axis</span>
                <select
                  value={scatterX}
                  onChange={e => setScatterX(e.target.value as keyof SessionOutcome)}
                  style={selectStyle}
                >
                  {SCATTER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Y axis</span>
                <select
                  value={scatterY}
                  onChange={e => setScatterY(e.target.value as keyof SessionOutcome)}
                  style={selectStyle}
                >
                  {SCATTER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
              <BtnSmall onClick={exportScatterCsv} disabled={outcomes.length === 0}>Export CSV</BtnSmall>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 12px', display: 'inline-block' }}>
              <ScatterView
                points={outcomes.map((o, i): ScatterPoint => ({
                  x: o[scatterX] as number,
                  y: o[scatterY] as number,
                  label: o.label,
                  color: SESSION_COLORS[i % SESSION_COLORS.length],
                }))}
                xLabel={OUTCOME_LABELS[scatterX]}
                yLabel={OUTCOME_LABELS[scatterY]}
                width={360}
                height={240}
                emptyMessage="Load sessions to see scatter"
              />
            </div>

            {/* Legend */}
            {outcomes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                {outcomes.map((o, i) => (
                  <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: SESSION_COLORS[i % SESSION_COLORS.length],
                      display: 'inline-block',
                    }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{o.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      ({fmtVal(scatterX, o[scatterX] as number)}, {fmtVal(scatterY, o[scatterY] as number)})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: County Consensus ──────────────────────────────────────── */}
        {activeTab === 'consensus' && (
          <div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Indicator</span>
                <select
                  value={consensusIndicator}
                  onChange={e => setConsensusIndicator(e.target.value as ConsensusIndicator)}
                  style={selectStyle}
                >
                  {CONSENSUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Year</span>
                <select
                  value={consensusYear ?? ''}
                  onChange={e => setConsensusYear(Number(e.target.value))}
                  style={selectStyle}
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <BtnSmall onClick={exportConsensusCsv} disabled={consensusRows.length === 0}>Export CSV</BtnSmall>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
              Counties ranked by cross-session variance (most contested first).
              Agreement: <span style={{ color: 'var(--teal)' }}>■ high</span> (CV &lt; 5%) · <span style={{ color: '#f59e0b' }}>■ medium</span> (5–20%) · <span style={{ color: 'var(--deficit)' }}>■ low</span> (&gt; 20%)
            </div>

            {sessions.length < 2 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Load at least 2 sessions to compute consensus.</div>
            ) : consensusRows.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No county data at year {consensusYear}. Try a different year.</div>
            ) : (
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', color: 'var(--text-secondary)' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>County</th>
                    <th style={thStyle}>Agreement</th>
                    <th style={thStyle}>Mean</th>
                    <th style={thStyle}>Std Dev</th>
                    {sessions.map((s, i) => (
                      <th key={s.label} style={{ ...thStyle, color: SESSION_COLORS[i % SESSION_COLORS.length] }}>
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consensusRows.slice(0, 50).map((row, i) => {
                    const chipColor = row.agreement === 'high' ? 'var(--teal)' : row.agreement === 'medium' ? '#f59e0b' : 'var(--deficit)';
                    return (
                      <tr key={row.geoid} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                          {row.geoid}
                        </td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: chipColor, fontWeight: 500 }}>{row.agreement}</span>
                        </td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{row.mean.toFixed(4)}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{row.stdDev.toFixed(4)}</td>
                        {row.values.map((v, j) => (
                          <td key={j} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                            {v.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {consensusRows.length > 50 && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
                Showing top 50 of {consensusRows.length} counties. Export CSV for full data.
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Annotation Reader ─────────────────────────────────────── */}
        {activeTab === 'annotations' && (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filter</span>
              {(['all', 'build_decision', 'disturbance_event', 'era_transition', 'manual'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setAnnotationFilter(f)}
                  style={{
                    fontSize: 9, padding: '2px 8px',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    background: annotationFilter === f ? 'var(--bg-elevated)' : 'transparent',
                    color: annotationFilter === f ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    textTransform: 'uppercase' as const,
                    letterSpacing: 0.3,
                  }}
                >
                  {f === 'all' ? 'All' : triggerLabel(f)}
                </button>
              ))}
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 8 }}>
                {filteredAnnotations.length} annotation{filteredAnnotations.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredAnnotations.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {allAnnotations.length === 0 ? 'No annotations in loaded sessions.' : 'No annotations match the current filter.'}
              </div>
            ) : (
              filteredAnnotations.map(ann => {
                const sessionIdx = replayed.findIndex(r => r.session.label === ann.sessionLabel);
                const color = SESSION_COLORS[sessionIdx % SESSION_COLORS.length] ?? 'var(--text-muted)';
                return (
                  <div key={ann.id} style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 4,
                    padding: '10px 12px',
                    marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color, fontWeight: 500 }}>{ann.sessionLabel}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Year {ann.year}</span>
                        <span style={{
                          fontSize: 8, padding: '1px 5px', borderRadius: 2,
                          background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                          textTransform: 'uppercase' as const, letterSpacing: 0.5,
                        }}>
                          {triggerLabel(ann.trigger_type)}
                        </span>
                      </div>
                    </div>
                    {ann.prompt && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 4 }}>
                        {ann.prompt}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {ann.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '5px 8px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 500,
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '3px 6px',
  outline: 'none',
};
