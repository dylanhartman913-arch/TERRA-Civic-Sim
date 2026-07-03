# ============================================================
#  run_scenarios.jl  —  E4ST v2 policy scenario runner
#
#  Runs three policy scenarios sequentially:
#    1. carbon_tax_50  — $50/ton CO₂ carbon tax (EmissionPrice)
#    2. ira_itc        — IRA investment tax credits (wind/solar/SMR)
#    3. carbon_tax_ira — Carbon tax + IRA combined (primary dissertation scenario)
#
#  For each scenario:
#    - Prints solver status and solve time
#    - Prints total capacity built (MW) by technology and year
#    - Prints Wyoming (WACM + PACE) capacity built by technology
#    - Prints median LMP by BA per model year
#    - Prints total CO₂ emissions by year
#    - Warns if IRA scenario has no Wyoming SMR by y2035
#
#  After all three:
#    - Builds cross-scenario summary table (4 rows: baseline + 3 scenarios)
#    - Saves to data/processed/e4st_results_v2/scenario_summary.csv
#    - Updates network_metadata.json → scenarios_completed
#
#  Usage (from project root):
#    julia --project=julia julia/run_scenarios.jl
#
#  Prerequisites:
#    - Baseline solve complete (data/processed/e4st_results_v2/baseline/ exists)
#    - E4ST inputs in data/processed/e4st_inputs/
#    - Config files in julia/config/ (carbon_tax_50.yml, ira_itc.yml, carbon_tax_ira.yml)
# ============================================================

using E4ST
using HiGHS
using Dates
using Serialization
using JSON3
using Statistics
using CSV
using DataFrames
using Printf

# ─── Paths ────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = dirname(@__DIR__)   # energy-map/ (parent of julia/)
const CONFIG_DIR   = joinpath(PROJECT_ROOT, "julia", "config")
const RESULTS_ROOT = joinpath(PROJECT_ROOT, "data", "processed", "e4st_results_v2")
const META_PATH    = joinpath(PROJECT_ROOT, "data", "processed", "network_metadata.json")
const BUS_CSV      = joinpath(PROJECT_ROOT, "data", "processed", "e4st_inputs", "bus.csv")
const GEN_CSV      = joinpath(PROJECT_ROOT, "data", "processed", "e4st_inputs", "gen.csv")

# ─── Scenario definitions ─────────────────────────────────────────────────────
const SCENARIOS = [
    (name="carbon_tax_50",  yml=joinpath(CONFIG_DIR, "carbon_tax_50.yml")),
    (name="ira_itc",        yml=joinpath(CONFIG_DIR, "ira_itc.yml")),
    (name="carbon_tax_ira", yml=joinpath(CONFIG_DIR, "carbon_tax_ira.yml")),
]

const MODEL_YEARS = ["y2025", "y2030", "y2035"]
const WYOMING_BAS = Set(["WACM", "PACE"])
const TIMEOUT_SEC = 45 * 60  # 45-minute per-scenario watchdog

# ─── Load static inputs (bus→BA mapping, input gen table) ─────────────────────
println("\nLoading static inputs …")
bus_df  = CSV.read(BUS_CSV, DataFrame)   # columns: ref_bus, reg_factor, ba_code, …
gen_df  = CSV.read(GEN_CSV, DataFrame)   # columns: bus_idx, gentype, build_status, emis_co2, …

# bus_idx in gen_df is 0-based bus id; bus row index (1-based) = bus_idx + 1
# bus_df row order matches bus_idx ordering from gen.csv (sequential 0..493)
ba_by_busidx = Dict(i-1 => String(bus_df[i, :ba_code]) for i in 1:nrow(bus_df))

println("  Bus→BA mapping loaded: $(length(ba_by_busidx)) buses")
println("  Input gen table: $(nrow(gen_df)) rows")

# ─── Helper: load and return results data ─────────────────────────────────────
function load_results(out_path::String)
    data_processed_path = joinpath(out_path, "data_processed.jls")
    if !isfile(data_processed_path)
        data_parsed_path = joinpath(out_path, "data_parsed.jls")
        isfile(data_parsed_path) && return deserialize(data_parsed_path)
        error("No results .jls found in $out_path")
    end
    return deserialize(data_processed_path)
end

# ─── Helper: extract scalar from E4ST container ───────────────────────────────
function safe_scalar(v)
    try
        return Float64(v[1,1])
    catch
        try
            return Float64(v)
        catch
            return 0.0
        end
    end
end

# ─── Helper: get scalar from get_table_num, fallback 0.0 ─────────────────────
function safe_get(data, tbl, col, idxs...)
    try
        return Float64(E4ST.get_table_num(data, tbl, col, idxs...))
    catch
        return 0.0
    end
end

# ─── Analysis: capacity built by tech/year ────────────────────────────────────
function capacity_built(data_out, scenario_name::String)
    println("\n  ── Capacity Built (endogenously invested) ──────────────────")

    years_list = E4ST.get_years(data_out)
    nyr        = length(years_list)
    gen_tbl    = E4ST.get_table(data_out, :gen)
    ngen       = nrow(gen_tbl)

    # Collect per-tech per-year built capacity
    # pcap_built[gen_idx, yr_idx] = MW built in that year
    national_by_tech_yr = Dict{String, Vector{Float64}}()
    wyoming_by_tech_yr  = Dict{String, Vector{Float64}}()

    for i in 1:ngen
        gentype      = String(gen_tbl[i, :gentype])
        bus_idx_0    = Int(gen_tbl[i, :bus_idx])  # 0-based
        ba           = get(ba_by_busidx, bus_idx_0, "unknown")
        is_wyoming   = ba in WYOMING_BAS

        if !haskey(national_by_tech_yr, gentype)
            national_by_tech_yr[gentype] = zeros(nyr)
            wyoming_by_tech_yr[gentype]  = zeros(nyr)
        end

        # pcap_built is a 1D SubArray indexed by [yr_idx] — not compatible with get_table_num
        pcap_built_col = try; gen_tbl[i, :pcap_built]; catch; nothing; end
        pcap_built_col === nothing && continue

        for yr_idx in 1:nyr
            mw_built = try
                Float64(pcap_built_col[yr_idx])
            catch
                0.0
            end
            if mw_built > 0.0
                national_by_tech_yr[gentype][yr_idx] += mw_built
                is_wyoming && (wyoming_by_tech_yr[gentype][yr_idx] += mw_built)
            end
        end
    end

    # Print national table
    println("\n  National capacity built (MW) by technology:")
    @printf("  %-16s  %s\n", "Technology", join([@sprintf("%10s", y) for y in years_list], "  "))
    println("  " * "─"^(16 + (nyr * 13)))
    for tech in sort(collect(keys(national_by_tech_yr)))
        vals = national_by_tech_yr[tech]
        if any(v > 0.1 for v in vals)
            @printf("  %-16s  %s\n", tech, join([@sprintf("%10.0f", v) for v in vals], "  "))
        end
    end

    # Print Wyoming table
    wy_total = sum(sum(v) for v in values(wyoming_by_tech_yr))
    println("\n  Wyoming (WACM + PACE) capacity built (MW) by technology:")
    if wy_total < 0.1
        println("  (none)")
    else
        @printf("  %-16s  %s\n", "Technology", join([@sprintf("%10s", y) for y in years_list], "  "))
        println("  " * "─"^(16 + (nyr * 13)))
        for tech in sort(collect(keys(wyoming_by_tech_yr)))
            vals = wyoming_by_tech_yr[tech]
            if any(v > 0.1 for v in vals)
                @printf("  %-16s  %s\n", tech, join([@sprintf("%10.0f", v) for v in vals], "  "))
            end
        end
    end

    # SMR Wyoming check for IRA scenario
    smr_wy_y2035 = get(wyoming_by_tech_yr, "smr", zeros(nyr))[end]
    if occursin("ira", lowercase(scenario_name))
        if smr_wy_y2035 < 1.0
            println("\n  WARNING: IRA scenario — no Wyoming SMR capacity built by y2035")
        else
            @printf("\n  Wyoming SMR y2035: %.0f MW  ✓\n", smr_wy_y2035)
        end
    end

    # Return summary for cross-scenario table
    total_y2035 = sum(get(national_by_tech_yr, t, zeros(nyr))[end]
                      for t in keys(national_by_tech_yr))
    smr_wy_y2035_val = get(wyoming_by_tech_yr, "smr", zeros(nyr))[end]
    return total_y2035, smr_wy_y2035_val
end

# ─── Analysis: median LMP by BA per year ─────────────────────────────────────
function median_lmp_by_ba(data_out)
    println("\n  ── Median LMP by BA (per model year) ──────────────────────")

    years_list = E4ST.get_years(data_out)
    nhr        = E4ST.get_num_hours(data_out)
    nyr        = length(years_list)
    bus_tbl    = E4ST.get_table(data_out, :bus)
    n_bus      = nrow(bus_tbl)
    ba_codes   = String.(bus_tbl.ba_code)

    median_lmp_national = Dict{String, Float64}()

    for (yr_idx, yr) in enumerate(years_list)
        # Collect all bus-hour LMPs for this year
        ba_lmps = Dict{String, Vector{Float64}}()
        for bus_idx in 1:n_bus
            ba = ba_codes[bus_idx]
            !haskey(ba_lmps, ba) && (ba_lmps[ba] = Float64[])
            for hr_idx in 1:nhr
                lmp = safe_get(data_out, :bus, :lmp_elserv, bus_idx, yr_idx, hr_idx)
                push!(ba_lmps[ba], lmp)
            end
        end

        # Compute median per BA
        ba_median = Dict(ba => median(v) for (ba, v) in ba_lmps)
        all_lmps  = vcat(values(ba_lmps)...)
        nat_median = median(all_lmps)
        median_lmp_national[yr] = nat_median

        println("\n  $yr  (national bus-hour median = $(round(nat_median, digits=2)) \$/MWh)")
        sorted_ba = sort(collect(ba_median), by = p -> -p[2])
        @printf("  %-8s  %10s\n", "BA", "Median LMP")
        println("  " * "─"^22)
        # Print top 10 and Wyoming BAs
        shown = Set{String}()
        for (ba, lmp) in sorted_ba[1:min(10, end)]
            @printf("  %-8s  %10.2f\n", ba, lmp)
            push!(shown, ba)
        end
        for ba in ["WACM", "PACE"]
            if haskey(ba_median, ba) && !(ba in shown)
                @printf("  %-8s  %10.2f  (Wyoming)\n", ba, ba_median[ba])
            end
        end
    end

    return median_lmp_national
end

# ─── Analysis: CO₂ emissions by year ─────────────────────────────────────────
function co2_emissions(data_out)
    println("\n  ── CO₂ Emissions by Year ──────────────────────────────────")

    years_list   = E4ST.get_years(data_out)
    nhr          = E4ST.get_num_hours(data_out)
    nyr          = length(years_list)
    hour_weights = E4ST.get_hour_weights(data_out)
    gen_tbl      = E4ST.get_table(data_out, :gen)
    ngen         = nrow(gen_tbl)

    co2_by_year = zeros(nyr)

    for i in 1:ngen
        emis_rate = Float64(gen_tbl[i, :emis_co2])   # short tons / MWh
        emis_rate > 0.0 || continue
        for yr_idx in 1:nyr
            for hr_idx in 1:nhr
                pgen = safe_get(data_out, :gen, :pgen, i, yr_idx, hr_idx)
                w    = hour_weights[hr_idx]
                co2_by_year[yr_idx] += pgen * w * emis_rate  # short tons
            end
        end
    end

    for (yr_idx, yr) in enumerate(years_list)
        @printf("  %s:  %.3f Mt CO₂  (%.0f short tons)\n",
                yr, co2_by_year[yr_idx] / 1e6, co2_by_year[yr_idx])
    end

    return Dict(yr => co2_by_year[i] for (i, yr) in enumerate(years_list))
end

# ─── Main: load baseline results for summary table ───────────────────────────
println("\n" * "=" ^ 62)
println("Loading baseline results for cross-scenario comparison …")
println("=" ^ 62)

baseline_dir = joinpath(RESULTS_ROOT, "baseline")
baseline_subdirs = filter(isdir, readdir(baseline_dir, join=true))
isempty(baseline_subdirs) && error("No baseline results found in $baseline_dir")
baseline_out_path = sort(baseline_subdirs)[end]  # most recent
println("  Baseline results: $baseline_out_path")

baseline_data = load_results(baseline_out_path)
baseline_years = E4ST.get_years(baseline_data)
baseline_nhr   = E4ST.get_num_hours(baseline_data)

# Baseline median LMP
baseline_bus_tbl = E4ST.get_table(baseline_data, :bus)
baseline_n_bus   = nrow(baseline_bus_tbl)
baseline_all_lmps = Float64[]
for bus_idx in 1:baseline_n_bus, yr_idx in 1:length(baseline_years), hr_idx in 1:baseline_nhr
    push!(baseline_all_lmps, safe_get(baseline_data, :bus, :lmp_elserv, bus_idx, yr_idx, hr_idx))
end
baseline_median_lmp_nat_2035 = let
    lmps_2035 = Float64[]
    yr_idx_2035 = findfirst(==("y2035"), baseline_years)
    if !isnothing(yr_idx_2035)
        for bus_idx in 1:baseline_n_bus, hr_idx in 1:baseline_nhr
            push!(lmps_2035, safe_get(baseline_data, :bus, :lmp_elserv, bus_idx, yr_idx_2035, hr_idx))
        end
        median(lmps_2035)
    else
        NaN
    end
end

# Baseline CO₂
baseline_gen_tbl  = E4ST.get_table(baseline_data, :gen)
baseline_ngen     = nrow(baseline_gen_tbl)
baseline_hw       = E4ST.get_hour_weights(baseline_data)
baseline_nyr      = length(baseline_years)
baseline_co2      = zeros(baseline_nyr)
for i in 1:baseline_ngen
    er = Float64(baseline_gen_tbl[i, :emis_co2])
    er > 0.0 || continue
    for yr_idx in 1:baseline_nyr, hr_idx in 1:baseline_nhr
        pgen = safe_get(baseline_data, :gen, :pgen, i, yr_idx, hr_idx)
        baseline_co2[yr_idx] += pgen * baseline_hw[hr_idx] * er
    end
end
baseline_co2_dict = Dict(yr => baseline_co2[i] for (i, yr) in enumerate(baseline_years))
baseline_smr_wy = 0.0  # baseline has no endogenous investment

@printf("  Baseline median LMP y2035: %.2f \$/MWh\n", baseline_median_lmp_nat_2035)
@printf("  Baseline CO₂ y2025: %.3f Mt\n", get(baseline_co2_dict, "y2025", 0.0) / 1e6)
@printf("  Baseline CO₂ y2035: %.3f Mt\n", get(baseline_co2_dict, "y2035", 0.0) / 1e6)

# ─── Summary table accumulator ────────────────────────────────────────────────
summary_rows = DataFrame(
    scenario             = String[],
    status               = String[],
    total_mw_built_2035  = Float64[],
    wyoming_smr_mw_2035  = Float64[],
    co2_mt_2025          = Float64[],
    co2_mt_2035          = Float64[],
    median_lmp_national_2035 = Float64[],
    solve_time_min       = Float64[],
)

# Add baseline row
push!(summary_rows, (
    scenario             = "baseline",
    status               = "OPTIMAL",
    total_mw_built_2035  = 0.0,
    wyoming_smr_mw_2035  = 0.0,
    co2_mt_2025          = round(get(baseline_co2_dict, "y2025", 0.0) / 1e6, digits=3),
    co2_mt_2035          = round(get(baseline_co2_dict, "y2035", 0.0) / 1e6, digits=3),
    median_lmp_national_2035 = round(baseline_median_lmp_nat_2035, digits=2),
    solve_time_min       = 0.0,
))

# ─── Load metadata for update ─────────────────────────────────────────────────
meta = open(META_PATH) do io JSON3.read(io, Dict{String,Any}) end
# JSON3 may return nested arrays as immutable JSON3.Array — convert to mutable Vector
if haskey(meta, "scenarios_completed")
    meta["scenarios_completed"] = Vector{Any}(collect(meta["scenarios_completed"]))
else
    meta["scenarios_completed"] = Vector{Any}()
end

# ─── Run each scenario ────────────────────────────────────────────────────────
for scen in SCENARIOS
    println("\n")
    println("=" ^ 62)
    println("SCENARIO: $(scen.name)")
    println("=" ^ 62)
    println("  Config: $(scen.yml)")
    println()

    if !isfile(scen.yml)
        println("  ERROR: Config file not found — skipping")
        push!(summary_rows, (
            scenario="$(scen.name)", status="CONFIG_MISSING",
            total_mw_built_2035=NaN, wyoming_smr_mw_2035=NaN,
            co2_mt_2025=NaN, co2_mt_2035=NaN,
            median_lmp_national_2035=NaN, solve_time_min=NaN,
        ))
        continue
    end

    t_start = Dates.now()
    println("  Starting solve …  (HiGHS IPM + crossover — ~15 min)")
    println()

    out_path = try
        run_e4st(scen.yml)
    catch err
        t_end = Dates.now()
        elapsed = Dates.value(t_end - t_start) / 60000.0
        @printf("  ERROR after %.1f min: %s\n", elapsed, string(err))
        push!(summary_rows, (
            scenario="$(scen.name)", status="ERROR",
            total_mw_built_2035=NaN, wyoming_smr_mw_2035=NaN,
            co2_mt_2025=NaN, co2_mt_2035=NaN,
            median_lmp_national_2035=NaN, solve_time_min=round(elapsed, digits=1),
        ))
        push!(meta["scenarios_completed"], Dict(
            "name"=>scen.name, "status"=>"ERROR",
            "timestamp"=>string(Dates.now(Dates.UTC)), "mean_lmp"=>nothing))
        continue
    end

    t_end    = Dates.now()
    elapsed  = Dates.value(t_end - t_start) / 60000.0
    @printf("  Solve completed in %.1f min\n", elapsed)
    println("  Results: $out_path")

    # Check for timeout (informational only — Julia doesn't abort run_e4st for us)
    elapsed > 45.0 && println("  WARNING: solve exceeded 45-minute guideline")

    # Load and analyse results
    data_out = try
        load_results(out_path)
    catch err
        println("  ERROR loading results: $err")
        push!(summary_rows, (
            scenario="$(scen.name)", status="LOAD_ERROR",
            total_mw_built_2035=NaN, wyoming_smr_mw_2035=NaN,
            co2_mt_2025=NaN, co2_mt_2035=NaN,
            median_lmp_national_2035=NaN, solve_time_min=round(elapsed, digits=1),
        ))
        continue
    end

    # Infer solve status from bus table / LMP presence
    bus_tbl = E4ST.get_table(data_out, :bus)
    solve_status = hasproperty(bus_tbl, :lmp_elserv) ? "OPTIMAL" : "UNKNOWN"
    println("  Solve status: $solve_status")

    # Run analyses
    total_built_2035, smr_wy_2035 = capacity_built(data_out, scen.name)
    median_lmps = median_lmp_by_ba(data_out)
    co2_dict    = co2_emissions(data_out)

    med_lmp_2035 = get(median_lmps, "y2035", NaN)

    push!(summary_rows, (
        scenario             = scen.name,
        status               = solve_status,
        total_mw_built_2035  = round(total_built_2035, digits=1),
        wyoming_smr_mw_2035  = round(smr_wy_2035, digits=1),
        co2_mt_2025          = round(get(co2_dict, "y2025", 0.0) / 1e6, digits=3),
        co2_mt_2035          = round(get(co2_dict, "y2035", 0.0) / 1e6, digits=3),
        median_lmp_national_2035 = round(med_lmp_2035, digits=2),
        solve_time_min       = round(elapsed, digits=1),
    ))

    # Update metadata
    push!(meta["scenarios_completed"], Dict(
        "name"      => scen.name,
        "status"    => solve_status,
        "timestamp" => string(Dates.now(Dates.UTC)),
        "mean_lmp"  => round(get(median_lmps, "y2025", NaN), digits=2),
        "solve_time_min" => round(elapsed, digits=1),
        "out_path"  => out_path,
    ))
end

# ─── Cross-scenario summary table ─────────────────────────────────────────────
println("\n")
println("=" ^ 62)
println("CROSS-SCENARIO SUMMARY")
println("=" ^ 62)
println()

@printf("  %-20s  %-8s  %12s  %12s  %10s  %10s  %12s\n",
        "Scenario", "Status", "MW_built_2035", "WY_SMR_2035",
        "CO2_Mt_2025", "CO2_Mt_2035", "medLMP_2035")
println("  " * "─"^90)
for row in eachrow(summary_rows)
    @printf("  %-20s  %-8s  %12.0f  %12.0f  %10.3f  %10.3f  %12.2f\n",
            row.scenario, row.status,
            isnan(row.total_mw_built_2035) ? 0.0 : row.total_mw_built_2035,
            isnan(row.wyoming_smr_mw_2035) ? 0.0 : row.wyoming_smr_mw_2035,
            isnan(row.co2_mt_2025)         ? 0.0 : row.co2_mt_2025,
            isnan(row.co2_mt_2035)         ? 0.0 : row.co2_mt_2035,
            isnan(row.median_lmp_national_2035) ? 0.0 : row.median_lmp_national_2035)
end

# Save CSV
summary_path = joinpath(RESULTS_ROOT, "scenario_summary.csv")
CSV.write(summary_path, summary_rows)
println("\n  Saved: $summary_path")

# ─── Update network_metadata.json ─────────────────────────────────────────────
open(META_PATH, "w") do io
    JSON3.pretty(io, meta)
end
println("  Updated: $META_PATH")

# ─── Confirmation checks ──────────────────────────────────────────────────────
println()
println("=" ^ 62)
println("CONFIRMATION CHECKS")
println("=" ^ 62)
println()

checks_passed = true

for scen in SCENARIOS
    scen_dir = joinpath(RESULTS_ROOT, scen.name)
    exists = isdir(scen_dir) && !isempty(readdir(scen_dir))
    status = exists ? "OK" : "MISSING"
    exists || (checks_passed = false)
    @printf("  %-35s  %s\n", "$(scen.name)/ results dir", status)
end

# scenario_summary.csv has 4 rows
if isfile(summary_path)
    df_check = CSV.read(summary_path, DataFrame)
    n_rows = nrow(df_check)
    row_ok = n_rows == 4
    row_ok || (checks_passed = false)
    @printf("  %-35s  %s  (got %d, want 4)\n",
            "scenario_summary.csv rows", row_ok ? "OK" : "FAIL", n_rows)
else
    println("  scenario_summary.csv                MISSING")
    checks_passed = false
end

# network_metadata.json updated
meta_check = open(META_PATH) do io JSON3.read(io, Dict{String,Any}) end
scen_names_completed = Set(get(s, "name", "") for s in get(meta_check, "scenarios_completed", []))
has_scenarios = all(s.name in scen_names_completed for s in SCENARIOS)
has_scenarios || (checks_passed = false)
@printf("  %-35s  %s\n", "network_metadata scenarios_completed",
        has_scenarios ? "OK" : "INCOMPLETE")

println()
if checks_passed
    println("  ALL CHECKS PASSED  ✓")
else
    println("  SOME CHECKS FAILED — review output above")
end
println("=" ^ 62)
