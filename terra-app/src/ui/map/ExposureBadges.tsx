import exposureData from '../../data/asset_exposure_tags.json';
import type { AssetInstance } from '../../engine/types.js';

type ExposureTag = { value: string; source: string; method: string; confidence: string };
type ExposureEntry = { asset_id: string; tags: Record<string, ExposureTag>; judgment_flags?: string[] };

const entries = (exposureData as { assets: ExposureEntry[] }).assets;

export function ExposureBadges({ asset }: { asset: AssetInstance | null }) {
  if (!asset) return null;
  const entry = entries.find(candidate => candidate.asset_id === asset.asset_id);
  if (!entry) return null;
  return <div data-testid="exposure-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
    {Object.entries(entry.tags).map(([hazard, tag]) => <span key={hazard} title={`${tag.source} · ${tag.method} · confidence: ${tag.confidence}`} style={{ border: '1px solid var(--border)', borderRadius: 3, color: tag.confidence === 'low' ? 'var(--warning)' : 'var(--text-secondary)', fontSize: 8, padding: '2px 4px' }}>{hazard.replace(/_/g, ' ')}: {tag.value}</span>)}
  </div>;
}
