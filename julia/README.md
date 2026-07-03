# Julia — E4ST Case Builders

Two case-building scripts live in this directory:

| Script | Model type | Output |
|---|---|---|
| `build_e4st_case.jl` | Zonal copper-plate (67 BAs) | `zonal_buses.arrow`, `zonal_generators.arrow` |
| `build_nodal_case.jl` | Nodal DC power flow (500 buses) | `baseline_case.arrow`, `baseline_branches.arrow`, `baseline_generators.arrow` |

Run from the **project root** (paths break if run inside `julia/`):

```bash
julia --project=julia julia/build_nodal_case.jl
julia --project=julia julia/build_e4st_case.jl
```

Install dependencies once (requires internet and E4ST registry):

```julia
] registry add https://github.com/e4st-dev/E4STRegistry
] instantiate
```

---

## Impedance assumptions

Transmission line reactance for `build_nodal_case.jl` is computed in **per unit on a 100 MVA system base** using:

```
x_pu = REACTANCE_PER_100MI[kV] × length_miles / 100
```

where `length_miles = length_km × 0.621371`.

Named constants (defined at the top of `build_nodal_case.jl` — do not hardcode elsewhere):

| Constant | Value | Voltage class |
|---|---|---|
| `REACTANCE_PER_100MI[115]` | 0.30 pu / 100 mi | 115 kV |
| `REACTANCE_PER_100MI[230]` | 0.25 pu / 100 mi | 230 kV |
| `REACTANCE_PER_100MI[345]` | 0.20 pu / 100 mi | 345 kV |
| `REACTANCE_PER_100MI[500]` | 0.15 pu / 100 mi | 500 kV |
| `REACTANCE_PER_100MI[765]` | 0.10 pu / 100 mi | 765 kV |
| `HVDC_REACTANCE_PU` | 0.001 pu | HVDC ties (see below) |

Voltage classes not in the table (e.g. unlisted intermediate voltages) fall back to the 115 kV coefficient (0.30).

**HVDC detection:** a branch is classified as a DC tie when `is_manual_override = true` AND `voltage_assumed_kv >= 500`. These branches are assigned `HVDC_REACTANCE_PU = 0.001` as a near-zero AC reactance placeholder consistent with lossless DC power flow.

**Precedence rule:** if `reactance_pu` is already populated (non-zero) in `synthetic_branches.geojson`, that value is used directly and the formula is not applied. Recomputation only occurs for branches with a zero or missing `reactance_pu`.

---

## Island filter rationale

`island_filter_min_nodes` is read at runtime from `data/processed/network_metadata.json`; it is not hardcoded. Current value: **50**.

The synthetic 500-bus network was built with explicit bridge injection and density enhancement to guarantee full connectivity, so the island filter will typically retain all 500 buses (one giant component). The filter is implemented defensively — it protects against partial-read edge cases and makes the threshold configurable without code changes.

To raise the threshold (e.g. to study a higher-connectivity sub-network):

```json
// In data/processed/network_metadata.json:
"island_filter_min_nodes": 100
```

Re-run `build_nodal_case.jl`. Buses in components smaller than the threshold are excluded from `baseline_case.arrow` and all downstream scenario runs.

---

## Slack bus selection logic

The slack bus is the retained bus with the highest `generation_cap_mw`. No geographic constraint is applied — this selects the largest generation hub in the retained network, which provides the most numerically stable power-flow reference.

**Wyoming note:** if the selected slack bus is in a Wyoming-adjacent BA (`WACM` or `PACE`), the script prints an explicit warning. All nodal LMPs are measured relative to the slack bus; Wyoming-zone LMPs will be at or near zero by construction, and the economically meaningful quantity is the LMP spread of other zones relative to Wyoming.

To force a specific slack bus (e.g. for a sensitivity run), locate `argmax(retained_buses_df.generation_cap_mw)` in Step 4 of `build_nodal_case.jl` and replace with a hardcoded `findfirst(==(target_id), retained_buses_df.bus_id)`.

---

## How to add a new scenario

A scenario is a modified dispatch run with different policy parameters (e.g. carbon tax, CES constraint). The recommended workflow:

1. **Copy the baseline outputs** to a new subdirectory:
   ```bash
   cp data/processed/e4st_cases/baseline_case.arrow \
      data/processed/e4st_cases/carbon_tax_50_case.arrow
   # likewise for _branches and _generators
   ```

2. **Edit the scenario script** in `julia/scenarios/` (or create one). The scenario script loads the baseline Arrow files, applies parameter overrides (e.g. adds a carbon adder to `marginal_cost_per_mwh`), and passes the modified DataFrames to the E4ST solver.

3. **Run via `run_scenario.jl`**:
   ```bash
   julia --project=julia julia/run_scenario.jl carbon_tax_50
   ```

4. **Record the result** in `data/processed/network_metadata.json` under `scenarios_completed`. The schema for each entry is:
   ```json
   { "name": "carbon_tax_50", "status": "OPTIMAL", "mean_lmp_per_mwh": 48.97 }
   ```

**Scenario-specific constants** (carbon adder $/MWh, CES fraction, etc.) should be defined as named constants at the top of each scenario script — never hardcoded inline. This makes the parameter audit trail explicit and reproducible.

---

## Solver

**HiGHS** is the default LP solver (`HiGHS.jl` + JuMP). It is open-source, freely redistributable (no per-core licence), and consistently competitive with CPLEX/Gurobi on US power-system LP benchmarks. To substitute a commercial solver, replace `using HiGHS` and the optimizer reference in the E4ST model config; no other changes are required.

---

## Methods (paper-ready paragraph)

The nodal dispatch case is built from a 500-bus synthetic transmission network derived from notebook `07_synthetic_topology`. Each synthetic bus aggregates EIA Form 860 generator nameplate capacity and an EIA-930-derived load proxy within its Voronoi cell. Branch reactances are computed in per unit on a 100 MVA system base via $x = r_{100} \cdot \ell / 100$, where $r_{100}$ is a voltage-class coefficient (0.30, 0.25, 0.20, 0.15, and 0.10 pu per 100 miles for 115, 230, 345, 500, and 765 kV lines, respectively) and $\ell$ is the line length in miles; explicit HVDC ties are assigned a near-zero reactance placeholder (0.001 pu). Generator marginal costs combine EIA state-level fuel prices, EIA-923 plant-level heat rates, and NREL ATB 2024 Moderate variable O&M. The island filter retains only connected components with at least `island_filter_min_nodes` buses (current value: 50); the synthetic network is fully connected so no buses are dropped under this threshold. The reference (slack) bus is the retained bus with the highest installed generation capacity. Economic dispatch is solved as a linear program via HiGHS (v1.x) and JuMP within E4ST.
