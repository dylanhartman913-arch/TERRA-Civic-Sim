#!/usr/bin/env bash
# provision_worktree.sh — copy untracked-but-required data files into a new worktree.
#
# Usage:
#   scripts/provision_worktree.sh <worktree-path>
#
# Example:
#   scripts/provision_worktree.sh ../w4-c4-engine
#
# Background:
#   Six files are required by terra_engine.initialize_state() but cannot be
#   git-tracked in the normal way:
#     - mw_ecoregions.geojson (11 MB): git-add triggers an OneDrive re-upload
#       that blocks Python f.read() during sync (ETIMEDOUT); left untracked.
#     - *.parquet files: excluded by the global *.parquet rule in .gitignore;
#       binary format, potentially large, policy-excluded from version control.
#
#   Without these files a fresh worktree will fail the entire Python test suite
#   at the first initialize_state() call. Run this script once after
#   `git worktree add` to provision the worktree.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <worktree-path>" >&2
  exit 1
fi

TARGET="$1"

if [[ ! -d "$TARGET" ]]; then
  echo "Error: target directory does not exist: $TARGET" >&2
  exit 1
fi

# Resolve the repo root (directory containing this script's parent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$REPO_ROOT/data/processed"
DEST="$TARGET/data/processed"

if [[ ! -d "$DEST" ]]; then
  echo "Error: $DEST does not exist — is $TARGET a valid TERRA worktree?" >&2
  exit 1
fi

FILES=(
  "mw_ecoregions.geojson"
  "county_crosswalk.parquet"
  "generators_with_costs.parquet"
  "spatial_hierarchy_counties.parquet"
  "spatial_hierarchy_huc8.parquet"
  "synthetic_plant_assignments.parquet"
)

echo "Provisioning worktree: $TARGET"
echo "Source: $SRC"
echo ""

for f in "${FILES[@]}"; do
  src_path="$SRC/$f"
  dest_path="$DEST/$f"
  if [[ ! -f "$src_path" ]]; then
    echo "  SKIP (not found in source): $f" >&2
    continue
  fi
  cp "$src_path" "$dest_path"
  size=$(du -sh "$dest_path" | cut -f1)
  echo "  copied ($size): $f"
done

echo ""
echo "Done. These files are untracked in the worktree (.gitignore excludes them)."
echo "Re-run this script if the source files are regenerated."
