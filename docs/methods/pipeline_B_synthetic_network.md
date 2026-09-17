# Pipeline B — Synthetic Network & E4ST

**Pipeline status:** Frozen
**Generators:** `notebooks/07_synthetic_topology.ipynb` (network),
`notebooks/03b_ba_interchange.ipynb` (BA flows),
`notebooks/10_eia860_retirements.ipynb` (retirements)
**Runtime files:** 7 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline B

---

## What this pipeline produces

A synthetic 500-bus, 818-branch transmission network representing the Mountain
West interconnection, plus supporting files for plant-to-bus assignments, BA
interchange flows, and generator retirements. The network is used by the engine
to locate energy infrastructure actions on specific buses and by the EES
baseline (Pipeline C) to compute the bus-to-county crosswalk.

| File | Tracked | Generator |
|------|---------|-----------|
| `synthetic_buses.geojson` | yes | nb07 |
| `synthetic_branches.geojson` | yes | nb07 |
| `network_metadata.json` | yes | nb07 + multiple writers (deep-merge) |
| `synthetic_plant_assignments.parquet` | yes (since S10) | nb07 |
| `ba_interchange_summary.csv` | yes | nb03b |
| `ts:initial_network.json` | yes | nb07 (TS-side copy) |
| `ts:baseline_retirements.json` | yes | nb10 |

**Frozen status:** The network and four E4ST oracle scenarios are complete. The
notebooks are restored to `main` (S4) but have not been re-run since spring
2026. Re-running from `main` requires manual downloads (HIFLD substation/
transmission data, BA shapefiles) that are not scripted into the pipeline.

---

## Data sources

### HIFLD (Homeland Infrastructure Foundation-Level Data)

| Field | Value |
|-------|-------|
| Source | U.S. Department of Homeland Security, HIFLD Open Data |
| Datasets used | Electric substations, transmission lines |
| Retrieval | Manual download (FeatureServer); not scripted |
| Vintage | Retrieval date embedded in nb07 execution; not separately recorded |

HIFLD provides the spatial reference for substation locations and transmission
corridor geometry. The data informs bus placement density and edge routing but
is not used directly at runtime — the synthetic network is an abstraction, not
a direct representation of the physical grid.

**Gap:** The exact retrieval date and version of the HIFLD data used in the
current frozen network are not separately recorded outside the notebook
execution environment. The pipeline cannot be re-run from `main` without
re-downloading from HIFLD.

### U.S. Census ACS 2022 5-year

| Field | Value |
|-------|-------|
| Source | U.S. Census Bureau, American Community Survey 5-Year Estimates |
| Vintage | 2022 |
| Resolution | County |
| Used for | Population-weighted bus placement |

County population data drives the `POP_WEIGHT_ALPHA` weighting that balances
population share against generation share when allocating buses to BAs.

### EIA BA Interchange Data

| Field | Value |
|-------|-------|
| Source | EIA-930 (Hourly Electric Grid Monitor) |
| Generator | `notebooks/03b_ba_interchange.ipynb` |
| Output | `ba_interchange_summary.csv` |

BA-to-BA interchange flows are used to set branch capacity ratings between BA
regions. The 95th-percentile interchange flow (`INTERCHANGE_PERCENTILE = 0.95`)
multiplied by a capacity headroom factor determines target branch MW ratings.

### EIA-860 Retirements

| Field | Value |
|-------|-------|
| Source | EIA-860, retirement schedule |
| Generator | `notebooks/10_eia860_retirements.ipynb` |
| Output | `ts:baseline_retirements.json` |

Scheduled and announced retirements from the EIA-860 filing. Used by the
engine to model autonomous decline of existing generation capacity.

---

## Network construction method

`07_synthetic_topology.ipynb` constructs the synthetic network through the
following steps. All parameter values are from nb07 cell 3 and are recorded
in `network_metadata.json` with `_provenance` tags.

### Step 1 — Bus allocation

Buses are allocated across Balancing Authorities (BAs) using a weighted
combination of population share and generation share:

```
weight = α × pop_share + (1 − α) × gen_share
```

where `POP_WEIGHT_ALPHA (α) = 0.45`. This places 45% of the weight on
population density and 55% on generation density. Within each BA, buses are
placed via K-Means clustering on population-weighted county centroids.

| Parameter | Value | Source |
|-----------|-------|--------|
| `TARGET_TOTAL_BUSES` | 500 | nb07 cell 3 |
| `POP_WEIGHT_ALPHA` | 0.45 | nb07 cell 3 |
| `MOUNTAIN_WEST_BUS_SHARE` | 0.18 | nb07 cell 3 (~90 of 500 buses) |
| `WYOMING_BUS_FLOOR` | 6 | nb07 cell 3 |
| `RANDOM_SEED` | 42 | nb07 cell 3 |

The Mountain West region receives an oversampled share (18%) to ensure adequate
resolution in the primary study area. Wyoming specifically receives a floor of
6 buses to guarantee that Wyoming's generation geography resolves (actual: 12
buses per `synthetic_topology_validation.json`).

### Step 2 — Edge construction (Delaunay + probabilistic pruning)

Edges are constructed via Delaunay triangulation of bus locations, then pruned:

1. All edges longer than `DELAUNAY_PRUNE_DISTANCE_KM = 75` km are dropped
   (probability → 0).
2. Remaining edges are kept with probability decaying exponentially:
   `P(keep) = exp(−length / LONG_HAUL_PROBABILITY_SCALE_KM)` where
   `LONG_HAUL_PROBABILITY_SCALE_KM = 150` km.
3. If the surviving edge count falls below `TARGET_EDGE_COUNT = 800`, a
   density enhancement phase adds the shortest remaining candidate edges
   until the target is reached.

The resulting network has 818 edges (slightly above the 800 target due to the
density-fill stopping condition).

**Discrepancy note:** An external methods document (`TERRA_methods_overview.md`,
maintained outside this repo) states `DELAUNAY_PRUNE_DISTANCE_KM = 400`. The
repo code (nb07 cell 3) says 75. **The repo value (75 km) is authoritative.**
The external document may reflect an earlier design iteration. See DECISIONS.md
entry "S5: network_metadata.json reconstruction sourcing" for the full
reconciliation.

### Step 3 — Branch capacity rating

Each branch is assigned a capacity rating based on BA interchange flows:

```
target_rating = max_interchange_flow × CAPACITY_HEADROOM_MULT
```

where `CAPACITY_HEADROOM_MULT = 1.25` and the max interchange flow is the
`INTERCHANGE_PERCENTILE = 0.95` quantile of observed BA-to-BA flows from
EIA-930 data. BA pairs absent from EIA-930 receive a default rating.

### Step 4 — Validation

The notebook produces `synthetic_topology_validation.json` with summary
statistics. The current network carries two validation warnings:

- p50 edge length 92.8 km (outside the 30–80 km target range)
- p95 edge length 166.4 km (outside the 200–400 km target range)

These warnings indicate that the synthetic network's edge length distribution
does not match typical real-grid length characteristics. The `validation_status`
is "warning" (not "fail") — the network is usable for county-level EES analysis
but should not be interpreted as a faithful representation of physical
transmission distances.

---

## Assumptions

1. **500 buses is adequate.** We assume that a 500-bus synthetic network
   provides sufficient spatial resolution for county-level EES scoring. This is
   a modeling abstraction — real transmission networks have orders of magnitude
   more nodes. The synthetic network is not intended to replicate physical power
   flow; it provides a spatial scaffold for locating energy actions.

2. **Population–generation weighting.** The α=0.45 split assumes that load
   centers (proxied by population) and generation centers jointly determine
   where grid infrastructure concentrates. This is a judgment call; the
   sensitivity of downstream results to this parameter has not been formally
   tested.

3. **Edge pruning as topology control.** The 75 km prune distance combined
   with exponential decay and density fill produces a network with specific
   topological properties (mean degree, diameter, clustering). These properties
   are emergent from the parameter choices, not independently validated against
   a real-grid topology benchmark.

4. **Frozen state.** The network is treated as fixed infrastructure. The engine
   does not modify network topology during scenario replay — buses and branches
   are static. New transmission actions add capacity to existing branches or
   create new connections, but the underlying 500-bus geography does not change.

---

## Known gaps

1. **Cannot re-run from `main`.** The pipeline requires manual downloads
   (HIFLD, BA shapefiles) that are not cached in the repo or scripted. A future
   re-run would need to re-acquire these inputs and verify compatibility with
   the current notebook code.

2. **18 missing keys in `network_metadata.json`.** Of these, 3 are
   critical-read keys that will cause KeyError if their consumers run:
   - `island_filter_min_nodes` — read by `julia/build_nodal_case.jl:102`;
     computed at runtime by nb06 (first capacity-retention threshold retaining
     ≥95% of total MW; fallback 50)
   - `validation_deepdive` — read by `julia/build_nodal_case.jl:98`; written
     by the archived `08_validation_deepdive.ipynb`
   - `ecoregion_layer` — read by `notebooks/08c_spatial_hierarchy.ipynb`;
     written by nb08a

   The remaining 15 missing keys are write-only (no downstream consumer reads
   them directly). All 18 keys will repopulate when the full notebook pipeline
   (nb06 → nb07 → nb08a → nb08b → nb08c → nb10 → nb14 → nb16) is re-run.

3. **HIFLD retrieval date not recorded.** The exact vintage of the HIFLD data
   used to construct the current network is not separately documented. The
   retrieval date is embedded in the notebook execution environment, which is
   not preserved.

4. **Validation warnings unresolved.** The p50 and p95 edge length warnings
   are documented but not addressed. The network is used as-is for county-level
   analysis.

5. **External methods doc discrepancy.** `TERRA_methods_overview.md` states
   `DELAUNAY_PRUNE_DISTANCE_KM = 400`; the repo says 75. The repo is
   authoritative. The external doc should be corrected but has not been.
