# Wave 4 Build Roadmap — Codex-Primary Execution Under Skill-Gated Review

**Prepared by:** Fable orchestrator, 2026-07-12
**Executes:** Sonnet PM (this document is the PM's operating manual)
**Builders:** Codex (GPT-5.5) for all primary development
**Reviewers:** Claude Code sessions invoking the 17-skill suite
**Baseline:** main @ `6fd35bf` (post-Wave-3), 319 TS / 127 Python = 446 tests,
engine v4.4, `amendments_used: 4`, Goldens A–J′, K, L frozen
**Wave 4 scope:** C4 (split into two handoffs) ∥ C5a ∥ H1 housekeeping,
after P0 setup. C5b integration + final sweep remains Wave 5.

---

## PART 0 — Role contract

**Sonnet PM** owns: worktree creation with pasted evidence, dispatch,
sequencing, per-lane log collection, invoking the correct skill sessions per
handoff, routing verdicts back to Codex, and the wave-close release decision
via `release-readiness`. The PM **never** builds engine code, never edits any
finding (append-only, §PART 1 R3), and never issues an accept/reject verdict
itself — `gate-review` is the sole verdict issuer.

**Codex** owns: implementation inside its assigned worktree, a pre-build test
plan per ticket, and a handoff report classifying every claim as
**implemented / verified / inferred / deferred**. Anything Codex did not
personally run and observe is "inferred," not "verified."

**Claude Code (skills)** owns: all review. Skill sessions report findings
only; they do not fix code. Fixes go back to Codex as CHANGES REQUIRED items.

---

## PART 1 — Standing rules (from the Wave 3 incident; binding on every session)

R1. **Worktree evidence before dispatch.** No prompt is dispatched until the
    PM pastes `git worktree list` output into the wave log showing that
    session's isolated worktree exists. A checklist mark is a plan; terminal
    output is a fact.
R2. **Self-check preamble in every prompt.** First action of every session:
    print `pwd` and `git branch --show-current`; halt if they don't match
    the assignment.
R3. **Audit trails are append-only.** No session deletes or rewrites a prior
    finding — pass, fail, or otherwise. Resolutions are appended beneath the
    original with attribution and date. Violation = immediate BLOCKED verdict
    on the offending handoff + postmortem.
R4. **Per-lane build-log fragments.** Sessions write to
    `build_log/wave4/<ticket>.md`, never directly to `TERRA_build_log.md`.
    The PM concatenates at integration. This removes the shared-file race by
    construction.
R5. **Explicit `git add` file lists.** Never `-A`, never `.`. The handoff
    report enumerates every file; `scope-audit` diffs that list against the
    ticket's declared scope.
R6. **Fix only what's listed.** Adjacent problems get logged in the handoff
    under "noticed, not touched" — especially during remediation-flavored
    work (H1), where the Wave 3 record shows scope drift is most likely.
R7. **Nothing that exists in one place gets discarded.** Stash, untracked
    file, single working tree: diff against committed state and report
    before any drop/overwrite.
R8. **One builder per physical directory, ever.** If a worktree isn't ready,
    the session waits. This is the invariant that failed in Wave 3; every
    other rule is downstream of it.

---

## PART 2 — The review pipeline (skill routing per handoff)

Every Codex handoff moves through stages in order. A stage failure returns
the handoff to Codex; later stages don't run on a failed build.

**Stage P (pre-build, before implementation):** Codex submits a test plan
for the ticket → **`test-plan-review`** judges whether the plan, executed
faithfully, would actually prove the acceptance criteria (not just exercise
the happy path). Implementation does not begin until the plan passes.

**Stage 0 (gate-of-gates):** **`build-and-lint`** — compile, lint, type
check, full existing suite. Zero judgment; exit codes only. Hard stop on
failure.

**Stage 1 (alignment):** **`scope-audit`** (touched files vs. declared
list — every submission, no exceptions) + **`architecture-review`** (any
handoff adding new modules, abstractions, or cross-cutting mechanisms;
skip for pure-data or narrow-fix diffs).

**Stage 2 (domain — pick per diff):**
- Engine / climate math → **`scientific-data-review`** (unit errors,
  distributional assumptions, leakage, aggregation)
- Notebook / ETL → **`python-pipeline-review`**
- React/TS UI → **`frontend-review`**

**Stage 3 (resilience):** **`error-handling-review`** on any diff with new
error paths (always, for engine handoffs); **`security-scanner`** if the
diff touches input handling, file paths from data, or external fetch;
**`performance-review`** whenever a perf claim is made or a hot path
changes — with its standing mandate that proxy benchmarks never close a
perf criterion.

**Stage 4 (contracts):** **`data-contract-check`** on any schema/shape
change (scenario file, registry rows, JSON outputs); **`integration-review`**
on anything touching the cross-runtime engine contract (Python↔TS parity is
a versioned interface for our purposes) or shared type surfaces;
**`documentation-review`** on every handoff's build-log fragment — the
fragment is a claim about system behavior and gets checked against the diff
like any other claim.

**Stage 5 (verdict):** **`gate-review`** aggregates all findings, classifies
each acceptance criterion against the evidence taxonomy, and issues the sole
verdict: PASS / PASS WITH FOLLOW-UP / CHANGES REQUIRED / BLOCKED.

**Wave close:** **`release-readiness`** aggregates all gate verdicts +
follow-up debt and answers "does Wave 4 ship to main as a release."

**Learning triggers:** **`postmortem`** fires automatically on (a) the same
acceptance criterion hitting 2 consecutive CHANGES REQUIRED, or (b) any R3
violation or incident. Its output is a closure condition or process change,
not a third identical review cycle.

---

## PART 3 — P0: PM setup (before any dispatch)

P0.1 **Resolve the untracked test-data dependency (dispatch blocker).**
     `data/processed/county_climate_projections.json` is required by the
     Python climate suite and is not in git — it will not exist in fresh
     worktrees, and C4 fails Stage 0 without it. Decision (orchestrator):
     **track it** — it is a build deliverable with full provenance, not a
     scratch file. Commit with a provenance note referencing C1.6. While
     there: run the repo-wide audit from the Wave 3 report — grep test
     suites for `data/` path literals, cross-check against `git ls-files`,
     and track-or-fixture anything else found. Log the audit table.
P0.2 **Create four worktrees from main** — `w4-c4-engine`, `w4-c5a-ui`,
     `w4-h1-housekeeping`, `w4-verify` (reviewers run in their own checkout;
     verification diffs against real branches, never a builder's tree).
     Paste `git worktree list` into the wave log (R1).
P0.3 **Create `build_log/wave4/`** fragment directory (R4).
P0.4 **Confirm skill availability** — one dry-run `build-and-lint` invocation
     against clean main in `w4-verify`; its output is the wave's Stage-0
     baseline (446 green, lint clean). Also gives a fresh read on the
     Golden B flake (H1.2) before anyone changes anything.

---

## PART 4 — Ticket C4-i: Climate Hazard Event Layer (no consequences)

**Builder:** Codex in `w4-c4-engine` (engine lock — nothing else touches
engine files while C4 lanes are live). **Sequenced before C4-ii.**

**Scope (declared file list for `scope-audit`):** `engine.ts` / 
`terra_engine.py` (event sampling), `events.ts` / event module equivalents,
`types.ts` (event type extensions), new test files, build-log fragment.
NOT in scope: consequence handlers, adaptation actions, action library,
UI, goldens (no freeze this ticket).

**Content:**
1. Seeded stochastic hazard event generation, both runtimes: per year, per
   county, sample hazard events (heat wave, wildfire smoke/proximity,
   drought stress, severe storm) with frequency/severity parameterized from
   the C2 hazard baseline × the active lens's projection deltas (p50 only in
   physics, per the C3 constraint). Fold the C3-deferred heat-derate hook in
   ONLY if an existing derate mechanic can express it; otherwise it stays
   logged for C4-ii/C5.
2. **`(seed, lens)` purity:** identical seed + identical lens ⇒ bit-identical
   event streams, both runtimes, cross-runtime parity on the stream itself.
   Different lens, same seed ⇒ streams may diverge. Historical lens ⇒ zero
   climate events, always (the climate-off gate extends to events).
3. **Inertness this ticket:** events are generated but consequence coupling
   is stubbed to zero — so all four digest contracts remain byte-identical
   on every frozen golden (A–L) under BOTH lenses, migration on/off. This is
   the acceptance criterion that makes C4-i independently gateable.
4. Exogeneity: the permanent C0 test extends to event streams — mutating the
   action log cannot change the event stream for a fixed (seed, lens).

**Acceptance criteria (gate-review checks each against evidence):**
AC1 event-stream cross-runtime parity (verified = both runtimes' streams
diffed byte-wise by the verifier); AC2 (seed, lens) determinism; AC3
historical lens produces zero events; AC4 four-contract byte-identity on
A–L, both lenses, migration on/off; AC5 exogeneity extension green; AC6
test plan executed as reviewed.

**Pipeline:** P → 0 → scope-audit + architecture-review →
scientific-data-review (sampling math, frequency scaling) →
error-handling-review + performance-review (sampling in the year loop is a
hot path; any perf claim needs real timing) → integration-review
(cross-runtime contract) + data-contract-check (event type additions) +
documentation-review → gate-review.

---

## PART 5 — Ticket C4-ii: Consequence Coupling + Adaptation + Golden M

**Builder:** Codex in `w4-c4-engine`, dispatched only after C4-i's PASS (or
PASS WITH FOLLOW-UP with the follow-ups triaged as non-blocking).

**Scope:** consequence wiring (existing handlers only), adaptation action
family, `action_library` additions, Golden M fixture + parity tests,
build-log fragment. NOT in scope: new consequence mechanics — if a
consequence cannot be expressed through existing derate/outage/damage/event
machinery (Phase 3/4 lineage), it is logged and skipped, not invented.

**Content:**
1. **Consequence coupling:** sampled events apply consequences exclusively
   through existing mechanics — derates, outage days, damage costs against
   exposed assets (C2 exposure tags select the victims; F1 anchors are
   taggable victims too). Delta-coupling only; no baseline rewrites.
2. **Adaptation actions** (priced via the Z1.1/Z2 pattern, cited or flagged):
   they modify exposure/vulnerability parameters, NEVER hazard tables —
   assert this structurally (an adaptation action cannot write to
   climate_context or event-sampling inputs). This family is the roadmap's
   designated cuttable scope: if it hits the 2-cycle postmortem trigger, the
   orchestrator decides whether it moves to Wave 5.
3. **Golden M — resilience fork:** one scripted action sequence, one seed,
   run under ssp245 and ssp370: trajectories diverge only through
   events/consequences; the same (seed, lens) rerun is deterministic;
   historical lens run of the same script shows zero climate events and
   matches its pre-C4 digest. Freeze `golden_m.json` + digest registry
   entries + parity tests both runtimes. Letter M per the S0 assignment.
4. Goldens A–L remain byte-identical under historical lens; under
   non-historical lenses A–L are not asserted (they predate events) — 
   document this boundary in the digest registry rather than leaving it
   implicit.

**Acceptance criteria:** AC1 consequences flow only through existing
handlers (architecture-review hunts for parallel mechanisms); AC2 adaptation
cannot touch hazard inputs (structural test); AC3 Golden M determinism +
cross-runtime parity on all four contracts; AC4 A–L historical-lens
byte-identity preserved; AC5 zero golden regenerations, `amendments_used`
still 4; AC6 every adaptation price cited or flagged.

**Pipeline:** P → 0 → scope-audit + architecture-review (the parallel-
mechanism hunt is the core risk) → scientific-data-review →
error-handling-review + performance-review → data-contract-check (action
library schema, golden fixture format) + integration-review +
documentation-review → gate-review. **`test-verifier`** additionally runs
here (and on C4-i): confirm no test was deleted/skipped/weakened to get
green, and that coverage on touched files is adequate.

---

## PART 6 — Ticket C5a: Climate UI Components (C0–C3 surface only)

**Builder:** Codex in `w4-c5a-ui`. Parallel with C4 lanes throughout —
touches no engine files.

**Scope:** lens indicator/selector (scenario-file-level lens, surfaced at
session start and in the debrief header), county-card climate panel (hazard
trajectory fan charts p10/p50/p90 straight from
`county_climate_projections.json`, attribution popovers showing
{scenario, epoch, percentile, source, method, confidence} — the low-
confidence and Eagle-CO-bias flags render, not vanish), hazard choropleth
layers (C2 baseline + projection deltas), exposure badges on assets/anchors
from C2 tags. Components that need C4's surface (exposure stress rows,
event feeds) are OUT of scope — Wave 5.

**Hard constraints:** zero UI-side hazard arithmetic — display what the data
files and engine surface provide; design tokens only, no hex (the F2
standard); **one canonical anchor/asset data module** — do not re-derive
local copies (the `PlacementOverlay.tsx` duplication is the named
anti-pattern, and H1.1 is deleting it while this ticket runs — coordinate
through the PM on the shared module's location).

**Perf criterion, stated honestly:** if headless-Chrome/Playwright is
available in the environment, real frame timing on the choropleth +
facility layers is the evidence; if not, the criterion is carried as
UNVERIFIED with proxy numbers labeled as proxies. `performance-review`
enforces this; the F2 perf item (see H1.4) sets the precedent.

**Pipeline:** P → 0 → scope-audit → frontend-review (state placement,
a11y, API-contract assumptions vs. the real engine surface) →
performance-review → documentation-review → gate-review.

---

## PART 7 — Ticket H1: Housekeeping bundle (remediation discipline applies)

**Builder:** Codex in `w4-h1-housekeeping`. R6 applies with force: fix only
what's listed; log everything else.

H1.1 **PlacementOverlay dedup** — replace the local `AnchorFeature` /
     `TIER2_ANCHORS` re-derivation with the canonical module (created here,
     consumed by C5a — PM sequences the module's landing before C5a needs
     it, or C5a builds against the agreed interface).
H1.2 **Golden B timing threshold** — investigate with evidence: 20-run
     timing distribution on clean main (P0.4 gives run 1), git-blame
     confirmation the 50ms number was never derived, then either a justified
     new threshold or a conversion to a non-timing assertion. The trend
     (52→55→76ms) gets explained, not waved through.
H1.3 **NB 22 `commodity` field patch** — add the real MSHA-derived commodity
     field to `mw_anchor_facilities.geojson`, retiring F1's
     `ANCHOR_MINE_COMMODITY` name-lookup debt. Confirm F1's seeding reads
     the new field with the lookup as fallback, and that registry contents
     are unchanged for all existing anchors (digest surfaces untouched by
     construction, but assert anyway).
H1.4 **F2 perf gate disposition** — if the environment gained real
     frame-timing capability, run it and close the item with evidence; if
     not, re-carry it explicitly in the wave-close report. It does not
     silently become "passed." (`performance-review` signs off on whichever
     disposition applies.)

**Pipeline:** P (lightweight plan) → 0 → scope-audit (line-by-line — this
is the remediation-risk lane) → domain review per item (frontend-review for
H1.1, python-pipeline-review for H1.3) → gate-review.

---

## PART 8 — Wave-close: integration + release decision

1. PM merges lanes in order: H1 (canonical module first) → C5a → C4-i →
   C4-ii, each only after its gate-review PASS; full suite green after each
   merge; per-lane fragments concatenated into `TERRA_build_log.md` in merge
   order (append-only).
2. **`release-readiness`** runs across all gate verdicts: interaction check
   between accepted changes (C5a's UI against C4's merged engine surface,
   H1.3's geojson against F1's seeding), accumulated follow-up debt triage,
   and the release-level verdict.
3. **`postmortem`** runs once at wave close regardless of incidents — Wave 4
   is the first wave under the Codex-primary/skill-gate model, and the
   learning pass on the process itself (gate friction, verdict cycle times,
   skill routing gaps) is part of the deliverable to the orchestrator before
   Wave 5 (C5b integration + final sweep across A–M) is scoped.

**Escalations to the orchestrator (not PM-decidable):** any BLOCKED verdict;
the adaptation-family cut decision; any R3 violation; any request to
regenerate a golden or consume Amendment 5; C4-ii wanting a consequence
mechanic that doesn't exist in current machinery.
