# ============================================================
#  run_scenario.jl  —  NODAL DC OPF scenario runner
#
#  Reads the 494-bus nodal baseline case built by build_nodal_case.jl,
#  applies TOML-specified perturbations, solves a linearised DC OPF
#  via HiGHS + JuMP, extracts bus-level LMPs from nodal power-balance
#  constraint duals, and writes results to:
#    data/processed/e4st_results/{scenario_name}/
#
#  Usage (from project root):
#    julia --project=julia julia/run_scenario.jl julia/scenarios/baseline.toml
#
#  Supported TOML keys (all optional; see julia/scenarios/ for examples):
#    scenario_name               — string identifier (default: TOML filename stem)
#    carbon_price_per_ton        — $/ton; adds carbon_price×emissions_rate to MC
#    renewable_portfolio_standard — fraction in [0,1]; minimum clean share of load
#    [[capacity_retirement]]     — array of {technology, ba_code} pairs to drop
# ============================================================

using JSON3, DataFrames, Arrow, JuMP, HiGHS, Parquet2, TOML
using Printf, Statistics, Dates, OrderedCollections

# ── Named emission-rate constants (ton CO₂/MWh) ──────────────────────────────
# Per-user specification; match EPA eGRID median heat rates.
const EMIS_COAL_TON_PER_MWH  = 0.98   # Conventional Steam Coal, Coal IGCC, Petroleum Coke
const EMIS_NG_CC_TON_PER_MWH = 0.40   # Natural Gas Fired Combined Cycle
const EMIS_NG_CT_TON_PER_MWH = 0.55   # Combustion Turbine, ICE, Steam Turbine, CAES, other NG
const EMIS_OIL_TON_PER_MWH   = 0.75   # Petroleum Liquids

# Technology string → emission rate (ton CO₂/MWh)
# Keys are the exact `technology` values present in baseline_generators.arrow.
const TECHNOLOGY_EMISSIONS = Dict{String,Float64}(
    # ── Coal ──────────────────────────────────────────────────────────────────
    "Conventional Steam Coal"                     => EMIS_COAL_TON_PER_MWH,
    "Coal Integrated Gasification Combined Cycle" => EMIS_COAL_TON_PER_MWH,
    "Petroleum Coke"                              => EMIS_COAL_TON_PER_MWH,
    # ── Natural Gas — Combined Cycle ──────────────────────────────────────────
    "Natural Gas Fired Combined Cycle"            => EMIS_NG_CC_TON_PER_MWH,
    # ── Natural Gas — CT / peaker / other ─────────────────────────────────────
    "Natural Gas Fired Combustion Turbine"        => EMIS_NG_CT_TON_PER_MWH,
    "Natural Gas Internal Combustion Engine"      => EMIS_NG_CT_TON_PER_MWH,
    "Natural Gas Steam Turbine"                   => EMIS_NG_CT_TON_PER_MWH,
    "Natural Gas with Compressed Air Storage"     => EMIS_NG_CT_TON_PER_MWH,
    "Other Natural Gas"                           => EMIS_NG_CT_TON_PER_MWH,
    "Other Gases"                                 => EMIS_NG_CT_TON_PER_MWH,
    # ── Oil ───────────────────────────────────────────────────────────────────
    "Petroleum Liquids"                           => EMIS_OIL_TON_PER_MWH,
    # ── Zero-emission technologies ────────────────────────────────────────────
    "Nuclear"                                     => 0.0,
    "Conventional Hydroelectric"                  => 0.0,
    "Hydroelectric Pumped Storage"                => 0.0,
    "Onshore Wind Turbine"                        => 0.0,
    "Offshore Wind Turbine"                       => 0.0,
    "Solar Photovoltaic"                          => 0.0,
    "Solar Thermal with Energy Storage"           => 0.0,
    "Solar Thermal without Energy Storage"        => 0.0,
    "Batteries"                                   => 0.0,
    "Flywheels"                                   => 0.0,
    "Geothermal"                                  => 0.0,
    "Landfill Gas"                                => 0.0,
    "Municipal Solid Waste"                       => 0.0,
    "Wood/Wood Waste Biomass"                     => 0.0,
    "Other Waste Biomass"                         => 0.0,
    "All Other"                                   => 0.0,
)

# Technologies classified as zero-emissions for RPS purposes
const ZERO_EMISSIONS_TECHNOLOGIES = Set{String}(
    k for (k, v) in TECHNOLOGY_EMISSIONS if v == 0.0
)

# ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = dirname(@__DIR__)
const PROCESSED    = joinpath(PROJECT_ROOT, "data", "processed")
const CASES_DIR    = joinpath(PROCESSED, "e4st_cases")
const RESULTS_ROOT = joinpath(PROCESSED, "e4st_results")
const META_PATH    = joinpath(PROCESSED, "network_metadata.json")

# =============================================================================
# STEP 1 — Load baseline case
# =============================================================================

function load_baseline(cfg_path::String)
    println("=" ^ 62)
    println("STEP 1 — Load baseline case")
    println("=" ^ 62)

    # Validate metadata
    meta = open(META_PATH) do io JSON3.read(io, Dict{String,Any}) end
    ec   = meta["e4st_case"]
    if String(ec["status"]) != "built"
        error("e4st_case.status = \"$(ec["status"])\" — run build_nodal_case.jl first")
    end
    slack_bus_id = Int(ec["slack_bus_id"])
    @printf("  e4st_case.status:              %s  ✓\n",     ec["status"])
    @printf("  n_buses_retained:              %d\n",         ec["n_buses_retained"])
    @printf("  n_generators_retained:         %d\n",         ec["n_generators_retained"])
    @printf("  slack_bus_id:                  %d  (%s)\n",   slack_bus_id, ec["slack_bus_ba"])
    println()

    buses    = DataFrame(Arrow.Table(joinpath(CASES_DIR, "baseline_case.arrow")))
    branches = DataFrame(Arrow.Table(joinpath(CASES_DIR, "baseline_branches.arrow")))
    gens     = DataFrame(Arrow.Table(joinpath(CASES_DIR, "baseline_generators.arrow")))

    # Coerce to concrete types (Arrow may return chain/dict-encoded columns)
    buses[!, :bus_id]         = Int.(buses.bus_id)
    buses[!, :ba_code]        = String.(buses.ba_code)
    buses[!, :load_mw_scaled] = Float64.(buses.load_mw_scaled)

    branches[!, :from_bus]     = Int.(branches.from_bus)
    branches[!, :to_bus]       = Int.(branches.to_bus)
    branches[!, :reactance_pu] = Float64.(branches.reactance_pu)
    branches[!, :thermal_mw]   = Float64.(branches.thermal_mw)

    gens[!, :bus_id]               = Int.(gens.bus_id)
    gens[!, :technology]           = String.(gens.technology)
    gens[!, :capacity_mw]          = Float64.(coalesce.(gens.capacity_mw, 0.0))
    gens[!, :marginal_cost_per_mwh] = Float64.(coalesce.(gens.marginal_cost_per_mwh, 0.0))

    # Derive ba_code for generators from bus table (not stored in Arrow file)
    bus_ba = Dict{Int,String}(r.bus_id => r.ba_code for r in eachrow(buses))
    gens[!, :ba_code] = String[get(bus_ba, r.bus_id, "UNKNOWN") for r in eachrow(gens)]

    # Add emissions rate column (used in perturbation step and output)
    gens[!, :emissions_rate_ton_per_mwh] = Float64[
        get(TECHNOLOGY_EMISSIONS, r.technology, 0.0) for r in eachrow(gens)
    ]

    @printf("  baseline_case.arrow:       %d buses\n",    nrow(buses))
    @printf("  baseline_branches.arrow:   %d branches\n", nrow(branches))
    @printf("  baseline_generators.arrow: %d generators (%.1f GW)\n",
            nrow(gens), sum(gens.capacity_mw) / 1e3)
    @printf("  Total load (scaled):       %.1f GW\n",
            sum(buses.load_mw_scaled) / 1e3)

    return buses, branches, gens, slack_bus_id, meta
end

# =============================================================================
# STEP 2 — Parse TOML and apply perturbations
# =============================================================================

function apply_perturbations!(gens::DataFrame, buses::DataFrame, cfg::Dict)
    println()
    println("=" ^ 62)
    println("STEP 2 — Apply scenario perturbations")
    println("=" ^ 62)

    applied = String[]

    # ── 1. Carbon price ───────────────────────────────────────────────────────
    if haskey(cfg, "carbon_price_per_ton")
        price    = Float64(cfg["carbon_price_per_ton"])
        adders   = price .* gens.emissions_rate_ton_per_mwh
        gens[!, :marginal_cost_per_mwh] = gens.marginal_cost_per_mwh .+ adders
        n_affected = count(x -> x > 0.0, adders)
        @printf("  carbon_price_per_ton = %.1f \$/ton\n", price)
        @printf("  → %d generators received MC adder (%.2f–%.2f \$/MWh per generator)\n",
                n_affected, minimum(adders[adders .> 0.0]), maximum(adders))
        push!(applied, @sprintf("carbon_price_per_ton=%.1f", price))
    end

    # ── 2. Capacity retirement ────────────────────────────────────────────────
    if haskey(cfg, "capacity_retirement")
        retirements = cfg["capacity_retirement"]
        # Normalise: single dict → wrap in vector
        if retirements isa Dict
            retirements = [retirements]
        end
        total_n  = 0
        total_mw = 0.0
        for pair in retirements
            tech = String(pair["technology"])
            ba   = get(pair, "ba_code", "")
            mask = isempty(ba) ?
                   [r.technology == tech for r in eachrow(gens)] :
                   [r.technology == tech && r.ba_code == ba for r in eachrow(gens)]
            n_ret  = sum(mask)
            mw_ret = sum(gens.capacity_mw[mask])
            total_n  += n_ret
            total_mw += mw_ret
            @printf("  capacity_retirement: technology=\"%s\"%s → %d generators (%.1f MW)\n",
                    tech, isempty(ba) ? "" : " ba_code=\"$ba\"", n_ret, mw_ret)
            filter!(r -> !(r.technology == tech && (isempty(ba) || r.ba_code == ba)), gens)
        end
        @printf("  Total retired: %d generators, %.1f MW\n", total_n, total_mw)
        push!(applied, "capacity_retirement")
    end

    # ── 3. RPS — recorded here; constraint added in OPF ───────────────────────
    if haskey(cfg, "renewable_portfolio_standard")
        rps = Float64(cfg["renewable_portfolio_standard"])
        total_load_mw = sum(buses.load_mw_scaled)
        clean_cap_mw  = sum(r.capacity_mw for r in eachrow(gens)
                            if r.technology in ZERO_EMISSIONS_TECHNOLOGIES; init=0.0)
        @printf("  renewable_portfolio_standard = %.0f%%\n", rps * 100)
        @printf("  → Required clean dispatch:   %.1f GW (= %.0f%% × %.1f GW load)\n",
                rps * total_load_mw / 1e3, rps * 100, total_load_mw / 1e3)
        @printf("  → Available clean capacity:  %.1f GW\n", clean_cap_mw / 1e3)
        if clean_cap_mw < rps * total_load_mw
            println("  ⚠  WARNING: clean capacity ($(round(clean_cap_mw/1e3, digits=1)) GW) " *
                    "< RPS requirement ($(round(rps*total_load_mw/1e3, digits=1)) GW) — " *
                    "solver will likely return INFEASIBLE")
        end
        push!(applied, @sprintf("rps=%.0fpct", rps * 100))
    end

    println()
    if isempty(applied)
        println("  (no perturbations — baseline parameters)")
    else
        println("  Perturbation summary: ", join(applied, "  |  "))
    end

    return gens
end

# =============================================================================
# STEP 3 — Formulate and solve DC OPF
# =============================================================================

"""
Solve a single-period linearised DC OPF.

Decision variables:
  p[i]   — generator dispatch (MW), bounded [0, capacity_mw[i]]
  θ[j]   — bus voltage angle (radians), unconstrained except slack

Objective:  min  Σ marginal_cost_per_mwh[i] × p[i]

Constraints:
  Nodal power balance (one per bus):
    Σ p[i at j]  −  load_mw[j]  =  Σ_{l ∈ inc(j)} (θ[j] − θ[other]) / x_l
  Branch thermal limits (two inequalities per branch):
    −thermal_mw[l] × x_l  ≤  θ[from_l] − θ[to_l]  ≤  thermal_mw[l] × x_l
  Slack bus:
    θ[slack_pos] = 0
  RPS (optional):
    Σ p[i] for zero-emissions i  ≥  rps_fraction × Σ load_mw

LMP at bus j = dual(nodal_balance_con[j])  [dobj*/dload_j, \$/MWh]

Returns (model, p_vals, θ_vals, lmp_vals, obj_val) on success.
Halts with exit(1) on infeasible/unbounded.
"""
function solve_opf(buses::DataFrame, branches::DataFrame, gens::DataFrame,
                   slack_bus_id::Int, cfg::Dict)

    println()
    println("=" ^ 62)
    println("STEP 3 — DC OPF solve")
    println("=" ^ 62)

    n_bus = nrow(buses)
    n_br  = nrow(branches)
    n_gen = nrow(gens)

    # ── Build bus-position index (1-indexed, sorted by bus_id) ────────────────
    sorted_bus_ids = sort(buses.bus_id)
    bus_pos = Dict{Int,Int}(bid => j for (j, bid) in enumerate(sorted_bus_ids))

    # Ordered load_mw array aligned with bus_pos
    bus_load_mw = Float64[
        buses.load_mw_scaled[findfirst(==(bid), buses.bus_id)]
        for bid in sorted_bus_ids
    ]

    # Generator → bus position
    gen_bus_pos = Int[bus_pos[r.bus_id] for r in eachrow(gens)]

    # bus_pos → list of generator indices
    bus_gen_map = [Int[] for _ in 1:n_bus]
    for i in 1:n_gen
        push!(bus_gen_map[gen_bus_pos[i]], i)
    end

    # Branch incidence: for each bus j, list of (other_bus_pos, susceptance=1/x, thermal_mw)
    # Same formula for from-side and to-side: contribution = (θ_j - θ_other) / x_l
    incident = [Tuple{Int,Float64,Float64}[] for _ in 1:n_bus]
    for l in 1:n_br
        fi = bus_pos[Int(branches.from_bus[l])]
        ti = bus_pos[Int(branches.to_bus[l])]
        B  = 1.0 / Float64(branches.reactance_pu[l])
        th = Float64(branches.thermal_mw[l])
        push!(incident[fi], (ti, B, th))
        push!(incident[ti], (fi, B, th))
    end

    slack_pos = bus_pos[slack_bus_id]

    # ── Pre-check: ensure thermal limits permit serving each bus's load ───────
    # The synthetic network's thermal limits are calibrated for interregional
    # flows (capacity_headroom_mult = 1.25 × EIA-930 observed flows).  Some
    # buses aggregate very large loads whose Voronoi cells span entire metro
    # areas; the incident branches may not have enough thermal capacity to
    # deliver the full load.  Rather than fail with an opaque INFEASIBLE, we
    # compute the minimum uniform multiplier needed for per-bus feasibility and
    # apply it with 10% headroom.  This ensures a solvable LP while preserving
    # relative congestion structure.
    gen_cap_at = Float64[
        sum(gens.capacity_mw[i] for i in bus_gen_map[j]; init=0.0)
        for j in 1:n_bus
    ]
    th_sum_at = Float64[
        sum(th for (_, _, th) in incident[j]; init=0.0)
        for j in 1:n_bus
    ]
    # Minimum multiplier so every bus can be served (local gen + scaled imports ≥ load)
    min_mult_req = maximum(
        (bus_load_mw[j] - gen_cap_at[j]) / th_sum_at[j]
        for j in 1:n_bus
        if bus_load_mw[j] > gen_cap_at[j] && th_sum_at[j] > 1e-6;
        init=1.0
    )
    thermal_mult = min_mult_req > 1.001 ? min_mult_req * 1.1 : 1.0

    if thermal_mult > 1.0
        n_bottleneck = count(
            j -> bus_load_mw[j] > gen_cap_at[j] && th_sum_at[j] < bus_load_mw[j] - gen_cap_at[j],
            1:n_bus)
        println("  NOTE: thermal_mult=$(round(thermal_mult, digits=2))x applied " *
                "($n_bottleneck bottleneck buses; limits calibrated for " *
                "interregional flows, not local delivery)")
    else
        println("  thermal limits: no scaling needed (all buses locally feasible)")
    end

    # ── Build JuMP model ──────────────────────────────────────────────────────
    model = Model(HiGHS.Optimizer)
    set_optimizer_attribute(model, "output_flag",   false)
    set_optimizer_attribute(model, "presolve",      "on")
    set_optimizer_attribute(model, "solver",        "simplex")

    @variable(model, p[i=1:n_gen] >= 0)
    @variable(model, θ[1:n_bus])

    for i in 1:n_gen
        set_upper_bound(p[i], gens.capacity_mw[i])
    end

    @objective(model, Min,
        sum(gens.marginal_cost_per_mwh[i] * p[i] for i in 1:n_gen))

    # Slack bus: angle = 0
    @constraint(model, θ[slack_pos] == 0.0)

    # Thermal limits: expressed as angle-difference bounds to avoid auxiliary vars
    # thermal_mult > 1.0 only when original limits block load delivery (see above)
    for l in 1:n_br
        fi  = bus_pos[Int(branches.from_bus[l])]
        ti  = bus_pos[Int(branches.to_bus[l])]
        x_l = Float64(branches.reactance_pu[l])
        th  = Float64(branches.thermal_mw[l]) * thermal_mult
        @constraint(model, θ[fi] - θ[ti] <=  th * x_l)
        @constraint(model, θ[fi] - θ[ti] >= -th * x_l)
    end

    # Nodal power balance (equality; duals = LMPs)
    # Formulation: gen_at_j - net_export_from_j = load_j
    # net_export = Σ_{l ∈ incident(j)} (θ_j - θ_other) / x_l
    # ↓ rearranged as a single AffExpr lhs on the left:
    # lhs = Σ p[i at j]  -  Σ B*(θ_j - θ_other)  ==  load_j
    balance_con = Vector{ConstraintRef}(undef, n_bus)
    for j in 1:n_bus
        lhs = AffExpr(0.0)
        # Generation terms
        for i in bus_gen_map[j]
            add_to_expression!(lhs, 1.0, p[i])
        end
        # Flow terms: subtract net export from lhs
        for (k, B, _) in incident[j]
            add_to_expression!(lhs, -B, θ[j])   # −B·θ_j
            add_to_expression!(lhs,  B, θ[k])   # +B·θ_other
        end
        balance_con[j] = @constraint(model, lhs == bus_load_mw[j])
    end

    # RPS constraint (optional)
    rps_con = nothing
    if haskey(cfg, "renewable_portfolio_standard")
        rps_frac      = Float64(cfg["renewable_portfolio_standard"])
        total_load_mw = sum(bus_load_mw)
        clean_idxs    = [i for i in 1:n_gen
                         if gens.technology[i] in ZERO_EMISSIONS_TECHNOLOGIES]
        @constraint(model,
            sum(p[i] for i in clean_idxs; init=AffExpr(0.0)) >= rps_frac * total_load_mw)
        @printf("  RPS constraint added: %.0f%% × %.1f GW = %.1f GW clean minimum\n",
                rps_frac * 100, total_load_mw / 1e3, rps_frac * total_load_mw / 1e3)
    end

    # ── Solve ──────────────────────────────────────────────────────────────────
    @printf("  Model:  %d vars (%d gen + %d angle)  ×  %d constraints\n",
            n_gen + n_bus, n_gen, n_bus, 1 + 2*n_br + n_bus +
            (haskey(cfg, "renewable_portfolio_standard") ? 1 : 0))
    t_solve = @elapsed optimize!(model)
    ts = termination_status(model)
    @printf("  Status: %-20s  solve time: %.1f s\n", ts, t_solve)

    # Check feasibility — halt and print diagnostics if not OPTIMAL
    if ts != MOI.OPTIMAL
        println()
        println("╔" * "═"^60 * "╗")
        println("║  SOLVER FAILED — ", rpad(string(ts), 42), "║")
        println("╠" * "═"^60 * "╣")
        if ts in (MOI.INFEASIBLE, MOI.INFEASIBLE_OR_UNBOUNDED)
            println("║  INFEASIBLE.  Most likely causes:                          ║")
            println("║    • RPS/CES target exceeds installed clean capacity        ║")
            println("║    • Capacity retirement removed a must-run generator       ║")
            println("║    • Total generation capacity < total load                 ║")
            println("║                                                             ║")
            println("║  HiGHS primal/dual status:                                  ║")
            @printf("║    primal_status = %-40s║\n", primal_status(model))
            @printf("║    dual_status   = %-40s║\n", dual_status(model))
        else
            @printf("║    primal_status = %-40s║\n", primal_status(model))
            @printf("║    dual_status   = %-40s║\n", dual_status(model))
        end
        println("╚" * "═"^60 * "╝")
        println()
        println("  Halting — do not write partial results.")
        println("  Diagnose before running other scenarios.")
        exit(1)
    end

    obj_val  = objective_value(model)
    p_vals   = Float64[value(p[i])  for i in 1:n_gen]
    θ_vals   = Float64[value(θ[j])  for j in 1:n_bus]
    lmp_vals = Float64[dual(balance_con[j]) for j in 1:n_bus]

    @printf("  Objective value:  %.2f M\$/period\n", obj_val / 1e6)
    @printf("  Total dispatch:   %.1f GW  (load = %.1f GW)\n",
            sum(p_vals) / 1e3, sum(bus_load_mw) / 1e3)

    return sorted_bus_ids, p_vals, θ_vals, lmp_vals, obj_val
end

# =============================================================================
# STEP 4 — Compute and print LMPs
# =============================================================================

function compute_and_print_lmps(buses::DataFrame, lmp_vals::Vector{Float64},
                                 sorted_bus_ids::Vector{Int})
    println()
    println("=" ^ 62)
    println("STEP 4 — LMP summary")
    println("=" ^ 62)

    # Build bus_id → LMP lookup (sorted_bus_ids is the index mapping from solve_opf)
    lmp_by_bus = Dict{Int,Float64}(sorted_bus_ids[j] => lmp_vals[j]
                                   for j in eachindex(sorted_bus_ids))

    # Align LMPs to buses DataFrame order
    bus_lmps = Float64[lmp_by_bus[r.bus_id] for r in eachrow(buses)]

    mean_lmp = mean(bus_lmps)
    min_lmp  = minimum(bus_lmps)
    max_lmp  = maximum(bus_lmps)
    min_bus  = buses.bus_id[argmin(bus_lmps)]
    max_bus  = buses.bus_id[argmax(bus_lmps)]

    @printf("  Mean LMP (all buses): %.2f \$/MWh\n",  mean_lmp)
    @printf("  Min  LMP:             %.2f \$/MWh  (bus %d)\n", min_lmp, min_bus)
    @printf("  Max  LMP:             %.2f \$/MWh  (bus %d)\n", max_lmp, max_bus)
    println()

    # Load-weighted mean LMP by BA
    ba_load_sum = Dict{String,Float64}()
    ba_lmp_sum  = Dict{String,Float64}()
    for (i, row) in enumerate(eachrow(buses))
        ba = row.ba_code
        ba_load_sum[ba] = get(ba_load_sum, ba, 0.0) + row.load_mw_scaled
        ba_lmp_sum[ba]  = get(ba_lmp_sum,  ba, 0.0) + row.load_mw_scaled * bus_lmps[i]
    end
    # Only include BAs with positive load (avoids 0/0 = NaN for zero-load buses)
    ba_codes_with_load = sort([ba for ba in keys(ba_load_sum) if ba_load_sum[ba] > 0.0])
    lmp_by_ba_mw = Dict{String,Float64}(
        ba => ba_lmp_sum[ba] / ba_load_sum[ba] for ba in ba_codes_with_load
    )

    # Full LMP-by-BA table (all BAs with non-zero load), sorted descending
    sorted_bas = sort(ba_codes_with_load, by=b -> lmp_by_ba_mw[b], rev=true)
    println("  Load-weighted mean LMP by BA (all $(length(sorted_bas)) BAs with load, descending):")
    println("  " * "─"^44)
    @printf("  %-8s  %12s  %10s\n", "BA", "Mean LMP \$/MWh", "Load MW")
    println("  " * "─"^44)
    for ba in sorted_bas
        @printf("  %-8s  %12.2f  %10.1f\n",
                ba, lmp_by_ba_mw[ba], ba_load_sum[ba])
    end
    println("  " * "─"^44)
    println("  ($(length(ba_load_sum) - length(ba_codes_with_load)) BAs had zero load in retained network — excluded)")

    # CISO vs MISO sanity check
    println()
    ciso_lmp = get(lmp_by_ba_mw, "CISO", nothing)
    miso_lmp = get(lmp_by_ba_mw, "MISO", nothing)
    lmp_sanity_pass = false
    if ciso_lmp !== nothing && miso_lmp !== nothing
        @printf("  Sanity check: CISO mean LMP = %.2f \$/MWh\n", ciso_lmp)
        @printf("                MISO mean LMP = %.2f \$/MWh\n", miso_lmp)
        if ciso_lmp > miso_lmp
            println("  ✓ CISO > MISO (California gas-price premium confirmed)")
            lmp_sanity_pass = true
        else
            println("  ✗ WARNING: CISO ≤ MISO — flag for manual review")
            lmp_sanity_pass = false
        end
    else
        bas_present = join(sort(collect(keys(lmp_by_ba_mw))), ", ")
        println("  Sanity check: CISO or MISO not present in retained buses")
        println("  BAs present: $bas_present")
        lmp_sanity_pass = false
    end

    return bus_lmps, lmp_by_ba_mw, lmp_sanity_pass
end

# =============================================================================
# STEP 5 — Write results
# =============================================================================

function write_results(buses::DataFrame, gens::DataFrame,
                        sorted_bus_ids::Vector{Int},
                        p_vals::Vector{Float64},
                        bus_lmps::Vector{Float64},
                        lmp_by_ba::Dict{String,Float64},
                        lmp_sanity_pass::Bool,
                        obj_val::Float64,
                        scenario_name::String,
                        meta::Dict{String,Any})
    println()
    println("=" ^ 62)
    println("STEP 5 — Write results  →  $(joinpath(RESULTS_ROOT, scenario_name))/")
    println("=" ^ 62)

    out_dir = mkpath(joinpath(RESULTS_ROOT, scenario_name))

    # ── lmp.parquet ───────────────────────────────────────────────────────────
    lmp_df = DataFrame(
        bus_id      = buses.bus_id,
        ba_code     = buses.ba_code,
        lmp_per_mwh = bus_lmps,
        load_mw     = buses.load_mw_scaled,
    )
    lmp_path = joinpath(out_dir, "lmp.parquet")
    Parquet2.writefile(lmp_path, lmp_df)
    @printf("  lmp.parquet:      %d rows  (%.1f KB)\n",
            nrow(lmp_df), filesize(lmp_path) / 1024)

    # ── dispatch.parquet ──────────────────────────────────────────────────────
    emissions_ton = p_vals .* gens.emissions_rate_ton_per_mwh
    dispatch_df = DataFrame(
        generator_id          = gens.generator_id,
        bus_id                = gens.bus_id,
        ba_code               = gens.ba_code,
        technology            = gens.technology,
        p_dispatch_mw         = p_vals,
        marginal_cost_per_mwh = gens.marginal_cost_per_mwh,
        emissions_ton         = emissions_ton,
    )
    dispatch_path = joinpath(out_dir, "dispatch.parquet")
    Parquet2.writefile(dispatch_path, dispatch_df)
    total_emis = sum(emissions_ton)
    @printf("  dispatch.parquet: %d rows  (%.1f KB)  total_emissions=%.1f ton/h\n",
            nrow(dispatch_df), filesize(dispatch_path) / 1024, total_emis)

    # ── summary.json ──────────────────────────────────────────────────────────
    mean_lmp   = mean(bus_lmps)
    solver_status = "OPTIMAL"

    summary = OrderedDict{String,Any}(
        "scenario_name"        => scenario_name,
        "objective_value"      => obj_val,
        "mean_lmp"             => mean_lmp,
        "lmp_by_ba"            => Dict{String,Float64}(lmp_by_ba),
        "lmp_sanity_check_pass" => lmp_sanity_pass,
        "total_emissions_ton"  => total_emis,
        "solver_status"        => solver_status,
        "timestamp"            => string(now(UTC)),
    )
    summary_path = joinpath(out_dir, "summary.json")
    open(summary_path, "w") do io
        JSON3.pretty(io, summary)
    end
    @printf("  summary.json:     %.1f KB\n", filesize(summary_path) / 1024)

    # ── Update network_metadata.json  (append to scenario_runs list) ──────────
    run_entry = Dict{String,Any}(
        "scenario"  => scenario_name,
        "status"    => solver_status,
        "mean_lmp"  => round(mean_lmp, digits=2),
        "timestamp" => string(now(UTC)),
    )
    runs = get(meta, "scenario_runs", Any[])
    # Convert to mutable Vector
    runs_list = collect(Any, runs)
    push!(runs_list, run_entry)
    meta["scenario_runs"] = runs_list

    open(META_PATH, "w") do io
        JSON3.pretty(io, meta)
    end
    println()
    @printf("  Updated network_metadata.json  (scenario_runs now has %d entries)\n",
            length(runs_list))
end

# =============================================================================
# MAIN
# =============================================================================

function main()
    if length(ARGS) < 1
        println(stderr, "Usage: julia --project=julia julia/run_scenario.jl <scenario.toml>")
        exit(1)
    end

    toml_path = ARGS[1]
    if !isfile(toml_path)
        println(stderr, "Error: TOML file not found: $toml_path")
        exit(1)
    end

    cfg           = TOML.parsefile(toml_path)
    scenario_name = get(cfg, "scenario_name",
                        first(splitext(basename(toml_path))))

    println("=" ^ 62)
    println("E4ST Nodal Scenario Runner")
    @printf("  Scenario : %s\n", scenario_name)
    @printf("  Config   : %s\n", toml_path)
    @printf("  Output   : %s/\n", joinpath(RESULTS_ROOT, scenario_name))
    println("=" ^ 62)

    # ── Step 1: load ──────────────────────────────────────────────────────────
    buses, branches, gens, slack_bus_id, meta = load_baseline(toml_path)

    # ── Step 2: perturbations (modifies gens in-place on a copy) ─────────────
    gens_mod = copy(gens)
    apply_perturbations!(gens_mod, buses, cfg)

    # ── Step 3: solve ─────────────────────────────────────────────────────────
    sorted_bus_ids, p_vals, θ_vals, lmp_vals, obj_val =
        solve_opf(buses, branches, gens_mod, slack_bus_id, cfg)

    # ── Step 4: LMPs ──────────────────────────────────────────────────────────
    bus_lmps, lmp_by_ba, lmp_sanity_pass =
        compute_and_print_lmps(buses, lmp_vals, sorted_bus_ids)

    # ── Step 5: write ──────────────────────────────────────────────────────────
    write_results(buses, gens_mod, sorted_bus_ids, p_vals, bus_lmps,
                  lmp_by_ba, lmp_sanity_pass, obj_val, scenario_name, meta)

    println()
    println("=" ^ 62)
    println("Done.  Scenario $scenario_name complete.")
    println("=" ^ 62)
end

main()
