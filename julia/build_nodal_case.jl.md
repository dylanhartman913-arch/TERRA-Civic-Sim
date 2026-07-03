# ============================================================
#  build_nodal_case.jl  —  NODAL (bus-level) E4ST case
#
#  Builds a nodal E4ST case from the 500-bus synthetic network.
#  Complements build_e4st_case.jl (zonal copper-plate model).
#
#  Inputs  (data/processed/):
#    synthetic_buses.geojson       — 500 synthetic buses (capacity, load, BA)
#    synthetic_branches.geojson    — 818 transmission branches
#    generators_with_costs.parquet — generator-level ATB+EIA costs from nb05
#    network_metadata.json         — island_filter_min_nodes + validation status
#
#  Outputs (data/processed/e4st_cases/):
#    baseline_case.arrow       — retained buses  (primary case file)
#    baseline_branches.arrow   — retained branches
#    baseline_generators.arrow — retained generators
#
#  Updates:
#    network_metadata.json     — adds "e4st_case" block
#    julia/README.md           — written by build_nodal_case.jl on first run
#
#  Usage (from project root):
#    julia --project=julia julia/build_nodal_case.jl
# ============================================================

using JSON3, DataFrames, Arrow, Graphs, Parquet2, Printf, Statistics, Dates

# ── Named physical constants ─────────────────────────────────────────────────
const KM_TO_MI = 0.621371

# Reactance coefficients: pu per 100 miles on 100 MVA system base.
# Standard US transmission engineering values (Glover, Sarma & Overbye 2012).
const REACTANCE_PER_100MI = Dict{Int,Float64}(
    115 => 0.30,
    230 => 0.25,
    345 => 0.20,
    500 => 0.15,
    765 => 0.10,
)

# HVDC links: is_manual_override=true AND voltage_kv >= 500.
# DC ties carry real power without AC reactance; use near-zero placeholder
# so DC power flow equations don't degenerate.
const HVDC_REACTANCE_PU = 0.001

# ── Named dispatch / model constants ─────────────────────────────────────────
const LOAD_SCALE_FACTOR         = 1.0   # baseline year — no demand growth
const GENERATION_RESERVE_MARGIN = 0.15  # 15% planning reserve (NERC standard)

# ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = dirname(@__DIR__)
const PROCESSED    = joinpath(PROJECT_ROOT, "data", "processed")
const OUTPUT_DIR   = joinpath(PROCESSED, "e4st_cases")
mkpath(OUTPUT_DIR)

# ── Helpers ───────────────────────────────────────────────────────────────────

"""
Read the `properties` object of every GeoJSON Feature into a DataFrame.
Geometry is discarded — only electrically/spatially meaningful attributes needed.
"""
function read_geojson_properties(path::String)::DataFrame
    gj   = open(path) do io JSON3.read(io) end
    rows = [Dict{String,Any}(string(k) => v
            for (k, v) in feat[:properties])
            for feat in gj[:features]]
    return DataFrame(rows)
end

"""
Compute AC reactance in pu on 100 MVA base.
  x = coeff(kV) * length_miles / 100
HVDC ties (is_manual_override && voltage >= 500 kV) bypass the formula.
Voltage classes not in REACTANCE_PER_100MI fall back to the 115 kV coefficient.
"""
function compute_reactance_pu(length_km::Float64, voltage_kv::Float64,
                               is_manual_override::Bool)::Float64
    is_manual_override && voltage_kv >= 500.0 && return HVDC_REACTANCE_PU
    length_mi = length_km * KM_TO_MI
    v_int     = Int(round(voltage_kv))
    coeff     = get(REACTANCE_PER_100MI, v_int, 0.30)   # fallback: 115 kV coeff
    return coeff * length_mi / 100.0
end

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1 — Load inputs
# ═════════════════════════════════════════════════════════════════════════════
println("=" ^ 62)
println("STEP 1 — Load inputs")
println("=" ^ 62)

meta_path = joinpath(PROCESSED, "network_metadata.json")
meta      = open(meta_path) do io JSON3.read(io, Dict{String,Any}) end

# Guard: refuse to build a case from an unvalidated topology
vd = meta["validation_deepdive"]
if Bool(vd["ready_for_e4st"]) != true
    error("network_metadata.json: ready_for_e4st = false — run notebook 08 first")
end
println("  ready_for_e4st:           true  ✓")

island_min = Int(meta["island_filter_min_nodes"])
println("  island_filter_min_nodes:  $island_min  (from network_metadata.json)")
println()

buses_df    = read_geojson_properties(joinpath(PROCESSED, "synthetic_buses.geojson"))
branches_df = read_geojson_properties(joinpath(PROCESSED, "synthetic_branches.geojson"))

# generators_with_costs uses original OSM bus IDs; synthetic_plant_assignments
# holds the generator → synthetic bus mapping built during the snap procedure.
# Inner-join to replace OSM bus_id with synthetic bus_id (drops 1 unmatched row).
gen_costs   = DataFrame(Parquet2.Dataset(
                  joinpath(PROCESSED, "generators_with_costs.parquet")))
gen_assign  = DataFrame(Parquet2.Dataset(
                  joinpath(PROCESSED, "synthetic_plant_assignments.parquet")))

gen_df = innerjoin(
    gen_costs,
    rename(select(gen_assign, :generator_id, :plant_id, :bus_id), :bus_id => :synth_bus_id),
    on = [:generator_id, :plant_id])
select!(gen_df, Not(:bus_id))          # drop OSM bus_id
rename!(gen_df, :synth_bus_id => :bus_id)  # synthetic bus_id takes its place

# Coerce JSON3 Any → concrete Julia types
buses_df[!, :bus_id]            = Int.(buses_df.bus_id)
buses_df[!, :generation_cap_mw] = Float64.(buses_df.generation_cap_mw)
buses_df[!, :load_mw]           = Float64.(buses_df.load_mw)
buses_df[!, :lon]               = Float64.(buses_df.lon)
buses_df[!, :lat]               = Float64.(buses_df.lat)

branches_df[!, :line_id]              = Int.(branches_df.line_id)
branches_df[!, :from_bus]             = Int.(branches_df.from_bus)
branches_df[!, :to_bus]               = Int.(branches_df.to_bus)
branches_df[!, :length_km]            = Float64.(branches_df.length_km)
branches_df[!, :voltage_assumed_kv]   = Float64.(branches_df.voltage_assumed_kv)
branches_df[!, :thermal_mw]           = Float64.(branches_df.thermal_mw)
branches_df[!, :reactance_pu]         = Float64.(branches_df.reactance_pu)
branches_df[!, :is_manual_override]   = Bool.(branches_df.is_manual_override)
branches_df[!, :is_density_fill]      = Bool.(branches_df.is_density_fill)
branches_df[!, :is_interregional]     = Bool.(branches_df.is_interregional)
branches_df[!, :is_eia930_calibrated] = Bool.(branches_df.is_eia930_calibrated)

@printf("  Buses:      %d rows\n",  nrow(buses_df))
@printf("  Branches:   %d rows\n",  nrow(branches_df))
@printf("  Generators: %d rows\n",  nrow(gen_df))
@printf("  (synthetic_plant_assignments inner-join: %d → %d rows; %d unmatched dropped)\n",
        nrow(gen_costs), nrow(gen_df), nrow(gen_costs) - nrow(gen_df))

# Assert referential integrity: every branch endpoint must exist in buses file
bus_id_set    = Set(buses_df.bus_id)
orphan_from   = setdiff(Set(branches_df.from_bus), bus_id_set)
orphan_to     = setdiff(Set(branches_df.to_bus),   bus_id_set)
orphaned_ids  = sort(collect(union(orphan_from, orphan_to)))

if !isempty(orphaned_ids)
    println()
    println("  ERROR — Orphaned bus IDs referenced in branches file:")
    println("  $orphaned_ids")
    println("  Halting — fix synthetic_buses.geojson or synthetic_branches.geojson")
    exit(1)
end
println("  ✓ All branch endpoints resolve to buses file")

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2 — Island filter
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 2 — Island filter  (min_nodes = $island_min, from network_metadata.json)")
println("=" ^ 62)

# Build 1-indexed graph (bus_id is 0-indexed in data)
max_bus_id = maximum(buses_df.bus_id)
g = SimpleGraph(max_bus_id + 1)
for row in eachrow(branches_df)
    add_edge!(g, row.from_bus + 1, row.to_bus + 1)
end

all_components     = connected_components(g)
retained_comps     = filter(c -> length(c) >= island_min, all_components)
dropped_comps      = filter(c -> length(c) <  island_min, all_components)

@printf("  Components before filter: %d\n", length(all_components))
@printf("  Components after  filter: %d   (>= %d nodes each)\n",
        length(retained_comps), island_min)
@printf("  Components dropped:       %d   (each < %d nodes)\n",
        length(dropped_comps), island_min)

# 0-indexed retained bus ID set (mirrors the GeoJSON bus_id convention)
retained_bus_ids = Set{Int}(id - 1 for comp in retained_comps for id in comp)

# MW accounting
gen_total_mw    = sum(Float64.(gen_df.capacity_mw))
gen_retained_mw = sum(
    Float64(row.capacity_mw)
    for row in eachrow(gen_df)
    if Int(row.bus_id) in retained_bus_ids;
    init=0.0)
gen_dropped_mw  = gen_total_mw - gen_retained_mw

n_ret = count(id -> id in retained_bus_ids, buses_df.bus_id)
n_drp = nrow(buses_df) - n_ret

println()
@printf("  Buses retained:      %d   dropped: %d\n", n_ret, n_drp)
@printf("  Capacity retained:   %.1f MW  (%.1f%%)\n",
        gen_retained_mw, 100.0 * gen_retained_mw / gen_total_mw)
@printf("  Capacity dropped:    %.1f MW  (%.1f%%)\n",
        gen_dropped_mw,  100.0 * gen_dropped_mw  / gen_total_mw)

# Tag is_in_giant_component on buses DataFrame
buses_df[!, :is_in_giant_component] =
    Bool[id in retained_bus_ids for id in buses_df.bus_id]

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3 — Impedance assignment
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 3 — Impedance assignment")
println("=" ^ 62)

# Count first (avoids Julia soft-scope counter ambiguity in top-level for loops)
n_reused   = count(i -> Float64(branches_df.reactance_pu[i]) > 0.0, 1:nrow(branches_df))
n_computed = nrow(branches_df) - n_reused

branches_df[!, :reactance_pu] = Float64[
    let r = Float64(branches_df.reactance_pu[i])
        r > 0.0 ? r : compute_reactance_pu(
            Float64(branches_df.length_km[i]),
            Float64(branches_df.voltage_assumed_kv[i]),
            Bool(branches_df.is_manual_override[i]))
    end
    for i in 1:nrow(branches_df)
]

@printf("  Reactance source: %d from GeoJSON (non-zero)  |  %d recomputed\n",
        n_reused, n_computed)
println()
println("  Reactance distribution by voltage class:")
println("  " * "─"^58)
@printf("  %-6s  %-7s  %-10s  %-10s  %-10s\n",
        "kV", "Count", "Median(pu)", "Min(pu)", "Max(pu)")
println("  " * "─"^58)
for vkv in sort(unique(Int.(round.(branches_df.voltage_assumed_kv))))
    mask  = Int.(round.(branches_df.voltage_assumed_kv)) .== vkv
    xvals = branches_df.reactance_pu[mask]
    @printf("  %-6d  %-7d  %-10.4f  %-10.4f  %-10.4f\n",
            vkv, sum(mask), median(xvals), minimum(xvals), maximum(xvals))
end
println("  " * "─"^58)

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4 — Assign slack bus
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 4 — Assign slack bus")
println("=" ^ 62)

retained_buses_df = filter(r -> r.bus_id in retained_bus_ids, buses_df)
slack_idx         = argmax(retained_buses_df.generation_cap_mw)
slack_row         = retained_buses_df[slack_idx, :]
slack_bus_id      = Int(slack_row.bus_id)
slack_ba          = String(slack_row.ba_code)
slack_cap_mw      = Float64(slack_row.generation_cap_mw)

println("  Selection rule: bus with highest generation_cap_mw in retained set")
println()
@printf("  Slack bus ID:     %d\n",     slack_bus_id)
@printf("  Balancing area:   %s\n",     slack_ba)
@printf("  Generation cap:   %.1f MW\n", slack_cap_mw)

if slack_ba in ("WACM", "PACE")
    println()
    println("  NOTE: Slack bus is in Wyoming BA ($slack_ba).")
    println("  All nodal LMPs are measured relative to this reference bus.")
    println("  Wyoming-zone LMPs are at zero by definition; interpret")
    println("  relative LMPs from other zones as the transmission premium.")
end

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5 — Build E4ST case DataFrames
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 5 — Build case DataFrames")
println("=" ^ 62)
@printf("  load_scale_factor:         %.2f  (baseline — no demand growth)\n",
        LOAD_SCALE_FACTOR)
@printf("  generation_reserve_margin: %.0f%%  (NERC standard)\n",
        GENERATION_RESERVE_MARGIN * 100)
println()

# Filtered buses
case_buses = filter(r -> r.bus_id in retained_bus_ids, buses_df)
case_buses = copy(select(case_buses,
    :bus_id, :ba_code, :lon, :lat,
    :generation_cap_mw, :load_mw, :role, :is_in_giant_component))
case_buses[!, :load_mw_scaled] = case_buses.load_mw .* LOAD_SCALE_FACTOR
case_buses[!, :is_slack]       = case_buses.bus_id  .== slack_bus_id

# Filtered branches (both endpoints must be in retained set)
case_branches = filter(r ->
    r.from_bus in retained_bus_ids && r.to_bus in retained_bus_ids,
    branches_df)
case_branches = copy(select(case_branches,
    :line_id, :from_bus, :to_bus, :length_km,
    :voltage_assumed_kv, :thermal_mw, :reactance_pu,
    :is_interregional, :is_manual_override,
    :is_eia930_calibrated, :is_density_fill))

# Filtered generators
case_gen = filter(r -> Int(r.bus_id) in retained_bus_ids, gen_df)

@printf("  Case buses:      %d\n", nrow(case_buses))
@printf("  Case branches:   %d\n", nrow(case_branches))
@printf("  Case generators: %d  (%.1f GW total capacity)\n",
        nrow(case_gen), sum(Float64.(case_gen.capacity_mw)) / 1e3)

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6 — Feasibility checks
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 6 — Feasibility checks")
println("=" ^ 62)

failures = String[]

# Build node degree map from case_branches
degree = Dict{Int,Int}(id => 0 for id in case_buses.bus_id)
for row in eachrow(case_branches)
    degree[row.from_bus] = get(degree, row.from_bus, 0) + 1
    degree[row.to_bus]   = get(degree, row.to_bus,   0) + 1
end

# Check 1: no islanded load buses (load_mw > 0 and degree = 0)
islanded_load = filter(
    r -> Float64(r.load_mw) > 0.0 && get(degree, r.bus_id, 0) == 0,
    case_buses)
if nrow(islanded_load) > 0
    msg = "$(nrow(islanded_load)) islanded load buses (load_mw > 0 and degree = 0)"
    println("  FAIL: $msg")
    for r in eachrow(first(islanded_load, 5))
        @printf("    bus_id=%-4d  ba=%-6s  load_mw=%.1f\n",
                r.bus_id, r.ba_code, Float64(r.load_mw))
    end
    push!(failures, msg)
else
    println("  ✓ No islanded load buses")
end

# Check 2a: no negative generator capacities
neg_cap = filter(r -> Float64(r.capacity_mw) < 0.0, case_gen)
if nrow(neg_cap) > 0
    msg = "$(nrow(neg_cap)) generators with negative capacity_mw"
    println("  FAIL: $msg")
    push!(failures, msg)
else
    println("  ✓ No negative generator capacities")
end

# Check 2b: no negative reactances
neg_x = filter(r -> Float64(r.reactance_pu) < 0.0, case_branches)
if nrow(neg_x) > 0
    msg = "$(nrow(neg_x)) branches with negative reactance_pu"
    println("  FAIL: $msg")
    for r in eachrow(first(neg_x, 3))
        @printf("    line_id=%-4d  from=%-4d  to=%-4d  x_pu=%.4f\n",
                r.line_id, r.from_bus, r.to_bus, Float64(r.reactance_pu))
    end
    push!(failures, msg)
else
    println("  ✓ No negative reactances")
end

# Check 3: slack bus present in retained set and degree >= 2
case_bus_id_set = Set(case_buses.bus_id)
if slack_bus_id ∉ case_bus_id_set
    msg = "Slack bus $slack_bus_id not in retained bus set"
    println("  FAIL: $msg")
    push!(failures, msg)
else
    slack_deg = get(degree, slack_bus_id, 0)
    if slack_deg < 2
        msg = "Slack bus $slack_bus_id has degree $slack_deg (minimum 2 required)"
        println("  FAIL: $msg")
        push!(failures, msg)
    else
        @printf("  ✓ Slack bus %d present with degree %d\n", slack_bus_id, slack_deg)
    end
end

# Check 4: all generator bus_ids map to a retained bus
gen_bus_id_set = Set(Int.(case_gen.bus_id))
orphan_gen     = sort(collect(setdiff(gen_bus_id_set, case_bus_id_set)))
if !isempty(orphan_gen)
    msg = "$(length(orphan_gen)) generator bus_ids not in retained bus set"
    println("  FAIL: $msg")
    println("  Orphaned bus_ids: $(orphan_gen[1:min(10,end)])")
    push!(failures, msg)
else
    println("  ✓ All generator bus_ids in retained bus set")
end

println()
println("  " * "─"^58)
if isempty(failures)
    println("  FEASIBILITY CHECK: PASSED  (4 / 4 checks)")
else
    println("  FEASIBILITY CHECK: FAILED  ($(length(failures)) of 4 checks failed)")
    println("  " * "─"^58)
    println()
    for (i, f) in enumerate(failures)
        println("  $i. $f")
    end
    println()
    println("  Halting — broken case not saved.")
    exit(1)
end
println("  " * "─"^58)

# ═════════════════════════════════════════════════════════════════════════════
# STEP 7 — Save
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("STEP 7 — Save  →  $OUTPUT_DIR")
println("=" ^ 62)

buses_out    = joinpath(OUTPUT_DIR, "baseline_case.arrow")
branches_out = joinpath(OUTPUT_DIR, "baseline_branches.arrow")
gen_out      = joinpath(OUTPUT_DIR, "baseline_generators.arrow")

Arrow.write(buses_out,    case_buses)
Arrow.write(branches_out, case_branches)
Arrow.write(gen_out,      case_gen)

@printf("  baseline_case.arrow       : %5d rows  (%5.1f KB)\n",
        nrow(case_buses),    filesize(buses_out)    / 1024)
@printf("  baseline_branches.arrow   : %5d rows  (%5.1f KB)\n",
        nrow(case_branches), filesize(branches_out) / 1024)
@printf("  baseline_generators.arrow : %5d rows  (%5.1f KB)\n",
        nrow(case_gen),      filesize(gen_out)      / 1024)

# Update network_metadata.json — add e4st_case block
meta["e4st_case"] = Dict{String,Any}(
    "status"                  => "built",
    "n_buses_retained"        => nrow(case_buses),
    "n_branches_retained"     => nrow(case_branches),
    "n_generators_retained"   => nrow(case_gen),
    "slack_bus_id"            => slack_bus_id,
    "slack_bus_ba"            => slack_ba,
    "island_filter_min_nodes" => island_min,
    "impedance_assumption"    =>
        "per-mile pu on 100MVA base, see build_nodal_case.jl constants",
    "timestamp"               => string(Dates.now(Dates.UTC)),
    "notebook"                => "build_nodal_case.jl",
)

open(meta_path, "w") do io
    JSON3.pretty(io, meta)
end
println()
println("  Updated network_metadata.json  (e4st_case block written)")

# ═════════════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════════════
println()
println("=" ^ 62)
println("Done.  Nodal case built and saved.")
println("=" ^ 62)
@printf("  Buses retained:      %d / %d\n",  nrow(case_buses),    nrow(buses_df))
@printf("  Branches retained:   %d / %d\n",  nrow(case_branches), nrow(branches_df))
@printf("  Generators retained: %d / %d\n",  nrow(case_gen),      nrow(gen_df))
@printf("  Slack bus:           %d  (%s)\n",  slack_bus_id,        slack_ba)
println("  Ready for:           run_scenario.jl")
println("=" ^ 62)
