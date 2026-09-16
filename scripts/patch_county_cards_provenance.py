#!/usr/bin/env python3
"""Patch county-card flagship records to match the capacity audit CSV.

Fixes three categories of divergence found by test_county_card_capacity_provenance.py:

1. Missing schema fields: BWXT, PRB Coal Mines, Naughton lack capacity_basis
   and capacity_vintage keys (validator requires them to exist, even as null).
2. Stale source_urls: 5 records have 'needs_citation' or outdated URLs; the
   audit CSV has evidence-bearing URLs.
3. Jim Bridger notes: stripped of '2,326 MW' reconciliation text during nb14
   re-run; audit CSV has the full reconciliation.

Applies identically to both county_cards files (Python + TS).
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PATCHES: dict[tuple[str, str], dict] = {
    ("56005", "BWXT TRISO Fuel Facility"): {
        "capacity_basis": None,
        "capacity_vintage": None,
        "source_url": (
            "https://oilcity.news/community/energy-community/2025/09/25/"
            "bwxt-to-court-gillette-for-500m-nuclear-fuel-manufacturing-plant/"
        ),
        "notes": (
            "BWXT produces TRISO fuel pellets; Gillette WY facility announced "
            "September 2025. An electrical MW value is not applicable to a fuel "
            "manufacturing plant."
        ),
    },
    ("56005", "Powder River Basin Coal Mines"): {
        "capacity_basis": None,
        "capacity_vintage": None,
        # source_url already valid (eia.gov/coal/data.php) — no change
    },
    ("56021", "Meta AI Data Center (Cheyenne)"): {
        "source_url": "https://epoch.ai/data/ai-data-centers/directory/meta-cheyenne",
        "notes": (
            "Meta hyperscale campus in Cheyenne WY. 152 MW is a dated modeled "
            "IT-load estimate (Epoch AI directory, 2026-07-27) rather than an "
            "owner-disclosed load; the former 100 figure was its announced "
            "permanent-job count, not a MW value."
        ),
    },
    ("56021", "Jade/Crusoe Campus Phase 1 (Cheyenne)"): {
        "source_url": "https://tallgrass.com/newsroom/press-releases/Crusoe",
        "notes": (
            "Jade/Crusoe AI computing campus; Laramie County approval 2026. "
            "The developer announcement (Tallgrass, 2025-07-24) describes a "
            "1.8 GW initial campus scalable to 10 GW."
        ),
    },
    ("56023", "Kemmerer Unit 1 (Natrium)"): {
        "source_url": (
            "https://www.terrapower.com/"
            "terrapower-awarded-pivotal-state-permit-for-natrium-plant"
        ),
        "notes": (
            "TerraPower/GE-Hitachi Natrium sodium-cooled fast reactor; "
            "345 MWe planned reactor output. State permit awarded January 2025."
        ),
    },
    ("56023", "Naughton Gas Conversion"): {
        "capacity_basis": None,
        "capacity_vintage": None,
        "source_url": (
            "https://wyofile.com/kemmerer-power-plants-coal-to-natural-gas-"
            "conversion-highlights-uncertainty-for-wyoming-communities/"
        ),
        "notes": (
            "PacifiCorp proposed conversion of Naughton coal units to natural "
            "gas (WyoFile, 2020-09-02). An electrical MW value is not asserted "
            "for the conversion."
        ),
    },
    ("56037", "Jim Bridger Power Plant"): {
        "notes": (
            "PacifiCorp / Pacific Power. Units 3-4 targeted for early retirement "
            "under PacifiCorp IRP; verify current status. The county-card value "
            "(2,120 MW) is the rounded net-capability/planning representation: "
            "EIA reports 2,119 MW net summer and net winter; the distinct "
            "four-unit nameplate total is 2,326 MW."
        ),
    },
}


def patch_file(path: Path) -> int:
    with path.open(encoding="utf-8") as f:
        cards = json.load(f)

    n_patched = 0
    for (geoid, name), updates in PATCHES.items():
        card = cards.get(geoid)
        if card is None:
            raise ValueError(f"geoid {geoid} not found in {path}")
        assets = card.get("flagship_assets", [])
        matched = [a for a in assets if a.get("name") == name]
        if len(matched) != 1:
            raise ValueError(f"{geoid}/{name}: expected 1 match, found {len(matched)} in {path}")
        asset = matched[0]
        for key, value in updates.items():
            asset[key] = value
        n_patched += 1

    with path.open("w", encoding="utf-8") as f:
        json.dump(cards, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return n_patched


def main():
    ts_path = ROOT / "terra-app" / "src" / "data" / "county_cards.json"
    py_path = ROOT / "data" / "processed" / "mw_county_cards.json"

    n1 = patch_file(ts_path)
    print(f"Patched {n1} flagship records in {ts_path.relative_to(ROOT)}")

    n2 = patch_file(py_path)
    print(f"Patched {n2} flagship records in {py_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
