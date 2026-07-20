"""Build the compact, cross-runtime Wyoming county agriculture engine input."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
APP_DATA = ROOT / "terra-app" / "src" / "data"

DIVERSION_AF_PER_IRRIGATED_ACRE = 2.0
CONSUMPTIVE_AF_PER_IRRIGATED_ACRE = 1.2
CATTLE_FORAGE_ELASTICITY = 0.75


def _value(record: dict, default: float = 0.0) -> float:
    value = record.get("value")
    return default if value is None else float(value)


def build() -> dict:
    source = json.loads((PROCESSED / "wy_county_ag_baseline.json").read_text())
    fiscal = json.loads((PROCESSED / "wy_fiscal_coefficients.json").read_text())
    assessment_rate = float(
        fiscal["_ag_fiscal_coefficients"]
        ["ag_assessed_value_by_class_usd_per_acre"]["assessment_rate"]
    )
    active_usfs_acres: dict[str, float] = defaultdict(float)
    with (PROCESSED / "wy_grazing_allotments.csv").open(newline="") as handle:
        for row in csv.DictReader(handle):
            if row["status"] == "ACTIVE" and row["authorized_use_acres"]:
                active_usfs_acres[row["county_geoid"]] += float(row["authorized_use_acres"])

    counties = {}
    for geoid, county in sorted(source["counties"].items()):
        land = county["land_by_use"]
        county_area = _value(land["county_area_acres"])
        cropland = _value(land["cropland_acres"])
        irrigated = min(cropland, _value(land["irrigated_acres"]))
        dry = max(0.0, cropland - irrigated)
        private_rangeland = (
            _value(land["pastureland_acres"])
            + _value(land["rangeland_acres"])
        )
        other = max(0.0, county_area - irrigated - dry - private_rangeland)

        forage = county["cattle_and_forage"]
        stocking_rate = _value(forage["stocking_rate_aum_per_acre"])
        private_aum = _value(forage["aum_capacity"])
        federal_acres = active_usfs_acres.get(geoid, 0.0)
        federal_aum = federal_acres * stocking_rate
        diversion = irrigated * DIVERSION_AF_PER_IRRIGATED_ACRE
        consumptive = irrigated * CONSUMPTIVE_AF_PER_IRRIGATED_ACRE
        rap = county["rap_invasive_cover"]
        valuation = county["dor_ag_productive_value_coefficients_usd_per_acre"]

        counties[geoid] = {
            "geoid": geoid,
            "county_name": county["county_name"],
            "land_acres": {
                "irrigated_crop": round(irrigated, 6),
                "dry_crop": round(dry, 6),
                "private_rangeland": round(private_rangeland, 6),
                "easement_protected": 0.0,
                "converted_to_energy": 0.0,
                "other": round(other, 6),
            },
            "water_acre_feet": {
                "ag_consumptive": round(consumptive, 6),
                "ag_diversion": round(diversion, 6),
                "energy": 0.0,
                "other": 0.0,
                "county_supply": round(diversion + consumptive, 6),
            },
            "forage_aum": {
                "private": round(private_aum, 6),
                "federal": round(federal_aum, 6),
                "index": 1.0,
            },
            "cattle_head": round(_value(forage["beef_cows_head"]), 6),
            "annual_grass_cover_fraction": round(
                _value(rap["current_cover_pct"]) / 100.0, 8
            ),
            "stocking_rate_aum_per_acre": stocking_rate,
            "cattle_forage_elasticity": CATTLE_FORAGE_ELASTICITY,
            "ag_assessment_rate": assessment_rate,
            "productive_value_usd_per_acre": {
                "irrigated_crop": _value(valuation["irrigated"]),
                "dry_crop": _value(valuation["dryland"]),
                "private_rangeland": _value(valuation["grazing_land"]),
            },
            "federal_authorized_use_acres": round(federal_acres, 6),
        }

    return {
        "schema_version": "county-ag-engine-v1",
        "vintage": source["vintage"],
        "county_count": len(counties),
        "coefficients": {
            "diversion_af_per_irrigated_acre": DIVERSION_AF_PER_IRRIGATED_ACRE,
            "consumptive_af_per_irrigated_acre": CONSUMPTIVE_AF_PER_IRRIGATED_ACRE,
            "cattle_forage_elasticity": CATTLE_FORAGE_ELASTICITY,
            "cattle_elasticity_bounds": [0.5, 1.0],
            "ag_assessment_rate": assessment_rate,
            "water_proxy_note": (
                "Planning proxy used because AG0 SEO county observations are null; "
                "diversion and consumptive use remain separate fields."
            ),
            "federal_aum_proxy_note": (
                "Active USFS authorized-use acres multiplied by the AG0 county "
                "stocking-rate coefficient; source CSV has no authorized-AUM field."
            ),
        },
        "counties": counties,
    }


def main() -> None:
    payload = build()
    rendered = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    (PROCESSED / "wy_county_ag_engine_baseline.json").write_text(rendered)
    (APP_DATA / "county_ag_baseline.json").write_text(rendered)

    # AG1's processed library is the canonical post-schema-bump source. The app
    # copy is a runtime fixture, not an independently maintained action library.
    action_library = (PROCESSED / "mw_action_library_v3.json").read_text()
    (APP_DATA / "action_library_v3.json").write_text(action_library)


if __name__ == "__main__":
    main()
