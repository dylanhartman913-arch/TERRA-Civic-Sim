# T5 — C4-ii Consequence Coupling + Adaptation + Golden M

**Date:** 2026-07-16
**Branch:** `w5-engine`
**Baseline:** `main` @ `f50b3ec`
**Builder:** Codex
**Engine lock:** confirmed; no concurrent engine writer reported

## Self-check and governing scope

- **VERIFIED:** `pwd` returned `/Users/dylanhartman/projects/Energy Modeling/w5-engine`.
- **VERIFIED:** `git branch --show-current` returned `w5-engine`.
- **VERIFIED:** the clean task branch was a direct ancestor of `main` and was
  fast-forwarded from `9883f85` to the required post-T2 baseline `f50b3ec`.
- **VERIFIED:** `docs/orchestration/Wave5_roadmap.md` Part 8 was read in full.
  Its carried-forward specification points to `Wave4_roadmap.md` Part 5. That
  file is not tracked in this worktree, so the provisioned repository-root copy
  at the main worktree was read, including the complete C4-i and C4-ii sections.
- **IMPLEMENTED:** only the declared engine/event/action-library contracts,
  focused tests, Golden M/registry, and this fragment were touched.

## Classified implementation record

### Pre-tasks

- **IMPLEMENTED:** Python now uses
  `INERT_CONSEQUENCE_MULTIPLIER_PPM = 0` when constructing every raw event.
  `test_ac1_active_matrix_has_required_coverage_and_canonical_bytes` couples the
  named constant to emitted values, so reverting to an unguarded divergent value
  fails.
- **IMPLEMENTED:** `hazard_events.py` documents the Padé regime exactly:
  `p = λ/(1+λ)` is valid for `λ << 1` and degrades at `λ >= 0.5`.
- **IMPLEMENTED:** raw `severity_milli` is documented as having no finite
  sampler ceiling because accepted risk scores are unbounded above. The C4-ii
  consequence consumer has a named 3,000 milli-severity ceiling matching the
  existing disturbance handler's 0–3 severity scale. Raw event bytes are never
  clamped or rewritten.
- **VERIFIED:** the raw cross-runtime C4-i stream remains byte-identical:
  14,991 events, 4,388,576 bytes, SHA-256
  `6248f26a931a479a40d1e7f5f1c7604659cc05700a77f93ffa297961ff650cc4`.

### Consequence coupling

- **IMPLEMENTED:** `apply_hazard_event_consequences` /
  `applyHazardEventConsequences` is an explicit delta-coupling step after pure
  sampling. It does not change the sampler or read/write its input tables.
- **IMPLEMENTED:** C2 exposure tags select operating victims by hazard; victim
  audit records contain asset IDs. F1 anchors participate through the same
  `asset_registry` and tag path. Tests require an `anchor_56037_*` victim.
- **IMPLEMENTED:** heat-wave consequences call only the existing
  `inject_disturbance` / `injectDisturbance` handler core. Input state is copied
  once per consequence batch; the public handler remains copy-on-write/pure.
- **IMPLEMENTED:** wildfire-smoke/proximity, drought-stress, and severe-storm
  events return `skipped_no_existing_handler` audit records when C2 tags select
  victims. No damage-cost or outage-day store/function was added.
- **IMPLEMENTED:** events with no operating tagged victim return
  `skipped_no_exposed_assets`. Skips are explicit return records, not silent
  log-and-continue paths.
- **IMPLEMENTED:** pre-coupled raw events, negative/non-integer severity, invalid
  vulnerability, and unknown adaptation write fields hard-fail. No catch-all
  handler was added.
- **VERIFIED:** unsupported events leave all four digest contracts unchanged;
  applied heat events record `handler: inject_disturbance` and change the state
  digest through that existing handler.

### Adaptation

- **IMPLEMENTED:** `heat_resilience_upgrade` is present identically in both
  action-library copies (schema 3.2, action count 50). The normal `apply_action`
  / `applyAction` path records the action and delegates its adaptation delta to
  a constrained helper.
- **IMPLEMENTED:** the only writable adaptation field is
  `climate_vulnerability_ppm` on tagged operating assets. The helper signatures
  accept only `(state, action, geoid)` and runtime validation rejects any
  additional config key, including `climate_context` or sampling inputs.
- **VERIFIED:** a poisoned adaptation config containing `climate_context`
  throws in both runtimes. Raw sampled events are byte-identical before and
  after adaptation, and a frozen climate context remains unchanged.
- **INFERRED:** mapping qualitative exposure tag values to fixed-point
  vulnerability multipliers (`low=0.25`, `med=0.60`, `high=1.00`) is a model
  scaling judgment, not a measured loss function. Existing C2 tag provenance is
  retained; the multiplier translation is deliberately visible in engine code.
- **INFERRED:** the action's 50% heat-vulnerability reduction is a flagged
  scenario parameter, not an empirical efficacy claim.
- **IMPLEMENTED / FLAGGED:** adaptation price is `0` for 2024/2035/2050 with
  `confidence: flagged` and a `cost_source` beginning `FLAGGED —`; site-specific
  hardening scope/prices are unavailable and were not invented.
- **VERIFIED:** both action-library copies are byte-identical (`cmp` exit 0).

### Golden M and legacy golden boundary

- **IMPLEMENTED:** new `golden_m.json` freezes one action sequence
  (`heat_resilience_upgrade`, Sweetwater GEOID `56037`, magnitude 1), seed 42,
  baseline retirements enabled, and years 2026–2030.
- **IMPLEMENTED:** all forks advance the engine with historical climate context;
  only the event sampler receives `historical`, `ssp245`, or `ssp370`. Therefore
  the no-event controls are identical and any trajectory divergence is caused
  only by sampled events and their consequences.
- **VERIFIED:** historical emits zero events and equals its pre-C4 control on all
  four contracts: state `bc09a67e...`, fiscal `58bd2636...`, existing assets
  `18bdf3eb...`, history `0b953d70...`.
- **VERIFIED:** SSP2-4.5 freezes 1,506 events and digests state `56e2efa8...`,
  fiscal `58bd2636...`, assets `18bdf3eb...`, history `eec3ebfb...`.
- **VERIFIED:** SSP3-7.0 freezes 1,530 events and digests state `c0564963...`,
  fiscal `58bd2636...`, assets `18bdf3eb...`, history `892e07ba...`.
- **VERIFIED:** same `(seed, lens)` reruns are deterministic in both runtimes;
  both runtimes match the same frozen M values for all four contracts.
- **IMPLEMENTED:** registry version 1.1 explicitly states that A–L historical
  four-contract bytes remain asserted and A–L non-historical runs are not
  golden assertions because those fixtures predate event consequences.
- **VERIFIED:** the complete A–L/G′/J′ 224-cell matrix in each runtime reproduced
  the recorded C4-i manifests exactly: Python
  `d7a5758404d0d992c8143dff7e4d091502e1af440be290f72dc687f889d61524`;
  TypeScript
  `4355fe52bd1647f69748797cc5ca5a83b13431cf2a40f1b6f10f3dd470de7be8`.
- **VERIFIED:** no A–L fixture is modified. Fixture status contains only the new,
  untracked-before-ticket `golden_m.json`; the registry is the sole modified
  file under `data/golden`.
- **VERIFIED:** `permitted_amendments = 4` and `amendments_used = 4`.

## R14 discriminating acceptance tests

| AC | Classification | Discriminating evidence |
|---|---|---|
| AC1 existing handlers only | **VERIFIED** | Python/TS `AC1: heat delegates to the existing handler...` requires `handler == inject_disturbance`, an F1 anchor victim, and a changed digest. Its paired unsupported-hazard test requires an explicit skip, null handler, no new damage/outage store, and unchanged four-contract state. |
| AC2 structural adaptation boundary | **VERIFIED** | Python inspects the helper signature and allowlist; Python/TS inject a forbidden `climate_context` config key and require a hard failure. Both also prove sampling/context unchanged after the valid action. |
| AC3 Golden M | **VERIFIED** | Python/TS Golden M tests freeze all four contracts for three lenses, rerun determinism, event-only no-event controls, and exact historical pre-C4 equality. |
| AC4 A–L historical bytes | **VERIFIED** | Full 224-cell Python and 224-cell TS emitters reproduce their recorded manifest SHA-256 values exactly; no A–L fixture path is modified. |
| AC5 amendment/golden discipline | **VERIFIED** | Registry test requires `amendments_used == permitted_amendments == 4`, explicit lens boundary, and M as a new no-amendment fixture. Git fixture audit shows no A–L change. |
| AC6 adaptation price | **VERIFIED** | Python/TS tests require all three price vintages to equal zero, `confidence == flagged`, and `cost_source` to start with `FLAGGED`. |

## Performance evidence

- **VERIFIED:** initial consequence implementation measured 49.145 ms median
  for coupling alone on 314 events, which put sampling plus coupling over the
  T1 50 ms trigger.
- **IMPLEMENTED:** batching now copies state once and repeatedly calls the same
  private core of the existing disturbance handler; public handler behavior is
  unchanged.
- **VERIFIED:** final Python measurement on 314 year-2050 SSP3-7.0 events:
  coupling median 8.978 ms; sampling + coupling median 14.228 ms; combined max
  14.452 ms across 10 runs. Projection-index hoisting is not triggered.

## Final verification

| Command | Result | Classification |
|---|---|---|
| `pytest -q` | `180 passed in 131.53s` | **VERIFIED** |
| `npm test -- --run` | 32 files, 356 tests passed | **VERIFIED** |
| `npm run parity` | 29 files, 332 tests passed | **VERIFIED** |
| `npm run lint` | exit 0 | **VERIFIED** |
| `npm run build` | exit 0; Vite large-chunk advisory only | **VERIFIED** |
| `python3 tests/verify_c4i_event_streams.py --output /tmp/t5-c4ii-events` | exact recorded stream SHA-256 | **VERIFIED** |
| Python/TS C4-i contract emitters | exact recorded manifest SHA-256 values | **VERIFIED** |
| `git diff --check` | exit 0 | **VERIFIED** |

## Explicit file list

1. `build_log/wave5/t5-c4ii.md`
2. `data/golden/fixture_registry.json`
3. `data/processed/mw_action_library_v3.json`
4. `src/hazard_events.py`
5. `src/terra_engine.py`
6. `terra-app/src/data/action_library_v3.json`
7. `terra-app/src/engine/engine.ts`
8. `terra-app/src/engine/events.ts`
9. `terra-app/src/engine/index.ts`
10. `terra-app/src/engine/types.ts`
11. `terra-app/tests/parity/c4ii-consequences.test.ts`
12. `terra-app/tests/parity/fixtures/golden_m.json`
13. `terra-app/tests/parity/golden-m.test.ts`
14. `tests/test_c4i_events.py`
15. `tests/test_c4ii_consequences.py`
16. `tests/test_golden_m.py`

## Explicit deferrals and non-actions

- **DEFERRED:** wildfire damage cost, drought outage/derate consequences, and
  severe-storm outage days. No qualifying current handler exists; each event is
  logged as skipped. Adding any such mechanic requires orchestrator escalation.
- **DEFERRED / FLAGGED:** empirical adaptation efficacy and site-specific price;
  the implemented values are transparent scenario parameters, with price zero.
- **VERIFIED NON-ACTION:** no A–L golden regeneration, no amendment consumption,
  no climate-table/input mutation, no baseline rewrite, no new dependency.
- **NOT TRIGGERED:** adaptation has not entered a CHANGES REQUIRED cycle; the
  two-consecutive-cycle cut escalation rule has not been reached.

## Commit evidence

- **DEFERRED UNTIL FIRST COMMIT:** the implementation commit SHA/stat and clean
  status will be appended in a follow-up evidence-only commit before review is
  requested. This is explicit because a commit cannot contain its own SHA.
