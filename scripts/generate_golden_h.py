"""
Generate Golden H fixture — Lincoln County Kemmerer boomtown scenario.
2026-2034 playthrough; Player A (no actions) vs Player B (retrofit + new-build).

Lincoln County FIPS: 56023
TerraPower Kemmerer: 345 MW nuclear SMR, operational_year=2030 (queued 2026)

Run from repo root:
    python scripts/generate_golden_h.py
"""
import sys
import json
import hashlib
import copy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from terra_engine import (
    initialize_state,
    queue_action,
    apply_action,
    advance_year,
    state_digest,
    fiscal_digest,
    existing_assets_digest,
)

DATA_DIR    = Path(__file__).parent.parent / "data" / "processed"
TS_DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"
OUT_DIR     = Path(__file__).parent.parent / "terra-app" / "tests" / "parity" / "fixtures"
REG_PATH    = Path(__file__).parent.parent / "data" / "golden" / "fixture_registry.json"

LINCOLN_GEOID = "56023"
START_YEAR    = 2025
END_YEAR      = 2034   # inclusive; scenario runs 2026-2034 (9 advance_year calls)

def md5_digest(digest_obj):
    """Extract md5 from a TERRA digest object (state_digest / fiscal_digest / existing_assets_digest).
    These functions already compute and embed the md5 under the 'md5' key — extract it directly
    rather than re-hashing the outer dict (which would include the 'md5' key itself).
    """
    return digest_obj['md5']


def build_base_state():
    """Initialize state with retirements + lifecycle coefficients + housing baseline."""
    retirements_raw = json.loads((TS_DATA_DIR / "baseline_retirements.json").read_text())
    retirements = {k: v for k, v in retirements_raw.items() if k != "_meta"}
    return initialize_state(
        data_dir=DATA_DIR,
        baseline_retirements=retirements,
    )


def run_player_a(base_state):
    """Player A: no actions — just advance from 2025 to 2034."""
    state = copy.deepcopy(base_state)
    for _ in range(END_YEAR - START_YEAR):
        state = advance_year(state)
    assert state["year"] == END_YEAR, f"Expected year {END_YEAR}, got {state['year']}"
    return state


def run_player_b(base_state):
    """
    Player B:
      1. Queue TerraPower Kemmerer (345 MW nuclear) decision_year=2026, op_year=2030
      2. Apply housing_retrofit_affordable (300 units) in Lincoln County, decision_year=2026
      3. Queue affordable_housing (100 units) in Lincoln County, decision_year=2026, op_year=2027
      4. Advance 2026→2034
    """
    state = copy.deepcopy(base_state)

    # Advance to 2026 first (1 year)
    state = advance_year(state)
    assert state["year"] == 2026

    # Queue Kemmerer SMR — magnitude in MW
    state = queue_action(state, "smr_advanced", LINCOLN_GEOID, 345, decision_year=2026,
                         override_operational_year=2030)

    # Retrofit affordable housing (consume convertible units)
    state, _ = apply_action(state, "housing_retrofit_affordable", LINCOLN_GEOID, 300)

    # Queue new affordable housing build
    state = queue_action(state, "affordable_housing", LINCOLN_GEOID, 100, decision_year=2026,
                         override_operational_year=2027)

    # Advance 2027→2034
    for _ in range(END_YEAR - 2026):
        state = advance_year(state)

    assert state["year"] == END_YEAR, f"Expected year {END_YEAR}, got {state['year']}"
    return state


def extract_lincoln_housing(state):
    """Pull housing fields for Lincoln County from asset_registry."""
    for a in state["asset_registry"]:
        if a.get("asset_class") == "housing_stock" and a.get("geoid") == LINCOLN_GEOID:
            return {k: v for k, v in a.items() if k.startswith("housing_")}
    return {}


def main():
    print("Building base state (with retirements + lifecycle + housing)...")
    base = build_base_state()
    assert base["year"] == START_YEAR

    print("Running Player A (no actions)...")
    state_a = run_player_a(base)

    print("Running Player B (retrofit + new-build)...")
    state_b = run_player_b(base)

    # ── Digests ────────────────────────────────────────────────────────────────
    sd_a   = state_digest(state_a)
    sd_b   = state_digest(state_b)
    fd_a   = fiscal_digest(state_a)
    fd_b   = fiscal_digest(state_b)
    ead_a  = existing_assets_digest(state_a)
    ead_b  = existing_assets_digest(state_b)

    housing_a = extract_lincoln_housing(state_a)
    housing_b = extract_lincoln_housing(state_b)

    # Lincoln County EES
    ees_a = state_a["county_ees"].get(LINCOLN_GEOID, {})
    ees_b = state_b["county_ees"].get(LINCOLN_GEOID, {})

    # Lincoln County fiscal
    cf_a = state_a.get("county_fiscal", {}).get(LINCOLN_GEOID, {})
    cf_b = state_b.get("county_fiscal", {}).get(LINCOLN_GEOID, {})

    fixture = {
        "_meta": {
            "golden": "H",
            "description": "Lincoln County Kemmerer boomtown 2026-2034: Player A (no actions) vs Player B (housing retrofit + new-build)",
            "lincoln_geoid": LINCOLN_GEOID,
            "start_year": START_YEAR,
            "end_year": END_YEAR,
            "player_b_actions": [
                "smr_advanced 345 MW queued 2026 op_year=2030",
                "housing_retrofit_affordable 300 units applied 2026",
                "affordable_housing 100 units queued 2026 op_year=2027",
            ],
        },
        "player_a": {
            "state_digest":          sd_a,
            "state_digest_md5":      md5_digest(sd_a),
            "fiscal_digest":         fd_a,
            "fiscal_digest_md5":     md5_digest(fd_a),
            "existing_assets_digest":     ead_a,
            "existing_assets_digest_md5": md5_digest(ead_a),
            "lincoln_ees":    {k: round(float(v), 6) for k, v in ees_a.items()
                               if k in ("E", "Ec", "S")},
            "lincoln_housing": housing_a,
            "lincoln_fiscal":  {k: float(v) for k, v in cf_a.items()
                                if isinstance(v, (int, float))},
        },
        "player_b": {
            "state_digest":          sd_b,
            "state_digest_md5":      md5_digest(sd_b),
            "fiscal_digest":         fd_b,
            "fiscal_digest_md5":     md5_digest(fd_b),
            "existing_assets_digest":     ead_b,
            "existing_assets_digest_md5": md5_digest(ead_b),
            "lincoln_ees":    {k: round(float(v), 6) for k, v in ees_b.items()
                               if k in ("E", "Ec", "S")},
            "lincoln_housing": housing_b,
            "lincoln_fiscal":  {k: float(v) for k, v in cf_b.items()
                                if isinstance(v, (int, float))},
        },
    }

    out_path = OUT_DIR / "golden_h.json"
    out_path.write_text(json.dumps(fixture, indent=2, sort_keys=True))
    print(f"Wrote {out_path}")

    # ── Print summary ─────────────────────────────────────────────────────────
    print("\n── Golden H Summary ──────────────────────────────────────────────")
    print(f"  Player A state_digest_md5:  {fixture['player_a']['state_digest_md5']}")
    print(f"  Player B state_digest_md5:  {fixture['player_b']['state_digest_md5']}")
    print(f"  Player A fiscal_digest_md5: {fixture['player_a']['fiscal_digest_md5']}")
    print(f"  Player B fiscal_digest_md5: {fixture['player_b']['fiscal_digest_md5']}")
    print(f"\n  Lincoln EES Player A:  {fixture['player_a']['lincoln_ees']}")
    print(f"  Lincoln EES Player B:  {fixture['player_b']['lincoln_ees']}")
    print(f"\n  Lincoln Housing A:")
    for k, v in housing_a.items():
        print(f"    {k}: {v}")
    print(f"\n  Lincoln Housing B:")
    for k, v in housing_b.items():
        print(f"    {k}: {v}")
    print(f"\n  Lincoln Fiscal B (assessed_residential): {cf_b.get('assessed_residential')}")
    print(f"  Lincoln Fiscal B (property_tax):          {cf_b.get('property_tax')}")

    # ── Update fixture registry ────────────────────────────────────────────────
    reg = json.loads(REG_PATH.read_text())
    entries = reg.get("fixtures", [])
    # Remove any prior Golden H entry
    entries = [e for e in entries if e.get("golden") != "H"]
    entries.append({
        "golden": "H",
        "file": "golden_h.json",
        "description": "Lincoln County Kemmerer boomtown 2026-2034",
        "state_digest_md5_a": fixture["player_a"]["state_digest_md5"],
        "state_digest_md5_b": fixture["player_b"]["state_digest_md5"],
    })
    reg["fixtures"] = entries
    REG_PATH.write_text(json.dumps(reg, indent=2))
    print(f"\nUpdated fixture registry at {REG_PATH}")


if __name__ == "__main__":
    main()
