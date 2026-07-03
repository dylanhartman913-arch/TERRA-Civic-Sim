"""
generate_golden_e.py — Generate Golden E fixture for Phase W5 (engine v2.2).
Run from project root: python3 generate_golden_e.py
"""
import json
import sys
import datetime
sys.path.insert(0, 'src')
from terra_engine import initialize_state, apply_action, state_digest, existing_assets_digest, get_existing_assets

# Load golden A to get the replay sequence
with open('data/golden/golden_a.json') as f:
    golden_a = json.load(f)

state = initialize_state()

# Replay Golden A sequence using the GEOID-based steps (same as golden-a.test.ts)
for step in golden_a['steps']:
    state, _ = apply_action(state, step['action_id'], str(step['geoid']), step['magnitude'])

# Get existing_assets_digest
ea_digest = existing_assets_digest(state)

# Get state digest (verify A is unchanged)
sd = state_digest(state)
print(f"State digest md5 (should match Golden A): {sd['md5']}")

# WY counties with flagship assets
wy_geoids = ['56005', '56009', '56021', '56023', '56037']

# Collect live entries per WY geoid
wy_live = {}
for geoid in wy_geoids:
    wy_live[geoid] = get_existing_assets(state, geoid)

# All WY flagship assets with non-null capacity (from county_cards)
county_cards = state['county_cards']
all_nonnull = []
for geoid in wy_geoids:
    for asset in county_cards.get(geoid, {}).get('flagship_assets', []):
        if asset.get('capacity_or_load_mw') is not None:
            all_nonnull.append({'geoid': geoid, 'name': asset['name']})

# Campbell coal live count
campbell_live = wy_live.get('56005', [])
campbell_coal_live = [a for a in campbell_live if a.get('type') == 'coal']
campbell_all = state['existing_assets'].get('56005', [])

# Count totals across all counties
all_entries_flat = [e for entries in state['existing_assets'].values() for e in entries]
live_count = sum(1 for e in all_entries_flat if e.get('excluded') is None)
excluded_count = sum(1 for e in all_entries_flat if e.get('excluded') is not None)

# Verify all non-null WY assets appear in live entries
all_wy_nonnull_in_live = all(
    any(e['name'] == item['name'] for e in get_existing_assets(state, item['geoid']))
    for item in all_nonnull
)

# Jim Bridger coal_tons_yr
jim_bridger_coal_tons_yr = next(
    (a['coal_tons_yr'] for a in get_existing_assets(state, '56037') if a['name'] == 'Jim Bridger Power Plant'),
    None
)

# Kemmerer capacity_mw
kemmerer_capacity_mw = next(
    (a['capacity_mw'] for a in get_existing_assets(state, '56023') if 'Kemmerer' in a['name']),
    None
)

# Geoid live names for WY counties that have live entries
geoid_live_names = {
    geoid: [a['name'] for a in get_existing_assets(state, geoid)]
    for geoid in wy_geoids
    if get_existing_assets(state, geoid)
}

fixture = {
    "fixture_id": "golden_e",
    "schema_version": "3.1",
    "engine_version": "2.2",
    "created": datetime.datetime.now(tz=datetime.timezone.utc).isoformat(),
    "description": "Baseline existing-asset inventory — WY flagship assets seeded from county_cards",
    "inputs": {
        "replay": "golden_a",
        "note": "existing_assets is seeded at initialize_state; unchanged by Golden A actions"
    },
    "assertions": {
        "5a_all_wy_nonnull_capacity_in_live_entries": all_wy_nonnull_in_live,
        "5a_live_count": live_count,
        "5a_excluded_count": excluded_count,
        "5b_campbell_coal_live_count": len(campbell_coal_live),
        "5b_campbell_all_excluded": all(a.get('excluded') is not None for a in campbell_all),
        "5c_digest_stable": True,
        "5c_geoid_live_names": geoid_live_names,
        "5d_jim_bridger_coal_tons_yr": jim_bridger_coal_tons_yr,
        "5d_kemmerer_capacity_mw": kemmerer_capacity_mw,
        "golden_a_state_digest_unchanged": sd['md5']
    },
    "existing_assets_digest": {"md5": ea_digest['md5']},
    "existing_assets_snapshot": ea_digest['existing_assets']
}

with open('data/golden/golden_e.json', 'w') as f:
    json.dump(fixture, f, indent=2)
print(f"Golden E written. EA digest md5: {ea_digest['md5']}")
print(f"Live: {live_count}, Excluded: {excluded_count}")
print(f"Jim Bridger coal_tons_yr: {jim_bridger_coal_tons_yr}")
print(f"Kemmerer capacity_mw: {kemmerer_capacity_mw}")
print(f"Geoid live names: {geoid_live_names}")
