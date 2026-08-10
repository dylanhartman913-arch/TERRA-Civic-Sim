# Extended Build Session 001

> **Final session summary (2026-08-10): STOPPED at Checkpoint 2.** Parts 0–2 completed; Parts 3–7 were not started because the explicit material-drift gate fired. Review first: the existing processed generator inventory is capped at 15,000 unique generator keys while the pinned complete pull has 25,868, and `baseline_retirements.json` identifies Jim Bridger with EIA plant code `6204` even though both EIA datasets identify `6204` as Laramie River Station; actual Jim Bridger is plant `8066`. No staged data was promoted and no engine/fixture/trajectory/build-log work was performed.

## Checkpoint log

### 2026-08-10T20:50:59Z — Checkpoint 1: pinned source pulls

- **EIA checked:** the API reported `2026-05` as its newest available monthly period. `notebooks/01_eia_pull.ipynb` was reinstated from the last committed pre-pivot lineage and changed to require `start=2026-05`, `end=2026-05`, and operating status `OP`. The executed request returned exactly 25,868 records, all from that period.
- **EIA archive evidence:** `data/staging/eia_operating_generators_2026-05_raw.json` is 16,888,632 bytes with SHA-256 `cf14ff4b1283ca3c7ad563d93ba098ae8a761561c2396d58252aab4343179a36`; retrieval metadata is in `data/staging/eia_operating_generators_2026-05_metadata.json`. The notebook removes EIA's echoed `request.params.api_key` field before archival. Derived output is `data/staging/power_plants.geojson`.
- **HIFLD checked:** the superseded ArcGIS FeatureServer is not archive-enabled (`supportsQueryWithHistoricMoment`, `isDataArchived`, and `archivingInfo` are absent/null). A dated static HIFLD Shapefile item does exist, so the source is not fundamentally live-only: ArcGIS item `17499e6de9104f7288ce2ccc9239bc98`, created/modified 2021-12-08 and containing 71 control-area polygons. `notebooks/03a_ba_territories.ipynb` now downloads that exact item rather than querying the mutable service.
- **HIFLD archive evidence:** `data/staging/hifld_control_areas_2021-12-08_raw.zip` is 23,578,889 bytes with SHA-256 `12296854e38d369ec1aef5eaf4f8eb5ca3bbfba1fa23029893ca1f4815a3c868`; because `*.zip` is intentionally ignored, the committed provenance artifact is `data/staging/hifld_control_areas_2021-12-08_metadata.json` containing the URL, item ID, item timestamp, byte count, member list, and hash. Derived outputs are `data/staging/ba_territories.geojson` and `data/staging/power_plants_with_ba.geojson` (SHA-256 `d8a65ff2b4b31f21d06d5cbf8efbcca3382bdf064981d48108c96bbfe600c614`). The overlay detected 13,661 rows participating in overlapping polygon matches; it retained one annotation per source record so the derived output remains exactly 25,868 generator rows, of which 25,246 matched a boundary and 25,253 carried an EIA BA code. This prevents BA polygon overlap from inflating generation capacity.
- **Rejected source attempt:** PASDA's catalog entry labeled “Control Areas” was downloaded and inspected, but its schema/geometry represented BA operator facilities rather than the required boundary layer. That failed attempt was removed from staging and was not used.
- **Scope check:** no existing processed or baseline data file was overwritten. `data/processed/power_plants_with_ba.geojson` remains 13,807,048 bytes with mtime 2026-04-15 16:26:07 and SHA-256 `02874176a0a721633baf9c2a87acc5ac13fcbf568517e700d4a0379516ce9cb2`; `data/processed/mw_county_ees_summary.csv` remains 6,717 bytes with mtime 2026-06-10 09:20:31 and SHA-256 `465776cf602ae2f8da65d6af031caf25be8f51ce612e6c1fe15a915bc7082f13`. Outside `data/staging/`, this session changed only the two explicitly requested notebooks and this required session log. The pre-session dirty files listed at session start remain owned by the user and untouched by this stage.
- **Decision: PROCEED.** Both pulls are reproducibly pinned (EIA by period; HIFLD by a fixed dated Shapefile item), raw-response evidence is archived, and no trusted processed artifact was modified. The Checkpoint 1 “fundamentally live-only” stop criterion is not triggered.

### 2026-08-10T20:57:23Z — Checkpoint 2: staged-versus-existing county provenance diff

- **Method checked:** reproduced the `08b_ees_baseline.ipynb` generator term exactly: 2020 tract centroids, generator inclusion within a 50 km centroid buffer, summed `capacity_mw`, linear 0–10 min-max normalization across all eligible study-area tracts, division by 6 for the `Ec_gencap` contribution to total Ec, and ACS 2022 population-weighted aggregation from tracts to counties. The original `n_missing <= 3` tract eligibility rule was also reproduced. Fixed ACS inputs were cached at `data/staging/acs_tract_2022_for_provenance.parquet`.
- **Existing-versus-staged source evidence:** existing `data/processed/power_plants_with_ba.geojson` reports period `2026-01`, contains 15,034 rows and 15,000 unique `(plantid, generatorid)` keys. The pinned `2026-05` staged file contains 25,868 rows/unique keys. The last committed `01_eia_pull.ipynb` had `PAGE_SIZE=5000` and `MAX_PAGES=3`, which is direct evidence for the 15,000-record truncation mechanism. The inventory audit found 10,950 staged-only keys, 82 existing-only keys, and 53 capacity/status-changed keys across the full national pull.
- **Output evidence:** `provenance_diff_report.csv` SHA-256 is `77d20de64cb47221fd309d14cc0a00cee7bb06420109b8ac4d7f9cafe743d940`. `data/staging/generator_inventory_diff.csv` contains the record-level inventory audit and has SHA-256 `595614b6917df68bf77795cc5b88450beea24f55aaf4362b3bb0c58af35ac174`.

Full Wyoming diff table (`Ec_*` is the 1/6-weighted Ec contribution, not total county Ec):

| geoid | county_name | gen_cap_50km_mw_existing | gen_cap_50km_mw_staged | pct_change | Ec_existing | Ec_staged | Ec_delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 56001 | Albany | 30.296536 | 446.809738 | 1374.788216% | 0.009739 | 0.128462 | +0.118723 |
| 56003 | Big Horn | 1.691446 | 105.693670 | 6148.717949% | 0.000544 | 0.030388 | +0.029844 |
| 56005 | Campbell | 1237.128068 | 1237.128068 | 0.000000% | 0.397678 | 0.355687 | -0.041991 |
| 56007 | Carbon | 91.989322 | 214.618454 | 133.308009% | 0.029570 | 0.061705 | +0.032135 |
| 56009 | Converse | 1325.972096 | 2329.372096 | 75.672784% | 0.426237 | 0.669718 | +0.243481 |
| 56011 | Crook | 1.567925 | 1.567925 | 0.000000% | 0.000504 | 0.000451 | -0.000053 |
| 56013 | Fremont | 11.800269 | 17.128323 | 45.151974% | 0.003793 | 0.004925 | +0.001131 |
| 56015 | Goshen | 5.268655 | 8.184506 | 55.343375% | 0.001694 | 0.002353 | +0.000660 |
| 56017 | Hot Springs | 15.000000 | 15.000000 | 0.000000% | 0.004822 | 0.004313 | -0.000509 |
| 56019 | Johnson | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | +0.000000 |
| 56021 | Laramie | 850.574879 | 1388.897509 | 63.289270% | 0.273419 | 0.399322 | +0.125903 |
| 56023 | Lincoln | 260.651713 | 276.246256 | 5.982905% | 0.083787 | 0.079424 | -0.004364 |
| 56025 | Natrona | 1128.146526 | 1330.532577 | 17.939695% | 0.362645 | 0.382541 | +0.019896 |
| 56027 | Niobrara | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | +0.000000 |
| 56029 | Park | 29.662929 | 123.245766 | 315.487510% | 0.009535 | 0.035434 | +0.025899 |
| 56031 | Platte | 1899.405802 | 1899.405802 | 0.000000% | 0.610569 | 0.546098 | -0.064471 |
| 56033 | Sheridan | 1.563222 | 1.563222 | 0.000000% | 0.000503 | 0.000449 | -0.000053 |
| 56035 | Sublette | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | +0.000000 |
| 56037 | Sweetwater | 1643.588298 | 1731.875853 | 5.371634% | 0.528335 | 0.497932 | -0.030404 |
| 56039 | Teton | 132.915240 | 132.915240 | 0.000000% | 0.042726 | 0.038214 | -0.004511 |
| 56041 | Uinta | 289.314392 | 301.052502 | 4.057216% | 0.093001 | 0.086556 | -0.006445 |
| 56043 | Washakie | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | +0.000000 |
| 56045 | Weston | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | +0.000000 |

- **Ec material-drift gate:** eight counties exceed 15% relative change in the `Ec_gencap` contribution: Albany +1219.064%, Big Horn +5488.910%, Carbon +108.673%, Converse +57.123%, Fremont +29.825%, Goshen +38.941%, Laramie +46.047%, and Park +271.616%. Linear min-max renormalization also changes counties whose raw capacity did not change (for example Campbell, Platte, Crook, Hot Springs, Sheridan, and Teton each change -10.559%) because the study-area maximum changed.
- **Named Wyoming staged-only records:** 24 generator records across 17 named facilities appear in staged but not existing, and zero Wyoming records appear only in existing. The staged-only facilities are Albany—Boswell Wind (329.8 MW); Carbon—Ekola Flats (250.9), Foote Creek Rim (134.8), Rock Creek Wind (590.0 across two records), and TB Flats (503.2); Converse—Cedar Springs I (200.0), II (200.0), III (133.0), Cedar Springs Wind IV (390.4), and Pioneer Wind Park (80.0); Fremont—Big Sand Draw Plant (8.0 across five records); Laramie—Corriedale Wind Energy (52.5), Roundhouse Renewable Energy II (105.7), Roundhouse Wind Energy Project (226.0 across three records), and South Cheyenne Solar (150.0); Natrona—Anticline Wind (124.3); Sweetwater—Sweetwater Solar (92.0). Given the verified three-page ceiling, staged-only means absent from the truncated file; this audit does not infer that all 17 are newly commissioned.
- **Scheduled-retirement anchor check:** Dave Johnston is stable between existing and staged at EIA plant `4158`, four operating generators, 816.7 MW. Jim Bridger exposes a separate material identity error: `terra-app/src/data/baseline_retirements.json` calls plant `6204` “Jim Bridger” and lists three 621 MW units (1,863 MW), but both existing and staged EIA data identify plant `6204` as **Laramie River Station** in Platte County. Both EIA datasets identify actual **Jim Bridger** as plant `8066` in Sweetwater County, four operating generators totaling 2,326.0 MW. This is directly relevant to the scheduled-retirement attribution work.
- **Plain-language summary:** the trusted county baseline is not sufficiently aligned with the complete pinned generator inventory. The main data gap is systematic truncation, not a small vintage drift, and the Jim Bridger retirement record is keyed to the wrong physical plant.
- **Decision: STOP at Checkpoint 2.** Both clearly-wrong conditions are triggered: multiple counties exceed 15% change in `Ec_gencap`, and a scheduled-retirement anchor has a material identity/capacity discrepancy. Per the session instructions, staged files were **not promoted**; Parts 3–7 were not started.
