#!/usr/bin/env python3
"""Validate flagship county-card capacity provenance and its audit."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARDS = ROOT / "terra-app" / "src" / "data" / "county_cards.json"
DEFAULT_PROCESSED_CARDS = ROOT / "data" / "processed" / "mw_county_cards.json"
DEFAULT_AUDIT = ROOT / "county_card_capacity_audit.csv"
ALLOWED_BASES = {"nameplate", "net_summer", "net_winter", "planning", "load"}
DEMAND_TYPES = {"data_center"}
VINTAGE_RE = re.compile(r"^\d{4}(?:-(?:0[1-9]|1[0-2]))?$")


def _load_cards(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _load_audit(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def validate(
    cards: dict[str, Any], audit_rows: list[dict[str, str]]
) -> list[str]:
    errors: list[str] = []
    flagships: dict[tuple[str, str], dict[str, Any]] = {}

    for card_geoid, card in cards.items():
        for asset in card.get("flagship_assets", []):
            key = (card_geoid, asset.get("name", ""))
            if key in flagships:
                errors.append(f"duplicate flagship {key[0]} / {key[1]}")
            flagships[key] = asset

            for field in ("capacity_or_load_mw", "capacity_basis", "capacity_vintage", "source_url"):
                if field not in asset:
                    errors.append(f"{key[0]} / {key[1]} missing {field}")

            capacity = asset.get("capacity_or_load_mw")
            basis = asset.get("capacity_basis")
            vintage = asset.get("capacity_vintage")
            asset_type = asset.get("type")
            source_url = asset.get("source_url")

            if not isinstance(source_url, str) or not source_url.startswith(("https://", "http://")):
                errors.append(f"{key[0]} / {key[1]} has no evidence-bearing source_url")

            if capacity is None:
                if basis is not None or vintage is not None:
                    errors.append(f"{key[0]} / {key[1]} null capacity requires null basis and vintage")
                continue

            if isinstance(capacity, bool) or not isinstance(capacity, (int, float)) or capacity <= 0:
                errors.append(f"{key[0]} / {key[1]} capacity must be a positive number or null")
            if basis not in ALLOWED_BASES:
                errors.append(f"{key[0]} / {key[1]} has invalid or missing capacity_basis")
            if not isinstance(vintage, str) or VINTAGE_RE.fullmatch(vintage) is None:
                errors.append(f"{key[0]} / {key[1]} has invalid or missing capacity_vintage")
            if basis == "load" and asset_type not in DEMAND_TYPES:
                errors.append(f"{key[0]} / {key[1]} uses load basis for non-demand type {asset_type}")
            if asset_type in DEMAND_TYPES and basis != "load":
                errors.append(f"{key[0]} / {key[1]} demand facility must use load basis")

    audit_by_key: dict[tuple[str, str], dict[str, str]] = {}
    for row in audit_rows:
        key = (row.get("geoid", ""), row.get("facility", ""))
        if key in audit_by_key:
            errors.append(f"duplicate audit row {key[0]} / {key[1]}")
        audit_by_key[key] = row

    missing = sorted(set(flagships) - set(audit_by_key))
    extra = sorted(set(audit_by_key) - set(flagships))
    for geoid, name in missing:
        errors.append(f"flagship absent from audit: {geoid} / {name}")
    for geoid, name in extra:
        errors.append(f"audit row has no flagship: {geoid} / {name}")

    for key in sorted(set(flagships) & set(audit_by_key)):
        asset = flagships[key]
        row = audit_by_key[key]
        capacity = asset.get("capacity_or_load_mw")
        audit_capacity = row.get("capacity_or_load_mw", "")
        expected_capacity = "" if capacity is None else str(capacity)
        for column, expected in (
            ("capacity_or_load_mw", expected_capacity),
            ("capacity_basis", asset.get("capacity_basis") or ""),
            ("capacity_vintage", asset.get("capacity_vintage") or ""),
            ("source_url", asset.get("source_url") or ""),
        ):
            if row.get(column, "") != expected:
                errors.append(
                    f"{key[0]} / {key[1]} audit {column}={row.get(column, '')!r}; expected {expected!r}"
                )

    if len(flagships) != 8:
        errors.append(f"expected 8 flagship records, found {len(flagships)}")
    if len(audit_rows) != 8:
        errors.append(f"expected 8 audit rows, found {len(audit_rows)}")
    return errors


def flagship_records(cards: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (geoid, asset["name"]): asset
        for geoid, card in cards.items()
        for asset in card.get("flagship_assets", [])
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--processed-cards", type=Path, default=DEFAULT_PROCESSED_CARDS)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    args = parser.parse_args()
    cards = _load_cards(args.cards)
    processed_cards = _load_cards(args.processed_cards)
    errors = validate(cards, _load_audit(args.audit))
    if flagship_records(cards) != flagship_records(processed_cards):
        errors.append("application and processed flagship records differ")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Validated 8 flagship county-card capacity records and 8 audit rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
