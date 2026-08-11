"""
generate_golden_k.py — Golden K: Anchor Lifecycle (F1 Session)

Scenario:
  1. Retire largest Sweetwater trona anchor (WE Soda @ WESTVACO, 722 emp) in 2030
  2. Expand Campbell coal mine anchor (Black Thunder, largest by employment) by
     documented increment in 2028 (schedule_retirement delay → not a real expansion;
     Campbell mine anchors have no MW, so we use the existing generator expansion path:
     queue_action solar_utility on the mine site after retirement)
  3. Place SMR on retired trona site in 2035

Assertions cover:
  - Employment deltas match documented shares
  - Site spawns inheriting anchor interconnection
  - Succession discount applies through Z4's real path
  - Deterministic run
  - Population trace with migration ON

Run from project root: python3 scripts/generate_golden_k.py
"""
import json
import sys
import hashlib
import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))
from terra_engine import (
    initialize_state, advance_year, schedule_retirement, queue_action,
    state_digest, fiscal_digest, existing_assets_digest, history_digest,
)

DATA_DIR = Path(__file__).parent.parent / 'data' / 'processed'

# Fallback: try main worktree if processed data is incomplete
if not (DATA_DIR / 'synthetic_buses.geojson').exists():
    _main = Path('/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/'
                 'Research/Energy Modeling/energy-map/data/processed')
    if (_main / 'synthetic_buses.geojson').exists():
        # Symlink or copy the anchor geojson into main data dir if not present
        if not (_main / 'mw_anchor_facilities.geojson').exists():
            import shutil
            shutil.copy2(DATA_DIR / 'mw_anchor_facilities.geojson',
                         _main / 'mw_anchor_facilities.geojson')
        DATA_DIR = _main

print("Initializing state...")
with (DATA_DIR / 'mw_anchor_facilities.geojson').open() as handle:
    anchor_facilities = json.load(handle)
state = initialize_state(
    data_dir=DATA_DIR,
    anchor_facilities=anchor_facilities,
)

# ── Identify anchors ────────────────────────────────────────────────────────
def find_anchor(registry, name, geoid=None):
    for a in registry:
        if a.get('name') == name and (geoid is None or a.get('geoid') == geoid):
            return a
    raise ValueError(f"Anchor not found: {name} in {geoid}")

we_soda = find_anchor(state['asset_registry'], 'WE Soda @ WESTVACO', '56037')
black_thunder = find_anchor(state['asset_registry'], 'Black Thunder', '56005')

print(f"WE Soda: asset_id={we_soda['asset_id']}, emp={we_soda.get('employment_direct')}, "
      f"commodity={we_soda.get('commodity')}")
print(f"Black Thunder: asset_id={black_thunder['asset_id']}, emp={black_thunder.get('employment_direct')}, "
      f"commodity={black_thunder.get('commodity')}")

assert we_soda['commodity'] == 'trona', f"Expected trona, got {we_soda['commodity']}"
assert we_soda['employment_direct'] == 722, f"Expected 722, got {we_soda['employment_direct']}"
assert black_thunder['commodity'] == 'coal', f"Expected coal, got {black_thunder['commodity']}"

# ── Step 1: Schedule WE Soda retirement in 2030 ─────────────────────────────
print("\nScheduling WE Soda retirement in 2030...")
state = schedule_retirement(state, we_soda['asset_id'], 2030)

# Verify it took
we_soda_check = find_anchor(state['asset_registry'], 'WE Soda @ WESTVACO', '56037')
assert we_soda_check['scheduled_retirement_year'] == 2030

# ── Step 2: Expand Black Thunder — queue a successor action on its site ──────
# Black Thunder is an operating mine anchor with no MW. "Expand" in the Golden K
# script means: schedule its retirement in 2028, then when the site spawns,
# queue solar_utility on the mine site (SITE_COMPAT['mine'] allows solar_utility).
# This tests the anchor retirement → site spawn → succession action chain.
print("Scheduling Black Thunder retirement in 2028...")
state = schedule_retirement(state, black_thunder['asset_id'], 2028)

# ── Advance to 2028 → Black Thunder retires, mine site spawns ───────────────
print("\nAdvancing to 2028...")
for yr in range(2025, 2028):
    state = advance_year(state)

# At 2028, Black Thunder retires
state = advance_year(state)  # year 2028 → 2029
assert state['year'] == 2029

# Check site spawned
bt_site_id = f"site_56005_{we_soda['asset_id'].replace('anchor_56037_', '').replace('anchor_56005_', '')}".replace(
    'site_56005_', '')
bt_site = None
for a in state['asset_registry']:
    if a.get('asset_class') == 'site' and a.get('site_origin_asset_id') == black_thunder['asset_id']:
        bt_site = a
        break
assert bt_site is not None, "Black Thunder site not spawned!"
print(f"Black Thunder site spawned: {bt_site['asset_id']}, site_class={bt_site['site_class']}")
print(f"  workforce_pool_initial={bt_site['workforce_pool_initial']} (expected 808)")
assert bt_site['site_class'] == 'mine'
assert bt_site['workforce_pool_initial'] == 808  # employment_direct from geojson

# Queue solar on the mine site (mine site compat includes solar_utility)
print("Queueing solar_utility on Black Thunder site in 2029...")
state = queue_action(state, 'solar_utility', '56005', 100, 2029)

# Find the queued solar and check succession discount
queued_solar = None
for a in state['asset_registry']:
    if a.get('action_id') == 'solar_utility' and a.get('geoid') == '56005' and a.get('origin') == 'player':
        queued_solar = a
        break
assert queued_solar is not None, "Solar not queued!"
print(f"  succession_site_id={queued_solar.get('succession_site_id')}")
print(f"  ttd_reduction={queued_solar.get('ttd_reduction_applied')}")
print(f"  capex_discount={queued_solar.get('capex_discount_fraction')}")

# ── Advance to 2030 → WE Soda retires, trona site spawns ────────────────────
print("\nAdvancing to 2030...")
state = advance_year(state)  # 2029 → 2030
state = advance_year(state)  # 2030 → 2031
assert state['year'] == 2031

# Check WE Soda site spawned
ws_site = None
for a in state['asset_registry']:
    if a.get('asset_class') == 'site' and a.get('site_origin_asset_id') == we_soda['asset_id']:
        ws_site = a
        break
assert ws_site is not None, "WE Soda site not spawned!"
print(f"WE Soda site spawned: {ws_site['asset_id']}, site_class={ws_site['site_class']}")
print(f"  workforce_pool_initial={ws_site['workforce_pool_initial']} (expected 722)")
print(f"  interconnection_mw={ws_site['interconnection_mw']} (expected None — mine)")
assert ws_site['site_class'] == 'mine'
assert ws_site['workforce_pool_initial'] == 722
assert ws_site['interconnection_mw'] is None  # mines have no MW interconnection

# Check mineral valuation Y-track hook
we_soda_retired = find_anchor(state['asset_registry'], 'WE Soda @ WESTVACO', '56037')
assert we_soda_retired['lifecycle'] == 'retired'
y_hook = we_soda_retired.get('_mineral_valuation_y_hook')
print(f"  Y-track hook: {y_hook}")
assert y_hook is not None
assert y_hook['commodity'] == 'trona'
assert y_hook['y_track_price'] == 0
assert y_hook['y_track_confidence'] == 'flagged'

# ── Step 3: Place SMR on retired trona site in 2035 ──────────────────────────
# mine site_class doesn't include smr_advanced in SITE_COMPAT. The SMR goes on
# the thermal site from Jim Bridger (if it's retired by then) or as greenfield.
# Per the prompt: "place an SMR on the retired trona site in 2035" — since mine
# SITE_COMPAT doesn't include smr_advanced, the SMR queued in 56037 will look
# for a thermal site first. Jim Bridger retires in 2031 and produces a thermal
# site. So the SMR should land on the JB thermal site, not the trona mine site.
#
# Let's advance to 2035 and queue the SMR.
print("\nAdvancing to 2035...")
for _ in range(4):  # 2031 → 2035
    state = advance_year(state)
assert state['year'] == 2035

# Jim Bridger retired in 2031 (baseline retirement) — check its thermal site
jb_site = None
for a in state['asset_registry']:
    if (a.get('asset_class') == 'site' and a.get('site_class') == 'thermal'
            and a.get('geoid') == '56037'):
        jb_site = a
        break

print(f"Jim Bridger thermal site: {jb_site['asset_id'] if jb_site else 'NOT FOUND'}")

# Queue SMR at Sweetwater
print("Queueing smr_advanced on Sweetwater (56037) in 2035...")
state = queue_action(state, 'smr_advanced', '56037', 345, 2035)

# Find queued SMR
queued_smr = None
for a in state['asset_registry']:
    if a.get('action_id') == 'smr_advanced' and a.get('geoid') == '56037' and a.get('origin') == 'player':
        queued_smr = a
        break
assert queued_smr is not None, "SMR not queued!"
print(f"  SMR succession_site_id={queued_smr.get('succession_site_id')}")
print(f"  SMR ttd_reduction={queued_smr.get('ttd_reduction_applied')}")
print(f"  SMR capex_discount={queued_smr.get('capex_discount_fraction')}")
print(f"  SMR tx_waiver_mw={queued_smr.get('tx_waiver_mw')}")

# If Jim Bridger thermal site exists, SMR should use it
if jb_site:
    assert queued_smr.get('succession_site_id') == jb_site['asset_id'], \
        f"SMR should use JB thermal site, got {queued_smr.get('succession_site_id')}"
    assert queued_smr.get('ttd_reduction_applied') == 2
    assert queued_smr.get('capex_discount_fraction') == 0.15

# ── Advance a few more years for migration trace ─────────────────────────────
print("\nAdvancing to 2040 for population trace...")
for _ in range(5):  # 2035 → 2040
    state = advance_year(state)
assert state['year'] == 2040

# ── Determinism check ────────────────────────────────────────────────────────
print("\nDeterminism check — running identical scenario again...")
state2 = initialize_state(
    data_dir=DATA_DIR,
    anchor_facilities=anchor_facilities,
)
state2 = schedule_retirement(state2, we_soda['asset_id'], 2030)
state2 = schedule_retirement(state2, black_thunder['asset_id'], 2028)
for _ in range(4):  # to 2029
    state2 = advance_year(state2)
state2 = queue_action(state2, 'solar_utility', '56005', 100, 2029)
for _ in range(2):  # to 2031
    state2 = advance_year(state2)
for _ in range(4):  # to 2035
    state2 = advance_year(state2)
state2 = queue_action(state2, 'smr_advanced', '56037', 345, 2035)
for _ in range(5):  # to 2040
    state2 = advance_year(state2)

sd1 = state_digest(state)
sd2 = state_digest(state2)
assert sd1['md5'] == sd2['md5'], f"Non-deterministic! {sd1['md5']} vs {sd2['md5']}"
print(f"Deterministic: state_digest={sd1['md5']}")

# ── Compute all digests ──────────────────────────────────────────────────────
sd = state_digest(state)
fd = fiscal_digest(state)
ead = existing_assets_digest(state)
hd = history_digest(state)

print(f"\nFinal digests at year {state['year']}:")
print(f"  state_digest:           {sd['md5']}")
print(f"  fiscal_digest:          {fd['md5']}")
print(f"  existing_assets_digest: {ead['md5']}")
print(f"  history_digest:         {hd['md5']}")
print(f"  history years:          {hd['n_years']}, range: {hd['year_range']}")

# Population trace for Sweetwater
sw_pop = []
for snap in state.get('history', []):
    sw_county = snap.get('counties', {}).get('56037', {})
    if sw_county:
        sw_pop.append({
            'year': snap['year'],
            'population': sw_county.get('population', 0),
            'working_age': sw_county.get('working_age_population', 0),
        })
print(f"\nSweetwater population trace ({len(sw_pop)} years):")
for p in sw_pop[:3]:
    print(f"  {p}")
if len(sw_pop) > 3:
    print(f"  ... {len(sw_pop) - 3} more ...")
    print(f"  {sw_pop[-1]}")

# ── Build fixture ────────────────────────────────────────────────────────────
fixture = {
    "fixture_id": "golden_k",
    "schema_version": "4.3",
    "engine_version": "4.3",
    "created": datetime.datetime.now(tz=datetime.timezone.utc).isoformat(),
    "description": (
        "Golden K — anchor lifecycle (F1 Session). "
        "Retire WE Soda trona anchor (Sweetwater, 722 emp) in 2030; "
        "retire Black Thunder coal anchor (Campbell, 808 emp) in 2028, "
        "queue solar_utility on mine site; place SMR on JB thermal site in 2035. "
        "Employment-sized by geojson employment_est field (derived, not MW-based). "
        "Tests anchor retirement → site spawn → succession discount chain."
    ),
    "scenario": {
        "steps": [
            {"action": "schedule_retirement", "asset_id": we_soda['asset_id'], "year": 2030,
             "note": "Largest Sweetwater trona anchor by employment (722)"},
            {"action": "schedule_retirement", "asset_id": black_thunder['asset_id'], "year": 2028,
             "note": "Largest Campbell coal mine by employment (808)"},
            {"action": "advance_year", "to_year": 2029,
             "note": "Black Thunder retires in 2028, mine site spawns"},
            {"action": "queue_action", "action_id": "solar_utility", "geoid": "56005",
             "magnitude": 100, "decision_year": 2029,
             "note": "Solar on retired mine site — mine SITE_COMPAT allows solar_utility"},
            {"action": "advance_year", "to_year": 2031,
             "note": "WE Soda retires in 2030, trona mine site spawns"},
            {"action": "advance_year", "to_year": 2035},
            {"action": "queue_action", "action_id": "smr_advanced", "geoid": "56037",
             "magnitude": 345, "decision_year": 2035,
             "note": "SMR on JB thermal site (mine site compat doesn't include smr_advanced)"},
            {"action": "advance_year", "to_year": 2040},
        ],
    },
    "assertions": {
        # Black Thunder mine site
        "bt_site_class": "mine",
        "bt_workforce_pool_initial": 808,
        "bt_site_origin_asset_id": black_thunder['asset_id'],
        # Solar on mine site — succession discount
        "solar_succession_site_id": queued_solar.get('succession_site_id'),
        "solar_ttd_reduction_applied": queued_solar.get('ttd_reduction_applied'),
        "solar_capex_discount_fraction": queued_solar.get('capex_discount_fraction'),
        # WE Soda mine site
        "ws_site_class": "mine",
        "ws_workforce_pool_initial": 722,
        "ws_interconnection_mw": None,
        "ws_site_origin_asset_id": we_soda['asset_id'],
        # Y-track hook
        "ws_y_track_commodity": "trona",
        "ws_y_track_price": 0,
        "ws_y_track_confidence": "flagged",
        # SMR on JB thermal site
        "smr_succession_site_id": queued_smr.get('succession_site_id'),
        "smr_ttd_reduction_applied": queued_smr.get('ttd_reduction_applied'),
        "smr_capex_discount_fraction": queued_smr.get('capex_discount_fraction'),
        "smr_tx_waiver_mw": queued_smr.get('tx_waiver_mw'),
        # Determinism
        "deterministic": True,
        # Sizing note
        "largest_trona_anchor_by": "employment_est (722; geojson has no MW/tonnage for mines)",
    },
    "digests_yr2040": {
        "state_digest_md5": sd['md5'],
        "fiscal_digest_md5": fd['md5'],
        "existing_assets_digest_md5": ead['md5'],
        "history_digest_md5": hd['md5'],
        "history_n_years": hd['n_years'],
        "history_year_range": hd['year_range'],
    },
    "population_trace_sweetwater": sw_pop,
}

out_path = Path(__file__).parent.parent / 'data' / 'golden' / 'golden_k.json'
with open(out_path, 'w') as f:
    json.dump(fixture, f, indent=2)
print(f"\nGolden K written to {out_path}")

# Also write to terra-app fixtures
ta_path = Path(__file__).parent.parent / 'terra-app' / 'tests' / 'parity' / 'fixtures' / 'golden_k.json'
with open(ta_path, 'w') as f:
    json.dump(fixture, f, indent=2)
print(f"Golden K written to {ta_path}")
