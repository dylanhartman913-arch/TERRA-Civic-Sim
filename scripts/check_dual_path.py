#!/usr/bin/env python3
"""Check that dual-path promotion pairs are byte-identical.

Reads data/manifest/manifest.json, finds all file pairs where
dual_path_relationship == "promotion", and verifies SHA-256 identity.

Transform pairs (different schema/format by design) are reported
but not enforced — they require structural checks, not byte identity.

Exit code 0 = all promotion pairs match. Exit code 1 = at least one mismatch.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "manifest" / "manifest.json"


def file_sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)

    # Collect promotion pairs (deduplicate: only check each pair once)
    seen: set[tuple[str, str]] = set()
    pairs: list[tuple[str, str]] = []
    transform_pairs: list[tuple[str, str]] = []

    for entry in manifest["files"]:
        dp = entry.get("dual_path")
        rel = entry.get("dual_path_relationship")
        if dp is None:
            continue
        key = tuple(sorted([entry["path"], dp]))
        if key in seen:
            continue
        seen.add(key)
        if rel == "promotion":
            pairs.append((entry["path"], dp))
        elif rel == "transform":
            transform_pairs.append((entry["path"], dp))

    errors: list[str] = []
    passed = 0

    print("Dual-path identity check (promotion pairs)")
    print("=" * 60)

    for path_a, path_b in sorted(pairs):
        full_a = ROOT / path_a
        full_b = ROOT / path_b

        if not full_a.exists():
            errors.append(f"MISSING  {path_a}")
            print(f"  MISSING  {path_a}")
            continue
        if not full_b.exists():
            errors.append(f"MISSING  {path_b}")
            print(f"  MISSING  {path_b}")
            continue

        sha_a = file_sha256(full_a)
        sha_b = file_sha256(full_b)

        if sha_a == sha_b:
            print(f"  MATCH    {Path(path_a).name} <-> {Path(path_b).name}")
            passed += 1
        else:
            errors.append(
                f"MISMATCH {Path(path_a).name} ({sha_a[:12]}) != {Path(path_b).name} ({sha_b[:12]})"
            )
            print(f"  MISMATCH {Path(path_a).name} ({sha_a[:12]}) != {Path(path_b).name} ({sha_b[:12]})")

    print()
    print(f"Promotion pairs: {passed} match, {len(errors)} errors")

    if transform_pairs:
        print()
        print(f"Transform pairs (not enforced, {len(transform_pairs)} pairs):")
        for path_a, path_b in sorted(transform_pairs):
            print(f"  {Path(path_a).name} <-> {Path(path_b).name}")

    if errors:
        print()
        print("FAILED — promotion pairs must be byte-identical.")
        for e in errors:
            print(f"  {e}")
        return 1

    print()
    print("PASSED — all promotion pairs are byte-identical.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
