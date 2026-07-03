import { useState } from 'react';
import {
  initializeState,
  applyAction,
  queueAction,
  advanceYear,
} from '../../engine/engine.js';
import type { EngineState } from '../../engine/types.js';
import baseline from '../../data/county_ees_baseline.json';
import crosswalk from '../../data/county_crosswalk.json';
import actionLibrary from '../../data/action_library_v3.json';
import initialNetwork from '../../data/initial_network.json';
import countyCards from '../../data/county_cards.json';
import goldenB from '../../data/golden_b.json';

interface GoldenFixture {
  inputs: {
    pre_placed_assets: { action: string; geoid: string; magnitude: number; year: number; override_op?: number }[];
    player_sequence: { action: string; geoid: string; magnitude: number; year: number }[];
  };
  steps: unknown[];
  assertions: Record<string, unknown>;
  final_state_digest: {
    county_ees: Record<string, { E: number; Ec: number; S: number }>;
  };
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function relClose(a: number, b: number, tol = 1e-4): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-10) < tol;
}

function runGoldenBParity(): { pass: boolean; detail: string; time: number } {
  const t0 = performance.now();
  const fixture = goldenB as GoldenFixture;

  let state: EngineState = initializeState(
    baseline as Parameters<typeof initializeState>[0],
    crosswalk as Parameters<typeof initializeState>[1],
    actionLibrary as unknown as Parameters<typeof initializeState>[2],
    initialNetwork as Parameters<typeof initializeState>[3],
    countyCards as Parameters<typeof initializeState>[4],
  );

  // Queue pre-placed assets
  for (const asset of fixture.inputs.pre_placed_assets) {
    state = queueAction(state, asset.action, asset.geoid, asset.magnitude, asset.year, asset.override_op);
  }

  // Advance to 2028
  while (state.year < 2028) {
    state = advanceYear(state);
  }

  // Player sequence
  const seq = fixture.inputs.player_sequence;
  // Queue: smr_advanced x2 with override to 2032
  state = queueAction(state, seq[0].action, seq[0].geoid, seq[0].magnitude, seq[0].year, 2032);
  state = queueAction(state, seq[1].action, seq[1].geoid, seq[1].magnitude, seq[1].year, 2032);
  // Queue: transmission
  state = queueAction(state, seq[2].action, seq[2].geoid, seq[2].magnitude, seq[2].year);
  // Apply: workforce_retraining x2, affordable_housing, battery_grid
  for (let i = 3; i < seq.length; i++) {
    const s = seq[i];
    const action = state.action_library.actions[s.action];
    if (action && action.time_to_deploy && action.time_to_deploy > 1) {
      state = queueAction(state, s.action, s.geoid, s.magnitude, s.year);
    } else {
      [state] = applyAction(state, s.action, s.geoid, s.magnitude);
    }
  }

  // Advance to 2032
  while (state.year < 2032) {
    state = advanceYear(state);
  }

  const time = performance.now() - t0;

  // Compare final state
  const expectedEes = fixture.final_state_digest.county_ees;
  let mismatches = 0;
  const mismatchDetails: string[] = [];

  for (const [geoid, expected] of Object.entries(expectedEes)) {
    const actual = state.county_ees[geoid];
    if (!actual) {
      mismatches++;
      mismatchDetails.push(`${geoid}: missing`);
      continue;
    }
    for (const cap of ['E', 'Ec', 'S'] as const) {
      const a = roundTo(actual[cap], 4);
      const e = expected[cap];
      if (!relClose(a, e)) {
        mismatches++;
        if (mismatchDetails.length < 5) {
          mismatchDetails.push(`${geoid}.${cap}: ${a} vs ${e}`);
        }
      }
    }
  }

  // Check assertions
  const assertions = fixture.assertions as Record<string, unknown>;
  const deficit56021 = state.county_ees['56021']?.deficit_mw ?? -1;
  const couplingActive = state.active_couplings.length > 0;

  const assertionChecks: string[] = [];
  if (assertions['6A_deficit_decreased'] && deficit56021 > 0) {
    assertionChecks.push('6A deficit not decreased');
  }
  if (assertions['6B_coupling_active'] && !couplingActive) {
    assertionChecks.push('6B coupling not active');
  }

  if (mismatches === 0 && assertionChecks.length === 0) {
    return {
      pass: true,
      detail: `PARITY OK — ${Object.keys(expectedEes).length} counties match (${time.toFixed(1)}ms)`,
      time,
    };
  }

  return {
    pass: false,
    detail: `PARITY FAIL — ${mismatches} EES mismatches, ${assertionChecks.length} assertion failures.\n${mismatchDetails.join('\n')}\n${assertionChecks.join('\n')}`,
    time,
  };
}

export function DebugParityCheck() {
  const [result, setResult] = useState<{ pass: boolean; detail: string } | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    // Use setTimeout to allow UI to render "running" state
    setTimeout(() => {
      const r = runGoldenBParity();
      setResult(r);
      setRunning(false);
    }, 10);
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <div style={{
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: 10,
        marginBottom: 8,
      }}>
        Golden B Parity
      </div>

      <button
        onClick={handleRun}
        disabled={running}
        style={{
          width: '100%',
          padding: '6px 0',
          background: running ? 'var(--bg-elevated)' : 'var(--teal-dim)',
          color: running ? 'var(--text-muted)' : 'var(--text-primary)',
          border: 'none',
          borderRadius: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? 'Running...' : 'Run Parity Check'}
      </button>

      {result && (
        <div style={{
          marginTop: 8,
          padding: '6px 8px',
          background: 'var(--bg-elevated)',
          borderRadius: 4,
          border: `1px solid ${result.pass ? 'var(--surplus)' : 'var(--deficit)'}`,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.4,
        }}>
          <span style={{ color: result.pass ? 'var(--surplus)' : 'var(--deficit)' }}>
            {result.pass ? '\u2713 ' : '\u2717 '}
          </span>
          {result.detail}
        </div>
      )}
    </div>
  );
}
