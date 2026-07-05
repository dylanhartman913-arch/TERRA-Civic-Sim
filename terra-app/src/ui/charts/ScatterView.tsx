/**
 * ScatterView — shared scatter/frontier component.
 *
 * Generic: accepts pre-computed ScatterPoint[].
 * Used by DebriefView (session outcomes) and AnalyzeView (county/scenario frontiers).
 * W6's Outcome Scatter tab imports this component — no second scatter implementation.
 */

export interface ScatterPoint {
  x: number;
  y: number;
  label: string;
  color: string;
  /** 'diamond' marks comparison-scenario points visually distinct from primary */
  shape?: 'circle' | 'diamond';
}

interface Props {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
  emptyMessage?: string;
}

function fmtTick(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
  return v.toFixed(2);
}

export function ScatterView({
  points,
  xLabel,
  yLabel,
  width = 380,
  height = 260,
  emptyMessage = 'No data to display',
}: Props) {
  const pad = { top: 20, right: 28, bottom: 42, left: 58 };
  const cW = width - pad.left - pad.right;
  const cH = height - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
      }}>
        {emptyMessage}
      </div>
    );
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const rawMinX = Math.min(...xs), rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys), rawMaxY = Math.max(...ys);
  const xPad = (rawMaxX - rawMinX || Math.abs(rawMinX) || 1) * 0.08;
  const yPad = (rawMaxY - rawMinY || Math.abs(rawMinY) || 1) * 0.08;
  const x1 = rawMinX - xPad, x2 = rawMaxX + xPad;
  const y1 = rawMinY - yPad, y2 = rawMaxY + yPad;
  const xR = x2 - x1 || 1;
  const yR = y2 - y1 || 1;

  const px = (v: number) => pad.left + ((v - x1) / xR) * cW;
  const py = (v: number) => pad.top + cH - ((v - y1) / yR) * cH;

  const yTicks = [y1, (y1 + y2) / 2, y2];
  const xTicks = [x1, (x1 + x2) / 2, x2];

  return (
    <svg
      width={width}
      height={height}
      style={{ overflow: 'visible', fontFamily: 'var(--font-mono)', display: 'block' }}
    >
      {/* Grid */}
      {yTicks.map((t, i) => (
        <line key={`gy${i}`}
          x1={pad.left} y1={py(t)} x2={pad.left + cW} y2={py(t)}
          stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3"
        />
      ))}
      {xTicks.map((t, i) => (
        <line key={`gx${i}`}
          x1={px(t)} y1={pad.top} x2={px(t)} y2={pad.top + cH}
          stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3"
        />
      ))}

      {/* Axes */}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + cH} stroke="var(--border)" strokeWidth={1} />
      <line x1={pad.left} y1={pad.top + cH} x2={pad.left + cW} y2={pad.top + cH} stroke="var(--border)" strokeWidth={1} />

      {/* Y ticks */}
      {yTicks.map((t, i) => (
        <text key={`yt${i}`} x={pad.left - 5} y={py(t) + 3}
          textAnchor="end" fontSize={8} fill="var(--text-muted)"
        >
          {fmtTick(t)}
        </text>
      ))}
      {/* X ticks */}
      {xTicks.map((t, i) => (
        <text key={`xt${i}`} x={px(t)} y={pad.top + cH + 13}
          textAnchor="middle" fontSize={8} fill="var(--text-muted)"
        >
          {fmtTick(t)}
        </text>
      ))}

      {/* Axis labels */}
      <text x={pad.left + cW / 2} y={height - 2} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
        {xLabel}
      </text>
      <text
        transform={`rotate(-90) translate(${-(pad.top + cH / 2)},${14})`}
        textAnchor="middle" fontSize={9} fill="var(--text-secondary)"
      >
        {yLabel}
      </text>

      {/* Points */}
      {points.map((pt, i) => {
        const cx = px(pt.x);
        const cy = py(pt.y);
        const shape = pt.shape ?? 'circle';
        return (
          <g key={i}>
            {shape === 'diamond' ? (
              <polygon
                points={`${cx},${cy - 6} ${cx + 5},${cy} ${cx},${cy + 6} ${cx - 5},${cy}`}
                fill={pt.color}
                fillOpacity={0.75}
                stroke={pt.color}
                strokeWidth={0.5}
              />
            ) : (
              <circle cx={cx} cy={cy} r={6} fill={pt.color} fillOpacity={0.8} />
            )}
            <text x={cx + 9} y={cy + 3} fontSize={8} fill={pt.color}>
              {pt.label.slice(0, 12)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
