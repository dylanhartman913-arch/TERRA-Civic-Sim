"""
pull_housing_baseline.py — Z3 Housing Baseline Pull
Fetches ACS 5-year housing variables for all 157 Mountain West study counties.
Computes convertible stock per county (seasonal/recreational excluded).
Outputs data/processed/county_housing_baseline.json.

ACS variables pulled (2022 5-year):
  B25001_001E  Total housing units
  B25002_002E  Occupied units
  B25002_003E  Vacant units
  B25003_002E  Owner occupied
  B25003_003E  Renter occupied
  B25004_002E  For rent (vacant)
  B25004_006E  For seasonal/recreational/occasional use  ← EXCLUDED from convertible
  B25004_008E  Other vacant
  B25034_001E  Total (year built denominator)
  B25034_002E  Built 2020 or later
  B25034_003E  Built 2010–2019
  B25034_004E  Built 2000–2009
  B25034_005E  Built 1990–1999
  B25034_006E  Built 1980–1989
  B25034_007E  Built 1970–1979
  B25034_008E  Built 1960–1969
  B25034_009E  Built 1950–1959
  B25034_010E  Built 1940–1949
  B25034_011E  Built 1939 or earlier
  B25070_007E  Renter: 30.0–34.9% income on rent
  B25070_008E  Renter: 35.0–39.9%
  B25070_009E  Renter: 40.0–49.9%
  B25070_010E  Renter: 50.0%+  (cost-burdened renters = sum 007-010)
  B25091_008E  Owner: 30.0–34.9%
  B25091_009E  Owner: 35.0–39.9%
  B25091_010E  Owner: 40.0–49.9%
  B25091_011E  Owner: 50.0%+   (cost-burdened owners = sum 008-011)

Convertible stock formula (cites below):
  rehab_feasible_share = 0.65
    — Mallach (2014) "Understanding Vacant and Abandoned Properties" §3: ~60-70%
      of non-seasonal other-vacant residential units are structurally rehab-feasible
      given adequate investment; midpoint 0.65 used. Confidence: medium.
  frictional_vacancy_threshold = 0.05
    — Harvard Joint Center for Housing Studies, "America's Rental Housing" 2022
      Table A-1: healthy rental vacancy floor ≈ 5%. Excess above this is
      over-vacancy addressable by conversion. Confidence: high.

  other_vacant  = B25004_008E (seasonal excluded: B25004_005E not counted)
  excess_rental = max(0, B25004_002E − 0.05 × B25003_003E)
  convertible_units = round(other_vacant × 0.65 + excess_rental)

permits_per_year proxy:
  (B25034_003E + B25034_002E) / 12  (units built 2010–2022 ÷ 12 yrs)
  Source: ACS B25034; proxy for permit flow absent BPS county-level series for
  rural counties. Confidence: medium (undercounts teardown/replacement; rural
  WY counties may differ from permit-issuing-place BPS coverage).
  Note: confidence flagged low for counties where proxy < 5 units/yr (high
  uncertainty in small-sample ACS estimates).

subsidized_units: stubbed at 0, confidence: low.
  Source required: HUD Picture of Subsidized Households (manual download).
  Add actual values when HUD PIC data is resolved.
"""

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv
import os

# ── Config ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
load_dotenv(Path(__file__).parent.parent / ".env")
CENSUS_KEY = os.environ.get("CENSUS_API_KEY", "")
ACS_YEAR = 2022
ACS_DATASET = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5"

# ── Coefficient parameters (cited in module docstring) ─────────────────────────
REHAB_FEASIBLE_SHARE = 0.65       # Mallach 2014
FRICTIONAL_VACANCY_RATE = 0.05    # Harvard JCHS 2022
PERMITS_WINDOW_YEARS = 12         # 2010–2022 range in B25034

# ── ACS variable list ─────────────────────────────────────────────────────────
ACS_VARS = [
    # Occupancy
    "B25001_001E",  # total units
    "B25002_002E",  # occupied
    "B25002_003E",  # vacant
    # Tenure
    "B25003_002E",  # owner occupied
    "B25003_003E",  # renter occupied
    # Vacancy type (for convertible computation)
    "B25004_002E",  # for rent
    "B25004_006E",  # seasonal/recreational (EXCLUDED from convertible)
    "B25004_008E",  # other vacant
    # Year built (permits proxy: 2020+ and 2010-2019)
    "B25034_001E",  # total (denominator)
    "B25034_002E",  # 2020 or later
    "B25034_003E",  # 2010–2019
    "B25034_004E",  # 2000–2009
    "B25034_005E",  # 1990–1999
    "B25034_006E",  # 1980–1989
    "B25034_007E",  # 1970–1979
    "B25034_008E",  # 1960–1969
    "B25034_009E",  # 1950–1959
    "B25034_010E",  # 1940–1949
    "B25034_011E",  # 1939 or earlier
    # Cost burden — renters
    "B25070_007E",  # 30.0–34.9%
    "B25070_008E",  # 35.0–39.9%
    "B25070_009E",  # 40.0–49.9%
    "B25070_010E",  # 50.0%+
    # Cost burden — owners
    "B25091_008E",  # 30.0–34.9%
    "B25091_009E",  # 35.0–39.9%
    "B25091_010E",  # 40.0–49.9%
    "B25091_011E",  # 50.0%+
]

# States in Mountain West study area
MW_STATES = {
    "56": "WY", "08": "CO", "30": "MT", "49": "UT",
    "16": "ID", "31": "NE", "46": "SD",
}


def _fetch_state(state_fips: str) -> list[dict]:
    """Fetch all ACS housing vars for all counties in a state."""
    get_vars = ",".join(ACS_VARS) + ",NAME"
    url = (
        f"{ACS_DATASET}?get={get_vars}"
        f"&for=county:*&in=state:{state_fips}&key={CENSUS_KEY}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "TERRA-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read())

    header = rows[0]
    results = []
    for row in rows[1:]:
        record = dict(zip(header, row))
        results.append(record)
    return results


def _safe_int(val) -> int | None:
    """Convert ACS string value to int; return None for negatives (ACS null codes)."""
    if val is None:
        return None
    try:
        v = int(val)
        return None if v < 0 else v
    except (ValueError, TypeError):
        return None


def _compute_record(raw: dict, geoid: str) -> dict:
    """Build per-county housing record from raw ACS row."""
    def si(key):
        return _safe_int(raw.get(key))

    total_units     = si("B25001_001E")
    occupied        = si("B25002_002E")
    vacant          = si("B25002_003E")
    owner_occ       = si("B25003_002E")
    renter_occ      = si("B25003_003E")
    for_rent        = si("B25004_002E")
    seasonal        = si("B25004_006E")
    other_vacant    = si("B25004_008E")

    # Year-built buckets
    yb_2020p  = si("B25034_002E") or 0
    yb_2010s  = si("B25034_003E") or 0
    yb_2000s  = si("B25034_004E") or 0
    yb_1990s  = si("B25034_005E") or 0
    yb_1980s  = si("B25034_006E") or 0
    yb_1970s  = si("B25034_007E") or 0
    yb_1960s  = si("B25034_008E") or 0
    yb_1950s  = si("B25034_009E") or 0
    yb_1940s  = si("B25034_010E") or 0
    yb_pre40  = si("B25034_011E") or 0

    # Cost burden
    renter_cb = sum(filter(None, [
        si("B25070_007E"), si("B25070_008E"),
        si("B25070_009E"), si("B25070_010E"),
    ]))
    owner_cb = sum(filter(None, [
        si("B25091_008E"), si("B25091_009E"),
        si("B25091_010E"), si("B25091_011E"),
    ]))

    # ── Convertible stock ────────────────────────────────────────────────────
    # other_vacant × rehab_feasible_share, PLUS excess rental vacancy above frictional floor
    # Seasonal units EXCLUDED (B25004_005E not counted in convertible)
    excess_rental = 0
    if for_rent is not None and renter_occ is not None:
        excess_rental = max(0, for_rent - FRICTIONAL_VACANCY_RATE * renter_occ)
    convertible_units = None
    if other_vacant is not None:
        convertible_units = round(other_vacant * REHAB_FEASIBLE_SHARE + excess_rental)

    # ── Permits proxy ────────────────────────────────────────────────────────
    units_built_2010_2022 = yb_2020p + yb_2010s
    permits_per_year = round(units_built_2010_2022 / PERMITS_WINDOW_YEARS, 1)
    permits_confidence = "low" if permits_per_year < 5 else "medium"

    # ── Pre-1980 vintage share (Golden H narrative: Kemmerer aging stock) ────
    pre1980_units = yb_1970s + yb_1960s + yb_1950s + yb_1940s + yb_pre40
    pre1980_share = (
        round(pre1980_units / total_units, 4)
        if (total_units and total_units > 0) else None
    )

    return {
        # Identity
        "geoid": geoid,
        "source": f"ACS {ACS_YEAR} 5-year",
        "year": ACS_YEAR,
        # Stock counts
        "total_units": {
            "value": total_units, "source": "ACS B25001_001E",
            "year": ACS_YEAR, "confidence": "high"
        },
        "occupied_units": {
            "value": occupied, "source": "ACS B25002_002E",
            "year": ACS_YEAR, "confidence": "high"
        },
        "vacant_units": {
            "value": vacant, "source": "ACS B25002_003E",
            "year": ACS_YEAR, "confidence": "high"
        },
        "owner_occupied": {
            "value": owner_occ, "source": "ACS B25003_002E",
            "year": ACS_YEAR, "confidence": "high"
        },
        "renter_occupied": {
            "value": renter_occ, "source": "ACS B25003_003E",
            "year": ACS_YEAR, "confidence": "high"
        },
        # Vacancy breakdown
        "for_rent_vacant": {
            "value": for_rent, "source": "ACS B25004_002E",
            "year": ACS_YEAR, "confidence": "high"
        },
        "seasonal_recreational_vacant": {
            "value": seasonal, "source": "ACS B25004_006E",
            "year": ACS_YEAR, "confidence": "high",
            "note": "EXCLUDED from convertible stock — not structurally available for year-round occupancy"
        },
        "other_vacant": {
            "value": other_vacant, "source": "ACS B25004_008E",
            "year": ACS_YEAR, "confidence": "high"
        },
        # Derived
        "convertible_units": {
            "value": convertible_units,
            "source": "Derived: other_vacant × 0.65 + excess_rental_vacant; Mallach 2014; Harvard JCHS 2022",
            "year": ACS_YEAR,
            "confidence": "medium",
            "note": (
                f"other_vacant={other_vacant} × rehab_feasible_share=0.65 + "
                f"max(0, for_rent={for_rent} − 0.05 × renter_occ={renter_occ}). "
                "Seasonal vacant excluded."
            )
        },
        "subsidized_units": {
            "value": 0, "source": "MANUAL_FETCH: HUD Picture of Subsidized Households",
            "year": None, "confidence": "low",
            "note": "Stub 0 — requires manual download from HUD PIC (https://www.huduser.gov/portal/datasets/picture.html)"
        },
        "permits_per_year": {
            "value": permits_per_year,
            "source": f"Derived: (B25034_002E + B25034_003E) / {PERMITS_WINDOW_YEARS}; ACS {ACS_YEAR} 5-yr B25034",
            "year": ACS_YEAR, "confidence": permits_confidence,
            "note": "Proxy for annual permit flow; undercounts teardown/replacement"
        },
        # Vintage distribution
        "year_built": {
            "source": f"ACS {ACS_YEAR} B25034", "year": ACS_YEAR, "confidence": "high",
            "built_2020_plus": yb_2020p,
            "built_2010_2019": yb_2010s,
            "built_2000_2009": yb_2000s,
            "built_1990_1999": yb_1990s,
            "built_1980_1989": yb_1980s,
            "built_1970_1979": yb_1970s,
            "built_1960_1969": yb_1960s,
            "built_1950_1959": yb_1950s,
            "built_1940_1949": yb_1940s,
            "built_pre_1940": yb_pre40,
            "pre_1980_share": pre1980_share,
        },
        # Cost burden
        "cost_burdened_renters": {
            "value": renter_cb,
            "source": "ACS B25070 sum(007-010): ≥30% income on rent",
            "year": ACS_YEAR, "confidence": "high"
        },
        "cost_burdened_owners": {
            "value": owner_cb,
            "source": "ACS B25091 sum(008-011): ≥30% income on housing costs",
            "year": ACS_YEAR, "confidence": "high"
        },
        # Parameters used in this derivation (for audit)
        "_derivation_params": {
            "rehab_feasible_share": REHAB_FEASIBLE_SHARE,
            "rehab_feasible_share_source": "Mallach (2014) 'Understanding Vacant and Abandoned Properties' §3",
            "frictional_vacancy_rate": FRICTIONAL_VACANCY_RATE,
            "frictional_vacancy_source": "Harvard JCHS 'America's Rental Housing' 2022 Table A-1",
            "permits_window_years": PERMITS_WINDOW_YEARS,
            "seasonal_excluded": True,
            "acs_year": ACS_YEAR,
        }
    }


def main():
    if not CENSUS_KEY:
        raise RuntimeError("CENSUS_API_KEY not set — check .env")

    # Load study county GEOIDs from county cards
    cards_path = DATA_DIR / "mw_county_cards.json"
    with open(cards_path) as f:
        county_cards = json.load(f)
    study_geoids = set(county_cards.keys())
    print(f"Study counties: {len(study_geoids)}")

    # Fetch per state
    all_rows: dict[str, dict] = {}
    for state_fips, state_abbr in sorted(MW_STATES.items()):
        print(f"  Fetching {state_abbr} ({state_fips})...", end=" ", flush=True)
        try:
            rows = _fetch_state(state_fips)
            for row in rows:
                geoid = row["state"] + row["county"]
                if geoid not in study_geoids:
                    continue
                record = _compute_record(row, geoid)
                all_rows[geoid] = record
            print(f"{len([r for r in all_rows if r.startswith(state_fips)])} counties ✓")
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.5)  # polite rate limiting

    # Report coverage
    missing = study_geoids - set(all_rows.keys())
    if missing:
        print(f"WARNING: Missing {len(missing)} counties: {sorted(missing)}")

    # Teton County exclusion table (Golden H narrative: seasonal vacancy dominates)
    teton = all_rows.get("56039", {})
    lincoln = all_rows.get("56023", {})
    campbell = all_rows.get("56005", {})

    print("\n── Teton County exclusion demonstration ──")
    print(f"{'County':<18} {'total_units':>11} {'vacant':>7} {'seasonal':>9} {'other_vac':>9} {'convertible':>12}")
    print("-" * 70)
    for geoid, label in [("56039", "Teton"), ("56023", "Lincoln"), ("56005", "Campbell")]:
        rec = all_rows.get(geoid, {})
        tu = rec.get("total_units", {}).get("value") or 0
        vac = rec.get("vacant_units", {}).get("value") or 0
        sea = rec.get("seasonal_recreational_vacant", {}).get("value") or 0
        oth = rec.get("other_vacant", {}).get("value") or 0
        con = rec.get("convertible_units", {}).get("value") or 0
        print(f"{label:<18} {tu:>11,} {vac:>7,} {sea:>9,} {oth:>9,} {con:>12,}")

    teton_tu  = teton.get("total_units", {}).get("value") or 0
    teton_sea = teton.get("seasonal_recreational_vacant", {}).get("value") or 0
    teton_con = teton.get("convertible_units", {}).get("value") or 0
    if teton_tu > 0:
        print(f"\nTeton: {teton_sea:,} of {teton_tu:,} vacant units ({teton_sea/teton_tu*100:.1f}%) seasonal — excluded from convertible stock ({teton_con:,} convertible)")

    # Build output
    output = {
        "_schema": "county_housing_baseline_v1",
        "_description": (
            "ACS 2022 5-year housing stock baseline for 157 Mountain West study counties. "
            "Convertible stock excludes seasonal/recreational vacancy. "
            "See _derivation_params on each record for coefficients and citations."
        ),
        "_pulled_utc": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "_study_county_count": len(all_rows),
        "counties": all_rows,
    }

    out_path = DATA_DIR / "county_housing_baseline.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n✓ Saved {out_path} ({len(all_rows)} counties, {out_path.stat().st_size // 1024} KB)")

    return output


if __name__ == "__main__":
    main()
