"""
Execute 07_synthetic_topology.ipynb cells in two phases.
Phase 1: code-cell indices 1,3,5,7,8,10,11,12,14,16,17,19,21,23,25
         (imports → Cell 2 config → Cell 3 artifacts → Cell 4 census →
          Cell 5 weights → Cell 6 bus counts → Cell 7 k-means → Cell 8 load →
          Cell 9 Delaunay → Cell 10 prune → Cell 11 HVDC overlay)
Phase 2: code-cell indices 27, 29, 31
         (Cell 12 branches → Cell 13 calibration → Cell 14 validation)

Usage:
  python run_cells.py phase1   → runs through Cell 11, prints output
  python run_cells.py phase2   → runs Cell 12-14 (requires phase1 kernel still alive)

Because we can't share a kernel across two script invocations, this script
runs the full range in a single kernel, but prints a separator after cell 25
so the operator can review before the phase-2 output scrolls by.
Pass --stop-after-11 to exit after printing Cell 11 output (no phase 2).
"""

import sys
import json
import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError

NB_PATH = "notebooks/07_synthetic_topology.ipynb"
STOP_AFTER_11 = "--stop-after-11" in sys.argv

# Code cell indices for each named cell
PHASE1_INDICES = [1, 3, 5, 7, 8, 10, 11, 12, 14, 16, 17, 19, 21, 23, 25]
PHASE2_INDICES = [27, 29, 31]
CELL_11_INDEX  = 25   # HVDC overlay loop

def cell_outputs_as_text(cell):
    lines = []
    for out in cell.get("outputs", []):
        if out.get("output_type") in ("stream",):
            lines.append("".join(out.get("text", [])))
        elif out.get("output_type") in ("execute_result", "display_data"):
            data = out.get("data", {})
            if "text/plain" in data:
                lines.append("".join(data["text/plain"]))
        elif out.get("output_type") == "error":
            lines.append(f"ERROR — {out.get('ename')}: {out.get('evalue')}")
            lines.append("\n".join(out.get("traceback", [])))
    return "".join(lines)

with open(NB_PATH, encoding="utf-8") as f:
    nb = nbformat.read(f, as_version=4)

run_indices = PHASE1_INDICES if STOP_AFTER_11 else PHASE1_INDICES + PHASE2_INDICES

client = NotebookClient(
    nb,
    timeout=600,
    kernel_name="python3",
    resources={"metadata": {"path": "notebooks/"}},
)

# Indices whose output should always be printed in full
VERBOSE_INDICES = set(PHASE2_INDICES) | {CELL_11_INDEX}

with client.setup_kernel():
    for idx in run_indices:
        cell = nb.cells[idx]
        label = "".join(cell["source"])[:60].replace("\n", " ")
        verbose = idx in VERBOSE_INDICES

        if verbose:
            print(f"\n{'='*70}")
            print(f"Executing cell index {idx}: {label!r}...")
            print('='*70)
        else:
            print(f"  running cell {idx}...", end=" ", flush=True)

        try:
            client.execute_cell(cell, idx)
        except CellExecutionError as exc:
            print(f"\n*** CELL EXECUTION ERROR (index {idx}) ***")
            print(str(exc)[:2000])
            sys.exit(1)

        out_text = cell_outputs_as_text(cell)
        if verbose:
            if out_text.strip():
                print(out_text, end="" if out_text.endswith("\n") else "\n")
            else:
                print("  (no output)")
        else:
            print("done")

        # Pause boundary after Cell 11
        if idx == CELL_11_INDEX:
            print()
            print("=" * 70)
            print("PAUSE — Cell 11 complete. Continuing to Cell 12...")
            print("=" * 70)
            if STOP_AFTER_11:
                print("\nExiting after Cell 11 as requested.")
                sys.exit(0)

print("\nAll requested cells executed successfully.")
