/**
 * Pure replay engine — no React, no Zustand.
 * Reconstructs EngineState from a ScenarioFile + static baseline data.
 *
 * computeReplayDigest matches computeDigestMd5 from tests/parity/helpers.ts exactly,
 * using the same PyFloat-aware canonical JSON and MD5 algorithm.
 */

import type { EngineState, ScenarioFile } from './types.js';
import {
  initializeState,
  applyAction as engineApplyAction,
  queueAction as engineQueueAction,
  advanceYear as engineAdvanceYear,
  injectDisturbance as engineInjectDisturbance,
} from './engine.js';
import { getAllEventsForYear } from './events.js';
import { applySessionDrought } from './session_drought.js';

// ── PyFloat marker — avoids class syntax for erasableSyntaxOnly ────────────
// Tagged plain object instead of class; canonicalJson recognizes the tag.

type PyFloat = { readonly __py: true; readonly value: number };
function pyFloat(n: number): PyFloat { return { __py: true, value: n }; }
function isPyFloat(o: object): o is PyFloat { return '__py' in o; }

// ── Canonical JSON (matches Python json.dumps(sort_keys=True, separators=(',',':'))) ──

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'object' && isPyFloat(obj)) {
    const n = obj.value;
    if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
      return n.toFixed(1);  // 0 → "0.0", 50 → "50.0"
    }
    return JSON.stringify(n);
  }
  if (typeof obj === 'number') {
    if (Number.isInteger(obj) && Math.abs(obj) < Number.MAX_SAFE_INTEGER) {
      return String(obj);
    }
    return JSON.stringify(obj);
  }
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  // Plain object — sort keys
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(k =>
    JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])
  );
  return '{' + pairs.join(',') + '}';
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Pure-JS MD5 (RFC 1321) — matches Node's createHash('md5') ─────────────

function md5(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const msgLen = bytes.length;

  // Pad: message + 0x80 + zeros + 64-bit LE length, total ≡ 0 mod 64
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[msgLen] = 0x80;

  // Append message length in bits as 64-bit little-endian (lower 32 bits only)
  const bitLen = msgLen * 8;
  padded[paddedLen - 8] = bitLen & 0xff;
  padded[paddedLen - 7] = (bitLen >>> 8) & 0xff;
  padded[paddedLen - 6] = (bitLen >>> 16) & 0xff;
  padded[paddedLen - 5] = (bitLen >>> 24) & 0xff;

  // T[i] = floor(abs(sin(i+1)) * 2^32), stored as signed 32-bit
  const T = Array.from({ length: 64 }, (_, i) =>
    (Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)) | 0
  );

  const S = [
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
  ];

  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;

  const view = new DataView(padded.buffer);

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) {
      M.push(view.getUint32(offset + j * 4, true) | 0);
    }

    let a = a0, b = b0, c = c0, d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const temp = (f + a + T[i] + M[g]) | 0;
      const s = S[i];
      a = d;
      d = c;
      c = b;
      b = (b + ((temp << s) | (temp >>> (32 - s)))) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  // Little-endian hex output
  return [a0, b0, c0, d0]
    .map(x => {
      const bs = [(x) & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff];
      return bs.map(n => (n & 0xff).toString(16).padStart(2, '0')).join('');
    })
    .join('');
}

// ── Public: computeReplayDigest ────────────────────────────────────────────

/**
 * Compute the canonical state digest, matching helpers.ts computeDigestMd5 exactly.
 * Digest structure: county_ees, bus_state_summary, active_couplings, sc_pools, year.
 *
 * C0 lens incorporation: when climateLens is non-historical, the lens string is
 * included in the digest object so that different climate forcings produce
 * different digests. When climateLens is "historical" (or omitted), the lens
 * does NOT appear in the digest — preserving byte-identity with all existing
 * frozen goldens.
 */
export function computeReplayDigest(state: EngineState, climateLens?: string): string {
  // County EES (rounded to 6 decimal places, PyFloat-formatted)
  const countyEes: Record<string, { E: PyFloat; Ec: PyFloat; S: PyFloat }> = {};
  for (const [geoid, ees] of Object.entries(state.county_ees)) {
    countyEes[geoid] = {
      E: pyFloat(roundTo(ees.E, 6)),
      Ec: pyFloat(roundTo(ees.Ec, 6)),
      S: pyFloat(roundTo(ees.S, 6)),
    };
  }

  // Bus state summary (only buses with non-zero activity)
  const busSummary: Record<string, { capacity_mw: PyFloat; load_mw: PyFloat; deficit_mw: PyFloat }> = {};
  for (const [bid, bs] of Object.entries(state.bus_state)) {
    const cap = bs.capacity_mw || 0;
    const load = bs.load_mw || 0;
    const deficit = bs.deficit_mw || 0;
    if (cap > 0 || load > 0 || deficit > 0) {
      busSummary[bid] = {
        capacity_mw: pyFloat(roundTo(cap, 4)),
        load_mw: pyFloat(roundTo(load, 4)),
        deficit_mw: pyFloat(roundTo(deficit, 4)),
      };
    }
  }

  // SC pools
  const scPools: Record<string, { capacity_per_year: number; used_this_year: number }> = {};
  for (const [k, v] of Object.entries(state.sc_pools)) {
    scPools[k] = {
      capacity_per_year: (v as { capacity_per_year: number }).capacity_per_year || 0,
      used_this_year: (v as { used_this_year: number }).used_this_year || 0,
    };
  }

  const digestObj: Record<string, unknown> = {
    county_ees: countyEes,
    bus_state_summary: busSummary,
    active_couplings: state.active_couplings,
    sc_pools: scPools,
    year: state.year,
  };

  // C0: lens contributes to digest ONLY when non-historical.
  // This ensures historical-lens digests are byte-identical to pre-C0 digests.
  const effectiveLens = climateLens ?? 'historical';
  if (effectiveLens !== 'historical') {
    digestObj.climate_lens = effectiveLens;
  }

  return md5(canonicalJson(digestObj));
}

// ── Public: replayScenario ─────────────────────────────────────────────────

/**
 * Reconstruct EngineState by replaying a ScenarioFile's actionLog.
 * Events are re-drawn from gameSeed (not replayed from eventHistory).
 */
export function replayScenario(
  file: ScenarioFile,
  baseline: Parameters<typeof initializeState>[0],
  crosswalk: Parameters<typeof initializeState>[1],
  actionLibrary: Parameters<typeof initializeState>[2],
  initialNetwork: Parameters<typeof initializeState>[3],
  countyCards: Parameters<typeof initializeState>[4],
  fiscalBaseline?: Parameters<typeof initializeState>[6],
  fiscalCoefficients?: Parameters<typeof initializeState>[7],
): EngineState {
  let state = initializeState(baseline, crosswalk, actionLibrary, initialNetwork, countyCards, 2025, fiscalBaseline, fiscalCoefficients);

  const { actionLog, gameSeed, year_reached, start_year } = file;

  for (let year = start_year; year < year_reached; year++) {
    // a. Apply all actionLog entries for this decision year
    const yearEntries = actionLog.filter(e => e.year === year);
    for (const entry of yearEntries) {
      if (entry.type === 'apply') {
        [state] = engineApplyAction(state, entry.actionId, entry.geoid, entry.magnitude);
      } else {
        state = engineQueueAction(
          state,
          entry.actionId,
          entry.geoid,
          entry.magnitude,
          entry.decisionYear ?? year,
          entry.overrideOp,
        );
      }
    }

    // b. Apply drought for the upcoming year BEFORE advancing so that
    //    advanceCountyAg records trajectory snapshots with drought-affected values.
    if (file.session_config?.drought) {
      [state] = applySessionDrought(state, gameSeed, file.climate_lens ?? 'historical', state.year + 1);
    }

    state = engineAdvanceYear(state);

    // c+d. Re-draw events and apply deterministic engine effects
    const events = getAllEventsForYear(state.year, state, gameSeed);
    for (const evt of events) {
      if (evt.engine_effect && evt.engine_effect.fn) {
        const { fn, args } = evt.engine_effect;
        if (fn === 'injectDisturbance') {
          [state] = engineInjectDisturbance(
            state,
            args.disturbance_type as string,
            args.severity as number,
            args.geoids as string[] | undefined,
          );
        } else if (fn === 'applyAction') {
          [state] = engineApplyAction(
            state,
            args.action_id as string,
            args.geoid as string,
            args.magnitude as number,
          );
        }
      }
    }
  }

  return state;
}

// ── Public: validateImport ─────────────────────────────────────────────────

export function validateImport(
  file: ScenarioFile,
  baseline: Parameters<typeof initializeState>[0],
  crosswalk: Parameters<typeof initializeState>[1],
  actionLibrary: Parameters<typeof initializeState>[2],
  initialNetwork: Parameters<typeof initializeState>[3],
  countyCards: Parameters<typeof initializeState>[4],
): {
  valid: boolean;
  computed_digest: string;
  expected_digest: string;
  mismatch: boolean;
  error?: string;
} {
  try {
    const finalState = replayScenario(
      file, baseline, crosswalk, actionLibrary, initialNetwork, countyCards,
    );
    const computed_digest = computeReplayDigest(finalState, file.climate_lens);
    const expected_digest = file.replay_digest;
    return {
      valid: true,
      computed_digest,
      expected_digest,
      mismatch: computed_digest !== expected_digest,
    };
  } catch (err) {
    return {
      valid: false,
      computed_digest: '',
      expected_digest: file.replay_digest,
      mismatch: true,
      error: String(err),
    };
  }
}
