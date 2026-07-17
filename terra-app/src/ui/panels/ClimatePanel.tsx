import { useState } from 'react';
import { CLIMATE_EPOCHS, CLIMATE_METRICS, climateRecordsFor, hasEagleBiasFlag } from '../climate.js';
import type { ClimateLens, ClimateRecord } from '../climate.js';

export function AttributionPopover({ record }: { record: ClimateRecord }) {
  return <div role="dialog" aria-label="Climate record attribution" style={{ position: 'absolute', right: 0, zIndex: 4, width: 270, padding: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 9, lineHeight: 1.4 }}>
    <div>Scenario: {record.scenario}</div><div>Epoch: {record.epoch}</div><div>Percentile: {record.percentile}</div><div>Source: {record.source}</div><div>Method: {record.method}</div><div>Confidence: {record.confidence}</div><div>Downscaling: {record.downscaling_method ?? 'not provided'}</div>
  </div>;
}

function Attribution({ record }: { record: ClimateRecord }) {
  const [open, setOpen] = useState(false);
  return <span style={{ position: 'relative' }}>
    <button aria-label={`Attribution for ${record.epoch} ${record.percentile}`} onClick={() => setOpen(value => !value)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9 }}>i</button>
    {open && <AttributionPopover record={record} />}
  </span>;
}

export function ClimatePanel({ geoid, lens, initialMetric = 'annual_mean_temp_f' }: { geoid: string; lens: ClimateLens; initialMetric?: (typeof CLIMATE_METRICS)[number]['key'] }) {
  const [metric, setMetric] = useState<(typeof CLIMATE_METRICS)[number]['key']>(initialMetric);
  const details = CLIMATE_METRICS.find(item => item.key === metric)!;
  const records = climateRecordsFor(geoid, lens, metric);
  if (lens === 'historical') return <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Historical lens has no projection fan chart.</div>;
  if (records.length === 0) return <div style={{ color: 'var(--warning)', fontSize: 10 }}>Projection records unavailable for this county and metric.</div>;
  return <div data-testid="county-climate-panel" style={{ display: 'grid', gap: 8 }}>
    <label style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Hazard <select aria-label="Climate hazard" value={metric} onChange={event => setMetric(event.target.value as typeof metric)} style={{ marginLeft: 5, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{CLIMATE_METRICS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    {hasEagleBiasFlag(geoid) && <div data-testid="eagle-co-bias-flag" style={{ color: 'var(--warning)', fontSize: 10 }}>Eagle, CO temperature bias flag: LOCA2 absolute temperatures are cold-biased; trajectories remain displayed.</div>}
    <div aria-label={`${details.label} p10 p50 p90 fan chart`} style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 4, fontSize: 9 }}>
      <span />{CLIMATE_EPOCHS.map(epoch => <span key={epoch} style={{ color: 'var(--text-muted)' }}>{epoch}</span>)}
      {(['p10', 'p50', 'p90'] as const).map(percentile => <><span key={`${percentile}-label`} style={{ color: percentile === 'p50' ? 'var(--teal)' : 'var(--text-secondary)' }}>{percentile}</span>{CLIMATE_EPOCHS.map(epoch => { const record = records.find(item => item.epoch === epoch && item.percentile === percentile); return <span key={`${percentile}-${epoch}`} style={{ display: 'flex', gap: 3, color: record?.confidence === 'low' ? 'var(--warning)' : 'var(--text-primary)' }}>{record ? <>{record.value} {details.unit}{record.confidence === 'low' && ' low confidence'}<Attribution record={record} /></> : '—'}</span>; })}</>)}
    </div>
  </div>;
}
