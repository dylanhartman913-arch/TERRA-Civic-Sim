# Cross-Cutting Governance

This document covers the CI architecture, digest and fixture governance, and
three named case studies that illustrate why each governance layer exists.
It is the companion to the nine pipeline-specific methods documents and should
be read after them.

**Cross-reference:** Per-pipeline details are in `pipeline_A` through
`pipeline_I`. The runtime file inventory is in `docs/PIPELINES.md`. The
manifest is in `data/manifest/manifest.json`.

---

## CI architecture

TERRA's CI runs on every push and pull request via `.github/workflows/ci.yml`.
It consists of **three jobs** in two classes:

### Behavioral CI

Behavioral CI validates that the engine produces the correct outputs for known
inputs. It catches logic regressions and cross-runtime divergence.

| Job | What it runs | What it catches |
|-----|-------------|----------------|
| **pytest** | `pytest tests/` (Python 3.13, 230 tests) | Engine logic regressions, golden fixture drift, capacity provenance errors, retirement scheduling errors |
| **parity** | `npm run parity` in `terra-app/` (Node 24, 351 tests) | Cross-runtime divergence between Python and TypeScript engines |

Both jobs run in parallel. A failure in either blocks the push.

### Provenance CI

Provenance CI validates that the data files the engine loads are the files the
manifest says they are. It catches silent data mutation, promotion drift between
Python and TS copies, and normalization mismatches. All three scripts run within
a single `manifest` job; the job fails if any script fails.

| Script | What it checks | What it catches |
|--------|---------------|----------------|
| `scripts/check_manifest.py` | (1) **Completeness:** every runtime-loaded file (discovered by grepping source code) has a manifest entry. (2) **Hash integrity:** every manifest SHA-256 matches on-disk reality. | Unmanifested files; silent data mutation |
| `scripts/check_dual_path.py` | **Promotion-pair identity:** the 8 file pairs marked `dual_path_relationship: "promotion"` are byte-identical (SHA-256 match). Transform pairs (5) are reported but not enforced. | Promotion drift — one copy updated, the other stale |
| `scripts/validate_p3_attribution.py` | (1) **Attribution bounds:** no county's matched facility attribution delta exceeds its baseline Ec_gencap. (2) **Slope match:** the baseline and attribution normalization slopes agree within 1% relative tolerance. (3) **Manifest constants:** the manifest's stored `study_area_max_gen_cap_mw` and `ec_slope` match the values computed from the stored baseline. | Over-attribution; F2-class normalization mismatch; stale manifest constants |

### Build history

The CI architecture was built incrementally across three sessions:

| Session | What was added | Demonstrated by |
|---------|---------------|----------------|
| S10 | pytest + parity jobs | Corrupted `golden_a` digest → behavioral failure on scratch branch |
| S11 | Manifest completeness + hash check, dual-path identity check | Perturbed TS county_ees_baseline.json → hash mismatch + dual-path failure; added unmanifested file → completeness failure |
| S12 | P3 attribution slope check + manifest normalization constants | Old pre-S7a slope (3.2145e-4) → 11.8% slope mismatch failure |

Each addition was failure-demonstrated on a scratch branch before merging to
main. All scratch branches were deleted after capturing run URLs.

### What behavioral CI does not check

Behavioral CI (golden fixtures) validates **engine semantics** — given these
inputs, the engine produces these outputs. It does **not** validate that the
inputs are correct, complete, or current. A golden fixture will pass even if
the underlying data file has been silently replaced with wrong data, as long as
the replacement is consistent across all loaded files.

### What provenance CI does not check

Provenance CI validates **data integrity** — the files on disk match the
manifest, and dual-path copies are identical. It does **not** validate that the
engine's logic is correct. A provenance check will pass even if the engine has
a systematic computation error, as long as the data files are what the manifest
says they are.

**Neither class substitutes for the other.** This is why both run on every push.

---

## Digest and fixture governance

### Five digest contracts

The engine computes five independent MD5 digests, each over a canonical JSON
serialisation of a specific state surface. These digests are the mechanism by
which golden fixtures assert engine correctness.

| Digest | Surface | Introduced | Pipeline dependency |
|--------|---------|-----------|-------------------|
| `state_digest` | County EES, bus state, couplings, SC pools, year | Golden A (v1.0) | C |
| `fiscal_digest` | County fiscal ledgers (A/B/C), assessed values | Golden D (v2.0) | E |
| `existing_assets_digest` | Generator/anchor inventory, retirement state | Golden G' (v3.1) | A, F |
| `history_digest` | IndicatorSnapshot time-series (population, working_age, service_funding_per_capita) | Golden J' (v4.2) | G |
| `ag_digest` | Agricultural layer (forage, cattle, treatment, drought) | Golden N (v4.7) | H |

A change to any pipeline's output data will cause the digest of every golden
that depends on that pipeline to change. The fixture test will fail, requiring
either a data fix or an explicit golden regeneration with updated fixture values.

### Golden inventory

See Pipeline I (`pipeline_I_engine_goldens.md`) for the full 16-golden
inventory table, per-golden digest coverage, and the amendment budget (4/4
used, G→G' and J→J').

### Climate lens contract

Goldens A–L are frozen under the historical climate lens only. Golden M is the
designated non-historical resilience fork with three independently frozen lenses
(historical, ssp245, ssp370). The `climate_lens_contract` field in
`fixture_registry.json` governs which lenses each golden freezes.

---

## Case study 1: Pagination truncation

> Full chronology: Pipeline C (`pipeline_C_ees_baseline.md`) § F2 defect
> history, Phase 1.

The original EES baseline was built on a generator inventory that retrieved
only **15,034 generators** from the EIA API due to pagination truncation. The
complete pinned inventory contains **25,868 generators**. The missing 10,834
generators produced an 11.8% normalization slope mismatch between the EES
baseline and the attribution logic, causing systematically biased Ec deltas
in every scenario the engine ran.

The defect persisted for over three months (2026-06-10 to 2026-09-13) because
no test compared the baseline record count against the source total, and no
test cross-validated the baseline normalization slope against the attribution
slope. Both were computed independently from different inventory snapshots.

**What it revealed:** A behaviorally correct engine (all golden fixtures
passing) can still produce systematically wrong outputs if its input data is
silently incomplete. The CI response was twofold:
- `check_manifest.py` now discovers every runtime-loaded file by grepping
  source code and verifies that each has a manifest entry with a matching
  SHA-256. A data refresh that changes any file without updating the manifest
  fails CI.
- `validate_p3_attribution.py` directly compares the baseline and attribution
  normalization slopes with 1% tolerance. The 11.8% F2 mismatch would have
  failed this check with 10× headroom.

---

## Case study 2: Jim Bridger identity and capacity

The retirement data file (`baseline_retirements.json`) identified Jim Bridger
Power Plant as EIA plant **6204**. Plant 6204 is actually **Laramie River
Station** in Platte County — a different facility entirely. The correct Jim
Bridger is plant **8066** in Sweetwater County, with four operating units.

The identity error carried a capacity error: plant 6204's nameplate capacity
is **1,863.0 MW** (three units), while Jim Bridger's correct nameplate is
**2,326.0 MW** (four units: 577.9 + 586.2 + 577.9 + 584.0). These are
independent defects — correcting the plant code from 6204 to 8066 does not
automatically correct the capacity from 1,863 to 2,326 if the stale figure
was retained separately.

A third capacity figure, **2,120 MW**, is Jim Bridger's net summer/winter
capability from 2024 EIA-860 (both identical at 2,119 MW, rounded to 2,120).
This value is used in county cards for planning purposes and is correct — it
represents a different measurement basis (net capability vs nameplate), not
an error. See DECISIONS.md "S6: Jim Bridger capacity_basis schema choice"
for the design rationale and `county_card_capacity_audit.csv` row 9 for the
`preserve_2120` disposition.

**Primary sources for each figure:**

| Value | Plant | What it is | Source |
|-------|-------|-----------|--------|
| 1,863.0 MW | 6204 (Laramie River) | Nameplate of the wrong plant (3 units) | `generator_anchor_match_audit.csv` row 31 |
| 2,326.0 MW | 8066 (Jim Bridger) | Correct EIA nameplate (4 units) | `retirement_schedule_audit.csv` row 3 |
| 2,120 MW | 8066 (Jim Bridger) | Net summer/winter capability, rounded | `county_card_capacity_audit.csv` row 9, DECISIONS.md S6 |

**What it revealed:** An identity error (wrong plant code) and a capacity error
(wrong MW) can coexist independently. A check that validates only the plant
code would miss the capacity error, and vice versa. The retirement schedule
audit now requires matching on name, state, county, plant code, capacity, and
unit count — and independently performs a reverse lookup (search by name + state
+ county, confirm it resolves to the same plant code). The reverse lookup is
what catches a syntactically valid but physically wrong code like 6204 for Jim
Bridger.

---

## Case study 3: Python/TypeScript initialization divergence

The Python engine's `initialize_state()` originally loaded anchor facilities
and exposure tags **unconditionally** from disk. The TypeScript engine's
`initializeState()` loaded them only as **optional caller-provided payloads**.
This silent API-contract divergence caused **16 Python parity test failures**
once the anchor-loading effect was widened by generator materialisation
changes.

The fix (`terra_engine.py:2099`): Python now takes `anchor_facilities=None`
and `exposure_tag_data=None` as keyword arguments. Loading is conditional
(`if anchor_facilities is not None:` at line 2259; `if exposure_tag_data is
not None:` at line 2267), matching the TypeScript contract. Goldens K, M,
C2/C4-ii, the contract matrix, and notebook 19 explicitly opt in. Legacy
golden paths (G/G'/H/I/J/J') remain anchor-free.

**What it revealed:** Two engines can agree on all outputs for anchor-free
scenarios while silently disagreeing on anchor-loaded scenarios, because the
disagreement only manifests when the optional loading path is exercised. The
CI response is direct shared-input cross-runtime testing: both engines run
against the **same golden fixture files**, and both test suites must pass on
every push. A divergence in how either engine handles optional inputs will
cause its test suite to fail against the shared fixture values.
