import { useState } from 'react';
import { useTerraStore } from '../../state/store.js';
import type { EngineState, ProductionAsset } from '../../engine/types.js';
import { getExistingAssets, previewProductionReduction } from '../../engine/engine.js';
import { CountyYields } from './CountyYields.js';

// ── Production Reduction Modal ─────────────────────────────────────────────

interface ReductionModalState {
  assetName: string;
  commodity: string;
  maxVolume: number;
  deltaVolume: number;
}

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
          cursor: 'pointer',
          fontSize: 9,
          color: confidence === 'low' ? 'var(--amber)' : 'var(--text-muted)',
          border: `1px solid ${confidence === 'low' ? 'var(--amber)' : 'var(--text-muted)'}`,
          borderRadius: '50%',
          width: 13,
          height: 13,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          verticalAlign: 'middle',
        }}
      >
        i
      </span>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            right: 0,
            top: 18,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 10,
            width: 220,
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {confidence === 'low' && (
            <div style={{ color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>
              Low confidence estimate
            </div>
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

interface FlagshipAsset {
  name: string;
  type?: string;
  status?: string;
  capacity_or_load_mw?: number | null;
  operational_year?: number | null;
  source_url?: string | null;
  notes?: string;
}

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
  flagship_assets?: FlagshipAsset[];
}

function StatusDot({ status }: { status?: string }) {
  if (!status) return <span style={{ color: 'var(--text-muted)' }}>●</span>;

  if (status === 'operating') {
    return <span style={{ color: 'var(--surplus)' }}>●</span>;
  }
  if (status.includes('construction') || status.includes('under_construction')) {
    return (
      <span style={{ color: 'var(--construction)', animation: 'pulse 1.5s infinite' }}>●</span>
    );
  }
  if (status.includes('announced') || status.includes('approved')) {
    return <span style={{ color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: '50%', fontSize: 8, padding: '1px 3px' }}>○</span>;
  }
  return <span style={{ color: 'var(--text-muted)' }}>○</span>;
}

function formatStatus(status?: string): string {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function FuelBar({ fuelMix }: { fuelMix: Record<string, number> }) {
  const entries = Object.entries(fuelMix).filter(([, v]) => v > 0);
  if (!entries.length) return <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No generation data</div>;

  const FUEL_COLORS: Record<string, string> = {
    SUB: '#92400e', BIT: '#92400e', LIG: '#92400e',
    NG: '#6d28d9', GAS: '#6d28d9',
    NUC: '#2dd4bf', nuclear: '#2dd4bf',
    WND: '#34d399', wind: '#34d399',
    SUN: '#f59e0b', solar: '#f59e0b',
    WAT: '#3b82f6', hydro: '#3b82f6',
  };

  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      {entries.map(([fuel, share]) => (
        <div
          key={fuel}
          title={`${fuel}: ${(share * 100).toFixed(0)}%`}
          style={{
            flex: share,
            background: FUEL_COLORS[fuel] ?? '#484f58',
          }}
        />
      ))}
    </div>
  );
}

export function CountyCardDrawer() {
  const selectedGeoid = useTerraStore(s => s.selectedGeoid);
  const setSelectedGeoid = useTerraStore(s => s.setSelectedGeoid);
  const enterPlacementMode = useTerraStore(s => s.enterPlacementMode);
  const storeReduceProductionAsset = useTerraStore(s => s.reduceProductionAsset);
  const engineState = useTerraStore(s => s.engineState) as EngineState;

  const [reductionModal, setReductionModal] = useState<ReductionModalState | null>(null);

  if (!selectedGeoid) return null;

  const ees = engineState.county_ees[selectedGeoid];
  const card = engineState.county_cards[selectedGeoid] as CountyCardData | undefined;
  if (!ees || !card) return null;

  const primaryBusRow = engineState.crosswalk.find(r => r.geoid === selectedGeoid && r.primary_bus);
  const busId = primaryBusRow ? String(primaryBusRow.bus_id) : null;
  const busState = busId ? engineState.bus_state[busId] : null;

  const queuedBuilds = engineState.build_queue.filter(b => b.geoid === selectedGeoid);
  const activeCouplings = engineState.active_couplings.filter(
    c => c.demand_geoid === selectedGeoid || c.supply_geoid === selectedGeoid
  );

  const SUGGESTED_ACTIONS = ['smr_advanced', 'pumped_hydro', 'geothermal_utility', 'battery_grid', 'transmission_230kv'];

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

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 39,
        }}
        onClick={() => setSelectedGeoid(null)}
      />

      {/* Drawer */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        zIndex: 40,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {ees.county_name || card.county_name || selectedGeoid}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              {card.state} · GEOID {selectedGeoid}
            </div>
          </div>
          <button
            onClick={() => setSelectedGeoid(null)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Yields strip */}
        <CountyYields />

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
              {card.water_withdrawals_mgd != null
                ? `${card.water_withdrawals_mgd.toFixed(1)} MGD`
                : '—'}
              {card.water_vintage && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 10 }}>
                  ({card.water_vintage} data)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Section 3: Flagship Assets */}
        {(() => {
          const liveAssets = getExistingAssets(engineState, selectedGeoid);
          const productionAssets = liveAssets.filter(
            a => a.asset_kind === 'production_asset',
          ) as ProductionAsset[];
          const cardAssets = card.flagship_assets ?? [];

          if (cardAssets.length === 0 && productionAssets.length === 0) return null;

          return (
            <div style={sectionStyle}>
              <div style={labelStyle}>Flagship Assets</div>
              {cardAssets.map((asset, i) => {
                // Check if this card asset is represented as a live production_asset
                const livePa = productionAssets.find(pa => pa.name === asset.name);
                const isLast = i === cardAssets.length - 1;

                return (
                  <div key={i} style={{
                    padding: '8px 0',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <StatusDot status={asset.status} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{asset.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 16 }}>
                      {formatStatus(asset.status)}
                      {asset.operational_year && ` · Est. ${asset.operational_year}`}
                      {asset.capacity_or_load_mw != null && ` · ${asset.capacity_or_load_mw} MW`}
                    </div>
                    {asset.source_url && (
                      <div style={{ paddingLeft: 16, marginTop: 2 }}>
                        <a
                          href={asset.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--teal-dim)', fontSize: 10 }}
                        >
                          ↗ Source
                        </a>
                      </div>
                    )}

                    {/* Reduce output control — production_asset only */}
                    {livePa && (
                      <div style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid var(--border)',
                        paddingLeft: 0,
                      }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                          CURRENT OUTPUT
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>
                          {fmtVol(livePa.production_volume, livePa.production_unit)}
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                            ({livePa.production_confidence} confidence)
                          </span>
                        </div>
                        <button
                          onClick={() => setReductionModal({
                            assetName: livePa.name,
                            commodity: livePa.commodity,
                            maxVolume: livePa.production_volume,
                            deltaVolume: STEP_SIZE[livePa.production_unit] ?? 1_000_000,
                          })}
                          disabled={livePa.production_volume <= 0}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: '1px solid var(--deficit)',
                            borderRadius: 3,
                            color: 'var(--deficit)',
                            fontSize: 10,
                            cursor: livePa.production_volume > 0 ? 'pointer' : 'not-allowed',
                            fontFamily: 'var(--font-mono)',
                            opacity: livePa.production_volume > 0 ? 1 : 0.5,
                          }}
                        >
                          ↓ Reduce output
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Section 4: Live State */}
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
              marginTop: 10,
              padding: '8px 10px',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid var(--deficit)',
              borderRadius: 4,
            }}>
              <div style={{ color: 'var(--deficit)', fontSize: 13, fontWeight: 500 }}>
                ⚡ {ees.deficit_mw.toFixed(1)} MW firm supply gap
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                Suggested:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {SUGGESTED_ACTIONS.map(id => {
                  const action = engineState.action_library.actions[id];
                  if (!action) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSelectedGeoid(null); enterPlacementMode(id); }}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        border: '1px solid var(--teal-dim)',
                        borderRadius: 3,
                        color: 'var(--teal)',
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

          {activeCouplings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Active Couplings</div>
              {activeCouplings.map(c => (
                <div key={c.coupling_id} style={{
                  fontSize: 11,
                  color: 'var(--teal)',
                  padding: '3px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>{c.coupling_type} · {c.coupling_id}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{c.reasoning}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Build Queue */}
        {queuedBuilds.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Build Queue</div>
            {queuedBuilds.map((item, i) => {
              const action = engineState.action_library.actions[item.action_id];
              return (
                <div key={i} style={{
                  padding: '6px 0',
                  borderBottom: i < queuedBuilds.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {action?.action_name ?? item.action_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {item.magnitude} {action?.unit_label ?? ''} · {item.decision_year} → {item.operational_year}
                    {!item.commissioned && (
                      <span style={{ color: 'var(--construction)', marginLeft: 6 }}>
                        🏗 {item.operational_year - engineState.year}yr
                      </span>
                    )}
                    {item.commissioned && (
                      <span style={{ color: 'var(--surplus)', marginLeft: 6 }}>✓ Active</span>
                    )}
                  </div>
                  {item.throttle_reason && (
                    <div style={{ color: 'var(--amber)', fontSize: 10, marginTop: 2 }}>
                      ⏳ Throttled: {item.throttle_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Production Reduction Modal */}
      {reductionModal && (() => {
        const liveAssets = getExistingAssets(engineState, selectedGeoid);
        const pa = liveAssets.find(
          a => a.asset_kind === 'production_asset' && (a as ProductionAsset).commodity === reductionModal.commodity,
        ) as ProductionAsset | undefined;

        if (!pa) return null;

        const preview = previewProductionReduction(
          engineState, selectedGeoid, reductionModal.commodity, reductionModal.deltaVolume,
        );
        const unitLabel = UNIT_LABELS[pa.production_unit] ?? pa.production_unit;
        const step = STEP_SIZE[pa.production_unit] ?? 1_000_000;

        const cellLabel: React.CSSProperties = {
          fontSize: 10, color: 'var(--text-muted)', marginBottom: 4,
          textTransform: 'uppercase', letterSpacing: 0.5,
        };
        const row: React.CSSProperties = {
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', borderTop: '1px solid var(--border)', fontSize: 11,
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(13, 17, 23, 0.7)',
              zIndex: 200,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setReductionModal(null); }}
          >
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              width: 360,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}>
              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--deficit)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Reduce Output
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>
                  {reductionModal.assetName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                  County: {engineState.county_ees[selectedGeoid.padStart(5,'0')]?.county_name ?? selectedGeoid}
                </div>
              </div>

              {/* Stepper */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  REDUCTION VOLUME
                </label>
                <input
                  type="range"
                  min={step}
                  max={pa.production_volume}
                  step={step}
                  value={reductionModal.deltaVolume}
                  onChange={(e) => setReductionModal({
                    ...reductionModal,
                    deltaVolume: Number(e.target.value),
                  })}
                  style={{ width: '100%', accentColor: 'var(--deficit)' }}
                />
                <div style={{ fontSize: 13, color: 'var(--deficit)', marginTop: 4 }}>
                  −{fmtVol(reductionModal.deltaVolume, pa.production_unit)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Remaining: {preview ? fmtVol(preview.new_volume, pa.production_unit) : '—'}
                </div>
              </div>

              {/* Impact preview card — two column */}
              {preview && (
                <div style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  background: 'rgba(248, 113, 113, 0.05)',
                  border: '1px solid var(--deficit)',
                  borderRadius: 4,
                  fontSize: 11,
                }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={cellLabel}>This county</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={cellLabel}>This era's budgets</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* County column */}
                    <div style={{ flex: 1 }}>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ Ad valorem (A)</span>
                        <span style={{ color: preview.ledger_a_delta < 0 ? 'var(--deficit)' : 'var(--teal)', fontWeight: 500 }}>
                          {fmt$(preview.ledger_a_delta)}
                        </span>
                      </div>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ Severance (B)</span>
                        <span style={{ color: preview.ledger_b_delta < 0 ? 'var(--deficit)' : 'var(--teal)', fontWeight: 500 }}>
                          {fmt$(preview.ledger_b_delta)}
                        </span>
                      </div>
                      <div style={row}>
                        <span style={{ color: 'var(--text-secondary)' }}>Δ School fin. (C)</span>
                        <span style={{ color: preview.ledger_c_delta > 0 ? 'var(--teal)' : 'var(--deficit)', fontWeight: 500 }}>
                          {fmt$(preview.ledger_c_delta)}
                        </span>
                      </div>
                      <div style={{
                        ...row,
                        paddingTop: 6,
                        fontWeight: 500,
                        borderTop: '1px solid var(--border)',
                      }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Net Δ revenue</span>
                        <span style={{ color: (preview.ledger_a_delta + preview.ledger_b_delta + preview.ledger_c_delta) >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>
                          {fmt$(preview.ledger_a_delta + preview.ledger_b_delta + preview.ledger_c_delta)}
                        </span>
                      </div>
                      {preview.ledger_c_delta > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--teal)', marginTop: 4, lineHeight: 1.4 }}>
                          ↑ Ledger C rises — recapture burden shrinks as mineral AV falls.
                        </div>
                      )}
                    </div>

                    {/* Era budget column */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, paddingTop: 4 }}>
                        No era budget consumed.
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
                        Reductions are not capital builds — they draw no capital, labor, or material pools.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    storeReduceProductionAsset(selectedGeoid, reductionModal.commodity, reductionModal.deltaVolume);
                    setReductionModal(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'rgba(248, 113, 113, 0.15)',
                    color: 'var(--deficit)',
                    border: '1px solid var(--deficit)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Confirm Reduction
                </button>
                <button
                  onClick={() => setReductionModal(null)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
