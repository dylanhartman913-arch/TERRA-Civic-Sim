#!/bin/bash
# SLURM job array (uncomment to parallelize on cluster):
# #SBATCH --array=0-2
# #SBATCH --cpus-per-task=4
# #SBATCH --mem=16G
julia --project=julia julia/run_scenario.jl julia/scenarios/baseline.toml
julia --project=julia julia/run_scenario.jl julia/scenarios/carbon_tax_50.toml
julia --project=julia julia/run_scenario.jl julia/scenarios/ces_80pct.toml
