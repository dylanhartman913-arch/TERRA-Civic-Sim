# TERRA Data Pipelines

**Generated:** 2026-09-15 (S9)
**Verified against:** `main` @ `cc92deb` (post-S8)
**Regenerate hash/date columns:** `python scripts/build_pipeline_table.py`

This document maps every file loaded at runtime to its generator, tracking
status, and current state. For the full session-by-session history of how
each pipeline reached its current state, see `build_log/wave7/HANDOFF.md`.

---

## Pipeline summary

| # | Pipeline | Status | Notes |
|---|----------|--------|-------|
| A | Generator inventory & provenance | **Current** | Pinned at 25,868 records (SHA `573f1a7b`). Unchanged since W5. |
| B | Synthetic network & E4ST | **Frozen** | Network and E4ST oracle scenarios are done. Notebooks restored (S4) but not re-run. Cannot be re-run from `main` without manual downloads. `synthetic_plant_assignments.parquet` untracked (blocked by `*.parquet` gitignore). |
| C | EES capital baseline | **Current** | Rebuilt from pinned inventory in S7a (08b + 14 re-run). Ec_gencap normalization now matches attribution logic. Both JSON copies byte-identical. Downstream goldens and trajectory refreshed in S7b. Flagship capacities regressed by S7a's nb14 re-run, then restored in F14. **nb14 source still has stale hardcoded values** — next re-run will regress again unless the notebook is patched. |
| D | Action library & coefficients | **Current (content); 2 generator gaps** | 55 actions, schema 3.3. `ees_scenario_profiles.json` and `lifecycle_coefficients.json` have no tracked generator (both are optional loads). |
| E | Wyoming fiscal ledger | **Current** | 2026-07-03 vintage. Four MANUAL_FETCH items outstanding (ONRR, DOR commodity split, severance, WY LSO school finance). ~44% of source rows `confidence: low`. |
| F | Anchor facilities & exposure tags | **Current** | Fork fixed in S6 (Python and TS copies now byte-identical, SHA `7fd936f7`). Second fork in `county_cards.json` flagship capacities found and fixed in F14. |
| G | Climate & hazards | **Current** | Best-provenanced pipeline. Tested via exogeneity + purity suites. |
| H | Agriculture | **Current** | Golden N frozen. D5 rancher/Extension domain review never happened (carried into W7-4). |
| I | Engine, goldens & analytics | **Current & verified** | Parity: 226/226 Python, 351/351 TS (verified S7b). MC and sweep recomputed on corrected baseline (S8). Zero rank changes in sensitivity ordering — structural, not accidental. |

---

## Runtime file inventory

62 files total. 59 tracked in git. 3 untracked (exist locally, blocked by gitignore rules).
0 missing.

Regenerate with `python scripts/build_pipeline_table.py`. Use `--json` for machine-readable output.

### Pipeline A — Generator inventory & provenance

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `generators_with_costs.parquet` | yes | 2026-07-20 | `067d893` | `ef08eb495e04` |

Generator: `06_generator_costs.ipynb`. Upstream input: pinned EIA operating generators
(25,868 records, `data/staging/eia_operating_generators_2026-05_raw.json`).

### Pipeline B — Synthetic network & E4ST

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `synthetic_buses.geojson` | yes | 2026-07-14 | `9aac0d6` | `706bc875ae38` |
| `synthetic_branches.geojson` | yes | 2026-07-14 | `9aac0d6` | `a64b8e05568c` |
| `network_metadata.json` | yes | 2026-09-15 | `cc92deb` | `e02009c8b0cf` |
| `synthetic_plant_assignments.parquet` | **no** | local | — | `b92be9b71d6c` |
| `ba_interchange_summary.csv` | yes | 2026-07-14 | `9aac0d6` | `1fbc9d7454ed` |
| `ts:initial_network.json` | yes | 2026-07-03 | `2ebe3ae` | `723ff16164a1` |
| `ts:baseline_retirements.json` | yes | 2026-08-11 | `ab3a22d` | `2818355d35b3` |

Generators: `07_synthetic_topology.ipynb` (network), `03b_ba_interchange.ipynb` (BA flows),
`10_eia860_retirements.ipynb` (retirements). Frozen since spring — the network and four E4ST
oracle scenarios are done. `synthetic_plant_assignments.parquet` is required at runtime
(`terra_engine.py:602`) but blocked from git by the global `*.parquet` rule.

`network_metadata.json` has 14 populated keys and 18 still missing (see S5 in HANDOFF.md).
Three missing keys are **critical consumer reads** (KeyError risk if their consumers run):
- `island_filter_min_nodes` — read by `julia/build_nodal_case.jl:102`
- `validation_deepdive` — read by `julia/build_nodal_case.jl:98`
- `ecoregion_layer` — read by `notebooks/08c_spatial_hierarchy.ipynb`

These require re-running the notebook pipeline (nb06 → nb07 → nb08a) to repopulate.

### Pipeline C — EES capital baseline

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `county_ees_baseline.json` | yes | 2026-09-13 | `eaddf82` | `3b0c326dbf48` |
| `mw_county_ees_summary.csv` | yes | 2026-09-13 | `eaddf82` | `8f6632763605` |
| `mw_ecoregion_ees_summary.csv` | yes | 2026-09-13 | `eaddf82` | `c9371e4f9e12` |
| `county_crosswalk.parquet` | yes | 2026-07-20 | `067d893` | `0bc1a35cc31a` |
| `spatial_hierarchy_counties.parquet` | **no** | local | — | `62fc808453f1` |
| `spatial_hierarchy_huc8.parquet` | **no** | local | — | `03cd346c32ad` |
| `mw_county_cards.json` | yes | 2026-09-15 | `b5fd4fd` | `4285e04a7884` |
| `ts:county_ees_baseline.json` | yes | 2026-09-13 | `eaddf82` | `3b0c326dbf48` |
| `ts:county_cards.json` | yes | 2026-09-15 | `b5fd4fd` | `1dbc28400b6d` |
| `ts:county_crosswalk.json` | yes | 2026-07-03 | `2ebe3ae` | `665397e97d34` |

Generators: `08b_ees_baseline.ipynb` (tract EES scores), `08c_spatial_hierarchy.ipynb`
(crosswalks), `14_county_foundation.ipynb` (county cards and county-level EES).

This was the single biggest status change in W7. The baseline was stale (F2) — built
2026-06-10 on a truncated 15,034-record inventory with an 11.8% Ec_gencap slope mismatch.
S7a rebuilt it from the complete pinned inventory (25,868 generators), bringing the slope
error to 0.000%. S7b refreshed all downstream fixtures; 123 of 157 counties had Ec shifts.
F14 caught and fixed a second-order regression: nb14's hardcoded `FLAGSHIP_ASSETS` list
still carried stale capacities (762/100/200 instead of 816.7/152/1800), which overwrote
the S6 corrections when S7a re-ran nb14. The output files are patched, but **nb14's source
code still has the stale values** — the next nb14 re-run will regress again.

`spatial_hierarchy_counties.parquet` and `spatial_hierarchy_huc8.parquet` exist locally but
are blocked from git by the global `*.parquet` rule.

### Pipeline D — Action library & material coefficients

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `mw_action_library_v3.json` | yes | 2026-07-19 | `8a3090c` | `a96d536a703e` |
| `ees_scenario_profiles.json` | yes | 2026-09-13 | `7e204cf` | `2143bda8e18d` |
| `lifecycle_coefficients.json` | yes | 2026-07-14 | `9aac0d6` | `8624aa7a7f17` |
| `ts:action_library_v3.json` | yes | 2026-07-19 | `8430bcf` | `a96d536a703e` |
| `ts:scenario_profiles.json` | yes | 2026-07-03 | `2ebe3ae` | `dcd7d8164dd7` |
| `ts:lifecycle_coefficients.json` | yes | 2026-07-05 | `a7e6f52` | `8624aa7a7f17` |
| `ts:material_coefficient_sources.json` | yes | 2026-07-03 | `2ebe3ae` | `6655048c5a2f` |

Generator: `15_action_library_v3.ipynb` (action library + material coefficients).

**Open gaps:** `ees_scenario_profiles.json` (renamed from `mw_scenario_profiles.json` in S6)
and `lifecycle_coefficients.json` have **no tracked generator** — both load optionally
(`terra_engine.py:2292` and `:2419`). These were the 2 FAILs in S4's `check_generators.py`
audit and remain unresolved.

Note: `ts:scenario_profiles.json` in `terra-app/src/data/` is a distinct file from
`ees_scenario_profiles.json` in `data/processed/` — different content, different SHA.

### Pipeline E — Wyoming fiscal ledger

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `wy_county_fiscal_baseline.json` | yes | 2026-07-14 | `9aac0d6` | `215c480d8b84` |
| `wy_fiscal_coefficients.json` | yes | 2026-07-19 | `8a3090c` | `199a3724a11c` |
| `county_housing_baseline.json` | yes | 2026-07-14 | `9aac0d6` | `66b49df65c0d` |
| `ts:fiscal_baseline.json` | yes | 2026-07-03 | `2ebe3ae` | `c1bca4a6838a` |
| `ts:fiscal_coefficients.json` | yes | 2026-07-03 | `2ebe3ae` | `182f528d91d9` |
| `ts:county_housing_baseline.json` | yes | 2026-07-05 | `a7e6f52` | `66b49df65c0d` |

Generators: `17_wy_fiscal_pull.ipynb`, `18_fiscal_coefficients.ipynb` +
`18b_school_finance_patch.ipynb`, `scripts/pull_housing_baseline.py`.

Current (2026-07-03 vintage). Four MANUAL_FETCH items still outstanding. ~44% of source
rows carry `confidence: low`.

### Pipeline F — Anchor facilities & exposure tags

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `mw_anchor_facilities.geojson` | yes | 2026-09-13 | `7e204cf` | `7fd936f7209b` |
| `ts:mw_anchor_facilities.geojson` | yes | 2026-09-13 | `7e204cf` | `7fd936f7209b` |
| `asset_exposure_tags.json` | yes | 2026-07-14 | `392a244` | `ab45a69d3249` |
| `ts:asset_exposure_tags.json` | yes | 2026-07-14 | `9840d3a` | `ab45a69d3249` |
| `ts:anchor_sector_taxonomy.json` | yes | 2026-07-14 | `ab7da47` | `23e303716906` |

Generators: `22_anchor_facilities.ipynb`, `24_hazard_exposure_baseline.ipynb`.
`anchor_sector_taxonomy.json` is hand-maintained.

The anchor facilities fork (F1) — where Python carried 762/100/200 and TS carried
816.7/152/1800 — was fixed in S6. Both copies now share SHA `7fd936f7`. A second
instance of the same fork was found in `county_cards.json` flagship capacities (F14)
and fixed: nb14's hardcoded `FLAGSHIP_ASSETS` list had never been updated, so S7a's
nb14 re-run overwrote the S6 corrections. The output files are patched, but nb14's
source code still carries the stale values.

### Pipeline G — Climate & hazards

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `county_climate_projections.json` | yes | 2026-07-14 | `9aac0d6` | `4bbaa532496d` |
| `county_climate_baseline.json` | yes | 2026-07-16 | `475817c` | `ddcc1e720ace` |
| `nri_wrc_county_hazard_summary.csv` | yes | 2026-07-14 | `392a244` | `9cfc69713aeb` |
| `ts:county_population_projections.json` | yes | 2026-07-05 | `a7e6f52` | `4fcb8a7ea72c` |

Generators: `23c_cmip6_acquisition.ipynb`, `24_hazard_exposure_baseline.ipynb`,
`scripts/generate_population_projections.py`.

Best-provenanced pipeline. Tested via exogeneity and purity suites.

### Pipeline H — Agriculture

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `wy_county_ag_baseline.json` | yes | 2026-07-19 | `9c388dd` | `8645fc42ff21` |
| `wy_county_ag_engine_baseline.json` | yes | 2026-07-19 | `8430bcf` | `f3a32fad6d1d` |
| `wy_grazing_allotments.csv` | yes | 2026-07-19 | `9ffc53a` | `e26dc681c136` |
| `wy_ag_sources.csv` | yes | 2026-07-19 | `9c388dd` | `128ef9321997` |
| `ts:county_ag_baseline.json` | yes | 2026-07-19 | `8430bcf` | `f3a32fad6d1d` |

Generators: `25_wy_ag_baseline_pull.ipynb`, `26_ag_action_family.ipynb`,
`scripts/build_county_ag_engine_baseline.py`.

Current. Golden N frozen. D5 rancher/Extension domain review carried into W7-4.

### Pipeline I — Engine, goldens & analytics

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `golden_a.json` | yes | 2026-09-13 | `d4a2b3c` | `9d655bdaf1e7` |
| `golden_b.json` | yes | 2026-09-13 | `d4a2b3c` | `428b9c0b2354` |
| `golden_c.json` | yes | 2026-09-13 | `d4a2b3c` | `0768be3e1b97` |
| `golden_d.json` | yes | 2026-09-15 | `b5fd4fd` | `98a7488d6aa9` |
| `golden_e.json` | yes | 2026-09-15 | `b5fd4fd` | `0c7b37abb6cb` |
| `golden_f.json` | yes | 2026-09-15 | `b5fd4fd` | `62c4dc2ef14b` |
| `golden_i.json` | yes | 2026-09-15 | `b5fd4fd` | `6bdebb976f02` |
| `golden_k.json` | yes | 2026-09-15 | `b5fd4fd` | `4b8d4cc305f3` |
| `fixture_registry.json` | yes | 2026-09-15 | `b5fd4fd` | `43c62f4a1339` |
| `mc_validation_priority.csv` | yes | 2026-09-15 | `cc92deb` | `62290f6231dd` |
| `sweep_cost_ranking_sourced.csv` | yes | 2026-09-15 | `cc92deb` | `2a84776a452f` |
| `sweep_marginal_returns.csv` | yes | 2026-09-15 | `cc92deb` | `0dea54ef814e` |
| `ts:golden_b.json` | yes | 2026-09-13 | `d4a2b3c` | `428b9c0b2354` |

Generators: `16_engine_v2_golden.ipynb` (A/B/C), `19_engine_fiscal_golden.ipynb` (D/E/F),
`scripts/regenerate_all_goldens.py` (batch), `scripts/generate_golden_k.py`,
`mc_full_run.py` + `15_coefficient_monte_carlo.ipynb` (MC), `18_magnitude_sweep.ipynb` (sweep).

Parity was claimed-but-unverified as of the Sept 11 audit. Now **actually verified**:
226/226 Python, 351/351 TS (S7b). MC and sweep recomputed on the corrected EES baseline
(S8) — zero rank changes in sensitivity ordering (prairie_restoration ρ=0.717 still
dominates; structural ordering is coefficient-driven, not baseline-level-driven).

Golden D has a pre-existing cross-runtime fiscal digest divergence (Python `cbc0734b` vs
TS `225c5bdd`) due to floating-point accumulation in 20-year depreciation — documented,
not a bug. Golden G and G′ now produce identical digests (both run the current engine
with autonomous decline active).

### TS-only static data

| File | Tracked | Last built | Commit | SHA-256 (12) |
|------|---------|------------|--------|--------------|
| `ts:campaigns.json` | yes | 2026-07-03 | `2ebe3ae` | `251d8e6c7d07` |
| `ts:era_budgets.json` | yes | 2026-07-03 | `2ebe3ae` | `cdfe34a80d62` |
| `ts:counties.geojson` | yes | 2026-07-03 | `2ebe3ae` | `1a402baf7694` |
| `ts:mw_ecoregions.geojson` | yes | 2026-07-03 | `2ebe3ae` | `eb8466347d99` |

Hand-maintained or derived from external sources. Not part of the notebook pipeline.

---

## Open gaps (standing backlog for W7-2 / S11)

### Files with no tracked generator
1. **`ees_scenario_profiles.json`** — optional load (`terra_engine.py:2292`). Renamed
   from `mw_scenario_profiles.json` in S6 but the rename didn't create a generator.
2. **`lifecycle_coefficients.json`** — optional load (`terra_engine.py:2417`). No
   notebook or script produces it.

### Untracked runtime files (exist locally, blocked by gitignore)
3. **`synthetic_plant_assignments.parquet`** — required by `_build_fuel_mix_map()`
   (`terra_engine.py:602`). Blocked by global `*.parquet` rule.
4. **`spatial_hierarchy_counties.parquet`** — optional (`terra_engine.py:2483`).
   Blocked by `*.parquet` rule.
5. **`spatial_hierarchy_huc8.parquet`** — optional (`terra_engine.py:2484`).
   Blocked by `*.parquet` rule.

### network_metadata.json missing keys
6. **3 critical-read keys** with no value (KeyError risk if consumers run):
   `island_filter_min_nodes`, `validation_deepdive`, `ecoregion_layer`.
7. **15 write-only keys** still missing (no downstream consumer reads them directly):
   `giant_component_size`, `n_components`, `pct_mw_retained_at_filter`,
   `total_snapped_mw`, `spatial_hierarchy`, `retirement_data`, `action_library`,
   `model_architecture`, `n_zones`, `zonal_total_cap_gw`, `zonal_load_proxy_gw`,
   `e4st_v2`, `e4st_case`, `scenario_runs`, `scenarios_completed`.

### Source code carrying stale values
8. **nb14 `FLAGSHIP_ASSETS`** — hardcoded capacities (762/100/200) will regress
   output on next re-run. Output is patched but source is not.
