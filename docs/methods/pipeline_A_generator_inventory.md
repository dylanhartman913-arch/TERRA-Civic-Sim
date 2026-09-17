# Pipeline A — Generator Inventory & Provenance

**Pipeline status:** Current
**Generator:** `notebooks/06_generator_costs.ipynb`
**Runtime file:** `data/processed/generators_with_costs.parquet`
**Cross-reference:** `docs/PIPELINES.md` § Pipeline A

---

## What this pipeline produces

A single parquet file (`generators_with_costs.parquet`) containing cost-annotated
records for every utility-scale generator in the Mountain West study area. This
file is the upstream input for the EES baseline (Pipeline C), the synthetic
network plant assignments (Pipeline B), and the attribution logic that computes
per-county Ec_gencap contributions.

The file is derived from a pinned EIA inventory snapshot and an NREL cost overlay.

---

## Data sources

### EIA-860 Operating Generators

| Field | Value |
|-------|-------|
| Source | U.S. Energy Information Administration, Form EIA-860 (Annual Electric Generator Report) |
| File | `data/staging/eia_operating_generators_2026-05_raw.json` |
| Vintage | May 2026 monthly release |
| Record count | 25,868 generators |
| Pinned SHA-256 | `573f1a7b` (first 8 hex chars; full hash in `data/manifest/manifest.json`) |
| Retrieval method | EIA API v2 via `notebooks/01_eia_pull.ipynb` |

The EIA-860 form collects generator-level data from all existing and planned
electric generating plants in the United States with a total nameplate capacity
of 1 MW or more. The pinned snapshot was pulled once and has not been refreshed
since May 2026. It is the single authoritative source for generator identity,
location, fuel type, nameplate capacity, and operating status within TERRA.

**Historical note on record count:** An earlier version of the EIA pull
(pre-Wave 7) retrieved only 15,034 records due to API pagination truncation.
This produced an 11.8% Ec_gencap normalization slope mismatch in Pipeline C
(see `pipeline_C_ees_baseline.md` § F2 defect history for the full account).
The current 25,868-record inventory is the complete, un-truncated pull.

### NREL Annual Technology Baseline (ATB)

| Field | Value |
|-------|-------|
| Source | National Renewable Energy Laboratory, Annual Technology Baseline |
| Version | 2024 v3.0.0 |
| Scenario | Moderate |
| File | `data/staging/atb_2024_summary.csv` |
| Retrieval | Static download from `atb.nrel.gov` |

The ATB provides technology-specific cost and performance projections. The
"Moderate" scenario is used for all cost assignments. The "Advanced" and
"Conservative" scenarios are not used.

---

## Processing steps

`06_generator_costs.ipynb` performs the following:

1. Loads the pinned EIA-860 inventory.
2. Loads the ATB 2024 summary CSV.
3. Assigns levelized cost estimates to each generator based on fuel type and
   technology class, using ATB Moderate scenario values.
4. Snaps generators to a 500-meter grid (`grid_size_m = 500`, hardcoded in
   nb06 cell "cell-meta").
5. Writes `generators_with_costs.parquet` to `data/processed/`.
6. Writes top-level keys to `network_metadata.json` via deep-merge:
   `total_buses`, `total_lines`, `grid_size_m`, `data_vintage_year` (2024),
   `atb_scenario` ("Moderate"), `atb_version` ("2024 v3.0.0").

---

## Assumptions

1. **EIA-860 completeness.** We assume the EIA-860 covers all utility-scale
   generators (≥1 MW nameplate) operating in the Mountain West study area.
   Distributed generation below the EIA reporting threshold is not captured.

2. **ATB Moderate scenario.** Cost assignments use the ATB "Moderate" technology
   pathway. This is a modeling choice — the Moderate scenario represents NREL's
   central projection, not a conservative or optimistic bound. The choice
   affects levelized cost estimates but does not affect generator counts,
   locations, or capacities.

3. **Point-in-time snapshot.** The pinned inventory is a snapshot from May 2026.
   Generators that entered or exited service after that date are not reflected.
   There is no automated refresh mechanism; a future data session would need to
   re-pull from the EIA API and re-pin.

4. **Grid snapping resolution.** The 500-meter grid resolution for generator
   snapping is a hardcoded constant in nb06. This resolution determines how
   generators are assigned to synthetic buses in Pipeline B.

---

## Known gaps

This pipeline has no structural gaps — its status is "Current" per the S9
pipeline audit. The following items are not gaps in the pipeline itself but
are constraints that downstream consumers should be aware of:

- **Aging vintage.** The May 2026 snapshot will become stale as the EIA updates
  its generator inventory. No automated staleness check exists.
- **No sub-1-MW coverage.** Distributed generation below the EIA-860 reporting
  threshold is absent from the inventory and therefore absent from the Ec_gencap
  normalization in Pipeline C.
