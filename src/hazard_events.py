"""Seeded, exogenous C4-i climate hazard event sampling.

The annual occurrence conversion uses the first-order Padé approximation
``p = λ / (1 + λ)``.  It is valid for rare hazards (``λ << 1``) and
degrades once ``λ >= 0.5``; callers must revisit the approximation before
introducing high-frequency baselines.

``severity_milli`` intentionally has no finite *sampler* ceiling because the
accepted risk score is only constrained to be finite and non-negative.  Its
documented C4-ii consequence ceiling is 3,000 milli-severity (the existing
disturbance handler's 0–3 scale); larger raw values remain in the event stream
but are clamped only during consequence normalization.  Sampling is unchanged,
so the C4-i event-stream contract is preserved.
"""

from __future__ import annotations

import json
import math


VALID_LENSES = frozenset({"historical", "ssp245", "ssp370"})
PPM = 1_000_000
INERT_CONSEQUENCE_MULTIPLIER_PPM = 0
CONSEQUENCE_SEVERITY_CEILING_MILLI = 3_000
HASH_MODULUS = 4_294_967_296
EVENT_FIELDS = (
    "event_id",
    "year",
    "geoid",
    "hazard_kind",
    "severity_milli",
    "annual_probability_ppm",
    "baseline_frequency_micros",
    "projection_factor_ppm",
    "lens",
    "seed",
    "consequence_multiplier_ppm",
)
HAZARD_SPECS = (
    (
        "heat_wave",
        "heat_wave_frequency",
        "heat_wave_risk_score",
        "days_gt_95f",
    ),
    (
        "wildfire_smoke_proximity",
        "wildfire_frequency",
        "wildfire_risk_score",
        "high_fire_danger_days",
    ),
    (
        "drought_stress",
        "drought_frequency",
        "drought_risk_score",
        "max_consecutive_dry_days",
    ),
    (
        "severe_storm",
        "severe_storm_frequency",
        "severe_storm_risk_score",
        "precip_99p_daily_in",
    ),
)
HAZARD_ORDER = {
    kind: index for index, (kind, _frequency, _risk, _metric) in enumerate(HAZARD_SPECS)
}


def _round_half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def _round_ratio(numerator: int, denominator: int) -> int:
    return (numerator + denominator // 2) // denominator


def _fnv1a_32(value: str) -> int:
    result = 0x811C9DC5
    for byte in value.encode("utf-8"):
        result ^= byte
        result = (result * 0x01000193) & 0xFFFFFFFF
    return result


def _interpolate(points: list[tuple[int, float]], year: int) -> float:
    if year <= points[0][0]:
        return points[0][1]
    if year >= points[-1][0]:
        return points[-1][1]
    for index in range(1, len(points)):
        upper_year, upper_value = points[index]
        if year <= upper_year:
            lower_year, lower_value = points[index - 1]
            weight = (year - lower_year) / (upper_year - lower_year)
            return lower_value + (upper_value - lower_value) * weight
    raise AssertionError("projection interpolation did not find an interval")


def _projection_index(projection_points: list[dict], lens: str) -> dict:
    index: dict[tuple[str, str], list[tuple[int, float]]] = {}
    required_metrics = {spec[3] for spec in HAZARD_SPECS}
    for point in projection_points:
        if point.get("lens") != lens or point.get("percentile") != "p50":
            continue
        metric = point.get("metric")
        if metric not in required_metrics:
            continue
        geoid = str(point.get("geoid", "")).zfill(5)
        epoch = point.get("epoch")
        value = point.get("value")
        if not isinstance(epoch, int) or not isinstance(value, (int, float)):
            raise ValueError("projection epoch/value must be numeric")
        if not math.isfinite(value):
            raise ValueError("projection value must be finite")
        index.setdefault((geoid, metric), []).append((epoch, float(value)))
    for points in index.values():
        points.sort(key=lambda point: point[0])
    return index


def _projection_factor_ppm(
    index: dict,
    geoid: str,
    metric: str,
    year: int,
) -> int:
    points = index.get((geoid, metric))
    if not points:
        return PPM
    reference = _interpolate(points, 2030)
    if reference <= 0:
        return PPM
    factor = _interpolate(points, year) / reference
    return min(4 * PPM, max(PPM // 4, _round_half_up(factor * PPM)))


def _validate_baseline(row: dict) -> str:
    geoid = str(row.get("geoid", "")).zfill(5)
    if len(geoid) != 5 or not geoid.isdigit():
        raise ValueError(f"invalid county geoid {row.get('geoid')!r}")
    for _kind, frequency_key, risk_key, _metric in HAZARD_SPECS:
        frequency = row.get(frequency_key)
        risk = row.get(risk_key)
        if not isinstance(frequency, (int, float)) or not math.isfinite(frequency):
            raise ValueError(f"{frequency_key} must be finite")
        if frequency < 0:
            raise ValueError(f"{frequency_key} must be non-negative")
        if not isinstance(risk, (int, float)) or not math.isfinite(risk):
            raise ValueError(f"{risk_key} must be finite")
        if risk < 0:
            raise ValueError(f"{risk_key} must be non-negative")
    return geoid


def sample_climate_hazard_events(
    *,
    seed: int,
    lens: str,
    years,
    county_baselines: list[dict],
    projection_points: list[dict],
) -> list[dict]:
    """Sample county-year hazards from C2 frequencies and active-lens p50 deltas."""
    if lens not in VALID_LENSES:
        raise ValueError(f"invalid climate lens {lens!r}")
    if not isinstance(seed, int):
        raise TypeError("seed must be an integer")
    if lens == "historical":
        return []

    ordered_years = sorted(set(years))
    if not ordered_years or any(not isinstance(year, int) for year in ordered_years):
        raise ValueError("years must contain integers")

    ordered_baselines = []
    seen_geoids = set()
    for row in county_baselines:
        geoid = _validate_baseline(row)
        if geoid in seen_geoids:
            raise ValueError(f"duplicate county baseline for {geoid}")
        seen_geoids.add(geoid)
        ordered_baselines.append((geoid, row))
    ordered_baselines.sort(key=lambda pair: pair[0])
    projection_index = _projection_index(projection_points, lens)

    events = []
    for year in ordered_years:
        for geoid, baseline in ordered_baselines:
            for kind, frequency_key, risk_key, metric in HAZARD_SPECS:
                factor_ppm = _projection_factor_ppm(
                    projection_index, geoid, metric, year
                )
                baseline_frequency_micros = _round_half_up(
                    float(baseline[frequency_key]) * PPM
                )
                scaled_frequency_micros = _round_ratio(
                    baseline_frequency_micros * factor_ppm, PPM
                )
                annual_probability_ppm = _round_ratio(
                    scaled_frequency_micros * PPM,
                    PPM + scaled_frequency_micros,
                )
                event_key = f"{seed}|{lens}|{year}|{geoid}|{kind}"
                if _fnv1a_32(f"{event_key}|occurrence") % PPM >= annual_probability_ppm:
                    continue
                risk_milli = _round_half_up(float(baseline[risk_key]) * 1000)
                baseline_severity_milli = 500 + _round_ratio(risk_milli, 100)
                severity_milli = _round_ratio(
                    baseline_severity_milli * factor_ppm, PPM
                ) + (_fnv1a_32(f"{event_key}|severity") % 501)
                events.append(
                    {
                        "event_id": f"c4i:{lens}:{seed}:{year}:{geoid}:{kind}",
                        "year": year,
                        "geoid": geoid,
                        "hazard_kind": kind,
                        "severity_milli": severity_milli,
                        "annual_probability_ppm": annual_probability_ppm,
                        "baseline_frequency_micros": baseline_frequency_micros,
                        "projection_factor_ppm": factor_ppm,
                        "lens": lens,
                        "seed": seed,
                        "consequence_multiplier_ppm": INERT_CONSEQUENCE_MULTIPLIER_PPM,
                    }
                )
    events.sort(
        key=lambda event: (
            event["lens"],
            event["seed"],
            event["year"],
            event["geoid"],
            HAZARD_ORDER[event["hazard_kind"]],
        )
    )
    return events


def canonical_event_stream(events: list[dict]) -> bytes:
    """Serialize events with shared field order, event order, and trailing newline."""
    ordered_events = sorted(
        events,
        key=lambda event: (
            event["lens"],
            event["seed"],
            event["year"],
            event["geoid"],
            HAZARD_ORDER[event["hazard_kind"]],
        ),
    )
    normalized = [
        {field: event[field] for field in EVENT_FIELDS} for event in ordered_events
    ]
    return (json.dumps(normalized, separators=(",", ":")) + "\n").encode("utf-8")
