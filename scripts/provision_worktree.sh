#!/usr/bin/env bash
# provision_worktree.sh — copy untracked-but-required files into a new worktree.
#
# Usage:
#   scripts/provision_worktree.sh <worktree-path>
#
# Example:
#   scripts/provision_worktree.sh ../w4-c4-engine
#
# Background:
#   Several files must be present in every worktree but cannot be git-tracked:
#
#   Data files (terra_engine.initialize_state() hard dependencies):
#     - mw_ecoregions.geojson (11 MB): git-add triggers an OneDrive re-upload
#       that blocks Python f.read() during sync (ETIMEDOUT); left untracked.
#     - *.parquet files: excluded by the global *.parquet rule in .gitignore;
#       binary format, potentially large, policy-excluded from version control.
#
#   Reference docs (Wave 4 context, untracked so git does not dirty the branch):
#     - Wave4_roadmap.md: ticket scope and dispatch conditions for each branch.
#     - build_log/wave4/_baseline.md: P0 baseline record (SHAs, test counts,
#       golden-letter collision check, exposure-tag registry format check).
#
#   Without the data files a fresh worktree will fail the entire Python test
#   suite at the first initialize_state() call. Without the reference docs a
#   branch worker has no local copy of the roadmap or baseline record.
#
#   Run this script once after `git worktree add` to provision the worktree.

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

echo "Provisioning worktree: $TARGET"
echo ""

# ── Data files (data/processed/) ─────────────────────────────────────────────
SRC_DATA="$REPO_ROOT/data/processed"
DEST_DATA="$TARGET/data/processed"

if [[ ! -d "$DEST_DATA" ]]; then
  echo "Error: $DEST_DATA does not exist — is $TARGET a valid TERRA worktree?" >&2
  exit 1
fi

DATA_FILES=(
  "mw_ecoregions.geojson"
  "county_crosswalk.parquet"
  "generators_with_costs.parquet"
  "spatial_hierarchy_counties.parquet"
  "spatial_hierarchy_huc8.parquet"
  "synthetic_plant_assignments.parquet"
)

echo "Data files → $DEST_DATA"
for f in "${DATA_FILES[@]}"; do
  src_path="$SRC_DATA/$f"
  dest_path="$DEST_DATA/$f"
  if [[ ! -f "$src_path" ]]; then
    echo "  SKIP (not found in source): $f" >&2
    continue
  fi
  cp "$src_path" "$dest_path"
  size=$(du -sh "$dest_path" | cut -f1)
  echo "  copied ($size): $f"
done

# ── Reference docs (repo root and build_log/wave4/) ──────────────────────────
echo ""
echo "Reference docs → $TARGET"

# Wave4_roadmap.md lives at repo root
ROADMAP_SRC="$REPO_ROOT/Wave4_roadmap.md"
ROADMAP_DEST="$TARGET/Wave4_roadmap.md"
if [[ -f "$ROADMAP_SRC" ]]; then
  cp "$ROADMAP_SRC" "$ROADMAP_DEST"
  size=$(du -sh "$ROADMAP_DEST" | cut -f1)
  echo "  copied ($size): Wave4_roadmap.md"
else
  echo "  SKIP (not found in source): Wave4_roadmap.md" >&2
fi

# _baseline.md lives in build_log/wave4/ — create the directory if absent
BASELINE_SRC="$REPO_ROOT/build_log/wave4/_baseline.md"
BASELINE_DEST_DIR="$TARGET/build_log/wave4"
BASELINE_DEST="$BASELINE_DEST_DIR/_baseline.md"
if [[ -f "$BASELINE_SRC" ]]; then
  mkdir -p "$BASELINE_DEST_DIR"
  cp "$BASELINE_SRC" "$BASELINE_DEST"
  size=$(du -sh "$BASELINE_DEST" | cut -f1)
  echo "  copied ($size): build_log/wave4/_baseline.md"
else
  echo "  SKIP (not found in source): build_log/wave4/_baseline.md" >&2
fi

# ── Hash-verified W6-A data outputs ──────────────────────────────────────────
# Files added by W6-A must remain byte-identical when provisioned. Each entry
# is `repo-relative path|SHA-256`; fail closed if a source changes without a
# corresponding manifest update.
HASH_VERIFIED_DATA_MANIFEST=(
  "data/processed/wy_county_ag_baseline.json|909300ead76ec31fe28afe9c8bb202f8a4ab107f20d6675f39ccd565a5930030"
  "data/processed/wy_grazing_allotments.csv|35550012ad0538394cb481f49bf298fa7b7a2afef7df60dda8b060359642d08a"
  "data/processed/wy_ag_sources.csv|dabd8edafdd1774d3456e1db24a877164218ee5c86751030d267b30e2fedb414"
)

echo ""
echo "Hash-verified data manifest"
for entry in "${HASH_VERIFIED_DATA_MANIFEST[@]}"; do
  relative_path="${entry%%|*}"
  expected_hash="${entry##*|}"
  source_path="$REPO_ROOT/$relative_path"
  destination_path="$TARGET/$relative_path"
  if [[ ! -f "$source_path" || ! -f "$destination_path" ]]; then
    echo "  ERROR (manifest file missing): $relative_path" >&2
    exit 1
  fi
  actual_hash="$(shasum -a 256 "$source_path" | awk '{print $1}')"
  copied_hash="$(shasum -a 256 "$destination_path" | awk '{print $1}')"
  if [[ "$actual_hash" != "$expected_hash" || "$copied_hash" != "$expected_hash" ]]; then
    echo "  ERROR (SHA-256 mismatch): $relative_path" >&2
    exit 1
  fi
  echo "  verified: $relative_path $expected_hash"
done

echo ""
echo "Done. All copied files are untracked in the worktree (.gitignore or"
echo "unlisted). Re-run this script if the source files are updated."
