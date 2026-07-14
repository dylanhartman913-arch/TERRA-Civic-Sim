import { ANCHOR_FACILITIES, formatSectorName, sectorTokenForAnchor, cssVarForToken } from './anchorFacilities.js';

const SECTORS = Array.from(new Map(
  ANCHOR_FACILITIES
    .filter(anchor => anchor.properties.tier === 2)
    .map(anchor => [
      anchor.properties.display_sector,
      {
        label: formatSectorName(anchor.properties.display_sector),
        token: sectorTokenForAnchor(anchor),
      },
    ]),
).values()).sort((a, b) => a.label.localeCompare(b.label));

export function MarkerLegend() {
  return (
    <div style={{
      position: 'absolute',
      left: 14,
      bottom: 28,
      zIndex: 30,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '8px 10px',
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-primary)',
      pointerEvents: 'none',
      maxWidth: 270,
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        Map Markers
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: 9 }}>
        <LegendShape label="Generator buses" shape="circle" color="var(--text-secondary)" />
        <LegendShape label="Brownfield sites" shape="diamond" color="var(--teal)" />
        <LegendShape label="Player pins" shape="pin" color="var(--construction)" />
        <LegendShape label="Anchor facilities" shape="ring" color="var(--warning)" />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 7, paddingTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
        {SECTORS.map(sector => (
          <span key={sector.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, color: 'var(--text-secondary)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: `var(${cssVarForToken(sector.token)})`, display: 'inline-block' }} />
            {sector.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LegendShape({ label, shape, color }: { label: string; shape: 'circle' | 'diamond' | 'pin' | 'ring'; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
      <span style={{
        width: 9,
        height: 9,
        borderRadius: shape === 'circle' || shape === 'ring' ? '50%' : shape === 'pin' ? '50% 50% 50% 0' : 2,
        border: shape === 'ring' ? `2px solid ${color}` : '1px solid var(--bg-elevated)',
        background: shape === 'ring' ? 'transparent' : color,
        transform: shape === 'diamond' ? 'rotate(45deg)' : shape === 'pin' ? 'rotate(-45deg)' : undefined,
        display: 'inline-block',
      }} />
      {label}
    </span>
  );
}
