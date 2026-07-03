# TERRA App — Project Map

Purpose of this doc: orient future work on this folder. It describes how the
pieces connect (data → engine → state → UI) so changes can be made in the
right place, not a description of every file.

## What this is

A React + TypeScript web app ("TERRA — County Transition Simulator"): a
county-level energy-transition simulation/game over a 157-county Mountain
West study area. The simulation core is a TypeScript port of an existing
Python engine ("TERRA Engine v2"); the TS engine is required to stay in
numeric parity with the Python reference (see Testing below).

## High-level data flow

```
src/data/*.json  →  src/engine/*  →  src/state/store.ts  →  src/ui/*
 (static inputs)    (pure sim core)   (zustand store)       (React UI)
```

- **src/data/** — static JSON inputs, loaded once at store init.
- **src/engine/** — pure functions only (no React, no mutation of inputs,
  no side effects). This is the simulation: world state in, world state +
  deltas out.
- **src/state/store.ts** — the single zustand store. Wraps every engine call,
  owns UI state, undo/redo, replay mode, comparison mode, and save/load.
  This is the integration point between engine and UI — almost all new
  features touch this file.
- **src/ui/** — map rendering (deck.gl + maplibre) and HUD panels, all
  reading from/dispatching to the store.

## Directory map

- `src/data/` — static inputs (geoid-keyed county data, grid topology,
  action catalog, scenarios/campaigns). See "Data relationships" below for
  how these files relate to each other.
- `src/engine/`
  - `types.ts` — canonical type definitions; mirrors the Python engine's
    state shape and the action-library v3 JSON schema. Start here when
    adding a new field anywhere in the sim.
  - `engine.ts` — core sim functions: `initializeState`, `applyAction`,
    `queueAction`, `advanceYear`, `injectDisturbance`,
    `computeEesSummary`, `getCountyCard`, `getMaterialLedger`,
    `getPathwayConditions`.
  - `budgets.ts` — era resource-budget tracking (capital, labor, materials,
    HALEU, transmission ROW miles per era).
  - `events.ts` — deterministic + stochastic disturbance event generation.
  - `replay.ts` — replays a saved action log to a deterministic state +
    digest, used for save/replay/comparison and import validation.
  - `persistence.ts` — save-slot storage, JSON export/import (storage
    backend is injectable via `StorageAdapter`, currently `localStorage`).
  - `index.ts` — public barrel re-exporting the above for the rest of the
    app.
- `src/state/store.ts` — the zustand store (`useTerraStore`). Holds
  `engineState`, action log, year snapshots (for undo), era budgets, event
  history, quest conditions, replay/comparison state, save slots, and all UI
  selection/layer state. Engine functions are called here and their results
  written back into the store.
- `src/ui/map/` — deck.gl/maplibre layers composed in `MapView.tsx`:
  `CountyLayer`, `BusLayer`, `BranchLayer`, `EcoregionLayer`,
  `CouplingLinks`, `PlacementOverlay` (action-placement UI), `Tooltip`.
- `src/ui/panels/` — HUD panels, e.g. `ActionPalette` (choose/place
  actions), `BuildQueue`, `YearControls`, `EesGauges`, `MetricSelector`,
  `LayerToggle`, `EventLog`, `OraclePanel`, `QuestTracker`,
  `CountyCardDrawer`, `AutoPauseModal`, `SaveLoadPanel`, `ReplayControls`,
  `ComparisonView`, plus debug-only `StressTestPanel` /
  `DebugParityCheck` (shown when URL has `?debug=1`).
- `src/ui/App.tsx` — top-level layout composing the map + all panels. **This
  is the real app shell** (see "Entry point" note below).
- `tests/parity/` — vitest suite validating the TS engine against
  Python-generated golden fixtures.
- `public/` — static assets served as-is (favicon, icon sprite).
- `dist/` — build output of `npm run build` (gitignored; present from a
  prior build, regenerate as needed).

## Data relationships (the important pathways)

`geoid` (county FIPS, e.g. `08001`) is the central key tying these together:

- `county_ees_baseline.json` — per-county baseline E/Ec/S (Energy/Economy/
  Social capital) scores, population, tract counts. 157 counties.
- `county_cards.json` — per-county profile data (demographics, generation
  mix, water use, flagship assets) keyed by `geoid`.
- `county_crosswalk.json` — apportionment table mapping each `geoid` to a
  grid `bus_id` (with `bus_weight`/`primary_bus`) and `ecoregion_code` (with
  `ecoregion_area_share`). This is how county-level state gets mapped onto
  the electrical-grid graph and ecoregions.
- `counties.geojson` / `mw_ecoregions.geojson` — geometry for the map layers,
  joined via `geoid` / `ecoregion_code`.
- `initial_network.json` — starting grid topology: `buses`, `branches`,
  `ba_flows`, `ecoregion_ees`, `study_area_buses`. This is the network the
  engine simulates over.
- `action_library_v3.json` — the catalog of all player actions (generation,
  storage, transmission, demand, nuclear fuel cycle, ecological, social),
  each with coefficients, material requirements, EES effects, and coupling
  rules; also contains `disturbances` and `coupling_rules`. This is the
  largest data file and the main place to add/tune game content.
- `era_budgets.json` — macro resource ceilings per era (2025–2035,
  2035–2045, etc.), checked by `budgets.ts`.
- `scenario_profiles.json` — named scenarios with quest/win conditions
  (e.g. `wyoming_coal_transition`), consumed by `QuestTracker`.
- `campaigns.json` — newer addition: campaign definitions (acts, scenario
  profile links, unlock conditions). Types exist in `engine/types.ts` and
  it's referenced in `store.ts`, but **no UI panel consumes it yet** — this
  is an open integration thread.

## Entry point status — known gap

`index.html` → `src/main.tsx` → `src/App.tsx`. Currently `src/App.tsx` is a
**placeholder** (default Vite scaffold content showing "TERRA County App" /
"157 counties"), not the real app. The full game UI lives in
**`src/ui/App.tsx`** (map + all panels) but is not rendered by `main.tsx`.

The most recent `dist/` build does contain the full UI, so the wiring was
correct at some point and `src/App.tsx` was since reverted/overwritten.
**Before resuming feature work**, point `src/main.tsx` at `src/ui/App.tsx`
(or make `src/App.tsx` re-export it) so `npm run dev` / `npm run build`
reflect the real app.

## Testing & validation

- `npm run test` — vitest, all tests.
- `npm run parity` — runs `tests/parity/`, comparing the TS engine's output
  against Python-generated golden fixtures (`golden-a/b/c`) plus a
  replay-integrity check (`golden_b.json` is duplicated in
  `src/data/` and `tests/parity/fixtures/` — keep both in sync if it
  changes). **Any change to `engine.ts`, `budgets.ts`, or `events.ts` should
  be re-validated against this suite** to preserve parity with the Python
  reference model.

## Tooling notes

- Vite + React 19 + TypeScript + zustand; deck.gl/luma.gl + maplibre-gl for
  the map.
- `vite.config.ts` registers a small plugin so `.geojson` files import as
  JSON modules.
- Path convention: source files use explicit `.js` extensions in relative
  imports (TS/ESM convention for this project) even though the files are
  `.ts`/`.tsx`.

## Suggested next steps

1. Fix the entry-point wiring (`src/App.tsx` → `src/ui/App.tsx`) so the real
   app builds/runs.
2. Wire `campaigns.json` into the UI (likely a campaign-select screen feeding
   `activeScenario`/`questConditions`, alongside or ahead of
   `QuestTracker`).
3. When extending the action library or engine state, update
   `engine/types.ts` first, then `engine.ts`, then regenerate/check parity
   fixtures, then surface in `store.ts` and the relevant panel.
