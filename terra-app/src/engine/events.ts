/**
 * TERRA Event Deck — pure functions for deterministic and stochastic events.
 * No React imports, no side effects.
 */

import type {
  ClimateHazardBaseline,
  ClimateHazardEvent,
  ClimateHazardKind,
  ClimateHazardSamplingInput,
  ClimateProjectionPoint,
  EngineState,
  GameEvent,
  GameEventCategory,
} from './types.js';

// ── C4-i Climate Hazard Event Stream ───────────────────────────────────────

const PPM = 1_000_000;

const CLIMATE_HAZARD_SPECS: ReadonlyArray<{
  kind: ClimateHazardKind;
  frequencyKey: keyof ClimateHazardBaseline;
  riskKey: keyof ClimateHazardBaseline;
  metric: string;
}> = [
  {
    kind: 'heat_wave',
    frequencyKey: 'heat_wave_frequency',
    riskKey: 'heat_wave_risk_score',
    metric: 'days_gt_95f',
  },
  {
    kind: 'wildfire_smoke_proximity',
    frequencyKey: 'wildfire_frequency',
    riskKey: 'wildfire_risk_score',
    metric: 'high_fire_danger_days',
  },
  {
    kind: 'drought_stress',
    frequencyKey: 'drought_frequency',
    riskKey: 'drought_risk_score',
    metric: 'max_consecutive_dry_days',
  },
  {
    kind: 'severe_storm',
    frequencyKey: 'severe_storm_frequency',
    riskKey: 'severe_storm_risk_score',
    metric: 'precip_99p_daily_in',
  },
];

const CLIMATE_HAZARD_ORDER = new Map(
  CLIMATE_HAZARD_SPECS.map((spec, index) => [spec.kind, index]),
);

const CLIMATE_EVENT_FIELDS: ReadonlyArray<keyof ClimateHazardEvent> = [
  'event_id',
  'year',
  'geoid',
  'hazard_kind',
  'severity_milli',
  'annual_probability_ppm',
  'baseline_frequency_micros',
  'projection_factor_ppm',
  'lens',
  'seed',
  'consequence_multiplier_ppm',
];

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function roundRatio(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function fnv1a32(value: string): number {
  let result = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte;
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result >>> 0;
}

type ProjectionIndex = Map<string, Array<[number, number]>>;

function interpolate(points: Array<[number, number]>, year: number): number {
  if (year <= points[0][0]) return points[0][1];
  if (year >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let index = 1; index < points.length; index++) {
    const [upperYear, upperValue] = points[index];
    if (year <= upperYear) {
      const [lowerYear, lowerValue] = points[index - 1];
      const weight = (year - lowerYear) / (upperYear - lowerYear);
      return lowerValue + (upperValue - lowerValue) * weight;
    }
  }
  throw new Error('projection interpolation did not find an interval');
}

function buildProjectionIndex(
  points: readonly ClimateProjectionPoint[],
  lens: string,
): ProjectionIndex {
  const index: ProjectionIndex = new Map();
  const requiredMetrics = new Set(CLIMATE_HAZARD_SPECS.map((spec) => spec.metric));
  for (const point of points) {
    if (point.lens !== lens || point.percentile !== 'p50') continue;
    if (!requiredMetrics.has(point.metric)) continue;
    if (!Number.isInteger(point.epoch) || !Number.isFinite(point.value)) {
      throw new Error('projection epoch/value must be finite numbers');
    }
    const geoid = point.geoid.padStart(5, '0');
    const key = `${geoid}|${point.metric}`;
    const metricPoints = index.get(key) ?? [];
    metricPoints.push([point.epoch, point.value]);
    index.set(key, metricPoints);
  }
  for (const metricPoints of index.values()) {
    metricPoints.sort((left, right) => left[0] - right[0]);
  }
  return index;
}

function projectionFactorPpm(
  index: ProjectionIndex,
  geoid: string,
  metric: string,
  year: number,
): number {
  const points = index.get(`${geoid}|${metric}`);
  if (!points) return PPM;
  const reference = interpolate(points, 2030);
  if (reference <= 0) return PPM;
  const factor = interpolate(points, year) / reference;
  return Math.min(4 * PPM, Math.max(PPM / 4, roundHalfUp(factor * PPM)));
}

function validateBaseline(baseline: ClimateHazardBaseline): string {
  const geoid = baseline.geoid.padStart(5, '0');
  if (!/^\d{5}$/.test(geoid)) throw new Error(`invalid county geoid ${baseline.geoid}`);
  for (const spec of CLIMATE_HAZARD_SPECS) {
    const frequency = baseline[spec.frequencyKey];
    const risk = baseline[spec.riskKey];
    if (typeof frequency !== 'number' || !Number.isFinite(frequency) || frequency < 0) {
      throw new Error(`${String(spec.frequencyKey)} must be finite and non-negative`);
    }
    if (typeof risk !== 'number' || !Number.isFinite(risk) || risk < 0) {
      throw new Error(`${String(spec.riskKey)} must be finite and non-negative`);
    }
  }
  return geoid;
}

function compareClimateEvents(
  left: ClimateHazardEvent,
  right: ClimateHazardEvent,
): number {
  if (left.lens !== right.lens) return left.lens < right.lens ? -1 : 1;
  if (left.seed !== right.seed) return left.seed - right.seed;
  if (left.year !== right.year) return left.year - right.year;
  if (left.geoid !== right.geoid) return left.geoid < right.geoid ? -1 : 1;
  return (
    (CLIMATE_HAZARD_ORDER.get(left.hazard_kind) ?? -1) -
    (CLIMATE_HAZARD_ORDER.get(right.hazard_kind) ?? -1)
  );
}

export function sampleClimateHazardEvents(
  input: ClimateHazardSamplingInput,
): ClimateHazardEvent[] {
  if (!['historical', 'ssp245', 'ssp370'].includes(input.lens)) {
    throw new Error(`invalid climate lens ${input.lens}`);
  }
  if (!Number.isInteger(input.seed)) throw new Error('seed must be an integer');
  if (input.lens === 'historical') return [];

  const years = [...new Set(input.years)].sort((left, right) => left - right);
  if (years.length === 0 || years.some((year) => !Number.isInteger(year))) {
    throw new Error('years must contain integers');
  }
  const baselines: Array<[string, ClimateHazardBaseline]> = [];
  const seenGeoids = new Set<string>();
  for (const baseline of input.countyBaselines) {
    const geoid = validateBaseline(baseline);
    if (seenGeoids.has(geoid)) throw new Error(`duplicate county baseline for ${geoid}`);
    seenGeoids.add(geoid);
    baselines.push([geoid, baseline]);
  }
  baselines.sort((left, right) => left[0].localeCompare(right[0]));
  const projectionIndex = buildProjectionIndex(input.projectionPoints, input.lens);
  const events: ClimateHazardEvent[] = [];

  for (const year of years) {
    for (const [geoid, baseline] of baselines) {
      for (const spec of CLIMATE_HAZARD_SPECS) {
        const factorPpm = projectionFactorPpm(
          projectionIndex,
          geoid,
          spec.metric,
          year,
        );
        const baselineFrequencyMicros = roundHalfUp(
          (baseline[spec.frequencyKey] as number) * PPM,
        );
        const scaledFrequencyMicros = roundRatio(
          baselineFrequencyMicros * factorPpm,
          PPM,
        );
        const annualProbabilityPpm = roundRatio(
          scaledFrequencyMicros * PPM,
          PPM + scaledFrequencyMicros,
        );
        const eventKey = `${input.seed}|${input.lens}|${year}|${geoid}|${spec.kind}`;
        if (fnv1a32(`${eventKey}|occurrence`) % PPM >= annualProbabilityPpm) {
          continue;
        }
        const riskMilli = roundHalfUp((baseline[spec.riskKey] as number) * 1000);
        const baselineSeverityMilli = 500 + roundRatio(riskMilli, 100);
        const severityMilli =
          roundRatio(baselineSeverityMilli * factorPpm, PPM) +
          (fnv1a32(`${eventKey}|severity`) % 501);
        events.push({
          event_id: `c4i:${input.lens}:${input.seed}:${year}:${geoid}:${spec.kind}`,
          year,
          geoid,
          hazard_kind: spec.kind,
          severity_milli: severityMilli,
          annual_probability_ppm: annualProbabilityPpm,
          baseline_frequency_micros: baselineFrequencyMicros,
          projection_factor_ppm: factorPpm,
          lens: input.lens,
          seed: input.seed,
          consequence_multiplier_ppm: 0,
        });
      }
    }
  }
  events.sort(compareClimateEvents);
  return events;
}

export function canonicalClimateEventStream(events: readonly ClimateHazardEvent[]): string {
  const ordered = [...events].sort(compareClimateEvents);
  const normalized = ordered.map((event) =>
    Object.fromEntries(CLIMATE_EVENT_FIELDS.map((field) => [field, event[field]])),
  );
  return `${JSON.stringify(normalized)}\n`;
}

// ── Seeded RNG (mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Deterministic Events ───────────────────────────────────────────────────

const DETERMINISTIC_EVENTS: GameEvent[] = [
  {
    event_id: 'naughton_conversion_2026',
    type: 'deterministic',
    category: 'asset_operational',
    year: 2026,
    title: 'Naughton Gas Conversion Online',
    description:
      'Naughton Unit 1 coal-to-gas conversion complete. Lincoln County gas capacity online.',
    engine_effect: {
      fn: 'applyAction',
      args: { action_id: 'coal_repowering', geoid: '56023', magnitude: 330 },
    },
  },
  {
    event_id: 'kemmerer_operational_2031',
    type: 'deterministic',
    category: 'asset_operational',
    year: 2031,
    title: 'Kemmerer Unit 1 Operational',
    description:
      'TerraPower Natrium Unit 1 begins commercial operation. First advanced nuclear plant in WY.',
    engine_effect: null,
  },
  {
    event_id: 'bwxt_operational_2029',
    type: 'deterministic',
    category: 'asset_operational',
    year: 2029,
    title: 'BWXT Gillette Fuel Facility Online',
    description:
      'BWXT TRISO/HALEU fuel fabrication facility begins operation. Domestic fuel supply chain strengthened.',
    engine_effect: null,
  },
];

// ── Stochastic Probability Tables ──────────────────────────────────────────

interface EraProbs {
  heat_wave: number;
  drought: number;
  policy_shock: number;
  labor_shortage: number;
  supply_chain_disruption: number;
  transmission_outage: number;
}

const ERA_PROBS: { start: number; end: number; probs: EraProbs }[] = [
  {
    start: 2025,
    end: 2035,
    probs: {
      heat_wave: 0.15,
      drought: 0.10,
      policy_shock: 0.05,
      labor_shortage: 0.05,
      supply_chain_disruption: 0.08,
      transmission_outage: 0.06,
    },
  },
  {
    start: 2035,
    end: 2045,
    probs: {
      heat_wave: 0.20,
      drought: 0.15,
      policy_shock: 0.05,
      labor_shortage: 0.05,
      supply_chain_disruption: 0.08,
      transmission_outage: 0.06,
    },
  },
  {
    start: 2045,
    end: 2055,
    probs: {
      heat_wave: 0.28,
      drought: 0.20,
      policy_shock: 0.05,
      labor_shortage: 0.05,
      supply_chain_disruption: 0.08,
      transmission_outage: 0.06,
    },
  },
  {
    start: 2055,
    end: 2075,
    probs: {
      heat_wave: 0.35,
      drought: 0.25,
      policy_shock: 0.05,
      labor_shortage: 0.05,
      supply_chain_disruption: 0.08,
      transmission_outage: 0.06,
    },
  },
];

function getEraProbs(year: number): EraProbs {
  for (const e of ERA_PROBS) {
    if (year >= e.start && year < e.end) return e.probs;
  }
  return ERA_PROBS[ERA_PROBS.length - 1].probs;
}

// ── Stochastic Event Generation ────────────────────────────────────────────

const SEVERITY_LEVELS = [1.0, 2.0, 3.0];

const EVENT_TITLES: Record<string, string> = {
  heat_wave: 'Extreme Heat Event',
  drought: 'Drought Conditions',
  policy_shock: 'Policy Shift',
  labor_shortage: 'Labor Shortage',
  supply_chain_disruption: 'Supply Chain Disruption',
  transmission_outage: 'Transmission Outage',
};

const EVENT_DESCS: Record<string, (severity: number, geoids: string[]) => string> = {
  heat_wave: (sev, geoids) =>
    `Severity ${sev} heat wave affecting ${geoids.length} counties. Load spikes and EES impacts expected.`,
  drought: (sev, geoids) =>
    `Severity ${sev} drought conditions across ${geoids.length} counties. Hydro and agricultural impacts.`,
  policy_shock: (sev) =>
    `Severity ${sev} policy change affecting permitting and project timelines.`,
  labor_shortage: (sev) =>
    `Severity ${sev} labor shortage impacting energy construction workforce availability.`,
  supply_chain_disruption: (sev) =>
    `Severity ${sev} supply chain disruption. SMR build timelines may be affected.`,
  transmission_outage: (sev) =>
    `Severity ${sev} transmission outage reported on study-area grid segments.`,
};

export function drawStochasticEvents(
  year: number,
  engineState: EngineState,
  seed?: number,
): GameEvent[] {
  const rng = mulberry32((seed ?? 0) + year * 7919);
  const probs = getEraProbs(year);
  const events: GameEvent[] = [];
  const studyGeoids = Object.keys(engineState.county_ees);

  // Helper: pick N random geoids
  const pickGeoids = (n: number): string[] => {
    const shuffled = [...studyGeoids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(n, shuffled.length));
  };

  const pickSeverity = (): number => SEVERITY_LEVELS[Math.floor(rng() * 3)];

  // Weather events
  for (const evtType of ['heat_wave', 'drought'] as const) {
    if (rng() < probs[evtType]) {
      const sev = pickSeverity();
      const numCounties = 3 + Math.floor(rng() * 6); // 3-8 counties
      const affected = pickGeoids(numCounties);
      events.push({
        event_id: `${evtType}_${year}_${Math.floor(rng() * 10000)}`,
        type: 'stochastic',
        category: evtType as GameEventCategory,
        severity: sev,
        affected_geoids: affected,
        title: EVENT_TITLES[evtType],
        description: EVENT_DESCS[evtType](sev, affected),
        year,
        engine_effect: {
          fn: 'injectDisturbance',
          args: { disturbance_type: evtType, severity: sev, geoids: affected },
        },
      });
    }
  }

  // Policy/labor events (study-wide)
  for (const evtType of ['policy_shock', 'labor_shortage'] as const) {
    if (rng() < probs[evtType]) {
      const sev = pickSeverity();
      events.push({
        event_id: `${evtType}_${year}_${Math.floor(rng() * 10000)}`,
        type: 'stochastic',
        category: evtType as GameEventCategory,
        severity: sev,
        title: EVENT_TITLES[evtType],
        description: EVENT_DESCS[evtType](sev, []),
        year,
        engine_effect: null, // display-only
      });
    }
  }

  // Supply chain disruption: only if SMR in build queue
  const hasSMRInQueue = engineState.build_queue.some(
    b => !b.commissioned && ['smr_advanced', 'coal_to_smr'].includes(b.action_id),
  );
  if (hasSMRInQueue && rng() < probs.supply_chain_disruption) {
    const sev = pickSeverity();
    events.push({
      event_id: `supply_chain_disruption_${year}_${Math.floor(rng() * 10000)}`,
      type: 'stochastic',
      category: 'supply_chain_disruption',
      severity: sev,
      title: EVENT_TITLES.supply_chain_disruption,
      description: EVENT_DESCS.supply_chain_disruption(sev, []),
      year,
      engine_effect: null, // delay handled by store logic if desired
    });
  }

  // Transmission outage: display-only
  if (rng() < probs.transmission_outage) {
    const sev = pickSeverity();
    events.push({
      event_id: `transmission_outage_${year}_${Math.floor(rng() * 10000)}`,
      type: 'stochastic',
      category: 'transmission_outage',
      severity: sev,
      title: EVENT_TITLES.transmission_outage,
      description: EVENT_DESCS.transmission_outage(sev, []),
      year,
      engine_effect: null,
    });
  }

  return events;
}

// ── Deterministic Events ───────────────────────────────────────────────────

export function getDeterministicEvents(year: number): GameEvent[] {
  return DETERMINISTIC_EVENTS.filter(e => e.year === year);
}

// ── Combined ───────────────────────────────────────────────────────────────

export function getAllEventsForYear(
  year: number,
  engineState: EngineState,
  seed: number,
): GameEvent[] {
  return [
    ...getDeterministicEvents(year),
    ...drawStochasticEvents(year, engineState, seed),
  ];
}
