"""
Utility functions for the US energy network visualization project.
"""

from pathlib import Path
import os
import urllib.parse

import requests
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from dotenv import load_dotenv

# Project root is one level up from src/
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_eia_key() -> str:
    """Load and return the EIA_API_KEY from a .env file."""
    load_dotenv(PROJECT_ROOT / ".env")
    key = os.getenv("EIA_API_KEY")
    if not key:
        raise EnvironmentError(
            "EIA_API_KEY not found. Copy .env.example to .env and set your key."
        )
    return key


def eia_get(endpoint: str, params: dict) -> dict:
    """
    Make an authenticated GET request to the EIA API v2.

    Parameters
    ----------
    endpoint : str
        Path relative to https://api.eia.gov/v2/ (e.g. 'electricity/operating-generator-capacity')
    params : dict
        Query parameters (api_key is appended automatically).

    Returns
    -------
    dict
        Parsed JSON response body.
    """
    base_url = "https://api.eia.gov/v2/"
    url = base_url + endpoint.lstrip("/")
    params = {**params, "api_key": get_eia_key()}
    # Use safe='[]' so bracket notation (e.g. data[0]=...) is not percent-encoded;
    # the EIA API v2 requires unencoded brackets to recognise array parameters.
    query_string = urllib.parse.urlencode(params, safe="[]")
    response = requests.get(url + "?" + query_string, timeout=60)
    response.raise_for_status()
    return response.json()


def df_to_geodataframe(
    df: pd.DataFrame,
    lat_col: str,
    lon_col: str,
    crs: str = "EPSG:4326",
) -> gpd.GeoDataFrame:
    """
    Convert a DataFrame with lat/lon columns to a GeoDataFrame.

    Rows where lat or lon are null are dropped before conversion.

    Parameters
    ----------
    df : pd.DataFrame
    lat_col : str
        Name of the latitude column.
    lon_col : str
        Name of the longitude column.
    crs : str
        Coordinate reference system string (default EPSG:4326).

    Returns
    -------
    gpd.GeoDataFrame
    """
    df = df.dropna(subset=[lat_col, lon_col]).copy()
    df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
    df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")
    df = df.dropna(subset=[lat_col, lon_col])

    geometry = [Point(lon, lat) for lon, lat in zip(df[lon_col], df[lat_col])]
    gdf = gpd.GeoDataFrame(df, geometry=geometry, crs=crs)
    return gdf


def save_processed(gdf: gpd.GeoDataFrame, filename: str) -> Path:
    """
    Save a GeoDataFrame to data/processed/ as GeoJSON.

    Parameters
    ----------
    gdf : gpd.GeoDataFrame
    filename : str
        Output filename, e.g. 'power_plants.geojson'.

    Returns
    -------
    Path
        Absolute path to the saved file.
    """
    out_dir = PROJECT_ROOT / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / filename
    gdf.to_file(out_path, driver="GeoJSON")
    print(f"Saved {len(gdf):,} features → {out_path}")
    return out_path
