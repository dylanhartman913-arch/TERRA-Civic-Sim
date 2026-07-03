# 07_synthetic_topology.ipynb — Outline and Build Plan

**Purpose:** Construct a ~500-bus synthetic transmission network for CONUS with
over-resolution in the Mountain West, using a hybrid population-plus-generation
weighting scheme. Calibrate inter-cluster transmission capacities against
observed EIA-930 interchange flows so that aggregate BA-to-BA transfer
envelopes reproduce historical observations.

**Inputs (existing):**
- `data/processed/power_plants.geojson` — EIA operating generators (notebook 01)
- `data/processed/ba_territories.geojson` — BA polygons (notebook 03a)
- `data/processed/ba_capacity_summary.csv` — capacity MW by BA × fuel_type
- `data/processed/eia930_raw.parquet` — hourly BA interchange (from 03b)
- `data/processed/ba_interchange.csv` — directed BA-pair flow summary
- `data/processed/generators_with_costs.parquet` — cost-augmented generators (02b)
- `data/processed/network_metadata.json` — shared project memory

**Inputs (new, fetched here):**
- US Census TIGER/Line tract shapefiles — via `pygris` or direct TIGER URL
- ACS 5-year population estimates by tract — via Census API or `cenpy`
- Optional: EIA NEMS regions or HIFLD reference networks for validation

**Outputs:**
- `data/processed/synthetic_buses.geojson` — ~500 buses with attributes
  (bus_id, lon, lat, ba_code, cluster_id, population, generation_cap_mw,
  load_mw, role ∈ {"load", "generation", "mixed"})
- `data/processed/synthetic_branches.geojson` — ~800-1200 lines with attributes
  (line_id, from_bus, to_bus, length_km, voltage_assumed_kv, thermal_mw,
  reactance_pu, is_interregional, is_manual_override)
- `data/processed/synthetic_plant_assignments.parquet` — generator → bus_id map
- `data/processed/synthetic_topology_validation.json` — statistical validation
  (degree distribution, line length CDF, capacity-per-load ratios by region)
- `data/processed/figures/synthetic_network_map.html` — Folium interactive map

---

## Notebook Structure

### Cell 1 — Imports and paths

Standard boilerplate matching notebooks 03 and 04. Key imports:
- `geopandas`, `shapely`, `numpy`, `pandas`, `networkx`, `scipy.spatial`
- `sklearn.cluster.KMeans` for weighted clustering
- `folium` for final map visualization
- `pygris` or equivalent for TIGER/Line tract data
- `requests` for Census API
- Load `PROJECT_ROOT` and `PROCESSED` paths from `utils`

### Cell 2 — Configuration constants

All named constants at the top of the notebook, documented for methods section.
These are the knobs a reader might want to verify or challenge.

```python
# ── Bus allocation ─────────────────────────────────────────────────
TARGET_TOTAL_BUSES = 500
MOUNTAIN_WEST_BAS = {"PSCO", "WACM", "PNM", "WAUW", "NWMT", "BPAT",
                     "PACE", "IPCO", "NEVP", "AZPS", "SRP", "EPE"}
MOUNTAIN_WEST_BUS_SHARE = 0.18  # ~90 of 500 buses, oversampling this region

# ── Hybrid weighting (per user decision) ───────────────────────────
# w_cluster = ALPHA * pop_normalized + (1 - ALPHA) * gen_cap_normalized
POP_WEIGHT_ALPHA = 0.45

# Per-BA minimum bus count to avoid degenerate single-bus BAs for
# BAs that have meaningful geography but low pop+gen
MIN_BUSES_PER_BA = 1
MAX_BUSES_PER_BA = 80  # PJM cap

# Wyoming-specific floor: ensure generation geography resolves
WYOMING_BUS_FLOOR = 6  # distributed across WACM territory in WY

# ── Topology generation ────────────────────────────────────────────
DELAUNAY_PRUNE_DISTANCE_KM = 400  # drop Delaunay edges longer than this
LONG_HAUL_PROBABILITY_SCALE_KM = 150  # exponential decay length scale
RANDOM_SEED = 42  # reproducibility

# ── Capacity calibration ───────────────────────────────────────────
# Historical flow percentile used to set inter-BA thermal limits
INTERCHANGE_PERCENTILE = 0.95
# Headroom multiplier applied to historical flows (per prev discussion)
CAPACITY_HEADROOM_MULT = 1.25

# ── Manual overlays (non-negotiable real-world infrastructure) ─────
HVDC_TIES = [
    # (from_ba, to_ba, nominal_mw, name)
    ("BPAT", "CISO", 3100, "Pacific DC Intertie"),
    ("WACM", "SWPP", 200,  "Lamar HVDC"),
    # ... add: Square Butte, CU, Intermountain Power, etc.
]
EHV_BACKBONE_CORRIDORS = [
    # Manually identified 500kV / 765kV corridors from public sources
    # Format: list of (ba_code, rough_centroid) pairs defining corridor path
]
```

### Cell 3 — Load existing project artifacts

Read all existing project files. Validate CRS consistency (EPSG:4326 for
geojson, unproject to EPSG:5070 for distance calculations). Print summary
statistics to confirm data quality before building:
- Total generators, total MW, BA coverage
- EIA-930 corridor count and date range
- BA territory count and area range

### Cell 4 — Fetch Census TIGER/Line tract data

Pull census tract polygons for CONUS (~85k tracts). Two approaches —
pick whichever is more robust at runtime:

**Option A (preferred):** Use `pygris.tracts()` to fetch via the tigris
backend; iterate over states.

**Option B (fallback):** Direct HTTP to
`https://www2.census.gov/geo/tiger/TIGER2023/TRACT/tl_2023_{STATE_FIPS}_tract.zip`,
cache locally in `data/raw/census_tracts/`.

Join with ACS 2022 5-year population estimates (table B01003, total pop)
via Census API. API key goes in `.env` or as env var.

**Output of this cell:** `tracts_gdf` — GeoDataFrame with columns
`[GEOID, STATEFP, COUNTYFP, TRACTCE, population, geometry]` in EPSG:4326.

### Cell 5 — Compute tract-level hybrid weights

For each census tract:
1. Assign to a BA by spatial join with `ba_territories.geojson`
   (handle tracts crossing BA boundaries by assigning to the BA containing
   the tract centroid)
2. Compute `pop_share_within_ba` = tract_pop / sum(ba_pop)
3. Compute `gen_cap_in_tract` by spatial join with `power_plants.geojson`,
   summing `nameplate_capacity_mw` of generators whose centroid falls in tract
4. Compute `gen_share_within_ba` = tract_gen_cap / sum(ba_gen_cap)
5. Compute `hybrid_weight` = `POP_WEIGHT_ALPHA * pop_share + (1 - POP_WEIGHT_ALPHA) * gen_share`

**Sanity check:** sum of hybrid_weight within each BA should be ~1.0.
Print distribution of hybrid weights for Wyoming tracts specifically —
should show the generation-heavy tracts (PRB, Jim Bridger, Kemmerer)
emerging as high-weight even though population is low.

### Cell 6 — Allocate bus counts to BAs

For each BA, determine `k_buses` (number of clusters/buses to create):

```python
# Base allocation proportional to BA load (from existing ba_demand_mw.csv)
base_allocation = TARGET_TOTAL_BUSES * (ba_load / total_load)

# Apply Mountain West oversampling
if ba_code in MOUNTAIN_WEST_BAS:
    base_allocation *= (MOUNTAIN_WEST_BUS_SHARE * TARGET_TOTAL_BUSES /
                        sum(mw_ba_load_shares))

# Apply floors and caps
k_buses = int(np.clip(round(base_allocation), MIN_BUSES_PER_BA, MAX_BUSES_PER_BA))

# Wyoming-specific override: ensure at least WYOMING_BUS_FLOOR buses
# in WY portion of WACM territory (handled in clustering step)
```

Rescale to ensure total = TARGET_TOTAL_BUSES (integer programming or
iterative adjustment). Print the final allocation table showing k_buses
per BA, sorted by Mountain West BAs first for inspection.

### Cell 7 — Weighted k-means clustering within each BA

For each BA independently:

1. Filter tracts to those assigned to this BA
2. Run sklearn `KMeans(n_clusters=k_buses, random_state=RANDOM_SEED)` on
   tract centroids **weighted by hybrid_weight** (use `sample_weight` argument)
3. Store cluster centroids as candidate bus locations
4. Store tract → cluster assignments

**Wyoming handling:** Before clustering WACM, identify tracts within WY
state boundary, ensure k_within_WY >= WYOMING_BUS_FLOOR. If the natural
clustering gives fewer, manually split the largest WY cluster.

**Output:** `synthetic_bus_gdf` with columns:
`[bus_id, ba_code, lon, lat, n_tracts, population, generation_cap_mw]`.

### Cell 8 — Compute per-bus load allocation

Allocate each BA's EIA-930 mean load to buses within that BA,
proportional to the population component of the weight (not the hybrid —
load follows people, not generators):

```python
for ba in ba_list:
    ba_buses = synthetic_bus_gdf[synthetic_bus_gdf.ba_code == ba]
    total_pop = ba_buses.population.sum()
    for bus in ba_buses:
        bus.load_mw = ba_mean_demand[ba] * (bus.population / total_pop)
```

Assign generators to their nearest bus within the same BA
(nearest-neighbor spatial join in EPSG:5070). Store
`synthetic_plant_assignments.parquet`.

Classify buses into roles:
- `"load"` if pop_share > 2 × gen_share
- `"generation"` if gen_share > 2 × pop_share
- `"mixed"` otherwise

### Cell 9 — Delaunay triangulation of bus locations

Project buses to EPSG:5070. Run `scipy.spatial.Delaunay` on bus coordinates
to get candidate edges. Convert simplices to unique edge set. Compute
`length_km` for each candidate edge.

Initial edge count expected: ~3 × n_buses = ~1500 candidate edges.

### Cell 10 — Prune edges with distance-decay probability

Following Birchfield et al. methodology:

```python
def keep_probability(length_km):
    if length_km > DELAUNAY_PRUNE_DISTANCE_KM:
        return 0.0
    return np.exp(-length_km / LONG_HAUL_PROBABILITY_SCALE_KM)

np.random.seed(RANDOM_SEED)
edges_kept = [
    e for e in candidate_edges
    if np.random.random() < keep_probability(e.length_km)
]
```

Check connectivity: use networkx to verify the resulting graph is connected
(or at least that the giant component covers >95% of load). If disconnected,
restore the shortest edges needed to connect components (minimum spanning
tree fallback).

**Expected output:** ~800-1000 edges.

### Cell 11 — Inject manual overlay edges

Add `HVDC_TIES` and `EHV_BACKBONE_CORRIDORS` as forced edges regardless
of Delaunay result. For each manual edge:
1. Find buses nearest the endpoints
2. Add edge if not already present (or update thermal_mw if present)
3. Mark `is_manual_override = True`

Document each manual edge in methods section — these represent the few
dozen lines that make the real grid non-planar and any defensible
synthetic grid must include them explicitly.

### Cell 12 — Assign line attributes

For each edge:

1. **Voltage assumption** based on length and whether interregional:
   - `length_km < 50`: 115 kV (distribution-class urban)
   - `50-200 km`, intra-BA: 230 kV
   - `200+ km` or inter-BA: 345 kV
   - `is_manual_override` EHV: 500 or 765 kV as specified

2. **Reactance** via per-mile assumption from existing future-work doc:
   - 345 kV and below: 0.3 pu per 100 mi on 100 MVA base
   - 500 kV: 0.2 pu per 100 mi
   - 765 kV: 0.15 pu per 100 mi
   - Store as `reactance_pu`

3. **Initial thermal capacity** proportional to voltage squared
   (approximation: SIL scales with V²/Z):
   - 115 kV: 150 MW
   - 230 kV: 500 MW
   - 345 kV: 1200 MW
   - 500 kV: 2500 MW
   - 765 kV: 4500 MW
   - HVDC overrides use specified nominal_mw

### Cell 13 — Calibrate inter-BA aggregate capacity

This is the key internal-consistency step. For each directed BA pair
`(A → B)` in EIA-930:

1. Compute historical `F_max_AB` = 95th percentile of hourly flow from A to B
2. Find all synthetic edges crossing the A-B boundary
   (edges where one endpoint is in BA A and other in BA B)
3. Sum current `thermal_mw` across those edges → `total_synthetic_capacity_AB`
4. Compute scale factor:
   `scale_AB = (F_max_AB × CAPACITY_HEADROOM_MULT) / total_synthetic_capacity_AB`
5. Multiply each crossing edge's `thermal_mw` by `scale_AB`

**Result:** aggregate flow capacity between every BA pair matches historical
(plus headroom), but distributed across the synthetic lines in proportion
to their voltage-based initial allocation. This is the "internally consistent"
calibration that makes BA-level results defensible even though line-level
flows are fictional.

For BA pairs not in EIA-930 (no historical interchange recorded), leave
edges at voltage-based defaults.

### Cell 14 — Statistical validation

Compute validation statistics and compare against published targets from
Birchfield et al. 2017 and real-grid references:

```python
validation = {
    "n_buses": len(synthetic_bus_gdf),
    "n_edges": len(synthetic_branch_gdf),
    "avg_degree": 2 * n_edges / n_buses,        # target: 2.5-3.5
    "max_degree": max_degree,                   # target: <15
    "degree_distribution": list(degree_hist),
    "line_length_km_p50": np.percentile(lengths, 50),  # target: 30-80 km
    "line_length_km_p95": np.percentile(lengths, 95),  # target: 200-400 km
    "mountain_west_bus_count": mw_buses,
    "wyoming_bus_count": wy_buses,
    "capacity_load_ratio_by_ba": {ba: cap/load for ba in bas},
    "total_interregional_thermal_gw": sum_interregional_mw / 1000,
}
```

Print validation report. Flag any statistic outside published ranges
with a warning (doesn't fail the build, but user should review).

Save to `synthetic_topology_validation.json` for methods section.

### Cell 15 — Folium visualization

Build interactive Folium map:
- Bus markers colored by role (load=blue, generation=red, mixed=purple),
  sized by max(load_mw, gen_cap_mw)
- Lines styled by voltage (thickness) and calibration status
  (solid = EIA-930-calibrated, dashed = default)
- Popups: bus attributes, line attributes
- Layer toggle: buses, lines, BA boundaries, generator points
- Save to `data/processed/figures/synthetic_network_map.html`

Include a second static matplotlib figure for the paper showing:
- CONUS map with buses and lines
- Mountain West inset showing the over-resolution
- Legend and scale bar
- Save as `data/processed/figures/synthetic_network_overview.png` at 300 DPI

### Cell 16 — Write outputs and update metadata

Save all outputs:
- `synthetic_buses.geojson` — EPSG:4326
- `synthetic_branches.geojson` — EPSG:4326 with LineString geometry
- `synthetic_plant_assignments.parquet` — generator_id → bus_id map
- `synthetic_topology_validation.json` — validation stats

Update `network_metadata.json` with new keys:
```python
metadata["synthetic_network"] = {
    "n_buses": int,
    "n_edges": int,
    "build_timestamp": iso_timestamp,
    "pop_weight_alpha": POP_WEIGHT_ALPHA,
    "mountain_west_bus_count": int,
    "wyoming_bus_count": int,
    "interchange_percentile": INTERCHANGE_PERCENTILE,
    "capacity_headroom_mult": CAPACITY_HEADROOM_MULT,
    "validation_status": "pass" | "warning",
}
```

Print a final summary table for the user to eyeball before moving on to
notebook 08 (validation deep-dive) or the updated `build_e4st_case.jl`.

---

## Things to watch for during build

1. **Tract-to-BA assignment is fuzzy at BA boundaries.** Some tracts
   physically span BA boundaries. The centroid-based assignment is
   standard but introduces minor error. Document this in methods.

2. **BAs with missing EIA-930 data.** Canadian BAs (BCHA, AESO, HQT),
   Mexican BAs (CFE), and some small utilities aren't in EIA-930.
   Cross-border flows are significant for BPAT, NWMT, WACM. Either
   exclude cross-border flows or use reported annual totals with
   approximated hourly profile.

3. **The random seed matters.** Different seeds give different topologies
   with similar statistics. Commit to one seed for reproducibility.
   Consider generating three seeds and keeping the one with best
   connectivity / validation stats.

4. **Wyoming-specific validation.** After build, manually verify that
   the PRB generation area, the Jim Bridger plant, and the proposed
   Kemmerer SMR site all map to distinct buses (not collapsed into
   one or aggregated with Front Range load). This is the geography
   your dissertation cares about; get it right.

5. **Compute costs.** The full notebook should run in 10-30 minutes on
   a typical machine. If tract-level processing is slow, cache
   intermediates (tract-BA assignments especially) to avoid
   recomputing during iteration.

---
