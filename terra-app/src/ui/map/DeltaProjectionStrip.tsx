/**
 * DeltaProjectionStrip — 3 mini trajectory charts showing
 * fiscal_balance, labor_utilization, housing_pressure
 * with vs without the candidate action.
 */

import { useMemo } from 'react';
import { useDeltaProjection } from '../../state/selectors.js';
import { createChartGeometry, polylinePath } from '../charts/svg-utils.js';
import type { ChartDatum } from '../charts/types.js';

const INDICATORS = [
  { id: 'fiscal_balance', label: 'Fiscal', units: 'USD/yr' },
  { id: 'labor_utilization', label: 'Labor', units: 'ratio' },
  { id: 'housing_pressure', label: 'Housing', units: 'ratio' },
];

function MiniDelta({ withAction, baseline, label }: { withAction: ChartDatum[]; baseline: ChartDatum[]; label: string }) {
  const { actionPath, baselinePath, geo } = useMemo(() => {
    const allData = [...withAction, ...baseline];
    const years = allData.map(d => d.year);
    const values = allData.filter(d => d.value != null).map(d => d.value as number);
    const g = createChartGeometry(years, values, { width: 140, height: 50, pad: { top: 4, right: 4, bottom: 12, left: 4 } });

    const aPts = withAction.filter(d => d.value != null).map(d => ({ x: g.px(d.year), y: g.py(d.value as number) }));
    const bPts = baseline.filter(d => d.value != null).map(d => ({ x: g.px(d.year), y: g.py(d.value as number) }));

    return { actionPath: polylinePath(aPts), baselinePath: polylinePath(bPts), geo: g };
  }, [withAction, baseline]);

  return (
    <div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 1 }}>{label}</div>
      <svg width={140} height={50} style={{ display: 'block' }}>
        {baselinePath && <path d={baselinePath} fill="none" stroke="var(--text-muted)" strokeWidth={1} opacity={0.5} />}
        {actionPath && <path d={actionPath} fill="none" stroke="var(--teal)" strokeWidth={1.5} />}
        <text x={4} y={geo.pad.top + geo.chartH + 10} fontSize={7} fill="var(--text-muted)">{geo.xMin}</text>
        <text x={136} y={geo.pad.top + geo.chartH + 10} textAnchor="end" fontSize={7} fill="var(--text-muted)">{geo.xMax}</text>
      </svg>
    </div>
  );
}

interface Props {
  actionId: string;
  geoid: string;
  magnitude: number;
}

export function DeltaProjectionStrip({ actionId, geoid, magnitude }: Props) {
  const fiscal = useDeltaProjection(actionId, geoid, magnitude, 'fiscal_balance', 10);
  const labor = useDeltaProjection(actionId, geoid, magnitude, 'labor_utilization', 10);
  const housing = useDeltaProjection(actionId, geoid, magnitude, 'housing_pressure', 10);

  const results = [
    { ...INDICATORS[0], data: fiscal },
    { ...INDICATORS[1], data: labor },
    { ...INDICATORS[2], data: housing },
  ];

  const hasAnyData = results.some(r => r.data != null);

  if (!hasAnyData) {
    return (
      <div style={{
        marginBottom: 16,
        padding: '8px 10px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        fontSize: 9,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        Computing projection...
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: 16,
      padding: '8px 10px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        10-year projection (teal = with action)
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {results.map(r => {
          if (!r.data) return <div key={r.id} style={{ flex: 1, fontSize: 8, color: 'var(--text-muted)' }}>...</div>;
          return (
            <div key={r.id} style={{ flex: 1 }}>
              <MiniDelta
                withAction={r.data.withAction}
                baseline={r.data.baseline}
                label={r.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
