# Pipeline F — Anchor Facilities & Exposure Tags

**Pipeline status:** Current
**Generators:** `notebooks/22_anchor_facilities.ipynb` (anchor registry),
`notebooks/24_hazard_exposure_baseline.ipynb` (exposure tags);
`anchor_sector_taxonomy.json` is hand-maintained
**Runtime files:** 5 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline F

> **Reviewer note.** This pipeline was the site of F1 — the dual-path capacity
> fork where Python and TypeScript carried different flagship capacity values
> for three facilities. A second instance of the same fork class was found in
> `county_cards.json` flagship capacities (F14) during the EES baseline repair.
> The § F1 defect history section below provides the full chronology, structured
> to match Pipeline C's F2 account.

---

## What this pipeline produces

The anchor facility registry and hazard exposure tags for the 157-county Mountain
West study area. Anchor facilities are the named economic assets (power plants,
mines, data centres, military installations, hospitals) that the engine tracks
individually — they can retire, spawn successors, and generate county-level
economic shocks. Exposure tags are read-only hazard metadata attached to each
asset; they do not participate in any engine digest.

| File | Tracked | Generator |
|------|---------|-----------|
| `mw_anchor_facilities.geojson` | yes | nb22 |
| `ts:mw_anchor_facilities.geojson` | yes | nb22 (byte-identical promotion) |
| `asset_exposure_tags.json` | yes | nb24 |
| `ts:asset_exposure_tags.json` | yes | nb24 (byte-identical promotion) |
| `ts:anchor_sector_taxonomy.json` | yes | hand-maintained |

Both `mw_anchor_facilities.geojson` copies share SHA `7fd936f7` (verified by
the S11 dual-path identity check on every CI run). Both `asset_exposure_tags.json`
copies share SHA `ab45a69d`.

---

## Data sources

### EPA Greenhouse Gas Reporting Program (GHGRP)

| Field | Value |
|-------|-------|
| Source | U.S. EPA, Envirofacts GHGRP facility and emissions tables |
| Endpoint | `https://data.epa.gov/efservice/PUB_DIM_FACILITY/STATE/{ST}/CSV` and `PUB_FACTS_SECTOR_GHG_EMISSION/YEAR/2023/CSV` |
| Vintage | 2023 emissions year |
| Coverage | WY, CO, MT facilities; used for industrial (non-generator) anchor identification |

GHGRP provides facility-level emissions data for large emitters. nb22 uses it to
identify non-generator industrial facilities (refineries, cement plants, chemical
facilities) that are significant economic anchors in their counties. GHGRP-to-EIA
deduplication uses a fuzzy-match threshold (SequenceMatcher ratio >= 0.55) to
avoid double-counting power plants that report under both programs.

### MSHA Mine Safety and Health Data

| Field | Value |
|-------|-------|
| Source | U.S. Mine Safety and Health Administration, Open Government Data |
| Endpoint | `https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip` and `MinesProdYearly.zip` |
| Vintage | Latest production year in dataset |
| Coverage | Active coal, trona, bentonite, and uranium mines in the 157 study counties |

MSHA mine data identifies the extractive-industry anchors. Only active mines in
the four commodity classes relevant to the Mountain West energy transition are
retained.

### BLS Quarterly Census of Employment and Wages (QCEW)

| Field | Value |
|-------|-------|
| Source | U.S. Bureau of Labor Statistics, QCEW |
| Endpoint | `https://data.bls.gov/cew/data/api/2024/a/area/{GEOID}.csv` |
| Vintage | 2024 annual average |
| Coverage | County-level employment by ownership; national US000 baseline for LQ computation |

QCEW provides the government-employment ownership counts used in the sector
taxonomy. Location quotients (LQ) are computed against the national baseline to
identify each county's dominant economic sector.

### Census County Business Patterns (CBP)

| Field | Value |
|-------|-------|
| Source | U.S. Census Bureau, County Business Patterns |
| Endpoint | `https://www2.census.gov/programs-surveys/cbp/datasets/2023/cbp23co.zip` |
| Vintage | 2023 |
| Coverage | County-level employment by 2-digit NAICS; used for sector LQ and gap-fill capacity proxy |

CBP is the primary source for private-sector employment by industry. Some
county/NAICS cells are suppressed ("D"/"S"/"N" flags); employment estimates in
those cells may undercount.

### EIA-860 Power Plants

| Field | Value |
|-------|-------|
| Source | Derived from Pipeline A's pinned EIA-860 inventory (25,868 generators) |
| Input | `data/processed/power_plants_with_ba.geojson` |
| Used for | Generator-class anchor identification (plants >= 100 MW or largest per county) |

The generator-class anchors are drawn from the same pinned inventory that feeds
Pipelines A and C. Plants are included if their total nameplate capacity is
>= 100 MW or if they are the largest plant in their county.

### FEMA National Risk Index (NRI)

| Field | Value |
|-------|-------|
| Source | FEMA National Risk Index |
| Vintage | v1.20.0, December 2025 |
| Cached raw | `fema_nri_counties_dec2025_v1.20.0_pulled_2026-07-12.json` |
| Used for | Hazard risk scores, expected annual loss, and social vulnerability inputs for exposure tags |

### USFS Wildfire Risk to Communities (WRC)

| Field | Value |
|-------|-------|
| Source | USFS Wildfire Risk to Communities |
| Vintage | 2026-04-15 release |
| Cached raw | `usfs_wrc_county_20260415_pulled_2026-07-12.xlsx` |
| Used for | Building-fraction wildfire exposure (me/ie/de) and MTBS fire history (2000–2024) |

### Hand-Curated Tier 1 Anchors

Seven facilities are manually added as Tier 1 (informational) anchors for
Wyoming counties that lack a qualifying data-sourced anchor: Ivinson Memorial
Hospital, University of Wyoming, Banner Health Torrington, F.E. Warren AFB,
Cheyenne Regional Medical Center, Jackson Hole Mountain Resort, Grand Targhee
Resort.

---

## Processing methodology

### Anchor registry assembly (nb22)

1. **Source pulls and caching.** EPA GHGRP, MSHA, BLS QCEW, and Census CBP data
   are fetched and cached locally. GHGRP coordinates are normalised; facilities
   whose reported coordinates fall outside their claimed county polygon are
   reassigned to the county centroid.

2. **Generator anchors.** EIA-860 plants are drawn from the pre-built
   `power_plants_with_ba.geojson`. Inclusion criteria: total nameplate
   capacity >= 100 MW or largest plant in any study county. This produces the
   generator-class anchors.

3. **GHGRP deduplication.** GHGRP subpart-D (power plant) facilities are
   fuzzy-matched against EIA plants (SequenceMatcher ratio >= 0.55) to prevent
   double-counting power plants that report under both programs. GHGRP facilities
   that do not match any EIA plant are retained as industrial anchors.

4. **Mine anchors.** MSHA active mines are filtered to coal, trona, bentonite,
   and uranium commodities within the 157 study counties.

5. **Sector taxonomy.** A 20-category NAICS-2 sector taxonomy
   (`anchor_sector_taxonomy.json`) maps each anchor's industry to a display
   sector with colour tokens. Per-county location quotients are computed from
   CBP employment against the national baseline.

6. **Wyoming coverage gate.** For any of the 23 Wyoming counties lacking a
   Tier 2 (data-sourced) anchor, Tier 1 anchors are promoted to Tier 2 using
   either GHGRP gap-fill or a commercial load proxy (0.012 MW per job from
   CBP 6-digit NAICS employment).

7. **Identity overrides.** Ten counties have hardcoded LQ top-1 overrides where
   QCEW under-observes the known dominant sector (e.g., Campbell County forced
   to mining/extraction, Teton County forced to tourism).

8. **Output.** `mw_anchor_facilities.geojson` (CRS84) and `mw_county_cards.json`
   anchor_facilities / economic_drivers fields.

### Exposure tag assignment (nb24)

1. **County hazard summary.** NRI risk scores, WRC wildfire data, and MTBS
   burned-acres history are assembled into `nri_wrc_county_hazard_summary.csv`
   (shared with Pipeline G).

2. **Tag assignment.** Four exposure tags per asset: `wildfire_exposure`,
   `water_dependency`, `flood_zone`, `heat_sensitivity`. Tags are assigned by
   per-asset lookup (anchor_id), then by asset_class defaults, then None. Wildfire
   exposure uses study-county tertiles with WRC primary and NRI fallback.

3. **Exclusion from digests.** Exposure tags are read-only metadata, excluded from
   all four engine digest surfaces by design (v4.4/C2). They inform the UI
   display but do not affect engine computation.

---

## Assumptions

1. **Tier 1 vs Tier 2 distinction.** Only Tier 2 anchors (those with a non-null
   `asset_class`) are seeded into the engine's asset registry. Tier 1 anchors
   are informational — they appear in the registry GeoJSON but do not participate
   in retirement, succession, or economic-shock modelling.

2. **Zero flow deltas at seeding.** Anchor jobs, output, and valuation are
   already embedded in the observed county baselines (ACS employment, BEA income,
   etc.). Seeded anchors contribute no initial flows — they represent the
   existing economic structure, not an additive contribution.

3. **Fuzzy-match threshold.** The GHGRP-to-EIA deduplication uses a
   SequenceMatcher ratio of 0.55. This is a heuristic; mismatches in either
   direction (false positive matches dropping valid industrial anchors, or
   missed matches double-counting power plants) are possible.

4. **Coordinate centroid fallback.** GHGRP and MSHA facilities whose reported
   coordinates fall outside their claimed county polygon are assigned to the
   county centroid. This loses sub-county spatial precision for those records.

5. **Flood zone confidence.** The `flood_zone` exposure tag uses county-level
   NRI riverine-flood risk scores (RFLD_RISKS), not parcel-level FEMA NFHL
   data. This is a coarse screen, not a property-level assessment.

---

## F1 defect history

This section documents the dual-path capacity fork. It is written in the same
phase-by-phase structure as Pipeline C's F2 account because the two defects
share a root cause (nb14's stale hardcoded `FLAGSHIP_ASSETS` list) and
intersected during the repair.

### Phase 1 — The original fork (pre-Wave 7)

Three flagship facility capacities diverged between the anchor registry
(`mw_anchor_facilities.geojson`) and the county cards (`mw_county_cards.json`).
The anchor registry carried one set of values; nb14's hardcoded
`FLAGSHIP_ASSETS` list (Cell 4f) carried another:

| Facility | Anchor registry | nb14 hardcoded | Source of correct value |
|----------|----------------|---------------|----------------------|
| Dave Johnston Power Plant | 816.7 MW | 762 MW | `mw_anchor_facilities.geojson` (EIA nameplate) |
| Meta AI Data Center | 152 MW | 100 MW | `mw_anchor_facilities.geojson` (load) |
| Jade/Crusoe Campus Phase 1 | 1,800 MW | 200 MW | `mw_anchor_facilities.geojson` (load) |

The divergence arose because nb22 (which produces the anchor registry) was
updated with corrected capacities during W7-0, but nb14 (which produces
county_cards) was never updated. Both files are loaded at runtime — the engine
sees the anchor registry's values for anchor operations and the county cards'
values for UI display, creating a silent inconsistency.

The Python and TypeScript copies of the anchor registry file also diverged:
the TS copy carried the corrected values while the Python copy carried stale
values, or vice versa depending on the stage of the repair. The two copies
were not byte-identical.

### Phase 2 — S6 fix (2026-09-13)

S6 resolved the anchor registry fork:

- Both copies of `mw_anchor_facilities.geojson` (Python and TS) were made
  byte-identical at SHA `7fd936f7`.
- All three flagship capacity values were corrected in both copies.
- Jim Bridger Power Plant received the `capacity_basis` schema fields:
  `capacity_basis="net_summer"`, `capacity_basis_vintage="2024"`, and a
  `capacity_basis_note` documenting that 2024 EIA-860 reports 2,119 MW net
  summer AND net winter capability (both identical), rounded to 2,120 MW
  for county-card planning purposes. See DECISIONS.md "S6: Jim Bridger
  capacity_basis schema choice" for the design rationale.
- Both copies of `asset_exposure_tags.json` were verified byte-identical.

S6 closed F1, F7, and F13 (the three anchor-related findings).

### Phase 3 — F14 second-order regression (2026-09-15)

During S7a (Pipeline C's F2 repair), `14_county_foundation.ipynb` was re-run
to rebuild the EES baseline. This re-run regenerated `mw_county_cards.json`
from nb14's hardcoded `FLAGSHIP_ASSETS` list, which still carried the stale
values (762, 100, 200). The regeneration silently reverted the three capacity
corrections that had been applied during W7-0 and S6.

S7b's Python-to-TypeScript sync (`scripts/sync_county_cards_to_ts.py`) then
propagated the regressed values into `terra-app/src/data/county_cards.json`.
The sync script assumes Python is always authoritative — when the Python
source itself contains a regression, the sync propagates it.

F14 was caught during the S7b post-repair verification. The output files
were patched via `scripts/patch_county_cards_f14.py`, and all golden fixtures
were regenerated on the corrected data. Both test suites pass (226 Python,
351 TS).

### What remains unfixed

**nb14's source code (Cell 4f `FLAGSHIP_ASSETS`) still carries the stale
values (762, 100, 200).** The output files are patched, but the next nb14
re-run will regress again unless the notebook source is also patched. This is
PIPELINES.md backlog item 8 and is carried as an open risk.

### Prevention

The S11 dual-path identity check enforces byte identity between the Python and
TS copies of `mw_anchor_facilities.geojson` on every CI run. A divergence
between the two copies will fail CI before reaching main. The S11 manifest
hash check independently verifies that the on-disk file matches the recorded
SHA-256, catching silent mutation. These checks, combined with the manifest
completeness check and P3 slope check from S12, form the provenance CI layer
that prevents recurrence of F1-class and F2-class defects.

---

## Known gaps

### nb14 FLAGSHIP_ASSETS regression risk

The notebook source for `14_county_foundation.ipynb` (Cell 4f) still contains
stale hardcoded capacity values. The output files are currently correct
(patched by F14), but re-running nb14 from source will silently revert three
flagship capacity values. This is a standing regression risk shared with
Pipeline C.

### Flood zone exposure confidence

The `flood_zone` exposure tag is based on county-level NRI RFLD_RISKS scores,
not parcel-level FEMA National Flood Hazard Layer (NFHL) data. County-level
screening cannot distinguish an asset in a floodplain from one on high ground
within the same county. Confidence for this tag is low.

### API key dependencies

BEA (CAGDP2/CAINC6N) and Census ACS industry-of-worker data require API keys
that were not available during the nb22 data pull. The pipeline fell back to
keyless Census CBP bulk files. CBP provides adequate coverage for the sector
taxonomy but lacks the ownership and government-employment detail that BEA and
ACS industry tables would provide.

### CBP employment suppression

Some county/NAICS cells in CBP are suppressed ("D"/"S"/"N" flags). Employment
estimates in those cells may undercount, affecting location quotient accuracy
for small counties with concentrated industries.

### GHGRP coordinate fallbacks

GHGRP and MSHA facilities whose reported coordinates fall outside their claimed
county polygon are assigned to the county centroid. The number of affected
records is not tracked in the output; sub-county spatial precision is lost for
those assets.
