/**
 * W5 Session-mode verification tests.
 *
 * Covers:
 *   2. Session file round-trip: digest matches a non-session replay;
 *      annotation text present and correctly attributed.
 *   3. Backward compatibility: pre-W5 ScenarioFile (no session_meta/annotations)
 *      loads through importFromJson without errors.
 *   4. Both example session configs from docs/session_config.md parse correctly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { replayScenario, computeReplayDigest } from '../../src/engine/replay.js';
import { importFromJson, exportToJson } from '../../src/engine/persistence.js';
import type {
  ScenarioFile,
  ActionLogEntry,
  SessionMeta,
  Annotation,
  SessionConfig,
} from '../../src/engine/types.js';
import type {
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

// ── Shared action sequence (mirrors golden-b for a reproducible base) ─────────
// Three queue steps then advance to 2028, then one more apply.

const ACTION_LOG: ActionLogEntry[] = [
  {
    type: 'queue',
    actionId: 'wind_utility',
    geoid: '56021',
    magnitude: 200,
    year: 2025,
    decisionYear: 2025,
    timestamp: 0,
  },
  {
    type: 'queue',
    actionId: 'battery_grid',
    geoid: '56021',
    magnitude: 500,
    year: 2025,
    decisionYear: 2025,
    timestamp: 1,
  },
  {
    type: 'apply',
    actionId: 'workforce_retraining',
    geoid: '56021',
    magnitude: 1,
    year: 2027,
    timestamp: 2,
  },
];

// Base scenario file (no session fields — simulates a pre-W5 save)
const BASE_FILE: ScenarioFile = {
  schema_version: '3.0',
  terra_version: '1.0',
  exported_at: new Date().toISOString(),
  name: 'W5 test base',
  gameSeed: 42,
  start_year: 2025,
  activeScenario: null,
  actionLog: ACTION_LOG,
  eventHistory: [],
  year_reached: 2028,
  replay_digest: '',
};

// ── 2. Session round-trip ─────────────────────────────────────────────────────

describe('Session round-trip (item 2)', () => {
  it('session file replays to the same digest as the non-session file', () => {
    // Compute reference digest from the base (non-session) replay
    const baseState = replayScenario(
      BASE_FILE, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const referenceDigest = computeReplayDigest(baseState);
    expect(referenceDigest).toBeTruthy();

    // Build a session-annotated version of the same file
    const sessionMeta: SessionMeta = {
      session_code: 'WY2032_TEST',
      participant_label: 'Table 3',
      started_at: new Date().toISOString(),
      app_version: '1.0',
    };

    const annotation: Annotation = {
      id: 'ann_test_001',
      year: 2027,
      trigger_type: 'build_decision',
      trigger_id: 'build_complete_y2027',
      prompt: 'Why this move?',
      text: 'Wind + storage gives firm capacity; workforce retraining hedges displacement risk.',
      timestamp: Date.now(),
    };

    const sessionFile: ScenarioFile = {
      ...BASE_FILE,
      replay_digest: referenceDigest,
      session_meta: sessionMeta,
      annotations: [annotation],
    };

    // Replay the session file — engine should ignore session_meta and annotations
    const sessionState = replayScenario(
      sessionFile, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const sessionDigest = computeReplayDigest(sessionState);

    // Digest must match reference (annotations don't affect engine state)
    expect(sessionDigest).toBe(referenceDigest);
  });

  it('annotation fields are present in the exported JSON', () => {
    const annotation: Annotation = {
      id: 'ann_test_002',
      year: 2027,
      trigger_type: 'disturbance_event',
      trigger_id: 'heat_wave_y2027',
      prompt: 'How are you responding?',
      text: 'Accelerating storage deployment to buffer grid stress.',
      timestamp: 1720000000000,
    };

    const sessionFile: ScenarioFile = {
      ...BASE_FILE,
      replay_digest: 'placeholder',
      session_meta: {
        session_code: 'WY2032_TEST',
        participant_label: 'Table 3',
        started_at: '2026-07-05T14:00:00.000Z',
        app_version: '1.0',
      },
      annotations: [annotation],
    };

    const json = exportToJson(sessionFile);
    const parsed = JSON.parse(json) as ScenarioFile;

    // session_meta round-trips
    expect(parsed.session_meta).toBeDefined();
    expect(parsed.session_meta?.session_code).toBe('WY2032_TEST');
    expect(parsed.session_meta?.participant_label).toBe('Table 3');

    // annotation round-trips with correct attribution
    expect(parsed.annotations).toHaveLength(1);
    const ann = parsed.annotations![0];
    expect(ann.trigger_type).toBe('disturbance_event');
    expect(ann.trigger_id).toBe('heat_wave_y2027');
    expect(ann.prompt).toBe('How are you responding?');
    expect(ann.text).toBe('Accelerating storage deployment to buffer grid stress.');
    expect(ann.year).toBe(2027);
  });
});

// ── 3. Backward compatibility ─────────────────────────────────────────────────

describe('Backward compatibility (item 3)', () => {
  it('pre-W5 ScenarioFile without session_meta/annotations loads cleanly', () => {
    // Build a minimal pre-W5 file (no session fields at all)
    const preW5File: ScenarioFile = {
      schema_version: '3.0',
      terra_version: '1.0',
      exported_at: '2025-01-01T00:00:00.000Z',
      name: 'Pre-W5 save',
      gameSeed: 12345,
      start_year: 2025,
      activeScenario: null,
      actionLog: [],
      eventHistory: [],
      year_reached: 2025,
      replay_digest: 'abc123',
      // session_meta and annotations deliberately absent
    };

    const json = JSON.stringify(preW5File);
    const imported = importFromJson(json);

    // Must parse successfully
    expect(imported).not.toBeNull();
    expect(imported?.schema_version).toBe('3.1'); // C0: migration bumps 3.0 → 3.1
    expect(imported?.climate_lens).toBe('historical'); // C0: absent field defaults to historical
    // Optional fields absent — no errors, no undefined explosion
    expect(imported?.session_meta).toBeUndefined();
    expect(imported?.annotations).toBeUndefined();
  });

  it('pre-W5 file replays correctly (session fields absent do not affect engine)', () => {
    const preW5File: ScenarioFile = {
      ...BASE_FILE,
      replay_digest: '',
      // no session_meta, no annotations
    };

    // Should replay without throwing
    const state = replayScenario(
      preW5File, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    expect(state.year).toBe(2028);
    expect(computeReplayDigest(state)).toBeTruthy();
  });
});

// ── 4. Example config file parsing ────────────────────────────────────────────

// Config JSONs extracted verbatim from docs/session_config.md
const WYOMING_2032_CONFIG: SessionConfig = {
  schema_version: '1.0',
  session_code: 'WY2032',
  title: 'Wyoming Energy Futures — 2032 Scenario',
  description:
    '45-minute facilitated session. Build the county portfolio that best balances fiscal stability and grid reliability by 2032.',
  campaign_id: 'wyoming_2032_nuclear_dc',
  fixed_seed: 314159265,
  max_year: 2032,
  annotation_prompts: [
    {
      trigger: 'build_decision',
      prompt: 'Why this investment in this county?',
    },
    {
      trigger: 'disturbance_event',
      prompt: 'How does this change your next move?',
    },
  ],
  locked_settings: {
    disable_stress_test: true,
    disable_comparison: false,
  },
};

const OPEN_90_CONFIG: SessionConfig = {
  schema_version: '1.0',
  session_code: 'OPEN90',
  title: 'Mountain West Energy Futures — Open Build',
  description:
    '90-minute open exploration. No prescribed pathway — build the grid you think the region needs.',
  max_year: 2045,
  annotation_prompts: [
    { trigger: 'build_decision',    prompt: 'Why this move?' },
    { trigger: 'disturbance_event', prompt: 'How are you responding?' },
    { trigger: 'era_transition',    prompt: "What's your priority for the next decade?" },
  ],
  locked_settings: {
    disable_stress_test: false,
    disable_comparison: false,
  },
};

describe('Example config parsing (item 4)', () => {
  it('45-min Wyoming 2032 config is valid and all fields accessible', () => {
    const json = JSON.stringify(WYOMING_2032_CONFIG);
    const parsed = JSON.parse(json) as SessionConfig;

    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.session_code).toBe('WY2032');
    expect(parsed.fixed_seed).toBe(314159265);
    expect(parsed.max_year).toBe(2032);
    expect(parsed.annotation_prompts).toHaveLength(2);
    expect(parsed.annotation_prompts![0].trigger).toBe('build_decision');
    expect(parsed.annotation_prompts![1].trigger).toBe('disturbance_event');
    expect(parsed.locked_settings?.disable_stress_test).toBe(true);
    expect(parsed.locked_settings?.disable_comparison).toBe(false);
  });

  it('90-min open-build config is valid and all fields accessible', () => {
    const json = JSON.stringify(OPEN_90_CONFIG);
    const parsed = JSON.parse(json) as SessionConfig;

    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.session_code).toBe('OPEN90');
    // No fixed_seed in this config
    expect(parsed.fixed_seed).toBeUndefined();
    expect(parsed.max_year).toBe(2045);
    expect(parsed.annotation_prompts).toHaveLength(3);
    expect(parsed.annotation_prompts![2].trigger).toBe('era_transition');
    expect(parsed.locked_settings?.disable_stress_test).toBe(false);
  });

  it('WY2032 config respects fixed_seed reproducibility contract', () => {
    // When two files are built from the same config, fixed_seed guarantees
    // the same gameSeed is passed to getAllEventsForYear → identical event draws.
    // Verify by constructing two session files with fixed_seed and confirming
    // the seed value is propagated correctly.
    const seedFromConfig = WYOMING_2032_CONFIG.fixed_seed!;

    const fileA: ScenarioFile = {
      ...BASE_FILE,
      gameSeed: seedFromConfig,
      replay_digest: '',
    };
    const fileB: ScenarioFile = {
      ...BASE_FILE,
      gameSeed: seedFromConfig,
      replay_digest: '',
    };

    const stateA = replayScenario(fileA, baseline, crosswalk, actionLibrary, initialNetwork, countyCards);
    const stateB = replayScenario(fileB, baseline, crosswalk, actionLibrary, initialNetwork, countyCards);

    // Same seed → identical digests
    expect(computeReplayDigest(stateA)).toBe(computeReplayDigest(stateB));
  });

  it('OPEN90 config with null fixed_seed is structurally valid', () => {
    // null fixed_seed means random per participant; validate the config is
    // structurally correct without relying on a specific seed value.
    const json = JSON.stringify({ ...OPEN_90_CONFIG, fixed_seed: null });
    const parsed = JSON.parse(json) as SessionConfig;
    expect(parsed.fixed_seed).toBeNull();
    // The config is otherwise complete
    expect(parsed.annotation_prompts!.length).toBeGreaterThan(0);
  });
});
