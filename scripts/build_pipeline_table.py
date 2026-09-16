#!/usr/bin/env python3
"""
build_pipeline_table.py — generate the hash/last-built columns for docs/PIPELINES.md

Enumerates runtime-loaded files, finds their generator via the same technique
check_generators.py uses (git grep in notebooks/ and scripts/), and reports
current SHA-256 hash + last git commit that touched each file.

Output: a markdown table printed to stdout. Redirect to update PIPELINES.md
hash/last-built columns, or use --json for machine-readable output.

This is the S9 deliverable and seed for W7-2/S11 manifest work.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Runtime files ────────────────────────────────────────────────────────────
# Each entry: (path_relative_to_ROOT, pipeline_id, generator_description)
#
# path is relative to ROOT; for data/processed/ files use that prefix.
# For terra-app/src/data/ files use that prefix.
# For data/golden/ files use that prefix.

RUNTIME_FILES = [
    # ── Pipeline A: Generator inventory & provenance ─────────────────────────
    ("data/processed/generators_with_costs.parquet",     "A", "06_generator_costs.ipynb"),

    # ── Pipeline B: Synthetic network & E4ST ─────────────────────────────────
    ("data/processed/synthetic_buses.geojson",           "B", "07_synthetic_topology.ipynb"),
    ("data/processed/synthetic_branches.geojson",        "B", "07_synthetic_topology.ipynb"),
    ("data/processed/network_metadata.json",             "B", "07_synthetic_topology.ipynb + many writers"),
    ("data/processed/synthetic_plant_assignments.parquet","B", "07_synthetic_topology.ipynb"),
    ("data/processed/ba_interchange_summary.csv",        "B", "03b_ba_interchange.ipynb"),
    ("terra-app/src/data/initial_network.json",          "B", "07_synthetic_topology.ipynb"),
    ("terra-app/src/data/baseline_retirements.json",     "B", "10_eia860_retirements.ipynb"),

    # ── Pipeline C: EES capital baseline ─────────────────────────────────────
    ("data/processed/county_ees_baseline.json",          "C", "08b_ees_baseline.ipynb + 14_county_foundation.ipynb"),
    ("data/processed/mw_county_ees_summary.csv",         "C", "08b_ees_baseline.ipynb + 14_county_foundation.ipynb"),
    ("data/processed/mw_ecoregion_ees_summary.csv",      "C", "08b_ees_baseline.ipynb"),
    ("data/processed/county_crosswalk.parquet",          "C", "08c_spatial_hierarchy.ipynb"),
    ("data/processed/spatial_hierarchy_counties.parquet", "C", "08c_spatial_hierarchy.ipynb"),
    ("data/processed/spatial_hierarchy_huc8.parquet",     "C", "08c_spatial_hierarchy.ipynb"),
    ("data/processed/mw_county_cards.json",              "C", "14_county_foundation.ipynb"),
    ("terra-app/src/data/county_ees_baseline.json",      "C", "Promoted from data/processed/"),
    ("terra-app/src/data/county_cards.json",             "C", "Synced from mw_county_cards.json"),
    ("terra-app/src/data/county_crosswalk.json",         "C", "Derived from county_crosswalk.parquet"),

    # ── Pipeline D: Action library & material coefficients ───────────────────
    ("data/processed/mw_action_library_v3.json",         "D", "15_action_library_v3.ipynb"),
    ("data/processed/ees_scenario_profiles.json",        "D", "NO TRACKED GENERATOR"),
    ("data/processed/lifecycle_coefficients.json",       "D", "NO TRACKED GENERATOR"),
    ("terra-app/src/data/action_library_v3.json",        "D", "Promoted from mw_action_library_v3.json"),
    ("terra-app/src/data/scenario_profiles.json",        "D", "TS-side copy (distinct from ees_scenario_profiles)"),
    ("terra-app/src/data/lifecycle_coefficients.json",    "D", "Promoted from data/processed/"),
    ("terra-app/src/data/material_coefficient_sources.json","D","15_action_library_v3.ipynb"),

    # ── Pipeline E: Wyoming fiscal ledger ────────────────────────────────────
    ("data/processed/wy_county_fiscal_baseline.json",    "E", "17_wy_fiscal_pull.ipynb"),
    ("data/processed/wy_fiscal_coefficients.json",       "E", "18_fiscal_coefficients.ipynb + 18b_school_finance_patch.ipynb"),
    ("data/processed/county_housing_baseline.json",      "E", "scripts/pull_housing_baseline.py"),
    ("terra-app/src/data/fiscal_baseline.json",          "E", "Promoted from wy_county_fiscal_baseline.json"),
    ("terra-app/src/data/fiscal_coefficients.json",      "E", "Promoted from wy_fiscal_coefficients.json"),
    ("terra-app/src/data/county_housing_baseline.json",  "E", "Promoted from data/processed/"),

    # ── Pipeline F: Anchor facilities & exposure tags ────────────────────────
    ("data/processed/mw_anchor_facilities.geojson",      "F", "22_anchor_facilities.ipynb"),
    ("terra-app/src/data/mw_anchor_facilities.geojson",  "F", "Promoted from data/processed/"),
    ("data/processed/asset_exposure_tags.json",          "F", "24_hazard_exposure_baseline.ipynb"),
    ("terra-app/src/data/asset_exposure_tags.json",      "F", "Promoted from data/processed/"),
    ("terra-app/src/data/anchor_sector_taxonomy.json",   "F", "Hand-maintained"),

    # ── Pipeline G: Climate & hazards ────────────────────────────────────────
    ("data/processed/county_climate_projections.json",   "G", "23c_cmip6_acquisition.ipynb"),
    ("data/processed/county_climate_baseline.json",      "G", "24_hazard_exposure_baseline.ipynb"),
    ("data/processed/nri_wrc_county_hazard_summary.csv", "G", "24_hazard_exposure_baseline.ipynb"),
    ("terra-app/src/data/county_population_projections.json","G","scripts/generate_population_projections.py"),

    # ── Pipeline H: Agriculture ──────────────────────────────────────────────
    ("data/processed/wy_county_ag_baseline.json",        "H", "25_wy_ag_baseline_pull.ipynb"),
    ("data/processed/wy_county_ag_engine_baseline.json", "H", "scripts/build_county_ag_engine_baseline.py"),
    ("data/processed/wy_grazing_allotments.csv",         "H", "25_wy_ag_baseline_pull.ipynb"),
    ("data/processed/wy_ag_sources.csv",                 "H", "25_wy_ag_baseline_pull.ipynb"),
    ("terra-app/src/data/county_ag_baseline.json",       "H", "Promoted from wy_county_ag_baseline.json"),

    # ── Pipeline I: Engine, goldens & analytics ──────────────────────────────
    ("data/golden/golden_a.json",                        "I", "16_engine_v2_golden.ipynb"),
    ("data/golden/golden_b.json",                        "I", "16_engine_v2_golden.ipynb"),
    ("data/golden/golden_c.json",                        "I", "16_engine_v2_golden.ipynb"),
    ("data/golden/golden_d.json",                        "I", "19_engine_fiscal_golden.ipynb"),
    ("data/golden/golden_e.json",                        "I", "19_engine_fiscal_golden.ipynb"),
    ("data/golden/golden_f.json",                        "I", "19_engine_fiscal_golden.ipynb"),
    ("data/golden/golden_i.json",                        "I", "scripts/regenerate_all_goldens.py"),
    ("data/golden/golden_k.json",                        "I", "scripts/generate_golden_k.py"),
    ("data/golden/fixture_registry.json",                "I", "scripts/regenerate_all_goldens.py"),
    ("data/processed/mc_validation_priority.csv",        "I", "mc_full_run.py + 15_coefficient_monte_carlo.ipynb"),
    ("data/processed/sweep_cost_ranking_sourced.csv",    "I", "18_magnitude_sweep.ipynb"),
    ("data/processed/sweep_marginal_returns.csv",        "I", "18_magnitude_sweep.ipynb"),
    ("terra-app/src/data/golden_b.json",                 "I", "Promoted from data/golden/"),

    # ── TS-only static data (no Python-side equivalent) ──────────────────────
    ("terra-app/src/data/campaigns.json",                "—", "Hand-maintained"),
    ("terra-app/src/data/era_budgets.json",              "—", "Hand-maintained"),
    ("terra-app/src/data/counties.geojson",              "—", "Derived from Census TIGER"),
    ("terra-app/src/data/mw_ecoregions.geojson",         "—", "08a_ecoregion_crosswalk.ipynb"),
]


def file_sha256(path: Path) -> str | None:
    """Return first 12 hex chars of SHA-256, or None if file doesn't exist."""
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def last_commit(path: Path) -> tuple[str | None, str | None]:
    """Return (short_sha, iso_date) of last commit touching path, or (None, None)."""
    rel = path.relative_to(ROOT)
    result = subprocess.run(
        ["git", "log", "--format=%h %aI", "-1", "--", str(rel)],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode == 0 and result.stdout.strip():
        parts = result.stdout.strip().split(" ", 1)
        return parts[0], parts[1][:10]  # short SHA, date only
    return None, None


def is_tracked(path: Path) -> bool:
    """Check if file is tracked in git."""
    rel = path.relative_to(ROOT)
    result = subprocess.run(
        ["git", "ls-files", str(rel)],
        cwd=ROOT, capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def main() -> int:
    use_json = "--json" in sys.argv

    rows = []
    for rel_path, pipeline, generator in RUNTIME_FILES:
        full_path = ROOT / rel_path
        sha = file_sha256(full_path)
        commit_sha, commit_date = last_commit(full_path)
        tracked = is_tracked(full_path)

        row = {
            "file": rel_path,
            "pipeline": pipeline,
            "generator": generator,
            "exists": full_path.exists(),
            "tracked": tracked,
            "sha256_12": sha,
            "last_commit": commit_sha,
            "last_date": commit_date,
        }
        rows.append(row)

    if use_json:
        json.dump(rows, sys.stdout, indent=2)
        print()
        return 0

    # Markdown table output
    print("| File | Pipeline | Generator | Tracked | Last built | Commit | SHA-256 (12) |")
    print("|------|----------|-----------|---------|------------|--------|--------------|")
    for r in rows:
        name = Path(r["file"]).name
        if r["file"].startswith("terra-app/"):
            name = f"ts:{name}"
        trk = "yes" if r["tracked"] else ("—" if not r["exists"] else "**no**")
        date = r["last_date"] or ("—" if not r["exists"] else "local only")
        commit = r["last_commit"] or "—"
        sha = r["sha256_12"] or "MISSING"
        print(f"| `{name}` | {r['pipeline']} | {r['generator']} | {trk} | {date} | {commit} | `{sha}` |")

    # Summary
    total = len(rows)
    exists_count = sum(1 for r in rows if r["exists"])
    tracked_count = sum(1 for r in rows if r["tracked"])
    missing = [r for r in rows if not r["exists"]]
    untracked = [r for r in rows if r["exists"] and not r["tracked"]]

    print()
    print(f"**{total}** runtime files | **{exists_count}** exist | **{tracked_count}** tracked | **{len(missing)}** missing | **{len(untracked)}** untracked")

    if missing:
        print()
        print("### Missing files")
        for r in missing:
            print(f"- `{r['file']}` (pipeline {r['pipeline']})")

    if untracked:
        print()
        print("### Untracked (exist locally but not in git)")
        for r in untracked:
            print(f"- `{r['file']}` (pipeline {r['pipeline']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
