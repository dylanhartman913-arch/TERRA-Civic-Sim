/**
 * StackedSourcePanel — Stacked area chart for composition over time.
 * Used for revenue sources, fuel mix decomposition, etc.
 */

import { useMemo } from 'react';
import { ChartShell } from './ChartShell.js';
import { EraShading } from './EraShading.js';
import { createChartGeometry, formatAxisValue } from './svg-utils.js';
import type { ChartConfig, ChartDatum } from './types.js';

export interface StackedSeries {
  id: string;
  label: string;
  color: string;
  data: ChartDatum[];
}

interface Props {
  config: ChartConfig;
  series: StackedSeries[];
  currentYear: number;
  compact?: boolean;
  width?: number;
  height?: number;
}

export function StackedSourcePanel({
  config,
  series,
  currentYear,
  compact = false,
  width,
  height,
}: Props) {
  const chartWidth = width ?? config.width ?? 320;
  const chartHeight = height ?? config.height ?? 120;

  const { geometry, stackedPaths, yTicks } = useMemo(() => {
    if (series.length === 0) {
      const geo = createChartGeometry([2025, 2055], [0, 1], { width: chartWidth, height: chartHeight });
      return { geometry: geo, stackedPaths: [], yTicks: [0] };
    }

    // Collect all unique years across all series
    const allYears = new Set<number>();
    for (const s of series) for (const d of s.data) allYears.add(d.year);
    const years = [...allYears].sort((a, b) => a - b);

    // Build cumulative stacked values per year
    const stacks: number[][] = []; // [seriesIdx][yearIdx]
    const cumulative: number[][] = []; // cumulative[seriesIdx][yearIdx]

    for (let si = 0; si < series.length; si++) {
      const vals = years.map(yr => {
        const pt = series[si].data.find(d => d.year === yr);
        return pt?.value ?? 0;
      });
      stacks.push(vals);
    }

    // Compute cumulative bottom-up
    const baselines: number[][] = [];
    for (let si = 0; si < series.length; si++) {
      const base = years.map((_, yi) => {
        let sum = 0;
        for (let j = 0; j < si; j++) sum += stacks[j][yi];
        return sum;
      });
      baselines.push(base);
      cumulative.push(years.map((_, yi) => base[yi] + stacks[si][yi]));
    }

    const maxY = Math.max(...cumulative[cumulative.length - 1], 1);
    const geo = createChartGeometry(years, [0, maxY], { width: chartWidth, height: chartHeight, yMin: 0, yMax: maxY });

    // Build stacked area paths (SVG, bottom to top)
    const paths: { d: string; color: string }[] = [];
    for (let si = 0; si < series.length; si++) {
      const upper = years.map((yr, yi) => ({ x: geo.px(yr), y: geo.py(cumulative[si][yi]) }));
      const lower = [...years].map((yr, yi) => ({ x: geo.px(yr), y: geo.py(baselines[si][yi]) }));

      // Build closed path: forward along upper, backward along lower
      const forward = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const backward = [...lower].reverse().map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      paths.push({ d: `${forward} ${backward} Z`, color: series[si].color });
    }

    const ticks = [0, maxY / 2, maxY];
    return { geometry: geo, stackedPaths: paths, yTicks: ticks };
  }, [series, chartWidth, chartHeight]);

  const svg = (
    <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible', display: 'block' }}>
      <EraShading geometry={geometry} bands={config.eraBands} />

      {/* Stacked areas (render bottom to top) */}
      {stackedPaths.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} opacity={0.5} stroke={s.color} strokeWidth={0.5} />
      ))}

      {/* Current year marker */}
      {currentYear >= geometry.xMin && currentYear <= geometry.xMax && (
        <line
          x1={geometry.px(currentYear)}
          y1={geometry.pad.top}
          x2={geometry.px(currentYear)}
          y2={geometry.pad.top + geometry.chartH}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="2,2"
          opacity={0.5}
        />
      )}

      {/* Axes */}
      {!compact && (
        <>
          <line x1={geometry.pad.left} y1={geometry.pad.top} x2={geometry.pad.left} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <line x1={geometry.pad.left} y1={geometry.pad.top + geometry.chartH} x2={geometry.pad.left + geometry.chartW} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          {yTicks.map((t, i) => (
            <text key={i} x={geometry.pad.left - 6} y={geometry.py(t) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">
              {formatAxisValue(t, config.units)}
            </text>
          ))}
          <text x={geometry.px(geometry.xMin)} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geometry.xMin}</text>
          <text x={geometry.px(geometry.xMax)} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geometry.xMax}</text>
        </>
      )}

      {/* Legend */}
      {!compact && (
        <g>
          {series.slice(0, 4).map((s, i) => (
            <g key={s.id}>
              <rect x={geometry.pad.left + geometry.chartW - 80} y={geometry.pad.top + i * 10} width={6} height={6} fill={s.color} rx={1} />
              <text x={geometry.pad.left + geometry.chartW - 72} y={geometry.pad.top + i * 10 + 5} fontSize={7} fill="var(--text-secondary)">{s.label.slice(0, 12)}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );

  if (compact) return svg;

  return (
    <ChartShell
      config={config}
      rawData={series.map(s => ({ label: s.label, data: s.data }))}
    >
      {svg}
    </ChartShell>
  );
}
