# Wave 5 — P0 Setup Record

Generated: 2026-07-16
Author: Sonnet PM (Wave 5 P0 session)

---

## 1. Repo location — cloud-sync check

**Command:** `pwd`

**Output:**
```
/Users/dylanhartman/projects/Energy Modeling/energy-map
```

**Verdict: CLEAN.** Path is under `~/projects/`, not inside any cloud-sync
folder (OneDrive, iCloud Drive, Dropbox, Google Drive). Wave 4's dominant
failure mode (running worktrees from OneDrive-synced storage causing
`TimeoutError: [Errno 60]` on file reads during pytest) does not apply here.

---

## 2. Baseline SHA confirmation

**HEAD at session start:** `269096493f015a1a5295d9b2ba53c09fad219f5a` (`2690964`)

**Commit message:** `Merge w4-c4-engine: C4-i climate hazard event layer (PASS WITH FOLLOW-UP)`

This is the correct Wave 5 baseline — main after merging both C4-i and H1.

| lane | branch | SHA | status |
|------|--------|-----|--------|
| C4-i (climate event layer) | merged to main | `2690964` | ON MAIN |
| H1 (housekeeping bundle) | merged to main | `2690964` | ON MAIN |
| C5a (climate UI) | `w4-c5a-ui` | `ede5149` | NOT ON MAIN — gate CHANGES REQUIRED, FU-1 through FU-6 open |
| C4-ii (consequence coupling) | never dispatched | — | DEFERRED to Wave 5 T5 (not this phase) |

---

## 3. Untracked runtime dependencies — inherited from Wave 4

The following files are required by the Python test suite but are not tracked in
git (carried forward from Wave 4 P0 §4 and post-close addendum):

```
data/processed/mw_ecoregions.geojson           (11 MB — OneDrive-incompatible at tracked size)
data/processed/county_crosswalk.parquet
data/processed/generators_with_costs.parquet
data/processed/spatial_hierarchy_counties.parquet
data/processed/spatial_hierarchy_huc8.parquet
data/processed/synthetic_plant_assignments.parquet
```

**Remediation:** `scripts/provision_worktree.sh <worktree-path>` (added to main
in `6c4283a`) copies all six files from main's `data/processed/` into a target
worktree. Run this for every w5-* worktree that will execute Python tests.

---

## 4. Worktree provisioning evidence

### Reference tracked-file count (main @ 9883f85, post-P0-commit)

```
$ git -C energy-map ls-files | wc -l
316      ← pre-P0 (2690964)
319      ← post-P0 commit 9883f85 (+3 new files: build_log/wave5/_setup.md,
           docs/orchestration/Wave4_closeout_report.md,
           docs/orchestration/Wave5_roadmap.md)
```

All four w5-* worktrees are at `9883f85` (current main HEAD). The P0 commit added
the orchestration docs so every worktree can read them from disk.

### git worktree list (at P0 close)

```
/Users/dylanhartman/projects/Energy Modeling/energy-map                 9883f85 [main]
/Users/dylanhartman/projects/Energy Modeling/c2-data                    376b16b [c2-data]
/Users/dylanhartman/projects/Energy Modeling/c3-engine-lock             68f8265 [c3-engine-lock]
/Users/dylanhartman/projects/Energy Modeling/energy-map-c2-merge        933fbf7 [c2-merge]
/Users/dylanhartman/projects/Energy Modeling/energy-map-f1-engine-lock  0acc6ff [f1-engine-lock]
/Users/dylanhartman/projects/Energy Modeling/energy-map-f3-ui-pins      da016e0 [f3-ui-pins]
/Users/dylanhartman/projects/Energy Modeling/f2-facility-ui             cddb7d9 [f2-facility-ui]
/Users/dylanhartman/projects/Energy Modeling/w4-c4-engine               41e961e [w4-c4-engine]
/Users/dylanhartman/projects/Energy Modeling/w4-c5a-ui                  ede5149 [w4-c5a-ui]
/Users/dylanhartman/projects/Energy Modeling/w4-h1-housekeeping         d4c5408 [w4-h1-housekeeping]
/Users/dylanhartman/projects/Energy Modeling/w4-verify                  d5ea940 [w4-verify]
/Users/dylanhartman/projects/Energy Modeling/w5-engine                  9883f85 [w5-engine]
/Users/dylanhartman/projects/Energy Modeling/w5-notebook                9883f85 [w5-notebook]
/Users/dylanhartman/projects/Energy Modeling/w5-ui                      9883f85 [w5-ui]
/Users/dylanhartman/projects/Energy Modeling/w5-verify                  9883f85 [w5-verify]
```

### Per-worktree disk usage + tracked file count

```
$ du -sh w5-engine w5-ui w5-notebook w5-verify
124M    w5-engine
124M    w5-ui
124M    w5-notebook
124M    w5-verify

$ git ls-files | wc -l  (run in each)
w5-engine:   319
w5-ui:       319
w5-notebook: 319
w5-verify:   319
```

All four match the post-P0 reference count (319). Worktrees are READY.

### w4-c5a-ui preservation check

```
w4-c5a-ui @ ede5149 [w4-c5a-ui]  — preserved, not modified
```

### Node modules and data file provisioning

- `terra-app/node_modules` in `w5-verify` symlinked to main worktree's `node_modules`.
  (Same pattern as Wave 4 worktrees — symlink is git-ignored, not committed.)
- Node modules were clean-reinstalled (`rm -rf node_modules && npm install`) after
  discovering corrupted picomatch/estraverse packages. This is a pre-existing
  environment issue; clean install resolved it for the Stage-0 run.
- `scripts/provision_worktree.sh ../w5-verify` ran; missing files not in main's
  `data/processed/` (deleted from tracked but needed at runtime) sourced from
  `w4-h1-housekeeping/data/processed/`:
  - `mw_ecoregions.geojson` — copied manually
  - `county_crosswalk.parquet` — copied manually
  - `generators_with_costs.parquet` — copied manually
  - `spatial_hierarchy_counties.parquet` — copied by script
  - `spatial_hierarchy_huc8.parquet` — copied by script
  - `synthetic_plant_assignments.parquet` — copied by script

**Provision script note:** `scripts/provision_worktree.sh` only finds files present
in the main working tree's `data/processed/`. Because the gitStatus shows these
files as deleted in the main working tree (they exist in the git object store at
2690964 but are not materialized on disk), the script must be extended to source
from a worktree where they are present (e.g., `w4-h1-housekeeping`). This is a
known limitation to document for T1–T5 dispatch.

---

## 5. Stage-0 baseline run — w5-verify @ 9883f85

**Date:** 2026-07-16
**Worktree:** `/Users/dylanhartman/projects/Energy Modeling/w5-verify`
**Branch:** `w5-verify`
**SHA:** `9883f85`

### TypeScript build (`tsc -b`)

```
Exit code: 2 — pre-existing errors

src/ui/map/AnchorFacilityLayer.tsx(5,34): error TS2307: Cannot find module '@deck.gl/layers'
src/ui/map/AnchorFacilityLayer.tsx(87,24): error TS7006: Parameter 'anchor' implicitly has an 'any' type
src/ui/map/AnchorFacilityLayer.tsx(88,22): error TS7006: Parameter 'anchor' implicitly has an 'any' type
src/ui/map/AnchorFacilityLayer.tsx(89,25): error TS7006: Parameter 'anchor' implicitly has an 'any' type
src/ui/map/AnchorFacilityLayer.tsx(91,25): error TS7006: Parameter 'anchor' implicitly has an 'any' type
src/ui/map/AnchorFacilityLayer.tsx(93,20): error TS7006: Parameter 'info' implicitly has an 'any' type
vite.config.ts(1,30): error TS7016: Could not find a declaration file for module 'vitest/config'
vite.config.ts(7,3): error TS2353: Object literal may only specify known properties, 'name' does not exist
vite.config.ts(8,13): error TS7006: Parameter 'code' implicitly has an 'any' type
vite.config.ts(8,19): error TS7006: Parameter 'id' implicitly has an 'any' type
```

Same errors present in main worktree — pre-existing, not introduced by P0 commit.

### ESLint (`npm run lint`)

```
✖ 71 problems (64 errors, 7 warnings)
  2 errors and 2 warnings potentially fixable with the --fix option.
```

**This is T2's starting lint baseline: 64 errors / 7 warnings.**
T2 may not increase this count; may only decrease or hold.

### TypeScript vitest (`npm test -- --run`)

```
 RUN  v4.1.8 /Users/dylanhartman/projects/Energy Modeling/w5-verify/terra-app

 Test Files  30 passed (30)
      Tests  345 passed (345)
   Start at  18:02:38
   Duration  2.02s (transform 1.27s, setup 0ms, import 2.54s, tests 8.59s, environment 2ms)
```

All 345 TS tests pass. No failures.

### Python pytest (`pytest tests/ -q`)

```
168 passed in 74.24s (0:01:14)
```

All 168 Python tests pass. No failures, no errors, no skips.

### Combined Stage-0 baseline summary

| suite | pass | fail | total | note |
|-------|------|------|-------|------|
| TS vitest | 345 | 0 | 345 | All green — T2 may not reduce this count |
| Python pytest | 168 | 0 | 168 | All green |
| **combined** | **513** | **0** | **513** | |
| tsc -b | — | 10 errors | — | Pre-existing (AnchorFacilityLayer + vite.config) |
| eslint | — | 64 errors / 7 warn | — | Pre-existing — T2 starting baseline |

Delta vs. Wave 4 P0 baseline (d5ea940):
- TS: 319 → 345 (+26 tests from C4-i and H1)
- Python: 159 → 168 (+9 tests from C4-i and H1)
- Golden B timing failure: **resolved** (H1.2 — converted to non-timing assertion)
- tsc errors: changed (H1 resolved the TS6196/TS2352 errors; AnchorFacilityLayer
  @deck.gl/layers error is a different pre-existing issue now surfaced)

---

## 6. P0 dispatch gate

| gate | status |
|------|--------|
| Repo on non-synced storage confirmed | ✓ |
| Baseline SHA documented (2690964 / 9883f85 post-P0) | ✓ |
| C5a status: CHANGES REQUIRED, FU-1–FU-6 open, ede5149 preserved | ✓ |
| C4-ii: explicitly deferred (T5, not dispatched this phase) | ✓ |
| Orchestration docs committed to docs/orchestration/ (9883f85) | ✓ |
| Four w5-* worktrees provisioned with evidence | ✓ |
| Stage-0 baseline run in w5-verify: 345 TS / 168 Python, all green | ✓ |
| D1–D4 appended to TERRA_build_log.md | ✓ |
