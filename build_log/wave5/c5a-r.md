# C5a-r — C5a Follow-up Resolution

## Stage 0

**Verified:** `pwd` reported `/Users/dylanhartman/projects/Energy Modeling/w5-ui` and
`git branch --show-current` reported `w5-ui`. `git show --stat ede5149` and direct
inspection verified that the cherry-pick contains non-empty `MapView.tsx` and
`HazardChoroplethLayer.tsx` climate UI work.

**Verified PM disposition (FU-1):** `terra-app/TERRA_build_log.md` D1 says C5a ships
as **“2050 fire days”** and explicitly reserves the T4 baseline+delta wiring for
T6/C5b. `LayerToggle.tsx` already uses the required label. **Deferred:** no T4 data
surface was wired in this ticket.

## Implemented follow-ups

| Item | Classification | Disposition |
|---|---|---|
| FU-1 | DEFERRED / VERIFIED | The existing `Climate hazards (2050 fire days)` LayerToggle label implements the PM's named deferral; full baseline+delta remains T6/C5b. |
| FU-2 | IMPLEMENTED / VERIFIED | Removed the local `react-hooks/refs` suppression from the choropleth call; it now follows the sibling-layer `map={mapRef.current}` pattern without an exception. |
| FU-3 | IMPLEMENTED / VERIFIED | This section records what actually ships and makes all proxy/deferred claims explicit. |
| FU-4 | IMPLEMENTED / VERIFIED | Performance disposition below follows the H1.4 precedent: a measured limitation is not represented as a pass. |
| FU-5 | IMPLEMENTED / INFERRED | `HazardChoroplethLayer` resolves `--choro-3` with browser `getComputedStyle` before passing the value to MapLibre. This removes the unsupported raw CSS custom property from paint. TypeScript build and the source path are verified; a MapLibre canvas capture remains **UNVERIFIED** because the available in-app browser returned “No browser is available” and the headless capture environment did not expose the fresh MapLibre canvas. This is intentionally not reported as rendering-pass evidence. |
| FU-6 | IMPLEMENTED / VERIFIED | Six discriminating tests added: loaded-`ssp245` debrief header; tagged badge rendering; badge provenance; missing-tag absence; C4 scope boundary; and all-six-field attribution. |

## Implementation-stage disposition

**Implemented:** C5a's existing climate selector, projection panel, attribution
popover, exposure badges, 2050 fire-day layer label, and choropleth were present
from `ede5149`; this rework changes only FU-2/FU-5 code paths and FU-6 coverage.

**Verified:** targeted C5a UI tests pass (8 tests: 6 new discriminators plus two
existing climate regressions); `npm run build` and `npm run lint` pass.

**Inferred:** the resolved-computed-style bridge delivers the CSS token's concrete
color string to MapLibre. The code is direct and type-checked, but it is not a
substitute for a live map-canvas assertion.

**Deferred:** county baseline+delta integration is T6/C5b per D1; C4 exposure
stress rows and event feeds remain out of the C5a surface.

## Performance disposition

**VERIFIED FAIL / carried debt:** `docs/orchestration/Wave4_closeout_report.md` §6
records three headless-Chrome captures at p95 66.7–67.2 ms against a 16 ms budget.
That gate is CLOSED: FAIL and is not claimed as passing here.

**PROXY — not a frame-time pass:** production build completed in 2.12 s and emits a
45.1 MB JS bundle (5.22 MB gzip). These are build artifacts only; they do not
measure interactive map-frame timing. No performance pass is inferred from them.

**UNVERIFIED:** a fresh interactive MapLibre canvas measurement for the corrected
paint bridge could not be captured in this environment. It must be rerun in a
browser-enabled review environment before a rendering/performance pass is claimed.

## Verification evidence

```text
npm test -- --run tests/ui/c5a-climate-ui.test.ts
Test Files  1 passed (1)
Tests       8 passed (8)

npm run build
✓ built in 2.12s

npm run lint
(exit 0)
```

Touched-file token scan is clean: no hex literal was added to touched committed
TSX files. No canonical anchor/asset data module was duplicated or changed.

## Explicit staging list

```text
git add terra-app/src/ui/map/MapView.tsx
git add terra-app/src/ui/map/HazardChoroplethLayer.tsx
git add terra-app/src/ui/panels/ClimatePanel.tsx
git add terra-app/tests/ui/c5a-climate-ui.test.ts
git add build_log/wave5/c5a-r.md
```
