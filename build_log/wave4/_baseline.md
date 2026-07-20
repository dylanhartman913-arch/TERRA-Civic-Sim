# Wave 4 — P0 Baseline Record

Generated: 2026-07-15  
Author: Sonnet PM (P0 session)

---

## 1. Baseline SHA reconciliation

| label | SHA | commit message |
|-------|-----|----------------|
| Roadmap-stated baseline | `6fd35bf` | Merge f3-ui-pins: TERRA UI F3 — sub-county pin placement (engine-inert) |
| Actual Wave 4 baseline | `d5ea940` | P0.1b — Un-track mw_ecoregions.geojson (OneDrive sync conflict) |

### Why these differ

The Wave 4 roadmap was authored with `6fd35bf` (post-F3 merge) as the intended
starting point. Between `6fd35bf` and `d5ea940`, two final Wave 3 sessions landed
on main — C2-data and C2-merge — followed by two P0 housekeeping commits:

```
6fd35bf  Merge f3-ui-pins (Wave 3 / UI work — roadmap baseline)
  │
  ├─ 68f8265  TERRA engine v4.4 — C3 Climate Coupling I + Golden L   ← Wave 3 session
  ├─ ea6e281  Merge c3-engine-lock                                    ← Wave 3 merge
  ├─ bbd1bf0  TERRA UI F2 — anchor facility layer + economy card       ← Wave 3 session
  ├─ a31e3fb  Merge f2-facility-ui                                     ← Wave 3 merge
  ├─ d63fdd2  C2-data: hazard exposure baseline — NRI/WRC tagging      ← Wave 3 session
  ├─ b46f7a7  Merge c2-data: C2 Hazard Exposure Baseline + NRI/WRC    ← Wave 3 merge (C2-data)
  ├─ 933fbf7  TERRA engine v4.4 — C2-merge: exposure tag integration  ← Wave 3 session
  ├─ 99ca20f  Merge c2-merge: TERRA engine v4.4 Exposure Tag Registry ← Wave 3 merge (C2-merge)
  ├─ 324023f  Add C1 climate projection acquisition notebooks          ← C1.6 data artefacts
  ├─ 8ce1118  Fix test count baseline in C2-merge build log entry
  ├─ 626ed95  P0.1 — Track data/processed build deliverables          ← this session
  └─ d5ea940  P0.1b — Un-track mw_ecoregions.geojson                  ← this session (HEAD)
```

C2-data (NRI/WRC hazard tagging, 682 assets) and C2-merge (engine v4.4 exposure
tag registry) were the final two Wave 3 delivery sessions. They were already
merged to main when the Wave 4 roadmap P0 session began. The roadmap SHA is
stale; `d5ea940` is the authoritative Wave 4 starting point.

---

## 2. Golden-letter collision check

| golden | fixture file | introduced | last touched | C2-merge touches it? | status |
|--------|-------------|------------|-------------|----------------------|--------|
| A–F | `golden_a.json` … `golden_f.json` | Engine v1–v3 | pre-C2 | no | unchanged |
| G, G′ | `golden_g.json`, `golden_g_prime.json` | F1 (engine v4.3) | `0acc6ff` | no | unchanged |
| H | `golden_h.json` | F1 | `0acc6ff` | no | unchanged |
| I | `golden_i.json` | F1 | `0acc6ff` | no | unchanged |
| J, J′ | `golden_j.json`, `golden_j_prime.json` | F1 | `0acc6ff` | no | unchanged |
| **K** | `golden_k.json` | **F1 — anchor lifecycle** (`0acc6ff`) | `0acc6ff` | **no** | **intact** |
| **L** | `golden_l.json` | **C3 — demand fork** (`68f8265`) | `68f8265` | **no** | **intact** |
| **M** | _(not yet created)_ | — | — | n/a | **open for C4-ii** |

Verification: `git show 933fbf7 --stat | grep golden_[klm]` returns empty — the
C2-merge engine commit touched no golden fixtures. K and L are byte-identical to
their F1/C3 origins. M namespace is clean.

---

## 3. Exposure-tag registry format check (C4-ii readiness)

**File:** `terra-app/src/data/asset_exposure_tags.json`  
**Schema version:** `C2-data-hazard-exposure-tags-v1`  
**Asset count:** 682  
**Complete tag coverage:** 100% (`complete_tag_coverage: 1.0`)

### Top-level structure

```json
{
  "schema_version": "C2-data-hazard-exposure-tags-v1",
  "generated_at": "...",
  "asset_count": 682,
  "complete_tag_coverage": 1.0,
  "tier2_anchor_complete_coverage": true,
  "class_defaults": { ... },
  "assets": [ ... ]
}
```

### Per-asset entry shape (sample: `eia860_467_08019`, Cabin Creek)

```json
{
  "asset_id": "eia860_467_08019",
  "asset_key_type": "anchor_id",
  "asset_class": "generator",
  "name": "Cabin Creek",
  "geoid": "08019",
  "tier": 2,
  "tags": {
    "wildfire_exposure": {
      "value": "high",
      "source": "USFS WRC county risk rank + FEMA NRI county context",
      "method": "study-county tertiles; WRC primary, NRI fallback",
      "confidence": "medium",
      "judgment_call": false
    },
    "water_dependency": {
      "value": "dry",
      "source": "asset technology/name/class rules",
      "method": "wet for hydro/thermal/known wet-cooled; dry by default",
      "confidence": "medium",
      "judgment_call": true
    },
    "flood_zone": {
      "value": "not_screened_or_low_county_context",
      "source": "FEMA NRI IFLD_RISKS",
      "method": "county inland-flood risk top-tertile context screen",
      "confidence": "low",
      "judgment_call": true
    },
    "heat_sensitivity": {
      "value": "low",
      "source": "FEMA NRI HWAV_RISKS + C1.6 climate context",
      "method": "county heat-wave risk tertiles, class escalation for data/commercial",
      "confidence": "medium",
      "judgment_call": false
    }
  },
  "judgment_flags": [...]
}
```

### Tag fields and observed value enumerations (across all 682 assets)

| tag field | values observed |
|-----------|----------------|
| `wildfire_exposure` | `high`, `med`, `low` |
| `water_dependency` | `wet`, `dry`, `none` |
| `flood_zone` | `county_context_high`, `not_screened_or_low_county_context` |
| `heat_sensitivity` | `high`, `med`, `low` |

### Class defaults (6 asset classes with defaults)

`generator`, `mine`, `industrial_load`, `unclassified_anchor`,
`commercial_anchor_load`, `data_center` — each carries the same four tag fields
with class-appropriate default values and the same per-tag object shape
(`value`, `source`, `method`, `confidence`, `judgment_call`).

### C4-ii compatibility verdict: YES

The registry carries per-asset tags keyed by `anchor_id` with `wildfire_exposure`
`high/med/low` values (and the three other hazard dimensions). Each tag object
includes `confidence` and `judgment_call` fields that C4's consequence coupling
can use to weight or suppress triggers. Class-default fallback is present for
non-anchor assets. The `ExposureTagSet` TypeScript interface (added in C2-merge
`types.ts`) and `_apply_exposure_tags()` Python function map directly to this
shape. No schema migration is needed for C4-ii to read and act on these fields.

---

## 4. mw_ecoregions.geojson — runtime dependency and remediation

### Finding

`terra_engine.initialize_state()` opens `mw_ecoregions.geojson` unconditionally
at `src/terra_engine.py:1573`. Every Python test that calls `initialize_state()`
depends on this file being present in `data_dir`.

The file (11 MB) was committed in P0.1 (`626ed95`) but immediately un-tracked in
P0.1b (`d5ea940`) because `git add` of the 11 MB GeoJSON triggered an OneDrive
re-upload that blocked Python's `f.read()` on the file during sync, causing all
`initialize_state()` tests to fail with `TimeoutError: [Errno 60]`.

### What "untracked" means for worktrees

Git worktrees only materialise tracked files. Because `mw_ecoregions.geojson` is
untracked, all four w4-* worktrees received it as absent after `git merge
--ff-only main`. Confirmed by running `pytest -x` in `w4-verify`:

```
FAILED tests/test_c2_exposure_tags.py::TestC2ExposureTags::test_c2a_generator_assets_have_tags
FileNotFoundError: .../w4-verify/data/processed/mw_ecoregions.geojson
```

### Remediation (this session)

Plain file copy from main working tree — not `git add`, not a symlink:

```bash
SRC=".../energy-map/data/processed/mw_ecoregions.geojson"
for w in w4-c4-engine w4-c5a-ui w4-h1-housekeeping w4-verify; do
  cp "$SRC" "../$w/data/processed/mw_ecoregions.geojson"
done
```

Post-copy `pytest` in `w4-verify`: **159 passed** (all green). The file is
`.gitignore`d in all worktrees; it will not appear in `git status` and will not
be committed accidentally.

### Long-term recommendation

Add a `make data` / `scripts/provision_worktree.sh` step that copies the six
untracked-but-required files into a new worktree:

```
mw_ecoregions.geojson            (11 MB GeoJSON, OneDrive-incompatible at tracked size)
county_crosswalk.parquet         (*.parquet global ignore)
generators_with_costs.parquet    (*.parquet global ignore)
spatial_hierarchy_counties.parquet
spatial_hierarchy_huc8.parquet
synthetic_plant_assignments.parquet
```

Without this, any new worktree (or fresh clone) will fail the Python suite on
first run.

---

## 5. Stage-0 baseline test results

Run location: `w4-verify` worktree, HEAD `d5ea940`, post-remediation (all
untracked data files copied in).

### TypeScript build (`tsc -b`)

```
Exit code: 2  — pre-existing errors, not regressions

src/engine/engine.ts(107,3):       TS6196  'ExposureTag' declared but never used
src/ui/map/PlacementOverlay.tsx(5,57):  TS6196  'AssetInstance' declared but never used
src/ui/map/PlacementOverlay.tsx(29,4):  TS2352  unsafe GeoJSON→AnchorFeature cast
```

Scope: **H1-housekeeping** (`w4-h1-housekeeping` branch).

### TypeScript vitest

```
Test Files   1 failed | 25 passed (26)
Tests        1 failed | 318 passed (319)
Duration     4.79s

FAIL  tests/parity/golden-b.test.ts
  > should complete Golden B replay within 50ms
  stdout: Golden B full replay: 75.4ms   (range across runs: 56–122 ms)
  AssertionError: expected 75.4 to be less than 50
```

Golden B timing is a **pre-existing performance gap** on clean main. This is the
H1.2 target: bring the Golden B TS replay under 50 ms.

### Python pytest

```
159 passed in 158.24s (0:02:38)
```

All 159 tests green. No failures, no errors, no skips.

### Note on Python count (127 → 159)

The C2-merge build log recorded 127 Python tests. The actual count on main is
159. The 32 additional tests are:
- `test_golden_l.py::TestGoldenL` — 11 tests (C3 climate demand fork)
- `test_climate_couplings.py` — 19 tests across 6 classes (C1.6 / C3 coupling)
- `test_climate_exogeneity.py::TestClimateExogeneity` — 6 tests (C3)

These test files were added to main after the C2-merge build log entry was
written. 127 was correct at C2-merge time; 159 is the Wave 4 baseline.

### Combined baseline summary

| suite | pass | fail | total | note |
|-------|------|------|-------|------|
| TS vitest | 318 | 1 | 319 | Golden B timing: 75.4 ms > 50 ms — H1.2 target |
| Python pytest | 159 | 0 | 159 | all green |
| **combined** | **477** | **1** | **478** | 1 pre-existing timing gate |
| tsc -b | — | 3 errors | — | pre-existing; H1-housekeeping scope |

---

## 6. Worktree list at P0 close

```
/…/energy-map                 d5ea940 [main]
/…/c2-data                    376b16b [c2-data]
/…/c3-engine-lock             68f8265 [c3-engine-lock]
/…/energy-map-c2-merge        933fbf7 [c2-merge]
/…/energy-map-f1-engine-lock  0acc6ff [f1-engine-lock]
/…/energy-map-f3-ui-pins      da016e0 [f3-ui-pins]
/…/f2-facility-ui             cddb7d9 [f2-facility-ui]
/…/w4-c4-engine               d5ea940 [w4-c4-engine]
/…/w4-c5a-ui                  d5ea940 [w4-c5a-ui]
/…/w4-h1-housekeeping         d5ea940 [w4-h1-housekeeping]
/…/w4-verify                  d5ea940 [w4-verify]
```

All four Wave 4 worktrees confirmed at `d5ea940`.

---

## 7. P0 dispatch gate

| gate | status |
|------|--------|
| Baseline SHA documented and reconciled | ✓ |
| C2-data and C2-merge identified as final Wave 3 sessions | ✓ |
| Golden K (F1, anchor lifecycle) untouched by C2-merge | ✓ |
| Golden L (C3, demand fork) untouched by C2-merge | ✓ |
| Golden M namespace confirmed open for C4-ii | ✓ |
| Exposure-tag registry shape confirmed C4-ii compatible | ✓ |
| mw_ecoregions.geojson runtime dependency documented | ✓ |
| All four w4-* worktrees at d5ea940 with data files provisioned | ✓ |
| Python 159/159 green in w4-verify | ✓ |
| TS 318/319 green in w4-verify (1 pre-existing timing fail) | ✓ |

**P0 is closed. C4, C5a, and H1 are cleared for dispatch.**

---

## Post-close addendum — 2026-07-15

**Commit `6c4283a`** — `scripts/provision_worktree.sh` added to main.

Implements the long-term recommendation from §4 above. The script accepts a
worktree path as `$1` and copies the six untracked-but-required files
(`mw_ecoregions.geojson` + five parquets) from the repo root's `data/processed/`
into the target worktree. Tracked normally via `git add` (it is a shell script,
not a data file — no `.gitignore` workaround needed). Usage:

```bash
scripts/provision_worktree.sh <worktree-path>
# e.g.:  scripts/provision_worktree.sh ../w4-c4-engine
```

The four existing w4-* worktrees were already provisioned manually during P0;
this script is for any new worktree created during Wave 4 or later.

---

## Post-close addendum R3 — 2026-07-15 — Exposure-tag generator count reconciliation

**Commits `c341431` (MANUAL_FETCH.md) and `9f2c6b2` (TERRA_build_log.md)**

A pre-P0 paragraph in `terra-app/TERRA_build_log.md` contained two errors in its
description of the exposure-tag registry:

- **"4 generators with `anchor_id`"** — wrong.
- **"163/163 tagged"** — wrong.

### Re-derived counts (from `asset_exposure_tags.json`, grep `asset_class == "generator"`)

| key type | count | meaning |
|----------|-------|---------|
| `anchor_id` | **104** | Tier 2 generator anchors — per-asset tags |
| `oris_plantid` | 278 | Non-anchor generators — class-default tags |
| **generator total** | **382** | all generators in file |

Full Tier 2 breakdown (265 per-asset rows total):

| asset_class | count |
|-------------|-------|
| generator (anchor_id) | 104 |
| industrial_load | 104 |
| mine | 50 |
| commercial_anchor_load | 5 |
| data_center | 2 |
| **Tier 2 total** | **265** |

Non-Tier 2 (class-default): 278 generators (`oris_plantid`) + 139 `unclassified_anchor` = 417.
Grand total: 265 + 417 = **682** at 100% coverage — consistent with the P0 baseline report.

### Does this change the C4-ii compatibility verdict in §3?

**No.** The YES verdict in §3 was based on the tag schema shape — four hazard
dimensions (`wildfire_exposure`, `water_dependency`, `flood_zone`,
`heat_sensitivity`) each with `value`, `confidence`, and `judgment_call` fields,
with `wildfire_exposure high/med/low` present per-asset and class-default for all
asset classes. That schema is unchanged. Having **104** Tier 2 generator anchors
instead of "4" makes the registry *more* complete than the prior draft implied,
not less. The C4-ii YES verdict stands without qualification.
