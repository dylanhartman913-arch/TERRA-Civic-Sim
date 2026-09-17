"""Stage P3 validator: attribution vs loaded baseline (Amendment 1c).

Validates two properties:

  (i)  For every county, the sum of matched facility attribution deltas
       does not exceed the Ec_gencap contribution stored in the baseline
       tract data (mw_tract_ees_scores.parquet) — the data the engine
       ACTUALLY loads, not a value recomputed independently.

  (ii) The normalization slope implied by the baseline's max gen_cap
       equals the slope used in the attribution, within a stated tolerance.

Normalization constants (study-area max gen_cap and ec_slope) are read from
data/manifest/manifest.json so a data refresh that changes the normalization
trips this check instead of silently re-opening F2.

Usage:
    python scripts/validate_p3_attribution.py            # normal run
    python scripts/validate_p3_attribution.py --old-baseline-slope 3.2145e-4
        # regression test: should FAIL (old pre-S7a slope)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
TRACT_PARQUET = ROOT / "data" / "processed" / "mw_tract_ees_scores.parquet"
ATTRIBUTION_CSV = ROOT / "generator_anchor_attribution_audit.csv"
MANIFEST_PATH = ROOT / "data" / "manifest" / "manifest.json"

# ── Tolerance rationale ──────────────────────────────────────────────────────
# The F2 defect was an 11.8% slope mismatch (old slope 3.2145e-4 vs correct
# 2.8751e-4, caused by a stale generator inventory with max 5,184.8 MW instead
# of 5,796.9 MW).
#
# We choose 1% relative tolerance for the slope check:
#   - Catches the 11.8% F2-class mismatch with 10× headroom
#   - Accommodates floating-point rounding (observed <0.001% jitter)
#   - A 1% slope shift implies ~58 MW change in the study-area max generator
#     capacity — large enough to represent a real data change, small enough
#     that any meaningful inventory update triggers re-verification.
#
# This matches the tolerance used in S7a's slope verification (HANDOFF.md S7a
# Step 6: "Tolerance: 1% — PASS").
SLOPE_TOLERANCE_PCT = 1.0


def load_baseline_county_ec(
    tract_path: Path,
) -> tuple[pd.DataFrame, float, float]:
    """Load the stored baseline tract data and compute county-level Ec_gencap.

    Returns (county_df, baseline_max_gen_cap, baseline_ec_slope).
    """
    tracts = pd.read_parquet(tract_path)
    tracts["county_geoid"] = tracts["GEOID"].str[:5]

    baseline_max = float(tracts["gen_cap_50km_mw"].max())
    baseline_min = float(tracts["gen_cap_50km_mw"].min())
    if baseline_max <= baseline_min:
        raise RuntimeError(
            f"Invalid baseline gen_cap range: {baseline_min} to {baseline_max}"
        )
    baseline_slope = 10.0 / (baseline_max - baseline_min) / 6.0

    county_rows = []
    for geoid, group in tracts.groupby("county_geoid"):
        weights = group["population"].fillna(0).clip(lower=0)
        if weights.sum() > 0:
            ec_contrib = float(np.average(group["Ec_gencap"] / 6.0, weights=weights))
            gen_cap = float(np.average(group["gen_cap_50km_mw"], weights=weights))
        else:
            ec_contrib = float((group["Ec_gencap"] / 6.0).mean())
            gen_cap = float(group["gen_cap_50km_mw"].mean())
        county_rows.append(
            {
                "geoid": geoid,
                "baseline_Ec_contribution": ec_contrib,
                "baseline_gen_cap_50km_mw": gen_cap,
            }
        )

    return pd.DataFrame(county_rows), baseline_max, baseline_slope


def load_attribution(csv_path: Path) -> tuple[pd.DataFrame, float]:
    """Load attribution audit CSV, return (county-summed deltas, attribution ec_slope)."""
    attr = pd.read_csv(csv_path, dtype={"geoid": str})
    attribution_slope = float(attr["ec_slope"].iloc[0])
    matched_sums = (
        attr.groupby("geoid")["delta"]
        .sum()
        .reset_index()
        .rename(columns={"delta": "matched_delta_sum"})
    )
    return matched_sums, attribution_slope


def load_manifest_constants(manifest_path: Path) -> dict:
    """Load normalization constants from manifest."""
    with open(manifest_path) as f:
        manifest = json.load(f)
    return manifest.get("normalization_constants", {})


def check_attribution_bounds(
    county_baseline: pd.DataFrame, matched_sums: pd.DataFrame
) -> tuple[bool, pd.DataFrame]:
    """Part (i): assert no county's matched attribution exceeds its baseline Ec_gencap.

    Returns (passed, comparison_df).
    """
    compare = county_baseline.merge(matched_sums, on="geoid", how="left")
    compare["matched_delta_sum"] = compare["matched_delta_sum"].fillna(0.0)
    compare["ratio"] = compare["matched_delta_sum"] / compare[
        "baseline_Ec_contribution"
    ].replace(0, np.nan)

    # Flag counties where attribution exceeds baseline (with tiny FP tolerance)
    over = compare[
        compare["matched_delta_sum"] > compare["baseline_Ec_contribution"] + 1e-12
    ]
    passed = over.empty
    return passed, compare


def check_slope_match(
    baseline_slope: float,
    attribution_slope: float,
    tolerance_pct: float = SLOPE_TOLERANCE_PCT,
    override_slope: float | None = None,
) -> tuple[bool, float]:
    """Part (ii): assert normalization slopes match within tolerance.

    If override_slope is provided, compare that against attribution_slope
    instead of the baseline_slope (used for regression testing).

    Returns (passed, pct_difference).
    """
    reference = override_slope if override_slope is not None else baseline_slope
    if reference == 0:
        return False, float("inf")
    pct_diff = abs(reference - attribution_slope) / attribution_slope * 100.0
    passed = pct_diff <= tolerance_pct
    return passed, pct_diff


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stage P3 validator: attribution vs loaded baseline"
    )
    parser.add_argument(
        "--old-baseline-slope",
        type=float,
        default=None,
        help="Override baseline slope for regression testing (e.g., 3.2145e-4)",
    )
    args = parser.parse_args()

    failures = 0

    # ── Load data ────────────────────────────────────────────────────────────
    print("=" * 70)
    print("Stage P3 validator — attribution vs loaded baseline")
    print("=" * 70)

    county_baseline, baseline_max, baseline_slope = load_baseline_county_ec(
        TRACT_PARQUET
    )
    matched_sums, attribution_slope = load_attribution(ATTRIBUTION_CSV)
    manifest_constants = load_manifest_constants(MANIFEST_PATH)

    print(f"\nBaseline tract source: {TRACT_PARQUET.name}")
    print(f"  study-area max gen_cap: {baseline_max:.1f} MW")
    print(f"  implied ec_slope:       {baseline_slope:.15e}")
    print(f"Attribution source: {ATTRIBUTION_CSV.name}")
    print(f"  ec_slope:               {attribution_slope:.15e}")

    if manifest_constants:
        print(f"\nManifest normalization constants:")
        print(f"  study_area_max_gen_cap_mw: {manifest_constants.get('study_area_max_gen_cap_mw')}")
        print(f"  ec_slope:                  {manifest_constants.get('ec_slope')}")

    # ── Part (i): attribution bounds check ───────────────────────────────────
    print(f"\n{'─' * 70}")
    print("Part (i): attribution ≤ baseline Ec_gencap per county")
    print(f"{'─' * 70}")

    passed_i, comparison = check_attribution_bounds(county_baseline, matched_sums)

    # Report worst ratio (highest ratio across counties with nonzero baseline)
    valid = comparison[comparison["baseline_Ec_contribution"] > 0]
    worst_ratio = valid["ratio"].max()
    worst_counties = valid[np.isclose(valid["ratio"], worst_ratio, atol=1e-6)]
    county_names = pd.read_csv(
        ROOT / "data" / "processed" / "mw_county_ees_summary.csv",
        dtype={"geoid": str},
    )[["geoid", "county_name"]]
    worst_named = worst_counties.merge(county_names, on="geoid", how="left")

    print(f"\n  Worst ratio: {worst_ratio:.6f}")
    print(f"  Counties at worst ratio ({len(worst_named)}):")
    for _, row in worst_named.iterrows():
        print(
            f"    {row['geoid']} ({row.get('county_name', '?')}): "
            f"delta={row['matched_delta_sum']:.6f}, "
            f"baseline={row['baseline_Ec_contribution']:.6f}"
        )

    # Counties with attribution exceeding baseline
    over = comparison[
        comparison["matched_delta_sum"] > comparison["baseline_Ec_contribution"] + 1e-12
    ]
    if over.empty:
        print(f"\n  [PASS] No county's attribution exceeds its baseline Ec_gencap")
    else:
        print(f"\n  [FAIL] {len(over)} counties have attribution > baseline Ec_gencap:")
        over_named = over.merge(county_names, on="geoid", how="left")
        for _, row in over_named.iterrows():
            print(
                f"    {row['geoid']} ({row.get('county_name', '?')}): "
                f"delta={row['matched_delta_sum']:.6f} > "
                f"baseline={row['baseline_Ec_contribution']:.6f}"
            )
        failures += 1

    # ── Part (ii): slope match ───────────────────────────────────────────────
    print(f"\n{'─' * 70}")
    print("Part (ii): normalization slope match")
    print(f"{'─' * 70}")

    if args.old_baseline_slope is not None:
        print(f"\n  REGRESSION MODE: using override slope {args.old_baseline_slope:.6e}")
        print(f"  (simulating pre-S7a baseline)")
        passed_ii, pct_diff = check_slope_match(
            baseline_slope, attribution_slope, override_slope=args.old_baseline_slope
        )
        ref_label = "override"
        ref_value = args.old_baseline_slope
    else:
        passed_ii, pct_diff = check_slope_match(baseline_slope, attribution_slope)
        ref_label = "baseline"
        ref_value = baseline_slope

    print(f"\n  {ref_label} slope:     {ref_value:.15e}")
    print(f"  attribution slope: {attribution_slope:.15e}")
    print(f"  difference:        {pct_diff:.6f}%")
    print(f"  tolerance:         {SLOPE_TOLERANCE_PCT}%")

    if passed_ii:
        print(f"\n  [PASS] Slopes match within {SLOPE_TOLERANCE_PCT}% tolerance")
    else:
        print(f"\n  [FAIL] Slope mismatch: {pct_diff:.4f}% > {SLOPE_TOLERANCE_PCT}% tolerance")
        failures += 1

    # ── Manifest constants cross-check ───────────────────────────────────────
    if manifest_constants:
        print(f"\n{'─' * 70}")
        print("Manifest constants cross-check")
        print(f"{'─' * 70}")

        m_max = manifest_constants.get("study_area_max_gen_cap_mw")
        m_slope = manifest_constants.get("ec_slope")

        if m_max is not None and not np.isclose(m_max, baseline_max, rtol=1e-6):
            print(
                f"\n  [FAIL] Manifest max ({m_max}) != baseline max ({baseline_max})"
            )
            failures += 1
        elif m_max is not None:
            print(f"\n  [PASS] Manifest max matches baseline: {m_max:.1f} MW")

        if m_slope is not None and not np.isclose(m_slope, baseline_slope, rtol=1e-4):
            print(
                f"  [FAIL] Manifest slope ({m_slope}) != baseline slope ({baseline_slope})"
            )
            failures += 1
        elif m_slope is not None:
            print(f"  [PASS] Manifest slope matches baseline: {m_slope:.6e}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    if failures == 0:
        print("RESULT: ALL CHECKS PASSED")
    else:
        print(f"RESULT: {failures} CHECK(S) FAILED")
    print(f"{'=' * 70}")

    return 1 if failures > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
