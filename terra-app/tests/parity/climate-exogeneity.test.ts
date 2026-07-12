/**
 * C0 — Climate exogeneity test (permanent).
 *
 * Asserts that climate_context and all derived hazard tables are
 * bit-identical regardless of action log mutations. The climate context
 * is exogenous to player decisions — it must never be influenced by
 * engine state or action history.
 *
 * This test is asserted in every future C-track session.
 */

import { describe, it, expect } from 'vitest';
import { loadInitialState, loadInitialStateWithRetirements } from './helpers.js';
import {
  applyAction,
  queueAction,
  advanceYear,
} from '../../src/engine/engine.js';
import { EMPTY_CLIMATE_CONTEXT } from '../../src/engine/types.js';
import type { ClimateContext } from '../../src/engine/types.js';

describe('C0 — Climate exogeneity', () => {
  it('EX-1: EMPTY_CLIMATE_CONTEXT is immutable and frozen', () => {
    expect(Object.isFrozen(EMPTY_CLIMATE_CONTEXT)).toBe(true);
    expect(Object.isFrozen(EMPTY_CLIMATE_CONTEXT.tables)).toBe(true);
    expect(EMPTY_CLIMATE_CONTEXT.lens).toBe('historical');
    expect(Object.keys(EMPTY_CLIMATE_CONTEXT.tables).length).toBe(0);
  });

  it('EX-2: climate_context is unchanged after applyAction', () => {
    const state = loadInitialState();
    const ctx: ClimateContext = { ...EMPTY_CLIMATE_CONTEXT };

    // Apply an action with climate context
    const [newState] = applyAction(state, 'solar_utility', '56005', 200, false, ctx);

    // Context must be bit-identical
    expect(ctx.lens).toBe('historical');
    expect(ctx.tables).toStrictEqual({});
    expect(newState.year).toBe(state.year);
  });

  it('EX-3: climate_context is unchanged after queueAction', () => {
    const state = loadInitialState();
    const ctx: ClimateContext = { ...EMPTY_CLIMATE_CONTEXT };

    const newState = queueAction(state, 'smr_advanced', '56023', 345, 2026, undefined, ctx);

    expect(ctx.lens).toBe('historical');
    expect(ctx.tables).toStrictEqual({});
    expect(newState.build_queue.length).toBeGreaterThan(state.build_queue.length);
  });

  it('EX-4: climate_context is unchanged after advanceYear', () => {
    const state = loadInitialState();
    const ctx: ClimateContext = { ...EMPTY_CLIMATE_CONTEXT };

    const newState = advanceYear(state, ctx);

    expect(ctx.lens).toBe('historical');
    expect(ctx.tables).toStrictEqual({});
    expect(newState.year).toBe(state.year + 1);
  });

  it('EX-5: climate_context is bit-identical after arbitrary action log mutations', () => {
    // Start with retirements to get richer state
    let stateA = loadInitialStateWithRetirements();
    let stateB = loadInitialStateWithRetirements();

    const ctxA: ClimateContext = { ...EMPTY_CLIMATE_CONTEXT };
    const ctxB: ClimateContext = { ...EMPTY_CLIMATE_CONTEXT };

    // Path A: queue several actions, advance years
    stateA = queueAction(stateA, 'solar_utility', '56005', 500, 2026, undefined, ctxA);
    stateA = queueAction(stateA, 'smr_advanced', '56023', 345, 2026, undefined, ctxA);
    stateA = queueAction(stateA, 'data_center_hyperscale', '56021', 100, 2026, undefined, ctxA);
    for (let i = 0; i < 5; i++) {
      stateA = advanceYear(stateA, ctxA);
    }

    // Path B: advance years with no actions
    for (let i = 0; i < 5; i++) {
      stateB = advanceYear(stateB, ctxB);
    }

    // Climate contexts must be identical regardless of divergent action logs
    expect(ctxA.lens).toBe(ctxB.lens);
    expect(ctxA.tables).toStrictEqual(ctxB.tables);
    expect(ctxA).toStrictEqual(ctxB);
  });

  it('EX-6: non-historical climate context with tables is also exogenous', () => {
    // Construct a synthetic non-historical context
    const syntheticCtx: ClimateContext = {
      lens: 'ssp245',
      tables: {
        cdd_delta_pct: {
          '56005': { '2040': 0.12, '2050': 0.18 },
          '56023': { '2040': 0.08, '2050': 0.14 },
        },
      },
    };

    // Snapshot the tables before engine operations
    const tablesSnapshot = JSON.stringify(syntheticCtx.tables);

    let state = loadInitialState();
    state = queueAction(state, 'solar_utility', '56005', 300, 2026, undefined, syntheticCtx);
    state = advanceYear(state, syntheticCtx);
    [state] = applyAction(state, 'prairie_restoration', '56005', 1, false, syntheticCtx);
    state = advanceYear(state, syntheticCtx);

    // Tables must be bit-identical after all operations
    expect(JSON.stringify(syntheticCtx.tables)).toBe(tablesSnapshot);
    expect(syntheticCtx.lens).toBe('ssp245');
  });
});
