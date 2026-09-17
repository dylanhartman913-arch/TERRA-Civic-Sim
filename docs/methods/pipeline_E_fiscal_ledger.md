# Pipeline E — Wyoming Fiscal Ledger

**Pipeline status:** Current (2026-07-03 vintage); ~44% low-confidence rows
**Generators:** `notebooks/17_wy_fiscal_pull.ipynb`,
`notebooks/18_fiscal_coefficients.ipynb`,
`notebooks/18b_school_finance_patch.ipynb`,
`scripts/pull_housing_baseline.py`
**Runtime files:** 6 (see table below)
**Cross-reference:** `docs/PIPELINES.md` § Pipeline E;
`docs/methods/MANUAL_FETCH.md` for outstanding manual data items

---

## What this pipeline produces

The fiscal baseline and coefficients for Wyoming's 23 counties. This is the
only state-specific pipeline in the project — all other pipelines operate at
the Mountain West (157-county) scale. The fiscal layer models how energy
infrastructure investments translate into county-level tax revenue, school
funding, and housing stock changes.

| File | Tracked | Generator |
|------|---------|-----------|
| `wy_county_fiscal_baseline.json` | yes | nb17 |
| `wy_fiscal_coefficients.json` | yes | nb18 + nb18b |
| `county_housing_baseline.json` | yes | `scripts/pull_housing_baseline.py` |
| `ts:fiscal_baseline.json` | yes | structural transform of Python file |
| `ts:fiscal_coefficients.json` | yes | structural transform of Python file |
| `ts:county_housing_baseline.json` | yes | byte-identical promotion |

The Python and TS fiscal files are **structural transforms**, not byte-identical
promotions. The TS versions drop internal keys (e.g., `_ag_fiscal_coefficients`)
and flatten the county structure. This is by design — see DECISIONS.md
"S11: Dual-path transform pairs."

---

## Data sources

### WY Department of Revenue (DOR) — Agricultural Land Valuation

| Field | Value |
|-------|-------|
| Source | Wyoming Department of Revenue, Property Tax Division |
| Document | 2026 Agricultural Land Valuation Study |
| Publication date | October 2025 (2026 assessment year) |
| Retrieved from | `https://wyo-prop-div.wyo.gov/agricultural` (via Google Drive; file ID `1o_xnIDGabAg0c9pdHX6fQgsWezUwPoJO`) |
| Cached at | `data/raw/wy_dor_ag_valuation_2026.pdf` |

The DOR valuation study provides productive-value coefficients for
agricultural land classes.

**Critical assumption — statewide fallback.** The three productive-value
figures used in the ag baseline are **statewide representative values applied
uniformly to all 23 counties**:

| Land class | Statewide value | Actual DOR range across LRAs |
|-----------|----------------|------------------------------|
| Irrigated | $1,767/acre | $589–$3,239 |
| Dryland | $376/acre | $134–$617 |
| Grazing | $126/acre | $10–$1,006 |

These are **not** county-level DOR assignments. During the AG0 data pull
(2026-07-19), the Wyoming DOR Property Tax Division website
(`wyo-prop-div.wyo.gov/agricultural` and `dptax.wyo.gov`) failed DNS
resolution. County-level productive-value tables — which vary by Land
Resource Area (LRA) and soil class — could not be retrieved. The statewide
representatives were taken from the DOR 2026 study as a planning fallback.

The actual DOR range is wide: grazing land alone spans $10–$1,006/acre across
LRAs. The uniform figures are a **material simplification** that masks
significant within-state variation. See DECISIONS.md "S14/S14a: DOR productive
values are a statewide fallback" for the full decision record.

**Gap:** Retrieving county-level DOR productive values remains an outstanding
data-pull item. The DOR domain may have moved; a manual check and direct
download of LRA/soil-class tables per county would replace the statewide
fallback.

### Wyoming statute — assessment rate

| Field | Value |
|-------|-------|
| Source | Wyoming Statute 39-11-102(b) |
| Rate | 9.5% of productive value |

The assessment rate converts productive value to assessed value for property
tax purposes. This is a statutory constant, not an estimate.

### Bureau of Economic Analysis (BEA) — Farm Proprietors Income

| Field | Value |
|-------|-------|
| Source | U.S. Bureau of Economic Analysis, Regional Economic Accounts |
| Table | CAINC4, LineCode 71 (Farm Proprietors' Income) |
| Endpoint | `https://apps.bea.gov/api/data/` |
| Year | 2022 |
| Coverage | 23/23 counties — no suppression |

County sum equals the BEA Wyoming state total (0.0% difference). One anomaly
investigated and cleared: Fremont County ($48.8M total) was flagged at >3×
county average. Investigation confirmed this is structural — Fremont has 987
farm operations (most in state), with per-operation income of $49,416 (6th
statewide). Not a data error.

### USDA NASS QuickStats — Cattle Inventory

| Field | Value |
|-------|-------|
| Source | USDA National Agricultural Statistics Service, QuickStats |
| Endpoint | `https://quickstats.nass.usda.gov/api/api_GET/` |
| Program | SURVEY 2022 (CATTLE, COWS, BEEF - INVENTORY) |
| Coverage | 12 of 23 counties from QuickStats; 11 counties suppressed (code D) |

For the 11 suppressed counties (Albany, Goshen, Hot Springs, Laramie, Park,
Platte, Teton, and others), Census 2022 County of Agriculture (COA) values
are retained as fallback. The NASS 2022 survey state total (691,000 beef cows)
is within 1.5% of the Census COA total (681,534), and no county exceeds 25%
divergence between QuickStats and Census COA.

### ACS 2022 — Housing Baseline

| Field | Value |
|-------|-------|
| Source | U.S. Census Bureau, ACS 5-Year Estimates, 2022 |
| Generator | `scripts/pull_housing_baseline.py` |
| Output | `county_housing_baseline.json` |

County-level housing stock data used by the engine's housing pressure model
(`_compute_housing_pressure` in `terra_engine.py`).

---

## Fiscal coefficient methodology

`18_fiscal_coefficients.ipynb` computes per-action, per-county fiscal deltas.
For each energy action in the library, the notebook estimates:

- Property tax revenue change (based on assessed value of the asset and the
  county mill levy)
- Employment and wage effects (direct, indirect, induced — using multipliers)
- School funding impact (via `18b_school_finance_patch.ipynb`, which applies
  Wyoming's school foundation program funding formula)

The coefficients are county-specific because Wyoming's fiscal structure varies
by county: mill levies, mineral production profiles, and school enrollment all
differ. This is in contrast to the EES coefficients in Pipeline D, which are
spatially homogeneous.

---

## Assumptions

1. **Statewide DOR productive values.** See § WY DOR above. This is the
   single largest simplification in the fiscal pipeline. County-level DOR
   rates, which vary by LRA and soil class, would materially change the
   agricultural land valuation for individual counties.

2. **NASS/COA substitution for suppressed counties.** For the 11 counties
   where NASS QuickStats suppresses cattle inventory data (code D), Census COA
   values are used instead. The statewide NASS/COA agreement is within 1.5%,
   but individual county substitutions may carry larger relative error,
   especially for small-herd counties where the suppression threshold is most
   likely to bind.

3. **BEA income data is complete.** BEA farm proprietors income covers all 23
   counties with no suppression and exact state-total agreement. We assume this
   coverage remains stable across BEA vintage updates.

4. **Static fiscal structure.** Mill levies, assessment rates, and the school
   foundation formula are treated as constants. In practice, these change with
   legislative action. The 2026-07-03 vintage reflects the fiscal rules in
   effect at that date.

5. **Wyoming-only scope.** The fiscal pipeline covers only Wyoming's 23
   counties. The remaining 134 counties in the Mountain West study area have
   EES scoring but no fiscal layer. This is a deliberate scope boundary, not
   an oversight — the fiscal model requires state-specific statutory and
   administrative data that has not been assembled for other states.

---

## Known gaps

### Four outstanding MANUAL_FETCH items

These data sources were identified as needed but not successfully retrieved.
They are documented in `docs/methods/MANUAL_FETCH.md` and in the W6-A
follow-up patch section of HANDOFF.md:

| Item | Source | Status |
|------|--------|--------|
| ONRR disbursements | Office of Natural Resources Revenue — federal mineral royalty payments to counties | Not retrieved; no programmatic endpoint found |
| DOR commodity split | WY DOR — oil/gas/coal/trona severance breakdown by county | Not retrieved; requires DOR domain access |
| Severance tax detail | WY DOR — detailed severance tax by mineral and county | Not retrieved; same DOR access barrier |
| WY LSO school finance | Wyoming Legislative Service Office — school foundation program data | Not retrieved |

### ~44% of source rows carry `confidence: low`

This is the highest low-confidence rate of any pipeline. The low-confidence
items concentrate in fields that are most fiscally material: mineral production
volumes, severance tax apportionment, and the school foundation formula
parameters. The pipeline functions with these values but the resulting fiscal
projections should be treated as order-of-magnitude estimates, not precise
forecasts, for the affected fields.

### Wyoming water rights — blocked by authentication

| Field | Status |
|-------|--------|
| Old URL (404) | `https://seo.wyo.gov/divisions/water-rights` |
| Current URL (200 OK) | `https://seo.wyo.gov/documents-and-data` |
| Access | Requires SEO e-Permit account (`https://seoweb.wyo.gov/e-Permit/`) |

County-level diversion and consumptive-use data requires authentication via
the State Engineer's Office e-Permit system. No public bulk download was
found. As a result, `water.diversion_acre_feet` and
`water.consumptive_use_acre_feet` remain null in all 23 counties.

### BLM grazing data — missing entirely

BLM administers more land than the U.S. Forest Service in Wyoming, but no BLM
grazing allotment data has been incorporated. The BLM GIS portal has no
programmatic API (item 2 from W6-A follow-up, deferred). The
private/federal AUM split is therefore wrong in BLM-heavy counties — the
model captures only the USFS-proxy federal component.

### Additional deferred items

- **USFS grazing shapefile** (item 3 from W6-A): 50MB dataset, full
  aggregation deferred.
- **Rangeland Analysis Platform (RAP)** (item 5 from W6-A): no public API
  (`rangelands.app/api/` returns 404), deferred.
