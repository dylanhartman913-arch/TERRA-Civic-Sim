TERRA Build Summary: W0–W4 Completion and X1–X3 Upgrade Scope
Document type: Strategic roadmap input — for incorporation into TERRA_fiscal_workshop_roadmap.md and TERRA_build_log.md
Covers: Fiscal and workshop instrumentation track (W0–W4), plus the scoped mineral asset lifecycle upgrade (X1–X3)
Engine version at close: v2.4
Parity test count at close: 52/52
Golden fixtures frozen: A, B, C, D, E, F

Part 1 — What Was Built: W0 Through W4
The arc in one sentence
The W-track added a Wyoming-resolution fiscal ledger to the existing EES engine, surfaced it as a live county card yields strip, and wired every coefficient back to a statutory source or a flagged proxy — so that the tool can speak accurately about how energy decisions impact local taxes, school funding, and employment, not just ecological and social capital.

W0 — Debt Retirement and Resource HUD
Engine version: v2.0 → no version bump (UI and budget wiring only)
Parity: 23/23
Fixed two pieces of debt that had been silent since Phase 3: capital_cost_usd and labor_years were returning zero for all 49 actions due to a coefficient field name mismatch in budgets.ts, so the Resource HUD was displaying real pool totals against zero consumption. Fixed via atb_capex_2023 fallback in getActionCapex and a corrected labor proxy.
Built the Resource HUD: a persistent 44px strip across the top of the app showing six per-era pools (Capital, Labor, Steel, Concrete, HALEU, Transmission ROW) with color-shift at 60%/85% consumption, hover popovers itemizing draw by queued build, and a click-to-highlight behavior mapping each chip to the counties drawing from that pool. Overflow now produces a structured modal naming the exhausted pool, the era, and the auto-scheduled start year.
Handoff condition met: all 49 actions report non-zero capital and labor at unit-scale magnitude; HUD popover shares sum to exactly 100%.

W1 — Wyoming Fiscal Baseline Pull
Notebook: 17_wy_fiscal_pull.ipynb
Scope: 23 Wyoming counties only (fiscal resolution is Wyoming-only by design doctrine)
Assembled the per-county fiscal baseline from BLS QCEW/LAUS (live API) and Wyoming DOR Annual Report tables (manual extraction). Key finding during extraction: DOR tables use counties as column headers, not row labels — required a lattice+transpose strategy rather than default stream extraction; two passes were necessary to produce clean CSVs.
Delivered per-county: assessed valuation by property class (minerals, industrial, commercial, residential), total mill levy, ad valorem mineral production valuation, severance distributions, PILT, sales/use tax, and employment by NAICS (coal mining 2121, oil-gas 2111, power 2211, construction 23, data processing 518210) plus county labor force (LAUS). The labor_force_laus field name is load-bearing for W4's relative-impact denominator and must not be renamed.
Key outputs: wy_county_fiscal_baseline.json (283 KB, 23/23 counties), wy_fiscal_sources.csv (667 rows: 370 high confidence, 297 low).
Confidence split: approximately 44% of source rows flagged confidence: low. Back-cast residuals tracing to known low-confidence inputs (commodity split, ONRR null, severance pro-rata, school finance) are treated as explained, not as coefficient bugs.
Outstanding MANUAL_FETCH items carried forward (still unresolved):
ItemStatusONRR federal mineral royalty disbursements, county-level⚠ OutstandingDOR Mineral Valuation Report — per-county commodity (coal/oil/gas/trona) split⚠ Outstanding — highest priority unlock for Phase Y (see Part 2)Per-county severance tax⚠ Formula-applied pro-rata, confidence: lowSchool finance foundation net transfer (WY LSO tables)⚠ Outstanding"Table of distributions by county"✗ Unrecoverable — raster image, would require OCR

W2 — Fiscal Coefficients
Notebook: 18_fiscal_coefficients.ipynb
Key output: wy_fiscal_coefficients.json (2.3 MB, all 49 actions, county-keyed)
Built the coefficient layer connecting every player action to its fiscal consequences across 23 Wyoming counties. Delivered: assessed valuation delta per unit for all 49 actions; coal retirement dual-ledger (ad valorem — Ledger A, county-collected; severance distribution — Ledger B, state-collected) for coal conversion actions; county-keyed property tax annual; sales/use during construction (with data-center equipment exemption flagged structurally); operations jobs per unit (NREL JEDI, NRC docket, EIA sources); and school finance net flow (37-mill local levy proxy, confidence: low throughout pending WY LSO tables).
Key finding: the coal_retirement_advalorem_delta_per_mw and coal_retirement_severance_delta_per_mw coefficients are on completely different ledgers with different magnitudes. Campbell's advalorem delta is −$61,363/MW/yr; severance delta is −$1,502/MW/yr. A bug during development (unit conversion using 1e6 instead of 1_000) inflated Ledger B by 1000×; caught and fixed before final execution.
Back-cast validation: Campbell PRB −17.1% ✓, Laramie DCs +4.6% ✓, Lincoln Naughton −92.8% ⚠ (explained by planned retirement timing, not a coefficient error).

W3 — Engine Fiscal Extension and Golden D
Engine version: v2.0 → v2.1
Parity: 23 → 33/33 (10 new fiscal assertions)
New fixture: golden_d.json
Extended the Python engine and TypeScript port to carry state['county_fiscal'] for all 23 Wyoming counties: valuation by class, revenue by source (property, ad valorem production, severance share, federal royalty share, sales/use, PILT, school finance net), and per-source trajectory. apply_action/queue_action register fiscal deltas; advance_year applies depreciation, commissions valuation when builds complete (not at decision year), and steps production-linked flows proportionally with retirements.
Critical design discipline: the existing state digest is computed over the same fields as before — Golden A/B/C remain byte-identical. A separate fiscal_digest covers the new ledger. These two digest contexts must never be conflated.
Golden D asserts four fiscal arcs: Campbell ad valorem declines monotonically with coal retirements; Laramie property tax rises at Natrium commissioning (2032), not at decision; Laramie data center adds property tax with a flagged-exempt sales/use share; Campbell school-linked revenue falls in a magnitude consistent with the W2 back-cast.
Wiring bugs found and fixed post-handoff (today): county_fiscal data files (fiscal_baseline.json, fiscal_coefficients.json) were never imported by store.ts. Only the module-level initialEngineState was patched initially; five additional initializeState call sites (including startCampaign, replayLog, computeTrajectory, enterReplayMode, replayScenario) each independently instantiated engine state without fiscal parameters, wiping county_fiscal to {} on every campaign start, undo, and save-load. All six call sites now carry fiscal parameters. Golden A/B/C digests unaffected.

W4 — County Yields UI
Parity: 33/33 (unchanged — UI session)
Built the yields strip on the county card: five chips (⚡ Capacity, 🔨 Jobs, 💰 Revenue, 💧 Water, 🏠 Housing). Each chip expands to its breakdown: Revenue expands to a stacked-area chart by source over time (Ledger A ad valorem, Ledger B severance, PILT, Ledger C school finance net), with a signed zero-centered view for Wyoming counties showing the decoupling mechanic explicitly — Ledger C moves opposite to A+B as mineral valuation falls, because recapture burden shrinks when the county's mineral base shrinks.
Extended the placement-time confirm modal with a pre-placement impact card: construction jobs (and % labor force, with housing-pressure flag if threshold crossed), operations jobs at commissioning, Δ property tax, Δ water, land acres, and share of each era pool consumed. All values are computed by engine preview path — no UI-side arithmetic duplicating engine logic.
Design note: Capacity and Jobs yields are intentionally player-delta meters, not baseline readers. The yields strip shows "what you have built here," not "what exists here." Baseline generation and existing employment are shown in the Energy Baseline and Demographics sections of the card. This distinction matters for demo framing: a county with operating coal mines will show 0 jobs in the yields strip until the player takes an action, because no player action has yet been placed.
Entry-point bug found and fixed today: src/main.tsx was importing from src/App.tsx (the placeholder scaffold) rather than src/ui/App.tsx (the real application). The two files had been swapped at some point — src/ui/App.tsx contained the stub, src/App.tsx contained the full game UI. Fixed by copying the real app component into src/ui/App.tsx with corrected import paths. src/App.tsx is now dead code (left in place; should be deleted in a future cleanup session).
Recurring failure pattern documented: Three separate times today, a fix landed correctly at one architectural layer while a sibling call path continued the old behavior — the entry-point swap, the county_fiscal wiring (only one of six initializeState call sites patched), and the replayScenario fiscal param omission. Future sessions should explicitly audit all call sites for any function being changed, not just the one that surfaces first.

Part 2 — What Is Scoped: X1–X3 Mineral Asset Lifecycle Upgrade
Why this upgrade is necessary
The W-track fiscal ledger is accurate for player-placed actions — things you build. But Wyoming's fiscal story is dominated by assets that already exist and are on a structural decline: Powder River Basin coal mines, which account for 170 million short tons per year of production (EIA-7A, 2024), 78% of Campbell County's mineral assessed valuation, and the majority of its ad valorem and severance revenue. Holding that baseline constant while adding capacity in other sectors would make the tool actively misleading for anyone reasoning about Wyoming's transition trajectory. The X-track promotes these baseline assets into live, decrementable engine state so that decline can be modeled alongside growth.
What was already completed (W5.1, engine v2.2 → v2.4)
This work ran concurrently with the W4 debugging described above and is fully complete.
Engine v2.2 (X1 equivalent): Added state['existing_assets'][geoid] — a discriminated union of two entry types. mw_asset entries cover MW-measured flagship assets (Dave Johnston/Converse 762 MW, Kemmerer Unit 1/Lincoln 345 MW, Jim Bridger/Sweetwater 2,120 MW, Meta DC/Laramie 100 MW, Jade+Crusoe/Laramie 200 MW). production_asset entries cover commodity-measured facilities with no MW figure. Seeding happens at initializeState; a separate existing_assets_digest (MD5) tracks the inventory independently of the main EES state digest and the fiscal digest.
Assets excluded from live state carry an explicit excluded: "no_mw_conversion" flag rather than being silently dropped. BWXT TRISO Fuel Facility and the Naughton Gas Conversion remain excluded pending a kg/yr→MW conversion spec (BWXT) and commission date (Naughton).
Engine v2.3 (Campbell coal production_asset): PRB Coal Mines was the critical gap: a mine, not a power plant, measured in tons not MW, which is exactly why the original W5 exclusion logic couldn't reach it. Solved via a new production_asset schema: commodity (coal_surface), production_volume (170,045,000 short tons/yr — EIA Annual Coal Report Table 2, 2024, 11 mines, Campbell County, confidence: high), effective_severance_rate_per_unit ($0.5683/ton, back-calculated from W2 severance coefficients), advalorem_rate_per_unit ($1.263/ton, derived from 90% coal-fraction proxy × 62.836 mills; confidence: low, same proxy caveat as all other Campbell coal coefficients), assessed_delta_per_unit (−$20.10/ton, for Ledger C computation), and county_distribution_share (0.706, same W2 proxy — pending DOR Mineral Valuation Report).
Engine v2.4 (reduction action and Ledger C wiring): reduceProductionAsset function applies copy-on-write reduction of production_volume with immediate Ledger B delta (−Δvolume × rate × share) and Ledger A delta (−Δvolume × advalorem_rate_per_unit). Ledger C logic added: mineral_av_change = assessed_delta_per_unit × Δvolume, mineral_frac_change = mineral_av_change / assessed_mineral_baseline, ledger_c_delta = sf_net_total × sf_mineral_share × mineral_frac_change. For a −10M ton reduction: Ledger A −$12,630,200, Ledger B −$5,066,642, Ledger C +$1,514,491 (positive — recapture burden shrinks as mineral value falls). This is the decoupling mechanic working correctly and the X-track's primary demo moment.
Golden E (existing asset inventory, live_count: 6, excluded_count: 2) and Golden F (Campbell −10M ton reduction, all three ledger deltas asserted) are frozen. 52/52 parity tests passing, Golden A–D digests byte-identical.
X3 — Remaining work (UI control)
The one remaining session in this track. Engine and data are complete; only the player-facing control needs to be built.
Scope: Add a "Reduce output" affordance to the Flagship Assets section of the county card for any existing_assets entry of type production_asset. The control (slider or stepper) caps magnitude at the entry's current remaining production_volume — a new validation path, since every other action only adds. Impact preview mirrors the W4 placement modal pattern (Δ jobs, Δ property tax / severance, Δ school finance net). Confirm the 💰 Revenue chip's signed-ledger breakdown updates correctly after reduction fires: Ledger A and B falling, Ledger C's recapture burden shrinking. Surface existing baseline employment from production_asset entries in the Jobs yield as a clearly labeled baseline figure, separate from the player-delta number.
Handoff condition: queue a Campbell coal reduction end-to-end (asset row → impact preview → confirm → commission → revenue chip reflects Golden F's directions) with no console errors.

Part 3 — Outstanding Debt and Future Phase Flags
Debt carried from W0–W4
ItemSeverityNotessrc/App.tsx is dead codeLowShould be deleted; currently harmlessWater withdrawals null for all 157 countiesLowUSGS spreadsheet manual download; display field onlyBEA per_capita_income is ACS proxyLowFlagged; sufficient disclosureOracle panel is placeholderLowE4ST loop-closure; Phase 6HALEU 5000 kg/Natrium needs peer-reviewed citationMediumMethods integrity; noted as dissertation debtSchool finance foundation net transfer (WY LSO tables)MediumLedger C currently uses 37-mill proxy; real foundation/recapture mechanism requires WY LSO dataadvalorem_rate_per_unit for PRB Coal Mines uses 90% coal-fraction proxyLow-Mediumconfidence: low; promoted to high when DOR Mineral Valuation Report resolves
Recommended Phase Y — Non-Coal Mineral Assets (future, gated on data)
The production_asset schema is general but is currently seeded only for Campbell coal. Three other major Wyoming mineral revenue categories — Sweetwater trona, Sublette/Natrona/Park oil and gas, Fremont uranium — would require: new county_cards entries, new coefficient blocks in wy_fiscal_coefficients.json, and county-level production volumes that do not currently exist in any project file.
Phase Y is explicitly gated on MANUAL_FETCH Item 1 (DOR Mineral Valuation Report, per-county commodity split). Until that table is resolved, per-county trona, oil, and gas distribution shares cannot be derived and no production_asset entries for those commodities can carry better than confidence: low. Do not start Phase Y without first resolving Item 1. EIA-7A coal data (already pulled, confidence: high) should be used as the model for what Phase Y data sourcing needs to deliver for other commodities.
Recommended next roadmap phase: W5 (Participant Instruments)
The W-roadmap's W5 (participant session mode, annotation at auto-pause, session config file) and W6 (facilitator dashboard) remain unbuilt. These were scoped after W4 in the original roadmap dependency table and remain valid next steps. W5 reads from the yields strip and county fiscal state, both now complete and accurate; starting W5 after X3 closes is the correct sequencing.

Digest Registry Update
ArtifactTypeMD5data/golden/golden_a.jsonfixture filee80a483d16655d4f938680cd2243f2f1data/golden/golden_b.jsonfixture file70f9e5a52a811a11dcf771bf795fb567data/golden/golden_c.jsonfixture filec3013034b58a87f3ea77f45b47392ad9Golden Afinal state digest (TS)4a838c7070d55d3487d8f3ecbc529220Golden Bfinal state digest (TS, no events)716b189a8fee6757643818b15cd72541Golden Cfinal state digest (TS)997753927c570e929fe5d9930fe64e0dGolden Breplay digest (with Naughton 2026 event)a63401e30494a3da03e85817c3f42ba7Golden EEA digest94dccfec7f204e7a44b93dc777a51623Golden Ffiscal digest (after Campbell −10M ton reduction)see golden_f.json
Note on two Golden B digests: 716b189a... is the pure engine parity contract (Vitest suite, no events). a63401e3... is what a real playthrough produces when the Naughton 2026 deterministic event fires during replay. Both are correct; divergence always indicates a code bug, never a fixture bug.

Five-Scale Doctrine (unchanged — carry into every new session)

The county is the unit of analysis and governance.
The bus is the unit of energy system intervention.
The tract is the unit of social measurement.
The ecoregion is the unit of ecological suitability.
The material ledger is the unit of honesty.
The county fiscal ledger is the unit of local consequence.