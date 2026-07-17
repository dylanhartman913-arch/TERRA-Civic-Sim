# T1 — C4-i Closure Review

**Session:** w5-verify @ `9883f85` (main, 2026-07-16)
**Reviewer:** Claude Code review session
**Scope:** C4-i implementation as merged on main — commit `41e961e` —
  `src/hazard_events.py`, `terra-app/src/engine/events.ts`,
  `terra-app/src/engine/types.ts`, four C4-i test files plus the two
  verifier/harness scripts.
**Skills run:** `performance-review`, `integration-review`
**Gate purpose:** C4-ii (T5) dispatch is gated on this session closing
  WITHOUT a BLOCKING finding from either skill.

---

## Self-check

```
pwd:    /Users/dylanhartman/projects/Energy Modeling/energy-map
branch: w5-verify
HEAD:   9883f85
C4-i:   41e961e (in history — confirmed)
```

CONFIRMED. Proceeding.

---

## Skill 1 — performance-review

### Method

Real wall-clock timing collected in both runtimes against the production
data files in `w5-verify/data/processed/` (157 counties,
39,888 projection records). The engine's year-loop call pattern is:
`sample_hazard_events` called once per year with a single-year list —
not a batched multi-year call. Both patterns were measured.

Timing test file `terra-app/tests/parity/c4i-timing.test.ts` was written
to the review worktree as an ephemeral measurement artifact and removed
after data capture. It does not appear in the tracked file inventory.

### Python timing (w5-verify, CPython, 2026-07-16)

Host: MacBook (darwin 25.5.0), non-synced storage confirmed.

| Scenario | Events | min | median | max | Runs |
|---|---:|---:|---:|---:|---:|
| Single year (2050, ssp370, seed=42) | 314 | 5.55 ms | 6.13 ms | 6.84 ms | 5 |
| 6-year matrix (MATRIX_YEARS, ssp370, seed=42) | 1,881 | 18.88 ms | 19.10 ms | 21.95 ms | 5 |
| Full 64-year range (2025–2088, ssp370, seed=42) | 20,362 | 170.58 ms | 175.29 ms | 179.26 ms | 3 |

**Per-year call timing (engine year-loop simulation, 10 runs each):**

| Year | Events | median | min |
|---:|---:|---:|---:|
| 2025 | 298 | 5.39 ms | 5.06 ms |
| 2030 | 308 | 5.24 ms | 5.02 ms |
| 2040 | 314 | 5.27 ms | 5.06 ms |
| 2050 | 314 | 5.02 ms | 4.92 ms |
| 2065 | 318 | 4.99 ms | 4.87 ms |
| 2088 | 329 | 5.16 ms | 5.02 ms |

Inner loop scale: 157 counties × 1 year × 4 hazards = 628 iterations per call.
Throughput: ~9.8 µs per county-hazard per year (median).

`canonical_event_stream` (20,362 events, 5,896,979 bytes): **24.03 ms**

**Projection index build cost (per call):** median **2.24 ms** (36.5% of the
~6 ms single-year call). The index is rebuilt from the full 39,888-record
projection list on every call to `sample_climate_hazard_events`, including
when `lens` is unchanged between successive year advances.

### TypeScript timing (w5-verify, Node v24.14.1 / vitest v4.1.8, 2026-07-16)

| Scenario | Events | min | median | max | Runs |
|---|---:|---:|---:|---:|---:|
| Single year (2050, ssp370, seed=42) | 314 | 1.24 ms | 1.40 ms | 3.45 ms | 10 |
| 6-year matrix (MATRIX_YEARS, ssp370, seed=42) | 1,881 | 3.61 ms | 3.83 ms | 4.01 ms | 5 |
| Full 64-year range (2025–2088, ssp370, seed=42) | 20,362 | 28.23 ms | 33.08 ms | 34.34 ms | 3 |

**Per-year call timing (engine year-loop simulation, 10 runs each):**

| Year | Events | median | min |
|---:|---:|---:|---:|
| 2025 | 298 | 0.82 ms | 0.81 ms |
| 2030 | 308 | 0.83 ms | 0.82 ms |
| 2040 | 314 | 0.84 ms | 0.83 ms |
| 2050 | 314 | 0.87 ms | 0.81 ms |
| 2065 | 318 | 0.82 ms | 0.81 ms |
| 2088 | 329 | 0.90 ms | 0.86 ms |

Inner loop throughput: ~2.2 µs per county-hazard per year (median).

`canonicalClimateEventStream` (20,362 events, 5,896,979 chars): **19.40 ms**

### Runtime comparison

| Metric | Python | TypeScript | Ratio |
|---|---:|---:|---:|
| Per-year call (median) | ~5.1 ms | ~0.85 ms | **6× faster in TS** |
| Full 64-year run | 175 ms | 33 ms | 5.3× faster in TS |
| Canonical stream (20k events) | 24 ms | 19 ms | 1.3× faster in TS |

### Performance findings

**Finding P-1 — Projection index rebuild cost (NON-BLOCKING, C4-ii pre-condition).**
`_projection_index` / `buildProjectionIndex` is rebuilt from scratch on every
call to the sampler. At the engine's expected call pattern (one call per year
advance, single-year list), this costs ~2.2 ms/call in Python — 36.5% of the
per-year budget. Over 64 years Python cumulative cost ≈ 320 ms; TS ≈ 54 ms.
Both are comfortably within an interactive budget. The rebuild cost is not
blocking C4-i. However: if C4-ii adds per-event consequence computation that
scales with the event count (~300 events/year × multiplier arithmetic), the
Python per-call budget will grow. The projection index rebuild should be flagged
as a **C4-ii optimization target** if post-consequence per-year latency exceeds
50 ms in Python. The fix is straightforward: hoist index construction out of the
sampler and pass it as a pre-built argument — but that is a C4-ii scope decision,
not a C4-i defect.

**Finding P-2 — No BLOCKING performance finding.** Both runtimes complete
a full 64-year simulation in well under 1 second. The per-year hot-path
timings establish the first real baseline for consequence-coupling budget
planning. These numbers are required to have been captured before C4-ii
begins (gate-review follow-up item 1) and that requirement is now satisfied.

**BLOCKING finding from performance-review: NONE.**

---

## Skill 2 — integration-review

### Scope of this audit

Cross-runtime interface surface added by C4-i: public wrapper functions in
the engine modules, the versioned type set, seed-handling contract, and
lens-plumbing. Confirms Python and TypeScript agree on the event-stream
shape and that no silent divergence exists.

### Versioned interface elements introduced by C4-i

#### Python public surface (`terra_engine.py:135`)

```python
def sample_hazard_events(state, *, seed: int, lens: str, years,
                         county_baselines: list[dict],
                         projection_points: list[dict]) -> list[dict]:
```

Thin wrapper. Discards `state` with `del state`. Delegates unconditionally
to `hazard_events.sample_climate_hazard_events(**kwargs)`.

#### Python module surface (`hazard_events.py`)

```python
sample_climate_hazard_events(*, seed, lens, years, county_baselines,
                              projection_points) -> list[dict]
canonical_event_stream(events: list[dict]) -> bytes
```

Constants: `VALID_LENSES`, `EVENT_FIELDS` (11-tuple), `HAZARD_SPECS` (4-tuple),
`HAZARD_ORDER` (dict), `PPM = 1_000_000`.

#### TypeScript public surface (`engine.ts:121`)

```typescript
export function sampleHazardEvents(
  state: EngineState,
  input: ClimateHazardSamplingInput,
): ClimateHazardEvent[]
```

Thin wrapper. Discards `state` with `void state`. Delegates unconditionally
to `sampleClimateHazardEvents(input)`.

#### TypeScript module surface (`events.ts:172, 246`)

```typescript
export function sampleClimateHazardEvents(input: ClimateHazardSamplingInput): ClimateHazardEvent[]
export function canonicalClimateEventStream(events: readonly ClimateHazardEvent[]): string
```

Constants: `PPM = 1_000_000`, `CLIMATE_HAZARD_SPECS` (4-element), `CLIMATE_HAZARD_ORDER` (Map),
`CLIMATE_EVENT_FIELDS` (11-element ReadonlyArray).

#### TypeScript types (`types.ts`)

`ClimateHazardEvent` (line 974), `ClimateHazardBaseline` (951),
`ClimateProjectionPoint` (964), `ClimateHazardKind` (944),
`ClimateHazardSamplingInput` (989), `ClimateLens` (921).

### Contract parity audit

**Seed handling:** Both runtimes validate `seed` is an integer (Python:
`not isinstance(seed, int)`; TS: `!Number.isInteger(input.seed)`). Seed is
embedded into the FNV-1a key string identically: `f"{seed}|{lens}|{year}|{geoid}|{kind}"`.
Python admits `bool` as `seed` (`isinstance(True, int)` is `True`); TS
`Number.isInteger(true)` is also `true`. The `bool`-as-seed quirk is symmetric
across runtimes. Previously documented (python-pipeline-review, error-handling-review).

**Lens plumbing:** `VALID_LENSES` / `['historical', 'ssp245', 'ssp370']` is
identical in both runtimes. Early return `[]` on `historical` is in both.
TS `ClimateHazardEvent.lens` is typed as `Exclude<ClimateLens, 'historical'>`
(compile-time guarantee); Python has no equivalent type annotation.

**Event-stream field set and order:** `EVENT_FIELDS` (Python) and
`CLIMATE_EVENT_FIELDS` (TS) list the same 11 fields in the same sequence:
`event_id, year, geoid, hazard_kind, severity_milli, annual_probability_ppm,
baseline_frequency_micros, projection_factor_ppm, lens, seed,
consequence_multiplier_ppm`. IDENTICAL.

**Sort key:** Both sort on `(lens, seed, year, geoid, hazard_kind_index)` in
that priority. IDENTICAL in semantics.

**Canonical serialization:**
- Python: `json.dumps(normalized, separators=(",", ":")) + "\n"` → UTF-8 bytes
- TS: `` `${JSON.stringify(normalized)}\n` `` → UTF-8 string
- Compact JSON (no insignificant whitespace), same field order, trailing newline.
- Both `canonical_event_stream` / `canonicalClimateEventStream` return types
  differ (Python: `bytes`, TS: `string`) but the byte content is identical.
  This is a language-idiomatic difference, not a contract divergence.

**`consequence_multiplier_ppm`:** Always `0` in both runtimes.
- TS: typed as literal `0` in `types.ts:986` — compile-time gate against
  C4-ii writing non-zero without widening the type.
- Python: writes integer literal `0` in `hazard_events.py:211` — no
  compile-time equivalent. Previously noted by architecture-review (follow-up
  item 2b); still present.

**FNV-1a implementation:** Both runtimes implement FNV-1a-32 with
`result = 0x811C9DC5`, prime `0x01000193`, 32-bit mask. Key strings are
pure ASCII (seed integer + lens string + decimal year + 5-digit FIPS +
hazard kind name + "|occurrence" or "|severity"). UTF-8 encoding is
identical to ASCII for these inputs. IDENTICAL output confirmed by AC1/AC2
byte-parity evidence (`SHA-256 6248f26a...`).

### Interface divergence findings

**Finding I-1 — Wrapper API structural divergence (NON-BLOCKING, C4-ii
  must track).** Python wrapper (`terra_engine.py:135`) exposes individual
keyword-only arguments matching the module function directly. TS wrapper
(`engine.ts:121`) takes the `ClimateHazardSamplingInput` struct. These are
language-idiomatic equivalents and produce identical behavior. However, C4-ii
must decide explicitly which surface it changes: if it adds state-derived
inputs to the TS wrapper (e.g., a multiplier table from `EngineState`), it
must add a parallel argument to the Python wrapper — not silently leave one
runtime behind. This decision should be documented in C4-ii's Stage P before
implementation.

**Finding I-2 — Python-side named constant for zero-multiplier stub absent
  (NON-BLOCKING, carry-forward from architecture-review follow-up item 2b).**
`hazard_events.py:211` writes integer literal `0` for `consequence_multiplier_ppm`.
No named constant (`CONSEQUENCE_MULTIPLIER_INERT = 0` or equivalent). TS has
the literal type `0` as compile-time enforcement. Python has no equivalent
guard; a Python consumer can write any integer to this field without a static
error. This is a documentation/enforcement gap, not a data-contract defect —
the byte contract is identical. Should be resolved before C4-ii widens the
multiplier range.

**Finding I-3 — `localeCompare` in TS geoid sort (LOW SEVERITY, carry-forward
  from data-contract-check follow-up item 5).** `events.ts:193` uses
`left[0].localeCompare(right[0])` for the baseline geoid sort. Python uses
code-point order (`<` on strings). For pure ASCII FIPS codes, all ICU-based
JS engines produce code-point order under any locale, so this is harmlessly
correct in all current environments. The AC1/AC2 byte-parity evidence (8 cells
× 4 processes, `cmp -s` exit 0) empirically confirms no divergence. Still,
spec-nondeterministic; recommend replacing with an explicit code-point
comparison before targeting any non-ICU JS runtime.

**Finding I-4 — No new divergences found.** The field set, sort order, fixed-
point arithmetic, FNV-1a key format, projection reference epoch (2030), clamp
bounds ([PPM/4, 4×PPM]), Padé approximation formula, empty-stream bytes, and
`consequence_multiplier_ppm: 0` initialization are all identical between
runtimes. No silent divergences were identified beyond I-1 through I-3, all
of which are previously documented.

**BLOCKING finding from integration-review: NONE.**

---

## Combined gate verdict

| Skill | BLOCKING findings | Non-blocking findings |
|---|---|---|
| performance-review | NONE | P-1 (index rebuild cost, C4-ii optimization target) |
| integration-review | NONE | I-1 (wrapper API divergence, C4-ii track), I-2 (Python zero-multiplier constant), I-3 (localeCompare) |

**T5 (C4-ii) dispatch gate: CLEAR.**
Neither skill produced a blocking finding. C4-ii may be dispatched subject
to the PM's explicit go-ahead and all other Wave 5 sequencing conditions
(T2 on main per PART 8).

The follow-up items P-1, I-1, and I-2 should be addressed in C4-ii's Stage P;
I-3 should be addressed in any ticket that next touches `events.ts`.

---

## AC6 status update

**T2 has NOT merged as of this session.** HEAD is `e5803a0`; no T2 commit
is present in `git log`. The lint baseline remains 64 errors / 7 warnings
(`npm run lint` exits 1). **AC6 for C4-i therefore remains DEFERRED.** The
condition for marking AC6 VERIFIED — that T2's lint-debt resolution has
merged to main — has not been met. This record will be updated when T2 merges.

*(Per the gate-review verdict in `build_log/wave4/c4-i.md`: "AC6 cannot
achieve VERIFIED status while those [lint] failures persist.")*

---

## AC6 VERIFIED — 2026-07-16

**T2 merged to main as merge commit `d6f47d74487d94a43b2c34d1e961255ffee548f1`
(Merge: e5803a0 d264b3d, "Merge w5-ui: T2 retire UI lint debt (PASS)").**

`npm run lint` exits 0 with 0 errors / 0 warnings (confirmed in t2-lint.md).
Full suite green at merge: 345 TS (30 files) / 168 Python — all passed.

**AC6 is now VERIFIED.** C4-i closure is complete.

---

## Timing baseline summary (C4-ii input)

These numbers are the required pre-consequence-coupling baselines mandated by
gate-review follow-up item 1. They establish C4-ii's performance budget:

| Runtime | Per-year call (median) | Full 64-yr run | Projection index build |
|---|---:|---:|---:|
| Python | 5.1 ms | 175 ms | 2.2 ms (36.5% of per-year) |
| TypeScript | 0.85 ms | 33 ms | (included in above) |

C4-ii should re-benchmark after adding consequence multipliers and flag if
Python per-year latency exceeds 50 ms (the index rebuild will then warrant
hoisting outside the year loop).
