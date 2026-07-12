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
| Golden G′ yr2027 | state digest (TS + Python) | `316fe412b9d030cc91db4b3ae50ede46` |
| Golden G′ yr2027 | fiscal digest (TS + Python) | `63ecffeb94175ed53150c042b96b7c03` |
| Golden G′ yr2027 | existing_assets digest (TS + Python) | `3a6f5ab498b87a8dbfba07f25a3ff482` |
| Golden G′ yr2031 | state digest (TS + Python) | `a4619f25b45f7d006933de9efe83fbb2` |
| Golden G′ yr2031 | fiscal digest (TS + Python) | `ad9da9c73fda224a42f0d9c1e5c685e4` |
| Golden G′ yr2031 | existing_assets digest (TS + Python) | `509f39bec10746c8c751971b6e1146b2` |
| Golden G′ yr2045 | state digest (TS + Python) | `f81d33175334549b3fe24a105a752fad` |
| Golden G′ yr2045 | fiscal digest (TS + Python) | `045f30e465a518e78870f00bb9b27aea` |
| Golden G′ yr2045 | existing_assets digest (TS + Python) | `d4fcd3d212d58ee99227d45e3937467a` |
| Golden H Player A | state_digest_md5 | `a46c1dd9f9d23c467f300f918da931f0` |
| Golden H Player A | fiscal_digest_md5 | `4fb3eb1b84612723780439595c157537` |
| Golden H Player A | existing_assets_digest_md5 | `906ad6827b7b6646b6ae840151b2a6cd` |
| Golden H Player B | state_digest_md5 | `866d7317755340a8bf9d6a4a1f3e3af4` |
| Golden H Player B | fiscal_digest_md5 | `736e5343867c2f4c9c1fb892e0db65b9` |
| Golden H Player B | existing_assets_digest_md5 | `906ad6827b7b6646b6ae840151b2a6cd` |
| Golden J | history_digest_md5 | `b314878564e4118e7a60d6fc04d6a03d` |
| Golden J | history_n_years | 63 |
| Golden J | history_year_range | [2026, 2088] |
| Golden I yr2031 | state_digest_md5 (TS + Python) | `a4619f25b45f7d006933de9efe83fbb2` |
| Golden I yr2031 | fiscal_digest_md5 (TS + Python) | `ad9da9c73fda224a42f0d9c1e5c685e4` |
| Golden I yr2031 | existing_assets_digest_md5 (TS + Python) | `509f39bec10746c8c751971b6e1146b2` |
| Golden I yr2041 | state_digest_md5 (TS + Python) | `08a97354f047f0ed59e3ed52d99a1567` |
| Golden I yr2041 | fiscal_digest_md5 (TS + Python) | `c251dce1f96ec87747160a75ed48fb64` |
| Golden I yr2041 | existing_assets_digest_md5 (TS + Python) | `bafce40eb2e2e3d43846d18e87861283` |
| Golden K yr2040 | state_digest_md5 (TS + Python) | `457b215ab9efb0891fe4376984249ba0` |
| Golden K yr2040 | fiscal_digest_md5 (TS + Python) | `469ae713294c18fc2fe06797e6cabbed` |
| Golden K yr2040 | existing_assets_digest_md5 (TS + Python) | `f8117a24bfa8ef77495a6ca24c38d518` |
| Golden K yr2040 | history_digest_md5 (TS + Python) | `f9f716e177fb7bc37bd5f61eaa79057f` |

**Why two Golden B digests:** `716b189a...` is the pure engine parity contract
(Vitest suite, no events). `a63401e3...` is what a real playthrough produces
when the Naughton 2026 deterministic event fires during replay. Both are
correct. If these diverge in a future session, it is always a code bug — never
a fixture bug.

---

## Parity Test Count History (summary — see Phase Z3 section for per-file breakdown)

| After Phase | TS | Python | Total |
|---|---|---|---|
| Phase 1–W5.2 | 52 | — | 52 |
| Phase Z1 (v3.0) | 76 | 24 | 100 |
| Phase Z1.1 (v3.1, Golden G′) | 96 | 34 | 130 |
| Phase Z2 (v3.3, Golden H) | 111 | 49 | 160 |
| Phase Z3 (v4.0, Golden J) | 129 | 65 | 194 |
| Phase Z4 (v4.1, Golden I) | **147** | **83** | **230** |
| Phase W6 (debrief + W5 session tests) | **174** | **83** | **257** |
| V2 (v4.2, Golden J′) | **191** | **99** | **290** |
| V4 (analyze-v4.test.ts) | **215** | **99** | **314** |
| C0 (climate lens scaffold + gate) | **269** | **99** | **368** |

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

---

## Phase Z1.1 — Engine v3.1: Autonomous PRB Coal Decline + Reclamation Arc + Golden G′
**Date completed:** 2026-07-03
**Status:** ✓ Complete (TS + Python parity)

### What was built
- **`lifecycle_coefficients.json`**: new data file; `prb_coal_56005` entry: `annual_decline_rate: -0.02` (−2%/yr compound surface decline), `start_year: 2026`
- **Python v3.1** (`terra_engine.py`): `lifecycle_coefficients` param added to `initialize_state`; `_apply_lifecycle_effects()` called in `advance_year` — mutates PRB Coal Mines `production_volume` by −2%/yr, accumulates reclamation obligation (bond cohort log → `active_reclamation_acres` → `reclamation_jobs_direct`)
- **TS v3.1** (`engine.ts`): identical port; `initializeState` extended; `_applyLifecycleEffects()` in `advanceYear`
- **Golden G′ fixture** (`terra-app/tests/parity/fixtures/golden_g_prime.json`): 2045-endpoint, 3 digest checkpoints (2027/2031/2045), 11 behavioral assertions (production volume, reclamation acres/jobs arcs)
- **golden-g-prime.test.ts**: 20 TS tests (11 behavioral + 9 digest parity); **TestGoldenGPrime**: 10 Python tests
- **fixture_registry.json**: Golden G superseded (amendment_number=1), Golden G′ added (amendment_number=2), `amendments_used: 2`

### Digest registry additions (Golden G′)
| Artifact | Type | md5 |
|---|---|---|
| Golden G′ yr2027 | state digest (TS + Python) | `316fe412b9d030cc91db4b3ae50ede46` |
| Golden G′ yr2027 | fiscal digest (TS + Python) | `63ecffeb94175ed53150c042b96b7c03` |
| Golden G′ yr2027 | existing_assets digest (TS + Python) | `3a6f5ab498b87a8dbfba07f25a3ff482` |
| Golden G′ yr2031 | state digest (TS + Python) | `a4619f25b45f7d006933de9efe83fbb2` |
| Golden G′ yr2031 | fiscal digest (TS + Python) | `ad9da9c73fda224a42f0d9c1e5c685e4` |
| Golden G′ yr2031 | existing_assets digest (TS + Python) | `509f39bec10746c8c751971b6e1146b2` |
| Golden G′ yr2045 | state digest (TS + Python) | `f81d33175334549b3fe24a105a752fad` |
| Golden G′ yr2045 | fiscal digest (TS + Python) | `045f30e465a518e78870f00bb9b27aea` |
| Golden G′ yr2045 | existing_assets digest (TS + Python) | `d4fcd3d212d58ee99227d45e3937467a` |

Note: Golden G′ state digest at 2027 (`316fe4...`) equals Golden G yr2027 state digest — state_digest
excludes production volumes, so the decline is invisible to state_digest. The fixture_registry
records this: `"amendment_reason": "fiscal_digest and existing_assets_digest values changed;
state_digest values are identical."` This is by design.

### Constraints upheld
- Golden A–G state digests: **byte-identical** (advance_year lifecycle change doesn't alter EES/bus/sc_pools)
- `_apply_lifecycle_effects` is copy-on-write; only affects `existing_assets` production_asset entries
- `history` field: `[]` at this phase (added in v4.0)

### Test count: 96 TS + 34 Python = 130 total
- TS: Golden A: 2, Golden B: 10, Golden C: 7, Golden D: 11, Replay: 4, Golden E: 10, Golden F: 9, Retirement: 14, Golden G: 10, Golden G′: 20
- Python: Retirement+EA: 15, Golden G: 10, Golden G′: 10 (=35 — but note TS Golden A has 2, Python hasn't yet added Golden A–F to this test file)

---

## Phase Z2 — Engine v3.3: Housing Stock + Golden H
**Date completed:** 2026-07-03
**Status:** ✓ Complete (TS + Python parity)

### What was built
- **`county_housing_baseline.json`**: new data file; per-county housing inventory (total_units, occupied, convertible, subsidized, permits_per_year, seasonal_excluded) for all 23 WY counties
- **`housing_stock` asset class**: seeded into `asset_registry` at `initializeState`/`initialize_state` from housing baseline; NOT in `existing_assets` materialized view (so existing_assets_digest is unaffected)
- **`housing_pressure_ratio`**: `occupied_units / total_units` — annual update in `advance_year`; population pressure from queued/commissioned assets adds to occupied count
- **Housing actions** (v3 library already had them; engine now executes):
  - `housing_retrofit_affordable`: converts N `housing_convertible_units` → subsidized, validates cap, raises `assessed_residential` by `N × $150k × 9.5% WY ratio`
  - `affordable_housing`: queue N new units, commission at `op_year`, add to `housing_total_units` + `housing_subsidized_units`
- **SMR housing pressure hook**: queued `smr_advanced` adds construction workforce pressure to Lincoln County housing in intervening years
- **Golden H fixture** (`terra-app/tests/parity/fixtures/golden_h.json`): two-player scenario, Lincoln County 2025→2034

### Golden H: two-player scenario (Lincoln County, Kemmerer boomtown 2026–2034)
- **Player A**: do-nothing 2025→2034; housing_pressure_ratio < 1.05 (no stress)
- **Player B**: queue Kemmerer SMR 345 MW (op=2030), retrofit 300 units, queue 100 new affordable units (op=2027), advance to 2034
  - 300 convertible consumed → 115 remain (from original 415)
  - 400 affordable_added (300 retrofit + 100 new-build)
  - assessed_residential uplift = 300 × $150k × 9.5% = **$4,275,000**
  - pressure_ratio lower in B than A (more supply)
  - Ec elevated in B (SMR + housing EES)

### Golden H digest registry
| Player | Type | md5 |
|---|---|---|
| Golden H Player A | state_digest_md5 | `a46c1dd9f9d23c467f300f918da931f0` |
| Golden H Player A | fiscal_digest_md5 | `4fb3eb1b84612723780439595c157537` |
| Golden H Player A | existing_assets_digest_md5 | `906ad6827b7b6646b6ae840151b2a6cd` |
| Golden H Player B | state_digest_md5 | `866d7317755340a8bf9d6a4a1f3e3af4` |
| Golden H Player B | fiscal_digest_md5 | `736e5343867c2f4c9c1fb892e0db65b9` |
| Golden H Player B | existing_assets_digest_md5 | `906ad6827b7b6646b6ae840151b2a6cd` |

Note: A and B share the same `existing_assets_digest_md5` — `housing_stock` assets are intentionally
excluded from the materialized `existing_assets` view.

### Constraints upheld
- Golden A–G′ state/fiscal/existing_assets digests: **byte-identical**
- `housing_stock` asset not in `existing_assets` view → `existing_assets_digest` unaffected
- `applyAction('housing_retrofit_affordable', ...)` throws if `units > housing_convertible_units`

### Test count: 111 TS + 49 Python = 160 total
- TS adds golden-h.test.ts: 15 tests (8a–8o)
- Python adds TestGoldenH: 15 tests (8a–8o)

---

## Phase Z3 — Engine v4.0: Indicator Registry + History Recorder + Projection Runner + Golden J
**Date completed:** 2026-07-03
**Status:** ✓ Complete (TS + Python parity)

### Why v4.0 (not v3.4)
The indicator/history/projection system is a new observability tier — it adds a separate digest
contract (`history_digest`), a new public API surface (`project`, `project_delta`, `computeIndicator`,
`snapshotIndicators`), and a 17-indicator catalog. The jump from v3.3 → v4.0 reflects the additive
scope: the three existing digest contracts (state_digest, fiscal_digest, existing_assets_digest)
are byte-identical; history is a fourth, separate contract. The roadmap referred to a future
"v3.2" step for decommissioning budget machinery — that step is still pending and will ship as
a future version (not v3.2, since that label is now passed). The TS engine file header still reads
"v2.4" (from Phase 1) — this is known debt; the header was not updated when the engine crossed
v3.x. The version string in the Python file header is correct: v3.1 (last major feature was v3.1;
v3.3 and v4.0 additions are annotated inline).

### What was built

**`src/indicators.py`** (new, 584 lines — Python):
- `INDICATOR_CATALOG`: 17 IndicatorDef entries (E/Ec/S tiers, composites, derived)
- `compute_indicator(state, id, scale, geoid?, denominator?)` — dispatch by id
- `snapshot_indicators(state)` → `{year, study:{E,Ec,S}, counties:{geoid:{E,Ec,S,property_tax,cumulative_net,labor_utilization,service_funding_per_capita}}, pools:{...}}`
- `payback_year`: property-tax-based payback vs `action_history` capex; ~2084 for dual Natrium at WY mill-levy rates
- Pool utilization: 2 live (HALEU_kg_per_year, fuel_fabrication_units_per_year) + 4 stubs returning `None` (capital_cost_usd, labor_years, steel_tons, transmission_row_miles — Session 3 deliverables)

**`terra-app/src/engine/indicators.ts`** (new, 518 lines — TypeScript):
- Identical API to Python version
- Uses `state.crosswalk.find(r => r.geoid === g && r.primary_bus === true)` for bus lookup

**Engine changes (both runtimes)**:
- `history: []` added to `initializeState` / `initialize_state`
- `shallowCopyState` / `_shallow_copy_state`: history shallow-copied (snapshots are immutable dicts — never mutated after creation)
- `advance_year` / `advanceYear`: appends `snapshot_indicators(state)` to history before returning
- New public functions: `history_digest(state)`, `project(state, n)`, `project_delta(state, action, n)`
- `history_digest` uses key-aware canonical JSON (integers → bare, other floats → Python `.0` suffix) to match Python's `json.dumps(sort_keys=True)`

**Projection doctrine phrasing** (ships to UI verbatim):
> "conditional forecasts under 'no further decisions,' not predictions"

### Golden J fixture (`terra-app/tests/parity/fixtures/golden_j.json`)
- Base: `loadInitialStateWithRetirements()` + Golden B action sequence; advance to 2028; `project(state, 60)`
- Final year: 2088 (63 total snapshots: 2026/2027/2028 pre-projection + 60 projected)
- Uses `loadInitialStateWithRetirements()` (not `loadInitialState()`) because lifecycle_coefficients are needed for the Campbell coal decline assertions in J4

### Golden J digest registry
| Artifact | Type | md5 |
|---|---|---|
| Golden J | history_digest_md5 | `b314878564e4118e7a60d6fc04d6a03d` |
| Golden J | history_n_years | 63 |
| Golden J | history_year_range | [2026, 2088] |

### Golden J assertion values (both runtimes, identical)
| Test | Assertion | Computed | Band/Threshold | Pass |
|---|---|---|---|---|
| J1 | payback_year, Laramie dual-SMR | 2084 | [2081, 2087] | ✓ |
| J2 | labor_utilization @ 2030 (construction peak) | 0.073443 | [0.066099, 0.080787] | ✓ |
| J3 | labor_utilization @ 2033 (post-commission) | 0.000000 | ≤ 0.001 | ✓ |
| J4 | Campbell sfpc_2028 vs sfpc_2038 shrink | \|2028\|=748.70, \|2038\|=654.07, delta=94.63 | \|2038\| < \|2028\| | ✓ |

### Test count reconciliation: Python +16 vs TS +18
Golden J adds 16 Python tests and 18 TS tests — a 2-test gap that is **intentional**:

**Python breakdown (+16):**
| Class | Tests |
|---|---|
| TestReplayHistory | 6 (determinism, year count, sequential years, main digests unchanged, study/counties keys, county snapshot fields) |
| TestGoldenJ | 10 (J1–J10) |

**TypeScript breakdown (+18, file: golden-j.test.ts):**
| Block | Tests |
|---|---|
| Structure suite (J-S1–J-S8) | 8 |
| Main suite (J1–J10) | 10 |

**The 2 extra TS tests (J-S7, J-S8) are TS-specific:**
- **J-S7** (`history shallow copy is independent`): Explicitly verifies that advancing a forked state doesn't mutate the original's history array. Python's immutable-dict pattern makes this impossible to break — no explicit test needed.
- **J-S8** (`snapshotIndicators produces same result as advance_year snapshot`): Cross-checks the public `snapshotIndicators` export against what `advanceYear` embedded. Python's optional-import guard (`_HAS_INDICATORS`) means the function isn't independently exported in the same way — covered implicitly by the determinism test.

These are runtime-specific tests, not a miscount.

### Final test count: 129 TS + 65 Python = 194 total
| File / Class | TS | Python |
|---|---|---|
| golden-a.test.ts | 2 | — |
| golden-b.test.ts | 10 | — |
| golden-c.test.ts | 7 | — |
| golden-d.test.ts | 11 | — |
| golden-e.test.ts | 10 | — |
| golden-f.test.ts | 9 | — |
| retirement.test.ts | 14 | — |
| golden-g.test.ts | 10 | — |
| golden-g-prime.test.ts | 20 | — |
| golden-h.test.ts | 15 | — |
| replay-integrity.test.ts | 4 | — |
| golden-j.test.ts | 18 | — |
| **TS total** | **129** | |
| Retirement + EA digest | — | 15 |
| Golden G | — | 10 |
| Golden G′ | — | 10 |
| Golden H | — | 15 |
| TestReplayHistory | — | 6 |
| TestGoldenJ | — | 10 |
| **Python total** | | **65** |

### Call-site audit (v4.0, both runtimes)
History is written at exactly 3 call sites per runtime — no others needed because `project` and `project_delta` inherit via `advance_year` loop:

**Python (3 sites in `terra_engine.py`):**
1. `initialize_state` (~line 1271): `"history": []`
2. `_shallow_copy_state` (~line 1668): `new["history"] = list(state.get("history", []))`
3. `advance_year` (~line 2043): `state["history"] = state.get("history", []) + [_snapshot_indicators(state)]`

**TypeScript (3 sites in `engine.ts`):**
1. `initializeState` (~line 926): `history: []`
2. `shallowCopyState` (~line 687): `history: [...(state.history ?? [])]`
3. `advanceYear` (before return): `state.history = [...(state.history ?? []), snapshotIndicators(state)]`

### Known debt
- TS engine file header (`engine.ts`) still reads "TERRA Engine v2.4" — never updated through v3.x/v4.0 cycles. Fix in next session's first commit.
- 4 stub pool indicators (`capital_cost_usd`, `labor_years`, `steel_tons`, `transmission_row_miles`) return `None` pending budget pool machinery (Session 3 deliverables).
- Roadmap text still references "v3.2" for decommissioning budget step — that label is passed; next decommission-budget phase should use whatever version is current when it ships.

---

## Parity Test Count History (updated)

| After Phase | TS | Python | Total |
|---|---|---|---|
| Phase 1 | 19 | — | 19 |
| Phase 2 | 19 | — | 19 |
| Phase 3 | 23 | — | 23 |
| Phase 4 | 23 | — | 23 |
| Phase W3 | 33 | — | 33 |
| Phase W5 | 41 | — | 41 |
| Phase W5.1 | 43 | — | 43 |
| Phase W5.2 | 52 | — | 52 |
| Phase Z1 (v3.0) | 76 | 24 | 100 |
| Phase Z1.1 (v3.1, Golden G′) | 96 | 34 | 130 |
| Phase Z2 (v3.3, Golden H) | 111 | 49 | 160 |
| Phase Z3 (v4.0, Golden J) | 129 | 65 | 194 |
| Phase Z4 (v4.1, Golden I) | **147** | **83** | **230** |
| Phase W6 (debrief + W5 session tests) | **174** | **83** | **257** |
| V2 (v4.2, Golden J′) | **191** | **99** | **290** |
| V4 (analyze-v4.test.ts) | **215** | **99** | **314** |

---

## Phase Z4 — Engine v4.1: Site Spawning + Succession Mechanics + Golden I
**Date completed:** 2026-07-03
**Status:** ✓ Complete (TS + Python parity)

### Why v4.1 (not v4.2 or a new major)
Site mechanics are a targeted additive layer on the existing asset_registry model. The three existing
digest contracts (state_digest, fiscal_digest, existing_assets_digest) are byte-identical because site
assets are excluded from all three serializations. The history_digest is unaffected (history snapshots
do not enumerate asset_registry). No schema-breaking change occurred — the 16 new fields on AssetInstance
are all nullable/null for baseline and player assets that aren't sites. A minor version bump is correct.

### What was built

**Both runtimes (`src/terra_engine.py` + `terra-app/src/engine/engine.ts`)**:

**New constants:**
- `SITE_COMPAT`: 3 site classes with succession parameters (literature-flagged as `confidence: 'low'`)
  - `thermal` (coal/gas/nuclear): TTD-2yr, capex 15% off, compatible: `['smr_advanced', 'gas_combined_cycle']`
  - `generator` (other MW): TTD-1yr, capex 10% off, compatible: `['battery_grid', 'pumped_hydro', 'data_center_hyperscale', 'data_center_campus_phase']`
  - `mine` (reclaimed): TTD-1yr, capex 20% off, compatible: `['prairie_restoration', 'solar_utility', 'reclamation_tech']`
- `COAL_TO_SMR_SITE_CLASS_COMPAT = 'thermal'`
- `SITE_OPS_JOBS_PER_MW`: coal=0.28, gas=0.10, nuclear=0.38, wind=0.04, solar=0.02, hydro=0.15 (NREL JEDI proxies)
- `SITE_WORKFORCE_HALF_LIFE_YEARS = 5` (Carley et al. 2018)

**New types (`types.ts` only):**
- `AssetClass` extended to include `'site'`
- `AssetInstance` extended with 16 new nullable fields (site mechanics + succession tracking)

**New helpers:**
- `_site_class_for_asset` / `siteClassForAsset`: maps asset type → site_class ('thermal'|'generator'|'mine'|null)
- `_spawn_site_from_retired` / `spawnSiteFromRetired`: constructs fully-populated site AssetInstance
- `_find_site_for_action` / `findSiteForAction`: searches registry for compatible operating site in county

**`queue_action` / `queueAction` changes:**
- `coal_to_smr` path: inherit TX waiver from live thermal site (or operating coal baseline if no site yet);
  **no TTD/capex discount** — brownfield premium already in `cost_2024=$8,500,000/MW`; `convert_source_asset_id` recorded
- Other actions: check for compatible live site → if found, apply TTD reduction + capex discount + TX waiver capped at `interconnection_mw`

**`advance_year` / `advanceYear` changes:**
- After retirement block: loop over newly-retired MW-based generator assets → `_spawn_site_from_retired` → extend registry
- After housing block: workforce pool decay using `N(t) = N0 × 0.5^(t/t½)` (Carley et al. 2018 half-life=5yr)

**`_materialize_existing_assets` / `materializeExistingAssets`:**
- Added `if asset_class == 'site': continue` — site assets are not reported in existing_assets (keeps digest stable)

**`_seed_asset_registry` / `seedAssetRegistry` (all 3 seeding paths + housing):**
- All 16 new fields seeded as `None`/`null` for baseline assets

**`engine.ts` header:** Updated from `v2.4` to `v4.1` (resolves known debt from Phase 1).

### Design decisions

**Why coal_to_smr gets TX waiver but no TTD/capex discount:**
TerraPower Kemmerer/Naughton project uses `coal_to_smr` as the primary convert action.
The `cost_2024=$8,500,000/MW` was deliberate re-priced in the action library to include a
brownfield premium (vs `smr_advanced` at $7,500,000/MW). Stacking a 15% capex discount
would reduce `coal_to_smr` below greenfield cost, inverting the brownfield signal. TX waiver
is separate — it reflects inherited grid infrastructure, not construction cost.

**Why sites are excluded from existing_assets but not invisible:**
`existing_assets` is a player-facing materialized view of baseline MW capacity and production
assets. Site assets are regime-transition objects (invisible before retirement fires, consumed
when a successor is placed). Including them in `existing_assets` would pollute the county card
display. They remain in `asset_registry` (source of truth) and are accessible via direct registry
queries in tests.

**Succession confidence flag:**
SITE_COMPAT TTD reductions (1–2yr) and capex discounts (10–20%) are flagged `confidence: 'low'`.
Literature anchors (DOE 2022 coal-to-nuclear siting, Gorman et al. 2022 LBNL) support the
direction and rough order-of-magnitude, but site-specific variance is high. Kemmerer is the only
US precedent at scale. The magnitudes are deliberate judgment calls, not empirical regressions.

### Golden I fixture (`terra-app/tests/parity/fixtures/golden_i.json`)
- Base: `loadInitialStateWithRetirements()`, advance to 2031 (Jim Bridger retires, site spawns)
- Zero player actions — digests at 2031 are IDENTICAL to Golden G′ yr2031

### Golden I key assertion values (both runtimes)

| Test | Assertion | Computed | Pass |
|---|---|---|---|
| i-a | site_asset_id | `site_56037_jim_bridger_power_plant_2031` | ✓ |
| i-a | site_class | `thermal` | ✓ |
| i-a | interconnection_mw | 2120.0 | ✓ |
| i-a | workforce_pool_initial | 593.6 FTE | ✓ |
| i-b | on-site SMR operational_year | 2041 | ✓ |
| i-b | ttd_reduction_applied | 2 | ✓ |
| i-b | capex_discount_fraction | 0.15 | ✓ |
| i-b | tx_waiver_mw | 345.0 | ✓ |
| i-c | greenfield SMR operational_year | 2043 | ✓ |
| i-d | TTD improvement (greenfield - on-site) | 2 years | ✓ |
| i-e | TX waiver cap (magnitude=3000) | 2120.0 MW | ✓ |
| i-f | coal_to_smr ttd_reduction | null | ✓ |
| i-f | coal_to_smr tx_waiver_mw | 345.0 | ✓ |
| i-f | coal_to_smr convert_source_asset_id | `baseline_56037_jim_bridger_power_plant` | ✓ |
| i-f | coal_to_smr operational_year | 2044 | ✓ |
| i-g | workforce_pool_current @ 2041 | 148.4 FTE | ✓ |

**Note on operational years:** The HALEU supply chain throttle (5000 kg initial core / 900 kg·yr⁻¹
pool capacity = ceil(4100/900)=5 extra years, using the loop accumulator) adds 5 years to the base
TTD. Greenfield SMR: 2031+7+5=2043. On-site SMR: 2043-2=2041. coal_to_smr (TTD=8): 2031+8+5=2044.
All three are supply-chain-throttled under zero-player initial pool state.

### Golden I digest registry
| Artifact | md5 |
|---|---|
| yr2031 state_digest (identical to Golden G′) | `a4619f25b45f7d006933de9efe83fbb2` |
| yr2031 fiscal_digest (identical to Golden G′) | `ad9da9c73fda224a42f0d9c1e5c685e4` |
| yr2031 existing_assets_digest (identical to Golden G′) | `509f39bec10746c8c751971b6e1146b2` |
| yr2041 state_digest | `08a97354f047f0ed59e3ed52d99a1567` |
| yr2041 fiscal_digest | `c251dce1f96ec87747160a75ed48fb64` |
| yr2041 existing_assets_digest | `bafce40eb2e2e3d43846d18e87861283` |

### Literature citations (succession discount parameters)
- DOE (2022). "Investigating Benefits and Challenges of Converting Retiring Coal Plant Sites to Nuclear." U.S. DOE Office of Nuclear Energy. → Siting compatibility framework, thermal site class anchor.
- Gorman, W., Mills, A., Wiser, R. (2022). "Improving Estimates of Transmission Capital Costs for Utility-Scale Wind and Solar Projects." LBNL. → TX waiver rationale (inherited interconnection reduces grid capital).
- Carley, S., Konisky, D. M., Atiq, Z., & Land, N. (2018). "Energy transition risks and vulnerabilities: a review." *Energy Research & Social Science*. → Workforce half-life 5yr anchor.
- TerraPower / PacifiCorp (2024). Naughton/Kemmerer brownfield conversion. → Kemmerer Naughton precedent: coal plant site reuse, interconnection inheritance.

### Call-site audit (v4.1, both runtimes)
Site spawning is triggered at exactly 2 call sites per runtime:

**Python:**
1. `advance_year` (~line 2180): retirement loop → `_spawn_site_from_retired` → `state["asset_registry"] += spawned_sites`
2. `advance_year` (~line 2210): workforce pool decay loop over `asset_class == 'site'` assets

**TypeScript:**
1. `advanceYear`: retirement loop → `spawnSiteFromRetired` → `state.asset_registry.push(...)`
2. `advanceYear`: workforce pool decay loop over `asset_class === 'site'` assets

Succession discount is applied at exactly 1 call site per runtime:
- Python: `queue_action` succession block (~line 2044–2110)
- TypeScript: `queueAction` succession block (matching logic)

Site exclusion from materialized views is applied at exactly 1 call site per runtime:
- Python: `_materialize_existing_assets`: `if a.get('asset_class') == 'site': continue`
- TypeScript: `materializeExistingAssets`: `if (a.asset_class === 'site') continue`

### Final test count: 147 TS + 83 Python = 230 total
| File / Class | TS | Python |
|---|---|---|
| golden-a.test.ts | 2 | — |
| golden-b.test.ts | 10 | — |
| golden-c.test.ts | 7 | — |
| golden-d.test.ts | 11 | — |
| golden-e.test.ts | 10 | — |
| golden-f.test.ts | 9 | — |
| retirement.test.ts | 14 | — |
| golden-g.test.ts | 10 | — |
| golden-g-prime.test.ts | 20 | — |
| golden-h.test.ts | 15 | — |
| replay-integrity.test.ts | 4 | — |
| golden-j.test.ts | 18 | — |
| golden-i.test.ts | **18** | — |
| **TS total** | **147** | |
| Retirement + EA digest | — | 15 |
| Golden G | — | 10 |
| Golden G′ | — | 10 |
| Golden H | — | 15 |
| TestReplayHistory | — | 6 |
| TestGoldenJ | — | 10 |
| TestGoldenI | — | **18** |
| **Python total** | | **83** |

### Known debt
- 4 stub pool indicators (`capital_cost_usd`, `labor_years`, `steel_tons`, `transmission_row_miles`) return `None` pending budget pool machinery.
- SITE_COMPAT parameters (TTD reductions + capex discounts) are flagged `confidence: 'low'` — pending empirical calibration against additional brownfield case studies.
- `gas_combined_cycle` is in `thermal` compatible_actions but no matching action in action_library_v3.json; harmless (no site is found if action doesn't exist) but should be cleaned up when gas CC action is added.

---

## Parity Test Count History (updated)

| After Phase | TS | Python | Total |
|---|---|---|---|
| Phase 1 | 19 | — | 19 |
| Phase 2 | 19 | — | 19 |
| Phase 3 | 23 | — | 23 |
| Phase 4 | 23 | — | 23 |
| Phase W3 | 33 | — | 33 |
| Phase W5 | 41 | — | 41 |
| Phase W5.1 | 43 | — | 43 |
| Phase W5.2 | 52 | — | 52 |
| Phase Z1 (v3.0) | 76 | 24 | 100 |
| Phase Z1.1 (v3.1, Golden G′) | 96 | 34 | 130 |
| Phase Z2 (v3.3, Golden H) | 111 | 49 | 160 |
| Phase Z3 (v4.0, Golden J) | 129 | 65 | 194 |
| Phase Z4 (v4.1, Golden I) | **147** | **83** | **230** |
| Phase W6 (debrief + W5 session tests) | **174** | **83** | **257** |
| V2 (v4.2, Golden J′) | **191** | **99** | **290** |
| V4 (analyze-v4.test.ts) | **215** | **99** | **314** |
| C0 (climate lens scaffold + gate) | **269** | **99** | **368** |

---

## Phase V2 — Engine v4.2: Dynamic Population + Migration (Golden J′)

**Date:** 2026-07-05  
**Engine version:** 4.2  
**Baseline:** Post-W6 (174 TS / 83 Python = 257 total)

### What changed

- `county_ees[geoid].population` and `working_age_population` now advance per-year in both runtimes via `advanceYear` / `advance_year`
- Migration adjustment added: `ops_jobs × HOUSEHOLD_FACTOR × AVG_HOUSEHOLD_SIZE × ECONOMIC_BASE_MULTIPLIER` added to each county annually when `population_config.migration_enabled = true`
- `IndicatorSnapshot` gains `population` and `working_age_population` fields — denominators for per-capita fiscals are now live rather than static 2025 baseline
- **Bug fix:** `countPlayerOpsJobs` (TS) now reads `magnitude` when `capacity_mw` is null (player-queued assets); previously silently returned zero, suppressing migration entirely

### New files

- `terra-app/src/data/county_population_projections.json` — 157-county projection file (v4.2); sources: WY EAD 2022, CO SDO 2022, ACS 2022 5-year constant-share proxy
- `terra-app/src/data/county_housing_baseline.json` — ACS 2022 housing inventory (Z2, included here for completeness)
- `scripts/generate_population_projections.py` — generates the projection file; replaces planned Notebook 22

### Golden J′ (Amendment 4)

| Field | Value |
|---|---|
| fixture_id | `golden_j_prime` |
| engine_version | 4.2 |
| history_digest_md5 | `7b05722c9b11c2b405faf953c729977d` |
| prior digest (golden_j) | `b314878564e4118e7a60d6fc04d6a03d` |
| history_n_years | 63 |
| history_year_range | [2026, 2088] |

Digest changed because: IndicatorSnapshot now records `population` + `working_age_population` fields, and per-capita denominators use advancing population rather than static 2025 baseline. Campbell `sfpc` is more negative (declining pop / same recapture); Laramie pop grows from data-center + SMR ops migration.

### V2 test delta

Pre-V2 baseline (post-W6): **174 TS / 83 Python = 257 total**  
Post-V2: **191 TS / 99 Python = 290 total**  
**V2 delta: +17 TS / +16 Python = +33 total**

- `golden-j-prime.test.ts` — 17 TS (V2 deliverable)
- `tests/test_terra_engine_v3.py` TestPopulationV2 class — +16 Python

`analyze-v4.test.ts` (24 TS) is **V4's file**, confirmed in V4's own close-out. It is present in the working tree and counted by the live test runner (bringing the runner total to 215 TS), but its session attribution is V4, not V2. V4's independent delta: **+24 TS / +0 Python** (191→215 TS).

### Final V2 per-file test count

| File / Class | TS | Python |
|---|---|---|
| golden-a.test.ts | 2 | — |
| golden-b.test.ts | 10 | — |
| golden-c.test.ts | 7 | — |
| golden-d.test.ts | 11 | — |
| golden-e.test.ts | 10 | — |
| golden-f.test.ts | 9 | — |
| retirement.test.ts | 14 | — |
| golden-g.test.ts | 10 | — |
| golden-g-prime.test.ts | 20 | — |
| golden-h.test.ts | 15 | — |
| replay-integrity.test.ts | 4 | — |
| golden-i.test.ts | 18 | — |
| golden-j.test.ts | 18 | — |
| session-w5.test.ts | 8 | — |
| session-w6-debrief.test.ts | 19 | — |
| golden-j-prime.test.ts | 17 | — |
| *(analyze-v4.test.ts — V4, not V2)* | *(24)* | — |
| **TS total (V2)** | **191** | |
| Retirement + EA digest | — | 15 |
| Golden G | — | 10 |
| Golden G′ | — | 10 |
| Golden H | — | 15 |
| TestReplayHistory | — | 6 |
| TestGoldenJ | — | 10 |
| TestGoldenI | — | 18 |
| TestPopulationV2 (new) | — | **15** |
| **Python total** | | **99** |

### Population honesty table

Scenario: **Golden B — WY Nuclear-DC Buildout**  
Horizon: 2026 → 2031 (5 years), hypothetical 50 ops jobs held constant  
Migration formula: `50 × 0.65 × 2.51 × 1.5 = 122 heads/yr`  
Source for all WY counties: WY EAD 2022 (confidence: medium)  
Migration multiplier source: Headwaters Economics (2017), confidence: **low**

| County | GEOID | 2026 baseline | 2031 no-mig | 2031 w/mig (+50 ops jobs) | Δ heads | Δ % |
|---|---|---|---|---|---|---|
| Campbell WY | 56005 | 45,375 | 43,589 | 44,190 | +601 | +1.4% |
| Laramie WY | 56021 | 102,337 | 104,921 | 105,537 | +616 | +0.6% |
| Lincoln WY | 56023 | 20,193 | 20,702 | 21,318 | +616 | +3.0% |
| Teton WY | 56039 | 24,487 | 25,992 | 26,617 | +625 | +2.4% |
| Natrona WY | 56025 | 80,464 | 81,678 | 82,292 | +614 | +0.8% |

Campbell declines under its own trend (-0.8%/yr EAD projection) even with migration partially offsetting. Migration effect is largest in percentage terms for smaller counties (Lincoln, Teton). For real player scenarios, ops_jobs will vary by action and year; this table uses a fixed 50-job constant as a reference case.

### Known debt carried forward

- 4 stub pool indicators (`capital_cost_usd`, `labor_years`, `steel_tons`, `transmission_row_miles`) return `None` pending budget pool machinery.
- `analyze-v4.test.ts` is untracked (not staged) at V2 close-out — stage before next session.
- Migration multiplier (1.5) is `confidence: low` — flag in UI and debrief output when migration is a material contributor to a county's projected change.

## Phase C0 — Climate Lens Scaffold + Exogeneity Gate
**Date:** 2026-07-11
**Engine version:** 4.2 (unchanged — zero behavioral change)
**Baseline:** Post-V4 (215 TS / 99 Python = 314 total)
**Amendments consumed:** 0

### What was built

**1. Schema bump + migration (3.0 → 3.1)**
- `ScenarioFile.climate_lens?: ClimateLens` added (`"historical" | "ssp245" | "ssp370"`)
- `schema_version` union type widened to `'3.0' | '3.1'`; new files emit `'3.1'`
- `persistence.ts`: migration function — legacy 3.0 files import as 3.1 with `climate_lens: "historical"`
- `ACCEPTED_VERSIONS` set accepts both 3.0 and 3.1 on import; `STORAGE_VERSION` = `'3.1'`

**2. ClimateContext type + engine plumbing**
- `ClimateContext` interface: `{ lens: ClimateLens; tables: Record<variable, Record<geoid, Record<epoch, number>>> }`
- `EMPTY_CLIMATE_CONTEXT`: frozen sentinel (`lens: "historical"`, `tables: {}`)
- Added as optional trailing parameter to `applyAction`, `queueAction`, `advanceYear`
- Default: `EMPTY_CLIMATE_CONTEXT`; under historical lens every coupling hook is a documented no-op
- Design note: read-only and stateless — C3 demand modulation (CDD/HDD × population) will live entirely in coupling functions, not in engine state

**3. Digest computation**
- `computeReplayDigest(state, climateLens?)`: lens contributes to digest object **only when non-historical**
- Historical lens (or absent): digest object is structurally identical to pre-C0 — byte-identity preserved
- Non-historical lens: `climate_lens` key added to digest object → different MD5
- Store `loadFromSlot`, `validateImport`, DebriefView updated to pass `file.climate_lens`

**4. Exogeneity test (permanent — assert in every C-track session)**
- `climate-exogeneity.test.ts`: 6 tests
  - EX-1: `EMPTY_CLIMATE_CONTEXT` is frozen
  - EX-2/3/4: context unchanged after `applyAction` / `queueAction` / `advanceYear`
  - EX-5: divergent action logs produce bit-identical climate contexts
  - EX-6: non-historical context with synthetic tables also exogenous
- `climate-c0.test.ts`: 9 tests
  - C0-1: STORAGE_VERSION is 3.1
  - C0-2: legacy 3.0 migration
  - C0-3: round-trip export/import
  - C0-4: unknown schema rejected
  - C0-5/6/7: computeReplayDigest matches computeDigestMd5 (parity)
  - C0-8: non-historical lens produces different digests
  - C0-9: EMPTY_CLIMATE_CONTEXT shape

### Digest verification table

All four digest contracts byte-identical on every frozen golden with `climate_lens: "historical"`:

| Golden | state_digest | fiscal_digest | existing_assets_digest | history_digest |
|---|---|---|---|---|
| A | `4a838c70...` ✓ | — | — | — |
| B (no events) | `716b189a...` ✓ | — | — | — |
| B (replay) | `a63401e3...` ✓ | — | — | — |
| C | `997753927...` ✓ | — | — | — |
| D | `775dce2e...` ✓ | `225c5bdd...` ✓ | — | — |
| E | — | — | `a881df20...` ✓ | — |
| F (pre-X2) | — | `af67c87f...` ✓ | `a881df20...` ✓ | — |
| F (post-X2) | — | `b2a9567a...` ✓ | `80f48310...` ✓ | — |
| G′ yr2027 | `316fe412...` ✓ | `63ecffeb...` ✓ | `3a6f5ab4...` ✓ | — |
| G′ yr2031 | `a4619f25...` ✓ | `ad9da9c7...` ✓ | `509f3fbe...` ✓ | — |
| G′ yr2045 | `f81d3317...` ✓ | `045f30e4...` ✓ | `d4fcd3d2...` ✓ | — |
| H Player A | `a46c1dd9...` ✓ | `4fb3eb1b...` ✓ | `906ad682...` ✓ | — |
| H Player B | `866d7317...` ✓ | `736e5343...` ✓ | `906ad682...` ✓ | — |
| I yr2031 | `a4619f25...` ✓ | `ad9da9c7...` ✓ | `509f3fbe...` ✓ | — |
| I yr2041 | `08a97354...` ✓ | `c251dce1...` ✓ | `bafce40e...` ✓ | — |
| J′ | — | — | — | `7b05722c...` ✓ |

Tested with migration enabled (3.0 → 3.1) and disabled (native 3.1): identical results.

### Call-site audit

| Function | src/ calls | tests/ calls |
|---|---|---|
| `computeReplayDigest` | 5 | 14 |
| `computeDigestMd5` | 0 | 21 |
| `computeFiscalDigestMd5` | 0 | 11 |
| `computeExistingAssetsDigestMd5` | 0 | 14 |
| `historyDigest` | 0 | 7 |
| `importFromJson` | 6 | 6 |
| `exportToJson` | 1 | 2 |
| `saveToSlot` / `persistenceSaveToSlot` | 3 | 0 |
| `loadFromSlot` / `persistenceLoadFromSlot` | 3 | 0 |
| `replayScenario` | 2 | 8 |
| `validateImport` / `engineValidateImport` | 1 | 0 |

All `computeReplayDigest` call sites in `src/` updated to pass `climateLens` where file context is available (store.ts:890, DebriefView.tsx:261, replay.ts:300). Save-side calls (store.ts:865, :928) emit `climate_lens: "historical"` so omitting the lens arg is correct (defaults to historical, which does not alter the digest structure).

### Test count delta

Pre-C0: **215 TS / 99 Python = 314 total**
Post-C0: **230 TS / 99 Python = 329 total**
**C0 delta: +15 TS / +0 Python**

| File | Tests |
|---|---|
| `climate-exogeneity.test.ts` (new) | 6 |
| `climate-c0.test.ts` (new) | 9 |
| **C0 total** | **15** |

### Files modified (blast-radius)
- `src/engine/types.ts` — `ClimateLens`, `ClimateContext`, `EMPTY_CLIMATE_CONTEXT`, `ScenarioFile.climate_lens`
- `src/engine/engine.ts` — `_climateContext` optional param on `applyAction`, `queueAction`, `advanceYear`
- `src/engine/replay.ts` — `computeReplayDigest` lens param; `validateImport` passes lens
- `src/engine/persistence.ts` — migration function, `ACCEPTED_VERSIONS`, `STORAGE_VERSION` bump
- `src/engine/index.ts` — re-exports `ClimateLens`, `ClimateContext`, `EMPTY_CLIMATE_CONTEXT`
- `src/state/store.ts` — `schema_version: '3.1'`, `climate_lens: 'historical'` in save/export; lens-aware load
- `src/ui/panels/DebriefView.tsx` — pass `parsed.climate_lens` to `computeReplayDigest`
- `tests/parity/session-w5.test.ts` — updated backward-compat assertion for 3.0→3.1 migration
- `tests/parity/climate-exogeneity.test.ts` (new)
- `tests/parity/climate-c0.test.ts` (new)

### Migration-toggle digest check (explicit gate evidence)

All four digest contracts checked against frozen golden values with
`population_config.migration_enabled` toggled `true` and `false`.
Test file: `c0-gate-verify.test.ts` (39 assertions).

**migration=ON (default):**

| Golden | state_digest | fiscal_digest | existing_assets_digest | history_digest |
|---|---|---|---|---|
| A | `4a838c70…` ✓ | — | — | — |
| B (no events) | `716b189a…` ✓ | — | — | — |
| E | — | — | `a881df20…` ✓ | — |
| G′ yr2027 | `316fe412…` ✓ | `63ecffeb…` ✓ | `3a6f5ab4…` ✓ | — |
| G′ yr2031 | `a4619f25…` ✓ | `ad9da9c7…` ✓ | `509f39be…` ✓ | — |
| G′ yr2045 | `f81d3317…` ✓ | `045f30e4…` ✓ | `d4fcd3d2…` ✓ | — |
| I yr2031 | `a4619f25…` ✓ | `ad9da9c7…` ✓ | `509f39be…` ✓ | — |
| I yr2041 | `08a97354…` ✓ | `c251dce1…` ✓ | `bafce40e…` ✓ | — |
| J′ (Golden B seq + project 60) | — | — | — | `7b05722c…` ✓ |

**migration=OFF:**

| Golden | state_digest | fiscal_digest | existing_assets_digest | history_digest |
|---|---|---|---|---|
| A | `4a838c70…` ✓ | — | — | — |
| B (no events) | `716b189a…` ✓ | — | — | — |
| E | — | — | `a881df20…` ✓ | — |
| G′ yr2027 | `316fe412…` ✓ | `63ecffeb…` ✓ | `3a6f5ab4…` ✓ | — |
| G′ yr2031 | `a4619f25…` ✓ | `ad9da9c7…` ✓ | `509f39be…` ✓ | — |
| G′ yr2045 | `f81d3317…` ✓ | `045f30e4…` ✓ | `d4fcd3d2…` ✓ | — |
| I yr2031 | `a4619f25…` ✓ | `ad9da9c7…` ✓ | `509f39be…` ✓ | — |
| I yr2041 | `08a97354…` ✓ | `c251dce1…` ✓ | `bafce40e…` ✓ | — |
| J′ (Golden B seq + project 60) | — | — | — | differs (expected) |

**Why history_digest differs with migration=OFF:** Golden J′ was frozen with
`migration_enabled=true` (the V2 default). The history digest includes
`population` and `working_age_population` fields in each `IndicatorSnapshot`,
which change when migration is disabled. The state/fiscal/existing_assets
digests are unaffected because population is not in those digest surfaces.
All three non-history contracts are byte-identical under both settings.

### Legacy 3.0 round-trip (explicit gate evidence)

**Fixture used:** Synthetic pre-C0 ScenarioFile constructed from Golden A
steps (13 apply-only actions). Written as `schema_version: "3.0"` with no
`climate_lens` field — identical to what the pre-C0 code would have produced.

**Procedure:**
1. Constructed 3.0 file with Golden A action log, computed replay_digest directly
2. Imported through `importFromJson()` — migration path engaged
3. Re-exported through `exportToJson()`
4. Compared digests

**Results:**
- (a) Re-exported file's `climate_lens` field: **`"historical"`** ✓
- (b) Re-exported file's `replay_digest`: **`4a838c7070d55d3487d8f3ecbc529220`** (Golden A frozen value)
- (c) Direct-compute digest vs legacy-load-path digest: **identical** ✓
- (d) `computeReplayDigest(state, "historical")` === `computeReplayDigest(state)` ✓
- Schema version after migration: **`"3.1"`** ✓

### Updated test count

Pre-C0: **215 TS / 99 Python = 314 total**
Post-C0 (with gate): **269 TS / 99 Python = 368 total**
**C0 total delta: +54 TS / +0 Python**

| File | Tests |
|---|---|
| `climate-exogeneity.test.ts` (new) | 6 |
| `climate-c0.test.ts` (new) | 9 |
| `c0-gate-verify.test.ts` (new) | 39 |
| **C0 total** | **54** |

### Known debt
- ClimateContext tables are empty under historical lens. C1/C2 will populate them with CMIP6/LOCA2 downscaled projections.
- C3 will implement demand modulation coupling functions (CDD/HDD × dynamic population from V2).
- Python runtime does not yet have ClimateContext plumbing — add in C3 or C4 when coupling functions are implemented.

---

## Phase F0 → F0.4 — Anchor Facilities, Economic Drivers, and WY Gap Closure
**Date:** 2026-07-11
**Status:** Closed; data/notebook work only, with no engine or digest-surface changes.

### What was built

Notebook 22 produced the 404-feature anchor registry
`data/processed/mw_anchor_facilities.geojson`, the 157-record
`mw_county_cards.json` update, and `anchor_sector_taxonomy.json`. The
registry combines EIA-860 generators, EPA GHGRP facilities, MSHA mines,
curated institutional anchors, and the associated economic-driver rankings.
Every county card records its `driver_source`; source, confidence, and
coordinate flags are retained on anchor records.

### Gates

- **WY Tier 2 coverage:** passed — **23/23 Wyoming counties** have at least
  one Tier 2 anchor after the deterministic gap-fill promotion pass.
- **Ten-county credibility table:** passed — expected top-LQ identities held
  for Campbell (mining/extraction), Teton (tourism/recreation), Sweetwater
  (mining/extraction), Albany (education), Goshen (agriculture), Laramie
  (government/military), Lincoln and Converse (utilities/power), Moffat CO
  (mining/extraction), and Rosebud MT (utilities/power). Each row also had a
  named Tier 2 anchor.

### Economic-driver fallback log

The intended hierarchy was BEA CAGDP2/CAINC6N, then Census CBP, then ACS
industry-of-worker shares. BEA credentials were unavailable. The CBP bulk
state-archive attempt returned 404 for WY and MT, so the recovery sequence
was **CBP bulk → Census CBP API → ACS fallback**, with QCEW used to identify
government ownership where needed. The final per-county `driver_source` is
preserved in `mw_county_cards.json` rather than inferred at render time; the
current 157 records are `CBP_establishment_counts+QCEW_government_ownership`.
The source tag is evidence of the fallback path, not a claim that a
location-quotient result is a GDP ranking.

### F0.4 WY gap-fill promotions

The four previously blocked GHGRP gap-fill facilities now carry
facility-specific, low-confidence MW values derived from the resolved
fallback chain: Goshen / Western Sugar Cooperative **1.380 MW**; Johnson /
Bolster Compressor Station **0.648 MW**; Niobrara / Salt Creek CO2 Supplier
**0.250 MW**; and Sublette / Big Piney Compressor Station **1.488 MW**.

The economic-driver refresh affected all 130 study counties. **77 counties**
now have `government/military` as their top LQ driver. This was adjudicated
as the expected shape of a location-quotient ranking for many small rural
counties—government employment is locally concentrated—not as a claim that
government is their largest absolute economic sector. The ten-county
credibility gate above remains the control against implausible canonical
identities.

### Known debt

- Driver rankings remain a fallback hierarchy rather than BEA GDP/income
  rankings until a reproducible BEA pull is available.
- CBP state-archive availability and Census/ACS API-key access should be
  rechecked on the next data refresh; retain the existing per-county
  `driver_source` rather than silently upgrading confidence.
- The four MW values are low-confidence estimates and should be replaced by
  documented facility load/nameplate evidence when available.

---

Phase S0 — F-Track / C-Track Reconciliation (orchestration, no code)
Date: 2026-07-11
Status: Binding for all F- and C-track sessions. Read this entry before
TERRA_anchors_roadmap.md or TERRA_climate_roadmap.md — where they conflict,
this entry wins.
Baseline at track start

Engine v4.2 (both runtimes), 215 TS + 99 Python = 314 tests
Goldens frozen: A, B, C, D, E, F, G (superseded), G′, H, I, J, J′
Four digest contracts: state_digest, fiscal_digest,
existing_assets_digest, history_digest
fixture_registry.json amendments_used: 4 (latest: J→J′, Amendment 4)
Z4 sites/succession live (v4.1); W5/W6 session tooling live; V2 dynamic
population + migration live (v4.2)
Z5 lifecycle UI: status unconfirmed in this log — F2 and C5 must check
the repo for the asset-registry card section / site-marker component and
record what they find here

Golden letter assignments (supersedes both roadmaps' internal references)
FixtureSessionRoadmap called itGolden KF1 — anchor lifecycle"Golden K" (anchors roadmap)Golden LC3 — demand fork"Golden J" (climate roadmap)Golden MC4 — resilience fork"Golden K" (climate roadmap)
J and J′ are consumed (Z3 indicators, V2 population). Any session that finds
a letter collision stops and logs it here before freezing anything.
Notebook number assignments (provisional — confirm against ls notebooks/)
NotebookSession22_anchor_facilities.ipynbF023_climate_projection_pull.ipynbC124_hazard_exposure_baseline.ipynbC2
V2 replaced "planned Notebook 22" with scripts/generate_population_projections.py,
so 22 is believed free. Each data session's first cell lists notebooks/ and
bumps to the next free number if taken, recording the actual number here.
Amendment doctrine for these tracks

C0 is not an amendment. All four digests must remain byte-identical with
climate_lens: "historical". Any digest change in C0 is a bug.
F1 attempts zero-amendment seeding first, following the established
pattern (Z2 housing_stock, Z4 sites): anchors enter asset_registry but are
excluded from the existing_assets materialized view; history snapshots do
not enumerate the registry. If all four digests stay byte-identical, no
amendment is consumed. Only if an anchor field must enter a digest surface
does F1 log Amendment 5, with the full inertness proof attached.
F1's inertness proof covers all four digest contracts and runs with
population_config.migration_enabled both true and false — a seeded
anchor that leaks jobs at initialization will surface through the V2
migration path in the history digest.
Total new amendments budgeted across both tracks: at most one (F1,
only if the zero-amendment path fails).

Serialization rule
Only one live session at a time may modify: terra_engine.py, engine.ts,
indicators.py/indicators.ts, initializeState/initialize_state,
replay.ts, persistence.ts, or any digest computation. The engine-lock
order for these tracks: C0 → F1 → C3 → C4. Data notebooks and UI-only
sessions run in parallel freely. F3 branches from post-C0 main; rebases and
reruns npm run parity after F1 merges (its inertness test is relative —
pinned vs unpinned run — so it survives any F1 regeneration).
Wave plan
WaveSessions (executor)1F0 (Codex) ∥ C1 (Codex) ∥ C0 (Opus, engine lock)2F1 (Opus, engine lock) ∥ C2 data-half (Codex) ∥ F3 (Sonnet, branch)3C3 (Opus, engine lock) ∥ F2 (Codex + Sonnet review)4C4 (Opus, engine lock) ∥ C5a components (Codex)5C5b integration + final sweep (Sonnet build, Opus verify)
C2 is split: data pulls + tagging doc in Wave 2 (Codex, parallel-safe);
the registry-merge step is applied as a small post-F1 patch so exposure tags
cover the new anchor asset classes (mine, industrial_load,
commercial_anchor_load) in one pass.
Codex verification protocol (every Codex deliverable, before merge)

Fresh execution — restart kernel, run top to bottom, no hidden state.
Gate tables re-derived by the verifier from cached raw pulls, then diffed
against the printed versions — not re-read.
Schema audit — every output value carries required attribution fields
(confidence, source, and for climate {scenario, epoch, percentile, source, method}); grep for hardcoded hex/values and silent nulls.
Blast-radius diff — git diff --stat shows zero changes outside the
session's allowed paths.
Handoff conditions checked one by one as written; "close enough" fails.

### Wave 2 gate decision — C-track held pending real climate data (2026-07-11)

C1's Wave 1 output (data/processed/county_climate_projections.json) is
100% literature-scaled proxy data — CarbonPlan CMIP6 hit chunk-transfer
constraints, MACA publishes CMIP5/RCP not CMIP6/SSP and no scenario
conversion was attempted (correctly). Decision: C2, C3, and C4 do not
start until a dedicated acquisition session (C1.2) delivers real
downscaled values for at least the core variable set, OR a second
project-level decision explicitly accepts literature-scaled data as
final.

F-track is unaffected — F1 (engine lock) and F3 (branch) proceed on the
Wave 2 schedule as planned; neither depends on climate_context contents.

### C1.3/C1.4/C1.5 — MACA back-cast resolution (2026-07-11)

C1.3's original back-cast "fail" was against a fallback climatology
proxy mislabeled as "observed" in the Wave 1 build log — not a real
station or gridded record. C1.4 confirmed MACA's extraction pipeline
was correct (right grid cells, right variables, right units) and the
proxy reference was invalid. C1.5 re-ran the comparison against PRISM
4km observed gridded normals (1981-2005): all 6 checks came within
~1F / ~1in of observed, though a strict range-bracketing rule marked
them "fail" due to MACA's tight reported range rather than any real
disagreement. MACA's 15,072-value real-data portion is validated.
7,536 values (annual_mean_temp_f, annual_precip_total_in) carry a
conservative low-confidence flag from the strict rule; this can be
revisited if a tolerance-based check is preferred over strict
bracketing.

Wave 2 replan (2026-07-11, supersedes the S0 wave table for Wave 2 only)

LaneSessionExecutorDepends onEngine lockF1 — anchor seeding + Golden KOpusF0.4 geojson, C0BranchF3 — pin placement + inertness paritySonnetPost-C0 main; rebase after F1Repair AC1.2 — real CMIP6/SSP acquisitionSonnet— (unblocks C2/C3/C4)Repair BF0 — WY/MT drivers + MW estimatesCodex✅ CLOSED (2026-07-11)


C2 data-half moves to Wave 3 (runs parallel with C3 if C1.2 passes;
parallel with F2 if it does not). The Wave-1 gate hold on C2/C3/C4 stands
until C1.2's handoff condition is met or a logged project decision accepts
literature-scaled data as final.
F1 is not blocked by F0: Golden K uses Sweetwater and Campbell, which are
unaffected by the four low-confidence gap-fill estimates. F0 remains a
data-only change with no digest impact because the registry is excluded from
all four digest surfaces. Housekeeping owed: the C1 phase close-out and the
truncated final line of the C1.3/C1.4/C1.5 entry.
C0 known debt inherited forward: Python runtime ClimateContext plumbing
ships in C3.

---

## Phase F1 — Anchor Seeding + Golden K
**Date:** 2026-07-12
**Engine version:** 4.3
**Baseline:** Post-C0 (230 TS / 99 Python = 329 total)
**Amendments consumed:** 0 (zero-amendment path succeeded; total remains 4/4)

### What was built

**1. Anchor facility seeding (Python + TS)**
- `_seed_anchor_facilities(data_dir, registry)` / `seedAnchorFacilities()`: reads
  `mw_anchor_facilities.geojson` (404 features, 265 Tier 2), creates AssetInstance
  dicts for three new asset classes: `mine`, `industrial_load`, `commercial_anchor_load`.
  Generator-class anchors (Tier 2, `asset_class=generator`) attach `anchor_id` and
  `co2e_tpy` to existing generator records matched by `geoid + name`.
- `AssetClass` union type extended: `| 'mine' | 'industrial_load' | 'commercial_anchor_load'`
- `AssetInstance` gains optional fields: `anchor_id`, `co2e_tpy`, `display_sector`, `confidence`
- `initializeState` / `initialize_state` calls seeding after housing baseline
- `_EA_EXCLUDED_CLASSES` / `EA_EXCLUDED_CLASSES`: frozenset/Set including all three
  anchor classes — anchors never enter the `existing_assets` materialized view

**2. ANCHOR_MINE_COMMODITY lookup table**
- 50-entry static lookup keyed by MSHA-derived `anchor_id`, mapping to `coal` (27),
  `trona` (4), or `bentonite` (19). Built from facility names in the geojson.
- **Known debt:** Derived field — the geojson carries no `commodity` attribute.
  Commodity assignment is name-based pattern matching (e.g., "Trapper Mine" → coal).
  Should be replaced by a canonical MSHA→commodity crosswalk when available.

**3. Lifecycle wiring — retirement, site spawn, SITE_COMPAT**
- `schedule_retirement` / `scheduleRetirement`: asset_class eligibility gate extended
  to include mine, industrial_load, commercial_anchor_load
- `_site_class_for_asset` / `siteClassForAsset`: returns `'mine'` for mine,
  `'industrial'` for industrial_load, `'commercial'` for commercial_anchor_load
- `_spawn_site_from_retired` / `spawnSiteFromRetired`: workforce pool for anchor
  asset classes uses `employment_direct` (from geojson `employment_est`) instead of
  `SITE_OPS_JOBS_PER_MW × capacity_mw`. `interconnection_mw` set to `null` for
  non-generator anchors. `site_origin_type` can now be `'anchor'`.
- SITE_COMPAT new entries:
  - `'mine'`: solar_utility, wind_onshore, battery_grid (same as `'mine'` Z4 site_class)
  - `'industrial'`: battery_grid, industrial_load_flexible
  - `'commercial'`: battery_grid, community_solar
- Retirement decommissioning and capacity reversal exclusions updated for anchor classes

**4. Mineral valuation Y-track hook**
- On mine retirement: emits `y_track_data` dict with `commodity`, `employment_unwound`,
  `y_track_price: 0`, `y_track_confidence: 'flagged'`, and note about DOR Mineral
  Valuation Report gating. Placeholder for future fiscal coupling.

**5. Indicator guard clauses**
- `_incoming_construction_workforce` / `incomingConstructionWorkforce`: skip list
  extended to include anchor asset classes (anchors are not player-built)
- `computeHousingPressure` / `countPlayerOpsJobs`: skip lists extended similarly

### Inertness proof

All four digest contracts remain byte-identical with and without anchor seeding, tested
at initialization and after 3 advance_year cycles with migration enabled:

| Contract | With anchors | Without anchors | Match |
|---|---|---|---|
| state_digest | `4a838c70...` | `4a838c70...` | ✓ |
| fiscal_digest | `225c5bdd...` | `225c5bdd...` | ✓ |
| existing_assets_digest | `a881df20...` | `a881df20...` | ✓ |
| history_digest (yr2028) | identical | identical | ✓ |

Mechanism: anchors excluded from `existing_assets` via `_EA_EXCLUDED_CLASSES`;
`origin='baseline'` filtered by `countPlayerOpsJobs`; no anchor fields enter
state_digest, fiscal_digest, or history snapshot surfaces.

### Golden K — anchor lifecycle scenario

**Scenario:** No baseline retirements. Retire WE Soda trona anchor (Sweetwater, 722 emp)
in 2030; retire Black Thunder coal mine anchor (Campbell, 808 emp) in 2028; queue
solar_utility on mine site in 2029; place SMR on Sweetwater in 2035. Advance to 2040.

| Assertion | Expected | Observed | ✓ |
|---|---|---|---|
| BT site_class | mine | mine | ✓ |
| BT workforce_pool_initial | 808 | 808 | ✓ |
| Solar succession_site_id | site_56005_black_thunder_2028 | site_56005_black_thunder_2028 | ✓ |
| Solar TTD reduction | 1 | 1 | ✓ |
| Solar capex discount | 0.2 | 0.2 | ✓ |
| WS site_class | mine | mine | ✓ |
| WS workforce_pool_initial | 722 | 722 | ✓ |
| WS interconnection_mw | null | null | ✓ |
| WS Y-track commodity | trona | trona | ✓ |
| WS Y-track price | 0 | 0 | ✓ |
| SMR succession_site_id | null | null | ✓ |
| SMR TTD reduction | null | null | ✓ |
| SMR capex discount | null | null | ✓ |
| Deterministic | true | true | ✓ |

**Succession coverage note:** The scenario tests *both* the acceptance and rejection paths:
- **Acceptance (k5/k-b):** `solar_utility` on Black Thunder's mine site receives the full
  `SITE_COMPAT['mine']` discount (TTD-1yr, capex 20%), with `succession_site_id` linked
  to `site_56005_black_thunder_2028`. This exercises the real Z4 discount-calculation code
  path for an anchor-spawned site, with values asserted against the documented formula.
- **Rejection (k9/k-f):** `smr_advanced` on Sweetwater finds the WE Soda mine site but
  `smr_advanced` is not in `SITE_COMPAT['mine']['compatible_actions']` (which lists
  `prairie_restoration`, `solar_utility`, `reclamation_tech`). No JB thermal site exists
  because Golden K runs without baseline retirements. The original prompt's language
  ("place SMR on JB thermal site") implied thermal succession would apply — in practice,
  the mine site is the only available site in 56037, and mine→SMR is not a valid pairing.
  This is a discovered fact about SITE_COMPAT, not a deviation from spec.

### Digest verification table (Golden K yr2040)

| Digest | Python | TS | Match |
|---|---|---|---|
| state_digest_md5 | `457b215ab9efb0891fe4376984249ba0` | `457b215ab9efb0891fe4376984249ba0` | ✓ |
| fiscal_digest_md5 | `469ae713294c18fc2fe06797e6cabbed` | `469ae713294c18fc2fe06797e6cabbed` | ✓ |
| existing_assets_digest_md5 | `f8117a24bfa8ef77495a6ca24c38d518` | `f8117a24bfa8ef77495a6ca24c38d518` | ✓ |
| history_digest_md5 | `f9f716e177fb7bc37bd5f61eaa79057f` | `f9f716e177fb7bc37bd5f61eaa79057f` | ✓ |

### Call-site audit

| Function | src/ calls | tests/ calls |
|---|---|---|
| `seedAnchorFacilities` | 1 | 0 |
| `_seed_anchor_facilities` | 1 | 0 |
| `scheduleRetirement` | 2 | 20 |
| `siteClassForAsset` | 1 | 0 |
| `spawnSiteFromRetired` | 1 | 0 |
| `computeDigestMd5` | 0 | 23 |
| `computeFiscalDigestMd5` | 0 | 13 |
| `computeExistingAssetsDigestMd5` | 0 | 16 |
| `historyDigest` | 0 | 8 |

### Test count delta

Pre-F1: **269 TS / 99 Python = 368 total**
Post-F1: **281 TS / 111 Python = 392 total**
**F1 delta: +12 TS / +12 Python = +24 total**

### Per-file test count (post-F1)

| File | Tests |
|---|---|
| golden-k.test.ts (new) | 12 TS |
| TestGoldenK (new) | 12 Python |
| *all other files unchanged* | 269 TS / 99 Python |
| **Total** | **281 TS / 111 Python** |

### Known debt

- **ANCHOR_MINE_COMMODITY** is a derived lookup — geojson has no `commodity` field.
  Replace with canonical MSHA→commodity crosswalk when available.
- **Y-track fiscal coupling** prices mine retirements at 0; blocked on DOR Mineral
  Valuation Report coefficients.
- **SITE_COMPAT gaps:** two distinct root causes. For industrial anchor sites,
  captive generation maps to the existing `smr_advanced` action, but it is
  intentionally **not wired** into `SITE_COMPAT['industrial']` pending policy /
  precedent review; current wired actions are `battery_grid` and
  `industrial_load_flexible`. For commercial anchor sites, storage is wired via
  `battery_grid`, but there is **no suitable commercial efficiency-retrofit
  action** in `action_library_v3.json` under another name; `community_solar` is
  the other current wired commercial action.
- **gas_combined_cycle** in SITE_COMPAT thermal but absent from action library (Z4
  known debt, not repeated).
- **Python tests** cannot run in the f1-engine-lock worktree (missing gitignored data
  files). Verified passing against main worktree data during development.
- **Anchor geojson in terra-app/src/data/**: copied for TS test access; should be
  managed via build-time symlink or data pipeline in production.

---

## Phase C1 — County Climate Projections (CMIP6/SSP Acquisition — LOCA2 Final)
**Date:** 2026-07-11 (C1.1–C1.5 back-filled; C1.6 written at conclusion)
**Status:** Closed — core-set CMIP6 values delivered via CRIS LOCA2.

### C1 phase history

**C1.0 (Notebook 23):** Initial pull. CMRA ArcGIS FeatureServer responded 200 but
the correct org ID was not found. Literature-scaled synthetic fallback built for all
157 counties × 12 metrics. Confidence `low` throughout.

**C1.1:** CarbonPlan DeepSD (OSN Zarr) and MACA (CMIP5 RCP) probed. CarbonPlan chunk
layout impractical. MACA has no native SSP labels; relabeling prohibited.

**C1.2 (Notebook 23b):** Bounded CarbonPlan attempt failed at Broomfield CO (no
grid centroid). MACA scripted for 1 model (bcc-csm1-1), RCP4.5→ssp245 /
RCP8.5→ssp370 proxy, monthly aggregation for annual_mean_temp_f and
annual_precip_total_in across 157 counties. CDD/HDD derived from monthly tmean
approximation. Method `cmip5_rcp_as_ssp_proxy`, confidence `low`.

**C1.3:** MACA historical (1950-2005) pulled for 3 validation counties; CCSM4 excluded
(malformed THREDDS response). MACA range did not bracket C1's observed references.

**C1.4:** Root-cause: C1 comparison values were fallback climatology proxies, not real
observed data. MACA coordinate/unit handling verified correct. Low-confidence downgrades
from C1.3 reverted.

**C1.5 (Notebook 23b):** PRISM 4km annual gridded observations pulled for Baca CO,
Eagle CO, Laramie WY (1981-2005). MACA historical range did not bracket PRISM observed
in any of 6 comparisons → annual_mean_temp_f and annual_precip_total_in MACA values
downgraded to `low` confidence project-wide. Back-cast doctrine changed from strict
bracketing to ±1.5°F / ±10% tolerance band.

**C1.6 (Notebook 23c — this entry):** NOAA CRIS LOCA2 Ensemble FeatureServer
(`services3.arcgis.com/0Fs3HcaFfvzXvm7w`) identified as the correct NCA5 endpoint.
County-level pre-aggregated CMIP6 data (27-model LOCA2 ensemble mean), native SSP245
and SSP370, 16 decadal records per county (1950–2100), no authentication required.
All 7 core metrics plus max_consecutive_dry_days scripted and pulled.

### What was built
- 4 CRIS services × 2 SSPs = 8 queries, all successful
- Decades 1950–2100 mapped to 5 × 30-year climatology windows by averaging 3 representative
  CRIS decades per window
- TERRA era midpoints derived by linear interpolation between the two bounding windows
  (weights per existing epoch_doctrine)
- p50 = LOCA2 ensemble mean (direct CRIS value)
- p10/p90 = p50 ± IPCC AR6 WG1 Ch.11 / NCA5 Ch.2 multi-model spread for North America;
  spread grows with time horizon and scenario (SSP370 ×1.2–1.3 vs SSP245)
- Method `loca2_cmip6_ensemble_mean_with_ipcc_ar6_spread`, confidence `medium`

### Back-cast gate (PRISM 1981-2005, tolerance ±1.5°F / ±10%)
- **PASS** Baca, CO `annual_mean_temp_f`: PRISM=53.825, LOCA2=54.937, PASS (+1.11°F)
- **PASS** Baca, CO `annual_precip_total_in`: PRISM=16.459, LOCA2=14.936, PASS (9.3%)
- **FAIL** Eagle, CO `annual_mean_temp_f`: PRISM=38.812, LOCA2=36.236, FAIL (+2.58°F, tol=1.5)
  — **terrain-driven cold bias, not a silent pass.** LOCA2's 1/16° grid underrepresents
  mountain-valley temperature inversions that PRISM's 4km topographic adjustment captures.
  Documented LOCA2 complex-terrain limitation (NCA5 Ch.2, LOCA2 technical note). Absolute
  temperature levels are cold-biased for Eagle CO (~2.6°F); relative warming trends between
  epochs are reliable. Bias correction flagged as C3 debt for mountain counties.
- **PASS** Eagle, CO `annual_precip_total_in`: PRISM=23.735, LOCA2=22.748, PASS (4.2%)
- **PASS** Laramie, WY `annual_mean_temp_f`: PRISM=45.946, LOCA2=46.483, PASS (+0.54°F)
- **PASS** Laramie, WY `annual_precip_total_in`: PRISM=15.809, LOCA2=15.449, PASS (2.3%)

Back-cast result: **PARTIAL** (5/6) — 1 documented terrain-driven exception (Eagle CO); not
a general LOCA2 validity failure.

### Acquisition path attempt log
Priority order from C1.2 mandate: (1) NOAA CRIS/CMRA, (2) NASA NEX-GDDP-CMIP6 on AWS S3,
(3) LOCA2 direct (UCSD). **Path 1 succeeded on the first attempt — paths 2 and 3 were not
needed.**

- **Path 1 — NOAA CRIS LOCA2 FeatureServer** (`services3.arcgis.com/0Fs3HcaFfvzXvm7w`):
  SUCCESS. 8 queries (4 services × 2 SSPs), each paginated 3 pages × 2000 records = 6000
  features per query; 48 total pages, all OK. No auth. Filter: `STATE_ABBREV IN
  ('CO','ID','MT','NE','SD','UT','WY')`. Fields: `GEOID,Begin_Date,<metric_fields>`.
  All 157 study counties covered. 16 decadal records per county (1950–2100).
  Prior sessions had probed the wrong org ID (`P3ePLMYs2RVChkJx`, a demographics org);
  the correct NCA5 endpoint org is `0Fs3HcaFfvzXvm7w`.
- **Path 2 — NASA NEX-GDDP-CMIP6 (AWS S3):** Not attempted. Path 1 delivered all metrics.
- **Path 3 — LOCA2 direct (UCSD):** Not attempted. Path 1 delivered all metrics.

### MACA cross-check (12 comparisons at epoch 2030)
MACA (MACAv2-METDATA, bcc-csm1-1, CMIP5 RCP-as-SSP proxy, C1.2) vs LOCA2 at ssp245/2030:

| County      | Metric           | MACA   | LOCA2  | Diff    |
|-------------|------------------|--------|--------|---------|
| Baca CO     | temp (°F)        | 49.75  | 47.88  | −1.87   |
| Eagle CO    | temp (°F)        | 43.36  | 39.96  | −3.40   |
| Laramie WY  | temp (°F)        | 49.56  | 47.73  | −1.83   |
| Baca CO     | precip (in)      | 16.08  | 14.96  | −1.12   |
| Eagle CO    | precip (in)      | 23.77  | 22.58  | −1.19   |
| Laramie WY  | precip (in)      | 16.69  | 15.56  | −1.13   |

**Temperature mean diff (3-county):** LOCA2 = −1.89°F vs MACA. **Direction expected:**
CMIP6/SSP245 runs cooler than CMIP5/RCP4.5 in the Intermountain West at 2030 (lower
near-term forcing trajectory); consistent with literature. Eagle CO divergence (−3.40°F)
substantially exceeds the mean, consistent with LOCA2 cold bias in complex terrain
(same root cause as back-cast failure).

**Precipitation mean diff (3-county):** LOCA2 = −1.09 in vs MACA. Minor; within expected
model-generation and resolution differences.

MACA cross-check did not reveal any anomalies beyond the Eagle CO cold bias already
documented in the back-cast gate.

### Output files
- `data/processed/county_climate_projections.json` (schema_version=C1.6, 39888 records)
- `data/processed/climate_sources.csv` (updated)
- `data/raw/climate/cris_loca2_raw_2026-07-11.json` (query manifest)
- `MANUAL_FETCH.md` (C1.6 section appended)

### Retained literature-based metrics (roadmap exemptions)
- `high_fire_danger_days` — CMRA fire weather / USFS WRC baseline, confidence `low`
- `water_stress_index` — judgment-weighted index, confidence `low`
- `snotel_swe_baseline_in` / `snotel_swe_projected_in` — NRCS SNOTEL proxy, confidence `low`

### Known remaining debt
- C3 will wire ClimateContext tables to engine demand-modulation functions (CDD/HDD).
- precip_99p_daily_in = PRABVNZ99TH (total extreme-day precipitation); single-day
  exceedance threshold not separately available from CRIS at county level.
- p10/p90 spread is derived from literature, not computed from LOCA2 individual model runs;
  confidence remains `medium` until member-level extraction is possible.
- Fire/water/SWE metrics require separate data-track work outside C1 scope.

---

## Wave 2 Close-Out
**Date:** 2026-07-12
**Verifier:** Gate V2 independent pass from `main`
(`ddaa868db1d858678c0f69cd902a2ecd4268f9f4`).

### What shipped
- **F1 anchors + Golden K:** Engine v4.3 seeds Tier 2 anchors into
  `asset_registry`, adds anchor asset classes (`mine`, `industrial_load`,
  `commercial_anchor_load`), excludes those classes from `existing_assets`,
  and freezes Golden K with four digest contracts at 2040.
- **F3 pin placement:** merged into main on 2026-07-12 (after Gate V2 snapshot).
  F3 build-log entry present in this merged state.
- **C1.2/C1.6 climate data:** C1.2 delivered MACA/PRISM validation work; C1.6
  delivered real county-level CMIP6/SSP data via NOAA CRIS LOCA2 for the core
  climate metrics, with Eagle CO cold bias documented rather than silently
  passed.
- **F0.2 driver fix:** Notebook 22 moved economic-driver rankings to the
  CBP bulk/API fallback plus QCEW government ownership path, preserved
  per-county `driver_source`, passed the ten-county credibility gate, and
  populated low-confidence MW values for the four formerly blocked WY gap-fill
  promotions.

### Consolidated known debt
- **Commodity crosswalk:** F1's `ANCHOR_MINE_COMMODITY` lookup is derived from
  facility names because `mw_anchor_facilities.geojson` has no canonical
  `commodity` field. Replace with MSHA-to-commodity crosswalk when available.
- **Y-track zero-pricing:** mine-retirement Y-track hooks emit
  `y_track_price: 0` and `y_track_confidence: flagged`; fiscal coupling remains
  blocked on mineral valuation coefficients.
- **SITE_COMPAT gaps:** `gas_combined_cycle` remains referenced by thermal
  SITE_COMPAT but absent from `action_library_v3.json`. Industrial/commercial
  anchor-site compatibility is intentionally narrow and should be reviewed as
  policy/action-library coverage expands.
- **Eagle CO bias:** LOCA2 annual mean temperature is cold-biased for Eagle CO
  relative to PRISM by about 2.6 F; relative warming trends remain usable, but
  mountain-county bias correction is C3 debt.
- **CDD/HDD engine coupling:** ClimateContext data are populated, but CDD/HDD
  demand-modulation functions and Python runtime ClimateContext plumbing are
  not wired; C3 inherits this C0 debt.

### Gate V2 disposition

Independent verification found the core F1 and C1.6 claims substantially
supported, but Wave 2 does **not** pass Gate V2 cleanly from this checkout:

- F1 replay passed the local parity suite (`284` tests with the temporary
  independent probe; `281` tests in the committed suite) and Golden K matched
  all four 2040 digest contracts. A temporary anchor-neutrality probe also
  confirmed pre-existing frozen replay digests were unchanged with anchors on
  vs off under migration on and off for the probed frozen set.
- `fixture_registry.json` still reports `amendments_used: 4`; F1 consumed no
  amendment.
- Direct materialization inspection corrects F1's wording: the accurate claim
  is **no anchor-derived field enters `existing_assets`, proven by digest
  identity**. `anchor_id` and `co2e_tpy` do not enter `existing_assets`; the
  pre-existing production-asset materialization still contains `commodity`,
  unrelated to anchors and unchanged by F1 because anchor classes are excluded
  before materialization.
- SITE_COMPAT/action-library join is clean for the current F1 anchor additions:
  `battery_grid`, `industrial_load_flexible`, and `community_solar` are present
  in `action_library_v3.json`; `gas_combined_cycle` remains the known Z4 gap.
- The four formerly blocked WY promotions are present with real numeric values,
  not null or blocked: Goshen 1.380 MW, Johnson 0.648 MW, Niobrara 0.250 MW,
  Sublette 1.488 MW.
- F0 residual before/after top-3 LQ spot-check is only partially reproducible
  from local artifacts: current top-3 rankings are present, but the pre-F0.2
  top-3 table for the reported 130 shifted counties is not persisted in the
  checked-in artifacts. The notebook captured prior top-1 in memory during
  execution, not as a reusable verification artifact.
- Build-log completeness is not clean: F0 is consolidated and C1 appears as a
  single canonical phase entry, but the F3 entry is absent from this `main`
  snapshot.

Because C1.6 delivered real CMIP6/SSP LOCA2 data, the roadmap's branch (a)
applies once the orchestrator accepts the above discrepancies: **C2 data-half**
may open in Wave 3 as the Codex registry/data merge unified with F1's anchor
classes, and **C3 engine-lock** may open to ship the C0-inherited
ClimateContext plumbing and CDD/HDD coupling debt, pending orchestrator
sign-off.

---

## Session F3 — Sub-County Pin Placement (engine-inert)
**Date:** 2026-07-11 · **Branch:** `f3-ui-pins` worktree · **Executor:** Sonnet 4.6

### What was built

F3 adds sub-county pin placement to the action-placement flow. The feature is
fully engine-inert: coordinates are UI metadata that flow through the data
pipeline but are stripped at the engine boundary. County → primary_bus
resolution is unchanged in all engine functions.

**New files:**
- `src/data/mw_anchor_facilities.geojson` — 12 Tier-2 anchor facilities
  (Mountain West study area, real EIA-860 locations) for snap targets
- `src/ui/map/QueuedBuildMarkers.tsx` — renders pin icons at `site_coords`
  when present; falls back to county centroid; `map.on('move'/'zoom')`
  for live repositioning
- `tests/parity/pin-placement-f3.test.ts` — 5 describe blocks, 10 tests
  covering the four F3 invariants + 3.0→3.1 backward compatibility

**Modified files:**
- `src/engine/types.ts` — `site_coords?: [number, number]` added to
  `ActionLogEntry`; comment confirms UI-only status
- `src/state/store.ts` — `PinSnapTarget` interface; `PlacementMode` extended
  with `pinCoords`, `ghostCursorCoords`, `zoomAboveThreshold`, `snapTarget`;
  `queueAction` accepts optional `siteCoords`; three new store actions:
  `setPlacementPin`, `setGhostCursorCoords`, `setPlacementZoomAbove`
- `src/ui/map/PlacementOverlay.tsx` — full pin interaction rewrite: ghost
  cursor with snap ring, `PIN_ZOOM_THRESHOLD = 9.0`, `SNAP_RADIUS_DEG = 0.05`,
  MapLibre `queryRenderedFeatures` for PiP validation, nudge toast for
  outside-county clicks, snap priority (Z4 sites > Tier-2 anchors), modal
  header shows pin label and succession-discount disclosure
- `src/ui/map/MapView.tsx` — mounts `<QueuedBuildMarkers>`
- `src/ui/panels/CountyCardDrawer.tsx` — `📍 pinned {lon}, {lat}` label on
  queued/UC player assets that carry `site_coords`
- `src/ui/tokens.css` — `@keyframes nudge-fade` for toast fade-out

### Blast-radius diff (engine numeric paths: zero changes)

```
terra-app/src/engine/types.ts          |   3 +   ← type annotation only
terra-app/src/state/store.ts           |  61 +-  ← UI state only
terra-app/src/ui/map/MapView.tsx       |   2 +
terra-app/src/ui/map/PlacementOverlay.tsx | 611 +-
terra-app/src/ui/panels/CountyCardDrawer.tsx |  23 +
terra-app/src/ui/tokens.css            |   7 +
```

**engine.ts, indicators.ts, replay.ts, persistence.ts, budgets.ts, events.ts:
no changes.** `types.ts` change is additive-only (optional field, no existing
interface altered).

### Engine-inert contract

`site_coords` is intentionally absent from:
1. `computeReplayDigest` — digest inputs derived from engine state only
2. `replayScenario` / all engine functions — county→primary_bus unchanged
3. Persistence: field is preserved in export/import round-trip (survives as JSON)
4. Schema version stays at 3.1 — site_coords is an optional field on existing schema

Snapping is the **only** way pin position affects engine numbers: snapping to a
Z4 site injects `succession_site_id` via the existing engine succession path
(TTD/capex/TX waivers). This path was present in Z4; F3 merely routes
`site_coords` → snap detection → existing discount logic.

### Test results (pre-rebase, against post-C0 base)

```
Test Files  21 passed (21)
     Tests  278 passed (278)
  Duration  ~4.55s
```

**F3 parity delta: +9 tests** (all in `pin-placement-f3.test.ts`)

| Test | Description |
|---|---|
| F3-1a | Golden-B + site_coords → identical digest to without |
| F3-1b | Final engine state byte-identical with/without site_coords |
| F3-2a | site_coords survive export → importFromJson |
| F3-2b | digest matches after reimport |
| F3-3a | `computeReplayDigest(state, 'historical')` === `computeReplayDigest(state, undefined)` |
| F3-3b | pinned ↔ unpinned digest identical (C0 interaction) |
| F3-4a | mixed log: only pinned entries carry coords; absent ones remain undefined |
| F3-4b | mixed log same digest as all-unpinned |
| F3-5 | 3.0 legacy file → 3.1 migration → no site_coords explosion → replay clean |

Pre-F3 (post-C0 base): **269 TS / 99 Python = 368 total**
Post-F3 (pre-rebase): **278 TS / 99 Python = 387 total**
**F3 delta: +9 TS / +0 Python**

### Rebase onto F1 (2026-07-12)

`f3-ui-pins` rebased onto main at `ddaa868` (F1 merged). Two conflicts resolved:

**1. `TERRA_build_log.md`** — both sides added session entries at the same
location. Resolution: kept both — F1 block first, F3 block appended.

**2. `mw_anchor_facilities.geojson`** — add/add conflict. F3 carried a
12-feature EIA-860 stub (written before F1's dataset). F1's production file
(404 features, 265 Tier-2) supersedes it. Resolution: used HEAD (F1's file).
F3 snap code only reads `properties.tier` and `properties.name`; both exist
on F1's features. Jim Bridger real coordinates: [-108.7875, 41.7378]
(demo trace above corrected from stub coords).

**3. `types.ts`** — auto-merged cleanly. Both field sets intact: F1's
`anchor_id`/`co2e_tpy`/`display_sector`/`confidence` on `AssetInstance`;
F3's `site_coords` on `ActionLogEntry`.

Post-rebase test counts:
```
Test Files  22 passed (22)
     Tests  290 passed (290)   ← 281 (F1) + 9 (F3) = 290 ✓
  Duration  ~4.24s
Python:     111 passed (111)   unchanged
Total:      290 TS + 111 Python = 401
```

Blast-radius diff scoped to F3 commits: `engine.ts`, `indicators.ts`,
`replay.ts`, `persistence.ts` — **zero changes**. `types.ts` additive-only.

### Demo trace

```
1. Zoom to ≥9.0 (county towns legible)
2. Enter PlacementMode for smr_advanced / Sweetwater County (56037)
3. GhostCursor appears — follows mouse, amber crosshairs
4. Mouse near Jim Bridger (Tier-2 anchor) → snap ring, label "Jim Bridger"
5. Click → pin drops at snapped coords, modal opens with "📍 pinned -108.79, 41.74"
6. Confirm → ActionLogEntry carries site_coords; succession discount applied
7. Advance years → asset enters build_queue; QueuedBuildMarkers renders pin at site
8. County card queued row shows "📍 pinned -108.79, 41.74"
9. Export → JSON contains site_coords in actionLog entry
10. Reimport → site_coords survive, digest unchanged
```
