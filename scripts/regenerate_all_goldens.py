"""
Regenerate digest values in all golden fixtures using the current EES baseline.

Handles: D, E, F, G, G', I, J, J', L, M, N
(A, B, C are handled by nb16; H by generate_golden_h.py; K by generate_golden_k.py)

Run from repo root:
    python scripts/regenerate_all_goldens.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "tests"))

import terra_engine as te
from c4i_contract_matrix import replay_fixture

FIXTURE_DIR = ROOT / "terra-app" / "tests" / "parity" / "fixtures"
DATA_GOLDEN = ROOT / "data" / "golden"


def digests(state, lens=None):
    sd = te.state_digest(state, climate_lens=lens if lens and lens != "historical" else None)
    fd = te.fiscal_digest(state)
    ead = te.existing_assets_digest(state)
    hd = te.history_digest(state)
    return {
        "state": sd["md5"],
        "fiscal": fd["md5"],
        "ea": ead["md5"],
        "history": hd["md5"],
        "history_n_years": hd["n_years"],
        "history_year_range": hd["year_range"],
    }


def load_fixture(name):
    path = FIXTURE_DIR / f"{name}.json"
    return json.loads(path.read_text())


def save_fixture(name, data, also_data_golden=False):
    path = FIXTURE_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")
    print(f"  Wrote {path}")
    if also_data_golden:
        dg_path = DATA_GOLDEN / f"{name}.json"
        if dg_path.exists():
            dg_path.write_text(json.dumps(data, indent=2, default=str) + "\n")
            print(f"  Wrote {dg_path}")


CLIMATE_HIST = {"lens": "historical", "tables": {}}


def regen_d():
    print("\n=== Golden D ===")
    fixture = load_fixture("golden_d")
    state = replay_fixture("golden_d", CLIMATE_HIST, False)
    sd = te.state_digest(state)
    fd = te.fiscal_digest(state)

    old_sd = fixture["final_state_digest"]["md5"]
    old_fd = fixture["final_fiscal_digest"]["md5"]
    print(f"  state_digest: {old_sd} -> {sd['md5']}")
    print(f"  fiscal_digest: {old_fd} -> {fd['md5']}")

    fixture["final_state_digest"] = sd
    fixture["final_fiscal_digest"] = fd
    save_fixture("golden_d", fixture, also_data_golden=True)


def regen_e():
    print("\n=== Golden E ===")
    fixture = load_fixture("golden_e")
    state = replay_fixture("golden_e", CLIMATE_HIST, False)
    ead = te.existing_assets_digest(state)

    # Also need the new golden_a state_digest for the cross-reference assertion
    new_a = load_fixture("golden_a")
    new_a_md5 = new_a["final_state_digest"]["md5"]

    old_ead = fixture["existing_assets_digest"]["md5"]
    old_a_ref = fixture["assertions"]["golden_a_state_digest_unchanged"]
    print(f"  existing_assets_digest: {old_ead} -> {ead['md5']}")
    print(f"  golden_a_state_digest_unchanged: {old_a_ref} -> {new_a_md5}")

    fixture["existing_assets_digest"] = ead
    fixture["assertions"]["golden_a_state_digest_unchanged"] = new_a_md5
    save_fixture("golden_e", fixture, also_data_golden=True)


def regen_f():
    print("\n=== Golden F ===")
    fixture = load_fixture("golden_f")
    # F: reduce_production_asset scenario
    # Need before and after states
    state_before = replay_fixture("golden_e", CLIMATE_HIST, False)  # baseline state
    fd_before = te.fiscal_digest(state_before)
    ead_before = te.existing_assets_digest(state_before)

    state_after = replay_fixture("golden_f", CLIMATE_HIST, False)
    fd_after = te.fiscal_digest(state_after)
    ead_after = te.existing_assets_digest(state_after)

    print(f"  before fiscal: {fixture['digests_before']['fiscal_digest_md5']} -> {fd_before['md5']}")
    print(f"  before ea:     {fixture['digests_before']['existing_assets_digest_md5']} -> {ead_before['md5']}")
    print(f"  after fiscal:  {fixture['digests_after']['fiscal_digest_md5']} -> {fd_after['md5']}")
    print(f"  after ea:      {fixture['digests_after']['existing_assets_digest_md5']} -> {ead_after['md5']}")

    fixture["digests_before"]["fiscal_digest_md5"] = fd_before["md5"]
    fixture["digests_before"]["existing_assets_digest_md5"] = ead_before["md5"]
    fixture["digests_after"]["fiscal_digest_md5"] = fd_after["md5"]
    fixture["digests_after"]["existing_assets_digest_md5"] = ead_after["md5"]
    save_fixture("golden_f", fixture, also_data_golden=True)


def _regen_multi_year(name, years, also_data_golden=False):
    print(f"\n=== Golden {name.replace('golden_', '').upper()} ===")
    fixture = load_fixture(name)
    # These fixtures need intermediate digests at specific years
    # replay_fixture runs to final year; we need to run year-by-year
    # Use the c4i_contract_matrix replay to get the final state, but
    # we also need intermediate stops

    # For G/G': need yr2027, yr2031, yr2045
    # For I: need yr2031, yr2041
    # Replay manually to each checkpoint
    from c4i_contract_matrix import _initial, _advance
    migration = False

    if name in ("golden_g", "golden_g_prime"):
        state = _initial(True, migration)
        for yr in years:
            state_at_yr = _advance(state, yr, CLIMATE_HIST)
            d = digests(state_at_yr)
            key = f"digests_yr{yr}"
            old = fixture[key]
            print(f"  {key} state: {old['state_digest_md5']} -> {d['state']}")
            print(f"  {key} fiscal: {old['fiscal_digest_md5']} -> {d['fiscal']}")
            print(f"  {key} ea: {old['existing_assets_digest_md5']} -> {d['ea']}")
            fixture[key]["state_digest_md5"] = d["state"]
            fixture[key]["fiscal_digest_md5"] = d["fiscal"]
            fixture[key]["existing_assets_digest_md5"] = d["ea"]
            state = state_at_yr  # continue from this year

    elif name == "golden_i":
        state = _initial(True, migration)
        for yr in years:
            state = _advance(state, yr, CLIMATE_HIST)
            d = digests(state)
            key = f"digests_yr{yr}"
            old = fixture[key]
            print(f"  {key} state: {old['state_digest_md5']} -> {d['state']}")
            print(f"  {key} fiscal: {old['fiscal_digest_md5']} -> {d['fiscal']}")
            print(f"  {key} ea: {old['existing_assets_digest_md5']} -> {d['ea']}")
            fixture[key]["state_digest_md5"] = d["state"]
            fixture[key]["fiscal_digest_md5"] = d["fiscal"]
            fixture[key]["existing_assets_digest_md5"] = d["ea"]

    save_fixture(name, fixture, also_data_golden=also_data_golden)


def regen_g():
    _regen_multi_year("golden_g", [2027, 2031, 2045])


def regen_g_prime():
    _regen_multi_year("golden_g_prime", [2027, 2031, 2045])


def regen_i():
    _regen_multi_year("golden_i", [2031, 2041], also_data_golden=True)


def regen_j():
    print("\n=== Golden J ===")
    fixture = load_fixture("golden_j")
    state = replay_fixture("golden_j", CLIMATE_HIST, False)
    hd = te.history_digest(state)
    old = fixture["history_digest_md5"]
    print(f"  history_digest: {old} -> {hd['md5']}")
    fixture["history_digest_md5"] = hd["md5"]
    fixture["history_n_years"] = hd["n_years"]
    fixture["history_year_range"] = hd["year_range"]
    save_fixture("golden_j", fixture)


def regen_j_prime():
    print("\n=== Golden J' ===")
    fixture = load_fixture("golden_j_prime")
    state = replay_fixture("golden_j_prime", CLIMATE_HIST, True)  # migration ON for J'
    hd = te.history_digest(state)
    old = fixture["history_digest_md5"]
    print(f"  history_digest: {old} -> {hd['md5']}")
    fixture["history_digest_md5"] = hd["md5"]
    fixture["history_n_years"] = hd["n_years"]
    fixture["history_year_range"] = hd["year_range"]
    save_fixture("golden_j_prime", fixture)


def regen_l():
    print("\n=== Golden L ===")
    fixture = load_fixture("golden_l")
    tables = fixture["climate_table_slice"]["ssp370"]

    for lens_key, lens_name, ctx in [
        ("digests_historical", "historical", CLIMATE_HIST),
        ("digests_ssp370", "ssp370", {"lens": "ssp370", "tables": tables}),
    ]:
        state = replay_fixture("golden_l", ctx, False)
        d = digests(state, lens=lens_name)
        old = fixture[lens_key]
        print(f"  {lens_key} state: {old['state_md5']} -> {d['state']}")
        print(f"  {lens_key} fiscal: {old['fiscal_md5']} -> {d['fiscal']}")
        print(f"  {lens_key} ea: {old['existing_assets_md5']} -> {d['ea']}")
        print(f"  {lens_key} history: {old['history_md5']} -> {d['history']}")
        fixture[lens_key]["state_md5"] = d["state"]
        fixture[lens_key]["fiscal_md5"] = d["fiscal"]
        fixture[lens_key]["existing_assets_md5"] = d["ea"]
        fixture[lens_key]["history_md5"] = d["history"]

        # Also update probe-year state digests
        if "probe_year_state_md5s" in old:
            for probe_yr_str in list(old["probe_year_state_md5s"].keys()):
                probe_yr = int(probe_yr_str)
                from c4i_contract_matrix import _initial, _advance
                probe_state = _initial(True, False)
                for entry in fixture["action_log"]:
                    probe_state = te.queue_action(
                        probe_state,
                        entry["action_id"],
                        entry["geoid"],
                        entry["magnitude"],
                        entry["decision_year"],
                        climate_context=ctx,
                    )
                probe_state = _advance(probe_state, probe_yr, ctx)
                sd = te.state_digest(
                    probe_state,
                    climate_lens=lens_name if lens_name != "historical" else None,
                )
                old_probe = old["probe_year_state_md5s"][probe_yr_str]
                print(f"  {lens_key} probe {probe_yr}: {old_probe} -> {sd['md5']}")
                fixture[lens_key]["probe_year_state_md5s"][probe_yr_str] = sd["md5"]

    save_fixture("golden_l", fixture)


def regen_m():
    print("\n=== Golden M ===")
    from test_golden_m import run_golden_m

    fixture = load_fixture("golden_m")

    # Pre-C4 historical control (no events)
    control = run_golden_m("historical", couple_events=False)
    old_pre = fixture["pre_c4_historical_control"]
    print(f"  pre_c4 state: {old_pre['state_digest_md5']} -> {control['state_digest_md5']}")
    print(f"  pre_c4 fiscal: {old_pre['fiscal_digest_md5']} -> {control['fiscal_digest_md5']}")
    print(f"  pre_c4 ea: {old_pre['existing_assets_digest_md5']} -> {control['existing_assets_digest_md5']}")
    print(f"  pre_c4 history: {old_pre['history_digest_md5']} -> {control['history_digest_md5']}")
    fixture["pre_c4_historical_control"] = control

    # Each lens
    for lens in ("historical", "ssp245", "ssp370"):
        result = run_golden_m(lens)
        old = fixture["results"][lens]
        print(f"  {lens} state: {old['state_digest_md5']} -> {result['state_digest_md5']}")
        fixture["results"][lens] = result

    save_fixture("golden_m", fixture)


def regen_n():
    print("\n=== Golden N ===")
    from test_golden_n import run_golden_n

    fixture = load_fixture("golden_n")

    for lens in ("historical", "ssp370"):
        result = run_golden_n(lens)
        old = fixture["results"][lens]
        for scenario_name, scenario_data in result.items():
            if "digests" in scenario_data:
                old_d = old[scenario_name]["digests"]
                new_d = scenario_data["digests"]
                print(f"  {lens}/{scenario_name} state: {old_d['state_digest_md5']} -> {new_d['state_digest_md5']}")
        fixture["results"][lens] = result

    save_fixture("golden_n", fixture)


if __name__ == "__main__":
    print("Regenerating all golden fixtures on the corrected EES baseline...")
    regen_d()
    regen_e()
    regen_f()
    regen_g()
    regen_g_prime()
    regen_i()
    regen_j()
    regen_j_prime()
    regen_l()
    regen_m()
    regen_n()
    print("\n=== DONE ===")
    print("A, B, C handled by nb16; H by generate_golden_h.py; K by generate_golden_k.py")
