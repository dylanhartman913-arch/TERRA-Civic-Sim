/**
 * SVG coordinate utilities for the chart library.
 * Extracted from the ComparisonView.tsx LineChart pattern.
 */

export interface Pad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartGeometry {
  width: number;
  height: number;
  pad: Pad;
  chartW: number;
  chartH: number;
  px: (year: number) => number;
  py: (value: number) => number;
  yMin: number;
  yMax: number;
  xMin: number;
  xMax: number;
}

const DEFAULT_PAD: Pad = { top: 12, right: 12, bottom: 24, left: 40 };

export function createScaler(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dRange = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / dRange) * (r1 - r0);
}

export function createChartGeometry(
  years: number[],
  values: number[],
  opts?: { width?: number; height?: number; pad?: Partial<Pad>; yMin?: number; yMax?: number },
): ChartGeometry {
  const width = opts?.width ?? 320;
  const height = opts?.height ?? 120;
  const pad: Pad = { ...DEFAULT_PAD, ...opts?.pad };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const nonNull = values.filter(v => v != null && isFinite(v));
  const dataMin = nonNull.length > 0 ? Math.min(...nonNull) : 0;
  const dataMax = nonNull.length > 0 ? Math.max(...nonNull) : 1;
  const yMin = opts?.yMin ?? dataMin;
  const yMax = opts?.yMax ?? (dataMax === dataMin ? dataMax + 1 : dataMax);

  const xMin = years.length > 0 ? years[0] : 2025;
  const xMax = years.length > 0 ? years[years.length - 1] : 2055;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const px = (year: number) => pad.left + ((year - xMin) / xRange) * chartW;
  const py = (value: number) => pad.top + chartH - ((value - yMin) / yRange) * chartH;

  return { width, height, pad, chartW, chartH, px, py, yMin, yMax, xMin, xMax };
}

export function polylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

export function areaPath(
  upper: { x: number; y: number }[],
  lower: { x: number; y: number }[],
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const forward = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const reversed = [...lower].reverse();
  const backward = reversed.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return `${forward} ${backward} Z`;
}

export function formatAxisValue(v: number, units: string): string {
  if (units.includes('USD') || units.includes('$')) {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
    return `${sign}$${Math.round(abs)}`;
  }
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (Math.abs(v) < 10 && v !== 0) return v.toFixed(2);
  return String(Math.round(v));
}
