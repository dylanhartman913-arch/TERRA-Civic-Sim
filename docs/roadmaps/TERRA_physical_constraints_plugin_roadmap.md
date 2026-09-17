# TERRA Physical Constraints Plugin Roadmap (P-Track, Stages 1–3)
## Place-Dependent Coefficients, Durability, Synergy, and the Stability Index

**Written:** 2026-09-16, against `main` @ `cc92deb` (post-S8)
**Builds on:** `TERRA_physical_constraints_data_scoping.md` (Stage 0, sessions P0–P5). This document assumes the Stage 0 handoff condition is met: `county_endowment_static.json` exists for all 157 counties with a manifest hash and a tracked generator, `endowment_mode: flat` reproduces Goldens A–N byte-identically, and `R_c(t)` (flood expansion ratio per lens × epoch) is tabulated.
**Read alongside:** `TERRA_climate_roadmap.md` (doctrine inherited), `TERRA_lifecycle_roadmap.md` (registry and transitions), `TERRA_analytics_roadmap.md` (MC and sweep machinery), `docs/PIPELINES.md`.

**Purpose:** turn the vision — *place an asset, see how much it changes economic quality of life here, with the physics of the place governing how fast, how well, and how long; watch the forcing move; find the portfolio that maximizes the odds of stable, comfortable lives* — into sessions with gates. The vision has five parts and this roadmap gives each one a phase: coefficients that depend on place (P6), durability that depends on exposure (P7), the "why here" surface (P8), synergy as a mechanic rather than a tag (P9), the stability index (P10), and the portfolio search that finds peak solutions (P11).

---

## Design doctrine

### Constraint, not lever

The endowment vector Φ is a boundary condition the player reads and never rewrites, exactly as the climate lens is. Terrain does not flatten because a player builds a road; an aquifer does not refill because a player retires a plant. The one place a player *does* move the physical state is through actions that already exist as lifecycle assets — restoration raises E, water efficiency shifts a stress threshold — and those continue to flow through the action library, not through Φ. The exogeneity test asserts this in code.

### The modifier is the unit of place

Every place-dependent effect is a bounded, monotone, cited multiplier on a base quantity that already exists in the engine: `M_K` on `ees_effects`, `P` on `time_to_deploy`, `Q` on capacity factor, `D` on design life, and a hard cap on magnitude. No modifier creates an effect the library does not already have; it redistributes effect across places. Every modifier equals 1 at the study-area median of its endowment component, is clamped to a documented `[m_min, m_max]`, and carries `{component, sensitivity, source, confidence}`. A modifier without a source is a bug, the same as a climate value without a scenario.

### Flat is byte-identical, forever

`endowment_mode: flat` reproduces every golden through the entire track. The measured mode is a strict superset. This is the invariant that lets the P-track run beside W7's hardening without touching the parity contract.

### The reference pathway is advice the room can reject

P11's portfolio search produces a *reference pathway* — the engine's best answer under stated assumptions — never an auto-applied plan. It is rendered as one more pathway in comparison mode, badged `reference`, and it is expected to lose arguments in the workshop room. That is the point: the tool's authority comes from making the physics legible, not from telling a county commission what to build.

### Engine computes, UI renders; Python first, TS parity

Unchanged from every prior track. Modifier arithmetic lives in `src/terra_engine.py` and `src/endowment.py` (new, the sibling of `climate_couplings.py`), ported to `terra-app/src/engine/endowment.ts`. Every impact-card number traces to an engine return value.

### Doctrine addendum (ninth line)

> **The endowment vector is the unit of physical constraint.** It governs how fast, how well, and how long — and the player can read it but never rewrite it.

---

## Where the engine is at Stage 0 handoff

Facts the sessions below depend on, verified against `main` @ `cc92deb`:

- `apply_action` (`terra_engine.py:2567`) computes `delta = ees_effects[K] × magnitude/unit_scale`, clamps to [0, 10], writes `county_ees` and (for compat) `ecoregion_ees`. Network effects are hardcoded per `action_id` (`wind_utility`, `solar_utility`, `bus_load_add`).
- `queue_action` (`:3075`) reads `time_to_deploy` once at decision time.
- `advance_year` (`:3345`) applies a flat 0.1 %/yr EES depreciation. **`design_life` is not read by the Python engine.** It exists in the library and in `terra-app/src/engine/types.ts:178`.
- `_evaluate_couplings` (`:2976`) implements exactly one coupling, `nuclear_dc_coupling`, hardcoded: demand and supply actions on the same or adjacent bus activate a transmission-requirement reduction and a reliability credit. `synergy_groups` on actions (e.g. `coal_transition_cluster`) are tags with no behaviour.
- `project` / `project_delta` (`:4804–4870`) are the preview path: action vs do-nothing trajectories, deterministic.
- `climate_couplings.py` exposes `compute_demand_modifier`, `compute_water_stress_derate`, `compute_heat_derate` — county × year multipliers with `{derate_factor, sensitivity, confidence, narrative}`.
- `mc_worker.py` perturbs the non-zero `(action_id, capital)` coefficients; the sweep ranks marginal returns. Neither samples over lenses or seeds jointly.
- Grid headroom is `_compute_firm_capacity(bus)` vs `load_mw`; the transmission plugin (audit Priority 2) will make it real. P-track reads it, does not own it.

---

# Phase P6 — Modifier Library + Coefficient Function

The core of the vision: the same action, in two counties, produces two different Ec deltas for stated physical reasons.

### Session P6a — `endowment.py` and `endowment_modifiers.json` (Python)

**Claude Code session prompt:**

> Read `src/climate_couplings.py` end to end (it is the pattern), `apply_action`, `queue_action`, the P0 `endowment_mode` plumbing, and `county_endowment_static.json` before writing any code.
>
> 1. **Modifier table.** Create `data/processed/endowment_modifiers.json` (tracked generator: `notebooks/32_endowment_modifiers.ipynb`; sources in `endowment_sources.csv`). One entry per `(action_family, capital_or_parameter, endowment_component)`:
>    `{form: "linear" | "logistic" | "step", reference: <study-area median>, slope, m_min, m_max, source, confidence, judgment_call}`.
>    Launch set, deliberately small and defensible:
>    - **Ec, energy actions × `construction_lq` / `utilities_employment_lq`** — local capture. Range [0.6, 1.3], conservative default, `confidence: low`, judgment-flagged. The single least-supported number in the track; the MC in P6c decides whether it matters.
>    - **Ec, energy actions × `grid_headroom_mw`** — a step to 0.7 when the resolved bus is already in deficit (megawatts do not export from nowhere), lifted when the transmission plugin lands.
>    - **E, restoration actions × `nccpi_mean` / `rangeland_productivity_class`** — restoration ceiling, ecoregion-relative per the methods overview's arid-equity note.
>    - **S, energy actions × `commute_shed_pop`** — housing-pressure amplification, reusing `_compute_housing_pressure`.
>    - **`time_to_deploy` × `slope_mean` / `ruggedness_p90`** — pace, range [1.0, 1.8].
>    - **`time_to_deploy` × `nfhl_1pct_zone_share`** — permitting drag, range [1.0, 1.4].
>    - **capacity factor × `wind_cf_p50` / `solar_cf_p50`** — *replacement*, not multiplier: measured CF overrides `atb_cf` where a bus value exists; flag `cf_source: nb12 | atb_default`.
>    - **magnitude cap × `developable_mw_wind` / `developable_mw_solar`** — hard ceiling from reV; `apply_action` clamps and returns `{clamped: true, cap, reason}`.
>    - **SMR / geothermal suitability × `seismic_pga_2pct50`, `lithology_class`, `geothermal_favorability`** — gating plus a pace modifier; extends `applicable_counties` with an `endowment_gate` reason string.
> 2. **`src/endowment.py`.** `compute_ees_modifier(action, capital, geoid, endowment, climate_context)`, `compute_pace_modifier(...)`, `compute_quality_override(...)`, `compute_magnitude_cap(...)`, each returning `{factor, components: [{component, value, reference, factor_j, source, confidence}], narrative}`. Under `flat`: every factor is 1.0, cap is `inf`, override is `None`, and the return shape is identical.
> 3. **Wire-in.** `apply_action` multiplies by `compute_ees_modifier` and clamps magnitude; `queue_action` multiplies `ttd`; registry seeding reads the CF override. `delta_summary` gains `endowment_breakdown`. No other call site changes.
> 4. **Exogeneity.** Extend the test: mutate the action log; assert every modifier return is bit-identical.
>
> Gate: Goldens A–N byte-identical under `flat`; under `measured`, a hand-computed check for three counties (plains, mountain, basin) matches the engine to 1e-9.

### Session P6b — Golden O, "the siting fork" + TS parity

**Claude Code session prompt:**

> Port `endowment.py` to `terra-app/src/engine/endowment.ts`. Freeze **Golden O** (take the next free letter if another track has claimed O): one action (`wind_utility`, 300 MW), two counties chosen so that one is above and one below the study median on `construction_lq`, `slope_mean`, and `wind_cf_p50`; identical seed, lens, and year. Assert:
> - Ec deltas differ and the difference decomposes exactly into the recorded component factors;
> - `time_to_deploy` differs by the pace arithmetic and the operational year in the registry shifts accordingly;
> - the CF override is applied where nb12 has a value and `atb_default` elsewhere;
> - a 2,000 MW request in the county with 800 MW developable returns `clamped: true` and the clamped magnitude.
> Digest gains `endowment_mode`. Cross-runtime parity on O; A–N unchanged.

### Session P6c — Modifier sensitivity (analytics)

**Claude Code session prompt:**

> Extend `mc_worker.py` to perturb modifier slopes within their documented ranges jointly with coefficients. Re-run the MC and the magnitude sweep under `measured`. Report: (a) which modifiers move the sensitivity ordering at all; (b) whether the Ec local-capture modifier matters — if its rank correlation with outcome is below the smallest coefficient already in the priority list, freeze it at the conservative default and say so on the methods page rather than spending advisor time on it. Output `mc_modifier_priority.csv`.

**Handoff condition for P6:** the same action in two counties yields different, decomposable EES deltas and lifecycle parameters for stated physical reasons; flat mode byte-identical; the MC has told you which modifiers deserve a literature fight.

---

# Phase P7 — Durability and Moving Exposure

The "durable use value" argument needs the engine to know how long things last and what shortens them.

### Session P7a — The durability hook

**Claude Code session prompt:**

> Read `advance_year` (`:3299–3400`), the registry build/commission path, `types.ts:178`, and the Z-track transition handlers before writing any code.
>
> 1. **Replace the flat 0.1 %/yr EES depreciation** with asset-aware depreciation: each commissioned asset's contribution to county EES decays on a documented curve against its `design_life_c` (constant to 0.8 × life, linear to zero at 1.2 × life, per the methods overview's stated-but-unimplemented rule). Baseline EES (not attributable to any asset) keeps the current flat decay so that non-asset behaviour is unchanged. Under `flat` with the library's `design_life`, this must reproduce the goldens — which means the initial rollout uses a `depreciation_mode: legacy | lifecycle` flag defaulting to `legacy`, and the goldens are re-frozen under `lifecycle` only in a later, explicitly logged before/after session. Do not silently change A–N.
> 2. **`D(a, Φ_c, X_c)`.** Design life is shortened, never lengthened, by exposure: `flood_zone`, `wildfire_exposure: high`, `water_dependency: wet` in a stressed county. Range [0.6, 1.0], cited from the infrastructure-service-life literature, conservative end.
> 3. **Harden interaction.** The C-track `harden_asset` transition sets `D` back toward 1.0 by its documented modifier — the same arithmetic the resilience fork (Golden K) already audits.

### Session P7b — Moving flood zones through the registry

**Claude Code session prompt:**

> Read `apply_hazard_event_consequences`, `sample_hazard_events`, the P3 `R_c(t)` table, and the exposure-tag seeding path.
>
> 1. At each epoch boundary under a projected lens, recompute `flood_zone_share_c(t) = nfhl_1pct_share_c × R_c(t)` and re-tag assets and housing stock in the expanded zone (`flood_zone: expanded_<epoch>`, `origin: "event"`). Tags only expand. Under the historical lens: no-op.
> 2. Newly tagged assets enter the existing flood consequence path with no new damage arithmetic; newly tagged housing stock raises the county's EAL line and lowers `D` for assets built after the tag.
> 3. **Forcing gauge data.** Emit `forcing_index[t]` per lens (NCEI OHC observed through present, SSP-consistent trajectory after) as an engine output for the HUD. It is display; assert in a test that no engine path reads it.
> 4. **Golden P, "the durability fork."** One county under ssp370, fixed seed: pathway A builds a 30-year asset inside the 0.2 % zone in 2028; pathway B builds the same asset outside it. Assert A's asset is re-tagged at the 2040 epoch boundary, its `D` falls, its Ec stream integrates to less over the run, and the difference equals the modifier arithmetic. TS parity.

**Handoff condition for P7:** durability is a computed property of what was built, where, under which lens; the flat/legacy modes remain byte-identical; the "build durable things now" argument has a number behind it.

---

# Phase P8 — The "Why Here" Surface

Everything above is invisible until the confirm modal shows it.

### Session P8

**Claude Code session prompt:**

> Read the W4 impact-card components, the C5 exposure row, the Z5 asset rows, and the P6/P7 engine return shapes. Call-site audit rule applies.
>
> 1. **Impact card decomposition.** The confirm modal shows the base coefficient, then each modifier as a row (`component: value vs reference → ×factor, source, confidence`), then the place-specific delta, then pace (deploy year), quality (CF and its source), durability (design life after `D`), and any cap. Every row's popover shows the narrative string the engine returned. No UI arithmetic.
> 2. **Endowment choropleths.** Map metric options for each Φ component and for the composite "buildability" (documented composition, weights flagged). Unmapped NFHL share renders as hatched, not as low.
> 3. **Forcing gauge.** HUD element beside the lens badge, fed by `forcing_index[t]`, captioned "boundary condition — not moved by your choices."
> 4. **Cap UX.** A request above `developable_mw` snaps to the cap with the reason inline ("reV developable capacity: 800 MW after exclusions").
> 5. **Debrief.** The W6 debrief gains a "why here" table per placed asset.

**Handoff condition:** a player can place an asset, read exactly why its Ec effect is what it is in this county, and see what would change it — with every number traceable to `endowment_breakdown`.

---

# Phase P9 — Synergy as a Mechanic

`synergy_groups` are tags. `_evaluate_couplings` has one hardcoded rule. "Peak synergistic solutions" needs a rule table.

### Session P9

**Claude Code session prompt:**

> Read `_evaluate_couplings` (`:2976–3057`), `coupling_rules` in the action library, `synergy_groups` across all 55 actions, and `_compute_firm_capacity`.
>
> 1. **Generalize.** Replace the single hardcoded rule with a rule table in the library: `{coupling_id, trigger: {actions_a, actions_b, spatial: same_bus | adjacent_bus | same_county | same_huc8, temporal: within_years}, effects: {...}, source, confidence}`. `nuclear_dc_coupling` becomes the first row and must produce identical activations (regression test on the existing coupling goldens).
> 2. **Launch rules,** each cited and bounded: **firm + variable** (storage or firm capacity co-located with wind/solar lifts the variable asset's Ec modifier — the reliability credit generalized); **coal transition cluster** (retirement + replacement + workforce action in the same county within 5 years reduces the S penalty of the retirement); **restoration + water** (riparian restoration upstream in the same HUC-8 lowers the water-stress derate base of a downstream thermal asset by a small, cited amount); **shared corridor** (two energy actions on adjacent buses share transmission requirement — reads grid headroom).
> 3. **Anti-synergy.** Rules may be negative: two water-dependent assets in a stressed HUC-8 compound the derate. Say so in the UI.
> 4. **Golden Q, "the cluster fork."** Same three actions in one county, ordered and timed to activate the coal-transition rule vs. spaced so they do not. Assert the S trajectory differs by the rule's effect exactly. TS parity.

**Handoff condition:** synergy is auditable arithmetic in a rule table, not a tag; the existing coupling behaviour is preserved byte-for-byte.

---

# Phase P10 — The Stability Index

"Odds of stable and comfortable lives" as a number, computed from machinery that already exists.

### Session P10

**Claude Code session prompt:**

> Read `mc_worker.py`, `sample_hazard_events`, the lens plumbing, and `compute_ees_summary`.
>
> 1. **Definition** (methods page first, code second): for a pathway, county, and horizon, **stability** = the share of `(seed, lens, coefficient draw)` runs in which the county's composite EES stays at or above a documented threshold through the horizon, and **comfort** = the median composite over those runs. Thresholds: the county's own baseline composite (no-regression) and a fixed floor (documented). Report both; do not blend them into one number.
> 2. **Ensemble runner.** `scripts/stability_run.py`: seeds × lenses × MC coefficient/modifier draws, reusing the ProcessPool pattern. Deterministic given the draw list; the draw list is a tracked file.
> 3. **Ideal index.** For each county, the *upper envelope* — the best composite reached by any pathway in the workshop archive plus the P11 reference — is stored as `ideal_composite_c` and rendered as a ceiling line on the trajectory fan chart, captioned as "best observed under the model," never as "achievable."
> 4. **Outputs.** `stability_<pathway>.json` with per-county `{p_stable_noregress, p_stable_floor, comfort_median, n_runs, horizon}`; W6 dashboard scatter gains stability on an axis.

**Handoff condition:** any `.terra.json` pathway can be scored for stability and comfort under the climate ensemble in one command, and the dashboard shows who bought resilience.

---

# Phase P11 — Portfolio Search (Peak Synergistic Solutions)

### Session P11

**Claude Code session prompt:**

> Read the P6–P10 surfaces, the material ledger (`get_material_ledger`), `era_budgets.json`, and the W6 convergence table.
>
> 1. **Problem statement** (methods page): choose `(action, county, year, magnitude)` tuples subject to per-era capital budget, material ledger ceilings, `developable_mw` caps, and endowment gates, to maximize the P10 stability objective (no-regression probability, then comfort) across the study counties under a chosen lens. State that this is a heuristic search over a coefficient model, not an optimization of the world.
> 2. **Search.** Greedy-with-lookahead / beam search over the discrete action set using `project_delta` for marginal evaluation and the P9 rule table for cluster bonuses; MILP is out of scope until the transmission plugin makes network constraints linear. Deterministic given a seed. Runtime target: one lens, 157 counties, 25-year horizon, under ten minutes on a laptop.
> 3. **Output = a pathway.** The result is written as an ordinary `.terra.json` badged `reference`, replayable and comparable in the W6 dashboard like any participant's file. It is never auto-applied.
> 4. **Golden R, "the reference fork."** Fixed seed, ssp245, two-county toy problem with a hand-enumerable action space; assert the search returns the hand-verified optimum and the resulting pathway replays to the recorded digest.
> 5. **Workshop copy.** The facilitator can reveal the reference pathway after the room converges. The interesting slide is where the room and the reference disagree.

**Handoff condition:** a reference pathway exists per lens, is reproducible, respects every physical cap, and appears in comparison mode as one more pathway the room is free to reject.

---

# Phase P12 — Validation and Methods

Non-code except for the tests it names.

- **Modifier literature review** for whichever modifiers P6c showed matter; ranges tightened or left wide with justification. The Ec local-capture modifier is either defended or frozen conservative — decided by the MC, not by argument.
- **Three-county back-cast**: for one plains, one mountain, and one basin county with a real large asset built 2010–2020, run the engine from 2010 under `measured` and compare the projected Ec trajectory against ACS/BEA observed. Print the table. This is the P-track's version of the climate back-cast and the single most persuasive thing to show an advisor.
- **Methods chapter section**: the endowment vector as the unit of physical constraint; the modifier form and reference-point convention; flat-mode invariance; the durability curve; flood expansion rule; stability definition; the search as heuristic; a limitations list written before anyone asks (county-scale terrain, unmapped NFHL, coefficient-based Ec modifiers, no line-level flows).
- **Advisor ask, refined**: the four questions from the audit path-forward plus one — is the stability index a defensible dissertation contribution on its own, or is it a decision-support feature?

---

## Session order and dependencies

| Session | Deliverable | Depends on | Can slip? |
|---|---|---|---|
| P6a | `endowment.py`, modifier table, wire-in | P0–P5 handoff; W7-2 manifest | no — everything hangs on it |
| P6b | Golden O + TS parity | P6a | no |
| P6c | Modifier MC | P6b; analytics track machinery | no — it decides P12's scope |
| P7a | Durability hook (`legacy | lifecycle`) | P6a | no |
| P7b | Moving flood zones, forcing gauge, Golden P | P7a, P3, C4 | gauge yes; zones no |
| P8 | "Why here" UI | P6b, P7b, C5 | partially — choropleths can slip |
| P9 | Synergy rule table, Golden Q | P6a; transmission plugin for the corridor rule only | corridor rule yes; rest no |
| P10 | Stability index | P6c, P7, C4 events | no — it is the vision's stated output |
| P11 | Portfolio search, Golden R | P9, P10 | **yes** — P6–P10 deliver the vision's first four parts without it |
| P12 | Validation + methods | P6c, P10 | no |

**Relationship to the transmission plugin (audit Priority 2).** P6's grid-headroom step and P9's shared-corridor rule read a headroom number the transmission plugin will make real. Build them against the synthetic-bus `_compute_firm_capacity` value now, flag `headroom_source: synthetic_bus`, and let the transmission plugin swap the source. Do not block the P-track on it, and do not let the P-track grow a second transmission model.

**Relationship to W7.** P6a must not start before W7-2 (manifest + CI) lands. P6c and P10 reuse the analytics machinery W7 verified; if W7-4's D5 ag review has not happened, the restoration modifiers in P6a inherit `validation: "extrapolated"`.

---

## Digest registry delta

| Artifact | Type | Status |
|---|---|---|
| Goldens A–N | all digests | byte-identical under `endowment_mode: flat` and `depreciation_mode: legacy` through the entire track |
| Golden O — siting fork | fixture + digests | new in P6b |
| Golden P — durability fork | fixture + digests | new in P7b |
| Golden Q — cluster fork | fixture + digests | new in P9 |
| Golden R — reference fork | fixture + digests | new in P11 |
| Replay digest | computation change | gains `endowment_mode` (P0) and `depreciation_mode` (P7a), with migration notes |
| Exogeneity test | permanent invariant | extended P6a (modifiers), P7b (forcing gauge unread by engine) |
| Coupling regression | new invariant | P9: `nuclear_dc_coupling` activations identical before/after generalization |
| `endowment_modifiers.json`, `mc_modifier_priority.csv`, `stability_*.json`, reference pathways | new runtime/analytics files | manifest entries required on creation |

---

## What this roadmap deliberately does not do

It does not model line-level power flow (synthetic flows are fictional by construction). It does not let the player change the physics. It does not present the reference pathway as a plan. It does not claim site-level engineering from county-scale terrain and 1:500k geology. It does not treat unmapped floodplain as safe. And it does not replace the coefficient-based Ec layer with a structural economic model — it makes the coefficients honest about place and lets the Monte Carlo say which ones deserve more.

---

## One thing to carry forward

The county is the unit of analysis and governance. The bus is the unit of energy intervention. The tract is the unit of social measurement. The ecoregion is the unit of ecological suitability. The material ledger is the unit of honesty. The county fiscal ledger is the unit of local consequence. The climate scenario is the unit of exogenous uncertainty. The endowment vector is the unit of physical constraint. **The reference pathway is the unit of advice — computed, replayable, and free to be rejected by the room.**
