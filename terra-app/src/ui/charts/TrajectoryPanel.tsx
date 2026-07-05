/**
 * TrajectoryPanel — History (solid) + projection (dashed) + era shading + event markers.
 * No dual y-axes.
 */

import { useMemo } from 'react';
import { ChartShell } from './ChartShell.js';
import { EraShading } from './EraShading.js';
import { EventDots } from './EventDots.js';
import { createChartGeometry, polylinePath, formatAxisValue } from './svg-utils.js';
import type { ChartConfig, ChartDatum, EventMarker } from './types.js';

interface Props {
  config: ChartConfig;
  history: ChartDatum[];
  projection: ChartDatum[];
  eventMarkers?: EventMarker[];
  currentYear: number;
  /** Compact mode: smaller, no shell controls */
  compact?: boolean;
  width?: number;
  height?: number;
}

export function TrajectoryPanel({
  config,
  history,
  projection,
  eventMarkers = [],
  currentYear,
  compact = false,
  width,
  height,
}: Props) {
  const chartWidth = width ?? config.width ?? 320;
  const chartHeight = height ?? config.height ?? 120;

  const { geometry, historyPath, projectionPath, yTicks } = useMemo(() => {
    const allData = [...history, ...projection];
    const years = allData.map(d => d.year);
    const values = allData.filter(d => d.value != null).map(d => d.value as number);
    const geo = createChartGeometry(years, values, { width: chartWidth, height: chartHeight });

    const histPts = history
      .filter(d => d.value != null)
      .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    const projPts = projection
      .filter(d => d.value != null)
      .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    // Connect projection to last history point for continuity
    if (histPts.length > 0 && projPts.length > 0) {
      projPts.unshift(histPts[histPts.length - 1]);
    }

    const ticks = values.length > 0
      ? [geo.yMin, (geo.yMin + geo.yMax) / 2, geo.yMax]
      : [0, 0.5, 1];

    return {
      geometry: geo,
      historyPath: polylinePath(histPts),
      projectionPath: polylinePath(projPts),
      yTicks: ticks,
    };
  }, [history, projection, chartWidth, chartHeight]);

  const svg = (
    <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible', display: 'block' }}>
      {/* Era shading */}
      <EraShading geometry={geometry} bands={config.eraBands} />

      {/* Y-axis ticks */}
      {!compact && yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={geometry.pad.left - 4}
            y1={geometry.py(t)}
            x2={geometry.pad.left}
            y2={geometry.py(t)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={geometry.pad.left - 6}
            y={geometry.py(t) + 3}
            textAnchor="end"
            fontSize={8}
            fill="var(--text-muted)"
          >
            {formatAxisValue(t, config.units)}
          </text>
        </g>
      ))}

      {/* Axes */}
      {!compact && (
        <>
          <line x1={geometry.pad.left} y1={geometry.pad.top} x2={geometry.pad.left} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <line x1={geometry.pad.left} y1={geometry.pad.top + geometry.chartH} x2={geometry.pad.left + geometry.chartW} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <text x={geometry.px(geometry.xMin)} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geometry.xMin}</text>
          <text x={geometry.px(geometry.xMax)} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geometry.xMax}</text>
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
          opacity={0.5}
        />
      )}

      {/* History line (solid) */}
      {historyPath && (
        <path d={historyPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} />
      )}

      {/* Projection line (dashed) */}
      {projectionPath && (
        <path d={projectionPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7} />
      )}

      {/* Event markers */}
      <EventDots geometry={geometry} markers={eventMarkers} />
    </svg>
  );

  if (compact) return svg;

  return (
    <ChartShell
      config={{ ...config, showProjectionNote: projection.length > 0 }}
      rawData={[
        { label: `${config.title} (history)`, data: history },
        { label: `${config.title} (projection)`, data: projection },
      ]}
    >
      {svg}
    </ChartShell>
  );
}
