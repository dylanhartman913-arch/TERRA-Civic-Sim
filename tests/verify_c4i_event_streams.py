"""Fresh-process byte verifier for the Python and TypeScript C4-i streams."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from c4i_event_harness import ACTIVE_LENSES, ACTIVE_SEEDS, active_event_matrix
from hazard_events import canonical_event_stream, sample_climate_hazard_events


def _emit_python(path: Path) -> None:
    events = active_event_matrix(sample_climate_hazard_events)
    path.write_bytes(canonical_event_stream(events))


def _run_python(path: Path) -> None:
    subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--emit-python", str(path)],
        cwd=ROOT,
        check=True,
    )


def _run_typescript(path: Path) -> None:
    environment = os.environ.copy()
    environment["C4I_EVENT_OUTPUT"] = str(path)
    subprocess.run(
        [
            "npm",
            "test",
            "--",
            "--run",
            "tests/parity/c4i-events.test.ts",
        ],
        cwd=ROOT / "terra-app",
        env=environment,
        check=True,
    )


def verify(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "python_1": output_dir / "python-events-run1.json",
        "python_2": output_dir / "python-events-run2.json",
        "typescript_1": output_dir / "typescript-events-run1.json",
        "typescript_2": output_dir / "typescript-events-run2.json",
    }
    _run_python(paths["python_1"])
    _run_python(paths["python_2"])
    _run_typescript(paths["typescript_1"])
    _run_typescript(paths["typescript_2"])

    streams = {name: path.read_bytes() for name, path in paths.items()}
    if streams["python_1"] != streams["python_2"]:
        raise AssertionError("Python fresh-process streams differ")
    if streams["typescript_1"] != streams["typescript_2"]:
        raise AssertionError("TypeScript fresh-process streams differ")
    if streams["python_1"] != streams["typescript_1"]:
        raise AssertionError("Python and TypeScript event streams differ byte-wise")

    events = json.loads(streams["python_1"])
    kinds = sorted({event["hazard_kind"] for event in events})
    counties = {event["geoid"] for event in events}
    years = {event["year"] for event in events}
    digest = hashlib.sha256(streams["python_1"]).hexdigest()
    print(
        json.dumps(
            {
                "byte_count": len(streams["python_1"]),
                "county_count": len(counties),
                "event_count": len(events),
                "hazard_kinds": kinds,
                "matrix_cells": len(ACTIVE_LENSES) * len(ACTIVE_SEEDS),
                "sha256": digest,
                "year_count": len(years),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--emit-python", type=Path)
    arguments = parser.parse_args()
    if arguments.emit_python is not None:
        _emit_python(arguments.emit_python)
    elif arguments.output is not None:
        verify(arguments.output)
    else:
        parser.error("one of --output or --emit-python is required")
