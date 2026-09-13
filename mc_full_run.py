"""
mc_full_run.py — Standalone runner for the 15_coefficient_monte_carlo notebook
full-run (N=10,000) computation phase.

Runs setup + simulation; stops before analysis/plotting cells.
Checkpoint parquet is written incrementally every 500 iterations.

Launch:
    nohup python mc_full_run.py > data/processed/mc_run.log 2>&1 &

After this finishes, run the analysis/plotting cells in the notebook
(tornado charts, validation-priority CSV) — Cell 12 onward.

IMPORTANT: The if __name__ == '__main__' guard is required on macOS because
ProcessPoolExecutor uses "spawn" (not "fork"), which re-imports this module
in each worker process.
"""

import sys
import os
import json
import copy
import time
import warnings
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
import pandas as pd
from scipy.stats import truncnorm
import matplotlib
matplotlib.use('Agg')

warnings.filterwarnings('ignore', category=FutureWarning)


def main():
    PROJECT_ROOT = Path(__file__).parent
    SRC_DIR  = PROJECT_ROOT / 'src'
    DATA_DIR = PROJECT_ROOT / 'data' / 'processed'
    FIG_DIR  = DATA_DIR / 'figures'
    FIG_DIR.mkdir(parents=True, exist_ok=True)

    if str(SRC_DIR) not in sys.path:
        sys.path.insert(0, str(SRC_DIR))

    import terra_engine as te

    QUICK_TEST           = False
    N_ITERATIONS         = 10_000
    COEFF_CI_HALF_WIDTH  = 0.5
    COEFF_CI_Z           = 1.96
    CHECKPOINT_INTERVAL  = 500
    N_WORKERS            = max(1, (os.cpu_count() or 2) - 1)

    N_ITER        = N_ITERATIONS
    DO_CHECKPOINT = True
    CHECKPOINT_PATH = DATA_DIR / 'mc_results_checkpoint.parquet'
    SIGMA = COEFF_CI_HALF_WIDTH / COEFF_CI_Z
    A_CLIP = (0.5 - 1.0) / SIGMA
    B_CLIP = (1.5 - 1.0) / SIGMA

    print(f"[{datetime.now().isoformat(timespec='seconds')}] mc_full_run.py starting")
    print(f"Mode         : FULL RUN ({N_ITER} iters, checkpoint every {CHECKPOINT_INTERVAL})")
    print(f"Workers      : {N_WORKERS}")
    print(f"SD (sigma)   : {SIGMA:.4f}  (CI half-width={COEFF_CI_HALF_WIDTH}, Z={COEFF_CI_Z})")
    print(f"Truncation   : [0.5, 1.5]", flush=True)

    # Load action library
    lib_path = DATA_DIR / 'mw_action_library_v3.json'
    with open(lib_path) as f:
        BASE_LIBRARY = json.load(f)

    schema_ver = (BASE_LIBRARY.get('schema_version')
                  or BASE_LIBRARY.get('metadata', {}).get('schema_version'))
    print(f"\nAction library: {lib_path.name}  |  schema_version={schema_ver}  |  "
          f"{len(BASE_LIBRARY['actions'])} actions")

    print("Initializing base state …")
    t0 = time.time()
    BASE_STATE = te.initialize_state()
    print(f"Base state ready in {time.time()-t0:.1f}s  |  "
          f"{len(BASE_STATE['county_ees'])} counties", flush=True)

    # Define representative portfolio
    _PORTFOLIO_SPEC = [
        ('wind_utility',                     10, 'energy_generation'),
        ('solar_utility',                    20, 'energy_generation'),
        ('geothermal_utility',                0, 'energy_generation'),
        ('coal_repowering',                  30, 'energy_generation'),
        ('smr_advanced',                     15, 'energy_generation'),
        ('coal_to_solar',                    40, 'energy_generation'),
        ('battery_grid',                      5, 'energy_storage'),
        ('transmission_230kv',                0, 'energy_transmission'),
        ('microgrid',                        25, 'energy_transmission'),
        ('riparian_buffer',                   0, 'hydrological_restoration'),
        ('beaver_reintroduction',            10, 'hydrological_restoration'),
        ('wetland_restoration',              20, 'hydrological_restoration'),
        ('watershed_protection',              5, 'hydrological_restoration'),
        ('mine_land_reclamation',            15, 'hydrological_restoration'),
        ('floodplain_reconnection',          30, 'hydrological_restoration'),
        ('prairie_restoration',               0, 'terrestrial_ecosystem'),
        ('invasive_treatment',               10, 'terrestrial_ecosystem'),
        ('forest_restoration',               20, 'terrestrial_ecosystem'),
        ('sagebrush_restoration',            30, 'terrestrial_ecosystem'),
        ('clean_manufacturing',               5, 'economic_development'),
        ('university_research_center',       15, 'settlement_social'),
        ('tribal_energy_sovereignty',         0, 'settlement_social'),
        ('rural_broadband',                  10, 'settlement_social'),
        ('health_clinic',                    20, 'settlement_social'),
        ('workforce_retraining',             30, 'settlement_social'),
        ('affordable_housing',                5, 'settlement_social'),
        ('lead_service_line',               15, 'settlement_social'),
        ('irrigation_efficiency',             0, 'agriculture'),
        ('rangeland_restoration_maintenance', 10, 'agriculture'),
        ('ev_charging_network',               5, 'transport'),
    ]

    PORTFOLIO = []
    _acts = BASE_LIBRARY['actions']
    for action_id, stride, _tag in _PORTFOLIO_SPEC:
        if action_id not in _acts:
            print(f'  [WARN] {action_id} not in library — skipped')
            continue
        a = _acts[action_id]
        counties = a.get('applicable_counties', [])
        if not counties:
            print(f'  [WARN] {action_id} has no applicable_counties — skipped')
            continue
        geoid     = counties[stride % len(counties)]
        magnitude = a.get('unit_scale', 1000)
        PORTFOLIO.append({'action_id': action_id, 'geoid': geoid, 'magnitude': magnitude})

    print(f"\nPortfolio: {len(PORTFOLIO)} actions")

    portfolio_path = DATA_DIR / 'mc_representative_portfolio.json'
    with open(portfolio_path, 'w') as f:
        json.dump({
            'created':   datetime.now(timezone.utc).isoformat(),
            'n_actions': len(PORTFOLIO),
            'portfolio': PORTFOLIO,
        }, f, indent=2)
    print(f"Saved: {portfolio_path}", flush=True)

    # Enumerate perturbable coefficients
    COEFF_KEYS = []
    for action_id, a in BASE_LIBRARY['actions'].items():
        ees = a.get('ees_effects', {})
        for capital in ('E', 'Ec', 'S'):
            v = ees.get(capital, 0.0)
            if v != 0.0:
                COEFF_KEYS.append((action_id, capital))

    print(f"\nPerturbable coefficients: {len(COEFF_KEYS)}")
    print(f"  E  coefficients: {sum(1 for _, c in COEFF_KEYS if c == 'E')}")
    print(f"  Ec coefficients: {sum(1 for _, c in COEFF_KEYS if c == 'Ec')}")
    print(f"  S  coefficients: {sum(1 for _, c in COEFF_KEYS if c == 'S')}", flush=True)

    # Nominal baseline
    def apply_portfolio(base_state, portfolio, library_override=None):
        curr = dict(base_state)
        if library_override is not None:
            curr['action_library'] = library_override
        for entry in portfolio:
            try:
                curr, _ = te.apply_action(
                    curr, entry['action_id'], entry['geoid'], entry['magnitude'])
            except Exception:
                pass
        return te.compute_ees_summary(curr)

    nom = apply_portfolio(BASE_STATE, PORTFOLIO)['study_area']
    NOM_COMPOSITE = (nom['E'] + nom['Ec'] + nom['S']) / 3.0
    print(f"\nNominal composite (unperturbed): {NOM_COMPOSITE:.4f}", flush=True)

    # Checkpoint detection
    completed_indices = set()
    existing_rows = []

    if CHECKPOINT_PATH.exists():
        existing_df = pd.read_parquet(CHECKPOINT_PATH)
        completed_indices = set(existing_df['iter_idx'].astype(int).tolist())
        existing_rows = existing_df.to_dict('records')
        print(f"\nCheckpoint found: {len(completed_indices):,} / {N_ITER:,} iterations "
              f"already complete.")
        if len(completed_indices) >= N_ITER:
            print("  → Run is already complete. Exiting.")
            return
        resume_from = max(completed_indices) + 1 if completed_indices else 0
        print(f"  → Resuming. Last completed iteration: {max(completed_indices):,}")
    else:
        print("\nNo checkpoint found — starting fresh run.")

    pending_indices = [i for i in range(N_ITER) if i not in completed_indices]
    print(f"Pending iterations: {len(pending_indices):,}", flush=True)

    # Seed generation (reproducible per iteration regardless of run order)
    master_rng = np.random.default_rng(2025_07_22)
    ALL_SEEDS  = master_rng.integers(0, 2**32, size=N_ITER)

    all_rows = list(existing_rows)

    # Set PYTHONPATH for spawned workers
    os.environ['PYTHONPATH'] = str(SRC_DIR) + os.pathsep + os.environ.get('PYTHONPATH', '')

    import mc_worker

    _portfolio_json  = json.dumps(PORTFOLIO)
    _coeff_keys_json = json.dumps(COEFF_KEYS)
    _initargs        = (_portfolio_json, _coeff_keys_json, COEFF_CI_HALF_WIDTH, COEFF_CI_Z)

    print(f"\n[{datetime.now().isoformat(timespec='seconds')}] "
          f"Launching {N_WORKERS} workers for {len(pending_indices):,} iterations…",
          flush=True)
    t0 = time.time()
    buffer = []
    n_done = 0

    task_args = [(int(idx), int(ALL_SEEDS[idx])) for idx in pending_indices]

    with ProcessPoolExecutor(
        max_workers=N_WORKERS,
        initializer=mc_worker.worker_init,
        initargs=_initargs,
    ) as executor:
        futures = {executor.submit(mc_worker.run_iteration, a): a[0] for a in task_args}

        for fut in as_completed(futures):
            try:
                row = fut.result()
            except Exception as exc:
                print(f"  [ERR] iter {futures[fut]}: {exc}", flush=True)
                continue

            all_rows.append(row)
            buffer.append(row)
            n_done += 1

            if n_done % CHECKPOINT_INTERVAL == 0 or n_done == len(pending_indices):
                elapsed    = time.time() - t0
                total_done = len(completed_indices) + n_done
                rate       = n_done / elapsed if elapsed > 0 else 1
                remain     = (N_ITER - total_done) / rate
                print(f"  [{datetime.now().isoformat(timespec='seconds')}] "
                      f"iteration {total_done:,}/{N_ITER:,}  "
                      f"{elapsed/60:.1f}m elapsed  "
                      f"est. {remain/60:.1f}m remaining",
                      flush=True)

                if buffer:
                    ckpt_df = pd.DataFrame(all_rows)
                    ckpt_df.to_parquet(CHECKPOINT_PATH, index=False)
                    buffer.clear()
                    print(f"  ✓ Checkpoint written ({total_done:,} rows)", flush=True)

    wall_total = time.time() - t0
    print(f"\n[{datetime.now().isoformat(timespec='seconds')}] Full run complete.")
    print(f"Total wall-clock: {wall_total/60:.1f} min  |  {len(all_rows):,} rows")

    # ── Deep-merge mc_sensitivity into network_metadata.json ──────────────────
    # F10 fix: read-modify-write so pre-existing keys are preserved.
    MC = pd.DataFrame(all_rows).sort_values('iter_idx').reset_index(drop=True)
    IS_PARTIAL = len(MC) < N_ITER

    from scipy.stats import spearmanr
    factor_cols = [c for c in MC.columns if c.startswith('f__')]
    varied_cols = [c for c in factor_cols if MC[c].std() > 1e-9]
    top5 = []
    for col in varied_cols:
        parts = col[3:].rsplit('__', 1)
        corr, _ = spearmanr(MC[col].values, MC['composite'].values)
        top5.append({'action_id': parts[0], 'capital': parts[1],
                     'spearman_composite': corr})
    top5 = sorted(top5, key=lambda x: abs(x['spearman_composite']), reverse=True)[:5]

    meta_path = DATA_DIR / 'network_metadata.json'
    if meta_path.exists():
        with open(meta_path) as f:
            metadata = json.load(f)
    else:
        metadata = {}

    metadata['mc_sensitivity'] = {
        'run_date':                   datetime.now(timezone.utc).isoformat(),
        'notebook':                   '15_coefficient_monte_carlo.ipynb',
        'quick_test':                 False,
        'n_iterations_requested':     N_ITER,
        'n_iterations_completed':     len(MC),
        'is_partial':                 IS_PARTIAL,
        'coeff_ci_half_width':        COEFF_CI_HALF_WIDTH,
        'coeff_ci_z':                 COEFF_CI_Z,
        'sigma':                      round(SIGMA, 4),
        'n_perturbable_coefficients': len(COEFF_KEYS),
        'composite_mean':             round(float(MC['composite'].mean()), 4),
        'composite_sd':               round(float(MC['composite'].std()), 4),
        'composite_p5':               round(float(MC['composite'].quantile(0.05)), 4),
        'composite_p95':              round(float(MC['composite'].quantile(0.95)), 4),
        'nominal_composite':          round(NOM_COMPOSITE, 4),
        'top5_coefficients_by_sensitivity': top5,
    }

    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Updated (deep-merge): {meta_path}")

    print(f"\n*** Analysis/plotting cells ready. Open the notebook and run from Cell 12 "
          f"(consolidate results) onward. ***")


if __name__ == '__main__':
    main()
