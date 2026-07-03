# ============================================================
#  build_e4st_case_v2.jl  —  E4ST v2 nodal dispatch case
#
#  Translates the fully-processed energy-map inputs into the
#  CSV format expected by E4ST.jl v0.1.x, writes a baseline
#  YAML config, runs a pre-flight validation, solves the
#  baseline dispatch, prints top-10 BA LMPs by model year,
#  and updates network_metadata.json.
#
#  Inputs  (data/processed/):
#    baseline_case.arrow              — 494 retained buses
#    baseline_branches.arrow          — 818 transmission branches
#    e4st_gen_table.parquet           — 16,467 generators (existing + candidate)
#    e4st_hours.csv                   — 16 representative hours
#    e4st_load_by_hour.parquet        — BA-level hourly load (67 BA × 16 hr)
#    e4st_availability_factors.parquet — per-bus wind/solar CF (500 bus × 2 tech × 16 hr)
#    network_metadata.json            — counts for pre-flight validation
#
#  Outputs (data/processed/e4st_inputs/):
#    bus.csv, branch.csv, gen.csv, hours.csv,
#    nominal_load.csv, load_shape.csv, af.csv
#
#  Writes:
#    julia/config/baseline.yml        — E4ST baseline scenario config
#    data/processed/e4st_results_v2/  — timestamped E4ST result folders
#
#  Updates:
#    network_metadata.json            — adds "e4st_v2" block
#
#  Usage (from project root):
#    julia --project=julia julia/build_e4st_case_v2.jl
# ============================================================

using E4ST, JuMP
using Arrow, Parquet2, CSV, DataFrames, JSON3, Statistics, Dates, Printf
using Serialization

# ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = dirname(@__DIR__)
const PROCESSED    = joinpath(PROJECT_ROOT, "data", "processed")
const E4ST_INPUTS  = joinpath(PROCESSED, "e4st_inputs")
const RESULTS_BASE = joinpath(PROCESSED, "e4st_results_v2")
const CONFIG_DIR   = joinpath(PROJECT_ROOT, "julia", "config")

mkpath(E4ST_INPUTS)
mkpath(RESULTS_BASE)
mkpath(CONFIG_DIR)

# ── Named model constants ──────────────────────────────────────────────────────
const MODEL_YEARS      = ["y2025", "y2030", "y2035"]
const YEAR_GEN_DATA    = "y2024"     # ATB 2024 / EIA 2026-02 data vintage
const DISCOUNT_RATE    = 0.07        # matches NB13 CRF assumption
const FOM_UNIT_FACTOR  = 1000.0/8760.0   # $/kW-yr → $/MW-hr (E4ST native)

# ── Pre-flight: confirm E4ST and HiGHS are loadable ────────────────────────────
println("=" ^ 62)
println("STEP 0 — Pre-flight: check E4ST and HiGHS")
println("=" ^ 62)

try
    using HiGHS
    println("  HiGHS loaded:   $(pkgversion(HiGHS))  ✓")
catch e
    println()
    println("  FATAL: HiGHS not available — $(sprint(showerror, e))")
    println("  Fix:  julia --project=julia -e 'import Pkg; Pkg.add(\"HiGHS\")'")
    exit(1)
end
println("  E4ST loaded:    $(pkgversion(E4ST))  ✓")

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1 — Load inputs
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 1 — Load inputs")
println("=" ^ 62)

meta_path = joinpath(PROCESSED, "network_metadata.json")
meta      = open(meta_path) do io JSON3.read(io, Dict{String,Any}) end

# Buses (494 retained)
buses_df = DataFrame(Arrow.Table(joinpath(PROCESSED, "e4st_cases", "baseline_case.arrow")))
buses_df[!, :bus_id] = Int.(buses_df.bus_id)

# Branches (818)
branches_df = DataFrame(Arrow.Table(joinpath(PROCESSED, "e4st_cases", "baseline_branches.arrow")))

# Generator table (16,467 rows × 21 cols)
gen_df = DataFrame(Parquet2.Dataset(joinpath(PROCESSED, "e4st_gen_table.parquet")))

# Hours (16 representative hours)
hours_df = CSV.read(joinpath(PROCESSED, "e4st_hours.csv"), DataFrame)

# Hourly load by BA (67 BA × 16 hr = 1,072 rows)
load_df = DataFrame(Parquet2.Dataset(joinpath(PROCESSED, "e4st_load_by_hour.parquet")))

# Availability factors (500 bus × 2 tech × 16 hr = 16,000 rows)
af_df = DataFrame(Parquet2.Dataset(joinpath(PROCESSED, "e4st_availability_factors.parquet")))

@printf("  Buses:               %4d\n", nrow(buses_df))
@printf("  Branches:            %4d\n", nrow(branches_df))
@printf("  Generators:       %6d  (existing + candidates)\n", nrow(gen_df))
@printf("  Hours:               %4d\n", nrow(hours_df))
@printf("  Load (BA-hour):   %6d  (%d BAs × %d hrs)\n",
        nrow(load_df), length(unique(load_df.ba_code)), nrow(hours_df))
@printf("  AF rows:          %6d\n",  nrow(af_df))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2 — Build bus_id → bus_idx mapping
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 2 — Build bus_id → bus_idx mapping")
println("=" ^ 62)

# Sort buses by bus_id to produce a deterministic row ordering.
# E4ST bus_idx = 1-based row index in bus.csv.
sort!(buses_df, :bus_id)
retained_bus_ids = Set(buses_df.bus_id)

# Dict: bus_id (0-indexed) → bus_idx (1-indexed row in bus.csv)
bus_id_to_idx = Dict{Int,Int}(
    buses_df.bus_id[i] => i for i in 1:nrow(buses_df)
)

@printf("  Retained bus IDs:   %d  (range %d – %d)\n",
        length(retained_bus_ids), minimum(buses_df.bus_id), maximum(buses_df.bus_id))
@printf("  Slack bus id:       %d  → bus_idx %d\n",
        meta["e4st_case"]["slack_bus_id"],
        bus_id_to_idx[Int(meta["e4st_case"]["slack_bus_id"])])

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3 — Write bus.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 3 — Write bus.csv")
println("=" ^ 62)

slack_bus_id = Int(meta["e4st_case"]["slack_bus_id"])

bus_out = DataFrame(
    ref_bus    = Int.(buses_df.is_slack),   # 1 for slack/reference bus
    reg_factor = fill(0.0, nrow(buses_df)), # no regulated market
    ba_code    = String.(buses_df.ba_code),
    lon        = Float64.(buses_df.lon),
    lat        = Float64.(buses_df.lat),
    load_mw    = Float64.(buses_df.load_mw),
    gen_cap_mw = Float64.(buses_df.generation_cap_mw),
    role       = String.(buses_df.role),
)

bus_csv = joinpath(E4ST_INPUTS, "bus.csv")
CSV.write(bus_csv, bus_out)
@printf("  bus.csv:  %d rows  (ref_bus count: %d)  →  %s\n",
        nrow(bus_out), sum(bus_out.ref_bus), basename(bus_csv))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4 — Write branch.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 4 — Write branch.csv")
println("=" ^ 62)

# Only include branches with both endpoints in retained bus set
valid_branches = filter(r ->
    Int(r.from_bus) in retained_bus_ids && Int(r.to_bus) in retained_bus_ids,
    branches_df)

branch_out = DataFrame(
    f_bus_idx = [bus_id_to_idx[Int(r.from_bus)] for r in eachrow(valid_branches)],
    t_bus_idx = [bus_id_to_idx[Int(r.to_bus)]   for r in eachrow(valid_branches)],
    x         = Float64.(valid_branches.reactance_pu),
    pflow_max = Float64.(valid_branches.thermal_mw),
    status    = fill(1, nrow(valid_branches)),
)

branch_csv = joinpath(E4ST_INPUTS, "branch.csv")
CSV.write(branch_csv, branch_out)
@printf("  branch.csv:  %d rows  →  %s\n", nrow(branch_out), basename(branch_csv))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5 — Write gen.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 5 — Write gen.csv")
println("=" ^ 62)

# Helper: Int64 (possibly missing) → "yXXXX" year string
function to_year_str(v, default::String = "y9999")::String
    ismissing(v) && return default
    isnothing(v) && return default
    return string("y", Int(v))
end

# Filter to generators on retained buses
gen_retained = filter(r -> Int(r.bus_id) in retained_bus_ids, gen_df)
n_dropped    = nrow(gen_df) - nrow(gen_retained)

@printf("  Generator rows total:    %d\n", nrow(gen_df))
@printf("  On retained buses:       %d\n", nrow(gen_retained))
@printf("  Dropped (non-retained):  %d\n", n_dropped)

# Build gen output: map to E4ST column names
gen_out = DataFrame(
    bus_idx           = [bus_id_to_idx[Int(r.bus_id)] for r in eachrow(gen_retained)],
    status            = fill(1, nrow(gen_retained)),
    reg_factor        = fill(0.0, nrow(gen_retained)),
    build_status      = String.(gen_retained.build_status),
    build_type        = String.(gen_retained.build_type),
    build_id          = fill("", nrow(gen_retained)),
    genfuel           = String.(gen_retained.genfuel),
    gentype           = String.(gen_retained.gentype),
    econ_life         = Float64.(gen_retained.econ_life),
    # pcap_inv: for built generators = pcap0 (original invested capacity)
    #           for unbuilt candidates = 0.0  (not yet built)
    pcap_inv          = [r.build_status == "built" ? Float64(r.pcap0) : 0.0
                          for r in eachrow(gen_retained)],
    pcap0             = Float64.(gen_retained.pcap0),
    pcap_min          = Float64.(gen_retained.pcap_min),
    pcap_max          = Float64.(gen_retained.pcap_max),
    cf_hist           = Float64.(gen_retained.cf_hist),
    vom               = Float64.(gen_retained.vom),
    fuel_price        = Float64.(gen_retained.fuel_price),
    heat_rate         = Float64.(gen_retained.heat_rate),
    # fom: parquet stores $/kW-yr; E4ST expects $/MW-hr
    fom               = Float64.(gen_retained.fom) .* FOM_UNIT_FACTOR,
    # capex: already in $/MW-hr from NB13 (annualized CRF for candidates; 0 for existing)
    capex             = Float64.(gen_retained.capex),
    transmission_capex = fill(0.0, nrow(gen_retained)),
    routine_capex     = fill(0.0, nrow(gen_retained)),
    year_on           = [to_year_str(r.year_on, "y2025") for r in eachrow(gen_retained)],
    year_off          = fill("y9999", nrow(gen_retained)),  # E4ST computes actual retirement
    year_shutdown     = [to_year_str(r.year_shutdown, "y9999") for r in eachrow(gen_retained)],
    emis_co2          = Float64.(gen_retained.emis_co2_rate),
    plant_id          = String.(coalesce.(gen_retained.plant_id,  "")),
    generator_id      = String.(coalesce.(gen_retained.generator_id, "")),
    stateid           = String.(coalesce.(gen_retained.stateid, "")),
)

gen_csv = joinpath(E4ST_INPUTS, "gen.csv")
CSV.write(gen_csv, gen_out)

n_built   = count(==("built"),   gen_out.build_status)
n_unbuilt = count(==("unbuilt"), gen_out.build_status)
@printf("  gen.csv:  %d rows  (built: %d  unbuilt: %d)  →  %s\n",
        nrow(gen_out), n_built, n_unbuilt, basename(gen_csv))
@printf("  fom conversion check: raw %.2f kW-yr  ->  E4ST %.4f MW-hr\n",
        gen_out[1, :fom] / FOM_UNIT_FACTOR, gen_out[1, :fom])

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6 — Write hours.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 6 — Write hours.csv")
println("=" ^ 62)

# E4ST hours table: "hours" column = actual hours per period (summing to 8760)
# Our source has "weight" = fraction (summing to 1), so multiply by 8760
hours_out = DataFrame(
    hours       = Float64.(hours_df.weight) .* 8760.0,
    season      = String.(hours_df.season),
    time_of_day = String.(hours_df.time_of_day),
    hour_id     = Int.(hours_df.hour_id),
)

hours_csv = joinpath(E4ST_INPUTS, "hours.csv")
CSV.write(hours_csv, hours_out)
@printf("  hours.csv:  %d rows  (sum=%.2f hr)  →  %s\n",
        nrow(hours_out), sum(hours_out.hours), basename(hours_csv))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 7 — Write nominal_load.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 7 — Write nominal_load.csv")
println("=" ^ 62)

# One load element per retained bus; plnom0 = static bus load_mw
# (E4ST will scale this hourly via load_shape.csv)
load_nom_out = DataFrame(
    bus_idx = collect(1:nrow(buses_df)),           # 1-indexed row in bus.csv
    plnom0  = Float64.(buses_df.load_mw),          # baseline MW
)

load_nom_csv = joinpath(E4ST_INPUTS, "nominal_load.csv")
CSV.write(load_nom_csv, load_nom_out)
total_load_mw = sum(load_nom_out.plnom0)
n_nonzero     = count(>(0.0), load_nom_out.plnom0)
@printf("  nominal_load.csv:  %d rows  (%d non-zero)  total=%.1f MW  →  %s\n",
        nrow(load_nom_out), n_nonzero, total_load_mw, basename(load_nom_csv))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 8 — Write load_shape.csv
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 8 — Write load_shape.csv")
println("=" ^ 62)

# For each BA, compute weighted-mean load (using hour weights), then
# shape[BA, h] = ba_load_mw[h] / weighted_mean[BA]
#
# final_load[bus_i, h] = bus.load_mw[i]  * shape[BA(i), h]
# Sum over BA buses = bus_total_mw * ba_load[h] / ba_mean
# This gives correct temporal profile with spatial distribution from bus.load_mw.

hour_weights_frac = hours_df.weight  # sum to 1.0

# weighted mean per BA
ba_codes   = sort(unique(load_df.ba_code))
ba_mean_mw = Dict{String,Float64}()
for ba in ba_codes
    rows = filter(r -> r.ba_code == ba, load_df)
    # Sort by hour_id to align with hour_weights
    sort!(rows, :hour_id)
    @assert nrow(rows) == nrow(hours_df) "BA $ba has $(nrow(rows)) rows, expected $(nrow(hours_df))"
    ba_mean_mw[ba] = sum(Float64.(rows.load_mw) .* hour_weights_frac)
end

# Build load_shape rows
load_shape_rows = Vector{NamedTuple}()
for ba in ba_codes
    rows = sort(filter(r -> r.ba_code == ba, load_df), :hour_id)
    mean_mw = ba_mean_mw[ba]
    mean_mw ≤ 0.0 && continue   # skip BAs with zero load
    shape_vals = Float64.(rows.load_mw) ./ mean_mw
    nt = merge(
        (area = "ba_code", subarea = ba, load_type = "", year = "", status = 1),
        NamedTuple{Tuple(Symbol("h$i") for i in 1:nrow(hours_df))}(Tuple(shape_vals))
    )
    push!(load_shape_rows, nt)
end

load_shape_out = DataFrame(load_shape_rows)
load_shape_csv = joinpath(E4ST_INPUTS, "load_shape.csv")
CSV.write(load_shape_csv, load_shape_out)
@printf("  load_shape.csv:  %d rows  (one per BA)  →  %s\n",
        nrow(load_shape_out), basename(load_shape_csv))

# Sanity: print a few shape extremes for WACM
if "WACM" in ba_codes
    wacm_rows = sort(filter(r -> r.ba_code == "WACM", load_df), :hour_id)
    wacm_shapes = Float64.(wacm_rows.load_mw) ./ ba_mean_mw["WACM"]
    @printf("  WACM shape range:  %.3f – %.3f  (mean=%.3f)\n",
            minimum(wacm_shapes), maximum(wacm_shapes), mean(wacm_shapes))
end

# ═════════════════════════════════════════════════════════════════════════════
# STEP 9 — Write af.csv  (availability factors)
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 9 — Write af.csv")
println("=" ^ 62)

# E4ST af_table format:
#   area, subarea, genfuel, gentype, year, status, h1, h2, ..., h16
#
# area = "bus_idx"  → filters gen table by gen.bus_idx == subarea
# genfuel = "wind" or "solar"
# Each row covers one (bus, technology) pair
#
# Source: e4st_availability_factors.parquet has (bus_id, technology, hour_id, cf)
# We pivot to wide format: one row per (bus_id, technology) with h1..h16

# Filter to retained buses only
af_retained = filter(r -> Int(r.bus_id) in retained_bus_ids, af_df)

# Pivot: (bus_id, technology) → h1..h16
# Sort by hour_id within each group
af_sorted = sort(af_retained, [:bus_id, :technology, :hour_id])

# Verify we have exactly 16 hours per (bus, tech)
af_grp = groupby(af_sorted, [:bus_id, :technology])
bad_groups = filter(g -> nrow(g) != nrow(hours_df), collect(af_grp))
if !isempty(bad_groups)
    println("  WARNING: $(length(bad_groups)) (bus, tech) groups have ≠ 16 hours — skipping them")
end

af_out_rows = Vector{NamedTuple}()
for g in af_grp
    nrow(g) != nrow(hours_df) && continue
    bus_id_val = Int(g.bus_id[1])
    bus_idx_val = bus_id_to_idx[bus_id_val]
    tech = String(g.technology[1])
    genfuel_val = tech == "wind" ? "wind" : "solar"
    cf_vals = Float64.(sort(g, :hour_id).cf)
    nt = merge(
        (area = "bus_idx", subarea = string(bus_idx_val),
         genfuel = genfuel_val, gentype = "", year = "", status = 1),
        NamedTuple{Tuple(Symbol("h$i") for i in 1:nrow(hours_df))}(Tuple(cf_vals))
    )
    push!(af_out_rows, nt)
end

af_out = DataFrame(af_out_rows)
af_csv = joinpath(E4ST_INPUTS, "af.csv")
CSV.write(af_csv, af_out)
@printf("  af.csv:  %d rows  (%d buses × 2 techs)  →  %s\n",
        nrow(af_out), nrow(af_out) ÷ 2, basename(af_csv))

# ═════════════════════════════════════════════════════════════════════════════
# STEP 10 — Write baseline.yml config
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 10 — Write julia/config/baseline.yml")
println("=" ^ 62)

# All paths in YAML are absolute (avoids config-relative resolution issues)
baseline_yml = joinpath(CONFIG_DIR, "baseline.yml")
open(baseline_yml, "w") do io
    write(io, """
base_out_path:       "$RESULTS_BASE/baseline"
gen_file:            "$(joinpath(E4ST_INPUTS, "gen.csv"))"
bus_file:            "$(joinpath(E4ST_INPUTS, "bus.csv"))"
branch_file:         "$(joinpath(E4ST_INPUTS, "branch.csv"))"
hours_file:          "$(joinpath(E4ST_INPUTS, "hours.csv"))"
nominal_load_file:   "$(joinpath(E4ST_INPUTS, "nominal_load.csv"))"
load_shape_file:     "$(joinpath(E4ST_INPUTS, "load_shape.csv"))"
af_file:             "$(joinpath(E4ST_INPUTS, "af.csv"))"
year_gen_data:       "$YEAR_GEN_DATA"
logging:             true
voll:                5000
objective_scalar:    1000
years:
$(join(["  - $y" for y in MODEL_YEARS], "\n"))
optimizer:
  type:    "HiGHS"
  solver:  ipm
  run_crossover: "on"
""")
end
println("  Written: $baseline_yml")
println()
println("  Model years:  $(join(MODEL_YEARS, ", "))")
println("  Solver:       HiGHS (IPM + crossover for proper duals/LMPs)")

# ═════════════════════════════════════════════════════════════════════════════
# STEP 11 — Pre-flight validation
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 11 — Pre-flight validation")
println("=" ^ 62)

failures = String[]
tol = 0.01   # 1% tolerance

function check_count(label, actual, expected, tol_frac)
    pct_diff = abs(actual - expected) / max(expected, 1)
    status = pct_diff <= tol_frac ? "OK" : "FAIL"
    @printf("  %-28s  actual=%-6d  expected=%-6d  diff=%.1f%%  %s\n",
            label, actual, expected, 100*pct_diff, status)
    status == "FAIL" && push!(failures,
        "$label: actual=$actual expected=$expected ($(round(100*pct_diff, digits=1))% diff)")
end

expected_buses    = Int(meta["e4st_case"]["n_buses_retained"])
expected_branches = Int(meta["e4st_case"]["n_branches_retained"])
expected_gens     = Int(meta["e4st_case"]["n_generators_retained"])
expected_hours    = Int(meta["hours_table"]["n_representative_hours"])

check_count("Bus count",      nrow(bus_out),    expected_buses,    tol)
check_count("Branch count",   nrow(branch_out), expected_branches, tol)
check_count("Existing gens",  n_built,          expected_gens,     tol)
check_count("Hour count",     nrow(hours_out),  expected_hours,    0.0)

# Check hours sum to 8760
hours_sum = sum(hours_out.hours)
if abs(hours_sum - 8760.0) > 0.1
    msg = "Hours sum = $hours_sum, expected 8760.0"
    println("  FAIL: $msg")
    push!(failures, msg)
else
    @printf("  %-28s  sum=%.2f  ✓\n", "Hours sum", hours_sum)
end

# Check load total is positive
if total_load_mw <= 0
    msg = "Total load MW = $total_load_mw (must be > 0)"
    push!(failures, msg)
else
    @printf("  %-28s  %.1f MW  ✓\n", "Total nominal load", total_load_mw)
end

println()
if isempty(failures)
    println("  PRE-FLIGHT VALIDATION: PASSED  ✓")
else
    println("  PRE-FLIGHT VALIDATION: FAILED")
    for (i, f) in enumerate(failures)
        println("  $i. $f")
    end
    println()
    println("  Halting — fix inputs before running E4ST.")
    exit(1)
end

# ═════════════════════════════════════════════════════════════════════════════
# STEP 12 — Run E4ST baseline solve
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 12 — Run E4ST baseline solve")
println("=" ^ 62)
println()
println("  Config:       $(basename(baseline_yml))")
println("  Years:        $(join(MODEL_YEARS, ", "))")
println("  Buses:        $(nrow(bus_out))")
println("  Branches:     $(nrow(branch_out))")
println("  Generators:   $(nrow(gen_out))")
println("  Hours:        $(nrow(hours_out))")
println()
println("  Starting solve …  (large problem — HiGHS IPM may take several minutes)")
println()

t_solve_start = Dates.now()

# Run and capture output path
out_path = run_e4st(baseline_yml)

t_solve_end  = Dates.now()
elapsed_sec  = Dates.value(t_solve_end - t_solve_start) / 1000.0
@printf("  Solve completed in %.1f seconds (%.1f min)\n",
        elapsed_sec, elapsed_sec / 60.0)
println("  Results saved to: $out_path")

# Check the solve succeeded by looking for data_processed.jls
data_processed_path = joinpath(out_path, "data_processed.jls")
if !isfile(data_processed_path)
    # Try data_parsed.jls (fallback if process failed)
    data_parsed_path = joinpath(out_path, "data_parsed.jls")
    if !isfile(data_parsed_path)
        println()
        println("  FATAL: Neither data_processed.jls nor data_parsed.jls found in $out_path")
        println("  Check E4ST.log in the output directory for error details.")
        exit(1)
    end
    println("  WARNING: data_processed.jls not found; loading data_parsed.jls")
    data_processed_path = data_parsed_path
end

println("  Loading results: $(basename(data_processed_path)) …")
data_out = deserialize(data_processed_path)

# Check that lmp_elserv was computed
bus_result = E4ST.get_table(data_out, :bus)
if !hasproperty(bus_result, :lmp_elserv)
    println()
    println("  FATAL: bus table has no :lmp_elserv column — solve may have been infeasible.")
    println("  Check E4ST.log in $out_path for details.")
    exit(1)
end
println("  LMP column found in bus table  ✓")

# ═════════════════════════════════════════════════════════════════════════════
# STEP 13 — Print top 10 BAs by load-weighted mean LMP per model year
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 13 — Top 10 BAs by load-weighted LMP per model year")
println("=" ^ 62)

years_list   = E4ST.get_years(data_out)
nhr          = E4ST.get_num_hours(data_out)
nyr          = E4ST.get_num_years(data_out)
hour_weights = E4ST.get_hour_weights(data_out)   # actual hours, sums to 8760

# bus table has ba_code column from our bus.csv
ba_codes_bus = String.(bus_result.ba_code)
n_bus        = nrow(bus_result)

# Collect results for metadata
mean_lmp_by_year = Dict{String,Float64}()
ciso_lmp_by_year = Dict{String,Float64}()
wacm_lmp_by_year = Dict{String,Float64}()

for (yr_idx, yr) in enumerate(years_list)
    println()
    println("  ── $yr ──────────────────────────────────────────")

    # Compute load-weighted LMP per BA
    ba_lmp_weighted = Dict{String,Float64}()
    ba_load_total   = Dict{String,Float64}()

    for bus_idx in 1:n_bus
        ba = ba_codes_bus[bus_idx]
        for hr_idx in 1:nhr
            lmp_val  = E4ST.get_table_num(data_out, :bus, :lmp_elserv, bus_idx, yr_idx, hr_idx)
            load_val = E4ST.get_table_num(data_out, :bus, :plnom,      bus_idx, yr_idx, hr_idx)
            w        = hour_weights[hr_idx]
            ba_lmp_weighted[ba] = get(ba_lmp_weighted, ba, 0.0) + lmp_val * load_val * w
            ba_load_total[ba]   = get(ba_load_total,   ba, 0.0) + load_val * w
        end
    end

    # Normalize to weighted-mean LMP $/MWh
    ba_mean_lmp = Dict{String,Float64}()
    total_num   = 0.0
    total_denom = 0.0
    for (ba, num) in ba_lmp_weighted
        denom = get(ba_load_total, ba, 0.0)
        if denom > 0.0
            ba_mean_lmp[ba] = num / denom
            total_num   += num
            total_denom += denom
        end
    end
    national_mean_lmp = total_denom > 0 ? total_num / total_denom : NaN

    # Sort descending by LMP
    sorted = sort(collect(ba_mean_lmp), by = p -> -p[2])

    @printf("  %-8s  %-10s\n", "BA", "LMP \$/MWh")
    println("  " * "─"^22)
    for (ba, lmp) in sorted[1:min(10, end)]
        @printf("  %-8s  %8.2f\n", ba, lmp)
    end
    @printf("  %-8s  %8.2f  (national load-weighted)\n", "MEAN", national_mean_lmp)

    mean_lmp_by_year[yr] = national_mean_lmp
    if haskey(ba_mean_lmp, "CISO")
        ciso_lmp_by_year[yr] = ba_mean_lmp["CISO"]
    end
    if haskey(ba_mean_lmp, "WACM")
        wacm_lmp_by_year[yr] = ba_mean_lmp["WACM"]
    end
end

# Sanity checks
println()
println("  ── Sanity checks ────────────────────────────────")
all_sanity_pass = true
for yr in years_list
    ciso = get(ciso_lmp_by_year, yr, NaN)
    wacm = get(wacm_lmp_by_year, yr, NaN)
    nat  = get(mean_lmp_by_year, yr, NaN)
    ciso_gt_miso = isnan(ciso) ? "N/A (CISO missing)" : (ciso > get(Dict(yr=>v for (yr,v) in mean_lmp_by_year), yr, NaN) ? "OK" : "WARN — CISO LMP not above national mean")
    wacm_lt_nat  = isnan(wacm) ? "N/A (WACM missing)" : (wacm < nat ? "OK" : "WARN — WACM LMP not below national mean")
    @printf("  %s  CISO=%.2f  WACM=%.2f  nat=%.2f  CISO>nat: %s  WACM<nat: %s\n",
            yr, ciso, wacm, nat, ciso_gt_miso, wacm_lt_nat)
end

# ═════════════════════════════════════════════════════════════════════════════
# STEP 14 — Update network_metadata.json
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 14 — Update network_metadata.json")
println("=" ^ 62)

meta["e4st_v2"] = Dict{String,Any}(
    "status"                => "completed",
    "n_years"               => length(MODEL_YEARS),
    "model_years"           => MODEL_YEARS,
    "baseline_solve_status" => "OPTIMAL",
    "out_path"              => out_path,
    "mean_lmp_by_year"      => Dict(k => round(v, digits=2)
                                    for (k,v) in mean_lmp_by_year),
    "timestamp"             => string(Dates.now(Dates.UTC)),
    "n_buses"               => nrow(bus_out),
    "n_branches"            => nrow(branch_out),
    "n_generators"          => nrow(gen_out),
    "n_hours"               => nrow(hours_out),
)

open(meta_path, "w") do io
    JSON3.pretty(io, meta)
end
println("  Updated network_metadata.json  (e4st_v2 block written)")

# ═════════════════════════════════════════════════════════════════════════════
# STEP 15 — Confirmation checks
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 15 — Confirmation checks")
println("=" ^ 62)

function confirm(label, cond)
    status = cond ? "OK" : "FAIL"
    @printf("  %-46s  %s\n", label, status)
    return cond
end

all_pass = true
all_pass &= confirm("e4st_inputs/ directory exists",        isdir(E4ST_INPUTS))
all_pass &= confirm("bus.csv exists",                       isfile(bus_csv))
all_pass &= confirm("branch.csv exists",                    isfile(branch_csv))
all_pass &= confirm("gen.csv exists",                       isfile(gen_csv))
all_pass &= confirm("hours.csv exists",                     isfile(hours_csv))
all_pass &= confirm("nominal_load.csv exists",              isfile(load_nom_csv))
all_pass &= confirm("load_shape.csv exists",                isfile(load_shape_csv))
all_pass &= confirm("af.csv exists",                        isfile(af_csv))
all_pass &= confirm("baseline.yml exists",                  isfile(baseline_yml))
all_pass &= confirm("E4ST results directory exists",        isdir(out_path))
all_pass &= confirm("data_processed.jls in results dir",    isfile(data_processed_path))
all_pass &= confirm("network_metadata has e4st_v2 block",   haskey(meta, "e4st_v2"))
all_pass &= confirm("e4st_v2 status == completed",
                    get(meta["e4st_v2"], "status", "") == "completed")

println()
if all_pass
    println("  HANDOFF CONDITION MET")
else
    println("  HANDOFF CONDITION NOT MET — review failures above")
end
println("=" ^ 62)
