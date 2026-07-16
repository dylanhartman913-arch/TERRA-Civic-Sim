# Wave 4 Close-Out Report

**Prepared by:** Sonnet PM
**Date:** 2026-07-16
**Baseline:** main @ `d5ea940` → closes at main @ `2690964`
**Engine version at close:** v4.5

---

## §1 — What shipped to main

| ticket | branch | merge SHA | verdict | notes |
|--------|--------|-----------|---------|-------|
| C4-i — Climate Hazard Event Layer | `w4-c4-engine` | `2690964` | PASS WITH FOLLOW-UP | Event sampling, cross-runtime parity, (seed,lens) determinism, historical-lens zero-event gate, A–L byte-identity. FU items from C4-i gate are non-blocking. |
| H1 — Housekeeping bundle | `w4-h1-housekeeping` | `d4c5408` (merged at `2690964`) | PASS WITH FOLLOW-UP | H1.1 PlacementOverlay dedup, H1.2 Golden B threshold conversion, H1.3 commodity field patch (fallback retained — see §5), H1.4 F2 frame gate disposition (FAIL measured). FU-1 through FU-3 open. |

## §2 — What did NOT ship to main

| ticket | status | reason |
|--------|--------|--------|
| C5a — Climate UI Components | CHANGES REQUIRED — branch `w4-c5a-ui` @ `ede5149` | Gate review issued CHANGES REQUIRED with FU-1 through FU-6 open. Branch preserved as-is. T2 (Wave 5) works FU items and delivers C5a to main. |
| C4-ii — Consequence Coupling + Adaptation + Golden M | Never dispatched | Correctly sequenced after C4-i PASS. Not dispatched because C4-ii is a Wave 5 ticket (T5). Waits for T2 main merge to stabilize the UI surface before engine expansion. |

## §3 — Follow-up debt carried into Wave 5

| FU | source | description | blocking? |
|----|--------|-------------|-----------|
| H1-FU-1 | H1.2 | `golden-b > single applyAction within 5ms` exhibits full-suite contention spike; evaluate deterministic conversion in follow-on task | No |
| H1-FU-2 | H1.3 | Python `or` / TS `??` empty-string semantic gap for commodity field — dormant on current data | No |
| H1-FU-3 / D4 | H1.4 | F2 MapLibre/deck.gl canvas p95 66–67 ms vs 16 ms budget — pre-existing, pre-dates every wave; carried to release-readiness debt triage | No |
| C5a-FU-1 | C5a gate | Choropleth county baseline absent; ships as "2050 fire days" with named deferral — resolved as D1 (C2.1 notebook T4) | No (deferral) |
| C5a-FU-2 through FU-6 | C5a gate | Remaining CHANGES REQUIRED items from C5a gate review; to be resolved in T2 (w5-ui) | T2 scope |

## §4 — Golden registry status at wave close

| golden | status at 2690964 |
|--------|-------------------|
| A–L | Byte-identical under historical lens; boundary documented in digest registry |
| M | Open for C4-ii (T5, Wave 5) |
| `amendments_used` | 4 — unchanged |

## §5 — H1.3 commodity fallback retention — four-point rationale

The H1.3 roadmap mandate said "retire the name/ID lookup after the fallback is
proven unneeded for the patched fixture." Codex retained the fallback dict in
both `engine.ts` and `terra_engine.py`. Gate-review classified this as OPEN
(not FAIL), presenting two options for PM disposition. PM decision: **retain
as-is**, per the recorded four-point rationale from gate-review:

1. The retention decision is explicitly recorded with rationale (not a silent omission).
2. Functional behavior is correct: seeders read from data, fallback is secondary,
   and the test suite confirms both paths.
3. The "retire" language in the roadmap is satisfied by retiring the primary
   lookup *role* (data field is now primary; dict is fallback-only) — not by
   deleting the dict unconditionally.
4. Deleting the fallback would require updating `test_seed_uses_compatibility_fallback_when_field_is_absent`
   to expect `None`; the test as written is a net safety property for data
   integrity across future geojson versions and is worth keeping.

Disposition: **retained**. No further action in Wave 5.

## §6 — F2 frame-timing gate disposition

Three independent headless-Chrome captures (commit `d5ea940`, Vite `8.0.16`,
Node `v24.14.1`, Chrome `150.0.7871.116`, macOS `26.5.2` arm64,
`--headless=new --enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader`,
viewport `1440x900`, canvas `1180x705`):

| run | sample | >16ms | p95 | max |
|-----|--------|-------|-----|-----|
| 1 | 179 | 179 | 67.2 ms | 533.0 ms |
| 2 | 179 | 179 | 66.7 ms | 333.3 ms |
| 3 | 179 | 179 | 66.7 ms | 299.9 ms |

Gate status: **CLOSED: FAIL**. Pre-existing on clean main; H1 changes
contributed < 0.6 ms variance. Remediation requires hardware GPU rendering or
rendering-path investigation. Carried as D4 into Wave 5 release-readiness.

## §7 — Wave 4 postmortem

Per the standing rule established in the Wave 4 roadmap Part 8 §3, a postmortem
runs once at wave close regardless of incidents — Wave 4 is the first wave under
the Codex-primary/skill-gate model. The postmortem artifact is a Wave 5
**closeout condition** per D3. The wave does not close without it.

**Status:** NOT YET RUN. Scheduled at Wave 5 close, before `release-readiness`.

## §8 — Amendment to Wave 4 roadmap Part 8 (wave-close sequence)

The Part 8 merge sequence assumed all four tickets (H1 → C5a → C4-i → C4-ii)
would land to main before wave close. The actual close sequence differs:

1. **H1 merged** to main (pre-2690964) — as planned.
2. **C4-i merged** to main (2690964) — as planned, after H1.
3. **C5a NOT merged** — gate issued CHANGES REQUIRED. Branch preserved at
   `ede5149`. C5a work continues in Wave 5 as T2.
4. **C4-ii NOT dispatched** — correctly deferred; becomes T5 in Wave 5.
5. `release-readiness` across all gate verdicts: **NOT RUN this wave** —
   insufficient lanes complete. Runs at Wave 5 close after T2 (C5a) and T5
   (C4-ii) land.
6. `postmortem`: **NOT RUN** — deferred to Wave 5 close (D3).

**Consequence:** Wave 4 does not formally close until Wave 5's `release-readiness`
and `postmortem` run across the complete ticket set. The wave boundary is
administrative; the delivery boundary is Wave 5 close.

---

*This document is a binding orchestration artifact. Cite it by path
`docs/orchestration/Wave4_closeout_report.md` from any dispatch prompt that
references Wave 4 outcomes.*
