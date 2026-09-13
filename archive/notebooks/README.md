# Archived Notebooks

These notebooks were removed from `notebooks/` in commit 35120e7 (2026-07-20) as part of the Wave 4 pivot. They are preserved here rather than lost permanently. None of them are runtime generators for currently-loaded data files.

| Notebook | Reason archived |
|---|---|
| `02_hifld_pull.ipynb` | Pre-pivot HIFLD data pull; superseded by `03a_ba_territories.ipynb` + staging pipeline |
| `02b_generator_costs.ipynb` | Pre-pivot generator cost assembly; superseded by `06_generator_costs.ipynb` |
| `03_network_build.ipynb` | Pre-pivot network build; superseded by `07_synthetic_topology.ipynb` |
| `04_osm_transmission.ipynb` | OSM transmission pull; `osm_transmission_hv.geojson` not loaded at runtime by any tracked script |
| `05_projections.ipynb` | Pre-pivot projections; covered by `scripts/generate_population_projections.py` |
| `06_lmp_map.ipynb` | Pure visualization — no tracked consumer references its output |
| `07_dispatch_viz.ipynb` | Pure visualization — no tracked consumer references its output |
| `07_lmp_map.ipynb` | Pure visualization — no tracked consumer references its output |
| `08_dispatch_mix.ipynb` | Analysis/visualization only; no output file loaded at runtime |
| `08_scenario_compare.ipynb` | Analysis/visualization only; no output file loaded at runtime |
| `08_validation_deepdive.ipynb` | Validation analysis only; no output file loaded at runtime |
| `09_lmp_comparison.ipynb` | Pure visualization — no tracked consumer references its output |
| `09_scenario_comparison.ipynb` | Analysis/visualization only; no output file loaded at runtime |
| `09a_scenario_precharacterize.ipynb` | Preprocessing analysis only; no output file loaded at runtime |
| `11_applied_scenario.ipynb` | Applied scenario analysis; no output file loaded at runtime |
| `11_hourly_profiles.ipynb` | Hourly profile analysis; no output file loaded at runtime |
| `11b_scenario_map.ipynb` | Pure visualization — no tracked consumer references its output |
| `12_availability_factors.ipynb` | Availability factor analysis; data baked into `network_metadata.json`, not a standalone runtime file |
| `13_candidate_generators.ipynb` | Candidate generator analysis; data baked into `network_metadata.json`, not a standalone runtime file |
| `23_climate_projection_pull.ipynb` | Pre-pivot climate pull; superseded by `23c_cmip6_acquisition.ipynb` |
| `23b_climate_acquisition.ipynb` | Pre-pivot climate acquisition; superseded by `23c_cmip6_acquisition.ipynb` |
