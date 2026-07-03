import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { useTerraStore } from '../../state/store.js';
import type { ActionRecord, CrosswalkRow, CountyFiscal } from '../../engine/types.js';
import { Tooltip } from './Tooltip.js';
import { computeConsumption, getBudgetShareString, isEraOverflow, getEraForYear } from '../../engine/budgets.js';
import { computeFiscalDelta } from '../../engine/engine.js';
import { JOBS_PER_MW, HOUSING_PRESSURE_THRESHOLD } from '../panels/CountyYields.js';

const ERA_NAMES: Record<number, string> = {
  2025: 'Foundation Era (2025–2035)',
  2035: 'Transition Era (2035–2045)',
  2045: 'Buildout Era (2045–2055)',
  2055: 'Steady State Era (2055–2075)',
};

// Maps overflow resource string → HUD chip key
const RESOURCE_TO_CHIP: Record<string, string> = {
  capital: 'capital',
  labor: 'labor',
  steel: 'steel',
  concrete: 'concrete',
  HALEU: 'HALEU',
  'transmission ROW': 'tx_row',
};

const ELIGIBLE_FILL = 'placement-eligible-fill';
const ELIGIBLE_BORDER = 'placement-eligible-border';
const INELIGIBLE_FILL = 'placement-ineligible-fill';
const GHOST_FILL = 'placement-ghost-fill';

// EPA Level III ecoregion code → human-readable name (codes present in study area)
const ECOREGION_NAMES: Record<number, string> = {
  12: 'Snake River Plain',
  13: 'Central Basin and Range',
  14: 'Mojave Basin and Range',
  15: 'Northern Rockies',
  16: 'Idaho Batholith',
  17: 'Middle Rockies',
  18: 'Wyoming Basin',
  19: 'Wasatch and Uinta Mountains',
  20: 'Colorado Plateaus',
  21: 'Southern Rockies',
  22: 'Arizona/New Mexico Plateau',
  23: 'Arizona/New Mexico Mountains',
  25: 'High Plains',
  26: 'Southwestern Tablelands',
  27: 'Central Great Plains',
  42: 'Northwestern Glaciated Plains',
  43: 'Northwestern Great Plains',
  44: 'Nebraska Sand Hills',
  46: 'Northern Glaciated Plains',
  80: 'Northern Basin and Range',
};

function deriveIneligibleReason(
  geoid: string,
  action: ActionRecord,
  crosswalk: CrosswalkRow[],
): string {
  // 1. County's ecoregion codes where area share > 0.15
  const countyEcoregionCodes = [
    ...new Set(
      crosswalk
        .filter(r => r.geoid === geoid && r.ecoregion_area_share > 0.15)
        .map(r => Number(r.ecoregion_code))
    ),
  ];

  // 2. Check ecoregion mismatch
  const applicable = (action.applicable_ecoregions ?? []).map(Number);
  if (applicable.length > 0) {
    const hasMatch = countyEcoregionCodes.some(code => applicable.includes(code));
    if (!hasMatch) {
      const names = applicable.map(
        (code: number) => ECOREGION_NAMES[code] ?? `Ecoregion ${code}`
      );
      return `Outside ${names.join(', ')}`;
    }
  }

  // 3. BA mismatch for energy_demand actions
  if (action.bucket === 'energy_demand') {
    return 'BA not served by this action type';
  }

  // 4. Fallback
  return 'Not eligible for this action';
}

interface PlacementOverlayProps {
  map: maplibregl.Map;
}

export function PlacementOverlay({ map }: PlacementOverlayProps) {
  const placementMode = useTerraStore(s => s.placementMode);
  const gameYear = useTerraStore(s => s.engineState.year);
  const engineState = useTerraStore(s => s.engineState);
  const exitPlacementMode = useTerraStore(s => s.exitPlacementMode);
  const confirmPlacement = useTerraStore(s => s.confirmPlacement);
  const remainingBudget = useTerraStore(s => s.remainingBudget);
  const setHudOpenChip = useTerraStore(s => s.setHudOpenChip);

  const [showModal, setShowModal] = useState<{ geoid: string } | null>(null);
  const [modalMagnitude, setModalMagnitude] = useState(100);
  const [ineligibleHover, setIneligibleHover] = useState<{
    x: number; y: number; geoid: string;
  } | null>(null);

  const initialized = useRef(false);
  const ghostRef = useRef<string | null>(null);

  // Counters tracked via ref to avoid stale closures in map event handlers
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;

  useEffect(() => {
    if (initialized.current || !map.getSource('counties')) return;
    initialized.current = true;

    map.addLayer({
      id: INELIGIBLE_FILL,
      type: 'fill',
      source: 'counties',
      paint: {
        'fill-color': '#0d1117',
        'fill-opacity': 0.6,
      },
    });

    map.addLayer({
      id: ELIGIBLE_FILL,
      type: 'fill',
      source: 'counties',
      paint: {
        'fill-color': '#2dd4bf',
        'fill-opacity': 0.2,
      },
      filter: ['==', ['get', 'GEOID'], ''],
    });

    map.addLayer({
      id: ELIGIBLE_BORDER,
      type: 'line',
      source: 'counties',
      paint: {
        'line-color': '#2dd4bf',
        'line-width': 1.5,
      },
      filter: ['==', ['get', 'GEOID'], ''],
    });

    map.addLayer({
      id: GHOST_FILL,
      type: 'fill',
      source: 'counties',
      paint: {
        'fill-color': '#2dd4bf',
        'fill-opacity': 0.4,
        'fill-outline-color': '#2dd4bf',
      },
      filter: ['==', ['get', 'GEOID'], ''],
    });

    return () => {
      [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      initialized.current = false;
    };
  }, [map]);

  // Ineligible county hover — always active during placement, no placementMode dependency
  useEffect(() => {
    const handleIneligibleMove = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const pm = placementModeRef.current;
      if (!pm || !e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (pm.eligibleGeoids.has(geoid)) return; // eligible — handled by ELIGIBLE_FILL handler
      setIneligibleHover({ x: e.point.x, y: e.point.y, geoid });
    };

    const handleIneligibleLeave = () => setIneligibleHover(null);

    map.on('mousemove', INELIGIBLE_FILL, handleIneligibleMove);
    map.on('mouseleave', INELIGIBLE_FILL, handleIneligibleLeave);

    return () => {
      map.off('mousemove', INELIGIBLE_FILL, handleIneligibleMove);
      map.off('mouseleave', INELIGIBLE_FILL, handleIneligibleLeave);
    };
  }, [map]);

  // Update filters and eligible event handlers when placementMode changes
  useEffect(() => {
    setIneligibleHover(null);

    if (!placementMode) {
      [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      return;
    }

    const eligible = Array.from(placementMode.eligibleGeoids);
    setModalMagnitude(placementMode.magnitude);

    [GHOST_FILL, ELIGIBLE_BORDER, ELIGIBLE_FILL, INELIGIBLE_FILL].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    });

    const eligibleFilter: maplibregl.FilterSpecification =
      eligible.length > 0
        ? ['in', ['get', 'GEOID'], ['literal', eligible]]
        : ['==', ['get', 'GEOID'], ''];

    const ineligibleFilter: maplibregl.FilterSpecification =
      eligible.length > 0
        ? ['!', ['in', ['get', 'GEOID'], ['literal', eligible]]]
        : ['!=', ['get', 'GEOID'], ''];

    if (map.getLayer(ELIGIBLE_FILL)) map.setFilter(ELIGIBLE_FILL, eligibleFilter);
    if (map.getLayer(ELIGIBLE_BORDER)) map.setFilter(ELIGIBLE_BORDER, eligibleFilter);
    if (map.getLayer(INELIGIBLE_FILL)) map.setFilter(INELIGIBLE_FILL, ineligibleFilter);

    const handleClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (!placementMode.eligibleGeoids.has(geoid)) return;
      setShowModal({ geoid });
    };

    const handleEligibleHover = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (!e.features?.length) return;
      const geoid = String(e.features[0].properties?.GEOID ?? '');
      if (!placementMode.eligibleGeoids.has(geoid)) {
        ghostRef.current = null;
        if (map.getLayer(GHOST_FILL)) {
          map.setFilter(GHOST_FILL, ['==', ['get', 'GEOID'], '']);
        }
        return;
      }
      setIneligibleHover(null); // clear ineligible tooltip when over eligible county
      if (ghostRef.current !== geoid) {
        ghostRef.current = geoid;
        if (map.getLayer(GHOST_FILL)) {
          map.setFilter(GHOST_FILL, ['==', ['get', 'GEOID'], geoid]);
        }
      }
    };

    map.on('click', ELIGIBLE_FILL, handleClick);
    map.on('mousemove', ELIGIBLE_FILL, handleEligibleHover);

    return () => {
      map.off('click', ELIGIBLE_FILL, handleClick);
      map.off('mousemove', ELIGIBLE_FILL, handleEligibleHover);
    };
  }, [map, placementMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive reason for currently-hovered ineligible county
  const ineligibleReason =
    ineligibleHover && placementMode
      ? deriveIneligibleReason(
          ineligibleHover.geoid,
          placementMode.action,
          engineState.crosswalk,
        )
      : null;

  const countyCards = engineState.county_cards as Record<string, { county_name?: string; state?: string }>;

  return (
    <>
      {/* Ineligible county reason tooltip */}
      {ineligibleHover && ineligibleReason && (
        <Tooltip
          x={ineligibleHover.x}
          y={ineligibleHover.y}
          geoid={ineligibleHover.geoid}
          engineState={engineState}
          activeMetric="E"
          countyCards={countyCards}
          reason={ineligibleReason}
        />
      )}

      {/* Placement modal */}
      {placementMode && showModal && (() => {
        const { action } = placementMode;
        const unitScale = action.unit_scale ?? 100;
        const unitLabel = action.unit_label ?? 'units';
        const ttd = action.time_to_deploy ?? 2;
        const consumption = computeConsumption(action, modalMagnitude);
        const budgetStrings = getBudgetShareString(consumption, remainingBudget);
        const overflow = isEraOverflow(consumption, remainingBudget);
        const currentEra = getEraForYear(gameYear);
        const currentEraName = ERA_NAMES[currentEra.era_start] ?? `Era ${currentEra.era_start}–${currentEra.era_end}`;
        const nextEraStart = currentEra.era_end; // first year of the next era

        // Binding constraint: pool with largest overage as % of remaining
        const bindingResource = overflow.resources.reduce((worst, res) => {
          const budgetMap: Record<string, { c: number; r: number }> = {
            capital: { c: consumption.capital_cost_usd, r: remainingBudget.capital_cost_usd },
            labor: { c: consumption.labor_years, r: remainingBudget.labor_years },
            steel: { c: consumption.steel_tons, r: remainingBudget.steel_tons },
            concrete: { c: consumption.concrete_tons, r: remainingBudget.concrete_tons },
            HALEU: { c: consumption.HALEU_kg, r: remainingBudget.HALEU_kg },
            'transmission ROW': { c: consumption.transmission_row_miles, r: remainingBudget.transmission_row_miles },
          };
          const cur = budgetMap[res];
          const curPct = cur ? (cur.c - cur.r) / Math.max(cur.r, 1) : 0;
          if (!worst) return { res, pct: curPct };
          const prev = budgetMap[worst.res];
          const prevPct = prev ? (prev.c - prev.r) / Math.max(prev.r, 1) : 0;
          return curPct > prevPct ? { res, pct: curPct } : worst;
        }, null as { res: string; pct: number } | null);

        return (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(13, 17, 23, 0.6)',
              zIndex: 100,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowModal(null); }}
          >
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              width: 340,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {action.bucket ?? action.category}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>
                  {action.action_name ?? action.label ?? action.action_id}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  County: {showModal.geoid}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  MAGNITUDE
                </label>
                <input
                  type="range"
                  min={unitScale / 10}
                  max={unitScale * 5}
                  step={unitScale / 10}
                  value={modalMagnitude}
                  onChange={(e) => setModalMagnitude(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--teal)' }}
                />
                <div style={{ fontSize: 13, color: 'var(--teal)', marginTop: 4 }}>
                  {modalMagnitude.toFixed(0)} {unitLabel} — Deploy time: {ttd} yr
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Operational: {gameYear + ttd}
                </div>
              </div>

              {/* Budget consumption */}
              {budgetStrings.length > 0 && (
                <div style={{ marginBottom: 16, fontSize: 11 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>ERA RESOURCE USAGE</div>
                  {budgetStrings.map((s, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)', padding: '1px 0' }}>{s}</div>
                  ))}
                </div>
              )}

              {/* Impact preview card */}
              {(() => {
                const geoid = showModal.geoid;
                const card = engineState.county_cards[geoid] as {
                  county_name?: string; state?: string; employment?: number;
                } | undefined;
                const isWY = card?.state === 'WY';
                const geoidPadded = geoid.padStart(5, '0');
                const cf = isWY ? (engineState.county_fiscal[geoidPadded] as CountyFiscal | undefined) : undefined;

                const rates = JOBS_PER_MW[action.action_id ?? ''];
                const constructionJobs = rates ? rates.c * modalMagnitude : 0;
                const operationsJobs   = rates ? rates.o * modalMagnitude : 0;
                const laborForce       = card?.employment ?? 0;
                const jobsPctLF        = laborForce > 0 ? constructionJobs / laborForce : 0;
                const housingFlag      = jobsPctLF >= HOUSING_PRESSURE_THRESHOLD;

                const fiscalDelta = cf ? computeFiscalDelta(engineState, action.action_id ?? '', geoid, modalMagnitude) : null;
                const propTaxDelta = fiscalDelta?.property_tax_delta ?? null;
                const ledgerCDelta = fiscalDelta?.ledger_c_delta ?? null;
                const ledgerADelta = fiscalDelta?.ledger_a_delta ?? null;
                const netFiscalDelta = fiscalDelta
                  ? fiscalDelta.property_tax_delta + fiscalDelta.sales_use_delta +
                    fiscalDelta.ledger_a_delta + fiscalDelta.ledger_b_delta + fiscalDelta.ledger_c_delta
                  : null;

                const showFiscal = isWY && (netFiscalDelta != null && netFiscalDelta !== 0);
                const hasFirmMw  = (action.bucket ?? action.category) === 'energy_generation';

                const era = getEraForYear(gameYear);
                const eraPoolShares: { label: string; pct: number }[] = [];
                if (consumption.capital_cost_usd > 0) {
                  const pct = era.capital_cost_usd > 0 ? consumption.capital_cost_usd / era.capital_cost_usd : 0;
                  eraPoolShares.push({ label: 'Capital', pct });
                }
                if (consumption.labor_years > 0) {
                  const pct = era.labor_years > 0 ? consumption.labor_years / era.labor_years : 0;
                  eraPoolShares.push({ label: 'Labor', pct });
                }

                const fmt$ = (v: number) => {
                  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
                  const abs = Math.abs(v);
                  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
                  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
                  return `${sign}$${Math.round(abs)}`;
                };

                if (constructionJobs === 0 && !showFiscal) return null;

                const cellLabel: React.CSSProperties = {
                  fontSize: 10, color: 'var(--text-muted)', marginBottom: 2,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                };
                const row: React.CSSProperties = {
                  display: 'flex', justifyContent: 'space-between',
                  padding: '2px 0', borderTop: '1px solid var(--border)', fontSize: 11,
                };

                return (
                  <div style={{
                    marginBottom: 16,
                    padding: '10px 12px',
                    background: 'rgba(45, 212, 191, 0.05)',
                    border: '1px solid var(--teal-dim)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={cellLabel}>This county</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={cellLabel}>Era budget share</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                      {/* This county column */}
                      <div style={{ flex: 1 }}>
                        {constructionJobs > 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Construction jobs
                              {housingFlag && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>⚠</span>}
                            </span>
                            <span style={{ color: housingFlag ? 'var(--amber)' : 'var(--construction)' }}>
                              {Math.round(constructionJobs)}
                              {laborForce > 0 && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                                  ({(jobsPctLF * 100).toFixed(1)}% LF)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {operationsJobs > 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Ops jobs at comm.</span>
                            <span style={{ color: 'var(--teal)' }}>{Math.round(operationsJobs)} FTE</span>
                          </div>
                        )}
                        {hasFirmMw && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Firm capacity</span>
                            <span style={{ color: 'var(--teal)' }}>+{modalMagnitude.toFixed(0)} MW</span>
                          </div>
                        )}
                        {showFiscal && netFiscalDelta != null && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>Δ revenue/yr</span>
                            <span style={{ color: netFiscalDelta >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>
                              {fmt$(netFiscalDelta)}
                            </span>
                          </div>
                        )}
                        {showFiscal && propTaxDelta != null && propTaxDelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ Property tax Δ</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{fmt$(propTaxDelta)}</span>
                          </div>
                        )}
                        {showFiscal && ledgerADelta != null && ledgerADelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ Ad valorem Δ (A)</span>
                            <span style={{ color: ledgerADelta >= 0 ? 'var(--teal)' : 'var(--deficit)' }}>{fmt$(ledgerADelta)}</span>
                          </div>
                        )}
                        {showFiscal && ledgerCDelta != null && ledgerCDelta !== 0 && (
                          <div style={row}>
                            <span style={{ color: 'var(--text-muted)' }}>  ↳ School finance Δ (C)</span>
                            <span style={{
                              color: ledgerCDelta >= 0 ? 'var(--teal)' : 'var(--deficit)',
                              fontWeight: 500,
                            }}>
                              {fmt$(ledgerCDelta)}
                            </span>
                          </div>
                        )}
                        {showFiscal && ledgerCDelta != null && ledgerCDelta !== 0 && ledgerADelta != null && (
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                            Ledger C can diverge from A in sign — see methods.
                          </div>
                        )}
                      </div>

                      {/* Era budget column */}
                      <div style={{ flex: 1 }}>
                        {eraPoolShares.map(p => (
                          <div key={p.label} style={row}>
                            <span style={{ color: 'var(--text-secondary)' }}>{p.label}</span>
                            <span style={{ color: p.pct > 0.2 ? 'var(--warning)' : 'var(--text-primary)' }}>
                              {(p.pct * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                        {eraPoolShares.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>No era budget impact</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Overflow banner */}
              {overflow.overflows && bindingResource && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '8px 10px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid var(--amber)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  <div style={{ color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>
                    {bindingResource.res.charAt(0).toUpperCase() + bindingResource.res.slice(1)} pool exhausted
                    for {currentEraName}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    This build is scheduled to begin {nextEraStart}.
                    {overflow.resources.length > 1 && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                        Also constrained: {overflow.resources.filter(r => r !== bindingResource.res).join(', ')}.
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const chipKey = RESOURCE_TO_CHIP[bindingResource.res] ?? bindingResource.res;
                      setHudOpenChip(chipKey);
                    }}
                    style={{
                      marginTop: 6,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--amber)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    View {bindingResource.res} pool breakdown ↑
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  onClick={() => {
                    confirmPlacement(showModal.geoid, modalMagnitude);
                    setShowModal(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'var(--teal-dim)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => { setShowModal(null); exitPlacementMode(); }}
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
