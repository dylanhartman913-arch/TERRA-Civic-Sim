#!/usr/bin/env python3
"""Seed data/manifest/manifest.json from the S9 pipeline table.

Computes SHA-256 hashes, record counts, and identifies dual-path pairs.
Run once to create the initial manifest; after that, manifest entries should
be updated by the script that produces the file.
"""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Dual-path pairs ─────────────────────────────────────────────────────────
# (python_path, ts_path, relationship)
# "promotion" = byte-identical copy; "transform" = structural/format change
DUAL_PATH_PAIRS = [
    ("data/processed/county_ees_baseline.json",          "terra-app/src/data/county_ees_baseline.json",       "promotion"),
    ("data/processed/mw_anchor_facilities.geojson",      "terra-app/src/data/mw_anchor_facilities.geojson",   "promotion"),
    ("data/processed/asset_exposure_tags.json",           "terra-app/src/data/asset_exposure_tags.json",       "promotion"),
    ("data/processed/county_housing_baseline.json",      "terra-app/src/data/county_housing_baseline.json",   "promotion"),
    ("data/golden/golden_b.json",                        "terra-app/src/data/golden_b.json",                  "promotion"),
    ("data/processed/lifecycle_coefficients.json",       "terra-app/src/data/lifecycle_coefficients.json",     "promotion"),
    ("data/processed/mw_action_library_v3.json",         "terra-app/src/data/action_library_v3.json",         "promotion"),
    ("data/processed/mw_ecoregions.geojson",             "terra-app/src/data/mw_ecoregions.geojson",          "promotion"),
    ("data/processed/wy_county_fiscal_baseline.json",    "terra-app/src/data/fiscal_baseline.json",           "transform"),
    ("data/processed/wy_fiscal_coefficients.json",       "terra-app/src/data/fiscal_coefficients.json",       "transform"),
    ("data/processed/wy_county_ag_baseline.json",        "terra-app/src/data/county_ag_baseline.json",        "transform"),
    ("data/processed/mw_county_cards.json",              "terra-app/src/data/county_cards.json",              "transform"),
    ("data/processed/county_crosswalk.parquet",          "terra-app/src/data/county_crosswalk.json",          "transform"),
]

# Build lookup: path -> (counterpart, relationship)
_dual_map: dict[str, tuple[str, str]] = {}
for py_p, ts_p, rel in DUAL_PATH_PAIRS:
    _dual_map[py_p] = (ts_p, rel)
    _dual_map[ts_p] = (py_p, rel)


# ── Runtime files (from S9 build_pipeline_table.py) ─────────────────────────
# (path, pipeline, generator, file_class)
# file_class: "live" = loaded at runtime, "frozen" = test fixture, "static" = TS-only hand-maintained
RUNTIME_FILES = [
    # Pipeline A
    ("data/processed/generators_with_costs.parquet",       "A", "06_generator_costs.ipynb",                            "live"),
    # Pipeline B
    ("data/processed/synthetic_buses.geojson",             "B", "07_synthetic_topology.ipynb",                          "live"),
    ("data/processed/synthetic_branches.geojson",          "B", "07_synthetic_topology.ipynb",                          "live"),
    ("data/processed/network_metadata.json",               "B", "07_synthetic_topology.ipynb + many writers",           "live"),
    ("data/processed/synthetic_plant_assignments.parquet",  "B", "07_synthetic_topology.ipynb",                          "live"),
    ("data/processed/ba_interchange_summary.csv",          "B", "03b_ba_interchange.ipynb",                             "live"),
    ("terra-app/src/data/initial_network.json",            "B", "07_synthetic_topology.ipynb",                          "live"),
    ("terra-app/src/data/baseline_retirements.json",       "B", "10_eia860_retirements.ipynb",                          "live"),
    # Pipeline C
    ("data/processed/county_ees_baseline.json",            "C", "08b_ees_baseline.ipynb + 14_county_foundation.ipynb",  "live"),
    ("data/processed/mw_county_ees_summary.csv",           "C", "08b_ees_baseline.ipynb + 14_county_foundation.ipynb",  "live"),
    ("data/processed/mw_ecoregion_ees_summary.csv",        "C", "08b_ees_baseline.ipynb",                               "live"),
    ("data/processed/county_crosswalk.parquet",            "C", "08c_spatial_hierarchy.ipynb",                          "live"),
    ("data/processed/spatial_hierarchy_counties.parquet",   "C", "08c_spatial_hierarchy.ipynb",                          "live"),
    ("data/processed/spatial_hierarchy_huc8.parquet",       "C", "08c_spatial_hierarchy.ipynb",                          "live"),
    ("data/processed/mw_county_cards.json",                "C", "14_county_foundation.ipynb",                           "live"),
    ("data/processed/mw_ecoregions.geojson",               "C", "08a_ecoregion_crosswalk.ipynb",                        "live"),
    ("terra-app/src/data/county_ees_baseline.json",        "C", "Promoted from data/processed/",                        "live"),
    ("terra-app/src/data/county_cards.json",               "C", "Synced from mw_county_cards.json",                     "live"),
    ("terra-app/src/data/county_crosswalk.json",           "C", "Derived from county_crosswalk.parquet",                "live"),
    # Pipeline D
    ("data/processed/mw_action_library_v3.json",           "D", "15_action_library_v3.ipynb",                           "live"),
    ("data/processed/ees_scenario_profiles.json",          "D", "NO TRACKED GENERATOR",                                "live"),
    ("data/processed/lifecycle_coefficients.json",         "D", "NO TRACKED GENERATOR",                                "live"),
    ("terra-app/src/data/action_library_v3.json",          "D", "Promoted from mw_action_library_v3.json",              "live"),
    ("terra-app/src/data/scenario_profiles.json",          "D", "TS-side copy (distinct from ees_scenario_profiles)",   "live"),
    ("terra-app/src/data/lifecycle_coefficients.json",      "D", "Promoted from data/processed/",                        "live"),
    ("terra-app/src/data/material_coefficient_sources.json","D", "15_action_library_v3.ipynb",                           "live"),
    # Pipeline E
    ("data/processed/wy_county_fiscal_baseline.json",      "E", "17_wy_fiscal_pull.ipynb",                              "live"),
    ("data/processed/wy_fiscal_coefficients.json",         "E", "18_fiscal_coefficients.ipynb + 18b_school_finance_patch.ipynb","live"),
    ("data/processed/county_housing_baseline.json",        "E", "scripts/pull_housing_baseline.py",                     "live"),
    ("terra-app/src/data/fiscal_baseline.json",            "E", "Promoted from wy_county_fiscal_baseline.json",         "live"),
    ("terra-app/src/data/fiscal_coefficients.json",        "E", "Promoted from wy_fiscal_coefficients.json",            "live"),
    ("terra-app/src/data/county_housing_baseline.json",    "E", "Promoted from data/processed/",                        "live"),
    # Pipeline F
    ("data/processed/mw_anchor_facilities.geojson",        "F", "22_anchor_facilities.ipynb",                           "live"),
    ("terra-app/src/data/mw_anchor_facilities.geojson",    "F", "Promoted from data/processed/",                        "live"),
    ("data/processed/asset_exposure_tags.json",            "F", "24_hazard_exposure_baseline.ipynb",                    "live"),
    ("terra-app/src/data/asset_exposure_tags.json",        "F", "Promoted from data/processed/",                        "live"),
    ("terra-app/src/data/anchor_sector_taxonomy.json",     "F", "Hand-maintained",                                      "static"),
    # Pipeline G
    ("data/processed/county_climate_projections.json",     "G", "23c_cmip6_acquisition.ipynb",                          "live"),
    ("data/processed/county_climate_baseline.json",        "G", "24_hazard_exposure_baseline.ipynb",                    "live"),
    ("data/processed/nri_wrc_county_hazard_summary.csv",   "G", "24_hazard_exposure_baseline.ipynb",                    "live"),
    ("terra-app/src/data/county_population_projections.json","G","scripts/generate_population_projections.py",           "live"),
    # Pipeline H
    ("data/processed/wy_county_ag_baseline.json",          "H", "25_wy_ag_baseline_pull.ipynb",                         "live"),
    ("data/processed/wy_county_ag_engine_baseline.json",   "H", "scripts/build_county_ag_engine_baseline.py",           "live"),
    ("data/processed/wy_grazing_allotments.csv",           "H", "25_wy_ag_baseline_pull.ipynb",                         "live"),
    ("data/processed/wy_ag_sources.csv",                   "H", "25_wy_ag_baseline_pull.ipynb",                         "live"),
    ("terra-app/src/data/county_ag_baseline.json",         "H", "Promoted from wy_county_ag_baseline.json",             "live"),
    # Pipeline I
    ("data/golden/golden_a.json",                          "I", "16_engine_v2_golden.ipynb",                            "frozen"),
    ("data/golden/golden_b.json",                          "I", "16_engine_v2_golden.ipynb",                            "frozen"),
    ("data/golden/golden_c.json",                          "I", "16_engine_v2_golden.ipynb",                            "frozen"),
    ("data/golden/golden_d.json",                          "I", "19_engine_fiscal_golden.ipynb",                        "frozen"),
    ("data/golden/golden_e.json",                          "I", "19_engine_fiscal_golden.ipynb",                        "frozen"),
    ("data/golden/golden_f.json",                          "I", "19_engine_fiscal_golden.ipynb",                        "frozen"),
    ("data/golden/golden_i.json",                          "I", "scripts/regenerate_all_goldens.py",                    "frozen"),
    ("data/golden/golden_k.json",                          "I", "scripts/generate_golden_k.py",                         "frozen"),
    ("data/golden/fixture_registry.json",                  "I", "scripts/regenerate_all_goldens.py",                    "frozen"),
    ("data/processed/mc_validation_priority.csv",          "I", "mc_full_run.py + 15_coefficient_monte_carlo.ipynb",    "live"),
    ("data/processed/sweep_cost_ranking_sourced.csv",      "I", "18_magnitude_sweep.ipynb",                             "live"),
    ("data/processed/sweep_marginal_returns.csv",          "I", "18_magnitude_sweep.ipynb",                             "live"),
    ("terra-app/src/data/golden_b.json",                   "I", "Promoted from data/golden/",                           "frozen"),
    # TS-only static data
    ("terra-app/src/data/campaigns.json",                  "-", "Hand-maintained",                                      "static"),
    ("terra-app/src/data/era_budgets.json",                "-", "Hand-maintained",                                      "static"),
    ("terra-app/src/data/counties.geojson",                "-", "Derived from Census TIGER",                            "static"),
    ("terra-app/src/data/mw_ecoregions.geojson",           "-", "08a_ecoregion_crosswalk.ipynb",                        "live"),
]


def file_sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def record_count(path: Path) -> int | None:
    if not path.exists():
        return None
    name = path.name
    try:
        if name.endswith(".json") or name.endswith(".geojson"):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                if "features" in data and isinstance(data["features"], list):
                    return len(data["features"])
                return len(data)
            if isinstance(data, list):
                return len(data)
        elif name.endswith(".csv"):
            with open(path, newline="", encoding="utf-8") as f:
                return sum(1 for _ in csv.reader(f)) - 1  # subtract header
        elif name.endswith(".parquet"):
            try:
                import pyarrow.parquet as pq
                return pq.read_metadata(path).num_rows
            except ImportError:
                return None
    except Exception:
        return None
    return None


def last_commit_info(rel_path: str) -> tuple[str | None, str | None]:
    result = subprocess.run(
        ["git", "log", "--format=%H %aI", "-1", "--", rel_path],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode == 0 and result.stdout.strip():
        parts = result.stdout.strip().split(" ", 1)
        return parts[0], parts[1][:10]
    return None, None


def is_tracked(rel_path: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", rel_path],
        cwd=ROOT, capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def main():
    entries = []
    for rel_path, pipeline, generator, file_class in RUNTIME_FILES:
        full = ROOT / rel_path
        sha = file_sha256(full)
        count = record_count(full)
        commit, date = last_commit_info(rel_path)
        tracked = is_tracked(rel_path)

        entry = {
            "path": rel_path,
            "pipeline": pipeline,
            "generator": generator,
            "generator_commit": commit,
            "sha256": sha,
            "record_count": count,
            "last_built": date,
            "class": file_class,
            "tracked": tracked,
        }

        if rel_path in _dual_map:
            counterpart, relationship = _dual_map[rel_path]
            entry["dual_path"] = counterpart
            entry["dual_path_relationship"] = relationship

        entries.append(entry)

    manifest = {
        "schema_version": "1.0",
        "generated_by": "scripts/seed_manifest.py",
        "file_count": len(entries),
        "files": entries,
    }

    out_path = ROOT / "data" / "manifest" / "manifest.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote {len(entries)} entries to {out_path.relative_to(ROOT)}")

    # Summary
    by_class = {}
    for e in entries:
        by_class.setdefault(e["class"], []).append(e)
    for cls, items in sorted(by_class.items()):
        print(f"  {cls}: {len(items)}")

    dual_promo = [e for e in entries if e.get("dual_path_relationship") == "promotion"]
    dual_xform = [e for e in entries if e.get("dual_path_relationship") == "transform"]
    print(f"  dual-path promotions (byte-identity required): {len(dual_promo)}")
    print(f"  dual-path transforms (structural, no byte-identity): {len(dual_xform)}")


if __name__ == "__main__":
    main()
