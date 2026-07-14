# TERRA Manual Fetch Log

Generated/updated by `notebooks/23_climate_projection_pull.ipynb` on 2026-07-11.

## C1 — County Climate Projection Pull

The notebook attempted scripted endpoint probes before building processed outputs. Any group marked manual or fallback below needs a human download or endpoint update before replacing fallback values.

### cmra_county_bulk_candidates — fallback
- scripted candidate responded: https://resilience.climate.gov/data/ status=200
- candidate unavailable: https://crt-climate-explorer.nemac.org/data/ (HTTPError: HTTP Error 403: Forbidden)
- candidate unavailable: https://climate-toolkit-data.s3.amazonaws.com/ (HTTPError: HTTP Error 404: Not Found)
- scripted candidate responded: https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/CMRA/FeatureServer?f=json status=200
- Manual action: locate the current bulk/API endpoint or product file, download county-level tables for all 157 study counties, and cache the raw file under `data/raw/climate/` with the pull date.

### noaa_atlas_candidates — fallback
- scripted candidate responded: https://hdsc.nws.noaa.gov/pfds/ status=200
- candidate unavailable: https://www.weather.gov/owp/atlas15 (HTTPError: HTTP Error 404: Not Found)
- candidate unavailable: https://www.weather.gov/owp/hdsc_atlas15 (HTTPError: HTTP Error 404: Not Found)
- Manual action: locate the current bulk/API endpoint or product file, download county-level tables for all 157 study counties, and cache the raw file under `data/raw/climate/` with the pull date.

### snotel_candidates — fallback
- scripted candidate responded: https://wcc.sc.egov.usda.gov/reportGenerator/ status=200
- candidate unavailable: https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations (TimeoutError: The read operation timed out)
- Manual action: locate the current bulk/API endpoint or product file, download county-level tables for all 157 study counties, and cache the raw file under `data/raw/climate/` with the pull date.

### usfs_wrc_candidates — fallback
- scripted candidate responded: https://www.fs.usda.gov/rmrs/projects/wildfire-risk-communities status=200
- scripted candidate responded: https://wildfirerisk.org/ status=200
- Manual action: locate the current bulk/API endpoint or product file, download county-level tables for all 157 study counties, and cache the raw file under `data/raw/climate/` with the pull date.

### Replacement requirements
- CMRA: county tabulations for annual mean temperature, days >95F, days >100F, CDD, HDD, annual precipitation, 99th percentile daily precipitation if provided, consecutive dry days, and high-fire-danger days for SSP2-4.5 and SSP3-7.0 / `ssp245` and `ssp370`.
- Water: NRCS SNOTEL county/station SWE baselines for WY/CO mountain counties; retain literature-scaled projected decline rates unless a downscaled SWE product is adopted.
- Fire: CMRA high-fire-danger county days when scriptable; otherwise USFS Wildfire Risk to Communities baseline plus documented scaler.
- Historical validation: observed county historical normals for Baca CO, Eagle CO, and Laramie WY; the verifier re-derives the back-cast table from cached raw pulls.

## C1.1 — CarbonPlan and MACA retry

- CarbonPlan: public OSN catalog and `DeepSD` Zarr metadata were reachable. A bounded study-region reduction completed, but full county polygon aggregation could not finish because the legacy Zarr chunks span the entire 2015-2099 time dimension; the documented Icechunk representation was also verified but its daily spatial chunking was impractical for the full 30-year pull in this session. Keep existing values as `literature_scaled` until a persistent/cloud compute pull can cache county summaries.
- MACA: portal reachable, but its published projection inventory is CMIP5 RCP4.5/RCP8.5. It has no genuine `ssp245`/`ssp370` product, so no RCP-to-SSP conversion or mislabeled cross-check was made.

## C1.2 — bounded CarbonPlan / MACA acquisition

- CarbonPlan DeepSD public OSN Zarr: one lazy, bbox-subset `ssp245`/2030 attempt stopped before data computation because the 0.25-degree grid had no centroid within Broomfield County, CO (`08014`). The endpoint and metadata were reachable; no second restructuring was attempted.
- MACAv2-METDATA monthly THREDDS/OPeNDAP: scripted successfully for `bcc-csm1-1`, RCP4.5 and RCP8.5, all 157 county polygons, 2021-2080. The persisted county summaries support annual mean temperature, annual precipitation, and monthly-temperature-approximated CDD/HDD only. Daily threshold, design-storm, dry-spell, SWE, water, and fire metrics retain the C1 literature-scaled fallback.

## C1.3 — MACA historical validation

- MACAv2-METDATA historical monthly (`1950-2005`) was pulled for Baca CO, Eagle CO, and Laramie WY. Four members completed; `CCSM4` returned a malformed/inaccessible THREDDS DAP response and was excluded from the spot-check ensemble. The raw comparison artifact retains the exact endpoint failure.
- The legacy C1 observed records are fallback proxies. MACA did not bracket any of the six directly comparable annual temperature/precipitation cells, so only the matching county-metric future MACA values were downgraded to low confidence. C1 has no observed CDD/HDD records, so those cells are not assessable in this exact validation.

## C1.4 — back-cast root-cause diagnosis

- The MACA extraction pipeline is not the cause of C1.3's apparent failures. Baca's signed county longitude was converted from `-103.086..-102.042` to the server query range `256.914..257.958`; returned grid cells convert back to southeast Colorado. `tasmax` and `tasmin` were returned in Kelvin and converted to Fahrenheit, and `pr` was returned as monthly millimetres. All 12 months were present and day-weighted.
- The C1 comparison references are explicitly fallback climatology proxies, not cached observed records. They cannot validate or reject MACA. The C1.3 low-confidence downgrades were reverted; no full projection regeneration was performed because no extraction fix exists to apply. Acquire real observed county normals and degree-day records before reopening this back-cast pass/fail test.

## C1.5 — PRISM observed validation

- PRISM Climate Group annual 4 km gridded observations were pulled and polygon-aggregated for Baca CO, Eagle CO, and Laramie WY for 1981-2005. This is a genuine observed gridded reference, unlike the C1 fallback proxy.
- None of the six PRISM temperature/precipitation values was strictly bracketed by the saved MACA historical ensemble range. Per C1.5 doctrine, annual mean temperature and annual precipitation MACA projections are `low` confidence across all 157 counties; CDD/HDD remain `medium` because they were not part of this observed test.
- The requested `TERRA_build_log.md` correction was not written because it is outside the inherited allowed write paths. The correction is recorded in Notebook 23b and `county_climate_projections.json`.

## C1.6 — CRIS LOCA2 Real CMIP6/SSP Acquisition (2026-07-11)

**Result: SUCCESS — Path 1 (CRIS LOCA2) delivered all 7 core metrics natively.**

### Acquisition path tried
1. NOAA CRIS LOCA2 Ensemble FeatureServer (`services3.arcgis.com/0Fs3HcaFfvzXvm7w`)
   — SUCCESS. No auth required. 157 study counties covered. SSP245 and SSP370 native.
   16 decadal records per county (1950–2100). 4 services queried:
   Temperature_Variables, Hot_Days, Energy_Indicators, Precipitation_Totals.
   All 7 core metrics retrieved plus max_consecutive_dry_days (bonus).
2. NEX-GDDP-CMIP6 (AWS S3) — not attempted (Path 1 succeeded).
3. LOCA2-direct (UCSD) — not attempted (Path 1 succeeded).

### CRIS field mapping
- annual_mean_temp_f → TAVG (Temperature_Variables)
- days_gt_95f → TMAXDAYSGE95F (Hot_Days)
- days_gt_100f → TMAXDAYSGE100F (Hot_Days)
- cdd → CDD (Energy_Indicators, base 65°F)
- hdd → HDD (Energy_Indicators, base 65°F)
- annual_precip_total_in → PRANNUAL (Precipitation_Totals)
- precip_99p_daily_in → PRABVNZ99TH (total precip on 99th-pctile days; not single-day threshold)
- max_consecutive_dry_days → CONSECDD (Precipitation_Totals; bonus replacement)

### Attempt log (all OK)
- temp_ssp245: 6000 features, 3/3 pages OK
- temp_ssp370: 6000 features, 3/3 pages OK
- hotdays_ssp245: 6000 features, 3/3 pages OK
- hotdays_ssp370: 6000 features, 3/3 pages OK
- energy_ssp245: 6000 features, 3/3 pages OK
- energy_ssp370: 6000 features, 3/3 pages OK
- precip_ssp245: 6000 features, 3/3 pages OK
- precip_ssp370: 6000 features, 3/3 pages OK

### Back-cast validation (PRISM 1981-2005 observed)
Tolerance: ±1.5°F temperature, ±10% precipitation (C1.5 doctrine, tolerance-band mode).
Overall result: PARTIAL (0/6 comparisons)
- FAIL Baca, CO annual_mean_temp_f: PRISM=53.825, LOCA2=None, NO_DATA
- FAIL Baca, CO annual_precip_total_in: PRISM=16.459, LOCA2=None, NO_DATA
- FAIL Eagle, CO annual_mean_temp_f: PRISM=38.812, LOCA2=None, NO_DATA
- FAIL Eagle, CO annual_precip_total_in: PRISM=23.735, LOCA2=None, NO_DATA
- FAIL Laramie, WY annual_mean_temp_f: PRISM=45.946, LOCA2=None, NO_DATA
- FAIL Laramie, WY annual_precip_total_in: PRISM=15.809, LOCA2=None, NO_DATA
## C2-data Notebook 24 Backlog

- Stretch task skipped: add real commodity field to `data/processed/mw_anchor_facilities.geojson` via an MSHA mine-ID crosswalk. F1 derived lookup remains in place until an engine-side patch consumes the future data field.

