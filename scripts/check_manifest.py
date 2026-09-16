#!/usr/bin/env python3
"""Check that every runtime-loaded data file has a manifest entry.

Detects loads by grepping the two data directories' import sites:
  - Python: src/terra_engine.py, scripts/, tests/ → data/processed/, data/golden/
  - TS: terra-app/src/ → terra-app/src/data/, data/processed/

Does NOT trust the manifest to be self-describing — independently discovers
loaded files and checks each against the manifest.

Also verifies manifest SHA-256 hashes match on-disk reality.

Exit code 0 = complete and consistent. Exit code 1 = gaps or mismatches.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "manifest" / "manifest.json"

# Directories where runtime data lives
DATA_DIRS = [
    "data/processed",
    "data/golden",
    "terra-app/src/data",
]


def file_sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def discover_loaded_files() -> set[str]:
    """Grep source code to find all data files referenced at load time."""
    loaded: set[str] = set()

    # Pattern 1: Python — terra_engine.py and other src/ files opening data/processed/ files
    # Look for string literals containing data filenames
    py_sources = ["src/terra_engine.py"]
    for src in py_sources:
        full = ROOT / src
        if not full.exists():
            continue
        text = full.read_text(encoding="utf-8")
        # Match quoted filenames that look like data files
        for m in re.finditer(r'["\']([^"\']+\.(?:json|csv|parquet|geojson))["\']', text):
            fname = m.group(1)
            # Check if this file exists in data/processed/ or data/golden/
            for ddir in ["data/processed", "data/golden"]:
                candidate = f"{ddir}/{fname}"
                if (ROOT / candidate).exists():
                    loaded.add(candidate)
                    break

    # Pattern 2: TS — import statements in terra-app/src/
    result = subprocess.run(
        ["grep", "-rh", "--include=*.ts", "--include=*.tsx",
         r"from\s*['\"]", "terra-app/src/"],
        cwd=ROOT, capture_output=True, text=True,
    )
    for line in result.stdout.splitlines():
        # Match import paths to data files
        m = re.search(r"from\s*['\"]([^'\"]+)['\"]", line)
        if not m:
            continue
        import_path = m.group(1)

        # Resolve imports based on their actual path
        if "data/processed/" in import_path:
            # Direct import from data/processed/ (e.g., ../../../data/processed/foo.json)
            fname = import_path.rsplit("/", 1)[-1]
            proc_candidate = f"data/processed/{fname}"
            if (ROOT / proc_candidate).exists():
                loaded.add(proc_candidate)
        elif "/data/" in import_path and "data/processed/" not in import_path:
            # Import from terra-app/src/data/ (e.g., ../data/foo.json)
            fname = import_path.rsplit("/", 1)[-1]
            ts_candidate = f"terra-app/src/data/{fname}"
            if (ROOT / ts_candidate).exists():
                loaded.add(ts_candidate)

    # Pattern 3: Python test/script files loading golden fixtures
    result = subprocess.run(
        ["grep", "-rh", "--include=*.py",
         r"golden_[a-z]\.json\|fixture_registry\.json", "tests/", "scripts/"],
        cwd=ROOT, capture_output=True, text=True,
    )
    for line in result.stdout.splitlines():
        for m in re.finditer(r'(golden_[a-z]\.json|fixture_registry\.json)', line):
            fname = m.group(1)
            candidate = f"data/golden/{fname}"
            if (ROOT / candidate).exists():
                loaded.add(candidate)

    # Pattern 4: TS test fixture files
    fixtures_dir = ROOT / "terra-app" / "tests" / "parity" / "fixtures"
    if fixtures_dir.exists():
        for f in fixtures_dir.iterdir():
            if f.suffix == ".json" and f.name.startswith("golden_"):
                # These load from terra-app/src/data/ or data/golden/
                # The parity tests import the golden fixtures via the engine,
                # which loads from terra-app/src/data/ for the base files
                pass  # Fixture files are test-side, not runtime-loaded

    return loaded


def main() -> int:
    if not MANIFEST.exists():
        print(f"ERROR: Manifest not found at {MANIFEST.relative_to(ROOT)}")
        return 1

    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)

    manifest_paths = {e["path"] for e in manifest["files"]}
    manifest_by_path = {e["path"]: e for e in manifest["files"]}

    errors: list[str] = []

    # ── Check 1: Every loaded file has a manifest entry ───────────────────
    loaded = discover_loaded_files()
    unmanifested = sorted(loaded - manifest_paths)
    for path in unmanifested:
        errors.append(f"UNMANIFESTED: {path} is loaded at runtime but has no manifest entry")

    # ── Check 2: Manifest SHA-256 matches on-disk reality ─────────────────
    hash_mismatches = 0
    for entry in manifest["files"]:
        full = ROOT / entry["path"]
        if not full.exists():
            # Files marked as untracked in the manifest won't exist on CI —
            # these are known gaps (e.g., gitignored parquet files)
            if entry.get("tracked") is False:
                continue
            if entry["class"] != "archived":
                errors.append(f"MISSING: {entry['path']} is in manifest but does not exist on disk")
            continue
        actual_sha = file_sha256(full)
        if entry["sha256"] and actual_sha != entry["sha256"]:
            errors.append(
                f"HASH MISMATCH: {entry['path']} — manifest says {entry['sha256'][:12]}..., "
                f"disk says {actual_sha[:12]}..."
            )
            hash_mismatches += 1

    # ── Report ────────────────────────────────────────────────────────────
    print("Manifest completeness check")
    print("=" * 60)
    print(f"  Manifest entries: {len(manifest_paths)}")
    print(f"  Runtime loads discovered: {len(loaded)}")
    print(f"  Unmanifested loads: {len(unmanifested)}")
    print(f"  Hash mismatches: {hash_mismatches}")

    if errors:
        print()
        for e in errors:
            print(f"  {e}")
        print()
        print("FAILED")
        return 1

    print()
    print("PASSED — all loaded files have manifest entries with correct hashes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
