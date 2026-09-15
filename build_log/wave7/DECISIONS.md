# Wave 7 Decisions Log

Append one block per decision. Do not edit previous blocks.

---

## 2026-09-12 — S1: package-lock.json tracking

**Decision:** Defer tracking `package-lock.json` to S2 (tree hygiene session).

**Why:** It was not previously tracked. Adding it without reviewing whether
`node_modules/` and related entries are properly gitignored, and whether the
lock reflects the current install, risks committing a stale or inconsistent
artifact. Low urgency relative to the safety-net objective of S1.

---

## 2026-09-12 — S1: EIA API key exposure (F4)

**Decision:** Old exposed-key blob `b169a18` confirmed purged via gc.
New key written to `.env` by user directly. `.env` is gitignored.
F4 is closed.

---

## 2026-09-12 — S1: data/staging files

**Decision:** `data/staging/ba_territories.geojson` and
`data/staging/hifld_control_areas_2021-12-08/` left untracked.
These are large data files; whether to track, gitignore, or add to
LFS is a separate decision for S2 (tree hygiene).

---

## 2026-09-12 — S3: Session drought ordering — Python-side question (F8)

**Decision:** Session drought ordering is purely a TypeScript app-layer concern.
The Python engine does **not** have the same ordering bug and requires no fix.

**Code-grounded rationale:**

The TypeScript bug was in the orchestration layer (`replay.ts` and `store.ts`),
which called `engineAdvanceYear(state)` **before** `applySessionDrought(state)`.
Since `advanceCountyAg` (inside `engineAdvanceYear`) records trajectory snapshots
via `recordAgSnapshot` (`engine.ts:1814`), the snapshots were recorded without
drought effects — making drought-enabled and energy-only ag_digests identical.

The Python engine has a structurally different architecture:

1. **Drought events are added to state before `advance_year` is called.**
   `apply_hazard_event_consequences()` (`terra_engine.py:3802`) calls
   `_apply_ag_drought_event()` (`terra_engine.py:2027`), which appends to
   `state["county_ag"][geoid]["drought_events"]`. This is a standalone function
   the caller invokes before `advance_year`. Confirmed in test_county_ag.py:176-178:
   `apply_hazard_event_consequences(state, [event])` → `advance_year(state)`.

2. **`_advance_county_ag` runs inside `advance_year` and reads pre-existing events.**
   At `terra_engine.py:3610`, `_advance_county_ag(state, current_year)` filters
   `ag["drought_events"]` for active events (line 2067-2070), applies forage/water
   effects, then calls `_record_ag_snapshot` (line 2089). Because the events are
   already in state, the snapshot correctly reflects drought.

3. **There is no Python "session drought" orchestrator.**
   The Python engine has no equivalent of `store.ts:advanceYear()` or
   `replay.ts:replayScenario()`. Drought event lifecycle is entirely caller-driven.
   The ordering contract (apply events → advance year) is enforced by the caller,
   not by an internal orchestration method that could get the order wrong.

**Conclusion:** No new ticket needed for Python. The digest registry should note
that session drought ordering is a TypeScript-layer concern only.

---

## 2026-09-13 — S5: network_metadata.json reconstruction sourcing

**Decision:** Some values in the reconstructed `network_metadata.json` are
sourced from `TERRA_methods_overview.md` (a project-level document maintained
outside this repo, in the project's Claude workspace) rather than from a
tracked repo file. This is noted here because the methods doc and repo code
could drift in the future.

**Values from methods doc (confirmed matching repo code):**
- `POP_WEIGHT_ALPHA = 0.45` — matches `notebooks/07_synthetic_topology.ipynb` cell 3
- `MOUNTAIN_WEST_BUS_SHARE = 0.18` — matches nb07 cell 3
- `Wyoming bus floor = 6` — matches nb07 cell 3
- `per-BA bounds: min 1, max 80` — matches nb07 cell 3
- `RANDOM_SEED = 42` — matches nb07 cell 3
- `edge-keep decay constant = 150 km` — matches nb07 `LONG_HAUL_PROBABILITY_SCALE_KM = 150`
- `CAPACITY_HEADROOM_MULT = 1.25` — matches nb07 cell 3

**Discrepancy found — DELAUNAY_PRUNE_DISTANCE_KM:**
- Methods doc states: `DELAUNAY_PRUNE_DISTANCE_KM = 400`
- Repo code (nb07 cell 3): `DELAUNAY_PRUNE_DISTANCE_KM = 75`

The repo value (75 km) is the authoritative one. Nb07's `keep_probability()`
function drops all edges longer than this threshold to probability 0, then a
density enhancement phase adds edges back up to `TARGET_EDGE_COUNT = 800`.
The methods doc figure of 400 km may reflect an earlier design iteration or
a documentation error. The repo produced the actual topology validation
artifact (`synthetic_topology_validation.json`) with 500 buses / 818 edges,
which is consistent with the 75 km threshold + density fill, not 400 km.

**Recommendation:** Update the external methods doc to match the repo, or
add a dated note there explaining the change.

---

## 2026-09-13 — S5: island_filter_min_nodes is runtime-computed, not a constant

**Decision:** The `island_filter_min_nodes` key in `network_metadata.json`
is marked MISSING in the S5 reconstruction. The ticket expected it to be a
hardcoded constant in `julia/build_nodal_case.jl`, but that file reads it
from the metadata file (line 102). The value is computed at runtime by
`notebooks/06_generator_costs.ipynb` as the first capacity-retention
threshold that retains ≥95% of total snapped MW. The fallback default is 50,
but the actual value depends on the graph structure and cannot be recovered
without re-running nb06 against the current generator/bus data.

**Impact:** `julia/build_nodal_case.jl` will error (`KeyError` equivalent)
if run before nb06 re-populates this key. This is a known gap, documented
in the S5 handoff, and feeds into S9 / W7-2.

---

## 2026-09-13 — S6: Jim Bridger capacity_basis schema choice

**Decision:** Set Jim Bridger Power Plant's `capacity_basis` to `"net_summer"`,
`capacity_basis_vintage` to `"2024"`, and add a new `capacity_basis_note` field.

**Options considered:**
- (a) New enum value `"net_summer_winter"` — represents that both net summer and
  net winter capability are identical.
- (b) `"net_summer"` with a `capacity_basis_note` field — uses the primary EIA-860
  reporting field and carries the winter agreement in prose.

**Chosen: option (b) — `"net_summer"` + `capacity_basis_note`.**

**Rationale:**
1. `"net_summer"` is the primary EIA-860 generator capacity field and is
   unambiguous to any reader familiar with EIA reporting.
2. Introducing `"net_summer_winter"` as a new enum value adds ambiguity
   (does it mean "minimum of the two", "maximum", or "both equal"?) without
   adding precision that `"net_summer"` + a note can't provide.
3. The note field is self-documenting: "2024 EIA-860 reports 2,119 MW net
   summer AND net winter capability (both identical); rounded to 2,120 MW."

**Values set:**
- `capacity_basis`: `"net_summer"`
- `capacity_basis_vintage`: `"2024"`
- `capacity_basis_note`: "2024 EIA-860 reports 2,119 MW net summer AND net
  winter capability (both identical); rounded to 2,120 MW. Net summer used as
  basis per EIA primary reporting convention; winter agreement noted here."

**Applied to both copies** (`data/processed/mw_anchor_facilities.geojson` and
`terra-app/src/data/mw_anchor_facilities.geojson`) to keep them byte-identical.

---

## 2026-09-13 — S6: data/README.md county count (293 vs 157)

**Decision:** Corrected study area from "293 counties" to "157 counties".

**Verification:** `mw_study_counties.csv` has 158 rows including header → 157
data rows. `mw_county_ees_summary.csv` also has 158 rows (same count). The 293
figure was from the pre-pivot spatial-hierarchy superset
(`spatial_hierarchy_counties.parquet`), which covers a broader bounding-box
region. The EES-scoped study area is 157 counties.

---

## 2026-09-13 — S6: scenario_profiles.json rename

**Decision:** Renamed `data/processed/mw_scenario_profiles.json` (the 31-profile
analytical file) to `data/processed/ees_scenario_profiles.json`. The ticket
referenced the file as `scenario_profiles.json`, but the actual filename had an
`mw_` prefix. The `ees_` prefix better reflects that this is the EES analytical
scenario set (vs. the 2-scenario UI file `terra-app/src/data/scenario_profiles.json`
which is unrelated and was not touched).

Updated `src/terra_engine.py:2292` and `scripts/check_generators.py:58` to
reference the new filename.

---

## 2026-09-15 — F14: county_cards flagship capacity regression from nb14 re-run

**Finding:** S7a re-ran `notebooks/14_county_foundation.ipynb`, which regenerated
`data/processed/mw_county_cards.json` from its hardcoded `FLAGSHIP_ASSETS` list
(Cell 4f). That list was never patched as part of F1/W7-0, so the regeneration
silently reverted three capacity corrections: Dave Johnston (816.7→762),
Meta AI (152→100), Jade/Crusoe (1800→200). S7b's Python→TS sync then propagated
the regression into the TS data file.

**Decision:** Patch the output file via `scripts/patch_county_cards_f14.py` (same
approach as S6's `patch_anchor_facilities.py`). The notebook source is NOT patched
in this commit — that is deferred to a future nb14 maintenance pass. The output
file patch is the immediate fix; the notebook is the root cause and should be
addressed before the next nb14 re-run.

**Defect class:** F1 (capacity mismatch vs authoritative mw_anchor_facilities.geojson).
The authoritative source for flagship capacities is `mw_anchor_facilities.geojson`,
which has the correct values (816.7, 152, 1800). Both `mw_county_cards.json` and
`terra-app/src/data/county_cards.json` now agree with the authoritative source.

**Sync pattern risk:** The S7b "copy Python shared fields into TS" sync assumed
Python is always authoritative. When the Python source itself contains a regression,
the sync propagates it. S11's dual-path identity check should verify flagship
capacities against `mw_anchor_facilities.geojson` directly.
