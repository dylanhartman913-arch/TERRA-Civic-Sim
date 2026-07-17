import { useTerraStore } from '../../state/store.js';
import { CLIMATE_EPOCHS, choroplethMetrics, climateMetricCoverage } from '../climate.js';
import type { ClimateEpoch, ClimateLens, ClimateMetric } from '../climate.js';

const LENSES: { value: ClimateLens; label: string }[] = [
  { value: 'historical', label: 'Historical' },
  { value: 'ssp245', label: 'SSP2-4.5' },
  { value: 'ssp370', label: 'SSP3-7.0' },
];

export function ClimateLensSelector() {
  const climateLens = useTerraStore(s => s.climateLens);
  const setClimateLens = useTerraStore(s => s.setClimateLens);
  const climateEpoch = useTerraStore(s => s.climateEpoch);
  const setClimateEpoch = useTerraStore(s => s.setClimateEpoch);
  const climateMetric = useTerraStore(s => s.climateMetric);
  const setClimateMetric = useTerraStore(s => s.setClimateMetric);
  const metrics = choroplethMetrics();
  const coverage = climateMetricCoverage(climateMetric);
  return (
    <div data-testid="climate-lens-selector" style={{ display: 'grid', gap: 4, fontFamily: 'var(--font-mono)' }}>
      <label style={{ display: 'grid', gap: 4 }}><span style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Climate lens</span>
        <select aria-label="Climate lens" value={climateLens} onChange={event => setClimateLens(event.target.value as ClimateLens)} style={selectStyle}>
          {LENSES.map(lens => <option key={lens.value} value={lens.value}>{lens.label}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4 }}><span style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Hazard metric</span>
        <select aria-label="Climate hazard metric" value={climateMetric} onChange={event => setClimateMetric(event.target.value as ClimateMetric)} style={selectStyle}>
          {metrics.map(metric => <option key={metric} value={metric}>{metric.replaceAll('_', ' ')} ({climateMetricCoverage(metric)} counties)</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4 }}><span style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Epoch</span>
        <select aria-label="Climate epoch" value={climateEpoch} onChange={event => setClimateEpoch(event.target.value as ClimateEpoch)} style={selectStyle}>
          {CLIMATE_EPOCHS.map(epoch => <option key={epoch} value={epoch}>{epoch}</option>)}
        </select>
      </label>
      {coverage < 157 && <span data-testid="climate-partial-coverage" style={{ color: 'var(--warning)', fontSize: 9 }}>Partial coverage: {coverage} counties. Others show no data.</span>}
    </div>
  );
}

const selectStyle = { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 7px' };
