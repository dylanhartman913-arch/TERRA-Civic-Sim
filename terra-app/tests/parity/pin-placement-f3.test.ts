/**
 * F3 Coordinate-Inertness Parity Tests
 *
 * Governing rule: site_coords on ActionLogEntry is a UI-only field.
 * It must be:
 *   (a) excluded from the replay digest
 *   (b) invisible to every engine function
 *   (c) preserved by export/import round-trip
 *   (d) compatible with C0 climate_lens round-trip
 *
 * Tests:
 *   1. Golden-B replay with site_coords injected on every action produces
 *      the SAME digest as without — coordinate-inertness parity.
 *   2. Export a pinned run → reimport → site_coords survive, digest matches.
 *   3. Pinned save with climate_lens: "historical" round-trips with an
 *      unchanged digest (C0 interaction).
 *   4. Mix of pinned and unpinned entries — only pinned ones carry coords.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { replayScenario, computeReplayDigest } from '../../src/engine/replay.js';
import { importFromJson, exportToJson } from '../../src/engine/persistence.js';
import type {
  ScenarioFile,
  ActionLogEntry,
  CountyEESBaseline,
  CrosswalkRow,
  ActionLibrary,
  InitialNetwork,
} from '../../src/engine/types.js';

// ── Static data ──────────────────────────────────────────────────────────────

const DATA_DIR = resolve(__dirname, '../../src/data');

const baseline = JSON.parse(
  readFileSync(resolve(DATA_DIR, 'county_ees_baseline.json'), 'utf-8'),
) as CountyEESBaseline[];

const crosswalk = JSON.parse(
  readFileSync(resolve(DATA_DIR, 'county_crosswalk.json'), 'utf-8'),
) as CrosswalkRow[];

const actionLibrary = JSON.parse(
  readFileSync(resolve(DATA_DIR, 'action_library_v3.json'), 'utf-8'),
) as ActionLibrary;

const initialNetwork = JSON.parse(
  readFileSync(resolve(DATA_DIR, 'initial_network.json'), 'utf-8'),
) as InitialNetwork;

const countyCards = JSON.parse(
  readFileSync(resolve(DATA_DIR, 'county_cards.json'), 'utf-8'),
) as Record<string, unknown>;

// ── Shared action log (mirrors Golden-B player sequence) ─────────────────────

/** These are the same queue entries used in the Golden-B fixture's player sequence. */
const GOLDEN_B_LOG: ActionLogEntry[] = [
  {
    type: 'queue',
    actionId: 'smr_advanced',
    geoid: '56021',
    magnitude: 345,
    year: 2028,
    decisionYear: 2028,
    overrideOp: 2032,
    timestamp: 1,
  },
  {
    type: 'queue',
    actionId: 'smr_advanced',
    geoid: '56021',
    magnitude: 345,
    year: 2028,
    decisionYear: 2028,
    overrideOp: 2032,
    timestamp: 2,
  },
  {
    type: 'queue',
    actionId: 'transmission_230kv',
    geoid: '56021',
    magnitude: 100,
    year: 2028,
    decisionYear: 2028,
    timestamp: 3,
  },
  {
    type: 'apply',
    actionId: 'workforce_retraining',
    geoid: '56021',
    magnitude: 1000,
    year: 2028,
    timestamp: 4,
  },
  {
    type: 'apply',
    actionId: 'workforce_retraining',
    geoid: '56021',
    magnitude: 1000,
    year: 2028,
    timestamp: 5,
  },
  {
    type: 'apply',
    actionId: 'affordable_housing',
    geoid: '56021',
    magnitude: 50,
    year: 2028,
    timestamp: 6,
  },
  {
    type: 'queue',
    actionId: 'battery_grid',
    geoid: '56021',
    magnitude: 500,
    year: 2028,
    decisionYear: 2028,
    timestamp: 7,
  },
];

/** Pre-placed campaign assets for Golden-B (from fixture). */
const PRE_PLACED_LOG: ActionLogEntry[] = [
  {
    type: 'queue',
    actionId: 'data_center_hyperscale',
    geoid: '56021',
    magnitude: 300,
    year: 2025,
    decisionYear: 2025,
    overrideOp: 2027,
    timestamp: 0,
  },
  {
    type: 'queue',
    actionId: 'smr_advanced',
    geoid: '56021',
    magnitude: 345,
    year: 2025,
    decisionYear: 2025,
    overrideOp: 2028,
    timestamp: 0,
  },
  {
    type: 'queue',
    actionId: 'transmission_230kv',
    geoid: '56021',
    magnitude: 100,
    year: 2025,
    decisionYear: 2025,
    timestamp: 0,
  },
];

const FULL_LOG: ActionLogEntry[] = [...PRE_PLACED_LOG, ...GOLDEN_B_LOG];

// Build the base ScenarioFile (no site_coords)
const BASE_UNPINNED: ScenarioFile = {
  schema_version: '3.1',
  terra_version: '1.0',
  exported_at: '2026-07-11T00:00:00.000Z',
  name: 'F3 parity base',
  gameSeed: 42,
  start_year: 2025,
  activeScenario: null,
  actionLog: FULL_LOG,
  eventHistory: [],
  year_reached: 2032,
  replay_digest: '',
  climate_lens: 'historical',
};

/** Inject dummy site_coords on EVERY action entry. */
const PINNED_LOG: ActionLogEntry[] = FULL_LOG.map((e, idx) => ({
  ...e,
  site_coords: [-106.5 + idx * 0.01, 43.0 + idx * 0.01] as [number, number],
}));

const BASE_PINNED: ScenarioFile = {
  ...BASE_UNPINNED,
  actionLog: PINNED_LOG,
};

// ── 1. Coordinate-inertness parity: with vs without site_coords ───────────────

describe('F3 coordinate-inertness parity (item 1)', () => {
  it('Golden-B replay with site_coords yields IDENTICAL digest to without', () => {
    // Without coords
    const stateUnpinned = replayScenario(
      BASE_UNPINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const digestUnpinned = computeReplayDigest(stateUnpinned, 'historical');

    // With coords injected on every entry
    const statePinned = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const digestPinned = computeReplayDigest(statePinned, 'historical');

    // RELATIVE test — survives future digest regeneration
    expect(digestPinned).toBe(digestUnpinned);
    expect(digestPinned).toBeTruthy();
  });

  it('Final engine state is identical with and without site_coords', () => {
    const stateUnpinned = replayScenario(
      BASE_UNPINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const statePinned = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );

    // County EES values must be byte-identical
    expect(statePinned.year).toBe(stateUnpinned.year);
    for (const geoid of Object.keys(stateUnpinned.county_ees)) {
      const u = stateUnpinned.county_ees[geoid];
      const p = statePinned.county_ees[geoid];
      expect(p.E).toBe(u.E);
      expect(p.Ec).toBe(u.Ec);
      expect(p.S).toBe(u.S);
    }

    // Build queue identical
    expect(statePinned.build_queue.length).toBe(stateUnpinned.build_queue.length);
    expect(statePinned.active_couplings.length).toBe(stateUnpinned.active_couplings.length);
  });
});

// ── 2. Export / reimport round-trip ──────────────────────────────────────────

describe('F3 export/reimport round-trip (item 2)', () => {
  it('site_coords survive export → importFromJson', () => {
    const statePinned = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const digest = computeReplayDigest(statePinned, 'historical');

    const fileWithDigest: ScenarioFile = {
      ...BASE_PINNED,
      replay_digest: digest,
    };

    const json = exportToJson(fileWithDigest);
    const reimported = importFromJson(json);

    expect(reimported).not.toBeNull();

    // Verify all site_coords survived
    for (let i = 0; i < PINNED_LOG.length; i++) {
      const orig = PINNED_LOG[i].site_coords;
      const re = reimported!.actionLog[i].site_coords;
      if (orig) {
        expect(re).toBeDefined();
        expect(re![0]).toBeCloseTo(orig[0], 6);
        expect(re![1]).toBeCloseTo(orig[1], 6);
      }
    }
  });

  it('digest matches after reimport (replay integrity preserved)', () => {
    const statePinned = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const originalDigest = computeReplayDigest(statePinned, 'historical');

    const fileWithDigest: ScenarioFile = {
      ...BASE_PINNED,
      replay_digest: originalDigest,
    };

    const json = exportToJson(fileWithDigest);
    const reimported = importFromJson(json);
    expect(reimported).not.toBeNull();

    // Replay from reimported file
    const stateRe = replayScenario(
      reimported!, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const reimportDigest = computeReplayDigest(stateRe, reimported!.climate_lens);

    expect(reimportDigest).toBe(originalDigest);
    expect(reimportDigest).toBe(reimported!.replay_digest);
  });
});

// ── 3. C0 climate_lens interaction ──────────────────────────────────────────

describe('F3 × C0 historical-lens round-trip (item 3)', () => {
  it('pinned save with climate_lens: "historical" round-trips with unchanged digest', () => {
    const state = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    // computeReplayDigest with explicit 'historical' must match with omitted lens
    const digestHistorical = computeReplayDigest(state, 'historical');
    const digestOmitted = computeReplayDigest(state, undefined);

    // C0 contract: historical lens does NOT appear in digest object
    expect(digestHistorical).toBe(digestOmitted);

    // The pinned file's digest is stable
    const fileWithDigest: ScenarioFile = {
      ...BASE_PINNED,
      climate_lens: 'historical',
      replay_digest: digestHistorical,
    };

    const json = exportToJson(fileWithDigest);
    const reimported = importFromJson(json);
    expect(reimported?.climate_lens).toBe('historical');

    const stateRe = replayScenario(
      reimported!, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const reimportDigest = computeReplayDigest(stateRe, 'historical');
    expect(reimportDigest).toBe(digestHistorical);
  });

  it('pinned file is byte-identical to unpinned file for digest purposes', () => {
    const statePinned = replayScenario(
      BASE_PINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const stateUnpinned = replayScenario(
      BASE_UNPINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );

    const dPinned = computeReplayDigest(statePinned, 'historical');
    const dUnpinned = computeReplayDigest(stateUnpinned, 'historical');

    // Fundamental engine-inert invariant
    expect(dPinned).toBe(dUnpinned);
  });
});

// ── 4. Mixed pinned / unpinned entries ───────────────────────────────────────

describe('F3 mixed entries round-trip (item 4)', () => {
  it('only pinned entries carry site_coords; absent ones remain undefined', () => {
    // First two entries pinned, rest unpinned
    const mixedLog: ActionLogEntry[] = FULL_LOG.map((e, idx) =>
      idx < 2
        ? { ...e, site_coords: [-107.5 + idx * 0.1, 43.5] as [number, number] }
        : e,
    );

    const mixedFile: ScenarioFile = {
      ...BASE_UNPINNED,
      actionLog: mixedLog,
    };

    const json = exportToJson({ ...mixedFile, replay_digest: 'placeholder' });
    const reimported = importFromJson(json);
    expect(reimported).not.toBeNull();

    // First two have coords
    expect(reimported!.actionLog[0].site_coords).toBeDefined();
    expect(reimported!.actionLog[1].site_coords).toBeDefined();
    // Rest do not
    for (let i = 2; i < reimported!.actionLog.length; i++) {
      expect(reimported!.actionLog[i].site_coords).toBeUndefined();
    }
  });

  it('mixed log produces same digest as all-unpinned log', () => {
    const mixedLog: ActionLogEntry[] = FULL_LOG.map((e, idx) =>
      idx < 2
        ? { ...e, site_coords: [-107.5, 43.5] as [number, number] }
        : e,
    );
    const mixedFile: ScenarioFile = { ...BASE_UNPINNED, actionLog: mixedLog };

    const stateMixed = replayScenario(
      mixedFile, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const stateBase = replayScenario(
      BASE_UNPINNED, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );

    expect(computeReplayDigest(stateMixed)).toBe(computeReplayDigest(stateBase));
  });
});

// ── 5. 3.0 → 3.1 migration + site_coords absence ───────────────────────────

describe('F3 backward compatibility (item 5)', () => {
  it('3.0 file without site_coords migrates to 3.1 cleanly', () => {
    const legacy: Omit<ScenarioFile, 'schema_version' | 'climate_lens'> & {
      schema_version: '3.0';
    } = {
      schema_version: '3.0',
      terra_version: '1.0',
      exported_at: '2025-06-01T00:00:00.000Z',
      name: 'Pre-F3 save',
      gameSeed: 99,
      start_year: 2025,
      activeScenario: null,
      // No site_coords on any entry — old format
      actionLog: FULL_LOG.map(e => ({ ...e, site_coords: undefined })),
      eventHistory: [],
      year_reached: 2032,
      replay_digest: 'abc',
    };

    const json = JSON.stringify(legacy);
    const imported = importFromJson(json);
    expect(imported).not.toBeNull();
    expect(imported?.schema_version).toBe('3.1');
    expect(imported?.climate_lens).toBe('historical');

    // All entries have no site_coords — no undefined explosion
    for (const entry of imported!.actionLog) {
      expect(entry.site_coords).toBeUndefined();
    }

    // Replay is clean
    const state = replayScenario(
      imported!, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    expect(state.year).toBe(2032);
    expect(computeReplayDigest(state)).toBeTruthy();
  });
});
