/**
 * PaybackPanel — Cumulative revenue vs cumulative cost, gap fill,
 * payback-year vertical annotation.
 */

import { useMemo } from 'react';
import { ChartShell } from './ChartShell.js';
import { EraShading } from './EraShading.js';
import { createChartGeometry, polylinePath, areaPath, formatAxisValue } from './svg-utils.js';
import type { ChartConfig, ChartDatum } from './types.js';

interface Props {
  config: ChartConfig;
  /** Cumulative property-tax revenue delta series */
  cumulativeRevenue: ChartDatum[];
  /** Total capex (constant line) */
  totalCapex: number;
  /** Payback year (null if not reached) */
  paybackYear: number | null;
  currentYear: number;
  compact?: boolean;
  width?: number;
  height?: number;
}

export function PaybackPanel({
  config,
  cumulativeRevenue,
  totalCapex,
  paybackYear,
  currentYear,
  compact = false,
  width,
  height,
}: Props) {
  const chartWidth = width ?? config.width ?? 320;
  const chartHeight = height ?? config.height ?? 120;

  const { geometry, revenuePath, capexY, gapFill, yTicks } = useMemo(() => {
    const years = cumulativeRevenue.map(d => d.year);
    const values = cumulativeRevenue.filter(d => d.value != null).map(d => d.value as number);
    const allValues = [...values, totalCapex, 0];

    const geo = createChartGeometry(years, allValues, { width: chartWidth, height: chartHeight, yMin: 0 });

    const revPts = cumulativeRevenue
      .filter(d => d.value != null)
      .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    // Capex horizontal line
    const cy = geo.py(totalCapex);

    // Gap fill between revenue curve and capex line
    let gap = '';
    if (revPts.length > 1) {
      const capexLine = revPts.map(p => ({ x: p.x, y: cy }));
      gap = areaPath(
        revPts.map(p => ({ x: p.x, y: Math.min(p.y, cy) })), // upper = min(rev, capex) in screen coords
        capexLine,
      );
    }

    const ticks = [0, totalCapex / 2, totalCapex];

    return { geometry: geo, revenuePath: polylinePath(revPts), capexY: cy, gapFill: gap, yTicks: ticks };
  }, [cumulativeRevenue, totalCapex, chartWidth, chartHeight]);

  const svg = (
    <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible', display: 'block' }}>
      <EraShading geometry={geometry} bands={config.eraBands} />

      {/* Gap fill */}
      {gapFill && <path d={gapFill} fill="var(--teal)" opacity={0.06} />}

      {/* Capex line (constant) */}
      <line
        x1={geometry.pad.left}
        y1={capexY}
        x2={geometry.pad.left + geometry.chartW}
        y2={capexY}
        stroke="var(--amber)"
        strokeWidth={1}
        strokeDasharray="4,2"
      />

      {/* Revenue curve */}
      {revenuePath && <path d={revenuePath} fill="none" stroke="var(--teal)" strokeWidth={1.5} />}

      {/* Payback year annotation */}
      {paybackYear != null && paybackYear >= geometry.xMin && paybackYear <= geometry.xMax && (
        <>
          <line
            x1={geometry.px(paybackYear)}
            y1={geometry.pad.top}
            x2={geometry.px(paybackYear)}
            y2={geometry.pad.top + geometry.chartH}
            stroke="var(--surplus)"
            strokeWidth={1.5}
            strokeDasharray="3,2"
          />
          <text
            x={geometry.px(paybackYear)}
            y={geometry.pad.top - 2}
            textAnchor="middle"
            fontSize={8}
            fill="var(--surplus)"
          >
            Payback {paybackYear}
          </text>
        </>
      )}

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
          opacity={0.4}
        />
      )}

      {/* Axes */}
      {!compact && (
        <>
          <line x1={geometry.pad.left} y1={geometry.pad.top} x2={geometry.pad.left} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <line x1={geometry.pad.left} y1={geometry.pad.top + geometry.chartH} x2={geometry.pad.left + geometry.chartW} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          {yTicks.map((t, i) => (
            <text key={i} x={geometry.pad.left - 6} y={geometry.py(t) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">
              {formatAxisValue(t, 'USD')}
            </text>
          ))}
          {/* Legend */}
          <rect x={geometry.pad.left + geometry.chartW - 80} y={geometry.pad.top} width={8} height={3} fill="var(--teal)" />
          <text x={geometry.pad.left + geometry.chartW - 70} y={geometry.pad.top + 4} fontSize={7} fill="var(--text-secondary)">Revenue</text>
          <rect x={geometry.pad.left + geometry.chartW - 80} y={geometry.pad.top + 9} width={8} height={2} fill="var(--amber)" />
          <text x={geometry.pad.left + geometry.chartW - 70} y={geometry.pad.top + 12} fontSize={7} fill="var(--text-secondary)">Capex</text>
        </>
      )}

      {/* No payback annotation */}
      {!compact && paybackYear == null && totalCapex > 0 && (
        <text
          x={geometry.pad.left + geometry.chartW / 2}
          y={geometry.pad.top + geometry.chartH / 2}
          textAnchor="middle"
          fontSize={8}
          fill="var(--text-muted)"
        >
          Payback not reached
        </text>
      )}
    </svg>
  );

  if (compact) return svg;

  return (
    <ChartShell
      config={config}
      rawData={[
        { label: 'Cumulative Revenue', data: cumulativeRevenue },
        { label: 'Capex', data: cumulativeRevenue.length > 0 ? [{ year: cumulativeRevenue[0].year, value: totalCapex }] : [] },
      ]}
    >
      {svg}
    </ChartShell>
  );
}
