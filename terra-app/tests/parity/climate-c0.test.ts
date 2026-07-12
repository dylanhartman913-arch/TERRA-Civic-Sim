/**
 * C0 — Climate lens scaffold tests.
 *
 * Covers: schema migration (3.0 → 3.1), digest byte-identity under
 * historical lens, lens-aware digest divergence under non-historical lens,
 * and persistence round-trip.
 */

import { describe, it, expect } from 'vitest';
import { loadInitialState, computeDigestMd5 } from './helpers.js';
import { computeReplayDigest } from '../../src/engine/replay.js';
import { importFromJson, exportToJson, STORAGE_VERSION } from '../../src/engine/persistence.js';
import { EMPTY_CLIMATE_CONTEXT } from '../../src/engine/types.js';
import type { ScenarioFile } from '../../src/engine/types.js';
import {
  applyAction,
  advanceYear,
} from '../../src/engine/engine.js';

describe('C0 — Schema migration + digest identity', () => {
  // ── Schema migration ──────────────────────────────────────────────────────

  it('C0-1: STORAGE_VERSION is 3.1', () => {
    expect(STORAGE_VERSION).toBe('3.1');
  });

  it('C0-2: legacy 3.0 file migrates to 3.1 with climate_lens: "historical"', () => {
    const legacy: ScenarioFile = {
      schema_version: '3.0',
      terra_version: '1.0',
      exported_at: '2026-07-01T00:00:00.000Z',
      name: 'Legacy Test',
      gameSeed: 42,
      start_year: 2025,
      activeScenario: null,
      actionLog: [],
      eventHistory: [],
      year_reached: 2025,
      replay_digest: 'abc123',
    };

    const json = JSON.stringify(legacy);
    const imported = importFromJson(json);
    expect(imported).not.toBeNull();
    expect(imported!.schema_version).toBe('3.1');
    expect(imported!.climate_lens).toBe('historical');
  });

  it('C0-3: 3.1 file with climate_lens round-trips through export/import', () => {
    const file: ScenarioFile = {
      schema_version: '3.1',
      terra_version: '1.0',
      exported_at: '2026-07-11T00:00:00.000Z',
      name: 'Round Trip',
      gameSeed: 42,
      start_year: 2025,
      activeScenario: null,
      actionLog: [],
      eventHistory: [],
      year_reached: 2025,
      replay_digest: 'def456',
      climate_lens: 'historical',
    };

    const json = exportToJson(file);
    const reimported = importFromJson(json);
    expect(reimported).not.toBeNull();
    expect(reimported!.climate_lens).toBe('historical');
    expect(reimported!.schema_version).toBe('3.1');
  });

  it('C0-4: unknown schema version is rejected', () => {
    const badJson = JSON.stringify({
      schema_version: '2.0',
      terra_version: '1.0',
      exported_at: '',
      name: '',
      gameSeed: 0,
      start_year: 2025,
      activeScenario: null,
      actionLog: [],
      eventHistory: [],
      year_reached: 2025,
      replay_digest: '',
    });
    expect(importFromJson(badJson)).toBeNull();
  });

  // ── Digest byte-identity under historical lens ────────────────────────────

  it('C0-5: computeReplayDigest matches computeDigestMd5 (historical lens)', () => {
    const state = loadInitialState();
    const replayDigest = computeReplayDigest(state);
    const helperDigest = computeDigestMd5(state);
    expect(replayDigest).toBe(helperDigest.md5);
  });

  it('C0-6: computeReplayDigest with explicit "historical" matches no-lens call', () => {
    const state = loadInitialState();
    const noLens = computeReplayDigest(state);
    const historicalLens = computeReplayDigest(state, 'historical');
    const undefinedLens = computeReplayDigest(state, undefined);
    expect(noLens).toBe(historicalLens);
    expect(noLens).toBe(undefinedLens);
  });

  it('C0-7: computeReplayDigest after actions still matches computeDigestMd5', () => {
    let state = loadInitialState();
    [state] = applyAction(state, 'solar_utility', '56005', 200);
    state = advanceYear(state);

    const replayDigest = computeReplayDigest(state);
    const helperDigest = computeDigestMd5(state);
    expect(replayDigest).toBe(helperDigest.md5);
  });

  // ── Non-historical lens produces different digest ─────────────────────────

  it('C0-8: non-historical lens produces a different digest than historical', () => {
    const state = loadInitialState();
    const historicalDigest = computeReplayDigest(state, 'historical');
    const ssp245Digest = computeReplayDigest(state, 'ssp245');
    const ssp370Digest = computeReplayDigest(state, 'ssp370');

    // All three must be different
    expect(ssp245Digest).not.toBe(historicalDigest);
    expect(ssp370Digest).not.toBe(historicalDigest);
    expect(ssp245Digest).not.toBe(ssp370Digest);
  });

  // ── EMPTY_CLIMATE_CONTEXT ─────────────────────────────────────────────────

  it('C0-9: EMPTY_CLIMATE_CONTEXT has lens=historical and empty tables', () => {
    expect(EMPTY_CLIMATE_CONTEXT.lens).toBe('historical');
    expect(EMPTY_CLIMATE_CONTEXT.tables).toStrictEqual({});
    expect(Object.isFrozen(EMPTY_CLIMATE_CONTEXT)).toBe(true);
  });
});
