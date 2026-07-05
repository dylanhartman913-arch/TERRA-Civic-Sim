/**
 * SmallMultiples — cross-county aligned mini-trajectories for one indicator.
 *
 * Honest alternative to spaghetti lines: one county per cell, shared y-axis range,
 * sorted by final value, delta, or name. Optional comparison overlay (amber dashed).
 *
 * Does NOT wrap TrajectoryPanel (compact mode returns a bare SVG with an
 * independently computed scale). SmallMultiples renders its own SVG per cell on
 * a unified scale so the cells are directly comparable.
 */

import { useMemo } from 'react';
import type { ChartConfig, ChartDatum } from './types.js';
import { formatAxisValue } from './svg-utils.js';

export interface SmallSeries {
  geoid: string;
  name: string;
  /** Primary trajectory — history portion */
  history: ChartDatum[];
  /** Primary trajectory — projection portion */
  projection: ChartDatum[];
  /** Comparison trajectory — history portion (amber dashed overlay) */
  compHistory?: ChartDatum[];
  /** Comparison trajectory — projection portion (amber dashed overlay) */
  compProjection?: ChartDatum[];
}

interface Props {
  config: ChartConfig;
  series: SmallSeries[];
  currentYear: number;
  sortBy?: 'final' | 'delta' | 'name';
  /** Max columns in the grid */
  columns?: number;
}

const CELL_W = 164;
const CELL_H = 88;
const PAD = { top: 6, right: 4, bottom: 14, left: 28 };

function lastNonNull(data: ChartDatum[]): number {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].value != null) return data[i].value as number;
  }
  return 0;
}

function makePath(
  data: ChartDatum[],
  px: (v: number) => number,
  py: (v: number) => number,
): string {
  const pts = data.filter(d => d.value != null);
  if (pts.length === 0) return '';
  return pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(d.year).toFixed(1)},${py(d.value as number).toFixed(1)}`).join(' ');
}

export function SmallMultiples({ config, series, currentYear, sortBy = 'final', columns = 4 }: Props) {
  const sorted = useMemo(() => {
    return [...series].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const allA = [...a.history, ...a.projection];
      const allB = [...b.history, ...b.projection];
      if (sortBy === 'final') return lastNonNull(allB) - lastNonNull(allA);
      // delta: |last - first|
      const delta = (d: ChartDatum[]) => {
        const vals = d.filter(x => x.value != null).map(x => x.value as number);
        return vals.length >= 2 ? Math.abs(vals.at(-1)! - vals[0]) : 0;
      };
      return delta([...allB]) - delta([...allA]);
    });
  }, [series, sortBy]);

  // Unified y range across ALL series (primary + comparison)
  const { yMin, yMax, xMin, xMax } = useMemo(() => {
    const allVals: number[] = [];
    const allYears: number[] = [];
    for (const s of sorted) {
      const all = [...s.history, ...s.projection, ...(s.compHistory ?? []), ...(s.compProjection ?? [])];
      for (const d of all) {
        if (d.value != null) allVals.push(d.value as number);
        allYears.push(d.year);
      }
    }
    if (allVals.length === 0) return { yMin: 0, yMax: 1, xMin: 2025, xMax: 2055 };
    const mn = Math.min(...allVals);
    const mx = Math.max(...allVals);
    const pad = (mx - mn || Math.abs(mn) || 1) * 0.05;
    return {
      yMin: mn - pad,
      yMax: mx + pad,
      xMin: Math.min(...allYears),
      xMax: Math.max(...allYears),
    };
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 12 }}>
        Select counties to compare.
      </div>
    );
  }

  const innerW = CELL_W - PAD.left - PAD.right;
  const innerH = CELL_H - PAD.top - PAD.bottom;
  const xR = xMax - xMin || 1;
  const yR = yMax - yMin || 1;

  const px = (year: number) => PAD.left + ((year - xMin) / xR) * innerW;
  const py = (val: number) => PAD.top + innerH - ((val - yMin) / yR) * innerH;

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(columns, sorted.length)}, ${CELL_W}px)`,
      gap: 8,
    }}>
      {sorted.map(s => {
        const allPrimary = [...s.history, ...s.projection];
        const finalVal = lastNonNull(allPrimary);
        const hasComp = (s.compHistory?.length ?? 0) > 0 || (s.compProjection?.length ?? 0) > 0;

        const histPath = makePath(s.history, px, py);
        const projPts = s.projection.filter(d => d.value != null);
        // Connect projection to last history point
        const lastHistPt = s.history.filter(d => d.value != null).at(-1);
        const projWithConnect = lastHistPt ? [lastHistPt, ...projPts] : projPts;
        const projPath = makePath(projWithConnect, px, py);

        const compHistPath = hasComp ? makePath(s.compHistory ?? [], px, py) : '';
        const compLastHistPt = (s.compHistory ?? []).filter(d => d.value != null).at(-1);
        const compProjWithConnect = compLastHistPt
          ? [compLastHistPt, ...(s.compProjection ?? []).filter(d => d.value != null)]
          : (s.compProjection ?? []).filter(d => d.value != null);
        const compProjPath = hasComp ? makePath(compProjWithConnect, px, py) : '';

        return (
          <div key={s.geoid} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            paddingBottom: 4,
          }}>
            {/* Mini header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 6px 2px',
            }}>
              <span style={{
                fontSize: 8,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '70%',
              }}>
                {s.name}
              </span>
              <span style={{ fontSize: 8, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                {formatAxisValue(finalVal, config.units)}
              </span>
            </div>

            <svg width={CELL_W} height={CELL_H} style={{ overflow: 'visible', display: 'block' }}>
              {/* Y-axis ticks */}
              {yTicks.map((t, i) => (
                <text key={i} x={PAD.left - 3} y={py(t) + 2.5}
                  textAnchor="end" fontSize={6} fill="var(--text-muted)"
                >
                  {formatAxisValue(t, config.units)}
                </text>
              ))}
              {/* Axis lines */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="var(--border)" strokeWidth={0.5} />
              <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="var(--border)" strokeWidth={0.5} />

              {/* Current year tick */}
              {currentYear >= xMin && currentYear <= xMax && (
                <line x1={px(currentYear)} y1={PAD.top} x2={px(currentYear)} y2={PAD.top + innerH}
                  stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4}
                />
              )}

              {/* Comparison lines (behind primary) */}
              {compHistPath && <path d={compHistPath} fill="none" stroke="var(--amber, #f59e0b)" strokeWidth={1} opacity={0.65} />}
              {compProjPath && <path d={compProjPath} fill="none" stroke="var(--amber, #f59e0b)" strokeWidth={1} strokeDasharray="4,2" opacity={0.5} />}

              {/* Primary lines */}
              {histPath && <path d={histPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} />}
              {projPath && <path d={projPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeDasharray="5,2" opacity={0.7} />}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
