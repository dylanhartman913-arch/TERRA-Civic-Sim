# Pipeline C — EES Capital Baseline

**Pipeline status:** Current (with caveats — see § Known gaps)
**Generators:** `notebooks/08b_ees_baseline.ipynb` (tract EES scores),
`notebooks/08c_spatial_hierarchy.ipynb` (crosswalks),
`notebooks/14_county_foundation.ipynb` (county cards and county-level EES)
**Runtime files:** 10 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline C

> **Reviewer note.** This pipeline was the site of F2 — the project's most
> consequential data defect, involving an 11.8% normalization slope mismatch
> that persisted for over three months before detection. The § F2 defect
> history section below provides the full chronology. A second-order regression
> (F14) was caught during the repair. Both are documented precisely because
> this is the pipeline where overclaiming would be most damaging.

---

## What this pipeline produces

The Environmental (E), Economic (Ec), and Social (S) capital baseline scores
for the 157-county Mountain West study area. These scores are the starting
condition for every scenario the engine runs — they define where each county
begins on each capital dimension before any player actions or exogenous shocks
are applied.

| File | Tracked | Generator |
|------|---------|-----------|
| `county_ees_baseline.json` | yes | nb08b + nb14 |
| `mw_county_ees_summary.csv` | yes | nb08b + nb14 |
| `mw_ecoregion_ees_summary.csv` | yes | nb08b |
| `county_crosswalk.parquet` | yes | nb08c |
| `spatial_hierarchy_counties.parquet` | **no** (local only) | nb08c |
| `spatial_hierarchy_huc8.parquet` | **no** (local only) | nb08c |
| `mw_county_cards.json` | yes | nb14 |
| `ts:county_ees_baseline.json` | yes | nb08b + nb14 (byte-identical to Python copy) |
| `ts:county_cards.json` | yes | nb14 (structural transform, not byte-identical) |
| `ts:county_crosswalk.json` | yes | nb08c (format transform: parquet → JSON) |

---

## Data sources

### U.S. Census ACS 2022 5-Year Estimates

| Field | Value |
|-------|-------|
| Source | U.S. Census Bureau, American Community Survey 5-Year Estimates |
| Vintage | 2022 |
| Resolution | Census tract (for scoring) and county (for aggregation) |
| Tables used | Various — income, employment, poverty, vacancy, government employment (C24060) |
| Retrieval | Census API via nb08b |

ACS tract-level data provides the demographic and economic indicators for E,
Ec, and S scoring. The cached tract file is `data/staging/acs_tract_2022.parquet`
(~20 MB).

**Government employment note:** Government employment is drawn from ACS table
C24060 (class of worker, rows 5+6+7), which captures all government workers
regardless of the industry they work in. This is distinct from table C24050
(industry sector, row 3 = Agriculture), which would capture only workers in
a specific industry. The choice of C24060 is deliberate and documented in
`network_metadata.json` `ees_baseline.scoring_notes`.

### TIGER 2020 Census Tract Shapefiles

| Field | Value |
|-------|-------|
| Source | U.S. Census Bureau, TIGER/Line Shapefiles |
| Vintage | 2020 |
| Used for | Tract geometry for spatial joins and county aggregation |

### EIA Power Plants 2024

| Field | Value |
|-------|-------|
| Source | Derived from Pipeline A's pinned EIA-860 inventory (25,868 generators) |
| Used for | Ec_gencap sub-indicator (generator capacity within 50 km of each tract) |

The Ec_gencap indicator measures the density of electricity generation capacity
near each census tract. It is one of six Ec sub-indicators and is the component
that was affected by the F2 defect (see § F2 defect history).

### HIFLD FeatureServer

| Field | Value |
|-------|-------|
| Source | HIFLD Open Data, via ArcGIS FeatureServer |
| Datasets | Hospitals (layer for S indicator), Colleges (layer for `has_university` flag) |
| Retrieval | Live fetch during nb08b execution |

HIFLD data is fetched live each time nb08b runs. The current baseline was
built on 2026-09-13 (S7a). Reachability was confirmed before execution:
Hospitals 200, Colleges 200.

### EPA Level III Ecoregions

| Field | Value |
|-------|-------|
| Source | U.S. Environmental Protection Agency, Level III Ecoregions |
| Coverage | 7 ecoregions in the study area |
| Used for | E (environmental) structural prior via `eco_base_score` |

---

## Scoring methodology

### Tract-level scoring (nb08b)

Each census tract receives E, Ec, and S scores on a 0–10 scale. The scoring
proceeds as follows:

1. **Indicator extraction.** Raw indicator values are pulled from ACS tract
   data, HIFLD, and the generator inventory.
2. **Normalization.** Each indicator is normalized to a 0–10 scale using the
   Mountain West distribution (i.e., the min/max or percentile bounds are
   computed across all tracts in the 157-county study area, not nationally).
3. **Exclusion rule.** Tracts with more than 3 missing indicators are excluded
   from scoring.
4. **Capital composites.** E, Ec, and S composites are computed as weighted
   combinations of their sub-indicators.

The study area spans 1,676 census tracts across 7 EPA Level III ecoregions.

### Ec_gencap normalization

The Ec_gencap sub-indicator (generator capacity contribution to Ec) is
normalized using a study-area-wide slope:

```
ec_slope = 10 / max_gen_cap_50km_mw / 6
```

where:
- `max_gen_cap_50km_mw` is the maximum generator capacity within 50 km of
  any tract in the study area (currently 5,796.9 MW)
- The `/6` reflects that Ec_gencap is one of six Ec sub-indicators
- The `10 /` scales the indicator to the 0–10 range

This slope must match between the baseline computation (nb08b) and the
attribution logic (`scripts/build_generator_attribution.py`). A mismatch
means the engine's attribution of Ec changes from energy actions would be
calibrated against a different scale than the baseline — producing
systematically biased Ec deltas. This is exactly what F2 was.

The current slope value is `2.875099909721863e-04`, recorded in
`data/manifest/manifest.json` under `normalization_constants` and validated
on every CI run by `scripts/validate_p3_attribution.py` (tolerance: 1%
relative).

### County-level aggregation (nb14)

County-level E, Ec, and S scores are population-weighted averages of the
constituent tracts. The 157-county study area is the EES-scoped boundary —
distinct from the broader 293-county bounding box in
`spatial_hierarchy_counties.parquet`, which covers a wider geographic region
used for spatial joins but not for EES scoring.

### Ecoregion-level aggregation (nb08b)

Ecoregion-level scores are population-weighted tract averages grouped by EPA
Level III ecoregion code. The 7 study-area ecoregions and their current
composite scores are recorded in `network_metadata.json` `ees_baseline.ecoregion_scores`.

---

## Assumptions

1. **Mountain West normalization.** Indicators are normalized against the
   Mountain West distribution, not nationally. This means a tract scoring 8/10
   on an indicator is high *relative to this study area*, not relative to the
   U.S. as a whole. This is a deliberate design choice — the model is intended
   to support within-region comparison, not cross-region ranking.

2. **Population weighting.** County scores are population-weighted tract
   averages. This weights urban tracts more heavily than rural ones. For
   counties with a single dominant population center (e.g., Laramie County /
   Cheyenne), the county score is effectively the score of that center.

3. **Six Ec sub-indicators with equal weight to Ec_gencap.** The `/6`
   divisor in the Ec_gencap slope assumes Ec_gencap is one of six equally
   weighted Ec sub-indicators. If the number or weighting of Ec sub-indicators
   changes, the slope must be recalculated.

4. **Proxy indicators.** Four of the EES indicators are documented as proxies
   with planned replacements (see § Known gaps below). Until replaced, the
   baseline carries these proxy values as the best available approximation, not
   as validated measures of the underlying construct.

---

## F2 defect history

This section documents the project's most consequential data defect. It is
written in chronological order to make the causal chain explicit.

### Phase 1 — The pagination truncation (pre-Wave 7)

The original EES baseline was built on 2026-06-10 using a generator inventory
pulled from the EIA API. That pull retrieved only **15,034 generators** due to
API pagination truncation — the API returned paginated results and the pull
script did not follow all pages. The complete inventory contains **25,868
generators**.

The truncated inventory had a study-area maximum generator capacity within
50 km of any tract (`max_gen_cap_50km_mw`) of approximately **5,184.8 MW**,
producing an Ec_gencap slope of approximately `3.2145e-04`.

Meanwhile, the attribution logic in `scripts/build_generator_attribution.py`
was independently computing its normalization from the complete inventory
(which had been separately pinned at 25,868 records with SHA `573f1a7b`). The
attribution slope was `2.8751e-04` (based on the correct max of 5,796.9 MW).

The two slopes differed by **11.8%**. This meant that when the engine computed
Ec changes from energy actions using the attribution logic's slope, those
changes were calibrated against a scale 11.8% different from the baseline
that defined each county's starting Ec. The defect was a silent normalization
mismatch — no test caught it because the baseline and attribution computations
were never cross-validated until the Wave 7 audit.

### Phase 2 — Detection and repair (S7a, 2026-09-13)

The September 2026 audit (W7) identified the slope mismatch as finding F2.
S7a rebuilt the baseline from the complete pinned inventory:

- `08b_ees_baseline.ipynb` was re-run with the full 25,868-generator inventory
- The new `max_gen_cap_50km_mw` was **5,796.9 MW** (exact match with
  attribution)
- The new Ec_gencap slope was `2.875099909721863e-04` (**0.000% difference**
  from attribution)
- **123 of 157 counties** had Ec score shifts as a result
- E and S scores were unaffected (they have no generator dependency)

### Phase 3 — Second-order regression (F14, 2026-09-15)

During S7a, `14_county_foundation.ipynb` was also re-run (it produces
county-level scores and county cards). This re-run exposed a second defect:
nb14's hardcoded `FLAGSHIP_ASSETS` list (Cell 4f) still carried stale
capacity values for three flagship facilities:

| Facility | nb14 (wrong) | Authoritative | Source |
|----------|-------------|---------------|--------|
| Dave Johnston Power Plant | 762 MW | 816.7 MW | `mw_anchor_facilities.geojson` |
| Meta AI Data Center | 100 MW | 152 MW | `mw_anchor_facilities.geojson` |
| Jade/Crusoe Campus Phase 1 | 200 MW | 1800 MW | `mw_anchor_facilities.geojson` |

The stale values had been corrected in the output files during W7-0 and S6,
but the notebook source code was never updated. When S7a re-ran nb14, the
notebook regenerated `mw_county_cards.json` from its stale hardcoded list,
silently overwriting the earlier corrections. S7b's Python→TS sync then
propagated the regression into the TS copy.

F14 was caught, and the output files were patched via
`scripts/patch_county_cards_f14.py`. All golden fixtures were regenerated on
the corrected data. Both test suites pass (226 Python, 351 TS).

### What remains unfixed

**nb14's source code (Cell 4f `FLAGSHIP_ASSETS`) still carries the stale
values (762, 100, 200).** The output files are patched, but the next nb14
re-run will regress again unless the notebook source is also patched. This is
PIPELINES.md backlog item 8 and is carried as an open risk.

### Prevention

Three CI checks now guard against recurrence of F2-class defects:

1. **Manifest hash check** (S11, `scripts/check_manifest.py`): every runtime
   file's SHA-256 must match the manifest. A data refresh that changes any file
   without updating the manifest will fail CI.
2. **Dual-path identity check** (S11, `scripts/check_dual_path.py`): the 8
   promotion-pair files must be byte-identical between Python and TS paths.
3. **P3 attribution slope check** (S12, `scripts/validate_p3_attribution.py`):
   the baseline Ec_gencap slope and the attribution slope must agree within 1%
   relative tolerance.

---

## Known gaps

### Proxy indicators awaiting replacement

Four EES indicators are documented proxies with identified replacements. They
are stated as assumptions in the scoring, not as validated measures:

| Indicator | Current proxy | Planned replacement | Status |
|-----------|--------------|--------------------|----|
| `eco_base_score` | EPA L3 ecoregion structural prior | NLCD 2021 land cover % composition per tract | Not started |
| `water_stress` | HUC-8 arid fraction | USDA NRCS water balance or NOAA Drought Monitor raster | Not started |
| `development_pressure` | Vacancy rate proxy | NLCD impervious surface change 2011–2021 | Not started |
| `has_university` | HIFLD Colleges layer (presence/absence) | NCES IPEDS 2022 validation | Not started |

These replacements are documented in `network_metadata.json`
`ees_baseline.todo` and `ees_baseline.proxy_indicators`.

### nb14 FLAGSHIP_ASSETS regression risk

The notebook source for `14_county_foundation.ipynb` (Cell 4f) still contains
stale hardcoded capacity values. The output files are currently correct
(patched by F14), but re-running nb14 from source will silently revert three
flagship capacity values. This is a standing regression risk until the notebook
source is patched.

### Untracked spatial hierarchy files

`spatial_hierarchy_counties.parquet` and `spatial_hierarchy_huc8.parquet`
exist locally but are blocked from git by the global `*.parquet` rule. They
are optional loads (`terra_engine.py:2483–2484`) and are not required for
core engine operation, but they are unavailable on CI and in fresh clones.

### HIFLD live-fetch dependency

The Hospitals and Colleges layers are fetched live from HIFLD FeatureServer
during nb08b execution. If HIFLD changes its schema, endpoints, or data
content between runs, the resulting E and S scores could shift without any
change to the local codebase. The current baseline was built against HIFLD
data fetched on 2026-09-13.
