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
        assert hook["delay_cost_hook"] == 0

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
        assert hook["sunk_cost_fraction"] == 0

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
        assert digest["md5"] == "a881df20643298394d53c2ac43012fe3"


# ═══════════════════════════════════════════════════════════════════════════════
# Golden G — Scheduled Baseline Retirements 2025→2045 (10 tests)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def golden_g_fixture():
    with open(FIXTURE_DIR / "golden_g.json") as f:
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

    def test_7g_digests_2027(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2027)
        d = golden_g_fixture["digests_yr2027"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7h_digests_2031(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2031)
        d = golden_g_fixture["digests_yr2031"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7i_digests_2045(self, golden_g_fixture):
        state = advance_to_year(load_state_with_retirements(), 2045)
        d = golden_g_fixture["digests_yr2045"]
        assert te.state_digest(state)["md5"] == d["state_digest_md5"]
        assert te.fiscal_digest(state)["md5"] == d["fiscal_digest_md5"]
        assert te.existing_assets_digest(state)["md5"] == d["existing_assets_digest_md5"]

    def test_7j_original_state_unmodified(self):
        state = load_state_with_retirements()
        digest_before = te.state_digest(state)["md5"]
        advance_to_year(state, 2045)
        digest_after = te.state_digest(state)["md5"]
        assert digest_after == digest_before
