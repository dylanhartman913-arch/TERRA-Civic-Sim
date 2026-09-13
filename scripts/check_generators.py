#!/usr/bin/env python3
"""
check_generators.py — runtime file → tracked generator audit

For each data file that is loaded at runtime by scripts/ or src/, grep
notebooks/ and scripts/ for a tracked file that references the output
filename, and report PASS/FAIL per file.

PASS means at least one tracked notebook or script contains the filename
      (indicating a generator is present in the tracked tree).
FAIL means no tracked file references the filename — the data file exists
      in data/processed/ but has no tracked producer.

This is the S4 deliverable. FAIL entries feed directly into S9 and the
W7-2 generator manifest.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

# Each entry: (output_filename, human_description)
# Filenames are relative to data/processed/ unless they start with "data/".
# The grep uses only Path(filename).name so both forms resolve correctly.
RUNTIME_FILES = [
    # ── Ticket §step-3 mapping (verified against actual repo) ──────────────
    ("county_ees_baseline.json",          "08b_ees_baseline → county EES baseline"),
    ("mw_county_ees_summary.csv",         "08b_ees_baseline → MW county EES summary"),
    ("mw_ecoregion_ees_summary.csv",      "08b_ees_baseline → MW ecoregion EES summary"),
    ("county_crosswalk.parquet",          "08c_spatial_hierarchy → county crosswalk"),
    ("spatial_hierarchy_counties.parquet","08c_spatial_hierarchy → county spatial hierarchy"),
    ("spatial_hierarchy_huc8.parquet",    "08c_spatial_hierarchy → HUC8 spatial hierarchy"),
    ("synthetic_buses.geojson",           "07_synthetic_topology → synthetic buses"),
    ("synthetic_branches.geojson",        "07_synthetic_topology → synthetic branches"),
    ("network_metadata.json",             "07_synthetic_topology → network metadata"),
    ("mw_action_library_v3.json",         "15_action_library_v3 → MW action library v3"),
    ("wy_county_fiscal_baseline.json",    "17_wy_fiscal_pull → WY fiscal baseline"),
    ("wy_fiscal_coefficients.json",       "18_fiscal_coefficients → WY fiscal coefficients"),
    ("mw_anchor_facilities.geojson",      "22_anchor_facilities → MW anchor facilities"),
    ("baseline_retirements.json",         "10_eia860_retirements → baseline retirements"),
    ("data/golden/golden_a.json",         "16_engine_v2_golden / 19_engine_fiscal_golden → golden_a"),
    ("data/golden/golden_e.json",         "16_engine_v2_golden / 19_engine_fiscal_golden → golden_e"),
    # ── Additional runtime files found by scanning scripts/ and src/ ───────
    ("ba_interchange_summary.csv",        "03b_ba_interchange → BA interchange summary (terra_engine.py:633)"),
    ("generators_with_costs.parquet",     "06_generator_costs → generators with costs (terra_engine.py:603)"),
    ("ecoregion_ba_crosswalk.geojson",    "08a_ecoregion_crosswalk → ecoregion-BA crosswalk"),
    ("mw_ecoregions.geojson",             "08a_ecoregion_crosswalk → MW ecoregions"),
    ("mw_tracts_2020.parquet",            "14_county_foundation → MW census tracts 2020"),
    ("mw_county_cards.json",              "14_county_foundation → MW county cards"),
    ("wy_county_ag_baseline.json",        "25_wy_ag_baseline_pull → WY ag baseline"),
    ("wy_grazing_allotments.csv",         "25_wy_ag_baseline_pull → WY grazing allotments"),
    ("county_climate_projections.json",   "23c_cmip6_acquisition → county climate projections"),
    ("county_population_projections.json","scripts/generate_population_projections.py → county pop projections"),
    ("wy_county_ag_engine_baseline.json", "scripts/build_county_ag_engine_baseline.py → WY ag engine baseline"),
    # ── Runtime files with NO currently-tracked generator (expected FAIL) ──
    # These feed S9 / W7-2 work. Do not suppress.
    ("ees_scenario_profiles.json",         "? → EES scenario profiles (terra_engine.py:2292, optional load)"),
    ("lifecycle_coefficients.json",       "? → lifecycle coefficients (terra_engine.py:2417, optional load)"),
]


def grep_tracked(search_term: str) -> list[str]:
    """Return list of tracked files in notebooks/ or scripts/ containing search_term."""
    result = subprocess.run(
        ["git", "grep", "-l", "--", search_term, "notebooks/", "scripts/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return []


def main() -> int:
    pass_count = 0
    fail_count = 0
    fail_list: list[tuple[str, str]] = []

    print("check_generators.py — runtime file → tracked generator audit")
    print("=" * 70)

    for filename, description in RUNTIME_FILES:
        search_term = Path(filename).name
        hits = grep_tracked(search_term)

        if hits:
            status = "PASS"
            pass_count += 1
            first = hits[0]
            extra = f"  (+{len(hits) - 1} more)" if len(hits) > 1 else ""
            detail = f"{first}{extra}"
        else:
            status = "FAIL"
            fail_count += 1
            fail_list.append((filename, description))
            detail = "no tracked generator found"

        print(f"[{status}]  {filename}")
        print(f"       {description}")
        print(f"       → {detail}")
        print()

    print("=" * 70)
    print(f"Results: {pass_count} PASS  |  {fail_count} FAIL")

    if fail_list:
        print()
        print("FAIL list (feeds S9 / W7-2 generator manifest):")
        for fname, desc in fail_list:
            print(f"  - {fname}")
            print(f"    {desc}")

    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
