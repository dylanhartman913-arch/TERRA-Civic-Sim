import climateProjectionData from '../../../data/processed/county_climate_projections.json';

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
}

const records = (climateProjectionData as { records: ClimateRecord[] }).records;

export const CLIMATE_METRICS = [
  { key: 'annual_mean_temp_f', label: 'Annual mean temperature', unit: '°F' },
  { key: 'days_gt_95f', label: 'Days above 95°F', unit: 'days' },
  { key: 'high_fire_danger_days', label: 'High fire-danger days', unit: 'days' },
  { key: 'water_stress_index', label: 'Water stress index', unit: 'index' },
] as const;

export const CLIMATE_EPOCHS = ['2030', '2040', '2050', '2065'] as const;

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
