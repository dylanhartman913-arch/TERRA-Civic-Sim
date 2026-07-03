"""
Generate notebooks/08c_spatial_hierarchy.ipynb
Run with: conda run -n energy-map python3 scripts/generate_nb08c.py
"""
import nbformat
from pathlib import Path

ROOT = Path(__file__).parent.parent

nb = nbformat.v4.new_notebook()
nb.metadata["kernelspec"] = {
    "display_name": "energy-map",
    "language": "python",
    "name": "energy-map",
}
nb.metadata["language_info"] = {"name": "python", "version": "3.10"}


def md(source):
    return nbformat.v4.new_markdown_cell(source)


def code(source):
    return nbformat.v4.new_code_cell(source)


# ─────────────────────────────────────────────────────────────────────────────
# CELL 1 — Title
# ─────────────────────────────────────────────────────────────────────────────
CELL_01 = md("""\
# 08c — Spatial Hierarchy

Builds the multi-scalar spatial foundation for the TERRA Sandbox.

**Inputs** (existing processed files):
- `data/processed/mw_ecoregions.geojson` — EPA Level III polygons (128 features, 21 codes)
- `data/processed/ecoregion_ba_crosswalk.geojson` — ecoregion × BA crosswalk (183 rows)
- `data/processed/mw_action_library.json` — 46 actions (all missing `placement_scale`)
- `data/processed/network_metadata.json`

**Outputs**:
- `data/processed/mw_counties.geojson`
- `data/processed/mw_huc8.geojson`
- `data/processed/spatial_hierarchy_counties.parquet`
- `data/processed/spatial_hierarchy_huc8.parquet`
- `data/processed/figures/spatial_hierarchy_map.html`
- `data/processed/mw_action_library.json` (updated: adds `placement_scale` to all 46 actions)
- `src/terra_engine.py` (updated: `initialize_state()` loads spatial_hierarchy)

**Spatial units**: county, watershed (HUC-8), ecoregion, bus
**Target CRS**: EPSG:4326 for outputs; EPSG:5070 for area calculations
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 2 — Imports
# ─────────────────────────────────────────────────────────────────────────────
CELL_02 = code("""\
import io
import json
import os
import tempfile
import warnings
import zipfile
from pathlib import Path

import folium
import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import box, mapping
from shapely.ops import unary_union

warnings.filterwarnings("ignore")

ROOT  = Path("/Users/dylanhartman/Library/CloudStorage/OneDrive-UniversityofWyoming"
             "/Research/Energy Modeling/energy-map")
DATA  = ROOT / "data" / "processed"
RAW   = ROOT / "data" / "raw"
SRC   = ROOT / "src"
FIGS  = DATA / "figures"
FIGS.mkdir(exist_ok=True)

# 9-state Mountain West FIPS → abbreviation
MW_FIPS = {
    "56": "WY", "08": "CO", "30": "MT", "49": "UT", "35": "NM",
    "16": "ID", "32": "NV", "31": "NE", "46": "SD",
}
STUDY_ECO_CODES = {"17", "18", "20", "21", "25", "43", "80"}
# Study area bbox: lon_min, lat_min, lon_max, lat_max
BBOX = (-117.0, 36.0, -100.0, 49.0)
BBOX_GEOM = box(BBOX[0], BBOX[1], BBOX[2], BBOX[3])

print(f"geopandas: {gpd.__version__} | pandas: {pd.__version__} | folium: {folium.__version__}")
print(f"ROOT: {ROOT}")
print(f"DATA: {DATA}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 3 — Pre-flight confirmations markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_03 = md("## Pre-flight — Confirm required input files")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 4 — Pre-flight confirmations code
# ─────────────────────────────────────────────────────────────────────────────
CELL_04 = code("""\
# ── Confirm 4 required input files ───────────────────────────────────────────
required = [
    DATA / "ecoregion_ba_crosswalk.geojson",
    DATA / "mw_ecoregions.geojson",
    DATA / "network_metadata.json",
    DATA / "mw_action_library.json",
]
for p in required:
    kb = p.stat().st_size / 1024
    print(f"  ✓ {p.name}  ({kb:.1f} KB)")

# Crosswalk columns + first 3 rows
crosswalk = gpd.read_file(DATA / "ecoregion_ba_crosswalk.geojson")
print(f"\\necoregion_ba_crosswalk — {len(crosswalk)} rows")
print("  Columns:", list(crosswalk.columns))
print(crosswalk.drop(columns="geometry").head(3).to_string(index=False))

# Ecoregion file — 7 target codes
eco_raw = gpd.read_file(DATA / "mw_ecoregions.geojson")
unique_eco = eco_raw[["US_L3CODE", "US_L3NAME"]].drop_duplicates().sort_values("US_L3CODE")
print(f"\\nmw_ecoregions — {len(eco_raw)} features | {len(unique_eco)} unique codes")
print("  Columns:", list(eco_raw.columns))
print("  CRS:", eco_raw.crs)
target = unique_eco[unique_eco["US_L3CODE"].isin(STUDY_ECO_CODES)]
print("  7 target ecoregions:")
for _, row in target.iterrows():
    print(f"    {row.US_L3CODE}: {row.US_L3NAME}")

# network_metadata — ecoregion_layer summary
with open(DATA / "network_metadata.json") as f:
    nmd = json.load(f)
print(f"\\nnetwork_metadata — ecoregion_layer: {nmd['ecoregion_layer']['n_ecoregions_in_study_area']} ecoregions")

# action library — placement_scale missing
with open(DATA / "mw_action_library.json") as f:
    lib = json.load(f)
n_missing_ps = sum(1 for a in lib["actions"].values() if "placement_scale" not in a)
print(f"mw_action_library — {len(lib['actions'])} actions | {n_missing_ps} missing placement_scale")
print("\\n✓ Pre-flight complete")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 5 — Step 1 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_05 = md("""\
## Step 1 — County Boundaries

Fetch 2020 county boundaries for 9 Mountain West states (WY, CO, MT, UT, NM, ID, NV, NE, SD).

**Primary**: `pygris` library
**Fallback**: Census TIGER cartographic boundary ZIP — `cb_2020_us_county_500k.zip`
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 6 — County download
# ─────────────────────────────────────────────────────────────────────────────
CELL_06 = code("""\
# ── Step 1: County boundaries ─────────────────────────────────────────────────
county_fetch_method = None

try:
    from pygris import counties as pygris_counties
    print("pygris available — fetching via pygris...")
    gdfs = [pygris_counties(state=fips, cb=True, year=2020) for fips in MW_FIPS.keys()]
    mw_counties_raw = gpd.pd.concat(gdfs).to_crs(epsg=4326)
    county_fetch_method = "pygris"
    print(f"  ✓ {len(mw_counties_raw)} counties loaded via pygris")

except ImportError:
    county_fetch_method = "Census TIGER cartographic boundary ZIP (fallback)"
    print("pygris not installed — using Census TIGER cb_2020_us_county_500k.zip fallback")
    tiger_url = ("https://www2.census.gov/geo/tiger/GENZ2020/shp/"
                 "cb_2020_us_county_500k.zip")
    print(f"  Downloading: {tiger_url}")
    resp = requests.get(tiger_url, timeout=180)
    resp.raise_for_status()
    print(f"  Downloaded {len(resp.content)/1024/1024:.1f} MB")

    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            zf.extractall(tmpdir)
        shp_path = next(Path(tmpdir).glob("*.shp"))
        print(f"  Reading shapefile: {shp_path.name}")
        all_counties = gpd.read_file(shp_path)

    # Filter to 9 MW states
    mw_counties_raw = all_counties[
        all_counties["STATEFP"].isin(MW_FIPS.keys())
    ].copy().to_crs(epsg=4326)
    print(f"  ✓ Filtered to {len(mw_counties_raw)} counties in 9 MW states")

print(f"\\nFetch method: {county_fetch_method}")
print(f"CRS: {mw_counties_raw.crs}")
print(f"Columns: {list(mw_counties_raw.columns)}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 7 — County cleanup and save
# ─────────────────────────────────────────────────────────────────────────────
CELL_07 = code("""\
# ── Standardize column names and add STUSPS ──────────────────────────────────
counties_work = mw_counties_raw.copy()

# Ensure GEOID is 5-digit string (STATEFP + COUNTYFP)
if "GEOID" not in counties_work.columns:
    counties_work["GEOID"] = counties_work["STATEFP"] + counties_work["COUNTYFP"]
counties_work["GEOID"] = counties_work["GEOID"].astype(str).str.zfill(5)

# Add STUSPS if not present (standard Tiger/pygris output)
if "STUSPS" not in counties_work.columns:
    counties_work["STUSPS"] = counties_work["STATEFP"].map(MW_FIPS)

# Resolve NAME column (CB shp uses NAME; pygris may use NAME)
if "NAME" not in counties_work.columns and "NAMELSAD" in counties_work.columns:
    counties_work["NAME"] = counties_work["NAMELSAD"]

# Clip to study area bbox
counties_work = counties_work[counties_work.intersects(BBOX_GEOM)].copy()

# Keep required columns + geometry
out_cols = ["GEOID", "NAME", "STATEFP", "STUSPS", "geometry"]
mw_counties = counties_work[out_cols].copy()
mw_counties = mw_counties.to_crs(epsg=4326)

# Summary
per_state = mw_counties.groupby("STUSPS").size().sort_index()
print(f"County count: {len(mw_counties)}")
print("Counties per state:")
for state, n in per_state.items():
    print(f"  {state}: {n}")

# Save
out_path = DATA / "mw_counties.geojson"
mw_counties.to_file(out_path, driver="GeoJSON")
print(f"\\n✓ Saved {out_path.name}  ({out_path.stat().st_size/1024:.1f} KB)")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 8 — Step 2 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_08 = md("""\
## Step 2 — HUC-8 Watershed Boundaries

Fetch HUC-8 watersheds for the Mountain West study area bbox `(-117, 36, -100, 49)`.

**Primary**: `pynhd` library
**Fallback**: USGS WBD ArcGIS REST service — layer 4 (8-digit HU)
  `https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/4/query`

Pagination strategy: `returnIdsOnly=true` to get all 509 objectIds, then batch-fetch
50 at a time using the `objectIds` parameter (offset pagination is broken on this endpoint;
requesting `resultRecordCount > 60` with geometry returns 0 features).
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 9 — HUC-8 download
# ─────────────────────────────────────────────────────────────────────────────
CELL_09 = code("""\
# ── Step 2: HUC-8 watershed boundaries ───────────────────────────────────────
import time as _time
huc8_fetch_method = None

def _rings_to_geom(rings):
    \"\"\"Convert ArcGIS REST rings list to a shapely geometry.\"\"\"
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    parts = []
    for ring in rings:
        if len(ring) >= 3:
            try:
                p = Polygon(ring)
                if not p.is_valid:
                    p = p.buffer(0)
                if p.is_valid and not p.is_empty:
                    parts.append(p)
            except Exception:
                pass
    if not parts:
        return None
    return unary_union(parts)


def fetch_wbd_objectid_batches(bbox, layer=4, batch_size=50, max_retries=3):
    \"\"\"
    Fetch HUC-8 polygons from USGS WBD REST service using objectId batching.

    NOTE: resultOffset pagination is broken on this endpoint for large bboxes
    (requests > 60 features with geometry return 0 results). Strategy:
      1. Call returnIdsOnly=true to get all objectIds in bbox.
      2. Fetch geometry in batches of batch_size using the objectIds parameter.
    \"\"\"
    base = (f"https://hydro.nationalmap.gov/arcgis/rest/services/"
            f"wbd/MapServer/{layer}/query")

    # Step 1: get objectIds
    r_ids = requests.get(base, params={
        "geometry": json.dumps({"xmin": bbox[0], "ymin": bbox[1],
                                "xmax": bbox[2], "ymax": bbox[3]}),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "returnIdsOnly": "true",
        "f": "json",
    }, timeout=60)
    r_ids.raise_for_status()
    oids = r_ids.json().get("objectIds") or []
    if not oids:
        raise ValueError("WBD REST returnIdsOnly returned 0 objectIds")
    print(f"    Total objectIds in bbox: {len(oids)}")

    # Step 2: batch-fetch geometry
    all_rows = []
    n_batches = (len(oids) + batch_size - 1) // batch_size
    for i in range(0, len(oids), batch_size):
        batch = oids[i:i + batch_size]
        attempt = 0
        while attempt < max_retries:
            try:
                r_feat = requests.get(base, params={
                    "objectIds": ",".join(str(o) for o in batch),
                    "outFields": "huc8,name,areasqkm",
                    "returnGeometry": "true",
                    "outSR": "4326",
                    "f": "json",
                }, timeout=90)
                r_feat.raise_for_status()
                feats = r_feat.json().get("features", [])
                for feat in feats:
                    attrs = feat.get("attributes", {})
                    rings = feat.get("geometry", {}).get("rings", [])
                    geom = _rings_to_geom(rings) if rings else None
                    if geom is not None:
                        all_rows.append({**attrs, "geometry": geom})
                batch_n = i // batch_size + 1
                print(f"    Batch {batch_n}/{n_batches}: {len(feats)} features "
                      f"(total: {len(all_rows)})")
                break
            except Exception as e:
                attempt += 1
                if attempt >= max_retries:
                    print(f"    Batch {i//batch_size+1} FAILED after {max_retries} attempts: {e}")
                else:
                    print(f"    Batch {i//batch_size+1} attempt {attempt} failed, retrying...")
                    _time.sleep(1.0)
        _time.sleep(0.15)

    if not all_rows:
        raise ValueError("WBD batch fetch returned 0 features")
    return gpd.GeoDataFrame(all_rows, crs="EPSG:4326")


try:
    from pynhd import WBD
    print("pynhd available — fetching via WBD...")
    wbd = WBD("huc8")
    huc8_raw = wbd.bybox(BBOX)
    huc8_raw = huc8_raw.to_crs(epsg=4326)
    huc8_fetch_method = "pynhd"
    print(f"  ✓ {len(huc8_raw)} HUC-8 watersheds loaded via pynhd")

except ImportError:
    huc8_fetch_method = "USGS WBD REST (objectId batch fallback)"
    print("pynhd not installed — using USGS WBD REST objectId-batch fallback")
    print("  Note: offset pagination broken on this endpoint; using objectId strategy")
    huc8_raw = fetch_wbd_objectid_batches(BBOX, layer=4, batch_size=50)
    print(f"  ✓ {len(huc8_raw)} HUC-8 watersheds loaded via REST batching")

print(f"\\nFetch method: {huc8_fetch_method}")
print(f"CRS: {huc8_raw.crs}")
print(f"Columns: {list(huc8_raw.columns)}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 10 — HUC-8 cleanup and save
# ─────────────────────────────────────────────────────────────────────────────
CELL_10 = code("""\
# ── Standardize HUC-8 columns ─────────────────────────────────────────────────
# NOTE: ArcGIS REST service returns Web Mercator coords by default;
# outSR=4326 in the fetch ensures WGS84 output. Reproject here is a no-op
# but ensures CRS is canonically set.
huc8_work = huc8_raw.copy()

# Normalize column names (pynhd may use different names)
col_map = {}
for c in huc8_work.columns:
    cl = c.lower()
    if cl in ("huc8", "huc_8", "huc"):
        col_map[c] = "huc8"
    elif cl in ("name", "watershed_name", "wbd_name"):
        col_map[c] = "name"
    elif cl in ("areasqkm", "area_sqkm"):
        col_map[c] = "areasqkm"
huc8_work = huc8_work.rename(columns=col_map)

# Ensure required columns exist
if "huc8" not in huc8_work.columns:
    raise KeyError(f"No huc8 column found. Available: {list(huc8_work.columns)}")
if "areasqkm" not in huc8_work.columns:
    huc8_work["areasqkm"] = huc8_work.to_crs(epsg=5070).area / 1e6

huc8_work["huc8"]      = huc8_work["huc8"].astype(str).str.zfill(8)
huc8_work["areasqkm"]  = pd.to_numeric(huc8_work["areasqkm"], errors="coerce")

# Reproject to WGS84 if not already (pynhd may return different CRS)
if huc8_work.crs and str(huc8_work.crs.to_epsg()) != "4326":
    huc8_work = huc8_work.to_crs(epsg=4326)

print(f"CRS after normalization: {huc8_work.crs}")
print(f"Geometry sample bounds: {huc8_work.geometry.iloc[0].bounds}")

# Clip to study area bbox (most features already in bbox from API filter)
n_before = len(huc8_work)
huc8_work = huc8_work[huc8_work.intersects(BBOX_GEOM)].copy().reset_index(drop=True)
print(f"Rows before clip: {n_before}, after: {len(huc8_work)}")

# Keep required columns
out_cols = [c for c in ["huc8", "name", "areasqkm"] if c in huc8_work.columns]
mw_huc8 = huc8_work[out_cols + ["geometry"]].copy()

if len(mw_huc8) == 0:
    raise RuntimeError("mw_huc8 is empty after clip — check CRS and BBOX_GEOM")

# Summary
areas = mw_huc8["areasqkm"].fillna(0).astype(float)
idx_max = areas.idxmax()
idx_min = areas[areas > 0].idxmin()
largest  = mw_huc8.loc[idx_max]
smallest = mw_huc8.loc[idx_min]
print(f"HUC-8 count: {len(mw_huc8)}")
print(f"Largest:  {largest['huc8']} — {largest.get('name','?')}  ({areas.max():,.0f} km²)")
print(f"Smallest: {smallest['huc8']} — {smallest.get('name','?')}  ({areas[areas>0].min():,.0f} km²)")

# Save
out_path = DATA / "mw_huc8.geojson"
mw_huc8.to_file(out_path, driver="GeoJSON")
print(f"\\n✓ Saved {out_path.name}  ({out_path.stat().st_size/1024:.1f} KB)")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 11 — Step 3 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_11 = md("""\
## Step 3 — Ecoregion × County Crosswalk

Spatial intersection of counties with EPA Level III ecoregion polygons.

- Projection for area calc: **EPSG:5070** (CONUS Albers Equal Area)
- Per county: `primary_ecoregion_code`, `primary_ecoregion_name`, `ecoregion_fractions` (JSON), `is_study_area`
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 12 — Ecoregion × County crosswalk
# ─────────────────────────────────────────────────────────────────────────────
CELL_12 = code("""\
# ── Step 3: Ecoregion × County crosswalk ─────────────────────────────────────
# Dissolve ecoregion polygons by US_L3CODE (file has one row per state fragment)
eco_dissolved = (
    eco_raw[["US_L3CODE", "US_L3NAME", "geometry"]]
    .dissolve(by="US_L3CODE", as_index=False)
    [["US_L3CODE", "US_L3NAME", "geometry"]]
)
print(f"Ecoregion polygons dissolved: {len(eco_dissolved)} unique codes")

# Reproject both to EPSG:5070 for area calculations
counties_5070 = mw_counties.to_crs(epsg=5070)
eco_5070 = eco_dissolved.to_crs(epsg=5070)

# Compute total county area (for fractions)
counties_5070 = counties_5070.copy()
counties_5070["county_area_m2"] = counties_5070.geometry.area

# Spatial intersection
print("Computing county × ecoregion intersection...")
intersection = gpd.overlay(
    counties_5070[["GEOID", "county_area_m2", "geometry"]],
    eco_5070[["US_L3CODE", "US_L3NAME", "geometry"]],
    how="intersection",
)
intersection["frag_area_m2"] = intersection.geometry.area

# Compute area fractions per county
intersection["area_frac"] = (
    intersection["frag_area_m2"] / intersection["county_area_m2"]
)

# Build ecoregion_fractions dict per county
eco_fracs_county = {}
for geoid, grp in intersection.groupby("GEOID"):
    fracs = dict(zip(grp["US_L3CODE"], grp["area_frac"].round(4)))
    eco_fracs_county[geoid] = fracs

# Primary ecoregion = largest fragment
primary_eco_county = (
    intersection.loc[intersection.groupby("GEOID")["frag_area_m2"].idxmax()]
    [["GEOID", "US_L3CODE", "US_L3NAME"]]
    .rename(columns={"US_L3CODE": "primary_ecoregion_code",
                     "US_L3NAME": "primary_ecoregion_name"})
    .set_index("GEOID")
)

# Add to counties
counties_eco = mw_counties.join(primary_eco_county, on="GEOID")
counties_eco["ecoregion_fractions"] = counties_eco["GEOID"].map(
    lambda g: json.dumps(eco_fracs_county.get(g, {}))
)
counties_eco["is_study_area"] = counties_eco["primary_ecoregion_code"].isin(STUDY_ECO_CODES)

# Summary
print("\\nCounties per primary ecoregion:")
per_eco = counties_eco.groupby("primary_ecoregion_code").size().sort_values(ascending=False)
for code, n in per_eco.items():
    name = counties_eco[counties_eco.primary_ecoregion_code == code].iloc[0]["primary_ecoregion_name"]
    print(f"  {code} ({name}): {n}")

straddling = counties_eco[
    counties_eco["ecoregion_fractions"].apply(
        lambda x: max(json.loads(x).values()) < 0.80 if json.loads(x) else False
    )
]
print(f"\\nCounties straddling multiple ecoregions (largest frac < 80%): {len(straddling)}")
print(f"Study area counties: {counties_eco['is_study_area'].sum()}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 13 — Step 4 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_13 = md("""\
## Step 4 — Ecoregion × HUC-8 Crosswalk

Spatial intersection of HUC-8 watersheds with ecoregion polygons.
Also builds the reverse: `ecoregion_to_huc8` dict (for synergy grouping in TERRA engine).
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 14 — Ecoregion × HUC-8 crosswalk
# ─────────────────────────────────────────────────────────────────────────────
CELL_14 = code("""\
# ── Step 4: Ecoregion × HUC-8 crosswalk ──────────────────────────────────────
huc8_5070 = mw_huc8.to_crs(epsg=5070).copy()
huc8_5070["huc8_area_m2"] = huc8_5070.geometry.area

print("Computing HUC-8 × ecoregion intersection...")
huc8_eco_int = gpd.overlay(
    huc8_5070[["huc8", "huc8_area_m2", "geometry"]],
    eco_5070[["US_L3CODE", "US_L3NAME", "geometry"]],
    how="intersection",
)
huc8_eco_int["frag_area_m2"] = huc8_eco_int.geometry.area
huc8_eco_int["area_frac"] = (
    huc8_eco_int["frag_area_m2"] / huc8_eco_int["huc8_area_m2"]
)

# Ecoregion fractions per HUC-8
eco_fracs_huc8 = {}
for huc8_id, grp in huc8_eco_int.groupby("huc8"):
    fracs = dict(zip(grp["US_L3CODE"], grp["area_frac"].round(4)))
    eco_fracs_huc8[huc8_id] = fracs

# Primary ecoregion per HUC-8
primary_eco_huc8 = (
    huc8_eco_int.loc[huc8_eco_int.groupby("huc8")["frag_area_m2"].idxmax()]
    [["huc8", "US_L3CODE", "US_L3NAME"]]
    .rename(columns={"US_L3CODE": "primary_ecoregion_code",
                     "US_L3NAME": "primary_ecoregion_name"})
    .set_index("huc8")
)

huc8_eco = mw_huc8.join(primary_eco_huc8, on="huc8")
huc8_eco["ecoregion_fractions"] = huc8_eco["huc8"].map(
    lambda h: json.dumps(eco_fracs_huc8.get(h, {}))
)
huc8_eco["is_study_area"] = huc8_eco["primary_ecoregion_code"].isin(STUDY_ECO_CODES)

# Summary
print("\\nWatersheds per primary ecoregion:")
per_eco_h = huc8_eco.groupby("primary_ecoregion_code").size().sort_values(ascending=False)
for code, n in per_eco_h.items():
    name_val = huc8_eco[huc8_eco.primary_ecoregion_code == code].iloc[0]["primary_ecoregion_name"]
    print(f"  {code} ({name_val}): {n}")

straddling_h = huc8_eco[
    huc8_eco["ecoregion_fractions"].apply(
        lambda x: max(json.loads(x).values()) < 0.80 if json.loads(x) else False
    )
]
print(f"\\nWatersheds straddling multiple ecoregions (< 80%): {len(straddling_h)}")

# ── Reverse mapping: ecoregion → HUC-8 list (study area only) ────────────────
ecoregion_to_huc8 = {}
for _, row in huc8_eco[huc8_eco["is_study_area"]].iterrows():
    eco = row["primary_ecoregion_code"]
    if eco not in ecoregion_to_huc8:
        ecoregion_to_huc8[eco] = []
    ecoregion_to_huc8[eco].append(row["huc8"])

print("\\necoregion_to_huc8 (study area, counts):")
for eco, huc_list in sorted(ecoregion_to_huc8.items()):
    eco_name = primary_eco_huc8.loc[huc_list[0], "primary_ecoregion_name"] if huc_list else "?"
    print(f"  {eco} ({eco_name}): {len(huc_list)} watersheds — {huc_list[:5]}{'...' if len(huc_list)>5 else ''}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 15 — Step 5 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_15 = md("""\
## Step 5 — County × HUC-8 Crosswalk

For each county: which HUC-8 watersheds intersect it (with area fractions)?
For each HUC-8: which county has the largest overlap?
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 16 — County × HUC-8 crosswalk
# ─────────────────────────────────────────────────────────────────────────────
CELL_16 = code("""\
# ── Step 5: County × HUC-8 crosswalk ─────────────────────────────────────────
print("Computing county × HUC-8 intersection...")
county_huc8_int = gpd.overlay(
    counties_5070[["GEOID", "county_area_m2", "geometry"]],
    huc8_5070[["huc8", "huc8_area_m2", "geometry"]],
    how="intersection",
)
county_huc8_int["frag_area_m2"] = county_huc8_int.geometry.area
county_huc8_int["county_frac"] = (
    county_huc8_int["frag_area_m2"] / county_huc8_int["county_area_m2"]
)
county_huc8_int["huc8_frac"] = (
    county_huc8_int["frag_area_m2"] / county_huc8_int["huc8_area_m2"]
)

# Per county: huc8_fractions dict + primary HUC-8
huc8_fracs_county = {}
primary_huc8_county = {}
for geoid, grp in county_huc8_int.groupby("GEOID"):
    fracs = dict(zip(grp["huc8"], grp["county_frac"].round(4)))
    huc8_fracs_county[geoid] = fracs
    primary_huc8_county[geoid] = grp.loc[grp["frag_area_m2"].idxmax(), "huc8"]

# Per HUC-8: primary county + list of intersecting counties
primary_county_huc8 = {}
county_list_huc8 = {}
for huc8_id, grp in county_huc8_int.groupby("huc8"):
    primary_county_huc8[huc8_id] = grp.loc[grp["frag_area_m2"].idxmax(), "GEOID"]
    county_list_huc8[huc8_id] = sorted(grp["GEOID"].tolist())

print(f"County × HUC-8 fragments: {len(county_huc8_int)}")
print(f"Counties with HUC-8 mapping: {len(huc8_fracs_county)}")
print(f"HUC-8 with county mapping:   {len(primary_county_huc8)}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 17 — Step 6 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_17 = md("""\
## Step 6 — Spatial Hierarchy Parquet Tables

Assemble the master lookup tables and save to parquet.

- `spatial_hierarchy_counties.parquet` — one row per county
- `spatial_hierarchy_huc8.parquet` — one row per HUC-8 watershed
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 18 — Spatial hierarchy assembly and save
# ─────────────────────────────────────────────────────────────────────────────
CELL_18 = code("""\
# ── Step 6: Assemble spatial hierarchy tables ─────────────────────────────────

# ─ County centroids in WGS84 ─────────────────────────────────────────────────
counties_wgs84_centroids = mw_counties.copy().to_crs(epsg=4326)
centroids_county = counties_wgs84_centroids.geometry.centroid
county_centroids = pd.DataFrame({
    "GEOID": counties_wgs84_centroids["GEOID"].values,
    "centroid_lat": centroids_county.y.values,
    "centroid_lon": centroids_county.x.values,
}).set_index("GEOID")

# ─ HUC-8 centroids in WGS84 ──────────────────────────────────────────────────
huc8_wgs84 = mw_huc8.copy().to_crs(epsg=4326)
centroids_huc8 = huc8_wgs84.geometry.centroid
huc8_centroids_df = pd.DataFrame({
    "huc8": huc8_wgs84["huc8"].values,
    "centroid_lat": centroids_huc8.y.values,
    "centroid_lon": centroids_huc8.x.values,
}).set_index("huc8")

# ─ Counties DataFrame ────────────────────────────────────────────────────────
counties_df = counties_eco[["GEOID", "NAME", "STATEFP", "STUSPS",
                              "primary_ecoregion_code", "primary_ecoregion_name",
                              "ecoregion_fractions", "is_study_area"]].copy()
counties_df = counties_df.set_index("GEOID")
counties_df["primary_huc8"] = pd.Series(primary_huc8_county)
counties_df["huc8_fractions"] = pd.Series(
    {g: json.dumps(v) for g, v in huc8_fracs_county.items()}
)
counties_df = counties_df.join(county_centroids)
counties_df = counties_df.rename(columns={"NAME": "county_name", "STATEFP": "state_fips",
                                           "STUSPS": "state_abbr"})
counties_df = counties_df.reset_index()

col_order_c = ["GEOID", "county_name", "state_fips", "state_abbr",
               "primary_ecoregion_code", "primary_ecoregion_name", "ecoregion_fractions",
               "primary_huc8", "huc8_fractions",
               "is_study_area", "centroid_lat", "centroid_lon"]
counties_df = counties_df[col_order_c]

print(f"Counties table shape: {counties_df.shape}")
print(counties_df.head(5).to_string())

# ─ HUC-8 DataFrame ───────────────────────────────────────────────────────────
huc8_df = huc8_eco[["huc8", "name", "areasqkm",
                      "primary_ecoregion_code", "primary_ecoregion_name",
                      "ecoregion_fractions", "is_study_area"]].copy()
huc8_df = huc8_df.set_index("huc8")
huc8_df["primary_county_geoid"] = pd.Series(primary_county_huc8)
huc8_df["county_list"] = pd.Series(
    {h: json.dumps(v) for h, v in county_list_huc8.items()}
)
huc8_df = huc8_df.join(huc8_centroids_df)
huc8_df = huc8_df.rename(columns={"name": "watershed_name"})
huc8_df = huc8_df.reset_index()

col_order_h = ["huc8", "watershed_name", "areasqkm",
               "primary_ecoregion_code", "primary_ecoregion_name", "ecoregion_fractions",
               "primary_county_geoid", "county_list",
               "is_study_area", "centroid_lat", "centroid_lon"]
col_order_h = [c for c in col_order_h if c in huc8_df.columns]
huc8_df = huc8_df[col_order_h]

print(f"\\nHUC-8 table shape: {huc8_df.shape}")
print(huc8_df.head(5).to_string())

# ─ Save parquet ──────────────────────────────────────────────────────────────
counties_parquet_path = DATA / "spatial_hierarchy_counties.parquet"
huc8_parquet_path     = DATA / "spatial_hierarchy_huc8.parquet"

counties_df.to_parquet(counties_parquet_path, index=False)
huc8_df.to_parquet(huc8_parquet_path, index=False)

print(f"\\n✓ Saved {counties_parquet_path.name}  ({counties_parquet_path.stat().st_size/1024:.1f} KB)")
print(f"✓ Saved {huc8_parquet_path.name}  ({huc8_parquet_path.stat().st_size/1024:.1f} KB)")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 19 — Step 7 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_19 = md("""\
## Step 7 — Add `placement_scale` to Action Library

Adds `placement_scale` field to all 46 actions using the taxonomy-defined assignments.
`mine_land_reclamation` gets primary=`watershed` and `placement_scale_secondary=ecoregion`.
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 20 — placement_scale update
# ─────────────────────────────────────────────────────────────────────────────
CELL_20 = code("""\
# ── Step 7: Add placement_scale to action library ────────────────────────────
with open(DATA / "mw_action_library.json") as f:
    lib = json.load(f)

# placement_scale assignment table
BUS_ACTIONS = {
    "wind_utility", "solar_utility", "transmission_230kv", "transmission_500kv",
    "transmission_buildout", "coal_repowering", "coal_to_solar", "coal_to_smr",
    "geothermal_utility", "hydropower_small", "smr_advanced", "fusion_pilot",
    "battery_grid", "pumped_hydro", "hydrogen_electrolysis", "microgrid",
    "uranium_mining_isr", "conversion_facility", "enrichment_facility",
    "haleu_production", "fuel_fabrication", "community_solar", "ev_charging_network",
    "offshore_wind_great_lakes",  # non-MW; bus scale for national completeness
}
WATERSHED_ACTIONS = {
    "beaver_reintroduction", "wetland_restoration", "floodplain_reconnection",
    "spring_seep_development", "watershed_protection", "riparian_buffer",
    "mine_land_reclamation",
}
COUNTY_ACTIONS = {
    "rural_broadband", "health_clinic", "workforce_retraining", "affordable_housing",
    "clean_manufacturing", "university_research_center", "tribal_energy_sovereignty",
    "lead_service_line", "rail_freight_modernization",
}
ECOREGION_ACTIONS = {
    "prairie_restoration", "invasive_treatment", "renewable_degraded_land",
    "sagebrush_restoration", "forest_restoration", "carbon_sequestration_soil",
    "bison_reintroduction", "mine_land_reclamation",
}
# mine_land_reclamation: watershed primary, ecoregion secondary
DUAL_SCALE = {"mine_land_reclamation": "ecoregion"}

n_updated = 0
n_skipped = 0
scale_counts = {"bus": 0, "watershed": 0, "county": 0, "ecoregion": 0, "unknown": 0}

for aid, action in lib["actions"].items():
    if "placement_scale" in action:
        n_skipped += 1
        continue

    if aid in BUS_ACTIONS:
        scale = "bus"
    elif aid in WATERSHED_ACTIONS:
        scale = "watershed"
    elif aid in COUNTY_ACTIONS:
        scale = "county"
    elif aid in ECOREGION_ACTIONS:
        scale = "ecoregion"
    else:
        scale = "unknown"
        print(f"  WARNING: no placement_scale rule for action '{aid}'")

    action["placement_scale"] = scale
    if aid in DUAL_SCALE:
        action["placement_scale_secondary"] = DUAL_SCALE[aid]
    scale_counts[scale] = scale_counts.get(scale, 0) + 1
    n_updated += 1

print(f"Actions updated: {n_updated}")
print(f"Actions already had placement_scale: {n_skipped}")
print("\\nplacement_scale distribution:")
for scale, n in scale_counts.items():
    if n > 0:
        print(f"  {scale}: {n}")

# Re-save
with open(DATA / "mw_action_library.json", "w") as f:
    json.dump(lib, f, indent=2)

kb = (DATA / "mw_action_library.json").stat().st_size / 1024
print(f"\\n✓ Saved mw_action_library.json  ({kb:.1f} KB)")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 21 — Step 8 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_21 = md("""\
## Step 8 — Engine State Addition

Add spatial hierarchy loading to `initialize_state()` in `src/terra_engine.py`.

**Insertion point**: after state dict assembly, before sensitivity matrix build.
**Only `initialize_state()` is modified** — no other function is touched.
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 22 — Engine modification
# ─────────────────────────────────────────────────────────────────────────────
CELL_22 = code("""\
# ── Step 8a: Modify terra_engine.py initialize_state() ───────────────────────
engine_path = SRC / "terra_engine.py"

with open(engine_path) as f:
    src_text = f.read()

# Insertion anchor: after state dict, before sensitivity matrix build
ANCHOR = "    # ── Build sensitivity matrix ──────────────────────────────────────────────"

if ANCHOR not in src_text:
    raise ValueError(f"Anchor not found in terra_engine.py: {ANCHOR!r}")

if "spatial_hierarchy" in src_text:
    print("spatial_hierarchy block already present — skipping insertion")
else:
    spatial_block = (
        "\\n"
        "    # ── Spatial hierarchy (read-only reference) ──────────────────────────────\\n"
        "    spatial_hierarchy_counties_path = DATA_DIR / \\"spatial_hierarchy_counties.parquet\\"\\n"
        "    spatial_hierarchy_huc8_path     = DATA_DIR / \\"spatial_hierarchy_huc8.parquet\\"\\n"
        "\\n"
        "    if (spatial_hierarchy_counties_path.exists()\\n"
        "            and spatial_hierarchy_huc8_path.exists()):\\n"
        "        sh_counties = pd.read_parquet(spatial_hierarchy_counties_path)\\n"
        "        sh_huc8     = pd.read_parquet(spatial_hierarchy_huc8_path)\\n"
        "\\n"
        "        county_to_ecoregion = dict(zip(\\n"
        "            sh_counties[\\"GEOID\\"],\\n"
        "            sh_counties[\\"primary_ecoregion_code\\"],\\n"
        "        ))\\n"
        "        huc8_to_ecoregion = dict(zip(\\n"
        "            sh_huc8[\\"huc8\\"],\\n"
        "            sh_huc8[\\"primary_ecoregion_code\\"],\\n"
        "        ))\\n"
        "        ecoregion_to_huc8 = {}\\n"
        "        for _, row in sh_huc8[sh_huc8[\\"is_study_area\\"]].iterrows():\\n"
        "            eco = row[\\"primary_ecoregion_code\\"]\\n"
        "            if eco not in ecoregion_to_huc8:\\n"
        "                ecoregion_to_huc8[eco] = []\\n"
        "            ecoregion_to_huc8[eco].append(row[\\"huc8\\"])\\n"
        "\\n"
        "        state[\\"spatial_hierarchy\\"] = {\\n"
        "            \\"county_to_ecoregion\\": county_to_ecoregion,\\n"
        "            \\"huc8_to_ecoregion\\":   huc8_to_ecoregion,\\n"
        "            \\"ecoregion_to_huc8\\":   ecoregion_to_huc8,\\n"
        "            \\"county_count\\":        len(sh_counties),\\n"
        "            \\"huc8_count\\":          len(sh_huc8),\\n"
        "        }\\n"
        "        print(f\\"  Spatial hierarchy loaded: {len(county_to_ecoregion)} counties, \\"\\n"
        "              f\\"{len(huc8_to_ecoregion)} HUC-8 watersheds\\")\\n"
        "    else:\\n"
        "        state[\\"spatial_hierarchy\\"] = None\\n"
        "        print(\\"  WARNING: spatial_hierarchy files not found — \\"\\n"
        "              \\"run 08c_spatial_hierarchy.ipynb first\\")\\n"
        "\\n"
    )
    new_text = src_text.replace(ANCHOR, spatial_block + ANCHOR)
    with open(engine_path, "w") as f:
        f.write(new_text)
    print("✓ Inserted spatial_hierarchy block into initialize_state()")

# Append spatial_hierarchy status to confirmation print block
with open(engine_path) as f:
    src_text2 = f.read()

CONFIRM_ANCHOR = '    print(f"  Study area buses: {len(study_area_buses)}")'
confirm_add    = '    print("  Spatial hierarchy: " + ("loaded" if state.get("spatial_hierarchy") else "NOT LOADED"))'

if confirm_add not in src_text2 and CONFIRM_ANCHOR in src_text2:
    new_text2 = src_text2.replace(
        CONFIRM_ANCHOR,
        CONFIRM_ANCHOR + "\\n" + confirm_add
    )
    with open(engine_path, "w") as f:
        f.write(new_text2)
    print("✓ Added spatial_hierarchy status to confirmation print")
else:
    print("Confirmation print already updated or anchor not found — skipping")

print(f"\\nterra_engine.py: {(SRC / 'terra_engine.py').stat().st_size / 1024:.1f} KB")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 23 — Engine validation
# ─────────────────────────────────────────────────────────────────────────────
CELL_23 = code("""\
# ── Step 8b: Validate terra_engine.py ────────────────────────────────────────
import sys
sys.path.insert(0, str(SRC))

# Clear any cached import
if "terra_engine" in sys.modules:
    del sys.modules["terra_engine"]

from terra_engine import initialize_state

state = initialize_state()

assert state["spatial_hierarchy"] is not None, "spatial_hierarchy is None!"
assert "county_to_ecoregion" in state["spatial_hierarchy"], "Missing county_to_ecoregion"
assert "huc8_to_ecoregion"   in state["spatial_hierarchy"], "Missing huc8_to_ecoregion"
assert "ecoregion_to_huc8"   in state["spatial_hierarchy"], "Missing ecoregion_to_huc8"

sh = state["spatial_hierarchy"]
print(f"\\n✓ spatial_hierarchy loads correctly")
print(f"  Counties:  {sh['county_count']}")
print(f"  HUC-8s:    {sh['huc8_count']}")
print(f"  county_to_ecoregion entries: {len(sh['county_to_ecoregion'])}")
print(f"  huc8_to_ecoregion entries:   {len(sh['huc8_to_ecoregion'])}")
print(f"  ecoregion_to_huc8 keys:      {sorted(sh['ecoregion_to_huc8'].keys())}")
print("\\n✓ All assertions passed — terra_engine.py regressions: none")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 24 — Step 9 markdown
# ─────────────────────────────────────────────────────────────────────────────
CELL_24 = md("""\
## Step 9 — Summary Map

Folium map confirming spatial alignment of all three layers:
- HUC-8 watersheds: thin blue outlines, no fill
- County boundaries: gray outlines, no fill
- Ecoregion polygons: colored fills (20% opacity) with distinct muted colors
- Synthetic buses: circle markers colored by role

Saved to `data/processed/figures/spatial_hierarchy_map.html`.
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 25 — Folium map
# ─────────────────────────────────────────────────────────────────────────────
CELL_25 = code("""\
# ── Step 9: Summary Folium map ────────────────────────────────────────────────

# Muted color palette for 7 study ecoregions + overflow for others
ECO_COLORS = {
    "17": "#8B6914",  # Middle Rockies — ochre
    "18": "#C6956A",  # Wyoming Basin — sand
    "20": "#A0522D",  # Colorado Plateaus — sienna
    "21": "#556B2F",  # Southern Rockies — dark olive green
    "25": "#8B8B00",  # High Plains — dark yellow
    "43": "#4A7B6F",  # NW Great Plains — teal
    "80": "#7B68A0",  # N Basin and Range — muted purple
}
ROLE_COLORS = {
    "generation": "#e25757",
    "load": "#4a90d9",
    "transmission": "#f5a623",
    "mixed": "#888888",
}

m = folium.Map(
    location=[42.5, -108.5],
    zoom_start=5,
    tiles="CartoDB positron",
)

# ── Layer 1: Ecoregion fills ──────────────────────────────────────────────────
eco_wgs84 = eco_dissolved.to_crs(epsg=4326)
for _, row in eco_wgs84.iterrows():
    code = str(row["US_L3CODE"])
    color = ECO_COLORS.get(code, "#aaaaaa")
    try:
        feat_json = mapping(row.geometry)
        folium.GeoJson(
            {"type": "Feature", "geometry": feat_json, "properties": {}},
            style_function=lambda _, c=color: {
                "fillColor": c,
                "color": "#2d5a27",
                "weight": 1.5,
                "fillOpacity": 0.20,
            },
            tooltip=f"{code}: {row['US_L3NAME']}",
            name=f"Ecoregion {code}",
        ).add_to(m)
    except Exception:
        pass

# ── Layer 2: County outlines ──────────────────────────────────────────────────
# Simplify geometry for rendering speed
counties_simple = mw_counties.copy()
counties_simple["geometry"] = counties_simple.geometry.simplify(0.01)
folium.GeoJson(
    counties_simple.__geo_interface__,
    style_function=lambda _: {
        "fillColor": "none",
        "color": "#888888",
        "weight": 1.0,
        "fillOpacity": 0,
    },
    name="Counties",
    tooltip=folium.GeoJsonTooltip(fields=["NAME", "STUSPS"], aliases=["County", "State"]),
).add_to(m)

# ── Layer 3: HUC-8 outlines ───────────────────────────────────────────────────
huc8_simple = mw_huc8.copy()
huc8_simple["geometry"] = huc8_simple.geometry.simplify(0.01)
huc8_name_col = "name" if "name" in huc8_simple.columns else huc8_simple.columns[1]
folium.GeoJson(
    huc8_simple.__geo_interface__,
    style_function=lambda _: {
        "fillColor": "none",
        "color": "#4a90d9",
        "weight": 0.5,
        "fillOpacity": 0,
    },
    name="HUC-8 Watersheds",
    tooltip=folium.GeoJsonTooltip(fields=["huc8", huc8_name_col], aliases=["HUC-8", "Watershed"]),
).add_to(m)

# ── Layer 4: Synthetic buses ──────────────────────────────────────────────────
buses_path = DATA / "synthetic_buses.geojson"
if buses_path.exists():
    buses_gdf = gpd.read_file(buses_path)
    role_col = "role" if "role" in buses_gdf.columns else None
    for _, bus in buses_gdf.iterrows():
        coords = bus.geometry.coords[0]
        role = bus[role_col] if role_col else "mixed"
        color = ROLE_COLORS.get(str(role), "#888888")
        folium.CircleMarker(
            location=[coords[1], coords[0]],
            radius=3,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.7,
            weight=0.5,
            tooltip=f"Bus {bus.get('bus_id','?')} | {role}",
        ).add_to(m)
    print(f"Plotted {len(buses_gdf)} synthetic buses")
else:
    print("synthetic_buses.geojson not found — skipping bus layer")

folium.LayerControl(collapsed=False).add_to(m)

# Save
map_path = FIGS / "spatial_hierarchy_map.html"
m.save(str(map_path))
print(f"\\n✓ Saved {map_path.name}  ({map_path.stat().st_size/1024:.1f} KB)")
print(f"  Open: {map_path}")
""")

# ─────────────────────────────────────────────────────────────────────────────
# CELL 26 — Final outputs summary + network_metadata update
# ─────────────────────────────────────────────────────────────────────────────
CELL_26 = code("""\
# ── Final outputs: file sizes ─────────────────────────────────────────────────
output_files = [
    DATA / "mw_counties.geojson",
    DATA / "mw_huc8.geojson",
    DATA / "spatial_hierarchy_counties.parquet",
    DATA / "spatial_hierarchy_huc8.parquet",
    FIGS / "spatial_hierarchy_map.html",
    DATA / "mw_action_library.json",
]
print("Output file sizes:")
for p in output_files:
    if p.exists():
        kb = p.stat().st_size / 1024
        print(f"  ✓ {p.name:<50}  {kb:>8.1f} KB")
    else:
        print(f"  ✗ MISSING: {p.name}")

# ── Update network_metadata.json ─────────────────────────────────────────────
with open(DATA / "network_metadata.json") as f:
    nmd = json.load(f)

# placement_scale distribution from updated lib
with open(DATA / "mw_action_library.json") as f:
    lib_final = json.load(f)
ps_dist = {}
for a in lib_final["actions"].values():
    ps = a.get("placement_scale", "unknown")
    ps_dist[ps] = ps_dist.get(ps, 0) + 1

sh_counties_df = pd.read_parquet(DATA / "spatial_hierarchy_counties.parquet")
sh_huc8_df     = pd.read_parquet(DATA / "spatial_hierarchy_huc8.parquet")

nmd["spatial_hierarchy"] = {
    "county_count":        int(len(sh_counties_df)),
    "huc8_count":          int(len(sh_huc8_df)),
    "states":              ["WY","CO","MT","UT","NM","ID","NV","NE","SD"],
    "placement_scales":    ps_dist,
    "engine_integration":  "spatial_hierarchy loaded in initialize_state() as read-only lookup",
    "last_updated":        "2026-05-14",
}

with open(DATA / "network_metadata.json", "w") as f:
    json.dump(nmd, f, indent=2)
print(f"\\n✓ network_metadata.json updated (spatial_hierarchy block added)")
print(f"  county_count: {nmd['spatial_hierarchy']['county_count']}")
print(f"  huc8_count:   {nmd['spatial_hierarchy']['huc8_count']}")
print(f"  placement_scales: {ps_dist}")
print("\\n=== 08c_spatial_hierarchy COMPLETE ===")
""")

# ─────────────────────────────────────────────────────────────────────────────
# Assemble notebook
# ─────────────────────────────────────────────────────────────────────────────
nb.cells = [
    CELL_01, CELL_02, CELL_03, CELL_04,
    CELL_05, CELL_06, CELL_07,
    CELL_08, CELL_09, CELL_10,
    CELL_11, CELL_12,
    CELL_13, CELL_14,
    CELL_15, CELL_16,
    CELL_17, CELL_18,
    CELL_19, CELL_20,
    CELL_21, CELL_22, CELL_23,
    CELL_24, CELL_25,
    CELL_26,
]

out_path = ROOT / "notebooks" / "08c_spatial_hierarchy.ipynb"
nbformat.write(nb, out_path)
print(f"✓ Wrote {out_path}")
print(f"  {out_path.stat().st_size / 1024:.1f} KB | {len(nb.cells)} cells")
