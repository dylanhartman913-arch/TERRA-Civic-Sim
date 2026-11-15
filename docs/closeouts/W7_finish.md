# W7 Finish — v0.7.1 closeout

**Date:** 2026-11-15 · **Sessions covered:** S16a closing block + addendum, S16b, W7-F1, W7-F2
**Previous release:** `v0.7.0` → `b494393` (annotated tag object `a136e16`), not moved.
**This release:** `v0.7.1`, on the commit that adds this file. The tag is applied
only after CI is green on that exact commit (see HANDOFF W7-F2 for the check-run
record).

v0.7.1 contains **no data changes** and one additive app change, in `76960d0`:
an optional `Trajectory.ag` type in `terra-app/src/engine/types.ts`, populated
by `computeTrajectory` in `terra-app/src/state/store.ts`. No digest, fixture or
engine arithmetic changed. Beyond that it adds one regression gate, one
measurement harness (tooling), decisions, and documentation.

---

## Part A — What v0.7.1 adds over v0.7.0

`git log --oneline v0.7.0..v0.7.1`, oldest first, before this closeout's own commit:

| Commit | Session | What |
|---|---|---|
| `0e1ff78` | S16a | Push and tag confirmation, verified via `git ls-remote` |
| `ec59391` | S16a | CI verified via the public API; **Part F** closure conditions C-1…C-5 appended to `docs/closeouts/v0.7.0.md` |
| `cf75858` | S16b | **C-1**: R1–R18 extracted verbatim into `docs/methods/RULEBOOK.md` |
| `f87894d`, `6505b89` | S16b | Hash backfill; CI verified green on `f87894d` |
| `dbcd2fa` | W7-F1 | **Decisions** (by Dylan, 2026-11-12) recorded in `build_log/wave7/DECISIONS.md`: D4, C-2, C-3, rulebook format, B-11, N-track successor |
| `76960d0` | W7-F1 | **B-11 gate**: `Trajectory.ag` (forage index by year + drought events) and `terra-app/tests/parity/b11-comparison-drought.test.ts` (5 tests), mutation-proven |
| `b218128` | W7-F1 | HANDOFF block |
| `3fb14ca` | W7-F2 | **D4 disposition**: closed under rule branch 2 with a revised 33.3 ms pan budget. New harness `terra-app/scripts/frame-timing-harness.mjs`; raw evidence in `build_log/wave7/snapshots/w7-f2/` |

### B-11 gate

`computeTrajectory` now carries an optional `ag` observable, so comparison mode
can show session drought and be gated on it. The 5-test gate fails 2 of 5 with
`applySessionDrought` removed, and passes 5 of 5 restored (W7-F1 HANDOFF). It
sits under `tests/parity/`, so CI runs it. CI went green on `76960d0`.

### D4 disposition

Closed by **branch 2** of the pre-committed rule. Headed Chrome on an Apple M5
(ANGLE Metal), production build, densest viewport, 3 valid runs: p95
17.4 / 17.5 / 17.3 ms, max 17.7 ms, 0 frames over 33.3 ms. That is a vsync-locked
60 fps whose timestamp jitter puts p95 just over 16.7 ms.

The one trace found no hotspot in TERRA map-layer components. The renderer main
thread was 9.2 % busy, and top self time was MapLibre internals. **Revised
budget: 33.3 ms for panning at the densest viewport.**

The inherited 67 ms is explained: the Wave 4 H1.4 capture forced
`--use-angle=swiftshader` (software GL). Re-run with those flags it gives
p95 66.6 ms.

Full record: `build_log/wave7/DECISIONS.md` (2026-11-15 W7-F2 entry) and HANDOFF W7-F2.

### Decisions recorded (W7-F1, decided by Dylan 2026-11-12)

D4 measured in W7-F2 and leaves the register afterwards · C-2 named deferral ·
C-3 as W7-F3 pipeline work · rulebook format closed as sufficient · B-11
option (a) · N-track as Wave 7's successor, with no N-track code in Wave 7.

### C-3 status

**OPEN, scheduled as W7-F3. Not started.** No W7-F3 commit exists. Since W7-F1
it is framed as pipeline work: allotment geometry is served by an ArcGIS
FeatureServer / Hub download. Only the RAS AUM tables may need a manual export.
This supersedes Part F's "needs a human at the portal" for the geometry part.

---

## Part B — ID collision to know about (B-7 evidence)

`docs/closeouts/v0.7.0.md` Part F numbers its items C-1 (rulebook), C-2 (D5
review), C-3 (BLM), **C-4 (D4)** and C-5 (B-11). The W7-F1 DECISIONS entries
reuse the label **"C-4" for the rulebook format**, which is C-1's 8-field
residual and not D4. In this document, **C-n always means Part F's numbering**,
and the W7-F1 entry is cited by its title. This is the third ID collision of
its kind, after "D5" and "W7-3", so B-7 stays open with more evidence.

---

## Part C — Debt register after W7-F2

Every ID from v0.7.0's register (D-1…D-15, B-1…B-11, Part F C-1…C-5) appears
below, plus items opened since. Status words: **OPEN**, **CLOSED** (with where),
**DEFERRED** (by a recorded decision), and **AWAITING HUMAN** (evidence captured;
a person must look).

### Part F closure conditions

| ID | Item | Status after W7-F2 |
|---|---|---|
| C-1 | W7-3 rulebook | **CLOSED.** Verbatim extraction in S16b (`cf75858`). The 8-field residual was closed as "will not be built" by the W7-F1 rulebook-format decision (`dbcd2fa`). |
| C-2 | D5 domain review | **DEFERRED** by decision (`dbcd2fa`) until a pilot group exists or the dissertation commitment. The packet stays at `docs/review/D5_forage_packet.md`. Leaves the register per that decision. |
| C-3 | BLM grazing data | **OPEN**, scheduled as W7-F3 (see Part A). |
| C-4 | D4 canvas performance | **CLOSED** in W7-F2 (`3fb14ca`), rule branch 2, revised 33.3 ms budget. |
| C-5 | B-11 observability | **CLOSED** in W7-F1 (`76960d0`). |

### Carried-debt items (v0.7.0 Part B)

| ID | Item | Status after W7-F2 |
|---|---|---|
| D-1 | `ees_scenario_profiles` / `lifecycle_coefficients` generator gap | **OPEN**, Horizon 3 (with B-1) |
| D-2 | Untracked parquet files | **OPEN**: 2 of 3 still untracked (`spatial_hierarchy_counties.parquet`, `spatial_hierarchy_huc8.parquet`) |
| D-3 | `network_metadata.json` missing keys | **OPEN**, Horizon 3 |
| D-4 | nb14 `FLAGSHIP_ASSETS` stale source | **OPEN**, Horizon 3 |
| D-5 | D5 packet vs. review | **DEFERRED** with C-2 |
| D-6 | S11 `pytest.ini` exclusion | **CLOSED** in v0.7.0 (conditional on D-4) |
| D-7 | D5 packet untracked | **CLOSED** in v0.7.0 |
| D-8 | S14–S15b push gap | **CLOSED** for the data; the process half continues as B-3 |
| D-9 | Rulebook never produced | **CLOSED** with C-1 |
| D-10 | D5 real-render verification + misleading `ag-headless-render.test.ts` header | **OPEN, partly advanced.** (a) Real-render evidence now exists: headed screenshots of all 3 ag-choropleth modes, county metrics E/Ec/S, and all 12 climate-hazard metrics under the historical and ssp245 lenses, with viewport, DPR and GPU backend recorded. Not covered: ssp370, and the 5 other county metrics in `MetricSelector.tsx` (`docs/screenshots/w7-f2/`, W7-F2 HANDOFF), so (a) is **AWAITING HUMAN**. (b) The test header still claims to replace visual verification and is **unchanged**. |
| D-11 | BLM pull | **OPEN** with C-3 (W7-F3) |
| D-12 | D4 disposition | **CLOSED** with C-4 (W7-F2) |
| D-13 | `data/staging/` decision | **OPEN** as B-4 |
| D-14 | Residual stash | **OPEN** as B-5 (`stash@{0}` still present) |
| D-15 | `08b_ees_baseline_executed.ipynb` untracked | **OPEN** as B-8 |

### Backlog (v0.7.0 Part D)

| ID | Item | Status after W7-F2 |
|---|---|---|
| B-1 | `check_generators.py` 29/0 PASS is unsound | **OPEN** |
| B-2 | `.gitignore` parquet comment is stale | **OPEN**: `.gitignore:48–49` unchanged since v0.7.0 |
| B-3 | Push-before-session-end checklist into the governing docs | **OPEN**: not in `docs/methods/RULEBOOK.md` |
| B-4 | `data/staging/` disposition | **OPEN** |
| B-5 | Drop `stash@{0}` | **OPEN** |
| B-6 | F8-LIVE drought sites | **CLOSED** in S16a (`016b36f`) |
| B-7 | Disambiguate colliding IDs | **OPEN**, with new evidence (Part B) |
| B-8 | Remove the duplicate 08b notebook | **OPEN** |
| B-9 | Independent verification as a standing requirement | **OPEN** as a written rule. It was practised for this closeout (Part E). |
| B-10 | Store-level coverage beyond drought | **OPEN**. B-11 added comparison-path coverage only. |
| B-11 | `Trajectory` ag observable | **CLOSED** in W7-F1 (`76960d0`) |

### Pre-Wave-7 IDs missing from v0.7.0's register

These were carried into Wave 6 by `docs/roadmaps/Wave 2-6 Roadmaps.md:389/430`,
but v0.7.0's register does not list them. They appear here so they do not stay
silently dropped. T2-FU-DEAD and T5-FU-1 were closed in Wave 6
(`build_log/wave6/ag2-engine-lock.md:257–259`).

| ID | Item | Status after W7-F2 |
|---|---|---|
| T4-FU-1 | SNOTEL metrics-array annotation gap in `county_climate_baseline.json` | **OPEN**, as last recorded at Wave 5 close (`docs/session_logs/TERRA_build_log.md:3205`). No Wave 6 disposition was found. Not re-examined this session. |
| T5-FU-2 | TS test-count reconciliation | **CONFLICTING RECORDS, needs a ruling.** Wave 5 close (`TERRA_build_log.md:3207`) records it as "documented, closed" (a 32/356 → 33/364 delta, fully reconciled). `docs/methods/RULEBOOK.md` R18 says a 27-test reproduction gap "remains open". Not re-examined this session. |
| T6-FU-2 | SNOTEL no-data gray fill not render-verified | **AWAITING HUMAN.** Headed screenshots of `snotel_swe_baseline_in` / `snotel_swe_projected_in` and the other hazard metrics, under the historical and ssp245 lenses, are in `docs/screenshots/w7-f2/`. The visual judgement is Dylan's. Note that the Wave 5 closure condition (`TERRA_build_log.md:3208`) asks for an automated e2e fill-colour assertion. Screenshots plus a human look meet only the "D5 visual pass" alternative in roadmap line 430. |

### Opened since v0.7.0

| ID | Item | Status |
|---|---|---|
| W7-F1-FU-1 | `docs/review/wyoming-playtest-2026-11-01/` untracked and undispositioned (named in W7-F1; ID assigned here) | **OPEN** |
| W7-F1-FU-2 | Carry `Trajectory.ag` into the debrief export (W7-F1 "possible follow-up"; ID assigned here) | **OPEN** |
| W7-F1-FU-3 | `ag-year-loop-benchmark` p90 wall-clock budget flakes on a cold run (W7-F1; ID assigned here) | **OPEN** |
| W7-F2-FU-1 | **The production build can white-screen on entering Free Play.** `HazardChoroplethLayer.tsx:12–15` `resolvedColor()` throws `Missing required --choro-3 design token` whenever `getComputedStyle` returns empty, whatever token was requested. No error boundary catches it, so the whole React tree unmounts. Observed on at least 3 app loads in W7-F2; the error text was captured on 2. | **OPEN**. Not fixed: outside W7-F2's scope. |
| W7-F2-FU-2 | **The anchor exposure-badge stack never renders in the live app.** `ExposureBadges.tsx:11` matches `entry.asset_id === asset.asset_id`, but the `assets[].asset_id` values in `asset_exposure_tags.json` are anchor ids (eia860_/ghgrp_/msha_/curated_/flagship_…, none `anchor_`), while registry assets carry the anchor id in `anchor_id` and have their own `asset_id`. Observed: 15 tier-2 anchor cards opened, 13 with a Registry Asset section, all 15 ids present in the tags file, **0 badge stacks rendered** (`anchor_badge_probe` in `build_log/wave7/snapshots/w7-f2/frame-timing-headed-2026-11-15T22-04-13-541Z.json`). | **OPEN** |
| W7-F2-FU-3 | W7-F2 binaries not committed: `docs/screenshots/w7-f2/` (32 PNG, 19 MB) and `build_log/wave7/snapshots/w7-f2/trace-headed-…json.gz` (7 MB). Commit, LFS or ignore? | **OPEN**, Dylan's call |

**Exits this session:** C-4/D-12 (D4) **closed** by the W7-F2 measurement.
C-1/D-9, C-5/B-11 and C-2/D-5 exited earlier by recorded commits or decisions,
cited above. **Also changed this session:** D-10(a) and T6-FU-2 moved to AWAITING
HUMAN, and three new items were opened (W7-F2-FU-1/2/3). No other item changed status.

---

## Part D — Verification basis

| Check | Command | Result |
|---|---|---|
| Lint | `cd terra-app && npm run lint` | 0 errors, 1 pre-existing warning (`ActionPalette.tsx:53`) |
| Typecheck | `cd terra-app && npx tsc -b --noEmit` | exit 0 |
| Manifest | `python scripts/check_manifest.py` | PASSED — 0 unmanifested, 0 hash mismatches |
| Dual-path | `python scripts/check_dual_path.py` | PASSED — all promotion pairs byte-identical |
| CI | `GET /repos/…/commits/<sha>/check-runs` | Recorded per commit in HANDOFF W7-F2; the tag requires all three jobs green on the tagged commit |

Test suites were not re-run locally in W7-F2. No engine, store or data file
changed after W7-F1's verified 230 pytest / 364 parity / 406 full TS
(HANDOFF W7-F1). CI re-runs pytest and parity on every push.

## Part E — Independent verification

Before tagging, an independent subagent checked this document's claims against
the repository. It confirmed the commit table, the D4 numbers, the decisions,
and most register statuses. It found 7 wrong, overstated or unverifiable claims
in the first draft, all corrected above:
- "no engine changes" (the `types.ts` and `store.ts` addition);
- the session label;
- "every choropleth mode";
- "no other item changed status";
- the T4-FU-1 provenance;
- the T5-FU-2 conflict;
- the FU-2 wording.

The CI record it found missing is in HANDOFF W7-F2.
