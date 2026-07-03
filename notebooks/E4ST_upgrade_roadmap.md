# E4ST Upgrade Roadmap
## From Static DC OPF → Multi-Year Capacity Expansion Model

**Purpose:** This file is the shared memory for the E4ST upgrade track. Each
notebook listed below has a Claude Code session prompt and a precise list of
inputs, outputs, and handoff conditions. Add the finished notebook to the
project files before starting the next chat session. Claude Code should read
this file at the start of every session.

**Current state of the pipeline (as of NB 09):**
- 500-bus synthetic network, 656 branches, 14,333 aligned generators
- `generators_with_costs.parquet` — `plant_id`, `generator_id`, `technology`,
  `fuel_type`, `capacity_mw`, `heat_rate_mmbtu_mwh`, `fuel_cost_per_mmbtu`,
  `vom_per_mwh`, `fom_per_kw_yr`, `marginal_cost_per_mwh`, `in_giant_component`,
  `bus_id` (synthetic), `stateid`, `snap_dist_m`, `fuel_cost_imputed`
- `baseline_case.arrow` / `baseline_branches.arrow` / `baseline_generators.arrow`
- `lmp.parquet` and `dispatch.parquet` for `baseline` and `carbon_tax_50` scenarios
- `09_lmp_comparison.ipynb` — completed, all 5 figures written

**What the existing model cannot do:**
- Investment (new capacity cannot be built endogenously)
- Retirement (generators run forever regardless of economics)
- Multi-year projection (single static operating point only)
- Hourly variation (single load level, no time-of-day or seasonal structure)
- Location-specific renewable capacity factors (wind/solar treated as flat)

**What E4ST adds:**
- Multi-year periods with investment and retirement decisions
- Endogenous capacity expansion minimizing total system cost
- Policy modifications as first-class objects (carbon tax, ITC, RPS, CES)
- Hourly representative periods with technology-specific availability factors
- Results: LMPs, dispatch, capacity built/retired, emissions, consumer surplus

---

## Phase 1 — Data Augmentation (Python, Notebooks 10–13)

### Notebook 10 — EIA Form 860 Retirement Schedule

**File:** `10_eia860_retirements.ipynb`

**Purpose:** Attach planned retirement dates and operating life metadata to
every generator in `generators_with_costs.parquet`. This is what E4ST needs
to schedule exogenous retirements and compute remaining economic life.

**Claude Code session prompt:**
> Read `data/processed/generators_with_costs.parquet` and
> `data/processed/network_metadata.json` before writing any code. Print the
> schema and row count of the parquet file.
>
> Write `10_eia860_retirements.ipynb` that:
>
> 1. Pulls EIA Form 860 Schedule 3 (retired generators) and Schedule 1
>    (operating generators with planned retirement dates) via the EIA API v2
>    endpoint `electricity/operating-generator-capacity/data`. Use the existing
>    `.env` / `utils.py` pattern from notebook 01 for authentication. Fetch
>    fields: `plantid`, `generatorid`, `technology`, `stateid`,
>    `operating_year` (year_on), `planned_retirement_year` (year_shutdown),
>    `nameplate-capacity-mw`. Paginate with `PAGE_SIZE=5000`, `MAX_OFFSET=30000`.
>    Print total records fetched and null rate for `planned_retirement_year`.
>
> 2. For generators without a planned retirement date, impute `year_shutdown`
>    using standard economic life assumptions by technology (document these as
>    named constants): Coal = 50 years, Natural Gas CC = 40 years, Natural Gas
>    CT = 30 years, Nuclear = 60 years (license renewal assumed), Hydro = 80
>    years, Wind = 25 years, Solar PV = 30 years, Storage = 20 years,
>    Other = 30 years. Compute `year_shutdown = max(year_on + econ_life,
>    planned_retirement_year)` where planned data exists.
>
> 3. Join onto `generators_with_costs.parquet` by `plant_id` + `generator_id`.
>    Print match rate. For unmatched generators (new builds added after 860
>    vintage), impute `year_on = 2023` and apply the technology econ_life above.
>
> 4. Add columns: `year_on` (int), `year_shutdown` (int), `econ_life` (int),
>    `retirement_source` (string: "eia860_planned", "eia860_imputed", or
>    "econ_life_default"), `operating_age_2023` (int = 2023 - year_on).
>
> 5. Print a summary table: by technology, mean age, mean remaining life,
>    fraction with planned vs imputed retirement, total MW retiring before
>    2030, 2035, 2040. Flag any technology where >50% of MW have no planned
>    retirement date. This table becomes a methods section appendix.
>
> 6. Save `data/processed/generators_with_retirements.parquet` — all columns
>    from `generators_with_costs.parquet` plus the four new columns above.
>    Save `data/processed/retirement_summary.csv` — the technology summary table.
>    Update `network_metadata.json` with key `"retirement_data"` containing
>    timestamp, source, match_rate, and n_generators.

**Inputs:**
- `data/processed/generators_with_costs.parquet`
- `data/processed/network_metadata.json`
- EIA API v2 (key from `.env`)

**Outputs:**
- `data/processed/generators_with_retirements.parquet` ← primary handoff
- `data/processed/retirement_summary.csv`
- `data/processed/network_metadata.json` (updated)

**Handoff condition:** `generators_with_retirements.parquet` exists, has same
row count as `generators_with_costs.parquet`, and `year_shutdown` null rate < 1%.

---

### Notebook 11 — Representative Hours Table

**File:** `11_hourly_profiles.ipynb`

**Purpose:** Reduce 8,760 hours of EIA-930 hourly load data to 12–20
representative hours using k-means clustering. This produces E4ST's hours
table — the time structure that makes the model hourly without solving 8,760
OPF instances.

**Claude Code session prompt:**
> Read `data/processed/eia930_raw.parquet`, `data/processed/ba_territories.geojson`,
> and `data/processed/network_metadata.json` before writing any code. Print
> the date range, BA count, and shape of the EIA-930 data.
>
> Write `11_hourly_profiles.ipynb` that:
>
> 1. Loads `eia930_raw.parquet`. Pivot to a wide matrix of shape
>    (8760 hours × N_BA) where each cell is net load in MW for that BA and
>    hour. Drop BAs with >10% missing hourly observations. Fill remaining gaps
>    with linear interpolation, flagging any gap >6 hours as a data quality
>    warning. Print the resulting matrix shape and missing-data summary.
>
> 2. Normalize each BA's load series to its annual mean (so clustering finds
>    shape patterns, not magnitude patterns). Apply k-means clustering
>    (`sklearn.cluster.KMeans`) on the normalized load matrix with k=16
>    representative hours. Use `random_state=42`. Also run k=8 and k=24 and
>    print the within-cluster sum of squares for each — the methods section
>    needs to justify k=16 as the elbow point.
>
> 3. For each of the 16 clusters: identify the centroid hour, compute the
>    cluster weight (fraction of annual hours in that cluster), and compute
>    the actual (un-normalized) national total load for the centroid hour.
>    Tag each cluster with a season (DJF/MAM/JJA/SON) and time-of-day
>    category (overnight 0–6, morning 6–12, afternoon 12–18, evening 18–24).
>
> 4. Build the E4ST hours table as a DataFrame with columns:
>    `hour_id` (1–16), `weight` (fraction of year), `season`, `time_of_day`,
>    `national_load_mw`, `notes`. Save as `data/processed/e4st_hours.csv`.
>
> 5. Build the BA-level load table: for each representative hour × BA,
>    the actual load in MW. This is the load input E4ST uses in place of
>    a single scaled value. Shape: (16 hours × N_BA). Save as
>    `data/processed/e4st_load_by_hour.parquet` with columns:
>    `hour_id`, `ba_code`, `load_mw`.
>
> 6. Plot a 4×4 grid of subplots (one per representative hour) showing the
>    national load profile for that cluster's centroid day (24h trace), with
>    the centroid hour highlighted. Save as
>    `data/processed/figures/11_representative_hours.png` at 300 DPI.
>
> 7. Update `network_metadata.json` with key `"hours_table"` containing:
>    `n_representative_hours`, `k_means_seed`, `date_range`, `timestamp`.

**Inputs:**
- `data/processed/eia930_raw.parquet`
- `data/processed/ba_territories.geojson`
- `data/processed/network_metadata.json`

**Outputs:**
- `data/processed/e4st_hours.csv` ← primary handoff (E4ST hours table)
- `data/processed/e4st_load_by_hour.parquet` ← primary handoff (load by hour × BA)
- `data/processed/figures/11_representative_hours.png`
- `data/processed/network_metadata.json` (updated)

**Handoff condition:** `e4st_hours.csv` has 16 rows with weights summing to 1.0.
`e4st_load_by_hour.parquet` has 16 × N_BA rows with no null `load_mw` values.

---

### Notebook 12 — Wind & Solar Availability Factors

**File:** `12_availability_factors.ipynb`

**Purpose:** Pull hourly capacity factor profiles for wind and solar at each
synthetic bus location from NREL's WIND Toolkit and NSRDB. This is the most
data-intensive new stream — capacity factors are what make renewable dispatch
spatially heterogeneous in E4ST, which is essential for the Wyoming wind
argument to have quantitative grounding.

**Claude Code session prompt:**
> Read `data/processed/synthetic_buses.geojson`,
> `data/processed/e4st_hours.csv`, and `data/processed/network_metadata.json`
> before writing any code. Print the bus count, lat/lon range, and the 16
> representative hour IDs and weights from the hours table.
>
> Write `12_availability_factors.ipynb` that:
>
> 1. For each synthetic bus, extract lat/lon. The NREL WIND Toolkit API
>    (`https://developer.nrel.gov/api/wind-toolkit/v2/wind/wtk-srw-download`)
>    and NSRDB API (`https://developer.nrel.gov/api/nsrdb/v2/solar/`) both
>    require an NREL API key stored in `.env` as `NREL_API_KEY`. Fetch the
>    key using the same `utils.py` pattern as the EIA key. Print a warning
>    and halt with a clear message if the key is not found.
>
> 2. For wind: pull annual hourly capacity factors (8760 values) at each bus
>    location. Use the nearest WIND Toolkit grid point. Batch requests in
>    groups of 10 buses with a 1-second sleep between batches to respect rate
>    limits. Cache raw responses to `data/raw/nrel_wind/bus_{bus_id}.json` —
>    skip the API call if the cache file exists. Print progress every 50 buses.
>
> 3. For solar: same procedure using NSRDB. Cache to
>    `data/raw/nrel_solar/bus_{bus_id}.json`.
>
> 4. Reduce each 8760-hour series to the 16 representative hours from
>    `e4st_hours.csv` by taking the mean capacity factor across all hours in
>    each cluster. Result: a (500 buses × 16 hours) matrix for wind and solar.
>
> 5. Build the E4ST availability factor table with columns: `bus_id`,
>    `technology` ("wind" or "solar"), `hour_id`, `cf` (capacity factor 0–1).
>    Shape: 500 × 2 × 16 = 16,000 rows. Save as
>    `data/processed/e4st_availability_factors.parquet`.
>
> 6. Compute and print summary statistics: mean CF by technology and BA,
>    highlighting Wyoming buses (WACM, PACE). Wyoming wind CFs should
>    exceed 0.35 on average — flag if they do not. Plot a choropleth map
>    (Folium, CartoDB positron, same style as prior notebooks) of mean annual
>    wind CF by bus, sized by `capacity_mw`. Save as
>    `data/processed/figures/12_wind_cf_map.html`.
>
> 7. Update `network_metadata.json` with key `"availability_factors"`:
>    `n_buses_wind`, `n_buses_solar`, `mean_cf_wind_wacm`,
>    `mean_cf_solar_wacm`, `timestamp`.

**Inputs:**
- `data/processed/synthetic_buses.geojson`
- `data/processed/e4st_hours.csv`
- `data/processed/network_metadata.json`
- NREL WIND Toolkit API (key from `.env` as `NREL_API_KEY`)
- NREL NSRDB API (same key)

**Outputs:**
- `data/processed/e4st_availability_factors.parquet` ← primary handoff
- `data/raw/nrel_wind/bus_{bus_id}.json` (cached, 500 files)
- `data/raw/nrel_solar/bus_{bus_id}.json` (cached, 500 files)
- `data/processed/figures/12_wind_cf_map.html`
- `data/processed/network_metadata.json` (updated)

**Handoff condition:** `e4st_availability_factors.parquet` has rows for all
500 buses × 2 technologies × 16 hours. No CF values outside [0, 1].
Wyoming bus wind CFs documented in `network_metadata.json`.

**Note on API rate limits:** NREL APIs allow 1,000 requests/day on a free
key. With 500 buses × 2 technologies = 1,000 requests, this notebook may
need to be run across two days if a free key is used. The cache-first logic
in step 2 makes reruns safe. A note cell should document this constraint.

---

### Notebook 13 — Candidate Generator Table

**File:** `13_candidate_generators.ipynb`

**Purpose:** Build the table of `unbuilt` (candidate) generators — new
capacity that E4ST can choose to build endogenously. This is what makes the
model a capacity expansion model rather than just a dispatch model. Includes
wind, solar, natural gas, and SMR candidates, with Wyoming locations
specifically seeded for the nuclear supply chain argument.

**Claude Code session prompt:**
> Read `data/processed/synthetic_buses.geojson`,
> `data/processed/generators_with_retirements.parquet`,
> `data/processed/e4st_availability_factors.parquet`,
> `data/processed/ba_territories.geojson`, and
> `data/processed/network_metadata.json` before writing any code.
>
> Write `13_candidate_generators.ipynb` that builds a table of candidate
> (unbuilt, endogenously buildable) generators for E4ST. This notebook does
> not call any external APIs — all cost data comes from hardcoded NREL ATB
> 2024 values, which must be documented as named constants.
>
> **NREL ATB 2024 cost constants (Moderate scenario, 2030 projection):**
> ```python
> ATB_2024 = {
>     "wind_onshore":    {"capex_per_kw": 1_350, "fom_per_kw_yr": 28,  "vom_per_mwh": 0.0,  "econ_life": 25},
>     "wind_offshore":   {"capex_per_kw": 3_200, "fom_per_kw_yr": 88,  "vom_per_mwh": 0.0,  "econ_life": 25},
>     "solar_pv_utility":{"capex_per_kw": 900,   "fom_per_kw_yr": 17,  "vom_per_mwh": 0.0,  "econ_life": 30},
>     "ng_cc":           {"capex_per_kw": 1_050, "fom_per_kw_yr": 15,  "vom_per_mwh": 2.0,  "econ_life": 40},
>     "ng_ct":           {"capex_per_kw": 700,   "fom_per_kw_yr": 10,  "vom_per_mwh": 3.0,  "econ_life": 30},
>     "smr_nuclear":     {"capex_per_kw": 6_500, "fom_per_kw_yr": 130, "vom_per_mwh": 2.5,  "econ_life": 60},
>     "battery_4h":      {"capex_per_kw": 650,   "fom_per_kw_yr": 10,  "vom_per_mwh": 0.5,  "econ_life": 20},
> }
> DISCOUNT_RATE = 0.07   # 7% real discount rate for annualized capex
> MODEL_HORIZON_YR = 30  # annualize over 30-year planning horizon
> ```
>
> 1. For each synthetic bus, create candidate generator rows for: wind (if
>    the bus has at least one existing wind generator OR is in a wind-resource
>    BA: WACM, PACE, MISO, SWPP, PJM), solar (all buses in WECC, SERC, and
>    SPP), natural gas CC (all buses), battery storage (all buses).
>    SMR nuclear: Wyoming buses only (WACM and PACE ba_code), plus INL bus
>    (nearest synthetic bus to lat=43.52, lon=-112.65), plus any bus within
>    50 km of an existing nuclear plant.
>
> 2. Compute `capex_per_mw_per_hour` = annualized capital cost using the
>    discount rate and economic life:
>    `capex_annual = capex_per_kw * 1000 * DR / (1 - (1+DR)^(-life))`
>    `capex_per_mw_per_hour = capex_annual / 8760`
>    This is E4ST's `capex` column. Document the formula as a comment.
>
> 3. Assign `build_status = "unbuilt"`, `build_type = "endog"`,
>    `year_on = 2025` (earliest buildable year), `pcap0 = 0.0`,
>    `pcap_min = 0.0`, `pcap_max` = technology-specific maximum per bus:
>    wind = 500 MW, solar = 400 MW, ng_cc = 600 MW, ng_ct = 300 MW,
>    smr = 300 MW (NuScale/TerraPower scale), battery = 200 MW.
>
> 4. For wind and solar candidates, join the mean capacity factor from
>    `e4st_availability_factors.parquet` by bus_id and technology.
>    Flag any wind candidate with mean CF < 0.15 as low-resource and
>    set its `pcap_max = 0` (effectively exclude). Print count of excluded buses.
>
> 5. Concatenate the candidate table with the existing generator table from
>    `generators_with_retirements.parquet` (marking existing as
>    `build_status="built"`, `build_type="real"`). The combined table is the
>    full E4ST generator input. Save as
>    `data/processed/e4st_gen_table.parquet` with columns matching the E4ST
>    generator schema exactly:
>    `bus_id`, `build_status`, `build_type`, `year_on`, `year_shutdown`,
>    `econ_life`, `genfuel`, `gentype`, `pcap0`, `pcap_min`, `pcap_max`,
>    `vom`, `fom`, `capex`, `heat_rate`, `fuel_price`, `cf_hist`,
>    `emis_co2_rate`, `plant_id`, `generator_id`, `stateid`.
>
> 6. Print a summary: total rows, existing vs candidate counts by technology,
>    total candidate MW by technology and by BA for Wyoming specifically.
>    Save `data/processed/candidate_summary.csv`.
>    Update `network_metadata.json` with key `"candidate_generators"`.

**Inputs:**
- `data/processed/synthetic_buses.geojson`
- `data/processed/generators_with_retirements.parquet`
- `data/processed/e4st_availability_factors.parquet`
- `data/processed/ba_territories.geojson`
- `data/processed/network_metadata.json`

**Outputs:**
- `data/processed/e4st_gen_table.parquet` ← primary handoff (full E4ST gen input)
- `data/processed/candidate_summary.csv`
- `data/processed/network_metadata.json` (updated)

**Handoff condition:** `e4st_gen_table.parquet` contains both `build_status="built"`
and `build_status="unbuilt"` rows. Wyoming SMR candidates exist. No null values
in required E4ST columns (`vom`, `fom`, `capex`, `pcap0`, `pcap_max`).

---

## Phase 2 — E4ST Case Builder (Julia)

### Script: `build_e4st_case_v2.jl`

**Purpose:** Replace the hand-rolled JuMP OPF infrastructure with a proper
E4ST case. This script translates the processed Python outputs into E4ST's
native CSV input format and calls `E4ST.run_e4st()`.

**Claude Code session prompt:**
> Read the following files before writing any code:
> `data/processed/network_metadata.json`,
> `data/processed/e4st_gen_table.parquet`,
> `data/processed/e4st_hours.csv`,
> `data/processed/e4st_load_by_hour.parquet`,
> `data/processed/e4st_availability_factors.parquet`,
> `data/processed/baseline_case.arrow` (buses),
> `data/processed/baseline_branches.arrow`.
> Also read the existing `julia/build_nodal_case.jl` for naming conventions.
>
> Write `julia/build_e4st_case_v2.jl` that:
>
> 1. Reads all inputs above and translates them into E4ST's required CSV format.
>    Write to `data/processed/e4st_inputs/`:
>    - `bus.csv` — from `baseline_case.arrow`: columns `bus_idx`, `ba_code`,
>      `lon`, `lat`, `load_mw` (use baseline single load; hourly load injected
>      via the load modification object).
>    - `branch.csv` — from `baseline_branches.arrow`: columns `f_bus`, `t_bus`,
>      `br_x`, `rate_a` (thermal limit MW), `br_status=1`.
>    - `gen.csv` — from `e4st_gen_table.parquet`: all E4ST generator columns.
>      Convert `fom_per_kw_yr` to E4ST's per-MW-per-hour unit:
>      `fom = fom_per_kw_yr * 1000 / 8760`.
>    - `hours.csv` — directly from `e4st_hours.csv`.
>    - `load.csv` — from `e4st_load_by_hour.parquet`, matched to bus_idx.
>    - `af.csv` — from `e4st_availability_factors.parquet`, matched to gen_idx.
>
> 2. Write `julia/config/baseline.yml` — E4ST config file for the baseline
>    scenario. Specify: solver = HiGHS, years = [2025, 2030, 2035],
>    year_weights = [5, 5, 5], data_path = "data/processed/e4st_inputs/",
>    results_path = "data/processed/e4st_results_v2/baseline/".
>
> 3. Run a pre-flight validation: confirm bus count, gen count, branch count,
>    hours count match expectations from `network_metadata.json`. Halt with
>    a clear error message if any mismatch exceeds 1%.
>
> 4. Call `E4ST.run_e4st("julia/config/baseline.yml")` and capture the
>    return value. Print the solver status and objective value.
>    If the solve fails, print the full E4ST diagnostic and halt.
>
> 5. After a successful baseline solve, print the top 10 BAs by load-weighted
>    mean LMP for each model year (2025, 2030, 2035). Sanity check:
>    CISO LMP > MISO LMP in all years. Wyoming BA (WACM) LMP should be lower
>    than national mean in all years.
>
> 6. Update `network_metadata.json` with key `"e4st_v2"` containing:
>    `status`, `n_years`, `model_years`, `baseline_solve_status`, `timestamp`.

**Inputs (all from Phase 1 outputs):**
- `data/processed/e4st_gen_table.parquet`
- `data/processed/e4st_hours.csv`
- `data/processed/e4st_load_by_hour.parquet`
- `data/processed/e4st_availability_factors.parquet`
- `data/processed/baseline_case.arrow`
- `data/processed/baseline_branches.arrow`
- `data/processed/network_metadata.json`

**Outputs:**
- `data/processed/e4st_inputs/` — full set of E4ST CSV inputs
- `julia/config/baseline.yml`
- `data/processed/e4st_results_v2/baseline/` — E4ST result files
- `data/processed/network_metadata.json` (updated)

**Handoff condition:** `e4st_results_v2/baseline/` exists and contains E4ST
result CSVs. `network_metadata.json → e4st_v2 → baseline_solve_status = "OPTIMAL"`.

---

## Phase 3 — Scenario Config Files

### Three scenarios, each a YAML config for `E4ST.run_e4st()`

**Claude Code session prompt (single session, after Phase 2 baseline passes):**
> Read `julia/config/baseline.yml`, all files in `data/processed/e4st_inputs/`,
> `data/processed/e4st_results_v2/baseline/`, and `data/processed/network_metadata.json`.
> Read the E4ST.jl documentation for `CarbonTax`, `InvestmentTaxCredit`, and
> `RenewablePortfolioStandard` modification objects before writing any config.
>
> Write three scenario config files and run all three:
>
> **Scenario 1 — Carbon Tax $50:**
> `julia/config/carbon_tax_50.yml`
> Identical to baseline plus a `CarbonTax` modification:
> `price = 50.0` $/ton CO₂, applied to all years 2025–2035.
> Emissions rates from `TECHNOLOGY_EMISSIONS` constants in
> `julia/run_scenario.jl` (coal=0.98, NG CC=0.40, NG CT=0.55).
>
> **Scenario 2 — IRA Investment Tax Credits:**
> `julia/config/ira_itc.yml`
> Baseline plus three `InvestmentTaxCredit` modifications:
> - Wind onshore: 30% ITC on capex, years 2025–2032 (IRA phase-down schedule)
> - Solar utility: 30% ITC on capex, years 2025–2032
> - SMR nuclear: 30% ITC on capex, years 2025–2035 (Section 48C extended)
> This is the scenario that quantifies the Wyoming SMR buildout argument.
>
> **Scenario 3 — Carbon Tax + IRA Combined:**
> `julia/config/carbon_tax_ira.yml`
> Both policy modifications active simultaneously. This is the most policy-
> realistic scenario and the primary results figure for the dissertation.
>
> For each scenario:
> - Run `E4ST.run_e4st(config_path)`
> - Print capacity built by technology and BA for each model year
> - Print LMP by BA for each model year
> - Print total emissions by year and scenario
> - Sanity check: IRA scenario should show positive SMR investment in Wyoming
>   BAs by 2035. Flag if it does not.
>
> Save scenario run metadata to `network_metadata.json → e4st_v2 → scenario_runs`.

**Outputs:**
- `data/processed/e4st_results_v2/carbon_tax_50/`
- `data/processed/e4st_results_v2/ira_itc/`
- `data/processed/e4st_results_v2/carbon_tax_ira/`

---

## Phase 4 — Results Visualization (Notebook 14)

### Notebook 14 — Multi-Year Scenario Comparison

**File:** `14_e4st_results.ipynb`

**Purpose:** The primary results visualization for the upgraded model. Shows
investment trajectories, LMP evolution, and emissions reduction across the
three scenarios and three model years (2025, 2030, 2035). The Wyoming nuclear
buildout under the IRA scenario is the dissertation's central empirical claim.

**Claude Code session prompt:**
> Read all CSV/Parquet files in `data/processed/e4st_results_v2/`,
> `data/processed/network_metadata.json`, `data/processed/ba_territories.geojson`,
> and `data/processed/synthetic_buses.geojson` before writing any code.
> Match the Folium map style from notebooks 03a and 09 (CartoDB positron,
> center [39.5, -98.35], zoom 4). Never recompute anything E4ST already computed.
>
> Write `14_e4st_results.ipynb` with these figures:
>
> 1. **Capacity buildout by technology, 3 scenarios × 3 years** — grouped bar
>    chart, MW added nationally. Highlight Wyoming-specific SMR additions with
>    a separate panel inset.
>
> 2. **LMP evolution map** — Folium choropleth with a slider or LayerControl
>    for year (2025/2030/2035) and scenario (baseline/carbon_tax/ira/combined).
>    Fill by load-weighted BA mean LMP. Wyoming BAs outlined in bold black
>    as in notebook 09.
>
> 3. **Emissions trajectory** — line chart, annual tons CO₂, all four scenarios,
>    2025–2035. Shade the gap between baseline and carbon_tax_ira as the
>    "policy impact" area.
>
> 4. **Wyoming deep-dive panel** — For WACM and PACE BAs specifically:
>    installed capacity by technology in each year and scenario, LMP by year,
>    and a map of the Mountain West zoom showing individual bus capacity
>    additions (sized circle markers, colored by technology).
>
> 5. **Methods validation table** — markdown cell documenting: solver, model
>    years, representative hours, discount rate, ATB vintage, ITC rates,
>    carbon price, slack bus BA, and a note on the relationship between this
>    model and the static DC OPF in notebooks 06–09.
>
> Save all figures to `data/processed/figures/` at 300 DPI.

---

## Shared Conventions Across All Sessions

- Always read `data/processed/network_metadata.json` first — it is the project's
  shared memory and accumulates keys across every session.
- Python notebooks use `PROJECT_ROOT = Path().resolve().parent` and
  `PROCESSED = PROJECT_ROOT / "data" / "processed"`.
- EIA API key from `.env` as `EIA_API_KEY`, loaded via `utils.py`.
- NREL API key from `.env` as `NREL_API_KEY`.
- All maps: `folium.Map(location=[39.5, -98.35], zoom_start=4, tiles="CartoDB positron")`.
- All static figures: 300 DPI, saved to `data/processed/figures/`.
- Julia scripts: read `network_metadata.json` first, validate preconditions,
  halt with clear error if not met.
- Every notebook ends with a cell that confirms all output files exist and
  prints their sizes.

## Session Startup Checklist (paste at start of each Claude Code chat)

```
Before writing any code, read this file (E4ST_upgrade_roadmap.md) in full,
then read data/processed/network_metadata.json, then read the specific input
files listed under this notebook's "Inputs" section. Print a one-paragraph
status summary confirming what data is available and what the notebook will build.
```
