# ============================================================
#  build_e4st_case.jl  —  ZONAL (copper-plate) version
#
#  Builds a zonal E4ST case with one bus per Balancing Authority.
#  No branch table — each BA is a self-contained dispatch zone.
#  LMPs emerge from zone-level power balance shadow prices.
#
#  Inputs  (data/processed/):
#    ba_capacity_summary.csv       — capacity MW by BA × fuel_type
#    ba_territories.geojson        — BA polygons for centroid lon/lat
#    generators_with_costs.parquet — generator-level MC for national avg
#    network_metadata.json         — updated with zonal model keys
#
#  Outputs (data/processed/e4st_cases/):
#    zonal_buses.arrow      — one row per BA (67 zones)
#    zonal_generators.arrow — one row per (BA, genfuel) pair
# ============================================================

using JSON3, DataFrames, Arrow, CSV, Statistics, Printf, Parquet2

# ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT  = dirname(@__DIR__)
const PROCESSED     = joinpath(PROJECT_ROOT, "data", "processed")
const OUTPUT_DIR    = joinpath(PROCESSED, "e4st_cases")
mkpath(OUTPUT_DIR)

# ── Physical constants ─────────────────────────────────────────────────────────
const TARGET_LOAD_MW = 490_000.0   # national average demand proxy (MW)

# ── Fuel-type → genfuel aggregation ───────────────────────────────────────────
# Keys match the column names in ba_capacity_summary.csv (and fuel_type in the
# generator parquet).  Values are the E4ST genfuel categories.
const FUEL_TO_GENFUEL = Dict{String,String}(
    "Natural Gas"                         => "ng",
    "Gaseous Propane"                     => "ng",
    "Blast-Furnace Gas"                   => "ng",
    "Other Gas"                           => "ng",
    "Coal-Derived Synthesis Gas"          => "ng",
    "Bituminous Coal"                     => "coal",
    "Subbituminous Coal"                  => "coal",
    "Lignite"                             => "coal",
    "Waste Coal"                          => "coal",
    "Refined Coal"                        => "coal",
    "Petroleum Coke"                      => "coal",
    "Disillate Fuel Oil"                  => "oil",
    "Residual Fuel Oil"                   => "oil",
    "Kerosene"                            => "oil",
    "Jet Fuel"                            => "oil",
    "Waste Oil"                           => "oil",
    "Nuclear"                             => "nuclear",
    "Water"                               => "hydro",
    "Wind"                                => "wind",
    "Solar"                               => "solar",
    "Geothermal"                          => "geothermal",
    "Wood Waste Solids"                   => "biomass",
    "Agriculture Byproducts"              => "biomass",
    "Black Liquor"                        => "biomass",
    "Other Biomass Liquids "              => "biomass",
    "Wood Waste Liquids"                  => "biomass",
    "Other Biomass Gases "                => "biomass",
    "Landfill Gas"                        => "biomass",
    "Municipal Solid Waste (All)"         => "biomass",
    "Other"                               => "other",
    "Purchased Steam"                     => "other",
    "Waste Heat"                          => "other",
    "Electricity used for energy storage" => "storage",
)

# E4ST gentype per genfuel
const GENFUEL_TO_GENTYPE = Dict{String,String}(
    "ng"         => "ngcc",
    "coal"       => "coal",
    "oil"        => "oil",
    "nuclear"    => "nuclear",
    "hydro"      => "hydro",
    "wind"       => "wind",
    "solar"      => "solar",
    "geothermal" => "geo",
    "biomass"    => "biomass",
    "storage"    => "battery",
    "other"      => "other",
)

# Short-ton CO₂ per MWh by genfuel (EPA eGRID medians)
const EMIS_CO2 = Dict{String,Float64}(
    "coal"       => 0.9527,
    "ng"         => 0.4050,
    "oil"        => 0.7280,
    "nuclear"    => 0.0,
    "hydro"      => 0.0,
    "wind"       => 0.0,
    "solar"      => 0.0,
    "geothermal" => 0.0,
    "biomass"    => 0.0,
    "storage"    => 0.0,
    "other"      => 0.10,
)

# ═════════════════════════════════════════════════════════════
# STEP 1 — ba_capacity_summary.csv
# ═════════════════════════════════════════════════════════════
println("─" ^ 60)
println("STEP 1 — ba_capacity_summary.csv")
println("─" ^ 60)

ba_cap = CSV.read(joinpath(PROCESSED, "ba_capacity_summary.csv"), DataFrame)
println("  Rows: $(nrow(ba_cap))   Cols: $(ncol(ba_cap))")

fuel_cols = setdiff(names(ba_cap), ["ba_code", "ba_name", "total_mw"])
println("  Fuel-type columns: $(length(fuel_cols))")
@printf("  National total capacity: %.1f GW across %d BAs\n",
        sum(ba_cap.total_mw)/1e3, nrow(ba_cap))

# Only keep BAs with capacity > 0
ba_cap = filter(r -> r.total_mw > 0, ba_cap)
println("  BAs with capacity > 0: $(nrow(ba_cap))")

# Check that all fuel columns map to known genfuel
unmapped = filter(c -> !haskey(FUEL_TO_GENFUEL, c), fuel_cols)
if !isempty(unmapped)
    println("  ⚠  Unmapped fuel_types (will be dropped): $unmapped")
end
mapped_cols = filter(c -> haskey(FUEL_TO_GENFUEL, c), fuel_cols)

# ═════════════════════════════════════════════════════════════
# STEP 2 — ba_territories.geojson → centroid lon/lat per BA
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 2 — ba_territories.geojson → centroids")
println("─" ^ 60)

gj = open(joinpath(PROCESSED, "ba_territories.geojson")) do io
    JSON3.read(io)
end
println("  Features: $(length(gj[:features]))")

function ring_centroid(ring)
    lons = [Float64(p[1]) for p in ring]
    lats = [Float64(p[2]) for p in ring]
    return mean(lons), mean(lats)
end

function geom_centroid(geom)
    gtype = String(geom[:type])
    if gtype == "Polygon"
        return ring_centroid(geom[:coordinates][1])
    elseif gtype == "MultiPolygon"
        # Collect all exterior-ring points across sub-polygons
        all_lon = Float64[]
        all_lat = Float64[]
        for poly in geom[:coordinates]
            for pt in poly[1]
                push!(all_lon, Float64(pt[1]))
                push!(all_lat, Float64(pt[2]))
            end
        end
        return mean(all_lon), mean(all_lat)
    else
        error("Unknown geometry type: $gtype")
    end
end

centroid_map = Dict{String, Tuple{Float64,Float64}}()
for feat in gj[:features]
    p  = feat[:properties]
    bc = String(p[:ba_code])
    lon, lat = geom_centroid(feat[:geometry])
    centroid_map[bc] = (lon, lat)
end
println("  Centroid map built for $(length(centroid_map)) BA codes")

# ═════════════════════════════════════════════════════════════
# STEP 3 — generators_with_costs.parquet → national avg MC
#           by fuel_type (capacity-weighted mean)
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 3 — generators_with_costs.parquet → national avg MC by fuel_type")
println("─" ^ 60)

gen_all = DataFrame(Parquet2.Dataset(joinpath(PROCESSED,
                                              "generators_with_costs.parquet")))
println("  Total generators: $(nrow(gen_all))")

# Capacity-weighted mean MC by fuel_type
mc_by_fuel = Dict{String,Float64}()
for subdf in groupby(gen_all, :fuel_type)
    fuel = coalesce(subdf.fuel_type[1], "Other")
    cap  = coalesce.(subdf.capacity_mw, 0.0)
    mc   = coalesce.(subdf.marginal_cost_per_mwh, 0.0)
    total_cap = sum(cap)
    mc_by_fuel[fuel] = total_cap > 0 ? sum(cap .* mc) / total_cap : 0.0
end

# Aggregate to genfuel level (capacity-weighted)
# This gives the national-average MC for each genfuel category
mc_by_genfuel = Dict{String,Float64}()
cap_by_genfuel = Dict{String,Float64}()
for (fuel, mc_val) in mc_by_fuel
    gf = get(FUEL_TO_GENFUEL, fuel, nothing)
    gf === nothing && continue
    # We need capacity to weight properly — get from ba_cap totals
    total_fuel_cap = fuel ∈ fuel_cols ? sum(ba_cap[!, fuel]) : 0.0
    mc_by_genfuel[gf]  = get(mc_by_genfuel, gf, 0.0)  + mc_val * total_fuel_cap
    cap_by_genfuel[gf] = get(cap_by_genfuel, gf, 0.0) + total_fuel_cap
end
for gf in keys(mc_by_genfuel)
    cap = get(cap_by_genfuel, gf, 0.0)
    mc_by_genfuel[gf] = cap > 0 ? mc_by_genfuel[gf] / cap : 0.0
end

println("  National avg MC by genfuel (capacity-weighted \$/MWh):")
for gf in sort(collect(keys(mc_by_genfuel)))
    @printf("    %-12s  %6.2f \$/MWh\n", gf, mc_by_genfuel[gf])
end

# ═════════════════════════════════════════════════════════════
# STEP 4 — Build zonal generator table
#           One row per (BA × genfuel) pair with capacity > 0
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 4 — Build zonal generator table")
println("─" ^ 60)

total_national_cap = sum(ba_cap.total_mw)

gen_rows = NamedTuple{(:ba_code, :ba_name, :bus_idx, :genfuel, :gentype,
                        :capacity_mw, :marginal_cost_per_mwh, :emis_co2_rate),
                       Tuple{String,String,Int,String,String,Float64,Float64,Float64}}[]

for (bus_idx, row) in enumerate(eachrow(ba_cap))
    ba_code = row.ba_code
    ba_name = row.ba_name

    # Accumulate capacity by genfuel for this BA
    gf_cap = Dict{String,Float64}()
    gf_mc_num = Dict{String,Float64}()   # numerator for capacity-weighted MC
    for fcol in mapped_cols
        cap = row[fcol]
        cap > 0 || continue
        gf = FUEL_TO_GENFUEL[fcol]
        fuel_mc = get(mc_by_fuel, fcol, get(mc_by_genfuel, gf, 0.0))
        gf_cap[gf]   = get(gf_cap, gf, 0.0)   + cap
        gf_mc_num[gf] = get(gf_mc_num, gf, 0.0) + cap * fuel_mc
    end

    for (gf, cap) in gf_cap
        cap > 0 || continue
        mc  = gf_mc_num[gf] / cap          # capacity-weighted avg MC
        mc  = max(0.01, mc)                 # floor: E4ST requires vom > 0
        push!(gen_rows, (
            ba_code               = ba_code,
            ba_name               = ba_name,
            bus_idx               = bus_idx,
            genfuel               = gf,
            gentype               = GENFUEL_TO_GENTYPE[gf],
            capacity_mw           = cap,
            marginal_cost_per_mwh = mc,
            emis_co2_rate         = get(EMIS_CO2, gf, 0.0),
        ))
    end
end

zonal_gen = DataFrame(gen_rows)
println("  Generator rows: $(nrow(zonal_gen))  " *
        "($(length(unique(zonal_gen.ba_code))) BAs × $(length(unique(zonal_gen.genfuel))) fuels)")
println("  Total capacity: $(round(sum(zonal_gen.capacity_mw)/1e3, digits=1)) GW")
println()
println("  Capacity by genfuel (national):")
gf_summary = sort(combine(groupby(zonal_gen, :genfuel),
    :capacity_mw => sum => :cap_gw), :cap_gw, rev=true)
for row in eachrow(gf_summary)
    @printf("    %-12s  %7.1f GW  mc=%.2f \$/MWh\n",
        row.genfuel, row.cap_gw/1e3,
        get(mc_by_genfuel, row.genfuel, 0.0))
end

# ═════════════════════════════════════════════════════════════
# STEP 5 — Build zonal bus table
#           Load from EIA-930 balance data (real observed demand);
#           fall back to capacity-proportional for unmatched BAs.
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 5 — Build zonal bus table")
println("─" ^ 60)

# Load real BA demand from EIA-930 balance data
ba_demand_path = joinpath(PROCESSED, "ba_demand_mw.csv")
ba_demand_raw  = CSV.read(ba_demand_path, DataFrame)
# Build ba_code → mean_demand_mw lookup
eia_demand = Dict{String,Float64}(
    string(row.ba_code) => Float64(row.mean_demand_mw)
    for row in eachrow(ba_demand_raw)
)
println("  Loaded EIA-930 demand for $(length(eia_demand)) BAs")
@printf("  EIA-930 total: %.1f GW\n", sum(values(eia_demand))/1e3)

# Scale EIA-930 values so they sum to TARGET_LOAD_MW.
# This preserves observed relative shares while hitting the model aggregate.
eia_total     = sum(values(eia_demand))
eia_scale     = TARGET_LOAD_MW / eia_total

# Pass 1: assign raw unscaled load to every BA.
# EIA-matched BAs → raw EIA-930 mean demand.
# Unmatched BAs   → capacity-proportional raw value (cap_mw / total_national_cap).
# Pass 2: scale the full vector so Σ load_mw = TARGET_LOAD_MW exactly.
# This preserves the EIA-930 demand shape while hitting the model aggregate.

fallback_bas  = String[]
raw_loads     = Float64[]          # unscaled; indexed by BA order
load_sources  = String[]

for row in eachrow(ba_cap)
    bc = row.ba_code
    if haskey(eia_demand, bc)
        push!(raw_loads,    eia_demand[bc])
        push!(load_sources, "eia930")
    else
        push!(raw_loads,    row.total_mw / total_national_cap)  # unit-less share
        push!(load_sources, "cap_proportional")
        push!(fallback_bas, bc)
    end
end

# Normalise: EIA values are in MW, cap-proportional values are shares (<<1).
# Separate the two groups, scale cap-prop shares to MW, then scale everything.
eia_mask   = load_sources .== "eia930"
cap_mask   = load_sources .== "cap_proportional"
eia_sum_mw = sum(raw_loads[eia_mask])          # total raw EIA demand (MW)
cap_sum_sh = sum(raw_loads[cap_mask])          # total raw cap shares (dimensionless)

# Allocate TARGET_LOAD_MW in proportion to raw EIA totals vs cap-share totals.
# Treat cap shares as if they were MW by assigning them average demand density
# equal to the EIA average (eia_sum_mw / sum(eia_cap)).
# Simple approach: give fallback BAs their cap-proportional share of total target.
cap_total_mw     = sum(ba_cap.total_mw[cap_mask])
eia_total_cap_mw = sum(ba_cap.total_mw[eia_mask])
# Allocate load proportional to capacity share for fallback BAs
fallback_target  = TARGET_LOAD_MW * cap_total_mw / total_national_cap
eia_target       = TARGET_LOAD_MW - fallback_target

eia_scale2 = eia_sum_mw > 0 ? eia_target / eia_sum_mw       : 0.0
cap_scale2 = cap_sum_sh > 0 ? fallback_target / cap_sum_sh  : 0.0

load_mws = Float64[]
for i in eachindex(raw_loads)
    if load_sources[i] == "eia930"
        push!(load_mws, raw_loads[i] * eia_scale2)
    else
        # raw_loads[i] is a dimensionless capacity share (cap_mw / total_national_cap)
        # cap_scale2 = fallback_target_MW / sum_of_shares  →  units: MW/share
        push!(load_mws, raw_loads[i] * cap_scale2)
    end
end

# Cap load at 98% of installed capacity for any zone that would be undersupplied.
# Without transmission, import-dependent BAs (AECI, TEPC, PGE, etc.) cannot
# serve EIA-930 demand from local generation alone.  Capping prevents VOLL
# pricing from dominating those zones.  Rescale all loads to TARGET_LOAD_MW.
cap_by_ba = Dict{String,Float64}(row.ba_code => row.total_mw for row in eachrow(ba_cap))
for i in eachindex(load_mws)
    bc = ba_cap.ba_code[i]
    cap_limit = cap_by_ba[bc] * 0.98
    if load_mws[i] > cap_limit
        load_mws[i] = cap_limit
    end
end
# Re-scale so total still hits TARGET_LOAD_MW exactly
load_sum = sum(load_mws)
load_mws .*= TARGET_LOAD_MW / load_sum

bus_rows = NamedTuple{(:bus_idx, :ba_code, :ba_name, :lon, :lat,
                        :capacity_mw, :load_mw, :load_source),
                       Tuple{Int,String,String,Float64,Float64,Float64,Float64,String}}[]

for (bus_idx, row) in enumerate(eachrow(ba_cap))
    bc       = row.ba_code
    lon, lat = get(centroid_map, bc, (-98.0, 38.0))
    push!(bus_rows, (
        bus_idx     = bus_idx,
        ba_code     = bc,
        ba_name     = row.ba_name,
        lon         = lon,
        lat         = lat,
        capacity_mw = row.total_mw,
        load_mw     = load_mws[bus_idx],
        load_source = load_sources[bus_idx],
    ))
end

zonal_bus = DataFrame(bus_rows)
n_eia    = count(==("eia930"),           zonal_bus.load_source)
n_fallbk = count(==("cap_proportional"), zonal_bus.load_source)
println("  Bus rows: $(nrow(zonal_bus))")
@printf("  Load source: %d from EIA-930, %d capacity-proportional fallback\n",
        n_eia, n_fallbk)
if !isempty(fallback_bas)
    println("  Fallback BAs (no EIA-930 match):")
    for bc in sort(fallback_bas)
        br = filter(r -> r.ba_code == bc, zonal_bus)[1, :]
        @printf("    %-8s  cap=%5.2f GW  load=%5.2f GW (cap-prop)\n",
                bc, br.capacity_mw/1e3, br.load_mw/1e3)
    end
end
println()
@printf("  Total load: %.1f GW  (target = %.1f GW)\n",
        sum(zonal_bus.load_mw)/1e3, TARGET_LOAD_MW/1e3)
println()
println("  Top 10 BAs by load:")
for row in eachrow(first(sort(zonal_bus, :load_mw, rev=true), 10))
    @printf("    %-6s  cap=%7.1f GW  load=%6.1f GW  [%s]\n",
            row.ba_code, row.capacity_mw/1e3, row.load_mw/1e3, row.load_source)
end

# ═════════════════════════════════════════════════════════════
# STEP 6 — Validation
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 6 — Validation")
println("─" ^ 60)

issues = String[]

# Each BA must have capacity ≥ its load
undersupplied = filter(eachrow(zonal_bus)) do row
    ba_gen_cap = sum(filter(r -> r.ba_code == row.ba_code, zonal_gen).capacity_mw;
                     init=0.0)
    if ba_gen_cap < row.load_mw
        @printf("  ⚠  %s: gen=%.1f MW < load=%.1f MW\n",
                row.ba_code, ba_gen_cap, row.load_mw)
        push!(issues, "$(row.ba_code) undersupplied ($(round(ba_gen_cap)) < $(round(row.load_mw)) MW)")
        return true
    end
    return false
end
isempty(undersupplied) && println("  ✓ All BAs have capacity ≥ load")

# MC sanity: check a few key BAs
for bc in ["CISO", "MISO", "ERCO", "PJM"]
    ba_gen = filter(r -> r.ba_code == bc, zonal_gen)
    if nrow(ba_gen) > 0
        cap_w_mc = sum(ba_gen.capacity_mw .* ba_gen.marginal_cost_per_mwh) /
                   sum(ba_gen.capacity_mw)
        @printf("  %-6s avg capacity-weighted MC = %.2f \$/MWh\n", bc, cap_w_mc)
    end
end

# Centroids missing
n_fallback = sum(!(bc in keys(centroid_map)) for bc in zonal_bus.ba_code)
n_fallback > 0 && println("  ⚠  $n_fallback BAs used fallback centroid")
n_fallback == 0 && println("  ✓ All BAs have centroid from geojson")

if isempty(issues)
    println()
    println("  ✓ All validation checks passed.")
else
    println()
    println("  Validation issues ($(length(issues))):")
    for i in issues; println("    $i"); end
end

# ═════════════════════════════════════════════════════════════
# STEP 7 — Save Arrow files
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 7 — Save Arrow files → $OUTPUT_DIR")
println("─" ^ 60)

for (df, name) in [(zonal_bus, "zonal_buses"), (zonal_gen, "zonal_generators")]
    out = joinpath(OUTPUT_DIR, "$name.arrow")
    Arrow.write(out, df)
    @printf("  Saved %-24s : %d rows  (%.1f KB)\n",
            "$name.arrow", nrow(df), filesize(out)/1024)
end

# ═════════════════════════════════════════════════════════════
# STEP 8 — Update network_metadata.json
# ═════════════════════════════════════════════════════════════
println()
println("─" ^ 60)
println("STEP 8 — Update network_metadata.json")
println("─" ^ 60)

meta_path = joinpath(PROCESSED, "network_metadata.json")
meta = open(meta_path) do io JSON3.read(io, Dict{String,Any}) end

meta["model_architecture"] = "zonal_copper_plate"
meta["n_zones"]             = nrow(zonal_bus)
meta["zonal_total_cap_gw"]  = round(sum(zonal_bus.capacity_mw)/1e3, digits=1)
meta["zonal_load_proxy_gw"] = round(sum(zonal_bus.load_mw)/1e3, digits=1)

open(meta_path, "w") do io
    JSON3.pretty(io, meta)
end
println("  Updated network_metadata.json:")
println("    model_architecture : $(meta["model_architecture"])")
println("    n_zones            : $(meta["n_zones"])")
println("    zonal_total_cap_gw : $(meta["zonal_total_cap_gw"])")

println()
println("Done.")
println("  zonal_buses.arrow      : $(nrow(zonal_bus)) rows")
println("  zonal_generators.arrow : $(nrow(zonal_gen)) rows")
