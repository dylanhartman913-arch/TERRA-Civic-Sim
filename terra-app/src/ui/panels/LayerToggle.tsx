import { useTerraStore, type LayerVisibility } from '../../state/store.js';

const LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'ecoregions',  label: 'Ecoregions' },
  { key: 'buses',       label: 'Buses' },
  { key: 'branches',    label: 'Branches' },
  { key: 'interchange', label: 'Interchange' },
  { key: 'oracle',      label: 'Oracle' },
  { key: 'yieldBadges', label: 'Yield badges' },
];

export function LayerToggle() {
  const layers = useTerraStore(s => s.layers);
  const toggleLayer = useTerraStore(s => s.toggleLayer);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 12px',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
        Layers
      </div>
      {LAYERS.map(({ key, label }) => (
        <label key={key} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '3px 0',
          cursor: 'pointer',
          fontSize: 12,
          color: layers[key] ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}>
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={() => toggleLayer(key)}
            style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
