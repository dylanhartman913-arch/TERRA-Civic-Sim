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
