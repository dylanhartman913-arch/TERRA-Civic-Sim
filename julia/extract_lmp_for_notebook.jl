#!/usr/bin/env julia
# extract_lmp_for_notebook.jl
# Extracts per-BA median LMP by scenario and year from E4ST serialized results.
# Output: data/processed/lmp_by_ba_scenarios.csv
# Usage: julia --project=julia julia/extract_lmp_for_notebook.jl

using E4ST
using Serialization
using Statistics
using CSV
using DataFrames

const PROJECT_ROOT = dirname(@__DIR__)

const SCENARIOS = [
    ("baseline",       joinpath(PROJECT_ROOT, "data/processed/e4st_results_v2/baseline/260506_210912454")),
    ("carbon_tax_50",  joinpath(PROJECT_ROOT, "data/processed/e4st_results_v2/carbon_tax_50/260510_133555408")),
    ("ira_itc",        joinpath(PROJECT_ROOT, "data/processed/e4st_results_v2/ira_itc/260510_135332026")),
    ("carbon_tax_ira", joinpath(PROJECT_ROOT, "data/processed/e4st_results_v2/carbon_tax_ira/260510_140811409")),
]

function extract_scenario_lmps(name::String, out_path::String)
    jls_path = joinpath(out_path, "data_processed.jls")
    if !isfile(jls_path)
        # fallback to data.jls if data_processed.jls missing
        jls_path = joinpath(out_path, "data.jls")
    end
    @info "Loading $name from $(basename(out_path)) ..."
    data = open(jls_path, "r") do io
        deserialize(io)
    end

    bus_tbl = E4ST.get_table(data, :bus)
    n_bus   = nrow(bus_tbl)
    n_yr    = E4ST.get_num_years(data)
    n_hr    = E4ST.get_num_hours(data)
    yr_names = E4ST.get_years(data)

    rows = NamedTuple{(:scenario, :year, :ba_code, :median_lmp, :mean_lmp, :n_bus_hrs), Tuple{String,String,String,Float64,Float64,Int}}[]

    for (yr_idx, yr) in enumerate(yr_names)
        lmps_by_ba = Dict{String, Vector{Float64}}()
        for bus_i in 1:n_bus
            ba = bus_tbl[bus_i, :ba_code]
            lmp_vec = get!(lmps_by_ba, ba, Float64[])
            for hr_idx in 1:n_hr
                push!(lmp_vec, E4ST.get_table_num(data, :bus, :lmp_elserv, bus_i, yr_idx, hr_idx))
            end
        end
        for (ba, lmps) in sort(collect(lmps_by_ba), by=first)
            push!(rows, (
                scenario  = name,
                year      = string(yr),
                ba_code   = ba,
                median_lmp = median(lmps),
                mean_lmp   = mean(lmps),
                n_bus_hrs  = length(lmps),
            ))
        end
        @info "  $yr done — $(length(lmps_by_ba)) BAs"
    end
    return rows
end

all_rows = []
for (name, out_path) in SCENARIOS
    try
        rows = extract_scenario_lmps(name, out_path)
        append!(all_rows, rows)
    catch e
        @warn "Failed for $name: $e"
    end
end

df = DataFrame(all_rows)
out_csv = joinpath(PROJECT_ROOT, "data/processed/lmp_by_ba_scenarios.csv")
CSV.write(out_csv, df)
println("\nSaved: $out_csv  ($(nrow(df)) rows, $(length(unique(df.scenario))) scenarios)")
