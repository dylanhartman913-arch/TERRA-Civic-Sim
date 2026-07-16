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

*(Filled in below as worktrees are created.)*

### Reference tracked-file count (main @ 2690964)

```
$ git ls-files | wc -l
316
```

### git worktree list (at P0 close)

*(See §5 below.)*

---

## 5. Stage-0 baseline run — w5-verify

*(Filled in below after worktree provisioning and data copy.)*

---

## 6. P0 dispatch gate

| gate | status |
|------|--------|
| Repo on non-synced storage confirmed | ✓ |
| Baseline SHA documented (2690964) | ✓ |
| C5a status: CHANGES REQUIRED, FU-1–FU-6 open, ede5149 preserved | ✓ |
| C4-ii: explicitly deferred (T5, not dispatched this phase) | ✓ |
| Orchestration docs committed to docs/orchestration/ | pending |
| Four w5-* worktrees provisioned with evidence | pending |
| Stage-0 baseline run in w5-verify | pending |
| D1–D4 appended to TERRA_build_log.md | pending |
