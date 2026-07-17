import climateProjectionData from '../../../data/processed/county_climate_projections.json';
import climateBaselineData from '../../../data/processed/county_climate_baseline.json';

export type ClimateLens = 'historical' | 'ssp245' | 'ssp370';

export interface ClimateRecord {
  geoid: string;
  county_name: string;
  state: string;
  lens: Exclude<ClimateLens, 'historical'>;
  metric: string;
  value: number;
  scenario: string;
  epoch: string;
  percentile: 'p10' | 'p50' | 'p90';
  source: string;
  method: string;
  confidence: string;
  downscaling_method?: string | null;
}

const records = (climateProjectionData as { records: ClimateRecord[] }).records;

export const CLIMATE_METRICS = [
  { key: 'annual_mean_temp_f', label: 'Annual mean temperature', unit: '°F' },
  { key: 'days_gt_95f', label: 'Days above 95°F', unit: 'days' },
  { key: 'high_fire_danger_days', label: 'High fire-danger days', unit: 'days' },
  { key: 'water_stress_index', label: 'Water stress index', unit: 'index' },
] as const;

export const CLIMATE_EPOCHS = ['2030', '2040', '2050', '2065'] as const;

export type ClimateEpoch = (typeof CLIMATE_EPOCHS)[number];
export type ClimateMetric = string;

interface ClimateBaselineData {
  schema_version?: string;
  units?: Record<string, string>;
  metrics?: string[];
  baselines?: ClimateRecord[];
  deltas?: Array<ClimateRecord & {
    baseline_key: [string, string, ClimateRecord['percentile']];
    baseline_value: number;
    projected_value: number;
    baseline_attribution: ClimateRecord;
  }>;
}

const baselineSurface = climateBaselineData as ClimateBaselineData;
const c21Available = baselineSurface.schema_version === 'C2.1.0'
  && Array.isArray(baselineSurface.baselines)
  && Array.isArray(baselineSurface.deltas);
const baselineByKey = new Map(
  c21Available
    ? baselineSurface.baselines!.map(record => [`${record.geoid}|${record.metric}|${record.percentile}`, record])
    : [],
);

/** C2.1 is authoritative only when its versioned baseline/delta surface is intact. */
export function hasClimateBaselineSurface(): boolean {
  return c21Available;
}

/** Coverage is derived from baseline keys, never from the top-level metrics registry. */
export function climateMetricCoverage(metric: ClimateMetric): number {
  if (!c21Available) return metric === 'high_fire_danger_days' ? 157 : 0;
  return new Set(baselineSurface.baselines!
    .filter(record => record.metric === metric)
    .map(record => record.geoid)).size;
}

export function choroplethMetrics(): ClimateMetric[] {
  if (!c21Available) return ['high_fire_danger_days'];
  return [...new Set(baselineSurface.baselines!.map(record => record.metric))];
}

/**
 * Resolves one map cell. Delta rows are accepted only when their documented
 * baseline_key joins the matching C2.1 historical record.
 */
export function climateSurfaceRecordFor(
  geoid: string,
  lens: ClimateLens,
  metric: ClimateMetric,
  epoch: ClimateEpoch,
  percentile: ClimateRecord['percentile'] = 'p50',
  surfaceAvailable = c21Available,
): ClimateRecord | undefined {
  if (surfaceAvailable && c21Available) {
    if (lens === 'historical') {
      return baselineByKey.get(`${geoid}|${metric}|${percentile}`);
    }
    const delta = baselineSurface.deltas!.find(record =>
      record.geoid === geoid && record.lens === lens && record.metric === metric
      && record.epoch === epoch && record.percentile === percentile,
    );
    if (!delta) return undefined;
    const baseline = baselineByKey.get(delta.baseline_key.join('|'));
    if (!baseline || baseline.geoid !== geoid || baseline.metric !== metric || baseline.percentile !== percentile) return undefined;
    return delta;
  }

  // C5a-compatible degradation path if the C2.1 artifact is absent or invalid.
  if (lens === 'historical' || metric !== 'high_fire_danger_days' || epoch !== '2050') return undefined;
  return climateRecordFor(geoid, lens, metric, epoch, percentile);
}

export function climateRecordsFor(geoid: string, lens: ClimateLens, metric: string): ClimateRecord[] {
  if (lens === 'historical') return [];
  return records.filter(record => record.geoid === geoid && record.lens === lens && record.metric === metric);
}

export function climateRecordFor(
  geoid: string,
  lens: ClimateLens,
  metric: string,
  epoch: string,
  percentile: ClimateRecord['percentile'] = 'p50',
): ClimateRecord | undefined {
  return climateRecordsFor(geoid, lens, metric).find(record =>
    record.epoch === epoch && record.percentile === percentile,
  );
}

export function hasEagleBiasFlag(geoid: string): boolean {
  return geoid === '08037';
}
