# TERRA Fiscal & Workshop Roadmap
## Wyoming Fiscal Layer, County Yields, and Workshop Instrumentation

**Purpose:** Shared memory for the next build track. Read this file alongside
`TERRA_county_app_roadmap.md` and `TERRA_build_log.md` at the start of every
session. Three goals: (1) a Wyoming-resolution fiscal layer so the tool can
speak accurately about how projects impact local taxes, (2) Civ-style
visibility of budgets and county yields — materials, labor, capital, jobs,
revenue — at placement time and on the county card, (3) the instrumentation
needed to run facilitated workshop sessions and analyze the pathways they
produce. Focus throughout: decision-support quality, not research compliance.

**Current state (from `TERRA_build_log.md`):**
- Phases 0–5 complete. 23/23 parity tests. Engine pure + fast (Golden B
  replay 8.9 ms).
- Scenario files: actionLog + gameSeed + schema_version, replay-digest
  verified. Comparison mode (2-way) exists.
- Known debt this roadmap retires: `capital_cost_usd` and `labor_years`
  returning 0 in `budgets.ts` (coefficient field mismatch); HALEU 5000
  kg/Natrium uncited; era budget values all `confidence: "low"`.

---

## Scope Doctrine Addendum: The Wyoming Fiscal Tier

**Fiscal resolution is Wyoming-only.** Fiscal institutions are
state-specific — assessment ratios, severance structure, and school finance
do not generalize across state lines. The 23 Wyoming counties gain a fiscal
ledger and Revenue tab; the other 134 study counties keep EES-only cards.
This is honest scoping, not a shortcut: the tool claims fiscal accuracy only
where it has the institutional data to back it.

Addendum to the five-scale doctrine:

> **The county fiscal ledger is the unit of local consequence.** Every fiscal
> number shown must trace to a Wyoming statute, a Department of Revenue
> table, or a flagged proxy.

### Wyoming fiscal mechanics the model must respect (design contract)

These are the institutional facts that make or break credibility with a
county-level audience. Encode them; do not approximate them away:

1. **Assessment ratios differ by property class** (W.S. 39-13-103):
   minerals assessed at 100% of fair market value, industrial property at
   11.5%, residential/commercial/all other at 9.5%. A dollar of mine value
   and a dollar of data center value are not fiscally equivalent.
2. **Two distinct mineral revenue streams:** ad valorem tax on mineral
   *production* (county-collected property tax at 100% valuation — this is
   the county school money) vs. severance tax (state-collected, formula
   distribution). Coal retirement hits both, on different ledgers, with
   different lags.
3. **Mill levies:** statewide 12-mill school foundation + 25-mill local
   school + ~12 county mills + special districts. Use actual county total
   levies from the DOR report, not a single state average.
4. **School finance is partially decoupled from local valuation** via the
   foundation program guarantee and recapture. Model the foundation transfer
   as a single net flow per county, `confidence: "low"`, and surface the
   decoupling in the UI — it is one of the most educational facts the tool
   can teach.
5. **Data center sales/use tax exemption** (W.S. 39-15-105(a)(viii)(O)):
   qualifying data center equipment is exempt. The megawatts arrive; parts
   of the tax base do not. Encode the asymmetry explicitly.
6. **PILT and federal mineral royalties** are real county/state revenue with
   published county-level figures (DOI PILT tables; ONRR disbursements).

---

# Phase W0 — Debt Retirement + Resource HUD

The budget-display bug and the missing resource visibility are the same
problem: pools are computed but never legible. Fix the data, then build the
Civ-style surface.

### Session W0

**Claude Code session prompt:**

> Read `TERRA_build_log.md` (known debt sections), `terra-app/src/ui/`
> component list, `terra-app/src/engine/budgets.ts` (or equivalent), and
> `data/processed/mw_action_library_v3.json` before writing any code.
>
> 1. **Fix the coefficient mapping.** Add `capex_usd_per_unit` to every
>    energy/storage/transmission/demand action in the library (bump to
>    schema_version 3.1) sourced from NREL ATB 2025 (cite class and case per
>    action in `material_coefficient_sources.csv`; mark interpolations).
>    Map `labor_years` = `construction_jobs_per_mw × magnitude ×
>    time_to_deploy` as the documented proxy. Verify no action reports 0
>    capital or 0 labor unless genuinely zero.
> 2. **HALEU citation.** Replace the 5000 kg/Natrium engineering estimate
>    with a cited figure (DOE HALEU Availability Program / TerraPower NRC
>    docketed values); record source and any change in
>    `material_coefficient_sources.csv`. If the value changes, regenerate
>    Golden B/C fixtures in Python, re-freeze, update the digest registry in
>    `TERRA_build_log.md`, and rerun parity. Treat this as a deliberate,
>    logged fixture amendment — the only kind permitted.
> 3. **Resource HUD (Civ top bar).** Persistent top strip showing the six
>    era pools: capital ($), labor (labor-years), steel (t), concrete (t),
>    HALEU (kg), transmission ROW (mi). Each chip: consumed / era total,
>    color shifts as consumption passes 60% / 85%, hover popover itemizing
>    consumption by queued build with per-build share. Clicking a chip
>    highlights on the map every county whose queue draws from that pool.
> 4. **Overflow legibility.** When a placement would exceed a pool, the
>    confirm modal already queues it to the next era — now show that
>    explicitly: "Steel pool exhausted for Foundation Era — this build is
>    scheduled to begin 2036" with the pool popover open to the binding
>    constraint.
>
> Parity discipline: digests for Golden A must be unchanged; B/C only change
> if the HALEU amendment is executed, and then exactly once, logged.

**Outputs:** library v3.1, fixed budgets mapping, Resource HUD, updated
digest registry if amended.

**Handoff condition:** no action shows 0 capital/labor; HUD popover
itemization sums exactly to pool consumption; parity green.

---

# Phase W1 — Wyoming Fiscal Pipeline (Python)

### Session W1 — Notebook 17: Fiscal Baseline Pull

**File:** `notebooks/17_wy_fiscal_pull.ipynb`

**Claude Code session prompt:**

> Read `data/processed/mw_county_cards.json` and
> `data/processed/mw_study_counties.csv` before writing any code. Scope:
> the 23 Wyoming counties only.
>
> Write `17_wy_fiscal_pull.ipynb` assembling, per county:
>
> 1. **Assessed valuation by property class** (minerals / industrial /
>    commercial / residential / agricultural / all other) from the most
>    recent Wyoming DOR Annual Report tables. Record report year and table
>    number per value.
> 2. **Total county mill levy** (county + school + special district
>    composite) from the same report.
> 3. **Ad valorem mineral production valuation** by commodity (coal, oil,
>    gas, trona) — the production-linked tax base, kept separate from real
>    property.
> 4. **Severance tax distributions and federal mineral royalty
>    disbursements** reaching each county (DOR distribution reports; ONRR
>    disbursement tables). Where only state-level splits are published,
>    apply the statutory formula and flag `source: "formula_applied"`.
> 5. **PILT** payments per county (DOI published tables, latest year).
> 6. **Sales & use tax distributions** per county (DOR), with the data
>    center equipment exemption noted as a structural field, not a number.
> 7. **Employment and wages by NAICS** per county from BLS QCEW (mining
>    2121, utilities 2211, construction 23, data processing 518210 at
>    minimum) plus total county labor force (LAUS). QCEW over CBP — CBP
>    suppression is too aggressive in energy sectors.
>
> Outputs:
> - `data/processed/wy_county_fiscal_baseline.json` — one record per county,
>   every value carrying {value, year, source, confidence}
> - `data/processed/wy_fiscal_sources.csv` — the fiscal analog of
>   `material_coefficient_sources.csv`
> - Print a sanity table: Campbell County mineral share of total assessed
>   valuation should dominate (historically on the order of 80%+); Teton
>   should be residential-dominated; flag and investigate any county where
>   class shares look implausible before proceeding.
>
> Where the network sandbox prevents live pulls, stub the loader with the
> exact URL + table reference in a `MANUAL_FETCH.md` checklist so the data
> can be dropped in by hand — never invent values.

**Outputs:** fiscal baseline JSON, fiscal sources CSV, manual-fetch
checklist if needed.

**Handoff condition:** all 23 counties present; every value sourced or
flagged; sanity table passes.

### Session W2 — Notebook 18: Fiscal Coefficients

**File:** `notebooks/18_fiscal_coefficients.ipynb`

**Claude Code session prompt:**

> Read `wy_county_fiscal_baseline.json`, library v3.1, and
> `terra_action_taxonomy.md` before writing any code.
>
> Produce `data/processed/wy_fiscal_coefficients.json`: per action, the
> fiscal flows per unit magnitude, structured as:
>
> 1. **Valuation delta** — added (or removed) fair market value per MW /
>    unit, by property class, with the statutory assessment ratio applied
>    (industrial 11.5% for plants and data centers; minerals 100% for
>    production). Capex from v3.1 is the FMV basis for new builds, with a
>    documented depreciation schedule (declining balance, cite DOR
>    industrial valuation methodology).
> 2. **Production-linked flows** — coal retirement removes ad valorem
>    production valuation and severance-linked distributions proportional to
>    the retired plant's fuel draw (estimate tons/MWh from EIA-923 heat
>    rates; cite).
> 3. **Recurring local revenue** — property tax = assessed delta × county
>    mill levy (county-specific, from baseline); sales/use during
>    construction (flag data center equipment exemption: exempt share
>    `confidence: "low"`).
> 4. **Jobs** — construction (existing coefficients) and **operations jobs
>    per unit** (new; cite NREL JEDI / EIA / TerraPower docketed staffing
>    for SMR ~250/plant class figures; flag confidence).
> 5. **School finance net flow** — single foundation-program adjustment per
>    county, `confidence: "low"`, with a one-paragraph methods note on the
>    guarantee/recapture decoupling.
>
> Every coefficient gets a row in `wy_fiscal_sources.csv`. End with a
> validation cell: apply the coefficients to the *already-operating*
> flagship assets and compare implied valuation against the actual DOR
> county tables — report percent error per county; investigate anything
> beyond ±25% and document the residual.

**Outputs:** `wy_fiscal_coefficients.json`, updated sources CSV, back-cast
validation table.

**Handoff condition:** back-cast within documented tolerance; all
coefficients sourced or flagged.

### Session W3 — Notebook 19: Engine Fiscal Extension + Golden D

**File:** `notebooks/19_engine_fiscal_golden.ipynb` (+ `src/terra_engine.py`
v2.1, + TS port)

**Claude Code session prompt:**

> Read `src/terra_engine.py`, both fiscal JSONs, and the digest registry in
> `TERRA_build_log.md` before writing any code.
>
> 1. **Python engine v2.1:** add `state['county_fiscal']` for the 23 WY
>    counties — valuation by class, revenue by source (property, ad valorem
>    production, severance share, federal royalty share, sales/use, PILT,
>    foundation net). `apply_action`/`queue_action` register fiscal deltas;
>    `advance_year` applies depreciation, commissions valuation when builds
>    complete (not at decision), and steps production-linked flows with
>    retirements. New accessor `get_county_fiscal(state, geoid)` returning
>    levels + per-source trajectory.
> 2. **Digest discipline:** the existing state digest must remain computed
>    over the same fields as today so Golden A/B/C digests are untouched.
>    Add a separate `fiscal_digest` for the new ledger. Document both in the
>    registry.
> 3. **Golden D — Campbell & Laramie fiscal arcs:** replay the Golden B
>    action sequence plus a Campbell County coal retirement schedule
>    (Dave Johnston / PRB-linked units per county cards). Assert:
>    (a) Campbell ad valorem production revenue declines monotonically with
>    retirements; (b) Laramie property tax rises when the Natrium pair
>    *commissions* (2032, not at decision year); (c) the data center adds
>    property tax but a flagged-exempt sales/use share; (d) total Campbell
>    school-linked revenue falls by a magnitude consistent with the back-cast
>    validation. Freeze `data/golden/golden_d.json`.
> 4. **TS port + parity:** port the fiscal module function-for-function;
>    Golden D parity test at 1e-6; existing 23 tests stay green.

**Outputs:** engine v2.1 (both runtimes), `golden_d.json`, parity suite
(expect 23 + new fiscal assertions), registry update.

**Handoff condition:** A/B/C digests byte-identical; Golden D parity green
in TS.
---

# Phase W2 — County Yields (the Civ City Screen)

### Session W4 — Yields UI

This is the session that answers "where do I see what this place produces
and what this project costs it." Design target: a competent Civ player
recognizes the county card as a city screen within ten seconds.

**Claude Code session prompt:**

> Read `terra-app/src/ui/CountyCard*` components, the Resource HUD from
> Session W0, and `get_county_fiscal` before writing any code.
>
> 1. **Yields strip on the county card.** A compact row of per-county
>    yields, updating live with state:
>    - ⚡ Net firm capacity margin (MW)
>    - 🔨 Jobs: operations jobs total, plus construction jobs currently
>      active in-county (from queued builds)
>    - 💰 Local revenue ($/yr, total of the fiscal sources; WY counties
>      only — non-WY counties show the EES-only card unchanged)
>    - 💧 Water committed (% of county baseline withdrawals)
>    - 🏠 Housing pressure indicator (construction workforce ÷ county labor
>      force; thresholds documented)
>    Each yield expands to its breakdown: revenue → stacked area by source
>    over time (recharts, already a dependency); jobs → construction vs
>    operations by project; water → by asset.
> 2. **Relative impact framing.** Every absolute number gets a denominator:
>    jobs as % of county labor force (LAUS baseline), revenue as % of
>    county baseline revenue, water as % of baseline withdrawals. 340
>    construction jobs reads as "+1.7% of labor force" in Laramie County
>    and "+4.1%" in Lincoln County — the relative number is the legible
>    one. Denominators come from the fiscal/county baselines; never
>    hardcode.
> 3. **Placement-time impact preview.** Extend the confirm modal: before
>    Confirm, render an impact card for the *selected county*:
>    construction jobs (and % labor force, with the housing-pressure flag
>    if threshold crossed), operations jobs at commissioning, Δ property
>    tax $/yr (WY only), Δ water, land acres, and the share of each era
>    pool consumed. Two columns: "This county" / "This era's budgets."
>    All values must be computed by calling the engine preview path — no
>    UI-side arithmetic duplicating engine logic.
> 4. **Yields choropleth modes.** Add map metric options: Δ jobs (% labor
>    force), Δ local revenue (% baseline, WY only), construction activity
>    (active builds). Counties with active yields get a small badge stack
>    (Civ-style icons) at their centroid, toggleable.
> 5. **Boomtown mechanic surfacing.** When housing pressure crosses the
>    documented threshold, the county card shows the flag with a suggested
>    action chip (affordable_housing, workforce_retraining) — consistent
>    with the existing deficit-chip pattern: show consequences, suggest
>    categories, never block.

**Outputs:** yields strip, impact preview, choropleth modes, badges.

**Handoff condition:** placing `smr_advanced` in Lincoln County shows a
materially different relative-impact card than the same action in Laramie
County, with every number traceable to engine output in a debug popover.

---

# Phase W3 — Workshop Instrumentation

Infrastructure for facilitated sessions where participants build their
desired future under real constraints, and the facilitator can see, compare,
and discuss the collected pathways. All of this is decision-support tooling;
nothing here requires accounts or a backend.

### Session W5 — Participant Instruments

**Claude Code session prompt:**

> Read `src/engine/replay.ts`, `persistence.ts`, the ScenarioFile format,
> and the auto-pause modal component before writing any code.
>
> 1. **Session mode.** A `?session=<code>` URL parameter (or start-screen
>    field) activates workshop mode: scenario metadata gains
>    `{session_code, participant_label, started_at, app_version}`.
>    Participant label is free-text (e.g. "Table 3" or a first name) — no
>    accounts, no backend.
> 2. **Session config file.** Facilitator-authored JSON the app can load
>    from the session start screen: which campaign/scenario, fixed seed
>    (everyone faces identical events — essential for comparability),
>    year/era limit, which annotation prompts are active, optional locked
>    settings (e.g. disable stress-test panel). Document the schema in
>    `docs/session_config.md` with two example files: a 45-minute
>    "Wyoming 2032" session and a 90-minute open build.
> 3. **Annotation at auto-pause.** The six auto-pause triggers gain an
>    optional one-line prompt ("Why this move?" on build decisions; "How
>    are you responding?" on events). Non-blocking — Enter to skip. Stored
>    as `annotations: [{year, trigger, action_ref?, text, ms_to_respond}]`
>    inside the scenario file, so annotations replay-align with state.
> 4. **End-of-session reflection card.** On reaching the configured end
>    year: three short fields (satisfied with the future you built? what
>    constraint bound you most? what would you change with one more
>    decade?) plus the final quest checklist and EES/fiscal summary,
>    rendered as a shareable summary screen.
> 5. **One-click submission export.** A single button bundles the scenario
>    file (with annotations + metadata + replay digest) and downloads it
>    named `{session_code}_{participant_label}.terra.json`. The replay
>    digest makes every submission independently re-executable — keep that
>    property.

**Outputs:** session mode, config schema + examples, annotation capture,
reflection card, submission export.

**Handoff condition:** a full session-mode run produces a single
`.terra.json` that reimports and replays to a matching digest with
annotations intact.

### Session W6 — Facilitator Dashboard

**Claude Code session prompt:**

> Read the comparison-mode components and `replay.ts` before writing any
> code. Build a `/facilitate` route — local-only, no backend: the
> facilitator drags in N `.terra.json` files.
>
> 1. **Ingest + verify.** Drop zone accepting up to ~30 files; each is
>    replay-verified on load (digest check badge per file); session_code
>    mismatches are flagged but loadable.
> 2. **Convergence table.** Action × frequency matrix: which actions did
>    most participants take, at what median year, at what median magnitude.
>    Sort by adoption rate. This is the "what does the room agree on" view.
> 3. **Divergence finder.** For each pair of pathways, the first year their
>    action sets materially diverge; aggregate into the top 5 fork points
>    (year + the competing choices taken). These fork points are the
>    facilitator's discussion agenda — surface them as cards with one-click
>    "open side-by-side at year Y" deep links into comparison mode.
> 4. **Outcome scatter.** Final E vs Ec vs S (and total WY local revenue)
>    per participant as a scatter/parallel-coords view — who traded what
>    for what. Hover shows participant label + their reflection answers.
> 5. **County heat consensus.** Choropleth of how many participants placed
>    anything in each county — the room's collective siting map, with a
>    per-county popover listing who built what.
> 6. **Annotation reader.** All annotations, filterable by trigger type,
>    year, action — grouped quotes next to the decision they annotate.
> 7. **Aggregate export.** One CSV bundle (actions long-table, outcomes
>    table, annotations table) for offline analysis in R/Python.
>
> Everything must run client-side from the dropped files. Reuse the
> comparison-mode chart components; do not fork them.

**Outputs:** facilitator route with the six views + export.

**Handoff condition:** load 5 synthetic session files (generate them by
scripted playthroughs with different strategies), verify the divergence
finder identifies the planted fork, and export the CSV bundle.

---

## Session Order and Dependencies

| Session | Deliverable | Depends on |
|---|---|---|
| W0 | Debt retirement + Resource HUD | current build |
| W1 | NB 17 fiscal baseline pull | — (parallel-safe with W0) |
| W2 | NB 18 fiscal coefficients | W0 (capex), W1 |
| W3 | NB 19 engine v2.1 + Golden D + TS parity | W2 |
| W4 | County yields UI | W0, W3 |
| W5 | Participant instruments | W4 (uses yields in reflection card) |
| W6 | Facilitator dashboard | W5 |

W1 is the only session that may stall on data access (DOR/ONRR tables);
its MANUAL_FETCH.md fallback keeps it unblocked. Everything else is
self-contained.

---

## Non-Code Parallel Track (no session required)

- **Workshop run-of-show** (90 min): 10 intro + doctrine, 15 guided
  Campaign 2 opening, 45 free build in session mode, 20 facilitator
  dashboard discussion at the fork points. Draft once W5 exists.
- **Methods page additions:** the Wyoming fiscal tier doctrine, the
  back-cast validation table from NB 18, and the school-finance decoupling
  paragraph — citizens should be able to read why the numbers are
  trustworthy and where they are soft.

---

## One Thing to Carry Forward

The fiscal layer's authority comes from the same place as the material
ledger's: every number traces to a source, every soft number wears its
confidence flag, and the engine — never the UI — does the arithmetic.

The county is the unit of analysis and governance. The bus is the unit of
energy intervention. The tract is the unit of social measurement. The
ecoregion is the unit of ecological suitability. The material ledger is the
unit of honesty. **The county fiscal ledger is the unit of local
consequence.**
