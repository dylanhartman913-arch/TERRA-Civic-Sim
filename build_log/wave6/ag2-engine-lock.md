# W6 AG2 — Agriculture Engine Lock

## Stage P — Contract and test-plan freeze

Date: 2026-07-19
Branch: `w6-ag2`
Base: `017aec5` plus required AG0 RAP prerequisite `258f17b`

### Frozen accessor contract

`get_county_ag(state, geoid)` / `getCountyAg(state, geoid)` returns `null` for
an unknown/non-Wyoming county. For each of Wyoming's 23 counties it returns
exactly these top-level keys:

```text
{ geoid, year, levels, trajectories }
```

`levels` contains exactly:

```text
land_acres
water_acre_feet
forage_aum
cattle_head
ag_valuation_usd
shared_energy_acres
drought
```

`trajectories` contains exactly:

```text
land
water
forage
cattle
valuation
```

Nested contracts:

- `land_acres`: `irrigated_crop`, `dry_crop`, `private_rangeland`,
  `easement_protected`, `converted_to_energy`, `other`.
- `water_acre_feet`: `ag_consumptive`, `ag_diversion`, `energy`, `other`,
  `county_supply`. Diversion and consumptive use are never combined.
- `forage_aum`: `private`, `federal`, `index`. Private and federal AUMs are
  never combined in the exposed levels.
- `ag_valuation_usd`: `irrigated_crop`, `dry_crop`, `private_rangeland`,
  `total`. This is stored on the existing `county_fiscal` county record; no
  second fiscal state or action path is permitted.
- `drought`: `forage_multiplier`, `water_curtailment_fraction`,
  `years_remaining`.
- Every trajectory row contains `year` plus the same fields as its level,
  except `cattle`, whose row is `{year, head}`.

Any change to the top-level or nested shape above is a contract revision and
must be routed through the PM before implementation.

### Scientific/data assumptions frozen for implementation

- Private AUM baseline is AG0 `aum_capacity`; federal AUM is a transparent
  proxy derived from active USFS authorized-use acres times the AG0 county
  stocking-rate coefficient. The USFS source contains no authorized-AUM
  field, so this remains explicitly labeled proxy data in engine metadata.
- Blocked county water observations use a documented planning proxy of
  2.0 acre-feet diverted and 1.2 acre-feet consumptively used per irrigated
  acre. County supply is the sum of claimant fields at initialization. These
  values are model inputs, not observed SEO rights.
- Cattle response elasticity is 0.75, bounded to `[0.5, 1.0]`, applied to the
  forage-index delta. The baseline forage index is 1.0.
- Invasive-treatment completion raises treated forage by the untreated share
  of annual-grass cover. Without active paired maintenance, 30% of the
  remaining treatment effect is lost each year. Maintenance holds the effect.
- D1-integrated drought uses the action-library D1 forage delta (`-0.20`) and
  a 15% ag-water curtailment for each active event year. Effects are computed
  from non-drought levels and recover after the final duration year.

### Discriminating acceptance tests

1. Initialization creates 23 balanced land/water ledgers and separate
   private/federal AUM levels. Removing any claimant or combining water fields
   fails the contract test.
2. Energy conversion exhausts `other -> private_rangeland -> dry_crop ->
   irrigated_crop`, never easement acres; shared acres do not reduce any land
   pool. Reclamation completion returns converted acres to rangeland.
3. Treatment effects begin only at completion. An AST/structural test rejects
   any engine path that can omit the decay/maintenance branch.
4. Irrigation completion moves diversion by 35% and consumptive use by 12%; a
   test fails if either field is unchanged or if the coefficients are swapped.
5. Drought reaches ag only through `apply_hazard_event_consequences` /
   `applyHazardEventConsequences`; two annual D1 events depress and then recover
   forage/cattle on schedule.
6. `ag_digest` is additive. The frozen state, fiscal, existing-assets, and
   history digests for A-M remain byte-identical under historical/SSP lenses
   and population migration enabled/disabled. Registry amendments remain 4.
7. Golden N freezes Converse treatment with/without maintenance, Fremont
   irrigation, Fremont solar conversion/fiscal direction, Converse wind shared
   land, and two-year drought under historical and SSP3-7.0.
8. Python/TypeScript Golden N numeric values match at relative tolerance
   `1e-6`; same `(seed, lens)` reruns match and lens modulation has the expected
   drought direction.
9. A committed full-year-loop benchmark includes sampling, consequences, and
   ag dynamics and fails on material regression against its documented budget.
10. `replayFixtureActions` and its `void` suppression are removed from
    `c3-inertness-gate.test.ts`.

### Stage P data-contract-check

The four legacy digest serializers are frozen and may not gain an agriculture
field. `ag_digest` is the fifth serializer. The accessor shape above is frozen.
No fixture A-M may be regenerated and `amendments_used` must remain 4.

---

## Implementation handoff

Date: 2026-07-19

### Scope audit

Ticket files prepared for the explicit R5 add list:

- `.gitignore`
- `build_log/wave6/ag2-engine-lock.md`
- `data/golden/fixture_registry.json`
- `data/processed/wy_county_ag_engine_baseline.json`
- `scripts/build_county_ag_engine_baseline.py`
- `src/terra_engine.py`
- `terra-app/src/data/action_library_v3.json`
- `terra-app/src/data/county_ag_baseline.json`
- `terra-app/src/engine/engine.ts`
- `terra-app/src/engine/types.ts`
- `terra-app/tests/parity/ag-year-loop-benchmark.test.ts`
- `terra-app/tests/parity/c3-inertness-gate.test.ts`
- `terra-app/tests/parity/c4i-contract-matrix.test.ts`
- `terra-app/tests/parity/fixtures/golden_n.json`
- `terra-app/tests/parity/golden-n.test.ts`
- `tests/c4i_contract_matrix.py`
- `tests/test_county_ag.py`
- `tests/test_golden_n.py`

Untracked `Wave4_roadmap.md` and `build_log/wave4/_baseline.md` were present at
session reconstruction and were neither edited nor included in the ticket.

### Architecture review evidence

- Agriculture has one physical store, `state.county_ag`; valuation is written
  only to each existing `state.county_fiscal[geoid]` row. No parallel fiscal
  state or fiscal action function was added.
- Energy conversion uses `other -> private_rangeland -> dry_crop ->
  irrigated_crop`; easement acres are not an eligible draw source. Shared acres
  are recorded separately and consume no land or AUM. Reclamation completion
  moves converted acres to private rangeland.
- The A1 swap runs in the existing fiscal path. Its property-tax delta is gross
  industrial tax less displaced ag assessed value times the county mill levy.
- Drought enters agriculture only inside
  `apply_hazard_event_consequences`/`applyHazardEventConsequences` for a D1
  classified event; there is no public standalone drought action path.
- Treatment, irrigation, D1, and assessment coefficients are validated reads
  from the post-AG1 action/fiscal data, not duplicated engine constants.

### Scientific/data review evidence (R18)

- Engine input contains 23 counties (`county-ag-engine-v1`, vintage
  2026-07-19) and is generated from AG0 land/forage/RAP data, 808 USFS
  county-allotment rows, and the WY DOR fiscal coefficient file.
- Source SHA-256: AG0 baseline
  `8645fc42ff2188f2cb20b712a13e74c48ec6a59db00a87ec4e3dbdfa66ec2593`;
  allotments
  `e26dc681c136f8e0e8e7c4bedad6cd7d2b4c9edf3a0c817018a13f58bc32cc10`;
  fiscal coefficients
  `199a3724a11c5ca81c2d0a02166134354386fa97bf7b74d2386a8acc20b1c44e`.
- Generated Python/app runtime inputs are byte-identical, SHA-256
  `f3a32fad6d1ddb7e5bc01b6517f5c066fda935a3393e4194e4240ac49c85ed0d`.
- Water proxy is 2.0 AF diversion and 1.2 AF consumptive use per irrigated
  acre; fields remain separate. Initialization asserts claimant sum equals
  county supply. Efficiency reads 35% diversion and 12% consumptive-use
  reductions independently.
- Cattle elasticity is 0.75 and validation enforces the frozen `[0.5, 1.0]`
  range. Federal AUM remains the documented authorized-use-acres proxy.
- Partial maintenance holds only maintained treatment acres; all remaining
  acres follow the action library's 30% annual reinvasion schedule.

### Error-handling review evidence

- Required Python AG input absence raises `FileNotFoundError`; malformed county
  count, missing fiscal rows, out-of-range elasticity/assessment/water/D1
  coefficients, excess land conversion, invalid duration, and unpaired
  maintenance all raise specific errors. No catch-all or swallowed AG error
  path was added.
- TypeScript retains the existing zero-fiscal minimal-replay compatibility
  mode. If fiscal mode is active, every AG county must have the existing fiscal
  row.

### Performance review / T5-FU-1

Committed gate: `ag-year-loop-benchmark.test.ts`, 13 runs (3 warm-up, 10
measured), full 2050 SSP3-7.0 sampling + consequences + `advanceYear` AG
dynamics. It asserts 314 events, an AG digest change, median below 45 ms, and
p90 below 60 ms while logging max. Latest isolated result:

```text
events=314 median=5.743ms p90=7.131ms max=7.211ms
```

T5-FU-1: **CLOSED**.

### Integration and data-contract checks

- Archived pre-AG2 engine and candidate each emitted 240 cells per runtime:
  15 fixtures (A-M, including superseded/prime registry entries) x 2 lenses x
  2 migration modes x 4 legacy contracts.
- Recursive byte diff old-vs-candidate: no Python or TypeScript payload or
  manifest differences. Candidate manifest SHA-256: Python
  `4287ab6b7e176ec878e31084522077ab4d3b2b16b909ebb0fc2d223dc396eb82`;
  TypeScript
  `b8be7c613698ed860b2fe26b83ed12fa1ee0ded935ec7dc3b110d828114e774b`.
- A-M four-contract byte identity: **YES**, historical/SSP3-7.0 and migration
  off/on. `amendments_used` remains 4. Golden N adds only `ag_digest`.
- Golden N Python/TypeScript numeric parity: **PASS at 1e-6**. The TypeScript
  suite also matches the complete Python-frozen fixture exactly.
- Frozen accessor contract shape is unchanged from Stage P. No PM contract
  revision is requested.

### Golden N scenario disposition

| Scenario | Result | Discriminating evidence |
|---|---|---|
| Converse treatment, no maintenance | PASS | forage index `1.006532 -> 1.000377` by year N |
| Converse treatment, maintenance | PASS | forage index holds at `1.006532` |
| Fremont irrigation efficiency | PASS | diversion `-7000 AF`; consumptive `-1440 AF` |
| Fremont utility solar | PASS | 7,500 irrigated acres converted; ag value `-$13,252,500`; net property tax `+$13,499,251.19` |
| Converse wind | PASS | 84,750 shared acres; only 250 direct acres consume land; private AUM `-8.333283` |
| Historical two-year drought | PASS | forage `1 -> 0.8 -> 0.8 -> 1`; cattle `35,500 -> 30,175 -> 30,175 -> 35,500` |
| SSP3-7.0 two-year drought | PASS | forage `1 -> 0.75 -> 0.75 -> 1`; cattle `35,500 -> 28,843.75 -> 28,843.75 -> 35,500`; modulation direction PASS |

Golden N registry digests: historical
`a61e8b16b4cea0e3ae743f9ccd7a26d0`; SSP3-7.0
`ea66457fa0fc4c5f2364b0995d797b0d`.

### Test-verifier evidence (R18)

| Command | Result |
|---|---|
| `pytest -q` | PASS — 224 passed in 177.23 s |
| `pytest -q tests/test_county_ag.py tests/test_golden_n.py` | PASS — 25 passed |
| `npm test -- --run` | PASS — 36 files / 372 tests |
| `npm run parity` | PASS — 31 files / 337 tests |
| `npm run lint` | PASS — 0 errors / 0 warnings |
| `npm run build` | PASS — `tsc -b` and Vite production build |
| `npm test -- --run tests/parity/golden-n.test.ts tests/parity/ag-year-loop-benchmark.test.ts --reporter=verbose` | PASS — 2 files / 5 tests |
| Python/TS A-M matrix emit + recursive old/new diff | PASS — 240 cells/runtime, no byte differences |

### Debt disposition and handoff status

- T2-FU-DEAD: **CLOSED** — `replayFixtureActions` and its `void` suppression
  were removed.
- T5-FU-1: **CLOSED** — committed full-year-loop benchmark above.
- Builder verdict: **IMPLEMENTED / VERIFIED, READY FOR FORMAL REVIEW**.
- Formal skill pipeline (`scope-audit` through `gate-review`) is not callable in
  this builder environment; the PM must dispatch those independent review
  stages before merge.
- Merge confirmation (R16): **NOT MERGED**. Candidate remains on `w6-ag2`
  pending the sole formal `gate-review` verdict.
