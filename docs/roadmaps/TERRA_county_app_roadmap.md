# TERRA County App Roadmap
## From Notebook Prototype → County-Based Transition Simulator

**Purpose:** This file is the shared memory for the TERRA application track. It
supersedes the spatial doctrine in `TERRA_MW_roadmap.md` in one respect: **the
county replaces the ecoregion as the default unit of analysis.** Each session
below has a Claude Code session prompt and a precise list of inputs, outputs,
and handoff conditions. Add finished notebooks and code to the project files
before starting the next session. Claude Code should read this file at the
start of every session.

**Current state of the pipeline (as of NB 11):**
- 500-bus synthetic network, 656 branches, calibrated against EIA-930
- `src/terra_engine.py` — initialize_state, apply_action, inject_disturbance,
  compute_ees_summary, get_material_ledger, get_pathway_conditions
- `mw_action_library.json` v2 — 46 actions with unit_scale, time_to_deploy,
  material_requirements, ees_effects, placement_scale (bus / ecoregion /
  watershed / county)
- `mw_scenario_profiles.json` — 30 named scenario profiles with pathway
  conditions
- `mw_tract_ees_scores.parquet` — tract-level EES scores (the social
  measurement layer)
- `11_applied_scenario.ipynb` — Wyoming Basin coal transition walkthrough,
  13-action sequence, executed end-to-end against the engine
- TIGER county layer already cached from NB 07 (`data/raw/census_counties/`)
- Configurator and sandbox JSX artifact prototypes (embedded-JSON dashboards,
  not yet connected to the engine)

---

## The County Pivot

### Why counties

The ecoregion was the right organizing unit while the framework was primarily
ecological. As a *planning tool*, the county wins on every axis that matters:

1. **Governance.** Counties permit, zone, tax, and elect commissioners. The
   Laramie County approval of the Jade data center campus and the Lincoln
   County siting of Kemmerer Unit 1 are county-level events. A citizen-facing
   tool must speak in the unit where decisions are actually made.
2. **Data quality.** Tracts nest *exactly* within counties. The tract→county
   EES aggregation is a clean groupby, whereas tract→ecoregion required
   areal-weighted spatial overlay with allocation error. The pivot makes the
   social layer more rigorous, not less.
3. **Statistics.** ACS, BEA CAINC, EIA-860 plant locations, USGS water use,
   USDA agriculture — all natively county-coded. The county baseline card can
   be assembled almost entirely from real published data with no proxying.
4. **Legibility.** Players and citizens know which county they live in. Nobody
   knows they live in the Wyoming Basin Level III ecoregion.

### What ecoregions become

Ecoregions are **demoted, not deleted**. They become the *ecological
suitability layer*: an action's `applicable_ecoregions` is still authoritative
for where prairie restoration or beaver reintroduction makes ecological sense,
but it is evaluated as a county–ecoregion intersection test. A county is
eligible for an action if it intersects (≥ a configurable area threshold,
default 15%) any applicable ecoregion. Ecoregions also remain a toggleable map
overlay and the spatial footprint for climate disturbances.

### Revised scale doctrine

> **The county is the unit of analysis and governance. The bus is the unit of
> energy system intervention. The tract is the unit of social measurement. The
> ecoregion is the unit of ecological suitability. The material ledger is the
> unit of honesty.**

Every notebook and module below must keep these five scales distinct in code
and in prose.

### Study area definition (county basis)

The Mountain West study area is redefined as: **all 23 Wyoming counties, plus
every county in CO, MT, UT, ID, NE, and SD whose centroid falls within the
union of the six original Level III ecoregions** (Wyoming Basin, Northwestern
Great Plains, Middle Rockies, Southern Rockies, Colorado Plateaus, western
High Plains). This preserves continuity with the existing EES baseline while
guaranteeing complete Wyoming coverage for the applied scenarios. Expect
roughly 90–120 counties. The exact list is computed once in Session 0.1 and
frozen in `mw_study_counties.csv`.

---

## Architecture Decision (locked)

**Option A — TypeScript engine port, static deployable app.**
- Python remains the *coefficient factory and source of truth*: it generates
  the action library, EES baselines, crosswalks, scenario profiles, and golden
  test fixtures.
- The browser app (Vite + React + TypeScript) contains a faithful TS port of
  the engine, validated by golden-file parity tests.
- Pre-solved E4ST scenarios are baked in as static "oracle" lookups surfaced in
  the UI when the player's state approaches a model-validated scenario.
- No backend. The app deploys as a static site and can be shared as a link.

---

# Phase 0 — County Pivot and Schema v3 (Python)

Goal: rebuild the data layer around counties, add demand-side actions and
coupling mechanics, and produce golden fixtures so the TS port in Phase 1
targets the final schema. **Do not start Phase 1 until all three Phase 0
sessions are complete.**

### Session 0.1 — Notebook 14: County Foundation

**File:** `14_county_foundation.ipynb`

**Claude Code session prompt:**

> Read `data/processed/network_metadata.json`,
> `data/processed/mw_tract_ees_scores.parquet`,
> `data/processed/synthetic_buses.geojson`,
> `data/processed/mw_ecoregions.geojson`, and the cached TIGER county layer
> from `data/raw/census_counties/` before writing any code. Print row counts
> and CRS for every spatial input.
>
> Write `14_county_foundation.ipynb` that:
>
> 1. **Defines the study area county set.** All 23 WY counties + counties in
>    CO/MT/UT/ID/NE/SD with centroid inside the union of the six study
>    ecoregions. Save `data/processed/mw_study_counties.csv` with columns
>    [geoid, county_name, state, in_wyoming, centroid_lon, centroid_lat,
>    area_km2] and `data/processed/mw_counties.geojson` (simplified to ≤ 50 KB
>    per state with topology-preserving simplification — this file ships to
>    the browser).
>
> 2. **Builds the four-way crosswalk** `data/processed/county_crosswalk.parquet`
>    with one row per (geoid, bus_id, ecoregion_code) intersection, columns:
>    [geoid, bus_id, bus_weight, ecoregion_code, ecoregion_area_share,
>    primary_bus]. `bus_weight` = inverse-distance share of the county load
>    assigned to each of the 3 nearest in-study buses; `primary_bus` flags the
>    nearest. `ecoregion_area_share` = fraction of county area in each
>    ecoregion. Validate: every study county has ≥1 bus and weights sum to 1.
>
> 3. **Re-aggregates EES to counties.** Tract→county is an exact nesting:
>    population-weighted mean of tract EES scores per county. Save
>    `data/processed/mw_county_ees_summary.csv` with [geoid, county_name, E,
>    Ec, S, population, n_tracts]. Print a comparison table of the old
>    ecoregion-level means vs the new county-population-weighted study-area
>    mean — they should agree within ±0.3 on each capital; investigate and
>    explain any larger gap before proceeding.
>
> 4. **Assembles the county baseline card data** —
>    `data/processed/mw_county_cards.json`, one record per county:
>    - population and median household income (ACS 5-year, API pattern from
>      NB 07)
>    - employment and per-capita income (BEA CAINC30 if API key available;
>      otherwise ACS proxies, flagged `source: "acs_proxy"`)
>    - generation capacity and fuel mix (EIA-860 plants spatially joined to
>      county polygons — use the existing `power_plants_with_ba.geojson`)
>    - total water withdrawals (USGS county water-use 2015, latest county
>      vintage; flag as `vintage: 2015`)
>    - existing flagship assets, hand-curated for Wyoming: Kemmerer Unit 1
>      (Lincoln, nuclear, under construction, operational 2031), Naughton gas
>      conversion (Lincoln), Meta AI data center (Laramie, under
>      construction), Jade/Crusoe campus phase 1 (Laramie, approved 2026),
>      BWXT TRISO/fuel facility (Campbell), PRB mines (Campbell), Jim Bridger
>      (Sweetwater), Dave Johnston (Converse). Each asset: [name, geoid, type,
>      status, capacity_or_load_mw, operational_year, source_url].
>
> 5. **Updates `network_metadata.json`** with a `county_pivot` block recording
>    the study county count, crosswalk stats, and the doctrine sentence.
>
> Do not modify `terra_engine.py` in this session.

**Outputs:**
- `data/processed/mw_study_counties.csv`
- `data/processed/mw_counties.geojson`
- `data/processed/county_crosswalk.parquet`
- `data/processed/mw_county_ees_summary.csv`
- `data/processed/mw_county_cards.json`

**Handoff condition:** crosswalk validation passes; EES re-aggregation
comparison printed and explained; Wyoming flagship assets present with sources.

### Session 0.2 — Notebook 15: Action Library v3

**File:** `15_action_library_v3.ipynb`

**Claude Code session prompt:**

> Read `data/processed/mw_action_library.json`,
> `data/processed/county_crosswalk.parquet`,
> `data/processed/mw_study_counties.csv`, and
> `terra_action_taxonomy.md` before writing any code.
>
> Write `15_action_library_v3.ipynb` producing
> `data/processed/mw_action_library_v3.json`:
>
> 1. **County-default placement.** Every action gains
>    `placement_scale: "county"` as the user-facing siting unit. Retain the
>    engine-facing resolution rule per action:
>    `resolves_to: "bus" | "tract" | "watershed" | "county"`. Energy actions
>    resolve to the county's `primary_bus`. `applicable_ecoregions` is
>    retained verbatim but add a precomputed `applicable_counties` list using
>    the crosswalk (≥15% area share rule). Print, for 5 spot-check actions,
>    the county counts and verify prairie_restoration excludes mountain
>    counties and pumped_hydro excludes plains counties.
>
> 2. **New bucket: ENERGY_DEMAND.** Add at minimum:
>    - `data_center_hyperscale` — unit MW (IT load), unit_scale 500,
>      time_to_deploy 2. Coefficients per MW: grid load (PUE 1.2–1.3, cite
>      LBNL 2024 US Data Center Energy Usage Report), water consumption
>      (m³/MWh, cite LBNL/Siddik), construction + operations jobs, county tax
>      revenue proxy, land acres. Network effect: `bus_load_add`.
>    - `data_center_campus_phase` — unit MW, unit_scale 1000, for Jade-scale
>      phased builds; same coefficient family, longer time_to_deploy (3).
>    - `industrial_load_flexible` — unit MW, unit_scale 100; interruptible
>      load (electrolysis-style) with a `flexibility: 0.4` attribute the
>      engine may shed during disturbances.
>    Every coefficient gets a row in `material_coefficient_sources.csv` with
>    [material, value, unit, action_type, source, year, notes]. Flag any
>    coefficient without a citable source as `confidence: "low"`.
>
> 3. **Coupling rules (synergy v2).** Following the `organic_water_battery`
>    pattern, add a `coupling_rules` top-level block:
>    - `nuclear_dc_coupling`: if an ENERGY_DEMAND action and a firm clean
>      supply action (`smr_advanced`, `coal_to_smr`, `geothermal_utility`,
>      `pumped_hydro` ≥ threshold) share a `primary_bus` or are one branch
>      apart, apply: transmission_requirement −X%, reliability_credit +Y,
>      effective time_to_deploy of the *pair* = max of the two (they
>      co-schedule). Document X, Y with reasoning; mark `confidence: "low"`
>      where judgment-based.
>    - `firm_supply_gap`: any ENERGY_DEMAND placement whose resolved bus lacks
>      sufficient firm capacity (county-level firm capacity − load < demand)
>      carries a `deficit_mw` attribute the engine must compute and the UI
>      must display. The action still applies — the tool shows consequences,
>      it does not forbid choices.
>    - `supply_chain_throughput`: SMR-family actions draw from shared annual
>      HALEU and fuel-fabrication capacity pools (initialize from the supply
>      chain project's facility data; cite DOE HALEU availability program
>      figures). Builds exceeding pool capacity are queued, not rejected.
>
> 4. **Schema version stamp** `"schema_version": "3.0"` plus a changelog block
>    listing every action added or modified relative to v2.

**Outputs:**
- `data/processed/mw_action_library_v3.json`
- updated `data/processed/material_coefficient_sources.csv`

**Handoff condition:** v3 validates against the taxonomy schema; all
ENERGY_DEMAND coefficients sourced or flagged; spot-check county applicability
printed and sensible.

### Session 0.3 — Notebook 16: Engine v2 + Golden Fixtures

**File:** `16_engine_v2_golden.ipynb` (+ rewrite of `src/terra_engine.py`)

**Claude Code session prompt:**

> Read `src/terra_engine.py`, `data/processed/mw_action_library_v3.json`,
> `data/processed/county_crosswalk.parquet`,
> `data/processed/mw_county_ees_summary.csv`,
> `data/processed/mw_county_cards.json`, and `11_applied_scenario.ipynb`
> before writing any code.
>
> Rewrite `src/terra_engine.py` as engine v2:
>
> 1. **County-keyed state.** `state['county_ees']` replaces
>    `state['ecoregion_ees']` as the primary capital store. Ecoregion scores
>    remain derivable via the crosswalk for the suitability overlay.
>    `apply_action(state, action_id, geoid, magnitude)` — location is a county
>    GEOID; the engine resolves to bus/tract/watershed internally via the
>    crosswalk and the action's `resolves_to`.
>
> 2. **Load-type actions.** Implement `bus_load_add` symmetric to the existing
>    load-reduce path; propagate through the NB 05 interchange heuristic.
>    Compute and store `deficit_mw` per the `firm_supply_gap` rule.
>
> 3. **Coupling evaluation.** After every action application, evaluate
>    `coupling_rules` and store active couplings in
>    `state['active_couplings']` with their bonuses applied and itemized
>    (never silently folded into other numbers — the UI must be able to show
>    "why").
>
> 4. **Build queue.** `queue_action(state, action_id, geoid, magnitude,
>    decision_year)` returns operational_year from time_to_deploy, modified by
>    coupling and throttled by `supply_chain_throughput` pools.
>    `advance_year(state)` ticks the clock, commissions completed builds,
>    applies depreciation and climate trend.
>
> 5. **County summaries.** `compute_ees_summary` returns county, BA, and
>    study-area levels. New `get_county_card(state, geoid)` merges static
>    baseline card data with live state (capacity, load, deficit, queued
>    builds, active couplings).
>
> Then write `16_engine_v2_golden.ipynb` that produces THREE golden fixtures
> as JSON (inputs + every intermediate delta + final state digest):
>
> - **Golden A — regression:** the NB 11 Wyoming Basin 13-action sequence
>   re-expressed with county GEOIDs. Final EES must match NB 11 results within
>   ±0.05 per capital per ecoregion-equivalent aggregate; print the diff table.
> - **Golden B — Wyoming 2032 nuclear–DC buildout:** pre-place the real
>   announced assets from `mw_county_cards.json` (Meta Cheyenne DC, Jade
>   phase 1, Kemmerer Unit 1), then the player sequence: dual-unit Natrium in
>   Laramie County (operational 2032), 230kV upgrade Laramie↔Platte,
>   workforce_retraining in Laramie + Lincoln, affordable_housing in Cheyenne,
>   battery_grid 1 GWh. Assert: firm_supply_gap is positive after Jade phase 1
>   and shrinks after the Natrium pair; nuclear_dc_coupling activates;
>   HALEU pool throttles a hypothetical third Natrium pair to a later year.
> - **Golden C — disturbance under load:** Golden B state + 3-sigma heat wave
>   at 2033. Assert flexible load sheds first and the deficit/reliability
>   response is monotone in heat-wave intensity.
>
> Save fixtures to `data/golden/golden_{a,b,c}.json`. These are the parity
> contract for the TypeScript port — treat their exact numerical content as
> frozen once this session ends.

**Outputs:**
- `src/terra_engine.py` (v2)
- `16_engine_v2_golden.ipynb`
- `data/golden/golden_a.json`, `golden_b.json`, `golden_c.json`

**Handoff condition:** Golden A regression within tolerance; Golden B
assertions pass; fixtures frozen.

---

# Phase 1 — App Scaffold and TypeScript Engine Port

### Session 1 — Repo + Engine Parity

**Claude Code session prompt:**

> Create a new repo directory `terra-app/` (Vite + React + TypeScript, strict
> mode). Read `src/terra_engine.py`, `data/processed/mw_action_library_v3.json`,
> and all three golden fixtures in `data/golden/` before writing any code.
>
> 1. Scaffold:
>    ```
>    terra-app/
>      src/engine/        — TS port (pure functions, zero React imports)
>      src/engine/types.ts — schema types generated to mirror v3 JSON exactly
>      src/data/          — build-time copies of counties geojson, library v3,
>                           crosswalk (converted to JSON), county cards,
>                           scenario profiles, E4ST oracle lookups
>      src/state/         — Zustand store wrapping the engine (undo stack lives
>                           here, not in the engine)
>      src/ui/            — components (empty this session beyond a smoke page)
>      tests/parity/      — golden-file tests
>    ```
> 2. Port the engine function-for-function: initializeState, applyAction,
>    queueAction, advanceYear, injectDisturbance, computeEesSummary,
>    getMaterialLedger, getPathwayConditions, getCountyCard. Pure functions on
>    immutable state (use structural sharing; the state object for ~110
>    counties and 500 buses is small).
> 3. Parity tests (Vitest): replay golden A, B, C; assert every intermediate
>    delta and the final digest match within 1e-6 relative tolerance. A parity
>    failure is a port bug by definition — fix the TS, never the fixture.
> 4. Add `npm run parity` and wire it as a pre-commit check.
>
> Performance budget: full golden B replay < 50 ms; single applyAction < 5 ms.
> Print timings in the test output.

**Outputs:** `terra-app/` repo, all parity tests green, timing report.

**Handoff condition:** parity green at 1e-6; performance budget met.

---

# Phase 2 — Map and Interaction Layer

### Session 2 — County Map as the Primary Surface

**Claude Code session prompt:**

> Read `terra-app/src/engine/types.ts` and the data files in
> `terra-app/src/data/` before writing any code. Use MapLibre GL JS with a
> neutral basemap style; deck.gl overlays for flows.
>
> 1. **County choropleth (default view).** Counties colored by selected metric
>    (E / Ec / S / firm capacity margin / load growth). Hover = tooltip with
>    name + headline numbers. Click = county card drawer: baseline data,
>    flagship assets (real announced projects render with a distinct
>    "announced/under construction" badge), live state, queued builds, active
>    couplings, deficit chip if `deficit_mw > 0`.
> 2. **Layer toggles:** ecoregion suitability overlay (hatched, behind
>    counties), synthetic buses (size ∝ capacity, color by dominant fuel),
>    branches (width ∝ thermal limit), animated interchange flows (deck.gl
>    ArcLayer/TripsLayer from BA flow data), E4ST oracle badge layer.
> 3. **Placement interaction.** Selecting an action from the palette enters
>    placement mode: eligible counties highlight (from
>    `applicable_counties`), ineligible counties dim with a one-line reason on
>    hover ("outside grassland ecoregions"). Click places a ghost footprint
>    with magnitude slider and Confirm/Cancel. Confirmed actions enter the
>    build queue and render as construction icons with a countdown badge —
>    Civ-style.
> 4. **Coupling visualization.** Active couplings draw a pulsing link line
>    between the coupled assets; the deficit chip on a county shows
>    `⚡ {deficit_mw} MW firm supply gap` and clicking it suggests resolving
>    action categories.
> 5. Keep the dark theme / DM Mono / teal-amber-purple design language from
>    the artifact prototypes. 60 fps pan/zoom on a mid-range laptop;
>    choropleth restyle < 16 ms on state change.

**Outputs:** map surface with county selection, placement mode, layers,
coupling visuals.

**Handoff condition:** place a data center in Laramie County end-to-end —
palette → ghost → queue → deficit chip appears — with no console errors.

---

# Phase 3 — Game Loop

### Session 3 — Turns, Budgets, Events

**Claude Code session prompt:**

> Read the engine API and Session 2 UI before writing any code.
>
> 1. **Turn structure.** Annual ticks grouped into eras (2025–2035–2045–2055–
>    2075). End Turn advances one year: queue commissioning, depreciation,
>    climate trend, event draw. Auto-pause on: build completed, coupling
>    activated, deficit crossed threshold, event fired.
> 2. **Budgets and constraints (the scarcity layer).** Per-era pools:
>    capital_cost_usd, labor_years, steel_tons, concrete_tons, HALEU_kg,
>    transmission ROW miles. Pools initialize from the v3 library's
>    supply_chain_throughput block plus documented era budgets. Spending is
>    visible at placement time ("this consumes 14% of era steel"). Pools
>    constrain *rate*, not totals — overflow queues to the next era with an
>    explanatory tooltip.
> 3. **Event deck.** Stochastic disturbances drawn per year with
>    era-dependent frequencies (climate trend raises heat-wave/drought odds);
>    deterministic scheduled events from county cards (Naughton conversion
>    2026, Kemmerer operational 2031). Manual "stress test" injection panel
>    retained from the sandbox design.
> 4. **Quest tracker.** Pathway conditions for the player-selected target
>    scenario render as a checklist with live met/unmet state and distance
>    metric — `get_pathway_conditions` already computes everything needed.
> 5. **Honesty surfaces.** EES gauges draw uncertainty bands sized by
>    coefficient confidence; every displayed effect has an info popover with
>    the source citation from material_coefficient_sources. When state is
>    within threshold of a pre-solved E4ST scenario, show the oracle
>    comparison panel: "heuristic estimate vs model-validated result."

**Outputs:** playable loop: select target → place/queue actions → end turns →
events → quest tracker responds.

**Handoff condition:** Golden B sequence is playable manually in under 5
minutes and reaches the same end state as the fixture (parity spot-check
button in a debug menu).

---

# Phase 4 — Persistence, Replay, Comparison

### Session 4

**Claude Code session prompt:**

> 1. **Save/load** to localStorage with schema-versioned slots; **export/
>    import** scenarios as a single JSON file (action log + seed + schema
>    version — state is reconstructed by replay, which doubles as an
>    integrity check).
> 2. **Undo/redo** via the action-log replay (engine is pure, so undo = replay
>    n−1; memoize era snapshots so undo is O(year-within-era)).
> 3. **Replay mode:** scrub the timeline of a finished run; the map animates
>    builds and events in sequence.
> 4. **Comparison mode:** load two scenario files side by side — split EES
>    trajectories, material ledgers, condition checklists. This is the
>    committee-meeting feature: "pathway A vs pathway B for Wyoming."

**Handoff condition:** export a run, reimport it, byte-identical replay
digest; comparison view renders two runs.

---

# Phase 5 — Campaigns and Polish

### Session 5

**Claude Code session prompt:**

> 1. **Campaign 1 — Wyoming Basin Coal Transition.** Port NB 11's three acts
>    as a guided tutorial: Act 1 auto-plays as a narrated tour of the county
>    baseline; Act 2 has the player set configurator targets; Act 3 hands them
>    the 13-action build with hints. Completing it unlocks free play.
> 2. **Campaign 2 — Wyoming 2032: Coordinated Nuclear–DC Strategy.** Golden B
>    as a playable scenario: announced assets pre-placed, player must close
>    the firm supply gap and activate the coupling before 2035 while keeping
>    S ≥ baseline (housing/workforce pressure makes this non-trivial). This is
>    the pitch demo.
> 3. **Configurator integration.** Module 1's sliders/scenario matrix become
>    the "select your target future" screen that opens free play.
> 4. **Polish:** onboarding tooltips, keyboard shortcuts, reduced-motion mode,
>    about/methods page that states the five-scale doctrine and links every
>    coefficient source.

**Handoff condition:** a first-time user completes Campaign 2 unassisted in
~15 minutes; methods page renders the full source table.

---

# Phase 6 (optional, post-prototype) — Validation and Methods

- Sensitivity analysis notebook (formerly NB 12): tornado plots of EES
  outcomes vs low-confidence coefficients; report which conclusions are
  robust.
- User study protocol for the citizen-legibility claim (n=8–12 think-aloud
  sessions with the Campaign 2 scenario; this is the dissertation's UX
  evidence).
- E4ST loop-closure: batch-solve the top N player-discovered pathways and
  publish them back into the oracle layer.

---

## Session Order and Dependencies

| Session | Deliverable | Depends on |
|---|---|---|
| 0.1 | County foundation (NB 14) | existing pipeline |
| 0.2 | Action library v3 (NB 15) | 0.1 |
| 0.3 | Engine v2 + golden fixtures (NB 16) | 0.1, 0.2 |
| 1 | TS port + parity | 0.3 (fixtures frozen) |
| 2 | Map surface | 1 |
| 3 | Game loop | 2 |
| 4 | Persistence/replay/compare | 3 |
| 5 | Campaigns + polish | 4 |
| 6 | Validation (optional) | any time after 0.3 |

---

## One Thing to Carry Forward

Before every session, tell Claude Code to read this file,
`data/processed/network_metadata.json`, and (once they exist)
`data/processed/mw_county_ees_summary.csv` and the golden fixtures. The
metadata file is the project's shared memory; the county EES summary is the
prototype's ground truth; the golden fixtures are the parity contract.

The county is the unit of analysis and governance. The bus is the unit of
energy system intervention. The tract is the unit of social measurement. The
ecoregion is the unit of ecological suitability. The material ledger is the
unit of honesty.
