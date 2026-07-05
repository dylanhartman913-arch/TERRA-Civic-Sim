/**
 * W6 Debrief — unit tests for pure debrief functions.
 *
 * Covers:
 *   1. findEarliestDivergence identifies the planted fork at year 2027 (Table 2 vs others).
 *   2. findAllDivergences returns all pair forks sorted by year.
 *   3. Sessions without session_meta are rejected by the validator used in DebriefView.
 *   4. All 5 synthetic fixture files parse as valid session ScenarioFiles.
 *   5. Identical action logs produce no divergence.
 *   6. Empty sessions (< 2) return null.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  findEarliestDivergence,
  findAllDivergences,
  type LoadedSession,
} from '../../src/engine/debrief.js';
import { importFromJson } from '../../src/engine/persistence.js';
import type { ScenarioFile } from '../../src/engine/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(__dirname, 'fixtures');

function loadFixtureSession(name: string): LoadedSession {
  const raw = readFileSync(resolve(FIXTURE_DIR, name), 'utf-8');
  const file = JSON.parse(raw) as ScenarioFile;
  return {
    file,
    label: file.session_meta?.participant_label ?? 'Unknown',
    code: file.session_meta?.session_code ?? '',
    finalYear: file.year_reached,
  };
}

// Load all 5 synthetic fixtures
const sessionA = loadFixtureSession('session_w6_a.json');
const sessionB = loadFixtureSession('session_w6_b.json');
const sessionC = loadFixtureSession('session_w6_c.json');
const sessionD = loadFixtureSession('session_w6_d.json');
const sessionE = loadFixtureSession('session_w6_e.json');
const allSessions = [sessionA, sessionB, sessionC, sessionD, sessionE];

// ── 1. Planted fork detection ─────────────────────────────────────────────────

describe('findEarliestDivergence — planted fork', () => {
  it('finds the earliest fork at year 2027', () => {
    const result = findEarliestDivergence(allSessions);
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2027);
  });

  it('fork involves Table 2 (the planted diverger)', () => {
    const result = findEarliestDivergence(allSessions);
    expect(result).not.toBeNull();
    // Table 2 chose battery_grid; others chose workforce_retraining at 2027
    const involvedLabels = [result!.labelA, result!.labelB];
    expect(involvedLabels).toContain('Table 2');
  });

  it('fork message is human-readable', () => {
    const result = findEarliestDivergence(allSessions);
    expect(result!.message).toMatch(/diverged in 2027/);
    expect(result!.message).toMatch(/Table 2/);
  });

  it('Table 2 action at fork year is battery_grid, others are workforce_retraining', () => {
    const result = findEarliestDivergence(allSessions);
    // One side has battery_grid, the other has workforce_retraining
    const allActions = [...result!.actionsA, ...result!.actionsB];
    expect(allActions.some(a => a.includes('battery_grid'))).toBe(true);
    expect(allActions.some(a => a.includes('workforce_retraining'))).toBe(true);
  });
});

// ── 2. findAllDivergences ─────────────────────────────────────────────────────

describe('findAllDivergences — all pair forks', () => {
  it('returns multiple divergences for 5 sessions', () => {
    const results = findAllDivergences(allSessions);
    // 5 sessions = up to 10 pairs; not all need to diverge but most do
    expect(results.length).toBeGreaterThan(0);
  });

  it('results are sorted by year ascending', () => {
    const results = findAllDivergences(allSessions);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].year).toBeGreaterThanOrEqual(results[i - 1].year);
    }
  });

  it('earliest result year is 2027 (matching findEarliestDivergence)', () => {
    const results = findAllDivergences(allSessions);
    expect(results[0]?.year).toBe(2027);
  });

  it('sessions that share all years have no divergence entry', () => {
    // A and itself would have no divergence (trivially); verify A vs A subset
    const results = findAllDivergences([sessionA, sessionA]);
    expect(results).toHaveLength(0);
  });
});

// ── 3. Session_meta validation ────────────────────────────────────────────────

describe('Session file validation (mimics DebriefView loader)', () => {
  /** Validator matching DebriefView acceptance criteria. */
  function isValidSessionFile(json: string): { ok: boolean; reason?: string } {
    const file = importFromJson(json);
    if (!file) return { ok: false, reason: 'schema_version !== 3.0 or parse error' };
    if (!file.session_meta) return { ok: false, reason: 'missing session_meta' };
    return { ok: true };
  }

  it('accepts all 5 synthetic fixtures', () => {
    const names = ['session_w6_a.json', 'session_w6_b.json', 'session_w6_c.json', 'session_w6_d.json', 'session_w6_e.json'];
    for (const name of names) {
      const raw = readFileSync(resolve(FIXTURE_DIR, name), 'utf-8');
      const result = isValidSessionFile(raw);
      expect(result.ok, `${name}: ${result.reason ?? ''}`).toBe(true);
    }
  });

  it('rejects a file with wrong schema_version', () => {
    const bad = JSON.stringify({ schema_version: '2.0', session_meta: { session_code: 'X' } });
    expect(isValidSessionFile(bad).ok).toBe(false);
  });

  it('rejects a valid scenario file without session_meta', () => {
    const noMeta: ScenarioFile = {
      schema_version: '3.0',
      terra_version: '1.0',
      exported_at: '2025-01-01T00:00:00.000Z',
      name: 'No session',
      gameSeed: 42,
      start_year: 2025,
      activeScenario: null,
      actionLog: [],
      eventHistory: [],
      year_reached: 2025,
      replay_digest: '',
    };
    expect(isValidSessionFile(JSON.stringify(noMeta)).ok).toBe(false);
    expect(isValidSessionFile(JSON.stringify(noMeta)).reason).toMatch(/session_meta/);
  });
});

// ── 4. Fixture content checks ─────────────────────────────────────────────────

describe('Fixture file structure', () => {
  it('all fixtures share the same gameSeed (314159265)', () => {
    for (const s of allSessions) {
      expect(s.file.gameSeed).toBe(314159265);
    }
  });

  it('all fixtures have session_code WY2032', () => {
    for (const s of allSessions) {
      expect(s.file.session_meta?.session_code).toBe('WY2032');
    }
  });

  it('all fixtures have at least one annotation', () => {
    for (const s of allSessions) {
      expect((s.file.annotations ?? []).length).toBeGreaterThan(0);
    }
  });

  it('participant labels are unique across sessions', () => {
    const labels = allSessions.map(s => s.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(5);
  });

  it('all fixtures reach year_reached 2030', () => {
    for (const s of allSessions) {
      expect(s.finalYear).toBe(2030);
    }
  });
});

// ── 5. Identical logs → no divergence ─────────────────────────────────────────

describe('Edge cases', () => {
  it('identical action logs produce no divergence', () => {
    const clone: LoadedSession = {
      ...sessionA,
      label: 'Table 1 Clone',
      file: { ...sessionA.file },
    };
    expect(findEarliestDivergence([sessionA, clone])).toBeNull();
  });

  it('fewer than 2 sessions returns null', () => {
    expect(findEarliestDivergence([])).toBeNull();
    expect(findEarliestDivergence([sessionA])).toBeNull();
  });

  it('sessions with no common years (different start/end) return null', () => {
    const earlySession: LoadedSession = {
      file: { ...sessionA.file, start_year: 2020, year_reached: 2024, actionLog: [] },
      label: 'Early',
      code: 'EARLY',
      finalYear: 2024,
    };
    const lateSession: LoadedSession = {
      file: { ...sessionA.file, start_year: 2026, year_reached: 2030, actionLog: [] },
      label: 'Late',
      code: 'LATE',
      finalYear: 2030,
    };
    // No overlapping years with matching decisions
    // Both have empty logs → no divergence within any common year window
    expect(findEarliestDivergence([earlySession, lateSession])).toBeNull();
  });
});
