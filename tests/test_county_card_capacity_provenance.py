import copy
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_county_card_capacities import flagship_records, validate  # noqa: E402


def _inputs():
    with (ROOT / "terra-app/src/data/county_cards.json").open(encoding="utf-8") as handle:
        cards = json.load(handle)
    with (ROOT / "county_card_capacity_audit.csv").open(newline="", encoding="utf-8") as handle:
        audit = list(csv.DictReader(handle))
    return cards, audit


def test_all_flagships_have_valid_capacity_provenance_and_audit_rows():
    cards, audit = _inputs()
    assert validate(cards, audit) == []
    with (ROOT / "data/processed/mw_county_cards.json").open(encoding="utf-8") as handle:
        processed_cards = json.load(handle)
    assert flagship_records(cards) == flagship_records(processed_cards)


def test_validator_rejects_non_null_capacity_without_basis():
    cards, audit = _inputs()
    broken = copy.deepcopy(cards)
    broken["56009"]["flagship_assets"][0]["capacity_basis"] = None
    assert any("invalid or missing capacity_basis" in error for error in validate(broken, audit))


def test_validator_reserves_load_basis_for_demand_facilities():
    cards, audit = _inputs()
    broken = copy.deepcopy(cards)
    broken["56009"]["flagship_assets"][0]["capacity_basis"] = "load"
    assert any("load basis for non-demand type coal" in error for error in validate(broken, audit))


def test_dave_and_jim_reconciliations_remain_explicit():
    cards, audit = _inputs()
    by_name = {row["facility"]: row for row in audit}
    dave = cards["56009"]["flagship_assets"][0]
    jim = cards["56037"]["flagship_assets"][0]

    assert (dave["capacity_or_load_mw"], dave["capacity_basis"], dave["capacity_vintage"]) == (
        816.7,
        "nameplate",
        "2026-05",
    )
    assert "745 MW net summer" in dave["notes"]
    assert "755 MW net winter" in dave["notes"]
    assert "2,326 MW" in jim["notes"]
    assert by_name["Jim Bridger Power Plant"]["disposition"] == "preserve_2120"
