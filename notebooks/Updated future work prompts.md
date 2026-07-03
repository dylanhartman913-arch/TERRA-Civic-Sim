## Updated Session 2 prompt

> Read the following files before writing any code:
> - `data/processed/background files/power_plants.geojson` — confirm column names, especially `plantid`, `generatorid`, `technology`, `energy-source-desc`, `nameplate-capacity-mw`
> - `data/processed/background files/bus_locations.geojson` — confirm the `bus_id` assignment and which plants successfully snapped
> - `data/processed/background files/grid_network.graphml` — inspect node attributes to confirm `bus_id`, `total_capacity_mw`, `dominant_fuel` are present
>
> Then run this capacity retention diagnostic first, before any API calls, and print the results:
>
> ```python
> # For each connected component, sum total snapped capacity
> # Print MW retained at component size thresholds: 1, 10, 50, 100 nodes
> # This determines the island filtering cutoff for the Julia case builder
> ```
>
> Record the threshold where retained capacity plateaus (expected: ≥50 nodes retains ~95%+ of total MW). Write this value to `data/processed/network_metadata.json` as `island_filter_min_nodes` alongside `total_buses`, `total_lines`, `giant_component_size`, and `grid_size_m`. This file is the single source of truth that the Julia case builder will read to know how to filter the network — do not hardcode these values in Julia.
>
> Then fetch EIA generator cost parameters using the EIA API v2. You need two endpoints:
>
> **Heat rates** — check the existing `power_plants.geojson` first. If `heat-rate` came through in the notebook 01 pull, use it directly rather than making a redundant API call. For generators where it is null (storage, hydro, wind, solar), set `heat_rate_mmbtu_mwh` to null — these technologies have no fuel heat rate.
>
> **Fuel costs** — use endpoint `electricity/electric-power-operational-data/data` with `frequency=annual`, most recent available year, filtered to fuel types present in the plant data. This returns plant-level average fuel costs in $/MMBtu. Join to generators on `plantid` — multiple generators at the same plant share the plant-level fuel cost. Do not attempt a generator-level join; the data is not reported at that resolution.
>
> **O&M costs** — do not attempt to pull these from the EIA API. They are not available at generator resolution. Instead hardcode a lookup table of NREL ATB 2024 values by technology type. Fetch the ATB summary data from `https://atb.nrel.gov/electricity/2024/data` to get the exact values rather than approximating. Required fields per technology: `vom_per_mwh` and `fom_per_kw_yr`.
>
> For technologies without heat rates (wind, solar, hydro, storage), `marginal_cost_per_mwh` = `vom_per_mwh` only. For thermal generators, `marginal_cost_per_mwh` = (`heat_rate_mmbtu_mwh` × `fuel_cost_per_mmbtu`) + `vom_per_mwh`.
>
> Save two outputs:
>
> `data/processed/generators_with_costs.parquet` with columns: `bus_id`, `plant_id`, `generator_id`, `technology`, `fuel_type`, `capacity_mw`, `heat_rate_mmbtu_mwh` (nullable), `fuel_cost_per_mmbtu`, `vom_per_mwh`, `fom_per_kw_yr`, `marginal_cost_per_mwh`, `in_giant_component` (boolean — whether the bus belongs to a component above the island filter threshold).
>
> `data/processed/cost_coverage.csv` — a summary table with one row per technology type showing: count of generators, total MW, fraction with real vs ATB-imputed heat rates, fraction with real vs median-imputed fuel costs, mean marginal cost. This becomes a methods section table.
>
> Print a final coverage summary: fraction of total MW that has real (non-imputed) cost data, broken down by technology. Flag any technology where real coverage is below 50%.

---

## Revised session outline

Here is the full updated plan with the island filtering change propagated through.

---

**Session 3 — Julia environment + case builder**

> Read `data/processed/network_metadata.json`, `data/processed/bus_locations.geojson`, `data/processed/grid_network.graphml`, and `data/processed/generators_with_costs.parquet` before writing any code.
>
> Create `julia/` at project root with `Project.toml` specifying dependencies: `E4ST`, `JuMP`, `HiGHS`, `CSV`, `DataFrames`, `Graphs`, `Arrow`, `JSON3`.
>
> Write `julia/build_e4st_case.jl` that:
>
> 1. Reads `network_metadata.json` and uses `island_filter_min_nodes` to filter the network — only include buses belonging to components at or above that threshold. Print how many buses and MW are retained vs filtered.
>
> 2. Constructs the branch impedance table. HIFLD/OSM gives voltage and length but not reactance. Use the standard planning assumption: reactance = (resistance_per_mile × length_miles) in per-unit on a 100 MVA base, where resistance_per_mile is 0.3 pu/100 miles for 345 kV and below, 0.2 for 500 kV, 0.15 for 765 kV. Write these assumptions as named constants at the top of the file and document them in `julia/README.md` — they need to appear verbatim in your methods section.
>
> 3. Builds the E4ST `Case` struct with buses, branches, and generators from `generators_with_costs.parquet` filtered to `in_giant_component == true`.
>
> 4. Runs a feasibility check — verify the case has no islanded load buses, no negative capacities, no missing slack bus. Print a structured validation report.
>
> 5. Saves the validated case to `data/processed/e4st_cases/baseline_case.arrow` for fast reloading in the scenario runner.
>
> Write `julia/README.md` documenting: impedance assumptions with citations, island filter rationale, solver choice, and how to add a new scenario.

---

**Session 4 — Scenario runner + baseline solve**

> Read `julia/build_e4st_case.jl` and `data/processed/e4st_cases/baseline_case.arrow` before writing any code.
>
> Write `julia/run_scenario.jl` that accepts a TOML config path as a command-line argument and:
>
> 1. Loads the baseline case from Arrow.
> 2. Reads the scenario TOML and applies its policy perturbations to the case. Supported perturbation types: `carbon_price_per_ton` (adds a $/MWh adder to each generator proportional to its emissions rate), `renewable_portfolio_standard` (adds a minimum renewable generation constraint as a fraction of total load), `capacity_retirement` (removes specified generators by technology and BA).
> 3. Calls `solve!(case)` via HiGHS.
> 4. Writes results to `data/processed/e4st_results/{scenario_name}/` as three Parquet files: `lmp.parquet` (bus-level locational marginal prices), `dispatch.parquet` (generator-level output by hour), `investment.parquet` (capacity additions/retirements if endogenous investment is enabled).
>
> Write three scenario TOML files:
> - `julia/scenarios/baseline.toml` — no policy perturbations, 2023 cost parameters
> - `julia/scenarios/carbon_tax_50.toml` — $50/ton CO2 carbon price
> - `julia/scenarios/ces_80pct.toml` — 80% clean energy standard
>
> Run the baseline scenario first. Sanity check: CISO mean LMP should exceed MISO mean LMP (west coast congestion premium). Print mean LMP by the top 10 BAs. If the baseline does not solve or the LMP sanity check fails, pause and print the full solver diagnostic before attempting other scenarios.
>
> Write `julia/run_all_scenarios.sh` — a shell script that runs all three scenarios sequentially, with a SLURM job array comment block at the top showing how to parallelize on a cluster when ready.

---

**Session 5 — Visualization notebooks**

> Read all Parquet files in `data/processed/e4st_results/` and `data/processed/network_metadata.json` before writing any code. Also read notebooks 01 and 04 to match the existing Folium map style.
>
> Implement three notebooks:
>
> `06_lmp_map.ipynb` — Choropleth of mean nodal LMP over BA territories using `ba_territories.geojson`. One Folium FeatureGroup per scenario so scenarios are toggleable via LayerControl. Add a second layer showing LMP standard deviation as a marker size — high variance buses are congestion hotspots worth annotating. Color scale should be perceptually uniform (use colorbrewer YlOrRd). Include a legend with $/MWh values.
>
> `07_dispatch_viz.ipynb` — Two panels. First: stacked area chart of hourly generation by fuel type for the baseline year, using matplotlib with the same fuel color scheme as notebook 01. Second: a heatmap (hours × BAs) of renewable penetration fraction — this shows which BAs are curtailing and when. Save both as `data/processed/figures/dispatch_baseline.png` at 300 DPI for paper inclusion.
>
> `08_scenario_compare.ipynb` — Side-by-side delta maps for each scenario vs baseline: delta LMP ($/MWh change), delta emissions (tons CO2 change), delta capacity (MW added/retired by technology). Use diverging color scales centered at zero. Add a summary statistics table below each map. This notebook is the primary results figure for the paper — make the layout publication-ready with a consistent color scheme and axis labels.
>
> All three notebooks should read from `data/processed/e4st_results/` and never recompute anything that Julia already computed. Python's role in this layer is visualization only.

---

## One thing to carry forward into every session

Before starting each session, tell Claude Code to read `data/processed/network_metadata.json` first. As that file accumulates keys across sessions (island filter threshold, giant component size, solver status, scenario run timestamps), it becomes the project's shared memory — a single place that records every structural decision made about the network. By session 5 it will also serve as the skeleton of your methods section.