# Ticket C5a — Climate UI Components

**H1.1 dependency status: BLOCKING / NOT LANDED in `w4-c5a-ui`.** The checked-out `PlacementOverlay.tsx` still declares its own `AnchorFeature` shape, imports `mw_anchor_facilities.geojson`, and derives `TIER2_ANCHORS` locally. Before C5a implementation begins, the PM must confirm the shared canonical anchor/asset module's landing location and H1.1 must land. C5a must not create another local `AnchorFeature` or `TIER2_ANCHORS` derivation. If H1.1 is still absent at implementation start, stop and log the dependency as blocked.

## Stage P — Test Plan

### Objective and scope

Validate the C5a C0-C3 climate surface only:

- lens indicator and selector;
- county-card climate panel with hazard trajectory fan charts using p10/p50/p90 records from `county_climate_projections.json`;
- attribution popovers exposing `scenario`, `epoch`, `percentile`, `source`, `method`, and `confidence`;
- visible low-confidence and Eagle-CO-bias flags;
- hazard choropleth layers;
- exposure badges sourced from C2 `exposure_tags`.

Explicitly exclude exposure stress rows and event feeds, which require C4's Wave 5 surface. Tests must assert those controls/data are absent from the C5a surface, rather than importing or mocking a C4 implementation.

### Test matrix

| Area | Test that must fail if broken | Evidence / gate |
|---|---|---|
| Lens | Render historical, `ssp245`, and `ssp370`; selecting a lens updates the displayed lens and the map/card query; keyboard and pointer selection work; historical remains the default for legacy state. | Vitest component/logic tests plus Playwright smoke flow if browser tooling is available. Assert selected value and resulting record keys, not only click handlers. |
| Projection records | For a fixture county, metric, lens, and epoch, display exactly the source records for p10/p50/p90. Assert percentile labels, ordering, units, epoch labels, and no fabricated point when a record is missing. Cover both scenarios and at least two hazard metrics. | Vitest tests against a small fixture derived from the checked-in JSON; schema test checks every rendered point retains its source attribution. |
| Fan chart | p10/p50/p90 are rendered as three distinct trajectories/bands from data values; changing lens or epoch changes the selected records; the UI does not interpolate, delta, average, clamp, or otherwise transform hazard values. | Component tests spy on the presentation adapter and compare chart props to fixture records; a mutation test changes one input value and expects only the matching rendered value/geometry to change. |
| Attribution | Popover opens from the chart/legend affordance, is keyboard reachable, and renders all six required fields for the selected point. `source`, `method`, and confidence are not replaced by generic copy. | Component test with `getByRole`; assert exact field values from the fixture and close/reopen behavior. |
| Confidence flags | A low-confidence record renders a visible warning/flag and remains in the chart/popover. A normal-confidence record does not receive the low-confidence flag. | Regression fixture containing low confidence; DOM assertion on visible text/role and chart point presence. No filtering predicate may discard low-confidence data. |
| Eagle-CO bias | GEOID `08037` / Eagle, CO renders its bias flag when the source record marks it; the flag is visible in the card and attribution surface and does not suppress the value. | Dedicated fixture/fixture lookup test and browser assertion; assert the record remains selectable and all attribution fields remain visible. |
| Choropleth | Hazard layer toggle/selection adds the intended layer, uses one data-backed value per county, updates on lens/epoch/metric changes, preserves county/facility visibility, and shows a legend whose labels match the selected hazard/unit. | Map-layer tests with a MapLibre mock for source/layer/paint expressions plus browser screenshot/DOM smoke test. Assert GEOID-to-value mapping and layer IDs. |
| Exposure badges | Badges render only from C2 `exposure_tags` on the selected asset/county surface, preserve tag value/source/method/confidence, and handle missing tags without inventing a value. | Vitest tests using tagged, untagged, and class-default fixtures; assert C2 tag object identity/fields reach badge props. |
| Scope boundary | No exposure stress rows or event-feed controls appear in C5a views. | Component query assertions and a source-level allowlist/check for C4-only names. |
| Tokens | New/modified C5a TSX/CSS contains no hex color literals or inline color literals; every color, typography, spacing, and state treatment resolves through existing or PM-approved design tokens. | `rg`/ESLint-style gate over touched files plus browser computed-style assertions for key states. A failure is blocking; do not count existing literals outside the C5a change set as a pass. |
| Canonical anchors | C5a imports the PM-confirmed shared module only. No C5a file declares `AnchorFeature`, `TIER2_ANCHORS`, imports anchor GeoJSON directly, or filters Tier 2 anchors locally. | Static source gate and import-path assertion. Run after H1.1 lands and include a check that `PlacementOverlay.tsx` also consumes the same module. |
| UI arithmetic | Climate components pass through values supplied by the data adapter/engine surface. No `+`, `-`, `*`, `/`, interpolation, percentile selection by calculation, delta, average, or unit conversion is introduced in UI code for hazard values. | Static AST/source scan of C5a UI and adapter modules for arithmetic on climate values, plus runtime spy: adapter receives raw records and chart receives unchanged `value` fields. Review all formatting helpers separately: formatting may round/display but must not create a displayed hazard value. |
| Engine separation | Existing engine climate coupling tests remain green; C5a tests prove the UI reads p10/p50/p90 display data and does not call `computeDemandModifier`, `computeWaterStressDerate`, or `computeHeatDerate` to derive chart values. | `npm test -- --run` plus targeted mocks/assertions that coupling functions are not called by the display path. |
| Performance | With headless Chrome/Playwright available, measure real frame timing while toggling hazard choropleth and facility layers at the target desktop viewport, with a cold load and repeated toggles. Record frame count, dropped frames, p95 frame duration, and the exact browser/build/viewport/data state. | Pass only from the captured browser measurement and agreed threshold in the ticket/PM acceptance notes. Store raw output or a link/path in this log. If Playwright/headless Chrome is unavailable, mark **UNVERIFIED**, record the availability check and use only explicitly labeled proxies (build size, layer update timing from mocks, and render-count profiling); never report proxies as passing frame timing. |

### Fixtures and invariants

1. Build a deterministic climate fixture from a small set of checked-in projection records covering `ssp245`, `ssp370`, multiple epochs, p10/p50/p90, a low-confidence row, and Eagle `08037`. Preserve the original attribution fields verbatim.
2. Add missing-record and missing-tag cases. The expected behavior is an explicit empty/unknown state, never a UI-computed fallback.
3. Use a tagged C2 asset, a class-default asset, and an untagged asset to verify badge provenance and absence handling.
4. Keep fixture values deliberately non-round and asymmetric so accidental averaging, delta calculation, interpolation, or percentile swapping fails visibly.
5. Assert no suppression: low-confidence and Eagle-bias records remain in the rendered data set and are marked in the DOM.

### Static checks and review gates

- Before implementation, obtain PM confirmation of the H1.1 shared-module path. Re-run the canonical-anchor static gate after every anchor-related change.
- Limit the no-hex scan to all files changed for C5a plus the shared token/module files changed to support it. Existing literal colors in untouched code are inventory findings, not a C5a pass condition.
- Add a focused climate UI lint/check that flags arithmetic operators and climate-engine calls in the display path. Review false positives only for formatting/layout calculations; reject arithmetic that changes hazard values.
- Require an import/data-flow review: JSON/engine adapter -> typed display model -> chart/flag/popover. The chart must not load alternate climate data or reconstruct records.
- Run TypeScript build, ESLint, targeted C5a tests, the existing C0-C3 parity tests, and the full Vitest suite. No existing test may be deleted or weakened.

### Verification commands and reporting

From `terra-app/` after implementation:

```text
npm run build
npm run lint
npm test -- --run
npm run parity
```

Run the targeted C5a test file(s) separately first for fast diagnosis. Check browser-tool availability before claiming performance evidence. The final implementation log must include pass/fail status per matrix row, test command output summary, changed-file token/static-scan results, H1.1 module path, and either real frame measurements or an explicit **UNVERIFIED** performance result with labeled proxies.

### Exit criteria

C5a is ready to build only after H1.1 lands and the PM confirms the canonical module path. It is ready to verify only when all in-scope matrix rows pass, low-confidence and Eagle-CO-bias flags are visibly rendered, no UI-side hazard arithmetic or local anchor re-derivation is found, token checks pass for touched files, out-of-scope C4 surfaces remain absent, and performance is either measured in headless Chrome/Playwright or explicitly recorded as **UNVERIFIED** rather than inferred.

---

## Stage P — Review (appended 2026-07-15, test-plan-review)

<review_report>
ticket: C5a — Climate UI Components (C0–C3 surface only)
reviewer: test-plan-review
date: 2026-07-15
roadmap_source: Wave4_roadmap.md PART 6

### Roadmap requirements extracted (PART 6 — no numbered ACs; extracted as functional criteria)

R1: Lens indicator/selector — scenario-file-level lens, surfaced at session start and in debrief header
R2: County-card climate panel — hazard trajectory fan charts p10/p50/p90 straight from `county_climate_projections.json`; attribution popovers showing {scenario, epoch, percentile, source, method, confidence}; low-confidence and Eagle-CO-bias flags render, not vanish
R3: Hazard choropleth layers — C2 baseline + projection deltas
R4: Exposure badges on assets/anchors from C2 tags
R5: Components needing C4's surface (exposure stress rows, event feeds) OUT of scope
R6: Zero UI-side hazard arithmetic — display what the data files and engine surface provide
R7: Design tokens only, no hex (F2 standard)
R8: One canonical anchor/asset data module — no re-derivation of local copies
R9: Performance criterion — real frame timing if headless-Chrome/Playwright is available; UNVERIFIED with labeled proxies if not

### Per-requirement coverage assessment

**R1 (Lens indicator/selector) — PASS.** The "Lens" matrix row requires rendering
historical, ssp245, and ssp370; verifying keyboard and pointer selection; asserting
the selected value and resulting record keys (not only click handlers). Vitest
component tests plus a Playwright smoke flow if browser tooling is available. The
distinction between asserting selected state vs. click handlers is a meaningful
false-positive guard. The roadmap specifies "surfaced at session start and in the
debrief header"; the plan should confirm both surfaces are tested — the matrix row
covers general selection but does not call out the debrief-header surface
explicitly. Minor observation; not a blocking gap (the implementation test
targeting the header surface is derivable from the criterion).

**R2 (County-card panel, fan charts, attribution, flags) — PASS.** Covered across
four matrix rows: "Projection records" (p10/p50/p90 from checked-in JSON, schema
check preserves attribution, two hazard metrics, missing-record case),
"Fan chart" (three distinct trajectories from data values, mutation test for
value fidelity, no transformation), "Attribution" (popover with keyboard access,
all six required fields by exact value from fixture, close/reopen behavior),
"Confidence flags" (visible DOM assertion, no filtering predicate, active-lens
positive control), "Eagle-CO bias" (GEOID 08037, both card and attribution
surface, record remains selectable). The fixture requirement §4 — deliberately
non-round and asymmetric values — is a strong guard against averaging/interpolation
bugs. The explicit "No filtering predicate may discard low-confidence data"
requirement maps directly to the roadmap's "render, not vanish" mandate. No gaps.

**R3 (Hazard choropleth) — PASS.** The "Choropleth" matrix row covers: MapLibre
mock asserting source/layer/paint expressions, GEOID-to-value mapping, layer IDs,
legend labels matching selected hazard/unit, layer toggle adding the intended
layer, updates on lens/epoch/metric changes, county/facility visibility
preservation. Browser screenshot/DOM smoke test is included. One-data-backed-value-
per-county is verified via GEOID-to-value mapping assertion. No gaps.

**R4 (Exposure badges from C2 tags) — PASS.** The "Exposure badges" row uses
tagged, untagged, and class-default fixtures; asserts C2 tag object
identity/fields reach badge props; handles missing tags with explicit
empty/unknown state rather than UI-computed fallback. Three-fixture discriminator
(tagged / class-default / untagged) is necessary and sufficient to prove
provenance.

**R5 (C4 scope boundary) — PASS.** The "Scope boundary" row requires both
component query assertions (no exposure stress rows or event-feed controls in
DOM) and a source-level allowlist/check for C4-only names. Actively asserts
C4 surface is absent rather than merely not present in the happy path. The plan
also instructs C5a to import from the H1.1 shared module rather than re-derive —
the canonical-anchor static gate enforces this structurally.

**R6 (Zero UI-side hazard arithmetic) — PASS.** The "UI arithmetic" matrix row
specifies: AST/source scan of all C5a UI and adapter modules for arithmetic
operators and climate-engine calls in the display path; runtime spy asserting
adapter receives raw records and chart receives unchanged `value` fields; separate
review of formatting helpers with the rule that formatting may display/round but
must not create a displayed hazard value. The static scan + runtime spy
combination is necessary; neither alone is sufficient. The plan calls this out
explicitly. No gaps.

**R7 (Design tokens, no hex) — PASS.** The "Tokens" row requires rg/ESLint-style
gate over touched files, browser computed-style assertions for key states, and
distinguishes existing untouched literal colors from C5a's change set (a failure
in C5a scope is blocking; pre-existing literals outside the change set are
inventory, not a pass condition). This scoping is correct and prevents false
coverage from untouched code.

**R8 (Canonical anchor module, no re-derivation) — PASS.** The "Canonical
anchors" matrix row requires: static source gate verifying no C5a file declares
`AnchorFeature` or `TIER2_ANCHORS` or imports anchor GeoJSON directly; import-
path assertion; and a check that `PlacementOverlay.tsx` also consumes the same
module after H1.1 lands. The H1.1 blocking notice at the top of the file is
correctly positioned as a build gate, not just an observation. Static gate
re-run "after every anchor-related change" is the right invariant frequency.

**R9 (Performance) — PASS.** The "Performance" matrix row precisely mirrors the
roadmap's conditional criterion. If Playwright/headless Chrome is available:
measure real frame timing with cold load and repeated toggles, record frame count,
dropped frames, p95 frame duration, browser/build/viewport/data state, store raw
output in the log. If unavailable: mark UNVERIFIED, record the availability
check, use only explicitly labeled proxies. The plan explicitly prohibits
presenting proxy numbers as passing frame timing. This matches the roadmap's
stated evidential standard exactly.

### Cross-cutting observations

1. **Fixture invariant §5 (no suppression).** The explicit fixture requirement
   that low-confidence and Eagle-bias records "remain in the rendered data set and
   are marked in the DOM" — with no filtering allowed — is the direct test of the
   roadmap's "render, not vanish" language. This should be checked at both the
   component level (props delivered) and DOM level (visible element present).

2. **Import/data-flow review.** The plan requires a JSON/engine adapter →
   typed display model → chart/flag/popover trace and prohibits the chart from
   loading alternate climate data or reconstructing records. This closes the
   "UI arithmetic through a side import" path.

3. **H1.1 coordination.** The plan correctly surfaces H1.1 as a build gate and
   requires PM confirmation of the shared-module path before implementation. The
   canonical-anchor static gate runs after every anchor-related change, not once
   at the end.

4. **Debrief header surface.** The roadmap specifies the lens is "surfaced at
   session start and in the debrief header." The "Lens" matrix row covers
   selection behavior but does not name the debrief-header surface explicitly. The
   implementation test file should include a specific assertion for the header
   surface. This is a minor observation, not a blocking gap, and does not require
   a Stage P amendment.

### Verdict

**PASS.** The plan, executed faithfully, proves all nine roadmap requirements for
C5a. Every requirement maps to a named matrix row with a stated evidence type and
discriminating false-positive guard. Fixture discipline (non-round values,
missing-record/missing-tag cases, no suppression) is correctly specified.
C5a is ready to build as soon as H1.1 lands and the PM confirms the canonical
module path.
</review_report>

---

## Addendum — 2026-07-16

The blocking H1.1 note at the start of this document was written against the
stale pre-recreation checkout at `d5ea940` and is superseded. The C5a
implementation worktree is `w4-c5a-ui` at `2690964`; `anchorFacilities.ts` is
present as the canonical anchor module and `PlacementOverlay.tsx` has no local
`AnchorFeature` or `TIER2_ANCHORS` declaration.
