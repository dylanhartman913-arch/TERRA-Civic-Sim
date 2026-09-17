# Pipeline H — Agriculture

**Pipeline status:** Current (27.1% low-confidence; D5 domain review not yet conducted)
**Generators:** `notebooks/25_wy_ag_baseline_pull.ipynb` (baseline pull),
`notebooks/26_ag_action_family.ipynb` (action family, schema 3.2→3.3),
`scripts/build_county_ag_engine_baseline.py` (engine baseline)
**Runtime files:** 5 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline H

---

## What this pipeline produces

County-level agricultural baseline data for the 23 Wyoming counties: land use
by class, cattle and forage inventories, federal grazing allotments, rangeland
condition (via RAP invasive cover), agricultural economics, and DOR productive-
value coefficients. The agriculture layer is the fifth capital dimension in
TERRA's five-scale doctrine (after E, Ec, S, and fiscal).

| File | Tracked | Generator |
|------|---------|-----------|
| `wy_county_ag_baseline.json` | yes | nb25 |
| `wy_county_ag_engine_baseline.json` | yes | `build_county_ag_engine_baseline.py` |
| `wy_grazing_allotments.csv` | yes | nb25 |
| `wy_ag_sources.csv` | yes | nb25 |
| `ts:county_ag_baseline.json` | yes | `build_county_ag_engine_baseline.py` (structural transform) |

The TS copy (`county_ag_baseline.json`) is a structural transform of the Python
engine baseline — not byte-identical by design. The Python version carries raw
data plus provenance fields (`consumers`, `fetch_notes`); the TS version carries
the transformed engine-input subset.

---

## Data sources

### Census of Agriculture 2022

| Field | Value |
|-------|-------|
| Source | USDA NASS, Census of Agriculture |
| Endpoint | `https://www.nass.usda.gov/datasets/qs.census2022.txt.gz` |
| Vintage | 2022 (bulk download 2026-07-17, 295 MB) |
| Record count | 9,893 Wyoming county rows extracted |
| Coverage | 23/23 Wyoming counties |
| Used for | Land by use (7 acre classes), cattle inventory, farm operations/producers |

The Census of Agriculture is the primary source for land use, cattle inventory,
and farm operator counts. State-level beef cow totals (681,534 head) are used
to assess county-sum coverage (see § Known gaps for suppression).

### USFS Enterprise Data Warehouse (EDW) Grazing Allotments

| Field | Value |
|-------|-------|
| Source | USFS Enterprise Data Warehouse, National Allotment shapefile |
| Endpoint | `https://data.fs.usda.gov/geodata/edw/edw_resources/shp/S_USA.Allotment.zip` |
| Vintage | 2026-07-19 (50 MB shapefile) |
| Processing | 686 Wyoming allotments extracted via bounding-box filter, centroid-joined to counties |
| Coverage | 22/23 Wyoming counties (Goshen County has no USFS allotments) |

The USFS shapefile provides allotment acreage but **no authorised-AUM field**.
Federal AUM estimates are derived by applying the statewide stocking rate
(30 ac/AUM) to USFS acreage — a rough proxy.

### Rangeland Analysis Platform (RAP) Cover v3

| Field | Value |
|-------|-------|
| Source | Rangeland Analysis Platform, University of Montana / USGS |
| Endpoint | `https://us-central1-rap-data-365417.cloudfunctions.net/coverV3` |
| Vintage | AFG (Annual Forbs & Grasses) cover 1986–2025 |
| Coverage | 23/23 Wyoming counties |
| Auth | None (public Google Cloud Function) |

RAP provides the invasive cover indicator used in the rangeland condition
assessment and the ag action family's invasive treatment pathway.

### Wyoming DOR Agricultural Valuation

| Field | Value |
|-------|-------|
| Source | Wyoming Department of Revenue, Property Tax Division |
| URL attempted | `https://wyo-prop-div.wyo.gov/agricultural` and `dptax.wyo.gov` |
| Vintage | 2026 assessment year |
| Status | **DNS failure during data pull (2026-07-19)** |
| Fallback | Statewide representative values from DOR 2026 agricultural valuation study |

The three DOR productive-value figures used in the ag baseline are **statewide
fallbacks**, not county-level DOR assignments:

| Land class | Statewide value | Actual DOR range |
|-----------|----------------|-----------------|
| Irrigated | $1,767/ac | $589–$3,239/ac |
| Dryland | $376/ac | $134–$617/ac |
| Grazing | $126/ac | $10–$1,006/ac |

The assessment rate is 9.5% per W.S. 39-11-102(b). The uniform figures are a
material simplification — the actual DOR range spans an order of magnitude for
grazing land alone. See DECISIONS.md "S14/S14a: DOR productive values are a
statewide fallback" for the full rationale.

### USDA EQIP Practice 315

| Field | Value |
|-------|-------|
| Source | USDA NRCS, EQIP Practice 315 (Herbaceous Weed Control) |
| URL | Mountain West cost schedules (2023 PDF) |
| Used for | Invasive treatment cost coefficient in the ag action family |

### Sources that could not be retrieved

| Source | URL attempted | Failure mode |
|--------|--------------|-------------|
| BLM Rangeland Administration System | `https://reports.blm.gov/reports/ras` | Web portal only, no CSV/API; `gis.blm.gov` returns 404 |
| Wyoming State Engineer water rights | `https://seoweb.wyo.gov/e-Permit/` | URL changed (404); domain moved |
| BEA CAINC4 farm proprietors income | `https://apps.bea.gov/api/data/` | API key required (error code 1) |
| Wyoming DOR ag valuation (county-level) | `https://wyo-prop-div.wyo.gov/agricultural` | DNS failure on property tax division domain |

---

## Processing methodology

### Baseline pull (nb25)

1. **Source registration.** Nine data sources are registered in
   `wy_ag_sources.csv` with fetch status, vintage, and URL.

2. **County records.** 23 null-safe county records are assembled with fields
   for: land by use (7 acre classes plus residual and reconciliation error),
   cattle and forage, federal AUM estimates, water, RAP invasive cover,
   agricultural economics, and DOR productive-value coefficients.

3. **Credibility gates.** Four credibility-gate checks run during the baseline
   pull: three pass or partially pass; one (irrigated acreage ranking) requires
   investigation.

### Action family extension (nb26)

nb26 extends the action library from schema 3.2 to 3.3 with four agricultural
actions plus `ag_coexistence` coefficients on four energy actions, and a D1
drought event definition. A valuation back-cast gate runs:

```
(irrigated × $1,767 + dryland × $376 + grazing × $126) × 9.5%
```

compared against DOR 2025 actual. Result: **10 of 23 counties within ±25%**
(partial pass). Failures concentrate in counties where BLM data is missing
or USFS acres exceed Census of Agriculture grazing acres. 16 contract tests
pass.

### Engine baseline builder

`scripts/build_county_ag_engine_baseline.py` transforms the baseline JSON into
the compact engine-input format (`county-ag-engine-v1`). It reads
`wy_grazing_allotments.csv` for USFS acreage, applies hardcoded coefficients,
and writes to both `data/processed/` and `terra-app/src/data/`.

### Engine integration

The engine seeds county agriculture at `_seed_county_ag()`
(`terra_engine.py:1754`). Core ag functions: `_refresh_county_ag` (annual
recalculation), `_apply_county_ag_action` (player actions), `_apply_ag_drought_event`
(drought effects), `_advance_county_ag` (treatment decay, drought recovery,
water, forage, cattle, fiscal-linked valuation). Agriculture is the fifth
additive digest surface via `ag_digest()`.

---

## Assumptions

1. **Stocking rate.** A single statewide value of 30 acres per AUM (0.033
   AUM/acre), the midpoint of the NRCS 20–40 ac/AUM range. Applied uniformly
   to all 23 counties. This is acknowledged as the biggest known weakness —
   actual stocking rates vary by 2× or more across counties.

2. **Cattle-forage elasticity.** 0.75 (bounded [0.5, 1.0]). A 20% forage
   drop yields approximately 15% herd reduction. The remainder is absorbed
   through supplemental feed, shorter grazing season, or accepting lower
   weights. This is one of the three domain questions in the D5 review packet.

3. **Single drought tier.** Only D1 (Moderate) drought is activated. Forage
   drops 20%, irrigation demand rises 15%. Severity is scalable 0.5×–2×.
   D2–D4 drought tiers are defined but not activated.

4. **DOR productive values are statewide.** The three productive-value figures
   ($1,767/$376/$126 per acre) are the same for every county. The actual DOR
   range spans an order of magnitude (grazing: $10–$1,006/ac across Land
   Resource Areas). The back-cast gate passes only 10 of 23 counties as a
   direct consequence.

5. **Water proxies.** 2.0 acre-feet diverted / 1.2 acre-feet consumed per
   irrigated acre. These are generic western-state averages from USGS
   estimates, not Wyoming-specific values. All county water fields are null
   (SEO data blocked); the engine uses these planning proxies.

6. **Federal AUM proxy.** USFS authorised-use acres are multiplied by the
   30 ac/AUM stocking rate to estimate federal AUM. The USFS shapefile has
   no authorised-AUM field; this multiplication is a rough proxy.

7. **Invasive reinvasion.** 30% of treated acreage per year reinvades without
   maintenance. This drives the treatment decay in `_advance_county_ag`.

---

## Known gaps

### BLM grazing data — entirely missing

All 23 counties have null BLM authorised AUM. BLM administers more Wyoming
grazing land than USFS. The private/federal AUM split cannot be accurately
computed without BLM data. The statewide federal AUM share (~19% based on
USFS acres alone) materially understates federal reliance in BLM-heavy
counties. This is the single largest data gap in the agriculture pipeline
and is flagged as a cross-pipeline limitation in `docs/methods/index.md`.

### DOR productive values — statewide fallback

County-level DOR productive-value tables — which vary by Land Resource Area
(LRA) and soil class — could not be retrieved because the DOR Property Tax
Division website (`wyo-prop-div.wyo.gov` and `dptax.wyo.gov`) failed DNS
resolution during the AG0 data pull (2026-07-19). Retrieving county-level
tables is a follow-up data-pull item. See DECISIONS.md "S14/S14a: DOR
productive values are a statewide fallback."

### Water rights — null

Wyoming State Engineer e-Permit data could not be retrieved (URL changed,
original returns 404). All county water fields are null. The engine uses
generic western-state water-use proxies (2.0 AF diverted / 1.2 AF consumed
per irrigated acre) rather than observed Wyoming water-rights data.

### Cattle inventory suppression

Three counties (Hot Springs, Laramie, Park) have null cattle counts due to
NASS disclosure suppression. Seven additional counties have suppressed beef
cow data in the Census of Agriculture; the county sum covers only ~75% of
the state total (511,723 of 681,534 head).

### BEA farm proprietors income

BEA CAINC4 farm proprietors income data requires an API key that was not
available during the data pull. This field feeds the fiscal-linked ag
valuation pathway.

### D5 domain review not yet conducted

The forage/rangeland review packet (`docs/review/D5_forage_packet.md`) was
written in S14 and is ready for routing to a rancher or Extension agent, but
the review has not yet been conducted. The packet poses three domain-specific
questions about stocking rates, federal grazing reliance, and drought
destocking timing. Until the review is complete, the agriculture pipeline's
assumptions remain untested by domain expertise. D5 is carried from W7-1
into W7-4.

### Confidence breakdown

| Confidence | Count | Percentage |
|-----------|-------|-----------|
| High | 39 | 6.3% |
| Medium | 414 | 66.7% |
| Low | 168 | 27.1% |
| **Total** | **621** | |

Low-confidence fields concentrate in stocking rate, forage acres, AUM
capacity, BLM allotments, and water. For comparison, the fiscal pipeline
(Pipeline E) runs ~44% low-confidence.
