# Wave 5 Build Roadmap — Codex-Primary Execution Under Skill-Gated Review

**Prepared by:** Sonnet PM
**Date:** 2026-07-16
**Executes:** Sonnet PM (this document is the PM's operating manual)
**Builders:** Codex (GPT-5.5) for all primary development
**Reviewers:** Claude Code sessions invoking the 17-skill suite
**Baseline:** main @ `2690964` (C4-i + H1 merged, engine v4.5)
**Wave 5 scope:** T1 (verify baseline) ∥ T2 (C5a follow-ups) → T3 (later UI)
∥ T4 (C2.1 notebook) → [T5 C4-ii, not this phase] → T6 (C5b, later)
with postmortem and release-readiness at wave close.

---

## PART 0 — Standing rules (inherited from Wave 4; binding on every session)

All Wave 4 standing rules (R1–R8) carry forward unchanged. The dominant
Wave 4 failure modes are documented in `Wave4_closeout_report.md §8`. The
single most expensive was running worktrees from cloud-synced storage (OneDrive
`TimeoutError: [Errno 60]`). This wave's repo is confirmed at
`~/projects/Energy Modeling/energy-map` — non-synced.

R1. **Worktree evidence before dispatch.** `git worktree list` pasted in wave log.
R2. **Self-check preamble in every prompt.** `pwd` + `git branch --show-current`; halt on mismatch.
R3. **Audit trails are append-only.** No deletion or rewrite of prior findings.
R4. **Per-lane build-log fragments.** Sessions write to `build_log/wave5/<ticket>.md`.
R5. **Explicit `git add` file lists.** Never `-A`, never `.`.
R6. **Fix only what's listed.** Adjacent problems → "noticed, not touched."
R7. **Nothing that exists gets discarded without diff and report.**
R8. **One builder per physical directory, ever.**

Additional rule for Wave 5:
R9. **C5a branch preserved.** `w4-c5a-ui` @ `ede5149` is read-only for T3's
    cherry-pick. Do not delete, reset, or push to this branch. T2 creates a
    fresh `w5-ui` worktree from post-T2 main.

---

## PART 1 — Worktree assignments

| worktree | path | purpose |
|----------|------|---------|
| `w5-verify` | `../w5-verify` | T1 baseline verification; all review sessions |
| `w5-ui` | `../w5-ui` | T2 (C5a FU resolutions) now; T3 later |
| `w5-notebook` | `../w5-notebook` | T4 (C2.1 county baseline notebook) |
| `w5-engine` | `../w5-engine` | T5 (C4-ii consequence coupling) — NOT this phase |
| `w4-c5a-ui` | `../w4-c5a-ui` | Preserved at `ede5149` — read-only; T3 source |

All worktrees branch from main @ `2690964`. After creation:
1. Run `scripts/provision_worktree.sh <path>` for any worktree that will execute Python tests.
2. Paste `git worktree list` + `git ls-files | wc -l` (must equal 316) into `_setup.md`.

---

## PART 2 — The review pipeline (unchanged from Wave 4)

*(See `Wave4_roadmap.md` PART 2 for the full stage definitions — P, 0, 1, 2, 3, 4, 5.)*

Pipeline routing per ticket is specified per ticket below.

---

## PART 3 — P0: PM setup (before any dispatch)

P0.1 **Confirm repo location** — `pwd` not inside OneDrive/iCloud/Dropbox.
P0.2 **Confirm baseline SHA** — main @ `2690964`.
P0.3 **Confirm C5a branch preservation** — `w4-c5a-ui` @ `ede5149` still intact.
P0.4 **Create `build_log/wave5/`** fragment directory.
P0.5 **Commit orchestration docs** — `docs/orchestration/Wave5_roadmap.md` and
     `docs/orchestration/Wave4_closeout_report.md` to main before dispatch.
     Dispatch prompts may only cite documents that are readable from the worktree.
P0.6 **Provision four worktrees** — paste evidence per R1.
P0.7 **Stage-0 baseline run** in `w5-verify` — full test suite + lint.
     Paste raw output; do not restate expected numbers.
P0.8 **Append D1–D4** to `terra-app/TERRA_build_log.md` (append-only, §R3).

---

## PART 4 — Ticket T1: Baseline Verification

**Builder:** None (PM + review session in `w5-verify`).
**Purpose:** Establish clean Stage-0 evidence at Wave 5 baseline before any
            ticket work begins. Paste real output.

**Scope:** `npm run build`, `npm run lint`, `npm test -- --run`, Python
`pytest tests/ -q`, cross-runtime parity check.

**Expected findings (do not restate as evidence — run and paste):**
- Golden B timing pre-existing; document count as T2's starting evidence.
- Lint error/warning count is T2's starting evidence for the no-regression bar.
- Python suite should be 159+ tests (C4-i and H1 additions on top of Wave 4 P0 baseline).

---

## PART 5 — Ticket T2: C5a Follow-Up Resolutions (FU-1 through FU-6)

**Builder:** Codex in `w5-ui` (UI lock — nothing else touches UI files while T2 is live).
**Sequenced:** After T1 baseline is pasted. Parallel with T4 (notebook, no overlap).

**Scope:** Resolve all six C5a CHANGES REQUIRED items (FU-1 through FU-6) as
documented in `build_log/wave4/c5a.md` gate-review verdict. C5a ships to main
after T2 gate passes.

**D1 constraint (choropleth):** FU-1 (choropleth county baseline absent) is
resolved as a named deferral — **not an implementation task in T2**. The
choropleth ships in C5a as "2050 fire days" with the deferral stated plainly in
the LayerToggle label and the build log. T4 (C2.1) computes the missing baseline
later this wave; T6 (C5b) wires the full choropleth. FU-1 is closed in T2 by
documenting the named deferral, not by building the missing data layer.

**Acceptance criteria:**
AC1 All six FU items closed (FU-1 as named deferral; FU-2 through FU-6 as implemented fixes).
AC2 Test suite no regressions vs. T1 baseline.
AC3 Lint count ≤ T1 baseline (no new errors).
AC4 Design tokens only — no hex in touched files.
AC5 Canonical anchor module only — no new local AnchorFeature or TIER2_ANCHORS.

**Pipeline:** P → 0 → scope-audit → frontend-review → performance-review →
documentation-review → gate-review.

---

## PART 6 — Ticket T3: Later UI Work

**Builder:** Codex in `w5-ui` (after T2 merges; `w5-ui` re-created from
post-T2 main; `ede5149` cherry-picked deliberately).

**Scope:** TBD — scoped by orchestrator after T2 gate PASS. Candidate: additional
climate UI surfaces requiring C4-ii's engine output (defer until T5 lands).

---

## PART 7 — Ticket T4: C2.1 — County Climate Baseline Notebook

**Builder:** Codex in `w5-notebook`. Parallel with T2.

**Scope:** Compute the missing county-level climate baseline and per-lens/epoch
delta surface required by FU-1 (choropleth county baseline). Output:
`data/processed/county_climate_baseline.json` (or equivalent) with per-GEOID
per-metric historical baseline values and Δ(scenario, epoch) = scenario_value −
historical_baseline surfaces for every hazard metric available in
`county_climate_projections.json`.

**Constraints:**
- No UI code — notebook and data pipeline only.
- The historical baseline must be clearly sourced (PRISM/LOCA2/etc.); any
  synthetic or proxy derivation must be flagged as such.
- Output schema must be documented in the build log for T6 (C5b) to consume.

**Acceptance criteria:**
AC1 County baseline present for all study counties and all hazard metrics
    available in `county_climate_projections.json`.
AC2 Delta surface: Δ = scenario − historical, for each (GEOID, metric, lens, epoch).
AC3 Output schema documented (field names, units, epoch labels, source attribution).
AC4 No modification to engine files or tracked geojson.

**Pipeline:** P → python-pipeline-review → scientific-data-review →
data-contract-check → documentation-review → gate-review.

---

## PART 8 — Ticket T5: C4-ii — Consequence Coupling + Adaptation + Golden M

**Builder:** Codex in `w5-engine`. **NOT dispatched this phase.**

Dispatch requires:
- T2 (C5a) on main (UI surface stable before engine expansion).
- Orchestrator explicit go-ahead.

*(Ticket spec carried forward from Wave4_roadmap.md PART 5 — consult that
document for full content, AC list, and pipeline routing.)*

---

## PART 9 — Ticket T6: C5b — Full Choropleth + Climate UI Integration

**Builder:** Codex in `w5-ui`. Sequenced after T4 (C2.1 data) and T5 (C4-ii
engine) both land to main.

**Scope:** Wire the full hazard choropleth using T4's county baseline + delta
surface. Connect C4-ii's consequence/event surface to the C5a UI stubs
(exposure stress rows, event feeds).

---

## PART 10 — Wave close

1. PM merges T2 → T4 → T5 → T6 in dependency order; full suite green after each merge.
2. Per-lane fragments concatenated into `terra-app/TERRA_build_log.md` (append-only).
3. **`release-readiness`** runs across all gate verdicts including the Wave 4
   deferred lanes (C5a, C4-ii). This completes the Wave 4 administrative close.
4. **`postmortem`** runs at wave close — Wave 4 + Wave 5 combined process review.
   This is a **closeout condition** per D3: the wave does not close without the
   postmortem artifact.

**Escalations to the orchestrator (not PM-decidable):**
Any BLOCKED verdict; any R3 violation; any golden regeneration request;
Amendment 5 consumption; C4-ii wanting a new consequence mechanic.

---

*This document is a binding orchestration artifact. Cite it by path
`docs/orchestration/Wave5_roadmap.md` from any dispatch prompt.*
