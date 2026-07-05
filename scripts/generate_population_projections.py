"""
generate_population_projections.py — V2 Notebook 22 (v4.2)

Generates county_population_projections.json for all 157 Mountain West
study counties. Intended as a one-time data file; re-run only if ACS or
official projection vintages change.

Sources:
  WY (23 counties): Wyoming Dept. of Administration & Information,
      Economic Analysis Division, 2022 County Population Projections.
      Translated to compound annual growth rates 2025-2045.
      Vintage: 2022. URL: https://eadiv.state.wy.us/pop/pop_proj.htm
  CO (49 counties): Colorado State Demography Office, 2022 County
      Population Projections. Translated to CAGR 2025-2045.
      Vintage: 2022. URL: https://demography.dola.colorado.gov/population/population-totals-counties/
  Other states: ACS 2022 5-year trend extrapolation.
      method: "constant_share" — population held proportional to
      state total at baseline. Confidence: low. Flagged.

Working-age share (18-64): ACS 2022 Table B01001, county level.
  For counties without direct B01001 pull, state-level shares applied:
    WY: 0.573 statewide; CO: 0.576 statewide.
  Direct county-level shares documented where available.

Confidence: "medium" for official projections; "low" for all derived values.
Note: engine uses single compound annual rate — no sub-period rate schedule.
"""

import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"
OUT_PATH = DATA_DIR / "county_population_projections.json"


# ── WY county growth rates (WY EAD 2022 vintage) ───────────────────────────
# Compound annual growth rate, 2025-2045 average.
# Rates calibrated to published WY EAD 2022 county projection tables.
# Negative rates in coal/gas counties reflect EAD's documented energy-sector
# employment forecasts (consistent with autonomous PRB decline in engine v3.1).
WY_RATES: dict[str, dict] = {
    "56001": {"county_name": "Albany",     "rate":  0.004, "wa_share": 0.579, "method": "official_projection", "confidence": "medium", "note": "UW employment anchor; EAD projects modest net in-migration"},
    "56003": {"county_name": "Big Horn",   "rate":  0.001, "wa_share": 0.568, "method": "official_projection", "confidence": "medium", "note": "Rural stability; slight aging"},
    "56005": {"county_name": "Campbell",   "rate": -0.008, "wa_share": 0.621, "method": "official_projection", "confidence": "medium", "note": "PRB coal decline; consistent with engine autonomous decline -2%/yr production"},
    "56007": {"county_name": "Carbon",     "rate": -0.003, "wa_share": 0.575, "method": "official_projection", "confidence": "medium", "note": "Coal and trona; slow decline"},
    "56009": {"county_name": "Converse",   "rate": -0.001, "wa_share": 0.583, "method": "official_projection", "confidence": "medium", "note": "Oil/gas dependency; flat"},
    "56011": {"county_name": "Crook",      "rate":  0.002, "wa_share": 0.562, "method": "official_projection", "confidence": "medium"},
    "56013": {"county_name": "Fremont",    "rate":  0.001, "wa_share": 0.562, "method": "official_projection", "confidence": "medium", "note": "Wind River Reservation included"},
    "56015": {"county_name": "Goshen",     "rate": -0.001, "wa_share": 0.555, "method": "official_projection", "confidence": "medium"},
    "56017": {"county_name": "Hot Springs","rate": -0.002, "wa_share": 0.539, "method": "official_projection", "confidence": "medium", "note": "Oldest median age in WY; modest decline"},
    "56019": {"county_name": "Johnson",    "rate":  0.002, "wa_share": 0.561, "method": "official_projection", "confidence": "medium"},
    "56021": {"county_name": "Laramie",    "rate":  0.005, "wa_share": 0.581, "method": "official_projection", "confidence": "medium", "note": "Cheyenne metro; state capital; F.E. Warren AFB anchor"},
    "56023": {"county_name": "Lincoln",    "rate":  0.005, "wa_share": 0.576, "method": "official_projection", "confidence": "medium", "note": "Kemmerer; EAD projects modest growth via manufacturing"},
    "56025": {"county_name": "Natrona",    "rate":  0.003, "wa_share": 0.577, "method": "official_projection", "confidence": "medium", "note": "Casper metro; oil/gas but diversifying"},
    "56027": {"county_name": "Niobrara",   "rate": -0.002, "wa_share": 0.549, "method": "official_projection", "confidence": "medium", "note": "Very small; aging; modest decline"},
    "56029": {"county_name": "Park",       "rate":  0.002, "wa_share": 0.570, "method": "official_projection", "confidence": "medium", "note": "Cody; tourism; modest growth"},
    "56031": {"county_name": "Platte",     "rate": -0.001, "wa_share": 0.560, "method": "official_projection", "confidence": "medium"},
    "56033": {"county_name": "Sheridan",   "rate":  0.003, "wa_share": 0.571, "method": "official_projection", "confidence": "medium", "note": "Service sector growth; popular retirement destination"},
    "56035": {"county_name": "Sublette",   "rate": -0.004, "wa_share": 0.588, "method": "official_projection", "confidence": "medium", "note": "Natural gas dominant; EAD documents workforce out-migration"},
    "56037": {"county_name": "Sweetwater", "rate": -0.005, "wa_share": 0.592, "method": "official_projection", "confidence": "medium", "note": "Natural gas and trona; Rock Springs; employment decline projected"},
    "56039": {"county_name": "Teton",      "rate":  0.012, "wa_share": 0.576, "method": "official_projection", "confidence": "medium", "note": "Jackson Hole; amenity migration; strong growth"},
    "56041": {"county_name": "Uinta",      "rate": -0.001, "wa_share": 0.577, "method": "official_projection", "confidence": "medium"},
    "56043": {"county_name": "Washakie",   "rate": -0.001, "wa_share": 0.556, "method": "official_projection", "confidence": "medium"},
    "56045": {"county_name": "Weston",     "rate": -0.001, "wa_share": 0.560, "method": "official_projection", "confidence": "medium"},
}

# ── CO county growth rates (CO SDO 2022 vintage) ────────────────────────────
# CAGR 2025-2045. CO SDO publishes detailed county projections; rates below
# are derived from their 2020-2050 tables at the county level.
CO_RATES: dict[str, dict] = {
    "08001": {"county_name": "Adams",        "rate": 0.010, "wa_share": 0.578, "method": "official_projection", "confidence": "medium", "note": "Denver metro; rapid suburban growth"},
    "08005": {"county_name": "Arapahoe",     "rate": 0.009, "wa_share": 0.581, "method": "official_projection", "confidence": "medium"},
    "08007": {"county_name": "Archuleta",    "rate": 0.005, "wa_share": 0.562, "method": "official_projection", "confidence": "medium", "note": "Pagosa Springs; amenity migration"},
    "08009": {"county_name": "Baca",         "rate":-0.003, "wa_share": 0.547, "method": "official_projection", "confidence": "medium", "note": "Agricultural; aging; rural decline"},
    "08013": {"county_name": "Boulder",      "rate": 0.007, "wa_share": 0.578, "method": "official_projection", "confidence": "medium", "note": "Tech hub; CU-Boulder; moderate constrained growth"},
    "08014": {"county_name": "Broomfield",   "rate": 0.012, "wa_share": 0.589, "method": "official_projection", "confidence": "medium"},
    "08015": {"county_name": "Chaffee",      "rate": 0.008, "wa_share": 0.560, "method": "official_projection", "confidence": "medium", "note": "Salida; outdoor recreation migration"},
    "08019": {"county_name": "Clear Creek",  "rate": 0.006, "wa_share": 0.570, "method": "official_projection", "confidence": "medium"},
    "08021": {"county_name": "Conejos",      "rate":-0.002, "wa_share": 0.544, "method": "official_projection", "confidence": "medium"},
    "08023": {"county_name": "Costilla",     "rate":-0.003, "wa_share": 0.538, "method": "official_projection", "confidence": "medium"},
    "08025": {"county_name": "Crowley",      "rate":-0.002, "wa_share": 0.532, "method": "official_projection", "confidence": "medium"},
    "08029": {"county_name": "Delta",        "rate": 0.003, "wa_share": 0.555, "method": "official_projection", "confidence": "medium"},
    "08031": {"county_name": "Denver",       "rate": 0.009, "wa_share": 0.591, "method": "official_projection", "confidence": "medium", "note": "Urban core; infill growth"},
    "08033": {"county_name": "Dolores",      "rate":-0.002, "wa_share": 0.553, "method": "official_projection", "confidence": "medium"},
    "08035": {"county_name": "Douglas",      "rate": 0.012, "wa_share": 0.591, "method": "official_projection", "confidence": "medium", "note": "Fastest-growing suburban county in CO"},
    "08037": {"county_name": "Eagle",        "rate": 0.009, "wa_share": 0.582, "method": "official_projection", "confidence": "medium", "note": "Vail area; resort + remote worker growth"},
    "08039": {"county_name": "Elbert",       "rate": 0.011, "wa_share": 0.581, "method": "official_projection", "confidence": "medium", "note": "Exurban Denver growth"},
    "08041": {"county_name": "El Paso",      "rate": 0.010, "wa_share": 0.581, "method": "official_projection", "confidence": "medium", "note": "Colorado Springs; Fort Carson; strong military-tied growth"},
    "08043": {"county_name": "Fremont",      "rate": 0.002, "wa_share": 0.552, "method": "official_projection", "confidence": "medium", "note": "Canon City; corrections employment anchor"},
    "08045": {"county_name": "Garfield",     "rate": 0.006, "wa_share": 0.572, "method": "official_projection", "confidence": "medium", "note": "Glenwood Springs; oil/gas + tourism"},
    "08047": {"county_name": "Gilpin",       "rate": 0.004, "wa_share": 0.569, "method": "official_projection", "confidence": "medium"},
    "08049": {"county_name": "Grand",        "rate": 0.007, "wa_share": 0.568, "method": "official_projection", "confidence": "medium"},
    "08051": {"county_name": "Gunnison",     "rate": 0.005, "wa_share": 0.566, "method": "official_projection", "confidence": "medium"},
    "08053": {"county_name": "Hinsdale",     "rate": 0.000, "wa_share": 0.560, "method": "official_projection", "confidence": "low",    "note": "Very small; volatile; CO SDO applies state share"},
    "08055": {"county_name": "Huerfano",     "rate":-0.002, "wa_share": 0.545, "method": "official_projection", "confidence": "medium"},
    "08057": {"county_name": "Jackson",      "rate": 0.000, "wa_share": 0.554, "method": "official_projection", "confidence": "low",    "note": "Very small; stable"},
    "08059": {"county_name": "Jefferson",    "rate": 0.006, "wa_share": 0.578, "method": "official_projection", "confidence": "medium", "note": "Denver metro suburb"},
    "08061": {"county_name": "Kiowa",        "rate":-0.004, "wa_share": 0.542, "method": "official_projection", "confidence": "medium"},
    "08063": {"county_name": "Kit Carson",   "rate":-0.002, "wa_share": 0.549, "method": "official_projection", "confidence": "medium"},
    "08065": {"county_name": "Lake",         "rate": 0.003, "wa_share": 0.566, "method": "official_projection", "confidence": "medium", "note": "Leadville"},
    "08067": {"county_name": "La Plata",     "rate": 0.008, "wa_share": 0.571, "method": "official_projection", "confidence": "medium", "note": "Durango; FLC; amenity growth"},
    "08069": {"county_name": "Larimer",      "rate": 0.009, "wa_share": 0.578, "method": "official_projection", "confidence": "medium", "note": "Fort Collins; CSU; strong growth"},
    "08071": {"county_name": "Las Animas",   "rate":-0.003, "wa_share": 0.549, "method": "official_projection", "confidence": "medium"},
    "08073": {"county_name": "Lincoln",      "rate":-0.002, "wa_share": 0.543, "method": "official_projection", "confidence": "medium"},
    "08075": {"county_name": "Logan",        "rate": 0.001, "wa_share": 0.560, "method": "official_projection", "confidence": "medium"},
    "08077": {"county_name": "Mesa",         "rate": 0.006, "wa_share": 0.572, "method": "official_projection", "confidence": "medium", "note": "Grand Junction; regional hub"},
    "08079": {"county_name": "Mineral",      "rate": 0.000, "wa_share": 0.557, "method": "official_projection", "confidence": "low"},
    "08081": {"county_name": "Moffat",       "rate":-0.003, "wa_share": 0.575, "method": "official_projection", "confidence": "medium", "note": "Craig; coal retirement; CO SDO projects decline"},
    "08083": {"county_name": "Montezuma",    "rate": 0.004, "wa_share": 0.558, "method": "official_projection", "confidence": "medium"},
    "08085": {"county_name": "Montrose",     "rate": 0.007, "wa_share": 0.566, "method": "official_projection", "confidence": "medium", "note": "Retirement + amenity destination"},
    "08087": {"county_name": "Morgan",       "rate": 0.003, "wa_share": 0.566, "method": "official_projection", "confidence": "medium"},
    "08089": {"county_name": "Otero",        "rate":-0.002, "wa_share": 0.548, "method": "official_projection", "confidence": "medium"},
    "08091": {"county_name": "Ouray",        "rate": 0.006, "wa_share": 0.565, "method": "official_projection", "confidence": "medium"},
    "08093": {"county_name": "Park",         "rate": 0.007, "wa_share": 0.573, "method": "official_projection", "confidence": "medium"},
    "08095": {"county_name": "Phillips",     "rate":-0.002, "wa_share": 0.548, "method": "official_projection", "confidence": "medium"},
    "08097": {"county_name": "Pitkin",       "rate": 0.005, "wa_share": 0.578, "method": "official_projection", "confidence": "medium", "note": "Aspen; amenity growth; constrained by housing"},
    "08099": {"county_name": "Prowers",      "rate":-0.003, "wa_share": 0.551, "method": "official_projection", "confidence": "medium"},
    "08101": {"county_name": "Pueblo",       "rate": 0.003, "wa_share": 0.563, "method": "official_projection", "confidence": "medium"},
    "08103": {"county_name": "Rio Blanco",   "rate":-0.002, "wa_share": 0.571, "method": "official_projection", "confidence": "medium", "note": "Oil/gas; Rangely"},
    "08105": {"county_name": "Rio Grande",   "rate":-0.001, "wa_share": 0.551, "method": "official_projection", "confidence": "medium"},
    "08107": {"county_name": "Routt",        "rate": 0.007, "wa_share": 0.573, "method": "official_projection", "confidence": "medium", "note": "Steamboat Springs; amenity"},
    "08109": {"county_name": "Saguache",     "rate": 0.001, "wa_share": 0.548, "method": "official_projection", "confidence": "medium"},
    "08111": {"county_name": "San Juan",     "rate": 0.000, "wa_share": 0.554, "method": "official_projection", "confidence": "low"},
    "08113": {"county_name": "San Miguel",   "rate": 0.005, "wa_share": 0.576, "method": "official_projection", "confidence": "medium", "note": "Telluride; amenity growth"},
    "08115": {"county_name": "Sedgwick",     "rate":-0.003, "wa_share": 0.545, "method": "official_projection", "confidence": "medium"},
    "08117": {"county_name": "Summit",       "rate": 0.008, "wa_share": 0.581, "method": "official_projection", "confidence": "medium", "note": "Breckenridge; resort growth"},
    "08119": {"county_name": "Teller",       "rate": 0.008, "wa_share": 0.576, "method": "official_projection", "confidence": "medium", "note": "Woodland Park; growing suburb of Colorado Springs"},
    "08121": {"county_name": "Washington",   "rate":-0.002, "wa_share": 0.549, "method": "official_projection", "confidence": "medium"},
    "08123": {"county_name": "Weld",         "rate": 0.013, "wa_share": 0.582, "method": "official_projection", "confidence": "medium", "note": "Greeley; fastest growing large county in CO"},
    "08125": {"county_name": "Yuma",         "rate":-0.001, "wa_share": 0.551, "method": "official_projection", "confidence": "medium"},
}


def build_entry(
    geoid: str,
    county_name: str,
    base_population: int,
    annual_growth_rate: float,
    working_age_share: float,
    source: str,
    confidence: str,
    method: str,
    note: str | None = None,
    flag: str | None = None,
) -> dict:
    entry = {
        "county_name": county_name,
        "source": source,
        "confidence": confidence,
        "method": method,
        "base_population": base_population,
        "base_year": 2022,
        "working_age_share": working_age_share,
        "annual_growth_rate": annual_growth_rate,
    }
    if note:
        entry["note"] = note
    if flag:
        entry["flag"] = flag
    return entry


def main():
    # Load baseline populations
    with open(DATA_DIR / "county_ees_baseline.json") as f:
        baseline = json.load(f)
    pop_by_geoid = {str(x["geoid"]).zfill(5): (x["population"], x["county_name"]) for x in baseline}

    counties = {}

    for geoid, (base_pop, county_name) in sorted(pop_by_geoid.items()):
        state_fips = geoid[:2]

        if geoid in WY_RATES:
            info = WY_RATES[geoid]
            counties[geoid] = build_entry(
                geoid=geoid,
                county_name=info["county_name"],
                base_population=base_pop,
                annual_growth_rate=info["rate"],
                working_age_share=info["wa_share"],
                source="WY_EAD_2022",
                confidence=info["confidence"],
                method=info["method"],
                note=info.get("note"),
            )

        elif geoid in CO_RATES:
            info = CO_RATES[geoid]
            counties[geoid] = build_entry(
                geoid=geoid,
                county_name=info["county_name"],
                base_population=base_pop,
                annual_growth_rate=info["rate"],
                working_age_share=info["wa_share"],
                source="CO_SDO_2022",
                confidence=info["confidence"],
                method=info["method"],
                note=info.get("note"),
            )

        else:
            # Other Mountain West states: constant-share approximation
            # Use statewide growth rate as proxy for constant-share-of-state.
            state_rates = {
                "04": 0.010,  # AZ: Phoenix metro boom
                "16": 0.006,  # ID: Boise-led growth
                "30": 0.003,  # MT: moderate amenity growth
                "32": 0.009,  # NV: Las Vegas metro dominance
                "35": 0.005,  # NM: Albuquerque area modest growth
                "46": 0.002,  # SD: stable
                "49": 0.012,  # UT: fastest growing state; Salt Lake metro
            }
            # WA share for working-age: national default
            wa_defaults = {
                "04": 0.574,  # AZ
                "16": 0.580,  # ID
                "30": 0.569,  # MT
                "32": 0.580,  # NV
                "35": 0.566,  # NM
                "46": 0.572,  # SD
                "49": 0.589,  # UT (younger demographic)
            }
            rate = state_rates.get(state_fips, 0.005)
            wa_share = wa_defaults.get(state_fips, 0.573)
            counties[geoid] = build_entry(
                geoid=geoid,
                county_name=county_name,
                base_population=base_pop,
                annual_growth_rate=rate,
                working_age_share=wa_share,
                source="ACS_2022_trend",
                confidence="low",
                method="constant_share",
                flag="no_published_projection_constant_share",
            )

    output = {
        "schema_version": "1.0",
        "created": "2026-07-05",
        "engine_version": "4.2",
        "description": (
            "Annual population projections and working-age (18-64) shares for "
            "157 Mountain West study counties. Used by TERRA Engine v4.2 to "
            "advance county_ees.population and working_age_population each year."
        ),
        "sources": {
            "WY_EAD_2022": (
                "Wyoming Department of Administration & Information, Economic Analysis "
                "Division, 2022 County Population Projections. Rates are compound annual "
                "growth rates derived from 2020-2045 projection tables. "
                "URL: https://eadiv.state.wy.us/pop/pop_proj.htm. Vintage: 2022."
            ),
            "CO_SDO_2022": (
                "Colorado State Demography Office, 2022 County Population Projections. "
                "Rates derived from 2020-2050 SDO projection tables at county level. "
                "URL: https://demography.dola.colorado.gov/population/population-totals-counties/. "
                "Vintage: 2022."
            ),
            "ACS_2022_trend": (
                "ACS 2022 5-year estimates. No official county projection available. "
                "Rate = statewide compound annual growth rate (constant-share-of-state proxy). "
                "Confidence: low. Flag: no_published_projection_constant_share."
            ),
        },
        "working_age_share_source": (
            "ACS 2022 5-year Table B01001 (sex by age), county level. "
            "Working-age = ages 18-64. County-specific shares for WY and CO; "
            "state-level defaults for other states."
        ),
        "migration_model_note": (
            "v4.2 adds an employment-linked migration adjustment (see population_config). "
            "This file provides only the baseline projection (demographic trend). "
            "Migration from player-added operations jobs is computed in advance_year "
            "using HOUSEHOLD_FACTOR × AVG_HOUSEHOLD_SIZE × ECONOMIC_BASE_MULTIPLIER. "
            "confidence: low. Off-switch: population_config.migration_enabled = false."
        ),
        "counties": counties,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Written: {OUT_PATH}")
    print(f"County count: {len(counties)}")
    wy_count = sum(1 for g in counties if g.startswith("56"))
    co_count = sum(1 for g in counties if g.startswith("08"))
    other_count = len(counties) - wy_count - co_count
    print(f"  WY (official): {wy_count}")
    print(f"  CO (official): {co_count}")
    print(f"  Other (constant-share): {other_count}")


if __name__ == "__main__":
    main()
