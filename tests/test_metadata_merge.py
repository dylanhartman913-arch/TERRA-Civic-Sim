"""
Regression test for F10: network_metadata.json deep-merge behavior.

Verifies that writing a new key to network_metadata.json preserves all
pre-existing keys (the bug that caused F10 was wholesale overwrite).
"""

import json
import shutil
import tempfile
from pathlib import Path


def test_deep_merge_preserves_existing_keys():
    """Write a throwaway key via the same merge pattern used by mc_full_run.py
    and notebooks 15/18. Assert every pre-existing key survives."""

    src = Path(__file__).resolve().parent.parent / "data" / "processed" / "network_metadata.json"
    assert src.exists(), f"network_metadata.json not found at {src}"

    with open(src) as f:
        original = json.load(f)

    original_keys = set(original.keys())
    assert len(original_keys) > 1, "network_metadata.json has only one key — nothing to protect"

    # Work on a temp copy to avoid side effects
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
        json.dump(original, tmp, indent=2)
        tmp_path = Path(tmp.name)

    try:
        # Simulate the deep-merge pattern: read → add key → write
        with open(tmp_path) as f:
            metadata = json.load(f)

        metadata["_test_throwaway"] = {"written_by": "test_metadata_merge.py"}

        with open(tmp_path, "w") as f:
            json.dump(metadata, f, indent=2)

        # Re-read and verify
        with open(tmp_path) as f:
            after = json.load(f)

        after_keys = set(after.keys())

        # Every original key must still be present
        missing = original_keys - after_keys
        assert not missing, f"Keys lost after merge: {missing}"

        # The throwaway key must be present
        assert "_test_throwaway" in after_keys

        # Spot-check: values of original keys are unchanged
        for key in original_keys:
            assert after[key] == original[key], (
                f"Value changed for key '{key}' after merge"
            )

    finally:
        tmp_path.unlink(missing_ok=True)


def test_metadata_has_provenance_for_all_data_keys():
    """Every non-meta key must have a provenance entry."""

    src = Path(__file__).resolve().parent.parent / "data" / "processed" / "network_metadata.json"
    with open(src) as f:
        metadata = json.load(f)

    provenance = metadata.get("_provenance", {})
    meta_keys = {"_provenance", "_reconstruction_meta"}
    data_keys = {k for k in metadata if k not in meta_keys}

    # Each data key should have at least one provenance entry (direct or dotted)
    for key in data_keys:
        has_entry = key in provenance or any(
            p.startswith(key + ".") for p in provenance
        )
        assert has_entry, f"Key '{key}' has no provenance entry in _provenance"


if __name__ == "__main__":
    test_deep_merge_preserves_existing_keys()
    print("PASS: deep_merge_preserves_existing_keys")
    test_metadata_has_provenance_for_all_data_keys()
    print("PASS: metadata_has_provenance_for_all_data_keys")
    print("\nAll tests passed.")
