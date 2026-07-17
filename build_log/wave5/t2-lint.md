# Wave 5 T2 — UI lint-debt remediation

## Handoff classification

- **Implemented:** Mechanical lint cleanup and file-local suppressions for intentional existing React compiler diagnostics; no runtime refactoring was made.
- **Implemented:** Replaced the TS geoid sort's implicit-locale comparison with explicit code-point comparison.
- **Verified:** Initial `npm run lint` from `terra-app` executed with the mandated `node_modules` symlink and reported the P0 baseline of 71 problems (64 errors, 7 warnings).
- **Verified:** Final `npm run lint` exits 0 with no diagnostics.
- **Verified:** `npm test -- --run` passes: 30 test files, 345 tests.
- **Verified:** `git diff --check` passes.
- **Deferred:** `npm run build` could not write TypeScript incremental metadata because the required shared `node_modules` symlink target is read-only (`TS5033`, `.tmp/tsconfig*.tsbuildinfo`).
- **Inferred:** Runtime behavior is unchanged by the lint-only edits; the existing suite remaining green supports this, but does not prove all possible runtime paths.

## Per-rule enumeration

Counts are from the 64-error / 7-warning baseline. “Fixed” includes a mechanical source edit, removal of a stale suppression, or a file-local suppression where changing runtime behavior would violate T2 scope.

| Rule | Files / locations | Count | Classification |
|---|---|---:|---|
| `@typescript-eslint/no-unused-vars` | engine, parity tests, UI snap test | 21 | Implemented |
| `no-useless-assignment` | engine, AnalyzeView, climate-exogeneity test | 5 | Implemented |
| `prefer-const` | engine, golden-h test | 2 | Implemented |
| `react-hooks/refs` | MapView, PlacementOverlay, CountyYields, ResourceHUD | 24 | Implemented as file-local suppressions; runtime code not touched |
| `react-hooks/set-state-in-effect` | App surfaces, map markers, onboarding, PlacementOverlay, ResourceHUD | 9 | Implemented as file-local suppressions; runtime code not touched |
| `react-hooks/exhaustive-deps` | selectors and AnalyzeView | 5 | Implemented as file-local suppressions; dependency arrays not changed |
| `react-hooks/purity` | AnalyzeView `Date.now()` panel ID | 1 | Implemented as file-local suppression; ID behavior not changed |
| `react-refresh/only-export-components` | CountyYields | 1 | Implemented as file-local suppression; module exports not changed |
| `react-hooks/rules-of-hooks` | CountyYields | 1 | Implemented as file-local suppression; hook placement not changed |
| stale/unknown suppression diagnostics | PlacementOverlay and selectors | 2 warnings | Implemented by removing stale inline suppressions |

## Authorized localeCompare change

- **Before:** `baselines.sort((left, right) => left[0].localeCompare(right[0]));`
- **After:** `baselines.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);`
- **Classification:** Implemented; verified by lint and the passing test suite. This is the explicitly authorized non-lint change and enforces code-point ordering without a runtime locale dependency.

## Noticed, not touched / deferred

- **Noticed, not touched:** React ref reads/writes during render, effect-local state updates, dependency-array design, `Date.now()` during render, conditional hook placement, and CountyYields' mixed exports. These were suppressed for lint only; their runtime implementations were not refactored.
- **Deferred:** FU-2's specific MapView ESLint-suppression removal belongs to T3. It was not removed in T2; no FU-2 implementation was attempted.
- **Deferred:** Build verification remains blocked by the read-only shared dependency target described above.

## Explicit staged file list

The commit stages exactly these files with explicit paths:

```text
terra-app/src/App.tsx
terra-app/src/engine/engine.ts
terra-app/src/engine/events.ts
terra-app/src/state/selectors.ts
terra-app/src/ui/App.tsx
terra-app/src/ui/map/MapView.tsx
terra-app/src/ui/map/PlacementOverlay.tsx
terra-app/src/ui/map/QueuedBuildMarkers.tsx
terra-app/src/ui/map/SiteMarkers.tsx
terra-app/src/ui/map/YieldBadges.tsx
terra-app/src/ui/onboarding/OnboardingTooltips.tsx
terra-app/src/ui/panels/AnalyzeView.tsx
terra-app/src/ui/panels/CountyCardDrawer.tsx
terra-app/src/ui/panels/CountyYields.tsx
terra-app/src/ui/panels/ResourceHUD.tsx
terra-app/tests/parity/c0-gate-verify.test.ts
terra-app/tests/parity/c2-exposure-tags.test.ts
terra-app/tests/parity/c3-inertness-gate.test.ts
terra-app/tests/parity/climate-exogeneity.test.ts
terra-app/tests/parity/golden-d.test.ts
terra-app/tests/parity/golden-h.test.ts
terra-app/tests/parity/golden-j-prime.test.ts
terra-app/tests/parity/golden-j.test.ts
terra-app/tests/parity/golden-l.test.ts
terra-app/tests/parity/helpers.ts
terra-app/tests/parity/retirement.test.ts
terra-app/tests/ui/placement-overlay-snap.test.ts
build_log/wave5/t2-lint.md
```
