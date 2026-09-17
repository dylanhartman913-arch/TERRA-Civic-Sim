# W7 Audit Follow-On — State of the Program, Pipeline Map, and Path Forward

**Checked:** `~/projects/Energy Modeling/energy-map`, `main` @ `a46d22f`, on 2026-09-11
**Builds on:** `claude/W7_independent_audit.md` (2026-09-03). Finding numbers continue from that document (F1–F7 there; F8–F13 here).
**Method:** read-only. Git state, file identity, and data contents were checked directly; test suites still could not be executed (the installed `node_modules` are macOS-native binaries and the linked shell is a Linux VM), so every test count remains a claim, not a verification.
**Purpose:** get the program into a state you can describe accurately to an advisor in one sitting, and give you a single map of the data pipelines to hold in your head.

---

## 1. Where things stand, eight days after the audit

Nothing has moved. `main` is still at `a46d22f`, still 88 commits ahead of `origin/main` (last push 2026-07-05), `.github/` still does not exist, `.env` is still the 2026-08-10 key, and every file the audit listed as untracked is still untracked. F1 re-verified directly today:

| Anchor | `data/processed/` (Python) | `terra-app/src/data/` (TypeScript) |
|---|---:|---:|
| Dave Johnston Power Plant | **762** | 816.7 |
| Meta AI Data Center (Cheyenne) | **100** | 152 |
| Jade/Crusoe Campus Phase 1 | **200** | 1800 |

So the audit's §5 opening checklist is still the correct first hour of work. What follows is what the audit did not cover, most of which surfaced from looking at the folder as a whole rather than at the handoff report's claims.

---

## 2. New findings

### F8 — An engine bug fix has sat uncommitted in `main`'s working tree for a month

Four files carry modifications dated 2026-08-11 14:58: `terra-app/src/engine/replay.ts`, `session_drought.ts`, `state/store.ts`, and `tests/parity/fixtures/golden_ranch_country_2040.json`. The Extended Build session log, `interrupted_build_status.md`, and the W7-0 merge each note these files and each explicitly declines to touch them ("stashed during verification … restored as uncommitted modifications … unclaimed by this merge"). Three sessions have stepped around them; none has evaluated them.

They are not scratch. The fixture's own embedded note explains what they fix: `applySessionDrought` ran *after* `engineAdvanceYear`, so `advanceCountyAg` recorded its trajectory snapshots before drought events existed. The consequence is that the drought-enabled `ag_digest` in the Ranch Country 2040 golden was **identical to the energy-only digest** — the drought pathway that AG4's gate ("seeded drought … replay to matching digest, all five contracts") was meant to certify was a no-op. The fix moves drought sampling before the year advance with `targetYear = state.year + 1`, and the fixture's `ag_digest_md5` changes from `756ec0d2…` to `0c537942…`.

This is a good fix stuck in limbo, and it raises a question the fix's author did not answer: session drought is applied in the TypeScript replay/store layer, so there is no Python counterpart to keep in parity. Either that is by design (session config is an app concern) and should be stated in the digest registry, or the Python `advance_year` path has the same ordering issue for any drought it applies and the cross-runtime comparison in Wave 7's Stage B2 will surface it.

**Close it by:** treating it as a ticket (W7-0.2), not a stash. Confirm the ordering claim with `ag4-session-drought.test.ts` and the Ranch Country golden, decide the Python-side question, write the build-log entry, commit. If it cannot be evaluated this month, put it on a branch so `main`'s tree is clean — a dirty tree is what made the Extended Build stash-and-restore dance necessary in the first place.

### F9 — The pipeline that produced the runtime data is no longer in the repo

Commit `35120e7` (2026-07-20, "remove superseded pre-pivot energy-map notebooks/src") deleted 35 notebooks from `main` — 01 through 13, 15 through 19, 22, 23, 23b, plus the E4ST upgrade roadmap and three `src/` modules — as pre-pivot debris (01, 03a, and the `src/` modules were re-added later; twelve notebooks are tracked today). But `data/README.md` still presents the full 01→19 execution order as the way to regenerate the derived outputs, and several of the deleted notebooks are the *only* generators of data both engines load today:

| Deleted notebook | Still-loaded output it produces |
|---|---|
| `08b_ees_baseline.ipynb` | `county_ees_baseline.json` / `mw_county_ees_summary.csv` (county E/Ec/S — the F2 baseline) |
| `08c_spatial_hierarchy.ipynb` | `county_crosswalk.parquet`, spatial hierarchy parquets |
| `07_synthetic_topology.ipynb` | `initial_network.json`, `synthetic_buses/branches.geojson` |
| `15_action_library_v3.ipynb` | `mw_action_library_v3.json` (now v3.3, 55 actions) |
| `17/18/18b` fiscal notebooks | `wy_county_fiscal_baseline.json`, `wy_fiscal_coefficients.json` |
| `22_anchor_facilities.ipynb` | `mw_anchor_facilities.geojson` (the F1 file) |
| `10_eia860_retirements.ipynb` | `baseline_retirements.json` (the Jim Bridger 6204→8066 file) |
| `16/19` golden notebooks | Golden A–D fixtures |

The immediate consequence is that the audit's F2 fix — "re-run `08b_ees_baseline.ipynb`" — names a notebook that does not exist on `main`. The notebooks survive in git history (`git show 35120e7^:notebooks/08b_ees_baseline.ipynb`) and in the 18 stale worktrees, so nothing is lost. But "the data can only be regenerated from a notebook you have to know to dig out of a deletion commit" is the state a reviewer or advisor would most want to know about, and it is the opposite of what `data/README.md` says.

Compounding this: `data/processed/*` is gitignored with 27 explicit exceptions, so roughly 50 processed files exist only on this disk — `network_metadata.json`, `mw_ecoregions.geojson`, `mw_study_counties.csv`, `power_plants_with_ba.geojson`, `spatial_hierarchy_*.parquet`, every E4ST result, every `mw_scenario_profiles` input — with no tracked generator and no manifest hash.

**Close it by:** splitting `35120e7`'s deletion into two classes. Reinstate (via `git checkout 35120e7^ -- notebooks/<name>`) every notebook that generates a file currently loaded by either runtime, and leave archived the pure-visualization notebooks (`06_lmp_map`, `07_dispatch_viz`, `09_lmp_comparison` at 19k lines, `11b_scenario_map`, etc.). Then make `data/README.md` true: a table of *loaded runtime file → generator → tracked?* rather than a 19-step run order nobody can execute. The Wave 7 P1 provenance manifest is the right home for the hashes.

### F10 — `network_metadata.json` has been overwritten

Every roadmap describes this file as the project's shared memory: "read first by every notebook and Julia script … accumulates one key per structural decision … by the end it is the skeleton of the methods section." Today it contains exactly one key, `mc_sensitivity`, and is dated 2026-07-31 18:03 — the Monte Carlo / magnitude-sweep session. The MC runner wrote it fresh instead of updating it. Because the file is gitignored and no worktree carries `data/processed/`, no other copy exists in the project folder. (Worth checking: Time Machine, and the `~/energy-map` two-notebook stub the audit mentioned.)

The structural decisions themselves are not lost — `TERRA_methods_overview.md` was compiled from the notebooks and records the parameter values (α = 0.45, 400 km prune, 1.25 headroom, P50 accept 110 km, 16 representative hours, 7% DR, etc.). But the machine-readable record is gone, and any script that still reads it for `island_filter_min_nodes`, `total_buses`, or the county-pivot block will get `KeyError`.

**Close it by:** rebuilding it as a tracked file (`data/processed/network_metadata.json` gets a gitignore exception, or it moves to `data/manifest/`) from the methods overview plus the outputs that still exist (`synthetic_topology_validation.json` carries the topology numbers). Then fix `mc_full_run.py` / `18_magnitude_sweep.ipynb` to merge, not replace. This should be part of the W7-2 manifest ticket — a metadata file that is *both* the methods skeleton and unversioned is a single point of failure that already failed.

### F11 — Eighteen stale worktrees, one unmerged branch

`git worktree list` shows 19 worktrees, 18 marked `prunable`, plus `/private/tmp/energy-map-w7-0`. Every worktree branch except one is fully merged into `main`. The exception is `w4-c5a-ui` (1 commit ahead: "C5a climate UI components", 14 files) — superseded by T6/C5b per `Wave4_closeout_amendment_C5a.md`, so it is safe to archive as a tag rather than a branch. Each worktree directory is a full checkout including `node_modules`; they are the reason the parent folder looks like 20 copies of the project, and they are where a future session will accidentally pick up a stale notebook.

**Close it by:** `git worktree prune`, delete the directories, `git branch -d` the merged branches, `git tag archive/w4-c5a-ui w4-c5a-ui` before deleting that one. The Wave 4–6 pattern of one worktree per ticket was the right call while parallel builders were active; it has no reason to persist through a single-operator hardening wave.

### F12 — Documentation lives in four places with no canonical one

Roadmaps and logs are spread across the repo root (`Wave4_roadmap.md`, `Wave7_roadmap.md`, `Wave 2-6 Roadmaps.md`, `TERRA Build Summary W0 X3.md`, `TERRA_county_app_roadmap.md`, `interrupted_build_status.md`, `SESSION_LOG_extended_build_001.md`), `docs/orchestration/` (Wave 4 closeout, Wave 5 roadmap), `build_log/wave{4,5,6}/`, `terra-app/TERRA_build_log.md` (3,400 lines), and the Claude project (48 docs, several of which are copies of the above at different vintages). `TERRA_master_plan.md`, which the climate roadmap cites for the "District Atlas" and Ruckelshaus-workshop framing, exists in none of these places. Also stray at root: `package-lock.json` (untracked, no `package.json` beside it), `run_cells.py`, `build_nb16.py`, `generate_golden_e.py`, two `.jsx` prototypes from May.

This is exactly the consolidation W7-3 was scoped for, so the finding is really a scoping note: W7-3 should consolidate *documents*, not only rules. A `docs/` tree with `roadmaps/`, `closeouts/`, `session_logs/`, `methods/`, and one `PIPELINES.md` (see §3) is enough.

### F13 — The audit's own numbers need two small corrections

The audit says the app simulates a "46-action" library (from the methods overview) and the build summary says 49. The shipped `action_library_v3.json` is **schema 3.3 with 55 actions** (24 energy infrastructure, 14 ecological restoration, 12 settlement/social, 4 agriculture, 1 climate adaptation) and 22 disturbances. Separately, `data/README.md` describes a "293-county study area" for `mw_county_cards.json`; the file has 157 records, matching `mw_study_counties.csv` and the EES summary. 293 was the pre-pivot spatial-hierarchy superset. Both are documentation drift of the F7 kind, worth fixing in the same pass.

---

## 3. The pipeline map

This is the section to internalize before the pitch. TERRA is not one pipeline; it is nine, with different owners, freshness, and reproducibility status. Each row names the generator, the runtime file it produces, and where it stands today.

| # | Pipeline | Generator(s) | Key runtime outputs | On `main`? | Status today |
|---|---|---|---|---|---|
| A | **Generator inventory & provenance** | `notebooks/01_eia_pull.ipynb` → `data/staging/` sidecar; `scripts/provenance_diff.py`; `scripts/match_generator_anchors.py`; `scripts/build_generator_attribution.py` | `power_plants_with_ba.geojson`, `generators_with_costs.parquet`, anchor match/attribution audit CSVs | Yes | **Current.** Pinned at 25,868 records with SHA-256. Drift gate is a tautology (F6). |
| B | **Synthetic network & E4ST** | 02, 03, 03a/b, 04, 07, 08, 10–13 (deleted in `35120e7`); `julia/build_*_case.jl`, `run_scenario.jl` | `initial_network.json` (500 buses / 818 edges), `synthetic_buses/branches.geojson`, `e4st_results_v2/`, `baseline_retirements.json` | Notebooks: no. Julia: yes. Outputs: partly | **Frozen since spring.** Legitimately so — this layer's job was to produce the network and the four E4ST oracle scenarios, which are done. But it cannot be re-run from `main`. |
| C | **EES capital baseline** | 08a (tracked), 08b, 08c (deleted), `14_county_foundation.ipynb` (tracked) | `county_ees_baseline.json` / `mw_county_ees_summary.csv` (157 counties), `county_crosswalk`, `county_cards.json` | Partly | **Stale (F2).** Built 2026-06-10 on the truncated 15,034-record inventory; never rebuilt after the pagination repair. Slope mismatch 11.8%. |
| D | **Action library & material coefficients** | 15 (deleted), `scripts/build_action_library_v2.py`, `26_ag_action_family.ipynb` (tracked) | `action_library_v3.json` (v3.3, 55 actions, 22 disturbances), `material_coefficient_sources.csv`, `lifecycle_coefficients.json` | Partly | Current content, but v3.0→3.3 evolution happened across notebooks, scripts, and hand edits; no single regenerator. |
| E | **Wyoming fiscal ledger** | 17, 18, 18b (deleted); `pull_housing_baseline.py` | `wy_county_fiscal_baseline.json`, `wy_fiscal_coefficients.json`, `county_housing_baseline.json` | Outputs yes, generators no | Current (2026-07-03 vintage). Four MANUAL_FETCH items still outstanding (ONRR, DOR commodity split, severance, WY LSO school finance); ~44% of source rows `confidence: low`. |
| F | **Anchor facilities & exposure tags** | 22 (deleted); `scripts/match_generator_anchors.py`; W7-0 hand corrections | `mw_anchor_facilities.geojson`, `asset_exposure_tags.json`, `anchor_sector_taxonomy.json` | Outputs yes, generator no | **Forked (F1).** App copy corrected by W7-0; Python copy still carries 762/100/200. |
| G | **Climate & hazards** | `23c_cmip6_acquisition.ipynb`, `24_hazard_exposure_baseline.ipynb` (both tracked); `src/climate_couplings.py`, `src/hazard_events.py` | `county_climate_baseline.json`, `county_climate_projections.json`, `nri_wrc_county_hazard_summary.csv`, MTBS burned acres | Yes | Current; tested (exogeneity + purity suites). The best-provenanced pipeline in the repo. |
| H | **Agriculture** | `25_wy_ag_baseline_pull.ipynb`, `26_ag_action_family.ipynb` (tracked); `scripts/build_county_ag_engine_baseline.py` | `wy_county_ag_baseline.json`, `wy_county_ag_engine_baseline.json`, `wy_grazing_allotments.csv`, `wy_ag_sources.csv` | Yes | Current; Golden N frozen. Drought coupling has the F8 ordering fix pending. D5 rancher/Extension domain review never happened (carried into W7-4). |
| I | **Engine, goldens & analytics** | `src/terra_engine.py` ↔ `terra-app/src/engine/`; `scripts/generate_golden_{h,k}.py`; 16/19 (deleted); `19_temporal_trajectory.ipynb`; `15_coefficient_monte_carlo.ipynb`, `18_magnitude_sweep.ipynb`, `mc_full_run.py` (untracked) | Goldens A–N + Ranch Country 2040 (5 digest contracts), `trajectory_results.csv`, `mc_validation_priority.csv`, `sweep_cost_ranking_sourced.csv` | Engine yes; MC/sweep no | Parity claimed 228/228 Python, 393/393 TS, 351/351 cross-runtime — **unverified** since no session has run them since 2026-08-12. All MC/trajectory results were computed against the stale C baseline. |

Three things fall out of the table. First, pipelines A, G, and H — the ones built after the program adopted provenance discipline — are in good shape; the older pipelines B–F carry the debt. Second, the fork in F and the staleness in C are both *promotion* failures (a corrected upstream never re-flowed downstream), which is the same failure class as every item in the audit, and it argues that the manifest-plus-CI work of W7-2 matters more than any new feature. Third, the dependency chain for fixing F2 runs A → C → I: promote the pinned inventory into a rebuilt EES baseline, promote that into both runtimes, refresh goldens, re-run trajectory and MC. That is one session if 08b is reinstated first.

---

## 4. Path forward

The audit's priority order (harden, then transmission, then wildlife/siting and workforce) stands. What changes is the framing of the next two to three weeks, because you now have a second goal — an advisor conversation — that wants a *legible* program more than a *bigger* one. Three horizons.

### Horizon 1 — Make the repo tell the truth (1–2 sessions, before the pitch)

This is the audit's §5 checklist plus F8–F12, sequenced so nothing is lost and nothing is built on sand.

1. **Safety.** `git add` the untracked governing docs and MC notebooks; commit. Rotate the EIA key; `git reflog expire --expire-unreachable=now --all && git gc --prune=now`. Push the 88 commits. Until this is done, the program has one copy.
2. **Clean the tree.** Decide F8 (evaluate and commit as W7-0.2, or branch it). Prune the worktrees; tag `w4-c5a-ui`; delete the directories. Move the root-level strays.
3. **Reinstate the generators.** Restore from `35120e7^` the notebooks in F9's table. Rebuild `network_metadata.json` as a tracked file (F10).
4. **Fix F1** (three values, ten minutes) and confirm byte identity across the two anchor files.
5. **Fix F2.** Re-run 08b/14 on the pinned inventory, promote to both runtime paths, refresh goldens under before/after discipline, re-run `19_temporal_trajectory`. Then, and only then, re-run the Monte Carlo.
6. **Write `docs/PIPELINES.md`** from §3 above, with the runtime-file → generator → tracked? → last-built table, and correct `data/README.md` (157 counties, 55 actions, honest run order). This is also your own study guide for the pitch.

At the end of Horizon 1 you can say to an advisor, truthfully: every number the app shows traces to a tracked generator or a hashed manifest entry, and the corrected inventory flows to both runtimes.

### Horizon 2 — Wave 7 as scoped, with the audit's amendments plus two more (3–5 sessions)

Run W7-1 through W7-6 as the roadmap specifies, with the audit's 1a/1b/1c amendments (remediation before CI; dual-path byte-identity check; loaded-baseline slope check in P3). Add:

- **W7-2 owns `network_metadata.json` and the processed-file manifest** (F10, F9). The manifest lists every runtime-loaded file with its generator and hash, and CI fails if a loaded file has no manifest entry.
- **W7-3 consolidates documents, not just rules** (F12). One `docs/` tree; the Claude project keeps pointers, not copies.
- **W7-4's D5 domain review** is the single highest-credibility item still open: a rancher or Extension agent looking at the forage numbers. If the advisor you are pitching has regional or ag-economics connections, this is a concrete, bounded ask.

CI can be modest. A GitHub Actions workflow that runs `pytest` and `npm run parity` on push, plus the dual-path identity check and the manifest hash check, closes F3, F1's recurrence class, and F6 together. It does not need to be the full six-check contract on day one.

### Horizon 3 — The next competing claimant (after Wave 7 closes)

The audit's Priority 2 (transmission and interconnection headroom) remains the right next plugin, for the doctrinal reason the roadmap gives — megawatts should not export from nowhere — and for a pitch reason: it is the layer an energy-systems advisor will ask about first, and it reconnects the frozen pipeline B (the synthetic network, the E4ST oracles) to the live county simulator. Two prerequisites are already named: land `500kv_interregional_corridors.csv` in the repo with a provenance sidecar, and make the plugin read from the pinned inventory only. A third, from this review: decide whether pipeline B is *archived* (its outputs are frozen inputs, its notebooks live in `archive/`) or *live* (it gets a manifest entry and can be re-run). Either is defensible; "neither, and the notebooks are in a deletion commit" is not.

### What to ask the advisor for

The pitch document is separate, but the ask should be shaped by what the program actually lacks, and it is not code. The engine, the parity discipline, and the provenance machinery are ahead of the validation. What an advisor with relevant expertise can supply is judgment on: whether the coefficient-based EES and fiscal layers are defensible as a dissertation method or need a formal sensitivity/validation chapter (the MC and magnitude sweep are the start of that); whether the four-scenario E4ST oracle is sufficient grounding for the energy-system claims or whether the capacity-expansion model should be re-run on the corrected inventory; how to design the workshop study (n, protocol, IRB) so the participatory claim has evidence behind it; and which of the three plugin directions best fits a publishable first paper. Those are the four questions to bring.

---

## 5. Opening checklist for the next session

1. `git add` untracked docs + MC notebooks + `src/mc_worker.py`; commit "docs: track governing documents and MC/sweep notebooks".
2. Rotate EIA key → `.env`; reflog expire + gc; verify `b169a18` is gone (`git cat-file -t b169a18` should fail).
3. `git push origin main`.
4. Evaluate F8: run `ag4-session-drought.test.ts` with and without the modifications; commit or branch.
5. `git worktree prune`; tag and delete `w4-c5a-ui`; delete merged branches and worktree directories.
6. `git checkout 35120e7^ -- notebooks/08b_ees_baseline.ipynb notebooks/08c_spatial_hierarchy.ipynb notebooks/07_synthetic_topology.ipynb notebooks/15_action_library_v3.ipynb notebooks/17_wy_fiscal_pull.ipynb notebooks/18_fiscal_coefficients.ipynb notebooks/18b_school_finance_patch.ipynb notebooks/22_anchor_facilities.ipynb notebooks/10_eia860_retirements.ipynb notebooks/16_engine_v2_golden.ipynb notebooks/19_engine_fiscal_golden.ipynb`; commit.
7. Fix F1 in `data/processed/mw_anchor_facilities.geojson`; `shasum -a 256` both copies; commit.
8. Rebuild `network_metadata.json`; add gitignore exception; commit.
9. Fix F2 (08b → 14 → promote → goldens → trajectory); commit under before/after discipline.
10. Write `docs/PIPELINES.md`; correct `data/README.md`; commit.
11. Start W7-1.

*Nothing in the repository was modified by this review.*
