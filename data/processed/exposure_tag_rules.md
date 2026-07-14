# Exposure Tag Rules (C2-data / Notebook 24)

Generated: 2026-07-12. Data-only contract for C2-merge; no registry build path or initializeState changes.

## Sources
- FEMA National Risk Index Counties, December 2025 (1.20.0): `data/raw/fema_nri_counties_dec2025_v1.20.0_pulled_2026-07-12.json`.
- USFS Wildfire Risk to Communities county workbook, `wrc_download_20260415.xlsx`: `data/raw/usfs_wrc_county_20260415_pulled_2026-07-12.xlsx`.
- MTBS Event Tracker Database export-all CSV: `data/raw/mtbs_fires_export_all_pulled_2026-07-12.csv`.
- C1.6 county climate projections schema: `data/processed/county_climate_projections.json`.

## Thresholds
- `wildfire_exposure`: high/med/low by study-county tertiles of WRC `RISK_NATIONAL_RANK`; fallback to FEMA NRI `WFIR_RISKS`.
- `water_dependency`: wet for hydro, coal, nuclear, steam turbine, combined cycle, and explicit Colstrip/Jim Bridger/Craig name matches; dry for generator, mine, industrial_load, commercial_anchor_load, and data_center defaults.
- `flood_zone`: `county_context_high` for top-tertile FEMA NRI `IFLD_RISKS`; otherwise `not_screened_or_low_county_context`. Not a parcel/NFHL determination.
- `heat_sensitivity`: high for top-tertile FEMA NRI `HWAV_RISKS` or data_center/commercial_anchor_load class escalation; medium for nonzero lower-tertile heat risk; low for zero/missing.

## Judgment Calls
Flood tags are county-context screens. Water dependency uses class/name/technology where cooling-system data are absent. MTBS county-year history assigns fires by nearest study-county centroid from ETD event points because perimeter geometry was not available from the current export.

## Covered Anchor Classes
`generator`, `mine`, `industrial_load`, `commercial_anchor_load`, `data_center`, `unclassified_anchor`.

Mechanically consumable output: `data/processed/asset_exposure_tags.json`.
