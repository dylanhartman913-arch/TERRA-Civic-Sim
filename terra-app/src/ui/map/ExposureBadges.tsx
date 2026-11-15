import type { AssetInstance } from '../../engine/types.js';
import { exposureTagsForAnchor } from './anchorFacilities.js';

export function ExposureBadges({ asset }: { asset: AssetInstance | null }) {
  if (!asset) return null;
  // Tags are keyed by anchor id, not registry asset_id (W7-F2-FU-2).
  const entry = exposureTagsForAnchor(asset.anchor_id);
  if (!entry) return null;
  return <div data-testid="exposure-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
    {Object.entries(entry.tags).map(([hazard, tag]) => <span key={hazard} title={`${tag.source} · ${tag.method} · confidence: ${tag.confidence}`} style={{ border: '1px solid var(--border)', borderRadius: 3, color: tag.confidence === 'low' ? 'var(--warning)' : 'var(--text-secondary)', fontSize: 8, padding: '2px 4px' }}>{hazard.replace(/_/g, ' ')}: {tag.value}</span>)}
  </div>;
}
