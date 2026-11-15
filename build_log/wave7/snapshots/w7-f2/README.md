# W7-F2 — D4 frame-timing evidence

Produced by `terra-app/scripts/frame-timing-harness.mjs` against
`vite build` + `vite preview` (`http://127.0.0.1:4173/`). Commit under test:
`b218128` (no app source changed in W7-F2). Chrome 157.0.8103.52, macOS, Apple M5.
Viewport: centre −105.3, 40.6, zoom 6.8. Pan: 10 s scripted canvas drag.

Every attempt is kept, including failed and superseded ones.

| File | Role |
|---|---|
| `frame-timing-headed-2026-11-15T21-53-15-186Z.json` | **Headed measurement**: 3 valid runs plus 1 invalid attempt (map did not pan) and 1 white-screen load failure, all recorded in the file. Raw intervals under `runs[].raw_pan_intervals_ms`. |
| `frame-timing-headed-2026-11-15T22-02-23-277Z.json` | **The one performance trace** (rule branch 2): traced run plus `trace_summary`, re-summarized offline per thread. |
| `trace-headed-2026-11-15T22-02-23-277Z.json.gz` | Raw Chrome trace (7 MB). **Not committed** (W7-F2-FU-3, W7-F4); on disk only. Identity recorded below. |
| `frame-timing-headed-2026-11-15T22-04-13-541Z.json` | Screenshot pass (`docs/screenshots/w7-f2/`) plus `anchor_badge_probe`. |
| `frame-timing-headless-2026-11-15T22-06-51-698Z.json` | **Headless** run with the Wave 4 H1.4 flags (`--use-angle=swiftshader`): reproduces p95 ≈ 67 ms. |
| `frame-timing-headless-renderer-2026-11-15T22-07-38-188Z.json` | Headless with **no** GL flags, renderer probe only: Chrome 157 headless picks Metal (Apple M5). |
| `failed-map-load_*.json` (2) | Loads that white-screened (`Missing required --choro-3 design token`) before the harness retried loads. |
| `failed-overlay_*.json` (2) | Headed attempts where the drag start was covered by the county-drawer backdrop, before the harness cleared overlays. |
| `superseded-harness-v0_*.json` (2) | First harness version. Its headed runs are invalid: 1 of 3 never panned, because the mouse release landed off the drag end and opened overlays. Kept for the record; not used. |

Reproduce:

```
cd terra-app && npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1 &
node scripts/frame-timing-harness.mjs --mode headed --runs 3 --out ../build_log/wave7/snapshots/w7-f2 --screenshots ../docs/screenshots/w7-f2
node scripts/frame-timing-harness.mjs --mode headed --trace --out ../build_log/wave7/snapshots/w7-f2
node scripts/frame-timing-harness.mjs --mode headless --runs 1 --out ../build_log/wave7/snapshots/w7-f2 \
  --extra-flags "--enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader"
node scripts/frame-timing-harness.mjs --mode headless --renderer-only --out ../build_log/wave7/snapshots/w7-f2
```

## W7-F2-FU-3 disposition (W7-F4, 2026-11-15)

- **Screenshots** (`docs/screenshots/w7-f2/`, 32 PNGs, 19 MB): committed via Git LFS
  (`.gitattributes`: `docs/screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text`).
- **Raw trace: not committed.** It stays on the machine that produced it. Its summary
  is committed in `frame-timing-headed-2026-11-15T22-02-23-277Z.json` (`trace_summary`).
  Identity, so a copy can be checked:

  | Field | Value |
  |---|---|
  | Path | `build_log/wave7/snapshots/w7-f2/trace-headed-2026-11-15T22-02-23-277Z.json.gz` |
  | Size | 7,008,309 bytes |
  | SHA-256 | `33081f3bc31c7dbb2653691351e0462520bba77cd440c7a8c54ef2ae1d6d3016` |

  Command: `stat -f "%z bytes" <path>; shasum -a 256 <path>` (macOS).
