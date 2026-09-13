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
