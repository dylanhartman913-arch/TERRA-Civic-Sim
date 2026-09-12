"""
mc_worker.py — ProcessPoolExecutor worker for 15_coefficient_monte_carlo.ipynb.

Each worker process:
  1. Calls worker_init() once (via initializer=) to load BASE_STATE and portfolio.
  2. Handles repeated run_iteration(iter_idx, seed) calls.

Design:  worker_init() deep-copies base actions into a module-level global so
         run_iteration() never mutates the template state.  terra_engine's own
         _shallow_copy_state() deep-copies the mutable county_ees / bus_state /
         etc. on every apply_action() call, so no cross-iteration contamination.

The module adds its own directory to sys.path at import time so that terra_engine
is always importable even in spawned (not forked) worker processes.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import numpy as np
from scipy.stats import truncnorm

# ── Bootstrap: make src/ importable in spawned workers ───────────────────────
_SRC_DIR = Path(__file__).parent
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

# ── Module-level worker state (set once by worker_init) ───────────────────────
_TEMPLATE_STATE = None   # initialized base state (never mutated)
_BASE_ACTIONS   = None   # deep copy of base actions dict (never mutated)
_PORTFOLIO      = None   # list of dicts: {action_id, geoid, magnitude}
_COEFF_KEYS     = None   # list of (action_id, capital) tuples — only non-zero coefficients
_SIGMA          = None   # truncated-normal SD
_A_CLIP         = None   # lower truncation point in Z-units
_B_CLIP         = None   # upper truncation point in Z-units


def worker_init(
    portfolio_json: str,
    coeff_keys_json: str,
    ci_half_width: float,
    ci_z: float,
) -> None:
    """
    Initializer for each ProcessPoolExecutor worker process.
    Called once per worker; populates module-level globals.
    """
    import terra_engine as te

    global _TEMPLATE_STATE, _BASE_ACTIONS, _PORTFOLIO, _COEFF_KEYS
    global _SIGMA, _A_CLIP, _B_CLIP

    _PORTFOLIO  = json.loads(portfolio_json)
    _COEFF_KEYS = [tuple(x) for x in json.loads(coeff_keys_json)]

    sigma  = ci_half_width / ci_z
    _SIGMA  = sigma
    _A_CLIP = (0.5 - 1.0) / sigma   # = -ci_half_width / sigma = -ci_z ≈ -1.96
    _B_CLIP = (1.5 - 1.0) / sigma   # =  ci_half_width / sigma =  ci_z ≈  1.96

    _TEMPLATE_STATE = te.initialize_state()
    _BASE_ACTIONS   = copy.deepcopy(_TEMPLATE_STATE["action_library"]["actions"])


def run_iteration(args: tuple) -> dict:
    """
    Execute one MC iteration.

    args: (iter_idx: int, seed: int)

    Returns a flat dict suitable for a single DataFrame row:
        iter_idx, seed, E, Ec, S, composite,
        f__{action_id}__{capital}  (one column per perturbable coefficient)
    """
    import terra_engine as te

    iter_idx, seed = args
    rng = np.random.default_rng(int(seed))

    # ── Sample truncated-normal perturbation factors ──────────────────────────
    n_keys = len(_COEFF_KEYS)
    if n_keys:
        rv = truncnorm(_A_CLIP, _B_CLIP, loc=1.0, scale=_SIGMA)
        raw_factors = rv.rvs(size=n_keys, random_state=rng)
    else:
        raw_factors = np.ones(0)

    # ── Build perturbed action library ────────────────────────────────────────
    perturbed_actions = copy.deepcopy(_BASE_ACTIONS)
    factor_dict: dict[tuple, float] = {}

    for i, (action_id, capital) in enumerate(_COEFF_KEYS):
        orig = _BASE_ACTIONS.get(action_id, {}).get("ees_effects", {}).get(capital, 0.0)
        if orig == 0.0:
            factor_dict[(action_id, capital)] = 1.0
            continue
        f = float(raw_factors[i])
        factor_dict[(action_id, capital)] = f
        if action_id in perturbed_actions:
            perturbed_actions[action_id].setdefault("ees_effects", {})[capital] = orig * f

    # Shallow-copy the action_library dict, replace actions only
    perturbed_library = dict(_TEMPLATE_STATE["action_library"])
    perturbed_library["actions"] = perturbed_actions

    # Working state: shallow dict copy of template + swapped action_library.
    # apply_action() calls _shallow_copy_state() internally, which deep-copies
    # county_ees / buses / etc., so _TEMPLATE_STATE is never mutated.
    curr_state = dict(_TEMPLATE_STATE)
    curr_state["action_library"] = perturbed_library

    # ── Apply representative portfolio ────────────────────────────────────────
    for entry in _PORTFOLIO:
        try:
            curr_state, _ = te.apply_action(
                curr_state,
                entry["action_id"],
                entry["geoid"],
                entry["magnitude"],
            )
        except Exception:
            pass   # Skip gracefully; action may be inapplicable at this county

    # ── Compute EES summary ───────────────────────────────────────────────────
    summary = te.compute_ees_summary(curr_state)
    sa = summary["study_area"]
    E, Ec, S = sa["E"], sa["Ec"], sa["S"]
    composite = (E + Ec + S) / 3.0

    row: dict = {
        "iter_idx":  int(iter_idx),
        "seed":      int(seed),
        "E":         E,
        "Ec":        Ec,
        "S":         S,
        "composite": composite,
    }
    for (aid, cap), fval in factor_dict.items():
        row[f"f__{aid}__{cap}"] = fval

    return row
