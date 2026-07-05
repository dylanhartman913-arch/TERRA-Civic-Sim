/**
 * AnalyzeView — /analyze Tradeoff Workspace
 *
 * Cross-county and cross-scenario tradeoff study. Reuses (does not fork):
 *   TrajectoryPanel, PairedIndexPanel, RatioBandPanel, PaybackPanel
 *   ScatterView (shared with DebriefView's Outcome Scatter tab)
 *   SmallMultiples (new, aligned mini-trajectories)
 *
 * Handoff check: "does Jade pay for Laramie County?" workspace —
 *   payback + labor band + service-funding pair + scenario overlay —
 *   assembles via the preset button in under 3 minutes.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useTerraStore } from '../../state/store.js';
import { importFromJson } from '../../engine/persistence.js';
import { computeIndicator, INDICATOR_CATALOG } from '../../engine/indicators.js';
import {
  extractHistoryFromState,
  extractProjectionFromState,
  snapClosestToYear,
} from '../../engine/analyze.js';
import {
  useIndicatorHistory,
  useIndicatorProjection,
  usePaybackChartData,
  useCountyEventMarkers,
} from '../../state/selectors.js';
import { TrajectoryPanel } from '../charts/TrajectoryPanel.js';
import { PairedIndexPanel } from '../charts/PairedIndexPanel.js';
import { RatioBandPanel } from '../charts/RatioBandPanel.js';
import { PaybackPanel } from '../charts/PaybackPanel.js';
import { ScatterView, type ScatterPoint } from '../charts/ScatterView.js';
import { SmallMultiples, type SmallSeries } from '../charts/SmallMultiples.js';
import type { EngineState, IndicatorSnapshot } from '../../engine/types.js';
import type { ChartConfig, ChartDatum } from '../charts/types.js';

// ── WY county name lookup ─────────────────────────────────────────────────────

const WY_COUNTIES: Record<string, string> = {
  '56001': 'Albany', '56003': 'Big Horn', '56005': 'Campbell',
  '56007': 'Carbon', '56009': 'Converse', '56011': 'Crook',
  '56013': 'Fremont', '56015': 'Goshen', '56017': 'Hot Springs',
  '56019': 'Johnson', '56021': 'Laramie', '56023': 'Lincoln',
  '56025': 'Natrona', '56027': 'Niobrara', '56029': 'Park',
  '56031': 'Platte', '56033': 'Sheridan', '56035': 'Sublette',
  '56037': 'Sweetwater', '56039': 'Teton', '56041': 'Uinta',
  '56043': 'Washakie', '56045': 'Weston',
};

function countyName(geoid: string, cards: Record<string, Record<string, unknown>>): string {
  const card = cards[geoid];
  if (card?.name && typeof card.name === 'string') return card.name;
  return WY_COUNTIES[geoid] ?? geoid;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelType = 'trajectory' | 'payback' | 'ratio' | 'paired' | 'small_multiples' | 'scatter';

interface CanvasPanel {
  id: string;
  type: PanelType;
  indicatorId: string;
  /** For 'paired': second indicator; for 'scatter': y-axis indicator */
  secondaryIndicatorId?: string;
  /** County override — falls back to first selectedGeoid */
  geoid?: string;
}

// extractHistoryFromState, extractProjectionFromState, snapClosestToYear
// imported from ../../engine/analyze.js

// ── Panel type inference ──────────────────────────────────────────────────────

const RATIO_INDICATORS = new Set([
  'labor_utilization', 'labor_headroom', 'firm_margin', 'housing_pressure',
  'pool_utilization_HALEU_kg_per_year', 'pool_utilization_fuel_fabrication_units_per_year',
]);

function inferPanelType(id: string): PanelType {
  if (id === 'payback_year') return 'payback';
  if (RATIO_INDICATORS.has(id)) return 'ratio';
  return 'trajectory';
}

function ratioLabBand(id: string) {
  if (id === 'labor_utilization') return { low: 0, high: 0.3, color: 'var(--teal)', label: 'Healthy (0–0.3)' };
  if (id === 'labor_headroom')    return { low: 0.7, high: 1, color: 'var(--teal)', label: 'Headroom >0.7' };
  if (id === 'housing_pressure')  return { low: 0.9, high: 1.1, color: 'var(--teal)', label: 'Balanced (0.9–1.1)' };
  return { low: 0.1, high: 0.3, color: 'var(--teal)', label: 'Normal range' };
}

// ── Scale for indicator ───────────────────────────────────────────────────────

function indicatorScale(id: string): 'county' | 'study' {
  const meta = INDICATOR_CATALOG[id];
  if (!meta) return 'county';
  return meta.scale.includes('study') && !meta.scale.includes('county') ? 'study' : 'county';
}

// ── Indicator config from catalog ─────────────────────────────────────────────

function indicatorChartConfig(id: string): ChartConfig {
  const meta = INDICATOR_CATALOG[id];
  return {
    title: meta?.label ?? id,
    units: meta?.units ?? '',
    sourceFormula: meta?.formula,
    showProjectionNote: true,
    confidenceLevel: meta?.confidence_inputs.length === 0 ? 'low' : 'medium',
  };
}

// ── Panel card sub-components ─────────────────────────────────────────────────

/** Trajectory panel that also accepts an optional comparison overlay. */
function TrajectoryCard({
  panel, geoid, currentYear, comparisonState,
}: {
  panel: CanvasPanel;
  geoid: string;
  currentYear: number;
  comparisonState: EngineState | null;
}) {
  const scale = indicatorScale(panel.indicatorId);
  const config = indicatorChartConfig(panel.indicatorId);

  // Primary data (from store hooks)
  const history = useIndicatorHistory(panel.indicatorId, scale === 'county' ? geoid : undefined, scale);
  const projection = useIndicatorProjection(panel.indicatorId, scale === 'county' ? geoid : undefined, 20, scale);
  const eventMarkers = useCountyEventMarkers(geoid);

  // Comparison data (from static comparison state)
  const compHistory = useMemo(() =>
    comparisonState
      ? extractHistoryFromState(comparisonState, panel.indicatorId, scale === 'county' ? geoid : undefined, scale)
      : [],
  [comparisonState, panel.indicatorId, geoid, scale]);

  const compProjection = useMemo(() =>
    comparisonState
      ? extractProjectionFromState(comparisonState, panel.indicatorId, scale === 'county' ? geoid : undefined, 20, scale)
      : [],
  [comparisonState, panel.indicatorId, geoid, scale]);

  // If comparison available, merge histories for the shell's rawData
  const hasComp = compHistory.length > 0 || compProjection.length > 0;

  if (hasComp) {
    // Render a composite SVG (both lines) via ChartShell + manual SVG
    return (
      <ComparedTrajectory
        config={config}
        primaryHistory={history}
        primaryProjection={projection}
        compHistory={compHistory}
        compProjection={compProjection}
        currentYear={currentYear}
      />
    );
  }

  return (
    <TrajectoryPanel
      config={config}
      history={history}
      projection={projection}
      eventMarkers={scale === 'county' ? eventMarkers : []}
      currentYear={currentYear}
    />
  );
}

/** Ratio panel with band + optional comparison overlay. */
function RatioCard({
  panel, geoid, currentYear, comparisonState,
}: {
  panel: CanvasPanel;
  geoid: string;
  currentYear: number;
  comparisonState: EngineState | null;
}) {
  const config = indicatorChartConfig(panel.indicatorId);
  const band = ratioLabBand(panel.indicatorId);

  const history = useIndicatorHistory(panel.indicatorId, geoid, 'county');
  const projection = useIndicatorProjection(panel.indicatorId, geoid, 20, 'county');

  const compHistory = useMemo(() =>
    comparisonState
      ? extractHistoryFromState(comparisonState, panel.indicatorId, geoid, 'county')
      : [],
  [comparisonState, panel.indicatorId, geoid]);

  const compProjection = useMemo(() =>
    comparisonState
      ? extractProjectionFromState(comparisonState, panel.indicatorId, geoid, 20, 'county')
      : [],
  [comparisonState, panel.indicatorId, geoid]);

  const hasComp = compHistory.length > 0 || compProjection.length > 0;

  if (hasComp) {
    return (
      <ComparedTrajectory
        config={config}
        primaryHistory={history}
        primaryProjection={projection}
        compHistory={compHistory}
        compProjection={compProjection}
        currentYear={currentYear}
        band={band}
      />
    );
  }

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

/** Payback panel. Comparison overlay skipped (different capex basis). */
function PaybackCard({ geoid, currentYear }: { geoid: string; currentYear: number }) {
  const { cumulativeRevenue, totalCapex } = usePaybackChartData(geoid);
  const paybackYear = useMemo(() => {
    let cumRev = 0;
    for (const d of cumulativeRevenue) {
      cumRev = d.value ?? 0;
      if (cumRev >= totalCapex && totalCapex > 0) return d.year;
    }
    return null;
  }, [cumulativeRevenue, totalCapex]);

  const config: ChartConfig = {
    title: 'Property-Tax Payback',
    units: 'USD cumulative',
    sourceFormula: 'cumulative (property_tax[t] − property_tax[baseline]) vs total_capex',
    confidenceLevel: 'medium',
    showProjectionNote: true,
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

/** Paired index panel for two indicators. */
function PairedCard({
  panel, geoid, currentYear, comparisonState,
}: {
  panel: CanvasPanel;
  geoid: string;
  currentYear: number;
  comparisonState: EngineState | null;
}) {
  const idA = panel.indicatorId;
  const idB = panel.secondaryIndicatorId ?? 'cumulative_net';
  const scaleA = indicatorScale(idA);
  const scaleB = indicatorScale(idB);
  const catA = INDICATOR_CATALOG[idA];
  const catB = INDICATOR_CATALOG[idB];

  const histA = useIndicatorHistory(idA, scaleA === 'county' ? geoid : undefined, scaleA);
  const projA = useIndicatorProjection(idA, scaleA === 'county' ? geoid : undefined, 20, scaleA);
  const histB = useIndicatorHistory(idB, scaleB === 'county' ? geoid : undefined, scaleB);
  const projB = useIndicatorProjection(idB, scaleB === 'county' ? geoid : undefined, 20, scaleB);

  const compHistA = useMemo(() =>
    comparisonState
      ? extractHistoryFromState(comparisonState, idA, scaleA === 'county' ? geoid : undefined, scaleA)
      : [],
  [comparisonState, idA, geoid, scaleA]);

  const config: ChartConfig = {
    title: `${catA?.label ?? idA} vs ${catB?.label ?? idB}`,
    units: 'indexed (100 = current year)',
    confidenceLevel: 'medium',
    showProjectionNote: true,
  };

  const seriesA = { label: catA?.label ?? idA, data: [...histA, ...projA], color: 'var(--teal)' };
  const seriesB = { label: catB?.label ?? idB, data: [...histB, ...projB], color: 'var(--amber, #f59e0b)' };

  // If comparison available, show a comparison note
  const compNote = compHistA.length > 0;

  return (
    <div>
      <PairedIndexPanel config={config} seriesA={seriesA} seriesB={seriesB} currentYear={currentYear} />
      {compNote && (
        <div style={{ fontSize: 8, color: 'var(--amber, #f59e0b)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          ⚡ Comparison overlay not shown for indexed view — use Trajectory panels.
        </div>
      )}
    </div>
  );
}

/** Cross-county small multiples. */
function SmallMultiplesCard({
  panel, geoids, currentYear, comparisonState, countyCards, sortBy,
}: {
  panel: CanvasPanel;
  geoids: string[];
  currentYear: number;
  comparisonState: EngineState | null;
  countyCards: Record<string, Record<string, unknown>>;
  sortBy: 'final' | 'delta' | 'name';
}) {
  const scale = indicatorScale(panel.indicatorId);

  const engineState = useTerraStore(s => s.engineState);

  const seriesList: SmallSeries[] = useMemo(() => {
    return geoids.map(geoid => {
      const history = extractHistoryFromState(engineState, panel.indicatorId, scale === 'county' ? geoid : undefined, scale);
      const projection = extractProjectionFromState(engineState, panel.indicatorId, scale === 'county' ? geoid : undefined, 20, scale);
      const compHistory = comparisonState
        ? extractHistoryFromState(comparisonState, panel.indicatorId, scale === 'county' ? geoid : undefined, scale)
        : undefined;
      const compProjection = comparisonState
        ? extractProjectionFromState(comparisonState, panel.indicatorId, scale === 'county' ? geoid : undefined, 20, scale)
        : undefined;

      return {
        geoid,
        name: countyName(geoid, countyCards),
        history,
        projection,
        compHistory,
        compProjection,
      };
    });
  }, [engineState, panel.indicatorId, geoids, comparisonState, scale, countyCards]);

  const config = indicatorChartConfig(panel.indicatorId);

  return (
    <SmallMultiples
      config={config}
      series={seriesList}
      currentYear={currentYear}
      sortBy={sortBy}
      columns={Math.min(4, geoids.length)}
    />
  );
}

/** Two-indicator scatter across selected counties. */
function ScatterCard({
  panel, geoids, scatterYear, comparisonState, countyCards,
}: {
  panel: CanvasPanel;
  geoids: string[];
  scatterYear: number;
  comparisonState: EngineState | null;
  countyCards: Record<string, Record<string, unknown>>;
}) {
  const engineState = useTerraStore(s => s.engineState);
  const idX = panel.indicatorId;
  const idY = panel.secondaryIndicatorId ?? 'S';
  const catX = INDICATOR_CATALOG[idX];
  const catY = INDICATOR_CATALOG[idY];

  const COUNTY_COLORS = [
    'var(--teal)', '#f59e0b', '#a78bfa', '#34d399',
    '#f87171', '#60a5fa', '#fb923c', '#e879f9',
  ];

  // Find the closest historical snapshot to scatterYear (uses engine/analyze helper)
  const snap = useMemo(() => snapClosestToYear(engineState, scatterYear), [engineState, scatterYear]);
  const compSnap = useMemo(
    () => comparisonState ? snapClosestToYear(comparisonState, scatterYear) : null,
    [comparisonState, scatterYear],
  );

  const points: ScatterPoint[] = useMemo(() => {
    const pts: ScatterPoint[] = [];
    const stateForYear = snap
      ? { ...engineState, county_ees: snap.counties ? engineState.county_ees : engineState.county_ees }
      : engineState;

    for (let i = 0; i < geoids.length; i++) {
      const geoid = geoids[i];
      const x = computeIndicator(stateForYear, idX, 'county', geoid);
      const y = computeIndicator(stateForYear, idY, 'county', geoid);
      if (x != null && y != null) {
        pts.push({
          x, y,
          label: countyName(geoid, countyCards),
          color: COUNTY_COLORS[i % COUNTY_COLORS.length],
          shape: 'circle',
        });
      }
    }

    // Comparison points
    if (comparisonState && compSnap) {
      for (let i = 0; i < geoids.length; i++) {
        const geoid = geoids[i];
        const x = computeIndicator(comparisonState, idX, 'county', geoid);
        const y = computeIndicator(comparisonState, idY, 'county', geoid);
        if (x != null && y != null) {
          pts.push({
            x, y,
            label: countyName(geoid, countyCards) + '°',
            color: COUNTY_COLORS[i % COUNTY_COLORS.length],
            shape: 'diamond',
          });
        }
      }
    }

    return pts;
  }, [engineState, comparisonState, geoids, idX, idY, snap, compSnap, countyCards]);

  return (
    <ScatterView
      points={points}
      xLabel={catX?.label ?? idX}
      yLabel={catY?.label ?? idY}
      width={400}
      height={280}
      emptyMessage="Select counties and advance year to plot"
    />
  );
}

// ── ComparedTrajectory — primary (teal solid) + comparison (amber dashed) ─────
// Not a fork of TrajectoryPanel — uses ChartShell + svg-utils directly.

import { ChartShell } from '../charts/ChartShell.js';
import { createChartGeometry, polylinePath, formatAxisValue } from '../charts/svg-utils.js';
import type { BandRange } from '../charts/types.js';

function ComparedTrajectory({
  config, primaryHistory, primaryProjection,
  compHistory, compProjection, currentYear, band,
}: {
  config: ChartConfig;
  primaryHistory: ChartDatum[];
  primaryProjection: ChartDatum[];
  compHistory: ChartDatum[];
  compProjection: ChartDatum[];
  currentYear: number;
  band?: BandRange;
}) {
  const W = config.width ?? 320;
  const H = config.height ?? 120;

  const { geo, primHistPath, primProjPath, compHistPath, compProjPath, yTicks } = useMemo(() => {
    const allData = [...primaryHistory, ...primaryProjection, ...compHistory, ...compProjection];
    const years = allData.map(d => d.year);
    const values = allData.filter(d => d.value != null).map(d => d.value as number);
    if (band) { values.push(band.low, band.high); }

    const geo = createChartGeometry(years, values, { width: W, height: H });

    const toPath = (data: ChartDatum[], prepend?: ChartDatum) => {
      const pts = (prepend ? [prepend, ...data] : data)
        .filter(d => d.value != null)
        .map(d => ({ x: geo.px(d.year), y: geo.py(d.value as number) }));
      return polylinePath(pts);
    };

    const lastPrimHist = primaryHistory.filter(d => d.value != null).at(-1);
    const lastCompHist = compHistory.filter(d => d.value != null).at(-1);

    const ticks = values.length > 0 ? [geo.yMin, (geo.yMin + geo.yMax) / 2, geo.yMax] : [0, 0.5, 1];

    return {
      geo,
      primHistPath: toPath(primaryHistory),
      primProjPath: toPath(primaryProjection, lastPrimHist),
      compHistPath: toPath(compHistory),
      compProjPath: toPath(compProjection, lastCompHist),
      yTicks: ticks,
    };
  }, [primaryHistory, primaryProjection, compHistory, compProjection, W, H, band]);

  const svg = (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      {/* Band */}
      {band && (
        <rect
          x={geo.pad.left}
          y={geo.py(band.high)}
          width={geo.chartW}
          height={geo.py(band.low) - geo.py(band.high)}
          fill={band.color}
          opacity={0.08}
        />
      )}

      {/* Y-axis */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={geo.pad.left - 4} y1={geo.py(t)} x2={geo.pad.left} y2={geo.py(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={geo.pad.left - 6} y={geo.py(t) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">
            {formatAxisValue(t, config.units)}
          </text>
        </g>
      ))}
      <line x1={geo.pad.left} y1={geo.pad.top} x2={geo.pad.left} y2={geo.pad.top + geo.chartH} stroke="var(--border)" strokeWidth={1} />
      <line x1={geo.pad.left} y1={geo.pad.top + geo.chartH} x2={geo.pad.left + geo.chartW} y2={geo.pad.top + geo.chartH} stroke="var(--border)" strokeWidth={1} />
      <text x={geo.px(geo.xMin)} y={H - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geo.xMin}</text>
      <text x={geo.px(geo.xMax)} y={H - 2} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{geo.xMax}</text>

      {/* Current year */}
      {currentYear >= geo.xMin && currentYear <= geo.xMax && (
        <line x1={geo.px(currentYear)} y1={geo.pad.top} x2={geo.px(currentYear)} y2={geo.pad.top + geo.chartH}
          stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
      )}

      {/* Comparison (amber, behind primary) */}
      {compHistPath && <path d={compHistPath} fill="none" stroke="var(--amber, #f59e0b)" strokeWidth={1.5} opacity={0.75} />}
      {compProjPath && <path d={compProjPath} fill="none" stroke="var(--amber, #f59e0b)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.55} />}

      {/* Primary (teal) */}
      {primHistPath && <path d={primHistPath} fill="none" stroke="var(--teal)" strokeWidth={2} />}
      {primProjPath && <path d={primProjPath} fill="none" stroke="var(--teal)" strokeWidth={2} strokeDasharray="6,3" opacity={0.7} />}

      {/* Legend */}
      <line x1={geo.pad.left + geo.chartW - 60} y1={geo.pad.top + 6} x2={geo.pad.left + geo.chartW - 52} y2={geo.pad.top + 6} stroke="var(--teal)" strokeWidth={2} />
      <text x={geo.pad.left + geo.chartW - 49} y={geo.pad.top + 9} fontSize={7} fill="var(--text-secondary)">Scenario A</text>
      <line x1={geo.pad.left + geo.chartW - 60} y1={geo.pad.top + 15} x2={geo.pad.left + geo.chartW - 52} y2={geo.pad.top + 15} stroke="var(--amber, #f59e0b)" strokeWidth={1.5} strokeDasharray="4,2" />
      <text x={geo.pad.left + geo.chartW - 49} y={geo.pad.top + 18} fontSize={7} fill="var(--text-secondary)">Scenario B</text>
    </svg>
  );

  return (
    <ChartShell
      config={{ ...config, showProjectionNote: true }}
      rawData={[
        { label: 'Primary history', data: primaryHistory },
        { label: 'Primary projection', data: primaryProjection },
        { label: 'Comparison history', data: compHistory },
        { label: 'Comparison projection', data: compProjection },
      ]}
    >
      {svg}
    </ChartShell>
  );
}

// ── Panel slot wrapper ────────────────────────────────────────────────────────

function PanelSlot({
  panel, geoid, geoids, currentYear, comparisonState, countyCards, scatterYear, sortBy, onRemove, onConvert,
}: {
  panel: CanvasPanel;
  geoid: string;
  geoids: string[];
  currentYear: number;
  comparisonState: EngineState | null;
  countyCards: Record<string, Record<string, unknown>>;
  scatterYear: number;
  sortBy: 'final' | 'delta' | 'name';
  onRemove: () => void;
  onConvert: (type: PanelType) => void;
}) {
  const meta = INDICATOR_CATALOG[panel.indicatorId];
  const isMulti = panel.type === 'small_multiples';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {meta?.label ?? panel.indicatorId}
          </span>
          {!isMulti && (
            <span style={{
              fontSize: 8, padding: '1px 4px', borderRadius: 2,
              background: 'var(--bg-base)', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {countyName(geoid, countyCards)}
            </span>
          )}
          {meta?.units && (
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{meta.units}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Type conversion shortcuts */}
          {panel.type !== 'small_multiples' && geoids.length > 1 && (
            <button onClick={() => onConvert('small_multiples')} style={iconBtnStyle} title="Switch to small multiples">
              ⣿
            </button>
          )}
          {panel.type === 'small_multiples' && (
            <button onClick={() => onConvert('trajectory')} style={iconBtnStyle} title="Switch to single county trajectory">
              ↗
            </button>
          )}
          <button onClick={onRemove} style={{ ...iconBtnStyle, color: 'var(--text-muted)' }} title="Remove panel">
            ✕
          </button>
        </div>
      </div>

      {/* Panel content */}
      <div style={{ padding: '10px 12px' }}>
        {panel.type === 'trajectory' && (
          <TrajectoryCard panel={panel} geoid={geoid} currentYear={currentYear} comparisonState={comparisonState} />
        )}
        {panel.type === 'ratio' && (
          <RatioCard panel={panel} geoid={geoid} currentYear={currentYear} comparisonState={comparisonState} />
        )}
        {panel.type === 'payback' && (
          <PaybackCard geoid={geoid} currentYear={currentYear} />
        )}
        {panel.type === 'paired' && (
          <PairedCard panel={panel} geoid={geoid} currentYear={currentYear} comparisonState={comparisonState} />
        )}
        {panel.type === 'small_multiples' && (
          <SmallMultiplesCard
            panel={panel}
            geoids={geoids}
            currentYear={currentYear}
            comparisonState={comparisonState}
            countyCards={countyCards}
            sortBy={sortBy}
          />
        )}
        {panel.type === 'scatter' && (
          <ScatterCard
            panel={panel}
            geoids={geoids}
            scatterYear={scatterYear}
            comparisonState={comparisonState}
            countyCards={countyCards}
          />
        )}
      </div>
    </div>
  );
}

// ── Main AnalyzeView ──────────────────────────────────────────────────────────

export function AnalyzeView({ onClose }: { onClose: () => void }) {
  const engineState = useTerraStore(s => s.engineState);
  const replaySessionFile = useTerraStore(s => s.replaySessionFile);

  const currentYear = engineState.year;
  const countyCards = engineState.county_cards as Record<string, Record<string, unknown>>;

  // Available WY counties in this game
  const availableGeoids = useMemo(
    () => Object.keys(engineState.county_fiscal).sort(),
    [engineState.county_fiscal],
  );

  // Workspace state
  const [panels, setPanels] = useState<CanvasPanel[]>([]);
  const [selectedGeoids, setSelectedGeoids] = useState<string[]>(
    availableGeoids.length > 0 ? [availableGeoids[0]] : [],
  );
  const [comparisonState, setComparisonState] = useState<EngineState | null>(null);
  const [comparisonLabel, setComparisonLabel] = useState('');
  const [compLoadError, setCompLoadError] = useState('');
  const [scatterYear, setScatterYear] = useState(currentYear);
  const [sortBy, setSortBy] = useState<'final' | 'delta' | 'name'>('final');

  // Sidebar
  const [search, setSearch] = useState('');
  const [scaleFilter, setScaleFilter] = useState<'all' | 'county' | 'study'>('all');
  const [citationOpen, setCitationOpen] = useState(false);

  // Drag-and-drop from sidebar
  const [dragIndicator, setDragIndicator] = useState<string | null>(null);

  const compFileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Active geoid for single-county panels = first selected
  const primaryGeoid = selectedGeoids[0] ?? (availableGeoids[0] ?? '');

  // ── Panel management ────────────────────────────────────────────────────────

  function addPanel(indicatorId: string, type?: PanelType, geoid?: string, secondaryIndicatorId?: string) {
    const id = `${indicatorId}_${Date.now()}`;
    const resolvedType = type ?? inferPanelType(indicatorId);
    setPanels(p => [...p, { id, type: resolvedType, indicatorId, geoid, secondaryIndicatorId }]);
  }

  function removePanel(id: string) {
    setPanels(p => p.filter(panel => panel.id !== id));
  }

  function convertPanel(id: string, type: PanelType) {
    setPanels(p => p.map(panel => panel.id === id ? { ...panel, type } : panel));
  }

  // ── Preset workspaces ───────────────────────────────────────────────────────

  function loadJadeLaramieWorkspace() {
    const laramie = '56021';
    setSelectedGeoids([laramie]);
    setScatterYear(currentYear);
    setPanels([
      { id: 'payback_jade', type: 'payback', indicatorId: 'payback_year', geoid: laramie },
      { id: 'labor_jade', type: 'ratio', indicatorId: 'labor_utilization', geoid: laramie },
      {
        id: 'service_fiscal_jade', type: 'paired', indicatorId: 'service_funding_per_capita',
        secondaryIndicatorId: 'fiscal_balance', geoid: laramie,
      },
      { id: 'econ_jade', type: 'trajectory', indicatorId: 'Ec', geoid: laramie },
    ]);
  }

  // ── County selection ────────────────────────────────────────────────────────

  function toggleCounty(geoid: string) {
    setSelectedGeoids(prev => {
      if (prev.includes(geoid)) {
        return prev.length > 1 ? prev.filter(g => g !== geoid) : prev;
      }
      return [...prev, geoid];
    });
  }

  // ── Comparison file loading ─────────────────────────────────────────────────

  const handleCompFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = importFromJson(text);
      if (!parsed) {
        setCompLoadError(`${file.name}: not a valid TERRA save file (schema_version mismatch).`);
        return;
      }
      try {
        const state = replaySessionFile(parsed);
        setComparisonState(state);
        setComparisonLabel(
          (parsed as { session_meta?: { participant_label?: string } }).session_meta?.participant_label
          ?? file.name.replace(/\.json$/, '')
        );
        setCompLoadError('');
      } catch (err) {
        setCompLoadError(`${file.name}: replay failed — ${String(err)}`);
      }
    };
    reader.onerror = () => setCompLoadError(`${file.name}: file read error`);
    reader.readAsText(file);
  }, [replaySessionFile]);

  // ── Drag-and-drop onto canvas ───────────────────────────────────────────────

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragIndicator) {
      addPanel(dragIndicator);
      setDragIndicator(null);
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  function exportBundle() {
    window.print();
  }

  // ── Indicator browser items ─────────────────────────────────────────────────

  const filteredIndicators = useMemo(() => {
    return Object.entries(INDICATOR_CATALOG).filter(([id, meta]) => {
      const matchScale = scaleFilter === 'all' || meta.scale.includes(scaleFilter);
      const matchSearch = !search || meta.label.toLowerCase().includes(search.toLowerCase()) || id.includes(search);
      return matchScale && matchSearch;
    });
  }, [search, scaleFilter]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
      zIndex: 300,
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <button onClick={onClose} style={navBtnStyle}>← Back</button>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)', letterSpacing: 1 }}>
          TERRA Analyze
        </span>

        {/* Preset workspace */}
        <button
          onClick={loadJadeLaramieWorkspace}
          style={{ ...navBtnStyle, borderColor: 'var(--teal)', color: 'var(--teal)' }}
          title="Payback + Labor + Service Funding + Economic Capital for Laramie County"
        >
          ◈ Jade → Laramie
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Scatter year */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Scatter year</span>
          <input
            type="number"
            value={scatterYear}
            min={2025}
            max={2075}
            step={5}
            onChange={e => setScatterYear(Number(e.target.value))}
            style={{ ...numInputStyle, width: 54 }}
          />
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sort by</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={selStyle}>
            <option value="final">Final value</option>
            <option value="delta">Delta</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Comparison file */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {comparisonState ? (
            <>
              <span style={{ fontSize: 9, color: 'var(--amber, #f59e0b)', fontFamily: 'var(--font-mono)' }}>
                ◆ B: {comparisonLabel}
              </span>
              <button onClick={() => { setComparisonState(null); setComparisonLabel(''); }} style={iconBtnStyle}>✕</button>
            </>
          ) : (
            <button
              onClick={() => compFileRef.current?.click()}
              style={navBtnStyle}
              title="Load a second .terra.json to overlay as Scenario B (dashed)"
            >
              + Scenario B
            </button>
          )}
          <input
            ref={compFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleCompFile(e.target.files[0]); e.target.value = ''; }}
          />
        </div>

        {/* Export */}
        <button onClick={exportBundle} style={navBtnStyle} title="Print / Save as PDF">
          Export ↗
        </button>
        <button onClick={() => setCitationOpen(v => !v)} style={navBtnStyle} title="Citation appendix">
          Citation
        </button>
      </div>

      {compLoadError && (
        <div style={{ fontSize: 10, color: 'var(--deficit)', padding: '4px 16px', background: 'rgba(248,113,113,0.08)', borderBottom: '1px solid var(--border)' }}>
          {compLoadError}
        </div>
      )}

      {/* ── Main body ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left sidebar: Indicator browser ────────────────────────────── */}
        <div style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}>
          {/* County selector */}
          <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Counties
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {availableGeoids.map(geoid => (
                <button
                  key={geoid}
                  onClick={() => toggleCounty(geoid)}
                  style={{
                    textAlign: 'left',
                    padding: '3px 6px',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: selectedGeoids.includes(geoid) ? 'var(--teal)' : 'transparent',
                    background: selectedGeoids.includes(geoid) ? 'var(--teal-dim)' : 'transparent',
                    color: selectedGeoids.includes(geoid) ? 'var(--teal)' : 'var(--text-muted)',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {countyName(geoid, countyCards)}
                </button>
              ))}
            </div>
          </div>

          {/* Indicator search + filter */}
          <div style={{ padding: '8px 10px 4px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search indicators…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                padding: '4px 7px',
                outline: 'none',
                marginBottom: 5,
              }}
            />
            <div style={{ display: 'flex', gap: 3 }}>
              {(['all', 'county', 'study'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setScaleFilter(f)}
                  style={{
                    fontSize: 8,
                    padding: '2px 6px',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    background: scaleFilter === f ? 'var(--bg-base)' : 'transparent',
                    color: scaleFilter === f ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Indicator list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 4px 6px' }}>
              Drag or click to add →
            </div>
            {filteredIndicators.map(([id, meta]) => (
              <div
                key={id}
                draggable
                onDragStart={() => setDragIndicator(id)}
                onDragEnd={() => setDragIndicator(null)}
                style={{
                  padding: '5px 7px',
                  borderRadius: 3,
                  marginBottom: 2,
                  cursor: 'grab',
                  background: dragIndicator === id ? 'var(--teal-dim)' : 'transparent',
                  border: '1px solid',
                  borderColor: dragIndicator === id ? 'var(--teal)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onClick={() => addPanel(id)}
              >
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 1 }}>
                  {meta.label}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                  {meta.scale.join(' · ')} · {meta.units.slice(0, 24)}
                </div>
              </div>
            ))}

            {/* Scatter shortcut */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Frontier / Scatter
              </div>
              <select
                id="scatter-x-sel"
                style={{ ...selStyle, width: '100%', marginBottom: 4 }}
                defaultValue="Ec"
              >
                {filteredIndicators.map(([id, meta]) => (
                  <option key={id} value={id}>{meta.label}</option>
                ))}
              </select>
              <select
                id="scatter-y-sel"
                style={{ ...selStyle, width: '100%', marginBottom: 6 }}
                defaultValue="S"
              >
                {filteredIndicators.map(([id, meta]) => (
                  <option key={id} value={id}>{meta.label}</option>
                ))}
              </select>
              <button
                style={{ ...navBtnStyle, width: '100%', textAlign: 'center' }}
                onClick={() => {
                  const xSel = (document.getElementById('scatter-x-sel') as HTMLSelectElement).value;
                  const ySel = (document.getElementById('scatter-y-sel') as HTMLSelectElement).value;
                  addPanel(xSel, 'scatter', undefined, ySel);
                }}
              >
                + Add Scatter
              </button>
            </div>

            {/* Paired indicator shortcut */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Paired Index
              </div>
              <select id="pair-a-sel" style={{ ...selStyle, width: '100%', marginBottom: 4 }} defaultValue="service_funding_per_capita">
                {filteredIndicators.map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
              <select id="pair-b-sel" style={{ ...selStyle, width: '100%', marginBottom: 6 }} defaultValue="fiscal_balance">
                {filteredIndicators.map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
              <button
                style={{ ...navBtnStyle, width: '100%', textAlign: 'center' }}
                onClick={() => {
                  const a = (document.getElementById('pair-a-sel') as HTMLSelectElement).value;
                  const b = (document.getElementById('pair-b-sel') as HTMLSelectElement).value;
                  addPanel(a, 'paired', undefined, b);
                }}
              >
                + Add Paired
              </button>
            </div>
          </div>
        </div>

        {/* ── Canvas ─────────────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          style={{ flex: 1, overflowY: 'auto', padding: 16 }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleCanvasDrop}
        >
          {panels.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '80%',
              gap: 16,
              color: 'var(--text-muted)',
              fontSize: 12,
            }}>
              <div style={{ fontSize: 28, opacity: 0.2 }}>⣿</div>
              <div>Drag indicators from the sidebar, or click one to add a panel.</div>
              <div style={{ fontSize: 11 }}>
                Use the <strong style={{ color: 'var(--teal)' }}>◈ Jade → Laramie</strong> preset to build the payback workspace instantly.
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 14,
              alignItems: 'start',
            }}>
              {panels.map(panel => (
                <PanelSlot
                  key={panel.id}
                  panel={panel}
                  geoid={panel.geoid ?? primaryGeoid}
                  geoids={selectedGeoids}
                  currentYear={currentYear}
                  comparisonState={comparisonState}
                  countyCards={countyCards}
                  scatterYear={scatterYear}
                  sortBy={sortBy}
                  onRemove={() => removePanel(panel.id)}
                  onConvert={(type) => convertPanel(panel.id, type)}
                />
              ))}

              {/* Drop zone hint when there are already panels */}
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 6,
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  opacity: dragIndicator ? 0.9 : 0.4,
                  background: dragIndicator ? 'var(--teal-dim)' : 'transparent',
                  transition: 'all 0.15s',
                  cursor: 'default',
                }}
              >
                Drop indicator here
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Citation appendix modal ────────────────────────────────────────── */}
      {citationOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 400,
        }}
          onClick={() => setCitationOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              width: 600,
              maxHeight: '80vh',
              overflow: 'auto',
              fontFamily: 'var(--font-mono)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)' }}>
                Citation Appendix — Indicator Sources
              </span>
              <button onClick={() => setCitationOpen(false)} style={iconBtnStyle}>✕</button>
            </div>
            {Object.entries(INDICATOR_CATALOG).map(([id, meta]) => (
              <div key={id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 500 }}>{meta.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span style={{ color: 'var(--teal)' }}>ID:</span> {id} ·{' '}
                  <span style={{ color: 'var(--teal)' }}>Scale:</span> {meta.scale.join(', ')} ·{' '}
                  <span style={{ color: 'var(--teal)' }}>Units:</span> {meta.units}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                  <em>Formula:</em> {meta.formula}
                </div>
                {meta.note && (
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    Note: {meta.note}
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 9, color: 'var(--text-muted)' }}>
              TERRA Civic Sim v4 · Wyoming Energy Research · {new Date().getFullYear()} ·
              Analysis generated {new Date().toISOString().slice(0, 10)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 3,
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
};

const iconBtnStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 5px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
};

const selStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '3px 6px',
  outline: 'none',
};

const numInputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '3px 5px',
  outline: 'none',
};
