# Interrupted build status — Wave 7 W7-0

Status captured 2026-08-11 after the session was interrupted. W7-1 through W7-6 were not started.

## Worktree and ownership

- Canonical `main` checkout remains at `b187965` and was not used for W7 edits.
- W7 work is isolated in `/private/tmp/energy-map-w7-0`, branch `w7-0-capacity-provenance`, also based at `b187965`.
- The main checkout's still-uncommitted drought workstream was not touched, stashed, or claimed: `terra-app/src/engine/replay.ts`, `terra-app/src/engine/session_drought.ts`, `terra-app/src/state/store.ts`, and `terra-app/tests/parity/fixtures/golden_ranch_country_2040.json`.
- Other pre-existing untracked files in the main checkout were also left alone.

## Evidence and baseline captured before editing

The approved Wave 7 roadmap and the required Wave 2–6 roadmap, session log, build log entries, retirement audit, generator-match audit, and generator-attribution audit were read before W7-0 work began.

The clean-worktree baseline is archived outside the repository at `/private/tmp/w7-0-evidence/before`:

- Python full suite: `224 passed`.
- TypeScript full suite: `39 files, 392 tests passed`.
- TypeScript parity command: `33 files, 350 tests passed`.
- Python C4I four-contract matrix: 240 cells; manifest SHA-256 `a5a830800a285f3134c235703a90d3e0c89e7a2c9660df4e090f474c800f8ae1`.
- TypeScript C4I four-contract emitter: 240 cells; manifest SHA-256 `1431e2817aaae67375064926a7029b00c8c1aeb252a205af2fc0edbde11e52fc`.
- Fifth `ag_digest` payloads were captured for both runtimes. Python SHA-256: `b830cca4b0fe4ac016ecdb2728075ce4ed15b46922dae19c6a0b3a30c96fd082`; TypeScript SHA-256: `cc1f07d34fd2b10d68925f197c63499a9f4f5e8d189259a2bf626da7d702fe0`.
- Each runtime contract directory contains 240 payloads plus its manifest and `ag` payload.

## W7-0 changes made in the isolated worktree

The county-card records now carry `capacity_basis`, `capacity_vintage`, and evidence-bearing `source_url` metadata. The Python-side processed county-card copy was synchronized so the two runtimes do not silently consume different flagship values.

Selected records currently are:

- Dave Johnston: `816.7 MW`, `nameplate`, `2026-05`; the note states the four-unit EIA nameplate total and retains `745 MW net summer` / `755 MW net winter` as reconciliation evidence. The false EIA-860-2024 claim and `762 MW` value are removed.
- Jim Bridger: `2,120 MW`, `planning`, `2024`; the note documents the rounded `2,119 MW` net-summer/net-winter reconciliation and distinct `2,326 MW` nameplate figure.
- Meta: `152 MW`, `load`, `2026-07`, using a dated IT-load estimate. The prior cited Meta announcement says 100 jobs, not 100 MW, so the former `100` value was not retained as sourced capacity.
- Jade/Crusoe: `1,800 MW`, `load`, `2025-07`, using the developer's initial-campus announcement. The former `200 MW` value was not supported by that source.
- Kemmerer/Natrium: `345 MW`, `planning`, `2025-01`, based on TerraPower's planned 345 MWe reactor output.
- BWXT TRISO, Powder River Basin Coal Mines, and Naughton Gas Conversion remain the three null-capacity records with null basis/vintage.

The matching Dave anchor metadata and generator-match audit row were updated to `816.7` and zero capacity delta. `county_card_capacity_audit.csv` has all eight records and explicit reconciliation/disposition fields.

New validation/test work:

- `scripts/validate_county_card_capacities.py` validates required fields, allowed basis/vintage values, positive numeric capacities, demand-only `load`, source URLs, exactly eight audit rows, and parity between application and processed flagship records.
- `tests/test_county_card_capacity_provenance.py` has four tests, including negative controls for missing basis and invalid `load` use. It passed: `4 passed`.
- `terra-app/tests/parity/generator-anchor-attribution.test.ts` now includes a discriminating regression that changes the Dave display capacity to `1 MW` and verifies retirement Ec subtraction still uses the pinned anchor `capacity_mw_eia=816.7` and `county_ees_contribution`. The targeted file passed all `5 tests`.

## After-edit checks and interruption point

The first after-edit TypeScript full-suite run was intentionally allowed to fail against stale goldens: `14 failed files | 25 passed`, `57 failed tests | 336 passed tests` (the new test raised the total to 393). The failures were the expected digest/fixture consequences of the corrected live-asset values.

After synchronizing the Python processed county-card input, the Python full suite identified the same affected contract family: `25 failed, 203 passed`. Before synchronization, Python had appeared green only because it was still reading the stale `762/100/200` processed copy.

A selective fixture updater was run against the affected fixtures (`golden_e`, `golden_f`, `golden_g`, `golden_g_prime`, `golden_h`, `golden_i`, `golden_k`, `golden_l`, `golden_m`, and `golden_n`). It updated the expected values, but the resulting diff still includes formatting and stale-payload noise. `/private/tmp/w7_minimize_fixture_diffs.py` was then prepared to restore each fixture from `HEAD` and reapply only explicit affected fields, but it had not yet been executed when the session cut out.

The final required after-edit run has therefore not been completed. Outstanding verification is:

1. Execute `/private/tmp/w7_minimize_fixture_diffs.py` from the W7 worktree and review its diff.
2. Update any remaining hard-coded `762 MW` test assertions/descriptions that are genuinely affected.
3. Run the exact baseline Python and TypeScript full-suite commands again and archive final output under `/private/tmp/w7-0-evidence/after`.
4. Run the identical C4I Python/TypeScript contract commands again, capture the fifth `ag_digest`, and recursively diff every before/after contract payload. No unrelated fixture should be regenerated.
5. Re-run the validator, targeted attribution regression, and all AC0.1–AC0.5 checks. Confirm plant 4158 remains consistent across county card, retirement schedule, anchor match, and attribution inputs.
6. Report the exact before/after fixture field diff and the completed eight-row audit CSV. Do not begin W7-1 or W7-2 in this session.

No W7 commit was made, and no W7 changes were copied into or committed on `main`.
