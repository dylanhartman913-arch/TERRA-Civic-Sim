# Wave 7 Build Roadmap — Parity CI, Provenance CI, and Source-Contract Closure

**Prepared:** 2026-08-11  
**Baseline:** `main` @ `b187965ffb6027c9164f182dc950edc04404fdf2`  
**Implementation/data baseline:** `66532c4e5dffceb0998b89a4a966d4f2fb867567`  
**Scope:** Priority 1 only: close the diagnosed Dave Johnston error; automate
behavioral, cross-runtime, digest, and data-provenance gates; consolidate the
orchestration rulebook; close the carried manual/data/performance/methods work;
and resolve county-card capacity provenance.  
**Stop condition for this session:** planning only. Do not begin CI, data, UI,
or documentation implementation until this roadmap is reviewed.

---

## PART 0 — Why Wave 7 exists

Wave 7 is not a generic hardening pass. It exists because Extended Build 001
found four different silent-failure modes, in this order:

1. The EIA pull had a hidden `PAGE_SIZE=5000` × `MAX_PAGES=3` ceiling. The
   processed operating-generator inventory contained only 15,000 unique
   generator records even though the pinned source reported 25,868. That gap
   changed the generator contribution to county Ec by more than 15% in eight
   Wyoming counties: Albany, Big Horn, Carbon, Converse, Fremont, Goshen,
   Laramie, and Park.
2. `baseline_retirements.json` identified Jim Bridger as plant `6204`. Plant
   `6204` is Laramie River Station in Platte County; Jim Bridger is plant
   `8066` in Sweetwater County. The retirement engine would have acted on the
   wrong physical plant if the identity audit had not stopped the work at
   Checkpoint 2.
3. Correcting the plant code exposed a second independent error in the same
   record: the retirement schedule described three units and 1,863 MW, while
   the pinned EIA inventory contains four units totaling 2,326 MW nameplate.
   The county card's separate 2,120 MW value is not erroneous: it is a rounded
   net-capability/planning figure (the 2024 EIA workbook reports 2,119 MW net
   summer and winter), not nameplate. The problem is that the current county-
   card schema cannot state that distinction.
4. Python `initialize_state` silently autoloaded anchor facilities and exposure
   tags while TypeScript loaded them only when callers supplied them. Anchor
   materialization therefore changed 16 Python legacy scenario tests while the
   equivalent TypeScript paths remained anchor-free. The full Python gate at
   session close caught this; the same-runtime golden suites did not.

The existing golden fixtures verify behavior against fixed inputs. They do not
prove that those inputs are complete, correctly identified, or current, and a
single-runtime fixture suite cannot prove that two runtime APIs still mean the
same thing. Wave 7 therefore creates two related but distinct protections:

- **Behavioral CI:** frozen fixtures, direct Python/TypeScript comparison from
  shared scenario inputs, and five-contract byte identity.
- **Data-provenance CI:** source/derived record-count integrity, plant identity,
  county, unit, capacity, and source-vintage validation.

Neither stage may be used as evidence that the other passed.

One diagnosed error remains live at this baseline: the Dave Johnston county
card says 762 MW was “verified from EIA-860 2024.” It was not. Both the 2024
and 2026 EIA workbooks show 816.7 MW nameplate, 745 MW net summer, and 755 MW
net winter. Wave 7 corrects this before broader hardening work.

### Evidence read before this plan

- `SESSION_LOG_extended_build_001.md`, complete (205 lines).
- The most recent `terra-app/TERRA_build_log.md` entries, including
  “Extended Build 001 — Generator provenance and retirement attribution” and
  “Extended Build 001 — Final close-out and Python initialization parity.”
- `retirement_schedule_audit.csv`, complete: 2/2 entries now resolve and agree.
- `generator_anchor_match_audit.csv`, complete: 99/104 canonical matches (97
  exact, 2 fuzzy, 5 intentionally unmatched, including duplicate aliases for
  plants 4158 and 8066).
- `generator_anchor_attribution_audit.csv`, complete: 322 facility/county rows,
  fixed Ec slope `0.00028750999097218634`, with Dave Johnston and Jim Bridger
  contributions present under the corrected identities.
- The roadmap format available at this checkout: `Wave4_roadmap.md` and
  `docs/orchestration/Wave5_roadmap.md`. Wave 2, Wave 3, and Wave 6 roadmap
  files are not present in the baseline tree or its tracked roadmap history;
  Wave 6 evidence is instead present in `build_log/wave6/`.

---

## PART 1 — Binding execution rules

R1–R18 and all postmortem amendments remain binding until the consolidation
ticket below produces the single authoritative replacement. In particular:

- use an isolated clean worktree for authoritative before/after and CI
  evidence;
- record the exact baseline SHA and raw command output;
- use append-only findings and explicit file lists;
- do not regenerate or amend a golden merely to make a test pass;
- route data/schema changes through data-contract and scientific-data review;
- run the full gate from the clean canonical checkout before merge; and
- record merge confirmation rather than inferring it from a green branch.

The current working directory contains another workstream's modified and
untracked files. Wave 7 implementation must not include, stash, rewrite, or
otherwise take ownership of them. A clean Wave 7 worktree is a prerequisite,
not an optional convenience.

### Evidence taxonomy

Every ticket handoff classifies claims as **implemented**, **verified**,
**inferred**, or **deferred**. “Verified” requires observed output from the
ticket's clean worktree. Tests must fail when the protected feature is broken;
tests that merely restate their fixture setup do not satisfy an acceptance
criterion.

### Review pipeline

Use the established Wave 4/5 ordering: test-plan review → build/lint → scope
and architecture review → domain review → error/performance/security review as
applicable → data-contract/integration/documentation review → gate review.
Release readiness closes the wave only after all merge-to-main CI checks pass
from a fresh checkout.

---

## PART 2 — Sequence and worktree ownership

| Order | Ticket | Purpose | May run in parallel with |
|---:|---|---|---|
| 0 | W7-0 | County-card schema decision + Dave Johnston correction | Nothing that reads/writes county cards or goldens |
| 1 | W7-1 | Behavioral CI, direct cross-runtime parity, five-contract clean-checkout gate | W7-2 after W7-0 lands |
| 1 | W7-2 | Data-provenance CI | W7-1 after W7-0 lands |
| 2 | W7-3 | Consolidated orchestration rulebook | W7-4/W7-5 |
| 2 | W7-4 | D5, BLM manual pull, D4 disposition | W7-3/W7-5, with separate file ownership |
| 2 | W7-5 | Methods page and precedent record | W7-3/W7-4 after their evidence contracts are fixed |
| 3 | W7-6 | Clean-checkout release rehearsal and closeout | Nothing |

W7-1 and W7-2 must be separate CI jobs with separate required-check names and
separate failure messages. Their scripts may share low-level parsers, but one
job may not become a wrapper around the other.

---

## PART 3 — W7-0: capacity provenance schema and Dave Johnston correction

**Priority:** 0; merge before CI baselines are frozen.  
**Purpose:** close the one fully diagnosed but unfixed data error and give all
flagship MW/load values an explicit meaning.

### Schema decision

Every `flagship_assets` entry in `terra-app/src/data/county_cards.json` gains:

- `capacity_basis`: one of `nameplate`, `net_summer`, `net_winter`,
  `planning`, `load`, or `null` when no MW/load value is asserted;
- `capacity_vintage`: the observation or planning vintage (`YYYY` or
  `YYYY-MM`), or `null` when no value is asserted; and
- an evidence-bearing `source_url`; a note cannot substitute for these fields.

`capacity_or_load_mw` remains the numeric field in this wave to avoid an
unnecessary engine/API rename. Validation enforces that a non-null value has a
non-null basis and vintage and that `load` is used only for demand facilities.
Null-valued production/non-MW assets use null basis/vintage rather than a
fabricated capacity.

### Dave Johnston correction

Use the pinned inventory convention now, not an interim undocumented basis:

- `capacity_or_load_mw`: `816.7`
- `capacity_basis`: `nameplate`
- `capacity_vintage`: `2026-05`
- note: state that 816.7 MW is the four-unit EIA nameplate total; do not claim
  that 762 MW was verified by EIA-860.

The audit must also retain the alternate official figures—745 MW net summer
and 755 MW net winter—as reconciliation evidence, not as the selected field
value.

### Full flagship audit

Audit all eight current flagship records, not only the two coal plants. Produce
a committed `county_card_capacity_audit.csv` with at least: GEOID, facility,
numeric value, basis, vintage, source URL, source value, source basis, source
date, match status, and disposition. Start with:

- Jim Bridger: preserve 2,120 MW unless the audit disproves its already
  reconciled net-capability/planning meaning; label the selected enum and
  vintage precisely and retain the separate 2,326 MW nameplate reconciliation.
- Dave Johnston: apply the 816.7 MW correction above.
- Meta and Jade/Crusoe: classify as `load`, with the dated planning/announcement
  source that supports each phase value.
- Kemmerer/Natrium: establish whether 345 MW is nameplate or planning and date
  it accordingly.
- BWXT, Powder River Basin Coal Mines, and Naughton Gas Conversion: keep null
  capacity unless a cited MW measure is actually part of the record's purpose;
  null does not waive the source/identity audit.

### Before/after golden discipline

1. From a clean canonical checkout, run and archive the full Python and
   TypeScript fixture results and five contract payloads before the edit.
2. Make only the schema/data/validator/test changes needed by this ticket.
3. Run the identical commands after the edit and recursively diff every
   contract payload.
4. Enumerate every changed fixture and field. Expected changes are not
   automatically approved changes. If the 816.7 correction changes a frozen
   contract, submit the exact affected fixture amendments for review; do not
   bulk-regenerate unrelated fixtures.
5. Prove the retirement subtraction and generator attribution still use the
   pinned 816.7 MW source inventory and `county_ees_contribution`, not the
   county-card display number.

### Acceptance criteria

- AC0.1 The false Dave Johnston claim and 762 MW value are absent.
- AC0.2 Dave Johnston is 816.7 MW/nameplate/2026-05 and plant 4158 remains
  consistent across county card, retirement schedule, anchor match, and
  attribution inputs.
- AC0.3 Every current flagship passes schema validation; all eight appear in
  the audit, including null-valued records.
- AC0.4 Jim Bridger's 2,326 nameplate and 2,120 county-card representation are
  both documented as correct for distinct purposes; 1,863 MW is not restored.
- AC0.5 Before/after fixture and five-contract diffs are attached, with no
  unexplained change.

---

## PART 4 — W7-1: behavioral CI and direct cross-runtime parity

**Purpose:** automate R15/R16 and Extended Build closeout item 8 so every pull
request and every merge to `main` runs the complete behavioral contract.

### Trigger and environment

- GitHub Actions (or the repository's selected equivalent) triggers on every
  pull request targeting `main` and every push to `main`.
- Dependency versions come from committed lockfiles; do not add a new test
  framework when Python, Node, pytest, and Vitest already provide the needed
  machinery.
- The authoritative job starts from a fresh checkout, records `HEAD`, asserts
  `git status --porcelain` is empty before and after, and emits generated
  comparison files only to a temporary/artifact directory.
- Run the timing-sensitive TypeScript parity path with the documented single-
  worker configuration so unrelated parallel suite load cannot masquerade as
  a semantic failure. Performance remains its own asserted test.

### Stage B1 — complete fixture suites

Run the full Python and TypeScript suites covering A–J, G′/J′, K, L, M, N,
C2/C4-ii contract paths, and every later registered successor. Fixture
membership comes from a committed manifest, not a hand-maintained CI command
that can omit a new golden. CI fails if a tracked golden is absent from the
manifest or a manifest entry has no test in either required runtime.

### Stage B2 — shared-input, direct runtime comparison

Create one versioned scenario manifest consumed by thin Python and TypeScript
runner adapters. A case declares the scenario/fixture input, seed, lens,
migration mode, action sequence, checkpoint years, and explicit optional
datasets. The runtime adapters may translate JSON into native calls; they may
not maintain separate copies of scenario values.

Required initialization cells include, at minimum:

1. **anchor-free:** optional anchor and exposure payloads omitted;
2. **anchor/tag-enabled:** both pinned payloads supplied explicitly;
3. **anchor-only** and **tag-only:** each supplied independently, so accidental
   coupling/autoloading is visible; and
4. representative legacy (G/G′/H/I/J/J′), K, M, C2/C4-ii, and N scenarios
   under their intended loading modes.

For every cell, both runners emit canonical JSON containing:

- initialization fingerprint (loaded optional datasets, canonical facility
  IDs/counts, and relevant registry counts);
- action/event results and requested checkpoint summaries; and
- full serialized payload plus digest for `state`, `fiscal`,
  `existing_assets`, `history`, and `ag` contracts where that contract applies.

The comparator directly diffs Python output against TypeScript output. Fixture
agreement in isolation is insufficient. Contract payloads and digest strings
must be byte-identical after the project's canonical serializer; any documented
non-contract floating-point diagnostic may use the existing `1e-6` relative
tolerance, but tolerance is forbidden for the five digest contracts or the
initialization fingerprint.

Add a discriminating regression that reintroduces Python-style implicit anchor
autoloading (or simulates it through a controlled test double) and proves the
anchor-free comparison fails. This is the test that protects finding 4.

### Stage B3 — clean-checkout five-contract identity

From the clean checkout, replay every registered cell into a temporary
directory and compare the canonical bytes against the approved committed
registry/artifacts for these five contracts:

1. `state_digest`
2. `fiscal_digest`
3. `existing_assets_digest`
4. `history_digest`
5. `ag_digest`

The gate fails on a missing contract, an unexpected extra/missing scenario,
byte drift, an unapproved registry amendment, or a dirty checkout after the
run. Record the manifest SHA-256 and upload the two runtime emission manifests
on both pass and failure so a reviewer can locate the first differing cell.

### Required check names

- `behavior / python-fixtures`
- `behavior / typescript-fixtures`
- `behavior / cross-runtime-shared-input`
- `behavior / five-contract-clean-checkout`
- `behavior / build-and-lint`

All are required before merge; the push-to-main run is a second enforcement,
not a substitute for branch protection.

### Acceptance criteria

- AC1.1 A–N plus C2/C4-ii and successors are manifest-complete in both
  runtimes.
- AC1.2 Both runtimes consume the same scenario rows and are directly diffed
  in all four initialization modes.
- AC1.3 The regression fails if implicit anchor autoloading is restored.
- AC1.4 All five canonical contract payloads are byte-identical and match the
  approved registry from a clean checkout.
- AC1.5 A newly registered fixture cannot merge without entering both runtime
  coverage and the clean-checkout matrix.

---

## PART 5 — W7-2: independent data-provenance CI

**Purpose:** catch the pagination, plant-identity, county, unit-count, and
capacity failures that behavioral fixtures did not and cannot detect.

### Versioned provenance manifest

Add a small reviewed manifest for the pinned operating-generator source. Its
initial values are grounded in Extended Build 001:

- source: EIA API v2 operating-generator capacity;
- period: `2026-05`;
- status: `OP`;
- reported/expected exact count: `25,868`;
- expected refresh range: `24,575..27,161` (the complete baseline ±5%, rounded
  inward to whole records);
- uniqueness key: `(plantid, generatorid)`;
- raw SHA-256:
  `573f1a7b34a71629131e133f9d96815787d4713f1e9048b488e727e52a8f4cc1`;
- promoted BA-enriched SHA-256:
  `d8a65ff2b4b31f21d06d5cbf8efbcca3382bdf064981d48108c96bbfe600c614`.

“Expected range” is a committed review threshold anchored to the last complete
inventory, never a range calculated from the candidate file under test. For
the current pinned vintage, processed count must equal the source-reported
25,868 exactly; the ±5% range governs a proposed new source vintage and catches
gross loss before promotion. A refresh outside the range must stop and require
a documented source investigation and manifest review. It must never
automatically widen the range.

### Stage P1 — source and derived inventory integrity

The check must fail unless all of the following hold:

1. metadata period/status/hash match the manifest;
2. the archived page totals agree with one another and report 25,868;
3. archived row count equals reported total;
4. promoted processed row count equals archived row count;
5. unique `(plantid, generatorid)` count equals row count;
6. every row has the pinned period and operating status;
7. the BA enrichment preserves source keys one-for-one (polygon overlap may
   annotate but may neither drop nor multiply generator rows); and
8. count falls in the committed range for a refresh candidate.

Include a discriminating fixture representing the old 15,000-row/three-page
truncation and prove the check fails on both count equality and expected range.

### Stage P2 — retirement plant-code resolution

Aggregate the pinned generator rows by `plantid`, independently of the
retirement config. For every entry in `baseline_retirements.json`, and every
future retirement-relevant config registered in the provenance manifest:

1. resolve the config's `plant_id` in the pinned source;
2. normalize the configured/source plant names only for harmless suffix and
   punctuation differences; do not use fuzzy matching to excuse a different
   physical plant;
3. require exact state and county/GEOID agreement;
4. require the configured generator-ID set and unit count to equal the pinned
   source set when unit rows purport to describe the current operating plant;
5. sum source nameplate capacity and configured unit capacity at decimal
   precision and require equality to 0.1 MW; and
6. independently search name + state + county and require that it resolves
   uniquely to the same plant code. This reverse lookup is what catches a
   syntactically valid but physically wrong code such as `6204` for Jim
   Bridger.

“Resolves against pinned source” means all six checks pass against the archived
source whose period and hash are in the manifest. Merely finding the numeric
plant code, or matching a frozen audit CSV, is not resolution.

Regression cases must include:

- Jim Bridger keyed to `6204` → fail identity/county/reverse lookup;
- Jim Bridger at `8066` but 1,863 MW/three units → fail unit/capacity checks;
- current Jim Bridger at `8066`, 2,326 MW/four units → pass; and
- current Dave Johnston at `4158`, 816.7 MW/four units → pass.

### Stage P3 — anchor and attribution provenance

Rebuild or validate, rather than merely trust, the two anchor audit contracts:

- exactly one audit row per 104 generator anchors;
- 99 canonical matches at the pinned baseline (97 exact + 2 reviewed fuzzy),
  with the two exact-ID aliases for 4158 and 8066 remaining non-canonical so a
  physical plant cannot materialize twice;
- unmatched anchors cannot appear in the runtime matched set;
- attribution uses the pinned complete inventory and the documented 50 km
  tract-centroid/population weighting method;
- every attribution row uses the recorded global min/max and Ec slope; and
- summed matched attribution for a county never exceeds its complete county
  generator Ec component within the documented numeric tolerance.

A legitimate source refresh may change the 99/104 or 322-row baselines, but it
must regenerate the audits in the same reviewed promotion and explain every
match-status or bound change. CI must not silently bless new counts.

### Required check names

- `provenance / generator-inventory-counts`
- `provenance / retirement-plant-resolution`
- `provenance / anchor-match-and-attribution`
- `provenance / county-card-capacity-schema`

### Acceptance criteria

- AC2.1 The old capped 15,000-record inventory fails before any behavioral
  fixture runs.
- AC2.2 Wrong-code and right-code/wrong-capacity Jim Bridger cases both fail
  for distinct stated reasons.
- AC2.3 Current Dave Johnston and Jim Bridger retirement entries pass against
  the pinned source, not against self-authored expected rows.
- AC2.4 A BA join cannot drop or multiply source records unnoticed.
- AC2.5 Provenance jobs are independently required and visibly separate from
  behavioral jobs.

---

## PART 6 — W7-3: one versioned orchestration rulebook

Create `docs/orchestration/orchestration_rules.md` as the single current
source for R1–R18 plus every binding postmortem amendment and correction.

For each rule include: stable ID, exact operative text, originating artifact
and commit/date, later amendments in chronological order, current effective
text, enforcement mechanism (human/CI/both), evidence required, and retirement
condition. Preserve historical findings; consolidation means an indexed
current view, not deletion or rewriting of prior append-only logs.

The source audit must include Wave 4 rules, Wave 5 additions/corrections, Wave
6 R15/R16/R18 references, release-readiness/postmortem changes, and Extended
Build closeout item 8. If an authoritative rule body is absent from the clean
baseline, retrieve it from the recorded commit/log before writing; do not
reconstruct it from memory. Dispatch templates and future roadmaps link this
document instead of copying partial rule lists.

**Acceptance:** all 18 IDs appear exactly once in the effective index; every
amendment is traceable; contradictory historical text is marked superseded,
not removed; CI-automated rules link to their required check names.

---

## PART 7 — W7-4: close carried D5, BLM, and D4 work

### D5

Execute the named D5 manual/real-render verification; do not treat the Wave 6
pure-function test's “replaces D5” comment as proof that a render occurred.
First reconcile that claim with the recorded D5 requirement, then run D5 in
the required real browser/render environment and retain screenshots, viewport,
device-pixel ratio, browser/GPU backend, scenario, and observed UI values. Fix
the misleading `ag-headless-render.test.ts` header if it still claims rendering
that it does not perform. D5 closes only on observed rendered behavior or an
explicit reviewed redefinition of D5—not on a unit-test label.

### BLM manual pull

Complete MANUAL_FETCH item 2 through the BLM RAS/manual portal path. Archive
the original downloaded report, retrieval date, report parameters, URL/portal
identity, byte count, and SHA-256. Add a reproducible parser/normalizer using
existing project dependencies, county-match audit, suppression/missing-value
report, and source metadata. Replace the current blocked/proxy status only for
fields the report actually supports; do not infer county values from the fact
that the portal was reachable. Re-run the agriculture baseline contract and
five-contract behavioral gate after promotion.

### D4 canvas-performance disposition

D4 may not be carried unchanged through another closeout. Reproduce the F2
MapLibre/deck.gl measurement in a real hardware-accelerated browser using the
recorded 1440×900 viewport, 1180×705 canvas, and 180-event drag protocol (or a
reviewed, versioned successor protocol). Record raw frame intervals, median,
p95, dropped-frame definition, browser/GPU/backend, and at least 20 runs.

Disposition is one of:

- meet the existing 16 ms p95 budget and add a reproducible regression gate;
- implement and verify a rendering-path correction that meets it; or
- revise the budget through an explicit performance/product decision supported
  by measured user-visible behavior and then encode the revised gate.

Headless SwiftShader/proxy timing cannot close D4. “No regression” is not a
disposition.

---

## PART 8 — W7-5: methods page and concrete precedent

Finish the in-app methods page or its adjacent versioned methods document and
link the full coefficient/source table. It must state the five-scale doctrine,
capacity basis/vintage semantics, source pinning and refresh policy, known
proxy/manual-source limitations (including BLM), digest/fixture governance,
and the difference between behavioral and provenance CI.

Record these three named case studies as concrete precedent:

1. **Pagination truncation:** 15,000 processed records versus 25,868 source
   records, with >15% Ec-contribution drift in eight Wyoming counties. This is
   why record-count/source-total CI exists.
2. **Jim Bridger identity and capacity:** wrong plant 6204 versus correct 8066,
   followed by the independent 1,863 versus 2,326 MW nameplate error, while
   2,120 MW remains valid for its separate net-capability/planning purpose.
   This is why reverse identity, county, unit, capacity, and capacity-basis
   checks exist.
3. **Python/TypeScript initialization:** unconditional versus opt-in anchor/tag
   loading changed 16 Python legacy fixtures while TypeScript stayed correct.
   This is why direct shared-input cross-runtime CI exists.

The page must not imply that golden fixtures validate source correctness or
that provenance checks validate engine semantics.

**Acceptance:** all source links and claims resolve; all three cases name the
specific failed contract and the required CI stage; Dave Johnston's corrected
basis appears; D4/D5/BLM final dispositions are reflected rather than copied
from stale planning text.

---

## PART 9 — W7-6: integration and release close

1. Merge W7-0 first. Capture and review its exact fixture/contract changes.
2. Merge W7-1 and W7-2 only after their own gate reviews; configure every
   named check as required for `main`.
3. Merge W7-3/W7-4/W7-5 after reconciling their source links and final debt
   dispositions.
4. In a newly created clean checkout of the proposed final SHA, run all
   behavioral and provenance jobs exactly as CI runs them. Confirm no tracked
   or untracked residue remains.
5. Confirm a deliberately truncated inventory fails provenance CI and a
   deliberately implicit-anchor runtime fails cross-runtime CI. These negative
   controls are release evidence, not optional test-development notes.
6. Append the Wave 7 build-log closeout with raw check links/counts, manifest
   hashes, resolved debt, and any open follow-up. Run release readiness.

Wave 7 ships only when the full fixture suite, direct cross-runtime comparison,
five-contract clean-checkout identity, generator provenance, plant resolution,
capacity schema, build, lint, D5, BLM disposition, D4 disposition, and methods
acceptance criteria are all closed. A green behavioral suite cannot waive a
provenance failure, and vice versa.

---

## PART 10 — Explicitly outside Wave 7

### Priority 2 — corridor-capacity plugin

Do not scope or begin it in Wave 7. At its next-wave kickoff, verify that the
plugin's generator-capacity reader consumes the promoted complete current
processed inventory, not a cached or staging copy. The “megawatts don't export
from nowhere” ledger must name that dependency and its provenance manifest.

### Priority 3 — wildlife/siting constraints and workforce/housing coupling

Do not scope or begin either item in Wave 7. Before formal scoping, revisit the
project's supply-chain document against the materials ledger.

---

*This document authorizes planning only until reviewed. It does not authorize
CI infrastructure, county-card edits, source pulls, golden amendments, browser
verification, or application changes in the current session.*
