"""
terra_engine.py — TERRA Engine v3.0
County-keyed state with build queue, coupling evaluation, supply-chain throttling,
and county fiscal layer (ad valorem / severance / school finance three-ledger model).
Phase W5 adds an existing_assets inventory layer seeded from county_cards flagship_assets.
Phase X2 adds the production_asset entry type (volume-keyed, not MW-keyed) and
reduce_production_asset() with full three-ledger support (A=advalorem, B=severance,
C=school-finance recapture sensitivity).
v3.0 adds unified asset_registry (source of truth); build_queue and existing_assets
become materialized views. Retirement transition family for EIA-860 scheduled retirements.

Public API
----------
initialize_state(data_dir=None, ..., baseline_retirements=None) -> state dict
apply_action(state, action_id, geoid, magnitude) -> (state, delta_summary)
queue_action(state, action_id, geoid, magnitude, decision_year) -> state
advance_year(state) -> state
inject_disturbance(state, disturbance_type, severity, geoids) -> (state, delta_summary)
compute_ees_summary(state) -> dict
get_material_ledger(state) -> dict
get_pathway_conditions(state, scenario_profile=None) -> dict
get_county_card(state, geoid) -> dict
get_county_fiscal(state, geoid) -> dict
recompute_network(state) -> (state, dict)
state_digest(state) -> dict
fiscal_digest(state) -> dict
get_existing_assets(state, geoid) -> list
existing_assets_digest(state) -> dict
reduce_production_asset(state, geoid, commodity, delta_volume, year=None) -> (state, delta_summary)
schedule_retirement(state, asset_id, year) -> state
accelerate_retirement(state, asset_id, new_year) -> state
delay_retirement(state, asset_id, new_year) -> (state, {'delay_cost_hook': 0})
cancel_queued(state, asset_id) -> (state, {'sunk_cost_fraction': 0})

Engine version: 3.0
"""

import copy
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "processed"

# ── Mountain West study area constants ────────────────────────────────────────
MOUNTAIN_WEST_BAS = frozenset({
    'PSCO', 'WACM', 'PNM', 'WAUW', 'NWMT', 'BPAT',
    'PACE', 'IPCO', 'NEVP', 'AZPS', 'SRP', 'EPE'
})

STUDY_ECOREGION_CODES = frozenset({'21', '17', '25', '43', '80', '20', '18'})

# ── Fuel type normalization ────────────────────────────────────────────────────
FUEL_TYPE_MAP = {
    'natural gas': 'gas', 'other gas': 'gas', 'gaseous propane': 'gas',
    'coal-derived synthesis gas': 'gas', 'water': 'hydro', 'wind': 'wind',
    'solar': 'solar', 'subbituminous coal': 'coal', 'bituminous coal': 'coal',
    'petroleum coke': 'coal', 'lignite': 'coal', 'refined coal': 'coal',
    'waste coal': 'coal', 'disillate fuel oil': 'oil', 'residual fuel oil': 'oil',
    'kerosene': 'oil', 'waste oil': 'oil', 'jet fuel': 'oil', 'nuclear': 'nuclear',
    'geothermal': 'geothermal', 'black liquor': 'biomass',
    'wood waste solids': 'biomass', 'wood waste liquids': 'biomass',
    'agriculture byproducts': 'biomass', 'other biomass gases': 'biomass',
    'other biomass liquids': 'biomass', 'municipal solid waste (all)': 'biomass',
    'landfill gas': 'biomass', 'blast-furnace gas': 'biomass',
    'electricity used for energy storage': 'storage', 'purchased steam': 'steam',
    'waste heat': 'waste_heat', 'other': 'other',
}

# ── Disturbance fallback coefficients ─────────────────────────────────────────
DISTURBANCE_COEFFICIENTS = {
    "heat_wave": {
        "E_per_severity": -0.05,
        "Ec_per_severity": -0.03,
        "S_per_severity": -0.08,
        "load_spike_fraction": 0.08,
    },
    "drought": {
        "E_per_year": -0.15, "Ec_per_year": -0.10, "S_per_year": -0.05,
        "hydro_reduction_per_year": 0.15, "max_hydro_reduction": 0.80,
    },
    "mine_closure": {
        "Ec_immediate": -0.25, "S_immediate": -0.15, "E_recovery_per_500mw": 0.10,
    },
    "transmission_failure": {
        "Ec_per_week": -0.05, "S_per_week": -0.10,
    },
}

# Firm fuel types for supply gap calculations
FIRM_FUEL_TYPES = frozenset({'nuclear', 'gas', 'coal', 'hydro', 'geothermal', 'storage'})

PRB_COAL_TONS_PER_MW_YR = 3743.4  # EIA Form 923 × PRB HHV × 0.70 CF (W2 proxy)

# ── EIA-7A / MSHA production data (X2 production_asset seeds) ─────────────────
# Source: EIA Annual Coal Report Table 2, 2024 (MSHA Form 7000-2; released Nov 2025)
EIA_7A_CAMPBELL_COAL_2024 = 170_045_000.0   # short tons/yr (surface, 11 mines)
EIA_7A_WY_COAL_2024       = 190_731_000.0   # short tons/yr WY state total
# W2 proxy comparison: 0.70606 × 233M = ~164.5M tons → EIA actual +3.4% higher
# Proxy errors cancel: county share 70.6% vs actual 89.2% offsets 2023 vs 2024 statewide

# Static production_asset data keyed by (geoid, name).
# Only entries with confirmed EIA-7A / MSHA figures are listed here.
# Sweetwater, Sublette, Fremont entries deferred pending MANUAL_FETCH Item 1 (DOR Mineral Valuation).
_PRODUCTION_ASSET_DATA = {
    ('56005', 'Powder River Basin Coal Mines'): {
        'commodity': 'coal_surface',
        'production_volume': EIA_7A_CAMPBELL_COAL_2024,
        'production_unit': 'tons_yr',
        'production_confidence': 'high',
        'production_source': (
            'EIA Annual Coal Report Table 2 (2024); MSHA Form 7000-2; EIA release Nov 2025'
        ),
        'data_year': 2024,
        # Per-ton severance rate from W2 ($132.4M statewide / 233M tons, 2023)
        'effective_severance_rate_per_unit': 0.5683,
        # County distribution share: EIA 2024 county/state coal ratio (replaces W2's 0.70606 proxy)
        'county_distribution_share': round(EIA_7A_CAMPBELL_COAL_2024 / EIA_7A_WY_COAL_2024, 8),
        # Ad valorem: (assessed_mineral × 0.90 coal fraction × 62.836 mills) / production_volume
        # = ($3,797,719,892 × 0.90 × 0.062836) / 170,045,000 = $1.263020/ton (confidence: low)
        # Uses W2's 90% coal-fraction proxy for Campbell — exact split pending MANUAL_FETCH Item 1.
        'advalorem_rate_per_unit': 1.263020,
        # Mineral AV change per ton: -(assessed_mineral × 0.90) / production_volume
        # = -($3,797,719,892 × 0.90) / 170,045,000 = -$20.100255/ton
        # Used for Ledger C school-finance recapture sensitivity.
        'assessed_delta_per_unit': -20.100255,
    },
}

_ASSET_TYPE_TO_FISCAL_ACTION = {
    'coal': 'coal_to_solar',
    'nuclear': 'smr_advanced',
    'data_center': 'data_center_hyperscale',  # default; overridden for campus-phase
}


# ═══════════════════════════════════════════════════════════════════════════════
# PART 1 HELPERS — Pure-Python geometry and data loading
# ═══════════════════════════════════════════════════════════════════════════════

def _ray_cast_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        ):
            inside = not inside
        j = i
    return inside


def _point_in_geojson_geom(lon, lat, geometry):
    gtype = geometry['type']
    if gtype == 'Polygon':
        polys = [geometry['coordinates']]
    elif gtype == 'MultiPolygon':
        polys = geometry['coordinates']
    else:
        return False
    for rings in polys:
        exterior = rings[0]
        xs = [c[0] for c in exterior]
        ys = [c[1] for c in exterior]
        if not (min(xs) <= lon <= max(xs) and min(ys) <= lat <= max(ys)):
            continue
        if _ray_cast_ring(lon, lat, exterior):
            in_hole = any(_ray_cast_ring(lon, lat, hole) for hole in rings[1:])
            if not in_hole:
                return True
    return False


def _assign_ecoregion_codes(buses_raw, eco_features):
    eco_by_code = {}
    for feat in eco_features:
        code = feat['properties']['US_L3CODE']
        eco_by_code.setdefault(code, []).append(feat['geometry'])
    assignments = {}
    for feat in buses_raw:
        props = feat['properties']
        bus_id = str(props['bus_id'])
        ba_code = props.get('ba_code', '')
        if ba_code not in MOUNTAIN_WEST_BAS:
            assignments[bus_id] = None
            continue
        coords = feat['geometry']['coordinates']
        lon, lat = float(coords[0]), float(coords[1])
        assigned = None
        for code, geoms in eco_by_code.items():
            for geom in geoms:
                if _point_in_geojson_geom(lon, lat, geom):
                    assigned = code
                    break
            if assigned is not None:
                break
        assignments[bus_id] = assigned
    return assignments


def _normalize_fuel(fuel_type_str):
    return FUEL_TYPE_MAP.get(str(fuel_type_str).lower().strip(), 'other')


def _build_fuel_mix_map(data_dir):
    pa_path = data_dir / "synthetic_plant_assignments.parquet"
    gen_path = data_dir / "generators_with_costs.parquet"
    if not pa_path.exists() or not gen_path.exists():
        return {}, {}
    pa = pd.read_parquet(pa_path)
    gen = pd.read_parquet(gen_path)[['generator_id', 'plant_id', 'fuel_type', 'capacity_mw']]
    merged = pa.merge(gen, on=['generator_id', 'plant_id'], how='left', suffixes=('_pa', '_gen'))
    merged = merged.dropna(subset=['fuel_type', 'capacity_mw_gen'])
    merged['fuel_norm'] = merged['fuel_type'].apply(_normalize_fuel)
    grouped = merged.groupby(['bus_id', 'fuel_norm'])['capacity_mw_gen'].sum().reset_index()
    fuel_mix_map = {}
    gen_mw_by_bus = {}
    for bus_id_int, grp in grouped.groupby('bus_id'):
        bid = str(bus_id_int)
        fuel_mix_map[bid] = {
            row['fuel_norm']: float(row['capacity_mw_gen'])
            for _, row in grp.iterrows()
        }
        gen_mw_by_bus[bid] = float(grp['capacity_mw_gen'].sum())
    return fuel_mix_map, gen_mw_by_bus


def _build_ba_flows(data_dir):
    path = data_dir / "ba_interchange_summary.csv"
    df = pd.read_csv(path)
    ba_flows = {}
    for _, row in df.iterrows():
        mean_mw = float(row['mean_mw'])
        if mean_mw >= 1.0:
            key = f"{str(row['fromba']).upper()}:{str(row['toba']).upper()}"
            ba_flows[key] = mean_mw
    return ba_flows


# ═══════════════════════════════════════════════════════════════════════════════
# PART 2 — Sensitivity Matrix
# ═══════════════════════════════════════════════════════════════════════════════

def _build_sensitivity_matrix(state):
    buses = state["buses"]
    ba_flows = state["ba_flows"]
    mw_bus_ids = sorted(
        [bid for bid, b in buses.items() if b['ba_code'] in MOUNTAIN_WEST_BAS],
        key=lambda x: int(x)
    )
    n = len(mw_bus_ids)
    if n == 0:
        state["last_calibration_mw"] = 0.0
        return np.zeros((0, 0), dtype=float), []

    ba_outflows = {}
    for key, flow in ba_flows.items():
        from_ba, to_ba = key.split(':', 1)
        ba_outflows.setdefault(from_ba, {})[to_ba] = flow

    ba_bus_count = {}
    for bid in mw_bus_ids:
        ba = buses[bid]['ba_code']
        ba_bus_count[ba] = ba_bus_count.get(ba, 0) + 1

    bus_idx_map = {bid: i for i, bid in enumerate(mw_bus_ids)}
    ba_to_col_indices = {}
    for bid in mw_bus_ids:
        ba = buses[bid]['ba_code']
        ba_to_col_indices.setdefault(ba, []).append(bus_idx_map[bid])

    matrix = np.zeros((n, n), dtype=float)
    for i, bus_id_i in enumerate(mw_bus_ids):
        BA_i = buses[bus_id_i]['ba_code']
        matrix[i, i] = 1.0
        outflows = ba_outflows.get(BA_i, {})
        total_outflow = sum(outflows.values())
        if total_outflow == 0:
            continue
        for to_ba, flow_val in outflows.items():
            if to_ba == BA_i:
                continue
            export_share = flow_val / total_outflow
            n_buses_j = ba_bus_count.get(to_ba, 0)
            if n_buses_j == 0:
                continue
            bus_sensitivity = export_share / n_buses_j
            for j in ba_to_col_indices.get(to_ba, []):
                matrix[i, j] = bus_sensitivity

    last_cal_mw = sum(buses[bid].get('generation_mw', 0.0) for bid in mw_bus_ids)
    state["last_calibration_mw"] = max(float(last_cal_mw), 1.0)
    return matrix, mw_bus_ids


# ═══════════════════════════════════════════════════════════════════════════════
# CROSSWALK AND RESOLUTION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _resolve_geoid_to_bus(state, geoid):
    """Resolve a county GEOID to its primary bus_id via the crosswalk."""
    xw = state.get("crosswalk")
    if xw is None:
        return None
    rows = xw[(xw['geoid'] == geoid) & (xw['primary_bus'] == True)]
    if len(rows) == 0:
        return None
    return str(rows.iloc[0]['bus_id'])


def _get_bus_ecoregion(state, bus_id):
    """Get the ecoregion code for a bus from the buses dict."""
    bus = state["buses"].get(str(bus_id))
    if bus is None:
        return None
    return bus.get("ecoregion_code")


def _get_county_ecoregions(state, geoid):
    """Get all ecoregion codes for a county from the crosswalk."""
    xw = state.get("crosswalk")
    if xw is None:
        return []
    rows = xw[xw['geoid'] == geoid]
    return sorted(rows['ecoregion_code'].unique().tolist())


def _get_neighbors(state, bus_id):
    """Get bus_ids one branch apart from bus_id."""
    neighbors = set()
    bus_id_str = str(bus_id)
    for br in state["branches"].values():
        if not br.get("active", True):
            continue
        fb = str(br["from_bus"])
        tb = str(br["to_bus"])
        if fb == bus_id_str:
            neighbors.add(tb)
        elif tb == bus_id_str:
            neighbors.add(fb)
    return neighbors


def _compute_firm_capacity(state, bus_id):
    """Compute firm (dispatchable) generation capacity at a bus."""
    bus = state["buses"].get(str(bus_id))
    if bus is None:
        return 0.0
    total = 0.0
    for fuel, mw in bus.get("fuel_mix", {}).items():
        if fuel in FIRM_FUEL_TYPES:
            total += mw
    return total


def _seed_existing_assets(county_cards):
    """
    Seed the existing_assets inventory from county_cards.json flagship_assets.

    Entry kinds:
    - mw_asset (asset_kind='mw_asset'): non-null capacity_or_load_mw → live, with coal_tons_yr proxy
    - production_asset (asset_kind='production_asset'): null capacity, confirmed EIA-7A/MSHA volume →
      live production entry with commodity/production_volume/fiscal rate fields
    - excluded (no asset_kind): null capacity, no confirmed volume → excluded='no_mw_conversion'

    Returns: dict[geoid, list[dict]]
    """
    existing = {}
    for geoid, card in county_cards.items():
        flagships = card.get('flagship_assets', [])
        if not flagships:
            continue
        entries = []
        for asset in flagships:
            cap = asset.get('capacity_or_load_mw')
            asset_type = asset.get('type', 'unknown')
            name = asset.get('name', '')
            base = {
                'name': name,
                'geoid': geoid,
                'county_name': asset.get('county_name', ''),
                'state': asset.get('state', ''),
                'type': asset_type,
                'status': asset.get('status', ''),
                'source_url': asset.get('source_url', ''),
                'operational_year': asset.get('operational_year'),
            }

            if cap is None:
                prod_data = _PRODUCTION_ASSET_DATA.get((geoid, name))
                if prod_data is not None:
                    # Promote to live production_asset using confirmed EIA-7A/MSHA volume
                    entries.append({
                        **base,
                        'asset_kind': 'production_asset',
                        'capacity_mw': None,
                        'coal_tons_yr': None,       # MW-proxy field; null for production_assets
                        'production_proxy': None,   # idem
                        'fiscal_action_id': None,   # no player action targets mines directly
                        'excluded': None,           # live entry
                        # Production-specific fields
                        'commodity': prod_data['commodity'],
                        'production_volume': prod_data['production_volume'],
                        'production_unit': prod_data['production_unit'],
                        'production_confidence': prod_data['production_confidence'],
                        'production_source': prod_data['production_source'],
                        'data_year': prod_data['data_year'],
                        'effective_severance_rate_per_unit': prod_data['effective_severance_rate_per_unit'],
                        'county_distribution_share': prod_data['county_distribution_share'],
                        'advalorem_rate_per_unit': prod_data['advalorem_rate_per_unit'],
                        'assessed_delta_per_unit': prod_data.get('assessed_delta_per_unit'),
                    })
                else:
                    # No volume data — flag as excluded (cannot convert to any fiscal unit)
                    entries.append({
                        **base,
                        'capacity_mw': None,
                        'coal_tons_yr': None,
                        'production_proxy': None,
                        'fiscal_action_id': None,
                        'excluded': 'no_mw_conversion',
                    })
            else:
                # Live mw_asset entry
                capacity_mw = float(cap)
                coal_tons_yr = None
                production_proxy = None
                if asset_type == 'coal':
                    coal_tons_yr = round(capacity_mw * PRB_COAL_TONS_PER_MW_YR, 2)
                    production_proxy = coal_tons_yr

                if asset_type == 'data_center':
                    fiscal_action_id = ('data_center_campus_phase'
                                       if capacity_mw >= 150 else 'data_center_hyperscale')
                else:
                    fiscal_action_id = _ASSET_TYPE_TO_FISCAL_ACTION.get(asset_type)

                entries.append({
                    **base,
                    'asset_kind': 'mw_asset',
                    'capacity_mw': capacity_mw,
                    'coal_tons_yr': coal_tons_yr,
                    'production_proxy': production_proxy,
                    'fiscal_action_id': fiscal_action_id,
                    'excluded': None,
                })
        if entries:
            existing[geoid] = entries
    return existing


# ── v3.0 Asset Registry helpers ──────────────────────────────────────────────

import re as _re

def _slugify(name):
    """Slugify a name to lowercase alphanumeric with underscores (mirrors TS slugify)."""
    s = _re.sub(r'[^a-z0-9]+', '_', name.lower())
    return s.strip('_')


def _resolve_asset_class(asset_type, asset_kind=None):
    """Resolve asset_class from type/kind (mirrors TS resolveAssetClass)."""
    if asset_kind == 'production_asset':
        return 'production'
    if asset_type == 'data_center':
        return 'demand'
    return 'generator'


def _seed_asset_registry(county_cards, retirements=None):
    """
    Seed the unified asset_registry from county_cards flagship_assets.
    Mirrors TS seedAssetRegistry exactly.

    Args:
        county_cards: dict[geoid -> card]
        retirements: optional dict[geoid -> dict[asset_name -> {scheduled_retirement_year}]]

    Returns: list[dict] — flat AssetInstance dicts
    """
    registry = []
    for geoid, card in county_cards.items():
        flagships = card.get('flagship_assets', [])
        if not flagships:
            continue
        county_retirements = (retirements or {}).get(geoid)
        for asset in flagships:
            cap = asset.get('capacity_or_load_mw')
            asset_type = asset.get('type', 'unknown')
            name = asset.get('name', '')
            retirement_entry = (county_retirements or {}).get(name)
            retirement_year = retirement_entry['scheduled_retirement_year'] if retirement_entry else None

            base = {
                'name': name,
                'geoid': geoid,
                'county_name': asset.get('county_name', ''),
                'state': asset.get('state', ''),
                'type': asset_type,
                'status': asset.get('status', ''),
                'source_url': asset.get('source_url', ''),
                'operational_year': asset.get('operational_year'),
            }

            prod_data = _PRODUCTION_ASSET_DATA.get((geoid, name))
            if prod_data is not None:
                registry.append({
                    'asset_id': f'baseline_{geoid}_{_slugify(name)}',
                    'origin': 'baseline',
                    'lifecycle': 'operating',
                    'asset_class': 'production',
                    **base,
                    'capacity_mw': None,
                    'coal_tons_yr': None,
                    'production_proxy': None,
                    'fiscal_action_id': None,
                    'excluded': None,
                    'commodity': prod_data['commodity'],
                    'production_volume': prod_data['production_volume'],
                    'production_unit': prod_data['production_unit'],
                    'production_confidence': prod_data['production_confidence'],
                    'production_source': prod_data['production_source'],
                    'data_year': prod_data['data_year'],
                    'effective_severance_rate_per_unit': prod_data['effective_severance_rate_per_unit'],
                    'county_distribution_share': prod_data['county_distribution_share'],
                    'advalorem_rate_per_unit': prod_data.get('advalorem_rate_per_unit'),
                    'assessed_delta_per_unit': prod_data.get('assessed_delta_per_unit'),
                    'employment_direct': prod_data.get('employment_direct'),
                    'action_id': None,
                    'magnitude': None,
                    'decision_year': None,
                    'throttle_reason': None,
                    'commissioned': None,
                    'scheduled_retirement_year': retirement_year,
                })
            elif cap is None:
                # Excluded entry (no MW conversion)
                registry.append({
                    'asset_id': f'baseline_{geoid}_{_slugify(name)}',
                    'origin': 'baseline',
                    'lifecycle': 'operating',
                    'asset_class': _resolve_asset_class(asset_type),
                    **base,
                    'capacity_mw': None,
                    'coal_tons_yr': None,
                    'production_proxy': None,
                    'fiscal_action_id': None,
                    'excluded': 'no_mw_conversion',
                    'commodity': None,
                    'production_volume': None,
                    'production_unit': None,
                    'production_confidence': None,
                    'production_source': None,
                    'data_year': None,
                    'effective_severance_rate_per_unit': None,
                    'county_distribution_share': None,
                    'advalorem_rate_per_unit': None,
                    'assessed_delta_per_unit': None,
                    'employment_direct': None,
                    'action_id': None,
                    'magnitude': None,
                    'decision_year': None,
                    'throttle_reason': None,
                    'commissioned': None,
                    'scheduled_retirement_year': retirement_year,
                })
            else:
                # MW-based asset
                capacity_mw = float(cap)
                coal_tons_yr = None
                production_proxy = None
                if asset_type == 'coal':
                    coal_tons_yr = round(capacity_mw * PRB_COAL_TONS_PER_MW_YR, 2)
                    production_proxy = coal_tons_yr

                if asset_type == 'data_center':
                    fiscal_action_id = ('data_center_campus_phase'
                                       if capacity_mw >= 150 else 'data_center_hyperscale')
                else:
                    fiscal_action_id = _ASSET_TYPE_TO_FISCAL_ACTION.get(asset_type)

                registry.append({
                    'asset_id': f'baseline_{geoid}_{_slugify(name)}',
                    'origin': 'baseline',
                    'lifecycle': 'operating',
                    'asset_class': _resolve_asset_class(asset_type),
                    **base,
                    'capacity_mw': capacity_mw,
                    'coal_tons_yr': coal_tons_yr,
                    'production_proxy': production_proxy,
                    'fiscal_action_id': fiscal_action_id,
                    'excluded': None,
                    'commodity': None,
                    'production_volume': None,
                    'production_unit': None,
                    'production_confidence': None,
                    'production_source': None,
                    'data_year': None,
                    'effective_severance_rate_per_unit': None,
                    'county_distribution_share': None,
                    'advalorem_rate_per_unit': None,
                    'assessed_delta_per_unit': None,
                    'employment_direct': None,
                    'action_id': None,
                    'magnitude': None,
                    'decision_year': None,
                    'throttle_reason': None,
                    'commissioned': None,
                    'scheduled_retirement_year': retirement_year,
                })
    return registry


def _materialize_build_queue(registry):
    """Materialize build_queue view from asset_registry (player-origin, non-retired)."""
    result = []
    for a in registry:
        if a['origin'] == 'player' and a['lifecycle'] != 'retired':
            result.append({
                'action_id': a['action_id'],
                'geoid': a['geoid'],
                'magnitude': a['magnitude'],
                'decision_year': a['decision_year'],
                'operational_year': a['operational_year'],
                'throttle_reason': a['throttle_reason'],
                'commissioned': a['commissioned'] if a['commissioned'] is not None else False,
            })
    return result


def _materialize_existing_assets(registry):
    """Materialize existing_assets view from asset_registry (baseline-origin)."""
    result = {}
    for a in registry:
        if a['origin'] != 'baseline':
            continue
        geoid = a['geoid']
        if geoid not in result:
            result[geoid] = []

        if a['asset_class'] == 'production':
            entry = {
                'asset_kind': 'production_asset',
                'name': a['name'],
                'geoid': a['geoid'],
                'county_name': a['county_name'],
                'state': a['state'],
                'type': a['type'],
                'status': a['status'],
                'source_url': a['source_url'],
                'operational_year': a['operational_year'],
                'capacity_mw': None,
                'coal_tons_yr': None,
                'production_proxy': None,
                'fiscal_action_id': None,
                'excluded': None,
                'commodity': a['commodity'],
                'production_volume': a['production_volume'],
                'production_unit': a['production_unit'],
                'production_confidence': a['production_confidence'],
                'production_source': a['production_source'],
                'data_year': a['data_year'],
                'effective_severance_rate_per_unit': a['effective_severance_rate_per_unit'],
                'county_distribution_share': a['county_distribution_share'],
                'advalorem_rate_per_unit': a['advalorem_rate_per_unit'],
                'assessed_delta_per_unit': a['assessed_delta_per_unit'],
            }
        elif a['excluded'] is not None:
            # Excluded entry — no asset_kind
            entry = {
                'name': a['name'],
                'geoid': a['geoid'],
                'county_name': a['county_name'],
                'state': a['state'],
                'type': a['type'],
                'status': a['status'],
                'source_url': a['source_url'],
                'operational_year': a['operational_year'],
                'capacity_mw': a['capacity_mw'],
                'coal_tons_yr': a['coal_tons_yr'],
                'production_proxy': a['production_proxy'],
                'fiscal_action_id': a['fiscal_action_id'],
                'excluded': a['excluded'],
            }
        else:
            # MW-based asset
            entry = {
                'asset_kind': 'mw_asset',
                'name': a['name'],
                'geoid': a['geoid'],
                'county_name': a['county_name'],
                'state': a['state'],
                'type': a['type'],
                'status': a['status'],
                'source_url': a['source_url'],
                'operational_year': a['operational_year'],
                'capacity_mw': a['capacity_mw'],
                'coal_tons_yr': a['coal_tons_yr'],
                'production_proxy': a['production_proxy'],
                'fiscal_action_id': a['fiscal_action_id'],
                'excluded': None,
            }
        result[geoid].append(entry)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# PART 1 — initialize_state()
# ═══════════════════════════════════════════════════════════════════════════════

def initialize_state(data_dir=None, county_ees_path=None, crosswalk_path=None,
                     county_cards_path=None, action_library_path=None,
                     start_year=2025, baseline_retirements=None):
    """
    Initialize and return the canonical TERRA engine v3.0 state dict.

    The state is county-keyed: state['county_ees'] is the primary capital store.
    Ecoregion scores are retained as state['ecoregion_ees'] for backward
    compatibility and suitability overlay derivation.
    """
    if data_dir is None:
        data_dir = DATA_DIR

    # ── Load synthetic buses ──────────────────────────────────────────────────
    with open(data_dir / "synthetic_buses.geojson") as f:
        buses_geojson = json.load(f)
    buses_raw = buses_geojson['features']

    # ── Load synthetic branches ───────────────────────────────────────────────
    with open(data_dir / "synthetic_branches.geojson") as f:
        branches_geojson = json.load(f)
    branches_raw = branches_geojson['features']

    # ── Load study ecoregion polygons for spatial assignment ──────────────────
    with open(data_dir / "mw_ecoregions.geojson") as f:
        eco_geojson = json.load(f)
    eco_features = [
        f for f in eco_geojson['features']
        if f['properties']['US_L3CODE'] in STUDY_ECOREGION_CODES
    ]

    # ── Assign ecoregion codes to Mountain West buses ─────────────────────────
    eco_assignments = _assign_ecoregion_codes(buses_raw, eco_features)

    # ── Build fuel_mix per bus ────────────────────────────────────────────────
    fuel_mix_map, gen_mw_by_bus = _build_fuel_mix_map(data_dir)

    # ── Build buses dict ──────────────────────────────────────────────────────
    buses = {}
    for feat in buses_raw:
        props = feat['properties']
        coords = feat['geometry']['coordinates']
        bus_id = str(props['bus_id'])
        generation_mw = gen_mw_by_bus.get(
            bus_id, props.get('generation_cap_mw') or 0.0
        )
        if generation_mw is None:
            generation_mw = 0.0
        buses[bus_id] = {
            "ba_code":        props.get('ba_code', ''),
            "ecoregion_code": eco_assignments.get(bus_id),
            "lat":            float(coords[1]),
            "lon":            float(coords[0]),
            "generation_mw":  float(generation_mw),
            "load_mw":        float(props.get('load_mw') or 0.0),
            "storage_mwh":    0.0,
            "role":           props.get('role', 'mixed'),
            "fuel_mix":       fuel_mix_map.get(bus_id, {}),
        }

    # ── Build branches dict ───────────────────────────────────────────────────
    branches = {}
    for feat in branches_raw:
        props = feat['properties']
        branch_id = str(props['line_id'])
        branches[branch_id] = {
            "from_bus":        str(props['from_bus']),
            "to_bus":          str(props['to_bus']),
            "thermal_limit_mw": float(props.get('thermal_mw') or 0.0),
            "voltage_kv":      float(props.get('voltage_assumed_kv') or 230.0),
            "active":          True,
        }

    # ── BA flows ──────────────────────────────────────────────────────────────
    ba_flows = _build_ba_flows(data_dir)

    # ── Ecoregion EES baseline (retained for backward compat) ─────────────────
    ees_df = pd.read_csv(data_dir / "mw_ecoregion_ees_summary.csv")
    ecoregion_ees = {}
    for _, row in ees_df.iterrows():
        code = str(int(row['ecoregion_code']))
        ecoregion_ees[code] = {
            "E": float(row['E_score']), "Ec": float(row['Ec_score']),
            "S": float(row['S_score']),
            "E_baseline": float(row['E_score']),
            "Ec_baseline": float(row['Ec_score']),
            "S_baseline": float(row['S_score']),
        }

    # ── County EES (primary capital store) ────────────────────────────────────
    ees_path = county_ees_path or (data_dir / "mw_county_ees_summary.csv")
    county_ees_df = pd.read_csv(ees_path, dtype={'geoid': str})
    # Normalize column name
    if 'GEOID' in county_ees_df.columns:
        county_ees_df = county_ees_df.rename(columns={'GEOID': 'geoid'})

    county_ees = {}
    for _, row in county_ees_df.iterrows():
        geoid = str(row['geoid']).zfill(5)
        county_ees[geoid] = {
            "E": float(row['E']), "Ec": float(row['Ec']), "S": float(row['S']),
            "E_baseline": float(row['E']), "Ec_baseline": float(row['Ec']),
            "S_baseline": float(row['S']),
            "county_name": str(row.get('county_name', '')),
            "population": int(row.get('population', 0)),
            "load_mw": 0.0,          # county-attributed NEW load (from bus_load_add)
            "added_firm_mw": 0.0,    # firm capacity explicitly added via actions
            "deficit_mw": 0.0,       # load - added_firm (new load vs new supply)
        }

    # ── Crosswalk ─────────────────────────────────────────────────────────────
    xw_path = crosswalk_path or (data_dir / "county_crosswalk.parquet")
    crosswalk = pd.read_parquet(xw_path)
    crosswalk['geoid'] = crosswalk['geoid'].astype(str).str.zfill(5)
    crosswalk['bus_id'] = crosswalk['bus_id'].astype(int)
    crosswalk['ecoregion_code'] = crosswalk['ecoregion_code'].astype(str)

    # ── County cards ──────────────────────────────────────────────────────────
    cards_path = county_cards_path or (data_dir / "mw_county_cards.json")
    with open(cards_path) as f:
        county_cards = json.load(f)

    # ── Existing assets (flagship baseline inventory) ─────────────────────────
    existing_assets = _seed_existing_assets(county_cards)

    # ── v3.0: Asset registry (source of truth) ────────────────────────────────
    asset_registry = _seed_asset_registry(county_cards, baseline_retirements)
    # Materialize existing_assets from registry (overrides the _seed_existing_assets above)
    existing_assets = _materialize_existing_assets(asset_registry)

    # ── Action library v3 ─────────────────────────────────────────────────────
    lib_path = action_library_path or (data_dir / "mw_action_library_v3.json")
    with open(lib_path) as f:
        action_library = json.load(f)

    # Ensure all actions have a 'tier' field
    _BUCKET_TO_TIER = {
        'energy_generation': 'energy', 'energy_storage': 'energy',
        'energy_transmission': 'energy', 'energy_demand': 'energy',
        'nuclear_fuel_cycle': 'energy',
        'terrestrial_ecosystem': 'ecological', 'hydrological_restoration': 'ecological',
        'settlement_social': 'social', 'economic_development': 'social',
        'transport': 'social',
    }
    for action in action_library.get("actions", {}).values():
        if 'tier' not in action:
            action['tier'] = _BUCKET_TO_TIER.get(action.get('bucket', ''), 'social')

    # ── Scenario profiles ─────────────────────────────────────────────────────
    sp_path = data_dir / "mw_scenario_profiles.json"
    if sp_path.exists():
        with open(sp_path) as f:
            scenario_profiles = json.load(f)
    else:
        scenario_profiles = {}

    # ── Study area buses ──────────────────────────────────────────────────────
    study_area_buses = sorted(
        [bid for bid, b in buses.items() if b['ecoregion_code'] is not None],
        key=lambda x: int(x)
    )

    # ── Bus state (per-bus capacity/load/deficit tracking) ────────────────────
    bus_state = {}
    for bid, b in buses.items():
        firm_cap = sum(mw for fuel, mw in b.get('fuel_mix', {}).items()
                       if fuel in FIRM_FUEL_TYPES)
        bus_state[bid] = {
            "capacity_mw": b['generation_mw'],
            "firm_capacity_mw": firm_cap,
            "load_mw": b['load_mw'],
            "deficit_mw": max(0.0, b['load_mw'] - firm_cap),
            "storage_mwh": b.get('storage_mwh', 0.0),
        }

    # ── Supply chain pools ────────────────────────────────────────────────────
    coupling_rules = action_library.get("coupling_rules", {})
    sc_throughput = coupling_rules.get("supply_chain_throughput", {})
    pools = sc_throughput.get("pools", {})

    sc_pools = {}
    for pool_name, pool_def in pools.items():
        sc_pools[pool_name] = {
            "capacity_per_year": pool_def.get("initial_value", 0),
            "used_this_year": 0,
            "operational_year": pool_def.get("operational_year", None),
            "initial_value": pool_def.get("initial_value", 0),
        }

    # ── County fiscal layer (23 WY counties) ────────────────────────────────
    county_fiscal = {}
    fiscal_coefficients = {}
    fiscal_baseline_path = data_dir / "wy_county_fiscal_baseline.json"
    fiscal_coefficients_path = data_dir / "wy_fiscal_coefficients.json"
    if fiscal_baseline_path.exists() and fiscal_coefficients_path.exists():
        with open(fiscal_baseline_path) as f:
            fiscal_baseline_raw = json.load(f)
        with open(fiscal_coefficients_path) as f:
            fiscal_coefficients = json.load(f)

        counties_baseline = fiscal_baseline_raw.get("counties", {})
        for geoid, cb in counties_baseline.items():
            av = cb.get("assessed_values", {})
            mpv = cb.get("mineral_production_valuation", {})
            mill = cb.get("mill_levy_composite_mills", {}).get("value", 0.0) or 0.0

            assessed_mineral = (av.get("mineral", {}).get("value") or 0.0)
            assessed_industrial = (av.get("industrial", {}).get("value") or 0.0)
            assessed_commercial = (av.get("commercial", {}).get("value") or 0.0)
            assessed_residential = (av.get("residential", {}).get("value") or 0.0)
            assessed_agricultural = (av.get("agricultural", {}).get("value") or 0.0)
            assessed_all_other = (av.get("all_other", {}).get("value") or 0.0)

            total_assessed = (assessed_mineral + assessed_industrial
                              + assessed_commercial + assessed_residential
                              + assessed_agricultural + assessed_all_other)

            # Production ad valorem (Ledger A baseline)
            prod_tax_assessed = (mpv.get("production_tax_assessed", {}).get("value") or 0.0)
            mineral_mill = (mpv.get("mineral_weighted_mill_levy", {}).get("value") or mill)
            advalorem_production = prod_tax_assessed * mineral_mill / 1000.0

            # Severance share (Ledger B baseline)
            severance_share = (cb.get("severance_tax_distribution_usd", {}).get("value") or 0.0)

            # Federal royalty share
            federal_royalty = (cb.get("federal_mineral_royalties_usd", {}).get("value") or 0.0)

            # Sales/use tax
            sales_use = (cb.get("sales_use_tax_distribution_usd", {}).get("value") or 0.0)

            # PILT
            pilt = (cb.get("pilt_usd", {}).get("value") or 0.0)

            # School finance net (Ledger C) — from fiscal coefficients, not baseline
            # Use the first action's school_finance_net for this county (all actions
            # carry the same county-level net_total since it's a county property)
            sf_net = 0.0
            sf_mineral_share = 0.0
            for _aid, acoeffs in fiscal_coefficients.items():
                sf_entry = acoeffs.get("school_finance_net", {}).get(geoid)
                if sf_entry:
                    nft = sf_entry.get("school_finance_net_total", {})
                    sf_net = nft.get("value", 0.0) or 0.0
                    sms = sf_entry.get("school_finance_mineral_share", {})
                    sf_mineral_share = sms.get("value", 0.0) or 0.0
                    break

            county_fiscal[geoid] = {
                "assessed_mineral": assessed_mineral,
                "assessed_industrial": assessed_industrial,
                "assessed_commercial": assessed_commercial,
                "assessed_residential": assessed_residential,
                "assessed_agricultural": assessed_agricultural,
                "assessed_all_other": assessed_all_other,
                "mill_levy_mills": mill,
                "property_tax": total_assessed * mill / 1000.0,
                "advalorem_production": advalorem_production,
                "severance_share": severance_share,
                "federal_royalty_share": federal_royalty,
                "sales_use": sales_use,
                "pilt": pilt,
                "school_finance_net": sf_net,
                "school_finance_mineral_share": sf_mineral_share,
                "assessed_mineral_baseline": assessed_mineral,
                "ledger_a_cumulative_delta": 0.0,
                "ledger_b_cumulative_delta": 0.0,
                "ledger_c_cumulative_delta": 0.0,
                "fiscal_actions": [],
            }

    # ── Assemble state ────────────────────────────────────────────────────────
    state = {
        # v2 primary stores
        "county_ees":           county_ees,
        "bus_state":            bus_state,
        "active_couplings":     [],
        "build_queue":          [],
        "year":                 start_year,
        "sc_pools":             sc_pools,
        # v2.1 fiscal layer
        "county_fiscal":        county_fiscal,
        "fiscal_coefficients":  fiscal_coefficients,
        # Retained from v1
        "buses":                buses,
        "branches":             branches,
        "ba_flows":             ba_flows,
        "ecoregion_ees":        ecoregion_ees,
        "sensitivity_matrix":   None,
        "sensitivity_bus_index": [],
        "last_calibration_mw":  0.0,
        "drift_pct":            0.0,
        "recompute_recommended": False,
        "material_ledger":      {},
        "action_history":       [],
        "disturbance_history":  [],
        "timestamp":            0,
        "study_area_buses":     study_area_buses,
        "action_library":       action_library,
        "scenario_profiles":    scenario_profiles,
        "crosswalk":            crosswalk,
        "county_cards":         county_cards,
        "existing_assets":      existing_assets,
        # v3.0 asset registry — source of truth
        "asset_registry":       asset_registry,
        # Tracking
        "last_delta":           None,
    }

    # ── Spatial hierarchy (read-only reference) ──────────────────────────────
    sh_counties_path = data_dir / "spatial_hierarchy_counties.parquet"
    sh_huc8_path = data_dir / "spatial_hierarchy_huc8.parquet"
    if sh_counties_path.exists() and sh_huc8_path.exists():
        sh_counties = pd.read_parquet(sh_counties_path)
        sh_huc8 = pd.read_parquet(sh_huc8_path)
        county_to_ecoregion = dict(zip(sh_counties["GEOID"], sh_counties["primary_ecoregion_code"]))
        huc8_to_ecoregion = dict(zip(sh_huc8["huc8"], sh_huc8["primary_ecoregion_code"]))
        ecoregion_to_huc8 = {}
        for _, row in sh_huc8[sh_huc8["is_study_area"]].iterrows():
            eco = row["primary_ecoregion_code"]
            ecoregion_to_huc8.setdefault(eco, []).append(row["huc8"])
        state["spatial_hierarchy"] = {
            "county_to_ecoregion": county_to_ecoregion,
            "huc8_to_ecoregion": huc8_to_ecoregion,
            "ecoregion_to_huc8": ecoregion_to_huc8,
        }
    else:
        state["spatial_hierarchy"] = None

    # ── Build sensitivity matrix ──────────────────────────────────────────────
    matrix, bus_index = _build_sensitivity_matrix(state)
    state["sensitivity_matrix"] = matrix
    state["sensitivity_bus_index"] = bus_index

    return state


# ═══════════════════════════════════════════════════════════════════════════════
# PART 3 — apply_action()
# ═══════════════════════════════════════════════════════════════════════════════

def apply_action(state, action_id, location, magnitude, _skip_coupling=False):
    """
    Apply a single action to the current state.

    In engine v2, `location` can be:
    - A county GEOID (5-char string) — the engine resolves to bus/tract/watershed
      via crosswalk and action.resolves_to
    - A bus_id (for backward compatibility with v1 / NB11 replay)
    - An ecoregion_code (for backward compatibility with v1 / NB11 replay)

    Returns (state, delta_summary). Input state is NOT mutated.
    """
    state = _shallow_copy_state(state)

    actions = state["action_library"]["actions"]
    if action_id not in actions:
        raise ValueError(f"Unknown action_id '{action_id}'. Valid: {list(actions.keys())}")
    if magnitude <= 0:
        raise ValueError(f"magnitude must be positive, got {magnitude}")

    action = actions[action_id]
    resolves_to = action.get("resolves_to", "bus")
    tier = action.get("tier", "social")
    unit_scale = action.get("unit_scale", 1000)
    scale_factor = magnitude / unit_scale
    ees_effects = action.get("ees_effects", {})
    network_effect = action.get("network_effect", None)

    # ── Determine location type and resolve ──────────────────────────────────
    location_str = str(location)
    is_geoid = len(location_str) == 5 and location_str.isdigit()
    is_bus = location_str in state["buses"]
    is_ecoregion = location_str in state["ecoregion_ees"]

    geoid = None
    bus_id = None
    eco_code = None

    if is_geoid and location_str in state["county_ees"]:
        # v2 county-keyed path
        geoid = location_str
        bus_id = _resolve_geoid_to_bus(state, geoid)
        eco_codes = _get_county_ecoregions(state, geoid)
        eco_code = eco_codes[0] if eco_codes else None
    elif is_bus and tier == "energy":
        # v1 backward compat: bus_id for energy actions
        bus_id = location_str
        eco_code = _get_bus_ecoregion(state, bus_id)
    elif is_ecoregion:
        # v1 backward compat: ecoregion_code for eco/social
        eco_code = location_str
    else:
        # Try as GEOID anyway
        geoid = location_str
        bus_id = _resolve_geoid_to_bus(state, geoid)

    # ── Apply EES delta ──────────────────────────────────────────────────────
    ees_delta = {}

    if geoid and geoid in state["county_ees"]:
        # v2 path: update county_ees
        county_delta = {}
        for capital in ("E", "Ec", "S"):
            delta = ees_effects.get(capital, 0.0) * scale_factor
            old_val = state["county_ees"][geoid][capital]
            new_val = max(0.0, min(10.0, old_val + delta))
            state["county_ees"][geoid][capital] = new_val
            county_delta[capital] = new_val - old_val
        ees_delta[geoid] = county_delta

        # Also update ecoregion_ees for backward compat (if eco_code known)
        if eco_code and eco_code in state["ecoregion_ees"]:
            for capital in ("E", "Ec", "S"):
                delta = ees_effects.get(capital, 0.0) * scale_factor
                old_val = state["ecoregion_ees"][eco_code][capital]
                new_val = max(0.0, min(10.0, old_val + delta))
                state["ecoregion_ees"][eco_code][capital] = new_val
    elif eco_code and eco_code in state["ecoregion_ees"]:
        # v1 path: update ecoregion_ees
        eco_delta = {}
        for capital in ("E", "Ec", "S"):
            delta = ees_effects.get(capital, 0.0) * scale_factor
            old_val = state["ecoregion_ees"][eco_code][capital]
            new_val = max(0.0, min(10.0, old_val + delta))
            state["ecoregion_ees"][eco_code][capital] = new_val
            eco_delta[capital] = new_val - old_val
        ees_delta[eco_code] = eco_delta

    # ── Update bus/network state ─────────────────────────────────────────────
    network_delta = {}
    if bus_id and bus_id in state["buses"]:
        bus = state["buses"][bus_id]

        if network_effect == "bus_load_add":
            # ENERGY_DEMAND: add load
            pue = 1.25  # default PUE
            coeffs = action.get("coefficients_per_mw_it", action.get("coefficients_per_mw", {}))
            grid_load_coeff = coeffs.get("grid_load_mw", {})
            if isinstance(grid_load_coeff, dict):
                pue = grid_load_coeff.get("value", 1.25)
            elif isinstance(grid_load_coeff, (int, float)):
                pue = grid_load_coeff

            grid_load_mw = magnitude * pue
            bus["load_mw"] += grid_load_mw

            # Update bus_state
            bs = state["bus_state"].get(bus_id, {})
            bs["load_mw"] = bus["load_mw"]
            firm_cap = bs.get("firm_capacity_mw", 0.0)
            bs["deficit_mw"] = max(0.0, bs["load_mw"] - firm_cap)
            state["bus_state"][bus_id] = bs

            # Update county-level load tracking and deficit
            # deficit = new load added to county - new firm capacity added
            if geoid and geoid in state["county_ees"]:
                state["county_ees"][geoid]["load_mw"] += grid_load_mw
                county_load = state["county_ees"][geoid]["load_mw"]
                county_firm = state["county_ees"][geoid].get("added_firm_mw", 0.0)
                state["county_ees"][geoid]["deficit_mw"] = max(0.0, county_load - county_firm)

            network_delta[bus_id] = {"load_mw_change": grid_load_mw}

        elif action_id in ("wind_utility", "solar_utility"):
            bus["generation_mw"] += magnitude
            fuel_type = "wind" if action_id == "wind_utility" else "solar"
            bus["fuel_mix"][fuel_type] = bus["fuel_mix"].get(fuel_type, 0.0) + magnitude
            # Update bus_state capacity (not firm for wind/solar)
            bs = state["bus_state"].get(bus_id, {})
            bs["capacity_mw"] = bus["generation_mw"]
            state["bus_state"][bus_id] = bs

        elif action_id == "coal_repowering":
            coal_mw = bus["fuel_mix"].get("coal", 0.0)
            reduction = min(magnitude, coal_mw)
            bus["fuel_mix"]["coal"] = coal_mw - reduction
            bus["fuel_mix"]["gas"] = bus["fuel_mix"].get("gas", 0.0) + reduction

        elif action_id in ("smr_advanced", "coal_to_smr", "geothermal_utility"):
            bus["generation_mw"] += magnitude
            fuel = "nuclear" if action_id in ("smr_advanced", "coal_to_smr") else "geothermal"
            bus["fuel_mix"][fuel] = bus["fuel_mix"].get(fuel, 0.0) + magnitude
            # Update bus_state (firm capacity)
            bs = state["bus_state"].get(bus_id, {})
            bs["capacity_mw"] = bus["generation_mw"]
            bs["firm_capacity_mw"] = bs.get("firm_capacity_mw", 0.0) + magnitude
            bs["deficit_mw"] = max(0.0, bs.get("load_mw", 0.0) - bs["firm_capacity_mw"])
            state["bus_state"][bus_id] = bs
            # Update county added firm capacity
            if geoid and geoid in state["county_ees"]:
                state["county_ees"][geoid]["added_firm_mw"] = (
                    state["county_ees"][geoid].get("added_firm_mw", 0.0) + magnitude
                )
                county_load = state["county_ees"][geoid].get("load_mw", 0.0)
                county_firm = state["county_ees"][geoid]["added_firm_mw"]
                state["county_ees"][geoid]["deficit_mw"] = max(0.0, county_load - county_firm)

        elif action_id == "battery_grid":
            bus["storage_mwh"] += magnitude
            # Storage adds to firm capacity (4h adequacy: mwh/4 = firm MW)
            firm_add = magnitude / 4.0
            bs = state["bus_state"].get(bus_id, {})
            bs["storage_mwh"] = bus["storage_mwh"]
            bs["firm_capacity_mw"] = bs.get("firm_capacity_mw", 0.0) + firm_add
            bs["deficit_mw"] = max(0.0, bs.get("load_mw", 0.0) - bs["firm_capacity_mw"])
            state["bus_state"][bus_id] = bs
            # Update county added firm capacity
            if geoid and geoid in state["county_ees"]:
                state["county_ees"][geoid]["added_firm_mw"] = (
                    state["county_ees"][geoid].get("added_firm_mw", 0.0) + firm_add
                )
                county_load = state["county_ees"][geoid].get("load_mw", 0.0)
                county_firm = state["county_ees"][geoid]["added_firm_mw"]
                state["county_ees"][geoid]["deficit_mw"] = max(0.0, county_load - county_firm)

        elif action_id in ("transmission_230kv", "transmission_500kv",
                           "transmission_buildout"):
            voltage = 500.0 if "500" in action_id else 230.0
            new_branch_id = f"new_branch_{state['timestamp']:04d}"
            state["branches"][new_branch_id] = {
                "from_bus": bus_id, "to_bus": bus_id,
                "thermal_limit_mw": magnitude * 2.0,
                "voltage_kv": voltage, "active": True,
            }

        elif action_id == "hydropower_small":
            bus["generation_mw"] += magnitude
            bus["fuel_mix"]["hydro"] = bus["fuel_mix"].get("hydro", 0.0) + magnitude
            bs = state["bus_state"].get(bus_id, {})
            bs["capacity_mw"] = bus["generation_mw"]
            bs["firm_capacity_mw"] = bs.get("firm_capacity_mw", 0.0) + magnitude
            bs["deficit_mw"] = max(0.0, bs.get("load_mw", 0.0) - bs["firm_capacity_mw"])
            state["bus_state"][bus_id] = bs

        elif action_id == "pumped_hydro":
            bus["storage_mwh"] += magnitude
            # Pumped hydro: MW capacity ≈ MWh/4
            firm_add = magnitude / 4.0
            bus["generation_mw"] += firm_add
            bus["fuel_mix"]["hydro"] = bus["fuel_mix"].get("hydro", 0.0) + firm_add
            bs = state["bus_state"].get(bus_id, {})
            bs["capacity_mw"] = bus["generation_mw"]
            bs["storage_mwh"] = bus["storage_mwh"]
            bs["firm_capacity_mw"] = bs.get("firm_capacity_mw", 0.0) + firm_add
            bs["deficit_mw"] = max(0.0, bs.get("load_mw", 0.0) - bs["firm_capacity_mw"])
            state["bus_state"][bus_id] = bs

        else:
            # Generic energy action: add generation
            if tier == "energy" and action_id not in (
                "transmission_230kv", "transmission_500kv", "transmission_buildout",
                "microgrid"
            ):
                bus["generation_mw"] += magnitude
                bs = state["bus_state"].get(bus_id, {})
                bs["capacity_mw"] = bus["generation_mw"]
                state["bus_state"][bus_id] = bs

    # ── Update material ledger ───────────────────────────────────────────────
    materials = action.get("materials", {})
    material_consumed = {}
    for mat_type, mat_spec in materials.items():
        if mat_type in ("primary_input", "unit", "source"):
            continue
        if isinstance(mat_spec, dict):
            qty_per_unit = mat_spec.get("tonnes_per_unit", 0)
            unit_label = mat_spec.get("unit", "tonnes")
        elif isinstance(mat_spec, (int, float)):
            qty_per_unit = float(mat_spec)
            unit_label = "tonnes"
        else:
            continue
        if qty_per_unit == 0:
            continue
        total_qty = qty_per_unit * scale_factor
        if mat_type not in state["material_ledger"]:
            state["material_ledger"][mat_type] = {"total": 0.0, "unit": unit_label, "by_action": []}
        state["material_ledger"][mat_type]["total"] += total_qty
        state["material_ledger"][mat_type]["by_action"].append({
            "action_id": action_id, "location": location_str,
            "quantity": total_qty, "timestamp": state["timestamp"],
        })
        material_consumed[mat_type] = {"quantity": total_qty, "unit": unit_label}

    # ── Apply fiscal effects ────────────────────────────────────────────────
    fiscal_delta = _apply_fiscal_effects(state, action_id, geoid, magnitude)

    # ── Record history ───────────────────────────────────────────────────────
    action_record = {
        "action_id": action_id, "location": location_str,
        "geoid": geoid, "magnitude": magnitude,
        "unit": action.get("unit", ""), "ees_delta": ees_delta,
        "network_delta": network_delta, "timestamp": state["timestamp"],
    }
    state["action_history"].append(action_record)
    state["timestamp"] += 1

    # ── Build delta summary ──────────────────────────────────────────────────
    delta_summary = {
        "action_id": action_id, "location": location_str, "geoid": geoid,
        "magnitude": magnitude, "ees_delta": ees_delta,
        "network_delta": network_delta, "material_consumed": material_consumed,
        "bus_id": bus_id, "fiscal_delta": fiscal_delta,
    }
    state["last_delta"] = delta_summary

    # ── Evaluate couplings ───────────────────────────────────────────────────
    if not _skip_coupling:
        state = _evaluate_couplings(state)

    return state, delta_summary


def _shallow_copy_state(state):
    """
    Create a working copy of state. Deep-copies mutable stores;
    shares immutable/large reference data (crosswalk, action_library, etc.).
    v3.0: deep-copy asset_registry, materialize build_queue + existing_assets from it.
    """
    new = {}

    # v3.0: deep-copy asset_registry (each entry is a flat dict with only primitives/None)
    registry = [dict(a) for a in state.get("asset_registry", [])]
    new["asset_registry"] = registry

    # Deep copy mutable stores (build_queue + existing_assets now materialized from registry)
    for key in ("county_ees", "bus_state", "active_couplings",
                "sc_pools", "ecoregion_ees", "material_ledger",
                "action_history", "disturbance_history", "county_fiscal"):
        new[key] = copy.deepcopy(state.get(key))

    # v3.0: materialize views from copied registry
    new["build_queue"] = _materialize_build_queue(registry)
    new["existing_assets"] = _materialize_existing_assets(registry)

    # Deep copy buses and branches (mutated by apply_action)
    new["buses"] = copy.deepcopy(state["buses"])
    new["branches"] = copy.deepcopy(state["branches"])

    # Share references for large/immutable data
    for key in ("ba_flows", "sensitivity_matrix", "sensitivity_bus_index",
                "last_calibration_mw", "drift_pct", "recompute_recommended",
                "study_area_buses", "action_library", "scenario_profiles",
                "crosswalk", "county_cards", "spatial_hierarchy",
                "fiscal_coefficients"):
        new[key] = state.get(key)

    # Copy scalars
    new["year"] = state.get("year", 2025)
    new["timestamp"] = state.get("timestamp", 0)
    new["last_delta"] = state.get("last_delta")

    return new


# ═══════════════════════════════════════════════════════════════════════════════
# PART 3b — _evaluate_couplings()
# ═══════════════════════════════════════════════════════════════════════════════

def _evaluate_couplings(state):
    """
    After every action application, scan for coupling activations.
    Currently implements: nuclear_dc_coupling.
    """
    coupling_rules = state["action_library"].get("coupling_rules", {})
    ndc_rule = coupling_rules.get("nuclear_dc_coupling")
    if ndc_rule is None:
        return state

    trigger = ndc_rule.get("trigger", {})
    demand_actions = set(trigger.get("demand_actions", []))
    supply_actions = set(trigger.get("supply_actions", []))

    # Collect placed demand and supply actions with their bus assignments
    demands_by_bus = {}  # bus_id -> [(geoid, action_record)]
    supplies_by_bus = {}

    for record in state["action_history"]:
        aid = record["action_id"]
        geoid = record.get("geoid")
        bus_id = record.get("network_delta", {})
        # Determine the bus this action is on
        if geoid:
            rec_bus = _resolve_geoid_to_bus(state, geoid)
        elif record["location"] in state["buses"]:
            rec_bus = record["location"]
        else:
            rec_bus = None

        if rec_bus is None:
            continue

        if aid in demand_actions:
            demands_by_bus.setdefault(rec_bus, []).append((geoid or record["location"], record))
        if aid in supply_actions:
            supplies_by_bus.setdefault(rec_bus, []).append((geoid or record["location"], record))

    # Check existing coupling IDs to avoid re-activation
    existing_coupling_keys = set()
    for c in state["active_couplings"]:
        existing_coupling_keys.add(c.get("coupling_id", ""))

    effects = ndc_rule.get("effects", {})
    tx_reduction = effects.get("transmission_requirement_reduction_pct", {}).get("value", 20)
    reliability_credit = effects.get("reliability_credit", {}).get("value", 0.2)

    # Check same-bus and one-branch-apart pairings
    for bus_id, demand_list in demands_by_bus.items():
        # Same bus supplies
        candidate_buses = {bus_id} | _get_neighbors(state, bus_id)
        for check_bus in candidate_buses:
            if check_bus not in supplies_by_bus:
                continue
            for d_geoid, d_rec in demand_list:
                for s_geoid, s_rec in supplies_by_bus[check_bus]:
                    coupling_id = f"ndc_{d_geoid}_{s_geoid}_{bus_id}"
                    if coupling_id in existing_coupling_keys:
                        continue
                    # Activate coupling
                    coupling = {
                        "coupling_id": coupling_id,
                        "coupling_type": "nuclear_dc_coupling",
                        "demand_geoid": d_geoid,
                        "demand_action": d_rec["action_id"],
                        "supply_geoid": s_geoid,
                        "supply_action": s_rec["action_id"],
                        "bus_id": bus_id,
                        "tx_reduction_pct": tx_reduction,
                        "reliability_credit": reliability_credit,
                        "activated_year": state["year"],
                        "reasoning": "see coupling_rules.nuclear_dc_coupling.rationale",
                    }
                    state["active_couplings"].append(coupling)
                    existing_coupling_keys.add(coupling_id)

    return state


# ═══════════════════════════════════════════════════════════════════════════════
# PART 4 — queue_action() and advance_year()
# ═══════════════════════════════════════════════════════════════════════════════

def queue_action(state, action_id, geoid, magnitude, decision_year,
                 override_operational_year=None):
    """
    Queue an action for future commissioning.

    Returns new state with the action added to build_queue.
    """
    state = _shallow_copy_state(state)

    actions = state["action_library"]["actions"]
    if action_id not in actions:
        raise ValueError(f"Unknown action_id '{action_id}'")

    action = actions[action_id]
    ttd = action.get("time_to_deploy", 1)

    if override_operational_year is not None:
        operational_year = override_operational_year
    else:
        operational_year = decision_year + ttd

    throttle_reason = None

    # Check supply chain throttle for SMR-family
    # Skip throttle if override_operational_year is set (committed projects)
    coupling_rules = state["action_library"].get("coupling_rules", {})
    sc_rules = coupling_rules.get("supply_chain_throughput", {})
    smr_family = set(sc_rules.get("smr_family_actions", []))

    if action_id in smr_family and override_operational_year is None:
        haleu_per_build = sc_rules.get("smr_haleu_per_build", {}).get("value", 5000)
        pool = state["sc_pools"].get("HALEU_kg_per_year", {})
        pool_cap = pool.get("capacity_per_year", 900)
        pool_used = pool.get("used_this_year", 0)

        if pool_cap > 0 and (pool_used + haleu_per_build) > pool_cap:
            # Compute how many years of waiting needed
            years_needed = 0
            accumulated = pool_cap - pool_used
            while accumulated < haleu_per_build:
                years_needed += 1
                accumulated += pool_cap
            operational_year = max(operational_year, decision_year + ttd + years_needed)
            throttle_reason = "HALEU_pool"
        else:
            # Consume from pool
            pool["used_this_year"] = pool_used + haleu_per_build
            state["sc_pools"]["HALEU_kg_per_year"] = pool

    # v3.0: push to asset_registry, then re-materialize build_queue view
    gid = str(geoid)
    action = actions[action_id]
    registry_entry = {
        'asset_id': f'player_{gid}_{_slugify(action_id)}_{decision_year}',
        'origin': 'player',
        'lifecycle': 'queued',
        'asset_class': _resolve_asset_class(
            'data_center' if action.get('bucket') == 'energy_demand' else (action.get('bucket') or '')
        ),
        'name': action_id,
        'geoid': gid,
        'county_name': '',
        'state': '',
        'type': action_id,
        'status': 'queued',
        'source_url': '',
        'operational_year': operational_year,
        'capacity_mw': None,
        'coal_tons_yr': None,
        'production_proxy': None,
        'fiscal_action_id': None,
        'excluded': None,
        'commodity': None,
        'production_volume': None,
        'production_unit': None,
        'production_confidence': None,
        'production_source': None,
        'data_year': None,
        'effective_severance_rate_per_unit': None,
        'county_distribution_share': None,
        'advalorem_rate_per_unit': None,
        'assessed_delta_per_unit': None,
        'employment_direct': None,
        'action_id': action_id,
        'magnitude': magnitude,
        'decision_year': decision_year,
        'throttle_reason': throttle_reason,
        'commissioned': False,
        'scheduled_retirement_year': None,
    }
    state["asset_registry"].append(registry_entry)
    state["build_queue"] = _materialize_build_queue(state["asset_registry"])

    return state


def advance_year(state):
    """
    Advance the simulation by one year.
    Commission completed builds, update supply chain pools, apply depreciation.
    """
    state = _shallow_copy_state(state)
    state["year"] += 1
    current_year = state["year"]

    # Reset HALEU pool usage for the new year
    for pool_name, pool in state["sc_pools"].items():
        pool["used_this_year"] = 0
        # Check for operational year triggers (BWXT fuel fab)
        op_year = pool.get("operational_year")
        if op_year is not None and current_year >= op_year:
            if pool_name == "fuel_fabrication_units_per_year":
                pool["capacity_per_year"] = max(pool["capacity_per_year"], 1)

    # v3.0: Commission completed builds — iterate asset_registry (source of truth)
    to_commission = []
    for i, entry in enumerate(state["asset_registry"]):
        if entry['origin'] != 'player' or entry.get('commissioned') is True or entry['lifecycle'] == 'retired':
            continue
        if entry['operational_year'] is not None and entry['operational_year'] <= current_year:
            to_commission.append(i)

    for idx in to_commission:
        entry = state["asset_registry"][idx]
        state, _ = apply_action(
            state, entry["action_id"], entry["geoid"],
            entry["magnitude"], _skip_coupling=True
        )
        # Mark as commissioned in the NEW state's asset_registry
        state["asset_registry"][idx]["commissioned"] = True
        state["asset_registry"][idx]["lifecycle"] = "operating"

    # Re-materialize build_queue view after commissions
    state["build_queue"] = _materialize_build_queue(state["asset_registry"])

    # Re-evaluate couplings after all commissions
    state = _evaluate_couplings(state)

    # Apply depreciation (simplified: 0.1% per year on all EES)
    for geoid, ees in state["county_ees"].items():
        for cap in ("E", "Ec", "S"):
            baseline = ees.get(f"{cap}_baseline", ees[cap])
            current = ees[cap]
            if current > baseline:
                ees[cap] = max(baseline, current * 0.999)

    # Apply fiscal depreciation (5%/yr on industrial/commercial property)
    for geoid, cf in state.get("county_fiscal", {}).items():
        for cls_key in ("assessed_industrial", "assessed_commercial"):
            baseline_key = cls_key.replace("assessed_", "assessed_") + "_baseline"
            # Only depreciate additions above baseline (baseline is stable)
            # The baseline isn't tracked per-class, so we depreciate the
            # property_tax delta from additions. Simplified: reduce the
            # property_tax addition effect by 5%/yr.
            pass  # Property tax depreciation is handled via the coefficient notes
            # The 20-yr straight-line proxy means property_tax_annual values
            # already represent year-1 revenue. Depreciation for subsequent
            # years is applied here.
        # Depreciate any added property tax above the baseline level
        if cf.get("fiscal_actions"):
            for fa in cf["fiscal_actions"]:
                if fa.get("property_tax_delta", 0) > 0:
                    # Each year, the property tax contribution from this action
                    # depreciates by 5% (20-yr straight-line proxy)
                    years_since = current_year - fa.get("commission_year", current_year)
                    if years_since > 0:
                        depreciation_factor = max(0.0, 1.0 - 0.05 * years_since)
                        fa["property_tax_current"] = fa["property_tax_delta"] * depreciation_factor

    # v3.0: execute scheduled retirements
    retired_any = False
    for asset in state["asset_registry"]:
        if (asset.get("scheduled_retirement_year") == current_year
                and asset["lifecycle"] == "operating"):
            asset["lifecycle"] = "retired"
            retired_any = True
            # Reverse capacity through existing network heuristic
            cap = asset.get("capacity_mw")
            if cap is not None and cap > 0:
                bus_id = _resolve_geoid_to_bus(state, asset["geoid"])
                if bus_id and bus_id in state["bus_state"]:
                    state["bus_state"][bus_id]["capacity_mw"] -= cap
                    state["bus_state"][bus_id]["firm_capacity_mw"] -= cap
    if retired_any:
        state["build_queue"] = _materialize_build_queue(state["asset_registry"])
        state["existing_assets"] = _materialize_existing_assets(state["asset_registry"])

    return state


# ═══════════════════════════════════════════════════════════════════════════════
# PART 5 — inject_disturbance()
# ═══════════════════════════════════════════════════════════════════════════════

def inject_disturbance(state, disturbance_type, severity, geoids=None):
    """
    Inject a disturbance event. In v2, supports both:
    - New signature: inject_disturbance(state, type, severity, geoids)
    - Legacy signature: inject_disturbance(state, disturbance_id, parameters)
      where parameters is a dict with ecoregion_code/severity keys.

    For v2 calls with geoids: severity is a float multiplier (1.0-3.0σ).
    Flexible loads (industrial_load_flexible) shed first before firm load.
    """
    state = _shallow_copy_state(state)

    # ── Handle legacy v1 call signature ──────────────────────────────────────
    if isinstance(severity, dict):
        # Legacy: inject_disturbance(state, disturbance_id, parameters_dict)
        parameters = severity
        disturbance_id = disturbance_type
        return _inject_disturbance_v1(state, disturbance_id, parameters)

    # ── v2 path ──────────────────────────────────────────────────────────────
    coeffs = DISTURBANCE_COEFFICIENTS.get(disturbance_type)
    if coeffs is None:
        raise ValueError(f"Unknown disturbance_type '{disturbance_type}'")

    if geoids is None:
        geoids = list(state["county_ees"].keys())

    ees_delta = {}
    flexible_load_shed_mw = 0.0
    firm_load_affected_mw = 0.0
    total_deficit_change = 0.0
    reliability_score_change = 0.0

    if disturbance_type == "heat_wave":
        # For each affected county, apply EES impacts
        for geoid in geoids:
            if geoid not in state["county_ees"]:
                continue
            county_delta = {}
            for capital in ("E", "Ec", "S"):
                coeff_key = f"{capital}_per_severity"
                delta = coeffs.get(coeff_key, 0.0) * severity
                old_val = state["county_ees"][geoid][capital]
                new_val = max(0.0, min(10.0, old_val + delta))
                state["county_ees"][geoid][capital] = new_val
                county_delta[capital] = new_val - old_val
            ees_delta[geoid] = county_delta

        # Load spike on affected buses + flexible load shedding
        affected_buses = set()
        for geoid in geoids:
            bus_id = _resolve_geoid_to_bus(state, geoid)
            if bus_id:
                affected_buses.add(bus_id)

        # Snapshot pre-disturbance load and apply spike to affected buses only
        # Scoped to primary buses for the given county GEOIDs
        pre_load = {}
        for bus_id in affected_buses:
            if bus_id not in state["buses"]:
                continue
            bus = state["buses"][bus_id]
            pre_load[bus_id] = bus["load_mw"]
            load_spike = bus["load_mw"] * coeffs["load_spike_fraction"] * severity
            bus["load_mw"] += load_spike

            # Update bus_state
            bs = state["bus_state"].get(bus_id, {})
            bs["load_mw"] = bus["load_mw"]
            state["bus_state"][bus_id] = bs

        # Flexible load shedding: industrial_load_flexible actions shed first
        for record in state["action_history"]:
            if record["action_id"] == "industrial_load_flexible":
                rec_geoid = record.get("geoid", record.get("location"))
                if rec_geoid in geoids or (geoids and rec_geoid in geoids):
                    flex_attr = state["action_library"]["actions"].get(
                        "industrial_load_flexible", {}
                    ).get("flexibility", 0.4)
                    shed_mw = record["magnitude"] * flex_attr * min(severity / 3.0, 1.0)
                    flexible_load_shed_mw += shed_mw

                    # Reduce load on the bus
                    bus_id = _resolve_geoid_to_bus(state, rec_geoid)
                    if bus_id and bus_id in state["buses"]:
                        state["buses"][bus_id]["load_mw"] -= shed_mw
                        bs = state["bus_state"].get(bus_id, {})
                        bs["load_mw"] = state["buses"][bus_id]["load_mw"]
                        state["bus_state"][bus_id] = bs

        # Also check build_queue for commissioned flexible loads
        for entry in state["build_queue"]:
            if entry.get("commissioned") and entry["action_id"] == "industrial_load_flexible":
                rec_geoid = entry["geoid"]
                if rec_geoid in geoids:
                    flex_attr = state["action_library"]["actions"].get(
                        "industrial_load_flexible", {}
                    ).get("flexibility", 0.4)
                    shed_mw = entry["magnitude"] * flex_attr * min(severity / 3.0, 1.0)
                    flexible_load_shed_mw += shed_mw
                    bus_id = _resolve_geoid_to_bus(state, rec_geoid)
                    if bus_id and bus_id in state["buses"]:
                        state["buses"][bus_id]["load_mw"] -= shed_mw
                        bs = state["bus_state"].get(bus_id, {})
                        bs["load_mw"] = state["buses"][bus_id]["load_mw"]
                        state["bus_state"][bus_id] = bs

        # Compute firm load affected: only disturbance-caused excess
        # Compare post-spike-post-shed deficit to pre-disturbance deficit per bus
        for bus_id in affected_buses:
            bs = state["bus_state"].get(bus_id, {})
            firm_cap = bs.get("firm_capacity_mw", 0.0)
            load_before = pre_load[bus_id]
            load_after = bs.get("load_mw", 0.0)
            pre_excess = max(0.0, load_before - firm_cap)
            post_excess = max(0.0, load_after - firm_cap)
            firm_load_affected_mw += max(0.0, post_excess - pre_excess)

        # Deficit change
        for bus_id in affected_buses:
            bs = state["bus_state"].get(bus_id, {})
            old_deficit = bs.get("deficit_mw", 0.0)
            new_deficit = max(0.0, bs.get("load_mw", 0.0) - bs.get("firm_capacity_mw", 0.0))
            bs["deficit_mw"] = new_deficit
            total_deficit_change += new_deficit - old_deficit
            state["bus_state"][bus_id] = bs

        # Reliability score change (proportional to severity)
        reliability_score_change = -0.05 * severity

    # ── Record ───────────────────────────────────────────────────────────────
    disturbance_record = {
        "disturbance_type": disturbance_type,
        "severity": severity,
        "geoids": geoids,
        "ees_delta": ees_delta,
        "flexible_load_shed_mw": flexible_load_shed_mw,
        "firm_load_affected_mw": firm_load_affected_mw,
        "deficit_mw_change": total_deficit_change,
        "reliability_score_change": reliability_score_change,
        "timestamp": state["timestamp"],
    }
    state["disturbance_history"].append(disturbance_record)
    state["timestamp"] += 1

    delta_summary = {
        "disturbance_type": disturbance_type,
        "severity": severity,
        "geoids": geoids,
        "ees_delta": ees_delta,
        "flexible_load_shed_mw": flexible_load_shed_mw,
        "firm_load_affected_mw": firm_load_affected_mw,
        "deficit_mw_change": total_deficit_change,
        "reliability_score_change": reliability_score_change,
    }

    return state, delta_summary


def _inject_disturbance_v1(state, disturbance_id, parameters):
    """Legacy v1 disturbance injection for backward compatibility."""
    coeffs = DISTURBANCE_COEFFICIENTS.get(disturbance_id)
    if coeffs is None:
        # Try action library disturbances
        lib_dist = state["action_library"].get("disturbances", {})
        lib_entry = lib_dist.get(disturbance_id)
        if lib_entry and any(k.endswith("_per_severity") or k.endswith("_per_year")
                             or k.endswith("_immediate") or k.endswith("_per_week")
                             for k in lib_entry):
            coeffs = lib_entry
        else:
            raise ValueError(f"Unknown disturbance_id '{disturbance_id}'")

    ees_delta = {}

    if disturbance_id == "heat_wave":
        eco_code = parameters["ecoregion_code"]
        sev = float(parameters["severity"])
        ees_delta[eco_code] = {
            "E": coeffs["E_per_severity"] * sev,
            "Ec": coeffs["Ec_per_severity"] * sev,
            "S": coeffs["S_per_severity"] * sev,
        }
        for capital, delta in ees_delta[eco_code].items():
            old = state["ecoregion_ees"][eco_code][capital]
            state["ecoregion_ees"][eco_code][capital] = max(0.0, min(10.0, old + delta))
        for bus_id, b in state["buses"].items():
            if b["ecoregion_code"] == eco_code:
                b["load_mw"] *= (1 + coeffs["load_spike_fraction"] * sev)

    elif disturbance_id == "drought":
        eco_code = parameters["ecoregion_code"]
        duration = float(parameters["duration_years"])
        ees_delta[eco_code] = {
            "E": coeffs["E_per_year"] * duration,
            "Ec": coeffs["Ec_per_year"] * duration,
            "S": coeffs["S_per_year"] * duration,
        }
        for capital, delta in ees_delta[eco_code].items():
            old = state["ecoregion_ees"][eco_code][capital]
            state["ecoregion_ees"][eco_code][capital] = max(0.0, min(10.0, old + delta))
        for bus_id, b in state["buses"].items():
            if b["ecoregion_code"] == eco_code and b["fuel_mix"].get("hydro", 0) > 0:
                hydro_mw = b["fuel_mix"]["hydro"]
                reduction_frac = min(coeffs["hydro_reduction_per_year"] * duration,
                                     coeffs["max_hydro_reduction"])
                reduction_mw = hydro_mw * reduction_frac
                b["fuel_mix"]["hydro"] -= reduction_mw
                b["generation_mw"] -= reduction_mw

    elif disturbance_id == "mine_closure":
        bus_id = str(parameters["bus_id"])
        closure_mw = float(parameters["closure_mw"])
        b = state["buses"][bus_id]
        coal_mw = b["fuel_mix"].get("coal", 0.0)
        actual_closure = min(closure_mw, coal_mw)
        b["fuel_mix"]["coal"] -= actual_closure
        b["generation_mw"] -= actual_closure
        eco_code = b["ecoregion_code"]
        if eco_code:
            e_recovery = coeffs["E_recovery_per_500mw"] * (actual_closure / 500.0)
            ees_delta[eco_code] = {"E": e_recovery, "Ec": coeffs["Ec_immediate"], "S": coeffs["S_immediate"]}
            for capital, delta in ees_delta[eco_code].items():
                old = state["ecoregion_ees"][eco_code][capital]
                state["ecoregion_ees"][eco_code][capital] = max(0.0, min(10.0, old + delta))

    elif disturbance_id == "transmission_failure":
        branch_id = str(parameters["branch_id"])
        duration_weeks = float(parameters["duration_weeks"])
        state["branches"][branch_id]["active"] = False
        branch = state["branches"][branch_id]
        affected_bus_ids = [branch["from_bus"], branch["to_bus"]]
        affected_ecoregions = list(set(
            state["buses"][b]["ecoregion_code"]
            for b in affected_bus_ids
            if b in state["buses"] and state["buses"][b]["ecoregion_code"]
        ))
        for eco_code in affected_ecoregions:
            ees_delta[eco_code] = {
                "E": 0.0, "Ec": coeffs["Ec_per_week"] * duration_weeks,
                "S": coeffs["S_per_week"] * duration_weeks,
            }
            for capital, delta in ees_delta[eco_code].items():
                old = state["ecoregion_ees"][eco_code][capital]
                state["ecoregion_ees"][eco_code][capital] = max(0.0, min(10.0, old + delta))

    disturbance_record = {
        "disturbance_id": disturbance_id, "parameters": parameters,
        "ees_delta": ees_delta, "timestamp": state["timestamp"],
    }
    state["disturbance_history"].append(disturbance_record)
    state["timestamp"] += 1

    return state, {"disturbance_id": disturbance_id, "parameters": parameters, "ees_delta": ees_delta}


# ═══════════════════════════════════════════════════════════════════════════════
# PART 6 — compute_ees_summary()
# ═══════════════════════════════════════════════════════════════════════════════

def _nearest_scenario(state):
    """Find nearest scenario profile by Euclidean distance in EES space."""
    # Use county EES if available, else fall back to ecoregion
    if state.get("county_ees"):
        vals = list(state["county_ees"].values())
        pops = [v.get("population", 1) for v in vals]
        total_pop = sum(pops)
        if total_pop > 0:
            E_curr = sum(v["E"] * p for v, p in zip(vals, pops)) / total_pop
            Ec_curr = sum(v["Ec"] * p for v, p in zip(vals, pops)) / total_pop
            S_curr = sum(v["S"] * p for v, p in zip(vals, pops)) / total_pop
        else:
            n = len(vals)
            E_curr = sum(v["E"] for v in vals) / n
            Ec_curr = sum(v["Ec"] for v in vals) / n
            S_curr = sum(v["S"] for v in vals) / n
    else:
        ees_vals = list(state["ecoregion_ees"].values())
        n = len(ees_vals)
        if n == 0:
            return None
        E_curr = sum(v["E"] for v in ees_vals) / n
        Ec_curr = sum(v["Ec"] for v in ees_vals) / n
        S_curr = sum(v["S"] for v in ees_vals) / n

    profiles = state.get("scenario_profiles", {})
    best_id = None
    best_dist = float("inf")
    for pid, profile in profiles.items():
        if pid.startswith("_"):
            continue
        targets = profile.get("targets", {})
        E_t = float(targets.get("E", 5.0))
        Ec_t = float(targets.get("Ec", 5.0))
        S_t = float(targets.get("S", 5.0))
        dist = ((E_curr - E_t)**2 + (Ec_curr - Ec_t)**2 + (S_curr - S_t)**2)**0.5
        if dist < best_dist:
            best_dist = dist
            best_id = pid

    if best_id is None:
        return None
    bp = profiles[best_id]
    return {
        "scenario_id": best_id, "scenario_name": bp.get("scenario_name", best_id),
        "distance": round(best_dist, 4), "targets": bp.get("targets", {}),
        "group": bp.get("group", ""), "conditions": bp.get("conditions", []),
        "ecoregion_gaps": bp.get("ecoregion_gaps", {}),
    }


def compute_ees_summary(state):
    """
    Compute multi-scale EES summary.

    Returns dict with keys: county, by_ecoregion, by_ba, study_area,
    nearest_scenario, unmet_conditions.
    """
    # ── county-level ─────────────────────────────────────────────────────────
    county_summary = {}
    for geoid, ees in state.get("county_ees", {}).items():
        county_summary[geoid] = {
            "E": round(ees["E"], 4), "Ec": round(ees["Ec"], 4), "S": round(ees["S"], 4),
        }

    # ── by_ecoregion (retained) ──────────────────────────────────────────────
    by_ecoregion = {}
    for code, ees in state.get("ecoregion_ees", {}).items():
        by_ecoregion[code] = {
            "E": round(ees["E"], 4), "Ec": round(ees["Ec"], 4), "S": round(ees["S"], 4),
            "E_baseline": round(ees.get("E_baseline", ees["E"]), 4),
            "Ec_baseline": round(ees.get("Ec_baseline", ees["Ec"]), 4),
            "S_baseline": round(ees.get("S_baseline", ees["S"]), 4),
            "E_delta": round(ees["E"] - ees.get("E_baseline", ees["E"]), 4),
            "Ec_delta": round(ees["Ec"] - ees.get("Ec_baseline", ees["Ec"]), 4),
            "S_delta": round(ees["S"] - ees.get("S_baseline", ees["S"]), 4),
        }

    # ── by_ba ────────────────────────────────────────────────────────────────
    by_ba = {}
    xw = state.get("crosswalk")
    if xw is not None:
        # Group counties by their primary bus BA
        primary_xw = xw[xw['primary_bus'] == True].drop_duplicates('geoid')
        buses = state["buses"]
        ba_acc = {}
        for _, row in primary_xw.iterrows():
            geoid = row['geoid']
            bus_id = str(row['bus_id'])
            bus = buses.get(bus_id)
            if bus is None or geoid not in state.get("county_ees", {}):
                continue
            ba = bus['ba_code']
            pop = state["county_ees"][geoid].get("population", 1)
            ees = state["county_ees"][geoid]
            if ba not in ba_acc:
                ba_acc[ba] = {"E": 0, "Ec": 0, "S": 0, "pop": 0, "n": 0}
            ba_acc[ba]["E"] += ees["E"] * pop
            ba_acc[ba]["Ec"] += ees["Ec"] * pop
            ba_acc[ba]["S"] += ees["S"] * pop
            ba_acc[ba]["pop"] += pop
            ba_acc[ba]["n"] += 1

        for ba, acc in ba_acc.items():
            if acc["pop"] > 0:
                by_ba[ba] = {
                    "E": round(acc["E"] / acc["pop"], 4),
                    "Ec": round(acc["Ec"] / acc["pop"], 4),
                    "S": round(acc["S"] / acc["pop"], 4),
                    "n_counties": acc["n"],
                }

    # ── study_area ───────────────────────────────────────────────────────────
    county_vals = list(state.get("county_ees", {}).values())
    if county_vals:
        pops = [v.get("population", 1) for v in county_vals]
        total_pop = sum(pops)
        if total_pop > 0:
            study_area = {
                "E": round(sum(v["E"] * p for v, p in zip(county_vals, pops)) / total_pop, 4),
                "Ec": round(sum(v["Ec"] * p for v, p in zip(county_vals, pops)) / total_pop, 4),
                "S": round(sum(v["S"] * p for v, p in zip(county_vals, pops)) / total_pop, 4),
            }
        else:
            n = len(county_vals)
            study_area = {
                "E": round(sum(v["E"] for v in county_vals) / n, 4),
                "Ec": round(sum(v["Ec"] for v in county_vals) / n, 4),
                "S": round(sum(v["S"] for v in county_vals) / n, 4),
            }
        # Add baselines
        study_area["E_baseline"] = round(sum(v.get("E_baseline", v["E"]) * p
                                             for v, p in zip(county_vals, pops)) / max(total_pop, 1), 4)
        study_area["Ec_baseline"] = round(sum(v.get("Ec_baseline", v["Ec"]) * p
                                              for v, p in zip(county_vals, pops)) / max(total_pop, 1), 4)
        study_area["S_baseline"] = round(sum(v.get("S_baseline", v["S"]) * p
                                             for v, p in zip(county_vals, pops)) / max(total_pop, 1), 4)
    else:
        # Fall back to ecoregion
        ees_vals = list(state["ecoregion_ees"].values())
        n = len(ees_vals)
        if n > 0:
            study_area = {
                "E": round(sum(v["E"] for v in ees_vals) / n, 4),
                "Ec": round(sum(v["Ec"] for v in ees_vals) / n, 4),
                "S": round(sum(v["S"] for v in ees_vals) / n, 4),
                "E_baseline": round(sum(v["E_baseline"] for v in ees_vals) / n, 4),
                "Ec_baseline": round(sum(v["Ec_baseline"] for v in ees_vals) / n, 4),
                "S_baseline": round(sum(v["S_baseline"] for v in ees_vals) / n, 4),
            }
        else:
            study_area = {k: 0.0 for k in ("E", "Ec", "S", "E_baseline", "Ec_baseline", "S_baseline")}

    nearest = _nearest_scenario(state)
    unmet_conditions = []
    if nearest:
        for cond in nearest.get("conditions", []):
            entry = dict(cond)
            entry["requires_external_input"] = (cond.get("type") == "policy")
            unmet_conditions.append(entry)

    return {
        "county": county_summary,
        "by_ecoregion": by_ecoregion,
        "by_ba": by_ba,
        "study_area": study_area,
        "nearest_scenario": nearest,
        "unmet_conditions": unmet_conditions,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 7 — get_material_ledger()
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_action_capex(action, magnitude):
    if "atb_capex_2025" in action:
        return float(action["atb_capex_2025"]) * 1000.0 * float(magnitude)
    if "atb_capex_2023" in action:
        return float(action["atb_capex_2023"]) * 1000.0 * float(magnitude)
    if "cost_2024" in action:
        return float(action["cost_2024"]) * float(magnitude)
    return 0.0


def get_material_ledger(state):
    """Summarize materials consumed and estimated CAPEX."""
    actions_lib = state["action_library"]["actions"]
    summary = {
        mat_type: {"total": round(v["total"], 2), "unit": v["unit"]}
        for mat_type, v in state["material_ledger"].items()
    }
    by_action_type = {}
    by_location = {}
    total_capex_usd = 0.0

    for record in state["action_history"]:
        action_id = record["action_id"]
        location = record["location"]
        magnitude = record["magnitude"]
        action = actions_lib.get(action_id, {})
        capex = _compute_action_capex(action, magnitude)
        total_capex_usd += capex

        if action_id not in by_action_type:
            by_action_type[action_id] = {"capex_usd": 0.0, "count": 0, "materials": {}}
        by_action_type[action_id]["capex_usd"] += capex
        by_action_type[action_id]["count"] += 1

        if location not in by_location:
            by_location[location] = {"capex_usd": 0.0, "count": 0, "materials": {}}
        by_location[location]["capex_usd"] += capex
        by_location[location]["count"] += 1

    for mat_type, mat_data in state["material_ledger"].items():
        for entry in mat_data.get("by_action", []):
            aid = entry["action_id"]
            loc = entry["location"]
            qty = entry["quantity"]
            if aid in by_action_type:
                mats = by_action_type[aid]["materials"]
                mats[mat_type] = round(mats.get(mat_type, 0.0) + qty, 2)
            if loc in by_location:
                mats = by_location[loc]["materials"]
                mats[mat_type] = round(mats.get(mat_type, 0.0) + qty, 2)

    for v in by_action_type.values():
        v["capex_usd"] = round(v["capex_usd"], 2)
    for v in by_location.values():
        v["capex_usd"] = round(v["capex_usd"], 2)

    return {
        "summary": summary, "by_action_type": by_action_type,
        "by_location": by_location, "total_capex_usd": round(total_capex_usd, 2),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 8 — get_pathway_conditions()
# ═══════════════════════════════════════════════════════════════════════════════

def get_pathway_conditions(state, scenario_profile=None):
    """Return nearest scenario, EES gaps, and condition status."""
    nearest = _nearest_scenario(state)

    # Current study-area mean EES
    county_vals = list(state.get("county_ees", {}).values())
    if county_vals:
        pops = [v.get("population", 1) for v in county_vals]
        total_pop = sum(pops)
        if total_pop > 0:
            E_curr = sum(v["E"] * p for v, p in zip(county_vals, pops)) / total_pop
            Ec_curr = sum(v["Ec"] * p for v, p in zip(county_vals, pops)) / total_pop
            S_curr = sum(v["S"] * p for v, p in zip(county_vals, pops)) / total_pop
        else:
            n = len(county_vals)
            E_curr = sum(v["E"] for v in county_vals) / n
            Ec_curr = sum(v["Ec"] for v in county_vals) / n
            S_curr = sum(v["S"] for v in county_vals) / n
    else:
        ees_vals = list(state["ecoregion_ees"].values())
        n = len(ees_vals) or 1
        E_curr = sum(v["E"] for v in ees_vals) / n
        Ec_curr = sum(v["Ec"] for v in ees_vals) / n
        S_curr = sum(v["S"] for v in ees_vals) / n

    current_ees = {"E": round(E_curr, 4), "Ec": round(Ec_curr, 4), "S": round(S_curr, 4)}

    if nearest:
        t = nearest["targets"]
        target_gaps = {}
        for cap, curr in [("E", E_curr), ("Ec", Ec_curr), ("S", S_curr)]:
            tgt = float(t.get(cap, 5.0))
            target_gaps[cap] = {
                "target": tgt, "current": round(curr, 4),
                "gap": round(tgt - curr, 4), "met": curr >= tgt,
            }
        conditions = []
        for cond in nearest.get("conditions", []):
            entry = dict(cond)
            entry["requires_external_input"] = (cond.get("type") == "policy")
            conditions.append(entry)
        ecoregion_gaps = nearest.get("ecoregion_gaps", {})
        scenario_summary = {
            "scenario_id": nearest["scenario_id"],
            "scenario_name": nearest["scenario_name"],
            "distance": nearest["distance"],
            "targets": nearest["targets"],
            "group": nearest["group"],
        }
    else:
        target_gaps = {}
        conditions = []
        ecoregion_gaps = {}
        scenario_summary = None

    return {
        "nearest_scenario": scenario_summary, "current_ees": current_ees,
        "targets": target_gaps, "conditions": conditions,
        "ecoregion_gaps": ecoregion_gaps,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 9 — get_county_card()
# ═══════════════════════════════════════════════════════════════════════════════

def get_county_card(state, geoid):
    """
    Merge static baseline card data with live state for a county.
    """
    geoid = str(geoid).zfill(5)
    cards = state.get("county_cards", {})
    baseline = cards.get(geoid, {})

    # Live EES
    live_ees = state.get("county_ees", {}).get(geoid, {})

    # Primary bus state
    bus_id = _resolve_geoid_to_bus(state, geoid)
    bus_live = {}
    if bus_id:
        bs = state.get("bus_state", {}).get(bus_id, {})
        bus_live = {
            "bus_id": bus_id,
            "capacity_mw": bs.get("capacity_mw", 0.0),
            "firm_capacity_mw": bs.get("firm_capacity_mw", 0.0),
            "load_mw": bs.get("load_mw", 0.0),
            "deficit_mw": bs.get("deficit_mw", 0.0),
            "storage_mwh": bs.get("storage_mwh", 0.0),
        }

    # Queued builds for this county
    queued = [
        {"action_id": e["action_id"], "magnitude": e["magnitude"],
         "decision_year": e["decision_year"], "operational_year": e["operational_year"],
         "throttle_reason": e.get("throttle_reason"),
         "commissioned": e.get("commissioned", False)}
        for e in state.get("build_queue", [])
        if e.get("geoid") == geoid
    ]

    # Active couplings for this county
    couplings = [
        c for c in state.get("active_couplings", [])
        if c.get("demand_geoid") == geoid or c.get("supply_geoid") == geoid
    ]

    result = dict(baseline)
    result.update({
        "E": live_ees.get("E", baseline.get("E", 0.0)),
        "Ec": live_ees.get("Ec", baseline.get("Ec", 0.0)),
        "S": live_ees.get("S", baseline.get("S", 0.0)),
        "county_load_mw": live_ees.get("load_mw", 0.0),
        "county_added_firm_mw": live_ees.get("added_firm_mw", 0.0),
        "county_deficit_mw": live_ees.get("deficit_mw", 0.0),
        "bus_state": bus_live,
        "queued_builds": queued,
        "active_couplings": couplings,
    })
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# PART 10 — recompute_network() (retained from v1)
# ═══════════════════════════════════════════════════════════════════════════════

def recompute_network(state):
    """Rebuild the sensitivity matrix from current bus/BA-flow state."""
    state = _shallow_copy_state(state)
    matrix, bus_index = _build_sensitivity_matrix(state)
    state["sensitivity_matrix"] = matrix
    state["sensitivity_bus_index"] = bus_index
    state["drift_pct"] = 0.0
    state["recompute_recommended"] = False
    summary = {
        "matrix_shape": list(matrix.shape),
        "n_buses": len(bus_index),
        "last_calibration_mw": round(state["last_calibration_mw"], 1),
        "drift_reset": True,
    }
    return state, summary


# ═══════════════════════════════════════════════════════════════════════════════
# PART 11 — Fiscal Layer Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _apply_fiscal_effects(state, action_id, geoid, magnitude):
    """
    Apply fiscal effects of an action to a county's fiscal state.
    Returns a fiscal_delta dict summarizing changes, or None if no fiscal data.
    """
    county_fiscal = state.get("county_fiscal", {})
    fiscal_coefficients = state.get("fiscal_coefficients", {})

    if not geoid or geoid not in county_fiscal:
        return None

    action_coeffs = fiscal_coefficients.get(action_id, {})
    if not action_coeffs:
        return None

    cf = county_fiscal[geoid]
    current_year = state.get("year", 2025)

    ledger_a_delta = 0.0
    ledger_b_delta = 0.0
    ledger_c_delta = 0.0
    property_tax_delta = 0.0
    sales_use_delta = 0.0

    # ── Property tax (from new assessed value) ───────────────────────────────
    pt_entry = action_coeffs.get("property_tax_annual", {}).get(geoid)
    if pt_entry:
        pt_value = pt_entry.get("value", 0.0) or 0.0
        property_tax_delta = pt_value
        cf["property_tax"] += pt_value

    # ── Sales/use tax (one-time construction) ────────────────────────────────
    suc_entry = action_coeffs.get("sales_use_construction", {})
    if isinstance(suc_entry, dict) and "value" in suc_entry:
        suc_value = suc_entry.get("value", 0.0) or 0.0
        sales_use_delta = suc_value
        cf["sales_use"] += suc_value

    # ── Ledger A: coal retirement ad valorem production delta ────────────────
    av_entry = action_coeffs.get("coal_retirement_advalorem_delta_per_mw", {}).get(geoid)
    if av_entry:
        av_per_mw = av_entry.get("value", 0.0) or 0.0
        ledger_a_delta = av_per_mw * magnitude
        cf["advalorem_production"] += ledger_a_delta
        cf["ledger_a_cumulative_delta"] += ledger_a_delta

        # Update assessed mineral value proportionally
        assessed_delta_per_mw = av_entry.get("assessed_delta_per_mw", 0.0) or 0.0
        mineral_av_change = assessed_delta_per_mw * magnitude
        cf["assessed_mineral"] += mineral_av_change

    # ── Ledger B: coal retirement severance delta ────────────────────────────
    sev_entry = action_coeffs.get("coal_retirement_severance_delta_per_mw", {}).get(geoid)
    if sev_entry:
        sev_per_mw = sev_entry.get("value", 0.0) or 0.0
        ledger_b_delta = sev_per_mw * magnitude
        cf["severance_share"] += ledger_b_delta
        cf["ledger_b_cumulative_delta"] += ledger_b_delta

    # ── Ledger C: school finance net sensitivity ─────────────────────────────
    # When mineral AV changes, recapture changes proportionally to the
    # mineral share of the county's school finance base.
    # For a recapture county (net < 0): losing mineral AV reduces recapture
    # obligation (less negative = fiscal gain, positive delta).
    sf_entry = action_coeffs.get("school_finance_net", {}).get(geoid)
    if sf_entry and av_entry:
        sf_net_total = sf_entry.get("school_finance_net_total", {}).get("value", 0.0) or 0.0
        sf_mineral_share = sf_entry.get("school_finance_mineral_share", {}).get("value", 0.0) or 0.0
        baseline_mineral_av = cf.get("assessed_mineral_baseline", 1.0) or 1.0

        if baseline_mineral_av > 0 and sf_mineral_share > 0:
            assessed_delta_per_mw = av_entry.get("assessed_delta_per_mw", 0.0) or 0.0
            mineral_av_change = assessed_delta_per_mw * magnitude
            # Fraction of mineral AV lost
            mineral_frac_change = mineral_av_change / baseline_mineral_av
            # School finance sensitivity: net_total * mineral_share * frac_change
            # Sign: if net_total < 0 (recapture) and mineral drops (frac < 0),
            # the double-negative product is positive (recapture shrinks = fiscal gain)
            ledger_c_delta = sf_net_total * sf_mineral_share * mineral_frac_change
            cf["school_finance_net"] += ledger_c_delta
            cf["ledger_c_cumulative_delta"] += ledger_c_delta

    # ── Record fiscal action ─────────────────────────────────────────────────
    fiscal_action = {
        "action_id": action_id,
        "commission_year": current_year,
        "magnitude": magnitude,
        "ledger_a_delta": ledger_a_delta,
        "ledger_b_delta": ledger_b_delta,
        "ledger_c_delta": ledger_c_delta,
        "property_tax_delta": property_tax_delta,
        "sales_use_delta": sales_use_delta,
    }
    cf["fiscal_actions"].append(fiscal_action)

    return {
        "geoid": geoid,
        "ledger_a_delta": ledger_a_delta,
        "ledger_b_delta": ledger_b_delta,
        "ledger_c_delta": ledger_c_delta,
        "property_tax_delta": property_tax_delta,
        "sales_use_delta": sales_use_delta,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 12 — get_county_fiscal()
# ═══════════════════════════════════════════════════════════════════════════════

def get_county_fiscal(state, geoid):
    """
    Return the fiscal state for a county including three-ledger breakdown.
    Ledger A (advalorem_production), Ledger B (severance_share), and
    Ledger C (school_finance_net) are independently readable — never pre-summed.
    """
    geoid = str(geoid).zfill(5)
    county_fiscal = state.get("county_fiscal", {})
    cf = county_fiscal.get(geoid)
    if cf is None:
        return None

    # Build trajectories from fiscal_actions
    a_traj = []
    b_traj = []
    c_traj = []
    a_running = cf.get("advalorem_production", 0.0) - cf.get("ledger_a_cumulative_delta", 0.0)
    b_running = cf.get("severance_share", 0.0) - cf.get("ledger_b_cumulative_delta", 0.0)
    c_running = cf.get("school_finance_net", 0.0) - cf.get("ledger_c_cumulative_delta", 0.0)

    for fa in cf.get("fiscal_actions", []):
        a_running += fa.get("ledger_a_delta", 0.0)
        b_running += fa.get("ledger_b_delta", 0.0)
        c_running += fa.get("ledger_c_delta", 0.0)
        a_traj.append({"year": fa["commission_year"], "level": round(a_running, 2)})
        b_traj.append({"year": fa["commission_year"], "level": round(b_running, 2)})
        c_traj.append({"year": fa["commission_year"], "level": round(c_running, 2)})

    return {
        "geoid": geoid,
        "assessed_values": {
            "mineral": round(cf["assessed_mineral"], 2),
            "industrial": round(cf["assessed_industrial"], 2),
            "commercial": round(cf["assessed_commercial"], 2),
            "residential": round(cf["assessed_residential"], 2),
            "agricultural": round(cf["assessed_agricultural"], 2),
            "all_other": round(cf["assessed_all_other"], 2),
        },
        "revenue_by_source": {
            "property_tax": round(cf["property_tax"], 2),
            "advalorem_production": round(cf["advalorem_production"], 2),
            "severance_share": round(cf["severance_share"], 2),
            "federal_royalty_share": round(cf["federal_royalty_share"], 2),
            "sales_use": round(cf["sales_use"], 2),
            "pilt": round(cf["pilt"], 2),
            "school_finance_net": round(cf["school_finance_net"], 2),
        },
        "ledger_a": round(cf["advalorem_production"], 2),
        "ledger_b": round(cf["severance_share"], 2),
        "ledger_c": round(cf["school_finance_net"], 2),
        "ledger_a_cumulative_delta": round(cf["ledger_a_cumulative_delta"], 2),
        "ledger_b_cumulative_delta": round(cf["ledger_b_cumulative_delta"], 2),
        "ledger_c_cumulative_delta": round(cf["ledger_c_cumulative_delta"], 2),
        "ledger_a_trajectory": a_traj,
        "ledger_b_trajectory": b_traj,
        "ledger_c_trajectory": c_traj,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 13 — state_digest() and fiscal_digest()
# ═══════════════════════════════════════════════════════════════════════════════

def state_digest(state):
    """
    Create a JSON-serializable digest of the final state.
    Covers county_ees, bus_state, couplings, sc_pools, year.
    This is the ORIGINAL digest — unchanged from v2.0 to preserve
    Golden A/B/C byte-identical digests.
    """
    county_ees = {}
    for geoid, ees in state['county_ees'].items():
        county_ees[geoid] = {
            "E": round(ees["E"], 6),
            "Ec": round(ees["Ec"], 6),
            "S": round(ees["S"], 6),
        }

    bus_summary = {}
    for bid, bs in state.get('bus_state', {}).items():
        cap = bs.get('capacity_mw', 0)
        load = bs.get('load_mw', 0)
        deficit = bs.get('deficit_mw', 0)
        if cap > 0 or load > 0 or deficit > 0:
            bus_summary[bid] = {
                "capacity_mw": round(cap, 4),
                "load_mw": round(load, 4),
                "deficit_mw": round(deficit, 4),
            }

    digest = {
        "county_ees": county_ees,
        "bus_state_summary": bus_summary,
        "active_couplings": state.get('active_couplings', []),
        "sc_pools": {k: {"capacity_per_year": v.get("capacity_per_year", 0),
                         "used_this_year": v.get("used_this_year", 0)}
                     for k, v in state.get('sc_pools', {}).items()},
        "year": state.get('year', 2025),
    }

    canonical = json.dumps(digest, sort_keys=True, separators=(',', ':'))
    digest["md5"] = hashlib.md5(canonical.encode()).hexdigest()

    return digest


def fiscal_digest(state):
    """
    Create a separate JSON-serializable digest covering the full
    state['county_fiscal'] structure, including three-ledger breakdown.
    """
    county_fiscal = state.get("county_fiscal", {})
    if not county_fiscal:
        return {"county_fiscal": {}, "md5": hashlib.md5(b'{}').hexdigest()}

    digest_data = {}
    for geoid in sorted(county_fiscal.keys()):
        cf = county_fiscal[geoid]
        digest_data[geoid] = {
            "assessed_mineral": round(cf["assessed_mineral"], 2),
            "assessed_industrial": round(cf["assessed_industrial"], 2),
            "assessed_commercial": round(cf["assessed_commercial"], 2),
            "assessed_residential": round(cf["assessed_residential"], 2),
            "assessed_agricultural": round(cf["assessed_agricultural"], 2),
            "assessed_all_other": round(cf["assessed_all_other"], 2),
            "mill_levy_mills": round(cf["mill_levy_mills"], 6),
            "property_tax": round(cf["property_tax"], 2),
            "advalorem_production": round(cf["advalorem_production"], 2),
            "severance_share": round(cf["severance_share"], 2),
            "federal_royalty_share": round(cf["federal_royalty_share"], 2),
            "sales_use": round(cf["sales_use"], 2),
            "pilt": round(cf["pilt"], 2),
            "school_finance_net": round(cf["school_finance_net"], 2),
            "school_finance_mineral_share": round(cf["school_finance_mineral_share"], 6),
            "ledger_a_cumulative_delta": round(cf["ledger_a_cumulative_delta"], 2),
            "ledger_b_cumulative_delta": round(cf["ledger_b_cumulative_delta"], 2),
            "ledger_c_cumulative_delta": round(cf["ledger_c_cumulative_delta"], 2),
        }

    digest = {"county_fiscal": digest_data, "year": state.get("year", 2025)}
    canonical = json.dumps(digest, sort_keys=True, separators=(',', ':'))
    digest["md5"] = hashlib.md5(canonical.encode()).hexdigest()

    return digest


# ═══════════════════════════════════════════════════════════════════════════════
# PART 14 — Existing Assets API (Phase W5)
# ═══════════════════════════════════════════════════════════════════════════════

def get_existing_assets(state, geoid):
    """
    Return the live existing_assets entries for a county (excluded entries filtered out).
    Returns a list of asset dicts with capacity_mw set (not None).
    """
    geoid = str(geoid).zfill(5)
    all_entries = state.get('existing_assets', {}).get(geoid, [])
    return [e for e in all_entries if e.get('excluded') is None]


def existing_assets_digest(state):
    """
    Create a JSON-serializable digest of the existing_assets inventory.
    Covers all entries (live, production_asset, and excluded) for all counties.
    Stable across reruns — seeded only at initialize_state.
    Modified by reduce_production_asset() when production_volume changes.
    """
    ea = state.get('existing_assets', {})
    digest_data = {}
    for geoid in sorted(ea.keys()):
        entries = ea[geoid]
        digest_data[geoid] = [
            {
                'asset_kind': e.get('asset_kind'),          # 'mw_asset' | 'production_asset' | None (excluded)
                'name': e['name'],
                'status': e['status'],
                'capacity_mw': e.get('capacity_mw'),
                'type': e['type'],
                'coal_tons_yr': e.get('coal_tons_yr'),
                'excluded': e.get('excluded'),
                'fiscal_action_id': e.get('fiscal_action_id'),
                # production_asset-specific (null for mw_asset / excluded entries)
                'advalorem_rate_per_unit': e.get('advalorem_rate_per_unit'),
                'assessed_delta_per_unit': e.get('assessed_delta_per_unit'),
                'commodity': e.get('commodity'),
                'county_distribution_share': e.get('county_distribution_share'),
                'production_unit': e.get('production_unit'),
                'production_volume': e.get('production_volume'),
            }
            for e in entries
        ]
    digest = {'existing_assets': digest_data}
    canonical = json.dumps(digest, sort_keys=True, separators=(',', ':'))
    digest['md5'] = hashlib.md5(canonical.encode()).hexdigest()
    return digest


# ═══════════════════════════════════════════════════════════════════════════════
# PART 15 — Production Asset Reduction API (Phase X2)
# ═══════════════════════════════════════════════════════════════════════════════

def reduce_production_asset(state, geoid, commodity, delta_volume, year=None):
    """
    X2: Reduce the production_volume of a live production_asset.

    Three-ledger fiscal impact:
      Ledger B (severance): applied immediately — rate × county_distribution_share × delta.
      Ledger A (advalorem): applied if advalorem_rate_per_unit is set (confidence: low for
                            PRB coal using 90% W2 proxy). No distribution share — rate is
                            already county-specific.
      Ledger C (school finance): applied if assessed_delta_per_unit is set — proportional
                                 change in mineral AV drives recapture sensitivity. For
                                 Campbell (recapture county), a production decrease shrinks
                                 recapture burden → positive ledger_c_delta.

    Args:
        state: engine state dict
        geoid: 5-digit county FIPS string (or int)
        commodity: e.g. 'coal_surface'
        delta_volume: positive number — tons/yr (or commodity units) to remove
        year: commission year for fiscal record; defaults to state['year']

    Returns:
        (new_state, delta_summary)
        delta_summary keys: geoid, commodity, delta_volume, new_volume,
                            ledger_a_delta, ledger_b_delta, ledger_c_delta, ledger_a_status
    """
    geoid = str(geoid).zfill(5)
    if year is None:
        year = state['year']

    ea = state.get('existing_assets', {})
    entries = list(ea.get(geoid, []))

    # Locate the matching live production_asset
    target_idx = None
    for i, e in enumerate(entries):
        if (e.get('asset_kind') == 'production_asset'
                and e.get('commodity') == commodity
                and e.get('excluded') is None):
            target_idx = i
            break

    if target_idx is None:
        return state, {
            'error': f'No live production_asset for geoid={geoid} commodity={commodity}',
        }

    old_entry = entries[target_idx]
    old_volume = old_entry['production_volume']
    new_volume = max(0.0, old_volume - delta_volume)
    actual_delta = old_volume - new_volume  # floored at 0 if delta_volume > old_volume

    # ── Ledger B (severance share) ────────────────────────────────────────────
    rate = old_entry.get('effective_severance_rate_per_unit', 0.0)
    share = old_entry.get('county_distribution_share', 0.0)
    ledger_b_delta = round(-actual_delta * rate * share, 2)

    # ── Ledger A (advalorem — county direct, no distribution share) ──────────
    advalorem_rate = old_entry.get('advalorem_rate_per_unit')
    ledger_a_delta = 0.0
    if advalorem_rate is not None:
        ledger_a_delta = round(-actual_delta * advalorem_rate, 2)
    ledger_a_status = ('deferred (MANUAL_FETCH Item 1 pending)'
                       if advalorem_rate is None else 'applied')

    # ── Mineral AV change (drives Ledger A assessed_mineral update + Ledger C) ─
    assessed_delta_unit = old_entry.get('assessed_delta_per_unit')
    mineral_av_change = 0.0
    if assessed_delta_unit is not None:
        mineral_av_change = assessed_delta_unit * actual_delta   # negative = AV loss

    # ── Build new state ───────────────────────────────────────────────────────
    new_state = _shallow_copy_state(state)

    new_entry = dict(old_entry)
    new_entry['production_volume'] = new_volume
    entries[target_idx] = new_entry

    new_ea = dict(ea)
    new_ea[geoid] = entries
    new_state['existing_assets'] = new_ea

    # v3.0: also update registry source of truth
    for reg_a in new_state.get('asset_registry', []):
        if (reg_a['origin'] == 'baseline'
                and reg_a['asset_class'] == 'production'
                and reg_a['geoid'] == geoid
                and reg_a.get('commodity') == commodity):
            reg_a['production_volume'] = new_volume
            break

    # ── Apply to county_fiscal (all three ledgers) ────────────────────────────
    ledger_c_delta = 0.0
    if geoid in new_state.get('county_fiscal', {}):
        cf = dict(new_state['county_fiscal'][geoid])

        # Ledger B — severance distribution
        cf['severance_share'] = round(cf['severance_share'] + ledger_b_delta, 2)
        cf['ledger_b_cumulative_delta'] = round(
            cf.get('ledger_b_cumulative_delta', 0.0) + ledger_b_delta, 2
        )

        # Ledger A — advalorem production tax + assessed mineral AV update
        if ledger_a_delta != 0.0:
            cf['advalorem_production'] = round(
                cf.get('advalorem_production', 0.0) + ledger_a_delta, 2
            )
            cf['ledger_a_cumulative_delta'] = round(
                cf.get('ledger_a_cumulative_delta', 0.0) + ledger_a_delta, 2
            )
            if mineral_av_change != 0.0:
                cf['assessed_mineral'] = round(
                    cf.get('assessed_mineral', 0.0) + mineral_av_change, 2
                )

        # Ledger C — school finance recapture sensitivity
        if mineral_av_change != 0.0:
            baseline_av = cf.get('assessed_mineral_baseline', 0.0)
            sf_share = cf.get('school_finance_mineral_share', 0.0)
            if baseline_av > 0 and sf_share > 0:
                mineral_frac_change = mineral_av_change / baseline_av
                # Back-calculate baseline school finance net (current minus cumulative delta)
                sf_net_baseline = (
                    cf.get('school_finance_net', 0.0)
                    - cf.get('ledger_c_cumulative_delta', 0.0)
                )
                ledger_c_delta = round(
                    sf_net_baseline * sf_share * mineral_frac_change, 2
                )
                cf['school_finance_net'] = round(
                    cf.get('school_finance_net', 0.0) + ledger_c_delta, 2
                )
                cf['ledger_c_cumulative_delta'] = round(
                    cf.get('ledger_c_cumulative_delta', 0.0) + ledger_c_delta, 2
                )

        fa = {
            'action_id': f'production_decline_{commodity}',
            'commission_year': year,
            'magnitude': actual_delta,
            'ledger_a_delta': ledger_a_delta,
            'ledger_b_delta': ledger_b_delta,
            'ledger_c_delta': ledger_c_delta,
            'property_tax_delta': 0.0,
            'sales_use_delta': 0.0,
        }
        cf['fiscal_actions'] = cf.get('fiscal_actions', []) + [fa]
        new_state['county_fiscal'] = dict(new_state['county_fiscal'])
        new_state['county_fiscal'][geoid] = cf

    delta_summary = {
        'action': 'reduce_production_asset',
        'geoid': geoid,
        'commodity': commodity,
        'delta_volume': actual_delta,
        'new_volume': new_volume,
        'ledger_a_delta': ledger_a_delta,
        'ledger_b_delta': ledger_b_delta,
        'ledger_c_delta': ledger_c_delta,
        'ledger_a_status': ledger_a_status,
    }
    return new_state, delta_summary


# ═══════════════════════════════════════════════════════════════════════════════
# PART 16 — Retirement Transitions (v3.0)
# ═══════════════════════════════════════════════════════════════════════════════

def schedule_retirement(state, asset_id, year):
    """
    Schedule a retirement for an operating baseline asset.
    Pure function — returns new state with updated registry.
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["lifecycle"] != "operating":
        raise ValueError(f"Cannot schedule retirement for asset in lifecycle '{asset['lifecycle']}'")
    if asset["asset_class"] not in ("generator", "demand", "storage"):
        raise ValueError(f"Cannot schedule retirement for asset_class '{asset['asset_class']}'")
    state["asset_registry"][idx]["scheduled_retirement_year"] = year
    return state


def accelerate_retirement(state, asset_id, new_year):
    """
    Move a scheduled retirement earlier.
    Pure function — returns new state.
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["scheduled_retirement_year"] is None:
        raise ValueError(f"Asset {asset_id} has no scheduled retirement to accelerate")
    if new_year >= asset["scheduled_retirement_year"]:
        raise ValueError(
            f"new_year {new_year} must be earlier than current {asset['scheduled_retirement_year']}"
        )
    state["asset_registry"][idx]["scheduled_retirement_year"] = new_year
    return state


def delay_retirement(state, asset_id, new_year):
    """
    Push a scheduled retirement later. Returns (new_state, {'delay_cost_hook': 0}).
    delay_cost_hook is zeroed out (coefficient placeholder, confidence: low).
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["scheduled_retirement_year"] is None:
        raise ValueError(f"Asset {asset_id} has no scheduled retirement to delay")
    if new_year <= asset["scheduled_retirement_year"]:
        raise ValueError(
            f"new_year {new_year} must be later than current {asset['scheduled_retirement_year']}"
        )
    state["asset_registry"][idx]["scheduled_retirement_year"] = new_year
    return state, {"delay_cost_hook": 0}


def cancel_queued(state, asset_id):
    """
    Cancel a player-queued asset before commissioning.
    Returns (new_state, {'sunk_cost_fraction': 0}).
    sunk_cost_fraction is zeroed out (price hook for Z2).
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["origin"] != "player":
        raise ValueError(f"cancel_queued only applies to player-origin assets, got '{asset['origin']}'")
    if asset["lifecycle"] not in ("queued", "under_construction"):
        raise ValueError(f"Cannot cancel asset in lifecycle '{asset['lifecycle']}'")
    state["asset_registry"][idx]["lifecycle"] = "retired"
    state["build_queue"] = _materialize_build_queue(state["asset_registry"])
    return state, {"sunk_cost_fraction": 0}
