"""
terra_engine.py — TERRA Engine v4.1
County-keyed state with build queue, coupling evaluation, supply-chain throttling,
and county fiscal layer (ad valorem / severance / school finance three-ledger model).
Phase W5 adds an existing_assets inventory layer seeded from county_cards flagship_assets.
Phase X2 adds the production_asset entry type (volume-keyed, not MW-keyed) and
reduce_production_asset() with full three-ledger support (A=advalorem, B=severance,
C=school-finance recapture sensitivity).
v3.0 adds unified asset_registry (source of truth); build_queue and existing_assets
become materialized views. Retirement transition family for EIA-860 scheduled retirements.
v3.1 adds lifecycle_coefficients.json consumption: autonomous PRB coal decline in
advance_year (player-overridable, off-switch in session_config), reclamation jobs arc
on production assets after any volume reduction, and priced Z1 hooks for delay_retirement
and cancel_queued (confidence: low, flagged). Golden G′ amends digests accordingly.
v3.3 (Z2): housing_stock asset class, housing pressure model, Golden H.
v4.0 (Z3): indicator catalog, per-year history snapshots, projection API, Golden J.
v4.1 (Z4): site asset class, succession discounts in queue_action, workforce pool decay
in advance_year. coal_to_smr generalised as convert transition (TX waiver from site;
TTD/capex NOT discounted — brownfield premium already in cost_2024). Golden I.

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
delay_retirement(state, asset_id, new_year) -> (state, {'delay_cost_hook': int, 'delay_cost_confidence': str})
cancel_queued(state, asset_id) -> (state, {'sunk_cost_fraction': float, 'sunk_cost_usd': int})

Engine version: 3.1
"""

import copy
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# v4.0: optional indicators module for per-year history snapshots
try:
    from indicators import snapshot_indicators as _snapshot_indicators
    _HAS_INDICATORS = True
except ImportError:
    _HAS_INDICATORS = False

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

# ── Housing stock constants (v3.3) ────────────────────────────────────────────
# Construction workforce per MW by asset type — for boomtown housing-pressure model.
# Source: NREL JEDI model v2023; TerraPower Kemmerer Final EIS (nuclear, 1,800 peak/345 MW ≈ 5.2)
HOUSING_CONSTRUCTION_JOBS_PER_MW = {
    'nuclear': 5.2,      # TerraPower Kemmerer EIS; NREL JEDI Nuclear
    'coal': 2.0,         # NREL JEDI Coal
    'gas': 1.4,          # NREL JEDI Natural Gas
    'wind': 0.4,         # NREL JEDI Wind
    'solar': 2.5,        # NREL JEDI Solar PV Utility
    'storage': 0.5,      # Proxy; NREL ATB battery storage
    'data_center': 3.0,  # Dodge Construction Network 2023; CBRE Data Center Report
    'hydro': 1.5,        # NREL JEDI Hydropower
}
# Share of incoming construction workers who form separate households (transient workforce).
# Source: NAHB "New Home Buyer Profile" 2023; workforce housing literature (70% transient,
# ~65% form distinct household units distinct from bunkhouse/camp arrangements).
HOUSEHOLD_FACTOR = 0.65
# S-capital pressure thresholds (demand/supply ratio).
HOUSING_PRESSURE_THRESHOLDS = {
    'mild': 1.05,      # Watch — incoming demand 5% above supply capacity
    'moderate': 1.15,  # 🏠 chip triggered — action recommended
    'stressed': 1.25,  # S-capital penalty begins (-0.005/step above moderate)
    'crisis': 1.40,    # Escalating S-capital penalty
}
WY_RESIDENTIAL_ASSESSMENT_RATIO = 0.095  # W.S. 39-13-103: residential property at 9.5%
# Per-unit rehabilitation cost basis for fiscal valuation of affordable conversions.
# Source: Enterprise Community Partners, "Affordable Housing Finance" 2022 edition;
# LIHTC Average Rehabilitation Cost (national) ≈ $150k/unit. Confidence: medium.
HOUSING_UNIT_REHAB_VALUE_USD = 150_000
# S-capital EES penalty per 0.05 step of housing pressure above the 'moderate' threshold.
# Applied annually in advance_year when pressure_ratio >= 'stressed' (1.25).
# Rationale: housing stress correlates with community quality-of-life decline
# (NLIHC 2023; Culhane & Metraux 2008). Magnitude is judgment-based; confidence: low.
HOUSING_PRESSURE_S_PENALTY_PER_STEP = -0.005

PRB_COAL_TONS_PER_MW_YR = 3743.4  # EIA Form 923 × PRB HHV × 0.70 CF (W2 proxy)

# ── EIA-7A / MSHA production data (X2 production_asset seeds) ─────────────────
# Source: EIA Annual Coal Report Table 2, 2024 (MSHA Form 7000-2; released Nov 2025)
EIA_7A_CAMPBELL_COAL_2024 = 170_045_000.0   # short tons/yr (surface, 11 mines)
EIA_7A_WY_COAL_2024       = 190_731_000.0   # short tons/yr WY state total
# W2 proxy comparison: 0.70606 × 233M = ~164.5M tons → EIA actual +3.4% higher
# Proxy errors cancel: county share 70.6% vs actual 89.2% offsets 2023 vs 2024 statewide

# ── Site spawning / succession mechanics (v4.1) ───────────────────────────────
# Compatibility table: retired-asset site_class → eligible successor action_ids
# with associated discounts.
#
# Literature anchor — Kemmerer/Naughton precedent:
#   • DOE (2022). "Investigating Benefits and Challenges of Converting Retiring Coal
#     Plants to Nuclear." DOE-NE-0000. Sites with existing interconnection and cooling
#     infrastructure cut projected siting timelines by 2–3 yr vs. greenfield.
#   • Gorman et al. (2022). "An Assessment of the Potential to Repurpose Nuclear Plant
#     Sites." LBNL 2022. Brownfield capex premium avoidance ~10–20% of overnight cost.
#   • TerraPower/PacifiCorp Kemmerer Unit 1: brownfield at retired Naughton gas plant;
#     existing 345 kV interconnection inherited — confirmed TX waiver precedent.
#
# Magnitudes are judgment-based. confidence: "low" throughout.
SITE_COMPAT = {
    'thermal': {
        # Coal, gas, nuclear plant sites — good for high-density firm-power successors
        'compatible_actions': frozenset([
            'smr_advanced', 'gas_combined_cycle',
        ]),
        'ttd_reduction_years': 2,           # DOE (2022): 2-3 yr faster permitting on brownfield
        'capex_discount_fraction': 0.15,    # Gorman et al. (2022): ~15% overnight cost saving
        'confidence': 'low',
    },
    'generator': {
        # Any retired MW-based generator — good for storage and demand assets
        'compatible_actions': frozenset([
            'battery_grid', 'pumped_hydro',
            'data_center_hyperscale', 'data_center_campus_phase',
        ]),
        'ttd_reduction_years': 1,
        'capex_discount_fraction': 0.10,
        'confidence': 'low',
    },
    'mine': {
        # Retired surface mine — graded/leveled land, dust control already done
        'compatible_actions': frozenset([
            'prairie_restoration', 'solar_utility', 'reclamation_tech',
        ]),
        'ttd_reduction_years': 1,
        'capex_discount_fraction': 0.20,    # cleared land; no site prep costs
        'confidence': 'low',
    },
    # v4.3 (F1): anchor-derived site classes
    'industrial': {
        # Retired industrial_load anchor — existing power connection, concrete pads.
        # Citation: DOE (2022) industrial repurposing guidance; Gorman et al. (2022)
        # LBNL brownfield industrial reuse analogues.
        # NOTE: captive generation (smr_advanced) compatibility flagged but not listed —
        # no precedent for industrial-to-nuclear site succession outside thermal class.
        'compatible_actions': frozenset([
            'battery_grid',              # storage on existing industrial interconnection
            'industrial_load_flexible',  # expansion-of-same-class
        ]),
        'ttd_reduction_years': 1,
        'capex_discount_fraction': 0.10,    # Gorman et al. (2022): general brownfield analogue
        'confidence': 'low',
    },
    'commercial': {
        # Retired commercial_anchor_load — cleared commercial land, utility connections.
        # Citation: DOE (2022) commercial facility reuse; Carley et al. (2018) community
        # transition precedents.
        # NOTE: efficiency retrofit action not in library — flagged as known debt.
        'compatible_actions': frozenset([
            'battery_grid',    # storage on commercial site
            'community_solar', # distributed generation on cleared commercial land
        ]),
        'ttd_reduction_years': 1,
        'capex_discount_fraction': 0.05,    # minimal — commercial sites less infrastructure-dense
        'confidence': 'low',
    },
}

# coal_to_smr is a convert transition: TX waiver from existing coal interconnection;
# TTD and capex discounts do NOT apply (cost_2024=$8,500,000/MW already includes
# brownfield siting premium per dissertation_note). Stacking a 15% succession
# discount on top would double-count the premium. Deliberate re-pricing decision.
COAL_TO_SMR_SITE_CLASS_COMPAT = 'thermal'  # site_class a coal_to_smr can draw TX waiver from

# Operations workforce proxy by asset type (for workforce_pool_initial on spawned site).
# Source: NREL JEDI v2023 operations/maintenance employment factors.
# Half-life source: Carley et al. (2018) "A just transition?" Energy Research & Social
# Science — workforce attrition after plant closure, ~5 yr median departure horizon.
SITE_OPS_JOBS_PER_MW = {
    'coal':    0.28,    # NREL JEDI Coal (O&M only; NOT construction)
    'gas':     0.10,
    'nuclear': 0.38,
    'wind':    0.04,
    'solar':   0.02,
    'hydro':   0.15,
}
SITE_WORKFORCE_HALF_LIFE_YEARS = 5  # judgment; Carley et al. (2018) ~5 yr median

# ── Population / Migration Constants (v4.2) ──────────────────────────────────
# Employment-linked permanent in-migration from player-added operations jobs.
# Literature: Headwaters Economics (2017) "Energy Development and the Economy
#   in the West" — rural energy employment multipliers 1.4–2.0 for Mountain West.
#   Power et al. (2013) "Economic Assessment of Fossil Fuel Development in the
#   Mountain West" — household formation rates for energy-sector in-migrants.
# ACS 2022 Table B25010: 2.51 persons per occupied housing unit (national).
AVG_HOUSEHOLD_SIZE = 2.51          # ACS 2022 Table B25010
ECONOMIC_BASE_MULTIPLIER = 1.5     # Headwaters Economics (2017); confidence: low
WORKING_AGE_SHARE_DEFAULT = 0.573  # ACS 2022 national; county overrides in projection file

def _round_pop(n: float) -> int:
    """Round population like JS Math.round: .5 always rounds UP (matching TS runtime parity)."""
    return int(n + 0.5)

# Ops workforce per MW for the population migration model.
# Extends SITE_OPS_JOBS_PER_MW with data_center (not in site-spawning lookup).
_MIGRATION_OPS_JOBS_PER_MW = {
    'coal':        0.28,
    'gas':         0.10,
    'nuclear':     0.38,
    'wind':        0.04,
    'solar':       0.02,
    'hydro':       0.15,
    'data_center': 3.0,   # CBRE Data Center Employment Trends Report (2023)
    'storage':     0.05,  # Proxy (minimal O&M)
}

_ACTION_ID_TO_MIGRATION_FUEL = {
    'smr_advanced': 'nuclear', 'coal_to_smr': 'nuclear', 'fusion_pilot': 'nuclear',
    'wind_utility': 'wind', 'offshore_wind_great_lakes': 'wind',
    'solar_utility': 'solar', 'coal_to_solar': 'solar',
    'gas_combined_cycle': 'gas',
    'battery_grid': 'storage', 'hydrogen_electrolysis': 'storage',
    'pumped_hydro': 'hydro', 'hydropower_small': 'hydro',
    'data_center_hyperscale': 'data_center', 'data_center_campus_phase': 'data_center',
    'industrial_load_flexible': 'data_center',
}

# ── v4.3 (F1): Anchor Facility Commodity Lookup ─────────────────────────────
# DERIVED FIELD — inferred from facility name, NOT sourced from the geojson
# (mw_anchor_facilities.geojson has no 'commodity' field). If NB 22 is ever
# regenerated with different mine names or new mines added, this table must
# be reviewed by a human.
#
# Key: MSHA mine ID (anchor_id in geojson). Value: commodity string.
# Sources cited per group:
#   Coal (27 mines):
#     Colorado (6): EIA-923 coal mine production data; all 6 are active coal mines.
#     Montana (6): EIA-923 + MSHA mine-type classification; all surface/underground coal.
#     Campbell County WY (11): PRB coal basin — all surface coal mines (EIA-7A Table 2, 2024).
#     Sweetwater WY (2): Jim Bridger Mine (coal, co-located with Jim Bridger plant);
#       Black Butte And Leucite Hills Mines (coal, MSHA mine type 'Surface').
#     Lincoln WY (1): Kemmerer Mine — underground coal (MSHA; co-located with Naughton/Kemmerer plant).
#     Converse WY (1): Antelope Coal Mine — name unambiguous; MSHA mine type 'Surface'.
#   Trona (4 mines):
#     All Sweetwater County WY. Genesis Alkali (WE Soda/WESTVACO), Ciner Resources
#     (Big Island), Tata Chemicals, Solvay (American Soda) — MSHA commodity code 'Soda Ash';
#     Green River Basin trona district.
#   Bentonite (19 mines/mills):
#     Big Horn (56003, 9): BPM = Bentonite Performance Minerals; Magnet Cove, Yellowtail,
#       Stucco, Sage Creek are well-known WY bentonite districts.
#     Crook (56011, 4): Colony/Belle Fourche bentonite district.
#     Hot Springs (56017, 1): Lucerne Mill — bentonite processing.
#     Natrona (56025, 3): Casper/Mills/HT — bentonite processing plants.
#     Washakie (56043, 2): Tensleep Mine, Worland Plant — bentonite/gypsum extraction.
ANCHOR_MINE_COMMODITY = {
    # ── Coal: Colorado ───────────────────────────────────────────────────────
    'msha_0502838': 'coal',   # Trapper Mine (08081)
    'msha_0502962': 'coal',   # Colowyo Mine (08081)
    'msha_0503505': 'coal',   # Deserado Mine (08103)
    'msha_0503672': 'coal',   # West Elk Mine (08051)
    'msha_0503836': 'coal',   # FOIDEL CREEK MINE (08107)
    'msha_0504864': 'coal',   # King II (08067)
    # ── Coal: Montana ────────────────────────────────────────────────────────
    'msha_2400839': 'coal',   # Decker Mine (30003)
    'msha_2400910': 'coal',   # Absaloka Mine (30003)
    'msha_2401457': 'coal',   # Spring Creek Mine (30003)
    'msha_2401747': 'coal',   # Rosebud Mine & Crusher/Conveyor (30087)
    'msha_2401950': 'coal',   # Bull Mountains Mine No 1 (30065)
    'msha_2402703': 'coal',   # Wolf Mountain Coal-Spring Creek (30003)
    # ── Coal: Wyoming (Campbell 56005) ───────────────────────────────────────
    'msha_4800083': 'coal',   # Wyodak Mine
    'msha_4800732': 'coal',   # Belle Ayr Mine
    'msha_4800977': 'coal',   # Black Thunder
    'msha_4800992': 'coal',   # Cordero Rojo Mine
    'msha_4800993': 'coal',   # Rawhide Mine
    'msha_4801034': 'coal',   # Caballo Mine
    'msha_4801078': 'coal',   # Eagle Butte Mine
    'msha_4801200': 'coal',   # Buckskin Mine
    'msha_4801215': 'coal',   # Coal Creek Mine
    'msha_4801337': 'coal',   # Antelope Coal Mine (56009)
    'msha_4801353': 'coal',   # North Antelope Rochelle Mine
    'msha_4801429': 'coal',   # Dry Fork Mine
    # ── Coal: Wyoming (other) ────────────────────────────────────────────────
    'msha_4800086': 'coal',   # Kemmerer Mine (56023)
    'msha_4800677': 'coal',   # Jim Bridger Mine (56037)
    'msha_4801180': 'coal',   # Black Butte And Leucite Hills Mines (56037)
    # ── Trona: Sweetwater County (56037) ─────────────────────────────────────
    'msha_4800152': 'trona',  # WE Soda @ WESTVACO (Genesis Alkali)
    'msha_4800154': 'trona',  # Big Island Mine & Refinery (Ciner Resources)
    'msha_4800155': 'trona',  # Tata Chemicals Mine
    'msha_4801295': 'trona',  # American Soda LLC (Solvay)
    # ── Bentonite: Big Horn County (56003) ───────────────────────────────────
    'msha_4800057': 'bentonite',  # Lovell Mill
    'msha_4800602': 'bentonite',  # Magnet Cove Mill
    'msha_4800603': 'bentonite',  # Magnet Cove Mine
    'msha_4800607': 'bentonite',  # Yellowtail Mine
    'msha_4800611': 'bentonite',  # Stucco Mill
    'msha_4800612': 'bentonite',  # Sage Creek Mill
    'msha_4800974': 'bentonite',  # Big Horn Basin Mines
    'msha_4801016': 'bentonite',  # BPM Lovell Mine
    'msha_4801405': 'bentonite',  # BPM Lovell Mill
    # ── Bentonite: Crook County (56011) ──────────────────────────────────────
    'msha_4800070': 'bentonite',  # BPM Colony Mill
    'msha_4800245': 'bentonite',  # COLONY WEST MILL
    'msha_4800594': 'bentonite',  # COLONY EAST MILL
    'msha_4800888': 'bentonite',  # Belle/Colony Mine
    # ── Bentonite: Hot Springs (56017), Natrona (56025), Washakie (56043) ────
    'msha_4801191': 'bentonite',  # Lucerne Mill (56017)
    'msha_4800243': 'bentonite',  # Casper Plant (56025)
    'msha_4800617': 'bentonite',  # Mills Plant (56025)
    'msha_4801539': 'bentonite',  # HT Plant (56025)
    'msha_4800954': 'bentonite',  # TENSLEEP MINE (56043)
    'msha_4800987': 'bentonite',  # WORLAND PLANT (56043)
}

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
        # Direct mining employment: BLS QCEW 2022, NAICS 2121, Campbell County WY.
        # 11 surface mines; consistent with EIA-7A productivity ratios.
        # Confidence: medium (BLS QCEW establishment-level suppression may affect total).
        'employment_direct': 4200,
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


# ── v4.1 Site Mechanics Helpers ───────────────────────────────────────────────

def _site_class_for_asset(asset):
    """
    Return site_class for a retiring asset. Used when spawning a site.

    Returns:
      'thermal'    — coal/gas/nuclear plant (high-density firm-power site)
      'generator'  — other MW-based generator
      'mine'       — production or mine-class anchor (surface mine)
      'industrial' — industrial_load anchor (v4.3/F1)
      'commercial' — commercial_anchor_load anchor (v4.3/F1)
    """
    asset_class = asset.get('asset_class', '')
    if asset_class == 'production':
        return 'mine'
    # v4.3 (F1) anchor classes → distinct site classes
    if asset_class == 'mine':
        return 'mine'
    if asset_class == 'industrial_load':
        return 'industrial'
    if asset_class == 'commercial_anchor_load':
        return 'commercial'
    asset_type = (asset.get('type') or '').lower()
    if asset_type in ('coal', 'gas', 'nuclear'):
        return 'thermal'
    return 'generator'


def _spawn_site_from_retired(retired_asset, spawn_year):
    """
    Create a site AssetInstance from a just-retired generator, production, or anchor asset.
    Pure function — returns a new dict; does NOT modify input.

    site_class:
      'thermal'    — coal/gas/nuclear plant (high-density firm-power site)
      'generator'  — other MW-based generator
      'mine'       — production or mine-class anchor (surface mine)
      'industrial' — industrial_load anchor (v4.3/F1)
      'commercial' — commercial_anchor_load anchor (v4.3/F1)
    workforce_pool:
      MW-based assets: SITE_OPS_JOBS_PER_MW × capacity_mw.
      Anchor assets (mine/industrial/commercial): employment_direct from geojson.
      Decayed by half-life each year (Carley et al. 2018). confidence: low.
    water_rights_flag / acres:
      Both null at spawn; populated from county data in a future session.
      Documented as known debt.
    """
    geoid = retired_asset['geoid']
    cap_mw = retired_asset.get('capacity_mw') or 0.0
    asset_type = (retired_asset.get('type') or '').lower()
    site_class = _site_class_for_asset(retired_asset)

    # v4.3 (F1): anchor assets use employment_direct directly for workforce pool
    # (they have no MW-based ops jobs proxy — their employment IS the workforce)
    if retired_asset.get('asset_class') in ('mine', 'industrial_load', 'commercial_anchor_load'):
        workforce_initial = float(retired_asset.get('employment_direct') or 0)
    else:
        ops_jobs_per_mw = SITE_OPS_JOBS_PER_MW.get(asset_type, 0.1)
        workforce_initial = round(cap_mw * ops_jobs_per_mw, 1)

    asset_id = f'site_{geoid}_{_slugify(retired_asset["name"])}_{spawn_year}'

    # Standard null block shared by all asset types
    _null_block = {
        'capacity_mw': None, 'coal_tons_yr': None, 'production_proxy': None,
        'fiscal_action_id': None, 'excluded': None,
        'commodity': None, 'production_volume': None, 'production_unit': None,
        'production_confidence': None, 'production_source': None, 'data_year': None,
        'effective_severance_rate_per_unit': None, 'county_distribution_share': None,
        'advalorem_rate_per_unit': None, 'assessed_delta_per_unit': None,
        'employment_direct': None,
        'action_id': None, 'magnitude': None, 'decision_year': None,
        'throttle_reason': None, 'commissioned': None,
        'scheduled_retirement_year': None,
        'reclamation_year_log': None, 'active_reclamation_acres': None,
        'reclamation_jobs_direct': None,
        'decommissioning_cost_usd': None, 'decommissioning_labor_usd': None,
        'decommissioning_duration_years': None, 'decommissioning_start_year': None,
        'housing_total_units': None, 'housing_occupied_units': None,
        'housing_convertible_units': None, 'housing_subsidized_units': None,
        'housing_permits_per_year': None, 'housing_affordable_added': None,
        'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
        # v4.1 succession fields (null on site itself; populated on queued assets)
        'succession_site_id': None, 'ttd_reduction_applied': None,
        'capex_discount_fraction': None, 'tx_waiver_mw': None,
        'convert_source_asset_id': None,
    }
    return {
        'asset_id': asset_id,
        'origin': 'baseline',
        'lifecycle': 'operating',
        'asset_class': 'site',
        'name': f'{retired_asset["name"]} Site',
        'geoid': geoid,
        'county_name': retired_asset.get('county_name', ''),
        'state': retired_asset.get('state', ''),
        'type': 'site',
        'status': 'available',
        'source_url': retired_asset.get('source_url', ''),
        'operational_year': None,
        **_null_block,
        # v4.1 site-specific fields
        'site_origin_asset_id': retired_asset['asset_id'],
        'site_origin_type': 'mine' if site_class == 'mine' else (
            'anchor' if site_class in ('industrial', 'commercial') else 'generator'),
        'site_class': site_class,
        # Interconnection: MW-based assets inherit nameplate; mines/anchors inherit
        # capacity_mw if present (industrial_load has MW), else None
        'interconnection_mw': cap_mw if cap_mw > 0 and site_class != 'mine' else None,
        'water_rights_flag': None,   # known debt: populate from county data
        'acres': None,               # known debt: populate from county data
        'workforce_pool_initial': workforce_initial,
        'workforce_pool_current': workforce_initial,
        'workforce_pool_half_life_years': SITE_WORKFORCE_HALF_LIFE_YEARS,
        'site_spawn_year': spawn_year,
        'restoration_eligibility': site_class == 'mine',
    }


def _find_site_for_action(state, geoid, action_id):
    """
    Return (site_asset, compat_dict) if a live compatible site exists in geoid
    for the given action_id, else (None, None).

    coal_to_smr is NOT in SITE_COMPAT (handled separately — TX waiver only).
    """
    geoid_str = str(geoid)
    for a in state.get('asset_registry', []):
        if (a.get('asset_class') == 'site'
                and a.get('geoid') == geoid_str
                and a.get('lifecycle') == 'operating'):
            sc = a.get('site_class')
            compat = SITE_COMPAT.get(sc)
            if compat and action_id in compat['compatible_actions']:
                return a, compat
    return None, None


def _resolve_asset_class(asset_type, asset_kind=None):
    """Resolve asset_class from type/kind (mirrors TS resolveAssetClass)."""
    if asset_kind == 'production_asset':
        return 'production'
    if asset_type == 'data_center':
        return 'demand'
    if asset_type == 'site':
        return 'site'
    return 'generator'


def _seed_housing_assets(county_cards, housing_baseline):
    """
    Seed one housing_stock AssetInstance per study county from the ACS housing baseline.
    Called from initialize_state after _seed_asset_registry.

    Housing assets do NOT appear in the existing_assets materialized view
    (_materialize_existing_assets skips them), so existing_assets_digest is unaffected.
    """
    assets = []
    for geoid, card in county_cards.items():
        hb = housing_baseline.get(geoid, {})
        county_name = card.get('county_name', geoid)
        state_code = card.get('state', '')

        total_units        = hb.get('total_units', {}).get('value') or 0
        occupied           = hb.get('occupied_units', {}).get('value') or 0
        convertible        = hb.get('convertible_units', {}).get('value') or 0
        subsidized         = hb.get('subsidized_units', {}).get('value') or 0
        permits_val        = hb.get('permits_per_year', {}).get('value') or 0.0
        seasonal_excluded  = hb.get('seasonal_recreational_vacant', {}).get('value') or 0

        assets.append({
            'asset_id':   f'housing_{geoid}',
            'origin':     'baseline',
            'lifecycle':  'operating',
            'asset_class': 'housing_stock',
            'name':       f'{county_name} Housing Stock',
            'geoid':      geoid,
            'county_name': county_name,
            'state':      state_code,
            'type':       'housing_stock',
            'status':     'operating',
            'source_url': 'ACS 2022 5-year',
            'operational_year': None,
            # Non-applicable standard fields — null for housing_stock
            'capacity_mw': None, 'coal_tons_yr': None, 'production_proxy': None,
            'fiscal_action_id': None, 'excluded': None,
            'commodity': None, 'production_volume': None, 'production_unit': None,
            'production_confidence': None, 'production_source': None, 'data_year': None,
            'effective_severance_rate_per_unit': None, 'county_distribution_share': None,
            'advalorem_rate_per_unit': None, 'assessed_delta_per_unit': None,
            'employment_direct': None,
            'action_id': None, 'magnitude': None, 'decision_year': None,
            'throttle_reason': None, 'commissioned': None,
            'scheduled_retirement_year': None,
            # v3.1 reclamation (null for housing)
            'reclamation_year_log': None,
            'active_reclamation_acres': None,
            'reclamation_jobs_direct': None,
            # v3.2 decommissioning (null for housing)
            'decommissioning_cost_usd': None, 'decommissioning_labor_usd': None,
            'decommissioning_duration_years': None, 'decommissioning_start_year': None,
            # v3.3 housing stock fields
            'housing_total_units':       int(total_units),
            'housing_occupied_units':    int(occupied),
            'housing_convertible_units': int(convertible),
            'housing_subsidized_units':  int(subsidized),
            'housing_permits_per_year':  float(permits_val),
            'housing_affordable_added':  0.0,
            'housing_pressure_ratio':    None,  # computed on first advance_year
            'housing_seasonal_excluded': int(seasonal_excluded),
            # v4.1 site mechanics (null for housing_stock)
            'site_origin_asset_id': None, 'site_origin_type': None,
            'site_class': None, 'interconnection_mw': None,
            'water_rights_flag': None, 'acres': None,
            'workforce_pool_initial': None, 'workforce_pool_current': None,
            'workforce_pool_half_life_years': None, 'site_spawn_year': None,
            'restoration_eligibility': None,
            # v4.1 succession discount tracking (null for housing_stock)
            'succession_site_id': None, 'ttd_reduction_applied': None,
            'capex_discount_fraction': None, 'tx_waiver_mw': None,
            'convert_source_asset_id': None,
        })
    return assets


# ── v4.3 (F1): Anchor facility seeding ──────────────────────────────────────
# Namespace note: asset_class 'mine' (operating mine anchor from F1 geojson) is
# a DIFFERENT concept from site_class 'mine' (Z4 reclaimed-mine successor site).
# asset_class is the type of asset in the registry; site_class is a field on
# spawned site assets that drives SITE_COMPAT lookup for succession actions.

def _seed_anchor_facilities(data_dir, registry):
    """
    Seed Tier 2 anchor facilities from mw_anchor_facilities.geojson into asset_registry.

    New asset_classes: mine, industrial_load, commercial_anchor_load.
    Generators are already seeded from EIA-860/county_cards — this function
    attaches anchor_id and co2e_tpy to existing generator rows by name+geoid match.

    Zero flow deltas: anchors carry marginal handles only. Their jobs, output, and
    valuation are already embedded in observed county baselines. Seeded anchors
    contribute no jobs, no valuation, no demand, no migration at seeding.

    Returns: list of new AssetInstance dicts (mine/industrial_load/commercial_anchor_load).
    Generator rows are mutated in-place (anchor_id + co2e_tpy attached).
    """
    anchor_path = data_dir / "mw_anchor_facilities.geojson"
    if not anchor_path.exists():
        return []

    with open(anchor_path) as f:
        anchor_gj = json.load(f)

    new_assets = []
    for feat in anchor_gj['features']:
        props = feat['properties']
        if props.get('tier') != 2:
            continue
        ac = props.get('asset_class')
        if ac is None:
            continue  # Tier 1 sub-threshold — skip

        anchor_id = props.get('anchor_id', '')
        geoid = str(props.get('geoid', '')).zfill(5)
        name = props.get('name', '')

        if ac == 'generator':
            # Attach anchor_id + co2e_tpy to existing registry row (do not re-seed)
            for a in registry:
                if (a.get('geoid') == geoid
                        and a.get('name') == name
                        and a.get('origin') == 'baseline'
                        and a.get('asset_class') in ('generator', 'demand')):
                    a['anchor_id'] = anchor_id
                    a['co2e_tpy'] = props.get('co2e_tpy')
                    break
            continue

        if ac == 'data_center':
            # Data centers already seeded from county_cards; attach anchor_id only
            for a in registry:
                if (a.get('geoid') == geoid
                        and a.get('name') == name
                        and a.get('origin') == 'baseline'):
                    a['anchor_id'] = anchor_id
                    a['co2e_tpy'] = props.get('co2e_tpy')
                    break
            continue

        # New asset classes: mine, industrial_load, commercial_anchor_load
        capacity_or_load = props.get('capacity_or_load_mw')
        employment = props.get('employment_est')
        commodity = ANCHOR_MINE_COMMODITY.get(anchor_id) if ac == 'mine' else None

        # Standard null block (all non-applicable fields)
        _null_block = {
            'coal_tons_yr': None, 'production_proxy': None,
            'fiscal_action_id': None, 'excluded': None,
            'production_volume': None, 'production_unit': None,
            'production_confidence': None, 'production_source': None, 'data_year': None,
            'effective_severance_rate_per_unit': None, 'county_distribution_share': None,
            'advalorem_rate_per_unit': None, 'assessed_delta_per_unit': None,
            'action_id': None, 'magnitude': None, 'decision_year': None,
            'throttle_reason': None, 'commissioned': None,
            'scheduled_retirement_year': None,
            'reclamation_year_log': None, 'active_reclamation_acres': None,
            'reclamation_jobs_direct': None,
            'decommissioning_cost_usd': None, 'decommissioning_labor_usd': None,
            'decommissioning_duration_years': None, 'decommissioning_start_year': None,
            'housing_total_units': None, 'housing_occupied_units': None,
            'housing_convertible_units': None, 'housing_subsidized_units': None,
            'housing_permits_per_year': None, 'housing_affordable_added': None,
            'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
            'site_origin_asset_id': None, 'site_origin_type': None,
            'site_class': None, 'interconnection_mw': None,
            'water_rights_flag': None, 'acres': None,
            'workforce_pool_initial': None, 'workforce_pool_current': None,
            'workforce_pool_half_life_years': None, 'site_spawn_year': None,
            'restoration_eligibility': None,
            'succession_site_id': None, 'ttd_reduction_applied': None,
            'capex_discount_fraction': None, 'tx_waiver_mw': None,
            'convert_source_asset_id': None,
        }
        new_assets.append({
            'asset_id': f'anchor_{geoid}_{_slugify(name)}',
            'origin': 'baseline',
            'lifecycle': 'operating',
            'asset_class': ac,  # 'mine' | 'industrial_load' | 'commercial_anchor_load'
            'name': name,
            'geoid': geoid,
            'county_name': '',
            'state': '',
            'type': ac,
            'status': 'operating',
            'source_url': props.get('source', ''),
            'operational_year': None,
            'capacity_mw': float(capacity_or_load) if capacity_or_load is not None else None,
            'anchor_id': anchor_id,
            'co2e_tpy': props.get('co2e_tpy'),
            'commodity': commodity,
            'employment_direct': int(employment) if employment is not None else None,
            'display_sector': props.get('display_sector'),
            'confidence': props.get('confidence', 'high'),
            **_null_block,
        })

    return new_assets


def _find_housing_asset(state, geoid):
    """Return the housing_stock AssetInstance for geoid, or None."""
    for a in state.get('asset_registry', []):
        if a.get('asset_class') == 'housing_stock' and a.get('geoid') == geoid:
            return a
    return None


def _compute_housing_pressure(state, geoid, current_year):
    """
    Compute housing demand/supply pressure ratio for a county.

    demand = occupied_units + incoming_workforce × HOUSEHOLD_FACTOR
    supply = occupied_units + convertible_units + affordable_added

    Returns float pressure_ratio or None if housing asset not found.

    Incoming workforce = sum of construction workers from:
      - Baseline 'under_construction' assets (operational_year > current_year)
      - Player-queued assets not yet commissioned
    Workers estimated from capacity_mw × HOUSING_CONSTRUCTION_JOBS_PER_MW[type].
    """
    housing = _find_housing_asset(state, geoid)
    if housing is None:
        return None

    occupied     = housing.get('housing_occupied_units') or 0
    convertible  = housing.get('housing_convertible_units') or 0
    affordable   = housing.get('housing_affordable_added') or 0.0

    # Sum construction workforce from all active construction in this county
    incoming_workforce = 0.0
    for a in state.get('asset_registry', []):
        if a.get('geoid') != geoid:
            continue
        if a.get('asset_class') in ('housing_stock', 'production'):
            continue
        op_year = a.get('operational_year')
        cap_mw  = a.get('capacity_mw') or a.get('magnitude') or 0.0

        # Under-construction baseline asset (e.g. Kemmerer)
        is_under_construction = (
            a.get('origin') == 'baseline'
            and a.get('status') == 'under_construction'
            and op_year is not None and op_year > current_year
        )
        # Player-queued (not yet commissioned)
        is_player_queued = (
            a.get('origin') == 'player'
            and a.get('lifecycle') != 'retired'
            and a.get('commissioned') is False
            and op_year is not None and op_year > current_year
        )

        if is_under_construction or is_player_queued:
            asset_type = a.get('type', '')
            jobs_per_mw = HOUSING_CONSTRUCTION_JOBS_PER_MW.get(asset_type, 0.0)
            incoming_workforce += cap_mw * jobs_per_mw

    demand = occupied + incoming_workforce * HOUSEHOLD_FACTOR
    supply = occupied + convertible + affordable
    if supply <= 0:
        return None
    return round(demand / supply, 4)


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
                    # v3.1 reclamation tracking (production assets only)
                    'reclamation_year_log': [],
                    'active_reclamation_acres': 0.0,
                    'reclamation_jobs_direct': 0.0,
                    # v3.2 decommissioning (null for production)
                    'decommissioning_cost_usd': None,
                    'decommissioning_labor_usd': None,
                    'decommissioning_duration_years': None,
                    'decommissioning_start_year': None,
                    # v3.3 housing (null for production)
                    'housing_total_units': None, 'housing_occupied_units': None,
                    'housing_convertible_units': None, 'housing_subsidized_units': None,
                    'housing_permits_per_year': None, 'housing_affordable_added': None,
                    'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
                    # v4.1 site mechanics (null for all non-site baseline assets)
                    'site_origin_asset_id': None, 'site_origin_type': None,
                    'site_class': None, 'interconnection_mw': None,
                    'water_rights_flag': None, 'acres': None,
                    'workforce_pool_initial': None, 'workforce_pool_current': None,
                    'workforce_pool_half_life_years': None, 'site_spawn_year': None,
                    'restoration_eligibility': None,
                    # v4.1 succession discount tracking (null for baseline assets)
                    'succession_site_id': None, 'ttd_reduction_applied': None,
                    'capex_discount_fraction': None, 'tx_waiver_mw': None,
                    'convert_source_asset_id': None,
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
                    # v3.1 reclamation (null for excluded)
                    'reclamation_year_log': None,
                    'active_reclamation_acres': None,
                    'reclamation_jobs_direct': None,
                    # v3.2 decommissioning (null for excluded)
                    'decommissioning_cost_usd': None, 'decommissioning_labor_usd': None,
                    'decommissioning_duration_years': None, 'decommissioning_start_year': None,
                    # v3.3 housing (null for excluded)
                    'housing_total_units': None, 'housing_occupied_units': None,
                    'housing_convertible_units': None, 'housing_subsidized_units': None,
                    'housing_permits_per_year': None, 'housing_affordable_added': None,
                    'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
                    # v4.1 site mechanics (null for all non-site baseline assets)
                    'site_origin_asset_id': None, 'site_origin_type': None,
                    'site_class': None, 'interconnection_mw': None,
                    'water_rights_flag': None, 'acres': None,
                    'workforce_pool_initial': None, 'workforce_pool_current': None,
                    'workforce_pool_half_life_years': None, 'site_spawn_year': None,
                    'restoration_eligibility': None,
                    # v4.1 succession discount tracking (null for baseline assets)
                    'succession_site_id': None, 'ttd_reduction_applied': None,
                    'capex_discount_fraction': None, 'tx_waiver_mw': None,
                    'convert_source_asset_id': None,
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
                    # v3.2 decommissioning cost draw (null until retirement fires)
                    'decommissioning_cost_usd': None,
                    'decommissioning_labor_usd': None,
                    'decommissioning_duration_years': None,
                    'decommissioning_start_year': None,
                    # v3.3 housing (null for MW-based generator assets)
                    'housing_total_units': None, 'housing_occupied_units': None,
                    'housing_convertible_units': None, 'housing_subsidized_units': None,
                    'housing_permits_per_year': None, 'housing_affordable_added': None,
                    'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
                    # v4.1 site mechanics (null for all non-site baseline assets)
                    'site_origin_asset_id': None, 'site_origin_type': None,
                    'site_class': None, 'interconnection_mw': None,
                    'water_rights_flag': None, 'acres': None,
                    'workforce_pool_initial': None, 'workforce_pool_current': None,
                    'workforce_pool_half_life_years': None, 'site_spawn_year': None,
                    'restoration_eligibility': None,
                    # v4.1 succession discount tracking (null for baseline assets)
                    'succession_site_id': None, 'ttd_reduction_applied': None,
                    'capex_discount_fraction': None, 'tx_waiver_mw': None,
                    'convert_source_asset_id': None,
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
    """Materialize existing_assets view from asset_registry (baseline-origin).
    Housing stock assets are excluded from this view so existing_assets_digest is stable.
    Site assets (v4.1) are also excluded — they are a derived/ephemeral registry class.
    Anchor assets (v4.3/F1: mine, industrial_load, commercial_anchor_load) are excluded —
    their economic contribution is already in observed county baselines.
    """
    # Asset classes excluded from the existing_assets materialized view.
    # Each exclusion preserves existing_assets_digest stability.
    _EA_EXCLUDED_CLASSES = frozenset({
        'housing_stock',           # v3.3
        'site',                    # v4.1
        'mine',                    # v4.3 (F1) — operating mine anchor
        'industrial_load',         # v4.3 (F1) — industrial load anchor
        'commercial_anchor_load',  # v4.3 (F1) — commercial anchor
    })
    result = {}
    for a in registry:
        if a['origin'] != 'baseline':
            continue
        if a.get('asset_class') in _EA_EXCLUDED_CLASSES:
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

    # ── v4.2: load population projections ────────────────────────────────────
    pop_projections = {}
    pop_proj_path = (
        Path(__file__).parent.parent
        / "terra-app" / "src" / "data" / "county_population_projections.json"
    )
    if pop_proj_path.exists():
        with open(pop_proj_path) as f:
            _pp_raw = json.load(f)
        pop_projections = _pp_raw.get("counties", {})

    county_ees = {}
    for _, row in county_ees_df.iterrows():
        geoid = str(row['geoid']).zfill(5)
        wa_share = pop_projections.get(geoid, {}).get(
            'working_age_share', WORKING_AGE_SHARE_DEFAULT
        )
        pop = int(row.get('population', 0))
        county_ees[geoid] = {
            "E": float(row['E']), "Ec": float(row['Ec']), "S": float(row['S']),
            "E_baseline": float(row['E']), "Ec_baseline": float(row['Ec']),
            "S_baseline": float(row['S']),
            "county_name": str(row.get('county_name', '')),
            "population": pop,
            "working_age_population": _round_pop(pop * wa_share),
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

    # ── v3.3: Housing baseline + housing_stock assets ─────────────────────────
    housing_baseline = {}
    housing_baseline_path = data_dir / "county_housing_baseline.json"
    if housing_baseline_path.exists():
        with open(housing_baseline_path) as f:
            _hb_raw = json.load(f)
        housing_baseline = _hb_raw.get("counties", {})
        # Append housing_stock assets to registry (one per county)
        asset_registry.extend(_seed_housing_assets(county_cards, housing_baseline))

    # ── v4.3 (F1): Seed Tier 2 anchor facilities from geojson ────────────────
    # New asset_classes: mine, industrial_load, commercial_anchor_load.
    # Generators get anchor_id + co2e_tpy attached (not re-seeded).
    # Anchors are excluded from existing_assets view → digest-stable.
    asset_registry.extend(_seed_anchor_facilities(data_dir, asset_registry))

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

    # ── Lifecycle coefficients (v3.1) ────────────────────────────────────────
    lifecycle_coefficients = {}
    lifecycle_coefficients_path = data_dir / "lifecycle_coefficients.json"
    if lifecycle_coefficients_path.exists():
        with open(lifecycle_coefficients_path) as f:
            lifecycle_coefficients = json.load(f)

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
        # v3.1 lifecycle coefficients
        "lifecycle_coefficients": lifecycle_coefficients,
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
        # v3.3 housing baseline (read-only reference; indexed by geoid)
        "housing_baseline":     housing_baseline,
        # Tracking
        "last_delta":           None,
        # v4.0: per-year indicator snapshots (appended by advance_year; never in main digest)
        "history":              [],
        # v4.2: demographic denominators — one population state shared by housing and indicators
        "population_projections": pop_projections,
        "population_config": {
            "migration_enabled": True,
            "labor_migration_multiplier": ECONOMIC_BASE_MULTIPLIER,
            "migration_confidence": "low",
        },
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

    # ── v3.3: housing retrofit / new-build — update housing_stock asset ────────
    if action_id == 'housing_retrofit_affordable' and geoid:
        housing = _find_housing_asset(state, geoid)
        if housing is None:
            raise ValueError(
                f"housing_retrofit_affordable: no housing_stock asset found for geoid={geoid}"
            )
        available = housing.get('housing_convertible_units') or 0
        units = int(magnitude)
        if units > available:
            raise ValueError(
                f"housing_retrofit_affordable: requested {units} units exceeds "
                f"convertible_units={available} for geoid={geoid}"
            )
        housing['housing_convertible_units'] = available - units
        housing['housing_affordable_added'] = round(
            (housing.get('housing_affordable_added') or 0.0) + units, 2
        )
        # WY fiscal: residential assessed value delta at 9.5% assessment ratio
        # unit value = HOUSING_UNIT_REHAB_VALUE_USD (post-rehab FMV basis)
        # Only applied for WY counties (fiscal tier doctrine)
        if geoid in state.get('county_fiscal', {}):
            fmv_added = units * HOUSING_UNIT_REHAB_VALUE_USD
            assessed_added = round(fmv_added * WY_RESIDENTIAL_ASSESSMENT_RATIO, 2)
            state['county_fiscal'][geoid]['assessed_residential'] = round(
                state['county_fiscal'][geoid].get('assessed_residential', 0.0) + assessed_added, 2
            )
            mill = state['county_fiscal'][geoid].get('mill_levy_mills', 0.0)
            prop_tax_delta = round(assessed_added * mill / 1000.0, 2)
            state['county_fiscal'][geoid]['property_tax'] = round(
                state['county_fiscal'][geoid].get('property_tax', 0.0) + prop_tax_delta, 2
            )

    elif action_id == 'affordable_housing' and geoid:
        # New-build affordable housing: track affordable_added on housing_stock
        housing = _find_housing_asset(state, geoid)
        if housing is not None:
            units = int(magnitude)
            housing['housing_affordable_added'] = round(
                (housing.get('housing_affordable_added') or 0.0) + units, 2
            )

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

    # v3.0/v3.1: copy asset_registry; also copy reclamation_year_log lists so
    # mutations in one branch don't bleed into another (list is not a primitive).
    registry = []
    for a in state.get("asset_registry", []):
        entry = dict(a)
        log = a.get("reclamation_year_log")
        entry["reclamation_year_log"] = list(log) if log is not None else []
        registry.append(entry)
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
                "fiscal_coefficients", "lifecycle_coefficients",
                "housing_baseline",
                "population_projections"):  # v4.2: read-only projection table
        new[key] = state.get(key)

    # v4.2: population_config is a small mutable dict; shallow copy so session-level
    # overrides in one branch don't bleed across branches.
    new["population_config"] = dict(state.get("population_config", {
        "migration_enabled": True,
        "labor_migration_multiplier": ECONOMIC_BASE_MULTIPLIER,
        "migration_confidence": "low",
    }))

    # Copy scalars
    new["year"] = state.get("year", 2025)
    new["timestamp"] = state.get("timestamp", 0)
    new["last_delta"] = state.get("last_delta")

    # v4.0: history — shallow copy (snapshots are immutable dicts; never mutated after creation)
    new["history"] = list(state.get("history", []))

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

    # v4.1: succession discounts — check for compatible site OR coal_to_smr convert
    gid = str(geoid)
    succession_site_id = None
    ttd_reduction_applied = 0
    capex_discount_fraction_val = 0.0
    tx_waiver_mw = 0.0
    convert_source_asset_id = None

    if action_id == 'coal_to_smr':
        # coal_to_smr is a convert transition: inherit TX waiver from a live thermal site
        # (the coal plant already retired and spawned the site), OR from an operating coal
        # plant in the county if no site yet exists.
        # TTD and capex discounts do NOT apply — brownfield siting premium already in
        # cost_2024 = $8,500,000/MW. Stacking a 15% discount would double-count it.
        # Deliberate re-pricing note: EES coefficients are unchanged (E:+0.02,Ec:+0.40,S:+0.15).
        for a in state['asset_registry']:
            if (a.get('asset_class') == 'site'
                    and a.get('geoid') == gid
                    and a.get('lifecycle') == 'operating'
                    and a.get('site_class') == COAL_TO_SMR_SITE_CLASS_COMPAT):
                tx_waiver_mw = min(a.get('interconnection_mw') or 0.0, float(magnitude))
                succession_site_id = a['asset_id']
                convert_source_asset_id = a.get('site_origin_asset_id')
                break
        if succession_site_id is None:
            # No site yet — look for an operating coal baseline plant in this county
            for a in state['asset_registry']:
                if (a.get('geoid') == gid
                        and a.get('asset_class') == 'generator'
                        and (a.get('type') or '').lower() == 'coal'
                        and a['lifecycle'] == 'operating'
                        and a['origin'] == 'baseline'):
                    tx_waiver_mw = min(a.get('capacity_mw') or 0.0, float(magnitude))
                    convert_source_asset_id = a['asset_id']
                    break
    else:
        # Standard succession: check for a live compatible site in this county
        site_asset, compat = _find_site_for_action(state, gid, action_id)
        if site_asset is not None:
            ttd_reduction_applied = compat['ttd_reduction_years']
            capex_discount_fraction_val = compat['capex_discount_fraction']
            tx_waiver_mw = min(site_asset.get('interconnection_mw') or 0.0, float(magnitude))
            succession_site_id = site_asset['asset_id']
            # Apply TTD reduction to operational_year (floor: decision_year + 1)
            if override_operational_year is None:
                operational_year = max(decision_year + 1,
                                       operational_year - ttd_reduction_applied)

    # v3.0: push to asset_registry, then re-materialize build_queue view
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
        # v3.1 reclamation (null for player actions)
        'reclamation_year_log': None,
        'active_reclamation_acres': None,
        'reclamation_jobs_direct': None,
        # v3.2 decommissioning (null for player actions)
        'decommissioning_cost_usd': None, 'decommissioning_labor_usd': None,
        'decommissioning_duration_years': None, 'decommissioning_start_year': None,
        # v3.3 housing (null for player action queue entries)
        'housing_total_units': None, 'housing_occupied_units': None,
        'housing_convertible_units': None, 'housing_subsidized_units': None,
        'housing_permits_per_year': None, 'housing_affordable_added': None,
        'housing_pressure_ratio': None, 'housing_seasonal_excluded': None,
        # v4.1 site mechanics (null for player-queued assets)
        'site_origin_asset_id': None, 'site_origin_type': None,
        'site_class': None, 'interconnection_mw': None,
        'water_rights_flag': None, 'acres': None,
        'workforce_pool_initial': None, 'workforce_pool_current': None,
        'workforce_pool_half_life_years': None, 'site_spawn_year': None,
        'restoration_eligibility': None,
        # v4.1 succession discount tracking (populated when a compatible site is used)
        'succession_site_id': succession_site_id,
        'ttd_reduction_applied': ttd_reduction_applied if ttd_reduction_applied else None,
        'capex_discount_fraction': capex_discount_fraction_val if capex_discount_fraction_val else None,
        'tx_waiver_mw': tx_waiver_mw if tx_waiver_mw else None,
        'convert_source_asset_id': convert_source_asset_id,
    }
    state["asset_registry"].append(registry_entry)
    state["build_queue"] = _materialize_build_queue(state["asset_registry"])

    return state


def _count_player_ops_jobs(state, geoid):
    """
    Count operations jobs from player-origin, operating (commissioned) assets at geoid.
    Uses _MIGRATION_OPS_JOBS_PER_MW. Construction workers excluded — they are temporary
    (already modelled in housing pressure) and do not create permanent in-migration.
    """
    geoid_str = str(geoid).zfill(5)
    total = 0.0
    for asset in state.get('asset_registry', []):
        if asset.get('geoid') != geoid_str:
            continue
        if asset.get('origin') != 'player':
            continue
        if asset.get('lifecycle') != 'operating':
            continue
        if asset.get('asset_class') in ('housing_stock', 'production', 'site'):
            continue
        # Player queued assets store MW in `magnitude`; `capacity_mw` is None until commission
        cap_mw = asset.get('capacity_mw') or asset.get('magnitude') or 0.0
        if cap_mw <= 0:
            continue
        raw_type = asset.get('type', '')
        fuel_key = raw_type if raw_type in _MIGRATION_OPS_JOBS_PER_MW else \
            _ACTION_ID_TO_MIGRATION_FUEL.get(raw_type, '')
        jobs_per_mw = _MIGRATION_OPS_JOBS_PER_MW.get(fuel_key, 0.0)
        total += cap_mw * jobs_per_mw
    return total


def _advance_population(state, year):
    """
    Advance county population by one year (mutates state in place).

    Step 1 — Baseline projection: apply annual_growth_rate from population_projections
              (WY EAD 2022 / CO SDO 2022 / constant-share fallback).
    Step 2 — Migration adjustment (if migration_enabled):
              permanent in-migrants from player-added ops jobs.
              Formula: ops_jobs × HOUSEHOLD_FACTOR × AVG_HOUSEHOLD_SIZE × ECONOMIC_BASE_MULTIPLIER
              Confidence: low.
    Step 3 — Update working_age_population proportionally from projection working_age_share.

    Called by advance_year BEFORE snapshot_indicators so history reflects end-of-year state.
    """
    pop_config = state.get('population_config', {})
    migration_enabled = pop_config.get('migration_enabled', True)
    labor_mult = pop_config.get('labor_migration_multiplier', ECONOMIC_BASE_MULTIPLIER)
    projections = state.get('population_projections', {})

    for geoid, ees in state.get('county_ees', {}).items():
        proj = projections.get(geoid, {})
        rate = proj.get('annual_growth_rate', 0.0)
        wa_share = proj.get('working_age_share', WORKING_AGE_SHARE_DEFAULT)

        # Step 1: baseline projection
        new_pop = _round_pop(ees['population'] * (1.0 + rate))

        # Step 2: migration from player-added ops jobs
        if migration_enabled:
            ops_jobs = _count_player_ops_jobs(state, geoid)
            if ops_jobs > 0:
                migration_heads = _round_pop(
                    ops_jobs * HOUSEHOLD_FACTOR * AVG_HOUSEHOLD_SIZE * labor_mult
                )
                new_pop = max(0, new_pop + migration_heads)

        # Step 3: advance population and working-age
        ees['population'] = new_pop
        ees['working_age_population'] = _round_pop(new_pop * wa_share)


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

    # v3.1: autonomous PRB coal surface decline
    lc = state.get('lifecycle_coefficients', {})
    ad_cfg = lc.get('autonomous_decline', {}).get('coal_surface', {})
    if ad_cfg.get('enabled', False):
        annual_rate = abs(ad_cfg.get('annual_rate', 0.02))
        geoid_filter = set(ad_cfg.get('geoid_filter', []))
        for prod_asset in list(state['asset_registry']):
            if (prod_asset.get('asset_class') == 'production'
                    and prod_asset.get('commodity') == 'coal_surface'
                    and prod_asset.get('geoid') in geoid_filter
                    and prod_asset.get('lifecycle') == 'operating'):
                current_vol = prod_asset.get('production_volume', 0.0)
                decline_delta = round(current_vol * annual_rate, 2)
                if decline_delta > 0:
                    state, _ = reduce_production_asset(
                        state, prod_asset['geoid'], 'coal_surface',
                        decline_delta, year=current_year,
                    )

    # v3.1: bond release expiry — recompute active_reclamation_acres for assets
    # that had NO new decline this year (ensures expiry still fires each year).
    lc = state.get('lifecycle_coefficients', {})
    rec_cfg = lc.get('reclamation', {})
    bond_release_years = rec_cfg.get('bond_release_duration_years', 10)
    jobs_per_100_acres = rec_cfg.get('jobs_per_100_acres_yr', 2.5)
    for prod_asset in state['asset_registry']:
        if prod_asset.get('asset_class') == 'production' and prod_asset.get('reclamation_year_log'):
            log = prod_asset['reclamation_year_log']
            active_acres = sum(
                e['acres'] for e in log
                if current_year - e['year'] < bond_release_years
            )
            prod_asset['active_reclamation_acres'] = round(active_acres, 4)
            prod_asset['reclamation_jobs_direct'] = round(
                active_acres * jobs_per_100_acres / 100.0, 2
            )

    # v3.0: execute scheduled retirements
    # v3.2: decommissioning cost draw priced from lifecycle_coefficients.decommissioning
    lc_decom = (state.get('lifecycle_coefficients') or {}).get('decommissioning', {})
    retired_any = False
    for asset in state["asset_registry"]:
        if (asset.get("scheduled_retirement_year") == current_year
                and asset["lifecycle"] == "operating"):
            asset["lifecycle"] = "retired"
            retired_any = True
            # v3.2: decommissioning cost draw (MW-based generator assets only)
            # v4.3: anchor classes (mine/industrial_load/commercial_anchor_load) are
            # excluded — they have no MW-based decommissioning cost model.
            _DECOM_EXCLUDED_CLASSES = frozenset({
                'production', 'mine', 'industrial_load', 'commercial_anchor_load',
            })
            if asset.get('asset_class') not in _DECOM_EXCLUDED_CLASSES:
                cap_mw = asset.get('capacity_mw') or 0
                tech_key = _z1_tech_key(asset.get('type'))
                decom_entry = lc_decom.get(tech_key, {}) if tech_key else {}
                cost_per_mw = decom_entry.get('cost_usd_per_mw', 0)
                if cap_mw > 0 and cost_per_mw > 0:
                    total_cost = round(cap_mw * cost_per_mw, 2)
                    labor_frac = decom_entry.get('labor_fraction', 0)
                    asset['decommissioning_cost_usd'] = total_cost
                    asset['decommissioning_labor_usd'] = round(total_cost * labor_frac, 2)
                    asset['decommissioning_duration_years'] = decom_entry.get('duration_years_midpoint', 1)
                    asset['decommissioning_start_year'] = current_year
            # v4.3 (F1): anchor retirement — unwind MSHA/QCEW employment.
            # The employment unwind feeds V2 migration through _count_player_ops_jobs
            # → _advance_population → population trace. For anchor retirements,
            # employment_direct is already in the observed county baseline, so no
            # _count_player_ops_jobs contribution (anchors are origin=baseline, already
            # filtered). The migration chain only activates for player-placed successors
            # on the spawned site.
            #
            # Mines: mineral-valuation ledger Y-track hook — priced at 0, flagged.
            # Full Y-track coefficients require DOR Mineral Valuation Report (MANUAL_FETCH).
            if asset.get('asset_class') == 'mine':
                asset['_mineral_valuation_y_hook'] = {
                    'commodity': asset.get('commodity'),
                    'employment_unwound': asset.get('employment_direct', 0),
                    'y_track_price': 0,
                    'y_track_confidence': 'flagged',
                    'note': 'Y-track coefficients gated on DOR Mineral Valuation Report; priced at 0 until available.',
                }
            # Reverse capacity through existing network heuristic
            # v4.3: anchor loads are demand, not generation — do NOT reverse bus capacity
            # for industrial_load/commercial_anchor_load. Mine anchors have no MW.
            cap = asset.get("capacity_mw")
            ac = asset.get('asset_class', '')
            if (cap is not None and cap > 0
                    and ac not in ('mine', 'industrial_load', 'commercial_anchor_load')):
                bus_id = _resolve_geoid_to_bus(state, asset["geoid"])
                if bus_id and bus_id in state["bus_state"]:
                    state["bus_state"][bus_id]["capacity_mw"] -= cap
                    state["bus_state"][bus_id]["firm_capacity_mw"] -= cap
    # v4.1+v4.3: spawn site assets from retirements that just fired this year.
    # Spawns for:
    #   - MW-based generators (generator/demand/storage) with capacity_mw > 0
    #   - v4.3 (F1) anchor assets (mine/industrial_load/commercial_anchor_load) —
    #     these may have no MW but carry employment_direct for workforce pool seeding
    # Production (county_cards production_asset) retirement via scheduled_retirement_year
    # is not yet wired — mine sites spawn via reduce_production_asset reaching zero (future).
    _ANCHOR_SPAWN_CLASSES = frozenset({'mine', 'industrial_load', 'commercial_anchor_load'})
    spawned_sites = []
    for asset in state["asset_registry"]:
        if asset.get('scheduled_retirement_year') != current_year:
            continue
        ac = asset.get('asset_class', '')
        if ac in ('generator', 'demand', 'storage'):
            if asset.get('capacity_mw', 0) and asset['capacity_mw'] > 0:
                spawned_sites.append(_spawn_site_from_retired(asset, current_year))
        elif ac in _ANCHOR_SPAWN_CLASSES:
            spawned_sites.append(_spawn_site_from_retired(asset, current_year))
    if spawned_sites:
        state["asset_registry"].extend(spawned_sites)
        retired_any = True  # ensure rematerialisation below

    if retired_any:
        state["build_queue"] = _materialize_build_queue(state["asset_registry"])
        state["existing_assets"] = _materialize_existing_assets(state["asset_registry"])

    # v3.3: housing supply trend (autonomous permits) + pressure recompute
    # Runs every year for all counties that have a housing_stock asset.
    for housing in state["asset_registry"]:
        if housing.get('asset_class') != 'housing_stock':
            continue
        if housing.get('lifecycle') != 'operating':
            continue

        geoid = housing['geoid']

        # Autonomous supply: permits add to total and occupied units each year
        permits = housing.get('housing_permits_per_year') or 0.0
        if permits > 0:
            housing['housing_total_units'] = (housing.get('housing_total_units') or 0) + round(permits)
            housing['housing_occupied_units'] = (housing.get('housing_occupied_units') or 0) + round(permits)

        # Recompute housing pressure ratio
        ratio = _compute_housing_pressure(state, geoid, current_year)
        housing['housing_pressure_ratio'] = ratio

        # S-capital penalty for stressed/crisis pressure (WY counties only by doctrine,
        # but pressure itself is tracked for all 157 counties)
        if ratio is not None and ratio >= HOUSING_PRESSURE_THRESHOLDS['stressed']:
            if geoid in state.get('county_ees', {}):
                excess = ratio - HOUSING_PRESSURE_THRESHOLDS['moderate']
                steps  = max(0.0, excess / 0.05)
                s_penalty = HOUSING_PRESSURE_S_PENALTY_PER_STEP * steps
                old_s = state['county_ees'][geoid]['S']
                # Cap penalty so S doesn't drop below 0
                state['county_ees'][geoid]['S'] = max(0.0, round(old_s + s_penalty, 6))

    # v4.1: workforce pool decay for live site assets
    # Exponential half-life decay: N(t) = N0 × (0.5)^(t / t½)
    # Runs every year regardless of whether the site is used.
    import math as _math
    for site_asset in state["asset_registry"]:
        if site_asset.get('asset_class') != 'site':
            continue
        if site_asset.get('lifecycle') != 'operating':
            continue
        spawn_year = site_asset.get('site_spawn_year') or current_year
        initial = site_asset.get('workforce_pool_initial') or 0.0
        half_life = site_asset.get('workforce_pool_half_life_years') or SITE_WORKFORCE_HALF_LIFE_YEARS
        years_elapsed = current_year - spawn_year
        if years_elapsed > 0 and initial > 0 and half_life > 0:
            decayed = initial * (0.5 ** (years_elapsed / half_life))
            site_asset['workforce_pool_current'] = round(decayed, 1)

    # v4.2: advance population (baseline projection + migration adjustment)
    # Must run BEFORE snapshot_indicators so history captures end-of-year demographic state.
    _advance_population(state, current_year)

    # v4.0: append indicator snapshot at end of year
    if _HAS_INDICATORS:
        state["history"] = state.get("history", []) + [_snapshot_indicators(state)]

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
# PART 14b — History Digest + Projection API (v4.0)
# ═══════════════════════════════════════════════════════════════════════════════

def history_digest(state):
    """
    Create a JSON-serializable digest of state['history'].

    Covers the compact per-year indicator snapshots appended by advance_year.
    Separate from state_digest / fiscal_digest / existing_assets_digest —
    those three are the MAIN digest set (A–H contract); history_digest is
    additive and does not affect existing golden fixtures.

    Returns dict with keys: n_years, year_range, md5.
    md5 is the MD5 of the canonical JSON of the history list.
    """
    history = state.get("history", [])
    if not history:
        return {"n_years": 0, "year_range": [], "md5": hashlib.md5(b"[]").hexdigest()}
    canonical = json.dumps(history, sort_keys=True, separators=(',', ':'))
    md5 = hashlib.md5(canonical.encode()).hexdigest()
    return {
        "n_years": len(history),
        "year_range": [history[0]["year"], history[-1]["year"]],
        "md5": md5,
    }


def project(state, n_years):
    """
    Project state forward n_years with no further decisions.

    This is a CONDITIONAL FORECAST under 'no further decisions,' not a prediction.
    The distinction matters for UI display: projections show likely trajectories
    given the current action set and autonomous dynamics (coal decline, depreciation,
    housing permits). They are NOT predictions of what will happen — player decisions,
    market shifts, and policy changes not captured in the model will alter outcomes.

    Determinism: advance_year is deterministic (no stochastic draws); each call
    with the same input state produces identical output. Projection uses the
    current year as the start and advances sequentially.

    Parameters
    ----------
    state : dict — current engine state (starting point for projection)
    n_years : int — number of years to project forward

    Returns
    -------
    list[dict] — list of n_years engine states, one per projected year.
                 Each state has history appended through its year.
                 The projection does NOT modify the input state.
    """
    states = []
    s = state
    for _ in range(n_years):
        s = advance_year(s)
        states.append(s)
    return states


def project_delta(state, action_id, geoid, magnitude, n_years):
    """
    Project n_years forward with one action applied, returning both the
    action trajectory and the baseline trajectory.

    This is a CONDITIONAL FORECAST under 'no further decisions,' not a prediction.
    The delta shows the marginal impact of a single action vs. the do-nothing baseline
    under the same autonomous dynamics.

    Parameters
    ----------
    state : dict — current engine state
    action_id : str — action to apply at the start
    geoid : str — county GEOID for the action
    magnitude : float — action magnitude
    n_years : int — projection horizon

    Returns
    -------
    (action_states, baseline_states) : tuple[list[dict], list[dict]]
        Both are length-n_years lists of states. The delta for any indicator
        at year t is: compute_indicator(action_states[t], ...) - compute_indicator(baseline_states[t], ...).
        Input state is NOT mutated.
    """
    state_with_action, _ = apply_action(state, action_id, geoid, magnitude)
    baseline_states = project(state, n_years)
    action_states = project(state_with_action, n_years)
    return action_states, baseline_states


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

    # ── v3.1: reclamation obligation tracking ────────────────────────────────
    lc = new_state.get('lifecycle_coefficients', {})
    rec_cfg = lc.get('reclamation', {})
    tons_per_acre = rec_cfg.get('tons_per_acre', 10000)
    jobs_per_100_acres = rec_cfg.get('jobs_per_100_acres_yr', 2.5)
    bond_release_years = rec_cfg.get('bond_release_duration_years', 10)
    new_acres = round(actual_delta / tons_per_acre, 4) if tons_per_acre > 0 else 0.0

    for reg_a in new_state.get('asset_registry', []):
        if (reg_a.get('origin') == 'baseline'
                and reg_a.get('asset_class') == 'production'
                and reg_a.get('geoid') == geoid
                and reg_a.get('commodity') == commodity):
            log = list(reg_a.get('reclamation_year_log') or [])
            log.append({'year': year, 'acres': new_acres})
            reg_a['reclamation_year_log'] = log
            # Active acres: unexpired cohorts within bond_release_duration_years window
            active_acres = sum(
                e['acres'] for e in log
                if year - e['year'] < bond_release_years
            )
            reg_a['active_reclamation_acres'] = round(active_acres, 4)
            reg_a['reclamation_jobs_direct'] = round(
                active_acres * jobs_per_100_acres / 100.0, 2
            )
            break

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
    if asset["asset_class"] not in ("generator", "demand", "storage",
                                      "mine", "industrial_load", "commercial_anchor_load"):
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


def _z1_tech_key(asset_type):
    """Map asset type string to lifecycle_coefficients.z1_hooks tech key."""
    if asset_type is None:
        return None
    t = str(asset_type).lower()
    if 'coal' in t:
        return 'coal'
    if 'gas' in t or 'natural_gas' in t:
        return 'gas'
    if 'wind' in t:
        return 'wind'
    if 'solar' in t or 'pv' in t:
        return 'solar'
    if 'nuclear' in t or 'smr' in t:
        return 'nuclear_smr'
    return None


def delay_retirement(state, asset_id, new_year):
    """
    Push a scheduled retirement later.
    Returns (new_state, {'delay_cost_hook': <usd>, 'confidence': 'low'}).
    Cost priced from lifecycle_coefficients.z1_hooks.delay_retirement (confidence: low).
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["scheduled_retirement_year"] is None:
        raise ValueError(f"Asset {asset_id} has no scheduled retirement to delay")
    old_year = asset["scheduled_retirement_year"]
    if new_year <= old_year:
        raise ValueError(
            f"new_year {new_year} must be later than current {old_year}"
        )
    state["asset_registry"][idx]["scheduled_retirement_year"] = new_year

    # Z1 hook pricing (confidence: low)
    lc = state.get('lifecycle_coefficients', {})
    delay_rates = lc.get('z1_hooks', {}).get('delay_retirement', {})
    tech_key = _z1_tech_key(asset.get('type'))
    cost_per_mw_yr = 0.0
    if tech_key and tech_key in delay_rates:
        cost_per_mw_yr = delay_rates[tech_key].get('cost_usd_per_mw_yr', 0.0)
    capacity_mw = asset.get('capacity_mw') or 0.0
    years_extended = new_year - old_year
    delay_cost = round(cost_per_mw_yr * capacity_mw * years_extended, 2)

    return state, {"delay_cost_hook": delay_cost, "confidence": "low"}


def cancel_queued(state, asset_id):
    """
    Cancel a player-queued asset before commissioning.
    Returns (new_state, {'sunk_cost_fraction': <float>, 'sunk_cost_usd': <float>, 'confidence': 'low'}).
    Sunk cost priced from lifecycle_coefficients.z1_hooks.cancellation_sunk_cost (confidence: low).
    """
    state = _shallow_copy_state(state)
    idx = next((i for i, a in enumerate(state["asset_registry"])
                if a["asset_id"] == asset_id), None)
    if idx is None:
        raise ValueError(f"Asset not found: {asset_id}")
    asset = state["asset_registry"][idx]
    if asset["origin"] != "player":
        raise ValueError(f"cancel_queued only applies to player-origin assets, got '{asset['origin']}'")
    lifecycle_stage = asset["lifecycle"]
    if lifecycle_stage not in ("queued", "under_construction"):
        raise ValueError(f"Cannot cancel asset in lifecycle '{lifecycle_stage}'")
    state["asset_registry"][idx]["lifecycle"] = "retired"
    state["build_queue"] = _materialize_build_queue(state["asset_registry"])

    # Z1 hook pricing (confidence: low)
    lc = state.get('lifecycle_coefficients', {})
    stages = lc.get('z1_hooks', {}).get('cancellation_sunk_cost', {}).get('stages', {})
    stage_cfg = stages.get(lifecycle_stage, {})
    sunk_cost_fraction = stage_cfg.get('sunk_cost_fraction', 0.0)
    # Estimate total project cost as capex_per_mw × magnitude (both stored on player asset)
    capex_per_mw = asset.get('capex_per_mw') or 0.0
    magnitude = asset.get('magnitude') or 0.0
    total_capex = capex_per_mw * magnitude
    sunk_cost_usd = round(sunk_cost_fraction * total_capex, 2)

    return state, {
        "sunk_cost_fraction": sunk_cost_fraction,
        "sunk_cost_usd": sunk_cost_usd,
        "confidence": "low",
    }
