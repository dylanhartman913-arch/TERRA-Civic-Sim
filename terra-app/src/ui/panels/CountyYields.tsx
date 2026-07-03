/**
 * CountyYields — compact per-county yields strip + expandable breakdowns
 *
 * Documented assumptions (Session W4):
 *
 * JOBS_PER_MW table: point-estimate employment factors by action, sourced from
 *   NREL JEDI model (2023), DOE US Energy Employment Report (2024), and NEI
 *   nuclear employment factors (2022). Construction jobs = direct + indirect
 *   within-county during build period. Operations jobs = direct FTE permanent.
 *   All values low confidence; flagged as engineering estimates in methods.
 *
 * HOUSING_PRESSURE_THRESHOLD = 0.10 (10% of county labor force):
 *   Boomtown literature documents visible housing/service strain at 5–8%
 *   labor market saturation in small Wyoming counties (Sweetwater, Campbell
 *   gas build-outs, 2001–2008). 10% is the notification threshold; critical
 *   stress typically observed at 15%+. Source: WY Dept of Workforce Services
 *   LAUS county-level data 2001–2008; Black et al. (2005) "The Local Economic
 *   Impact of Natural Gas Development."
 *
 * WATER baselines (water_withdrawals_mgd) are null for all counties in the
 *   current dataset. Water yield renders "—" until USGS 2015 county water-use
 *   data is loaded. See MethodsPage for full limitation note.
 */

import { useState, useRef, useEffect } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { EngineState, BuildQueueItem, CountyFiscal, ProductionAsset } from '../../engine/types.js';
import { getExistingAssets } from '../../engine/engine.js';

// ── Jobs per unit (construction + operations) ──────────────────────────────
// Sources documented in module header above.
export const JOBS_PER_MW: Record<string, { c: number; o: number }> = {
  wind_utility:             { c: 3.5,  o: 0.30 },
  solar_utility:            { c: 2.5,  o: 0.18 },
  coal_repowering:          { c: 3.0,  o: 0.45 },
  coal_to_solar:            { c: 2.5,  o: 0.18 },
  geothermal_utility:       { c: 5.0,  o: 0.90 },
  hydropower_small:         { c: 4.0,  o: 0.40 },
  smr_advanced:             { c: 7.5,  o: 1.50 },
  coal_to_smr:              { c: 7.5,  o: 1.50 },
  fusion_pilot:             { c: 10.0, o: 2.00 },
  offshore_wind_great_lakes:{ c: 4.0,  o: 0.35 },
  microgrid:                { c: 4.0,  o: 0.50 },
  community_solar:          { c: 2.5,  o: 0.18 },
  battery_grid:             { c: 0.08, o: 0.007 },  // per MWh
  pumped_hydro:             { c: 0.06, o: 0.004 },  // per MWh
  hydrogen_electrolysis:    { c: 2.0,  o: 0.30 },
  data_center_hyperscale:   { c: 1.5,  o: 0.20 },
  data_center_campus_phase: { c: 1.5,  o: 0.20 },
  industrial_load_flexible: { c: 2.0,  o: 0.30 },
  transmission_230kv:       { c: 1.2,  o: 0.03 },  // per circuit-mile, indicative
  transmission_500kv:       { c: 2.0,  o: 0.05 },
};

// Housing-pressure notification threshold — see module header for rationale.
export const HOUSING_PRESSURE_THRESHOLD = 0.10;

// ── Helpers ────────────────────────────────────────────────────────────────

function jobsForBuild(item: BuildQueueItem): { c: number; o: number } {
  const rates = JOBS_PER_MW[item.action_id];
  if (!rates) return { c: 0, o: 0 };
  return { c: rates.c * item.magnitude, o: rates.o * item.magnitude };
}

/**
 * Compute baseline revenue from CountyFiscal by reversing cumulative deltas.
 * fiscal_actions records every change to the mutable fields, so we can
 * back-calculate baseline = current - sum(all deltas).
 */
function baselineRevenue(cf: CountyFiscal): number {
  const ptDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  const baseline_property_tax   = cf.property_tax   - ptDeltaSum;
  const baseline_sales_use      = cf.sales_use       - suDeltaSum;
  const baseline_advalorem      = cf.advalorem_production - cf.ledger_a_cumulative_delta;
  const baseline_severance      = cf.severance_share      - cf.ledger_b_cumulative_delta;
  const baseline_school_finance = cf.school_finance_net   - cf.ledger_c_cumulative_delta;
  return (
    baseline_property_tax + baseline_advalorem + baseline_severance +
    cf.federal_royalty_share + baseline_sales_use + cf.pilt + baseline_school_finance
  );
}

/** Net revenue delta (live – baseline) */
function revenueNetDelta(cf: CountyFiscal): number {
  const ptDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDeltaSum = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  return (
    ptDeltaSum + suDeltaSum +
    cf.ledger_a_cumulative_delta + cf.ledger_b_cumulative_delta + cf.ledger_c_cumulative_delta
  );
}

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtPct(v: number): string {
  const sign = v < 0 ? '' : v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface YieldPopoverProps {
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

function YieldPopover({ children, anchorRef, onClose }: YieldPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '12px 14px',
        minWidth: 280,
        maxWidth: 340,
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'all',
      }}
    >
      {children}
    </div>
  );
}

interface DivergingBarProps {
  /** Signed value — positive goes right (teal), negative goes left (red/amber) */
  value: number;
  /** Absolute maximum for scale normalization */
  maxAbs: number;
  label: string;
  formattedValue: string;
  color?: string;
}

function DivergingBar({ value, maxAbs, label, formattedValue, color }: DivergingBarProps) {
  const clampedPct = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const barWidthPct = clampedPct * 45; // max 45% of container from zero line
  const isPositive = value >= 0;
  const barColor = color ?? (isPositive ? 'var(--teal)' : 'var(--deficit)');

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0', gap: 0 }}>
      {/* Negative side (left of zero) */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: 2 }}>
        {!isPositive && (
          <div style={{
            width: `${barWidthPct}%`,
            height: 10,
            background: barColor,
            borderRadius: '2px 0 0 2px',
            minWidth: clampedPct > 0 ? 2 : 0,
          }} />
        )}
      </div>
      {/* Zero line */}
      <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
      {/* Positive side (right of zero) */}
      <div style={{ flex: 1, paddingLeft: 2 }}>
        {isPositive && (
          <div style={{
            width: `${barWidthPct}%`,
            height: 10,
            background: barColor,
            borderRadius: '0 2px 2px 0',
            minWidth: clampedPct > 0 ? 2 : 0,
          }} />
        )}
      </div>
      {/* Label + value */}
      <div style={{ width: 120, display: 'flex', justifyContent: 'space-between', paddingLeft: 8, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: value === 0 ? 'var(--text-muted)' : barColor, fontWeight: 500, marginLeft: 6, whiteSpace: 'nowrap' }}>{formattedValue}</span>
      </div>
    </div>
  );
}

// ── Revenue Breakdown (diverging) ──────────────────────────────────────────

interface RevenueBreakdownProps {
  cf: CountyFiscal;
}

function RevenueBreakdown({ cf }: RevenueBreakdownProps) {
  const ptDelta   = cf.fiscal_actions.reduce((s, fa) => s + fa.property_tax_delta, 0);
  const suDelta   = cf.fiscal_actions.reduce((s, fa) => s + fa.sales_use_delta, 0);
  const aBaseline = cf.advalorem_production - cf.ledger_a_cumulative_delta;
  const bBaseline = cf.severance_share - cf.ledger_b_cumulative_delta;
  const cBaseline = cf.school_finance_net - cf.ledger_c_cumulative_delta;

  // Positive (above-zero) sources: property tax delta, sales/use delta, PILT, federal royalty
  // These are all genuinely positive deltas or unchanged baselines
  const posSources = [
    { label: 'Property tax Δ', value: ptDelta },
    { label: 'Sales/use Δ', value: suDelta },
    { label: 'PILT (baseline)', value: cf.pilt },
    { label: 'Federal royalty', value: cf.federal_royalty_share },
  ].filter(s => s.value !== 0);

  // Signed ledger sources (A, B, C can be positive or negative)
  const ledgerSources = [
    {
      label: 'Ledger A: Ad valorem Δ',
      value: cf.ledger_a_cumulative_delta,
      baseline: aBaseline,
    },
    {
      label: 'Ledger B: Severance Δ',
      value: cf.ledger_b_cumulative_delta,
      baseline: bBaseline,
    },
    {
      label: 'Ledger C: School finance Δ',
      value: cf.ledger_c_cumulative_delta,
      baseline: cBaseline,
    },
  ].filter(s => s.value !== 0 || s.baseline !== 0);

  const allValues = [
    ...posSources.map(s => s.value),
    ...ledgerSources.map(s => s.value),
  ];
  const maxAbs = Math.max(...allValues.map(Math.abs), 1);

  const netDelta = revenueNetDelta(cf);

  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Revenue Breakdown — signed, zero-centered
      </div>

      {posSources.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>POSITIVE SOURCES</div>
          {posSources.map(s => (
            <DivergingBar key={s.label} value={s.value} maxAbs={maxAbs} label={s.label} formattedValue={fmt$(s.value)} />
          ))}
        </div>
      )}

      {ledgerSources.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>SIGNED LEDGERS (A/B/C)</div>
          {ledgerSources.map(s => (
            <div key={s.label}>
              <DivergingBar
                value={s.value}
                maxAbs={maxAbs}
                label={s.label}
                formattedValue={fmt$(s.value)}
              />
              {s.baseline !== 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 9, paddingLeft: 4, paddingBottom: 2 }}>
                  baseline {fmt$(s.baseline)}
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>
            Ledger C (school finance) can move opposite to A+B — recapture shrinks
            as mineral value falls, releasing state equalization burden.
          </div>
        </div>
      )}

      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>Net Δ revenue</span>
        <span style={{ color: netDelta >= 0 ? 'var(--teal)' : 'var(--deficit)', fontWeight: 500 }}>
          {fmt$(netDelta)}
        </span>
      </div>
    </div>
  );
}

// ── Jobs Breakdown ─────────────────────────────────────────────────────────

interface JobsBreakdownProps {
  queuedBuilds: BuildQueueItem[];
  engineState: EngineState;
  geoid: string;
}

function JobsBreakdown({ queuedBuilds, engineState, geoid }: JobsBreakdownProps) {
  const constructionBuilds = queuedBuilds.filter(b => !b.commissioned);
  const operationBuilds    = queuedBuilds.filter(b =>  b.commissioned);

  // Baseline employment from production_asset entries (separate from player delta)
  const productionAssets = getExistingAssets(engineState, geoid).filter(
    a => a.asset_kind === 'production_asset' && (a as ProductionAsset).employment_direct != null,
  ) as ProductionAsset[];

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '2px 0',
    borderTop: '1px solid var(--border)', fontSize: 11,
  };

  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Jobs by Project
      </div>

      {/* Existing baseline employment — separate from player delta */}
      {productionAssets.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>EXISTING BASELINE (pre-game)</div>
          {productionAssets.map((pa, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {pa.name}
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 9 }}>(direct)</span>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                ~{(pa.employment_direct ?? 0).toLocaleString()} est.
              </span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, fontStyle: 'italic' }}>
            Baseline jobs are not player actions — they are not included in the delta above.
            Source: BLS QCEW 2022.
          </div>
        </div>
      )}

      {operationBuilds.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>OPERATIONS (commissioned)</div>
          {operationBuilds.map((b, i) => {
            const action = engineState.action_library.actions[b.action_id];
            const { o } = jobsForBuild(b);
            return (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>{action?.action_name ?? b.action_id}</span>
                <span style={{ color: 'var(--teal)' }}>{Math.round(o)} FTE</span>
              </div>
            );
          })}
        </div>
      )}

      {constructionBuilds.length > 0 && (
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>CONSTRUCTION (active builds)</div>
          {constructionBuilds.map((b, i) => {
            const action = engineState.action_library.actions[b.action_id];
            const { c } = jobsForBuild(b);
            return (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>{action?.action_name ?? b.action_id}</span>
                <span style={{ color: 'var(--construction)' }}>{Math.round(c)} jobs</span>
              </div>
            );
          })}
        </div>
      )}

      {queuedBuilds.length === 0 && productionAssets.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>No active builds</div>
      )}
    </div>
  );
}

// ── Capacity Margin Breakdown ──────────────────────────────────────────────

interface CapacityBreakdownProps {
  ees: EngineState['county_ees'][string];
  queuedBuilds: BuildQueueItem[];
  engineState: EngineState;
}

function CapacityBreakdown({ ees, queuedBuilds, engineState }: CapacityBreakdownProps) {
  const margin = ees.added_firm_mw - ees.load_mw;
  const committedBuilds = queuedBuilds.filter(b => !b.commissioned);
  const operatingBuilds = queuedBuilds.filter(b =>  b.commissioned);

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between',
    padding: '2px 0', borderTop: '1px solid var(--border)', fontSize: 11,
  };

  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Firm Capacity Margin
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>Load</span>
        <span>{ees.load_mw.toFixed(1)} MW</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>Added firm capacity</span>
        <span style={{ color: 'var(--teal)' }}>{ees.added_firm_mw.toFixed(1)} MW</span>
      </div>
      <div style={{
        ...rowStyle,
        fontWeight: 500,
        color: margin >= 0 ? 'var(--surplus)' : 'var(--deficit)',
      }}>
        <span>Net margin</span>
        <span>{margin >= 0 ? '+' : ''}{margin.toFixed(1)} MW</span>
      </div>

      {operatingBuilds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>BY PROJECT (operating)</div>
          {operatingBuilds.map((b, i) => {
            const action = engineState.action_library.actions[b.action_id];
            const name = action?.action_name ?? b.action_id;
            // Firm capacity contribution: magnitude for generation actions
            const bucket = action?.bucket ?? '';
            const firmMw = bucket === 'energy_generation' ? b.magnitude : 0;
            if (firmMw === 0) return null;
            return (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                <span style={{ color: 'var(--teal)' }}>{firmMw.toFixed(1)} MW</span>
              </div>
            );
          })}
        </div>
      )}

      {committedBuilds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 4 }}>UNDER CONSTRUCTION</div>
          {committedBuilds.map((b, i) => {
            const action = engineState.action_library.actions[b.action_id];
            const bucket = action?.bucket ?? '';
            const firmMw = bucket === 'energy_generation' ? b.magnitude : 0;
            if (firmMw === 0) return null;
            return (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {action?.action_name ?? b.action_id}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                    →{b.operational_year}
                  </span>
                </span>
                <span style={{ color: 'var(--construction)' }}>{firmMw.toFixed(1)} MW</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main CountyYields component ────────────────────────────────────────────

export function CountyYields() {
  const selectedGeoid  = useTerraStore(s => s.selectedGeoid);
  const enterPlacementMode = useTerraStore(s => s.enterPlacementMode);
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const engineState    = useTerraStore(s => s.engineState) as EngineState;

  const [openYield, setOpenYield] = useState<string | null>(null);
  const refs = {
    capacity: useRef<HTMLDivElement>(null),
    jobs:     useRef<HTMLDivElement>(null),
    revenue:  useRef<HTMLDivElement>(null),
    water:    useRef<HTMLDivElement>(null),
    housing:  useRef<HTMLDivElement>(null),
  };

  if (!selectedGeoid) return null;

  const ees  = engineState.county_ees[selectedGeoid];
  const card = engineState.county_cards[selectedGeoid] as {
    county_name?: string; state?: string; employment?: number;
    water_withdrawals_mgd?: number | null;
  } | undefined;
  if (!ees || !card) return null;

  const isWY = card.state === 'WY';
  const geoidPadded = selectedGeoid.padStart(5, '0');
  const cf: CountyFiscal | undefined = isWY ? engineState.county_fiscal[geoidPadded] : undefined;

  const queuedBuilds = engineState.build_queue.filter(b => b.geoid === selectedGeoid);
  const laborForce = card.employment ?? 0;

  // ── Capacity ───────────────────────────────────────────────────────────
  const capacityMarginMw = ees.added_firm_mw - ees.load_mw;

  // ── Jobs ──────────────────────────────────────────────────────────────
  let opsJobs = 0;
  let constructionJobs = 0;
  for (const b of queuedBuilds) {
    const { c, o } = jobsForBuild(b);
    if (b.commissioned) opsJobs          += o;
    else                constructionJobs += c;
  }
  const totalJobs = opsJobs + constructionJobs;
  const jobsPctLaborForce = laborForce > 0 ? totalJobs / laborForce : 0;
  const housingPressure   = laborForce > 0 ? constructionJobs / laborForce : 0;
  const boomtownFlag      = housingPressure >= HOUSING_PRESSURE_THRESHOLD;

  // ── Revenue (WY only) ─────────────────────────────────────────────────
  const revNetDelta  = cf ? revenueNetDelta(cf)  : null;
  const revBaseline  = cf ? baselineRevenue(cf)  : null;
  const revPct       = (revNetDelta != null && revBaseline && revBaseline !== 0)
    ? revNetDelta / Math.abs(revBaseline) : null;

  // ── Water (requires baseline data — currently null for all counties) ──
  const waterBaseline = card.water_withdrawals_mgd; // always null right now

  // ── Yield strip item ──────────────────────────────────────────────────
  const itemStyle = (key: string): React.CSSProperties => ({
    flex: 1,
    padding: '6px 8px',
    borderRadius: 4,
    background: openYield === key ? 'var(--bg-elevated)' : 'transparent',
    border: `1px solid ${openYield === key ? 'var(--border)' : 'transparent'}`,
    cursor: 'pointer',
    position: 'relative',
    minWidth: 0,
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text-muted)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 2,
  };

  const valueStyle = (color?: string): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 500,
    color: color ?? 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  });

  const subStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text-muted)',
    marginTop: 1,
    display: 'block',
    whiteSpace: 'nowrap',
  };

  function toggleYield(key: string) {
    setOpenYield(prev => prev === key ? null : key);
  }

  const sectionStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
        Yields
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>

        {/* ⚡ Capacity */}
        <div
          ref={refs.capacity}
          style={itemStyle('capacity')}
          onClick={() => toggleYield('capacity')}
          title="Net firm capacity margin — click to expand"
        >
          <span style={labelStyle}>⚡ Capacity</span>
          <span style={valueStyle(capacityMarginMw >= 0 ? 'var(--surplus)' : 'var(--deficit)')}>
            {capacityMarginMw >= 0 ? '+' : ''}{capacityMarginMw.toFixed(0)} MW
          </span>
          {openYield === 'capacity' && (
            <YieldPopover anchorRef={refs.capacity} onClose={() => setOpenYield(null)}>
              <CapacityBreakdown ees={ees} queuedBuilds={queuedBuilds} engineState={engineState} />
            </YieldPopover>
          )}
        </div>

        {/* 🔨 Jobs */}
        <div
          ref={refs.jobs}
          style={itemStyle('jobs')}
          onClick={() => toggleYield('jobs')}
          title="Operations + construction jobs — click to expand"
        >
          <span style={labelStyle}>🔨 Jobs</span>
          <span style={valueStyle('var(--teal)')}>
            {Math.round(totalJobs)}
          </span>
          {laborForce > 0 && (
            <span style={subStyle}>{fmtPct(jobsPctLaborForce)} LF</span>
          )}
          {openYield === 'jobs' && (
            <YieldPopover anchorRef={refs.jobs} onClose={() => setOpenYield(null)}>
              <JobsBreakdown queuedBuilds={queuedBuilds} engineState={engineState} geoid={selectedGeoid} />
              {laborForce > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Labor force baseline: {laborForce.toLocaleString()} · {fmtPct(jobsPctLaborForce)} total employment impact
                </div>
              )}
            </YieldPopover>
          )}
        </div>

        {/* 💰 Revenue (WY only) */}
        {isWY && cf && (
          <div
            ref={refs.revenue}
            style={itemStyle('revenue')}
            onClick={() => toggleYield('revenue')}
            title="Local revenue change — click to see signed breakdown"
          >
            <span style={labelStyle}>💰 Revenue</span>
            <span style={valueStyle(
              revNetDelta == null ? 'var(--text-muted)' :
              revNetDelta >= 0 ? 'var(--teal)' : 'var(--deficit)'
            )}>
              {revNetDelta != null ? fmt$(revNetDelta) : '—'}
            </span>
            {revPct != null && (
              <span style={subStyle}>{fmtPct(revPct)} baseline</span>
            )}
            {openYield === 'revenue' && (
              <YieldPopover anchorRef={refs.revenue} onClose={() => setOpenYield(null)}>
                <RevenueBreakdown cf={cf} />
                {revBaseline != null && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                    Baseline total: {fmt$(revBaseline)}
                  </div>
                )}
              </YieldPopover>
            )}
          </div>
        )}

        {/* 💧 Water */}
        <div
          ref={refs.water}
          style={{
            ...itemStyle('water'),
            cursor: waterBaseline == null ? 'default' : 'pointer',
            opacity: waterBaseline == null ? 0.5 : 1,
          }}
          onClick={() => { if (waterBaseline != null) toggleYield('water'); }}
          title={waterBaseline == null ? 'Water baseline not loaded (see Methods)' : 'Water committed — click to expand'}
        >
          <span style={labelStyle}>💧 Water</span>
          <span style={valueStyle('var(--text-muted)')}>—</span>
          <span style={subStyle}>no baseline</span>
        </div>

        {/* 🏠 Housing pressure */}
        <div
          ref={refs.housing}
          style={{
            ...itemStyle('housing'),
            background: boomtownFlag
              ? 'rgba(245, 158, 11, 0.07)'
              : openYield === 'housing' ? 'var(--bg-elevated)' : 'transparent',
            border: boomtownFlag
              ? '1px solid var(--amber)'
              : `1px solid ${openYield === 'housing' ? 'var(--border)' : 'transparent'}`,
          }}
          onClick={() => toggleYield('housing')}
          title="Housing pressure (construction workforce ÷ labor force)"
        >
          <span style={labelStyle}>🏠 Housing</span>
          <span style={valueStyle(
            boomtownFlag ? 'var(--amber)' :
            housingPressure > 0.05 ? 'var(--warning)' : 'var(--text-secondary)'
          )}>
            {(housingPressure * 100).toFixed(1)}%
          </span>
          {boomtownFlag && <span style={{ ...subStyle, color: 'var(--amber)' }}>⚠ pressure</span>}

          {openYield === 'housing' && (
            <YieldPopover anchorRef={refs.housing} onClose={() => setOpenYield(null)}>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Housing Pressure
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Construction workforce</span>
                <span style={{ color: 'var(--construction)' }}>{Math.round(constructionJobs)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Labor force</span>
                <span>{laborForce.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border)', fontWeight: 500 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Pressure ratio</span>
                <span style={{ color: boomtownFlag ? 'var(--amber)' : 'var(--text-primary)' }}>
                  {(housingPressure * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Threshold: {(HOUSING_PRESSURE_THRESHOLD * 100).toFixed(0)}% (boomtown notification).
                Visible housing strain documented in WY at 5–8% saturation (LAUS 2001–2008).
              </div>
              {boomtownFlag && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: 'var(--amber)', fontSize: 11, marginBottom: 6 }}>
                    Suggested mitigations:
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['affordable_housing', 'workforce_retraining'].map(id => {
                      const action = engineState.action_library.actions[id];
                      if (!action) return null;
                      return (
                        <button
                          key={id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGeoid(null);
                            enterPlacementMode(id);
                          }}
                          style={{
                            padding: '2px 8px',
                            background: 'transparent',
                            border: '1px solid var(--amber)',
                            borderRadius: 3,
                            color: 'var(--amber)',
                            fontSize: 10,
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {action.action_name ?? id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </YieldPopover>
          )}
        </div>

      </div>
    </div>
  );
}
