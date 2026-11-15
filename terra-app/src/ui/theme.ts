/**
 * Concrete colour values for the design tokens in `tokens.css`.
 *
 * MapLibre paint properties (and deck.gl colour accessors) cannot resolve CSS
 * custom properties, and reading them back with getComputedStyle at runtime
 * depends on the token stylesheet having applied (W7-F2-FU-1: when it had not,
 * HazardChoroplethLayer threw and the app white-screened). GL layers take their
 * colours from here instead. DOM `style` props keep using `var(--token)`.
 *
 * `tests/parity/w7f4-fu1-theme-and-boundary.test.ts` asserts every value here
 * equals the `:root` value in tokens.css, so the two cannot drift.
 */
export const COLOR_TOKENS = {
  '--bg-base': '#0d1117',
  '--bg-surface': '#161b22',
  '--bg-elevated': '#21262d',
  '--border': '#30363d',

  '--teal': '#2dd4bf',
  '--teal-dim': '#0d9488',
  '--amber': '#f59e0b',
  '--amber-dim': '#92400e',
  '--purple': '#a78bfa',
  '--purple-dim': '#6d28d9',

  '--text-primary': '#e6edf3',
  '--text-secondary': '#8b949e',
  '--text-muted': '#484f58',

  '--deficit': '#f87171',
  '--surplus': '#34d399',
  '--warning': '#fbbf24',
  '--construction': '#fb923c',

  '--sector-agriculture': '#34d399',
  '--sector-data-technology': '#60a5fa',
  '--sector-education': '#a78bfa',
  '--sector-government': '#f472b6',
  '--sector-healthcare': '#fb7185',
  '--sector-manufacturing': '#f97316',
  '--sector-mining': '#f59e0b',
  '--sector-other': '#8b949e',
  '--sector-tourism': '#22c55e',
  '--sector-utilities': '#2dd4bf',

  '--fuel-coal': '#92400e',
  '--fuel-gas': '#6d28d9',
  '--fuel-nuclear': '#2dd4bf',
  '--fuel-wind': '#34d399',
  '--fuel-solar': '#f59e0b',
  '--fuel-hydro': '#3b82f6',
  '--fuel-other': '#484f58',

  '--choro-0': '#0d1117',
  '--choro-1': '#0d3d38',
  '--choro-2': '#0d6b5e',
  '--choro-3': '#0d9488',
  '--choro-4': '#2dd4bf',
  '--choro-5': '#99f6e4',
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

/** Concrete colour for a design token, safe for MapLibre paint properties. */
export function tokenColor(token: ColorToken): string {
  return COLOR_TOKENS[token];
}
