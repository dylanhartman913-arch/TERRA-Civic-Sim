"""
climate_couplings.py — TERRA C3 Climate Coupling Functions

Pure functions that compute climate-driven modifiers for demand, water-stress,
and heat derates. No engine state is stored; every function takes
(geoid, year, climate_context) and returns a modifier + attribution dict.

Design constraints (C0/C1.6):
  - Delta coupling only: Δ = scenario_value − historical_value
  - p50 only in physics (p10/p90 are for UI fan displays)
  - Epoch interpolation: linear between windows, no extrapolation past last window
  - Historical lens → all couplings return identity (1.0)
"""

import json
from pathlib import Path

# ── Epoch doctrine (frozen from NB23c / county_climate_projections.json) ─────

EPOCH_MIDPOINTS = [
    ('2030', 2030.0),
    ('2040', 2040.0),
    ('2050', 2050.0),
    ('2065', 2065.0),
]

# Weights from epoch_doctrine.mapping
# epoch_value = lower_window * (1 - weight_upper) + upper_window * weight_upper
_EPOCH_WEIGHTS = {
    '2030': {'lower': 'historical', 'upper': '2035', 'weight_upper': 49.0 / 60.0},
    '2040': {'lower': '2035',       'upper': '2050', 'weight_upper': 0.3},
    '2050': {'lower': '2035',       'upper': '2050', 'weight_upper': 29.0 / 30.0},
    '2065': {'lower': '2050',       'upper': '2065', 'weight_upper': 29.0 / 30.0},
}

# Variables used by coupling functions
COUPLING_VARIABLES = ('cdd', 'hdd', 'water_stress_index', 'days_gt_95f')

# Thermal fuel types affected by water-stress and heat derates
THERMAL_DERATE_FUELS = frozenset({'coal', 'gas', 'nuclear'})

# ── Demand coupling coefficients ─────────────────────────────────────────────

DEMAND_COEFFICIENTS = {
    'beta_cdd': 0.0001,    # +0.01% demand per CDD of warming
    'beta_hdd': 0.00002,   # +0.002% demand per HDD of warming (sign: HDD decreases → demand decreases)
    'confidence': 'medium',
    'sources': {
        'beta_cdd': (
            'Auffhammer, M. & Mansur, E.T. (2014) "Measuring climatic impacts on '
            'energy consumption: A review of the empirical literature," JEL 52(4); '
            'Deschênes, O. & Greenstone, M. (2011) "Climate change, mortality, and '
            'adaptation," AER 101(2). Conservative central for Mountain West '
            '(moderate AC penetration growth, low industrial cooling share).'
        ),
        'beta_hdd': (
            'Li, Y. et al. (2019) "Temperature and electricity demand," '
            'Nature Energy 4; adjusted for Mountain West electric heating share '
            '(~15%, EIA RECS 2020). Western grid heating is predominantly gas, '
            'so electric demand sensitivity to HDD is low.'
        ),
    },
}

# ── Water stress derate coefficients ─────────────────────────────────────────

WATER_STRESS_DERATE = {
    'sensitivity_per_unit_wsi': 0.30,
    'max_derate': 0.15,
    'affected_fuel_types': THERMAL_DERATE_FUELS,
    'confidence': 'low',   # inherited from WSI confidence (C1.6: literature-composed)
    'source': (
        'EPRI (2011) "Water Use for Electric Power Generation"; '
        'Macknick, J. et al. (2012) "Operational water consumption and withdrawal '
        'factors for electricity generating technologies," NREL/TP-6A20-50900. '
        'WSI itself is a literature-composed index (C1.6, confidence: low); '
        'all derived derates carry this low confidence.'
    ),
}

# ── Heat derate coefficients ─────────────────────────────────────────────────

HEAT_DERATE = {
    'sensitivity_per_day_gt_95f': 0.0005,
    'max_derate': 0.05,
    'affected_fuel_types': THERMAL_DERATE_FUELS,
    'confidence': 'medium',
    'source': (
        'NERC "2024 Summer Reliability Assessment"; '
        'Bartos, M.D. & Chester, M.V. (2015) "Impacts of climate change on '
        'electric power supply in the Western United States," Nature Climate Change 5. '
        '~0.05% thermal efficiency loss per additional day >95°F.'
    ),
    'gaps': [
        'transmission_thermal_limit: no per-branch thermal rating hook exists '
        'in engine — deferred to C4/C5',
    ],
}


# ═════════════════════════════════════════════════════════════════════════════
# Historical baseline back-derivation
# ═════════════════════════════════════════════════════════════════════════════

def _back_derive_window_values(ep2030, ep2040, ep2050, ep2065):
    """
    Algebraically recover the 30-year climatology window values
    (historical, 2035, 2050, 2065) from the interpolated epoch values.

    The epoch_doctrine maps each epoch to:
        epoch_value = lower_window × (1 − weight_upper) + upper_window × weight_upper

    With 4 epoch equations and 4 window unknowns, the system is fully determined.
    """
    # Weights for the 2040 and 2050 epoch equations (share same windows: 2035, 2050)
    a1 = 1.0 - _EPOCH_WEIGHTS['2040']['weight_upper']   # 0.7
    b1 = _EPOCH_WEIGHTS['2040']['weight_upper']          # 0.3
    a2 = 1.0 - _EPOCH_WEIGHTS['2050']['weight_upper']    # 1/30
    b2 = _EPOCH_WEIGHTS['2050']['weight_upper']           # 29/30

    # Solve 2×2 system for w2035, w2050
    det = a1 * b2 - b1 * a2
    w2035 = (ep2040 * b2 - b1 * ep2050) / det
    w2050 = (ep2050 - a2 * w2035) / b2

    # 2065 window from epoch 2065
    a3 = 1.0 - _EPOCH_WEIGHTS['2065']['weight_upper']    # 1/30
    b3 = _EPOCH_WEIGHTS['2065']['weight_upper']           # 29/30
    w2065 = (ep2065 - a3 * w2050) / b3

    # Historical window from epoch 2030
    a0 = 1.0 - _EPOCH_WEIGHTS['2030']['weight_upper']    # 11/60
    b0 = _EPOCH_WEIGHTS['2030']['weight_upper']           # 49/60
    w_hist = (ep2030 - b0 * w2035) / a0

    return w_hist, w2035, w2050, w2065


def _derive_historical_baselines(records, variables=COUPLING_VARIABLES):
    """
    Derive historical baselines for each county × variable by back-solving
    from the processed epoch values. Uses the average of ssp245- and ssp370-
    derived baselines (both share the same historical window; differences are
    from pipeline rounding).

    Returns: {variable: {geoid: historical_value}}
    """
    # Collect p50 epoch values per (lens, variable, geoid)
    by_key = {}
    for r in records:
        if r['percentile'] != 'p50':
            continue
        if r['metric'] not in variables:
            continue
        key = (r['lens'], r['metric'], r['geoid'])
        if key not in by_key:
            by_key[key] = {}
        by_key[key][r['epoch']] = r['value']

    # Back-derive per lens, then average
    baselines = {}
    for var in variables:
        baselines[var] = {}
        geoids = set()
        for (lens, metric, geoid), epochs in by_key.items():
            if metric == var:
                geoids.add(geoid)

        for geoid in sorted(geoids):
            hist_values = []
            for lens in ('ssp245', 'ssp370'):
                key = (lens, var, geoid)
                epochs = by_key.get(key, {})
                if len(epochs) == 4 and all(e in epochs for e in ('2030', '2040', '2050', '2065')):
                    w_hist, _, _, _ = _back_derive_window_values(
                        epochs['2030'], epochs['2040'],
                        epochs['2050'], epochs['2065'],
                    )
                    hist_values.append(w_hist)

            if hist_values:
                baselines[var][geoid] = sum(hist_values) / len(hist_values)

    return baselines


# ═════════════════════════════════════════════════════════════════════════════
# Delta table builder
# ═════════════════════════════════════════════════════════════════════════════

def build_delta_tables(projections_path_or_data, lens):
    """
    Build ClimateContext.tables from county_climate_projections.json.

    Filters to p50 + target lens, computes absolute deltas
    (epoch_value − historical_baseline), and returns tables matching
    the ClimateContext schema: {variable: {geoid: {epoch: delta_value}}}.

    Parameters
    ----------
    projections_path_or_data : str, Path, or dict
        Path to county_climate_projections.json, or pre-loaded data dict.
    lens : str
        'ssp245' or 'ssp370'.

    Returns
    -------
    dict
        {variable: {geoid: {epoch_str: delta}}} for COUPLING_VARIABLES.
    """
    if isinstance(projections_path_or_data, (str, Path)):
        with open(projections_path_or_data) as f:
            data = json.load(f)
    else:
        data = projections_path_or_data

    records = data['records']
    baselines = _derive_historical_baselines(records)

    tables = {}
    for var in COUPLING_VARIABLES:
        tables[var] = {}
        for r in records:
            if r['metric'] != var or r['percentile'] != 'p50' or r['lens'] != lens:
                continue
            geoid = r['geoid']
            epoch = r['epoch']
            hist = baselines.get(var, {}).get(geoid)
            if hist is None:
                continue
            delta = r['value'] - hist
            if geoid not in tables[var]:
                tables[var][geoid] = {}
            tables[var][geoid][epoch] = round(delta, 4)

    return tables


def build_delta_tables_from_slice(climate_table_slice):
    """
    Build delta tables directly from a pre-computed slice (for Golden L fixtures).
    The slice is already in {variable: {geoid: {epoch: delta}}} format.
    """
    return climate_table_slice


# ═════════════════════════════════════════════════════════════════════════════
# Epoch interpolation
# ═════════════════════════════════════════════════════════════════════════════

def interpolate_epoch_value(variable_table, geoid, year):
    """
    Linearly interpolate a delta value for a given county and run year.

    Uses EPOCH_MIDPOINTS: [(epoch_str, midpoint_year), ...].
    Clamps to endpoints (no extrapolation per doctrine).

    Parameters
    ----------
    variable_table : dict
        tables[variable] — {geoid: {epoch_str: delta_value}}.
    geoid : str
        5-digit FIPS code.
    year : int or float
        Simulation year.

    Returns
    -------
    float
        Interpolated delta value. Returns 0.0 if geoid not in table.
    """
    geoid_data = variable_table.get(geoid)
    if not geoid_data:
        return 0.0

    midpoints = EPOCH_MIDPOINTS
    n = len(midpoints)

    # Clamp to first epoch
    if year <= midpoints[0][1]:
        return geoid_data.get(midpoints[0][0], 0.0)

    # Clamp to last epoch
    if year >= midpoints[-1][1]:
        return geoid_data.get(midpoints[-1][0], 0.0)

    # Find bounding epochs and interpolate
    for i in range(n - 1):
        e_lo, y_lo = midpoints[i]
        e_hi, y_hi = midpoints[i + 1]
        if y_lo <= year <= y_hi:
            v_lo = geoid_data.get(e_lo, 0.0)
            v_hi = geoid_data.get(e_hi, 0.0)
            weight = (year - y_lo) / (y_hi - y_lo)
            return v_lo + (v_hi - v_lo) * weight

    # Fallback (should not reach)
    return 0.0


# ═════════════════════════════════════════════════════════════════════════════
# Coupling functions — each returns {modifier/derate_factor, attribution}
# ═════════════════════════════════════════════════════════════════════════════

def compute_demand_modifier(geoid, year, climate_context):
    """
    Compute the demand modifier for a county and year.

    Returns dict:
        modifier      — multiplicative factor (1.0 = no change)
        delta_cdd     — interpolated absolute CDD delta
        delta_hdd     — interpolated absolute HDD delta
        beta_cdd      — coefficient used
        beta_hdd      — coefficient used
        confidence    — 'medium'
        narrative     — human-readable attribution string
    """
    if climate_context['lens'] == 'historical':
        return {
            'modifier': 1.0,
            'delta_cdd': 0.0, 'delta_hdd': 0.0,
            'beta_cdd': DEMAND_COEFFICIENTS['beta_cdd'],
            'beta_hdd': DEMAND_COEFFICIENTS['beta_hdd'],
            'confidence': DEMAND_COEFFICIENTS['confidence'],
            'narrative': 'historical lens — no demand modulation',
        }

    tables = climate_context.get('tables', {})
    beta_cdd = DEMAND_COEFFICIENTS['beta_cdd']
    beta_hdd = DEMAND_COEFFICIENTS['beta_hdd']

    delta_cdd = interpolate_epoch_value(tables.get('cdd', {}), geoid, year)
    delta_hdd = interpolate_epoch_value(tables.get('hdd', {}), geoid, year)

    modifier = 1.0 + beta_cdd * delta_cdd + beta_hdd * delta_hdd

    cdd_pct = beta_cdd * delta_cdd * 100.0
    hdd_pct = beta_hdd * delta_hdd * 100.0
    total_pct = (modifier - 1.0) * 100.0

    return {
        'modifier': modifier,
        'delta_cdd': delta_cdd,
        'delta_hdd': delta_hdd,
        'beta_cdd': beta_cdd,
        'beta_hdd': beta_hdd,
        'confidence': DEMAND_COEFFICIENTS['confidence'],
        'narrative': (
            f'demand {total_pct:+.2f}% = '
            f'ΔCDD {delta_cdd:.1f} × β {beta_cdd*100:.3f}%/CDD ({cdd_pct:+.2f}%) + '
            f'ΔHDD {delta_hdd:.1f} × β {beta_hdd*100:.4f}%/HDD ({hdd_pct:+.2f}%)'
        ),
    }


def compute_water_stress_derate(geoid, year, climate_context):
    """
    Compute the water-stress capacity derate for a county and year.

    Only affects water-cooled thermal assets (coal, gas, nuclear).

    Returns dict:
        derate_factor — multiplicative factor on thermal firm capacity (1.0 = no derate)
        delta_wsi     — interpolated absolute WSI delta
        sensitivity   — coefficient used
        confidence    — 'low' (inherited from WSI)
        narrative     — attribution string
    """
    if climate_context['lens'] == 'historical':
        return {
            'derate_factor': 1.0,
            'delta_wsi': 0.0,
            'sensitivity': WATER_STRESS_DERATE['sensitivity_per_unit_wsi'],
            'confidence': WATER_STRESS_DERATE['confidence'],
            'narrative': 'historical lens — no water-stress derate',
        }

    tables = climate_context.get('tables', {})
    sensitivity = WATER_STRESS_DERATE['sensitivity_per_unit_wsi']
    max_derate = WATER_STRESS_DERATE['max_derate']

    delta_wsi = interpolate_epoch_value(
        tables.get('water_stress_index', {}), geoid, year,
    )

    raw_derate = sensitivity * max(0.0, delta_wsi)
    capped_derate = min(raw_derate, max_derate)
    derate_factor = 1.0 - capped_derate

    return {
        'derate_factor': derate_factor,
        'delta_wsi': delta_wsi,
        'sensitivity': sensitivity,
        'confidence': WATER_STRESS_DERATE['confidence'],
        'narrative': (
            f'water-stress derate {-capped_derate*100:.2f}% = '
            f'ΔWSI {delta_wsi:.4f} × sensitivity {sensitivity}/WSI '
            f'(capped at {max_derate*100:.0f}%)'
        ),
    }


def compute_heat_derate(geoid, year, climate_context):
    """
    Compute the heat-driven capacity derate for a county and year.

    Only affects thermal firm capacity where existing machinery has a hook
    (firm_capacity_mw). Transmission thermal limits have no hook — logged as gap.

    Returns dict:
        derate_factor       — multiplicative factor (1.0 = no derate)
        delta_days_gt_95f   — interpolated delta
        sensitivity         — coefficient used
        confidence          — 'medium'
        narrative           — attribution string
        gaps                — list of unfilled hooks for C4/C5
    """
    if climate_context['lens'] == 'historical':
        return {
            'derate_factor': 1.0,
            'delta_days_gt_95f': 0.0,
            'sensitivity': HEAT_DERATE['sensitivity_per_day_gt_95f'],
            'confidence': HEAT_DERATE['confidence'],
            'narrative': 'historical lens — no heat derate',
            'gaps': [],
        }

    tables = climate_context.get('tables', {})
    sensitivity = HEAT_DERATE['sensitivity_per_day_gt_95f']
    max_derate = HEAT_DERATE['max_derate']

    delta_d95 = interpolate_epoch_value(
        tables.get('days_gt_95f', {}), geoid, year,
    )

    raw_derate = sensitivity * max(0.0, delta_d95)
    capped_derate = min(raw_derate, max_derate)
    derate_factor = 1.0 - capped_derate

    return {
        'derate_factor': derate_factor,
        'delta_days_gt_95f': delta_d95,
        'sensitivity': sensitivity,
        'confidence': HEAT_DERATE['confidence'],
        'narrative': (
            f'heat derate {-capped_derate*100:.2f}% = '
            f'Δdays>95°F {delta_d95:.1f} × sensitivity {sensitivity}/day '
            f'(capped at {max_derate*100:.0f}%)'
        ),
        'gaps': list(HEAT_DERATE['gaps']),
    }
