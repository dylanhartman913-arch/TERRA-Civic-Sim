# TERRA Methods — Index

This directory contains the methods documentation for the TERRA energy
transition simulation. It is written for a reader who needs to understand how
every number in the application was produced — what data sources were used,
what assumptions were made, and where gaps remain.

**Reading guide.** Each pipeline document covers one stage of the data-to-engine
pathway. Start with the pipeline that corresponds to your question:

| Pipeline | Document | What it answers |
|----------|----------|----------------|
| A | `pipeline_A_generator_inventory.md` | Where does the generator inventory come from? What vintage? How are costs assigned? |
| B | `pipeline_B_synthetic_network.md` | How was the 500-bus synthetic network built? What parameters control its topology? |
| C | `pipeline_C_ees_baseline.md` | How are E/Ec/S scores computed? What was the F2 normalization defect? What proxy indicators remain? |
| D | `pipeline_D_action_library.md` | How do action coefficients work? Which are well-sourced and which are not? What did the MC sensitivity analysis find? |
| E | `pipeline_E_fiscal_ledger.md` | How does the Wyoming fiscal layer work? What data couldn't be retrieved? |
| F–I | *(S15b — not yet written)* | Anchor facilities, climate/hazards, agriculture, engine/goldens |

Cross-cutting topics (CI governance, digest discipline, the three named case
studies from the W7 audit) will be covered in `cross_cutting.md` in S15b,
after all nine pipeline sections are complete.

**Cross-references.** These documents explain *why* and *what it means*. For
the *what and where* — file paths, generators, SHA-256 hashes, tracking
status — see `docs/PIPELINES.md`. For the manifest of every runtime file and
its current hash, see `data/manifest/manifest.json`.

---

## The five-scale doctrine

TERRA measures community capital across five dimensions. The first three form
the EES composite; the last two are Wyoming-specific extensions:

| Capital | Symbol | What it measures | Scale | Pipeline |
|---------|--------|-----------------|-------|----------|
| Environmental | E | Ecological health: land cover, water quality, biodiversity proxies | 0–10 | C |
| Economic | Ec | Economic quality of life: income, employment, energy infrastructure access | 0–10 | C |
| Social | S | Social infrastructure: healthcare, education, housing, community services | 0–10 | C |
| Fiscal | — | County-level tax revenue, school funding, severance tax | Dollars | E |
| Agricultural | — | Forage, rangeland, livestock, water rights | Mixed units | H (S15b) |

The EES scores are normalized to the Mountain West distribution (157 counties),
not nationally. A score of 8/10 means "high relative to this study area."

---

## Capacity basis and vintage semantics

When TERRA reports a facility's capacity, two fields govern interpretation:

- **`capacity_basis`** — which EIA-860 field the number comes from. Values:
  `"nameplate"` (EIA-860 Generator Nameplate Capacity),
  `"net_summer"` (EIA-860 Net Summer Capability),
  `"load"` (for demand-side facilities like data centers).

- **`capacity_basis_vintage`** — the year of the EIA filing from which the
  value was taken (e.g., `"2024"`).

These fields exist on every flagship facility record in
`mw_anchor_facilities.geojson` and `mw_county_cards.json`. The distinction
matters because nameplate and net capability can differ by 10–15% for thermal
plants (e.g., Jim Bridger: 2,326 MW nameplate vs 2,119 MW net summer/winter
capability, with 2,120 MW used for planning purposes). See DECISIONS.md
"S6: Jim Bridger capacity_basis schema choice" for the design rationale.

---

## Source pinning and refresh policy

TERRA pins its data sources at specific vintages rather than pulling live data
at runtime. The pinned sources and their vintages are:

| Source | Vintage | Pinned artifact |
|--------|---------|----------------|
| EIA-860 generators | May 2026 | `eia_operating_generators_2026-05_raw.json` (SHA `573f1a7b`) |
| NREL ATB | 2024 v3.0.0 | `atb_2024_summary.csv` |
| Census ACS | 2022 5-year | `acs_tract_2022.parquet` |
| TIGER shapefiles | 2020 | Census tract geometry |
| WY DOR ag valuation | 2026 assessment year | `wy_dor_ag_valuation_2026.pdf` |
| BEA farm income | 2022 | API pull, CAINC4 LineCode 71 |
| NASS cattle inventory | 2022 | API pull, QuickStats SURVEY |

A data refresh requires: re-pulling from the source, re-running the affected
notebook pipeline, updating the manifest hashes (`data/manifest/manifest.json`),
and verifying that CI passes (manifest hash check, dual-path identity check,
P3 attribution slope check). The CI checks are designed to fail if a refresh
changes data without updating the corresponding provenance records.

There is no automated staleness detection. Identifying when a source has been
updated by its publisher is a manual process.

---

## Known proxy and manual-source limitations

The following limitations apply across pipelines and should be understood by
any reader evaluating the strength of TERRA's evidence base:

1. **Four EES proxy indicators** (Pipeline C) are documented approximations
   awaiting replacement with higher-quality data: `eco_base_score`,
   `water_stress`, `development_pressure`, `has_university`.

2. **Four fiscal data sources** (Pipeline E) could not be retrieved
   (ONRR, DOR commodity split, severance, LSO school finance) and remain as
   manual-fetch items.

3. **BLM grazing data** is missing entirely across both the fiscal (Pipeline E)
   and agriculture (Pipeline H, S15b) layers. BLM administers more land than
   USFS in Wyoming.

4. **DOR productive values** are statewide fallbacks, not county-level
   (Pipeline E). The actual range spans an order of magnitude.

5. **11 of 15 highest-leverage action coefficients** (Pipeline D) are
   low-confidence or unsourced. The MC sensitivity analysis identifies these
   but does not resolve them.

6. **`ees_scenario_profiles.json` and `lifecycle_coefficients.json`** have no
   tracked generator — their provenance chain is broken.

---

## Existing reference documents in this directory

| File | What it is |
|------|-----------|
| `MANUAL_FETCH.md` | Manual fetch log from `23_climate_projection_pull.ipynb` — records data items requiring human download |
| `session_config.md` | Session config schema and examples — the JSON format for workshop customisation |
| `TERRA_physical_constraints_data_scoping.md` | Data scoping roadmap for the physical-constraints plugin (P-track, post-W7) |
