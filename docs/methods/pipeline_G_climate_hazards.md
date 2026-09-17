# Pipeline G — Climate & Hazards

**Pipeline status:** Current (best-provenanced pipeline)
**Generators:** `notebooks/23c_cmip6_acquisition.ipynb` (CMIP6 climate projections),
`notebooks/24_hazard_exposure_baseline.ipynb` (hazard baseline and C2.1 derivation),
`scripts/generate_population_projections.py` (population projections)
**Runtime files:** 4 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline G

---

## What this pipeline produces

County-level climate projections, a historical climate baseline, hazard risk
summaries, and population projections for the 157-county Mountain West study
area. These files define the exogenous context within which the engine operates
— climate and hazard data are strictly read-only and cannot be modified by
player actions.

| File | Tracked | Generator |
|------|---------|-----------|
| `county_climate_projections.json` | yes | nb23c |
| `county_climate_baseline.json` | yes (LFS) | nb24 |
| `nri_wrc_county_hazard_summary.csv` | yes | nb24 |
| `ts:county_population_projections.json` | yes | `generate_population_projections.py` |

---

## Data sources

### NOAA CRIS LOCA2 Ensemble (CMIP6)

| Field | Value |
|-------|-------|
| Source | NOAA Climate Resilience Information System (CRIS), LOCA2 downscaled ensemble |
| Endpoint | `https://services3.arcgis.com/0Fs3HcaFfvzXvm7w/arcgis/rest/services/` |
| Ensemble | 27-model LOCA2 mean; NCA5 designated primary |
| SSPs | SSP2-4.5 and SSP3-7.0 (native CMIP6 designations, no RCP relabelling) |
| Temporal coverage | 16 decadal records per county, 1950–2100 |
| Spatial coverage | 157 Mountain West study counties |
| Services queried | Temperature_Variables (TAVG/TMAX/TMIN), Hot_Days (TMAXDAYSGE95F/TMAXDAYSGE100F), Energy_Indicators (CDD/HDD), Precipitation_Totals (PRANNUAL/PRABVNZ99TH/CONSECDD) |
| Record count | 48,000 total features (6,000 per service × 4 services × 2 SSPs) |
| Schema | C1.6 |

This is the core climate projection source. An earlier acquisition using
MACAv2-METDATA (CMIP5 RCP proxy) via `notebooks/23b_climate_acquisition.ipynb`
was superseded. A CarbonPlan DeepSD approach was evaluated and abandoned due to
impractical chunk layout.

**`precip_99p_daily_in` note:** The CRIS field `PRABVNZ99TH` is total annual
precipitation on days exceeding the 99th-percentile threshold, not a single-day
exceedance value.

### PRISM Climate Observations (back-cast validation)

| Field | Value |
|-------|-------|
| Source | PRISM Climate Group, 4 km annual gridded observations |
| Vintage | 1981–2005 |
| Cached | `data/raw/climate/prism_c15_observed_county_1981_2005.json` |
| Purpose | Historical validation gate for LOCA2 projections |
| Tolerance | ±1.5°F for temperature, ±10% for precipitation |

Back-cast validation compares LOCA2 historical-period values against PRISM
observations. Result: 5 of 6 metrics pass or partially pass. Eagle County, CO
fails the temperature gate at 2.58°F below PRISM (exceeds the 1.5°F tolerance),
attributed to LOCA2 mountain-county cold bias. The pipeline proceeds under
PARTIAL status for that county.

### IPCC AR6 WG1 Chapter 11 (uncertainty bands)

| Field | Value |
|-------|-------|
| Source | IPCC AR6 WG1 Chapter 11 Atlas, Table Atlas.9; NCA5 Chapter 2 Figs. 2.4–2.7 |
| Used for | p10/p90 uncertainty envelopes derived from published multi-model spread |

The p10/p90 bands are estimated from published IPCC literature, not computed
from individual LOCA2 ensemble member runs. Temperature uses absolute °F
half-ranges; other metrics use fractional half-ranges. Spread scales with
time horizon and SSP forcing. Confidence for these bands is capped at medium
until member-level extraction is feasible.

### FEMA National Risk Index (NRI)

| Field | Value |
|-------|-------|
| Source | FEMA National Risk Index |
| Vintage | v1.20.0, December 2025 |
| Fields used | Risk scores, expected annual loss (EAL), social vulnerability (SoVI), resilience, per-hazard breakdowns (wildfire, flood, drought, heat wave, winter weather, hail, strong wind), annualised frequencies |

### USFS Wildfire Risk to Communities (WRC)

| Field | Value |
|-------|-------|
| Source | USFS Wildfire Risk to Communities |
| Vintage | 2026-04-15 release |
| Fields used | Building-fraction wildfire exposure (me/ie/de), MTBS fire count and acreage 2000–2024 |

### Population Projections

| State group | Source | Vintage | Confidence |
|-------------|--------|---------|------------|
| Wyoming (23 counties) | WY Dept. of Administration & Information, EAD County Population Projections | 2022 | medium |
| Colorado (49 counties) | CO State Demography Office, County Population Projections | 2022 | medium |
| Other states (85 counties) | ACS 2022 5-year trend extrapolation, constant-share-of-state method | 2022 | low |

Working-age share is derived from ACS 2022 Table B01001 (county-level where
available; statewide defaults otherwise).

---

## Processing methodology

### Climate projection processing (nb23c)

1. **CRIS LOCA2 pull.** Four ArcGIS FeatureServer services are queried for each
   of two SSPs, producing eight paginated pulls totalling 48,000 features.

2. **Decadal-to-window averaging.** The 16 CRIS decadal records per county are
   averaged into five 30-year climatology windows (historical, 2035, 2050,
   2065, 2085), each the mean of three representative decades.

3. **Era interpolation.** TERRA era midpoints (2030, 2040, 2050, 2065) are
   derived by linear interpolation between bounding 30-year windows with
   documented weights.

4. **Uncertainty banding.** p10/p90 envelopes are computed as
   `p50 ± IPCC AR6 spread`, where the spread is derived from the published
   multi-model range (not individual LOCA2 member runs). Spread scales with
   time horizon and SSP forcing.

Output: `county_climate_projections.json` (schema C1.6, ~38 MB), containing
30,144 medium-confidence LOCA2 projection records plus 9,744 low-confidence
literature-based records (high fire danger days, water stress index, SNOTEL
SWE baseline/projected) for a total of 39,888 projection records.

### Baseline derivation and hazard summary (nb24)

1. **Baseline back-derivation (C2.1).** The historical climate baseline is
   algebraically inverted from the four-epoch projection surface using the
   epoch doctrine's linear system. The canonical baseline is the mean of the
   SSP2-4.5 and SSP3-7.0 back-derivations.

2. **Delta surface.** `delta = projected_value − historical_baseline` for all
   county × metric × lens × epoch × percentile combinations.

3. **Hazard summary.** NRI risk scores, WRC wildfire data, and MTBS burned-acres
   history are assembled into `nri_wrc_county_hazard_summary.csv` (42 columns
   per county).

---

## Assumptions

1. **Exogeneity.** Climate context is strictly read-only and exogenous to player
   decisions. This is enforced by the `climate-exogeneity.test.ts` suite (six
   tests, EX-1 through EX-6), which verify that `EMPTY_CLIMATE_CONTEXT` is
   immutable and that climate context is bit-identical after `applyAction`,
   `queueAction`, and `advanceYear`, including under divergent action logs.
   The Python engine enforces this structurally: `sample_hazard_events()`
   (`terra_engine.py:158`) deliberately deletes any `state` parameter to
   prevent coupling.

2. **Ensemble mean, not member-level.** p50 is the 27-model LOCA2 ensemble
   mean as directly reported by CRIS. No individual model run data is used.
   This smooths over inter-model structural uncertainty but simplifies the
   projection surface.

3. **Tolerance-band validation.** Back-cast validation uses ±1.5°F / ±10%
   tolerance rather than requiring observed values to fall within the ensemble
   range. This is a planning-level validation, not a strict bracketing
   requirement.

4. **Literature-retained metrics.** Four metrics remain literature-based at
   confidence `low`: `high_fire_danger_days`, `water_stress_index`,
   `snotel_swe_baseline_in`, `snotel_swe_projected_in`. These cannot be
   derived from the CRIS LOCA2 ensemble and are carried as planning-grade
   estimates pending dedicated data pulls.

---

## Known gaps

### Eagle County back-cast failure

LOCA2 historical-period temperature for Eagle County, CO is 2.58°F below PRISM
observations — exceeding the 1.5°F tolerance gate. This is attributed to the
LOCA2 downscaling method's known cold bias in mountain counties. The pipeline
proceeds under PARTIAL status; no correction is applied.

### p10/p90 uncertainty estimation

The p10/p90 envelopes are estimated from published IPCC AR6 literature, not
computed from individual LOCA2 ensemble member runs. This caps confidence at
medium. Computing member-level spread would require accessing 27 individual
model outputs from CRIS or ESGF, which has not been attempted.

### MANUAL_FETCH items

Four climate-related data items remain as manual-fetch requirements (documented
in `docs/methods/MANUAL_FETCH.md`):

| Item | Source | Status |
|------|--------|--------|
| SNOTEL SWE baseline/projected | NRCS SNOTEL | Manual — automated API not attempted |
| High fire danger days | USFS WRC / NIFC | Literature-based fallback |
| NOAA Atlas design storm | NOAA Atlas 14/15 | Manual download required |
| Design storm precipitation | NOAA PFDS | Manual download required |

These items are currently represented by literature-based values at confidence
`low` in the projection output.

### county_climate_baseline.json size

This file is 50+ MB and stored in Git LFS. It was the trigger for the S2 LFS
migration. Size is a function of the county × metric × lens × epoch × percentile
product; no compression or schema reduction has been attempted.
