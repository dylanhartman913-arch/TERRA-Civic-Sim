"""
Python parity tests for TERRA Engine v3.0.
Mirrors the TS retirement.test.ts (14 tests) + golden-g.test.ts (10 tests).
"""
import copy
import json
import hashlib
import sys
from pathlib import Path

import pytest

# Add src to path so we can import terra_engine
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import terra_engine as te

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
# Worktree fallback: if processed data is incomplete, try main worktree
if not (DATA_DIR / "synthetic_buses.geojson").exists():
    _main = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
                 "Research/Energy Modeling/energy-map/data/processed")
    if (_main / "synthetic_buses.geojson").exists():
        DATA_DIR = _main
TS_DATA_DIR = Path(__file__).parent.parent / "terra-app" / "src" / "data"
FIXTURE_DIR = Path(__file__).parent.parent / "terra-app" / "tests" / "parity" / "fixtures"


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_state():
    """Load initial engine state (no retirements)."""
    return te.initialize_state(data_dir=DATA_DIR)


def load_state_with_retirements():
    """Load initial engine state with EIA-860 baseline retirements."""
    with open(TS_DATA_DIR / "baseline_retirements.json") as f:
        retirements_raw = json.load(f)
    # Strip _meta key — only geoid keys pass through
    retirements = {k: v for k, v in retirements_raw.items() if k != "_meta"}
    return te.initialize_state(data_dir=DATA_DIR, baseline_retirements=retirements)


def load_state_with_anchors(baseline_retirements=None, exposure_tags=False):
    """Load the opt-in anchor registry, optionally with exposure tags."""
    with open(DATA_DIR / "mw_anchor_facilities.geojson") as f:
        anchor_facilities = json.load(f)
    exposure_tag_data = None
    if exposure_tags:
        with open(DATA_DIR / "asset_exposure_tags.json") as f:
            exposure_tag_data = json.load(f)
    return te.initialize_state(
        data_dir=DATA_DIR,
        baseline_retirements=baseline_retirements,
        anchor_facilities=anchor_facilities,
        exposure_tag_data=exposure_tag_data,
    )


def find_asset(registry, predicate):
    """Find first asset matching predicate in registry."""
    for a in registry:
        if predicate(a):
            return a
    raise ValueError("Asset not found in registry")


def advance_to_year(state, target_year):
    """Advance state until state['year'] == target_year."""
    while state["year"] < target_year:
        state = te.advance_year(state)
    return state


# ═══════════════════════════════════════════════════════════════════════════════
# Retirement Transitions (14 tests — mirrors retirement.test.ts)
# ═══════════════════════════════════════════════════════════════════════════════

class TestScheduleRetirement:
    def test_sets_scheduled_retirement_year(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        assert dj["lifecycle"] == "operating"
        assert dj["scheduled_retirement_year"] is None

        new_state = te.schedule_retirement(state, dj["asset_id"], 2030)
        dj_after = find_asset(new_state["asset_registry"],
                              lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_after["scheduled_retirement_year"] == 2030
        assert dj_after["lifecycle"] == "operating"

    def test_pure_function(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        digest_before = te.state_digest(state)

        te.schedule_retirement(state, dj["asset_id"], 2030)

        digest_after = te.state_digest(state)
        assert digest_after["md5"] == digest_before["md5"]
        dj_orig = find_asset(state["asset_registry"],
                             lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_orig["scheduled_retirement_year"] is None

    def test_rejects_production_assets(self):
        state = load_state()
        prb = find_asset(state["asset_registry"],
                         lambda a: "Powder River Basin" in a["name"])
        with pytest.raises(ValueError, match="asset_class"):
            te.schedule_retirement(state, prb["asset_id"], 2030)


class TestAccelerateRetirement:
    def test_moves_year_earlier(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2035)
        s2 = te.accelerate_retirement(s1, dj["asset_id"], 2030)
        dj_after = find_asset(s2["asset_registry"],
                              lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_after["scheduled_retirement_year"] == 2030

    def test_rejects_later_year(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2030)
        with pytest.raises(ValueError, match="must be earlier"):
            te.accelerate_retirement(s1, dj["asset_id"], 2035)

    def test_rejects_without_scheduled(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        with pytest.raises(ValueError, match="no scheduled retirement"):
            te.accelerate_retirement(state, dj["asset_id"], 2030)


class TestDelayRetirement:
    def test_moves_year_later_and_returns_hook(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2030)
        s2, hook = te.delay_retirement(s1, dj["asset_id"], 2040)
        dj_after = find_asset(s2["asset_registry"],
                              lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_after["scheduled_retirement_year"] == 2040
        assert hook["delay_cost_hook"] >= 0

    def test_rejects_earlier_year(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2035)
        with pytest.raises(ValueError, match="must be later"):
            te.delay_retirement(s1, dj["asset_id"], 2030)


class TestCancelQueued:
    def test_removes_from_build_queue(self):
        state = load_state()
        s1 = te.queue_action(state, "solar_utility", "56021", 100, 2025)
        assert len(s1["build_queue"]) == 1

        player_asset = find_asset(s1["asset_registry"],
                                  lambda a: a["origin"] == "player")
        s2, hook = te.cancel_queued(s1, player_asset["asset_id"])
        assert len(s2["build_queue"]) == 0
        assert hook["sunk_cost_fraction"] >= 0

        cancelled = find_asset(s2["asset_registry"],
                               lambda a: a["asset_id"] == player_asset["asset_id"])
        assert cancelled["lifecycle"] == "retired"

    def test_rejects_baseline_assets(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        with pytest.raises(ValueError, match="player-origin"):
            te.cancel_queued(state, dj["asset_id"])


class TestAdvanceYearRetirement:
    def test_retires_at_scheduled_year(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2026)

        # advanceYear: 2025 → 2026
        s2 = te.advance_year(s1)
        assert s2["year"] == 2026

        dj_after = find_asset(s2["asset_registry"],
                              lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_after["lifecycle"] == "retired"

    def test_removes_capacity_from_bus(self):
        state = load_state()
        jb = find_asset(state["asset_registry"],
                        lambda a: "Jim Bridger" in a["name"])
        assert jb["capacity_mw"] == 2120

        # Find bus for geoid 56037
        xw = state["crosswalk"]
        bus_rows = xw[(xw["geoid"] == "56037") & (xw["primary_bus"] == True)]
        bus_id = str(bus_rows.iloc[0]["bus_id"])
        cap_before = state["bus_state"][bus_id]["capacity_mw"]

        s1 = te.schedule_retirement(state, jb["asset_id"], 2026)
        s2 = te.advance_year(s1)
        assert s2["bus_state"][bus_id]["capacity_mw"] == cap_before - 2120

    def test_does_not_retire_before_scheduled(self):
        state = load_state()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        s1 = te.schedule_retirement(state, dj["asset_id"], 2030)

        # advanceYear: 2025 → 2026, not 2030
        s2 = te.advance_year(s1)
        dj_after = find_asset(s2["asset_registry"],
                              lambda a: a["asset_id"] == dj["asset_id"])
        assert dj_after["lifecycle"] == "operating"
        assert dj_after["scheduled_retirement_year"] == 2030


class TestExistingAssetsDigest:
    def test_digest_unchanged_no_retirements(self):
        state = load_state()
        digest = te.existing_assets_digest(state)
        assert digest["md5"] == "fa8cc0fc1163b026affb8972ecb4b804"


class TestAnchorCommodityField:
    def test_seed_reads_msha_commodity_field(self):
        state = load_state_with_anchors()
        mine = find_asset(state["asset_registry"], lambda a: a.get("anchor_id") == "msha_4800152")
        assert mine["commodity"] == "trona"

    def test_seed_uses_compatibility_fallback_when_field_is_absent(self):
        source = DATA_DIR / "mw_anchor_facilities.geojson"
        data = json.loads(source.read_text())
        mine = next(f for f in data["features"] if f["properties"].get("anchor_id") == "msha_4800152")
        del mine["properties"]["commodity"]
        seeded = te._seed_anchor_facilities(data, [])
        trona = next(a for a in seeded if a.get("anchor_id") == "msha_4800152")
        assert trona["commodity"] == "trona"

    @pytest.mark.parametrize("migration_enabled", [True, False])
    def test_anchor_field_does_not_change_existing_anchor_digest(self, migration_enabled):
        state = load_state_with_anchors()
        state["population_config"]["migration_enabled"] = migration_enabled
        current = sorted(
            ({k: v for k, v in a.items() if k != "exposure_tags"}
             for a in state["asset_registry"] if a.get("anchor_id")),
            key=lambda a: a["anchor_id"],
        )
        source = DATA_DIR / "mw_anchor_facilities.geojson"
        data = json.loads(source.read_text())
        for feature in data["features"]:
            feature["properties"].pop("commodity", None)
        fallback_state = te.initialize_state(
            data_dir=DATA_DIR,
            anchor_facilities=data,
        )
        fallback_state["population_config"]["migration_enabled"] = migration_enabled
        assert (
            te.existing_assets_digest(state)["md5"]
            == te.existing_assets_digest(fallback_state)["md5"]
        )
        fallback = sorted(
            ({k: v for k, v in a.items() if k != "exposure_tags"}
             for a in te._seed_anchor_facilities(data, [])
             if a.get("anchor_id") and a.get("asset_class") == "mine"),
            key=lambda a: a["anchor_id"],
        )
        current_mines = [a for a in current if a.get("asset_class") == "mine"]
        assert current_mines == fallback


# ═══════════════════════════════════════════════════════════════════════════════
# Golden G — Scheduled Baseline Retirements 2025→2045 (10 tests)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def golden_g_fixture():
    with open(FIXTURE_DIR / "golden_g.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def golden_g_prime_fixture():
    with open(FIXTURE_DIR / "golden_g_prime.json") as f:
        return json.load(f)


class TestGoldenG:
    def test_7a_scheduled_retirements_at_init(self, golden_g_fixture):
        state = load_state_with_retirements()
        dj = find_asset(state["asset_registry"],
                        lambda a: "Dave Johnston" in a["name"])
        jb = find_asset(state["asset_registry"],
                        lambda a: "Jim Bridger" in a["name"])
        assert dj["scheduled_retirement_year"] == 2027
        assert jb["scheduled_retirement_year"] == 2031
        assert dj["capacity_mw"] == golden_g_fixture["assertions"]["dj_capacity_drop_mw"]
        assert jb["capacity_mw"] == golden_g_fixture["assertions"]["jb_capacity_drop_mw"]

    def test_7b_initial_bus_capacities(self, golden_g_fixture):
        state = load_state_with_retirements()
        a = golden_g_fixture["assertions"]
        assert state["bus_state"][a["bus_56009_id"]]["capacity_mw"] == a["bus_56009_init_capacity_mw"]
        assert state["bus_state"][a["bus_56037_id"]]["capacity_mw"] == a["bus_56037_init_capacity_mw"]

    def test_7c_dave_johnston_retires_2027(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        a = golden_g_fixture["assertions"]
        dj = find_asset(state["asset_registry"],
                        lambda a_: "Dave Johnston" in a_["name"])
        assert dj["lifecycle"] == a["yr2027_dj_lifecycle"]
        assert state["bus_state"][a["bus_56009_id"]]["capacity_mw"] == a["yr2027_bus_56009_capacity_mw"]

    def test_7d_jim_bridger_still_operating_2027(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        a = golden_g_fixture["assertions"]
        jb = find_asset(state["asset_registry"],
                        lambda a_: "Jim Bridger" in a_["name"])
        assert jb["lifecycle"] == a["yr2027_jb_lifecycle"]
        assert state["bus_state"][a["bus_56037_id"]]["capacity_mw"] == a["yr2027_bus_56037_capacity_mw"]

    def test_7e_jim_bridger_retires_2031(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2031)
        a = golden_g_fixture["assertions"]
        jb = find_asset(state["asset_registry"],
                        lambda a_: "Jim Bridger" in a_["name"])
        assert jb["lifecycle"] == a["yr2031_jb_lifecycle"]
        assert state["bus_state"][a["bus_56037_id"]]["capacity_mw"] == a["yr2031_bus_56037_capacity_mw"]

    def test_7f_capacity_reduced_through_2045(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2045)
        a = golden_g_fixture["assertions"]
        assert state["bus_state"][a["bus_56009_id"]]["capacity_mw"] == a["yr2045_bus_56009_capacity_mw"]
        assert state["bus_state"][a["bus_56037_id"]]["capacity_mw"] == a["yr2045_bus_56037_capacity_mw"]

    def test_7g_digests_2027(self, golden_g_prime_fixture):
        # Digest tests now use Golden G′ (engine v3.1 — autonomous decline active)
        state = advance_to_year(load_state_with_retirements(), 2027)
        d = golden_g_prime_fixture["digests_yr2027"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7h_digests_2031(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2031)
        d = golden_g_prime_fixture["digests_yr2031"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7i_digests_2045(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2045)
        d = golden_g_prime_fixture["digests_yr2045"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7j_original_state_unmodified(self):
        state = load_state_with_retirements()
        digest_before = te.state_digest(state)["md5"]
        advance_to_year(state, 2045)
        digest_after = te.state_digest(state)["md5"]
        assert digest_after == digest_before


# ═══════════════════════════════════════════════════════════════════════════════
# Golden G′ — Autonomous PRB Coal Decline + Reclamation Arc 2025→2045
# ═══════════════════════════════════════════════════════════════════════════════

class TestGoldenGPrime:
    """Engine v3.1: autonomous PRB coal surface decline and reclamation obligation tracking."""

    def test_gp_a_prb_production_declines_2027(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert prb["production_volume"] == a["yr2027_prb_production_volume"]

    def test_gp_b_reclamation_acres_2027(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert prb["active_reclamation_acres"] == a["yr2027_prb_active_reclamation_acres"]

    def test_gp_c_reclamation_jobs_2027(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert prb["reclamation_jobs_direct"] == a["yr2027_prb_reclamation_jobs_direct"]

    def test_gp_d_prb_production_declines_2031(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2031)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert abs(prb["production_volume"] - a["yr2031_prb_production_volume"]) < 1.0

    def test_gp_e_reclamation_grows_through_2031(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2031)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert prb["active_reclamation_acres"] == a["yr2031_prb_active_reclamation_acres"]
        assert prb["reclamation_jobs_direct"] == a["yr2031_prb_reclamation_jobs_direct"]

    def test_gp_f_prb_production_2045(self, golden_g_prime_fixture):
        state = advance_to_year(load_state_with_retirements(), 2045)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert abs(prb["production_volume"] - a["yr2045_prb_production_volume"]) < 1.0

    def test_gp_g_reclamation_steady_state_2045(self, golden_g_prime_fixture):
        """After 10+ years the oldest cohorts start expiring; active_acres reaches steady-state band."""
        state = advance_to_year(load_state_with_retirements(), 2045)
        a = golden_g_prime_fixture["assertions"]
        prb = find_asset(state["asset_registry"],
                         lambda x: x.get("asset_class") == "production")
        assert prb["active_reclamation_acres"] == a["yr2045_prb_active_reclamation_acres"]
        assert prb["reclamation_jobs_direct"] == a["yr2045_prb_reclamation_jobs_direct"]

    def test_gp_h_state_digest_unchanged_vs_golden_g(self, golden_g_prime_fixture):
        """state_digest is stable: autonomous coal decline doesn't affect county_ees/bus_state."""
        state27 = advance_to_year(load_state_with_retirements(), 2027)
        state31 = advance_to_year(load_state_with_retirements(), 2031)
        state45 = advance_to_year(load_state_with_retirements(), 2045)
        assert te.state_digest(state27)["md5"] == golden_g_prime_fixture["digests_yr2027"]["state_digest_md5"]
        assert te.state_digest(state31)["md5"] == golden_g_prime_fixture["digests_yr2031"]["state_digest_md5"]
        assert te.state_digest(state45)["md5"] == golden_g_prime_fixture["digests_yr2045"]["state_digest_md5"]

    def test_gp_i_fiscal_digest_matches_golden_g(self, golden_g_fixture, golden_g_prime_fixture):
        """fiscal_digest now matches G at every checkpoint — both use current engine with autonomous decline."""
        for yr_key in ("digests_yr2027", "digests_yr2031", "digests_yr2045"):
            assert (golden_g_fixture[yr_key]["fiscal_digest_md5"]
                    == golden_g_prime_fixture[yr_key]["fiscal_digest_md5"]), yr_key

    def test_gp_j_pure_function(self):
        state = load_state_with_retirements()
        digest_before = te.state_digest(state)["md5"]
        advance_to_year(state, 2045)
        assert te.state_digest(state)["md5"] == digest_before


# ═══════════════════════════════════════════════════════════════════════════════
# Golden H — Lincoln County Kemmerer Boomtown 2026-2034
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def golden_h_fixture():
    with open(FIXTURE_DIR / "golden_h.json") as f:
        return json.load(f)


def _run_player_a_h():
    """Player A: do-nothing 2025→2034."""
    state = load_state_with_retirements()
    return advance_to_year(state, 2034)


def _run_player_b_h():
    """Player B: advance to 2026, queue SMR 345MW, retrofit 300 units, queue affordable 100 units, advance to 2034."""
    LINCOLN = "56023"
    state = load_state_with_retirements()
    state = advance_to_year(state, 2026)
    state = te.queue_action(state, "smr_advanced", LINCOLN, 345,
                            decision_year=2026, override_operational_year=2030)
    state, _ = te.apply_action(state, "housing_retrofit_affordable", LINCOLN, 300)
    state = te.queue_action(state, "affordable_housing", LINCOLN, 100,
                            decision_year=2026, override_operational_year=2027)
    return advance_to_year(state, 2034)


def _find_lincoln_housing(state, geoid="56023"):
    for a in state["asset_registry"]:
        if a.get("asset_class") == "housing_stock" and a.get("geoid") == geoid:
            return a
    raise ValueError(f"No housing_stock for {geoid}")


class TestGoldenH:
    """Engine v3.3: Lincoln County Kemmerer boomtown 2026-2034. Mirrors TS golden-h.test.ts (8a-8o)."""

    LINCOLN = "56023"

    def test_8a_housing_stock_exists_at_init(self):
        state = load_state_with_retirements()
        h = _find_lincoln_housing(state, self.LINCOLN)
        assert h["asset_class"] == "housing_stock"
        assert h["lifecycle"] == "operating"
        assert (h["housing_convertible_units"] or 0) > 0
        # housing_stock must NOT appear in existing_assets materialized view
        ea = state["existing_assets"].get(self.LINCOLN, [])
        assert not any(a.get("asset_class") == "housing_stock" for a in ea)

    def test_8b_player_a_state_digest_md5(self, golden_h_fixture):
        state = _run_player_a_h()
        assert te.state_digest(state)["md5"] == golden_h_fixture["player_a"]["state_digest_md5"]

    def test_8c_player_a_fiscal_digest_md5(self, golden_h_fixture):
        state = _run_player_a_h()
        assert te.fiscal_digest(state)["md5"] == golden_h_fixture["player_a"]["fiscal_digest_md5"]

    def test_8d_player_a_existing_assets_digest_md5(self, golden_h_fixture):
        state = _run_player_a_h()
        assert te.existing_assets_digest(state)["md5"] == golden_h_fixture["player_a"]["existing_assets_digest_md5"]

    def test_8e_player_a_lincoln_ees(self, golden_h_fixture):
        state = _run_player_a_h()
        ees = state["county_ees"].get(self.LINCOLN, {})
        ref = golden_h_fixture["player_a"]["lincoln_ees"]
        assert abs(ees["E"]  - ref["E"])  < 1e-4 * max(abs(ref["E"]),  1)
        assert abs(ees["Ec"] - ref["Ec"]) < 1e-4 * max(abs(ref["Ec"]), 1)
        assert abs(ees["S"]  - ref["S"])  < 1e-4 * max(abs(ref["S"]),  1)

    def test_8f_player_a_pressure_no_stress(self, golden_h_fixture):
        state = _run_player_a_h()
        h = _find_lincoln_housing(state, self.LINCOLN)
        ref_ratio = golden_h_fixture["player_a"]["lincoln_housing"]["housing_pressure_ratio"]
        assert h["housing_pressure_ratio"] is not None
        assert abs(h["housing_pressure_ratio"] - ref_ratio) < 1e-3 * max(abs(ref_ratio), 1)
        assert h["housing_pressure_ratio"] < 1.05  # below mild threshold — no stress

    def test_8g_player_a_no_affordable_added(self, golden_h_fixture):
        state = _run_player_a_h()
        h = _find_lincoln_housing(state, self.LINCOLN)
        assert (h["housing_affordable_added"] or 0) == 0
        ref_convertible = golden_h_fixture["player_a"]["lincoln_housing"]["housing_convertible_units"]
        assert h["housing_convertible_units"] == ref_convertible

    def test_8h_player_b_state_digest_md5(self, golden_h_fixture):
        state = _run_player_b_h()
        assert te.state_digest(state)["md5"] == golden_h_fixture["player_b"]["state_digest_md5"]

    def test_8i_player_b_fiscal_digest_md5(self, golden_h_fixture):
        state = _run_player_b_h()
        assert te.fiscal_digest(state)["md5"] == golden_h_fixture["player_b"]["fiscal_digest_md5"]

    def test_8j_player_b_existing_assets_digest_equals_a(self, golden_h_fixture):
        state = _run_player_b_h()
        md5 = te.existing_assets_digest(state)["md5"]
        assert md5 == golden_h_fixture["player_b"]["existing_assets_digest_md5"]
        assert md5 == golden_h_fixture["player_a"]["existing_assets_digest_md5"]

    def test_8k_player_b_housing_units(self, golden_h_fixture):
        state = _run_player_b_h()
        h = _find_lincoln_housing(state, self.LINCOLN)
        ref = golden_h_fixture["player_b"]["lincoln_housing"]
        assert h["housing_convertible_units"] == ref["housing_convertible_units"]  # 115
        assert h["housing_affordable_added"]  == ref["housing_affordable_added"]   # 400

    def test_8l_player_b_pressure_lower_than_a(self, golden_h_fixture):
        state_a = _run_player_a_h()
        state_b = _run_player_b_h()
        ha = _find_lincoln_housing(state_a, self.LINCOLN)
        hb = _find_lincoln_housing(state_b, self.LINCOLN)
        assert hb["housing_pressure_ratio"] < ha["housing_pressure_ratio"]
        ref_b = golden_h_fixture["player_b"]["lincoln_housing"]["housing_pressure_ratio"]
        assert abs(hb["housing_pressure_ratio"] - ref_b) < 1e-3 * max(abs(ref_b), 1)

    def test_8m_player_b_fiscal_assessed_residential_uplift(self, golden_h_fixture):
        state = _run_player_b_h()
        cf = state.get("county_fiscal", {}).get(self.LINCOLN, {})
        expected_delta = 300 * 150_000 * 0.095  # 4_275_000
        ref_a = golden_h_fixture["player_a"]["lincoln_fiscal"]["assessed_residential"]
        ref_b = golden_h_fixture["player_b"]["lincoln_fiscal"]["assessed_residential"]
        actual_delta = cf.get("assessed_residential", 0) - ref_a
        assert abs(actual_delta - expected_delta) < 0.01
        assert abs(cf.get("assessed_residential", 0) - ref_b) < 0.01

    def test_8n_player_b_ees_ec_elevated(self, golden_h_fixture):
        state_a = _run_player_a_h()
        state_b = _run_player_b_h()
        ees_a = state_a["county_ees"].get(self.LINCOLN, {})
        ees_b = state_b["county_ees"].get(self.LINCOLN, {})
        assert ees_b["Ec"] > ees_a["Ec"]
        ref = golden_h_fixture["player_b"]["lincoln_ees"]
        assert abs(ees_b["E"]  - ref["E"])  < 1e-4 * max(abs(ref["E"]),  1)
        assert abs(ees_b["Ec"] - ref["Ec"]) < 1e-4 * max(abs(ref["Ec"]), 1)
        assert abs(ees_b["S"]  - ref["S"])  < 1e-4 * max(abs(ref["S"]),  1)

    def test_8o_retrofit_validates_convertible_cap(self):
        state = load_state_with_retirements()
        h = _find_lincoln_housing(state, self.LINCOLN)
        available = h["housing_convertible_units"]
        import pytest as _pytest
        with _pytest.raises(Exception):
            te.apply_action(state, "housing_retrofit_affordable", self.LINCOLN, available + 1)


# ═══════════════════════════════════════════════════════════════════════════════
# v4.0 — History and Indicator Tests (Golden J)
# ═══════════════════════════════════════════════════════════════════════════════

def _run_golden_b_sequence():
    """Reproduce the Golden B scenario up to year 2028 (pre-projection start)."""
    LARAMIE = "56021"
    LINCOLN = "56023"
    state = load_state_with_retirements()
    state = te.queue_action(state, 'data_center_hyperscale', LARAMIE, 100, 2025)
    state = te.queue_action(state, 'data_center_campus_phase', LARAMIE, 200, 2025)
    state = te.queue_action(state, 'smr_advanced', LINCOLN, 345, 2025,
                            override_operational_year=2031)
    while state['year'] < 2028:
        state = te.advance_year(state)
    state = te.queue_action(state, 'smr_advanced', LARAMIE, 345, 2028,
                            override_operational_year=2032)
    state = te.queue_action(state, 'smr_advanced', LARAMIE, 345, 2028,
                            override_operational_year=2032)
    state = te.queue_action(state, 'transmission_230kv', LARAMIE, 50, 2028)
    state, _ = te.apply_action(state, 'workforce_retraining', LARAMIE, 1000)
    state, _ = te.apply_action(state, 'workforce_retraining', LINCOLN, 1000)
    state, _ = te.apply_action(state, 'affordable_housing', LARAMIE, 500)
    state = te.queue_action(state, 'battery_grid', LARAMIE, 1000, 2028)
    return state


class TestReplayHistory:
    """Replay reconstruction: running the same sequence twice yields identical history."""

    def test_replay_history_deterministic(self):
        """Running the same sequence twice yields byte-identical history."""
        state1 = _run_golden_b_sequence()
        state2 = _run_golden_b_sequence()
        assert state1['history'] == state2['history'], (
            f"History diverged: len1={len(state1['history'])}, len2={len(state2['history'])}"
        )

    def test_replay_history_matches_live_year_count(self):
        """History has 3 entries after advancing 2025→2026→2027→2028."""
        state = _run_golden_b_sequence()
        # advance_year called 3 times: 2025→2026, 2026→2027, 2027→2028
        assert len(state['history']) == 3, (
            f"Expected 3 history entries, got {len(state['history'])}"
        )

    def test_replay_history_years_are_sequential(self):
        """History years are strictly increasing and match expected values."""
        state = _run_golden_b_sequence()
        years = [s['year'] for s in state['history']]
        assert years == sorted(years), f"History years not sequential: {years}"
        assert years == [2026, 2027, 2028], f"Expected [2026, 2027, 2028], got {years}"

    def test_main_digests_unchanged(self):
        """A–H digests are unaffected by history (additive read only)."""
        state = _run_golden_b_sequence()
        sd = te.state_digest(state)
        assert 'history' not in sd
        fd = te.fiscal_digest(state)
        assert 'history' not in fd
        ead = te.existing_assets_digest(state)
        assert 'history' not in ead

    def test_history_has_study_and_counties_keys(self):
        """Each snapshot has year, study, counties, pools keys."""
        state = _run_golden_b_sequence()
        for snap in state['history']:
            assert 'year' in snap
            assert 'study' in snap
            assert 'counties' in snap
            assert 'pools' in snap
            assert 'E' in snap['study']
            assert 'Ec' in snap['study']
            assert 'S' in snap['study']

    def test_history_county_snapshot_fields(self):
        """County snapshots have all expected fields."""
        state = _run_golden_b_sequence()
        CAMPBELL = "56005"
        for snap in state['history']:
            county = snap['counties'].get(CAMPBELL)
            assert county is not None, f"Campbell missing from year {snap['year']}"
            for field in ('E', 'Ec', 'S', 'property_tax', 'cumulative_net',
                          'labor_utilization', 'service_funding_per_capita'):
                assert field in county, f"Field {field!r} missing from county snap yr {snap['year']}"


@pytest.fixture(scope='module')
def golden_j_fixture():
    with open(FIXTURE_DIR / 'golden_j.json') as f:
        return json.load(f)


@pytest.fixture(scope='module')
def golden_j_state():
    """Full 60-year projection state for Golden J tests (expensive — run once)."""
    state = _run_golden_b_sequence()
    states = te.project(state, 60)
    return states[-1]  # year 2088


class TestGoldenJ:
    LARAMIE = "56021"
    CAMPBELL = "56005"

    def test_j1_payback_year_in_range(self, golden_j_state, golden_j_fixture):
        """payback_year for dual-SMR in Laramie lands in documented range."""
        import indicators as ind
        py = ind.compute_indicator(golden_j_state, 'payback_year', 'county', self.LARAMIE)
        lo, hi = golden_j_fixture['assertions']['laramie_payback_year_range']
        assert py is not None, "payback_year should not be None after 60-year projection"
        assert lo <= py <= hi, f"payback_year {py} not in range [{lo}, {hi}]"

    def test_j2_labor_utilization_elevated_during_construction(self, golden_j_state, golden_j_fixture):
        """labor_utilization in Laramie is elevated in 2030 (SMR construction phase 2029-2031)."""
        history = golden_j_state.get('history', [])
        snap_2030 = next((s for s in history if s['year'] == 2030), None)
        assert snap_2030 is not None, "Year 2030 missing from history"
        lu = snap_2030['counties'][self.LARAMIE]['labor_utilization']
        ref = golden_j_fixture['assertions']['laramie_labor_utilization_construction_peak']
        assert ref['min'] <= lu <= ref['max'], (
            f"labor_utilization {lu} not in construction peak range [{ref['min']}, {ref['max']}]"
        )

    def test_j3_labor_utilization_near_zero_post_commission(self, golden_j_state, golden_j_fixture):
        """labor_utilization in Laramie is near-zero by 2033 (SMRs commissioned 2032)."""
        history = golden_j_state.get('history', [])
        snap_2033 = next((s for s in history if s['year'] == 2033), None)
        assert snap_2033 is not None, "Year 2033 missing from history"
        lu = snap_2033['counties'][self.LARAMIE]['labor_utilization']
        max_val = golden_j_fixture['assertions']['laramie_labor_utilization_post_commission_max']
        assert lu <= max_val, f"labor_utilization {lu} > post-commission max {max_val}"

    def test_j4_campbell_coal_recapture_burden_shrinks(self, golden_j_state, golden_j_fixture):
        """Campbell school finance recapture burden shrinks under PRB coal decline."""
        history = golden_j_state.get('history', [])
        snap_2028 = next((s for s in history if s['year'] == 2028), None)
        snap_2038 = next((s for s in history if s['year'] == 2038), None)
        assert snap_2028 is not None and snap_2038 is not None
        sfpc_2028 = snap_2028['counties'][self.CAMPBELL]['service_funding_per_capita']
        sfpc_2038 = snap_2038['counties'][self.CAMPBELL]['service_funding_per_capita']
        # service_funding_per_capita is negative for recapture counties;
        # absolute value should shrink as coal declines
        assert abs(sfpc_2038) < abs(sfpc_2028), (
            f"Campbell recapture burden did not shrink: "
            f"|sfpc_2028|={abs(sfpc_2028):.4f}, |sfpc_2038|={abs(sfpc_2038):.4f}"
        )
        assert golden_j_fixture['assertions']['campbell_coal_recapture_burden_shrinks'] is True

    def test_j5_history_digest_matches_fixture(self, golden_j_state, golden_j_fixture):
        """Golden J superseded by J′ (engine v4.2). Current digest matches J′; old J digest is archived."""
        with open(FIXTURE_DIR / "golden_j_prime.json") as f:
            jp_fixture = json.load(f)
        hd = te.history_digest(golden_j_state)
        # Current engine produces J′ digest
        assert hd['md5'] == jp_fixture['history_digest_md5'], (
            f"history_digest md5 mismatch: got {hd['md5']}, expected {jp_fixture['history_digest_md5']}"
        )
        # Old J digest is archived — confirm it differs
        assert hd['md5'] != golden_j_fixture['history_digest_md5']

    def test_j6_a_to_h_digests_unchanged(self, golden_j_state):
        """Golden A–H main digest fields are unaffected by history."""
        sd = te.state_digest(golden_j_state)
        assert 'history' not in sd
        fd = te.fiscal_digest(golden_j_state)
        assert 'history' not in fd

    def test_j7_history_length_matches_fixture(self, golden_j_state, golden_j_fixture):
        """History length matches fixture (63 = 3 pre-projection + 60 projected years)."""
        history = golden_j_state.get('history', [])
        assert len(history) == golden_j_fixture['history_n_years']

    def test_j8_history_year_range_matches_fixture(self, golden_j_state, golden_j_fixture):
        """History year range matches fixture [2026, 2088]."""
        history = golden_j_state.get('history', [])
        year_range = [history[0]['year'], history[-1]['year']]
        assert year_range == golden_j_fixture['history_year_range']

    def test_j9_project_deterministic(self):
        """project() called twice on same state yields byte-identical history digests."""
        state = _run_golden_b_sequence()
        states1 = te.project(state, 10)
        states2 = te.project(state, 10)
        hd1 = te.history_digest(states1[-1])
        hd2 = te.history_digest(states2[-1])
        assert hd1['md5'] == hd2['md5'], "project() is not deterministic"

    def test_j10_project_delta_returns_two_trajectories(self):
        """project_delta returns (action_states, baseline_states) of equal length."""
        state = _run_golden_b_sequence()
        action_states, baseline_states = te.project_delta(
            state, 'solar_utility', '56021', 100, 5
        )
        assert len(action_states) == 5
        assert len(baseline_states) == 5
        # action trajectory should differ from baseline
        hd_action = te.history_digest(action_states[-1])
        hd_baseline = te.history_digest(baseline_states[-1])
        # Both should have valid digests
        assert len(hd_action['md5']) == 32
        assert len(hd_baseline['md5']) == 32


# ═══════════════════════════════════════════════════════════════════════════════
# Golden I — Site Spawning + Succession Mechanics (18 tests — mirrors golden-i.test.ts)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def golden_i_fixture():
    with open(FIXTURE_DIR / "golden_i.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def golden_i_state_2031():
    """State advanced to 2031 (Jim Bridger retired, site spawned)."""
    state = load_state_with_retirements()
    while state["year"] < 2031:
        state = te.advance_year(state)
    return state


@pytest.fixture(scope="module")
def golden_i_state_2041():
    """State advanced to 2041 (workforce pool has decayed)."""
    state = load_state_with_retirements()
    while state["year"] < 2041:
        state = te.advance_year(state)
    return state


class TestGoldenI:
    """Golden I — site spawning, succession discounts, workforce decay, coal_to_smr convert."""

    # ── Site spawning (i-a) ──────────────────────────────────────────────────

    def test_ia1_site_spawns_with_correct_id_and_geoid(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2031["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["geoid"] == a["jb_site_geoid"]

    def test_ia2_site_interconnection_mw_and_class(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2031["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["interconnection_mw"] == a["jb_site_interconnection_mw"]
        assert site["site_class"] == a["jb_site_site_class"]

    def test_ia3_site_origin_and_spawn_year(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2031["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["site_origin_asset_id"] == a["jb_site_origin_asset_id"]
        assert site["site_spawn_year"] == a["jb_site_spawn_year"]

    def test_ia4_workforce_pool_at_spawn(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2031["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["workforce_pool_initial"] == a["jb_site_workforce_pool_initial"]
        assert site["workforce_pool_current"] == a["jb_site_workforce_pool_at_spawn"]

    def test_ia5_site_asset_class_and_lifecycle(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2031["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["asset_class"] == "site"
        assert site["lifecycle"] == "operating"

    # ── On-site vs greenfield SMR (i-b/c/d) ─────────────────────────────────

    def test_ib1_onsite_smr_ttd_reduction(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "smr_advanced", "56037", 345, 2031)
        smr = find_asset(state["asset_registry"],
                         lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56037")
        assert smr["ttd_reduction_applied"] == a["onsite_ttd_reduction_applied"]
        assert smr["operational_year"] == a["onsite_smr_operational_year"]

    def test_ib2_onsite_smr_capex_discount(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "smr_advanced", "56037", 345, 2031)
        smr = find_asset(state["asset_registry"],
                         lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56037")
        assert smr["capex_discount_fraction"] == a["onsite_capex_discount_fraction"]

    def test_ib3_onsite_smr_tx_waiver_and_succession_site(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "smr_advanced", "56037", 345, 2031)
        smr = find_asset(state["asset_registry"],
                         lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56037")
        assert smr["tx_waiver_mw"] == a["onsite_tx_waiver_mw"]
        assert smr["succession_site_id"] == a["onsite_succession_site_id"]

    def test_ic_greenfield_smr_no_discounts(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "smr_advanced", "56001", 345, 2031)
        smr = find_asset(state["asset_registry"],
                         lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56001")
        assert smr["ttd_reduction_applied"] is None
        assert smr["capex_discount_fraction"] is None
        assert smr["tx_waiver_mw"] is None
        assert smr["operational_year"] == a["greenfield_smr_operational_year"]

    def test_id_ttd_improvement_2_years(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        s1 = te.queue_action(golden_i_state_2031, "smr_advanced", "56037", 345, 2031)
        s2 = te.queue_action(golden_i_state_2031, "smr_advanced", "56001", 345, 2031)
        onsite = find_asset(s1["asset_registry"],
                            lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56037")
        gf = find_asset(s2["asset_registry"],
                        lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56001")
        assert gf["operational_year"] - onsite["operational_year"] == a["ttd_improvement_years"]

    # ── TX waiver cap (i-e) ─────────────────────────────────────────────────

    def test_ie_tx_waiver_caps_at_interconnection_mw(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "smr_advanced", "56037", 3000, 2031)
        smr = find_asset(state["asset_registry"],
                         lambda x: x.get("action_id") == "smr_advanced" and x["geoid"] == "56037")
        assert smr["tx_waiver_mw"] == a["tx_waiver_cap_at_max_magnitude"]

    # ── coal_to_smr convert path (i-f) ──────────────────────────────────────

    def test_if1_coal_to_smr_tx_waiver_only(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "coal_to_smr", "56037", 345, 2031)
        asset = find_asset(state["asset_registry"],
                           lambda x: x.get("action_id") == "coal_to_smr" and x["geoid"] == "56037")
        assert asset["ttd_reduction_applied"] is None
        assert asset["capex_discount_fraction"] is None
        assert asset["tx_waiver_mw"] == a["coal_to_smr_tx_waiver_mw"]

    def test_if2_coal_to_smr_convert_source_and_succession(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "coal_to_smr", "56037", 345, 2031)
        asset = find_asset(state["asset_registry"],
                           lambda x: x.get("action_id") == "coal_to_smr" and x["geoid"] == "56037")
        assert asset["convert_source_asset_id"] == a["coal_to_smr_convert_source_asset_id"]
        assert asset["succession_site_id"] == a["coal_to_smr_succession_site_id"]

    def test_if3_coal_to_smr_operational_year_no_ttd_reduction(self, golden_i_state_2031, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        state = te.queue_action(golden_i_state_2031, "coal_to_smr", "56037", 345, 2031)
        asset = find_asset(state["asset_registry"],
                           lambda x: x.get("action_id") == "coal_to_smr" and x["geoid"] == "56037")
        assert asset["operational_year"] == a["coal_to_smr_operational_year"]

    # ── Workforce pool decay (i-g) ───────────────────────────────────────────

    def test_ig_workforce_pool_decay_at_2041(self, golden_i_state_2041, golden_i_fixture):
        a = golden_i_fixture["assertions"]
        site = find_asset(golden_i_state_2041["asset_registry"],
                          lambda x: x["asset_id"] == a["jb_site_asset_id"])
        assert site["workforce_pool_current"] == a["workforce_pool_at_2041"]

    # ── Digest parity (i-h/i/j) ─────────────────────────────────────────────

    def test_ih_digests_at_2031_match_golden_g_prime(self, golden_i_state_2031, golden_i_fixture):
        sd = te.state_digest(golden_i_state_2031)
        fd = te.fiscal_digest(golden_i_state_2031)
        ead = te.existing_assets_digest(golden_i_state_2031)
        assert sd["md5"] == golden_i_fixture["digests_yr2031"]["state_digest_md5"]
        assert fd["md5"] == golden_i_fixture["digests_yr2031"]["fiscal_digest_md5"]
        assert ead["md5"] == golden_i_fixture["digests_yr2031"]["existing_assets_digest_md5"]

    def test_ii_digests_at_2041_match_fixture(self, golden_i_state_2041, golden_i_fixture):
        sd = te.state_digest(golden_i_state_2041)
        fd = te.fiscal_digest(golden_i_state_2041)
        ead = te.existing_assets_digest(golden_i_state_2041)
        assert sd["md5"] == golden_i_fixture["digests_yr2041"]["state_digest_md5"]
        assert fd["md5"] == golden_i_fixture["digests_yr2041"]["fiscal_digest_md5"]
        assert ead["md5"] == golden_i_fixture["digests_yr2041"]["existing_assets_digest_md5"]

    def test_ij_pure_function(self):
        state = load_state_with_retirements()
        digest_before = te.state_digest(state)["md5"]
        state31 = state
        while state31["year"] < 2031:
            state31 = te.advance_year(state31)
        te.queue_action(state31, "smr_advanced", "56037", 345, 2031)
        te.queue_action(state31, "coal_to_smr", "56037", 345, 2031)
        assert te.state_digest(state)["md5"] == digest_before


# ═══════════════════════════════════════════════════════════════════════════════
# Golden J′ — v4.2 Dynamic Population Tests (Python parity)
# ═══════════════════════════════════════════════════════════════════════════════

LARAMIE = "56021"
LINCOLN = "56023"
CAMPBELL = "56005"


@pytest.fixture(scope="module")
def golden_j_prime_fixture():
    with open(FIXTURE_DIR / "golden_j_prime.json") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def golden_j_prime_state():
    """Full Golden B sequence + 60-year projection (same as TS Golden J′)."""
    state = load_state_with_retirements()
    state = te.queue_action(state, "data_center_hyperscale", LARAMIE, 100, 2025)
    state = te.queue_action(state, "data_center_campus_phase", LARAMIE, 200, 2025)
    state = te.queue_action(state, "smr_advanced", LINCOLN, 345, 2025, 2031)
    while state["year"] < 2028:
        state = te.advance_year(state)
    state = te.queue_action(state, "smr_advanced", LARAMIE, 345, 2028, 2032)
    state = te.queue_action(state, "smr_advanced", LARAMIE, 345, 2028, 2032)
    state = te.queue_action(state, "transmission_230kv", LARAMIE, 50, 2028)
    state, _ = te.apply_action(state, "workforce_retraining", LARAMIE, 1000)
    state, _ = te.apply_action(state, "workforce_retraining", LINCOLN, 1000)
    state, _ = te.apply_action(state, "affordable_housing", LARAMIE, 500)
    state = te.queue_action(state, "battery_grid", LARAMIE, 1000, 2028)
    states = te.project(state, 60)
    return states[-1]


def _snap_for_year(history, year):
    for s in history:
        if s["year"] == year:
            return s
    return None


class TestGoldenJPrime:
    """Golden J′ — v4.2 dynamic population advancement (Python runtime)."""

    def test_jp1_history_digest_matches_fixture(self, golden_j_prime_state, golden_j_prime_fixture):
        """history_digest MD5 matches frozen Golden J′ fixture."""
        hd = te.history_digest(golden_j_prime_state)
        assert hd["md5"] == golden_j_prime_fixture["history_digest_md5"], (
            f"history_digest md5 mismatch: got {hd['md5']}, "
            f"expected {golden_j_prime_fixture['history_digest_md5']}"
        )

    def test_jp2_history_digest_differs_from_golden_j(self, golden_j_prime_state, golden_j_prime_fixture):
        """history_digest changed from Golden J (population fields now in snapshot)."""
        hd = te.history_digest(golden_j_prime_state)
        golden_j_md5 = "b314878564e4118e7a60d6fc04d6a03d"
        assert hd["md5"] != golden_j_md5

    def test_jp3_history_length(self, golden_j_prime_state, golden_j_prime_fixture):
        """History has 63 snapshots (3 pre-projection + 60 projected)."""
        assert len(golden_j_prime_state.get("history", [])) == golden_j_prime_fixture["history_n_years"]

    def test_jp4_campbell_population_declining(self, golden_j_prime_state, golden_j_prime_fixture):
        """Campbell population at 2028 matches fixture (PRB-linked decline)."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2028)
        assert snap is not None
        assert snap["counties"][CAMPBELL]["population"] == golden_j_prime_fixture["assertions"]["campbell_population_2028"]

    def test_jp5_campbell_working_age_population(self, golden_j_prime_state, golden_j_prime_fixture):
        """Campbell working_age_population at 2028 matches fixture."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2028)
        assert snap is not None
        assert snap["counties"][CAMPBELL]["working_age_population"] == golden_j_prime_fixture["assertions"]["campbell_working_age_population_2028"]

    def test_jp6_laramie_population_growing(self, golden_j_prime_state, golden_j_prime_fixture):
        """Laramie population at 2028 matches fixture (SMR ops migration)."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2028)
        assert snap is not None
        assert snap["counties"][LARAMIE]["population"] == golden_j_prime_fixture["assertions"]["laramie_population_2028"]

    def test_jp7_laramie_working_age_2028(self, golden_j_prime_state, golden_j_prime_fixture):
        """Laramie working_age_population at 2028 matches fixture."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2028)
        assert snap is not None
        assert snap["counties"][LARAMIE]["working_age_population"] == golden_j_prime_fixture["assertions"]["laramie_working_age_population_2028"]

    def test_jp8_laramie_population_2038(self, golden_j_prime_state, golden_j_prime_fixture):
        """Laramie population and working_age at 2038 match fixture."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2038)
        assert snap is not None
        assert snap["counties"][LARAMIE]["population"] == golden_j_prime_fixture["assertions"]["laramie_population_2038"]
        assert snap["counties"][LARAMIE]["working_age_population"] == golden_j_prime_fixture["assertions"]["laramie_working_age_population_2038"]

    def test_jp9_laramie_population_monotone(self, golden_j_prime_state):
        """Laramie population is monotonically non-decreasing 2028→2038."""
        history = golden_j_prime_state.get("history", [])
        pops = [
            _snap_for_year(history, yr)["counties"][LARAMIE]["population"]
            for yr in range(2028, 2039)
        ]
        for i in range(1, len(pops)):
            assert pops[i] >= pops[i - 1], (
                f"Population decreased at year {2028 + i}: {pops[i-1]} → {pops[i]}"
            )

    def test_jp10_campbell_sfpc_more_negative(self, golden_j_prime_state, golden_j_prime_fixture):
        """Campbell sfpc at 2028 matches fixture (more negative due to declining pop)."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2028)
        assert snap is not None
        sfpc = snap["counties"][CAMPBELL]["service_funding_per_capita"]
        expected = golden_j_prime_fixture["assertions"]["campbell_service_funding_per_capita_2028"]
        assert abs(sfpc - expected) / max(abs(expected), 1e-10) < 1e-4, (
            f"sfpc mismatch: {sfpc:.4f} vs {expected:.4f}"
        )

    def test_jp11_campbell_recapture_burden_shrinks(self, golden_j_prime_state):
        """Campbell recapture burden still shrinks 2028→2038 (PRB decline dominates)."""
        snap_2028 = _snap_for_year(golden_j_prime_state["history"], 2028)
        snap_2038 = _snap_for_year(golden_j_prime_state["history"], 2038)
        sfpc_2028 = snap_2028["counties"][CAMPBELL]["service_funding_per_capita"]
        sfpc_2038 = snap_2038["counties"][CAMPBELL]["service_funding_per_capita"]
        assert abs(sfpc_2038) < abs(sfpc_2028)

    def test_jp12_ees_spot_values_stable(self, golden_j_prime_state, golden_j_prime_fixture):
        """Laramie 2032 EES spot values unchanged (EES not population-indexed)."""
        snap = _snap_for_year(golden_j_prime_state["history"], 2032)
        assert snap is not None
        c = snap["counties"][LARAMIE]
        a = golden_j_prime_fixture["assertions"]

        def rel_close(v, expected, tol=1e-6):
            return abs(v - expected) / max(abs(expected), 1e-10) < tol

        assert rel_close(c["E"], a["laramie_history_spot_2032_E"])
        assert rel_close(c["Ec"], a["laramie_history_spot_2032_Ec"])
        assert rel_close(c["S"], a["laramie_history_spot_2032_S"])

    def test_jp13_off_switch_disables_migration(self):
        """population_config.migration_adjustment_enabled=False disables ops migration.
        Golden B 2x SMR at Laramie commissions 2032; advance 5 years post-2028 to 2033.
        Migration-on run grows more than migration-off run.
        """
        # Build Golden B sequence to 2028 end-state
        state_base = load_state_with_retirements()
        state_base = te.queue_action(state_base, "data_center_hyperscale", LARAMIE, 100, 2025)
        state_base = te.queue_action(state_base, "data_center_campus_phase", LARAMIE, 200, 2025)
        state_base = te.queue_action(state_base, "smr_advanced", LINCOLN, 345, 2025, 2031)
        while state_base["year"] < 2028:
            state_base = te.advance_year(state_base)
        state_base = te.queue_action(state_base, "smr_advanced", LARAMIE, 345, 2028, 2032)
        state_base = te.queue_action(state_base, "smr_advanced", LARAMIE, 345, 2028, 2032)
        state_base = te.queue_action(state_base, "transmission_230kv", LARAMIE, 50, 2028)
        state_base, _ = te.apply_action(state_base, "workforce_retraining", LARAMIE, 1000)
        state_base, _ = te.apply_action(state_base, "workforce_retraining", LINCOLN, 1000)
        state_base, _ = te.apply_action(state_base, "affordable_housing", LARAMIE, 500)
        state_base = te.queue_action(state_base, "battery_grid", LARAMIE, 1000, 2028)

        # Migration ON (default)
        state_on = state_base
        # Migration OFF
        if state_base.get("population_config"):
            state_off = {**state_base, "population_config": {**state_base["population_config"], "migration_enabled": False}}
        else:
            state_off = state_base

        for _ in range(5):  # advance to 2033 (1 year past Laramie SMR commission)
            state_on = te.advance_year(state_on)
            state_off = te.advance_year(state_off)

        pop_on = state_on["county_ees"][LARAMIE]["population"]
        pop_off = state_off["county_ees"][LARAMIE]["population"]
        assert pop_on > pop_off, (
            f"Migration-enabled pop ({pop_on}) should exceed migration-disabled pop ({pop_off})"
        )

    def test_jp14_working_age_seeded_at_init(self):
        """working_age_population is non-zero at initialization."""
        state = load_state_with_retirements()
        ees = state["county_ees"]
        wa_pops = [ees[g].get("working_age_population", 0) for g in ees]
        assert all(v > 0 for v in wa_pops), "Some counties have zero working_age_population at init"

    def test_jp15_population_projections_loaded(self):
        """population_projections dict is loaded and covers all 157 counties."""
        state = load_state_with_retirements()
        proj = state.get("population_projections", {})
        assert len(proj) == 157, f"Expected 157 counties in population_projections, got {len(proj)}"

    def test_jp16_ts_python_history_digest_parity(self, golden_j_prime_state, golden_j_prime_fixture):
        """Python history_digest matches TS Golden J′ fixture (cross-runtime parity)."""
        # Both runtimes must produce the same MD5 for the same logical state
        hd = te.history_digest(golden_j_prime_state)
        assert hd["md5"] == golden_j_prime_fixture["history_digest_md5"]


# ═══════════════════════════════════════════════════════════════════════════════
# Golden K — Anchor Lifecycle (F1, 12 tests)
# ═══════════════════════════════════════════════════════════════════════════════

def _load_golden_k_fixture():
    with open(FIXTURE_DIR / "golden_k.json") as f:
        return json.load(f)


@pytest.fixture(scope='module')
def golden_k_fixture():
    return _load_golden_k_fixture()


@pytest.fixture(scope='module')
def golden_k_state():
    """Replay the Golden K scenario (no baseline retirements, with anchors)."""
    state = load_state_with_anchors()
    state = te.schedule_retirement(state, 'anchor_56037_we_soda_westvaco', 2030)
    state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
    state = advance_to_year(state, 2029)
    state = te.queue_action(state, 'solar_utility', '56005', 100, 2029)
    state = advance_to_year(state, 2031)
    state = advance_to_year(state, 2035)
    state = te.queue_action(state, 'smr_advanced', '56037', 345, 2035)
    state = advance_to_year(state, 2040)
    return state


class TestGoldenK:
    """Anchor lifecycle parity — mirrors golden-k.test.ts."""

    def test_k1_anchor_seeding_populates_registry(self):
        """Anchors are seeded into asset_registry at initialization."""
        state = load_state_with_anchors()
        anchors = [a for a in state["asset_registry"]
                   if a.get("asset_class") in ("mine", "industrial_load", "commercial_anchor_load")]
        assert len(anchors) > 0, "No anchor assets seeded"
        mines = [a for a in anchors if a["asset_class"] == "mine"]
        assert len(mines) > 0, "No mine assets seeded"

    def test_k2_anchor_inertness_state_digest(self):
        """Anchor seeding is inert to state/fiscal but materializes generators."""
        anchored = load_state_with_anchors()
        anchor_free = load_state()
        assert te.state_digest(anchored)["md5"] == te.state_digest(anchor_free)["md5"]
        assert te.fiscal_digest(anchored)["md5"] == te.fiscal_digest(anchor_free)["md5"]
        assert (
            te.existing_assets_digest(anchored)["md5"]
            != te.existing_assets_digest(anchor_free)["md5"]
        )

    def test_k3_bt_site_spawns_with_correct_class(self, golden_k_fixture):
        """Black Thunder mine site spawns with site_class='mine'."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
        state = advance_to_year(state, 2029)
        site = find_asset(state["asset_registry"],
                          lambda a: a.get("site_origin_asset_id") == "anchor_56005_black_thunder")
        assert site["site_class"] == golden_k_fixture["assertions"]["bt_site_class"]

    def test_k4_bt_workforce_pool_from_employment(self, golden_k_fixture):
        """Black Thunder workforce pool sized by employment_direct, not MW."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
        state = advance_to_year(state, 2029)
        site = find_asset(state["asset_registry"],
                          lambda a: a.get("site_origin_asset_id") == "anchor_56005_black_thunder")
        assert site["workforce_pool_initial"] == golden_k_fixture["assertions"]["bt_workforce_pool_initial"]

    def test_k5_solar_on_mine_site_gets_succession(self, golden_k_fixture):
        """Solar on BT mine site receives TTD reduction and capex discount."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56005_black_thunder', 2028)
        state = advance_to_year(state, 2029)
        state = te.queue_action(state, 'solar_utility', '56005', 100, 2029)
        a = golden_k_fixture["assertions"]
        solar = find_asset(state["asset_registry"],
                           lambda x: x.get("action_id") == "solar_utility"
                           and x.get("geoid") == "56005"
                           and x.get("succession_site_id") == a["solar_succession_site_id"])
        assert solar["ttd_reduction_applied"] == a["solar_ttd_reduction_applied"]
        assert solar["capex_discount_fraction"] == a["solar_capex_discount_fraction"]

    def test_k6_ws_workforce_pool_from_employment(self, golden_k_fixture):
        """WE Soda workforce pool sized by employment (722)."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56037_we_soda_westvaco', 2030)
        state = advance_to_year(state, 2031)
        site = find_asset(state["asset_registry"],
                          lambda a: a.get("site_origin_asset_id") == "anchor_56037_we_soda_westvaco")
        assert site["workforce_pool_initial"] == golden_k_fixture["assertions"]["ws_workforce_pool_initial"]

    def test_k7_ws_mine_site_null_interconnection(self, golden_k_fixture):
        """WE Soda mine site has null interconnection_mw (mines have no MW)."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56037_we_soda_westvaco', 2030)
        state = advance_to_year(state, 2031)
        site = find_asset(state["asset_registry"],
                          lambda a: a.get("site_origin_asset_id") == "anchor_56037_we_soda_westvaco")
        assert site["interconnection_mw"] is None

    def test_k8_y_track_hook_fires_for_trona(self, golden_k_fixture):
        """Y-track hook fires on mine retirement with correct commodity."""
        state = load_state_with_anchors()
        state = te.schedule_retirement(state, 'anchor_56037_we_soda_westvaco', 2030)
        state = advance_to_year(state, 2031)
        retired = find_asset(state["asset_registry"],
                             lambda a: a.get("asset_id") == "anchor_56037_we_soda_westvaco")
        y = retired.get("_mineral_valuation_y_hook")
        assert y is not None, "Y-track hook did not fire"
        assert y["commodity"] == golden_k_fixture["assertions"]["ws_y_track_commodity"]
        assert y["y_track_price"] == golden_k_fixture["assertions"]["ws_y_track_price"]
        assert y["y_track_confidence"] == golden_k_fixture["assertions"]["ws_y_track_confidence"]

    def test_k9_smr_no_succession_on_mine_site(self, golden_k_state, golden_k_fixture):
        """SMR on Sweetwater gets no succession (mine SITE_COMPAT excludes smr_advanced)."""
        smr = find_asset(golden_k_state["asset_registry"],
                         lambda a: a.get("action_id") == "smr_advanced"
                         and a.get("geoid") == "56037"
                         and a.get("decision_year") == 2035)
        assert smr.get("succession_site_id") is None
        assert smr.get("ttd_reduction_applied") is None
        assert smr.get("capex_discount_fraction") is None
        assert smr.get("tx_waiver_mw") is None

    def test_k10_four_contract_digests_match_fixture(self, golden_k_state, golden_k_fixture):
        """All four digest contracts at yr2040 match frozen fixture values."""
        d = golden_k_fixture["digests_yr2040"]
        assert te.state_digest(golden_k_state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(golden_k_state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(golden_k_state)["md5"] == d["existing_assets_digest_md5"]
        assert te.history_digest(golden_k_state)["md5"] == d["history_digest_md5"]

    def test_k11_deterministic(self, golden_k_fixture):
        """Two full replays produce identical state_digest."""
        def replay():
            s = load_state_with_anchors()
            s = te.schedule_retirement(s, 'anchor_56037_we_soda_westvaco', 2030)
            s = te.schedule_retirement(s, 'anchor_56005_black_thunder', 2028)
            s = advance_to_year(s, 2029)
            s = te.queue_action(s, 'solar_utility', '56005', 100, 2029)
            s = advance_to_year(s, 2035)
            s = te.queue_action(s, 'smr_advanced', '56037', 345, 2035)
            s = advance_to_year(s, 2040)
            return s
        s1, s2 = replay(), replay()
        assert te.state_digest(s1)["md5"] == te.state_digest(s2)["md5"]

    def test_k12_ts_python_digest_parity(self, golden_k_state, golden_k_fixture):
        """Python digests match TS Golden K fixture (cross-runtime parity)."""
        d = golden_k_fixture["digests_yr2040"]
        sd = te.state_digest(golden_k_state)
        fd = te.fiscal_digest(golden_k_state)
        ead = te.existing_assets_digest(golden_k_state)
        hd = te.history_digest(golden_k_state)
        assert sd["md5"] == d["state_digest_md5"], f"state: {sd['md5']} vs {d['state_digest_md5']}"
        assert fd["md5"] == d["fiscal_digest_md5"], f"fiscal: {fd['md5']} vs {d['fiscal_digest_md5']}"
        assert ead["md5"] == d["existing_assets_digest_md5"], f"ea: {ead['md5']} vs {d['existing_assets_digest_md5']}"
        assert hd["md5"] == d["history_digest_md5"], f"history: {hd['md5']} vs {d['history_digest_md5']}"
