import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { EngineState, AssetInstance, ProductionAsset } from '../../engine/types.js';
import {
  getExistingAssets, previewProductionReduction, SITE_COMPAT,
  delayRetirement as engineDelayRetirementPreview,
  cancelQueued as engineCancelQueuedPreview,
} from '../../engine/engine.js';
import { CountyYields } from './CountyYields.js';
import { ChartExpander } from './ChartExpander.js';
import { anchorById, formatSectorName } from '../map/anchorFacilities.js';

// ── Formatting helpers ────────────────────────────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  tons_yr: 'short tons/yr',
  bbl_yr: 'bbl/yr',
  mcf_yr: 'mcf/yr',
  lbs_u3o8_yr: 'lbs U3O8/yr',
};

const STEP_SIZE: Record<string, number> = {
  tons_yr: 1_000_000,
  bbl_yr: 100_000,
  mcf_yr: 100_000,
  lbs_u3o8_yr: 10_000,
};

function fmt$(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtVol(v: number, unit: string): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B ${UNIT_LABELS[unit] ?? unit}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M ${UNIT_LABELS[unit] ?? unit}`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k ${UNIT_LABELS[unit] ?? unit}`;
  return `${v.toLocaleString()} ${UNIT_LABELS[unit] ?? unit}`;
}

// ── Lifecycle badge ───────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  operating: 'var(--surplus)',
  queued: 'var(--amber)',
  under_construction: 'var(--construction)',
  retired: 'var(--text-muted)',
};

const LIFECYCLE_LABELS: Record<string, string> = {
  operating: 'Operating',
  queued: 'Queued',
  under_construction: 'Under Construction',
  retired: 'Retired',
};

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const color = LIFECYCLE_COLORS[lifecycle] ?? 'var(--text-muted)';
  const label = LIFECYCLE_LABELS[lifecycle] ?? lifecycle.replace(/_/g, ' ');
  return (
    <span style={{
      fontSize: 9,
      color,
      border: `1px solid ${color}`,
      borderRadius: 3,
      padding: '1px 5px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: 500,
      animation: lifecycle === 'under_construction' ? 'pulse 1.5s infinite' : undefined,
    }}>
      {label}
    </span>
  );
}

// ── Countdown bar (symmetric for construction + retirement) ───────────────

function CountdownBar({ yearsRemaining, totalYears, direction, label }: {
  yearsRemaining: number;
  totalYears: number;
  direction: 'up' | 'down';
  label: string;
}) {
  const pct = totalYears > 0 ? Math.min(1, (totalYears - yearsRemaining) / totalYears) : 1;
  const barColor = direction === 'up' ? 'var(--construction)' : 'var(--deficit)';
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: barColor }}>{yearsRemaining}yr</span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

// ── Era timeline (commissioning ↑ / retirement ↓ events) ─────────────────

interface TimelineEvent {
  year: number;
  label: string;
  direction: 'up' | 'down';
}

function EraTimeline({ events, currentYear }: { events: TimelineEvent[]; currentYear: number }) {
  if (events.length === 0) return null;
  const allYears = events.map(e => e.year);
  const minY = Math.min(currentYear, ...allYears);
  const maxY = Math.max(currentYear + 1, ...allYears);
  const span = maxY - minY || 1;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Timeline
      </div>
      <div style={{ position: 'relative', height: 28, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        {/* Current year marker */}
        <div style={{
          position: 'absolute',
          left: `${((currentYear - minY) / span) * 100}%`,
          top: 0, bottom: 0, width: 1,
          background: 'var(--text-muted)',
          opacity: 0.5,
        }} />
        <div style={{
          position: 'absolute',
          left: `${((currentYear - minY) / span) * 100}%`,
          top: 1, fontSize: 7, color: 'var(--text-muted)',
          transform: 'translateX(-50%)',
        }}>{currentYear}</div>

        {/* Event dots */}
        {events.map((ev, i) => {
          const pct = ((ev.year - minY) / span) * 100;
          const color = ev.direction === 'up' ? 'var(--construction)' : 'var(--deficit)';
          const yPos = ev.direction === 'up' ? 8 : 18;
          return (
            <div key={`${ev.year}-${ev.direction}-${i}`} title={`${ev.year}: ${ev.label}`}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: yPos,
                width: 6, height: 6,
                borderRadius: '50%',
                background: color,
                transform: 'translateX(-3px)',
                cursor: 'default',
                boxShadow: `0 0 4px ${color}`,
              }}
            />
          );
        })}

        {/* Legend */}
        <div style={{
          position: 'absolute', right: 4, bottom: 2,
          display: 'flex', gap: 8, fontSize: 7, color: 'var(--text-muted)',
        }}>
          <span><span style={{ color: 'var(--construction)' }}>●</span> commission</span>
          <span><span style={{ color: 'var(--deficit)' }}>●</span> retire</span>
        </div>
      </div>
    </div>
  );
}

export function EconomyDrivers({ drivers }: {
  drivers: NonNullable<CountyCardData['economic_drivers']>;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <DriverList title="Top GDP Share" rows={(drivers.top_by_share ?? []).slice(0, 3)} mode="share" />
      <DriverList title="Top LQ" rows={(drivers.top_by_lq ?? []).slice(0, 3)} mode="lq" />
      <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {drivers.driver_source ?? 'driver source unknown'} · {drivers.vintage ?? 'vintage unknown'}
      </div>
    </div>
  );
}

function DriverList({ title, rows, mode }: {
  title: string;
  rows: EconomicDriver[];
  mode: 'share' | 'lq';
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{title}</div>
      {rows.map((row, index) => (
        <div key={`${mode}-${row.display_sector}-${index}`} style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>{formatSectorName(row.display_sector)}</span>
          <span>
            {mode === 'share'
              ? `${(((row.share ?? 0) * 100)).toFixed(1)}%`
              : (row.lq ?? 0).toFixed(2)}
            {row.employment != null && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 5, fontSize: 9 }}>
                {Math.round(row.employment).toLocaleString()} jobs
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnchorFacilityList({ anchorIds, registryAssets }: {
  anchorIds: string[];
  registryAssets: AssetInstance[];
}) {
  const anchors = anchorIds
    .map(anchorById)
    .filter((anchor): anchor is NonNullable<ReturnType<typeof anchorById>> => anchor !== null);
  if (anchors.length === 0) return null;

  const tier2 = anchors
    .filter(anchor => anchor.properties.tier === 2)
    .sort((a, b) => {
      const aw = Math.max(a.properties.capacity_or_load_mw ?? 0, (a.properties.employment_est ?? 0) / 2);
      const bw = Math.max(b.properties.capacity_or_load_mw ?? 0, (b.properties.employment_est ?? 0) / 2);
      return bw - aw;
    })
    .slice(0, 8);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Anchor Facilities</div>
      {tier2.map(anchor => {
        const asset = registryAssets.find(candidate => candidate.anchor_id === anchor.properties.anchor_id);
        return (
          <button
            key={anchor.properties.anchor_id}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('terra:focus-anchor', {
                detail: { anchorId: anchor.properties.anchor_id },
              }));
            }}
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '5px 0',
              fontFamily: 'var(--font-mono)',
              textAlign: 'left',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {anchor.properties.name}
              </span>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 9 }}>
                {formatSectorName(anchor.properties.display_sector)}
                {asset?.confidence === 'low' && (
                  <span style={{ color: 'var(--amber)', marginLeft: 4 }}>low confidence</span>
                )}
              </span>
            </span>
            <span style={{
              fontSize: 8,
              color: anchor.properties.tier === 2 ? 'var(--teal)' : 'var(--text-secondary)',
              border: `1px solid ${anchor.properties.tier === 2 ? 'var(--teal)' : 'var(--text-secondary)'}`,
              borderRadius: 3,
              padding: '1px 4px',
              whiteSpace: 'nowrap',
            }}>
              Tier {anchor.properties.tier}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: 6,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  padding: '2px 0',
};

const controlBtnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
  padding: '3px 8px',
  background: 'transparent',
  border: `1px solid ${color}`,
  borderRadius: 3,
  color,
  fontSize: 9,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-mono)',
  opacity: disabled ? 0.4 : 1,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
});

// ── Modal types ───────────────────────────────────────────────────────────

interface ReductionModalState {
  assetName: string;
  commodity: string;
  maxVolume: number;
  deltaVolume: number;
}

interface RetirementModalState {
  assetId: string;
  assetName: string;
  currentRetirementYear: number | null;
  capacityMw: number;
  mode: 'schedule' | 'accelerate' | 'delay';
  targetYear: number;
}

interface CancelModalState {
  assetId: string;
  assetName: string;
  lifecycle: string;
  actionId: string;
  magnitude: number;
}

// ── Asset detail helpers ──────────────────────────────────────────────────

function assetDisplayName(a: AssetInstance): string {
  if (a.asset_class === 'site') return a.name;
  if (a.origin === 'player') {
    return a.action_id?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? a.name;
  }
  return a.name;
}

function assetSubtitle(a: AssetInstance, _year: number): string {
  const parts: string[] = [];
  if (a.capacity_mw != null && a.capacity_mw > 0) parts.push(`${a.capacity_mw} MW`);
  if (a.magnitude != null && a.origin === 'player') parts.push(`${a.magnitude} units`);
  if (a.type && a.type !== a.name && a.type !== a.action_id) {
    parts.push(a.type.replace(/_/g, ' '));
  }
  if (a.operational_year != null && a.lifecycle !== 'retired') {
    if (a.lifecycle === 'operating' && a.origin === 'baseline') {
      // don't show op year for baseline operating
    } else {
      parts.push(`op ${a.operational_year}`);
    }
  }
  if (a.origin === 'player' && a.decision_year != null) {
    parts.push(`dec ${a.decision_year}`);
  }
  return parts.join(' · ');
}

// ── Coefficient info popover (reused from original) ───────────────────────

function CoefficientInfo({ field, confidence, source }: {
  field: string;
  confidence: 'low' | 'medium' | 'high';
  source: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          cursor: 'pointer', fontSize: 9,
          color: confidence === 'low' ? 'var(--amber)' : 'var(--text-muted)',
          border: `1px solid ${confidence === 'low' ? 'var(--amber)' : 'var(--text-muted)'}`,
          borderRadius: '50%', width: 13, height: 13,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          verticalAlign: 'middle',
        }}
      >i</span>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', right: 0, top: 18,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '6px 10px', fontSize: 10, width: 220, zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {confidence === 'low' && (
            <div style={{ color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>Low confidence estimate</div>
          )}
          <div style={{ color: 'var(--text-secondary)' }}>
            <div><strong>{field}</strong></div>
            <div style={{ marginTop: 2 }}>Confidence: {confidence}</div>
            <div style={{ marginTop: 2 }}>{source}</div>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Fuel bar (reused) ─────────────────────────────────────────────────────

function FuelBar({ fuelMix }: { fuelMix: Record<string, number> }) {
  const entries = Object.entries(fuelMix).filter(([, v]) => v > 0);
  if (!entries.length) return <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No generation data</div>;
  const FUEL_COLORS: Record<string, string> = {
    SUB: 'var(--fuel-coal)', BIT: 'var(--fuel-coal)', LIG: 'var(--fuel-coal)',
    NG: 'var(--fuel-gas)', GAS: 'var(--fuel-gas)', NUC: 'var(--fuel-nuclear)', nuclear: 'var(--fuel-nuclear)',
    WND: 'var(--fuel-wind)', wind: 'var(--fuel-wind)', SUN: 'var(--fuel-solar)', solar: 'var(--fuel-solar)',
    WAT: 'var(--fuel-hydro)', hydro: 'var(--fuel-hydro)',
  };
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      {entries.map(([fuel, share]) => (
        <div key={fuel} title={`${fuel}: ${(share * 100).toFixed(0)}%`}
          style={{ flex: share, background: FUEL_COLORS[fuel] ?? 'var(--fuel-other)' }} />
      ))}
    </div>
  );
}

// ── Site popover (compatible actions + discount breakdown) ─────────────────

function SitePopover({ site, engineState, onBuildOnSite, onClose }: {
  site: AssetInstance;
  engineState: EngineState;
  onBuildOnSite: (actionId: string) => void;
  onClose: () => void;
}) {
  const siteClass = site.site_class;
  const compat = siteClass ? SITE_COMPAT[siteClass] : null;
  const spawnYear = site.site_spawn_year ?? engineState.year;
  const yearsElapsed = engineState.year - spawnYear;
  const halfLife = site.workforce_pool_half_life_years ?? 5;
  const decayPct = halfLife > 0 ? Math.round(100 * Math.pow(0.5, yearsElapsed / halfLife)) : 0;

  return (
    <div style={{
      marginTop: 8, padding: '10px 12px',
      background: 'rgba(45, 212, 191, 0.05)',
      border: '1px solid var(--teal-dim)',
      borderRadius: 4, fontSize: 11,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Site Details
        </span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>×</span>
      </div>

      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>Class</span>
        <span style={{ color: 'var(--teal)' }}>{siteClass ?? '—'}</span>
      </div>
      {site.interconnection_mw != null && (
        <div style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Interconnection</span>
          <span>{site.interconnection_mw} MW</span>
        </div>
      )}
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>Workforce pool</span>
        <span>
          <span style={{ color: decayPct < 50 ? 'var(--amber)' : 'var(--teal)' }}>
            {site.workforce_pool_current?.toFixed(1) ?? '—'} FTE
          </span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            ({decayPct}% of {site.workforce_pool_initial?.toFixed(0)})
          </span>
        </span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>Decay clock</span>
        <span style={{ color: decayPct < 30 ? 'var(--deficit)' : decayPct < 60 ? 'var(--amber)' : 'var(--text-primary)' }}>
          {yearsElapsed}yr elapsed · t½={halfLife}yr
        </span>
      </div>
      {site.acres != null && (
        <div style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Acres</span>
          <span>{site.acres}</span>
        </div>
      )}

      {/* Succession discount breakdown */}
      {compat && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Succession Discounts (confidence: low)
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>TTD reduction</span>
            <span style={{ color: 'var(--teal)' }}>-{compat.ttd_reduction_years}yr</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Capex discount</span>
            <span style={{ color: 'var(--teal)' }}>{(compat.capex_discount_fraction * 100).toFixed(0)}% off</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>TX waiver</span>
            <span style={{ color: 'var(--teal)' }}>up to {site.interconnection_mw ?? 0} MW</span>
          </div>
        </div>
      )}

      {/* Build-on-site buttons */}
      {compat && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>BUILD ON THIS SITE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {[...compat.compatible_actions].map(actionId => {
              const action = engineState.action_library.actions[actionId];
              if (!action) return null;
              return (
                <button key={actionId} onClick={() => onBuildOnSite(actionId)}
                  style={controlBtnStyle('var(--teal)')}>
                  {action.action_name ?? actionId.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Main CountyCardDrawer component ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

interface CountyCardData {
  county_name?: string;
  state?: string;
  population?: number;
  median_household_income?: number;
  per_capita_income?: number;
  source_demographics?: string;
  source_employment?: string;
  generation_capacity_mw?: number;
  fuel_mix?: Record<string, number>;
  water_withdrawals_mgd?: number | null;
  water_vintage?: number | null;
  flagship_assets?: unknown[];
  economic_drivers?: {
    driver_source?: string;
    vintage?: string;
    top_by_share?: EconomicDriver[];
    top_by_lq?: EconomicDriver[];
  };
  anchor_facilities?: string[];
}

interface EconomicDriver {
  display_sector: string;
  employment?: number | null;
  establishments?: number | null;
  lq?: number | null;
  share?: number | null;
}

export function CountyCardDrawer() {
  const selectedGeoid = useTerraStore(s => s.selectedGeoid);
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const enterPlacementMode = useTerraStore(s => s.enterPlacementMode);
  const storeReduceProductionAsset = useTerraStore(s => s.reduceProductionAsset);
  const storeScheduleRetirement = useTerraStore(s => s.scheduleRetirement);
  const storeAccelerateRetirement = useTerraStore(s => s.accelerateRetirement);
  const storeDelayRetirement = useTerraStore(s => s.delayRetirement);
  const storeCancelQueued = useTerraStore(s => s.cancelQueued);
  const engineState = useTerraStore(s => s.engineState) as EngineState;
  // F3: read actionLog to surface site_coords on queued-asset rows
  const actionLog = useTerraStore(s => s.actionLog);

  const [reductionModal, setReductionModal] = useState<ReductionModalState | null>(null);
  const [retirementModal, setRetirementModal] = useState<RetirementModalState | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModalState | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);

  if (!selectedGeoid) return null;

  const ees = engineState.county_ees[selectedGeoid];
  const card = engineState.county_cards[selectedGeoid] as CountyCardData | undefined;
  if (!ees || !card) return null;

  const primaryBusRow = engineState.crosswalk.find(r => r.geoid === selectedGeoid && r.primary_bus);
  const busId = primaryBusRow ? String(primaryBusRow.bus_id) : null;
  const busState = busId ? engineState.bus_state[busId] : null;

  const activeCouplings = engineState.active_couplings.filter(
    c => c.demand_geoid === selectedGeoid || c.supply_geoid === selectedGeoid
  );

  // ── Gather all assets for this county from asset_registry ─────────────
  const countyAssets = engineState.asset_registry.filter(a => a.geoid === selectedGeoid);
  // Exclude housing_stock from the visible registry (it has its own panel)
  const registryAssets = countyAssets.filter(a => a.asset_class !== 'housing_stock');
  // Housing stock asset for the housing panel
  const housingAsset = countyAssets.find(a => a.asset_class === 'housing_stock') ?? null;

  // Sort: operating baseline first, then player assets, then sites, then retired
  const LIFECYCLE_ORDER: Record<string, number> = { operating: 0, under_construction: 1, queued: 2, retired: 3 };
  const sortedAssets = [...registryAssets].sort((a, b) => {
    const la = LIFECYCLE_ORDER[a.lifecycle] ?? 4;
    const lb = LIFECYCLE_ORDER[b.lifecycle] ?? 4;
    if (la !== lb) return la - lb;
    if (a.origin !== b.origin) return a.origin === 'baseline' ? -1 : 1;
    return 0;
  });

  // ── Timeline events for EraTimeline strip ──────────────────────────────
  const timelineEvents: TimelineEvent[] = [];
  for (const a of registryAssets) {
    if (a.asset_class === 'site') continue;
    if (a.operational_year != null && !a.commissioned && a.operational_year > engineState.year) {
      timelineEvents.push({ year: a.operational_year, label: `${assetDisplayName(a)} online`, direction: 'up' });
    }
    if (a.scheduled_retirement_year != null && a.scheduled_retirement_year > engineState.year) {
      timelineEvents.push({ year: a.scheduled_retirement_year, label: `${assetDisplayName(a)} retires`, direction: 'down' });
    }
  }
  timelineEvents.sort((a, b) => a.year - b.year);

  // ── Also get production assets from existing_assets view for Reduce ─────
  const liveAssets = getExistingAssets(engineState, selectedGeoid);
  const productionAssets = liveAssets.filter(
    a => a.asset_kind === 'production_asset',
  ) as ProductionAsset[];

  const SUGGESTED_ACTIONS = ['smr_advanced', 'pumped_hydro', 'geothermal_utility', 'battery_grid', 'transmission_230kv'];

  function handleBuildOnSite(actionId: string) {
    setSelectedGeoid(null);
    enterPlacementMode(actionId);
  }

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 39 }} onClick={() => setSelectedGeoid(null)} />

      {/* Drawer */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 380,
        background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
        overflowY: 'auto', zIndex: 40,
        fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)', display: 'flex',
          justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {ees.county_name || card.county_name || selectedGeoid}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              {card.state} · GEOID {selectedGeoid}
            </div>
          </div>
          <button onClick={() => setSelectedGeoid(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Yields strip */}
        <CountyYields />

        {/* Chart expand section — renders when a yield chip is tapped through */}
        <ChartExpander geoid={selectedGeoid} />

        {/* Section 1: Socioeconomic Baseline */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Demographics</div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Population</span>
            <span>{(card.population ?? 0).toLocaleString()}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Med. HH Income</span>
            <span>${(card.median_household_income ?? 0).toLocaleString()}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Per Capita Income</span>
            <span>
              ${(card.per_capita_income ?? 0).toLocaleString()}
              {card.source_employment === 'acs_proxy' && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 10 }}>ACS proxy</span>
              )}
            </span>
          </div>
        </div>

        {/* Section 2: Economy */}
        {(card.economic_drivers || (card.anchor_facilities?.length ?? 0) > 0) && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Economy</div>
            {card.economic_drivers && (
              <EconomyDrivers drivers={card.economic_drivers} />
            )}
            {(card.anchor_facilities?.length ?? 0) > 0 && (
              <AnchorFacilityList
                anchorIds={card.anchor_facilities ?? []}
                registryAssets={registryAssets}
              />
            )}
          </div>
        )}

        {/* Section 2: Energy Baseline */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Energy Baseline</div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Generation Capacity</span>
            <span>{(card.generation_capacity_mw ?? 0).toFixed(1)} MW</span>
          </div>
          {card.fuel_mix && Object.keys(card.fuel_mix).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>Fuel Mix</div>
              <FuelBar fuelMix={card.fuel_mix} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {Object.entries(card.fuel_mix).map(([fuel, share]) => (
                  <span key={fuel} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {fuel} {(share * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Water Withdrawals</span>
            <span>
              {card.water_withdrawals_mgd != null ? `${card.water_withdrawals_mgd.toFixed(1)} MGD` : '—'}
              {card.water_vintage && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 10 }}>({card.water_vintage} data)</span>
              )}
            </span>
          </div>
        </div>

        {/* Section 3: Asset Registry (replaces Flagship Assets + Build Queue) */}
        {sortedAssets.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Asset Registry</div>
            <EraTimeline events={timelineEvents} currentYear={engineState.year} />
            {sortedAssets.map((asset, i) => {
              const isLast = i === sortedAssets.length - 1;
              const isSite = asset.asset_class === 'site';
              const isProduction = asset.asset_class === 'production';
              const isOperating = asset.lifecycle === 'operating';
              const isQueuedOrUC = asset.lifecycle === 'queued' || asset.lifecycle === 'under_construction';
              const isRetired = asset.lifecycle === 'retired';
              const isPlayer = asset.origin === 'player';
              const hasRetirement = asset.scheduled_retirement_year !== null;

              // Find matching production_asset for Reduce control
              const pa = isProduction && isOperating
                ? productionAssets.find(p => p.name === asset.name)
                : null;

              // F3: look up site_coords from action log
              const logEntry = isPlayer && isQueuedOrUC
                ? actionLog.find(
                    e => e.type === 'queue' &&
                      e.actionId === asset.action_id &&
                      e.geoid === asset.geoid &&
                      e.decisionYear === asset.decision_year,
                  )
                : null;
              const siteCoords = logEntry?.site_coords ?? null;
              const pinLabel = siteCoords
                ? `pinned ${siteCoords[0].toFixed(2)}, ${siteCoords[1].toFixed(2)}`
                : null;

              // Timeline countdowns
              const constructionYrs = (!asset.commissioned && asset.operational_year != null && isPlayer)
                ? Math.max(0, asset.operational_year - engineState.year)
                : null;
              const retirementYrs = hasRetirement
                ? Math.max(0, asset.scheduled_retirement_year! - engineState.year)
                : null;
              const constructionTotal = (asset.decision_year != null && asset.operational_year != null)
                ? asset.operational_year - asset.decision_year
                : null;

              return (
                <div key={asset.asset_id} style={{
                  padding: '8px 0',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}>
                  {/* Name + badge row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <LifecycleBadge lifecycle={isSite ? 'operating' : asset.lifecycle} />
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assetDisplayName(asset)}
                    </span>
                    {asset.origin === 'player' && (
                      <span style={{ fontSize: 8, color: 'var(--purple)', border: '1px solid var(--purple-dim)', borderRadius: 2, padding: '0 3px' }}>
                        PLAYER
                      </span>
                    )}
                    {isSite && (
                      <span style={{ fontSize: 8, color: 'var(--amber)', border: '1px solid var(--amber-dim)', borderRadius: 2, padding: '0 3px' }}>
                        SITE
                      </span>
                    )}
                  </div>

                  {/* Subtitle */}
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 2, marginBottom: 2 }}>
                    {assetSubtitle(asset, engineState.year)}
                  </div>

                  {/* F3: pin label when site_coords present */}
                  {pinLabel && (
                    <div style={{ fontSize: 9, color: 'var(--teal)', paddingLeft: 2, marginBottom: 2 }}>
                      📍 {pinLabel}
                    </div>
                  )}

                  {/* Symmetric countdown bars */}
                  {constructionYrs != null && constructionYrs > 0 && constructionTotal != null && (
                    <CountdownBar
                      yearsRemaining={constructionYrs}
                      totalYears={constructionTotal}
                      direction="up"
                      label="Commissioning"
                    />
                  )}
                  {retirementYrs != null && (
                    <CountdownBar
                      yearsRemaining={retirementYrs}
                      totalYears={retirementYrs + (engineState.year - (asset.operational_year ?? engineState.year))}
                      direction="down"
                      label={`Retirement ${asset.scheduled_retirement_year}`}
                    />
                  )}

                  {/* Throttle warning */}
                  {asset.throttle_reason && (
                    <div style={{ color: 'var(--amber)', fontSize: 9, marginTop: 2 }}>
                      Throttled: {asset.throttle_reason}
                    </div>
                  )}

                  {/* Succession discount info (if this player asset got one) */}
                  {asset.succession_site_id && (
                    <div style={{
                      marginTop: 4, padding: '4px 8px',
                      background: 'rgba(45, 212, 191, 0.05)',
                      border: '1px solid var(--teal-dim)',
                      borderRadius: 3, fontSize: 9,
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>Site discount: </span>
                      {asset.ttd_reduction_applied != null && (
                        <span style={{ color: 'var(--teal)', marginRight: 6 }}>TTD -{asset.ttd_reduction_applied}yr</span>
                      )}
                      {asset.capex_discount_fraction != null && (
                        <span style={{ color: 'var(--teal)', marginRight: 6 }}>Capex -{(asset.capex_discount_fraction * 100).toFixed(0)}%</span>
                      )}
                      {asset.tx_waiver_mw != null && (
                        <span style={{ color: 'var(--teal)' }}>TX waiver {asset.tx_waiver_mw} MW</span>
                      )}
                    </div>
                  )}

                  {/* ── Controls row ── */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {/* Reduce (production, operating) */}
                    {pa && isOperating && pa.production_volume > 0 && (
                      <button onClick={() => setReductionModal({
                        assetName: pa.name, commodity: pa.commodity,
                        maxVolume: pa.production_volume,
                        deltaVolume: STEP_SIZE[pa.production_unit] ?? 1_000_000,
                      })} style={controlBtnStyle('var(--deficit)')}>
                        ↓ Reduce
                      </button>
                    )}

                    {/* Schedule retirement (operating generator, no retirement scheduled) */}
                    {isOperating && !hasRetirement && !isSite && !isProduction && (
                      <button onClick={() => setRetirementModal({
                        assetId: asset.asset_id, assetName: assetDisplayName(asset),
                        currentRetirementYear: null, capacityMw: asset.capacity_mw ?? 0,
                        mode: 'schedule', targetYear: engineState.year + 5,
                      })} style={controlBtnStyle('var(--amber)')}>
                        Schedule Retirement
                      </button>
                    )}

                    {/* Accelerate retirement (has scheduled retirement, future) */}
                    {isOperating && hasRetirement && retirementYrs != null && retirementYrs > 1 && (
                      <button onClick={() => setRetirementModal({
                        assetId: asset.asset_id, assetName: assetDisplayName(asset),
                        currentRetirementYear: asset.scheduled_retirement_year!,
                        capacityMw: asset.capacity_mw ?? 0,
                        mode: 'accelerate',
                        targetYear: Math.max(engineState.year + 1, asset.scheduled_retirement_year! - 2),
                      })} style={controlBtnStyle('var(--construction)')}>
                        Accelerate
                      </button>
                    )}

                    {/* Delay retirement (has scheduled retirement) */}
                    {isOperating && hasRetirement && (
                      <button onClick={() => setRetirementModal({
                        assetId: asset.asset_id, assetName: assetDisplayName(asset),
                        currentRetirementYear: asset.scheduled_retirement_year!,
                        capacityMw: asset.capacity_mw ?? 0,
                        mode: 'delay',
                        targetYear: asset.scheduled_retirement_year! + 3,
                      })} style={controlBtnStyle('var(--text-secondary)')}>
                        Delay
                      </button>
                    )}

                    {/* Cancel (player queued/under_construction) */}
                    {isPlayer && isQueuedOrUC && (
                      <button onClick={() => setCancelModal({
                        assetId: asset.asset_id, assetName: assetDisplayName(asset),
                        lifecycle: asset.lifecycle, actionId: asset.action_id ?? '',
                        magnitude: asset.magnitude ?? 0,
                      })} style={controlBtnStyle('var(--deficit)')}>
                        Cancel
                      </button>
                    )}

                    {/* Reclaim (retired production — placeholder) */}
                    {isRetired && isProduction && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', padding: '3px 0' }}>
                        Reclamation in progress
                      </span>
                    )}

                    {/* Build-on-site (site assets) */}
                    {isSite && isOperating && (
                      <button
                        onClick={() => setExpandedSiteId(expandedSiteId === asset.asset_id ? null : asset.asset_id)}
                        style={controlBtnStyle('var(--teal)')}>
                        {expandedSiteId === asset.asset_id ? '▾ Site Info' : '▸ Build on Site'}
                      </button>
                    )}
                  </div>

                  {/* Production asset current output */}
                  {pa && isOperating && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Output: {fmtVol(pa.production_volume, pa.production_unit)}
                      <span style={{ marginLeft: 4 }}>({pa.production_confidence})</span>
                    </div>
                  )}

                  {/* Reclamation info */}
                  {asset.active_reclamation_acres != null && asset.active_reclamation_acres > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      Reclamation: {asset.active_reclamation_acres.toFixed(1)} active acres
                      · {asset.reclamation_jobs_direct?.toFixed(1) ?? '—'} jobs
                    </div>
                  )}

                  {/* Decommissioning info */}
                  {asset.decommissioning_cost_usd != null && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      Decom: {fmt$(asset.decommissioning_cost_usd)} over {asset.decommissioning_duration_years ?? '—'}yr
                      (started {asset.decommissioning_start_year})
                    </div>
                  )}

                  {/* Site popover (expanded) */}
                  {isSite && expandedSiteId === asset.asset_id && (
                    <SitePopover
                      site={asset}
                      engineState={engineState}
                      onBuildOnSite={handleBuildOnSite}
                      onClose={() => setExpandedSiteId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Section 4: Housing Panel */}
        {housingAsset && housingAsset.housing_total_units != null && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Housing Stock</div>

            {/* Stock composition stacked bar */}
            {(() => {
              const total = housingAsset.housing_total_units ?? 0;
              const occupied = housingAsset.housing_occupied_units ?? 0;
              const convertible = housingAsset.housing_convertible_units ?? 0;
              const seasonal = housingAsset.housing_seasonal_excluded ?? 0;
              const affordable = housingAsset.housing_affordable_added ?? 0;
              const other = Math.max(0, total - occupied - convertible - seasonal);
              const segments = [
                { label: 'Occupied', value: occupied, color: 'var(--teal)' },
                { label: 'Convertible', value: convertible, color: 'var(--amber)' },
                { label: 'Affordable added', value: affordable, color: 'var(--surplus)' },
                { label: 'Seasonal excl.', value: seasonal, color: 'var(--text-muted)' },
                { label: 'Other vacant', value: other, color: 'var(--border)' },
              ].filter(s => s.value > 0);

              return (
                <div style={{ marginBottom: 10 }}>
                  {/* Stacked bar */}
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    {segments.map(s => (
                      <div key={s.label} title={`${s.label}: ${s.value.toLocaleString()}`}
                        style={{ flex: s.value, background: s.color, minWidth: s.value > 0 ? 2 : 0 }} />
                    ))}
                  </div>
                  {/* Legend + values */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                    {segments.map(s => (
                      <div key={s.label} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 1, background: s.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{s.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Total: {total.toLocaleString()} units
                  </div>
                </div>
              );
            })()}

            {/* Pressure gauge */}
            {(() => {
              const pressure = housingAsset.housing_pressure_ratio ?? 0;
              const gaugeMax = 2.0;
              const pct = Math.min(1, pressure / gaugeMax);
              const gaugeColor = pressure >= 1.25 ? 'var(--deficit)'
                : pressure >= 1.0 ? 'var(--amber)'
                : 'var(--teal)';
              const statusLabel = pressure >= 1.25 ? 'STRESSED'
                : pressure >= 1.0 ? 'TIGHT'
                : pressure >= 0.8 ? 'BALANCED'
                : 'LOOSE';
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Pressure ratio</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: gaugeColor }}>
                      {pressure.toFixed(2)} — {statusLabel}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${pct * 100}%`,
                      height: '100%',
                      background: gaugeColor,
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                    {/* Threshold markers */}
                    <div style={{ position: 'absolute', left: `${(1.0 / gaugeMax) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--amber)', opacity: 0.5 }}
                      title="Tight (1.0)" />
                    <div style={{ position: 'absolute', left: `${(1.25 / gaugeMax) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--deficit)', opacity: 0.5 }}
                      title="Stressed (1.25)" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>0</span>
                    <span>tight 1.0</span>
                    <span>stressed 1.25</span>
                    <span>2.0</span>
                  </div>
                </div>
              );
            })()}

            {/* Permits per year */}
            {housingAsset.housing_permits_per_year != null && housingAsset.housing_permits_per_year > 0 && (
              <div style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>Permits/year</span>
                <span style={{ color: 'var(--teal)' }}>{Math.round(housingAsset.housing_permits_per_year)}</span>
              </div>
            )}

            {/* Retrofit affordance */}
            {housingAsset.housing_convertible_units != null && housingAsset.housing_convertible_units > 0 && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid var(--amber-dim, var(--amber))', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 4 }}>
                  {housingAsset.housing_convertible_units} convertible units available
                </div>
                <button
                  onClick={() => { setSelectedGeoid(null); enterPlacementMode('housing_retrofit_affordable'); }}
                  style={controlBtnStyle('var(--amber)')}>
                  Retrofit Affordable Housing
                </button>
              </div>
            )}
          </div>
        )}

        {/* Section 5: Live State */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Live State ({engineState.year})</div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>E Capital</span>
            <span>
              <span style={{ color: 'var(--teal)' }}>{ees.E.toFixed(3)}</span>
              <CoefficientInfo field="Environmental Capital (E)" confidence="medium" source="Session 3 mw_marginal_actions.csv cross-ecoregion medians" />
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Ec Capital</span>
            <span>
              <span style={{ color: 'var(--teal)' }}>{ees.Ec.toFixed(3)}</span>
              <CoefficientInfo field="Economic Capital (Ec)" confidence="medium" source="Session 3 audit; ACP employment data; ATB Ec recompute guard clause" />
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>S Capital</span>
            <span>
              <span style={{ color: 'var(--teal)' }}>{ees.S.toFixed(3)}</span>
              <CoefficientInfo field="Social Capital (S)" confidence="medium" source="Session 3 audit" />
            </span>
          </div>
          {busState && (
            <>
              <div style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>Capacity</span>
                <span>{(busState.capacity_mw ?? 0).toFixed(1)} MW</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>Load</span>
                <span>{(busState.load_mw ?? 0).toFixed(1)} MW</span>
              </div>
            </>
          )}

          {ees.deficit_mw > 0 && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid var(--deficit)', borderRadius: 4,
            }}>
              <div style={{ color: 'var(--deficit)', fontSize: 13, fontWeight: 500 }}>
                {ees.deficit_mw.toFixed(1)} MW firm supply gap
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>Suggested:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {SUGGESTED_ACTIONS.map(id => {
                  const action = engineState.action_library.actions[id];
                  if (!action) return null;
                  return (
                    <button key={id}
                      onClick={() => { setSelectedGeoid(null); enterPlacementMode(id); }}
                      style={controlBtnStyle('var(--teal)')}>
                      {action.action_name ?? id}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeCouplings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Active Couplings</div>
              {activeCouplings.map(c => (
                <div key={c.coupling_id} style={{
                  fontSize: 11, color: 'var(--teal)', padding: '3px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>{c.coupling_type} · {c.coupling_id}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{c.reasoning}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Production Reduction Modal (X3 pattern) ═══ */}
      {reductionModal && (() => {
        const allLive = getExistingAssets(engineState, selectedGeoid);
        const pa = allLive.find(
          a => a.asset_kind === 'production_asset' && (a as ProductionAsset).commodity === reductionModal.commodity,
        ) as ProductionAsset | undefined;
        if (!pa) return null;

        const preview = previewProductionReduction(engineState, selectedGeoid, reductionModal.commodity, reductionModal.deltaVolume);
        const step = STEP_SIZE[pa.production_unit] ?? 1_000_000;
        const cellLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
        const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid var(--border)', fontSize: 11 };

        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13, 17, 23, 0.7)', zIndex: 200 }}
            onClick={(e) => { if (e.target === e.currentTarget) setReductionModal(null); }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 360, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--deficit)', textTransform: 'uppercase', letterSpacing: 1 }}>Reduce Output</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{reductionModal.assetName}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>REDUCTION VOLUME</label>
                <input type="range" min={step} max={pa.production_volume} step={step}
                  value={reductionModal.deltaVolume}
                  onChange={(e) => setReductionModal({ ...reductionModal, deltaVolume: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--deficit)' }} />
                <div style={{ fontSize: 13, color: 'var(--deficit)', marginTop: 4 }}>-{fmtVol(reductionModal.deltaVolume, pa.production_unit)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Remaining: {preview ? fmtVol(preview.new_volume, pa.production_unit) : '—'}</div>
              </div>
              {preview && (
                <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(248, 113, 113, 0.05)', border: '1px solid var(--deficit)', borderRadius: 4, fontSize: 11 }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}><div style={cellLabel}>This county</div></div>
                    <div style={{ flex: 1 }}><div style={cellLabel}>Era budgets</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ Ad valorem (A)</span>
                        <span style={{ color: preview.ledger_a_delta < 0 ? 'var(--deficit)' : 'var(--teal)', fontWeight: 500 }}>{fmt$(preview.ledger_a_delta)}</span>
                      </div>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ Severance (B)</span>
                        <span style={{ color: preview.ledger_b_delta < 0 ? 'var(--deficit)' : 'var(--teal)', fontWeight: 500 }}>{fmt$(preview.ledger_b_delta)}</span>
                      </div>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ School fin. (C)</span>
                        <span style={{ color: preview.ledger_c_delta > 0 ? 'var(--teal)' : 'var(--deficit)', fontWeight: 500 }}>{fmt$(preview.ledger_c_delta)}</span>
                      </div>
                      <div style={{ ...row, paddingTop: 6, fontWeight: 500, borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Net Δ</span>
                        <span style={{ color: (preview.ledger_a_delta + preview.ledger_b_delta + preview.ledger_c_delta) >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>
                          {fmt$(preview.ledger_a_delta + preview.ledger_b_delta + preview.ledger_c_delta)}
                        </span>
                      </div>
                      {preview.ledger_c_delta > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--teal)', marginTop: 4, lineHeight: 1.4 }}>
                          Ledger C rises — recapture burden shrinks as mineral AV falls.
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingTop: 4 }}>No era budget consumed.</div>
                      {(() => {
                        const lc = engineState.lifecycle_coefficients as Record<string, unknown> | null;
                        const recCfg = lc?.reclamation as Record<string, unknown> | undefined;
                        const tonsPerAcre = (recCfg?.tons_per_acre as number | undefined) ?? 10000;
                        const jobsPer100 = (recCfg?.jobs_per_100_acres_yr as number | undefined) ?? 2.5;
                        const deltaAcres = tonsPerAcre > 0 ? reductionModal.deltaVolume / tonsPerAcre : 0;
                        if (deltaAcres > 0) {
                          return (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>
                                Reclamation Arc
                              </div>
                              <div style={{ ...row, borderTop: 'none' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Δ acres</span>
                                <span style={{ color: 'var(--teal)' }}>+{deltaAcres.toFixed(1)}</span>
                              </div>
                              <div style={{ ...row, borderTop: 'none' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Δ jobs (est.)</span>
                                <span style={{ color: 'var(--teal)' }}>+{(deltaAcres * jobsPer100 / 100).toFixed(1)}</span>
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                Active reclamation acres added; 10yr bond release cohort.
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
                            Reductions draw no capital, labor, or material pools.
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => { storeReduceProductionAsset(selectedGeoid, reductionModal.commodity, reductionModal.deltaVolume); setReductionModal(null); }}
                  style={{ flex: 1, padding: '8px 0', background: 'rgba(248, 113, 113, 0.15)', color: 'var(--deficit)', border: '1px solid var(--deficit)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Confirm Reduction
                </button>
                <button onClick={() => setReductionModal(null)}
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Retirement Modal (Schedule / Accelerate / Delay) — W4 two-column ═══ */}
      {retirementModal && (() => {
        const { mode, assetId, assetName, currentRetirementYear, capacityMw, targetYear } = retirementModal;
        const minYear = mode === 'schedule' ? engineState.year + 1
          : mode === 'accelerate' ? engineState.year + 1
          : (currentRetirementYear ?? engineState.year) + 1;
        const maxYear = mode === 'delay' ? (currentRetirementYear ?? engineState.year) + 15
          : mode === 'accelerate' ? (currentRetirementYear ?? engineState.year) - 1
          : engineState.year + 30;
        const headerColor = mode === 'delay' ? 'var(--text-secondary)' : 'var(--amber)';
        const headerLabel = mode === 'schedule' ? 'Schedule Retirement' : mode === 'accelerate' ? 'Accelerate Retirement' : 'Delay Retirement';

        // Z1 delay cost preview
        let delayCostPreview: { delay_cost_hook: number; confidence: string } | null = null;
        if (mode === 'delay' && currentRetirementYear && targetYear > currentRetirementYear) {
          try {
            const [, result] = engineDelayRetirementPreview(engineState, assetId, targetYear);
            delayCostPreview = result;
          } catch { /* asset may not be in valid state for preview */ }
        }

        // Workforce estimate for site spawning (schedule/accelerate)
        const assetInRegistry = engineState.asset_registry.find(a => a.asset_id === assetId);
        const assetType = (assetInRegistry?.type ?? '').toLowerCase();
        const SITE_OPS: Record<string, number> = { coal: 0.28, gas: 0.10, nuclear: 0.38, wind: 0.04, solar: 0.02, hydro: 0.15 };
        const workforceEst = Math.round((capacityMw * (SITE_OPS[assetType] ?? 0.1)) * 10) / 10;

        const impRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid var(--border)', fontSize: 11 };
        const impLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13, 17, 23, 0.7)', zIndex: 200 }}
            onClick={(e) => { if (e.target === e.currentTarget) setRetirementModal(null); }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 380, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: headerColor, textTransform: 'uppercase', letterSpacing: 1 }}>{headerLabel}</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{assetName}</div>
                {currentRetirementYear && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Current: {currentRetirementYear}</div>
                )}
                {capacityMw > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{capacityMw} MW</div>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  {mode === 'schedule' ? 'RETIREMENT YEAR' : mode === 'accelerate' ? 'NEW (EARLIER) YEAR' : 'NEW (LATER) YEAR'}
                </label>
                <input type="range" min={minYear} max={maxYear} step={1}
                  value={targetYear}
                  onChange={(e) => setRetirementModal({ ...retirementModal, targetYear: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: headerColor }} />
                <div style={{ fontSize: 14, color: headerColor, marginTop: 4 }}>{targetYear}</div>
                {mode === 'delay' && currentRetirementYear && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Extension: +{targetYear - currentRetirementYear}yr
                  </div>
                )}
              </div>

              {/* ── W4 two-column impact card ── */}
              <div style={{ marginBottom: 16, padding: '10px 12px', background: mode === 'delay' ? 'rgba(245,158,11,0.05)' : 'rgba(248,113,113,0.05)', border: `1px solid ${mode === 'delay' ? 'var(--amber)' : 'var(--deficit)'}`, borderRadius: 4, fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}><div style={impLabel}>This county</div></div>
                  <div style={{ flex: 1 }}><div style={impLabel}>Era budgets</div></div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    {(mode === 'schedule' || mode === 'accelerate') && (
                      <>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Capacity</span>
                          <span style={{ color: 'var(--deficit)' }}>-{capacityMw} MW</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Site spawned</span>
                          <span style={{ color: 'var(--teal)' }}>Yes</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Workforce pool</span>
                          <span style={{ color: 'var(--teal)' }}>{workforceEst} FTE</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Interconnection</span>
                          <span style={{ color: 'var(--teal)' }}>{capacityMw} MW</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                          Brownfield site spawns with inherited interconnection and workforce pool (t½=5yr decay).
                        </div>
                      </>
                    )}
                    {mode === 'delay' && delayCostPreview && (
                      <>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Z1 delay cost</span>
                          <span style={{ color: 'var(--deficit)', fontWeight: 500 }}>{fmt$(delayCostPreview.delay_cost_hook)}</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Confidence</span>
                          <span style={{ color: 'var(--amber)' }}>{delayCostPreview.confidence}</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Capacity retained</span>
                          <span style={{ color: 'var(--teal)' }}>{capacityMw} MW</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                          Annual maintenance cost for extended operation. Site spawning deferred to {targetYear}.
                        </div>
                      </>
                    )}
                    {mode === 'delay' && !delayCostPreview && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingTop: 4 }}>
                        Delay cost preview unavailable.
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingTop: 4 }}>No era budget consumed.</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
                      Retirement decisions draw no capital, labor, or material pools.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => {
                  if (mode === 'schedule') storeScheduleRetirement(assetId, targetYear);
                  else if (mode === 'accelerate') storeAccelerateRetirement(assetId, targetYear);
                  else storeDelayRetirement(assetId, targetYear);
                  setRetirementModal(null);
                }}
                  style={{ flex: 1, padding: '8px 0', background: `${headerColor}22`, color: headerColor, border: `1px solid ${headerColor}`, borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Confirm
                </button>
                <button onClick={() => setRetirementModal(null)}
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Cancel Queued Modal — W4 two-column ═══ */}
      {cancelModal && (() => {
        const { assetId, assetName, lifecycle, actionId, magnitude } = cancelModal;
        const isUC = lifecycle === 'under_construction';
        const action = engineState.action_library.actions[actionId];

        // Preview sunk cost via engine
        let sunkPreview: { sunk_cost_fraction: number; sunk_cost_usd: number; confidence: string } | null = null;
        try {
          const [, result] = engineCancelQueuedPreview(engineState, assetId);
          sunkPreview = result;
        } catch { /* asset may not be in valid state */ }

        const impRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid var(--border)', fontSize: 11 };
        const impLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13, 17, 23, 0.7)', zIndex: 200 }}
            onClick={(e) => { if (e.target === e.currentTarget) setCancelModal(null); }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 380, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--deficit)', textTransform: 'uppercase', letterSpacing: 1 }}>Cancel Build</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{assetName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {action?.action_name ?? actionId} · {magnitude} units
                </div>
              </div>

              {/* W4 two-column impact card */}
              <div style={{ marginBottom: 16, padding: '10px 12px', background: isUC ? 'rgba(248,113,113,0.05)' : 'rgba(45,212,191,0.05)', border: `1px solid ${isUC ? 'var(--deficit)' : 'var(--teal-dim, var(--teal))'}`, borderRadius: 4, fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}><div style={impLabel}>This county</div></div>
                  <div style={{ flex: 1 }}><div style={impLabel}>Era budgets</div></div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    {sunkPreview && (
                      <>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Sunk cost</span>
                          <span style={{ color: sunkPreview.sunk_cost_usd > 0 ? 'var(--deficit)' : 'var(--teal)', fontWeight: 500 }}>
                            {sunkPreview.sunk_cost_usd > 0 ? fmt$(sunkPreview.sunk_cost_usd) : '$0'}
                          </span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Sunk fraction</span>
                          <span style={{ color: 'var(--text-primary)' }}>{(sunkPreview.sunk_cost_fraction * 100).toFixed(0)}%</span>
                        </div>
                        <div style={impRow}>
                          <span style={{ color: 'var(--text-secondary)' }}>Confidence</span>
                          <span style={{ color: 'var(--amber)' }}>{sunkPreview.confidence}</span>
                        </div>
                      </>
                    )}
                    {!sunkPreview && (
                      <div style={{ color: isUC ? 'var(--deficit)' : 'var(--text-secondary)', paddingTop: 4 }}>
                        {isUC ? 'Under construction — partial sunk cost applies' : 'Queued — no sunk cost'}
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {isUC
                        ? 'Partial capital, labor, and materials already committed are not recoverable.'
                        : 'No capital committed yet — full budget pool recovery.'}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isUC ? 'var(--text-secondary)' : 'var(--teal)', fontSize: 10, paddingTop: 4 }}>
                      {isUC
                        ? `Partial pool recovery (${((1 - (sunkPreview?.sunk_cost_fraction ?? 0)) * 100).toFixed(0)}% of committed).`
                        : 'Full pool recovery — all allocated capital, labor, and material returned.'}
                    </div>
                    {action?.capex_per_mw != null && magnitude > 0 && (
                      <div style={impRow}>
                        <span style={{ color: 'var(--text-secondary)' }}>Total capex</span>
                        <span>{fmt$(action.capex_per_mw * magnitude)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  storeCancelQueued(assetId);
                  setCancelModal(null);
                }}
                  style={{ flex: 1, padding: '8px 0', background: 'rgba(248, 113, 113, 0.15)', color: 'var(--deficit)', border: '1px solid var(--deficit)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Confirm Cancel
                </button>
                <button onClick={() => setCancelModal(null)}
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer' }}>
                  Keep
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
