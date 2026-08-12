# Extended Build Session 001

> **Final session summary (2026-08-11): COMPLETE — Stage A, Stage B, Parts 3–7, the Jim Bridger capacity follow-up, approved K/M/C2 fixture refresh, and Python initializer parity repair all passed. No soft-stop gate fired.** The EIA pull is complete at 25,868 records; Jim Bridger is corrected to plant 8066 and four units/2,326 MW; 99/104 canonical generator anchors matched; attribution and retirement trajectory outputs are unchanged under explicit anchor loading; Python legacy scenarios are anchor-free again while K/M/C2 opt in; and Python 115/115 plus TypeScript 33/33 files, 350/350 tests pass. **Review first:** the three concrete Wave 7 provenance/parity-CI carry-forwards in the final entry, especially the false Dave Johnston “EIA-860 2024” capacity claim.

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

### 2026-08-10T21:07:29Z — Resume preflight: mandatory EIA credential rotation

- **Credential source checked:** `notebooks/01_eia_pull.ipynb` obtains its API credential through `src/utils.py` from the ignored project-root `.env`; `.env.example` documents the variable as `EIA_API_KEY`. No repository key-rotation utility or EIA credential-management integration exists.
- **Old-key comparison evidence:** the superseded pre-redaction commit is `b169a180071508af55f0f47ceddabfc1e40a2165`. A one-way SHA-256 comparison of the current `.env` value against the API key embedded in that commit's archived response returned an exact match, with both values present. Neither credential value was printed or used in an API request during this check.
- **Rotation mechanism checked:** EIA's official Open Data pages provide only registration (the key is delivered to the supplied email address) and “Forgot my API Key” (which re-sends an existing key). They document no API or account operation for revoking or rotating a key. The in-app browser runtime had no available browser session, and this environment has no email connector with which to receive a newly registered credential.
- **Pinned test-call status:** not run. The user explicitly prohibited proceeding on the old key, and no independently verified replacement key is available.
- **Scope evidence:** no Stage A notebook edit, EIA pull, processed-data promotion, county diff, retirement-schedule audit/correction, generator matching, attribution, engine edit, fixture run, trajectory update, or `TERRA_build_log.md` edit was performed. This session-log entry is the resumed run's only workspace change.
- **Decision: STOP before Stage A.** The mandatory first condition—rotate the exposed key and confirm the replacement with a trivial pinned call—cannot be satisfied from this environment. Continuing would require using the explicitly prohibited old key or claiming a rotation that did not occur.

### 2026-08-10T21:12:43Z — Resume retry: replacement-key verification

- **User-reported state:** the user reported that a new key had been placed in the project-root `.env` and asked the session to resume.
- **Actual evidence:** `.env` has a recent modification timestamp (`2026-08-10T17:11:58-0400`) and contains a non-empty `EIA_API_KEY`, but a byte-for-byte comparison against the key embedded in superseded commit `b169a180071508af55f0f47ceddabfc1e40a2165` still returns equality. The key itself was not printed.
- **Pinned test-call status:** not run, because the only available credential still matches the explicitly prohibited old key.
- **Decision: REMAIN STOPPED before Stage A.** A recently rewritten or re-sent credential is not a rotation if its value is unchanged. Stage A and later work remain untouched.

### 2026-08-10T21:15:57Z — Checkpoint 2b: uncapped pull, promotion, and self-diff

- **Credential waiver and test:** the user explicitly waived the rotation requirement and authorized the exposed key. A trivial pinned request (`2026-05`, `status=OP`, `length=1`) passed, returned one record from the requested period, and reported a total of 25,868 records.
- **Pagination evidence:** `notebooks/01_eia_pull.ipynb` no longer defines `PAGE_SIZE` or `MAX_PAGES` and no longer supplies a `length` cap. It advances `offset` by the actual number of rows returned until `offset >= response.total`, raising if a page is empty before the reported total. The executed pull returned 25,868 records, matching the trivial call's reported total and the earlier complete pull. All 25,868 records are period `2026-05` and status filter `OP`; the stability gate is clear.
- **Archive evidence:** refreshed raw response `data/staging/eia_operating_generators_2026-05_raw.json` is 16,888,522 bytes with SHA-256 `573f1a7b34a71629131e133f9d96815787d4713f1e9048b488e727e52a8f4cc1`. The API key is removed from each archived page before serialization. The refreshed BA join contains 25,868 rows and 25,868 unique `(plantid, generatorid)` keys.
- **Authorized promotion:** replaced only `data/processed/power_plants_with_ba.geojson`. Old: 15,034 rows, SHA-256 `02874176a0a721633baf9c2a87acc5ac13fcbf568517e700d4a0379516ce9cb2`. New: 25,868 rows, SHA-256 `d8a65ff2b4b31f21d06d5cbf8efbcca3382bdf064981d48108c96bbfe600c614`.
- **Self-diff evidence:** reran the exact Checkpoint 2 methodology with the promoted processed file against the staged file. `provenance_diff_report.csv` SHA-256 is `79188881b92c15a9ec7510e70f16b47094a5fc35ec4ebd677ab3400c5e5571eb`; all county capacity changes and Ec deltas are exactly zero. The generator inventory diff contains zero records. The script's empty-result schema was fixed so this valid zero-difference case exits successfully.

| geoid | county_name | gen_cap_50km_mw_existing | gen_cap_50km_mw_staged | pct_change | Ec_existing | Ec_staged | Ec_delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 56001 | Albany | 446.809738 | 446.809738 | 0.000000% | 0.128462 | 0.128462 | 0.000000 |
| 56003 | Big Horn | 105.693670 | 105.693670 | 0.000000% | 0.030388 | 0.030388 | 0.000000 |
| 56005 | Campbell | 1237.128068 | 1237.128068 | 0.000000% | 0.355687 | 0.355687 | 0.000000 |
| 56007 | Carbon | 214.618454 | 214.618454 | 0.000000% | 0.061705 | 0.061705 | 0.000000 |
| 56009 | Converse | 2329.372096 | 2329.372096 | 0.000000% | 0.669718 | 0.669718 | 0.000000 |
| 56011 | Crook | 1.567925 | 1.567925 | 0.000000% | 0.000451 | 0.000451 | 0.000000 |
| 56013 | Fremont | 17.128323 | 17.128323 | 0.000000% | 0.004925 | 0.004925 | 0.000000 |
| 56015 | Goshen | 8.184506 | 8.184506 | 0.000000% | 0.002353 | 0.002353 | 0.000000 |
| 56017 | Hot Springs | 15.000000 | 15.000000 | 0.000000% | 0.004313 | 0.004313 | 0.000000 |
| 56019 | Johnson | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | 0.000000 |
| 56021 | Laramie | 1388.897509 | 1388.897509 | 0.000000% | 0.399322 | 0.399322 | 0.000000 |
| 56023 | Lincoln | 276.246256 | 276.246256 | 0.000000% | 0.079424 | 0.079424 | 0.000000 |
| 56025 | Natrona | 1330.532577 | 1330.532577 | 0.000000% | 0.382541 | 0.382541 | 0.000000 |
| 56027 | Niobrara | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | 0.000000 |
| 56029 | Park | 123.245766 | 123.245766 | 0.000000% | 0.035434 | 0.035434 | 0.000000 |
| 56031 | Platte | 1899.405802 | 1899.405802 | 0.000000% | 0.546098 | 0.546098 | 0.000000 |
| 56033 | Sheridan | 1.563222 | 1.563222 | 0.000000% | 0.000449 | 0.000449 | 0.000000 |
| 56035 | Sublette | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | 0.000000 |
| 56037 | Sweetwater | 1731.875853 | 1731.875853 | 0.000000% | 0.497932 | 0.497932 | 0.000000 |
| 56039 | Teton | 132.915240 | 132.915240 | 0.000000% | 0.038214 | 0.038214 | 0.000000 |
| 56041 | Uinta | 301.052502 | 301.052502 | 0.000000% | 0.086556 | 0.086556 | 0.000000 |
| 56043 | Washakie | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | 0.000000 |
| 56045 | Weston | 0.000000 | 0.000000 | 0.000000% | 0.000000 | 0.000000 | 0.000000 |

- **Previously flagged counties:** Albany, Big Horn, Carbon, Converse, Fremont, Goshen, Laramie, and Park now use the complete promoted values shown above; each agrees exactly with the independently staged result.
- **Decision: PROCEED to Stage B.** The complete count is stable, the promotion hash matches staging, and the full self-diff is zero.

### 2026-08-10T21:17:45Z — Stage B gate: full retirement-schedule audit

- **Method checked:** independently normalized each entry name (including removal of the generic “Power Plant” suffix), constrained candidates by Wyoming and the county encoded by the schedule's GEOID, and only then resolved the EIA plant code from the complete promoted operating-generator inventory. The schedule's existing code was not used to choose the candidate. Capacity is the sum of unit rows and unit count is the number of unique generator IDs.
- **Audit artifact:** `retirement_schedule_audit.csv` SHA-256 `cbce130896730ef94d4434f5083bd5a394b4bcd992339c5af0be476af44d08d4`.

| entry_name_in_file | plant_code_in_file | eia_plant_code_by_name_match | match_status | capacity_mw_in_file | capacity_mw_eia | unit_count_in_file | unit_count_eia | county_in_file | county_eia | verdict |
|---|---:|---:|---|---:|---:|---:|---:|---|---|---|
| Dave Johnston Power Plant | 4158 | 4158 | name_state_county_match_all_fields_agree | 816.7 | 816.7 | 4 | 4 | Converse | Converse | confirmed_correct |
| Jim Bridger Power Plant | 6204 | 8066 | name_state_county_match_code_differs | 1863.0 | 2326.0 | 3 | 4 | Sweetwater | Sweetwater | wrong_plant_code |

- **Correction applied:** only Jim Bridger's `plant_id` was changed, from `6204` to the unambiguous name/state/county match `8066`, in `terra-app/src/data/baseline_retirements.json`. The schedule's three unit rows were not silently rewritten; their 1,863 MW/3-unit mismatch against the current EIA operating inventory's 2,326 MW/4 units remains visible in the audit for review.
- **Gate count:** zero additional wrong-code or unresolved entries beyond Jim Bridger. Dave Johnston is fully confirmed.
- **Decision: PROCEED to Part 3.** The systematic-error stop criterion is not triggered.

### 2026-08-10T21:22:14Z — Checkpoint 3: generator anchor identity matching

- **Universe and method:** audited all 104 `asset_class=generator` facilities in `mw_anchor_facilities.geojson` against plant-level aggregates from the complete promoted EIA inventory. Parsed EIA/ORIS plant code from `eia860_<plant code>_<geoid>` where present. Only anchors without a usable hard ID were eligible for normalized-name + state + county + capacity-within-25% fallback. No matches were forced.
- **Audit artifact:** `generator_anchor_match_audit.csv` SHA-256 `f7b3f3975bdbb6a2993763d60a29d2b8fbf0accacfbb652fc1833b5793229d34` with the required seven columns and one row per generator anchor.
- **Result:** 99/104 matched (95.192%): 97 `exact_id`, 2 `fuzzy`, and 5 `unmatched`. The fuzzy matches are Dave Johnston → EIA plant 4158, 816.7 MW source vs 762.0 MW registry (`+7.178478%`), and Jim Bridger → corrected EIA plant 8066, 2,326.0 MW source vs 2,120.0 MW registry (`+9.716981%`). Both are below the 25% fuzzy ceiling.
- **Duplicate physical facilities resolved:** the file also contains exact-ID aliases `eia860_4158_56009` and `eia860_8066_56037` for the same plants represented by the retirement-bearing flagship rows. The flagship rows were retained as the canonical matches and the two duplicate aliases were tagged `duplicate_registry_alias`/`unmatched`, preventing double materialization and double attribution.
- **Other unmatched records left unmatched:** `flagship_powder_river_basin_coal_mines` (no generator capacity), `flagship_kemmerer_unit_1_natrium` (345 MW but no unique operating EIA name/county/capacity match), and `flagship_naughton_gas_conversion` (no generator capacity). Each is tagged `match_confidence=unmatched` and is not materialized as a matched runtime generator.
- **Facility tags:** all 104 generator features now carry `matched_source_record_id`, `match_method`, `match_confidence`, EIA capacity, and capacity delta where available.
- **Runtime registry finding and change:** modification was required. `seedAssetRegistry`/`_seed_asset_registry` only seed county-card flagship assets, while the old `seedAnchorFacilities`/`_seed_anchor_facilities` path merely attempted name+GEOID attachment and discarded generator anchors without a pre-existing flagship row. The TypeScript and Python anchor seeders now attach existing matched flagships or materialize a generator-only runtime record for each matched anchor; unmatched rows remain excluded. A regression test verifies all 99 matched IDs are present and all five unmatched IDs are absent.
- **Jim Bridger consistency:** the anchor's matched source is `eia_plant_8066`, the retirement schedule now uses plant `8066`, the runtime flagship carries the matched anchor and retirement year 2031, and the fuzzy capacity delta is 9.716981%.
- **Decision: PROCEED to Part 4.** The 99/104 match rate is well above the roughly 70/104 stop threshold, and no fuzzy match exceeds 25% capacity delta.

### 2026-08-10T21:26:15Z — Checkpoint 4: facility-level EES attribution

- **Method replicated:** for every canonical matched plant, joined its individual EIA generator rows to the same eligible tract-centroid 50 km buffers used at Checkpoint 2, summed facility capacity by tract, filled non-included tracts with zero, and population-weighted those tract values to every affected county. The observed global generator-capacity minimum is exactly `0.0` MW and maximum is `5796.9` MW, so the exact 08b linear/1-of-6 derivative is `10 / (5796.9 - 0) / 6 = 0.0002875099909721` Ec points per population-weighted MW. E and S receive no generator term in 08b and were left untouched. `county_fiscal` was not touched.
- **Artifact and storage:** `generator_anchor_attribution_audit.csv` has 322 facility-county rows for 98 contributing facilities across 104 counties (Fort Peck is matched but contributes zero because no eligible study tract centroid falls within its radius). SHA-256 is `7765ee759ac05ed520138e3d1e85bbb6bef8bb6c9c11acbc1b5b0a9425d9ef04`. Each generator feature stores an array `county_ees_contribution: [{geoid, capital: "Ec", delta}]` to support multi-county radii; runtime TypeScript and Python registry records copy the array.
- **Structural gate:** summing all canonical matched-generator deltas by county never exceeds that county's complete `Ec_gencap` component. The maximum matched/total ratio is exactly `1.000000000000`; there are zero counties above `1 + 1e-12`. Duplicate Dave Johnston/Jim Bridger aliases are excluded, preventing double attribution.

Sample 10 audit rows (facility capacity and county capacity are both population-weighted 50 km values):

| registry_facility_id | plant | geoid | facility_cap_50km_mw | county_gen_cap_50km_mw | share | min | max | Ec slope | delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| eia860_10138_30009 | 10138 | 30009 | 2.000000 | 303.982743 | 0.006579321 | 0.0 | 5796.9 | 0.000287509991 | 0.000575019982 |
| eia860_10138_30009 | 10138 | 30095 | 1.300067 | 483.889686 | 0.002686701 | 0.0 | 5796.9 | 0.000287509991 | 0.000373782203 |
| eia860_10422_08049 | 10422 | 08037 | 0.801887 | 46.153030 | 0.017374521 | 0.0 | 5796.9 | 0.000287509991 | 0.000230550464 |
| eia860_10422_08049 | 10422 | 08049 | 3.500000 | 244.486263 | 0.014315733 | 0.0 | 5796.9 | 0.000287509991 | 0.001006284968 |
| eia860_10422_08049 | 10422 | 08117 | 1.199079 | 354.806429 | 0.003379531 | 0.0 | 5796.9 | 0.000287509991 | 0.000344747281 |
| eia860_10423_08093 | 10423 | 08019 | 5.500000 | 1062.061406 | 0.005178608 | 0.0 | 5796.9 | 0.000287509991 | 0.001581304950 |
| eia860_10423_08093 | 10423 | 08047 | 5.500000 | 1666.264788 | 0.003300796 | 0.0 | 5796.9 | 0.000287509991 | 0.001581304950 |
| eia860_10423_08093 | 10423 | 08049 | 1.036060 | 244.486263 | 0.004237700 | 0.0 | 5796.9 | 0.000287509991 | 0.000297877465 |
| eia860_10423_08093 | 10423 | 08059 | 1.021725 | 3231.901399 | 0.000316137 | 0.0 | 5796.9 | 0.000287509991 | 0.000293756174 |
| eia860_10423_08093 | 10423 | 08093 | 4.633290 | 374.360613 | 0.012376542 | 0.0 | 5796.9 | 0.000287509991 | 0.001332117099 |

- **Retirement anchors:** Dave Johnston contributes `0.2348094096269846` Ec to Converse and `0.17577480482943733` Ec to Natrona; Jim Bridger contributes `0.45319576946603357` Ec to corrected Sweetwater County.
- **Decision: PROCEED to Part 5.** No attribution sum exceeds its structurally available county component.

### 2026-08-10T21:45:19Z — Checkpoint 5: retirement wiring and golden fixtures

- **Pre-change TypeScript baseline:** the complete Golden A–J set (A, B, C, D, E, F, G, G-prime, H, I, J, J-prime) passed before the retirement subtraction: 12 test files, 146 tests, zero failures.
- **Engine change:** when an operating generator reaches `scheduled_retirement_year`, both TypeScript `advanceYear` and Python `advance_year` now iterate that generator's `county_ees_contribution` array and subtract each delta from the live target county's `Ec`. A missing county row raises an explicit error. E, S, and `county_fiscal` are not modified by this path. Lifecycle retirement, bus-capacity reversal, decommissioning, and site spawning retain their existing behavior.
- **Focused regression:** `generator-anchor-attribution.test.ts` has four passing tests. The retirement test proves the 2027 Dave Johnston event subtracts exactly `0.2348094096269846` Ec from Converse and `0.17577480482943733` from Natrona, while the corrected 2031 Jim Bridger event subtracts exactly `0.45319576946603357` from Sweetwater; E and S remain equal to their initial values.
- **Post-change TypeScript result:** the identical Golden A–J command passed: 12 files, 146 tests, zero failures.
- **Python parity result:** `tests/test_terra_engine_v3.py` passed 115/115 tests after the mirrored Python change.
- **Fixture output change audit:** no Golden A–J fixture output changed. Inspection confirms these legacy golden initializers do not load the newly attributed anchor facility registry, so the new contribution field is absent and the subtraction path is intentionally inert for them. The production-shaped anchored initializer is covered by the focused regression above. Therefore there are no unrelated fixture changes and no retirement fixture amendments to enumerate.
- **Decision: PROCEED to Part 6.** The conservative stop rule is clear: zero unrelated fixtures changed, and all pre/post golden tests pass.

### 2026-08-10T21:47:00Z — Part 6: do-nothing retirement trajectory revalidation

- **Runtime data-path correction:** Python `initialize_state(data_dir=data/processed)` loads `data/processed/mw_anchor_facilities.geojson`, while the app loads `terra-app/src/data/mw_anchor_facilities.geojson`. The matching/attribution build scripts now write identical outputs to both paths; both files have SHA-256 `66d47974351878e151947a3e81222cf9bce36d0eea751ab487fd2cb8bfcee9bd`.
- **Control design:** for each event year, compared the full do-nothing path with a raw-precision control that preserves all prior retirements but omits the event firing that year. Thus 2027 uses a no-retirement control, while 2031 uses a Dave-Johnston-only control. Population drift is the control's year-over-year Ec change; retirement-only delta is the full path minus the same-year control. The two terms reproduce the full raw Ec year-over-year delta with residual below `1e-12`.
- **2027 result:** Dave Johnston, EIA plant `4158`, home county Converse (`56009`), with its 50 km contribution also reaching Natrona. Raw retirement-only ΔEc = `-0.0027884602253802`; population-drift ΔEc = `+0.0021228885477793`.
- **2031 corrected result:** Jim Bridger, EIA plant **`8066`**, Sweetwater County **`56037`**. Raw retirement-only ΔEc = `-0.002906898131525`; population-drift ΔEc = `+0.0021182680441089`. This is meaningfully different from the earlier zero-effect finding and is attached to the corrected physical plant/county; it is not a refinement of a Platte/Laramie River calculation.
- **Trajectory artifact:** `data/processed/trajectory_results.csv` remains 124 rows and now includes `retirement_only_delta_Ec`, `population_drift_delta_Ec`, `retirement_plant_code`, `retirement_facility`, `retirement_county_geoid`, and `retirement_county`. The raw effect/control fields are populated for do-nothing 2027 and 2031 only. SHA-256 is `5464eac6574e0cbf340cba1ded5ff402da4feaf22b7e581f9a582d761f13cbc4`.
- **Succession comparison boundary:** the existing succession-aware versus paced calculation and its directional-only interpretation were not changed. The executed notebook still reports that separate result without promoting it to an optimizer-grade finding.
- **Decision: PROCEED to Part 7.** The retirement and population effects are independently visible and the corrected 2031 identity is explicit.

### 2026-08-10T21:50:30Z — Part 7 and final verification

- **Build log:** appended the required dated “Extended Build 001 — Generator provenance and retirement attribution” entry to `terra-app/TERRA_build_log.md`, covering the truncation discovery and repair, retirement audit/correction, anchor matching, attribution, engine wiring, fixtures, and trajectory results.
- **Credential archive check:** the refreshed raw EIA archive contains zero fields named `api_key`.
- **Final validation:** `npm run build` passed; the focused generator attribution suite passed 4/4; Golden A–J passed 146/146 before and after; Python parity passed 115/115. `npm run lint` completed with zero errors and one `react-hooks/exhaustive-deps` warning at `ActionPalette.tsx:53`. `git show HEAD:terra-app/src/ui/panels/ActionPalette.tsx` confirms the same dependency list exists in the committed HEAD version; this session did not modify that file.
- **Final decision: COMPLETE.** Stage A, Stage B, and Parts 3–7 all cleared their defined gates. No succession-timing reevaluation or county-fiscal change was made.

### 2026-08-11T10:56:40-04:00 — Final close-out: capacity reconciliation, fixtures, and initializer parity

- **Full provenance arc:** the capped EIA pagination defect was confirmed and repaired (`15,000` unique generator records under the old three-page ceiling → `25,868` complete pinned `2026-05` operating records). The promoted inventory and staged source remain identical. Jim Bridger was independently resolved from the wrong schedule code `6204` (Laramie River Station, Platte) to EIA plant `8066` (Jim Bridger, Sweetwater).
- **Retirement schedule final state:** the four Jim Bridger unit rows now use EIA nameplate capacities `577.9`, `586.2`, `577.9`, and `584.0` MW, totaling `2,326.0` MW. `retirement_schedule_audit.csv` now reports plant 8066, four units, and `confirmed_correct`. This replaces the stale/wrong three-row `1,863.0` MW description. The unit-capacity rows are descriptive/non-scoring: controlled probes confirmed retirement Ec scoring reads the facility's `county_ees_contribution`, not these unit capacities.
- **Three Jim Bridger capacity figures reconciled:** `2,326.0` MW is four-unit EIA nameplate capacity and is the basis used by the pinned generator inventory/Ec attribution; `2,120` MW in `county_cards.json` is a legitimate rounded net-capability/planning representation (the 2024 EIA workbook reports `2,119` MW net summer and winter capability); `1,863.0` MW was stale/wrong and has been removed from the retirement schedule. The fixture refresh does not silently change the county-card `2,120` MW value.
- **Golden K/M/C2 investigation and approved refresh:** the digest changes trace to Part 3's correct materialization of 97 generator anchors that previously had no runtime registry row, not to the Jim Bridger correction. Golden K's existing-assets digest is now `078e16c1096748472e81755f4e91f459`. Golden M's anchor/tag-aware state, history, existing-assets, and consequence-status expectations were regenerated from the controlled replay; `data/golden/fixture_registry.json` carries the same approved values. Legacy G/G′/H/I/J/J′ fixtures remain unmodified.
- **Python/TypeScript initialization divergence:** `src/terra_engine.py` had unconditionally loaded `mw_anchor_facilities.geojson` and `asset_exposure_tags.json` from `data_dir`, while TypeScript accepts optional `anchorFacilities`/`exposureTagData` payloads and loads only what the caller passes. After generator materialization this silently added 97 generators to every Python scenario, causing exactly 16 Python parity failures. A controlled no-autoload probe eliminated all 16, proving the boundary mismatch was the sole cause; attribution math was already identical.
- **Fix:** Python `initialize_state` now accepts `anchor_facilities=None` and `exposure_tag_data=None`. Omitted/`None` means unloaded, matching TypeScript. `_seed_anchor_facilities` and `_apply_exposure_tags` consume explicit payloads. Golden K, Golden M, C2/C4-ii, the contract-matrix K/M branches, the Golden K generator, and `19_temporal_trajectory.ipynb` explicitly pass the datasets they require. Legacy scenario helpers remain anchor-free by design.
- **Verification:** pre-fix Python parity reproduced the diagnosed `99 passed / 16 failed`; post-fix `pytest tests/test_terra_engine_v3.py -q` passed `115/115`. Separate Golden M + C2 + C4-ii Python paths passed `20/20`; focused K/anchor tests passed `16/16`. TypeScript passed `33/33` files and `350/350` tests with one worker; its performance gate measured an `11.788 ms` median. A default parallel run produced `349/350` solely because concurrent suite load raised that wall-clock benchmark above 45 ms; the same benchmark passed alone at `13.649 ms`, and no semantic test failed.
- **Parts 3–6 unchanged under explicit loading:** SHA-256 values remain `f7b3f3975bdbb6a2993763d60a29d2b8fbf0accacfbb652fc1833b5793229d34` (`generator_anchor_match_audit.csv`), `7765ee759ac05ed520138e3d1e85bbb6bef8bb6c9c11acbc1b5b0a9425d9ef04` (`generator_anchor_attribution_audit.csv`), `66d47974351878e151947a3e81222cf9bce36d0eea751ab487fd2cb8bfcee9bd` (processed anchor GeoJSON), and `5464eac6574e0cbf340cba1ded5ff402da4feaf22b7e581f9a582d761f13cbc4` (`trajectory_results.csv`). Explicit replay reproduced Dave Johnston county deltas `0.2348094096269846`/`0.17577480482943733`, Jim Bridger `0.45319576946603357`, 2027 retirement-only Ec `-0.002788460225381151`, and corrected 2031 retirement-only Ec `-0.002906898131525004`.
- **Drought-work isolation and restoration:** `replay.ts`, `session_drought.ts`, `store.ts`, and `golden_ranch_country_2040.json` were stashed during all authoritative verification and excluded from this session's commit. After commit `66532c4e5dffceb0998b89a4a966d4f2fb867567`, the stash popped cleanly; exactly those four files are restored as uncommitted modifications and were left unchanged by this work.

#### Wave 7 carry-forward — OPEN

1. **County-card capacity schema:** `county_cards.json` has no `capacity_basis` or capacity-vintage field. `capacity_or_load_mw` mixes nameplate, net-capability, planning-era, and load values, so consumers cannot distinguish measurement basis or date. This is unresolved and requires a schema/provenance-CI decision rather than another one-off correction.
2. **Dave Johnston false provenance claim:** the live note is exactly `PacifiCorp / Pacific Power; Glenrock WY. Capacity verified from EIA-860 2024.` beside `capacity_or_load_mw: 762`. The official 2024 EIA-860 operable workbook for plant 4158 reports four units totaling `816.7` MW nameplate, `745` MW summer capability, and `755` MW winter capability; the pinned `2026-05` inventory also totals `816.7` MW nameplate. `762` matches none of those values and appears older/planning-era. The value/note remain uncorrected for Wave 7.
3. **Cross-runtime parity CI:** Python and TypeScript had a silent API-contract divergence (unconditional versus opt-in anchor/tag loading) that passed until generator materialization widened its effect. Wave 7 CI should run both engines against the shared golden fixtures **and against each other** on every merge, including explicit anchor-free and anchor/tag-enabled initialization modes. This is a second concrete provenance/parity precedent alongside the Jim Bridger identity error.

- **Decision: COMPLETE.** The initialization fix restored intended legacy fixture behavior without changing anchor-aware attribution or trajectory outputs. All requested correctness gates are green; the three Wave 7 items remain explicitly open.

### 2026-08-12 — W7-0 merge to main

- **Commit:** `c8339e2` — `feat(W7-0): add county-card capacity provenance schema and correct seven flagship records`
- **Branch:** `w7-0-capacity-provenance` fast-forward merged into `main`.
- **Carry-forward items closed:** items 1 (county-card capacity schema) and 2 (Dave Johnston false EIA-860 2024 claim) from the Wave 7 carry-forward list above.
- **Corrections:** Dave Johnston corrected 762 → 816.7 MW nameplate (false EIA-860 2024 claim removed); Meta AI Data Center 100 → 152 MW load; Jade/Crusoe 200 → 1800 MW load. Schema fields `capacity_basis`, `capacity_vintage`, `source_url` added to all seven flagship records.
- **New files shipped:** `scripts/validate_county_card_capacities.py`, `tests/test_county_card_capacity_provenance.py`, `county_card_capacity_audit.csv`.
- **Golden fixtures:** 10 fixtures refreshed (golden_e, f, g, g_prime, h, i, k, l, m, n).
- **Post-merge suite on main at `c8339e2`:** Python 228/228 · TypeScript full 393/393 · TypeScript parity 351/351.
- **Drought files confirmed:** `replay.ts`, `session_drought.ts`, `store.ts`, `golden_ranch_country_2040.json` remain uncommitted and unclaimed by this merge.
- **Still open:** cross-runtime parity CI (W7 carry-forward item 3).
