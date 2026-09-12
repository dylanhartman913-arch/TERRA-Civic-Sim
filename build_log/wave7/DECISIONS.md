# Wave 7 Decisions Log

Append one block per decision. Do not edit previous blocks.

---

## 2026-09-12 — S1: package-lock.json tracking

**Decision:** Defer tracking `package-lock.json` to S2 (tree hygiene session).

**Why:** It was not previously tracked. Adding it without reviewing whether
`node_modules/` and related entries are properly gitignored, and whether the
lock reflects the current install, risks committing a stale or inconsistent
artifact. Low urgency relative to the safety-net objective of S1.

---

## 2026-09-12 — S1: EIA API key exposure (F4)

**Decision:** Old exposed-key blob `b169a18` confirmed purged via gc.
New key written to `.env` by user directly. `.env` is gitignored.
F4 is closed.

---

## 2026-09-12 — S1: data/staging files

**Decision:** `data/staging/ba_territories.geojson` and
`data/staging/hifld_control_areas_2021-12-08/` left untracked.
These are large data files; whether to track, gitignore, or add to
LFS is a separate decision for S2 (tree hygiene).
