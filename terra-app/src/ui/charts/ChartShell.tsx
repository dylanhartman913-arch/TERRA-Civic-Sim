/**
 * ChartShell — Common wrapper for all chart panels.
 * Provides: title, units, confidence chip, denominator toggle,
 * view-data table toggle, CSV export, source popover.
 */

import { useState, useCallback } from 'react';
import type { ChartConfig, ChartDatum, DenominatorOption } from './types.js';

interface Props {
  config: ChartConfig;
  /** Raw data series for table/export — array of columns */
  rawData: { label: string; data: ChartDatum[] }[];
  /** Active denominator (controlled if denominatorOptions provided) */
  activeDenominator?: DenominatorOption;
  onDenominatorChange?: (d: DenominatorOption) => void;
  children: React.ReactNode;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  low: 'var(--amber)',
  medium: 'var(--text-muted)',
  high: 'var(--teal)',
};

export function ChartShell({ config, rawData, activeDenominator, onDenominatorChange, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const exportCsv = useCallback(() => {
    if (rawData.length === 0) return;
    const allYears = new Set<number>();
    for (const col of rawData) {
      for (const d of col.data) allYears.add(d.year);
    }
    const years = [...allYears].sort((a, b) => a - b);
    const header = ['Year', ...rawData.map(c => c.label)].join(',');
    const rows = years.map(yr => {
      const vals = rawData.map(col => {
        const pt = col.data.find(d => d.year === yr);
        return pt?.value != null ? String(pt.value) : '';
      });
      return [String(yr), ...vals].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rawData, config.title]);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
      position: 'relative',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {config.title}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            ({config.units})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {config.confidenceLevel && (
            <span style={{
              fontSize: 8,
              padding: '1px 4px',
              borderRadius: 2,
              background: 'var(--bg-elevated)',
              color: CONFIDENCE_COLORS[config.confidenceLevel],
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {config.confidenceLevel}
            </span>
          )}
          {/* Denominator toggle */}
          {config.denominatorOptions && config.denominatorOptions.length > 1 && onDenominatorChange && (
            <div style={{ display: 'flex', gap: 1 }}>
              {config.denominatorOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onDenominatorChange(opt)}
                  style={{
                    fontSize: 8,
                    padding: '1px 4px',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    background: activeDenominator?.id === opt.id ? 'var(--bg-elevated)' : 'transparent',
                    color: activeDenominator?.id === opt.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button
          onClick={() => setShowTable(!showTable)}
          style={controlBtnStyle}
          title="Toggle data table"
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
        <button onClick={exportCsv} style={controlBtnStyle} title="Export CSV">
          CSV
        </button>
        <button
          onClick={() => setShowSource(!showSource)}
          style={controlBtnStyle}
          title="Data source"
        >
          Src
        </button>
      </div>

      {/* Source popover */}
      {showSource && (
        <div style={{
          fontSize: 9,
          color: 'var(--text-secondary)',
          background: 'var(--bg-base)',
          borderRadius: 4,
          padding: '6px 8px',
          marginBottom: 6,
          lineHeight: 1.5,
        }}>
          {config.sourceFormula && <div><strong>Formula:</strong> {config.sourceFormula}</div>}
          {config.sourceDescription && <div>{config.sourceDescription}</div>}
          {!config.sourceFormula && !config.sourceDescription && <div>No source info available.</div>}
        </div>
      )}

      {/* Projection note */}
      {config.showProjectionNote && !showTable && (
        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4, fontStyle: 'italic' }}>
          Dashed = conditional forecast under &ldquo;no further decisions,&rdquo; not a prediction.
        </div>
      )}

      {/* Main content area */}
      {showTable ? (
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse', color: 'var(--text-secondary)' }}>
            <thead>
              <tr>
                <th style={thStyle}>Year</th>
                {rawData.map(col => <th key={col.label} style={thStyle}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const allYears = new Set<number>();
                for (const col of rawData) for (const d of col.data) allYears.add(d.year);
                return [...allYears].sort((a, b) => a - b).map(yr => (
                  <tr key={yr}>
                    <td style={tdStyle}>{yr}</td>
                    {rawData.map(col => {
                      const pt = col.data.find(d => d.year === yr);
                      return <td key={col.label} style={tdStyle}>{pt?.value != null ? pt.value.toFixed(4) : '—'}</td>;
                    })}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const controlBtnStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '2px 5px',
  border: '1px solid var(--border)',
  borderRadius: 2,
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '2px 4px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '2px 4px',
  borderBottom: '1px solid var(--border)',
};
