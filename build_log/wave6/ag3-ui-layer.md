# W6 AG3 — Ag Yields UI + Competition Preview

## Ticket summary

Date: 2026-07-20
Branch: `w6-ag3`
Commit: `38c7cef`
Base: `main` @ `0ae1a27` (AG2 engine lock, merged)
Recovery note: Work was built in the `w6-ag2` worktree outside the declared
AG2 scope and never committed. Recovered, branched to `w6-ag3`, and put
through the full formal gate pipeline on 2026-07-20.

### Scope (10 files)

- `terra-app/src/engine/engine.ts` — adds `getAgPlacementPreview` (pure, zero-mutation)
- `terra-app/src/engine/types.ts` — adds `AgPlacementPreview` interface
- `terra-app/src/state/store.ts` — adds `agChoropleth` layer flag, `AgChoroplethMode` type, `agChoroplethMode` state, `setAgChoroplethMode` setter
- `terra-app/src/ui/map/MapView.tsx` — mounts `AgChoroplethLayer`
- `terra-app/src/ui/map/PlacementOverlay.tsx` — ag competition preview panel + blocked-confirm gate
- `terra-app/src/ui/panels/ActionPalette.tsx` — decay/maintenance/ag-coexistence indicators
- `terra-app/src/ui/panels/CountyYields.tsx` — four new yield strip items (forage, land ledger, ag water, ag economics; WY-only via pre-existing `isWY` gate)
- `terra-app/src/ui/panels/LayerToggle.tsx` — ag choropleth layer toggle + mode selector
- `terra-app/src/ui/map/AgChoroplethLayer.tsx` — new; three-mode county choropleth (forage_trend / invasive_burden / converted_acres)
- `terra-app/tests/ui/ag-headless-render.test.ts` — new; 7-test headless render check replacing D5 visual verification

---

## Gate-review findings (2026-07-20)

### Stage 0 — Build and lint

| Command | Result |
|---|---|
| `npm run lint` | PASS — 0 errors / 0 warnings |
| `npm run build` | PASS — tsc + Vite production build |
| `npm test -- --run` | PASS — 37 files / 379 tests |
| `npm run parity -- --run` | PASS — 31 files / 337 tests |
| `pytest -q` | PASS — 224 passed |

### Stage 1 — Scope audit

10 files declared, 10 files in diff. No undeclared files. PASS.

### Stage 1 — Architecture review

- No fork of `HazardChoroplethLayer` — `AgChoroplethLayer` is a new parallel
  file following the identical MapLibre addSource/addLayer/cleanup pattern.
- No fork of `CountyYields` — four items appended to existing component.
- `DeltaProjectionStrip` not touched.
- `getAgPlacementPreview` is pure/zero-mutation; all land conversion, AUM,
  valuation, and blocking logic runs in `engine.ts` only.
- Store additions follow the `climateHazards`/`ClimateMetric` pattern exactly.

PASS.

### Stage 2 — Frontend review

- State placement: all ag UI state in store, no local component ag state.
- Design tokens: all colors via CSS vars, no hex values introduced.
- a11y: radio group in LayerToggle has `name="ag-choropleth-mode"`; title
  attrs on blocked confirm button.
- `AgChoroplethLayer` cleanup removes layer and source on unmount. PASS.

### Stage 3 — Performance review

See AG3-FU-1 below. No blocking defects. Choropleth `Math.spread` on ~3000
county features is acceptable; frame-timing data unavailable, carrying as
unverified per project precedent.

### Stage 3 — Headless render check (replaces D5)

7/7 tests PASS with real numbers:

| Test | Evidence |
|---|---|
| All 3 choropleth modes, WY counties | All WY features return `ag_value !== null` |
| Baseline forage index | Fremont and Campbell both return `1.0000` at init |
| `getAgPlacementPreview` values | 1000 MW solar → 7500 ac, `blocked=false`, correct draw priority |
| Fremont/Campbell industrial asymmetry | County-specific tax rates produce materially different values; delta >$10k |
| Land-class drainage at 100k MW | Campbell exhausts other (~505k ac), spills to private_rangeland; Fremont does not |
| Easement-blocked placement | `blocked=true`, reason contains "Easement" |
| Wind dual-use | 250 ac converted, 84,750 shared, `aum_after ≈ aum_before` |

### Stage 4 — Documentation review

See AG3-FU-2 (this fragment) and AG3-FU-3 below.

### Zero UI-arithmetic claim

Verified. `getAgPlacementPreview` is an engine function; all land conversion,
AUM, valuation, and blocking logic runs in `engine.ts`. UI performs only
display-formatting math (`aumDelta`, `valueDelta`, `fmt$`) on returned values.
No game-state decisions are computed UI-side.

### Gate-review verdict: PASS WITH FOLLOW-UP

---

## Debt table

| ID | Item | Severity | Status |
|---|---|---|---|
| AG3-FU-1 | Deduplicate `getAgPlacementPreview` call in `PlacementOverlay.tsx` — lines 475 and 735 both call with identical args; inner IIFE should reference `agPreviewModal` from line 475 instead | Low | OPEN |
| AG3-FU-2 | Build log fragment — this file (R4 requirement) | Medium | CLOSED — this document |
| AG3-FU-3 | `ag-headless-render.test.ts` header claims "renderToStaticMarkup" but never imports or calls it; tests are pure function tests. Fix comment or add actual React render coverage | Low | OPEN |

---

## Merge

Merged to `main` 2026-07-20. See merge commit.
