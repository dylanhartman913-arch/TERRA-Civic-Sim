import anchorFacilitiesData from '../../data/mw_anchor_facilities.geojson';
import anchorSectorTaxonomy from '../../data/anchor_sector_taxonomy.json';

export interface AnchorFeatureProperties {
  anchor_id: string;
  name: string;
  parent?: string | null;
  geoid: string;
  display_sector: string;
  naics?: string | null;
  tier: number;
  asset_class?: string | null;
  capacity_or_load_mw?: number | null;
  employment_est?: number | null;
  co2e_tpy?: number | null;
  source?: string | null;
  confidence?: string | null;
  commodity?: string | null;
  coords_flag?: string | null;
}

export interface AnchorFacility {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: AnchorFeatureProperties;
}

export interface SectorTaxonomyEntry {
  color_token: string;
  display_sector: string;
}

export type Rgba = [number, number, number, number];

export const ANCHOR_FACILITIES = (
  (anchorFacilitiesData as unknown as { features: AnchorFacility[] }).features ?? []
).filter(f => f.geometry?.type === 'Point');

export const ANCHOR_TAXONOMY = anchorSectorTaxonomy as Record<string, SectorTaxonomyEntry>;

const SECTOR_TOKEN_FALLBACK: Record<string, string> = {
  agriculture: 'sector_agriculture',
  'data/technology': 'sector_data_technology',
  education: 'sector_education',
  'government/military': 'sector_government',
  healthcare: 'sector_healthcare',
  'manufacturing/chemicals': 'sector_manufacturing',
  'mining/extraction': 'sector_mining',
  other: 'sector_other',
  'tourism/recreation': 'sector_tourism',
  'utilities/power': 'sector_utilities',
};

export function cssVarForToken(token: string): string {
  return `--${token.replace(/_/g, '-')}`;
}

export function sectorTokenForAnchor(anchor: AnchorFacility): string {
  const props = anchor.properties;
  const naics = props.naics ?? '';
  const direct = ANCHOR_TAXONOMY[naics]?.color_token;
  if (direct) return direct;

  const twoDigit = naics.slice(0, 2);
  const twoDigitToken = ANCHOR_TAXONOMY[twoDigit]?.color_token;
  if (twoDigitToken) return twoDigitToken;

  if (twoDigit >= '31' && twoDigit <= '33') return ANCHOR_TAXONOMY['31-33'].color_token;
  if (twoDigit === '44' || twoDigit === '45') return ANCHOR_TAXONOMY['44-45'].color_token;
  if (twoDigit === '48' || twoDigit === '49') return ANCHOR_TAXONOMY['48-49'].color_token;

  return SECTOR_TOKEN_FALLBACK[props.display_sector] ?? 'sector_other';
}

export function parseCssColor(value: string): Rgba {
  const rgba = value.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return [139, 148, 158, 220];
  const parts = rgba[1].split(',').map(part => part.trim());
  const alpha = parts[3] == null ? 1 : Number(parts[3]);
  return [
    Number(parts[0]) || 0,
    Number(parts[1]) || 0,
    Number(parts[2]) || 0,
    Math.round((Number.isFinite(alpha) ? alpha : 1) * 255),
  ];
}

export function resolveAnchorColor(anchor: AnchorFacility, styles: CSSStyleDeclaration): Rgba {
  const token = sectorTokenForAnchor(anchor);
  const value = styles.getPropertyValue(cssVarForToken(token)).trim();
  return parseCssColor(value);
}

export function anchorSize(anchor: AnchorFacility): number {
  const capacity = anchor.properties.capacity_or_load_mw ?? 0;
  const employment = anchor.properties.employment_est ?? 0;
  const basis = Math.max(capacity, employment / 2);
  if (basis >= 1000) return 88;
  if (basis >= 300) return 66;
  if (basis >= 100) return 50;
  return anchor.properties.tier === 2 ? 38 : 26;
}

export function anchorWeight(anchor: AnchorFacility): number {
  return Math.max(
    anchor.properties.capacity_or_load_mw ?? 0,
    (anchor.properties.employment_est ?? 0) / 2,
    (anchor.properties.co2e_tpy ?? 0) / 4000,
    anchor.properties.tier === 2 ? 50 : 10,
  );
}

export function visibleAnchorsForZoom(anchors: AnchorFacility[], zoom: number): AnchorFacility[] {
  const tier2 = anchors.filter(anchor => anchor.properties.tier === 2);
  if (zoom >= 8.2) return tier2;

  const byCounty = new Map<string, AnchorFacility[]>();
  for (const anchor of tier2) {
    const geoid = anchor.properties.geoid;
    const group = byCounty.get(geoid) ?? [];
    group.push(anchor);
    byCounty.set(geoid, group);
  }

  const perCounty = zoom >= 6.8 ? 3 : zoom >= 5.6 ? 2 : 1;
  return [...byCounty.values()].flatMap(group =>
    group.sort((a, b) => anchorWeight(b) - anchorWeight(a)).slice(0, perCounty),
  );
}

export function anchorById(anchorId: string | null | undefined): AnchorFacility | null {
  if (!anchorId) return null;
  return ANCHOR_FACILITIES.find(anchor => anchor.properties.anchor_id === anchorId) ?? null;
}

export function formatSectorName(displaySector: string): string {
  return displaySector
    .split('/')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
}
