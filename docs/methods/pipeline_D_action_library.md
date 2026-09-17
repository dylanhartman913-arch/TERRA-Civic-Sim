# Pipeline D — Action Library & Material Coefficients

**Pipeline status:** Current (content); 2 generator gaps
**Generator:** `notebooks/15_action_library_v3.ipynb`
**Runtime files:** 7 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline D

---

## What this pipeline produces

The action library defines every intervention a player can make in the TERRA
simulation: what it costs, what it does to each EES capital, how long it takes
to build, and how long it lasts. The material coefficients and lifecycle data
support the engine's cost and impact calculations. The scenario profiles define
pre-configured analytical scenarios.

| File | Tracked | Generator |
|------|---------|-----------|
| `mw_action_library_v3.json` | yes | nb15 |
| `ees_scenario_profiles.json` | yes | **no tracked generator** |
| `lifecycle_coefficients.json` | yes | **no tracked generator** |
| `ts:action_library_v3.json` | yes | nb15 (byte-identical promotion) |
| `ts:scenario_profiles.json` | yes | hand-maintained (distinct from `ees_scenario_profiles.json`) |
| `ts:lifecycle_coefficients.json` | yes | nb15 (byte-identical promotion) |
| `ts:material_coefficient_sources.json` | yes | hand-maintained |

**Note:** `ts:scenario_profiles.json` in `terra-app/src/data/` is a **distinct
file** from `ees_scenario_profiles.json` in `data/processed/` — different
content, different SHA-256. The TS file is the 2-scenario UI file; the Python
file is the 31-profile analytical set. They are not copies of each other.

---

## Data sources

### NREL Annual Technology Baseline (ATB) 2024

| Field | Value |
|-------|-------|
| Source | National Renewable Energy Laboratory, Annual Technology Baseline |
| Version | 2024 v3.0.0 |
| Scenario | Moderate |
| Used for | CAPEX estimates for energy infrastructure actions |

ATB provides technology-specific capital cost projections. These feed into the
`capex_per_unit` field for energy infrastructure actions (e.g., `solar_utility`,
`wind_utility`, `transmission_230kv`, `smr_advanced`).

### USDA EQIP (Environmental Quality Incentives Program)

| Field | Value |
|-------|-------|
| Source | USDA Natural Resources Conservation Service, EQIP cost data |
| Used for | EES coefficients for `prairie_restoration` and `riparian_buffer` |
| Confidence | High (these are the two highest-leverage actions per S8 MC) |

Prairie restoration (ρ=0.717, rank 1) and riparian buffer (ρ=0.601, rank 2)
dominate the Monte Carlo sensitivity analysis. Their E coefficients are among
the best-sourced in the library, grounded in USDA EQIP payment schedules and
documented per-practice restoration outcomes.

### Action-specific sources

Each of the 55 actions carries its own `source` and `confidence` fields in the
library JSON. Source quality varies widely — from peer-reviewed literature and
federal agency data (high confidence) to engineering judgment and analogy-based
estimates (low confidence). The `confidence` field is self-reported by the
library author, not externally validated.

---

## Action library structure

The library contains **55 actions** at schema version **3.3**, organized into
five categories:

| Category | Count | Examples |
|----------|-------|---------|
| Energy infrastructure | 24 | `solar_utility`, `wind_utility`, `smr_advanced`, `transmission_230kv` |
| Ecological restoration | 14 | `prairie_restoration`, `riparian_buffer`, `mine_land_reclamation` |
| Settlement / social | 12 | `health_clinic`, `university_research_center`, `broadband_rural` |
| Agriculture | 4 | `irrigation_efficiency`, `cover_cropping` |
| Climate adaptation | 1 | `flood_mitigation` |

Additionally, **22 disturbances** (exogenous shocks) are defined in the same
library structure.

### EES effects model

The engine applies action effects at `src/terra_engine.py:2626–2638` using a
linear-in-magnitude model:

```
delta_K = ees_effects[K] × (magnitude / unit_scale)
```

where:
- `K` ∈ {E, Ec, S} — the three EES capitals
- `ees_effects[K]` — the per-action, per-capital coefficient from the library
- `magnitude` — the player's chosen investment scale (e.g., MW for energy, acres for restoration)
- `unit_scale` — the normalization denominator (typically 1,000)

The resulting delta is added to the county's current score, clamped to [0, 10].

**Assumption:** Effects are linear in magnitude. A 2,000 MW solar investment
produces exactly twice the EES delta of a 1,000 MW investment. This is a
simplifying assumption — in practice, diminishing returns, site saturation,
and grid integration limits would produce nonlinear effects. The planned
P-track physical constraints work (see
`docs/methods/TERRA_physical_constraints_data_scoping.md`) is designed to
introduce place-dependent multipliers that relax this linearity, but the
linear form remains the current production model.

**Assumption:** Coefficients are spatially homogeneous. Each action's
`ees_effects` values are cross-ecoregion medians — the same coefficient is
applied regardless of which county the action is placed in. Spatial
heterogeneity (e.g., wind capacity factors varying by location, restoration
outcomes varying by soil type) is not currently modeled. The P-track endowment
vector is the planned mechanism for introducing this variation.

### Lifecycle parameters

Each action also carries lifecycle parameters read at `queue_action`
(`terra_engine.py:3075`):

- `time_to_deploy` — years from investment to operational (e.g., 3 for solar)
- `design_life` — years of operational life (e.g., 25 for solar)
- `atb_cf` — annual capacity factor (e.g., 0.35 for wind)

These are currently per-action constants, not place-dependent.

---

## Monte Carlo sensitivity results

S8 ran a 10,000-iteration Monte Carlo perturbation analysis on the action
coefficients (baseline commit `b5fd4fdc`, post-S7a/F14 corrected EES baseline).
The analysis perturbs each coefficient within ±0.5 (z=1.96, σ=0.2551) across
141 perturbable coefficients and measures the Spearman correlation between
each coefficient's perturbation and the resulting composite EES change.

**Top 5 by sensitivity (Spearman ρ with composite):**

| Rank | Coefficient | Capital | ρ | Confidence |
|------|------------|---------|---|------------|
| 1 | `prairie_restoration` | E | 0.717 | High (USDA EQIP) |
| 2 | `riparian_buffer` | E | 0.601 | High (USDA EQIP) |
| 3 | `smr_advanced` | Ec | 0.203 | **Low — no source** |
| 4 | `transmission_230kv` | Ec | 0.145 | High |
| 5 | `mine_land_reclamation` | E | 0.101 | **Low — no source** |

**11 of the 15 highest-leverage coefficients are low-confidence or unsourced.**
The top two (prairie_restoration, riparian_buffer) are well-sourced. The
structural sensitivity ordering is robust — zero rank changes between the
pre-S7a and post-S7a baselines, and the sub-portfolio flip rate is 0.0 (no
draw out of 1,000 changed the ranking).

The full MC results are in `data/processed/mc_validation_priority.csv` and the
sweep results in `data/processed/sweep_cost_ranking_sourced.csv`. Both carry
baseline provenance in `network_metadata.json` under `mc_sensitivity` and
`magnitude_sweep`.

---

## Assumptions

1. **Linear-in-magnitude effects.** See § EES effects model above.

2. **Spatially homogeneous coefficients.** See § EES effects model above.

3. **Self-reported confidence levels.** The `confidence` field on each
   coefficient is assigned by the library author based on source quality. It
   has not been externally validated or calibrated against a standard rubric.
   "High confidence" means the coefficient is grounded in federal agency data
   or peer-reviewed literature; "low confidence" means it is based on
   engineering judgment, analogy, or is unsourced.

4. **MC perturbation range.** The ±0.5 half-width with z=1.96 and σ=0.2551
   perturbation parameters are choices that affect which coefficients appear
   sensitive. A wider perturbation range would surface more coefficients; a
   narrower one would concentrate sensitivity on fewer. These parameters were
   not derived from empirical uncertainty estimates — they are a uniform
   exploration choice.

---

## Known gaps

### Files with no tracked generator

Two runtime files have no notebook or script that produces them. Both are
optional loads — the engine runs without them — but their provenance chain is
broken:

1. **`ees_scenario_profiles.json`** — loaded optionally at
   `terra_engine.py:2292`. Renamed from `mw_scenario_profiles.json` in S6, but
   the rename did not create a generator. This is S4/S9 backlog item 1.

2. **`lifecycle_coefficients.json`** — loaded optionally at
   `terra_engine.py:2417`. No notebook or script produces it. This is S4/S9
   backlog item 2.

### High-leverage unsourced coefficients

The following coefficients rank in the top 15 by MC sensitivity but lack
sourced values. These are the highest-priority items for an advisor
conversation or literature search:

| Priority | Coefficient | Capital | MC rank | ρ |
|----------|------------|---------|---------|---|
| 1 | `smr_advanced` | Ec | 3 | 0.203 |
| 2 | `mine_land_reclamation` | E | 5 | 0.101 |
| 3 | `mine_land_reclamation` | S | 10 | 0.034 |
| 4 | `smr_advanced` | S | 6 | 0.087 |
| 5 | `microgrid` | S | 7 | 0.048 |
| 6 | `university_research_center` | Ec | 8 | 0.036 |
| 7 | `university_research_center` | S | 11 | 0.031 |

The SMR coefficients are especially relevant given Wyoming's planned SMR
deployment at the Kemmerer site (TerraPower Natrium). The mine reclamation
coefficients carry combined leverage across two capital pathways (E and S).
