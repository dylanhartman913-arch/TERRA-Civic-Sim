import { describe, it, expect } from 'vitest';
import { loadInitialState, computeDigestMd5, computeExistingAssetsDigestMd5 } from './helpers.js';
import {
  scheduleRetirement,
  accelerateRetirement,
  delayRetirement,
  cancelQueued,
  queueAction,
  advanceYear,
} from '../../src/engine/engine.js';
import type { AssetInstance } from '../../src/engine/types.js';

function findAsset(registry: AssetInstance[], predicate: (a: AssetInstance) => boolean): AssetInstance {
  const found = registry.find(predicate);
  if (!found) throw new Error('Asset not found in registry');
  return found;
}

describe('Retirement Transitions (v3.0)', () => {
  // ── scheduleRetirement ──────────────────────────────────────────────────

  it('scheduleRetirement sets scheduled_retirement_year on an operating generator', () => {
    const state = loadInitialState();
    // Dave Johnston is a baseline coal generator in 56009
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    expect(dj.lifecycle).toBe('operating');
    expect(dj.scheduled_retirement_year).toBeNull();

    const newState = scheduleRetirement(state, dj.asset_id, 2030);
    const djAfter = findAsset(newState.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djAfter.scheduled_retirement_year).toBe(2030);
    expect(djAfter.lifecycle).toBe('operating');
  });

  it('scheduleRetirement does not modify original state (pure function)', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const { md5: beforeMd5 } = computeDigestMd5(state);

    scheduleRetirement(state, dj.asset_id, 2030);

    const { md5: afterMd5 } = computeDigestMd5(state);
    expect(afterMd5).toBe(beforeMd5);
    const djOrig = findAsset(state.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djOrig.scheduled_retirement_year).toBeNull();
  });

  it('scheduleRetirement rejects non-operating assets', () => {
    const state = loadInitialState();
    // PRB Coal Mines is a production asset
    const prb = findAsset(state.asset_registry, a => a.name.includes('Powder River Basin'));
    expect(() => scheduleRetirement(state, prb.asset_id, 2030)).toThrow('asset_class');
  });

  // ── accelerateRetirement ────────────────────────────────────────────────

  it('accelerateRetirement moves retirement year earlier', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2035);
    const s2 = accelerateRetirement(s1, dj.asset_id, 2030);
    const djAfter = findAsset(s2.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djAfter.scheduled_retirement_year).toBe(2030);
  });

  it('accelerateRetirement rejects later year', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2030);
    expect(() => accelerateRetirement(s1, dj.asset_id, 2035)).toThrow('must be earlier');
  });

  it('accelerateRetirement rejects asset without scheduled retirement', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    expect(() => accelerateRetirement(state, dj.asset_id, 2030)).toThrow('no scheduled retirement');
  });

  // ── delayRetirement ─────────────────────────────────────────────────────

  it('delayRetirement moves retirement year later and returns cost hook', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2030);
    const [s2, hook] = delayRetirement(s1, dj.asset_id, 2040);
    const djAfter = findAsset(s2.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djAfter.scheduled_retirement_year).toBe(2040);
    expect(hook.delay_cost_hook).toBeGreaterThanOrEqual(0);
  });

  it('delayRetirement rejects earlier year', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2035);
    expect(() => delayRetirement(s1, dj.asset_id, 2030)).toThrow('must be later');
  });

  // ── cancelQueued ────────────────────────────────────────────────────────

  it('cancelQueued removes a player-queued asset from build_queue view', () => {
    const state = loadInitialState();
    const s1 = queueAction(state, 'solar_utility', '56021', 100, 2025);
    expect(s1.build_queue.length).toBe(1);

    const playerAsset = findAsset(s1.asset_registry, a => a.origin === 'player');
    const [s2, hook] = cancelQueued(s1, playerAsset.asset_id);
    expect(s2.build_queue.length).toBe(0);
    expect(hook.sunk_cost_fraction).toBeGreaterThanOrEqual(0);

    const cancelled = findAsset(s2.asset_registry, a => a.asset_id === playerAsset.asset_id);
    expect(cancelled.lifecycle).toBe('retired');
  });

  it('cancelQueued rejects baseline assets', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    expect(() => cancelQueued(state, dj.asset_id)).toThrow('player-origin');
  });

  // ── advanceYear retirement execution ────────────────────────────────────

  it('advanceYear retires asset when year reaches scheduled_retirement_year', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2026);

    // advanceYear: 2025 → 2026
    const s2 = advanceYear(s1);
    expect(s2.year).toBe(2026);

    const djAfter = findAsset(s2.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djAfter.lifecycle).toBe('retired');
  });

  it('advanceYear removes capacity from bus_state on retirement', () => {
    const state = loadInitialState();
    const jb = findAsset(state.asset_registry, a => a.name.includes('Jim Bridger'));
    expect(jb.capacity_mw).toBe(2120);

    // Find the bus for geoid 56037 (Sweetwater)
    const busId = Object.keys(state.bus_state).find(bid => {
      const xw = state.crosswalk.find(r => r.geoid === '56037' && r.primary_bus);
      return xw && String(xw.bus_id) === bid;
    });
    expect(busId).toBeDefined();
    const capBefore = state.bus_state[busId!].capacity_mw;

    const s1 = scheduleRetirement(state, jb.asset_id, 2026);
    const s2 = advanceYear(s1);
    expect(s2.bus_state[busId!].capacity_mw).toBe(capBefore - 2120);
  });

  it('advanceYear does not retire before scheduled year', () => {
    const state = loadInitialState();
    const dj = findAsset(state.asset_registry, a => a.name.includes('Dave Johnston'));
    const s1 = scheduleRetirement(state, dj.asset_id, 2030);

    // advanceYear: 2025 → 2026, not 2030
    const s2 = advanceYear(s1);
    const djAfter = findAsset(s2.asset_registry, a => a.asset_id === dj.asset_id);
    expect(djAfter.lifecycle).toBe('operating');
    expect(djAfter.scheduled_retirement_year).toBe(2030);
  });

  // ── Goldens A-F still byte-identical ────────────────────────────────────

  it('existing_assets_digest is unchanged (no retirements scheduled at init)', () => {
    const state = loadInitialState();
    const { md5 } = computeExistingAssetsDigestMd5(state);
    expect(md5).toBe('7c685b368081bb00bdce51bb68a47d9b');
  });
});
