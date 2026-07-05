/**
 * RatioBandPanel — Trajectory with documented band + excursion shading.
 * Used for labor utilization (band: 0–0.3).
 */

import { useMemo } from 'react';
import { ChartShell } from './ChartShell.js';
import { EraShading } from './EraShading.js';
import { createChartGeometry, polylinePath, formatAxisValue } from './svg-utils.js';
import type { ChartConfig, ChartDatum, BandRange } from './types.js';

interface Props {
  config: ChartConfig;
  history: ChartDatum[];
  projection: ChartDatum[];
  band: BandRange;
  currentYear: number;
  compact?: boolean;
  width?: number;
  height?: number;
}

export function RatioBandPanel({
  config,
  history,
  projection,
  band,
  currentYear,
  compact = false,
  width,
  height,
}: Props) {
  const chartWidth = width ?? config.width ?? 320;
  const chartHeight = height ?? config.height ?? 120;

  const { geometry, historyPath, projectionPath, bandRect, excursionPaths } = useMemo(() => {
    const allData = [...history, ...projection];
    const years = allData.map(d => d.year);
    const values = allData.filter(d => d.value != null).map(d => d.value as number);

    // Ensure band edges are visible in Y range
    const allValues = [...values, band.low, band.high];
    const geo = createChartGeometry(years, allValues, { width: chartWidth, height: chartHeight });

    const histPts = history
      .filter(d => d.value != null)
      .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    const projPts = projection
      .filter(d => d.value != null)
      .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));

    if (histPts.length > 0 && projPts.length > 0) {
      projPts.unshift(histPts[histPts.length - 1]);
    }

    // Band rectangle
    const bandY = geo.py(band.high);
    const bandH = geo.py(band.low) - geo.py(band.high);
    const bRect = { x: geo.pad.left, y: bandY, width: geo.chartW, height: Math.max(0, bandH) };

    // Excursion shading — areas where trajectory exits band
    const excursions: string[] = [];
    const allPts = [...history, ...projection].filter(d => d.value != null);
    for (let i = 0; i < allPts.length - 1; i++) {
      const v0 = allPts[i].value as number;
      const v1 = allPts[i + 1].value as number;
      if (v0 > band.high || v1 > band.high) {
        // Above band
        const clampedV0 = Math.max(v0, band.high);
        const clampedV1 = Math.max(v1, band.high);
        const x0 = geo.px(allPts[i].year);
        const x1 = geo.px(allPts[i + 1].year);
        const path = `M${x0.toFixed(1)},${geo.py(band.high).toFixed(1)} L${x0.toFixed(1)},${geo.py(clampedV0).toFixed(1)} L${x1.toFixed(1)},${geo.py(clampedV1).toFixed(1)} L${x1.toFixed(1)},${geo.py(band.high).toFixed(1)} Z`;
        excursions.push(path);
      }
    }

    return {
      geometry: geo,
      historyPath: polylinePath(histPts),
      projectionPath: polylinePath(projPts),
      bandRect: bRect,
      excursionPaths: excursions,
    };
  }, [history, projection, band, chartWidth, chartHeight]);

  const svg = (
    <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible', display: 'block' }}>
      <EraShading geometry={geometry} bands={config.eraBands} />

      {/* Band rectangle */}
      <rect
        x={bandRect.x}
        y={bandRect.y}
        width={bandRect.width}
        height={bandRect.height}
        fill={band.color}
        opacity={0.12}
      />

      {/* Band edges */}
      <line
        x1={geometry.pad.left}
        y1={geometry.py(band.high)}
        x2={geometry.pad.left + geometry.chartW}
        y2={geometry.py(band.high)}
        stroke={band.color}
        strokeWidth={0.5}
        strokeDasharray="3,3"
        opacity={0.5}
      />
      <line
        x1={geometry.pad.left}
        y1={geometry.py(band.low)}
        x2={geometry.pad.left + geometry.chartW}
        y2={geometry.py(band.low)}
        stroke={band.color}
        strokeWidth={0.5}
        strokeDasharray="3,3"
        opacity={0.5}
      />

      {/* Excursion shading */}
      {excursionPaths.map((d, i) => (
        <path key={i} d={d} fill="var(--warning)" opacity={0.15} />
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

      {/* History (solid) */}
      {historyPath && <path d={historyPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} />}
      {/* Projection (dashed) */}
      {projectionPath && <path d={projectionPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7} />}

      {/* Axes & labels */}
      {!compact && (
        <>
          <line x1={geometry.pad.left} y1={geometry.pad.top} x2={geometry.pad.left} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          <line x1={geometry.pad.left} y1={geometry.pad.top + geometry.chartH} x2={geometry.pad.left + geometry.chartW} y2={geometry.pad.top + geometry.chartH} stroke="var(--border)" strokeWidth={1} />
          {/* Band edge labels */}
          <text x={geometry.pad.left + geometry.chartW + 3} y={geometry.py(band.high) + 3} fontSize={7} fill="var(--text-muted)">
            {formatAxisValue(band.high, config.units)}
          </text>
          <text x={geometry.pad.left + geometry.chartW + 3} y={geometry.py(band.low) + 3} fontSize={7} fill="var(--text-muted)">
            {formatAxisValue(band.low, config.units)}
          </text>
          {/* Band label */}
          <text x={geometry.pad.left + 4} y={geometry.py((band.low + band.high) / 2) + 3} fontSize={7} fill={band.color} opacity={0.7}>
            {band.label}
          </text>
        </>
      )}
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
