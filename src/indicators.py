"""
indicators.py — TERRA Engine v4.0 Indicator Catalog
Additive companion to terra_engine.py. Does NOT modify any existing digest.
Golden A–H fixtures remain byte-identical.

Public API
----------
compute_indicator(state, indicator_id, scale='county', geoid=None, denominator=None)
snapshot_indicators(state) -> dict
"""

import hashlib
import json

# ── Module-level import of HOUSING_CONSTRUCTION_JOBS_PER_MW from terra_engine ─
# Keep in sync with terra_engine.py. Importing avoids duplication.
try:
    from terra_engine import (
        HOUSING_CONSTRUCTION_JOBS_PER_MW,
        HOUSEHOLD_FACTOR,
        HOUSING_PRESSURE_THRESHOLDS,
    )
except ImportError:
    # Fallback constants if terra_engine not on path (e.g. isolated test)
    HOUSING_CONSTRUCTION_JOBS_PER_MW = {
        'nuclear': 5.2,
        'coal': 2.0,
        'gas': 1.4,
        'wind': 0.4,
        'solar': 2.5,
        'storage': 0.5,
        'data_center': 3.0,
        'hydro': 1.5,
    }
    HOUSEHOLD_FACTOR = 0.65
    HOUSING_PRESSURE_THRESHOLDS = {
        'mild': 1.05,
        'moderate': 1.15,
        'stressed': 1.25,
        'crisis': 1.40,
    }

# ── Pool utilization indicator IDs ────────────────────────────────────────────
POOL_UTILIZATION_IDS = [
    'pool_utilization_HALEU_kg_per_year',
    'pool_utilization_fuel_fabrication_units_per_year',
    'pool_utilization_capital_cost_usd',
    'pool_utilization_labor_years',
    'pool_utilization_steel_tons',
    'pool_utilization_transmission_row_miles',
]

# Map from pool indicator ID → sc_pools key (only for the 2 live pools)
_POOL_INDICATOR_TO_KEY = {
    'pool_utilization_HALEU_kg_per_year': 'HALEU_kg_per_year',
    'pool_utilization_fuel_fabrication_units_per_year': 'fuel_fabrication_units_per_year',
}

# ── Indicator catalog ─────────────────────────────────────────────────────────

INDICATOR_CATALOG = {
    # ── Raw EES ──────────────────────────────────────────────────────────────
    'E': {
        'label': 'Economic Energy Score',
        'formula': 'county_ees[geoid]["E"] (direct). Study scale: population-weighted mean.',
        'units': 'dimensionless (0–10)',
        'scale': ['county', 'study'],
        'confidence_inputs': ['county_ees'],
    },
    'Ec': {
        'label': 'Ecological Energy Score',
        'formula': 'county_ees[geoid]["Ec"] (direct). Study scale: population-weighted mean.',
        'units': 'dimensionless (0–10)',
        'scale': ['county', 'study'],
        'confidence_inputs': ['county_ees'],
    },
    'S': {
        'label': 'Social Energy Score',
        'formula': 'county_ees[geoid]["S"] (direct). Study scale: population-weighted mean.',
        'units': 'dimensionless (0–10)',
        'scale': ['county', 'study'],
        'confidence_inputs': ['county_ees'],
    },

    # ── Fiscal (county scale) ─────────────────────────────────────────────────
    'fiscal_balance': {
        'label': 'Total Fiscal Balance',
        'formula': (
            'property_tax + advalorem_production + severance_share + federal_royalty_share '
            '+ pilt + sales_use + school_finance_net. '
            'Note: school_finance_net is negative for mineral recapture counties.'
        ),
        'units': 'USD/yr',
        'scale': ['county'],
        'confidence_inputs': ['county_fiscal'],
    },
    'cumulative_net': {
        'label': 'Cumulative Three-Ledger Net',
        'formula': (
            'ledger_a_cumulative_delta + ledger_b_cumulative_delta + ledger_c_cumulative_delta'
        ),
        'units': 'USD (cumulative since baseline)',
        'scale': ['county'],
        'confidence_inputs': ['county_fiscal'],
    },
    'payback_year': {
        'label': 'Property-Tax Payback Year',
        'formula': (
            'First year in state["history"] where cumulative '
            '(property_tax[t] - property_tax[history[0]]) >= capex_for_county. '
            'Returns None if no history, capex=0, or threshold not reached.'
        ),
        'units': 'year (int) or None',
        'scale': ['county'],
        'confidence_inputs': ['county_fiscal', 'action_history', 'history'],
        'note': (
            'Property-tax-based payback, not investor IRR. '
            'Nuclear capital intensity means payback_year > 2070 for Wyoming mill-levy rates '
            'with dual-SMR investment.'
        ),
    },
    'service_funding_per_capita': {
        'label': 'Service Funding Per Capita',
        'formula': 'school_finance_net / max(population, 1)',
        'units': 'USD/person/yr',
        'scale': ['county'],
        'confidence_inputs': ['county_fiscal', 'county_ees'],
    },

    # ── Labor (county scale) ──────────────────────────────────────────────────
    'labor_utilization': {
        'label': 'Labor Utilization (Construction)',
        'formula': (
            'incoming_construction_workforce / max(baseline_employment, 1). '
            'incoming_construction_workforce: for each asset in asset_registry at this geoid '
            'that is either (origin=baseline AND status=under_construction AND op_year > current_year) '
            'OR (origin=player AND commissioned=False AND op_year > current_year): '
            'sum capacity_mw × HOUSING_CONSTRUCTION_JOBS_PER_MW[type].'
        ),
        'units': 'ratio (0–∞, typically 0–0.5)',
        'scale': ['county'],
        'confidence_inputs': ['asset_registry', 'county_cards'],
    },
    'labor_headroom': {
        'label': 'Labor Headroom',
        'formula': 'max(0, 1 - labor_utilization)',
        'units': 'ratio (0–1)',
        'scale': ['county'],
        'confidence_inputs': ['asset_registry', 'county_cards'],
    },

    # ── Energy (county → primary bus) ─────────────────────────────────────────
    'firm_margin': {
        'label': 'Firm Capacity Margin',
        'formula': '(firm_capacity_mw - load_mw) / max(firm_capacity_mw, 1) using primary bus for county.',
        'units': 'ratio (can be negative for deficits)',
        'scale': ['county'],
        'confidence_inputs': ['bus_state', 'crosswalk'],
    },

    # ── Housing (county, re-registered from Z3) ───────────────────────────────
    'housing_pressure': {
        'label': 'Housing Pressure Ratio',
        'formula': (
            'housing_stock.housing_pressure_ratio from asset_registry. '
            'Reuses _compute_housing_pressure demand/supply computation from terra_engine.py (Z3). '
            'demand = occupied + incoming_workforce × HOUSEHOLD_FACTOR. '
            'supply = occupied + convertible + affordable_added.'
        ),
        'units': 'ratio (1.0 = balanced; >1.25 = stressed)',
        'scale': ['county'],
        'confidence_inputs': ['asset_registry'],
    },

    # ── Pool utilization (study scale) ───────────────────────────────────────
    'pool_utilization_HALEU_kg_per_year': {
        'label': 'HALEU Pool Utilization',
        'formula': 'used_this_year / max(capacity_per_year, 1); None if pool absent.',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': ['sc_pools'],
    },
    'pool_utilization_fuel_fabrication_units_per_year': {
        'label': 'Fuel Fabrication Pool Utilization',
        'formula': 'used_this_year / max(capacity_per_year, 1); None if pool absent.',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': ['sc_pools'],
    },
    'pool_utilization_capital_cost_usd': {
        'label': 'Capital Cost Pool Utilization (stub)',
        'formula': 'stub: returns None (pool not yet in engine, planned Session 3).',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': [],
        'note': 'Stub: capital_cost_usd pool not yet implemented in engine.',
    },
    'pool_utilization_labor_years': {
        'label': 'Labor Years Pool Utilization (stub)',
        'formula': 'stub: returns None.',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': [],
        'note': 'Stub: labor_years pool not yet implemented in engine.',
    },
    'pool_utilization_steel_tons': {
        'label': 'Steel Tons Pool Utilization (stub)',
        'formula': 'stub: returns None.',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': [],
        'note': 'Stub: steel_tons pool not yet implemented in engine.',
    },
    'pool_utilization_transmission_row_miles': {
        'label': 'Transmission ROW Pool Utilization (stub)',
        'formula': 'stub: returns None.',
        'units': 'ratio (0–1)',
        'scale': ['study'],
        'confidence_inputs': [],
        'note': 'Stub: transmission_row_miles pool not yet implemented in engine.',
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# Private helpers
# ═══════════════════════════════════════════════════════════════════════════════

# Map action IDs → fuel-type keys used in HOUSING_CONSTRUCTION_JOBS_PER_MW.
# Player assets use action_id as their 'type' field; this normalizes them.
_ACTION_ID_TO_FUEL_TYPE = {
    'smr_advanced': 'nuclear',
    'coal_to_smr': 'nuclear',
    'fusion_pilot': 'nuclear',
    'wind_utility': 'wind',
    'offshore_wind_great_lakes': 'wind',
    'solar_utility': 'solar',
    'coal_to_solar': 'solar',
    'coal_repowering': 'coal',
    'geothermal_utility': 'gas',  # closest proxy
    'hydropower_small': 'hydro',
    'pumped_hydro': 'hydro',
    'battery_grid': 'storage',
    'hydrogen_electrolysis': 'storage',
    'data_center_hyperscale': 'data_center',
    'data_center_campus_phase': 'data_center',
    'industrial_load_flexible': 'data_center',  # proxy
}


def _normalize_asset_type(raw_type):
    """Map action_id-style type strings to HOUSING_CONSTRUCTION_JOBS_PER_MW keys."""
    if raw_type in HOUSING_CONSTRUCTION_JOBS_PER_MW:
        return raw_type
    return _ACTION_ID_TO_FUEL_TYPE.get(raw_type, raw_type)


def _incoming_construction_workforce(state, geoid):
    """Sum incoming construction workers for a county from all active build/construction assets."""
    current_year = state.get('year', 2025)
    total = 0.0
    for a in state.get('asset_registry', []):
        if a.get('geoid') != geoid:
            continue
        if a.get('asset_class') in ('housing_stock', 'production'):
            continue
        op_year = a.get('operational_year')
        cap_mw = a.get('capacity_mw') or a.get('magnitude') or 0.0

        is_under_construction = (
            a.get('origin') == 'baseline'
            and a.get('status') == 'under_construction'
            and op_year is not None and op_year > current_year
        )
        is_player_queued = (
            a.get('origin') == 'player'
            and a.get('lifecycle') != 'retired'
            and a.get('commissioned') is False
            and op_year is not None and op_year > current_year
        )

        if is_under_construction or is_player_queued:
            asset_type = _normalize_asset_type(a.get('type', ''))
            jobs_per_mw = HOUSING_CONSTRUCTION_JOBS_PER_MW.get(asset_type, 0.0)
            total += cap_mw * jobs_per_mw
    return total


def _baseline_employment(state, geoid):
    """Get baseline employment for a county from county_cards."""
    cards = state.get('county_cards', {})
    card = cards.get(str(geoid).zfill(5), {})
    if isinstance(card, dict):
        return card.get('employment', 1) or 1
    return 1


def _capex_for_geoid(state, geoid):
    """
    Sum capex from action_history for a given geoid.
    Matches _compute_action_capex formula in terra_engine.py.
    """
    geoid_str = str(geoid).zfill(5)
    actions_lib = (state.get('action_library') or {}).get('actions', {})
    total = 0.0
    for record in state.get('action_history', []):
        rec_geoid = str(record.get('geoid') or record.get('location', '')).zfill(5)
        if rec_geoid != geoid_str:
            continue
        action_id = record.get('action_id', '')
        magnitude = record.get('magnitude', 0.0)
        action = actions_lib.get(action_id, {})
        if 'atb_capex_2025' in action:
            total += float(action['atb_capex_2025']) * 1000.0 * float(magnitude)
        elif 'atb_capex_2023' in action:
            total += float(action['atb_capex_2023']) * 1000.0 * float(magnitude)
        elif 'cost_2024' in action:
            total += float(action['cost_2024']) * float(magnitude)
    return total


def _primary_bus_for_geoid(state, geoid):
    """Find the primary bus ID for a county geoid via the crosswalk."""
    geoid_str = str(geoid).zfill(5)
    crosswalk = state.get('crosswalk')
    if crosswalk is None:
        return None
    # crosswalk may be a pandas DataFrame or list of dicts
    try:
        # pandas DataFrame
        mask = (crosswalk['geoid'] == geoid_str) & (crosswalk['primary_bus'] == True)
        rows = crosswalk[mask]
        if len(rows) > 0:
            return str(rows.iloc[0]['bus_id'])
        return None
    except (TypeError, KeyError):
        # list of dicts
        for row in crosswalk:
            if str(row.get('geoid', '')).zfill(5) == geoid_str and row.get('primary_bus'):
                return str(row.get('bus_id'))
        return None


def _wy_fiscal_geoids(state):
    """Return all geoids in county_fiscal (WY counties)."""
    return list(state.get('county_fiscal', {}).keys())


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════

def compute_indicator(state, indicator_id, scale='county', geoid=None, denominator=None):
    """
    Compute a single indicator from the current engine state.

    Parameters
    ----------
    state : dict — TERRA engine state
    indicator_id : str — from INDICATOR_CATALOG
    scale : str — 'county' | 'study'
    geoid : str | None — 5-char FIPS, required for county-scale indicators
    denominator : float | None — override denominator for per-capita calculations

    Returns float | int | None. Raises ValueError for unknown indicator_id.
    """
    if indicator_id not in INDICATOR_CATALOG:
        raise ValueError(f"Unknown indicator_id: {indicator_id!r}. "
                         f"Valid IDs: {sorted(INDICATOR_CATALOG)}")

    geoid_str = str(geoid).zfill(5) if geoid is not None else None

    # ── Raw EES ──────────────────────────────────────────────────────────────
    if indicator_id in ('E', 'Ec', 'S'):
        if scale == 'study':
            vals = list(state.get('county_ees', {}).values())
            if not vals:
                return None
            total_pop = sum(v.get('population', 1) or 1 for v in vals)
            if total_pop <= 0:
                n = len(vals)
                return sum(v.get(indicator_id, 0.0) for v in vals) / max(n, 1)
            return sum(v.get(indicator_id, 0.0) * (v.get('population', 1) or 1)
                       for v in vals) / total_pop
        # county scale
        ees = state.get('county_ees', {}).get(geoid_str)
        if ees is None:
            return None
        return ees.get(indicator_id)

    # ── Fiscal balance ────────────────────────────────────────────────────────
    if indicator_id == 'fiscal_balance':
        cf = state.get('county_fiscal', {}).get(geoid_str)
        if cf is None:
            return None
        return (
            cf.get('property_tax', 0.0)
            + cf.get('advalorem_production', 0.0)
            + cf.get('severance_share', 0.0)
            + cf.get('federal_royalty_share', 0.0)
            + cf.get('pilt', 0.0)
            + cf.get('sales_use', 0.0)
            + cf.get('school_finance_net', 0.0)
        )

    # ── Cumulative net ────────────────────────────────────────────────────────
    if indicator_id == 'cumulative_net':
        cf = state.get('county_fiscal', {}).get(geoid_str)
        if cf is None:
            return None
        return (
            cf.get('ledger_a_cumulative_delta', 0.0)
            + cf.get('ledger_b_cumulative_delta', 0.0)
            + cf.get('ledger_c_cumulative_delta', 0.0)
        )

    # ── Payback year ──────────────────────────────────────────────────────────
    if indicator_id == 'payback_year':
        history = state.get('history', [])
        if not history:
            return None
        capex = _capex_for_geoid(state, geoid_str)
        if capex <= 0:
            return None
        cf0 = state.get('county_fiscal', {}).get(geoid_str)
        if cf0 is None:
            return None
        baseline_pt = history[0].get('counties', {}).get(geoid_str, {}).get('property_tax', 0.0)
        cumulative = 0.0
        for snap in history:
            pt = snap.get('counties', {}).get(geoid_str, {}).get('property_tax', 0.0)
            cumulative += (pt - baseline_pt)
            if cumulative >= capex:
                return snap.get('year')
        return None

    # ── Service funding per capita ─────────────────────────────────────────────
    if indicator_id == 'service_funding_per_capita':
        cf = state.get('county_fiscal', {}).get(geoid_str)
        if cf is None:
            return None
        sfn = cf.get('school_finance_net', 0.0)
        if denominator is not None:
            pop = denominator
        else:
            ees = state.get('county_ees', {}).get(geoid_str, {})
            pop = ees.get('population', 1) or 1
        return sfn / max(pop, 1)

    # ── Labor utilization ─────────────────────────────────────────────────────
    if indicator_id == 'labor_utilization':
        workforce = _incoming_construction_workforce(state, geoid_str)
        baseline_emp = _baseline_employment(state, geoid_str)
        return workforce / max(baseline_emp, 1)

    # ── Labor headroom ────────────────────────────────────────────────────────
    if indicator_id == 'labor_headroom':
        lu = compute_indicator(state, 'labor_utilization', scale=scale, geoid=geoid_str)
        if lu is None:
            return None
        return max(0.0, 1.0 - lu)

    # ── Firm margin ───────────────────────────────────────────────────────────
    if indicator_id == 'firm_margin':
        bus_id = _primary_bus_for_geoid(state, geoid_str)
        if bus_id is None:
            return None
        bs = state.get('bus_state', {}).get(bus_id)
        if bs is None:
            return None
        firm_cap = bs.get('firm_capacity_mw', 0.0)
        load = bs.get('load_mw', 0.0)
        return (firm_cap - load) / max(firm_cap, 1.0)

    # ── Housing pressure ──────────────────────────────────────────────────────
    if indicator_id == 'housing_pressure':
        for a in state.get('asset_registry', []):
            if a.get('asset_class') == 'housing_stock' and a.get('geoid') == geoid_str:
                return a.get('housing_pressure_ratio')
        return None

    # ── Pool utilization ──────────────────────────────────────────────────────
    if indicator_id in POOL_UTILIZATION_IDS:
        pool_key = _POOL_INDICATOR_TO_KEY.get(indicator_id)
        if pool_key is None:
            return None  # stub pools
        pool = state.get('sc_pools', {}).get(pool_key)
        if pool is None:
            return None
        capacity = pool.get('capacity_per_year', 0)
        used = pool.get('used_this_year', 0)
        return used / max(capacity, 1)

    # Should not reach here — all IDs are handled above
    raise ValueError(f"Unhandled indicator_id: {indicator_id!r}")


def snapshot_indicators(state):
    """
    Compact per-year snapshot for history recording.

    Returns dict:
        year: int
        study: {E, Ec, S} — population-weighted mean, rounded to 6 dp
        counties: {geoid: {E, Ec, S, property_tax, cumulative_net,
                           labor_utilization, service_funding_per_capita}} — fiscal counties only (WY)
        pools: {pool_key: float | None} — 6 pool utilization values (short-name keys)

    Called by terra_engine.advance_year at the END of the year.
    """
    year = state.get('year', 2025)

    # Study-scale EES (population-weighted mean)
    vals = list(state.get('county_ees', {}).values())
    if vals:
        total_pop = sum(v.get('population', 1) or 1 for v in vals)
        if total_pop > 0:
            study_E  = sum(v.get('E', 0.0)  * (v.get('population', 1) or 1) for v in vals) / total_pop
            study_Ec = sum(v.get('Ec', 0.0) * (v.get('population', 1) or 1) for v in vals) / total_pop
            study_S  = sum(v.get('S', 0.0)  * (v.get('population', 1) or 1) for v in vals) / total_pop
        else:
            n = len(vals)
            study_E  = sum(v.get('E', 0.0)  for v in vals) / max(n, 1)
            study_Ec = sum(v.get('Ec', 0.0) for v in vals) / max(n, 1)
            study_S  = sum(v.get('S', 0.0)  for v in vals) / max(n, 1)
    else:
        study_E = study_Ec = study_S = None

    study = {
        'E':  round(study_E,  6) if study_E  is not None else None,
        'Ec': round(study_Ec, 6) if study_Ec is not None else None,
        'S':  round(study_S,  6) if study_S  is not None else None,
    }

    # Per-county snapshots (WY fiscal counties only)
    counties = {}
    for geoid, cf in state.get('county_fiscal', {}).items():
        ees = state.get('county_ees', {}).get(geoid, {})
        pop = ees.get('population', 1) or 1

        cumulative_net = (
            cf.get('ledger_a_cumulative_delta', 0.0)
            + cf.get('ledger_b_cumulative_delta', 0.0)
            + cf.get('ledger_c_cumulative_delta', 0.0)
        )

        workforce = _incoming_construction_workforce(state, geoid)
        baseline_emp = _baseline_employment(state, geoid)
        labor_util = workforce / max(baseline_emp, 1)

        sfpc = cf.get('school_finance_net', 0.0) / max(pop, 1)

        counties[geoid] = {
            'E':  round(ees.get('E',  0.0), 6),
            'Ec': round(ees.get('Ec', 0.0), 6),
            'S':  round(ees.get('S',  0.0), 6),
            'property_tax':             round(cf.get('property_tax', 0.0), 2),
            'cumulative_net':           round(cumulative_net, 2),
            'labor_utilization':        round(labor_util, 6),
            'service_funding_per_capita': round(sfpc, 4),
            # v4.2: live demographic denominators — _advance_population runs before this snapshot
            'population':             float(ees.get('population', 0)),
            'working_age_population': float(ees.get('working_age_population', 0)),
        }

    # Pool utilization (short-name keys, strip "pool_utilization_" prefix)
    pools = {}
    for indicator_id in POOL_UTILIZATION_IDS:
        short_key = indicator_id.replace('pool_utilization_', '')
        pool_key = _POOL_INDICATOR_TO_KEY.get(indicator_id)
        if pool_key is None:
            pools[short_key] = None
        else:
            pool = state.get('sc_pools', {}).get(pool_key)
            if pool is None:
                pools[short_key] = None
            else:
                capacity = pool.get('capacity_per_year', 0)
                used = pool.get('used_this_year', 0)
                pools[short_key] = used / max(capacity, 1)

    return {
        'year': year,
        'study': study,
        'counties': counties,
        'pools': pools,
    }
