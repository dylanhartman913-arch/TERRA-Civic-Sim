# T6 / C5b — Full climate choropleth integration

## Worktree and self-check

- Worktree: `/Users/dylanhartman/projects/Energy Modeling/w5-c5b`
- Branch / commit before work: `w5-c5b` / `f55c43a`
- Tracked-file check: `git ls-files | wc -l` = **338**; `git ls-tree -r --name-only f55c43a | wc -l` = **338**.
- Disk-usage check after locked frontend dependency provisioning: **878M** for
  `w5-c5b`; runnable `w5-engine` comparison worktree: **852M**. The main
  reference worktree was not used as a content reference because its verified
  `git status --short` contained tracked deletions.

## Implemented

- **C2.1.0 resolver:** `climateSurfaceRecordFor` reads
  `county_climate_baseline.json`, validates the `C2.1.0` shape, renders
  historical baseline values or scenario delta values, and validates every
  delta row against the baseline record named by its `baseline_key`. It does
  not treat the top-level `metrics` array as a county-complete registry.
- **Full selector surface:** global lens, epoch, and metric controls drive the
  choropleth source. Metric coverage labels are calculated from actual baseline
  rows; no coverage claim is inferred from the metrics array.
- **Attribution:** clicking a populated cell opens the existing attribution
  popover with the selected C2.1 record's scenario, epoch, percentile, source,
  method, confidence, and downscaling method.
- **SNOTEL absence:** counties without a matching `baseline_key` emit an
  explicit no-data map cell (gray) and a click message. The selector identifies
  partial coverage (46 counties) for both SNOTEL metrics.
- **Fallback:** invalid/unavailable C2.1 data retains the C5a non-historical,
  2050, high-fire-danger-days surface; other combinations remain unavailable.

## Verification

| Claim | Status | Evidence |
|---|---|---|
| Lens/epoch/metric selection changes map-cell data and C2.1 attribution. | implemented; verified | `tests/ui/c5b-choropleth.test.ts`: SSP245/2030 and SSP370/2065 values differ for Adams County and the popover matches the selected record. |
| Missing SNOTEL county is a no-data cell. | implemented; verified | Same test confirms `08001` is null/no-data while covered `08007` is populated. |
| Historical/fire-only C5a fallback remains available when C2.1 is unavailable. | implemented; verified | Same test exercises the resolver's unavailable-surface branch. |
| Type safety, lint, and production bundle compile. | verified | `npm run lint`; `npm run build` (both pass). |
| Focused climate UI tests. | verified | `npm test -- --run tests/ui/c5b-choropleth.test.ts tests/ui/c5a-climate-ui.test.ts`: 2 files, 11 tests passed. |
| Full Vitest suite. | deferred | Terminal runner returned after Vitest startup without a completion summary; focused new and adjacent tests passed. |

## Scope notes

- T6 touched only climate selector/store state, choropleth source/rendering,
  attribution metadata, the discriminating UI tests, and this build log.
- No engine or source-data files were modified.
