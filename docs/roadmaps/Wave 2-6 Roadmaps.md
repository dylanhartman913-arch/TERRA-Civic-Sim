
Wave2_roadmap.md
Wave 2 Roadmap — F/C Tracks (post-Wave-1 replan)
Part 1 is the build-log addendum recording the replan. Parts 2–5 are the four session prompts. Part 6 is the Gate V2 checklist.

Wave 1 outcome this plan responds to: C0 clean (zero amendments, 269 TS / 99 Py = 368, four-contract byte-identity verified, migration on/off); C1 held — projections are literature-scaled proxies pending C1.2; F0 incomplete for WY/MT (CBP bulk 404) with four MW promotions blocked, pending F0.2.

PART 1 — Build log addendum (paste into TERRA_build_log.md)
Wave 2 replan (2026-07-11, supersedes the S0 wave table for Wave 2 only)
Lane	Session	Executor	Depends on
Engine lock	F1 — anchor seeding + Golden K	Opus	F0 geojson (blocked counties flagged), C0
Branch	F3 — pin placement + inertness parity	Sonnet	Post-C0 main; rebase after F1
Repair A	C1.2 — real CMIP6/SSP acquisition	Sonnet	— (unblocks C2/C3/C4)
Repair B	F0.2 — WY/MT drivers + blocked MW estimates	Codex	✅ CLOSED via F0.2–F0.4 (2026-07-11)
C2 data-half moves to Wave 3 (runs parallel with C3 if C1.2 passes; parallel with F2 if it does not). The Wave-1 gate hold on C2/C3/C4 stands until C1.2's handoff condition is met or a logged project decision accepts literature-scaled data as final.
F1 is not blocked by F0's WY/MT gap: Golden K uses Sweetwater and Campbell, which are unaffected. The four blocked counties (Goshen, Johnson, Niobrara, Sublette) seed with capacity_or_load_mw: null, confidence: "blocked"; F0.2 patches the geojson afterward — a data-only change, no engine touch, no digest impact (registry is excluded from all four digest surfaces).
Housekeeping owed to this log: full phase close-out entries for F0 and C1 in the established format (backfilled by F0.2 and C1.2 respectively), and the truncated final line of the C1.3/C1.4/C1.5 entry completed.
C0 known debt inherited forward: Python runtime ClimateContext plumbing ships in C3.
PART 2 — Session F1 prompt (Opus — Claude Code, engine lock)
Session F1 — Anchor Seeding + Golden K (zero-amendment path). You hold the engine lock. Read before writing code: the S0 and Wave-2-replan entries in TERRA_build_log.md, the Z1/Z2/Z4/V2 phase entries, notebooks/ NB 22 outputs (data/processed/mw_anchor_facilities.geojson and the card schema bump), the Z4 site mechanics in both runtimes (SITE_COMPAT, spawnSiteFromRetired, succession block in queueAction), indicators.py / indicators.ts (history snapshot contents), and fixture_registry.json (amendments_used: 4). Call-site audit rule applies to initializeState / initialize_state (11 known Python call sites as of Z1 — re-enumerate).

Golden K data preconditions (assert in your first cell, before any engine code). The F0.4 credibility table lists Jim Bridger as Sweetwater's representative anchor, which does not prove the Golden K script's targets survived into the final geojson. Assert against mw_anchor_facilities.geojson: (a) ≥ 1 Tier 2 mine anchor with commodity trona in Sweetwater (56037); (b) ≥ 1 Tier 2 coal mine anchor in Campbell (56005). Also print the current state of the four formerly blocked promotions (Goshen, Johnson, Niobrara, Sublette): if any still carry capacity_or_load_mw: null / confidence: "blocked", the null-MW tolerance in step 2 is live; if F0.2–F0.4 patched them, record the values. Either precondition (a) or (b) failing is a stop-and-report to the orchestrator — do not substitute Golden K targets unilaterally.

Governing rule — zero-amendment seeding. Follow the established pattern (Z2 housing_stock, Z4 site): anchors enter asset_registry at initialization and are excluded from the existing_assets materialized view (extend the if asset_class == 'site': continue exclusion). Verify history snapshots do not enumerate the registry. If, after implementation, all four digest contracts (state, fiscal, existing_assets, history) are byte-identical on every frozen golden with migration on AND off, no amendment is consumed. Only if an anchor field must unavoidably enter a digest surface do you stop, report why, and (on confirmation) log Amendment 5 with the full inertness proof.

Seed Tier 2 anchors into asset_registry at initialization, both runtimes. New asset classes: mine (with commodity), industrial_load, commercial_anchor_load. Namespace note: Z4's site_class: 'mine' (reclaimed-mine successor sites) is a different field from asset_class: 'mine' (operating anchor) — keep them distinct and document the distinction in a comment at both definitions.
Generators are already seeded from EIA-860 — do not re-seed. Attach anchor_id and co2e_tpy to the existing registry rows, and confirm the materialization function does NOT ship these new fields into existing_assets (that would move the EA digest). The four blocked counties' promoted anchors seed with capacity_or_load_mw: null, confidence: "blocked" — assert the engine tolerates null MW on commercial_anchor_load (display/lifecycle only until F0.2 patches).
Inertness rule (double-count guard). Anchor jobs, output, and valuation are already embedded in observed county baselines. Seeded anchors carry marginal handles only: at seeding, zero flow deltas — no jobs, no valuation, no demand, no migration contribution. The mechanical proof: a zero-player-action run produces trajectories byte-identical to pre-F1 on all four digest contracts, migration on and off. The migration path is the sensitive one — one leaked ops job becomes job × 0.65 × 2.51 × 1.5 heads/yr and shows up in the history digest via V2's population fields.
Lifecycle wiring. Every Tier 2 anchor accepts existing verbs with no new code paths: scheduleRetirement / accelerate / delay. Anchor retirement spawns a Z4 site — extend siteClassForAsset / spawnSiteFromRetired to the new classes (they are not MW generators; the current spawn loop filters on MW-based assets). Extend SITE_COMPAT: industrial → captive generation, storage, expansion-of-same-class; commercial_anchor_load → efficiency retrofit, storage. Cite or flag every new compatibility row (Z4's citation format: DOE 2022 / Gorman 2022 / Carley 2018 precedent). Check compatible_actions against action_library_v3.json — Z4's known debt (gas_combined_cycle listed but absent from the library) must not be repeated; list only actions that exist, or flag.
Retirement fiscal/jobs coupling. Retiring an anchor with MSHA/QCEW employment unwinds those jobs on the same machinery as generator retirements (which now feeds V2 migration — document that chain). Mines hit the mineral-valuation ledger where Y-track coefficients exist; where Y is still gated on the DOR report, wire the hook priced at 0, flagged — do not attempt Y.
Golden K — anchor lifecycle. Scripted run: retire the largest Sweetwater trona anchor in 2030; expand a Campbell mine anchor by a documented increment in 2028; place an SMR on the retired trona site in 2035. Assert: employment deltas match documented shares; the site spawns inheriting the anchor's interconnection; the succession discount applies through Z4's real path (no 0-with-flag — Z4 is live); the run is deterministic; run with migration on and record the population trace. Freeze golden_k.json, TS parity test, digest registry entry, build-log phase entry in the established format (assertion table, call-site audit, test-count delta, known debt).
Handoff condition: four-contract inertness proof green on all frozen goldens, migration on/off; Golden K parity green both runtimes; zero amendments consumed (or a stop-and-report if the zero-amendment path genuinely fails); existing_assets digest untouched by anchor metadata on generator rows.

PART 3 — Session F3 prompt (Sonnet — Claude Code, branch off post-C0 main)
Session F3 — Sub-County Pin Placement (engine-inert). Branch from post-C0 main. Read the placement-mode implementation in src/state/store.ts and src/ui/, replay.ts (note C0's new climateLens parameter on computeReplayDigest — your changes must not disturb it), persistence.ts (3.0→3.1 migration), and the digest computation before writing code. Engine-inert is the governing rule: no changes to engine.ts numeric paths, budgets.ts, or events.ts; replay.ts and persistence.ts may gain passthrough handling only.

Pin interaction. In placement mode with an eligible county selected: above a zoom threshold (basemap towns legible) the ghost footprint follows the cursor and a click drops a pin at exact coordinates; below the threshold, current county-level behavior is unchanged. Point-in-polygon validation against the selected county's geometry (small ray-cast utility or turf booleanPointInPolygon); a click outside nudges: "outside {county} — pin must be in the selected county."
Snapping. Within a configurable radius of a Tier 2 anchor (from mw_anchor_facilities.geojson) or a Z4 site, the pin magnetizes with a visible snap indicator. Snapping to a site routes through the existing build-on-site path so Z4's real succession discount applies and is itemized. Snapping is a convenience — free placement anywhere in-county is always allowed. Snapping is the ONLY way pin position affects numbers, and only through existing mechanics.
Data path (engine-inert). site_coords: [lon, lat] is an optional field on the queued-action log entry: persisted in saves (3.1 schema — coordinate with the migration function so absent coords remain valid), round-tripped through export/import, preserved by replay, rendered by the UI — and excluded from the replay digest and invisible to every engine function. Resolution remains county → primary_bus.
Rendering. Queued/under-construction icons and countdown badges render at the pin when present, county centroid otherwise (no-pin is the default — zero migration for old saves). Completed builds keep their pin. County card queued rows show "pinned near {nearest basemap town}" when coords exist (coordinates to 2 decimals if a cheap reverse lookup isn't available).
Coordinate-inertness parity test. Replay Golden B twice, once with site_coords injected on every action, once without — assert identical digests and identical final state (a RELATIVE test: it must survive any future digest regeneration). Export a pinned run, reimport, assert coords survive and the replay digest matches. Also assert a pinned save with climate_lens: "historical" round-trips with an unchanged digest (C0 interaction). Add to npm run parity.
After F1 merges to main: rebase, rerun the full parity suite, and record the post-rebase counts in your build-log entry.

Handoff condition: zoom into a hometown, place a pinned project, end turns to commissioning, export, reimport — pin renders throughout; digests identical to the unpinned equivalent; blast-radius diff shows zero changes to engine numeric paths.

PART 4 — Session C1.2 prompt (Sonnet — acquisition + validation)
Session C1.2 — Real CMIP6/SSP Downscaled Acquisition. This session unblocks the entire C-track. Wave 1's failure mode was substituting literature-scaled proxies for unreachable data; your mandate is the opposite — acquire real values or report precisely why each path failed. No proxy synthesis in this session. Read the C1 notebook, the C1.3–C1.5 back-cast resolution entry, data/processed/county_climate_projections.json (current proxy state), and MANUAL_FETCH.md first. MACA's validated extraction pipeline (PRISM-checked) is reusable machinery — keep it as the cross-check harness.

Acquisition priority order (stop at the first that delivers the core set; log every attempt):

NOAA CMRA county tabulations (LOCA2 / STAR-ESDM, the NCA5 stack) — the roadmap's designated primary, and per the build log NOT yet attempted. Check the CMRA data-download page, the NCA5 atlas backing data, and the crt.climate.gov bulk endpoints. Already county × SSP × epoch — if reachable, this is a parse job, not a compute job.
NASA NEX-GDDP-CMIP6 on AWS Open Data (S3, no auth) — daily, downscaled, SSP2-4.5/SSP3-7.0 native. Requires county aggregation (area-weight the grid to county polygons — reuse the validated MACA aggregation code) and epoch climatology computation. Heavier compute; scope to the core variable set and a p10/p50/p90 ensemble over a documented model subset if the full ensemble is too large.
LOCA2 direct (zarr/netCDF on AWS or the UCSD portal) — same treatment as NEX-GDDP.
Core variable set (the unblock threshold): annual mean temp, days

95°F, days >100°F, CDD, HDD, annual precip, 99th-pctile daily precip — per county × {ssp245, ssp370} × climatology epoch, p10/p50/p90, every value carrying {value, scenario, epoch, percentile, source, method, confidence}. Water-stress composition, SWE decline, and fire-weather scalers remain literature-based per the roadmap (they were always the soft spot) — do not gate on them.

If all CMIP6 paths fail: do not improvise. Produce a one-page decision memo with three options and their costs: (a) RCP→SSP relabeling using validated MACA (note honestly: RCP4.5 ≈ SSP2-4.5 forcing is defensible; SSP3-7.0 has NO RCP equivalent — RCP8.5 overshoots it), which would also force a lens-name decision against C0's frozen schema; (b) accept literature-scaled proxies as final with confidence: "low" throughout and a methods-page disclosure; (c) another acquisition attempt with a specific new lead. The orchestrator decides; you do not.

Validation: rerun the C1.5-style back-cast against PRISM 4km normals for the three validation counties, using a documented tolerance band (recommend ±1.5°F / ±10% precip) rather than strict range-bracketing — log the rule change and the rationale (C1.5 showed strict bracketing fails on tight ensemble ranges without real disagreement). Cross-check a sample of overlapping variables against the validated MACA values.

Outputs: replaced/updated county_climate_projections.json (real values for the core set), updated climate_sources.csv, back-cast table, per-path attempt log, and the backfilled C1 phase entry in TERRA_build_log.md (also complete the truncated C1.3/4/5 entry).

Handoff condition: core variable set is real downscaled data with full attribution and a passing tolerance-band back-cast — OR the decision memo. Either outcome releases the Wave 3 gate decision to the orchestrator.

PART 5 — Session F0.2 — CLOSED (via F0.2–F0.4, 2026-07-11)
Resolution: CBP bulk 404 was resolved by combining CBP establishment counts with QCEW government-ownership employment (national baseline 22,420,669; vintage CBP_2023+QCEW_2024) for all 157 counties. Ten-county credibility table passes on top LQ for all 10 rows, including the two prior failures (Sweetwater mining/extraction; Laramie government/military, LQ 5.151). 130/157 counties shifted top-1 ranking; 77 now show government/military top LQ — adjudicated as the expected shape of adding a missing ownership class in low-denominator rural counties, with the ten-county gate as the check. Verification: compile ✓, hex-grep 0 ✓, null-grep 0 ✓.

Residual items (carried into Gate V2 and F1's preconditions):

Confirm whether the four blocked MW promotions (Goshen, Johnson, Niobrara, Sublette) were patched — the F0.4 report does not mention them. F1's first cell prints their state either way.
Consolidated F0 phase entry owed to TERRA_build_log.md (F0 → F0.4 arc: CBP 404 → QCEW-ownership fix, vintage note, 130-county ripple rationale, final gate tables), replacing the scattered addenda.
F0.4 reported pre-existing uncommitted terra-app/ changes in the working tree — see the branch-isolation line in Gate V2.
<details> <summary>Original F0.2 prompt (retained for the record)</summary>
Original PART 5 — Session F0.2 prompt (Codex — GPT 5.5)
Session F0.2 — WY/MT Driver Completion + Blocked MW Estimates. Repo: TERRA. Data-only: no engine files, no terra-app/, no data/golden/, no fixture_registry.json. Work in the existing NB 22 (append a clearly marked F0.2 section) or a small companion script under scripts/ — record which in the build log.

WY/MT economic-driver fix. The CBP bulk archive 404'd for WY and MT. Remedy in order: (a) Census CBP county-level API (api.census.gov/data/{year}/cbp, existing key) per FIPS for the affected counties; (b) if the API also fails for a county, drop to the ACS industry-of-worker rung of the documented fallback chain — set driver_source honestly, never silently. Recompute GDP-share and LQ top-3s for every affected county; print before/after for any county whose ranking changed.
Four blocked MW estimates (Goshen, Johnson, Niobrara, Sublette commercial_anchor_load promotions). For each: obtain a real employment figure (CBP API, QCEW detail, or the curated source_url), convert to a load estimate via a published benchmark (e.g., commercial kW/employee or facility-type load studies), cite the benchmark inline, set confidence: "low", method documented. Patch mw_anchor_facilities.geojson in place (replacing the null MW / confidence: "blocked" rows) and re-emit the county cards blocks.
Re-run the two gates: WY 23/23 Tier 2 coverage, and the full ten-county credibility table — print both; the verifier re-derives the ten-county table independently. A top-LQ mismatch with known local identity is a bug to investigate, not annotate.
Backfill the F0 phase entry in TERRA_build_log.md in the established format (what was built, gates, fallback log, promotion log, known debt), folding in F0.2's changes, and note for F1/the orchestrator: if F1 has already seeded, the geojson patch changes registry contents on next initialization but touches no digest surface (registry-excluded) — flag for a quick F1 reseed sanity check at Gate V2.
Handoff report: per-county driver_source table for WY/MT, the four MW estimates with citations, both gate tables, file diff list.

</details>
PART 6 — Gate V2 checklist (Claude, before Wave 3)
 F1: independent replay of all frozen goldens pre/post seeding — four contracts, migration on and off, byte-identical; Golden K parity green in both runtimes; amendments_used unchanged at 4 (or the stop-and-report was adjudicated); no anchor fields in the existing_assets materialization; SITE_COMPAT additions all exist in action_library_v3.json or are flagged; build-log entry complete
 F3: post-F1 rebase done, full parity suite green; pinned-vs-unpinned relative digest test green; pinned + historical-lens round-trip green; blast-radius clean (no engine/budgets/events numeric changes)
 F0 close-out residuals: spot-check 2–3 of the 130 changed counties OUTSIDE the ten-county gate list (one agricultural, one tourism/resort, one generic) — printed before/after vs common sense, five minutes, no Codex round; confirm the status of the four formerly blocked MW promotions (patched, or F1's null-MW tolerance confirmed live); consolidated F0 phase entry landed in TERRA_build_log.md
 Branch isolation (process, before F1 freezes anything): F0.4 reported pre-existing uncommitted terra-app/ changes in its working tree. Confirm F1 (engine lock) and F3 (UI branch) are on separate branches with clean working trees — if F3's uncommitted work shares F1's tree, every blast-radius diff at this gate is meaningless. Resolve before F1's first commit, not after.
 C1.2: either (a) core variable set is real, fully attributed, and back-cast passes the tolerance rule → release C2 + C3 into Wave 3 (C3 takes the engine lock; C2 data-half runs parallel on Codex with the registry-merge step now unified with F1's anchor classes), or (b) decision memo received → Wave 3 becomes F2 + C2-data while the accept-proxies / relabel-lenses / re-acquire decision is made at the project level
 Build log: F0 and C1 phase entries backfilled; truncated C1.3/4/5 entry completed; Wave 2 close-out recorded

Wave 3 Roadmap — F/C Tracks

Baseline (post-Wave-2, commit 6fd35bf on main): engine v4.2 behavior + anchor registry seeding; 290 TS / 111 Python = 401 tests; amendments_used: 4; Goldens A–J′ + K frozen; real LOCA2 climate data landed (schema C1.6, 30,144 real values + 9,744 flagged literature values); roadmap branch (a) confirmed — full C-track proceeds.

Wave 3 sessions: C3 (Opus, engine lock) ∥ C2-data (Codex) ∥ F2 (Codex + Sonnet review), then C2-merge (Sonnet, small, takes the lock after C3 merges).

PART 1 — Build log addendum + standing protocol (paste before dispatch)
Wave 3 plan (2026-07-12)
Lane	Session	Executor	Worktree
Engine lock (1st)	C3 — climate coupling I + Golden L	Opus	c3-engine-lock
Engine lock (2nd)	C2-merge — exposure tags into registry	Sonnet	c2-merge (created after C3 lands)
Data	C2-data — NB 24 hazard baseline	Codex	c2-data
UI	F2 — facility layer + Economy card	Codex build, Sonnet review	f2-facility-ui
Standing protocol (adopted from Wave 2 close-out §6)
Worktrees are created from main BEFORE prompts are dispatched. c3-engine-lock, c2-data, f2-facility-ui now; c2-merge after C3 merges.
All notebook data outputs are committed before any dependent session dispatches. Pre-flight: confirm county_climate_projections.json (C1.6), climate_sources.csv, mw_anchor_facilities.geojson, and the county-cards blocks are tracked on main. (Wave 2 stalled once on exactly this.)
Gate verification routes to a different executor than the builder. Gate V3: Codex verifies C3; Claude verifies all Codex work.
Any notebook that recomputes a derived ranking or baseline persists a versioned before/after snapshot (binding on C2-data).
Debt routing decisions (from Wave 2 close-out §5)
commercial_anchor_load efficiency-retrofit action → assigned to C4 (its adaptation family is new-action work; building it there closes F1's SITE_COMPAT gap in the same stroke). Note in C4's Wave 4 prompt.
ANCHOR_MINE_COMMODITY crosswalk → optional stretch task on C2-data (below); backlog if scope pressure.
Eagle CO cold bias + literature p10/p90 → binding design constraints on C3 (delta-coupling, p50-only), not separate work items.
industrial → smr_advanced wiring question → parked for a project-level decision; no Wave 3 session touches it.
PART 2 — Session C3 prompt (Opus — Claude Code, engine lock, worktree c3-engine-lock)

Session C3 — Climate Coupling I (demand / water / heat) + Golden L. You hold the engine lock. Read first: the Wave 2 close-out report and the S0/replan entries in TERRA_build_log.md; C0's phase entry (ClimateContext design — read-only, stateless, couplings live in coupling functions, NOT engine state); the C1.6 schema of county_climate_projections.json (39,888 records, {value, scenario, epoch, percentile, source, method, confidence}); V2's dynamic population/migration entry; the availability- factor machinery (NB 12 lineage) in both runtimes; climate-exogeneity.test.ts (permanent — must stay green). Baseline: 290 TS / 111 Py = 401.

Inherited mandate (C0 known debt): the Python runtime has NO ClimateContext plumbing. Port the C0 surface to Python first — context object, optional trailing parameter, EMPTY_CLIMATE_CONTEXT sentinel, historical no-op — with Python equivalents of the 6 exogeneity tests. Python-first, then TS, per the established build order.

Binding design constraints (from C1.6 validation):

Delta coupling only. Every coupling consumes the CHANGE between the scenario value at the run-year's epoch and the same dataset's historical- epoch value — never absolute levels. Rationale (log it): LOCA2 carries a documented ~2.6°F absolute cold bias in complex terrain (Eagle CO); relative trends are validated. Delta coupling cancels the bias.
p50 only in physics. p10/p90 are AR6 literature spread, not per-model runs — they feed UI fan displays (C5), never engine numbers.
Epoch interpolation follows the frozen doctrine from NB 23 (linear between climatology windows, never extrapolate past the last window).
Demand modulation. County electricity demand gains a temperature term: demand = baseline × (1 + β_c·ΔCDD + β_h·ΔHDD) with cited elasticities (β values from published demand-temperature literature — cite per coefficient in a sources table; conservative central estimates, confidence recorded). This composes with V2's dynamic population (baseline already scales with migrating population) — the composition order is documented and the coupling function is pure: (state, climate_context) → modifier, no stored state.
Water stress → thermal derates. Under a non-historical lens, the county water-stress index (flagged literature-composed — carry its confidence: "low" into every derived value) maps to summer availability derates on water-cooled thermal assets THROUGH THE EXISTING availability-factor machinery — no new derate pathway. Dry- cooled and non-thermal assets untouched. Mapping table cited or flagged, in the data layer, not hardcoded.
Heat derates. Days->95°F delta maps to small cited derates on thermal efficiency and transmission limits where the existing machinery has a hook; where no hook exists, DO NOT build one — log the gap for C4/C5 instead. Same rule as Z-track: new physics through existing mechanics only.
Exogeneity + historical inertness. All couplings are no-ops under climate_lens: "historical" (empty context). Gate: all four digest contracts byte-identical on EVERY frozen golden (A–J′, K) under historical, migration on and off; climate-exogeneity suites green in both runtimes.
Golden L — demand fork. Scripted run: an identical action log executed under historical and under ssp370. Assertions: identical fiscal/action outcomes where climate doesn't reach; demand divergence at three probe years matching the elasticity arithmetic BY HAND (independent hand-check is a Gate V3 item — show the arithmetic in the build-log entry); water-derate divergence on at least one named water-cooled thermal asset; deterministic replay with digest parity across runtimes on all four contracts, both lenses. Determinism rule: the fixture embeds the exact climate-table slice it was frozen against (the ssp370 values for the counties/variables/epochs the run touches) — Golden L must never re-read county_climate_projections.json at test time. Non-historical digests differ from historical by design (C0-8) — freeze both sets in the fixture. Zero amendments: Golden L is a NEW fixture; nothing existing regenerates.
Attribution surface. Every climate-modified quantity must be traceable: the coupling functions return (or log) enough structure that C5 can render "demand +4.1% = ΔCDD 210 × β 0.02%/CDD" per county- year. Design this signature now so C5 doesn't have to reopen the engine.

Build-log phase entry in the established format: coupling formula table with citations, digest verification table (historical identity + Golden L frozen hashes both lenses), call-site audit for the new Python plumbing, test-count delta, known debt. Handoff releases the engine lock to C2-merge.

PART 3 — Session C2-data prompt (Codex — GPT 5.5, worktree c2-data)

Session C2-data — Notebook 24: Hazard & Exposure Baseline (data half only). Repo: TERRA. Pure data session: no engine files, no terra-app/, no data/golden/, no fixture_registry.json, and — this session specifically — NO changes to any registry build path or initializeState; the registry merge is a separate follow-up session (C2-merge) that you do not perform. Allowed paths: new notebook under notebooks/, data/raw/, data/processed/, MANUAL_FETCH.md.

Cell 0: ls notebooks/ — confirm 24_hazard_exposure_baseline.ipynb free (bump and print if not). Read mw_study_counties.csv, mw_counties.geojson, mw_anchor_facilities.geojson (note the anchor classes: mine, industrial_load, commercial_anchor_load — your tag rules must cover them), power_plants_with_ba.geojson, and the C1.6 county_climate_projections.json schema. Cache raw pulls with vintage filenames; API keys from env.

FEMA NRI county pull. National Risk Index full county table for all 157 study counties: per-hazard risk scores, EAL (expected annual loss), social vulnerability, community resilience — for the hazards relevant to the region (wildfire, riverine flood, drought, heat wave, winter weather, hail/wind). Record NRI release version.
USFS Wildfire Risk to Communities. County (and where available, sub-county summary) wildfire hazard potential / risk-to-homes for the 157 counties. This is the fire BASELINE the C1.6 literature scalers multiply — store them so the composition is explicit.
MTBS burned-area history. Fire perimeters intersecting study counties (last ~25 yr): burned acres by county-year — the empirical anchor for fire-frequency priors.
Exposure tagging RULES (a document + a data file, not a code change). Produce data/processed/exposure_tag_rules.md and data/processed/asset_exposure_tags.json: for every registry-eligible asset (generators by ORIS, anchors by anchor_id, transmission where identifiable) and every asset CLASS default, the hazard-exposure tags it should carry (wildfire_exposure: high/med/low, water_dependency: wet/dry/none, flood_zone, heat_sensitivity), each tag with {source, method, confidence} and every judgment call flagged. Spatial joins (WRC raster/summary × facility points; NRI county context) do the heavy lifting; document thresholds. This file is C2-merge's sole input — make it mechanically consumable.
Versioned snapshot (standing protocol #4): persist data/processed/snapshots/nri_wrc_baseline_v1.json capturing the derived county hazard summary so future recomputation has a diffable before-state.
Credibility gate (verifier re-derives): a table of known identities — Teton/Eagle/Summit-class mountain counties near the top of wildfire exposure; plains counties (Goshen, Niobrara) low wildfire / higher drought-hail; Colstrip and Jim Bridger tagged wet-cooled; Craig's units correctly tagged; ≥ 95% of Tier 2 anchors receive a complete tag set. Print the table plus per-hazard county choropleth sanity stats (min/max/median).

Stretch task, ONLY if the main scope is done and verified: add a real commodity field to mw_anchor_facilities.geojson via an MSHA mine-ID crosswalk (retires F1's ANCHOR_MINE_COMMODITY derived lookup — coordinate note: F1's lookup stays until an engine-side patch consumes the new field; you only add the data). If skipped, log it to backlog.

Handoff report: notebook number, credibility table, tag-coverage stats, per-source pull status, snapshot path, file list, stretch-task status.

PART 4 — Session C2-merge prompt (Sonnet — Claude Code, worktree c2-merge, AFTER C3 lands)

Session C2-merge — Exposure Tags into the Registry Build Path. Small, surgical session; you take the engine lock after C3 merges. Read: F1's phase entry (the zero-amendment exclusion pattern is your template), C2-data's asset_exposure_tags.json + exposure_tag_rules.md, the registry build path in both runtimes, and the materialization function.

At initialization, every registry asset (generators, anchors, housing where rules exist, sites on spawn) gains its exposure tags from asset_exposure_tags.json — class defaults where no per-asset row exists, confidence carried through.
Inertness is the whole game: tags are data on registry rows, excluded from the existing_assets materialization and absent from history snapshots — identical to F1's anchor treatment. Gate: all four digest contracts byte-identical on every frozen golden (A–J′, K, and C3's new L under BOTH its lenses), migration on/off, both runtimes. Zero amendments.
Tags are read-only to the engine in this session — C4 is what makes them behavioral (event targeting / vulnerability). Do not add any consumer logic.
Tests: tag presence + completeness on seeded registry (≥95% Tier 2 coverage assertion mirroring C2-data's gate), digest-identity suite, parity both runtimes.

Build-log entry: what was tagged, coverage table, digest verification, test delta. Handoff releases the lock for Wave 4 (C4).

PART 5 — Session F2 prompt (Codex build — GPT 5.5, Sonnet review, worktree f2-facility-ui)

Session F2 — Facility Layer + Economy Card. UI-only session in terra-app/: no engine numeric paths, no digest files, no data/golden/. First act: repo check for Z5-lineage components (site markers from Z4's UI work, any existing asset-registry card section, F3's new pin layer) — integrate with what exists rather than duplicating, and record what you found in the build log (this closes the S0 "Z5 status unconfirmed" item).

Anchor facility map layer. Render mw_anchor_facilities.geojson as a zoom-gated deck.gl layer: sector-colored via anchor_sector_taxonomy.json TOKEN names resolved through the app's theme (zero hex literals in components — Sonnet review greps for this), size by capacity/employment bucket, decluttered at low zoom (cluster or top-N by size per county). It must coexist legibly with the existing generator markers, Z4 site markers, and F3's pins — one unified marker legend, not four.
Tier interactivity. Tier 1 anchors: hover/click → identity card (name, sector, employment est., source, confidence). Tier 2 anchors: the click-through additionally surfaces the linked registry asset — status, retirement controls via the EXISTING action verbs/UI (F1 wired the engine; you wire the buttons — no new action semantics), and the null-MW/confidence:"blocked"-era values now patched by F0.4 display with their confidence: "low" badge.
Economy card section. County card gains an "Economy" block from the economic_drivers card data: top-3 by GDP share and by LQ with the display-sector names, driver_source and vintage (CBP_2023+QCEW_2024) in a footnote, government/military rendered like any other sector. Anchor list (from anchor_facilities block) with tier badges, click-to-zoom to the facility.
Perf budget: 60 fps pan / ≤16 ms frame at the marker-densest viewport (Front Range + I-80 corridor at mid-zoom) — print the measurement method and numbers in the handoff.
Tests: layer renders from fixture geojson, token-resolution unit test, card block renders all driver_source variants, Tier 2 click-through reaches the registry asset by anchor_id.

Sonnet review checklist (before Gate V3): hex-grep zero; no engine/ digest imports into new components beyond read-only selectors; taxonomy tokens resolve for every sector present in the geojson; marker unification actually unified (one legend); blast-radius diff scoped to terra-app/ UI paths.

Handoff: the Sweetwater walk-through — zoom in, see Jim Bridger and the trona anchors sector-colored, open a trona mine's Tier 2 card, reach its registry asset, see the Economy block with mining/extraction top-LQ.

PART 6 — Gate V3 checklist
 C3 (verified by Codex — builder/verifier separation): four- contract byte-identity on all frozen goldens under historical, migration on/off, both runtimes; Golden L frozen with embedded climate slice (no runtime read of the projections file — verifier confirms by moving the file and re-running); independent hand-check of the demand arithmetic at the three probe years; every elasticity and derate mapping has a citation or judgment flag; exogeneity suites green in BOTH runtimes; amendments_used still 4
 C2-data (Claude verifies): fresh top-to-bottom rerun; credibility table re-derived from raw caches; tag-coverage ≥95% Tier 2 recomputed; thresholds documented; snapshot file present; blast-radius clean (zero engine/registry changes); stretch-task status logged
 C2-merge (Claude verifies, post-C3): digest identity including Golden L both lenses; no tag fields in existing_assets materialization or history snapshots; no consumer logic added
 F2 (Sonnet review + gate): review checklist above; perf numbers at the densest viewport; Sweetwater walk-through executed
 Process: all four worktrees were created pre-dispatch; notebook outputs committed before dependent dispatch; build log carries C3, C2-data, C2-merge, F2 entries plus the Z5-status finding
 Wave 4 released: C4 (Opus, engine lock — carries the efficiency-retrofit new-action assignment and the tags-go-behavioral mandate) ∥ C5a components (Codex, C0–C3 surface only)

 Wave 4 Build Roadmap — Codex-Primary Execution Under Skill-Gated Review

Prepared by: Fable orchestrator, 2026-07-12 Executes: Sonnet PM (this document is the PM's operating manual) Builders: Codex (GPT-5.5) for all primary development Reviewers: Claude Code sessions invoking the 17-skill suite Baseline: main @ 6fd35bf (post-Wave-3), 319 TS / 127 Python = 446 tests, engine v4.4, amendments_used: 4, Goldens A–J′, K, L frozen Wave 4 scope: C4 (split into two handoffs) ∥ C5a ∥ H1 housekeeping, after P0 setup. C5b integration + final sweep remains Wave 5.

PART 0 — Role contract

Sonnet PM owns: worktree creation with pasted evidence, dispatch, sequencing, per-lane log collection, invoking the correct skill sessions per handoff, routing verdicts back to Codex, and the wave-close release decision via release-readiness. The PM never builds engine code, never edits any finding (append-only, §PART 1 R3), and never issues an accept/reject verdict itself — gate-review is the sole verdict issuer.

Codex owns: implementation inside its assigned worktree, a pre-build test plan per ticket, and a handoff report classifying every claim as implemented / verified / inferred / deferred. Anything Codex did not personally run and observe is "inferred," not "verified."

Claude Code (skills) owns: all review. Skill sessions report findings only; they do not fix code. Fixes go back to Codex as CHANGES REQUIRED items.

PART 1 — Standing rules (from the Wave 3 incident; binding on every session)

R1–R8 (from the Wave 3 incident; binding on every session) — canonical text now lives in `docs/methods/RULEBOOK.md`. This is a pointer, not a second copy; do not re-add the rule text here.

PART 2 — The review pipeline (skill routing per handoff)

Every Codex handoff moves through stages in order. A stage failure returns the handoff to Codex; later stages don't run on a failed build.

Stage P (pre-build, before implementation): Codex submits a test plan for the ticket → test-plan-review judges whether the plan, executed faithfully, would actually prove the acceptance criteria (not just exercise the happy path). Implementation does not begin until the plan passes.

Stage 0 (gate-of-gates): build-and-lint — compile, lint, type check, full existing suite. Zero judgment; exit codes only. Hard stop on failure.

Stage 1 (alignment): scope-audit (touched files vs. declared list — every submission, no exceptions) + architecture-review (any handoff adding new modules, abstractions, or cross-cutting mechanisms; skip for pure-data or narrow-fix diffs).

Stage 2 (domain — pick per diff):

Engine / climate math → scientific-data-review (unit errors, distributional assumptions, leakage, aggregation)
Notebook / ETL → python-pipeline-review
React/TS UI → frontend-review

Stage 3 (resilience): error-handling-review on any diff with new error paths (always, for engine handoffs); security-scanner if the diff touches input handling, file paths from data, or external fetch; performance-review whenever a perf claim is made or a hot path changes — with its standing mandate that proxy benchmarks never close a perf criterion.

Stage 4 (contracts): data-contract-check on any schema/shape change (scenario file, registry rows, JSON outputs); integration-review on anything touching the cross-runtime engine contract (Python↔TS parity is a versioned interface for our purposes) or shared type surfaces; documentation-review on every handoff's build-log fragment — the fragment is a claim about system behavior and gets checked against the diff like any other claim.

Stage 5 (verdict): gate-review aggregates all findings, classifies each acceptance criterion against the evidence taxonomy, and issues the sole verdict: PASS / PASS WITH FOLLOW-UP / CHANGES REQUIRED / BLOCKED.

Wave close: release-readiness aggregates all gate verdicts + follow-up debt and answers "does Wave 4 ship to main as a release."

Learning triggers: postmortem fires automatically on (a) the same acceptance criterion hitting 2 consecutive CHANGES REQUIRED, or (b) any R3 violation or incident. Its output is a closure condition or process change, not a third identical review cycle.

PART 3 — P0: PM setup (before any dispatch)

P0.1 Resolve the untracked test-data dependency (dispatch blocker). data/processed/county_climate_projections.json is required by the Python climate suite and is not in git — it will not exist in fresh worktrees, and C4 fails Stage 0 without it. Decision (orchestrator): track it — it is a build deliverable with full provenance, not a scratch file. Commit with a provenance note referencing C1.6. While there: run the repo-wide audit from the Wave 3 report — grep test suites for data/ path literals, cross-check against git ls-files, and track-or-fixture anything else found. Log the audit table. P0.2 Create four worktrees from main — w4-c4-engine, w4-c5a-ui, w4-h1-housekeeping, w4-verify (reviewers run in their own checkout; verification diffs against real branches, never a builder's tree). Paste git worktree list into the wave log (R1). P0.3 Create build_log/wave4/ fragment directory (R4). P0.4 Confirm skill availability — one dry-run build-and-lint invocation against clean main in w4-verify; its output is the wave's Stage-0 baseline (446 green, lint clean). Also gives a fresh read on the Golden B flake (H1.2) before anyone changes anything.

PART 4 — Ticket C4-i: Climate Hazard Event Layer (no consequences)

Builder: Codex in w4-c4-engine (engine lock — nothing else touches engine files while C4 lanes are live). Sequenced before C4-ii.

Scope (declared file list for scope-audit): engine.ts / terra_engine.py (event sampling), events.ts / event module equivalents, types.ts (event type extensions), new test files, build-log fragment. NOT in scope: consequence handlers, adaptation actions, action library, UI, goldens (no freeze this ticket).

Content:

Seeded stochastic hazard event generation, both runtimes: per year, per county, sample hazard events (heat wave, wildfire smoke/proximity, drought stress, severe storm) with frequency/severity parameterized from the C2 hazard baseline × the active lens's projection deltas (p50 only in physics, per the C3 constraint). Fold the C3-deferred heat-derate hook in ONLY if an existing derate mechanic can express it; otherwise it stays logged for C4-ii/C5.
(seed, lens) purity: identical seed + identical lens ⇒ bit-identical event streams, both runtimes, cross-runtime parity on the stream itself. Different lens, same seed ⇒ streams may diverge. Historical lens ⇒ zero climate events, always (the climate-off gate extends to events).
Inertness this ticket: events are generated but consequence coupling is stubbed to zero — so all four digest contracts remain byte-identical on every frozen golden (A–L) under BOTH lenses, migration on/off. This is the acceptance criterion that makes C4-i independently gateable.
Exogeneity: the permanent C0 test extends to event streams — mutating the action log cannot change the event stream for a fixed (seed, lens).

Acceptance criteria (gate-review checks each against evidence): AC1 event-stream cross-runtime parity (verified = both runtimes' streams diffed byte-wise by the verifier); AC2 (seed, lens) determinism; AC3 historical lens produces zero events; AC4 four-contract byte-identity on A–L, both lenses, migration on/off; AC5 exogeneity extension green; AC6 test plan executed as reviewed.

Pipeline: P → 0 → scope-audit + architecture-review → scientific-data-review (sampling math, frequency scaling) → error-handling-review + performance-review (sampling in the year loop is a hot path; any perf claim needs real timing) → integration-review (cross-runtime contract) + data-contract-check (event type additions) + documentation-review → gate-review.

PART 5 — Ticket C4-ii: Consequence Coupling + Adaptation + Golden M

Builder: Codex in w4-c4-engine, dispatched only after C4-i's PASS (or PASS WITH FOLLOW-UP with the follow-ups triaged as non-blocking).

Scope: consequence wiring (existing handlers only), adaptation action family, action_library additions, Golden M fixture + parity tests, build-log fragment. NOT in scope: new consequence mechanics — if a consequence cannot be expressed through existing derate/outage/damage/event machinery (Phase 3/4 lineage), it is logged and skipped, not invented.

Content:

Consequence coupling: sampled events apply consequences exclusively through existing mechanics — derates, outage days, damage costs against exposed assets (C2 exposure tags select the victims; F1 anchors are taggable victims too). Delta-coupling only; no baseline rewrites.
Adaptation actions (priced via the Z1.1/Z2 pattern, cited or flagged): they modify exposure/vulnerability parameters, NEVER hazard tables — assert this structurally (an adaptation action cannot write to climate_context or event-sampling inputs). This family is the roadmap's designated cuttable scope: if it hits the 2-cycle postmortem trigger, the orchestrator decides whether it moves to Wave 5.
Golden M — resilience fork: one scripted action sequence, one seed, run under ssp245 and ssp370: trajectories diverge only through events/consequences; the same (seed, lens) rerun is deterministic; historical lens run of the same script shows zero climate events and matches its pre-C4 digest. Freeze golden_m.json + digest registry entries + parity tests both runtimes. Letter M per the S0 assignment.
Goldens A–L remain byte-identical under historical lens; under non-historical lenses A–L are not asserted (they predate events) — document this boundary in the digest registry rather than leaving it implicit.

Acceptance criteria: AC1 consequences flow only through existing handlers (architecture-review hunts for parallel mechanisms); AC2 adaptation cannot touch hazard inputs (structural test); AC3 Golden M determinism + cross-runtime parity on all four contracts; AC4 A–L historical-lens byte-identity preserved; AC5 zero golden regenerations, amendments_used still 4; AC6 every adaptation price cited or flagged.

Pipeline: P → 0 → scope-audit + architecture-review (the parallel- mechanism hunt is the core risk) → scientific-data-review → error-handling-review + performance-review → data-contract-check (action library schema, golden fixture format) + integration-review + documentation-review → gate-review. test-verifier additionally runs here (and on C4-i): confirm no test was deleted/skipped/weakened to get green, and that coverage on touched files is adequate.

PART 6 — Ticket C5a: Climate UI Components (C0–C3 surface only)

Builder: Codex in w4-c5a-ui. Parallel with C4 lanes throughout — touches no engine files.

Scope: lens indicator/selector (scenario-file-level lens, surfaced at session start and in the debrief header), county-card climate panel (hazard trajectory fan charts p10/p50/p90 straight from county_climate_projections.json, attribution popovers showing {scenario, epoch, percentile, source, method, confidence} — the low- confidence and Eagle-CO-bias flags render, not vanish), hazard choropleth layers (C2 baseline + projection deltas), exposure badges on assets/anchors from C2 tags. Components that need C4's surface (exposure stress rows, event feeds) are OUT of scope — Wave 5.

Hard constraints: zero UI-side hazard arithmetic — display what the data files and engine surface provide; design tokens only, no hex (the F2 standard); one canonical anchor/asset data module — do not re-derive local copies (the PlacementOverlay.tsx duplication is the named anti-pattern, and H1.1 is deleting it while this ticket runs — coordinate through the PM on the shared module's location).

Perf criterion, stated honestly: if headless-Chrome/Playwright is available in the environment, real frame timing on the choropleth + facility layers is the evidence; if not, the criterion is carried as UNVERIFIED with proxy numbers labeled as proxies. performance-review enforces this; the F2 perf item (see H1.4) sets the precedent.

Pipeline: P → 0 → scope-audit → frontend-review (state placement, a11y, API-contract assumptions vs. the real engine surface) → performance-review → documentation-review → gate-review.

PART 7 — Ticket H1: Housekeeping bundle (remediation discipline applies)

Builder: Codex in w4-h1-housekeeping. R6 applies with force: fix only what's listed; log everything else.

H1.1 PlacementOverlay dedup — replace the local AnchorFeature / TIER2_ANCHORS re-derivation with the canonical module (created here, consumed by C5a — PM sequences the module's landing before C5a needs it, or C5a builds against the agreed interface). H1.2 Golden B timing threshold — investigate with evidence: 20-run timing distribution on clean main (P0.4 gives run 1), git-blame confirmation the 50ms number was never derived, then either a justified new threshold or a conversion to a non-timing assertion. The trend (52→55→76ms) gets explained, not waved through. H1.3 NB 22 commodity field patch — add the real MSHA-derived commodity field to mw_anchor_facilities.geojson, retiring F1's ANCHOR_MINE_COMMODITY name-lookup debt. Confirm F1's seeding reads the new field with the lookup as fallback, and that registry contents are unchanged for all existing anchors (digest surfaces untouched by construction, but assert anyway). H1.4 F2 perf gate disposition — if the environment gained real frame-timing capability, run it and close the item with evidence; if not, re-carry it explicitly in the wave-close report. It does not silently become "passed." (performance-review signs off on whichever disposition applies.)

Pipeline: P (lightweight plan) → 0 → scope-audit (line-by-line — this is the remediation-risk lane) → domain review per item (frontend-review for H1.1, python-pipeline-review for H1.3) → gate-review.

PART 8 — Wave-close: integration + release decision
PM merges lanes in order: H1 (canonical module first) → C5a → C4-i → C4-ii, each only after its gate-review PASS; full suite green after each merge; per-lane fragments concatenated into TERRA_build_log.md in merge order (append-only).
release-readiness runs across all gate verdicts: interaction check between accepted changes (C5a's UI against C4's merged engine surface, H1.3's geojson against F1's seeding), accumulated follow-up debt triage, and the release-level verdict.
postmortem runs once at wave close regardless of incidents — Wave 4 is the first wave under the Codex-primary/skill-gate model, and the learning pass on the process itself (gate friction, verdict cycle times, skill routing gaps) is part of the deliverable to the orchestrator before Wave 5 (C5b integration + final sweep across A–M) is scoped.

Escalations to the orchestrator (not PM-decidable): any BLOCKED verdict; the adaptation-family cut decision; any R3 violation; any request to regenerate a golden or consume Amendment 5; C4-ii wanting a consequence mechanic that doesn't exist in current machinery.

Wave 5 Build Roadmap — Integration, Rework, and Program Close

Prepared by: Fable orchestrator, 2026-07-12 Executes: Sonnet PM · Builders: Codex (GPT-5.5) · Review: Claude Code skill sessions (the Wave 4 pilot workflow, continued as validated) Baseline: main @ 2690964 (C4-i + H1 merged; engine v4.5). State this SHA in every dispatch prompt — Wave 4 opened on a stale baseline and only R2 caught it. Not on main: C5a (ede5149 on w4-c5a-ui, gate verdict CHANGES REQUIRED, FU-1–FU-6 open). C4-ii never dispatched. Wave 5 scope: close all Wave 4 carry-forwards, land C4-ii and the C5a rework, build C5b integration, run the final program-wide sweep, and close with release-readiness + the program postmortem.

PART 0 — Orchestrator decisions binding on this wave

D1. FU-1 resolved as a named deferral + ticket C2.1. The C5a choropleth ships as "2050 fire days" with the deferral stated plainly in the LayerToggle label and build log; C2.1 (this wave) computes the missing county baseline + per-lens/epoch delta surface; C5b wires the full choropleth. Gate-review's refusal to launder an undeclared reduction stands as the precedent: deferrals exist only when the PM/orchestrator names them in writing before the gate. D2. H1.3 commodity fallback: retained. Sign-off granted per the recorded four-point rationale; retirement deferred to post-program housekeeping after an NB 22 regeneration cycle proves stable. Gate-review's open item on H1.3 is closed by this decision. D3. Postmortem is a closeout condition, not a nice-to-have. Wave 4's unconditional postmortem never ran. Wave 5 does not close without the postmortem artifact (scope in Part 8). D4. F2 frame-timing debt (p95 ~67ms vs 16ms, pre-existing) is carried, not fixed here. It predates every wave and needs GPU/renderer investigation that would crowd out integration work. It appears by name in release-readiness's debt triage with an explicit ship-with- documented-debt vs. block decision — it does not get quietly dropped.

PART 1 — Process fixes (delta to the Wave 4 standing rules R1–R8, which

remain in force)

R9–R14 (process fixes, delta to R1–R8, which remain in force) — canonical text now lives in `docs/methods/RULEBOOK.md`. This is a pointer, not a second copy; do not re-add the rule text here.

PART 2 — P0: PM setup

P0.1 Confirm repo location is local non-synced (~/projects/...); record the path in the wave log. P0.2 Commit orchestration docs per R13; create build_log/wave5/. P0.3 Provision worktrees with R10 evidence: w5-engine (C4-ii), w5-ui (T2 lint → T3 C5a-r → later C5b), w5-notebook (C2.1), w5-verify (reviews). Note w4-c5a-ui still holds ede5149 and the restored c5a.md — preserve per R7 until T3 recreates from it deliberately. P0.4 Stage-0 baseline run on clean 2690964 in w5-verify: full suite (expected green), full lint (expected 64 errors / 7 warnings — this number is T2's starting evidence). P0.5 Write D1–D4 into TERRA_build_log.md (append-only) so the deferral, the H1.3 sign-off, and the debt carry are on the record before any builder reads scope.

PART 3 — Lanes and sequence
Lane	Sequence
Review	T1 (C4-i follow-up closure) → then embedded in every gate
Engine	T5 (C4-ii), dispatched once T1 passes
UI	T2 (lint remediation) → T3 (C5a rework) → T6 (C5b, after T5 + T4)
Notebook	T4 (C2.1)
Close	T7 (final sweep, release-readiness, postmortem)

T1/T2/T4 start immediately in parallel. T5 starts on T1's completion (days, not weeks — T1 is review-only). T3 follows T2 in the UI lane so the lint baseline is clean before C5a's rework is measured against it. T6 requires T3, T4, T5 merged. T7 requires everything merged.

PART 4 — Tickets
T1 — C4-i follow-up closure (Claude review sessions only; no builder)

Run the two skills Wave 4 deferred, against C4-i as merged on 2690964: performance-review (event-sampling timing baseline in the year loop — real numbers, both runtimes) and integration-review (cross-runtime interface audit of the event-stream contract: types, seed handling, lens plumbing). Output: findings appended to C4-i's gate record. C4-ii's dispatch is gated on this closing without a BLOCKING finding. If either skill finds one, it escalates before T5 dispatch — that is the point of running them first.

T2 — UI lint-debt remediation (Codex, w5-ui)

Retire the pre-existing 64 errors / 7 warnings (P0.4 is the evidence base; per-rule enumeration in the handoff). Remediation discipline (R6) applies with force: lint fixes only, zero behavior changes, no test weakening (test-verifier confirms), and files in C5a's declared list are handled mechanically only — FU-2's suppression removal belongs to T3, not here. Fold in the localeCompare → explicit code-point comparison fix (Wave 4 §5.5) as the one named non-lint item. Pipeline: P (light) → 0 → scope-audit → frontend-review → test-verifier → gate-review. Closes: Wave 4 §5.3, and unblocks C4-i's AC6 reaching full VERIFIED (record that closure in T1's gate record when T2 merges).

T3 — C5a rework (Codex, w5-ui, recreated per R10 from post-T2 main,

cherry-picking ede5149) Work the FU list as written in the §8 amendment:

FU-2: remove the MapView.tsx suppression; match the 10 sibling layers' unsuppressed map={mapRef.current} pattern.
FU-3 + FU-4: real implementation-stage and performance-disposition sections in build_log/wave5/c5a-r.md (availability check result, any proxies labeled PROXY — the H1.4 precedent is the template).
FU-5: resolve the var(--choro-3) question with rendering evidence — MapLibre paint expressions do not resolve CSS custom properties by default; either demonstrate the project's theming bridge makes it work, or replace with resolved values. "It compiles" is not evidence for this one.
FU-6: the discriminating tests per R14 — active-lens surfaced in the debrief header from a loaded ssp245 session; exposure-badge rendering/provenance/missing-tag; C4 scope-boundary assertion; attribution-popover all-six-fields.
FU-1 per D1: deferral documented in label + log. If T4 has already merged, wiring the full baseline+delta layer here is optional-forward (PM's call on timing); otherwise it is C5b scope. Re-enters at Stage 0 under R9. Pipeline: 0 → scope-audit → frontend-review → performance-review → documentation-review → test-verifier → gate-review.
T4 — C2.1: hazard baseline + delta surface (Codex, w5-notebook)

NB 24 addendum (clearly marked C2.1 section): compute the county-level hazard baseline and per-lens/per-epoch delta surface Part 6 of the Wave 4 roadmap assumed — for at minimum the fire-danger metric the choropleth displays, designed so additional metrics are additive. Output schema documented and versioned (data-contract-check runs — the UI is a declared consumer); values carry full attribution per the C1.6 standard; deltas are arithmetic on existing attributed values, no new modeling. Pipeline: P → 0 → scope-audit → python-pipeline-review + scientific-data-review → data-contract-check → documentation-review → gate-review. Data outputs committed before any dependent dispatch (Wave 2 rule, still binding).

T5 — C4-ii: Consequence Coupling + Adaptation + Golden M (Codex,

w5-engine; engine lock) Scope as the Wave 4 roadmap Part 5 specified, plus the named pre-tasks from the closeout's blocking list:

Pre-task a: consequence_multiplier_ppm gets the matching named-constant guard on the Python side before any coupling is enabled (§5.6).
Pre-task b: Padé-approximation docstring in hazard_events.py (validity λ << 1, degradation at λ ≥ 0.5) and a documented severity_milli ceiling (§5.7, §5.8) — documentation-review checks both against the code. Then: consequence coupling through existing handlers only (C2 exposure tags select victims, F1 anchors included); adaptation actions modifying exposure/vulnerability never hazard inputs (structural test); Golden M resilience fork (one seed, ssp245 vs ssp370 diverging only through events/consequences; deterministic on rerun; historical-lens run matches its pre-C4 digest); A–L historical byte-identity preserved; amendments_used stays 4; adaptation remains the designated cuttable scope with the 2-cycle postmortem trigger escalating the cut decision to the orchestrator. Full pipeline including test-verifier; R14 applies to every AC.
T6 — C5b: Climate Integration + Workshop Surface (Codex, w5-ui;

after T3 + T4 + T5 merge)

Exposure stress rows on impact cards and the event feed UI, against C4-ii's real consequence surface (call-site audit of impact-card consumers — the Wave 1 discipline).
Full hazard choropleth: C2.1 baseline + delta surface, per D1, replacing the deferred 2050-only layer; deferral note closed in the log.
Cross-lens replay affordance (load a session, view under another lens — UI orchestration of existing engine capability only, zero UI arithmetic).
W6 debrief dashboard climate integration: lens named in the header (T3's discriminating test extends here), exposure/consequence summary in the debrief export.
Perf disposition per the H1.4 standard: real frame timing if the environment provides it, explicit UNVERIFIED with availability evidence if not. Pipeline: P → 0 → scope-audit + architecture-review (one canonical data module rule — no C5a-era re-derivations) → frontend-review → performance-review → data-contract-check (debrief export shape) → documentation-review → test-verifier → gate-review.
PART 5 — Wave-close: T7, in order
Final program sweep (Claude, w5-verify, against final merged main): full parity A–M, both runtimes; A–L byte-identity under historical; Golden M determinism under both lenses; exogeneity and coordinate-inertness suites; migration on/off; end-to-end resilience playthrough (load a county, run a lens fork, adapt, retire, debrief).
release-readiness across every gate verdict from Waves 4 and 5 (nothing has shipped as a release yet — the aggregation covers both): interaction check between accepted changes, follow-up debt triage including D4's F2 perf debt by name, release-level verdict.
postmortem (D3 — closeout condition). Scope: (a) the Wave 4 OneDrive/worktree incident — what evidence was available at each gate that reviews were running against uncommitted state, and which of R9–R12 would have caught it earliest; (b) the C5a CHANGES REQUIRED cycle — whether Stage P could have caught the undiscriminated-coverage pattern that R14 now targets; (c) the pilot workflow overall — gate friction, verdict cycle times, skill-routing gaps, and whether the Codex-build/Claude-review split held under the wave's hardest ticket (C4-ii). Output: closure conditions and process changes for whatever follows this program, not a narrative. The wave-close report is not accepted without this artifact attached.

Escalations to the orchestrator: any BLOCKED verdict; the adaptation cut decision; any golden regeneration or Amendment 5 request; a T1 blocking finding; any R3 (append-only) violation; the D4 ship-or-block perf decision at release-readiness.

Ag roadmap says	Current reality	Binding for Wave 6
NB 20 (A0), NB 21 (A1), NB 22 (A2)	20–24 consumed (22 anchors, 23/23b/23c climate, 24 hazards)	A0 → NB 25, A1 → NB 26; verify ls notebooks/ first cell
Engine v2.1 → v2.2	v4.6± post-Wave-5	Ag extension = next minor version at ticket time
Golden E	A–M consumed	Ag lifecycle golden = Golden N
Library v3.1 → v3.2	v3.x + C4-ii adaptation actions (shipped, T5)	agriculture category lands as the next schema bump from actual current; AG1 may cite the shipped adaptation family's pricing pattern alongside Z1.1/Z2
"state digest + fiscal_digest; add ag_digest, document all three"	Four contracts: state, fiscal, existing_assets, history	county_ag gets the fifth contract (ag_digest); all four existing contracts stay computed over the same fields; A–M byte-identical; amendments_used stays 4
Standalone drought_forage_shock event	C4 hazard system already samples drought with (seed, lens) purity	D1: baseline drought event + lens-delta modulation through C4 machinery (Part 2)
Converted acres are one-way	Z1.1 reclamation arcs exist	D3: reclamation completion returns acres to rangeland
Six auto-pause triggers → eight	Count may have moved since W5	Enumerate actual triggers at A4 dispatch; "two new ag triggers" is the binding content, not the total
Engine work via notebook	Z3+ pattern: direct src + pytest goldens	A2 is an engine ticket; Golden N validation ships as pytest (F1 TestGoldenK precedent)
PART 2 — Orchestrator design decisions (binding)

D1. One drought system. drought_forage_shock integrates with the C4 hazard event layer, not beside it. Baseline component: drought exists under the historical lens, seeded, frequency/severity tiers calibrated to Drought Monitor conventions + a documented Wyoming drought year (2021-class) — preserving W5 fixed-seed workshop comparability. Lens component: ssp245/ssp370 modulate frequency/severity as deltas from C1 drought-relevant metrics (consecutive dry days, water-stress index) through the existing C4 path, delta-coupling only. Historical lens ⇒ zero lens-driven modification (climate-off gate extends). The exogeneity and (seed, lens) purity suites extend to ag consequences. D2. Zero-amendment doctrine holds. county_ag is a new state tier with its own ag_digest (fifth contract, registered in the digest registry with its scope stated). Structural test: goldens A–M byte-identical on all four existing contracts, both lenses, migration on/off, pre/post ag seeding — the F1 inertness proof pattern. Ag baselines are observed state; seeding carries zero flow deltas (jobs/valuation already in county baselines — marginal handles only, the F1 double-count rule). D3. Reclamation returns land. Completion of a Z1.1-pattern reclamation arc moves the asset's converted acres back to the rangeland class in the land ledger. Sites hosting successors keep their acres converted. Small, documented, prevents the one-way-ledger lie. D4. Ag employment never cites QCEW (design contract #6): Census of Agriculture operations/producers + BEA farm proprietor income. This is a scientific-data-review check item, stated here so it is a gate criterion and not a builder memory item. (F0's government-ownership lesson is the precedent for what QCEW-shaped blind spots cost.) D5. The rancher/Extension domain review is a gate for AG3. The PM schedules the human reviewer during AG0 (longest lead time in the wave); AG3 does not pass gate-review without the logged domain-review findings and their dispositions. The fiscal tier's credibility test was the DOR tables; this tier's is a rancher not laughing at the forage numbers.

Design contracts #1–#6 from the ag roadmap (productive-value assessment + conversion asymmetry; diversion vs. consumptive use; federal AUMs; decay/ re-invasion honesty; per-technology coexistence; ag employment sourcing) are acceptance criteria verbatim — each maps to at least one discriminating test per R14.

PART 2a — New standing rules and P0 additions (from the Wave 5 closeout)

R15–R18 (new standing rules, from the Wave 5 closeout) — canonical text now lives in `docs/methods/RULEBOOK.md`. This is a pointer, not a second copy; do not re-add the rule text here.

P0 additions:

Hash-verified data provisioning. Extend provision_worktree.sh with a maintained data manifest (path + hash for every runtime data file tests depend on), verified on every provision and recreation. AG0/AG1 add their new outputs (wy_county_ag_baseline.json, wy_grazing_allotments.csv, wy_ag_sources.csv, library bump) to the manifest as part of their handoff. (Wave 5 §3.7: provisioning gaps recurred twice.)
Headless-browser availability check, once, at P0. Three separate items (H1.4, T3-FU-5, T6-FU-2) ended at "needs a human to look at the screen." Check whether Playwright/headless Chrome can be stood up in this environment; if yes, T6-FU-2's gray-fill verification becomes an early AG-wave smoke test and AG3/AG4 get real render checks. If no: the D5 domain-review session doubles as the human visual-verification pass — the walk-through script includes the specific render checks (choropleth modes, badge stacks, confirm-modal preview) so one human session closes both gates, and perf/render dispositions cite it.
Debt intake. Carry Wave 5's open items into the wave log by ID (D4, T2-FU-DEAD, T4-FU-1, T5-FU-1, T5-FU-2, T6-FU-2); dispositions in Part 5.
PART 3 — Lanes and sequence

The ag track is inherently more serial than prior waves (A0→A1→A2→A3→A4 is a chain), so parallelism comes from overlapping stages, not lanes:

Stage	Notebook lane (Codex)	Engine lane (Codex)	UI lane (Codex)	Non-code
W6-A	AG0 (NB 25 baseline)	—	—	PM books domain reviewer (D5); methods-page drafts begin
W6-B	AG1 (NB 26 actions/coefficients)	AG2 Stage P + get_county_ag contract spec frozen via data-contract-check	AG3 Stage P against the frozen contract	
W6-C	—	AG2 build (engine lock)	AG3 static build against contract fixtures	Domain reviewer walk-through prep
W6-D	—	—	AG3 completion (live engine) → AG4	Domain review (D5 gate); run-of-show draft
Close	Program sweep · release-readiness · postmortem (standard per Wave 5 precedent)			

The W6-B/C overlap is the one real parallelization: AG2's accessor contract (get_county_ag shape, ledger field names, trajectory format) is frozen at Stage P by data-contract-check so AG3 builds cards/components against conforming fixtures while the engine is still in flight. If AG2's implementation forces a contract change, that is a formal contract revision through the PM, not a quiet drift — frontend-review checks AG3's assumptions against the real surface at integration.

PART 4 — Tickets
AG0 — NB 25: Wyoming Ag Baseline Pull (Codex, notebook lane)

Content as the ag roadmap's A0 prompt specifies (land by use with reconciliation to county area and the other_land residual pool; cattle + forage with AUM capacity from documented stocking rates, confidence: "low"; federal AUMs from BLM RAS/USFS with wy_grazing_allotments.csv as sub-county flavor; water with diversion and consumptive use as separate fields everywhere; RAP invasive cover + 10-year trend, county aggregates only; ag economics per D4; DOR ag valuation linked not duplicated, per-acre productive values recorded as coefficients for AG1). Modernized mechanics: first cell prints pwd/branch (R11) and verifies NB 25 free; all pulls cached to data/raw/ with vintage; MANUAL_FETCH.md for anything the sandbox blocks — never invented values; outputs committed before AG1 dispatch (standing rule). Credibility gate (verifier re-derives): the sanity table — Fremont and Park lead irrigated acreage; Campbell and Carbon rangeland-dominated with large federal AUM shares; Teton's land-in-farms a small fraction of county area; statewide beef cows within 10% of the NASS state total. Implausible counties investigated, not annotated around. Pipeline: P → 0 → scope-audit → python-pipeline-review + scientific-data-review (D4 enforced here) → data-contract-check (wy_county_ag_baseline.json schema, consumers declared) → documentation-review → gate-review.

AG1 — NB 26: Ag Action Family + Coefficients (Codex, notebook lane)

Content per the A1 prompt: the four-action agriculture category (invasive_species_removal with encoded re-invasion decay schedule — decay parameters in the action data, engine reads them; irrigation_efficiency with separate diversion and consumptive-use coefficients; rangeland_restoration_maintenance with the pairing rule; ag_conservation_easement affecting the available-land pool, not the fiscal ledger), EQIP/literature costs cited both bounds, jobs + capex fields so the Resource HUD prices them like any build. ag_coexistence coefficients on existing energy actions (converted vs. shared acres per technology, wind direct-vs-total distinguished) — data the engine ignores until AG2, digests untouched, assert it. Ag fiscal coefficients extending wy_fiscal_coefficients.json: 9.5%-of-productive-value by land type and the conversion delta into the existing 11.5%-FMV industrial pipeline (reference, don't duplicate — and the net is honestly shown as the property-tax increase it almost always is). Drought event definition per D1: baseline tiers + lens-delta parameters, defined as data, wired in AG2/AG4. Gate: the valuation back-cast — implied ag assessed valuation from coefficients × AG0 acreage vs. the actual DOR class column, per county, ±25% tolerance, residuals documented; verifier re-derives the table. Library schema bump validated; every coefficient in wy_ag_sources.csv. Pipeline: P → 0 → scope-audit → python-pipeline-review + scientific-data-review → data-contract-check (library schema bump — consumers: both engines, UI picker) → documentation-review → gate-review.

AG2 — Engine Ag Extension + Golden N (Codex, engine lock; the wave's

hardest ticket) Both runtimes. state['county_ag'] for the 23 WY counties: land ledger (irrigated / dry / private rangeland / easement / converted / other), water ledger by claimant (ag diversion AND ag consumptive tracked separately, energy, other, against county supply), forage index (private + federal AUMs, separate), cattle inventory scaled by forage within documented elasticity bounds, ag valuation by land type feeding the existing county_fiscal ledger — no parallel fiscal path (architecture-review's hunt). Land competition in the action path: energy builds draw converted acres by the documented priority order (other → rangeland → dry crop → irrigated), never from easement acres; conversion fires the valuation swap; shared acres recorded, consume nothing. Ag dynamics in the year loop: treatment effects at completion then decay per the action's schedule unless maintenance is active — no engine path may let treated forage persist for free (structural test); irrigation efficiency moves diversion and consumptive use by their separate coefficients; drought events apply forage multiplier + curtailment for their duration via the D1-integrated path; D3 reclamation return wired. get_county_ag accessor per the frozen W6-B contract. Digests per D2: fifth contract added, four existing contracts byte-identical on A–M (both lenses, migration on/off) — the full F1-style inertness proof. Exogeneity and (seed, lens) purity suites extended to ag. Golden N — Fremont & Converse ag arcs (the A2 script, updated): cheatgrass treatment in Converse with and without maintenance (rise, decay to tolerance by year N without; hold with); irrigation efficiency in Fremont (diversion falls by full coefficient, consumptive use by the smaller documented fraction — assert both); utility solar on Fremont ag land (irrigated acres converted, ag valuation drops, total property tax rises via the industrial swap — direction and rough magnitude asserted); wind on Converse rangeland (AUMs within shared-acre tolerance); two-year drought (forage and cattle depress, recover on schedule); run under historical AND one SSP lens (drought modulation direction asserted). Freeze golden_n.json, pytest suite (D4 pattern), cross-runtime parity at 1e-6, digest registry entry. Debt constraints active on this ticket: (a) if AG2's parity/exogeneity extensions touch tests/parity/c3-inertness-gate.test.ts, the T2-FU-DEAD constraint fires — remove replayFixtureActions (lines 32–80) and its void suppression, or wire it into a real test; do not carry the suppression forward. (b) performance-review's AG2 run converts T5-FU-1's one-time 14.2ms consequence-coupling observation into a committed regression benchmark covering the full year loop (consequences + ag dynamics) — review-lane work, not builder scope, closing that debt item while the loop is under measurement anyway. Pipeline: P (R14 mapping mandatory — every design contract gets its discriminating test) → 0 → scope-audit + architecture-review → scientific-data-review → error-handling-review + performance-review (year loop grew again — real timing, R18 provenance on all counts) → integration-review (cross-runtime) + data-contract-check + documentation-review → test-verifier → gate-review.

AG3 — Ag Yields UI + Competition Preview (Codex, UI lane)

Per the A3 prompt: the four ag yields extending the W4 strip (forage with private/federal split and RAP invasive burden + trend; land-ledger stacked bar with converted acres called out; water by claimant showing diversion AND consumptive use with the return-flow explanation in the expand panel; ag economics with the DOR land-type breakdown) — every absolute with its denominator. The placement-time competition preview in the confirm modal: acres converted by source class, acres shared, ag valuation removed vs. industrial added with the net shown as both components (the asymmetry IS the lesson), AUMs affected, water reallocation — all values from the engine preview path, zero UI arithmetic; easement-blocked placements self-explain. Ag actions in the picker with decay shown up front — never hide the decay. Choropleth modes (invasive burden, converted acres, forage trend) on the C2.1-era choropleth infrastructure; badge-stack reuse. Tokens only; canonical data modules only; F3 pin placement interplay: pins on ag-land builds behave per F3, competition preview keys off county + land class, not pin position. Gates: the Fremont-vs-Campbell solar siting walk-through (materially different previews, asymmetry visible in both, every number traceable in the debug popover) + D5 domain review findings logged and dispositioned. Perf disposition per the H1.4 standard. Pipeline: P → 0 → scope-audit + architecture-review (no W4-strip fork, no W6 component forks) → frontend-review → performance-review → documentation-review → test-verifier → gate-review.

AG4 — Drought Wiring + Workshop Integration (Codex, UI lane)

Wire the D1 drought event end to end (fixed-seed comparability asserted; lens modulation asserted under one SSP). Two ag auto-pause triggers per the A4 prompt (drought onset "How are you responding?"; first irrigated conversion "Why here?") following the W5 pattern — enumerate the actual current trigger set first per Part 1. Session-config flags (ag category on/off, drought on/off — energy-only sessions unchanged, assert via an existing-config replay) + the "Ranch Country 2040" example config. Reflection card ag line; facilitator dashboard: converted-ag-acres axis option and ag treatments in the consensus popover — W6 components extended, not forked. Client-side and backend-free. Gate: the full Ranch Country 2040 run — seeded drought, .terra.json export, reimport, replay to matching digest (all five contracts), annotations intact, dashboard ag views correct. Pipeline: P → 0 → scope-audit → frontend-review + integration-review (session-config schema is a consumer contract) → documentation-review → test-verifier → gate-review.

Non-code track (PM-managed, parallel throughout)

Methods-page additions (ag tier doctrine, assessment asymmetry, diversion vs. consumptive use, re-invasion honesty, AG1 back-cast table); Ranch Country 2040 run-of-show after AG4; the D5 domain review as AG3's gate input. Documentation-review checks the methods-page claims against the shipped engine behavior — the docs are claims like any other.

PART 5 — Wave close
Program sweep: full parity A–N, five digest contracts, both lenses, migration on/off, exogeneity + purity + coordinate-inertness suites, the Ranch Country 2040 end-to-end as the playthrough.
release-readiness across all AG gate verdicts + the carried debt register by ID: D4 (F2 canvas perf — ship-or-block decision restated), T2-FU-DEAD (closed by AG2 if the constraint fired, else re-carried), T4-FU-1 (baseline coverage annotation — re-carried unless a ticket touched the schema), T5-FU-1 (closed by AG2's committed benchmark), T5-FU-2 (re-carried unless it recurred, in which case escalated), T6-FU-2 (closed by the P0 headless path or the D5 visual pass). No debt item exits the register silently.
postmortem — closeout condition, with the Wave 5 lesson applied: the named questions ARE the deliverable's structure, each answered with a closure condition or an explicit "no change warranted," none skipped. Questions: did the frozen-contract overlap (W6-B/C) actually buy schedule without contract churn; did D1's unified drought design hold or leak a parallel mechanism; how did the serial track's cadence compare to the parallel waves under the same pipeline; and did R15/R16 eliminate their Wave 5 failure modes or merely relocate them.

Escalations to the orchestrator: any BLOCKED verdict; any golden regeneration or Amendment 5 request; any AG2 finding that the fifth-digest path fails (D2 fallback is an orchestrator decision, not a builder workaround); a D5 domain review that fails the credibility test (that is a data/design problem, not a UI rework); contract revisions to the frozen get_county_ag spec.