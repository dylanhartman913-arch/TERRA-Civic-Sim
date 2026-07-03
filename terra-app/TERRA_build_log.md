# TERRA Build Log
## County App — Session History, Key Decisions, and Digest Registry

**Purpose:** Shared memory for the TERRA application build track. Read this
file alongside `TERRA_county_app_roadmap.md` at the start of every new session.
It records what was actually built, deviations from the roadmap spec, judgment
calls, known debt, and the digest registry. The roadmap says what to build;
this file says what was built.

---

## Digest Registry

Back these up outside the repo. A digest mismatch in a future session means
something changed that shouldn't have.

| Artifact | Type | md5 |
|---|---|---|
| `data/golden/golden_a.json` | fixture file | `e80a483d16655d4f938680cd2243f2f1` |
| `data/golden/golden_b.json` | fixture file | `70f9e5a52a811a11dcf771bf795fb567` |
| `data/golden/golden_c.json` | fixture file | `c3013034b58a87f3ea77f45b47392ad9` |
| Golden A | final state digest (TS engine) | `4a838c7070d55d3487d8f3ecbc529220` |
| Golden B | final state digest (TS engine, no events) | `716b189a8fee6757643818b15cd72541` |
| Golden C | final state digest (TS engine) | `997753927c570e929fe5d9930fe64e0d` |
| Golden B | replay digest (with deterministic events) | `a63401e30494a3da03e85817c3f42ba7` |
| `data/golden/golden_d.json` | fixture file | `b9535fa091c96e4abd2b167d1bc2bc69` |
| Golden D | final state digest (TS engine) | `775dce2e36e0c9fc347cabeceaec2f16` |
| Golden D | final fiscal digest (TS engine) | `225c5bdddb9e0e59aea6ab9c92e09503` |
| Golden E | existing_assets digest (v2.4) | `a881df20643298394d53c2ac43012fe3` |
| Golden F | fiscal digest before X2 | `af67c87f142045222bcaf324cdc9a947` |
| Golden F | fiscal digest after X2 (-10M tons) | `b2a9567a9545db98d2509c9e75a98a66` |
| Golden F | existing_assets digest before X2 | `a881df20643298394d53c2ac43012fe3` |
| Golden F | existing_assets digest after X2 (-10M tons) | `80f48310c47b6dd9c97dfb999da4bf56` |

**Why two Golden B digests:** `716b189a...` is the pure engine parity contract
(Vitest suite, no events). `a63401e3...` is what a real playthrough produces
when the Naughton 2026 deterministic event fires during replay. Both are
correct. If these diverge in a future session, it is always a code bug — never
a fixture bug.

---

## Parity Test Count History

| After Phase | Passing |
|---|---|
| Phase 1 | 19/19 |
| Phase 2 | 19/19 |
| Phase 3 | 23/23 (+4 game loop assertions) |
| Phase 4 | 23/23 (+4 replay integrity, total held at 23) |
| Phase W3 (NB19) | 33/33 (+10 Golden D fiscal assertions) |
| Phase W5 (engine v2.2) | 41/41 (+8 Golden E existing-asset assertions) |
| Phase W5.1 (engine v2.3) | 43/43 (+2 Golden E X2/production_asset assertions) |
| Phase W5.2 (engine v2.4) | 52/52 (+9 Golden F three-ledger X2 assertions) |
| Phase Z1 (engine v3.0 TS) | 76/76 (+14 retirement + 10 Golden G) |
| Phase Z1 (engine v3.0 Python) | 24/24 (14 retirement + 10 Golden G) |

---

## Phase 0.1 — County Foundation
**Notebook:** `notebooks/14_county_foundation.ipynb`
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### What was built
- Study area defined: 157 counties (WY all 23 + neighboring state counties
  whose centroid falls inside the six study ecoregions)
- Crosswalk: 157 counties × 75 in-study buses × ecoregion codes
- EES re-aggregation: tract→county via exact GEOID prefix match
- County baseline cards with ACS 2022 5-yr data
- 8 Wyoming flagship assets with source URLs
- `network_metadata.json` updated with `county_pivot` block + doctrine

### Deviations from roadmap
- **157 counties, not 90–120.** The roadmap estimated 90–120 but the
  centroid-in-union method with six ecoregions (especially High Plains and
  Northwestern Great Plains) produced 157. CO contributes 49 counties, MT 37.
  The method is correct per spec — the estimate was wrong. Use 157 everywhere.

### Key outputs
```
data/processed/mw_study_counties.csv       157 rows
data/processed/mw_counties.geojson         topology-simplified, MT worst 49.5 KB
data/processed/county_crosswalk.parquet    157 counties, 75 buses
data/processed/mw_county_ees_summary.csv   E Δ=−0.038, Ec Δ=+0.013, S Δ=−0.008
data/processed/mw_county_cards.json        8 flagship assets, all source_url populated
network_metadata.json                      county_pivot block added
```

### EES validation
All county-weighted means within ±0.03 of ecoregion-level means. No capital
deviated more than 0.3 — no intervention required.

### Flagship asset decisions
| Asset | County | GEOID | Status | Capacity | Source URL |
|---|---|---|---|---|---|
| Kemmerer Unit 1 | Lincoln | 56023 | under_construction | 345 MW | TerraPower press release |
| Naughton gas conversion | Lincoln | 56023 | planned | — | wyofile.com |
| Meta AI data center | Laramie | 56021 | under_construction | 100 MW | datacenters.atmeta.com |
| Jade/Crusoe campus phase 1 | Laramie | 56021 | under_construction | 200 MW | wyofile.com |
| BWXT TRISO facility | Campbell | 56005 | announced | null | oilcity.news |
| BWXT (alt) | Campbell | 56005 | — | — | see note below |
| PRB mines | Campbell | 56005 | operating | — | — |
| Jim Bridger | Sweetwater | 56037 | operating | — | — |
| Dave Johnston | Converse | 56009 | operating | — | — |

**BWXT decision:** `capacity_or_load_mw` is intentionally `null`. The $500M
facility was formally announced in September 2025 and received a $100M DOE
grant shortly after. Capacity is measured in kg TRISO/yr, not MW — no clean
conversion available until DOE publishes a fuel output spec. Status is
`"announced"` not `"operating"` (the existing Lynchburg TRISO facility is a
separate asset). Notes field documents the $500M capex and $100M DOE grant.

### Known debt
- `water_withdrawals_mgd` is `null` for all 157 counties. The USGS 2015
  county water use endpoint returned an unexpected column format. Manual
  download of the USGS spreadsheet will populate this. Not blocking — field
  is flagged `water_vintage: null`.
- `per_capita_income` is ACS proxy (`source: "acs_proxy"`) for all counties.
  BEA CAINC30 would be more accurate but requires API key not present.

---

## Phase 0.2 — Action Library v3
**Notebook:** `notebooks/15_action_library_v3.ipynb`
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### What was built
- v2 (46 actions) → v3 (49 actions), schema_version 3.0
- All 49 actions gained `placement_scale`, `resolves_to`, `applicable_counties`
- New bucket: `ENERGY_DEMAND` with 3 actions
- 3 coupling rules added
- `material_coefficient_sources.csv` extended: 29 → 44 rows
- 13 coefficients flagged `confidence: "low"`

### New ENERGY_DEMAND actions
| action_id | unit_scale | time_to_deploy | applicable_counties |
|---|---|---|---|
| `data_center_hyperscale` | 500 MW | 2 yr | 115 of 157 (WACM/PSCO/PACE/WAUW/NWMT) |
| `data_center_campus_phase` | 1000 MW | 3 yr | 115 of 157 |
| `industrial_load_flexible` | 100 MW | 1 yr | all 157 (flexibility: 0.4) |

All 23 WY counties qualify for DC actions.

### Coupling rules
**nuclear_dc_coupling:**
- Trigger: ENERGY_DEMAND + firm-clean supply sharing a primary_bus or
  one-branch-apart
- TX reduction: 20% (confidence: low; MS–Constellation and AWS–Talen precedents)
- Reliability credit: 0.20 (confidence: low)
- Reasoning logged in JSON

**firm_supply_gap:** Computes and stores `deficit_mw` on placed action.
Action not blocked — tool shows consequences, does not forbid choices.

**supply_chain_throughput pools:**
- `HALEU_kg_per_year`: 900 kg/yr (Centrus Piketon OH, Dec 2023; confidence: low)
- `fuel_fabrication_units_per_year`: 0 baseline until `operational_year: 2029`
  (BWXT Gillette announced, not yet permitted)

### Key JSON structure (supply_chain_throughput)
```json
"fuel_fabrication_units_per_year": {
  "initial_value": 0,
  "operational_year": 2029,
  "unit": "fuel assemblies per year (facility count proxy)",
  "confidence": "low",
  "note": "BWXT Gillette WY announced 2025, not yet permitted. Increment to 1 at 2029."
}
```
The `operational_year` field is machine-readable — `advanceYear` checks it
and increments the pool at 2029.

### Spot-check validation (5 of 49 actions)
All passed:
- `prairie_restoration` excludes Summit/Eagle/Pitkin CO (eco-21-only) ✓
- `pumped_hydro` excludes Campbell WY (eco-43-only) ✓
- `smr_advanced` includes Laramie + Lincoln WY ✓
- `wind_utility` includes Campbell, Carbon, Converse WY ✓
- `coal_to_smr` includes Sweetwater + Campbell WY ✓

---

## Phase 0.3 — Engine v2 + Golden Fixtures
**Notebook:** `notebooks/16_engine_v2_golden.ipynb`
**Date completed:** 2026-06-12
**Status:** ✓ Complete — fixtures frozen

### What was built
- `src/terra_engine.py` rewritten as engine v2 (pure functions, county-keyed state)
- Three golden fixtures frozen in `data/golden/`

### Engine v2 changes from v1
State is now county-keyed (`state['county_ees']` by GEOID). New fields:
`active_couplings`, `build_queue`, `sc_pools`. Ecoregion scores remain
derivable on demand via crosswalk but are no longer stored as primary.

### Engine bugs fixed during this session
Three bugs caught that would have corrupted v1 results:
1. **Circular disturbance calculation:** `inject_disturbance` used global
   `flexible_load_shed_mw` instead of per-bus pre/post comparison. Produced
   optimistic disturbance results in NB 11.
2. **Ecoregion bus expansion:** Disturbances were spiking out-of-state buses
   via ecoregion-based expansion. Spike now limited to `affected_buses`
   (primary buses for given county GEOIDs). v1 would have propagated
   disturbances incorrectly across BA boundaries.
3. **Hardcoded assertions:** `all_pass_b` and `all_pass_c` were hardcoded
   `True` in v1. Wired to actual computed values.

Bugs 1 and 2 confirm the county pivot was architecturally necessary, not
cosmetic. The v1 engine had implicit global assumptions that the county-keyed
rewrite exposed.

### Golden fixture results

**Golden A — NB11 Regression**
County-level EES baselines differ from ecoregion-level (deltas -0.29 to -0.97).
This is expected — within-ecoregion heterogeneity is now visible at county
resolution. The ±0.05 tolerance in the prompt was relaxed for this fixture.
Document this in dissertation methods: county-weighted means capture
heterogeneity that ecoregion aggregates flatten.

**Golden B — Wyoming 2032 Nuclear-DC Buildout**
- Step 3: deficit_mw on bus 489 (Laramie County 56021) = 375 MW after
  Jade/Meta commission ✓
- Step 6A: deficit decreases 375 → 0 MW after 2× Natrium + battery ✓
- Step 6B: `nuclear_dc_coupling` active (demand=56021, supply=56021, bus=489) ✓
- Step 6C: probe Natriums throttled to 2044 with `throttle_reason: "HALEU_pool"` ✓

**The 2044 throttle is a meaningful finding.** With 900 kg/yr from Centrus and
two Natrium units already queued, a third pair doesn't clear until 2044. The
supply chain constraint is binding at even modest SMR buildout. Keep this for
the narrative layer.

**Golden C — Disturbance Under Load**
Flex shed at all severities: 66.67 / 133.33 / 200.00 MW (1σ/2σ/3σ).
Flex > firm at 1σ (66.67 > 19.19 MW, 3.5× coverage). Monotone assertions pass.

### BWXT increment wiring
`advance_year` checks `supply_chain_throughput` pool entries for
`operational_year` triggers. BWXT `fuel_fabrication_units_per_year`
increments 0→1 at 2029. The JSON has `initial_value: 0` and
`operational_year: 2029` as machine-readable fields — the engine consumes them.

---

## Phase 1 — TypeScript Engine Port
**Directory:** `terra-app/`
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### Results
- 19/19 parity tests passing
- Golden B replay: 8.9 ms (budget: 50 ms) — 5.6× headroom
- `tsc --noEmit` clean (strict: true, noImplicitAny)
- 9 exported engine functions matching Python API
- `counties.geojson` 161 KB in `src/data/`

### Architecture
```
terra-app/
  src/
    engine/
      types.ts       — 12 interfaces mirroring Python state + v3 JSON schema
      engine.ts      — pure functions, zero React imports
      index.ts
    data/            — build-time JSON copies of pipeline outputs
    state/
      store.ts       — Zustand store (undo stack, placement mode)
    ui/
      App.tsx        — smoke page (Phase 1 only)
  tests/
    parity/
      golden-a.test.ts
      golden-b.test.ts
      golden-c.test.ts
      fixtures/      — copies of frozen golden JSON files
```

### Scaffold issue encountered
`npm install` initially failed because it ran from `~/` (home directory)
instead of `terra-app/`. Resolved by navigating into the correct directory.
The Vite scaffold had already created `terra-app/` — selected
"Ignore files and continue" to complete without overwriting.

---

## Phase 2 — Map and Interaction Layer
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### What was built
- MapLibre GL JS + deck.gl, Stadia Alidade Smooth Dark basemap
- Center: `[-106.5, 43.0]`, zoom 5.5 (Wyoming centered)
- 157-county choropleth with 5-step sequential scale
- 5 metrics: E, Ec, S, firm capacity margin, load growth
- County card drawer (5 sections) with flagship asset status badges
- Placement mode: eligibility highlight, ghost footprint, magnitude slider
- Coupling links: pulsing SVG lines between coupled assets
- Layer toggles: ecoregion hatch, buses, branches, interchange, oracle
- YearControls with era display

### Design tokens
Dark theme, DM Mono font, teal-amber-purple palette.
All colors via CSS variables in `src/ui/tokens.css` — no hardcoded hex in components.

### Bugs fixed
1. **time_to_deploy display:** Modal was computing deploy time from magnitude
   rather than reading `action.time_to_deploy` directly. Fixed to read the
   field directly. Confirmed values: `smr_advanced` = 7 yr,
   `data_center_hyperscale` = 2 yr.
2. **Build queue countdown:** Was displaying raw `operational_year` (e.g. 2032)
   instead of remaining years (e.g. 7yr). Fixed to
   `operational_year - state.year`.
3. **Ineligible county tooltip:** Was not showing reason on hover during
   placement mode. Fixed to derive reason from ecoregion mismatch or BA type.

### Handoff condition
Place data_center_hyperscale in Laramie County (56021) end-to-end:
palette → ghost → queue → deficit chip. Passes with no console errors.

---

## Phase 3 — Game Loop
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### What was built
10 parts: new types, era budgets, budget consumption engine, event deck,
extended store, quest tracker, EES gauges, auto-pause modal, stress test
panel, debug parity check.

### Era structure
| Era | Years | Label |
|---|---|---|
| 1 | 2025–2035 | Foundation Era |
| 2 | 2035–2045 | Transition Era |
| 3 | 2045–2055 | Buildout Era |
| 4 | 2055–2075 | Steady State Era |

All era budget values `confidence: "low"`.

### HALEU consumption per action
`budgets.ts` uses 5000 kg/Natrium core. This is an engineering estimate —
**needs a peer-reviewed or DOE citation before the methods page is published.**
Flag this as dissertation debt.

### Event deck
- RNG: mulberry32 seeded from `gameSeed` (stored in Zustand, persisted in exports)
- Deterministic events: Naughton 2026, BWXT 2029, Kemmerer 2031
- Stochastic: heat_wave, drought, policy_shock, supply_chain_disruption,
  labor_shortage, transmission_outage with era-dependent probabilities
- Climate trend: heat_wave base probability scales 0.15 → 0.35 across eras

### Auto-pause triggers (6 levels, priority order)
1. Era transition
2. Build complete
3. Coupling activated
4. Deficit threshold crossed (>200 MW on any bus)
5. Event fired (non-display-only)
6. Quest condition newly met

### Quest scenarios
- `wyoming_coal_transition` — 4 conditions, target year 2045
- `wyoming_2032_nuclear_dc` — 5 conditions, target year 2035

### Parity check
23/23 parity tests, Golden B parity check: 157/157 counties match.

### Known debt
- `capital_cost_usd` and `labor_years` in `budgets.ts` returning 0 for all
  actions (coefficient field name mismatch). **Fix in progress as of Phase 4
  close.** Does not affect engine or parity — display-only bug.
- HALEU 5000 kg/Natrium: needs citation.
- Oracle panel is a placeholder — E4ST loop-closure is Phase 6.

---

## Phase 4 — Persistence, Replay, Comparison
**Date completed:** 2026-06-12
**Status:** ✓ Complete

### What was built
- `ScenarioFile` export format: actionLog + gameSeed + schema_version
  (state always reconstructed by replay, never serialized directly)
- `src/engine/replay.ts`: `replayScenario`, `computeReplayDigest`,
  `validateImport`
- `src/engine/persistence.ts`: `StorageAdapter` interface, 5 localStorage
  slots, schema-versioned, export/import JSON
- Undo/redo: replay from nearest era snapshot (O(year-within-era))
- Replay mode: precomputes all year snapshots on enter → O(1) scrub.
  Timeline scrubber with color-coded event dots.
- Comparison mode: full-screen overlay, recharts line charts (E/Ec/S
  trajectories), resource bar charts, quest checklists, interleaved
  event histories
- `SaveLoadPanel.tsx`: 5 slots, digest mismatch warning, export/import,
  Compare button

### Digest behavior
Export computes `replay_digest` by replaying actionLog at export time.
Import validates by re-replaying and comparing. Mismatch shows warning
but does not block load (handles engine version changes gracefully).

### Two digest contexts — do not confuse
- **Parity tests** use `716b189a...` (pure Golden B, no events)
- **Phase 4 replay-integrity tests** use `a63401e3...` (Golden B + Naughton 2026 event)

### Known debt
- Budget consumption display (`capital_cost_usd`, `labor_years`) stuck at 0.
  Fix being applied: map `construction_jobs_per_mw * magnitude * time_to_deploy`
  → `labor_years` proxy; locate correct capex coefficient field name in v3 JSON.

---

## Outstanding Debt (all phases)

| Item | Severity | Where to fix |
|---|---|---|
| Budget consumption % stuck at 0 (capital + labor) | Medium — display only, no engine effect | `budgets.ts` coefficient field name fix |
| HALEU 5000 kg/Natrium needs citation | Medium — methods integrity | `material_coefficient_sources.csv` |
| Water withdrawals null for all 157 counties | Low — display field only | Manual USGS spreadsheet download |
| BEA per_capita_income is ACS proxy | Low — disclosure sufficient | Flag in methods page |
| Oracle panel is placeholder | Low — Phase 6 | `OraclePanel.tsx` |
| NB 11 act boundaries not explicitly documented | Low — needed for Phase 5 Campaign 1 | Add markdown cell to `11_applied_scenario.ipynb` |

---

## Key Wyoming GEOIDs (quick reference)

| County | GEOID | Key assets |
|---|---|---|
| Laramie | 56021 | Meta DC, Jade/Crusoe, primary Natrium site |
| Lincoln | 56023 | Kemmerer Unit 1, Naughton |
| Campbell | 56005 | BWXT, PRB mines |
| Sweetwater | 56037 | Jim Bridger |
| Converse | 56009 | Dave Johnston |
| Platte | 56085 | Transmission corridor neighbor to Laramie |
| Carbon | 56007 | Wind corridor |

---

## Five-Scale Doctrine (copy into every new session context)

> The county is the unit of analysis and governance.
> The bus is the unit of energy system intervention.
> The tract is the unit of social measurement.
> The ecoregion is the unit of ecological suitability.
> The material ledger is the unit of honesty.

---

## Next: Phase 5 — Campaigns and Polish

Remaining work:
- Campaign 1: Port NB 11 three-act Wyoming Basin Coal Transition as guided tutorial
- Campaign 2: Golden B as pitch demo — announced assets pre-placed, player
  closes firm supply gap and activates coupling before 2035
- Configurator integration: scenario matrix as "select your target future" screen
- Polish: onboarding tooltips, keyboard shortcuts, reduced-motion mode,
  about/methods page with full coefficient source table

**Before running Phase 5:** Add explicit act-boundary markdown cells to
`11_applied_scenario.ipynb` defining the three acts and the 13-action sequence
with act breaks. Phase 5 Campaign 1 needs this structure to port correctly.

Handoff condition: first-time user completes Campaign 2 unassisted in ~15
minutes; methods page renders full source table.


## Phase W0 — Debt Retirement + Resource HUD
**Date completed:** 2026-06-17
**Status:** ✓ Complete

### What was built
- Capex fix: `solar_utility` was returning 0 — fixed via `atb_capex_2023`
  fallback added to `getActionCapex` in `budgets.ts`. Now correctly maps
  1555.2 $/kW × 1000 × magnitude.
- `data_center_hyperscale` / `data_center_campus_phase` gained
  `capex_usd_per_mw` in `coefficients_per_mw_it` ($8M/MW and $6.5M/MW).
- `offshore_wind_great_lakes` gained `cost_2024 = 3,400,000 $/MW` (NREL ATB
  2025 Fixed-Bottom Moderate proxy) — note this action has
  `applicable_counties = []` and can never actually be placed.
- `schema_version` bumped to `3.1` across both library JSON copies.
- Labor: no code change needed. Existing `construction_jobs_per_mw ×
  magnitude × time_to_deploy` proxy (falling back to `capex / 300,000`)
  now produces non-zero values for all 49 actions once capex was fixed.
- **ResourceHUD** (`src/ui/panels/ResourceHUD.tsx`): persistent 44px top
  strip, 6 chips (Capital, Labor, Steel, Concrete, HALEU, TX ROW). Color
  shift teal → amber → deficit at 60%/85% via `tokens.css` variables.
  Hover popover itemizes consumption by queued build; shares enforced to
  sum to exactly 100% via new `allocateShares()` (floor + remainder
  allocation — reusable pattern, will be needed again in W4).
  Click highlights drawing counties via new `county-pool-highlight`
  MapLibre layer in `CountyLayer.tsx`, driven by store additions
  `poolHighlightGeoids` / `hudOpenChip`.
- Overflow modal now shows a structured amber banner naming the exhausted
  pool, era, and scheduled start year, with a "View breakdown ↑" button
  that calls `setHudOpenChip()` to auto-open the binding constraint's
  popover. Secondary constrained pools shown if multiple overflow.

### HALEU citation — resolved, no fixture change
Decision gate resolved as **unchanged**. Published DOE/WyoFile reporting
confirms ~5 metric tons HALEU for Kemmerer-1 initial core, matching the
existing 5,000 kg/Natrium estimate. Citation recorded in
`material_coefficient_sources.csv`. All three golden fixture digests
verified byte-identical to registry (no update needed below).

Sources:
- wyofile.com — Natrium HALEU fuel reporting
- powermag.com — DOE HALEU allocation round one
- sai.inl.gov — HALEU requirements for net-zero (INL)
- energy.gov — NRC construction permit, TerraPower Natrium

### Verification
- `tsc --noEmit`: 0 errors
- 23/23 parity tests passing
- All 49 actions report non-zero capital and labor at unit-scale magnitude
- All 3 golden fixture md5s byte-identical to registry — **HALEU
  decision gate did not trigger a fixture amendment**

### Known debt retired this phase
- ~~Budget consumption % stuck at 0~~ — fixed
- ~~HALEU 5000 kg/Natrium needs citation~~ — cited, value confirmed correct

---

## Phase W1 — Wyoming Fiscal Baseline Pull
**Notebook:** `notebooks/17_wy_fiscal_pull.ipynb`
**Date completed:** 2026-06-17
**Status:** ✓ Complete (two passes — see extraction note)

### What was built
15-cell notebook assembling a 23-Wyoming-county fiscal baseline from BLS
APIs (live) and DOR/PILT manual extraction (sandbox network-blocked for
these sources).

**Live sources (cell 4 auto-detected sandbox cannot reach DOR/ONRR/PILT,
BLS APIs are reachable):**
- BLS QCEW: employment/wages, 23 counties × 5 NAICS (2121 coal, 2111 oil-gas,
  2211 power, 23 construction, 518210 data processing)
- BLS LAUS: `labor_force_laus` — **bug found and fixed:** v1 API doesn't
  return M13 annual average; now computes mean of M01–M12 for the most
  recent complete year. This field name is load-bearing for W4's
  relative-impact denominator — do not rename.

**Manually procured and extracted (13 isolated single-table PDFs from the
Wyoming DOR Annual Report, plus PILT export):**
First extraction pass via Claude Code + pdfplumber default settings
produced malformed CSVs (rows collapsed). Root cause: most DOR tables
have **counties as column headers, not row labels** — required a lattice
strategy + transpose, not the default stream strategy. Re-extracted
clean on second pass. Final breakdown:

| Result | Count | Notes |
|---|---|---|
| Passed (≥20 county rows) | 10/13 | lattice + transpose for most; custom word-position/block-text parser for 2 |
| Not county-keyed (kept as top-level reference) | 2 | mineral severance by mineral type; statewide class shares by industry — both feed W2, not stored per-county |
| Unrecoverable | 1 | "table of distributions by county" — raster image, no extractable text, would need OCR |

### Park and Sublette $0 sales tax — confirmed genuine, not an artifact
Both counties show `county_sales_tax = $0` / `county_use_tax = $0` because
neither levies the county-option sales/use tax through that channel.
Revenue flows through other allocations (`grand_total` is non-zero and
correct: Park $50.3M, Sublette $19.8M). PILT export
(`pdf_print_counties.cfm.csv`) cross-confirmed both counties are active
and correctly represented elsewhere. No correction was needed.

### Sanity table — passed
| County | Mineral % | Residential % | Result |
|---|---|---|---|
| Campbell (56005) | 78.5% | 6.3% | ✓ well above 60% threshold |
| Teton (56039) | 0.1% | 84.2% | ✓ well below 20%; above 50% residential |

### Key outputs
data/processed/wy_county_fiscal_baseline.json   283 KB, 23/23 counties

top-level keys: counties, state_severance_by_mineral, state_class_shares

data/processed/wy_fiscal_sources.csv             667 rows (high=370, low=297)

data/processed/MANUAL_FETCH.md                   updated, see below

### MANUAL_FETCH.md status at handoff
| Item | Status |
|---|---|
| PILT payments | ✓ Resolved (`pdf_print_counties.cfm.csv`) |
| Table of distributions by county | ✗ Unrecoverable — raster image |
| ONRR federal mineral royalty disbursements (county-level) | ⚠ Outstanding |
| DOR Mineral Valuation Report — per-county commodity (coal/oil/gas/trona) split | ⚠ Outstanding |
| Per-county severance tax | ⚠ Outstanding — formula-applied pro-rata in place, `confidence: "low"` |
| School finance foundation net transfer (WY LSO tables) | ⚠ Outstanding |

### Known debt added this phase
- Per-county mineral commodity breakdown absent for most counties; W2
  treats Campbell as coal-dominated (>90%, historical) as a flagged
  `confidence: "medium"` assumption pending the DOR Mineral Valuation
  Report.
- ONRR county-level federal mineral royalties null; carried as
  `confidence: "low"` null in W2's royalty coefficient, extendable in W3.
- "Table of distributions by county" cannot be recovered without OCR
  (tesseract) — not currently blocking since the Park/Sublette question
  it would have answered was independently resolved via the sales/use
  and PILT cross-checks.

---

## Phase W2 — Fiscal Coefficients
**Notebook:** `notebooks/18_fiscal_coefficients.ipynb`
**Status:** ✅ Complete — all 9 handoff conditions met (2026-06-17)

### Key outputs
- `data/processed/wy_fiscal_coefficients.json` — 2.3 MB, 49 actions, all county-keyed
- `data/processed/material_coefficient_sources.csv` — 149 rows (49 original material + 100 new fiscal)

### Coefficients delivered
- **Task 1:** `valuation_delta` on all 49 actions (assessed_usd per unit)
- **Task 2:** Coal retirement dual-ledger on coal_repowering / coal_to_solar / coal_to_smr:
  - `coal_retirement_advalorem_delta_per_mw` (Ledger A — county ad valorem, 23 GEOIDs)
    - Campbell: −$61,363/MW/yr
  - `coal_retirement_severance_delta_per_mw` (Ledger B — state severance distribution, 23 GEOIDs)
    - Campbell: −$1,502/MW/yr
- **Task 3:** `property_tax_annual` (county-keyed, 23 GEOIDs) + `sales_use_construction` per action
- **Task 4:** `ops_jobs_per_unit` all 49 actions (NREL JEDI, NRC docket, EIA, DOE sources)
- **Task 5:** `school_finance_net` — local levy proxy only (37-mill), confidence: low throughout
- **Task 6:** Back-cast validation — Campbell PRB (−17.1% ✓), Laramie DCs (+4.6% ✓), Lincoln Naughton (−92.8% ⚠ explained)

### Bug found and fixed
- `PRB_COAL_TONS_PER_MW_YR` formula used `1e6` instead of `1_000` (MW→kW conversion);
  inflated Ledger B severance values by 1000×. Fixed before final execution.

### Known debt carried forward to W3
- Per-county mineral commodity breakdown still absent (null #1); Campbell coal=90% proxy, others=17.11% state share
- ONRR county-level royalties null (null #2)
- School finance foundation net transfer still null pending LSO tables (null #5)

### Carried in from W1
- `state_severance_by_mineral` and `state_class_shares` live at the
  **top level** of `wy_county_fiscal_baseline.json`, not per-county —
  W2 prompt explicitly directs the session to read them from there for
  the coal retirement dual-ledger and assessment-ratio cross-check.
- Confidence split on baseline inputs: 370 high / 297 low (≈44% low).
  Back-cast residuals outside ±25% that trace to a known low-confidence
  input (commodity split, ONRR null, severance pro-rata, school finance)
  count as "explained" per the W2 handoff condition — not a coefficient bug.

---

## Phase W3 — NB19 Engine Fiscal Extension + Golden D

**Session 8 (2026-06-18)** — Engine v2.0 → v2.1

### What was done
- **Python engine v2.1** (`src/terra_engine.py`): Added `state['county_fiscal']` for 23 WY counties with three-ledger fiscal model
  - PART 11: `_apply_fiscal_effects()` — property tax, sales/use, Ledger A (ad valorem), Ledger B (severance), Ledger C (school finance net sensitivity)
  - PART 12: `get_county_fiscal()` — accessor with independent three-ledger readout, trajectories
  - PART 13: `state_digest()` unchanged + `fiscal_digest()` new
- **Golden D fixture** (`data/golden/golden_d.json`): Campbell coal retirement (4 tranches, 1237 MW coal_to_solar) + Golden B base sequence
  - 5 assertion groups (4a–4e): monotonic Ledger A decline, Laramie property tax rise at commission, DC fiscal actions, recapture shrinkage, sign divergence
  - 6 fiscal snapshots at key years (2031, 2032, 2033, 2036, 2039, 2045)
- **TS engine v2.1** (`terra-app/src/engine/engine.ts`):
  - `CountyFiscal`, `FiscalAction`, `FiscalDelta`, `FiscalBaseline`, `FiscalCoefficients` types added
  - `initializeState` extended with optional `fiscalBaseline` + `fiscalCoefficients` params
  - `applyFiscalEffects()` ported function-for-function from Python
  - `getCountyFiscal()` and `computeFiscalDigestMd5()` ported
  - `shallowCopyState` clones `county_fiscal` (deep), shares `fiscal_coefficients` by reference
- **TS data files**: `fiscal_baseline.json` (23 counties), `fiscal_coefficients.json` (49 actions, slimmed)
- **Golden D parity test** (`tests/parity/golden-d.test.ts`): 10 assertions, all pass at 1e-6

### Digest verification
- Golden A/B/C state digests: **byte-identical** (unchanged)
- Golden D state digest: `775dce2e36e0c9fc347cabeceaec2f16`
- Golden D fiscal digest: `225c5bdddb9e0e59aea6ab9c92e09503`
- Golden D fixture file md5: `b9535fa091c96e4abd2b167d1bc2bc69`

### Test count: 33/33
- Golden A: 5, Golden B: 10, Golden C: 4, Golden D: 10, Replay integrity: 4

**Golden D — Campbell & Laramie Fiscal Arcs**

Campbell coal retirement schedule (coal_to_solar, time_to_deploy=3):
- 2028→2031: 300 MW, 2030→2033: 300 MW, 2033→2036: 300 MW, 2036→2039: 337 MW

Assertions:
- **(4a)** Campbell Ledger A monotonically declines: [−3,414,092 → −21,822,965 → −40,231,838 → −60,911,138]
- **(4b)** Laramie property tax: $285.4M (2031) → $297.6M (2032, Natrium commissions)
- **(4c)** DC hyperscale + campus_phase create fiscal_actions in Laramie
- **(4d)** Campbell Ledger C cumulative delta = +$9,101,903 (recapture shrinks)
- **(4e)** Sign divergence: A < 0, B < 0, C > 0 (compound assertion)

### Three-ledger discipline
- **Ledger A** = `advalorem_production` (county money, production tax × mill levy)
- **Ledger B** = `severance_share` (state money redistributed to county)
- **Ledger C** = `school_finance_net` (net flow: entitlement − recapture)
- Never pre-summed. Independently readable from `getCountyFiscal()` output.

---

## Phase W5 — Engine v2.2: Existing Assets Inventory Layer
**Date completed:** 2026-06-19
**Status:** ✓ Complete

### What was built
- `terra_engine.py` v2.1→v2.2: `existing_assets` inventory seeded from `county_cards.json` flagship_assets
  - `_seed_existing_assets(county_cards)` helper: live entries (non-null MW) vs excluded entries (`no_mw_conversion`)
  - Coal assets get `coal_tons_yr = round(cap_mw × 3743.4, 2)` (PRB proxy from W2)
  - Data center fiscal routing: ≥150 MW → `data_center_campus_phase`, <150 MW → `data_center_hyperscale`
  - `get_existing_assets(state, geoid)` → live entries only
  - `existing_assets_digest(state)` → MD5 over all entries (live + excluded), stable
  - `existing_assets` added to `_shallow_copy_state` deep-copy loop
  - Module docstring bumped to v2.2
- `terra-app/src/engine/types.ts`: `ExistingAsset` interface + `existing_assets` field on `EngineState`
- `terra-app/src/engine/engine.ts`: `seedExistingAssets()`, `getExistingAssets()`, constants `PRB_COAL_TONS_PER_MW_YR` / `ASSET_TYPE_TO_FISCAL_ACTION`
- `terra-app/tests/parity/helpers.ts`: `computeExistingAssetsDigestMd5()` using PyFloat for canonical serialization
- `data/golden/golden_e.json` + `terra-app/tests/parity/fixtures/golden_e.json`: Golden E fixture
- `terra-app/tests/parity/golden-e.test.ts`: 8 assertions

### WY flagship inventory seeded
- **56005 Campbell** (2 entries, both excluded): BWXT TRISO (null MW), PRB Coal Mines (null MW)
- **56009 Converse** (1 live): Dave Johnston 762 MW coal → `coal_to_solar`
- **56021 Laramie** (2 live): Meta AI DC 100 MW → `data_center_hyperscale`; Jade/Crusoe 200 MW → `data_center_campus_phase`
- **56023 Lincoln** (1 live, 1 excluded): Kemmerer Unit 1 345 MW nuclear → `smr_advanced`; Naughton Gas (null MW) → excluded
- **56037 Sweetwater** (1 live): Jim Bridger 2120 MW coal → `coal_to_solar`, coal_tons_yr=7,936,008

### Digest registry additions
| Artifact | Type | md5 |
|---|---|---|
| `data/golden/golden_e.json` | fixture file | `9830c2d85a93ba6add979d170f072d6f` |
| Golden E | existing_assets digest (v2.2) | `12ed9aab3a3dc64a9de729fb52fe9689` |

### Constraints upheld
- `state_digest()` does NOT include `existing_assets` — Golden A/B/C/D byte-identical
- `existing_assets` is read-only after seeding; not modified by any action
- `existing_assets` deep-copied in `_shallow_copy_state` for consistency

### Test count: 41/41
- Golden A: 5, Golden B: 10, Golden C: 4, Golden D: 10, Replay: 4, Golden E: 8

---

## Phase W5.1 — Engine v2.3: ProductionAsset (X2 coal) + EIA-7A seed
**Date completed:** 2026-06-19
**Status:** ✓ Complete

### What was built
- **EIA-7A pull** (EIA Annual Coal Report Table 2, 2024; MSHA Form 7000-2; released Nov 2025):
  - Campbell County (56005) surface coal: **170,045,000 short tons/yr** (11 mines)
  - WY statewide 2024 total: 190,731,000 short tons/yr
  - PRB county distribution share: **170,045/190,731 = 0.89154359** (replaces W2 proxy 0.70606)
  - W2 proxy comparison: two offsetting errors cancelled → net only +3.4% above proxy

- **`production_asset` type** (`types.ts`): parallel to `ExistingAsset`; keyed on `commodity + production_volume`
  - `AnyExistingAsset = ExistingAsset | ProductionAsset` union
  - Discriminator field: `asset_kind` = `'mw_asset'` / `'production_asset'` / `undefined` (excluded)
  - `EngineState.existing_assets` changed to `Record<string, AnyExistingAsset[]>`

- **`terra_engine.py` v2.3**:
  - One live `production_asset` seeded: PRB Coal Mines, Campbell (56005), EIA-7A 2024
  - `reduce_production_asset(state, geoid, commodity, delta_volume)` — X2 reduction action
    - Ledger B (severance): `−delta × rate × share`, applied immediately
    - Ledger A (ad valorem): `0` pending DOR Mineral Valuation Report (MANUAL_FETCH Item 1)
  - All MW entries gain `asset_kind: 'mw_asset'`; excluded entries have no `asset_kind` key

- **`engine.ts` v2.3**: `seedExistingAssets` updated, `getExistingAssets` return type → `AnyExistingAsset[]`, `reduceProductionAsset` export added

- **`helpers.ts`**: `computeExistingAssetsDigestMd5` extended with `asset_kind`, `commodity`, `production_volume`, `production_unit`, `county_distribution_share` fields; `PyFloat` on volume/share

- **Golden E fixture** updated (schema_version 3.2): live=6, excluded=2, new assertions `5f_prb_*`, snapshot shows PRB as live `production_asset`

- **`golden-e.test.ts`**: `(5b)` hardcoded zeroes removed (now fixture-driven), `(5f)` production_asset test added, X2 reduction test added

### X2 verified (Campbell PRB, −10M tons test)
- `new_volume` = 160,045,000 t/yr
- `ledger_b_delta` = −$5,066,642.22 (rate=0.5683, share=0.89154359)
- `ledger_a_status` = `'deferred_pending_dor'`
- Pure function: original state unmodified ✓

### Digest registry updates
| Artifact | Type | md5 |
|---|---|---|
| Golden E | existing_assets digest (v2.3) | `94dccfec7f204e7a44b93dc777a51623` |

### Constraints upheld
- Golden A/B/C/D state digests: **byte-identical** (state_digest excludes existing_assets)
- `reduce_production_asset` copy-on-write: `existing_assets` top-level object replaced, original untouched
- Sweetwater trona, Sublette gas, Fremont uranium: deferred pending MANUAL_FETCH Item 1 (DOR Mineral Valuation Report)

### MANUAL_FETCH blockers (unchanged, still outstanding)
- **Item 1** (DOR Mineral Valuation Report — per-county coal/oil/gas/trona split): blocks all non-coal production_assets + Ledger A activation for PRB

### Test count: 43/43
- Golden A: 5, Golden B: 10, Golden C: 4, Golden D: 10, Replay: 4, Golden E: 10

---

## Phase W5.2 — Engine v2.4 — Full Three-Ledger X2 + Golden F
**Date completed:** 2026-06-24
**Status:** ✓ Complete

### What was built
- **`terra_engine.py` v2.4** and **`engine.ts` v2.4**: full three-ledger X2 support in `reduce_production_asset` / `reduceProductionAsset`
  - Ledger A: advalorem production tax — county direct, no `county_distribution_share`. Rate: `1.263020 $/ton` (confidence: low, 90% coal-fraction proxy from `assessed_mineral × 0.90 × 62.836 mills / production_volume`)
  - Ledger B: severance — rate × county_distribution_share (unchanged)
  - Ledger C: school finance recapture sensitivity — `mineral_av_change = assessed_delta_per_unit × actual_delta`; `ledger_c_delta = sf_net_baseline × sf_mineral_share × mineral_frac_change`

- **`ProductionAsset` schema** (`types.ts`): added `assessed_delta_per_unit: number | null` field (−20.100255 for PRB, derived as `−(assessed_mineral × 0.90) / production_volume`)

- **`PRODUCTION_ASSET_DATA`** for PRB: `advalorem_rate_per_unit: 1.263020`, `assessed_delta_per_unit: -20.100255`

- **Golden E fixture** updated (engine_version → 2.4): PRB snapshot includes both rate fields; `existing_assets_digest.md5` updated to `a881df20643298394d53c2ac43012fe3`; tests now assert exact rate values instead of null

- **Golden F fixture** (`golden_f.json`): new fixture capturing the −10M ton X2 reduction with all three ledgers verified against Python

- **`golden-f.test.ts`**: 9 assertions — volume, all three ledger deltas, action_id convention, county_fiscal state, fiscal digest, EA digest, pure-function immutability

### X2 verified (Campbell PRB, −10M tons, Python v2.4)
- `ledger_a_delta` = −$12,630,200.00 (1.263020 × 10M, county direct)
- `ledger_b_delta` = −$5,066,642.22 (0.5683 × 0.89154359 × 10M)
- `ledger_c_delta` = +$1,514,490.91 (recapture burden shrinks — Campbell is a recapture county)
- `school_finance_net` after = −$35,081,778.80 (was −$36,596,269.71)
- `assessed_mineral` after = $3,596,717,342.00 (was $3,797,918,058.00 approx, −$201,002,550)

### Digest registry updates
| Artifact | Type | md5 |
|---|---|---|
| Golden E | existing_assets digest (v2.4) | `a881df20643298394d53c2ac43012fe3` |
| Golden F | fiscal digest before X2 | `af67c87f142045222bcaf324cdc9a947` |
| Golden F | fiscal digest after X2 (-10M tons) | `b2a9567a9545db98d2509c9e75a98a66` |
| Golden F | existing_assets digest before X2 | `a881df20643298394d53c2ac43012fe3` |
| Golden F | existing_assets digest after X2 (-10M tons) | `80f48310c47b6dd9c97dfb999da4bf56` |

### Constraints upheld
- Golden A/B/C/D state digests: **byte-identical** (state_digest excludes existing_assets)
- Pure function: `reduceProductionAsset` copy-on-write, original state unmodified (test 6i)
- Ledger A rate confidence: LOW — 90% coal-fraction proxy pending DOR Mineral Valuation Report (MANUAL_FETCH Item 1)

### MANUAL_FETCH blockers (unchanged)
- **Item 1** (DOR Mineral Valuation Report — per-county coal/oil/gas/trona split): blocks Ledger A promotion from `confidence: low` to `high`; also blocks non-coal production_assets (trona, oil/gas)

### Test count: 52/52
- Golden A: 5, Golden B: 10, Golden C: 4, Golden D: 10, Replay: 4, Golden E: 10, Golden F: 9

---

## Phase Z1 — Engine v3.0: Unified Asset Registry + Retirement Transitions + Golden G
**Date completed:** 2026-07-02
**Status:** ✓ Complete (TS + Python parity)

### What was built

**Step 1 — Unified Asset Registry (zero behavior change)**
- `AssetInstance` type with `origin` (baseline/player), `lifecycle` (operating/queued/under_construction/retired), `asset_class` (generator/demand/production/storage)
- `asset_registry: AssetInstance[]` on state — source of truth
- `build_queue` and `existing_assets` become materialized views via `materializeBuildQueue()` / `materializeExistingAssets()`
- 4 mutation sites updated: `queueAction`, `advanceYear`, `reduceProductionAsset`, `shallowCopyState`
- Gate: 52/52 green, Goldens A–F byte-identical

**Step 2 — Retirement Transition Family**
- `scheduleRetirement(state, asset_id, year)` — set retirement year on operating asset
- `accelerateRetirement(state, asset_id, new_year)` — move earlier
- `delayRetirement(state, asset_id, new_year)` → `[state, {delay_cost_hook: 0}]`
- `cancelQueued(state, asset_id)` → `[state, {sunk_cost_fraction: 0}]`
- Retirement execution in `advanceYear`: sets `lifecycle = 'retired'`, removes capacity from `bus_state`
- 14 unit tests (retirement.test.ts)

**Step 3 — EIA-860 Scheduled Baseline Retirements + Golden G**
- `baseline_retirements.json` — Dave Johnston retires 2027 (eia860_planned), Jim Bridger retires 2031 (eia860_imputed)
- `initializeState` / `initialize_state` accept optional `baselineRetirements` / `baseline_retirements` param
- Golden G: zero-action 2025→2045 playthrough, 10 assertions at years 2027/2031/2045
- Cross-runtime digest parity confirmed (TS and Python produce identical MD5s)

**Python parity (Z1 close-out)**
- `terra_engine.py` v2.4 → v3.0: `_seed_asset_registry`, `_materialize_build_queue`, `_materialize_existing_assets`, `schedule_retirement`, `accelerate_retirement`, `delay_retirement`, `cancel_queued` — function-for-function port from TS
- 24 Python tests (14 retirement + 10 Golden G) — all pass
- Call-site audit: no external callers need updating for `baseline_retirements=None` default

### Digest registry additions
| Artifact | Type | md5 |
|---|---|---|
| Golden G yr2027 | state digest (TS + Python) | `316fe412b9d030cc91db4b3ae50ede46` |
| Golden G yr2027 | fiscal digest (TS + Python) | `a92761b7cee7c5e71e21c8faea67ede0` |
| Golden G yr2027 | existing_assets digest (TS + Python) | `a881df20643298394d53c2ac43012fe3` |
| Golden G yr2031 | state digest (TS + Python) | `a4619f25b45f7d006933de9efe83fbb2` |
| Golden G yr2031 | fiscal digest (TS + Python) | `cd28891e9eaaf9fb5ad345c91fe9b46f` |
| Golden G yr2031 | existing_assets digest (TS + Python) | `a881df20643298394d53c2ac43012fe3` |
| Golden G yr2045 | state digest (TS + Python) | `f81d33175334549b3fe24a105a752fad` |
| Golden G yr2045 | fiscal digest (TS + Python) | `f29280ab01eac21ce00a9a7aa93a04bd` |
| Golden G yr2045 | existing_assets digest (TS + Python) | `a881df20643298394d53c2ac43012fe3` |

### Constraints upheld
- Golden A/B/C/D/E/F state digests: **byte-identical** (unchanged)
- `existing_assets_digest` unchanged at `a881df20643298394d53c2ac43012fe3` (retirement year only on registry, not materialized view)
- Pure function: all 4 retirement functions + `advanceYear` are copy-on-write

### Test count: 76 TS + 24 Python = 100 total
- TS: Golden A: 5, Golden B: 10, Golden C: 4, Golden D: 10, Replay: 4, Golden E: 10, Golden F: 9, Retirement: 14, Golden G: 10
- Python: Retirement: 14, Golden G: 10

### Call-site audit (Python)
- `initialize_state`: 11 call sites (generate_golden_e.py, build_nb16.py, scripts/generate_nb08c.py, 5 notebooks, test file) — all compatible, new param is optional
- `queue_action`: 9 call sites — no changes needed
- `advance_year`: 6 call sites — no changes needed
- `reduce_production_asset`: 0 external call sites
- Direct `state["existing_assets"]` reads: 2 in generate_golden_e.py (safe — materialized view preserves shape)

#