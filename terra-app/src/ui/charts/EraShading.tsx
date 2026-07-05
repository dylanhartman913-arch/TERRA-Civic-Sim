/**
 * EraShading — SVG <g> rendering vertical era bands.
 * Era boundaries: Foundation (2025-2035), Transition (2035-2045),
 * Buildout (2045-2055), Steady State (2055+).
 */

import type { ChartGeometry } from './svg-utils.js';
import type { EraBand } from './types.js';

const DEFAULT_ERA_BANDS: EraBand[] = [
  { start: 2025, end: 2035, label: 'Foundation', color: 'rgba(45, 212, 191, 0.04)' },
  { start: 2035, end: 2045, label: 'Transition', color: 'rgba(167, 139, 250, 0.04)' },
  { start: 2045, end: 2055, label: 'Buildout', color: 'rgba(245, 158, 11, 0.04)' },
  { start: 2055, end: 2075, label: 'Steady State', color: 'rgba(45, 212, 191, 0.04)' },
];

interface Props {
  geometry: ChartGeometry;
  bands?: EraBand[];
}

export function EraShading({ geometry, bands }: Props) {
  const { px, pad, chartH, xMin, xMax } = geometry;
  const eraBands = bands ?? DEFAULT_ERA_BANDS;

  return (
    <g>
      {eraBands.map((band, i) => {
        const x0 = Math.max(px(band.start), pad.left);
        const x1 = Math.min(px(band.end), px(xMax));
        if (x1 <= x0) return null;
        if (band.end < xMin || band.start > xMax) return null;
        const w = x1 - x0;
        return (
          <g key={i}>
            <rect
              x={x0}
              y={pad.top}
              width={w}
              height={chartH}
              fill={band.color}
            />
            {w > 30 && (
              <text
                x={x0 + w / 2}
                y={pad.top + 8}
                textAnchor="middle"
                fontSize={7}
                fill="var(--text-muted)"
                opacity={0.6}
              >
                {band.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export { DEFAULT_ERA_BANDS };
