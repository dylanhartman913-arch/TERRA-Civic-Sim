import { useTerraStore, type LayerVisibility, type AgChoroplethMode } from '../../state/store.js';

const LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'ecoregions',  label: 'Ecoregions' },
  { key: 'buses',       label: 'Buses' },
  { key: 'branches',    label: 'Branches' },
  { key: 'interchange', label: 'Interchange' },
  { key: 'oracle',      label: 'Oracle' },
  { key: 'yieldBadges', label: 'Yield badges' },
  { key: 'anchors',     label: 'Anchor facilities' },
  { key: 'climateHazards', label: 'Climate hazards' },
  { key: 'sites',       label: 'Site markers' },
  { key: 'agChoropleth', label: 'Ag choropleth' },
];

const AG_CHOROPLETH_MODES: { value: AgChoroplethMode; label: string }[] = [
  { value: 'forage_trend',    label: 'Forage trend' },
  { value: 'invasive_burden', label: 'Invasive burden' },
  { value: 'converted_acres', label: 'Converted acres' },
];

export function LayerToggle() {
  const layers = useTerraStore(s => s.layers);
  const toggleLayer = useTerraStore(s => s.toggleLayer);
  const agChoroplethMode = useTerraStore(s => s.agChoroplethMode);
  const setAgChoroplethMode = useTerraStore(s => s.setAgChoroplethMode);

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
      {layers.agChoropleth && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ag mode</div>
          {AG_CHOROPLETH_MODES.map(({ value, label }) => (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer', fontSize: 11, color: agChoroplethMode === value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <input type="radio" name="ag-choropleth-mode" value={value} checked={agChoroplethMode === value} onChange={() => setAgChoroplethMode(value)} style={{ accentColor: 'var(--teal)', cursor: 'pointer' }} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
