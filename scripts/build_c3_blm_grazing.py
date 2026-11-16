"""W7-F3 / C-3: BLM grazing allotments and RAS AUMs into the Wyoming ag baseline.

Inputs (both cached under data/raw/, each with a ``.sidecar.json``):
  * data/raw/blm_ras/Allotment Information Report BLM WY State Office 2026-11-15.csv
    (manual RAS export; authoritative for AUMs and public acres)
  * data/raw/blm_grazing/blm_natl_grazing_allotment_polygons_WY_2026-11-16.geojson
    (BLM National Grazing Allotment Polygons, FeatureServer layer 1; supplemental)
  * data/raw/census_counties/tl_2023_us_county.shp (county geometry)

Method (judgment calls flagged JC-n in the outputs):
  * RAS rows are authorization-level. They are summed to one row per allotment
    (state allotment number, ST_ALLOT).
  * "Permitted AUMs" is read as BLM *active* AUMs (JC-1; evidence in the report).
  * Polygons are dissolved by ST_ALLOT, repaired with make_valid, and measured in
    EPSG:5070. A county's share of an allotment is the area of intersection
    divided by the allotment's total polygon area, so an allotment crossing the
    Wyoming line keeps only its Wyoming share (JC-2).
  * Public-land proportion (JC-3): RAS public acres / polygon acres. The county's
    public acres are share x RAS public acres. RAS AUMs are already public-land
    AUMs, so county AUMs = RAS AUMs x share (equivalently, county public acres /
    RAS public acres). Multiplying AUMs by the public proportion again would
    discount private and state inholdings twice. That literal variant is computed
    as a sensitivity (``aum_literal_pp``) and not used.
  * Nothing is invented: allotments that cannot be joined or located stay in an
    explicit unapportioned list.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAS_CSV = ROOT / "data/raw/blm_ras/Allotment Information Report BLM WY State Office 2026-11-15.csv"
POLYGONS = ROOT / "data/raw/blm_grazing/blm_natl_grazing_allotment_polygons_WY_2026-11-16.geojson"
COUNTIES = ROOT / "data/raw/census_counties/tl_2023_us_county.shp"
PROCESSED = ROOT / "data/processed"
SNAP = ROOT / "build_log/wave7/snapshots/w7-f3"
SQM_PER_ACRE = 4046.8564224

# Explicit allowlist. Anything not named here is dropped at ingest. The export
# as saved carries no operator or address fields; this keeps it that way.
RAS_COLUMNS = {
    "Allotment Number": "st_allot",
    "Allotment Name": "allot_name",
    "Available For Grazing": "available",
    "Public Acres": "public_acres",
    "Management Stat Text": "mgmt_category",
    "Admin State ": "admin_st",
    "Admin Office ": "admin_office",
    "Authorization Status Code": "auth_status",
    "Suspended AUMs": "suspended_aum",
    "Permitted AUMs": "permitted_aum",
    "Susp Use Temp": "susp_use_temp",
    "Auth Id": "auth_id",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_ras() -> tuple[pd.DataFrame, list[str]]:
    raw = pd.read_csv(RAS_CSV, dtype=str, encoding="utf-8-sig", keep_default_na=False)
    dropped = [c for c in raw.columns if c not in RAS_COLUMNS]
    # Two columns are both named "Field Office"; they land in `dropped` by name.
    ras = raw[list(RAS_COLUMNS)].rename(columns=RAS_COLUMNS)
    for col in ("public_acres", "suspended_aum", "permitted_aum", "susp_use_temp"):
        ras[col] = pd.to_numeric(ras[col], errors="coerce")
    return ras, sorted(set(dropped))


def allotment_table(ras: pd.DataFrame) -> pd.DataFrame:
    """One row per allotment; RAS authorization rows summed."""
    g = ras.groupby("st_allot", sort=True)
    acres_unique = g["public_acres"].nunique(dropna=True)
    assert (acres_unique <= 1).all(), "public acres differ between rows of one allotment"
    out = g.agg(
        allot_name=("allot_name", "first"),
        admin_st=("admin_st", "first"),
        admin_office=("admin_office", "first"),
        mgmt_category=("mgmt_category", "first"),
        available=("available", "first"),
        public_acres=("public_acres", "first"),
        ras_rows=("auth_id", "size"),
        active_aum=("permitted_aum", "sum"),
        suspended_aum=("suspended_aum", "sum"),
        susp_use_temp=("susp_use_temp", "sum"),
    ).reset_index()
    return out


def polygon_county_table() -> tuple[pd.DataFrame, pd.DataFrame]:
    """(per-allotment polygon summary, allotment x county overlap)."""
    poly = gpd.read_file(POLYGONS)
    invalid = int((~poly.is_valid).sum())
    poly["geometry"] = poly.geometry.make_valid()
    poly = poly.to_crs(5070)
    n_poly = poly.groupby("ST_ALLOT").size().rename("polygons")
    dis = poly.dissolve("ST_ALLOT", aggfunc={"ALLOT_NAME": "first", "GIS_ACRES": "sum"})
    dis = dis.reset_index()
    dis["poly_acres"] = dis.geometry.area / SQM_PER_ACRE
    cty = gpd.read_file(COUNTIES)
    cty = cty[cty.STATEFP == "56"][["GEOID", "NAME", "geometry"]].to_crs(5070)
    ov = gpd.overlay(dis[["ST_ALLOT", "geometry"]], cty, how="intersection", keep_geom_type=True)
    ov["overlap_acres"] = ov.geometry.area / SQM_PER_ACRE
    ov = pd.DataFrame(ov.drop(columns="geometry")).rename(
        columns={"ST_ALLOT": "st_allot", "GEOID": "county_geoid", "NAME": "county_name"}
    )
    summary = dis.drop(columns="geometry").rename(
        columns={"ST_ALLOT": "st_allot", "ALLOT_NAME": "poly_name", "GIS_ACRES": "gis_acres_attr"}
    )
    summary = summary.merge(n_poly.rename("polygons").reset_index().rename(columns={"ST_ALLOT": "st_allot"}), on="st_allot")
    wy_acres = ov.groupby("st_allot").overlap_acres.sum().rename("wy_acres")
    summary = summary.merge(wy_acres, on="st_allot", how="left")
    summary["wy_acres"] = summary["wy_acres"].fillna(0.0)
    summary["wy_share"] = summary["wy_acres"] / summary["poly_acres"]
    summary.attrs["invalid_geometries_repaired"] = invalid
    return summary, ov


def build() -> dict:
    ras, dropped_cols = load_ras()
    allot = allotment_table(ras)
    psum, ov = polygon_county_table()

    j = allot.merge(psum, on="st_allot", how="outer", indicator=True)
    j["join"] = j["_merge"].map({"both": "matched", "left_only": "ras_only", "right_only": "polygon_only"})
    j = j.drop(columns="_merge")
    j["public_prop"] = (j["public_acres"] / j["poly_acres"]).clip(upper=1.0)
    j["public_prop_raw"] = j["public_acres"] / j["poly_acres"]

    # Allotment x county apportionment (matched allotments only).
    m = ov.merge(j[j["join"] == "matched"][
        ["st_allot", "allot_name", "active_aum", "suspended_aum", "public_acres",
         "poly_acres", "public_prop"]], on="st_allot", how="inner")
    m["share"] = m["overlap_acres"] / m["poly_acres"]
    m["active_aum_county"] = m["active_aum"] * m["share"]
    m["suspended_aum_county"] = m["suspended_aum"] * m["share"]
    # Public acres in the county: polygon overlap x public proportion (capped at 1,
    # since 295 allotments report more public acres than their polygon holds).
    m["public_acres_county"] = m["overlap_acres"] * m["public_prop"]
    m["aum_literal_pp"] = m["active_aum_county"] * m["public_prop"]
    m["area_acres_county"] = m["overlap_acres"]

    by_county = m.groupby(["county_geoid", "county_name"], as_index=False).agg(
        blm_active_aum=("active_aum_county", "sum"),
        blm_suspended_aum=("suspended_aum_county", "sum"),
        blm_public_acres=("public_acres_county", "sum"),
        blm_allotment_polygon_acres=("overlap_acres", "sum"),
        blm_allotment_count=("st_allot", "nunique"),
        blm_aum_literal_pp=("aum_literal_pp", "sum"),
    )
    return {
        "ras": ras, "dropped_cols": dropped_cols, "allot": allot, "joined": j,
        "apportion": m, "by_county": by_county,
        "invalid_repaired": psum.attrs["invalid_geometries_repaired"],
    }



# ---------------------------------------------------------------------------
# Report, credibility gate, baseline update, sidecars, manifest
# ---------------------------------------------------------------------------
PUBLISHED_WY_ACTIVE_AUM = 1_920_781   # BLM Public Land Statistics 2025, Table 3-9c, as of 2026-01-15
PUBLISHED_WY_SUSPENDED_AUM = 393_635
PUBLISHED_SRC = (
    "BLM Public Land Statistics 2025 (published 2026-07/08), Table 3-9c "
    "'Grazing permits and leases in force as of January 15, 2026', Wyoming row: "
    "active AUMs 1,920,781; suspended AUMs 393,635. "
    "https://www.blm.gov/sites/default/files/docs/2026-08/BLM-Public-Land-Statistics-2025.pdf"
)
GATE_TOLERANCE = 0.02
SMA_FILE = ROOT / "data/raw/blm_sma/sma_WY_BLM_USFS_2026-11-16.geojson"


def sma_crosscheck() -> pd.DataFrame | None:
    """Independent check: BLM surface-management-agency acres per county."""
    if not SMA_FILE.exists():
        return None
    s = gpd.read_file(SMA_FILE)
    s["geometry"] = s.geometry.make_valid()
    s = s.to_crs(5070)
    cty = gpd.read_file(COUNTIES)
    cty = cty[cty.STATEFP == "56"][["GEOID", "NAME", "geometry"]].to_crs(5070)
    o = gpd.overlay(s[["ADMIN_AGENCY_CODE", "geometry"]], cty, how="intersection")
    o["acres"] = o.geometry.area / SQM_PER_ACRE
    p = o.pivot_table(index="GEOID", columns="ADMIN_AGENCY_CODE", values="acres", aggfunc="sum")
    return p.rename(columns={"BLM": "sma_blm_acres", "USFS": "sma_usfs_acres"}).reset_index().rename(
        columns={"GEOID": "county_geoid"})


def join_stats(res: dict) -> dict:
    j = res["joined"]
    J = j["join"]
    ras_all = j[J != "polygon_only"]
    poly_all = j[J != "ras_only"]
    matched = j[J == "matched"]
    ro = j[J == "ras_only"]
    po = j[J == "polygon_only"]
    zero_wy = matched[matched["wy_share"] == 0]
    crossing = matched[(matched["wy_share"] > 0) & (matched["wy_share"] < 0.99)]
    wy_ras = ras_all[ras_all["admin_st"] == "WY"]
    return {
        "ras_allotments": int(len(ras_all)),
        "polygon_allotments": int(len(poly_all)),
        "matched": int(len(matched)),
        "match_rate_ras_to_polygon": len(matched) / len(ras_all),
        "match_rate_polygon_to_ras": len(matched) / len(poly_all),
        "ras_rows": int(len(res["ras"])),
        "ras_active_aum_total_all_rows": float(ras_all["active_aum"].sum()),
        "ras_active_aum_wy_admin": float(wy_ras["active_aum"].sum()),
        "ras_suspended_aum_wy_admin": float(wy_ras["suspended_aum"].sum()),
        "ras_only_count": int(len(ro)),
        "ras_only_active_aum": float(ro["active_aum"].sum()),
        "ras_only_public_acres": float(ro["public_acres"].sum()),
        "polygon_only_count": int(len(po)),
        "polygon_only_acres": float(po["poly_acres"].sum()),
        "matched_active_aum": float(matched["active_aum"].sum()),
        "matched_zero_wy_overlap_count": int(len(zero_wy)),
        "matched_zero_wy_overlap_aum": float(zero_wy["active_aum"].sum()),
        "matched_state_line_crossing_count": int(len(crossing)),
        "apportioned_active_aum_wy": float(res["apportion"]["active_aum_county"].sum()),
        "apportioned_suspended_aum_wy": float(res["apportion"]["suspended_aum_county"].sum()),
        "allotments_multi_polygon": int((matched["polygons"] > 1).sum()),
        "allotments_multi_ras_rows": int((ras_all["ras_rows"] > 1).sum()),
        "max_ras_rows_one_allotment": int(ras_all["ras_rows"].max()),
        "matched_public_prop_capped": int((matched["public_prop_raw"] > 1.0).sum()),
        "matched_public_acres_null": int(matched["public_acres"].isna().sum()),
        "invalid_polygons_repaired": res["invalid_repaired"],
    }


def county_frame(res: dict, baseline: dict) -> pd.DataFrame:
    b = res["by_county"].copy()
    rows = []
    for _, r in b.iterrows():
        c = baseline["counties"][r.county_geoid]
        area = c["land_by_use"]["county_area_acres"]["value"]
        priv = c["cattle_and_forage"]["aum_capacity"]["value"]
        rows.append({
            "county_geoid": r.county_geoid, "county_name": r.county_name,
            "blm_active_aum": r.blm_active_aum, "blm_suspended_aum": r.blm_suspended_aum,
            "blm_public_acres": r.blm_public_acres, "blm_allotment_count": int(r.blm_allotment_count),
            "county_area_acres": area, "private_aum_capacity": priv,
            "blm_acres_share_of_county": r.blm_public_acres / area,
            "blm_share_of_forage_capacity": r.blm_active_aum / (r.blm_active_aum + priv),
            "blm_aum_literal_pp": r.blm_aum_literal_pp,
        })
    out = pd.DataFrame(rows)
    sma = sma_crosscheck()
    if sma is not None:
        out = out.merge(sma, on="county_geoid", how="left")
        out["ras_over_sma_blm_acres"] = out["blm_public_acres"] / out["sma_blm_acres"]
    return out


ACRE_TOL_PCT = 0.05
ACRE_TOL_FLOOR = 5_000.0
# Accepted exceptions: a row stays FAIL in the table; the exception is recorded beside it, never instead of it.
ACCEPTED_EXCEPTIONS = {
    "Johnson": "Accepted exception, DECISIONS.md 2026-11-16 (b): reason unverified hypothesis; rule not changed.",
}
SANITY_COUNTIES = ["Sweetwater", "Carbon", "Fremont", "Lincoln", "Campbell"]  # PM-from-memory list; sanity note only


def county_acre_gate(cf: pd.DataFrame) -> pd.DataFrame:
    """Per county: apportioned BLM acres within +/-5% or 5,000 acres (whichever is larger) of the SMA layer."""
    g = cf[["county_name", "blm_public_acres", "sma_blm_acres"]].copy()
    g["diff_acres"] = g.blm_public_acres - g.sma_blm_acres
    g["dev_pct"] = 100 * g.diff_acres / g.sma_blm_acres
    g["tolerance_acres"] = (ACRE_TOL_PCT * g.sma_blm_acres).clip(lower=ACRE_TOL_FLOOR)
    g["via_floor"] = (ACRE_TOL_PCT * g.sma_blm_acres) < ACRE_TOL_FLOOR
    g["result"] = (g.diff_acres.abs() <= g.tolerance_acres).map({True: "PASS", False: "FAIL"})
    g["exception"] = g.county_name.map(ACCEPTED_EXCEPTIONS).where(g.result == "FAIL", None)
    return g


def gate_rows(stats: dict, cf: pd.DataFrame) -> list[dict]:
    """Amended credibility gate (W7-F5). Rows are PASS or FAIL, never annotated away.

    Tolerances were set after seeing the data (DECISIONS.md 2026-11-16 b).
    """
    rows = []
    for label, got in (("RAS WY active AUMs (all rows, WY-administered)", stats["ras_active_aum_wy_admin"]),
                       ("Apportioned to WY counties", stats["apportioned_active_aum_wy"])):
        dev = got / PUBLISHED_WY_ACTIVE_AUM - 1
        rows.append({"check": f"Statewide BLM active AUMs: {label} vs BLM published {PUBLISHED_WY_ACTIVE_AUM:,} (+/-2%)",
                     "value": round(got), "expected": PUBLISHED_WY_ACTIVE_AUM, "deviation": round(dev, 4),
                     "result": "PASS" if abs(dev) <= GATE_TOLERANCE else "FAIL"})
    dev = stats["ras_suspended_aum_wy_admin"] / PUBLISHED_WY_SUSPENDED_AUM - 1
    rows.append({"check": f"Statewide suspended AUMs (RAS) vs BLM published {PUBLISHED_WY_SUSPENDED_AUM:,} (+/-2%)",
                 "value": round(stats["ras_suspended_aum_wy_admin"]), "expected": PUBLISHED_WY_SUSPENDED_AUM,
                 "deviation": round(dev, 4), "result": "PASS" if abs(dev) <= GATE_TOLERANCE else "FAIL"})
    for _, r in county_acre_gate(cf).iterrows():
        row = {"check": f"{r.county_name}: apportioned BLM acres vs independent BLM surface-ownership acres "
                        f"(+/-5% or 5,000 ac, larger)",
               "value": round(r.blm_public_acres), "expected": round(r.sma_blm_acres),
               "deviation": round(r.dev_pct / 100, 4), "tolerance_acres": round(r.tolerance_acres),
               "passed_via_5000_acre_floor": bool(r.via_floor and r.result == "PASS"),
               "result": r.result}
        if r.exception:
            row["accepted_exception"] = r.exception
        rows.append(row)
    return rows


def sanity_notes(cf: pd.DataFrame) -> list[dict]:
    """Not gating. The F3 named-county list (BLM share of county area >= 25%) was written from memory and was
    wrong for Campbell; kept as a sanity note only."""
    out = []
    for name in SANITY_COUNTIES:
        r = cf[cf.county_name == name].iloc[0]
        out.append({"county": name, "blm_share_of_county_area": round(float(r.blm_acres_share_of_county), 3),
                    "ge_25pct": bool(r.blm_acres_share_of_county >= 0.25)})
    t = cf[cf.county_name == "Teton"].iloc[0]
    out.append({"county": "Teton", "blm_share_of_county_area": round(float(t.blm_acres_share_of_county), 4),
                "blm_active_aum": round(float(t.blm_active_aum)), "lt_0_5pct_and_lt_1000_aum":
                bool(t.blm_acres_share_of_county < 0.005 and t.blm_active_aum < 1000)})
    return out


def nonallotted_diagnostic(cf: pd.DataFrame) -> pd.DataFrame | None:
    """Diagnostic only (W7-F5): BLM surface acres in the ownership layer that intersect no allotment polygon.

    Uses every WY allotment polygon (matched or not). EPSG:5070. Does not feed the gate or any output file
    other than its own snapshot CSV.
    """
    if not SMA_FILE.exists():
        return None
    s = gpd.read_file(SMA_FILE)
    s["geometry"] = s.geometry.make_valid()
    s = s[s.ADMIN_AGENCY_CODE == "BLM"].to_crs(5070)
    poly = gpd.read_file(POLYGONS)
    poly["geometry"] = poly.geometry.make_valid()
    poly = poly.to_crs(5070)
    union = gpd.GeoDataFrame(geometry=[poly.geometry.union_all()], crs=5070)
    cty = gpd.read_file(COUNTIES)
    cty = cty[cty.STATEFP == "56"][["GEOID", "NAME", "geometry"]].to_crs(5070)
    non = gpd.overlay(s[["geometry"]], union, how="difference")
    o = gpd.overlay(non, cty, how="intersection")
    o["acres"] = o.geometry.area / SQM_PER_ACRE
    na = o.groupby("NAME").acres.sum().rename("sma_blm_not_in_any_allotment_acres").reset_index().rename(
        columns={"NAME": "county_name"})
    g = county_acre_gate(cf).merge(na, on="county_name", how="left")
    g["sma_blm_not_in_any_allotment_acres"] = g["sma_blm_not_in_any_allotment_acres"].fillna(0.0)
    g["gap_acres_negative"] = (-g.diff_acres).clip(lower=0)
    g["non_allotted_over_gap"] = g.sma_blm_not_in_any_allotment_acres / g.diff_acres.abs().where(g.diff_acres != 0)
    return g


def write_report(res: dict, baseline: dict) -> dict:
    stats = join_stats(res)
    cf = county_frame(res, baseline)
    gate = gate_rows(stats, cf)
    j = res["joined"]
    unm = j[j["join"] == "ras_only"][["st_allot", "allot_name", "admin_st", "public_acres", "active_aum",
                                       "suspended_aum"]]
    unm.to_csv(SNAP / "c3_unmatched_ras_allotments.csv", index=False)
    po = j[j["join"] == "polygon_only"][["st_allot", "poly_name", "poly_acres", "wy_share"]]
    po.round(3).to_csv(SNAP / "c3_unmatched_polygon_allotments.csv", index=False)
    zero = j[(j["join"] == "matched") & (j["wy_share"] == 0)][["st_allot", "allot_name", "public_acres",
                                                               "active_aum", "poly_acres"]]
    zero.to_csv(SNAP / "c3_out_of_state_allotments.csv", index=False)
    cf.round(4).to_csv(SNAP / "c3_county_credibility.csv", index=False)
    cg = county_acre_gate(cf)
    cg.round(4).to_csv(SNAP / "c3_gate_county_acres.csv", index=False)
    report = {"stats": stats, "gate": gate, "published_source": PUBLISHED_SRC,
              "gate_pass": all(r["result"] == "PASS" for r in gate),
              "gate_county_pass_count": int((cg.result == "PASS").sum()), "gate_county_count": int(len(cg)),
              "sanity_notes": sanity_notes(cf)}
    (SNAP / "c3_report.json").write_text(json.dumps(report, indent=1, default=float))
    return report


SCHEMA_V2 = "wy_county_ag_baseline_v2"
RAS_NAME = RAS_CSV.name


def _datum(value, unit, source, confidence, notes, year=2026):
    return {"value": value, "unit": unit, "year": year if value is not None else None,
            "source": source, "confidence": confidence, "notes": notes}


def apply_baseline(res: dict, rep: dict) -> dict:
    """Write schema v2 (C-3) into wy_county_ag_baseline.json. Returns the new payload."""
    path = PROCESSED / "wy_county_ag_baseline.json"
    base = json.loads(path.read_text())
    stats, gate = rep["stats"], rep["gate"]
    by = res["by_county"].set_index("county_geoid")
    usfs_reason = ("USFS active AUMs unavailable: the RAS export is BLM-only and the USFS EDW allotment "
                   "polygons carry no AUM field. Existing source unchanged (usfs_grazing; see "
                   "federal_aums.usfs_authorized_use_acres).")
    for geoid, c in base["counties"].items():
        fa = c["federal_aums"]
        row = by.loc[geoid] if geoid in by.index else None
        private = c["cattle_and_forage"]["aum_capacity"]
        if row is None:
            blm_aum = blm_susp = blm_acres = None
            n_allot = 0
        else:
            blm_aum, blm_susp = round(float(row.blm_active_aum), 1), round(float(row.blm_suspended_aum), 1)
            blm_acres, n_allot = round(float(row.blm_public_acres), 1), int(row.blm_allotment_count)
        src = "blm_ras + blm_natl_grazing_allotment_polygons"
        method = ("RAS active (Permitted) AUMs summed per allotment, apportioned to counties by polygon area "
                  "share in EPSG:5070 (JC-2); Wyoming share only for allotments crossing the state line. "
                  "Area apportionment is a judgment call: it assumes AUMs are spread evenly over the allotment.")
        fa["blm_authorized_aum"] = _datum(
            None, "AUM/year", "blm_ras", "low",
            "Superseded by aum_by_ownership.blm_active_aum. RAS 'authorized for use' (billed) AUMs are not in "
            "the export; the export carries active (Permitted) and suspended AUMs.", None)
        fa["blm_suspended_aum"] = _datum(blm_susp, "AUM/year", src, "low",
            "RAS Suspended AUMs, same apportionment as active AUMs. Not authorized for use; not in engine inputs.")
        fa["blm_public_acres"] = _datum(blm_acres, "acres", src, "medium",
            "Polygon overlap x (RAS public acres / polygon acres, capped at 1). Cross-checked against BLM SMA "
            "surface acres (see c3 report).")
        fa["blm_allotment_count"] = _datum(n_allot, "allotments", src, "medium",
            "Matched allotments with polygon area in this county; an allotment spanning counties counts in each.")
        fa["usfs_authorized_aum"] = _datum(None, "AUM/year", "usfs_grazing", "low", usfs_reason, None)
        fa["federal_aum_share"] = _datum(None, "fraction", "blm_ras + usfs_grazing", "low",
            "Needs USFS active AUMs, which no source here provides. BLM-only share is "
            "aum_by_ownership.blm_share_of_forage_capacity.", None)
        c["aum_by_ownership"] = {
            "blm_active_aum": _datum(blm_aum, "AUM/year", src, "low", method),
            "usfs_active_aum": _datum(None, "AUM/year", "usfs_grazing", "low", usfs_reason, None),
            "private_aum_capacity": dict(private, notes=(
                "Unchanged AG0 value (cattle_and_forage.aum_capacity): Census forage acres x 0.0333 AUM/acre "
                "proxy. Not from RAS. Includes no federal or state allotment AUMs by construction.")),
            "blm_share_of_forage_capacity": _datum(
                None if blm_aum is None else round(blm_aum / (blm_aum + private["value"]), 4), "fraction",
                "derived", "low",
                "blm_active_aum / (blm_active_aum + private_aum_capacity). USFS and state AUMs are in neither "
                "term. Private term is a low-confidence proxy; use blm_public_acres / county area as the "
                "physical check."),
        }
    base["schema_version"] = SCHEMA_V2
    base["status"] = "partial_nass_bea_dor_rap_blm_populated_usfs_aum_and_water_still_blocked"
    base["schema_changelog"] = [{
        "version": SCHEMA_V2, "date": "2026-11-16", "ticket": "W7-F3 / C-3",
        "added": ["federal_aums.blm_suspended_aum", "federal_aums.blm_public_acres",
                  "federal_aums.blm_allotment_count", "aum_by_ownership.{blm_active_aum,usfs_active_aum,"
                  "private_aum_capacity,blm_share_of_forage_capacity}", "c3_blm (top level)"],
        "changed": ["federal_aums.blm_authorized_aum: stays null (superseded by aum_by_ownership.blm_active_aum)",
                    "federal_aums.usfs_authorized_aum: 0 -> null. The 0 was an AG0 placeholder for 'AUM count "
                    "not available', not a measurement."],
        "unchanged": ["land_by_use", "cattle_and_forage", "water", "rap_invasive_cover", "ag_economics",
                      "dor_ag_productive_value_coefficients_usd_per_acre", "federal_aums.usfs_authorized_use_acres"],
        "promotion": "NOT promoted. wy_county_ag_engine_baseline.json and terra-app/src/data/county_ag_baseline.json "
                     "are unchanged (credibility gate failed for Campbell; see c3_blm.credibility_gate).",
    }]
    base["c3_blm"] = {
        "sources": {
            "ras": {"file": f"data/raw/blm_ras/{RAS_NAME}", "sha256": sha256(RAS_CSV), "role": "authoritative for AUMs and public acres"},
            "polygons": {"file": POLYGONS.relative_to(ROOT).as_posix(), "sha256": sha256(POLYGONS),
                         "url": "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_Grazing_Allotment_Polygons/FeatureServer/1",
                         "role": "supplemental geometry"},
            "published_total": PUBLISHED_SRC},
        "judgment_calls": {
            "JC-1": {"call": "RAS 'Permitted AUMs' is read as BLM active AUMs.", "confidence": "high",
                     "evidence": "Suspended exceeds Permitted in 167 rows, so Permitted cannot include suspended; "
                                 "WY sums 1,923,355 permitted / 393,770 suspended against BLM-published 1,920,781 / 393,635."},
            "JC-2": {"call": "AUMs apportioned to counties by polygon area share (EPSG:5070).", "confidence": "low-medium",
                     "evidence": "BLM public acres by county from this apportionment are within 5% of independent BLM "
                                 "SMA surface acres in 20 of 23 counties (outliers: Goshen 0.89, Teton 0.09, Johnson 0.947); "
                                 "AUM density within an allotment is assumed uniform."},
            "JC-3": {"call": "Public-land proportion (RAS public acres / polygon acres, capped at 1) scales acres, not AUMs. "
                             "RAS AUMs are already public-land AUMs, so county AUMs = AUMs x area share; multiplying by the "
                             "proportion again would discount private and state inholdings twice and cut the statewide total "
                             "to about 67% of BLM's published figure (1,285,306 vs 1,920,781).", "confidence": "medium",
                     "sensitivity_literal_reading_statewide_aum": round(float(res["by_county"].blm_aum_literal_pp.sum()))},
        },
        "join": stats,
        "credibility_gate": {"pass": rep["gate_pass"], "rows": gate},
    }
    base["credibility_gate"]["rows"] = [r for r in base["credibility_gate"]["rows"]
                                        if not r["check"].startswith("Campbell and Carbon")]
    base["credibility_gate"]["rows"].append({
        "check": "Campbell and Carbon are rangeland-dominated with large federal AUM shares",
        "result": "FAIL (Campbell, BLM)" if not rep["gate_pass"] else "PASS",
        "investigation": "See c3_blm.credibility_gate. Carbon passes. Campbell BLM public acres are 7.3% of county "
                         "area, matching independent BLM SMA surface acres (ratio 1.00). Data not changed; "
                         "stopped for a decision."})
    path.write_text(json.dumps(base, indent=2, ensure_ascii=False) + "\n")
    return base


def _sidecar(path: Path, **meta) -> Path:
    out = path.with_name(path.name + ".sidecar.json")
    meta.update({"file": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)})
    out.write_text(json.dumps(meta, indent=1) + "\n")
    return out


def write_sidecars(stats: dict) -> list[Path]:
    made = [_sidecar(RAS_CSV, original_filename=RAS_NAME,
                     source="BLM Rangeland Administration System (RAS), Allotment Information report, BLM WY State Office",
                     retrieval="manual export by Dylan Hartman, 2026-11-15; see docs/methods/MANUAL_FETCH.md (W7-F3)",
                     retrieval_date="2026-11-15", record_count=stats["ras_rows"],
                     record_unit="authorization rows (one per allotment x authorization)",
                     allotments=stats["ras_allotments"],
                     moved_from="data/raw/ (same bytes; sha256 verified unchanged after move to data/raw/blm_ras/)",
                     pii="Export has no operator names or addresses. Ingest uses an explicit column allowlist.")]
    made.append(_sidecar(POLYGONS, url="https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_Grazing_Allotment_Polygons/FeatureServer/1/query",
                         query="where=ADMIN_ST='WY'&outFields=*&f=geojson&outSR=4326&orderByFields=OBJECTID, resultOffset paging 1000/page",
                         retrieval_date="2026-11-16", record_count=3560, crs="EPSG:4326",
                         tracked_in_git=False, reason_untracked="19 MB, reproducible from the URL; hash recorded here"))
    if SMA_FILE.exists():
        made.append(_sidecar(SMA_FILE, url="https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1/query",
                             query="where=ADMIN_ST='WY' AND ADMIN_AGENCY_CODE IN ('BLM','USFS')&f=geojson&outSR=4326",
                             retrieval_date="2026-11-16", record_count=4, role="independent cross-check of BLM surface acres only",
                             tracked_in_git=False, reason_untracked="20 MB, reproducible from the URL; hash recorded here"))
    return made


def update_manifest(stats: dict) -> None:
    mpath = ROOT / "data/manifest/manifest.json"
    man = json.loads(mpath.read_text())
    gen = "25_wy_ag_baseline_pull.ipynb (C-3 section) via scripts/build_c3_blm_grazing.py"

    def put(rel: str, **kw):
        full = ROOT / rel
        ent = next((e for e in man["files"] if e["path"] == rel), None)
        new = {"path": rel, "pipeline": "H", "generator": gen, "generator_commit": None,
               "sha256": sha256(full), "last_built": "2026-11-16", "class": "live", "tracked": True}
        new.update(kw)
        if ent is None:
            man["files"].append(new)
        else:
            ent.update({k: v for k, v in new.items() if k not in ("generator_commit",)})

    n = lambda rel: sum(1 for _ in (ROOT / rel).open()) - 1
    put("data/processed/wy_blm_allotment_aum.csv", record_count=n("data/processed/wy_blm_allotment_aum.csv"))
    put("data/processed/wy_blm_allotment_county_aum.csv", record_count=n("data/processed/wy_blm_allotment_county_aum.csv"))
    put("data/processed/wy_county_ag_baseline.json", record_count=len(
        json.loads((PROCESSED / "wy_county_ag_baseline.json").read_text())), generator=gen)
    rel = f"data/raw/blm_ras/{RAS_NAME}"
    put(rel, generator="manual export (docs/methods/MANUAL_FETCH.md W7-F3)", record_count=stats["ras_rows"],
        **{"class": "raw"}, note="RAS export; sha256 identical before and after move into blm_ras/")
    put(POLYGONS.relative_to(ROOT).as_posix(), generator="scripts/build_c3_blm_grazing.py (ArcGIS FeatureServer pull)",
        record_count=3560, **{"class": "raw"}, tracked=False)
    if SMA_FILE.exists():
        put(SMA_FILE.relative_to(ROOT).as_posix(), generator="BLM SMA MapServer pull (cross-check)",
            record_count=4, **{"class": "raw"}, tracked=False)
    man["file_count"] = len(man["files"])
    mpath.write_text(json.dumps(man, indent=2) + "\n")


def main() -> None:
    import sys
    apply = "--apply" in sys.argv
    res = build()
    PROCESSED.mkdir(exist_ok=True)
    SNAP.mkdir(parents=True, exist_ok=True)
    j, m, b = res["joined"], res["apportion"], res["by_county"]
    cols = ["st_allot", "allot_name", "poly_name", "admin_st", "admin_office", "mgmt_category",
            "available", "join", "ras_rows", "polygons", "public_acres", "poly_acres", "gis_acres_attr",
            "public_prop_raw", "wy_acres", "wy_share", "active_aum", "suspended_aum", "susp_use_temp"]
    j[cols].round(6).to_csv(PROCESSED / "wy_blm_allotment_aum.csv", index=False)
    m[["st_allot", "allot_name", "county_geoid", "county_name", "overlap_acres", "share",
       "public_acres_county", "active_aum_county", "suspended_aum_county"]].round(6).to_csv(
        PROCESSED / "wy_blm_allotment_county_aum.csv", index=False)
    b.round(6).to_csv(SNAP / "c3_county_blm_totals.csv", index=False)
    baseline = json.loads((PROCESSED / "wy_county_ag_baseline.json").read_text())
    rep = write_report(res, baseline)
    print(json.dumps(rep["stats"], indent=1, default=float))
    for r in rep["gate"]:
        print(r["result"], "|", r["check"], "|", r["value"], "|", r.get("deviation", ""))
    if apply:
        apply_baseline(res, rep)
        write_sidecars(rep["stats"])
        update_manifest(rep["stats"])
        print("applied: baseline v2, sidecars, manifest")


if __name__ == "__main__":
    main()
