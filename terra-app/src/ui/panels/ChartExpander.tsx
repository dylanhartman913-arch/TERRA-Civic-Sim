/**
 * ChartExpander — Renders the appropriate chart panel inline in the county card
 * based on openChartIndicator store state.
 * Supports: firm_margin (trajectory), labor_utilization (ratio band),
 * payback_year (payback), housing_pressure (trajectory),
 * service_funding_per_capita (paired index).
 */

import { useTerraStore } from '../../state/store.js';
import { computeIndicator, INDICATOR_CATALOG } from '../../engine/indicators.js';
import { useIndicatorTrajectory, useIndicatorHistory, usePaybackChartData } from '../../state/selectors.js';
import { TrajectoryPanel } from '../charts/TrajectoryPanel.js';
import { RatioBandPanel } from '../charts/RatioBandPanel.js';
import { PaybackPanel } from '../charts/PaybackPanel.js';
import { PairedIndexPanel } from '../charts/PairedIndexPanel.js';
import type { ChartConfig, BandRange, ConfidenceLevel } from '../charts/types.js';

interface Props {
  geoid: string;
}

export function ChartExpander({ geoid }: Props) {
  const openChartIndicator = useTerraStore(s => s.openChartIndicator);
  const setOpenChartIndicator = useTerraStore(s => s.setOpenChartIndicator);
  const engineState = useTerraStore(s => s.engineState);

  if (!openChartIndicator) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <span
          onClick={() => setOpenChartIndicator(null)}
          style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Close chart &times;
        </span>
      </div>
      <ChartContent indicatorId={openChartIndicator} geoid={geoid} engineState={engineState} />
    </div>
  );
}

function ChartContent({ indicatorId, geoid, engineState }: { indicatorId: string; geoid: string; engineState: unknown }) {
  const state = engineState as import('../../engine/types.js').EngineState;
  const currentYear = state.year;
  const catalog = INDICATOR_CATALOG[indicatorId];
  const confidenceLevel: ConfidenceLevel = catalog?.confidence_inputs?.length > 2 ? 'low' : catalog?.confidence_inputs?.length > 1 ? 'medium' : 'high';

  // Ratio band chart for labor_utilization
  if (indicatorId === 'labor_utilization') {
    return <LaborChart geoid={geoid} currentYear={currentYear} confidenceLevel={confidenceLevel} />;
  }

  // Payback chart
  if (indicatorId === 'payback_year') {
    return <PaybackChart geoid={geoid} currentYear={currentYear} confidenceLevel={confidenceLevel} />;
  }

  // Paired index for service funding
  if (indicatorId === 'service_funding_per_capita') {
    return <ServiceFundingChart geoid={geoid} currentYear={currentYear} confidenceLevel={confidenceLevel} />;
  }

  // Default: trajectory panel
  return <TrajectoryChart indicatorId={indicatorId} geoid={geoid} currentYear={currentYear} confidenceLevel={confidenceLevel} />;
}

function TrajectoryChart({ indicatorId, geoid, currentYear, confidenceLevel }: { indicatorId: string; geoid: string; currentYear: number; confidenceLevel: ConfidenceLevel }) {
  const { history, projection } = useIndicatorTrajectory(indicatorId, geoid, 20);
  const catalog = INDICATOR_CATALOG[indicatorId];

  const config: ChartConfig = {
    title: catalog?.label ?? indicatorId,
    units: catalog?.units ?? '',
    confidenceLevel,
    sourceFormula: catalog?.formula,
    sourceDescription: catalog?.note,
  };

  return (
    <TrajectoryPanel
      config={config}
      history={history}
      projection={projection}
      currentYear={currentYear}
    />
  );
}

function LaborChart({ geoid, currentYear, confidenceLevel }: { geoid: string; currentYear: number; confidenceLevel: ConfidenceLevel }) {
  const { history, projection } = useIndicatorTrajectory('labor_utilization', geoid, 20);
  const catalog = INDICATOR_CATALOG['labor_utilization'];

  const band: BandRange = { low: 0, high: 0.30, color: 'var(--teal)', label: 'Moderate' };
  const config: ChartConfig = {
    title: catalog?.label ?? 'Labor Utilization',
    units: catalog?.units ?? 'ratio',
    confidenceLevel,
    sourceFormula: catalog?.formula,
  };

  return (
    <RatioBandPanel
      config={config}
      history={history}
      projection={projection}
      band={band}
      currentYear={currentYear}
    />
  );
}

function PaybackChart({ geoid, currentYear, confidenceLevel }: { geoid: string; currentYear: number; confidenceLevel: ConfidenceLevel }) {
  const engineState = useTerraStore(s => s.engineState);
  const catalog = INDICATOR_CATALOG['payback_year'];
  const paybackYear = computeIndicator(engineState, 'payback_year', 'county', geoid) as number | null;
  const { cumulativeRevenue, totalCapex } = usePaybackChartData(geoid);

  const config: ChartConfig = {
    title: catalog?.label ?? 'Payback',
    units: 'USD (cumulative)',
    confidenceLevel,
    sourceFormula: catalog?.formula,
    sourceDescription: catalog?.note,
  };

  return (
    <PaybackPanel
      config={config}
      cumulativeRevenue={cumulativeRevenue}
      totalCapex={totalCapex}
      paybackYear={paybackYear}
      currentYear={currentYear}
    />
  );
}

function ServiceFundingChart({ geoid, currentYear, confidenceLevel }: { geoid: string; currentYear: number; confidenceLevel: ConfidenceLevel }) {
  const countyHistory = useIndicatorHistory('service_funding_per_capita', geoid, 'county');
  const studyHistory = useIndicatorHistory('S', undefined, 'study'); // Use S as proxy for study-area comparison

  const config: ChartConfig = {
    title: 'Service Funding vs Study Area',
    units: 'indexed to 100',
    confidenceLevel,
    sourceFormula: INDICATOR_CATALOG['service_funding_per_capita']?.formula,
  };

  return (
    <PairedIndexPanel
      config={config}
      seriesA={{ label: 'County', data: countyHistory, color: 'var(--teal)' }}
      seriesB={{ label: 'Study avg', data: studyHistory, color: 'var(--amber)' }}
      currentYear={currentYear}
    />
  );
}
