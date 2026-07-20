"""Emit Python four-contract replay artifacts for the A-M inertness matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import terra_engine as te
from c4i_event_harness import load_hazard_baselines, load_projection_points


FIXTURE_DIR = ROOT / "terra-app" / "tests" / "parity" / "fixtures"
TS_DATA_DIR = ROOT / "terra-app" / "src" / "data"
DATA_DIR = ROOT / "data" / "processed"
if not (DATA_DIR / "synthetic_buses.geojson").exists():
    _main = Path(
        "/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming/"
        "Research/Energy Modeling/energy-map/data/processed"
    )
    if (_main / "synthetic_buses.geojson").exists():
        DATA_DIR = _main

FIXTURE_IDS = (
    "golden_a",
    "golden_b",
    "golden_c",
    "golden_d",
    "golden_e",
    "golden_f",
    "golden_g",
    "golden_g_prime",
    "golden_h",
    "golden_i",
    "golden_j",
    "golden_j_prime",
    "golden_k",
    "golden_l",
    "golden_m",
)


def _fixture(name: str) -> dict:
    with (FIXTURE_DIR / f"{name}.json").open() as handle:
        return json.load(handle)


def _retirements() -> dict:
    with (TS_DATA_DIR / "baseline_retirements.json").open() as handle:
        raw = json.load(handle)
    return {key: value for key, value in raw.items() if key != "_meta"}


def _initial(with_retirements: bool, migration_enabled: bool) -> dict:
    state = te.initialize_state(
        data_dir=DATA_DIR,
        baseline_retirements=_retirements() if with_retirements else None,
    )
    state["population_config"]["migration_enabled"] = migration_enabled
    return state


def _advance(state: dict, target_year: int, climate_context: dict) -> dict:
    while state["year"] < target_year:
        state = te.advance_year(state, climate_context=climate_context)
    return state


def _queue(state: dict, entry: dict, climate_context: dict, override=None) -> dict:
    return te.queue_action(
        state,
        entry.get("action_id", entry.get("action")),
        entry["geoid"],
        entry["magnitude"],
        entry.get("year", entry.get("decision_year", state["year"])),
        override_operational_year=override,
        climate_context=climate_context,
    )


def _apply(state: dict, entry: dict, climate_context: dict) -> dict:
    state, _ = te.apply_action(
        state,
        entry.get("action_id", entry.get("action")),
        entry.get("geoid", entry.get("location")),
        entry["magnitude"],
        climate_context=climate_context,
    )
    return state


def _golden_b(
    climate_context: dict,
    migration_enabled: bool,
    with_retirements: bool = False,
) -> dict:
    fixture = _fixture("golden_b")
    state = _initial(with_retirements, migration_enabled)
    for asset in fixture["inputs"]["pre_placed_assets"]:
        state = _queue(state, asset, climate_context, asset.get("override_op"))
    state = _advance(state, 2028, climate_context)
    sequence = fixture["inputs"]["player_sequence"]
    state = _queue(state, sequence[0], climate_context, 2032)
    state = _queue(state, sequence[1], climate_context, 2032)
    state = _queue(state, sequence[2], climate_context)
    for entry in sequence[3:6]:
        state = _apply(state, entry, climate_context)
    state = _queue(state, sequence[6], climate_context)
    return _advance(state, 2032, climate_context)


def _golden_j_base(climate_context: dict, migration_enabled: bool) -> dict:
    state = _initial(True, migration_enabled)
    state = te.queue_action(
        state,
        "data_center_hyperscale",
        "56021",
        100,
        2025,
        climate_context=climate_context,
    )
    state = te.queue_action(
        state,
        "data_center_campus_phase",
        "56021",
        200,
        2025,
        climate_context=climate_context,
    )
    state = te.queue_action(
        state,
        "smr_advanced",
        "56023",
        345,
        2025,
        override_operational_year=2031,
        climate_context=climate_context,
    )
    state = _advance(state, 2028, climate_context)
    for action_id, geoid, magnitude, override in (
        ("smr_advanced", "56021", 345, 2032),
        ("smr_advanced", "56021", 345, 2032),
        ("transmission_230kv", "56021", 50, None),
    ):
        state = te.queue_action(
            state,
            action_id,
            geoid,
            magnitude,
            2028,
            override_operational_year=override,
            climate_context=climate_context,
        )
    for action_id, geoid, magnitude in (
        ("workforce_retraining", "56021", 1000),
        ("workforce_retraining", "56023", 1000),
        ("affordable_housing", "56021", 500),
    ):
        state, _ = te.apply_action(
            state,
            action_id,
            geoid,
            magnitude,
            climate_context=climate_context,
        )
    return te.queue_action(
        state,
        "battery_grid",
        "56021",
        1000,
        2028,
        climate_context=climate_context,
    )


def replay_fixture(
    fixture_id: str,
    climate_context: dict,
    migration_enabled: bool,
) -> dict:
    if fixture_id == "golden_a":
        state = _initial(False, migration_enabled)
        for entry in _fixture(fixture_id)["steps"]:
            state = _apply(state, entry, climate_context)
        return state
    if fixture_id == "golden_b":
        return _golden_b(climate_context, migration_enabled)
    if fixture_id == "golden_c":
        state = _advance(
            _golden_b(climate_context, migration_enabled), 2033, climate_context
        )
        for geoid, magnitude in (
            ("56021", 200),
            ("56005", 100),
            ("56025", 100),
            ("56037", 100),
        ):
            state, _ = te.apply_action(
                state,
                "industrial_load_flexible",
                geoid,
                magnitude,
                climate_context=climate_context,
            )
        return state
    if fixture_id == "golden_d":
        fixture = _fixture(fixture_id)
        state = _initial(False, migration_enabled)
        for entry in fixture["inputs"]["pre_placed_assets"]:
            state = _queue(state, entry, climate_context, entry.get("override_op"))
        for entry in fixture["inputs"]["campbell_retirements"]:
            state = _queue(state, entry, climate_context)
        state = _advance(state, 2028, climate_context)
        sequence = fixture["inputs"]["player_sequence"]
        state = _queue(state, sequence[0], climate_context, 2032)
        state = _queue(state, sequence[1], climate_context, 2032)
        state = _queue(state, sequence[2], climate_context)
        for entry in sequence[3:6]:
            state = _apply(state, entry, climate_context)
        state = _queue(state, sequence[6], climate_context)
        return _advance(state, 2045, climate_context)
    if fixture_id == "golden_e":
        return _initial(False, migration_enabled)
    if fixture_id == "golden_f":
        state, _ = te.reduce_production_asset(
            _initial(False, migration_enabled), "56005", "coal_surface", 10_000_000
        )
        return state
    if fixture_id in ("golden_g", "golden_g_prime"):
        return _advance(_initial(True, migration_enabled), 2045, climate_context)
    if fixture_id == "golden_h":
        state = _advance(_initial(True, migration_enabled), 2026, climate_context)
        state = te.queue_action(
            state,
            "smr_advanced",
            "56023",
            345,
            2026,
            override_operational_year=2030,
            climate_context=climate_context,
        )
        state, _ = te.apply_action(
            state,
            "housing_retrofit_affordable",
            "56023",
            300,
            climate_context=climate_context,
        )
        state = te.queue_action(
            state,
            "affordable_housing",
            "56023",
            100,
            2026,
            override_operational_year=2027,
            climate_context=climate_context,
        )
        return _advance(state, 2034, climate_context)
    if fixture_id == "golden_i":
        return _advance(_initial(True, migration_enabled), 2041, climate_context)
    if fixture_id in ("golden_j", "golden_j_prime"):
        return _advance(
            _golden_j_base(climate_context, migration_enabled),
            2088,
            climate_context,
        )
    if fixture_id == "golden_k":
        state = _initial(False, migration_enabled)
        state = te.schedule_retirement(
            state, "anchor_56037_we_soda_westvaco", 2030
        )
        state = te.schedule_retirement(
            state, "anchor_56005_black_thunder", 2028
        )
        state = _advance(state, 2029, climate_context)
        state = te.queue_action(
            state,
            "solar_utility",
            "56005",
            100,
            2029,
            climate_context=climate_context,
        )
        state = _advance(state, 2035, climate_context)
        state = te.queue_action(
            state,
            "smr_advanced",
            "56037",
            345,
            2035,
            climate_context=climate_context,
        )
        return _advance(state, 2040, climate_context)
    if fixture_id == "golden_l":
        state = _initial(True, migration_enabled)
        for entry in _fixture(fixture_id)["action_log"]:
            state = te.queue_action(
                state,
                entry["action_id"],
                entry["geoid"],
                entry["magnitude"],
                entry["decision_year"],
                climate_context=climate_context,
            )
        return _advance(state, 2050, climate_context)
    if fixture_id == "golden_m":
        lens = climate_context["lens"]
        state = _initial(True, migration_enabled)
        state, _ = te.apply_action(
            state, "heat_resilience_upgrade", "56037", 1
        )
        baselines = load_hazard_baselines()
        projections = load_projection_points()
        for year in range(2026, 2031):
            events = te.sample_hazard_events(
                state,
                seed=42,
                lens=lens,
                years=[year],
                county_baselines=baselines,
                projection_points=projections,
            )
            state, _ = te.apply_hazard_event_consequences(state, events)
            state = te.advance_year(
                state, climate_context={"lens": "historical", "tables": {}}
            )
        return state
    raise ValueError(f"Unknown fixture_id {fixture_id!r}")


def _canonical_bytes(value) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        + "\n"
    ).encode("utf-8")


def _contract_payloads(state: dict, lens: str) -> dict[str, tuple[object, str]]:
    state_digest = te.state_digest(
        state, climate_lens=lens if lens != "historical" else None
    )
    fiscal_digest = te.fiscal_digest(state)
    assets_digest = te.existing_assets_digest(state)
    history_digest = te.history_digest(state)
    return {
        "state_digest": (
            {key: value for key, value in state_digest.items() if key != "md5"},
            state_digest["md5"],
        ),
        "fiscal_digest": (
            {key: value for key, value in fiscal_digest.items() if key != "md5"},
            fiscal_digest["md5"],
        ),
        "existing_assets_digest": (
            {key: value for key, value in assets_digest.items() if key != "md5"},
            assets_digest["md5"],
        ),
        "history_digest": (
            {
                "history": state.get("history", []),
                "n_years": history_digest["n_years"],
                "year_range": history_digest["year_range"],
            },
            history_digest["md5"],
        ),
    }


def emit(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tables = _fixture("golden_l")["climate_table_slice"]["ssp370"]
    rows = []
    for fixture_id in FIXTURE_IDS:
        for lens in ("historical", "ssp370"):
            context = {"lens": lens, "tables": {} if lens == "historical" else tables}
            for migration_enabled in (False, True):
                state = replay_fixture(fixture_id, context, migration_enabled)
                for contract, (payload, contract_md5) in _contract_payloads(
                    state, lens
                ).items():
                    migration = "on" if migration_enabled else "off"
                    filename = (
                        f"{fixture_id}__{lens}__migration-{migration}__python__"
                        f"{contract}.json"
                    )
                    payload_bytes = _canonical_bytes(payload)
                    (output_dir / filename).write_bytes(payload_bytes)
                    rows.append(
                        {
                            "contract": contract,
                            "contract_md5": contract_md5,
                            "fixture": fixture_id,
                            "lens": lens,
                            "migration_enabled": migration_enabled,
                            "payload_bytes": len(payload_bytes),
                            "payload_file": filename,
                            "payload_sha256": hashlib.sha256(payload_bytes).hexdigest(),
                            "runtime": "python",
                        }
                    )
    rows.sort(
        key=lambda row: (
            row["fixture"],
            row["lens"],
            row["migration_enabled"],
            row["runtime"],
            row["contract"],
        )
    )
    manifest = _canonical_bytes(rows)
    (output_dir / "manifest.json").write_bytes(manifest)
    print(
        json.dumps(
            {
                "artifact_bytes": sum(row["payload_bytes"] for row in rows),
                "manifest_sha256": hashlib.sha256(manifest).hexdigest(),
                "matrix_cells": len(rows),
                "runtime": "python",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    emit(parser.parse_args().output)
