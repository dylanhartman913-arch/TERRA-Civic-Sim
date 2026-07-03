/**
 * TERRA Event Deck — pure functions for deterministic and stochastic events.
 * No React imports, no side effects.
 */

import type {
  EngineState,
  GameEvent,
  GameEventCategory,
} from './types.js';

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
