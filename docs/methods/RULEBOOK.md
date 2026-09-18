# RULEBOOK.md — R1–R18 standing orchestration rules

**Canonical, single-source home for the R1–R18 protocol rules.** Extracted
verbatim (exact wording and numbering preserved, no rewrite or summarization)
from `docs/roadmaps/Wave 2-6 Roadmaps.md`, which remains the historical record
of *when* and *why* each rule was added but is no longer the place to read the
rule text itself — see that file's rulebook section, which now points here.

This closes W7-3 / C-1 (`docs/closeouts/v0.7.0.md`, Part F). Extraction only:
the fuller per-rule structure described in `docs/roadmaps/Wave7_roadmap.md`
PART 6 (stable ID, originating artifact/commit, amendment history, enforcement
mechanism, evidence required, retirement condition) is **not** built here —
see the note at the end of this file.

---

## R1–R8 — from the Wave 3 incident (binding on every session)

Source: `Wave 2-6 Roadmaps.md`, Wave 4 Build Roadmap, PART 1 — "Standing rules
(from the Wave 3 incident; binding on every session)."

R1. Worktree evidence before dispatch. No prompt is dispatched until the PM pastes git worktree list output into the wave log showing that session's isolated worktree exists. A checklist mark is a plan; terminal output is a fact.

R2. Self-check preamble in every prompt. First action of every session: print pwd and git branch --show-current; halt if they don't match the assignment.

R3. Audit trails are append-only. No session deletes or rewrites a prior finding — pass, fail, or otherwise. Resolutions are appended beneath the original with attribution and date. Violation = immediate BLOCKED verdict on the offending handoff + postmortem.

R4. Per-lane build-log fragments. Sessions write to build_log/wave4/<ticket>.md, never directly to TERRA_build_log.md. The PM concatenates at integration. This removes the shared-file race by construction.

R5. Explicit git add file lists. Never -A, never .. The handoff report enumerates every file; scope-audit diffs that list against the ticket's declared scope.

R6. Fix only what's listed. Adjacent problems get logged in the handoff under "noticed, not touched" — especially during remediation-flavored work (H1), where the Wave 3 record shows scope drift is most likely.

R7. Nothing that exists in one place gets discarded. Stash, untracked file, single working tree: diff against committed state and report before any drop/overwrite.

R8. One builder per physical directory, ever. If a worktree isn't ready, the session waits. This is the invariant that failed in Wave 3; every other rule is downstream of it.

---

## R9–R14 — from the Wave 4/5 postmortem

Source: `Wave 2-6 Roadmaps.md`, Wave 5 roadmap, PART 1 — "Process fixes (delta
to the Wave 4 standing rules R1–R8, which remain in force)."

R9. Commit-before-review admission gate. No ticket enters Stage 1+ review until the PM pastes git log -1 --stat and git status --short from the ticket worktree showing the work committed on the ticket branch. Reviews run against a commit SHA, never a working tree. (Wave 4 §5.14 — both merged tickets were reviewed as uncommitted state.)

R10. Content-complete worktree verification, on creation AND recreation. du -sh + tracked-file-count diffed against a reference checkout of the same SHA, pasted as evidence. Plumbing checks (.git resolves) and named-file spot checks are insufficient — that was the single most expensive lesson of Wave 4. R1 now explicitly covers recreation events (the §8.1 second occurrence).

R11. pwd + git branch --show-current printed every working turn, not just at session start (the wrong-worktree dispatch in §8.1 cost a full round trip for a mistake R2 was designed to catch once).

R12. Repo stays on local, non-synced storage. Any copy/repair operation that can overwrite files requires a pre-op backup of anything with uncommitted local changes, as a standing step, not an ad hoc recovery.

R13. Orchestration documents live in the repo. Commit Wave4_closeout_report.md (with its §8 amendment) and this roadmap under docs/orchestration/ in P0. Dispatch prompts may only cite documents that exist on disk in the ticket's worktree — a review session refusing to take a PM summary on faith (§8.5) was correct behavior; give it something to read.

R14. One discriminating test per acceptance criterion. Stage P test plans must map each AC to a test that would fail if that specific criterion were unmet. test-plan-review rejects plans whose coverage is aggregate rather than discriminating; gate-review classifies an AC as VERIFIED only when its discriminating test exists and passed. (The C5a lesson: four of nine criteria landed IMPLEMENTED-but- undiscriminated.)

---

## R15–R18 — from the Wave 5 closeout

Source: `Wave 2-6 Roadmaps.md`, Wave 6 material, PART 2a — "New standing rules
and P0 additions (from the Wave 5 closeout)."

R15. Verify-worktree freshness (binding postmortem closure condition). Every gate-review session opens by (1) confirming w6-verify's branch-point SHA against current main HEAD and (2) running a fresh lint/test baseline in that worktree; any finding not reproducible fresh is stale and excluded from the verdict. (Wave 5 §3.2: a stale verify worktree reported 64 lint errors against a main that had been at zero for five merges.)

R16. Verdict ≠ merged. A gate-review PASS immediately generates a merge-dispatch step on the PM's ticket checklist; the ticket is not "done" until merge confirmation (git log --oneline -3 on main) is pasted into the wave log. (Wave 5 §3.1: two passed tickets sat unmerged until a downstream go/no-go caught it.)

R17. PM workflow pattern preserved as default. Concise tabular chat status, one flag per issue, go/no-go calls explicit — and every builder-facing dispatch prompt written to its own on-disk file (self-contained: baseline SHA, standing rules, deliverables), never inlined in chat. (Wave 5 §6 — both debt-table errors were caught because status was tabular and comparable.)

R18. Test-count provenance. Every reported test count in a handoff carries the exact command and captured output it came from. (Wave 5 T5-FU-2: a 27-test reproduction gap with no traceable origin remains open; if any count in Wave 6 fails to reproduce, cite T5-FU-2 and escalate rather than reconcile.)

---

## Scope note — what this extraction is not

`Wave7_roadmap.md` PART 6 originally specified a richer target for this
document: per rule, a stable ID, exact operative text, originating artifact
and commit/date, chronological amendments, current effective text, enforcement
mechanism (human/CI/both), evidence required, and retirement condition — with
contradictory historical text marked superseded rather than deleted.

The S16b session that produced this file was scoped narrower by the dispatch
prompt that authorized it: extract R1–R18 verbatim, preserve exact wording and
numbering, verify by grep. That is what this file is. The 8-field-per-rule
structure PART 6 describes has not been built, and the "originating
artifact/commit," "chronological amendments," and "enforcement mechanism"
fields are not populated here. A future session should treat that richer
structure as still open if it is needed — this file satisfies the verbatim-
extraction disposition of C-1, not PART 6's full acceptance text.
