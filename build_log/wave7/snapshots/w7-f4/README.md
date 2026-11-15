# W7-F4 — live checks for W7-F2-FU-1 (white-screen) and FU-2 (exposure badges)

Produced by `terra-app/scripts/frame-timing-harness.mjs` (W7-F4 modes `--crash-loads`,
`--block-css`, `--badge-probe`). Headed Chrome 157, macOS, Apple M5, run against
production builds served by `vite preview`:

| Build | Bundle | Served at |
|---|---|---|
| Fixed (this session's working tree) | `assets/index-CMZWvIux.js` | `http://127.0.0.1:4173/` |
| Pre-fix control (the W7-F2 `dist/`, built from `b218128`) | `assets/index-CRPkT3mV.js`, the bundle that white-screened in W7-F2 | `http://127.0.0.1:4174/` |

| File | Build | What it shows |
|---|---|---|
| `frame-timing-headed-crash-loads-2026-11-15T22-46-14-482Z.json` | fixed | **Acceptance run:** 10 reloads → Free Play → Climate hazards on. 0 crashes, choropleth `visibility: visible` on 10/10, 0 `[data-map-layer-error]` markers, 0 failed requests. |
| `prefix-build_frame-timing-headed-crash-loads-css-blocked-2026-11-15T22-47-20-103Z.json` | pre-fix | Root-cause repro: every stylesheet blocked (`Network.setBlockedURLs ['*.css']`). 5/5 loads white-screen with `Error: Missing required --choro-3 design token`. |
| `frame-timing-headed-crash-loads-css-blocked-2026-11-15T22-47-36-144Z.json` | fixed | Same blocked-CSS condition: 0/5 crash, choropleth visible 5/5. |
| `frame-timing-headed-badge-probe-2026-11-15T22-48-36-956Z.json` | fixed | The 15 tier-2 anchor cards W7-F2 opened: 13/15 show the 4-badge stack. The other 2 (`eia860_4158_56009` Dave Johnston, `eia860_8066_56037` Jim Bridger) are `match_confidence: unmatched` and have no registry asset, so their cards have no Registry Asset section. That is unchanged existing behaviour. |

Screenshots (Git LFS): `docs/screenshots/w7-f4/crash-loads-final.png`,
`crash-loads-final-css-blocked.png`, `anchor-badge-stack-eia860_505_56013.png`.

Every load in every run logs 2 MapLibre console errors: `Cannot add layer
"ecoregion-fill" / "ecoregion-border" before non-existing layer "county-fill"`.
They are pre-existing (the same errors are in the W7-F2 JSONs on the pre-fix bundle)
and are not throws. Recorded as W7-F4-FU-2 in the HANDOFF.

Reproduce:

```
cd terra-app && npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1 &
node scripts/frame-timing-harness.mjs --mode headed --crash-loads 10 --out ../build_log/wave7/snapshots/w7-f4 --screenshots ../docs/screenshots/w7-f4
node scripts/frame-timing-harness.mjs --mode headed --crash-loads 5 --block-css --out ../build_log/wave7/snapshots/w7-f4 --screenshots ../docs/screenshots/w7-f4
node scripts/frame-timing-harness.mjs --mode headed --badge-probe --out ../build_log/wave7/snapshots/w7-f4 --screenshots ../docs/screenshots/w7-f4
# pre-fix control: serve an older dist with `vite preview --port 4174 --outDir <dist>` and pass --url http://127.0.0.1:4174/
```
