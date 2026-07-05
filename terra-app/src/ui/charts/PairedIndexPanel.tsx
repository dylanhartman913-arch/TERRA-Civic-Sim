/**
 * PairedIndexPanel — Two series indexed to 100 at present year,
 * divergence shading between curves.
 */

import { useMemo } from 'react';
import { ChartShell } from './ChartShell.js';
import { EraShading } from './EraShading.js';
import { createChartGeometry, polylinePath, areaPath } from './svg-utils.js';
import type { ChartConfig, ChartDatum } from './types.js';

interface Props {
  config: ChartConfig;
  seriesA: { label: string; data: ChartDatum[]; color: string };
  seriesB: { label: string; data: ChartDatum[]; color: string };
  currentYear: number;
  compact?: boolean;
  width?: number;
  height?: number;
}

export function PairedIndexPanel({
  config,
  seriesA,
  seriesB,
  currentYear,
  compact = false,
  width,
  height,
}: Props) {
  const chartWidth = width ?? config.width ?? 320;
  const chartHeight = height ?? config.height ?? 120;

  const { geometry, pathA, pathB, divergencePath, yTicks } = useMemo(() => {
    // Normalize both to index=100 at currentYear
    const normalize = (data: ChartDatum[]): ChartDatum[] => {
      const basePoint = data.find(d => d.year === currentYear && d.value != null);
      const baseVal = basePoint?.value ?? 1;
      if (baseVal === 0) return data.map(d => ({ year: d.year, value: d.value != null ? 100 : null }));
      return data.map(d => ({
        year: d.year,
        value: d.value != null ? (d.value / baseVal) * 100 : null,
      }));
    };

    const normA = normalize(seriesA.data);
    const normB = normalize(seriesB.data);
    const allData = [...normA, ...normB];
    const years = allData.map(d => d.year);
    const values = allData.filter(d => d.value != null).map(d => d.value as number);

    const geo = createChartGeometry(years, values, { width: chartWidth, height: chartHeight });

    const ptsA = normA.filter(d => d.value != null).map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));
    const ptsB = normB.filter(d => d.value != null).map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    // Divergence fill — use shared years
    const sharedYears = normA
      .filter(d => d.value != null && normB.find(b => b.year === d.year && b.value != null))
      .map(d => d.year);

    let divPath = '';
    if (sharedYears.length > 1) {
      const upper = sharedYears.map(yr => {
        const va = normA.find(d => d.year === yr)!.value as number;
        const vb = normB.find(d => d.year === yr)!.value as number;
        return { x: geo.px(yr), y: geo.py(Math.max(va, vb)) };
      });
      const lower = sharedYears.map(yr => {
        const va = normA.find(d => d.year === yr)!.value as number;
        const vb = normB.find(d => d.year === yr)!.value as number;
        return { x: geo.px(yr), y: geo.py(Math.min(va, vb)) };
      });
      divPath = areaPath(upper, lower);
    }

    const ticks = values.length > 0
      ? [geo.yMin, 100, geo.yMax]
      : [80, 100, 120];

    return { geometry: geo, pathA: polylinePath(ptsA), pathB: polylinePath(ptsB), divergencePath: divPath, yTicks: ticks };
  }, [seriesA.data, seriesB.data, currentYear, chartWidth, chartHeight]);

  const svg = (
    <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible', display: 'block' }}>
      <EraShading geometry={geometry} bands={config.eraBands} />

      {/* Divergence fill */}
      {divergencePath && (
        <path d={divergencePath} fill="var(--teal)" opacity={0.08} />
      )}

      {/* Reference line at 100 */}
      <line
        x1={geometry.pad.left}
        y1={geometry.py(100)}
        x2={geometry.pad.left + geometry.chartW}
        y2={geometry.py(100)}
        stroke="var(--text-muted)"
        strokeWidth={0.5}
        strokeDasharray="3,3"
      />

      {/* Series A */}
      {pathA && <path d={pathA} fill="none" stroke={seriesA.color} strokeWidth={1.5} />}
      {/* Series B */}
      {pathB && <path d={pathB} fill="none" stroke={seriesB.color} strokeWidth={1.5} strokeDasharray="4,2" />}

      {/* Y-axis ticks */}
      {!compact && yTicks.map((t, i) => (
        <g key={i}>
          <text x={geometry.pad.left - 6} y={geometry.py(t) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">
            {Math.round(t)}
          </text>
        </g>
      ))}

      {/* Axes */}
      {!compact && (
        <>
          <line x1={geometry.pad.left} y1={geometry.pad.top} x2={geometry.pad.left} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <line x1={geometry.pad.left} y1={geometry.pad.top + geometry.chartH} x2={geometry.pad.left + geometry.chartW} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
        </>
      )}

      {/* Legend */}
      {!compact && (
        <g>
          <rect x={geometry.pad.left + geometry.chartW - 100} y={geometry.pad.top} width={8} height={3} fill={seriesA.color} />
          <text x={geometry.pad.left + geometry.chartW - 90} y={geometry.pad.top + 4} fontSize={8} fill="var(--text-secondary)">{seriesA.label.slice(0, 14)}</text>
          <rect x={geometry.pad.left + geometry.chartW - 100} y={geometry.pad.top + 10} width={8} height={2} fill={seriesB.color} />
          <text x={geometry.pad.left + geometry.chartW - 90} y={geometry.pad.top + 13} fontSize={8} fill="var(--text-secondary)">{seriesB.label.slice(0, 14)}</text>
        </g>
      )}
    </svg>
  );

  if (compact) return svg;

  return (
    <ChartShell
      config={config}
      rawData={[
        { label: seriesA.label, data: seriesA.data },
        { label: seriesB.label, data: seriesB.data },
      ]}
    >
      {svg}
    </ChartShell>
  );
}
