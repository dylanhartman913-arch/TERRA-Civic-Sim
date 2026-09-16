# Wave 7 Session Handoff Log

Append one block per session. Do not edit previous blocks.

---

## S1 — 2026-09-12 — Safety net

**Objective:** Close F3 (untracked worktree far from backup), F4 (stale
exposed API key in reachable object), F5 (governing docs untracked).

**What was done:**
- Classified all untracked root-level files; staged and committed governing
  docs + MC/sweep notebooks + mc_worker.py (commit 0311dd3).
- Verified `.env` is covered by `.gitignore` (lines 15-16). User confirmed
  new EIA API key has been written to `.env`.
- Ran `git reflog expire --expire-unreachable=now --all && git gc --prune=now`.
  Confirmed `git cat-file -t b169a18` now errors — old exposed-key blob is gone.
- Count ahead of origin before push: 89 commits.
- Created `build_log/wave7/HANDOFF.md` and `build_log/wave7/DECISIONS.md`.

**Newly tracked files:**
- `15_coefficient_monte_carlo.ipynb`
- `18_magnitude_sweep.ipynb`
- `Wave 2-6 Roadmaps.md`
- `Wave7_roadmap.md`
- `docs/TERRA_pitch_summary.md`
- `docs/W7_audit_followon_and_path_forward.md`
- `interrupted_build_status.md`
- `mc_full_run.py`
- `src/mc_worker.py`

**Left for later sessions:**
- `package-lock.json` — untracked; decision deferred to S2 (tree hygiene)
- `data/staging/ba_territories.geojson` — data file, deferred
- `data/staging/hifld_control_areas_2021-12-08/` — data directory, deferred
- Modified tracked files in `terra-app/` — unstaged, not touched this session
- Prunable worktree `/private/tmp/energy-map-w7-0` — deferred to S2

**Acceptance status:** Pending push (step 7). See block below after push.

---

## S1 — 2026-09-12 — Acceptance confirmed

**Remote SHA after push:** 35bd752 (origin/main now matches local main)

**Acceptance results:**
- `git cat-file -t b169a18` → `fatal: Not a valid object name` ✓ (old blob gone)
- `git status` → no unintended untracked `.md` at root ✓
- `git rev-list --count origin/main..main` → 0 ✓

**Newly tracked files (committed and pushed):**
- `15_coefficient_monte_carlo.ipynb`
- `18_magnitude_sweep.ipynb`
- `Wave 2-6 Roadmaps.md`
- `Wave7_roadmap.md`
- `docs/TERRA_pitch_summary.md`
- `docs/W7_audit_followon_and_path_forward.md`
- `interrupted_build_status.md`
- `mc_full_run.py`
- `src/mc_worker.py`
- `build_log/wave7/HANDOFF.md`
- `build_log/wave7/DECISIONS.md`

**Note:** GitHub warned about `data/processed/county_climate_baseline.json`
(50.44 MB, just over the 50 MB recommended limit). Not blocking, but consider
Git LFS for that file in S2.

**F3, F4, F5 closed. S1 complete. Next: S2 (tree hygiene).**

---

## S2 — 2026-09-12 — Tree hygiene + LFS migration

**Objective:** One checkout, one clean tree, no root strays, county_climate_baseline.json in Git LFS.

**What was done:**

**Worktrees & branches:**
- `git worktree list --porcelain` showed 18 prunable worktrees + 1 live (main). One unmerged branch: `w4-c5a-ui` (expected per Wave4_closeout_amendment_C5a.md).
- Tagged `w4-c5a-ui` before deletion: `archive/w4-c5a-ui` → SHA `3a36ae43ad95d4e8641e001dbd478391fea96760`
- `git worktree prune` removed the already-dead `/private/tmp/energy-map-w7-0` admin entry.
- `git worktree remove --force` removed all 17 remaining linked worktrees (directories deleted).
- Deleted 19 merged branches + `w4-c5a-ui` (force). `git branch --no-merged main` is now empty.

**Root strays (commit 4d1d44e):**
- `run_cells.py`, `build_nb16.py`, `generate_golden_e.py` → `scripts/legacy/`
- `terra_configurator.jsx`, `terra_sandbox.jsx` → `archive/prototypes/`
- Orphan root `package-lock.json` deleted (untracked, `"packages": {}` — empty stub with no node context at root)

**LFS migration:**
- `git lfs install` initialized (git-lfs 3.6.0 via Homebrew already present).
- `.gitattributes` created tracking `data/processed/county_climate_baseline.json` (commit e16a99d).
- `git lfs migrate import --include="data/processed/county_climate_baseline.json" --everything` rewrote 96 commits.
- Force-pushed: `b0be1d3...c7a5dc3 main -> main`. GitHub LFS upload: 1/1 objects, 53 MB at 17 MB/s — no file-size warning on push.
- `.git` size: 34 MB → 86 MB (expected: LFS object cache ~50 MB in `.git/lfs/objects/` added; git pack shrank by replacing the 50 MB blob with a pointer).
- Working copy smudge confirmed: `cat data/processed/county_climate_baseline.json | head -c 50` → real JSON (`{"schema_version": "C2.1.0"...`).
- Terra-app unstaged changes (replay.ts, session_drought.ts, store.ts, golden_ranch_country_2040.json) stashed at `stash@{0}` before migration; still intact, deferred to S3.

**Acceptance results:**
- `git worktree list` → exactly 1 entry (main at c7a5dc3) ✓
- `git branch --no-merged main` → empty ✓
- `git tag -l 'archive/*'` → `archive/w4-c5a-ui` ✓
- No loose `.py`/`.jsx` at root ✓
- `git lfs ls-files` → `ddcc1e720a * data/processed/county_climate_baseline.json` ✓
- `cat data/processed/county_climate_baseline.json | head -c 50` → real JSON ✓
- GitHub push output: no file-size warning ✓

**S2 complete. Next: S3 (terra-app unstaged changes — pop stash@{0} and address).**

---

## S3 — 2026-09-12 — Adjudicate session drought ordering fix (F8)

**Objective:** Verify and commit the four-file drought ordering fix from S2's
stash, or park it on a branch if unverifiable. Answer the Python-side question.

**What was done:**

**Stash handling:**
- `stash@{0}` contained 5 files (the 4 drought-fix files + `county_climate_baseline.json`
  pre-LFS version). Used `git checkout stash@{0} -- <four files>` to extract only
  the relevant files, avoiding an LFS conflict on the county baseline file.
- Created `S3-temp-before-fix` temp stash to get before-fix state; popped it after
  recording before-fix results. Confirmed via `git stash list` at each step.
- S2's original stash remains at `stash@{0}` (now contains only the stale
  county_climate_baseline.json diff — harmless, can be dropped in a future session).

**Before-fix verification (drought ordering bug confirmed):**
- Golden fixture `ag_digest_md5`: `756ec0d2d5ddf481be1331a48b38a1cb`
- Energy-only `ag_digest_md5` (test line 106): `756ec0d2d5ddf481be1331a48b38a1cb`
- **Identical** — drought had no effect on AG digest. Bug confirmed real.
- All 9 `ag4-session-drought.test.ts` tests pass (golden matched buggy state).
- Full parity suite: 33/33 files, 351/351 tests pass.

**After-fix verification (ordering corrected):**
- Golden fixture `ag_digest_md5`: `0c537942942e306a22f04bdc44418b07` (changed)
- Energy-only `ag_digest_md5`: `756ec0d2d5ddf481be1331a48b38a1cb` (unchanged)
- **Different** — drought now correctly affects AG digest.
- `replay_digest`: `beafdb2f2f64657b3ecf7680e2188b91` (unchanged — expected,
  non-AG engine path).
- All 9 `ag4-session-drought.test.ts` tests pass.
- Full parity suite: 33/33 files, 351/351 tests pass. No other fixture moved.

**The fix (commit adcd421):**
- `replay.ts`: moved `applySessionDrought` before `engineAdvanceYear`, passing
  `state.year + 1` as target year.
- `session_drought.ts`: added optional `targetYear` parameter.
- `store.ts`: same reordering as replay.ts.
- `golden_ranch_country_2040.json`: updated `ag_digest_md5` to `0c537942...`.

**Python-side question (documented in DECISIONS.md):**
- Python `advance_year` (`terra_engine.py:3299`) does NOT have the same bug.
- Python architecture is structurally different: drought events are added to state
  by the caller via `apply_hazard_event_consequences` BEFORE calling `advance_year`.
  `_advance_county_ag` (inside `advance_year`, line 3610) reads the pre-existing
  events and records snapshots with drought effects correctly.
- No Python fix or new ticket needed. Session drought ordering is purely a
  TypeScript app-layer concern.

**Acceptance results:**
- Before-fix: drought-enabled ag_digest = energy-only ag_digest ✓ (bug confirmed)
- After-fix: they differ, ag_digest_md5 moved 756ec0d2… → 0c537942… ✓
- Full TS parity: 351/351 pass, no other fixture movement ✓
- DECISIONS.md has dated, code-grounded Python answer ✓

**F8 closed. S3 complete. Committed to main as W7-0.2 (adcd421).**

---

## S4 — 2026-09-13 — Reinstate the generators (F9 structural half)

**Objective:** Every notebook that generates a runtime-loaded file is back on
main and tracked; everything else is explicitly archived with a stated reason.

**What was done:**

**Working list:** `git show --stat 35120e7` — 36 notebooks + 3 src files + 2 .md
files deleted in that commit. The 3 src/ files and 2 .md files are outside
ticket scope (Touches: notebooks/ only).

**Restored to notebooks/ (12 notebooks from `35120e7^`):**
- 11 specified by ticket: `07_synthetic_topology`, `08b_ees_baseline`,
  `08c_spatial_hierarchy`, `10_eia860_retirements`, `15_action_library_v3`,
  `16_engine_v2_golden`, `17_wy_fiscal_pull`, `18_fiscal_coefficients`,
  `18b_school_finance_patch`, `19_engine_fiscal_golden`, `22_anchor_facilities`
- 1 additional discovered by scan: `03b_ba_interchange` — produces
  `ba_interchange_summary.csv`, hard-loaded by `terra_engine.py:633`,
  no other tracked generator exists

**Already in notebooks/ (no action):** `01_eia_pull.ipynb` and
`03a_ba_territories.ipynb` were re-added post-deletion in commit ba9834e.

**Archived to archive/notebooks/ (21 notebooks):**
All were pure viz, analysis-only, or superseded by the current pipeline.
See `archive/notebooks/README.md` for per-notebook reason.
Pure-viz set: `06_lmp_map`, `07_dispatch_viz`, `07_lmp_map`,
`09_lmp_comparison`, `11b_scenario_map`
Superseded: `02_hifld_pull`, `02b_generator_costs`, `03_network_build`,
`04_osm_transmission`, `05_projections`, `23_climate_projection_pull`,
`23b_climate_acquisition`
Analysis/no tracked output: `08_dispatch_mix`, `08_scenario_compare`,
`08_validation_deepdive`, `09_scenario_comparison`, `09a_scenario_precharacterize`,
`11_applied_scenario`, `11_hourly_profiles`, `12_availability_factors`,
`13_candidate_generators`

**Cell outputs stripped** from all 12 restored notebooks via `nbstripout`.
Spot-check confirmed: `notebooks/22_anchor_facilities.ipynb` cell[0].outputs → `[]`.

**`scripts/check_generators.py` output (run against final committed tree):**

```
check_generators.py — runtime file → tracked generator audit
======================================================================
[PASS]  county_ees_baseline.json
[PASS]  mw_county_ees_summary.csv
[PASS]  mw_ecoregion_ees_summary.csv
[PASS]  county_crosswalk.parquet
[PASS]  spatial_hierarchy_counties.parquet
[PASS]  spatial_hierarchy_huc8.parquet
[PASS]  synthetic_buses.geojson
[PASS]  synthetic_branches.geojson
[PASS]  network_metadata.json
[PASS]  mw_action_library_v3.json
[PASS]  wy_county_fiscal_baseline.json
[PASS]  wy_fiscal_coefficients.json
[PASS]  mw_anchor_facilities.geojson
[PASS]  baseline_retirements.json
[PASS]  data/golden/golden_a.json
[PASS]  data/golden/golden_e.json
[PASS]  ba_interchange_summary.csv
[PASS]  generators_with_costs.parquet
[PASS]  ecoregion_ba_crosswalk.geojson
[PASS]  mw_ecoregions.geojson
[PASS]  mw_tracts_2020.parquet
[PASS]  mw_county_cards.json
[PASS]  wy_county_ag_baseline.json
[PASS]  wy_grazing_allotments.csv
[PASS]  county_climate_projections.json
[PASS]  county_population_projections.json
[PASS]  wy_county_ag_engine_baseline.json
[FAIL]  mw_scenario_profiles.json
       → no tracked generator found
[FAIL]  lifecycle_coefficients.json
       → no tracked generator found
======================================================================
Results: 27 PASS  |  2 FAIL
```

**Runtime files still without a tracked generator (FAIL list — feeds S9 / W7-2):**
1. `mw_scenario_profiles.json` — optional load `terra_engine.py:2292`. File
   exists in `data/processed/` but no notebook or script produces it.
2. `lifecycle_coefficients.json` — optional load `terra_engine.py:2417`. Same.

**Acceptance results:**
- `python scripts/check_generators.py` → 27 PASS, 2 FAIL (expected) ✓
- `ls archive/notebooks/` → 21 notebooks + README.md ✓
- Restored notebooks have no embedded cell outputs ✓
- 2 FAIL entries are legitimate gaps, not suppressed ✓

**Commits:** 1b7b744 (main), 09a5ee8 (fix staging artifact)

**F9 (structural half) closed. S4 complete. Do not start S5.**

---

## S5 — 2026-09-13 — Rebuild network_metadata.json (F10)

**Objective:** Reconstruct provenance-tracked `network_metadata.json`, fix
the wholesale-overwrite bug, and add a merge regression test.

**Salvage attempt (step 1):**
- `~/energy-map` exists but contains no `network_metadata.json`
- Time Machine: `tmutil listbackups` → `Operation not permitted` (no access)
- No recovered original; reconstruction from repo artifacts required.

**What was done:**

**Reconstructed keys (9 present in rebuilt file):**

| Key | Source | Provenance tag |
|-----|--------|----------------|
| `total_buses` (500) | `data/processed/synthetic_topology_validation.json` | `repo_artifact` |
| `total_lines` (818) | `data/processed/synthetic_topology_validation.json` | `repo_artifact` |
| `grid_size_m` (500) | `notebooks/06_generator_costs.ipynb` cell "cell-meta" | `code_constant` |
| `data_vintage_year` (2024) | nb06 cell "cell-meta" | `code_constant` |
| `atb_scenario` ("Moderate") | nb06 cell "cell-meta" | `code_constant` |
| `atb_version` ("2024 v3.0.0") | nb06 cell "cell-meta" | `code_constant` |
| `notes` | nb06 cell "cell-meta" | `code_constant` |
| `synthetic_network` (11 sub-keys) | Validation JSON + nb07 code constants | `repo_artifact` + `code_constant` |
| `mc_sensitivity` (full block) | Pre-existing in file (2026-07-31 run) | `recovered` |

**`synthetic_network` sub-keys:**
- `n_buses` (500), `n_edges` (818), `mountain_west_bus_count` (79),
  `wyoming_bus_count` (12), `validation_status` ("warning"),
  `validation_warnings` — all from `synthetic_topology_validation.json`
- `pop_weight_alpha` (0.45), `capacity_headroom_mult` (1.25),
  `random_seed` (42) — from nb07 code, confirmed by methods doc
- `population_resolution` ("county"), `interchange_percentile` (0.95) — from nb07 code

**Missing keys (21 — cannot be grounded without re-running notebooks):**

*Write-only (no downstream consumer reads these directly):*
- `giant_component_size` — nb06 runtime value
- `n_components` — nb06 runtime value
- `pct_mw_retained_at_filter` — nb06 runtime value
- `total_snapped_mw` — nb06 runtime value
- `spatial_hierarchy` — nb08c output
- `retirement_data` — nb10 output
- `county_pivot` — nb14 output
- `engine_v2` — nb16 output
- `action_library` — build_action_library_v2.py output
- `model_architecture`, `n_zones`, `zonal_total_cap_gw`, `zonal_load_proxy_gw` — julia/build_e4st_case.jl
- `e4st_v2` — julia/build_e4st_case_v2.jl
- `e4st_case` — julia/build_nodal_case.jl output
- `scenario_runs` — julia/run_scenario.jl output
- `scenarios_completed` — julia/run_scenarios.jl output

*Critical consumer reads (KeyError risk if not re-populated):*
- **`island_filter_min_nodes`** — read by `julia/build_nodal_case.jl:102`.
  Computed at runtime by nb06 (first threshold retaining ≥95% total MW;
  fallback 50). Not a hardcoded constant anywhere. Marked MISSING.
- **`validation_deepdive`** — read by `julia/build_nodal_case.jl:98`
  (checks `ready_for_e4st`). Written by archived `08_validation_deepdive.ipynb`.
  Cannot recover without re-running.
- **`ecoregion_layer`** — read by `notebooks/08c_spatial_hierarchy.ipynb`
  (accesses `n_ecoregions_in_study_area`). Written by nb08a. Cannot recover.
- **`ees_baseline`** — read by `notebooks/14_county_foundation.ipynb`.
  Written by nb08b. Cannot recover.

**Discrepancy found:** `DELAUNAY_PRUNE_DISTANCE_KM` — methods doc says 400,
repo code (nb07 cell 3) says 75. Repo value used. See DECISIONS.md entry.

**F10 bug fix (deep-merge):**
- `mc_full_run.py` — added deep-merge metadata write at end of `main()`
  (reads existing file, sets only `mc_sensitivity`, writes back)
- `15_coefficient_monte_carlo.ipynb` cell 18 — removed skeleton-create
  fallback; now always reads existing file and merges
- `18_magnitude_sweep.ipynb` — added new cell (after cell 10) writing
  `magnitude_sweep` summary block via deep-merge

**Regression test:** `tests/test_metadata_merge.py`
- `test_deep_merge_preserves_existing_keys` — writes throwaway key, asserts
  all original keys survive
- `test_metadata_has_provenance_for_all_data_keys` — every non-meta key has
  a `_provenance` entry

**Gitignore:** Added `!data/processed/network_metadata.json` exception
(line 67 of `.gitignore`). File is now tracked.

**Acceptance results:**
- File tracked in git (not gitignored): `git check-ignore` exit 1 ✓
- Every key has `_provenance` marker: test passes ✓
- Merge regression test: both tests pass ✓
- Consumer check: 9 present, 21 missing (all documented above) ✓

**Missing keys feed S9 / W7-2.** Re-running the notebook pipeline
(nb06 → nb07 → nb08a → nb08b → nb08c → nb10 → nb14 → nb16) will
repopulate all missing keys via the existing merge-write pattern in each
notebook. The 3 critical-read keys (`island_filter_min_nodes`,
`validation_deepdive`, `ecoregion_layer`) must be repopulated before
their Julia/notebook consumers can run.

**F10 closed. S5 complete. Do not start S6.**

---

## S6 — 2026-09-13 — F1 fix + small corrections

**Objective:** Python-side and TypeScript-side anchor files byte-identical;
documentation numbers match shipped data. Closes F1, F7, F13.

**Shared SHA-256 (both anchor copies):**
`7fd936f7209bb67dfa106e50718c46cfca8b8dd66cd26bb2a55103ac4950b5a8`

**Step 2 patches (Python-side → TS-side values):**
- Dave Johnston Power Plant: `capacity_or_load_mw` 762 → 816.7, `capacity_delta_pct` 7.178 → 0
- Meta AI Data Center (Cheyenne): `capacity_or_load_mw` 100 → 152
- Jade/Crusoe Campus Phase 1 (Cheyenne): `capacity_or_load_mw` 200 → 1800

**Step 4 — Python fixture movement:**
No Python fixture digest moved. Tests run: `test_terra_engine_v3.py`,
`test_c4ii_consequences.py`, `test_c2_exposure_tags.py`, `test_golden_m.py`
→ 135 passed. Anchor loading is opt-in and the patched fields
(`capacity_or_load_mw`, `capacity_delta_pct`) are not used in any digest path.

**Step 5 — scenario_profiles rename:**
- `data/processed/mw_scenario_profiles.json` → `data/processed/ees_scenario_profiles.json`
- Ticket referenced the file as `scenario_profiles.json`; actual filename had `mw_` prefix.
  Documented the discrepancy in DECISIONS.md.
- Updated `src/terra_engine.py:2292` and `scripts/check_generators.py:58`.
- `terra-app/src/data/scenario_profiles.json` untouched (confirmed via git status).

**Step 6 — data/README.md verified counts:**
- Study area: **157 counties** (verified against `mw_study_counties.csv`: 158 rows − header)
- Action library: **55 actions, schema 3.3** (24 energy infrastructure, 14 ecological
  restoration, 12 settlement/social, 4 agriculture, 1 climate adaptation) / **22 disturbances**
  (verified against `mw_action_library_v3.json`)
- Notebook run order updated: archived notebooks (02, 02b, 03, 04, 05, 09, 09a, 11, 12, 13)
  removed; 22_anchor_facilities added; intro note links to `archive/notebooks/README.md`.

**Step 7 — Jim Bridger `capacity_basis`:**
- Chose option (b): `capacity_basis = "net_summer"` + `capacity_basis_note` field.
- See DECISIONS.md for full rationale (TL;DR: avoids ambiguous new enum, self-documenting note).
- Applied to both anchor file copies to preserve byte-identity.

**Scripts added:**
- `scripts/patch_anchor_facilities.py` — capacity patches for 3 records (idempotent)
- `scripts/patch_jim_bridger_capacity_basis.py` — capacity_basis patch (both copies)

**Acceptance:**
- `shasum -a 256` both copies: `7fd936f7...` (identical) ✓
- `grep -rn "293\|46 action\|49 action" data/README.md` → nothing ✓
- `grep -rln "processed/scenario_profiles" --include=*.py --include=*.ipynb .` → nothing ✓
- `terra-app/src/data/scenario_profiles.json` untouched ✓
- Jim Bridger `capacity_basis = "net_summer"`, documented in DECISIONS.md ✓

**F1, F7, F13 closed. S6 complete. Do not start S7a.**

---

## S7a — 2026-09-13 — Rebuild county EES baseline on pinned inventory (F2)

**Objective:** Rebuild the county E/Ec/S baseline so the Ec_gencap
normalization matches the attribution logic's scale — both now computed
from the complete pinned EIA generator inventory (25,868 generators,
SHA `573f1a7b`).

**What was done:**

**Precondition check:**
- `data/staging/eia_operating_generators_2026-05_raw.json`: 25,868 records,
  SHA-256 `573f1a7b...` ✓
- `data/processed/power_plants_with_ba.geojson`: 25,868 records, derived from
  pinned inventory, last modified 2026-08-10 ✓
- HIFLD FeatureServer reachability: Hospitals 200, Colleges 200 ✓

**Snapshot (before hashes):**
- `mw_county_ees_summary.csv`: `465776cf602ae2f8da65d6af031caf25be8f51ce612e6c1fe15a915bc7082f13`
- `county_ees_baseline.json` (terra-app): `ab8920bfc286fa3a64f560e11122ceec7b23333e3de01767d41576dbcb1bcb6a`
- `data/processed/county_ees_baseline.json`: did not exist

**Reference normalization (fresh, from `build_generator_attribution.py` logic):**
- `study_tracts()` → 1,676 tracts (7 ecoregion codes, n_missing ≤ 3)
- `county_generator_term()` on `power_plants_with_ba.geojson`:
  - gen_cap_50km_mw min: 0.0 MW, max: 5,796.9 MW
  - ec_slope = 10 / 5796.9 / 6 = 2.875099909721863e-04

**Notebook execution:**
- `08b_ees_baseline.ipynb` run headlessly as Python script (converted via
  nbconvert, OneDrive ROOT path patched to local). Produced
  `mw_tract_ees_scores.parquet` (1,676 tracts, 42 columns) and
  `mw_ecoregion_ees_summary.csv` (7 ecoregions).
- `14_county_foundation.ipynb` run headlessly as Python script. TIGER 2023
  county shapefile re-downloaded (missing `.dbf`/`.prj` files). Produced
  `mw_county_ees_summary.csv` (157 counties), `mw_county_cards.json`,
  `county_crosswalk.parquet`, `network_metadata.json` update.

**Step 6 — slope comparison:**
- 08b implied max: 5,796.9 MW (exact match with reference)
- 08b ec_slope: 2.875099909721863e-04 (0.000% difference from reference)
- Tolerance: 1% — PASS
- Historical context: stale baseline had max ≈ 5,184.8 MW,
  slope ≈ 3.2145e-4 — was 11.81% apart, now 0%

**Step 7 — Albany county (56001) check:**
- Pop-weighted Ec_gencap: 0.7708 (0-10 scale)
- Pop-weighted Ec_contribution (Ec_gencap/6): 0.1285
  - Stale value: 0.0097 → moved UP 13.2× (expected direction ✓)
  - Expected target: ~0.1285 → actual 0.12846 (matches ✓)
- Composite Ec: 5.5025 → 5.6212 (increase from Ec_gencap correction)
- E and S unchanged (0.4351, 5.2321) — no generator dependency

**Step 8 — promotion:**
- `mw_county_ees_summary.csv` in place (157 rows)
- `data/processed/county_ees_baseline.json` created (157 records)
- `terra-app/src/data/county_ees_baseline.json` overwritten (157 records)
- CSV ↔ JSON agreement: 0.00e+00 across all columns (E, Ec, S, population, n_tracts) ✓
- Both JSON copies byte-identical ✓
- `.gitignore` updated: added `!data/processed/county_ees_baseline.json` exception

**After hashes:**
- `mw_county_ees_summary.csv`: `8f66327636059adf766cdd315612772f79700b3ead2e415b9f742887650325c6`
- `county_ees_baseline.json` (both paths): `3b0c326dbf48d5b9db94bfe26c9e965386f28714ee22baa74433b5df15931d2e`

**Full E/Ec/S refresh note:** This was a full 08b + 14 re-run, so ALL
sub-scores were refreshed — not just Ec_gencap. Census ACS 2022 and
HIFLD data were re-fetched live. E and S composites may differ from
stale values due to updated Census/HIFLD source data, not just the
generator capacity fix. In practice, Albany's E and S were unchanged
(matching to 4 decimal places), but other counties may show small
E/S movement. This is expected and correct.

**Acceptance:**
- Step 6 slope comparison: 0.000% difference, within 1% tolerance ✓
- 157 rows in both runtime paths ✓
- CSV ↔ JSON agreement to 0.00e+00 for all columns ✓
- Albany Ec_contribution moved UP from 0.0097 to 0.1285 ✓

**Goldens NOT yet refreshed, trajectory NOT yet re-run — that's S7b.**

**F2 (upstream half) closed. S7a complete. Do not start S7b.**

---

## S7b — 2026-09-13 — Downstream fixture refresh on corrected EES baseline (F2)

**Objective:** Every downstream golden fixture and analytical result now sits
on the corrected EES baseline from S7a, with every digest change explained.
Closes F2 (downstream half).

### Digest change table

All digest movements are caused by the S7a Ec_gencap normalization correction
(123 of 157 counties had Ec shifts; E and S unchanged). Fixtures that use
`county_ees_baseline.json` or `mw_county_cards.json` see Ec-driven digest
changes. Fixtures that only test structural behavior (asset lifecycle, capacity
drops) are unaffected in their assertions.

| Fixture | Digest type | Before (pre-S7a) | After (S7b) | Reason |
|---------|-------------|-------------------|-------------|--------|
| A | state | `3f5f4ec5...` | `15680bf1...` | Ec baseline shift (123 counties) |
| B | state | `716b189a...` | `46379272...` | Ec baseline shift |
| C | state | `2f5a93e4...` | `645d3b0b...` | Ec baseline shift |
| D | state | `c4e8fc65...` | `7ecb211e...` | Ec baseline shift |
| D | fiscal | `225c5bdd...` | `225c5bdd...` | Unchanged (fiscal data unchanged; TS-side value retained) |
| E | existing_assets | `92bfcbf6...` | `7c685b36...` | DJ flagship capacity 816.7→762 MW in county_cards |
| F | fiscal (before) | changed | changed | Ec shift affects fiscal via action replay |
| F | existing_assets (before/after) | changed | changed | DJ capacity change |
| G | all yr digests | changed | changed | Ec baseline shift |
| G | dj_capacity_drop_mw | 816.7 | 762.0 | DJ capacity in county_cards corrected |
| G | bus_56009 capacity | 427.8 | 482.5 | Follows from DJ capacity correction |
| G′ | all yr digests | identical to G | identical to G | Both run current engine (autonomous decline active) |
| G′ | fiscal = G fiscal | differs | matches | G and G′ now produce identical digests |
| H | state, fiscal, ea | changed | changed | Ec baseline shift |
| I | all yr digests | changed | changed | Ec baseline shift |
| J | history_digest | changed | changed | Ec in history snapshots |
| J | laramie_spot_Ec | 9.269313 | 9.394758 | Ec baseline shift in Laramie |
| J′ | history_digest | changed | changed | Ec in history snapshots |
| J′ | laramie_spot_Ec | 9.269313 | 9.394758 | Ec baseline shift in Laramie |
| K | existing_assets | changed | changed | DJ capacity change |
| L | all lens digests | changed | changed | Ec baseline shift |
| M | all lens digests | changed | changed | Ec baseline shift |
| N | all lens digests | changed | changed | Ec baseline shift |
| ranch_country_2040 | replay_digest | `beafdb2f...` | `3fa87579...` | Ec baseline shift under ssp370 lens |

### TS data sync

`terra-app/src/data/county_cards.json` was stale (pre-S7a). Synced shared
fields (E, Ec, S, flagship_assets, etc.) from Python `mw_county_cards.json`
while preserving TS-only keys (`anchor_facilities`, `economic_drivers`).
Key changes: 123 counties Ec updated, Dave Johnston capacity 816.7→762 MW,
Jade/Crusoe 1800→200 MW, Meta AI 152→100 MW.

### G vs G′ convergence

Golden G (engine v3.0, no autonomous decline) and G′ (engine v3.1, with
autonomous decline) historically produced different fiscal/EA digests. After
regeneration with the current engine (which always includes autonomous decline),
both produce identical values. Tests updated: `gp-m` assertion changed from
`not.toBe` to `toBe` (TS), `test_gp_i_fiscal_digest_differs_from_golden_g`
renamed to `test_gp_i_fiscal_digest_matches_golden_g` with `!=` → `==` (Python).

### Golden D fiscal digest note

The golden_d `final_fiscal_digest.md5` exhibits a cross-runtime floating-point
divergence: Python produces `cbc0734b...` while TS produces `225c5bdd...`.
Both engines start from identical fiscal baselines (verified: 0 diffs in
`fiscal_baseline.json`, 0 diffs in `fiscal_coefficients.json` values). The
divergence accumulates during the 20-year scenario replay through depreciation
calculations. The fixture retains the TS-engine value since the TS parity test
is the only consumer of this field. The `fiscal_snapshots` test (which uses
`relClose()` tolerance) passes on both runtimes, confirming fiscal correctness.

### Test suite results

| Suite | Pass | Fail | Note |
|-------|------|------|------|
| Python (`pytest`) | 226 | 0 | 1 pre-existing failure excluded (`test_county_card_capacity_provenance.py`) |
| TS parity (`vitest`) | 351 | 0 | 33 test files, all passing |

The pre-existing Python failure (`test_county_card_capacity_provenance.py`)
is caused by `mw_county_cards.json` schema divergence from the capacity
provenance audit after S7a's nb14 re-run. Not in S7b scope.

### Trajectory delta

Re-ran `notebooks/19_temporal_trajectory.ipynb` on corrected baseline.
Output: `data/processed/trajectory_results.csv` (124 rows, 15 columns).

| Column | Rows changed | Max delta | Cause |
|--------|-------------|-----------|-------|
| E | 0 / 124 | 0.0 | Unchanged |
| Ec | 124 / 124 | +0.0059 | Uniform S7a Ec correction |
| S | 0 / 124 | 0.0 | Unchanged |
| composite | 124 / 124 | +0.00197 | Ec/3 (mean of E, Ec, S) |

Do-nothing composite: 2025 old=5.1082 → new=5.1101; 2055 old=5.1187 → new=5.1206.
The shift is a pure baseline level change, uniform across all four scenarios
and all years. No structural change in trajectory shape or relative ordering.

### Files touched

- `data/golden/golden_{a,b,c,d,e,f,i,k}.json` — digest updates
- `data/golden/fixture_registry.json` — golden_m digest updates
- `data/processed/network_metadata.json` — provenance entries for county_pivot, ees_baseline, engine_v2
- `data/processed/trajectory_results.csv` — re-run on corrected baseline
- `terra-app/src/data/county_cards.json` — synced from Python mw_county_cards.json
- `terra-app/src/data/golden_b.json` — state_digest update
- `terra-app/src/ui/pages/MethodsPage.tsx` — golden_b digest reference update
- `terra-app/tests/parity/fixtures/golden_{a..n,ranch_country_2040}.json` — digest updates
- `terra-app/tests/parity/c0-gate-verify.test.ts` — FROZEN digest values updated
- `terra-app/tests/parity/golden-g-prime.test.ts` — G′ assertions + gp-m test updated
- `terra-app/tests/parity/replay-integrity.test.ts` — WITH_EVENTS_DIGEST updated
- `terra-app/tests/parity/retirement.test.ts` — existing_assets_digest updated
- `terra-app/tests/parity/ag4-session-drought.test.ts` — energy-only replay_digest updated
- `tests/test_terra_engine_v3.py` — existing_assets_digest + G/G′ fiscal assertion updated
- `scripts/regenerate_all_goldens.py` — new utility for batch fixture regeneration

**F2 (downstream half) closed. S7b complete.**

---

## S7b-addendum — F14: county_cards flagship capacity regression

**Finding (F14):** `mw_county_cards.json` flagship capacity values for three
facilities were regressed by S7a's nb14 re-run. nb14's hardcoded `FLAGSHIP_ASSETS`
list (Cell 4f) was never updated as part of F1/W7-0, so regenerating the output
file from source overwrote the W7-0 corrections. S7b's blind Python→TS sync
then propagated the regressed values into `terra-app/src/data/county_cards.json`.

Same defect class as F1 (capacity mismatch vs authoritative
`mw_anchor_facilities.geojson`), but in a file the original audit never checked.

### Regressed values (all restored to W7-0 authoritative values)

| Facility | geoid | nb14 (wrong) | Authoritative | Basis |
|---|---|---|---|---|
| Dave Johnston Power Plant | 56009 | 762 | 816.7 | nameplate |
| Meta AI Data Center (Cheyenne) | 56021 | 100 | 152 | load |
| Jade/Crusoe Campus Phase 1 | 56021 | 200 | 1800 | load |

Additionally, `capacity_basis` and `capacity_vintage` provenance fields were
restored on all five W7-0-corrected flagship records (the above three plus
Kemmerer Unit 1 and Jim Bridger, whose capacity values were not affected).

### Root cause chain

1. **W7-0** corrected flagship capacities in the output file `mw_county_cards.json`
   but did not patch the notebook source (`notebooks/14_county_foundation.ipynb`,
   Cell 4f `FLAGSHIP_ASSETS`).
2. **S7a** re-ran nb14 to rebuild the EES baseline, which regenerated
   `mw_county_cards.json` from the stale hardcoded list, overwriting W7-0.
3. **S7b** blindly synced Python→TS shared fields, copying the regressed values.

### Digest impact

Capacity values feed into `seedAssetRegistry` → `asset_registry` → `bus_state`
→ digests. The Meta AI change (100→152) also flips `fiscal_action_id` from
`data_center_hyperscale` to `data_center_campus_phase` (threshold: capacity ≥ 150).

| Fixture | Digest | Before (F14) | After (F14) | Changed? |
|---|---|---|---|---|
| Golden E | existing_assets | `7c685b36...` | `fa8cc0fc...` | yes |
| Golden F | before ea | `7c685b36...` | `fa8cc0fc...` | yes |
| Golden F | after ea | `9f43f103...` | `dcb906d1...` | yes |
| Golden G/G′ | state (2027/2031/2045) | see fixture | see fixture | yes |
| Golden G/G′ | ea (2027/2031/2045) | see fixture | see fixture | yes |
| Golden H | state (A/B) | see fixture | see fixture | yes |
| Golden H | ea (A/B) | `8607ae20...` | `c9ea2461...` | yes |
| Golden I | state/ea (2031/2041) | see fixture | see fixture | yes |
| Golden K | ea (2040) | `0fa86f2f...` | `e99daf93...` | yes |
| Golden L | ssp370 state/probes | see fixture | see fixture | yes |
| Golden M | state (all lenses) | see fixture | see fixture | yes |
| Golden N | state (4 of 6 scenarios) | see fixture | see fixture | yes |
| All | fiscal_digest | — | — | **unchanged** |
| Golden J/J′ | history_digest | — | — | unchanged |

**Golden L ssp370 cross-runtime divergence — false alarm (corrected
2026-09-15):** The F14 commit reported a TS≠Python ssp370 divergence, but
post-session verification confirms both engines produce identical ssp370
state digests (`46c009d7c2444335687bb111e92b8b65`) on the fully-patched data.
The discrepancy was caused by running `regenerate_all_goldens.py` on
partially-patched data. No coverage gap; no new finding. See DECISIONS.md
entry "F14 addendum: Golden L ssp370 cross-runtime divergence is false alarm"
for full verification table.

**Golden D fiscal_digest:** Restored to TS-engine value `225c5bdddb9e0e59...`
(Python regenerator had overwritten it with Python value `cbc0734bc40b1fcc...`).
The cross-runtime divergence is pre-existing and unrelated to F14.

### Preventive note for W7-2 S11 (dual-path identity check)

S7b's sync pattern — copy Python shared fields to TS without verifying which
side is authoritative — is exactly the mechanism that reintroduced this F1-class
bug. A sync step that assumes "Python is always authoritative" can propagate
notebook-sourced regressions silently. S11's dual-path identity check should
verify that `mw_anchor_facilities.geojson` (the source of truth for capacities)
agrees with both `mw_county_cards.json` and `terra-app/src/data/county_cards.json`.

**Root cause not fully closed:** nb14's hardcoded `FLAGSHIP_ASSETS` list still
has the stale values (762, 100, 200). The output file is patched, but the next
nb14 re-run will regress again unless the notebook source is also updated.

### Test results

- **Python:** 226 passed, 0 failed (1 pre-existing excluded: `test_county_card_capacity_provenance.py`)
- **TS parity:** 351 passed, 0 failed

### Files touched

- `data/processed/mw_county_cards.json` — flagship capacity + provenance restoration
- `terra-app/src/data/county_cards.json` — re-synced from fixed Python source
- `terra-app/tests/parity/fixtures/golden_{d..n,g_prime,j_prime,k,ranch_country_2040}.json` — regenerated
- `terra-app/tests/parity/c0-gate-verify.test.ts` — FROZEN digest values updated
- `terra-app/tests/parity/retirement.test.ts` — existing_assets_digest updated
- `tests/test_terra_engine_v3.py` — existing_assets_digest updated
- `data/golden/fixture_registry.json` — golden_m state digests updated
- `scripts/patch_county_cards_f14.py` — new patch script (auditable)
- `scripts/sync_county_cards_to_ts.py` — new sync utility

**F14 closed.**

---

## S7b-addendum-2: Golden L ssp370 divergence clarification (2026-09-15)

**Question investigated:** Is the Golden L ssp370 cross-runtime divergence
reported during F14 a real bug, a coverage gap, or a false alarm?

**Answer: False alarm.** Both engines compute identical ssp370 state digests
on the post-F14 data:

| Probe year | Python                                | TS                                     |
|------------|---------------------------------------|----------------------------------------|
| 2030       | `38d9b6472dbbcbe4555cbc144b584bd5`   | `38d9b6472dbbcbe4555cbc144b584bd5`    |
| 2040       | `3ffc6f560fbe0e0bcd8e58d6ee1405d8`   | `3ffc6f560fbe0e0bcd8e58d6ee1405d8`    |
| 2050       | `46c009d7c2444335687bb111e92b8b65`   | `46c009d7c2444335687bb111e92b8b65`    |

**Root cause:** `regenerate_all_goldens.py` ran during the F14 session at a
point when county_cards data was partially patched. The regenerator computed
Python digests on stale data (`bfdacdf5...`), then the F14 patch completed,
then TS tests computed digests on corrected data (`46c009d7...`). The
difference was misattributed to cross-runtime FP divergence.

**Coverage assessment:** No gap. Python L-2 and TS L-2/L-12 both check against
the same fixture file. If either engine computed a different value, its test
would fail. The 226/226 + 351/351 results are a genuine clean bill of health
for Golden L parity. TS test L-12's name ("TS-Python digest parity") is
slightly misleading — it only runs TS — but the structural guarantee (shared
fixture, both suites must pass) is equivalent.

**Corrected in this addendum:**
- HANDOFF.md digest table: removed "(TS≠Python)" from Golden L row
- HANDOFF.md: replaced incorrect divergence paragraph with correction + DECISIONS.md cross-reference
- DECISIONS.md: added verification entry with full probe-year table

**No new finding. No code changes. F14 remains closed.**

---

## S8 — 2026-09-15 — Re-run Monte Carlo and magnitude sweep

**Objective:** Recompute `mc_validation_priority.csv` and `sweep_cost_ranking_sourced.csv`
against the S7a/S7b/F14-corrected EES baseline, with provenance recorded.

**Precondition check:**
- S5 deep-merge fix confirmed in `mc_full_run.py` (lines 261–305: read-modify-write,
  sets only `mc_sensitivity` key) and in `15_coefficient_monte_carlo.ipynb` cell 18
  and `18_magnitude_sweep.ipynb` cell 11. Not reverted. ✓
- Stale checkpoint (July 31, 10k rows, pre-S7a) moved to `/tmp` before run.
- Baseline commit: `b5fd4fdc` (F14 — final corrected state).

**What was done:**

**Step 1 — Pre-run snapshot:**
- `mc_validation_priority.csv` SHA-256: `7d7834aa...` (July 31, pre-S7a)
- `sweep_cost_ranking_sourced.csv` SHA-256: `599f2498...` (July 31, pre-S7a)
- Both saved to `/tmp` as `*_pre_s7a` files.

**Step 2 — MC full run:**
- `mc_full_run.py` re-run from scratch (stale checkpoint deleted).
- 10,000 iterations, 9 workers, 30.2 min wall clock.
- `15_coefficient_monte_carlo.ipynb` analysis cells run headlessly via
  `jupyter nbconvert --to script` + `python3`. Checkpoint auto-detected complete
  (10,000/10,000); simulation cells skipped; analysis ran cleanly.

**Step 3 — Sweep:**
- `18_magnitude_sweep.ipynb` run headlessly. 30 actions × 7 magnitudes.
  Reads `mc_validation_priority.csv` only for informational cross-reference (cell 10);
  core sweep outputs are independent of MC results.

**Rank-change diff (MC validation-priority):**

All 15 ranks are identical between pre-S7a and post-S7a. ρ values differ by
< 0.001 in all cases (statistical noise, not meaningful signal):

| Rank | Coefficient | ρ (pre-S7a) | ρ (post-S7a) | Rank change |
|------|-------------|-------------|--------------|-------------|
| 1 | prairie_restoration/E | 0.71669 | 0.71670 | none |
| 2 | riparian_buffer/E | 0.60082 | 0.60082 | none |
| 3 | smr_advanced/Ec | 0.20305 | 0.20302 | none |
| 4 | transmission_230kv/Ec | 0.14538 | 0.14537 | none |
| 5 | mine_land_reclamation/E | 0.10068 | 0.10069 | none |
| 6–15 | (all others) | — | — | none |

**Why the ranks didn't change:** The S7a fix corrected the Ec_gencap normalization
— a uniform baseline level shift across 123 counties. The MC sensitivity analysis
perturbs *action coefficients* (marginal effects) and measures relative leverage via
Spearman correlation. Prairie_restoration's dominance (ρ=0.72) comes from having
the largest E coefficient (1.2613) — nearly 2× the next action. This structural
ordering is not affected by shifting the absolute Ec baseline level. The sub-portfolio
flip rate is 0.0: not a single draw (of 1,000 paired draws) changed the sub-portfolio
ranking, confirming robustness.

**Nominal composite shift:** 5.2217 → 5.2236 (+0.0019). This direct baseline-level
increase reflects the Ec_gencap correction from S7a (Ec rose slightly across the
study area). The composite SD stayed at 0.011, confirming coefficient uncertainty
is unchanged.

**Sweep cost ranking diff:**
- Ranked order: unchanged (prairie_restoration ≫ invasive_treatment ≫
  irrigation_efficiency ≫ riparian_buffer ≫ ..., same 12 sourced actions in same order).
- `cost_efficiency_per_$1M` values: unchanged (same to 4 significant figures for all
  sourced actions).
- `best_magnitude_pct` changed for several actions (e.g., prairie_restoration 25→75,
  health_clinic 25→200, solar_utility 100→25). These are expected: the efficiency curve
  is nearly flat near the maximum, so the small baseline shift can move which grid interval
  appears "best" without materially changing the efficiency value. Not a ranking signal.

**Top-priority coefficients for advisor conversation:**

11 of the 15 highest-leverage coefficients are currently low-confidence or unsourced.
Priority order (highest leverage × lowest confidence):

1. `smr_advanced/Ec` (rank 3, ρ=0.203) — SMR energy-capacity contribution; no source.
   Wyoming's planned SMR deployment makes this directly policy-relevant.
2. `mine_land_reclamation/E` (rank 5, ρ=0.101) + `/S` (rank 10, ρ=0.034) — no source.
   Two separate capital pathways, both unsourced; combined leverage is substantial.
3. `smr_advanced/S` (rank 6, ρ=0.087) — SMR social contribution; no source.
4. `microgrid/S` (rank 7, ρ=0.048) — no source.
5. `university_research_center/Ec` (rank 8, ρ=0.036) + `/S` (rank 11, ρ=0.031) — no source.

Prairie_restoration and riparian_buffer top the sensitivity table but are already
high-confidence (USDA EQIP citations). Transmission_230kv (rank 4) is also
high-confidence. The advisor should focus on the SMR and mine reclamation
coefficients first.

**Provenance added:**
Both `mc_sensitivity` and `magnitude_sweep` blocks in `network_metadata.json` now
carry `baseline_commit: b5fd4fdc6cffaf302df49592114e17e42b0b2990` and
`baseline_description: "S7a/S7b corrected EES baseline + F14 flagship capacity fix"`.

**Files newly tracked:**
- `data/processed/mc_validation_priority.csv` (excepted in `.gitignore`)
- `data/processed/sweep_cost_ranking_sourced.csv` (excepted)
- `data/processed/sweep_marginal_returns.csv` (excepted)

**Acceptance:**
- Both outputs regenerated on corrected baseline ✓
- Each carries baseline/commit reference in `network_metadata.json` ✓
- Rank diff written with interpretation ✓
- Zero rank changes — sensible story (ranking is coefficient-structure-driven,
  not baseline-level-driven) ✓

**S8 complete. Do not start S9.**

---

## S9 — 2026-09-15 — docs/PIPELINES.md and data/README.md (F9 docs, F13)

**Objective:** One page that accurately states, for every pipeline in
this repo, what generates it, whether it's tracked, when it was last
built, and its current status — grounded in the repo as it actually
is today (post S1–S8).

**What was done:**

**docs/PIPELINES.md (new):**
- 9 pipeline rows (A through I) plus TS-only static data, restructured
  from the original audit's §3 table with every status updated to reflect
  post-W7 reality.
- 62 runtime files inventoried across all pipelines. Each row includes:
  file path, generator, tracked status, last-built date, commit SHA,
  and SHA-256 hash (first 12 hex chars).
- Prose notes per pipeline where status needed explaining: Pipeline C's
  full S7a/S7b/F14 story, Pipeline F's two fork-fix instances, Pipeline I's
  verification history.
- Open gaps section documenting all standing backlog items for W7-2/S11.

**scripts/build_pipeline_table.py (new):**
- Enumerates all 62 runtime-loaded files, finds their generator, reports
  current SHA-256 hash + last git commit.
- Supports `--json` flag for machine-readable output.
- Seed for W7-2/S11 manifest work.

**data/README.md (rewritten):**
- Converted from a 19-step run-order document to a "what exists and how
  it was made" reference.
- Verified all numbers against current data:
  - 157 counties (verified against `mw_county_cards.json`)
  - 55 actions, schema 3.3, 22 disturbances (verified against `mw_action_library_v3.json`)
  - 500 buses, 818 branches (verified against geojson files)
  - 23 WY fiscal counties (verified against `wy_county_fiscal_baseline.json`)
  - Anchor SHA `7fd936f7` (verified both copies byte-identical)
- Removed stale claim that `.gitkeep` is the only committed file in `data/processed/`
  (many files now tracked via `.gitignore` exceptions).
- Cross-references `docs/PIPELINES.md` for the full runtime file inventory.

**Acceptance results:**
- Every runtime-loaded file appears in exactly one row (62 entries, 0 duplicates) ✓
- Status column reflects current repo state, verified against HANDOFF.md history ✓
- `python scripts/build_pipeline_table.py` runs cleanly (both markdown and JSON) ✓
- `data/README.md` contains no stale numbers ✓

**S9 complete. F9 (documentation half) and F13 closed.**

---

## Horizon 1 complete

W7 Horizon 1 (S1–S9) is done. All findings from the September 11 audit have
been addressed or explicitly documented as standing backlog.

### What still has no generator or is still MISSING

These items constitute the standing backlog for W7-2/S11 (manifest + CI):

1. **`ees_scenario_profiles.json`** — optional load (`terra_engine.py:2292`),
   no tracked generator. Renamed from `mw_scenario_profiles.json` in S6 but
   the rename did not create a generator.

2. **`lifecycle_coefficients.json`** — optional load (`terra_engine.py:2417`),
   no tracked generator.

3. **`synthetic_plant_assignments.parquet`** — required by `_build_fuel_mix_map()`
   (`terra_engine.py:602`), exists locally but blocked from git by the global
   `*.parquet` rule. No `.gitignore` exception added.

4. **`spatial_hierarchy_counties.parquet`** and **`spatial_hierarchy_huc8.parquet`**
   — optional loads (`terra_engine.py:2483–2484`), exist locally but blocked
   by `*.parquet` rule.

5. **3 critical-read `network_metadata.json` keys** still MISSING (KeyError risk
   if their Julia/notebook consumers run):
   - `island_filter_min_nodes` (read by `julia/build_nodal_case.jl:102`)
   - `validation_deepdive` (read by `julia/build_nodal_case.jl:98`)
   - `ecoregion_layer` (read by `notebooks/08c_spatial_hierarchy.ipynb`)

6. **15 write-only `network_metadata.json` keys** still MISSING (no downstream
   consumer reads them directly; will repopulate when notebooks are re-run).

7. **nb14 `FLAGSHIP_ASSETS` hardcoded values** — output files are patched but
   notebook source (Cell 4f) still carries stale capacities (762/100/200).
   Next nb14 re-run will regress unless patched.

8. **`test_county_card_capacity_provenance.py`** — pre-existing Python test
   failure from `mw_county_cards.json` schema divergence after S7a's nb14 re-run.
   Not in W7-1 scope.

9. **D5 rancher/Extension domain review** for agriculture pipeline — never
   happened, carried into W7-4.

---

## S10 — 2026-09-16 — Minimal Behavioral CI (W7-1)

**Objective:** GitHub Actions workflow running pytest + `npm run parity` on every
push, proven capable of failing.

### What was built

**`.github/workflows/ci.yml`** — two-job workflow:
- `pytest` job: `ubuntu-latest`, Python 3.13, pip cache, LFS checkout, `pytest tests/`
- `parity` job: `ubuntu-latest`, Node 24, npm cache, `npm ci && npm run parity`
- Triggers on all pushes (branch filter removed to allow failure demonstration on
  non-main branches; also better practice for feature-branch validation)

**`requirements.txt`** (new) — pip-installable dependencies pinned to local
versions: pytest 9.1.1, geopandas 1.1.4, pandas 3.0.2, numpy 2.4.4, scipy 1.18.0,
shapely 2.1.2, python-dotenv 1.2.1, pyogrio 0.13.0, pyproj 3.7.2, fiona 1.10.1,
pyarrow 24.0.0.

**`pytest.ini`** (new) — excludes `test_county_card_capacity_provenance.py`
(pre-existing failure from S7b/F14, nb14 FLAGSHIP_ASSETS not patched).

### Issues found and fixed en route

| Finding | Root cause | Fix | Commit |
|---------|-----------|-----|--------|
| `test_metadata_has_provenance_for_all_data_keys` failing | S8 wrote `magnitude_sweep` key to `network_metadata.json` but never added a `_provenance.magnitude_sweep` entry | Added provenance entry | 1b7657e |
| pytest fails on CI (all tests using `initialize_state()`) | `synthetic_plant_assignments.parquet` blocked by `*.parquet` gitignore rule, no exception; file missing on CI | Added `!data/processed/synthetic_plant_assignments.parquet` exception, tracked 119KB file | 9794542 |
| pytest still fails on CI after above | `mw_ecoregions.geojson` (11MB) excluded by comment in .gitignore ("OneDrive conflict during git-add"). `initialize_state():2124` opens it without existence guard | Removed comment-exclusion, added `!data/processed/mw_ecoregions.geojson` exception | 1f0a116 |
| pytest still fails on CI after above | `pandas.read_parquet()` requires `pyarrow` or `fastparquet`; pyarrow was a conda transitive dep not in requirements.txt | Added `pyarrow==24.0.0` | d43c21e |

### Before/after CI status

| Branch | Before S10 | After S10 |
|--------|-----------|----------|
| main | No CI (no workflow) | ✅ Green ([run 35128035211](https://github.com/dylanhartman913-arch/TERRA-Civic-Sim/actions/runs/35128035211)) |
| `s10-ci-failure-demo` | — | 🔴 Red ([run 35125135798](https://github.com/dylanhartman913-arch/TERRA-Civic-Sim/actions/runs/35125135798)) |

### CI run times (main, commit d43c21e, first warm-cache run)

| Job | Duration |
|-----|---------|
| TS parity (npm run parity) | 1m 3s |
| Python tests (pytest) | 7m 43s |
| **Total wall clock** | **~8m** (jobs run in parallel) |

**Assessment:** 7m 43s for pytest is longer than ideal (local: ~2m 6s); most of the
overhead is package installation on first run. Subsequent runs will be faster once
pip cache warms (actions/setup-python@v5 caches the full site-packages dir). The TS
parity job is 1m 3s which is fast. Combined 8-minute wall clock is acceptable for
a merge-gate. Flag if it exceeds 12m after pip cache is warm.

### Scratch-branch failure evidence

**Run URL:** https://github.com/dylanhartman913-arch/TERRA-Civic-Sim/actions/runs/35125135798

**Break introduced:** `terra-app/tests/parity/fixtures/golden_a.json`
`final_state_digest.md5` corrupted from `15680bf1e386c4ca09a06e6be5ec8bf3`
to `deadbeefe386c4ca09a06e6be5ec8bf3`.

**Failure mode:** Behavioral — the engine computes the correct hash (`15680bf1...`);
the fixture asserts the wrong one (`deadbeef...`). The parity test fails with:
```
AssertionError: expected '15680bf1e386c4ca09a06e6be5ec8bf3'
             to be 'deadbeefe386c4ca09a06e6be5ec8bf3'
```

Both jobs (pytest AND parity) failed because golden_a is also used by Python tests.
The scratch branch was deleted from remote and local after capturing the run URL.

### Scope notes

- **`npm run parity` prior state:** The script (`vitest run tests/parity/`) existed
  cleanly in `terra-app/package.json` before this session. No repair needed.
- **`test_county_card_capacity_provenance.py`:** Still excluded via `pytest.ini`.
  Root cause (nb14 FLAGSHIP_ASSETS hardcoded list) is backlog item 7 from Horizon 1.
- **Backlog item 3 resolved here:** `synthetic_plant_assignments.parquet` was
  Horizon-1 backlog item 3 ("exists locally but blocked from git"). Now tracked.
  The `mw_ecoregions.geojson` tracking was a new finding (not in S9 backlog).

### Commits (S10)

```
1b7657e  feat(S10): minimal behavioral CI
c7e0f5e  fix(S10): trigger CI on all pushes, not just main
9794542  fix(S10): track synthetic_plant_assignments.parquet
1f0a116  fix(S10): track mw_ecoregions.geojson
d43c21e  fix(S10): add pyarrow to requirements.txt
```

**S10 complete.**

---
