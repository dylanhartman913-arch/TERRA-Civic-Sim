/**
 * Chart system shared types — TERRA Civic Sim
 */

export interface ChartDatum {
  year: number;
  value: number | null;
}

export interface ChartSeries {
  id: string;
  data: ChartDatum[];
  color: string;
  style: 'solid' | 'dashed' | 'area';
  label: string;
}

export interface EraBand {
  start: number;
  end: number;
  label: string;
  color: string;
}

export interface EventMarker {
  year: number;
  label: string;
  type: 'commission' | 'retirement' | 'event';
}

export interface BandRange {
  low: number;
  high: number;
  color: string;
  label: string;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface DenominatorOption {
  id: string;
  label: string;
  divisor: number;
}

export interface ChartConfig {
  title: string;
  units: string;
  width?: number;
  height?: number;
  confidenceLevel?: ConfidenceLevel;
  sourceDescription?: string;
  sourceFormula?: string;
  eraBands?: EraBand[];
  eventMarkers?: EventMarker[];
  denominatorOptions?: DenominatorOption[];
  showProjectionNote?: boolean;
}
