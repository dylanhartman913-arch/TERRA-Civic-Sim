#!/usr/bin/env node
/**
 * Map-interaction frame-timing harness (W7-F2, D4 disposition).
 *
 * Built new in W7-F2: the Wave 4 H1.4 capture that produced p95 ≈ 67 ms was run
 * ad hoc over the DevTools protocol and no script was ever committed. This file
 * reproduces that documented method — rAF intervals recorded in-page while a
 * scripted mouse drag pans the MapLibre/deck.gl canvas — and adds renderer
 * provenance (UNMASKED_RENDERER_WEBGL + chrome://gpu).
 *
 * Zero dependencies: launches the system Chrome and talks CDP over Node's
 * built-in WebSocket (Node >= 22).
 *
 * Usage (against `vite build` + `vite preview`, not the dev server):
 *   node scripts/frame-timing-harness.mjs --mode headed   --runs 3 --out <dir> [--screenshots <dir>]
 *   node scripts/frame-timing-harness.mjs --mode headless --runs 1 --out <dir> \
 *        --extra-flags "--enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader"
 *   node scripts/frame-timing-harness.mjs --mode headless --renderer-only --out <dir>
 *
 * W7-F4 live checks (no timing):
 *   node scripts/frame-timing-harness.mjs --mode headed --crash-loads 10 [--block-css] --out <dir> [--screenshots <dir>]
 *        N reloads -> Free Play -> Climate hazards on; records white-screens, page
 *        errors, [data-map-layer-error] markers, layer visibility/paint, failed
 *        requests. --block-css blocks every stylesheet (tokens never apply).
 *   node scripts/frame-timing-harness.mjs --mode headed --badge-probe --out <dir> [--screenshots <dir>]
 *        Opens the 15 W7-F2 tier-2 anchor cards and counts exposure-badge stacks.
 *
 * Options:
 *   --url <url>            app URL (default http://127.0.0.1:4173/)
 *   --center <lng,lat>     viewport centre (default -105.3,40.6: Front Range + I-80)
 *   --zoom <z>             viewport zoom (default 6.8: the F2 "mid-zoom" proxy)
 *   --duration <ms>        pan duration per run (default 10000)
 *   --chrome <path>        Chrome binary (default: /Applications/Google Chrome.app)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') && !v.includes(' ') ? true : v;
};
const MODE = opt('mode', 'headed');
const RUNS = Number(opt('runs', 3));
const APP_URL = opt('url', 'http://127.0.0.1:4173/');
const [CLNG, CLAT] = String(opt('center', '-105.3,40.6')).split(',').map(Number);
const ZOOM = Number(opt('zoom', 6.8));
const DURATION = Number(opt('duration', 10000));
const OUT = resolve(opt('out', '.'));
const SHOTS = opt('screenshots', null);
const RENDERER_ONLY = argv.includes('--renderer-only');
const TRACE = argv.includes('--trace');
const SHOTS_ONLY = argv.includes('--shots-only'); // screenshots without timing runs // one valid pan under a Chrome performance trace
// W7-F4 live checks (no timing): N reloads with the climate-hazard choropleth on,
// optionally with every stylesheet blocked; and the 15-card exposure-badge probe.
const CRASH_LOADS = Number(opt('crash-loads', 0));
const BLOCK_CSS = argv.includes('--block-css');
const BADGE_PROBE = argv.includes('--badge-probe');
const EXTRA = String(opt('extra-flags', '')).split(' ').filter(Boolean);
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
mkdirSync(OUT, { recursive: true });

// Offline: re-summarize a saved trace (no browser). --summarize <trace.json.gz> [--report <report.json>]
if (opt('summarize', null)) {
  const { gunzipSync } = await import('node:zlib');
  const trace = JSON.parse(gunzipSync(readFileSync(opt('summarize'))).toString());
  const summary = summarizeTrace(trace, DURATION);
  console.log(JSON.stringify(summary, null, 1));
  const rep = opt('report', null);
  if (rep) {
    const r = JSON.parse(readFileSync(rep, 'utf8'));
    r.trace_summary = summary;
    r.trace_summary_note = 'Re-summarized offline: the in-run summary attributed MapLibre worker-thread CPU samples to the main thread.';
    writeFileSync(rep, JSON.stringify(r, null, 2));
  }
  process.exit(0);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Local connects to the DevTools port intermittently fail (EADDRNOTAVAIL); retry.
async function fetchRetry(url, init) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, init); } catch (e) { if (i >= 10) throw e; await sleep(300); }
  }
}
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ── Chrome + CDP ─────────────────────────────────────────────────────────────
const profile = mkdtempSync(join(tmpdir(), 'terra-ft-'));
const flags = [
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  '--window-position=0,0',
  // Keep rAF unthrottled if the window is partly covered; does not change the GL path.
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  ...(MODE === 'headless' ? ['--headless=new'] : []),
  ...EXTRA,
  'about:blank',
];
log('launch', CHROME, flags.join(' '));
const chrome = spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

async function devtoolsPort() {
  const f = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (existsSync(f)) {
      const [port] = readFileSync(f, 'utf8').split('\n');
      if (port) {
        // The file can appear before the HTTP endpoint accepts connections.
        const ok = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
        if (ok) return Number(port);
      }
    }
    await sleep(100);
  }
  throw new Error('DevToolsActivePort never appeared');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message}`)); else res(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  close() { this.ws.close(); }
}

async function pageTarget(port, url) {
  const t = await (await fetchRetry(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  for (let attempt = 1; ; attempt++) {
    const c = new Cdp(t.webSocketDebuggerUrl);
    try { await c.ready; return c; } catch (e) {
      if (attempt >= 10) throw new Error(`page websocket failed after ${attempt} attempts: ${e?.message ?? e}`);
      await sleep(300);
    }
  }
}

// ── in-page helpers (injected as strings) ────────────────────────────────────
// Locate the MapLibre instance through React's fiber on the map container:
// MapView keeps it in a useRef. Harness-only introspection; no app code changes.
const FIND_MAP = `(() => {
  const el = document.querySelector('.maplibregl-map');
  if (!el) return null;
  const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  let f = key ? el[key] : null;
  while (f) {
    let h = f.memoizedState;
    while (h && typeof h === 'object' && 'next' in h) {
      const v = h.memoizedState;
      if (v && typeof v === 'object' && v.current && typeof v.current.jumpTo === 'function') return v.current;
      h = h.next;
    }
    f = f.return;
  }
  return null;
})()`;

const RENDERER_INFO = `(() => {
  const read = gl => {
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  };
  const map = ${FIND_MAP};
  const fresh = document.createElement('canvas').getContext('webgl2');
  return {
    map_context: read(map?.painter?.context?.gl ?? null),
    fresh_webgl2_context: read(fresh),
    devicePixelRatio: window.devicePixelRatio,
    viewport: [innerWidth, innerHeight],
    canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height, c.className || c.id || '']),
    userAgent: navigator.userAgent,
  };
})()`;

const GPU_PAGE_LINES = `(() => {
  const out = [];
  const walk = root => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (el.tagName === 'LI' || el.tagName === 'TR') out.push(el.textContent.replace(/\\s+/g, ' ').trim());
    }
  };
  walk(document);
  return out.filter(l => /WebGL|GL_RENDERER|GL_VENDOR|GL_VERSION|Rasterization|Compositing|SwiftShader/i.test(l));
})()`;

async function waitFor(c, expr, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await c.eval(expr).catch(() => false)) return;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const waitIdle = (c, ms = 8000) => c.eval(`new Promise(res => {
  const map = ${FIND_MAP};
  if (!map) return res('no-map');
  let done = false;
  const fin = v => { if (!done) { done = true; res(v); } };
  map.once('idle', () => fin('idle'));
  map.triggerRepaint();
  setTimeout(() => fin('timeout'), ${ms});
})`);

async function clickText(c, text) {
  const ok = await c.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!b) return false; b.click(); return true;
  })()`);
  if (!ok) throw new Error(`button not found: ${text}`);
}

// ── measurement ──────────────────────────────────────────────────────────────
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const r = v => Math.round(v * 100) / 100;
  return {
    n: s.length,
    p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), max: r(s[s.length - 1]),
    mean: r(s.reduce((a, b) => a + b, 0) / s.length),
    over_16_7: s.filter(v => v > 16.7).length,
    over_33_3: s.filter(v => v > 33.3).length,
  };
}

async function setViewport(c) {
  await c.eval(`(() => { const m = ${FIND_MAP}; m.jumpTo({ center: [${CLNG}, ${CLAT}], zoom: ${ZOOM} }); return true; })()`);
  return waitIdle(c);
}

// Close anything a stray click may have opened (anchor card, county drawer) so
// the drag starts on the map canvas, not on an overlay.
const CLEAR_OVERLAYS = `(() => {
  for (const b of document.querySelectorAll('[data-anchor-card] button')) if (b.textContent.trim() === '×') b.click();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  // County drawer click-catcher (CountyCardDrawer: absolute, inset 0, z-index 39).
  for (const d of document.querySelectorAll('div')) if (d.style.zIndex === '39' && d.style.inset === '0px' && !d.children.length) d.click();
  return true;
})()`;

async function measureRun(c, runIdx) {
  await c.eval(CLEAR_OVERLAYS);
  const idle = await setViewport(c);
  await sleep(1000);
  const geom = await c.eval(`(() => {
    const r = document.querySelector('.maplibregl-canvas').getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { cx, cy, w: r.width, h: r.height, hit: hit ? (hit.tagName + '.' + (hit.className || '') + ' ' + hit.outerHTML.slice(0, 400) + ' <- ' + [...Array(4)].reduce((a, _, i) => { let e = hit; for (let k = 0; k <= i; k++) e = e?.parentElement; return a + (e ? e.tagName + '[' + [...e.attributes].map(x => x.name + '=' + x.value.slice(0, 60)).join(' ') + '] ' : ''); }, '')) : null,
             hitIsMap: !!hit && !!hit.closest('.maplibregl-map') && hit.tagName === 'CANVAS' };
  })()`);
  if (!geom.hitIsMap) throw new Error(`drag start point is covered by ${geom.hit}`);
  // Idle baseline (refresh interval) then the timed pan.
  await c.eval(`(() => {
    const m = ${FIND_MAP};
    if (!window.__moveHooked) {
      window.__moveHooked = true;
      m.on('move', () => { if (window.__ft?.phase === 'pan') window.__ft.moves++; });
      for (const ev of ['dragstart', 'dragend', 'click', 'mousedown', 'mouseup']) {
        m.on(ev, () => window.__ft?.events.push([ev, Math.round(performance.now() - (window.__ft.t0 ?? 0))]));
      }
    }
    window.__ft = { phase: 'idle', idle: [], pan: [], last: null, moves: 0, on: true, events: [], t0: null };
    const tick = t => {
      const ft = window.__ft; if (!ft.on) return;
      if (ft.last != null) ft[ft.phase].push(t - ft.last);
      ft.last = t; requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);
  await sleep(1000);
  const { cx, cy } = geom;
  const A = 200, B = 80, P = 3000;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
  await c.eval(`(window.__ft.phase = 'pan', window.__ft.last = null, window.__ft.t0 = performance.now(), true)`);
  const t0 = Date.now();
  let events = 0;
  let x = cx, y = cy;
  while (Date.now() - t0 < DURATION) {
    const t = Date.now() - t0;
    x = cx + A * Math.sin((2 * Math.PI * t) / P);
    y = cy + B * Math.sin((2 * Math.PI * t) / (P * 1.37));
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    events++;
    await sleep(8);
  }
  const ft = await c.eval(`(() => { const f = window.__ft; f.on = false; f.phase = 'done'; return { idle: f.idle, pan: f.pan, moves: f.moves, events: f.events }; })()`);
  // Release where the drag ended: a release elsewhere can register as a click.
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(800);
  const center = await c.eval(`(() => { const m = ${FIND_MAP}; const c = m.getCenter(); return [c.lng, c.lat, m.getZoom()]; })()`);
  const result = {
    run: runIdx,
    drag_start_hit: geom.hit,
    // A run is valid only if the map actually panned for most of the window.
    valid: ft.moves >= 0.8 * ft.pan.length,
    viewport_idle_state: idle,
    map_events_ms: ft.events,
    mouse_events: events,
    map_move_events: ft.moves,
    end_center_zoom: center,
    idle_refresh: stats(ft.idle),
    pan: stats(ft.pan),
    raw_pan_intervals_ms: ft.pan.map(v => Math.round(v * 1000) / 1000),
  };
  return result;
}

// ── one performance trace over a pan (branch 2 of the D4 rule) ───────────────
const TRACE_CATEGORIES = [
  'toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink.user_timing',
  'disabled-by-default-v8.cpu_profiler', 'gpu', 'viz',
];

async function tracedRun(c) {
  let run = null;
  const startTrace = async () => c.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: TRACE_CATEGORIES } });
  for (let attempt = 1; attempt <= 4 && !(run?.valid); attempt++) {
    const done = new Promise(res => c.listeners.push(m => { if (m.method === 'Tracing.tracingComplete') res(m.params.stream); }));
    await startTrace();
    run = await measureRun(c, `trace-${attempt}`);
    await c.send('Tracing.end');
    const stream = await done;
    let chunks = '';
    for (;;) { const r = await c.send('IO.read', { handle: stream, size: 1 << 20 }); chunks += r.base64Encoded ? Buffer.from(r.data, 'base64').toString() : r.data; if (r.eof) break; }
    await c.send('IO.close', { handle: stream });
    if (!run.valid) { log(`trace attempt ${attempt} INVALID (map did not pan); retrying`); continue; }
    return { run, trace: JSON.parse(chunks) };
  }
  throw new Error('no valid traced run');
}

function summarizeTrace(trace, panMs) {
  const ev = trace.traceEvents ?? trace;
  const names = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  // Pan window = the FireAnimationFrame span on the busiest renderer main thread.
  const tlTasks = ev.filter(e => e.ph === 'X' && e.name === 'RunTask' && e.dur != null);
  const busy = new Map();
  for (const e of tlTasks) { const k = `${e.pid}:${e.tid}`; busy.set(k, (busy.get(k) ?? 0) + e.dur); }
  const mains = [...busy.keys()].filter(k => names.get(k) === 'CrRendererMain');
  const main = mains.sort((a, b) => busy.get(b) - busy.get(a))[0];
  const raf = ev.filter(e => `${e.pid}:${e.tid}` === main && e.name === 'FireAnimationFrame' && e.ph === 'X');
  const t0 = Math.min(...raf.map(e => e.ts)), t1 = Math.max(...raf.map(e => e.ts + e.dur));
  const win = t1 - t0;
  const inWin = e => e.ts >= t0 && e.ts <= t1;
  const threadBusy = [...busy.keys()].map(k => ({
    thread: `${names.get(k) ?? '?'} (${k})`,
    busy_ms: Math.round(tlTasks.filter(e => `${e.pid}:${e.tid}` === k && inWin(e)).reduce((a, e) => a + e.dur, 0) / 1000),
  })).map(t => ({ ...t, busy_pct: Math.round((1000 * t.busy_ms) / win * 1000) / 10 })).sort((a, b) => b.busy_ms - a.busy_ms).slice(0, 8);
  // Main-thread event totals by name (inclusive), within the window.
  const byName = new Map();
  for (const e of ev) if (e.ph === 'X' && `${e.pid}:${e.tid}` === main && inWin(e) && e.name !== 'RunTask' && e.dur != null) byName.set(e.name, (byName.get(e.name) ?? 0) + e.dur);
  const mainEvents = [...byName].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, d]) => ({ name: n, ms: Math.round(d / 100) / 10 }));
  // JS self time from CPU profile samples on the main thread.
  const nodes = new Map(); const self = new Map(); let interval = 0, samples = 0;
  // A ProfileChunk carries the profile id; the matching 'Profile' event names its thread.
  const mainTid = Number(main.split(':')[1]);
  const mainProfiles = new Set(ev.filter(e => e.name === 'Profile' && `${e.pid}:${e.tid}` === main).map(e => e.id));
  for (const e of ev) {
    if (e.name !== 'ProfileChunk' || !(mainProfiles.has(e.id) || (`${e.pid}:${e.tid}` === main && e.tid === mainTid && !e.id))) continue;
    const cp = e.args?.data?.cpuProfile; if (!cp) continue;
    for (const n of cp.nodes ?? []) nodes.set(n.id, n.callFrame);
    const deltas = e.args.data.timeDeltas ?? [];
    (cp.samples ?? []).forEach((id, i) => { self.set(id, (self.get(id) ?? 0) + 1); samples++; interval += deltas[i] ?? 0; });
  }
  const perSample = samples ? interval / samples / 1000 : 0;
  const fnSelf = new Map();
  for (const [id, n] of self) {
    const cf = nodes.get(id); if (!cf) continue;
    const key = `${cf.functionName || '(anonymous)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber}:${cf.columnNumber}`;
    fnSelf.set(key, (fnSelf.get(key) ?? 0) + n);
  }
  const topJs = [...fnSelf].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => ({ fn: k, samples: n, approx_ms: Math.round(n * perSample * 10) / 10 }));
  return { window_ms: Math.round(win / 1000), pan_ms: panMs, main_thread: names.get(main) + ` (${main})`, raf_frames: raf.length, thread_busy: threadBusy, main_thread_events: mainEvents, cpu_profile: { samples, approx_sample_ms: Math.round(perSample * 1000) / 1000, top_self: topJs } };
}

// ── screenshots for T6-FU-2 visual check ─────────────────────────────────────
async function shot(c, dir, name) {
  await waitIdle(c);
  await sleep(600);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const p = join(dir, `${name}.png`);
  writeFileSync(p, Buffer.from(data, 'base64'));
  log('screenshot', p);
  return p;
}

const toggleLayer = (c, label) => c.eval(`(() => {
  const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
  if (!l) return false; l.querySelector('input').click(); return l.querySelector('input').checked;
})()`);

async function screenshots(c, dir) {
  mkdirSync(dir, { recursive: true });
  const files = [];
  await setViewport(c);
  for (const [key, name] of [['1', 'E'], ['2', 'Ec'], ['3', 'S']]) {
    await c.eval(`(document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true })), true)`);
    files.push(await shot(c, dir, `county-metric-${name}`));
  }
  await c.eval(`(document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })), true)`);

  const setSelect = (label, value) => c.eval(`(() => {
    const s = document.querySelector('select[aria-label=${JSON.stringify(label)}]');
    if (!s) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value;
  })()`);
  const options = label => c.eval(`[...(document.querySelector('select[aria-label=${JSON.stringify(label)}]')?.options ?? [])].map(o => o.value)`);
  log('climate hazards on:', await toggleLayer(c, 'Climate hazards'));
  const lenses = await options('Climate lens');
  const metrics = await options('Climate hazard metric');
  log('climate lenses', lenses, 'metrics', metrics);
  if (!metrics.length) throw new Error('Climate hazard metric <select> not found');
  // Default lens plus the first projection lens, every metric.
  for (const lens of lenses.slice(0, 2)) {
    await setSelect('Climate lens', lens);
    for (const m of metrics) {
      await setSelect('Climate hazard metric', m);
      files.push(await shot(c, dir, `climate-hazard-${lens}-${m}`));
    }
  }
  await setSelect('Climate lens', lenses[0]);
  log('climate hazards off:', !(await toggleLayer(c, 'Climate hazards')));

  log('ag choropleth on:', await toggleLayer(c, 'Ag choropleth'));
  for (const mode of ['forage_trend', 'invasive_burden', 'converted_acres']) {
    await c.eval(`(document.querySelector('input[name="ag-choropleth-mode"][value="${mode}"]').click(), true)`);
    files.push(await shot(c, dir, `ag-choropleth-${mode}`));
  }
  log('ag choropleth off:', !(await toggleLayer(c, 'Ag choropleth')));

  // County yield-badge stacks (YieldBadges layer).
  log('yield badges on:', await toggleLayer(c, 'Yield badges'));
  files.push(await shot(c, dir, 'yield-badge-stacks'));
  log('yield badges off:', !(await toggleLayer(c, 'Yield badges')));

  // Anchor card + exposure-badge stack: open tier-2 anchor cards via the app's
  // own terra:focus-anchor event (Wyoming first). Records whether any card
  // renders [data-testid=exposure-badges]; screenshots the first that does, or
  // else the last card opened, named so the absence is explicit.
  const tier2 = probedAnchorIds();
  let lastCard = null, found = null;
  const tried = [];
  for (const id of tier2) {
    await c.eval(CLEAR_OVERLAYS);
    await c.eval(`(window.dispatchEvent(new CustomEvent('terra:focus-anchor', { detail: { anchorId: ${JSON.stringify(id)} } })), true)`);
    await sleep(1400);
    const st = await c.eval(`({ card: !!document.querySelector('[data-anchor-card]'), registry: document.querySelector('[data-anchor-card]')?.textContent.includes('Registry Asset') ?? false,
      badges: document.querySelectorAll('[data-testid="exposure-badges"] span').length })`);
    tried.push({ id, ...st });
    if (st.card) lastCard = id;
    if (st.badges > 0) { found = id; break; }
  }
  log('anchor cards tried', JSON.stringify(tried));
  report.anchor_badge_probe = tried;
  if (found) files.push(await shot(c, dir, `anchor-badge-stack-${found}`));
  else if (lastCard) {
    await c.eval(CLEAR_OVERLAYS);
    await c.eval(`(window.dispatchEvent(new CustomEvent('terra:focus-anchor', { detail: { anchorId: ${JSON.stringify(lastCard)} } })), true)`);
    await sleep(1400);
    files.push(await shot(c, dir, `anchor-card-NO-exposure-badges-${lastCard}`));
  }
  return files;
}

// The 15 tier-2 anchors the W7-F2 probe opened (Wyoming first, file order).
function probedAnchorIds() {
  const geo = JSON.parse(readFileSync(new URL('../src/data/mw_anchor_facilities.geojson', import.meta.url), 'utf8'));
  return geo.features.filter(f => f.properties.tier === 2)
    .sort((a, b) => (b.properties.geoid.startsWith('56') - a.properties.geoid.startsWith('56')))
    .map(f => f.properties.anchor_id).slice(0, 15);
}

// ── W7-F4 live checks ────────────────────────────────────────────────────────
const BLANK = `document.body.innerText.trim() === ''`;
const HAZARD_LAYER_STATE = `(() => {
  const m = ${FIND_MAP};
  if (!m) return { map: false };
  const id = 'climate-hazard-choropleth';
  if (!m.getLayer(id)) return { map: true, layer: false };
  return { map: true, layer: true, visibility: m.getLayoutProperty(id, 'visibility'), fill_color: JSON.stringify(m.getPaintProperty(id, 'fill-color')) };
})()`;

async function ensureLayer(c, label, on) {
  return c.eval(`(() => {
    const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
    if (!l) return null;
    const i = l.querySelector('input');
    if (i.checked !== ${on}) i.click();
    return i.checked;
  })()`);
}

async function crashLoads(c, n) {
  await c.send('Network.enable');
  if (BLOCK_CSS) await c.send('Network.setBlockedURLs', { urls: ['*.css'] });
  const urls = new Map();
  const net = [];
  c.listeners.push(m => {
    if (m.method === 'Network.requestWillBeSent') urls.set(m.params.requestId, m.params.request.url);
    if (m.method === 'Network.loadingFailed') net.push({ url: urls.get(m.params.requestId) ?? null, error: m.params.errorText, blocked: m.params.blockedReason ?? null });
  });
  const loads = [];
  for (let load = 1; load <= n; load++) {
    const e0 = report.page_errors.length, n0 = net.length;
    const rec = { load, at: new Date().toISOString() };
    try {
      await c.send('Page.reload', { ignoreCache: true });
      await sleep(1000);
      await waitFor(c, `!!document.querySelector('button')`, 30000, 'title screen');
      rec.stylesheet_applied = await c.eval(`getComputedStyle(document.documentElement).getPropertyValue('--choro-3').trim() !== ''`);
      await clickText(c, 'Begin');
      await waitFor(c, `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Skip to free play'))`, 10000, 'campaign select');
      await clickText(c, 'Skip to free play');
      await waitFor(c, `(() => { const m = ${FIND_MAP}; return !!m && m.isStyleLoaded(); })() || ${BLANK}`, 60000, 'map load');
      rec.blank_after_entry = await c.eval(BLANK);
      if (!rec.blank_after_entry) {
        rec.choropleth_toggle_checked = await ensureLayer(c, 'Climate hazards', true);
        await waitIdle(c);
        await sleep(500);
        rec.hazard_layer = await c.eval(HAZARD_LAYER_STATE);
      }
      rec.blank_final = await c.eval(BLANK);
      rec.map_layer_errors = await c.eval(`[...document.querySelectorAll('[data-map-layer-error]')].map(e => e.dataset.mapLayerError)`);
    } catch (e) {
      rec.error = String(e.message ?? e);
    }
    rec.page_errors = report.page_errors.slice(e0);
    rec.network_failures = net.slice(n0);
    rec.crashed = Boolean(rec.blank_after_entry || rec.blank_final || rec.error);
    loads.push(rec);
    log(`load ${load}: ${rec.crashed ? 'CRASH' : 'ok'} | css applied ${rec.stylesheet_applied} | hazard ${JSON.stringify(rec.hazard_layer ?? null)?.slice(0, 120)} | layer errors ${JSON.stringify(rec.map_layer_errors ?? null)} | page errors ${rec.page_errors.length} | net failures ${rec.network_failures.length}${rec.error ? ' | ' + rec.error.slice(0, 160) : ''}`);
  }
  if (SHOTS && loads.length && !loads.at(-1).crashed) {
    mkdirSync(resolve(SHOTS), { recursive: true });
    await setViewport(c);
    report.crash_loads_screenshot = await shot(c, resolve(SHOTS), `crash-loads-final${BLOCK_CSS ? '-css-blocked' : ''}`);
  }
  return {
    block_css: BLOCK_CSS,
    loads,
    summary: {
      loads: loads.length,
      crashed: loads.filter(l => l.crashed).length,
      choropleth_visible: loads.filter(l => l.hazard_layer?.visibility === 'visible').length,
      map_layer_errors: loads.reduce((s, l) => s + (l.map_layer_errors?.length ?? 0), 0),
      loads_with_page_errors: loads.filter(l => l.page_errors.length).length,
      loads_with_network_failures: loads.filter(l => l.network_failures.length).length,
    },
  };
}

async function badgeProbe(c, dir) {
  await setViewport(c);
  const probe = [];
  let shotFile = null;
  for (const id of probedAnchorIds()) {
    await c.eval(CLEAR_OVERLAYS);
    await c.eval(`(window.dispatchEvent(new CustomEvent('terra:focus-anchor', { detail: { anchorId: ${JSON.stringify(id)} } })), true)`);
    await sleep(1400);
    const st = await c.eval(`({ card: !!document.querySelector('[data-anchor-card]'), registry: document.querySelector('[data-anchor-card]')?.textContent.includes('Registry Asset') ?? false,
      badges: document.querySelectorAll('[data-testid="exposure-badges"] span').length,
      badge_text: [...document.querySelectorAll('[data-testid="exposure-badges"] span')].map(s => s.textContent) })`);
    probe.push({ id, ...st });
    log('badge probe', id, JSON.stringify(st));
    if (dir && st.badges > 0 && !shotFile) {
      mkdirSync(dir, { recursive: true });
      shotFile = await shot(c, dir, `anchor-badge-stack-${id}`);
    }
  }
  return {
    probe,
    screenshot: shotFile,
    summary: { cards: probe.length, cards_opened: probe.filter(p => p.card).length, with_registry_asset: probe.filter(p => p.registry).length, with_badges: probe.filter(p => p.badges > 0).length },
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
const report = { mode: MODE, url: APP_URL, flags, center: [CLNG, CLAT], zoom: ZOOM, duration_ms: DURATION, started: new Date().toISOString() };
try { run: {
  const port = await devtoolsPort();
  report.browser = await (await fetchRetry(`http://127.0.0.1:${port}/json/version`)).json().then(v => v.Browser);

  const gpu = await pageTarget(port, 'chrome://gpu');
  await sleep(2500);
  report.chrome_gpu_lines = await gpu.eval(GPU_PAGE_LINES);
  gpu.close();

  const c = await pageTarget(port, APP_URL);
  report.page_errors = [];
  c.listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') report.page_errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.page_errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Page.bringToFront');
  if (CRASH_LOADS) {
    report.crash_loads = await crashLoads(c, CRASH_LOADS);
    log('crash-loads summary', JSON.stringify(report.crash_loads.summary));
    c.close();
    break run;
  }
  // The app can white-screen on entry (uncaught token-resolution throw in
  // HazardChoroplethLayer; see W7-F2 HANDOFF). Every failed load is recorded.
  report.load_failures = [];
  for (let load = 1; ; load++) {
    try {
      if (load > 1) { await c.send('Page.reload', { ignoreCache: true }); await sleep(1000); }
      await waitFor(c, `!!document.querySelector('button')`, 30000, 'title screen');
      await clickText(c, 'Begin');
      await waitFor(c, `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Skip to free play'))`, 10000, 'campaign select');
      const before = report.page_errors.length;
      await clickText(c, 'Skip to free play');
      await waitFor(c, `(() => { const m = ${FIND_MAP}; return !!m && m.isStyleLoaded(); })()
        || document.body.innerText.trim() === ''`, 60000, 'map load');
      if (await c.eval(`document.body.innerText.trim() === ''`)) throw new Error(`blank page after entry: ${report.page_errors.slice(before).join(' | ').slice(0, 300)}`);
      break;
    } catch (e) {
      report.load_failures.push({ load, at: new Date().toISOString(), error: String(e.message ?? e) });
      log(`load ${load} failed:`, String(e.message ?? e).slice(0, 200));
      if (load >= 5) throw e;
    }
  }
  await setViewport(c);
  report.renderer = await c.eval(RENDERER_INFO);
  log('renderer', JSON.stringify(report.renderer.map_context), 'dpr', report.renderer.devicePixelRatio);

  if (TRACE) {
    const { run, trace } = await tracedRun(c);
    report.traced_run = run;
    report.trace_summary = summarizeTrace(trace, DURATION);
    const stamp = report.started.replace(/[:.]/g, '-');
    const tfile = join(OUT, `trace-${MODE}-${stamp}.json.gz`);
    writeFileSync(tfile, gzipSync(JSON.stringify(trace)));
    report.trace_file = tfile;
    log('trace', tfile, JSON.stringify(report.trace_summary, null, 1));
  } else if (BADGE_PROBE) {
    report.badge_probe = await badgeProbe(c, SHOTS ? resolve(SHOTS) : null);
    log('badge probe summary', JSON.stringify(report.badge_probe.summary));
  } else if (SHOTS_ONLY) {
    report.screenshots = await screenshots(c, resolve(SHOTS));
  } else if (!RENDERER_ONLY) {
    report.runs = [];
    report.invalid_runs = []; // kept on the record, never silently dropped
    for (let attempt = 1; report.runs.length < RUNS && attempt <= RUNS + 3; attempt++) {
      const r = await measureRun(c, attempt);
      (r.valid ? report.runs : report.invalid_runs).push(r);
      log(`attempt ${attempt} ${r.valid ? 'VALID' : 'INVALID (map did not pan)'}: pan`, JSON.stringify(r.pan), '| idle refresh p50', r.idle_refresh.p50, '| mouse', r.mouse_events, 'moves', r.map_move_events);
    }
    if (report.runs.length < RUNS) throw new Error(`only ${report.runs.length}/${RUNS} valid runs`);
    if (SHOTS) report.screenshots = await screenshots(c, resolve(SHOTS));
  }
  c.close();
} } catch (e) {
  report.error = String(e?.stack ?? e);
  console.error(e);
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  const stamp = report.started.replace(/[:.]/g, '-');
  const kind = CRASH_LOADS ? `-crash-loads${BLOCK_CSS ? '-css-blocked' : ''}` : BADGE_PROBE ? '-badge-probe' : RENDERER_ONLY ? '-renderer' : '';
  const file = join(OUT, `frame-timing-${MODE}${kind}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  log('wrote', file);
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
