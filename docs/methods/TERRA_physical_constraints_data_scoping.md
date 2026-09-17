# TERRA Physical Constraints — Data Scoping Roadmap (P-Track, Stage 0)
## Endowment Vector, Place-Dependent Coefficients, and Dynamic Recalculation

**Written:** 2026-09-16, against `main` @ `cc92deb` (post-S8), `docs/PIPELINES.md` S9 vintage
**Status:** scoping document. This is the *data* roadmap that precedes the P-track plugin roadmap. It answers "what do we need, where does it come from, at what resolution, and where does it enter the engine" so the plugin roadmap can be written as sessions with gates rather than as wishes.
**Read alongside:** `TERRA_methods_overview.md` §9 (EES layer), `TERRA_climate_roadmap.md` (exogeneity doctrine, which this track inherits verbatim), `docs/PIPELINES.md` (pipeline status), `claude/W7_audit_followon_and_path_forward.md` (sequencing constraints).

---

## 0. The question this track exists to answer

> *How much does this energy asset, placed here, change economic quality of life — and how do the physical facts of the place (geology, terrain, water, exposure) govern how fast it can be built, how well it performs, and how long it lasts?*

Today TERRA answers the first half of that question with a constant. In `apply_action` (`src/terra_engine.py:2567–2640`) the county delta for each capital is

```
delta = action.ees_effects[K] × (magnitude / unit_scale)
```

with `ees_effects` a cross-ecoregion median from the Session 3 audit (e.g. `wind_utility`: E 0.0576, Ec 0.4318, S 0.0288 per 1,000 MW, confidence medium). The only place-dependence is gating: `applicable_counties` decides whether the action is allowed at all. The second half of the question — pace, quality, durability — is answered by per-action constants (`time_to_deploy: 3`, `design_life: 25`, `atb_cf: 0.35`), read at `queue_action` (`terra_engine.py:3075`) and the registry seeding path.

Three things already move by place and are the model for how the rest should work:

1. **Climate couplings** (`src/climate_couplings.py`): `compute_water_stress_derate`, `compute_heat_derate`, `compute_demand_modifier` are county × year functions of the projection tables. They are multiplicative modifiers on a base quantity, they are no-ops under the historical lens, and they carry `{sensitivity, confidence, narrative}`. This is the pattern.
2. **Exposure tags** (`asset_exposure_tags.json`): per-asset `wildfire_exposure`, `water_dependency`, `flood_zone`. But `flood_zone` defaults to `not_screened_or_low` for every asset — the flood dimension is a placeholder.
3. **Bus-level renewable capacity factors** (pipeline B, nb12: WIND Toolkit + NSRDB, 500 buses × 16 representative hours). Computed, frozen, and **not read by the county engine**. Reconnecting this is the cheapest place-dependent quality signal in the project.

So the track is not "add physics to a model that has none." It is: generalize the pattern that climate couplings already use, feed it a static endowment vector alongside the dynamic climate tables, and let both the *coefficient* and the *lifecycle parameters* of an action be functions of place.

---

## 1. Design target

### 1.1 The endowment vector

Every county `c` (and, where the data supports it, every HUC-8 and ecoregion fragment) carries a static vector **Φ_c** built once by a data pipeline and stored as a runtime file. It is *static* in the sense of the climate doctrine: the player's actions never change it. The dynamic climate tables **X_c(t)** already exist and stay separate.

| Component | Symbol | What it captures | Touches |
|---|---|---|---|
| Terrain | `slope_mean`, `ruggedness_p90`, `elev_mean`, `buildable_fraction` | Construction difficulty, road/transmission cost, wind siting | pace, capex multiplier, suitability |
| Geology | `lithology_class`, `seismic_pga_2pct50`, `karst_flag`, `subsurface_storage_class` | SMR/geothermal/CAES/storage suitability; foundation cost | suitability, pace, design_life (exposure) |
| Hydrology | `mean_annual_runoff_mm`, `q7_10_low_flow_ratio`, `groundwater_stress_class`, `withdrawal_to_availability` | Thermal cooling viability, hydro, ag yield, restoration ceilings | suitability, derate base, E ceiling |
| Soils | `nccpi_mean`, `rangeland_productivity_class`, `erodibility_k` | Ag actions, prairie/wetland restoration maturation, land-use conflict | E and Ec coefficients for ag/restoration actions |
| Resource | `wind_cf_p50`, `solar_cf_p50`, `geothermal_favorability`, `developable_mw_wind/solar` | Quality of production for renewables; hard caps on buildable MW | atb_cf override, magnitude cap |
| Exposure (static) | `nfhl_1pct_zone_share`, `nfhl_0.2pct_zone_share`, `wui_share`, `wrc_rank` | Baseline flood and fire exposure of land and stock | exposure tags, design_life haircut |
| Absorptive capacity | `utilities_employment_lq`, `construction_lq`, `commute_shed_pop`, `grid_headroom_mw` | Whether local labor and grid can absorb the build; leakage of Ec | Ec coefficient, pace |

Every component carries `{value, source, vintage, resolution, aggregation_method, confidence}`, exactly as climate values do. The composition of any derived index (e.g. `buildable_fraction`) is documented once and every weight is flagged as judgment.

### 1.2 The coefficient function

The change to `apply_action` is deliberately small. The linear-in-magnitude form stays; place enters through multipliers:

```
delta_K = β_{a,K} × M_K(a, Φ_c, X_c(t)) × (magnitude / unit_scale)

M_K = Π_j m_{j,K}(a, φ_j)          m ∈ [m_min, m_max], m = 1 at the reference point
```

where `β_{a,K}` is the existing library coefficient (unchanged, still the cross-ecoregion median), and each `m_{j,K}` is a documented, bounded, monotone modifier keyed on one endowment component and one capital. Likewise:

```
time_to_deploy_c = ttd_a × P(a, Φ_c)         (pace)
capacity_factor_c = cf_a × Q(a, Φ_c)         (quality) — or replaced outright by Φ.wind_cf_p50 where measured
design_life_c     = life_a × D(a, Φ_c, X_c)  (durability; exposure-driven, can only shorten)
magnitude_cap_c   = Φ.developable_mw          (hard physical ceiling)
```

**Non-negotiable constraint, inherited from the C-track:** with the endowment mode set to `flat` (every `m = 1`, every `P = Q = D = 1`, no caps), Goldens A–N must be byte-identical. The endowment layer is a strict superset. This is the P-track's version of "climate-off is byte-identical," and it is what allows the track to run without disturbing the parity discipline W7 is hardening.

**Reference point convention.** Modifiers equal 1 at the study-area median of the relevant component, so the *aggregate* behaviour of the library across the 157 counties is unchanged on average; the layer redistributes effect across places rather than inflating or deflating it. This keeps the MC sensitivity ordering (S8: prairie_restoration ρ=0.717 dominant) interpretable before and after.

### 1.3 What "economic quality of life" means operationally

Ec is already the composite of ACS income/employment/poverty/vacancy, BEA sectoral GDP, and energy-infrastructure access, normalized 0–10 on the Mountain West distribution. The place-dependent Ec modifier for an energy asset should be built from the three mechanisms the literature actually supports:

- **Local capture vs leakage** — share of construction and O&M spend retained locally, keyed on `construction_lq` and `utilities_employment_lq` (QCEW, already in `data/raw/bls_qcew/`) and commute-shed population. A 1,000 MW wind farm in a county with no construction labor base imports its workforce; Ec rises less and S may fall (housing pressure, which `_compute_housing_pressure` already models).
- **Fiscal capture** — property/severance/PILT structure. WY-only today (pipeline E); other states stay EES-only per the scope doctrine.
- **Durability of the income stream** — an asset whose design life is shortened by exposure produces a shorter Ec stream; `project()` over `n_years` already integrates this if `design_life_c` is what the registry reads.

This is the part the user framed as *the key* and it is also the part with the thinnest published coefficients. The honest plan is: build the endowment components first (they are facts), build the modifiers as flagged judgment with bounded ranges second, and let the MC machinery report which modifiers actually matter before anyone argues about their exact values.

---

## 2. Source inventory (verified 2026-09-16)

Legend — **Open**: scripted pull possible from a public endpoint. **Manual**: public but needs a portal download. **Blocked**: licensing or availability prevents use as a runtime dependency.

| Layer | Source | Access | Native resolution | Aggregation to county / HUC-8 | Status / notes |
|---|---|---|---|---|---|
| Elevation, slope, ruggedness | USGS 3DEP 1 arc-second (≈30 m) seamless DEM; 1/3 arc-second (≈10 m) available | **Open** — USGS National Map, AWS/OpenTopography API | 30 m | zonal stats (mean slope, p90 TRI, share < 15% slope) in EPSG:5070 | 1 arc-second is sufficient for county/HUC-8 zonal stats; 10 m only if corridor-scale siting is ever attempted. Static; pull once. |
| Bedrock / surficial geology | USGS State Geologic Map Compilation (SGMC) geodatabase, CONUS | **Open** — ScienceBase | 1:500k-scale state maps, harmonized | area-weighted lithology class shares | Sufficient for suitability classes (crystalline/sedimentary/volcanic; karst flag). Not sufficient for site-level foundation engineering — say so on the methods page. Static. |
| Seismic hazard | USGS NSHM 2023 PGA (2% in 50 yr) | **Open** | gridded | county mean / max | Enters SMR and dam/storage suitability only. Static. |
| Geothermal favorability | NREL/NLR Geothermal Prospector + USGS Great Basin favorability | **Manual** (map services; download varies) | gridded / polygon | county class (low/med/high) | Note: NREL was renamed **National Laboratory of the Rockies (NLR)** in 2025; URLs now `nlr.gov`. Cite as "NREL (now NLR)". |
| Streamflow / runoff / low flow | NOAA National Water Model v3.0 retrospective (AWS Open Data, 1979–2023) on NHDPlus reaches; USGS NWIS gages for validation | **Open** — AWS registry `nwm-archive`; CUAHSI tooling | reach | HUC-8 mean annual runoff, Q7,10 ratio; county by HUC-8 crosswalk (`spatial_hierarchy_huc8.parquet`, currently untracked — see PIPELINES gap #5) | Heavy pull (Zarr/NetCDF); scope to the 7 study ecoregions' HUC-8s. Back-cast against 3 NWIS gages as the climate track did for temperature. |
| Water withdrawals / availability | USGS water use 2020 by county and HUC-12 (PP 1894-D, water years 2010–20); USGS Integrated Water Availability Assessments | **Open** | county / HUC-12 | direct | Fills the `water_withdrawals_mgd: null` field that `mw_county_cards.json` already reserves. Withdrawal-to-availability ratio = the static base that `water_stress_index` deltas then move. |
| Groundwater stress | USGS principal aquifers + IWAAs groundwater trends | **Open** / partly **Manual** | aquifer polygon | area-weighted class | Class-level only; flag `confidence: low`. |
| Soils / productivity | gSSURGO / gNATSGO (NRCS, 2025 refresh), NCCPI and rangeland productivity | **Open** — NRCS Box/Ag Data Commons | 10–30 m raster | county mean NCCPI; rangeland class share | Pipeline H (ag) partly consumes this already for WY; extend to all 157 counties. |
| Flood hazard (static baseline) | FEMA National Flood Hazard Layer (NFHL) | **Open** — FEMA GeoPlatform services / MSC state downloads | polygon (SFHA zones) | share of county land and of housing stock in 1% and 0.2% zones; asset point-in-polygon | Replaces the `not_screened_or_low` placeholder in exposure tags. Coverage gaps in rural WY/MT counties are real — record `unmapped_share` explicitly rather than treating unmapped as low. |
| Precipitation frequency (nonstationary) | **NOAA Atlas 15** — Vol. 1 (historical, supersedes Atlas 14) and Vol. 2 (model-based projections to 2100) | **Open when released** | gridded | county ratio: projected / historical depth for 1% AEP 24-hr | NOAA's schedule: preliminary CONUS estimates **September 2026**, published 2027. Only the Montana pilot (Sept 2024) exists today. The climate pull already flagged this (`atlas_fallback_design_storm_proxy`). Plan: pull the preliminary CONUS release when it lands; until then use the LOCA2 `precip_99p_daily_in` ratio already in `county_climate_baseline.json` as the scaler. |
| Property-level flood projections | First Street (now MSCI) flood model | **Blocked** as a runtime dependency — paid bulk data behind MSCI terms | property | — | Do not build on it. Acceptable as a one-time validation comparison if academic access is obtained; never as a load path. |
| Ocean heat content | NOAA NCEI Global Ocean Heat Content CDR, 0–700 m and 0–2000 m, annual/pentadal/monthly basin series | **Open** — NCEI CSV | global | n/a (global scalar per year) | Used as a *displayed forcing gauge* and to build the SSP-conditioned forcing index (§3). Not a spatial input. |
| Wind / solar resource | WIND Toolkit + NSRDB/PVWatts v8 per bus (pipeline B, nb12) | **Already pulled** — frozen | bus × 16 hours | county via `_resolve_geoid_to_bus` | Reconnect, don't re-pull. Decision required: pipeline B archived vs live (audit Horizon 3). |
| Developable capacity & exclusions | NREL/NLR reV supply curves — Land-based Wind 2023, Utility-scale PV 2023 (OEDI); Siting Lab ordinance databases | **Open** — OEDI | supply-curve site (~11.5 km) | county sum of developable MW; mean LCOE-relevant CF | Gives the hard `magnitude_cap_c` and an independent CF check against nb12. Exclusion layers encode terrain, protected land, and local ordinances — this is where topography enters siting without re-deriving it. |
| Labor absorptive capacity | BLS QCEW county × NAICS (2211 utilities, 23 construction), LQ | **Open** — already in `data/raw/bls_qcew/` | county | direct | Commute-shed population from Census LODES (Open). |
| Grid headroom | synthetic bus firm capacity vs load (`_compute_firm_capacity`) | **Internal** | bus | county via crosswalk | Already computed; the transmission plugin (audit Priority 2) will make it real. P-track reads it; does not own it. |
| Hazard baseline (existing) | FEMA NRI v1.20, USFS WRC, MTBS | **Already pulled** | county | — | Unchanged; P-track adds flood geometry to what NRI gives as EAL. |

**Feasibility verdict.** Everything in the endowment vector is public, county-resolvable, and citable, with two soft spots: (a) nonstationary precipitation frequency depends on an Atlas 15 release that is scheduled for this month but not yet in hand, and (b) the Ec modifiers (local capture / leakage) have thin published coefficients and will be flagged judgment with MC-reported sensitivity. Nothing here requires a paid dataset. The data situation is closer to the climate track (national, tabulated) than to fiscal (institutional archaeology).

---

## 3. Dynamic forcing: ocean heat, precipitation intensity, moving flood zones

The climate track established that the player chooses a lens, never a lever. The P-track adds one dynamic mechanism on top of the existing tables and one display gauge, both exogenous.

**Forcing gauge.** A global forcing index `F(t)` per lens, displayed in the HUD next to the lens badge: observed NCEI ocean heat content anomaly (0–2000 m) through the present, then the SSP-consistent trajectory for the lens. This is the "physical forces as time steps forward" the user asked for, made visible. It is a *display of the boundary condition*, not an input the engine computes from — LOCA2 already embeds the forcing. Say this plainly on the methods page or the gauge will be read as a model.

**Moving flood zones.** Flood exposure becomes time-varying through a documented ratio:

```
flood_zone_share_c(t) = nfhl_1pct_share_c × R_c(t)
R_c(t) = f( precip_depth_1pct_24h_c(t) / precip_depth_1pct_24h_c(hist) )
```

where the depth ratio comes from Atlas 15 Vol. 2 once released, and from the LOCA2 `precip_99p_daily_in` ratio (already in `county_climate_baseline.json`, per lens × epoch) until then. `f` is a bounded, documented expansion rule (e.g. the 0.2% zone becomes the effective 1% zone when the depth ratio crosses a cited threshold), `confidence: low`, and it only ever expands. Assets and housing stock in the newly-expanded zone gain the `flood_zone` tag at the epoch boundary, which then flows through the existing hazard → exposure → consequence chain (`apply_hazard_event_consequences`) with no new damage arithmetic. Adaptation actions from the C-track (`floodplain_buyout`, `harden_asset`) already exist as the player's answer.

**Exogeneity test extension.** The existing test (mutate the action log, assert hazard tables unchanged) gains a second assertion: mutate the action log, assert Φ_c and R_c(t) unchanged.

---

## 4. Where dynamic recalculation happens

The user's requirement is that placing an asset recalculates the index from the class of assets selected, live. The engine already does this (`apply_action` → `compute_ees_summary`; preview via `project_delta`). The P-track changes what is inside the multiplication, not the call graph:

| Engine site | Today | With P-track |
|---|---|---|
| `apply_action` (`:2567`) | `ees_effects[K] × scale` | `ees_effects[K] × M_K(a, Φ_c, X_c(t)) × scale`; `magnitude` clamped to `magnitude_cap_c` with a returned reason |
| `queue_action` (`:3075`) | `ttd = action.time_to_deploy` | `ttd = round(action.time_to_deploy × P(a, Φ_c))` |
| registry seeding / `_materialize_build_queue` | `design_life` from library | `design_life × D(a, Φ_c, X_c)`; exposure tags from Φ instead of class defaults |
| `climate_couplings.compute_water_stress_derate` | derate from ΔWSI only | derate from (static withdrawal-to-availability base from Φ) + ΔWSI — same function signature, better denominator |
| `project_delta` | preview of one action | unchanged call; now returns place-specific preview plus the modifier breakdown for the confirm-modal impact card (engine computes, UI renders) |
| `_evaluate_couplings` / `synergy_groups` | tag-only | unchanged in Stage 0; portfolio search is a later P-track phase, not scoping |

Performance: Φ_c is loaded once at `initialize_state`; each modifier is an O(1) lookup and a bounded function. No per-action raster work at runtime. The pipeline does the geometry; the engine does arithmetic.

---

## 5. Sessions for the data stage (P0–P5)

These are data and schema sessions. Engine coupling and the portfolio search belong to the plugin roadmap that follows; the handoff conditions here are what that roadmap will assume.

| Session | Deliverable | Depends on |
|---|---|---|
| **P0** — Endowment schema + flat gate | `endowment_mode: "flat" \| "measured"` on scenario files (default `flat`, migration: absent reads as flat); `Φ` plumbing into state as an inert table; exogeneity test extended; Goldens A–N byte-identical under `flat`. Zero behaviour change. | W7-1/W7-2 (CI + manifest) so the new runtime file has a manifest entry from day one |
| **P1** — nb27 terrain, geology, seismic, soils | 3DEP zonal stats, SGMC lithology shares, NSHM PGA, gSSURGO NCCPI/rangeland for all 157 counties + HUC-8s. Output `county_endowment_static.json` (partial) + `endowment_sources.csv`. Three-county sanity table (one plains, one mountain, one basin) printed for the methods page. | P0; `spatial_hierarchy_huc8.parquet` must be tracked first (PIPELINES gap #5) |
| **P2** — nb28 hydrology and water | NWM v3.0 retrospective → HUC-8 runoff and low-flow ratio; USGS 2020 water use → county withdrawals (fills `water_withdrawals_mgd`); IWAAs groundwater class. Back-cast against 3 NWIS gages. | P1 (crosswalk) |
| **P3** — nb29 flood geometry + forcing series | NFHL zone shares (land and housing stock) with `unmapped_share`; asset point-in-polygon → real `flood_zone` tags; NCEI OHC series; Atlas 15 preliminary CONUS pull if live, else LOCA2 ratio with `atlas_fallback` flag carried forward. `R_c(t)` table per lens × epoch. | P0; `24_hazard_exposure_baseline.ipynb` (extend, don't fork) |
| **P4** — nb30 resource and developable capacity | reV supply-curve aggregation to county (developable MW, CF); reconnect nb12 bus CFs to counties; geothermal favorability class. Decision recorded: pipeline B archived or live. | P0; pipeline B decision |
| **P5** — nb31 absorptive capacity | QCEW LQs, LODES commute-shed population, grid headroom read from bus state. Output merged into `county_endowment_static.json` (complete). Manifest entry, dual-path byte-identity check (Python and TS copies). | P1–P4 |

**Handoff condition for the data stage as a whole:** `county_endowment_static.json` covers all 157 counties with every component carrying source, vintage, resolution, method, and confidence; the file has a manifest hash and a tracked generator; Goldens A–N remain byte-identical under `flat`; `endowment_sources.csv` is complete; the three-county sanity table exists. At that point the plugin roadmap (modifier functions, Golden L "the siting fork", portfolio search) can be written against real data.

**Sequencing against W7.** P0 should not start before W7-2 lands the manifest and CI — otherwise this track adds a 63rd runtime file to a system that has just learned to track 62. P1–P5 are pure data sessions and are parallel-safe with W7-3/W7-4 once P0 is in.

---

## 6. Judgment calls to flag now

- **County is too coarse for terrain and flood; HUC-8 is the right hydrologic unit; the bus is where CF lives.** The endowment file therefore carries three keyed tables, and the engine reads the county one by default. This mirrors the four-scale doctrine and should be stated, not discovered.
- **Unmapped NFHL ≠ low risk.** Record `unmapped_share` and give unmapped assets `flood_zone: unmapped` rather than `low`. Rural Wyoming counties will have large unmapped shares.
- **Atlas 15 timing.** If the preliminary CONUS release arrives during P3, use it and flag `preliminary`; if not, the LOCA2 ratio stands and the flag carries. Do not stall P3 on it.
- **The Ec local-capture modifier is the least-supported number in the track.** Encode it as a range, default to the conservative (low-capture) end, and let the MC identify whether it matters before spending advisor time on its value.
- **Pipeline B.** Reconnecting nb12 CFs is the first time the frozen pipeline's outputs would feed the live engine. That forces the archived-vs-live decision the audit deferred. Either answer is fine; deferring it again is not.
- **The forcing gauge is display, not model.** State it on the gauge itself.

---

## 7. Digest registry delta (anticipated)

| Artifact | Type | Status |
|---|---|---|
| Goldens A–N | all digests | byte-identical under `endowment_mode: flat` through the entire data stage |
| Replay digest | computation change | gains `endowment_mode` in P0, with migration note |
| Exogeneity test | permanent invariant | extended in P0 to assert Φ and R(t) independent of the action log |
| `county_endowment_static.json` | new runtime file | manifest entry required at P1; complete at P5 |
| `endowment_sources.csv` | sources file | the coefficient-sources analog for physical data |

---

## 8. Sources consulted for this scoping

NOAA Atlas 15 informational page (volumes, Montana pilot, Sept 2026 preliminary CONUS schedule); NOAA NCEI Global Ocean Heat Content CDR and basin time series; USGS 3DEP 1 arc-second DEM collection and OpenTopography API access; USGS State Geologic Map Compilation geodatabase (ScienceBase, DS 1052); NOAA National Water Model CONUS retrospective on the AWS Open Data registry and CUAHSI v3.0 retrieval tooling; USGS water use 2010–20 (PP 1894-D) and Integrated Water Availability Assessments data page; NRCS gSSURGO / gNATSGO and NCCPI; FEMA National Flood Hazard Layer (GeoPlatform services, MSC downloads, metadata); NREL/NLR reV Land-based Wind and Utility-scale PV supply curves 2023 (OEDI) and Siting Lab; DOE announcement of the NREL → National Laboratory of the Rockies rename; First Street bulk-data documentation (MSCI terms); BLS QCEW open-data CSV slices.

---

## One thing to carry forward

The county is the unit of analysis and governance. The bus is the unit of energy intervention. The tract is the unit of social measurement. The ecoregion is the unit of ecological suitability. The material ledger is the unit of honesty. The county fiscal ledger is the unit of local consequence. The climate scenario is the unit of exogenous uncertainty. **The endowment vector is the unit of physical constraint — it governs how fast, how well, and how long, and the player can read it but never rewrite it.**
