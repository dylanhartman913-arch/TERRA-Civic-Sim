import { useTerraStore } from '../../state/store.js';
import type { ClimateLens } from '../climate.js';

const LENSES: { value: ClimateLens; label: string }[] = [
  { value: 'historical', label: 'Historical' },
  { value: 'ssp245', label: 'SSP2-4.5' },
  { value: 'ssp370', label: 'SSP3-7.0' },
];

export function ClimateLensSelector() {
  const climateLens = useTerraStore(s => s.climateLens);
  const setClimateLens = useTerraStore(s => s.setClimateLens);
  return (
    <label data-testid="climate-lens-selector" style={{ display: 'grid', gap: 4, fontFamily: 'var(--font-mono)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Climate lens</span>
      <select aria-label="Climate lens" value={climateLens} onChange={event => setClimateLens(event.target.value as ClimateLens)} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 7px' }}>
        {LENSES.map(lens => <option key={lens.value} value={lens.value}>{lens.label}</option>)}
      </select>
    </label>
  );
}
