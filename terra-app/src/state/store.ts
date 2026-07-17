import { create } from 'zustand';
import type {
  EngineState,
  ActionRecord,
  ActionLogEntry,
  EraBudget,
  GameEvent,
  AutoPause,
  ScenarioProfile,
  QuestCondition,
  ScenarioFile,
  ClimateLens,
  SaveSlotMeta,
  Trajectory,
  MaterialLedgerSummary,
  Campaign,
  CampaignFlyTarget,
  SessionMeta,
  SessionConfig,
  Annotation,
} from '../engine/types.js';
import {
  initializeState,
  applyAction as engineApplyAction,
  queueAction as engineQueueAction,
  advanceYear as engineAdvanceYear,
  injectDisturbance as engineInjectDisturbance,
  computeEesSummary,
  reduceProductionAsset as engineReduceProductionAsset,
  scheduleRetirement as engineScheduleRetirement,
  accelerateRetirement as engineAccelerateRetirement,
  delayRetirement as engineDelayRetirement,
  cancelQueued as engineCancelQueued,
} from '../engine/engine.js';
import {
  getEraBudgets,
  getEraForYear,
  getRemainingBudget,
} from '../engine/budgets.js';
import { getAllEventsForYear } from '../engine/events.js';
import {
  replayScenario,
  computeReplayDigest,
  validateImport as engineValidateImport,
} from '../engine/replay.js';
import {
  listSlots as persistenceListSlots,
  saveToSlot as persistenceSaveToSlot,
  loadFromSlot as persistenceLoadFromSlot,
  deleteSlot as persistenceDeleteSlot,
  exportToJson,
  importFromJson,
} from '../engine/persistence.js';
import type { StorageAdapter } from '../engine/persistence.js';
import type { ClimateEpoch, ClimateMetric } from '../ui/climate.js';

// ── Static data imports ─────────────────────────────────────────────────────
import baseline from '../data/county_ees_baseline.json';
import crosswalk from '../data/county_crosswalk.json';
import actionLibrary from '../data/action_library_v3.json';
import initialNetwork from '../data/initial_network.json';
import countyCards from '../data/county_cards.json';
import campaignsData from '../data/campaigns.json';
import scenarioProfilesData from '../data/scenario_profiles.json';
import fiscalBaselineData from '../data/fiscal_baseline.json';
import fiscalCoefficientsData from '../data/fiscal_coefficients.json';
import anchorFacilitiesData from '../data/mw_anchor_facilities.geojson';

// ── Types ───────────────────────────────────────────────────────────────────

export type ActiveMetric = 'E' | 'Ec' | 'S' | 'firm_capacity_margin' | 'load_growth' | 'delta_jobs' | 'delta_revenue' | 'construction_activity';
export type { ActionLogEntry } from '../engine/types.js';

/** F3: What a pin snapped to (site asset or Tier-2 anchor facility). */
export interface PinSnapTarget {
  type: 'site' | 'anchor';
  /** asset_id for site; anchor name for anchor */
  id: string;
  name: string;
  coords: [number, number];
  /** Defined for type='site' — routes through existing succession-discount path */
  siteAssetId?: string;
}

export interface PlacementMode {
  actionId: string;
  action: ActionRecord;
  eligibleGeoids: Set<string>;
  ghostGeoid: string | null;
  magnitude: number;
  // F3 pin state — all optional/null so existing code paths are unchanged
  /** Dropped pin [lon, lat]; null = not yet placed */
  pinCoords: [number, number] | null;
  /** Cursor position while dragging above zoom threshold (ghost icon follows) */
  ghostCursorCoords: [number, number] | null;
  /** True when map zoom >= PIN_ZOOM_THRESHOLD (towns legible) */
  zoomAboveThreshold: boolean;
  /** Non-null when pin magnetized to an anchor or site */
  snapTarget: PinSnapTarget | null;
}

export interface LayerVisibility {
  ecoregions: boolean;
  buses: boolean;
  branches: boolean;
  interchange: boolean;
  oracle: boolean;
  yieldBadges: boolean;
  sites: boolean;
  anchors: boolean;
  climateHazards: boolean;
}

// ── Era boundaries ─────────────────────────────────────────────────────────

const ERA_BOUNDARIES = [2035, 2045, 2055, 2075];

// ── localStorage adapter ────────────────────────────────────────────────────

const browserStorage: StorageAdapter = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* quota exceeded */ }
  },
  remove: (key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
  keys: () => {
    try { return Object.keys(localStorage); } catch { return []; }
  },
};

// ── Static data typed params ────────────────────────────────────────────────

type BaselineParam = Parameters<typeof initializeState>[0];
type CrosswalkParam = Parameters<typeof initializeState>[1];
type ActionLibraryParam = Parameters<typeof initializeState>[2];
type NetworkParam = Parameters<typeof initializeState>[3];
type CardsParam = Parameters<typeof initializeState>[4];
type FiscalBaselineParam = Parameters<typeof initializeState>[6];
type FiscalCoefficientsParam = Parameters<typeof initializeState>[7];

const typedBaseline = baseline as BaselineParam;
const typedCrosswalk = crosswalk as CrosswalkParam;
const typedActionLibrary = actionLibrary as unknown as ActionLibraryParam;
const typedNetwork = initialNetwork as NetworkParam;
const typedCards = countyCards as CardsParam;
const typedFiscalBaseline = fiscalBaselineData as FiscalBaselineParam;
const typedFiscalCoefficients = fiscalCoefficientsData as unknown as FiscalCoefficientsParam;

// ── Undo strategy: memoize snapshots at year boundaries ──────────────────────

function replayLog(log: ActionLogEntry[], snapshots: Map<number, EngineState>): EngineState {
  if (log.length === 0) {
    return initializeState(typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, 2025, typedFiscalBaseline, typedFiscalCoefficients);
  }

  const firstYear = log[0]?.year ?? 2025;
  let startState: EngineState | null = null;

  for (const [snapYear, snapState] of snapshots) {
    if (snapYear <= firstYear) {
      if (!startState || snapYear > startState.year) {
        startState = snapState;
      }
    }
  }

  if (!startState) {
    startState = initializeState(typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, 2025, typedFiscalBaseline, typedFiscalCoefficients);
  }

  let state = startState;
  let startIdx = log.findIndex(e => e.year >= state.year);
  if (startIdx === -1) startIdx = log.length;

  for (let i = startIdx; i < log.length; i++) {
    const entry = log[i];
    while (state.year < entry.year) {
      state = engineAdvanceYear(state);
    }
    if (entry.type === 'apply') {
      [state] = engineApplyAction(state, entry.actionId, entry.geoid, entry.magnitude);
    } else {
      state = engineQueueAction(state, entry.actionId, entry.geoid, entry.magnitude, entry.decisionYear ?? state.year, entry.overrideOp);
    }
  }

  return state;
}

// ── Helper: replay a ScenarioFile with the static data ─────────────────────

function replayFile(file: ScenarioFile): EngineState {
  return replayScenario(file, typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, typedFiscalBaseline, typedFiscalCoefficients);
}

// ── Helper: compute trajectory for comparison mode ─────────────────────────

function computeTrajectory(file: ScenarioFile): Trajectory {
  const traj: Trajectory = {
    years: [],
    E: [],
    Ec: [],
    S: [],
    material_ledger_by_year: [],
    quest_conditions_by_year: [],
    events_by_year: [],
  };

  let state = initializeState(typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, 2025, typedFiscalBaseline, typedFiscalCoefficients);

  // Capture initial state
  const initSummary = computeEesSummary(state);
  traj.years.push(state.year);
  traj.E.push(initSummary.study_area.E);
  traj.Ec.push(initSummary.study_area.Ec);
  traj.S.push(initSummary.study_area.S);
  traj.events_by_year.push([]);
  traj.material_ledger_by_year.push({} as MaterialLedgerSummary);
  traj.quest_conditions_by_year.push([]);

  for (let year = file.start_year; year < file.year_reached; year++) {
    const yearEntries = file.actionLog.filter(e => e.year === year);
    for (const entry of yearEntries) {
      if (entry.type === 'apply') {
        [state] = engineApplyAction(state, entry.actionId, entry.geoid, entry.magnitude);
      } else {
        state = engineQueueAction(
          state, entry.actionId, entry.geoid, entry.magnitude,
          entry.decisionYear ?? year, entry.overrideOp,
        );
      }
    }
    state = engineAdvanceYear(state);

    const events = getAllEventsForYear(state.year, state, file.gameSeed);
    for (const evt of events) {
      if (evt.engine_effect && evt.engine_effect.fn) {
        const { fn, args } = evt.engine_effect;
        if (fn === 'injectDisturbance') {
          [state] = engineInjectDisturbance(state, args.disturbance_type as string, args.severity as number, args.geoids as string[] | undefined);
        } else if (fn === 'applyAction') {
          [state] = engineApplyAction(state, args.action_id as string, args.geoid as string, args.magnitude as number);
        }
      }
    }

    const summary = computeEesSummary(state);
    traj.years.push(state.year);
    traj.E.push(summary.study_area.E);
    traj.Ec.push(summary.study_area.Ec);
    traj.S.push(summary.study_area.S);
    traj.events_by_year.push(events);
    traj.material_ledger_by_year.push({} as MaterialLedgerSummary);
    traj.quest_conditions_by_year.push([]);
  }

  return traj;
}

// ── Quest condition evaluator ───────────────────────────────────────────────

function evaluateQuestConditions(
  scenario: ScenarioProfile | null,
  engineState: EngineState,
): QuestCondition[] {
  if (!scenario || !scenario.quest_conditions) return [];
  const summary = computeEesSummary(engineState);

  return scenario.quest_conditions.map(cond => {
    let currentValue = 0;
    let targetValue = cond.target_value;

    switch (cond.condition_id) {
      case 'coal_capacity_pct_remaining': {
        let totalCoal = 0;
        for (const bus of Object.values(engineState.buses)) {
          totalCoal += (bus.fuel_mix.coal ?? 0) + (bus.fuel_mix.SUB ?? 0) +
                       (bus.fuel_mix.BIT ?? 0) + (bus.fuel_mix.LIG ?? 0);
        }
        const baselineCoal = totalCoal > 0 ? totalCoal : 1;
        currentValue = baselineCoal > 0 ? totalCoal / baselineCoal : 1.0;
        break;
      }
      case 'E_study_area':
        currentValue = summary.study_area.E;
        break;
      case 'jobs_created':
        currentValue = engineState.action_history.length * 500;
        break;
      case 'S_wyoming_counties': {
        const wyCounties = Object.entries(engineState.county_ees)
          .filter(([g]) => g.startsWith('56'));
        if (wyCounties.length > 0) {
          currentValue = wyCounties.reduce((s, [, ees]) => s + ees.S, 0) / wyCounties.length;
        }
        break;
      }
      case 'nuclear_dc_coupling_active':
        currentValue = engineState.active_couplings.length > 0 ? 1 : 0;
        targetValue = 1;
        break;
      case 'deficit_mw_56021': {
        const ees = engineState.county_ees['56021'];
        currentValue = ees ? ees.deficit_mw : 0;
        break;
      }
      case 'S_56021': {
        const ees = engineState.county_ees['56021'];
        currentValue = ees ? ees.S : 0;
        break;
      }
      case 'Ec_56021': {
        const ees = engineState.county_ees['56021'];
        currentValue = ees ? ees.Ec : 0;
        break;
      }
      case 'build_complete_before_2035': {
        const smrBuilds = engineState.build_queue.filter(
          b => b.geoid === '56021' && (b.action_id === 'smr_advanced' || b.action_id === 'coal_to_smr'),
        );
        const allCommissioned = smrBuilds.length > 0 && smrBuilds.every(b => b.commissioned);
        currentValue = allCommissioned ? 1 : 0;
        targetValue = 1;
        break;
      }
      default:
        currentValue = 0;
    }

    const distance = currentValue - targetValue;
    const isDeficitCondition = cond.condition_id.startsWith('deficit_');
    const met = isDeficitCondition ? currentValue <= targetValue : currentValue >= targetValue;

    return {
      ...cond,
      current_value: Math.round(currentValue * 10000) / 10000,
      target_value: targetValue,
      distance: Math.round(distance * 10000) / 10000,
      met,
    };
  });
}

// ── Auto-pause detection ────────────────────────────────────────────────────

const ERA_NAMES: Record<number, string> = {
  2035: 'Transition Era (2035-2045)',
  2045: 'Buildout Era (2045-2055)',
  2055: 'Steady State Era (2055-2075)',
  2075: 'Post-Era',
};

function detectAutoPause(
  prevState: EngineState,
  newState: EngineState,
  events: GameEvent[],
  prevConditions: QuestCondition[],
  newConditions: QuestCondition[],
): AutoPause | null {
  const newYear = newState.year;

  if (ERA_BOUNDARIES.includes(newYear)) {
    return { reason: 'era_transition', detail: `Welcome to the ${ERA_NAMES[newYear] ?? `year ${newYear}`}` };
  }

  const newlyCommissioned = newState.build_queue.filter(b => {
    const prev = prevState.build_queue.find(
      p => p.action_id === b.action_id && p.geoid === b.geoid && p.decision_year === b.decision_year,
    );
    return b.commissioned && (!prev || !prev.commissioned);
  });
  if (newlyCommissioned.length > 0) {
    const names = newlyCommissioned.map(b => {
      const action = newState.action_library.actions[b.action_id];
      return action?.action_name ?? b.action_id;
    });
    return { reason: 'build_complete', detail: `${names.join(', ')} now operational` };
  }

  const newCouplings = newState.active_couplings.filter(c =>
    !prevState.active_couplings.some(p => p.coupling_id === c.coupling_id)
  );
  if (newCouplings.length > 0) {
    return { reason: 'coupling_activated', detail: `Nuclear-DC coupling activated: ${newCouplings[0].coupling_id}` };
  }

  for (const [busId, bs] of Object.entries(newState.bus_state)) {
    if (bs.deficit_mw > 200) {
      const prevBs = prevState.bus_state[busId];
      if (!prevBs || prevBs.deficit_mw <= 200) {
        return { reason: 'deficit_threshold', detail: `Bus ${busId} supply gap exceeds 200 MW (${bs.deficit_mw.toFixed(0)} MW)` };
      }
    }
  }

  const engineEvents = events.filter(e => e.engine_effect && e.engine_effect.fn !== null);
  if (engineEvents.length > 0) {
    return { reason: 'event_fired', event: engineEvents[0], detail: engineEvents[0].title };
  }

  for (let i = 0; i < newConditions.length; i++) {
    if (newConditions[i].met && prevConditions[i] && !prevConditions[i].met) {
      return { reason: 'quest_condition_met', detail: `Condition met: ${newConditions[i].label}` };
    }
  }

  return null;
}

// ── Store interface ─────────────────────────────────────────────────────────

interface TerraStore {
  // Engine state
  engineState: EngineState;
  actionLog: ActionLogEntry[];
  yearSnapshots: Map<number, EngineState>;

  // Game loop state
  eraBudgets: EraBudget[];
  remainingBudget: EraBudget;
  eventHistory: GameEvent[];
  pendingAutoPause: AutoPause | null;
  activeScenario: ScenarioProfile | null;
  questConditions: QuestCondition[];
  gameSeed: number;

  // UI state
  selectedGeoid: string | null;
  hoveredGeoid: string | null;
  activeMetric: ActiveMetric;
  placementMode: PlacementMode | null;
  layers: LayerVisibility;
  climateLens: ClimateLens;
  climateEpoch: ClimateEpoch;
  climateMetric: ClimateMetric;

  // Undo / Redo
  redoStack: ActionLogEntry[];
  canUndo: boolean;
  canRedo: boolean;

  // Persistence
  saveSlots: SaveSlotMeta[];

  // Replay Mode
  replayMode: boolean;
  replayFile: ScenarioFile | null;
  replayCursor: number;
  replayState: EngineState | null;
  replaySnapshots: Map<number, EngineState>;

  // Comparison Mode
  comparisonMode: boolean;
  comparisonFiles: [ScenarioFile | null, ScenarioFile | null];
  comparisonTrajectories: [Trajectory | null, Trajectory | null];

  // Core game actions
  applyAction: (actionId: string, geoid: string, magnitude: number) => void;
  queueAction: (actionId: string, geoid: string, magnitude: number, decisionYear: number, overrideOp?: number, siteCoords?: [number, number]) => void;
  advanceYear: () => void;
  reduceProductionAsset: (geoid: string, commodity: string, deltaVolume: number) => void;

  // Lifecycle controls (v3.0 retirement transitions + v4.1 cancel)
  scheduleRetirement: (assetId: string, year: number) => void;
  accelerateRetirement: (assetId: string, newYear: number) => void;
  delayRetirement: (assetId: string, newYear: number) => { delay_cost_hook: number; confidence: string };
  cancelQueued: (assetId: string) => { sunk_cost_fraction: number; sunk_cost_usd: number; confidence: string };

  // Undo / Redo actions
  undoAction: () => void;
  redoAction: () => void;

  // UI actions
  setSelectedGeoid: (geoid: string | null) => void;
  setHoveredGeoid: (geoid: string | null) => void;
  setActiveMetric: (metric: ActiveMetric) => void;
  setClimateLens: (lens: ClimateLens) => void;
  setClimateEpoch: (epoch: ClimateEpoch) => void;
  setClimateMetric: (metric: ClimateMetric) => void;
  enterPlacementMode: (actionId: string) => void;
  exitPlacementMode: () => void;
  confirmPlacement: (geoid: string, magnitude: number) => void;
  // F3 pin actions
  setPlacementPin: (coords: [number, number] | null, snapTarget: PinSnapTarget | null) => void;
  setGhostCursorCoords: (coords: [number, number] | null) => void;
  setPlacementZoomAbove: (above: boolean) => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  setActiveScenario: (profile: ScenarioProfile) => void;
  dismissAutoPause: () => void;
  injectManualDisturbance: (type: string, severity: number, geoids: string[]) => void;

  // Persistence actions
  saveToSlot: (slot_id: string, name?: string) => void;
  loadFromSlot: (slot_id: string) => Promise<void>;
  deleteSlot: (slot_id: string) => void;
  exportScenario: () => void;
  importScenario: (json: string) => Promise<{ success: boolean; digest_match: boolean; error?: string }>;
  refreshSlots: () => void;

  // Replay Mode actions
  enterReplayMode: (file: ScenarioFile) => void;
  exitReplayMode: () => void;
  scrubReplayTo: (year: number) => void;
  stepReplayForward: () => void;
  stepReplayBackward: () => void;

  // Comparison Mode actions
  loadComparisonFile: (slot: 0 | 1, file: ScenarioFile) => void;
  enterComparisonMode: () => void;
  exitComparisonMode: () => void;

  // Campaign state
  activeCampaign: Campaign | null;
  campaignAct: number;
  campaignHintIndex: number;
  narrationStep: number;
  campaignComplete: boolean;
  freePlayUnlocked: boolean;
  campaignOutcome: 'victory' | 'defeat' | null;
  campaignFlyTarget: CampaignFlyTarget | null;

  // Campaign actions
  startCampaign: (campaignId: string) => void;
  advanceCampaignAct: () => void;
  advanceCampaignHint: () => void;
  advanceNarrationStep: () => void;
  checkCampaign2WinConditions: () => void;
  setCampaignFlyTarget: (target: CampaignFlyTarget | null) => void;
  exitCampaign: () => void;

  // Resource HUD state
  poolHighlightGeoids: string[] | null;
  hudOpenChip: string | null;
  setPoolHighlightGeoids: (geoids: string[] | null) => void;
  setHudOpenChip: (chip: string | null) => void;

  // Chart system state
  openChartIndicator: string | null;
  setOpenChartIndicator: (id: string | null) => void;

  // Decomposition view
  decompositionCapital: 'E' | 'Ec' | 'S' | null;
  setDecompositionCapital: (c: 'E' | 'Ec' | 'S' | null) => void;

  // Era report
  showEraReport: boolean;
  setShowEraReport: (show: boolean) => void;

  // Session mode state
  sessionMeta: SessionMeta | null;
  sessionConfig: SessionConfig | null;
  annotations: Annotation[];
  showReflectionCard: boolean;

  // Session mode actions
  enterSessionMode: (sessionCode: string, participantLabel: string, config?: SessionConfig) => void;
  addAnnotation: (a: Omit<Annotation, 'id' | 'timestamp'>) => void;
  setShowReflectionCard: (show: boolean) => void;

  // Debrief: replay a session file with the store's static baseline data
  replaySessionFile: (file: ScenarioFile) => EngineState;
}

// ── Initial state ────────────────────────────────────────────────────────────

const typedAnchorFacilities = anchorFacilitiesData as Parameters<typeof initializeState>[13];

const initialEngineState = initializeState(
  typedBaseline,
  typedCrosswalk,
  typedActionLibrary,
  typedNetwork,
  typedCards,
  2025,
  typedFiscalBaseline,
  typedFiscalCoefficients,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  typedAnchorFacilities,
);

const initialEraBudgets = getEraBudgets();
const initialEra = getEraForYear(2025);
const initialRemainingBudget = getRemainingBudget(
  initialEra,
  [],
  (actionLibrary as unknown as { actions: Record<string, ActionRecord> }).actions,
);

// ── Store ────────────────────────────────────────────────────────────────────

export const useTerraStore = create<TerraStore>((set, get) => ({
  engineState: initialEngineState,
  actionLog: [],
  yearSnapshots: new Map([[2025, initialEngineState]]),

  // Game loop state
  eraBudgets: initialEraBudgets,
  remainingBudget: initialRemainingBudget,
  eventHistory: [],
  pendingAutoPause: null,
  activeScenario: null,
  questConditions: [],
  gameSeed: Math.floor(Math.random() * 2147483647),

  // UI state
  selectedGeoid: null,
  hoveredGeoid: null,
  activeMetric: 'E',
  placementMode: null,
  layers: {
    ecoregions: false,
    buses: false,
    branches: false,
    interchange: false,
    oracle: false,
    yieldBadges: false,
    sites: true,
    anchors: true,
    climateHazards: false,
  },
  climateLens: 'historical',
  climateEpoch: '2050',
  climateMetric: 'high_fire_danger_days',

  // Undo / Redo
  redoStack: [],
  canUndo: false,
  canRedo: false,

  // Persistence
  saveSlots: persistenceListSlots(browserStorage),

  // Replay Mode
  replayMode: false,
  replayFile: null,
  replayCursor: 2025,
  replayState: null,
  replaySnapshots: new Map(),

  // Comparison Mode
  comparisonMode: false,
  comparisonFiles: [null, null],
  comparisonTrajectories: [null, null],

  // Campaign state
  activeCampaign: null,
  campaignAct: 1,
  campaignHintIndex: 0,
  narrationStep: 0,
  campaignComplete: false,
  freePlayUnlocked: (() => {
    try { return localStorage.getItem('terra_free_play_unlocked') === 'true'; } catch { return false; }
  })(),
  campaignOutcome: null,
  campaignFlyTarget: null,

  // Resource HUD state
  poolHighlightGeoids: null,
  hudOpenChip: null,
  setPoolHighlightGeoids: (geoids) => set({ poolHighlightGeoids: geoids }),
  setHudOpenChip: (chip) => set({ hudOpenChip: chip }),

  // Chart system state
  openChartIndicator: null,
  setOpenChartIndicator: (id) => set({ openChartIndicator: id }),

  // Decomposition view
  decompositionCapital: null,
  setDecompositionCapital: (c) => set({ decompositionCapital: c }),

  // Era report
  showEraReport: false,
  setShowEraReport: (show) => set({ showEraReport: show }),

  // Session mode state
  sessionMeta: null,
  sessionConfig: null,
  annotations: [],
  showReflectionCard: false,

  // ── Core game actions ─────────────────────────────────────────────────────

  applyAction: (actionId, geoid, magnitude) => {
    const { engineState, actionLog, yearSnapshots } = get();
    const [newState] = engineApplyAction(engineState, actionId, geoid, magnitude);
    const entry: ActionLogEntry = {
      type: 'apply', actionId, geoid, magnitude,
      year: engineState.year, timestamp: Date.now(),
    };
    const newLog = [...actionLog, entry];
    const era = getEraForYear(engineState.year);
    const remaining = getRemainingBudget(era, newLog, engineState.action_library.actions);
    set({
      engineState: newState, actionLog: newLog, yearSnapshots,
      remainingBudget: remaining, redoStack: [], canUndo: true, canRedo: false,
    });
  },

  reduceProductionAsset: (geoid, commodity, deltaVolume) => {
    const { engineState } = get();
    const [newState] = engineReduceProductionAsset(engineState, geoid, commodity, deltaVolume);
    set({ engineState: newState });
  },

  scheduleRetirement: (assetId, year) => {
    const { engineState } = get();
    const newState = engineScheduleRetirement(engineState, assetId, year);
    set({ engineState: newState });
  },

  accelerateRetirement: (assetId, newYear) => {
    const { engineState } = get();
    const newState = engineAccelerateRetirement(engineState, assetId, newYear);
    set({ engineState: newState });
  },

  delayRetirement: (assetId, newYear) => {
    const { engineState } = get();
    const [newState, result] = engineDelayRetirement(engineState, assetId, newYear);
    set({ engineState: newState });
    return result;
  },

  cancelQueued: (assetId) => {
    const { engineState } = get();
    const [newState, result] = engineCancelQueued(engineState, assetId);
    set({ engineState: newState });
    return result;
  },

  queueAction: (actionId, geoid, magnitude, decisionYear, overrideOp, siteCoords) => {
    const { engineState, actionLog, yearSnapshots } = get();
    const newState = engineQueueAction(engineState, actionId, geoid, magnitude, decisionYear, overrideOp);
    const entry: ActionLogEntry = {
      type: 'queue', actionId, geoid, magnitude,
      year: engineState.year, decisionYear, overrideOp, timestamp: Date.now(),
      // F3: site_coords is UI-only — excluded from digest, invisible to engine
      ...(siteCoords ? { site_coords: siteCoords } : {}),
    };
    const newLog = [...actionLog, entry];
    const era = getEraForYear(engineState.year);
    const remaining = getRemainingBudget(era, newLog, engineState.action_library.actions);
    set({
      engineState: newState, actionLog: newLog, yearSnapshots,
      remainingBudget: remaining, redoStack: [], canUndo: true, canRedo: false,
    });
  },

  advanceYear: () => {
    const {
      engineState, actionLog, yearSnapshots,
      gameSeed, activeScenario, questConditions, eventHistory,
    } = get();
    const prevState = engineState;
    const prevConditions = questConditions;

    let newState = engineAdvanceYear(engineState);

    const events = getAllEventsForYear(newState.year, newState, gameSeed);

    for (const evt of events) {
      if (evt.engine_effect && evt.engine_effect.fn) {
        const { fn, args } = evt.engine_effect;
        if (fn === 'injectDisturbance') {
          const [s] = engineInjectDisturbance(newState, args.disturbance_type as string, args.severity as number, args.geoids as string[] | undefined);
          newState = s;
        } else if (fn === 'applyAction') {
          const [s] = engineApplyAction(newState, args.action_id as string, args.geoid as string, args.magnitude as number);
          newState = s;
        }
      }
    }

    const newSnapshots = new Map(yearSnapshots);
    newSnapshots.set(newState.year, newState);

    const era = getEraForYear(newState.year);
    const remaining = getRemainingBudget(era, actionLog, newState.action_library.actions);
    const newConditions = evaluateQuestConditions(activeScenario, newState);
    const autoPause = detectAutoPause(prevState, newState, events, prevConditions, newConditions);

    // Session max_year: auto-show reflection card when limit reached
    const { sessionConfig } = get();
    const hitMaxYear = sessionConfig?.max_year != null && newState.year >= sessionConfig.max_year;

    set({
      engineState: newState, yearSnapshots: newSnapshots, actionLog,
      remainingBudget: remaining,
      eventHistory: [...eventHistory, ...events],
      questConditions: newConditions,
      pendingAutoPause: autoPause,
      ...(hitMaxYear ? { showReflectionCard: true } : {}),
    });

    // Campaign 2 win/loss check
    if (get().activeCampaign?.campaign_id === 'wyoming_2032_nuclear_dc') {
      get().checkCampaign2WinConditions();
    }
  },

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  undoAction: () => {
    const { actionLog, yearSnapshots, engineState, redoStack } = get();
    if (actionLog.length === 0) return;
    const removedEntry = actionLog[actionLog.length - 1];
    const newLog = actionLog.slice(0, -1);
    const newState = replayLog(newLog, yearSnapshots);
    const era = getEraForYear(newState.year);
    const remaining = getRemainingBudget(era, newLog, engineState.action_library.actions);
    const newRedoStack = [...redoStack, removedEntry];
    set({
      engineState: newState, actionLog: newLog, remainingBudget: remaining,
      redoStack: newRedoStack,
      canUndo: newLog.length > 0,
      canRedo: true,
    });
  },

  redoAction: () => {
    const { engineState, actionLog, yearSnapshots, redoStack } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    let newState: EngineState;
    let newLog: ActionLogEntry[];

    if (entry.type === 'apply') {
      [newState] = engineApplyAction(engineState, entry.actionId, entry.geoid, entry.magnitude);
      newLog = [...actionLog, { ...entry, timestamp: Date.now() }];
    } else {
      newState = engineQueueAction(engineState, entry.actionId, entry.geoid, entry.magnitude, entry.decisionYear ?? engineState.year, entry.overrideOp);
      newLog = [...actionLog, { ...entry, timestamp: Date.now() }];
    }

    const era = getEraForYear(newState.year);
    const remaining = getRemainingBudget(era, newLog, newState.action_library.actions);

    set({
      engineState: newState, actionLog: newLog, yearSnapshots,
      remainingBudget: remaining,
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
    });
  },

  // ── UI actions ────────────────────────────────────────────────────────────

  setSelectedGeoid: (geoid) => set({ selectedGeoid: geoid }),
  setHoveredGeoid: (geoid) => set({ hoveredGeoid: geoid }),
  setActiveMetric: (metric) => set({ activeMetric: metric }),
  setClimateLens: (climateLens) => set({ climateLens }),
  setClimateEpoch: (climateEpoch) => set({ climateEpoch }),
  setClimateMetric: (climateMetric) => set({ climateMetric }),

  enterPlacementMode: (actionId) => {
    const { engineState } = get();
    const action = engineState.action_library.actions[actionId];
    if (!action) return;
    const eligibleGeoids = new Set<string>(action.applicable_counties ?? []);
    set({
      placementMode: {
        actionId, action, eligibleGeoids, ghostGeoid: null,
        magnitude: action.unit_scale ?? 100,
        // F3 pin state — all null/false on entry
        pinCoords: null, ghostCursorCoords: null,
        zoomAboveThreshold: false, snapTarget: null,
      },
    });
  },

  exitPlacementMode: () => set({ placementMode: null }),

  confirmPlacement: (geoid, magnitude) => {
    const { placementMode, engineState } = get();
    if (!placementMode) return;
    // F3: thread pin coords through to queueAction (null → omitted from log entry)
    const siteCoords = placementMode.pinCoords ?? undefined;
    get().queueAction(placementMode.actionId, geoid, magnitude, engineState.year, undefined, siteCoords);
    set({ placementMode: null });
    const { activeCampaign, campaignAct } = get();
    if (activeCampaign && campaignAct === 3) {
      get().advanceCampaignHint();
    }
  },

  // F3 pin store actions
  setPlacementPin: (coords, snapTarget) => {
    const { placementMode } = get();
    if (!placementMode) return;
    set({ placementMode: { ...placementMode, pinCoords: coords, snapTarget } });
  },

  setGhostCursorCoords: (coords) => {
    const { placementMode } = get();
    if (!placementMode) return;
    set({ placementMode: { ...placementMode, ghostCursorCoords: coords } });
  },

  setPlacementZoomAbove: (above) => {
    const { placementMode } = get();
    if (!placementMode) return;
    set({ placementMode: { ...placementMode, zoomAboveThreshold: above } });
  },

  toggleLayer: (layer) => {
    const { layers } = get();
    set({ layers: { ...layers, [layer]: !layers[layer] } });
  },

  setActiveScenario: (profile) => {
    const { engineState } = get();
    const conditions = evaluateQuestConditions(profile, engineState);
    set({ activeScenario: profile, questConditions: conditions });
  },

  dismissAutoPause: () => set({ pendingAutoPause: null }),

  injectManualDisturbance: (type, severity, geoids) => {
    const { engineState, eventHistory } = get();
    const [newState] = engineInjectDisturbance(engineState, type, severity, geoids);
    const evt: GameEvent = {
      event_id: `manual_${type}_${Date.now()}`,
      type: 'stochastic',
      category: type as GameEvent['category'],
      severity,
      affected_geoids: geoids,
      title: `Manual: ${type.replace(/_/g, ' ')}`,
      description: `Manually injected ${type} disturbance (severity ${severity}) on ${geoids.length} counties`,
      year: engineState.year,
      engine_effect: { fn: 'injectDisturbance', args: { disturbance_type: type, severity, geoids } },
    };
    set({ engineState: newState, eventHistory: [...eventHistory, evt] });
  },

  // ── Persistence actions ───────────────────────────────────────────────────

  refreshSlots: () => {
    set({ saveSlots: persistenceListSlots(browserStorage) });
  },

  saveToSlot: (slot_id, name) => {
    const { engineState, actionLog, eventHistory, activeScenario, gameSeed, sessionMeta, annotations, climateLens } = get();
    const digest = computeReplayDigest(engineState, climateLens);
    const file: ScenarioFile = {
      schema_version: '3.1',
      terra_version: '1.0',
      exported_at: new Date().toISOString(),
      name: name ?? `${activeScenario?.name ?? 'Free Play'} — Year ${engineState.year}`,
      gameSeed,
      start_year: 2025,
      activeScenario: activeScenario ?? null,
      actionLog,
      eventHistory,
      year_reached: engineState.year,
      replay_digest: digest,
      climate_lens: climateLens,
      ...(sessionMeta ? { session_meta: sessionMeta, annotations } : {}),
    };
    persistenceSaveToSlot(browserStorage, slot_id, file);
    get().refreshSlots();
  },

  loadFromSlot: async (slot_id) => {
    const file = persistenceLoadFromSlot(browserStorage, slot_id);
    if (!file) return;

    const finalState = replayFile(file);
    const computedDigest = computeReplayDigest(finalState, file.climate_lens);
    const digestMatch = computedDigest === file.replay_digest;

    if (!digestMatch) {
      console.warn(`Digest mismatch on load: expected ${file.replay_digest}, got ${computedDigest}`);
    }

    const newSnapshots = new Map<number, EngineState>();
    newSnapshots.set(2025, initialEngineState);
    newSnapshots.set(finalState.year, finalState);

    const era = getEraForYear(finalState.year);
    const remaining = getRemainingBudget(era, file.actionLog, finalState.action_library.actions);
    const conditions = evaluateQuestConditions(file.activeScenario, finalState);

    set({
      engineState: finalState,
      actionLog: file.actionLog,
      yearSnapshots: newSnapshots,
      eventHistory: file.eventHistory,
      activeScenario: file.activeScenario,
      gameSeed: file.gameSeed,
      remainingBudget: remaining,
      questConditions: conditions,
      redoStack: [],
      canUndo: file.actionLog.length > 0,
      canRedo: false,
      pendingAutoPause: null,
      climateLens: file.climate_lens ?? 'historical',
    });
  },

  deleteSlot: (slot_id) => {
    persistenceDeleteSlot(browserStorage, slot_id);
    get().refreshSlots();
  },

  exportScenario: () => {
    const { engineState, actionLog, eventHistory, activeScenario, gameSeed, sessionMeta, annotations, climateLens } = get();
    const digest = computeReplayDigest(engineState, climateLens);
    const file: ScenarioFile = {
      schema_version: '3.1',
      terra_version: '1.0',
      exported_at: new Date().toISOString(),
      name: `${activeScenario?.name ?? 'Free Play'} — Year ${engineState.year}`,
      gameSeed,
      start_year: 2025,
      activeScenario: activeScenario ?? null,
      actionLog,
      eventHistory,
      year_reached: engineState.year,
      replay_digest: digest,
      climate_lens: climateLens,
      ...(sessionMeta ? { session_meta: sessionMeta, annotations } : {}),
    };
    const json = exportToJson(file);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const scenName = (activeScenario?.name ?? 'free_play').replace(/\s+/g, '_').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `terra_${scenName}_${engineState.year}_${dateStr}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  importScenario: async (json) => {
    const file = importFromJson(json);
    if (!file) {
      return { success: false, digest_match: false, error: 'Invalid JSON or incompatible schema version' };
    }
    try {
      const result = engineValidateImport(file, typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards);
      return { success: result.valid, digest_match: !result.mismatch, error: result.error };
    } catch (err) {
      return { success: false, digest_match: false, error: String(err) };
    }
  },

  // ── Replay Mode actions ───────────────────────────────────────────────────

  enterReplayMode: (file) => {
    // Pre-compute all year states for instant scrubbing
    const snapshots = new Map<number, EngineState>();
    let state = initializeState(typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, 2025, typedFiscalBaseline, typedFiscalCoefficients);
    snapshots.set(state.year, state);

    for (let year = file.start_year; year < file.year_reached; year++) {
      const yearEntries = file.actionLog.filter(e => e.year === year);
      for (const entry of yearEntries) {
        if (entry.type === 'apply') {
          [state] = engineApplyAction(state, entry.actionId, entry.geoid, entry.magnitude);
        } else {
          state = engineQueueAction(state, entry.actionId, entry.geoid, entry.magnitude, entry.decisionYear ?? year, entry.overrideOp);
        }
      }
      state = engineAdvanceYear(state);

      const events = getAllEventsForYear(state.year, state, file.gameSeed);
      for (const evt of events) {
        if (evt.engine_effect && evt.engine_effect.fn) {
          const { fn, args } = evt.engine_effect;
          if (fn === 'injectDisturbance') {
            [state] = engineInjectDisturbance(state, args.disturbance_type as string, args.severity as number, args.geoids as string[] | undefined);
          } else if (fn === 'applyAction') {
            [state] = engineApplyAction(state, args.action_id as string, args.geoid as string, args.magnitude as number);
          }
        }
      }
      snapshots.set(state.year, state);
    }

    const startState = snapshots.get(file.start_year) ?? state;
    set({
      replayMode: true,
      replayFile: file,
      replayCursor: file.start_year,
      replayState: startState,
      replaySnapshots: snapshots,
    });
  },

  exitReplayMode: () => {
    set({ replayMode: false, replayFile: null, replayState: null, replaySnapshots: new Map() });
  },

  scrubReplayTo: (year) => {
    const { replaySnapshots, replayFile } = get();
    if (!replayFile) return;
    const clampedYear = Math.max(replayFile.start_year, Math.min(replayFile.year_reached, year));
    const state = replaySnapshots.get(clampedYear) ?? null;
    set({ replayCursor: clampedYear, replayState: state });
  },

  stepReplayForward: () => {
    const { replayCursor, replayFile } = get();
    if (!replayFile) return;
    if (replayCursor < replayFile.year_reached) {
      get().scrubReplayTo(replayCursor + 1);
    }
  },

  stepReplayBackward: () => {
    const { replayCursor, replayFile } = get();
    if (!replayFile) return;
    if (replayCursor > replayFile.start_year) {
      get().scrubReplayTo(replayCursor - 1);
    }
  },

  // ── Comparison Mode actions ───────────────────────────────────────────────

  loadComparisonFile: (slot, file) => {
    const traj = computeTrajectory(file);
    const newFiles = [...get().comparisonFiles] as [ScenarioFile | null, ScenarioFile | null];
    const newTrajs = [...get().comparisonTrajectories] as [Trajectory | null, Trajectory | null];
    newFiles[slot] = file;
    newTrajs[slot] = traj;
    set({ comparisonFiles: newFiles, comparisonTrajectories: newTrajs });
  },

  enterComparisonMode: () => set({ comparisonMode: true }),
  exitComparisonMode: () => set({ comparisonMode: false }),

  // ── Campaign actions ──────────────────────────────────────────────────────

  startCampaign: (campaignId: string) => {
    const campaigns = (campaignsData as { campaigns: Campaign[] }).campaigns;
    const campaign = campaigns.find(c => c.campaign_id === campaignId);
    if (!campaign) return;

    // Fresh engine state
    let state = initializeState(typedBaseline, typedCrosswalk, typedActionLibrary, typedNetwork, typedCards, 2025, typedFiscalBaseline, typedFiscalCoefficients);
    const log: ActionLogEntry[] = [];

    // Queue pre-placed assets
    for (const asset of campaign.pre_placed_assets ?? []) {
      state = engineQueueAction(
        state, asset.action_id, asset.geoid, asset.magnitude,
        asset.decision_year, asset.operational_year_override,
      );
      log.push({
        type: 'queue', actionId: asset.action_id, geoid: asset.geoid,
        magnitude: asset.magnitude, year: asset.decision_year,
        decisionYear: asset.decision_year,
        overrideOp: asset.operational_year_override,
        timestamp: Date.now(),
      });
    }

    // Find scenario profile
    const profiles = (scenarioProfilesData as { profiles: ScenarioProfile[] }).profiles;
    const profile = profiles.find(p => p.profile_id === campaign.scenario_profile_id) ?? null;
    const questConditions = evaluateQuestConditions(profile, state);
    const era = getEraForYear(state.year);
    const remaining = getRemainingBudget(era, log, state.action_library.actions);

    set({
      engineState: state,
      actionLog: log,
      yearSnapshots: new Map([[2025, state]]),
      eventHistory: [],
      activeScenario: profile,
      questConditions,
      gameSeed: 42,
      remainingBudget: remaining,
      redoStack: [],
      canUndo: false,
      canRedo: false,
      pendingAutoPause: null,
      activeCampaign: campaign,
      campaignAct: 1,
      campaignHintIndex: 0,
      narrationStep: 0,
      campaignComplete: false,
      campaignOutcome: null,
    });
  },

  advanceCampaignAct: () => {
    const { campaignAct, activeCampaign } = get();
    if (!activeCampaign) return;
    const acts = activeCampaign.acts ?? {};
    const actCount = Object.keys(acts).length;
    if (campaignAct < actCount) {
      set({ campaignAct: campaignAct + 1, campaignHintIndex: 0, narrationStep: 0 });
    } else {
      // Campaign complete
      const { freePlayUnlocked } = get();
      const newUnlocked = freePlayUnlocked || activeCampaign.unlocks_free_play;
      if (newUnlocked) {
        try { localStorage.setItem('terra_free_play_unlocked', 'true'); } catch { /* quota */ }
      }
      set({ campaignComplete: true, freePlayUnlocked: newUnlocked });
    }
  },

  advanceCampaignHint: () => {
    const { campaignHintIndex, activeCampaign } = get();
    if (!activeCampaign) return;
    const act3 = activeCampaign.acts?.['act_3'];
    const hints = act3?.hints ?? [];
    const nextIdx = campaignHintIndex + 1;
    if (nextIdx >= hints.length) {
      get().advanceCampaignAct();
    } else {
      set({ campaignHintIndex: nextIdx });
    }
  },

  advanceNarrationStep: () => {
    const { narrationStep, activeCampaign } = get();
    if (!activeCampaign) return;
    const act1 = activeCampaign.acts?.['act_1'];
    const steps = act1?.narration_steps ?? [];
    const nextIdx = narrationStep + 1;
    if (nextIdx >= steps.length) {
      get().advanceCampaignAct();
    } else {
      set({ narrationStep: nextIdx });
    }
  },

  checkCampaign2WinConditions: () => {
    const { activeCampaign, questConditions, engineState, campaignOutcome } = get();
    if (!activeCampaign || activeCampaign.campaign_id !== 'wyoming_2032_nuclear_dc') return;
    if (campaignOutcome !== null) return;

    const allMet = questConditions.every(c => c.met);
    if (allMet) {
      set({ campaignOutcome: 'victory' });
      return;
    }
    const lossYear = activeCampaign.loss_condition?.year ?? 2035;
    if (engineState.year > lossYear) {
      set({ campaignOutcome: 'defeat' });
    }
  },

  setCampaignFlyTarget: (target) => set({ campaignFlyTarget: target }),

  exitCampaign: () => set({
    activeCampaign: null,
    campaignAct: 1,
    campaignHintIndex: 0,
    narrationStep: 0,
    campaignComplete: false,
    campaignOutcome: null,
    campaignFlyTarget: null,
  }),

  // ── Session mode actions ──────────────────────────────────────────────────

  enterSessionMode: (sessionCode, participantLabel, config) => {
    const meta: SessionMeta = {
      session_code: sessionCode,
      participant_label: participantLabel,
      started_at: new Date().toISOString(),
      app_version: '1.0',
    };

    set({
      sessionMeta: meta,
      sessionConfig: config ?? null,
      annotations: [],
      showReflectionCard: false,
      ...(config?.fixed_seed != null ? { gameSeed: config.fixed_seed } : {}),
    });

    // Auto-start campaign if config specifies one
    if (config?.campaign_id) {
      get().startCampaign(config.campaign_id);
    }
  },

  addAnnotation: (a) => {
    const annotation: Annotation = {
      ...a,
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    set(s => ({ annotations: [...s.annotations, annotation] }));
  },

  setShowReflectionCard: (show) => set({ showReflectionCard: show }),

  replaySessionFile: (file) => replayFile(file),
}));

// Re-export session types so consumers don't need to import from engine
export type { SessionMeta, SessionConfig, Annotation };
export type { AnnotationTrigger } from '../engine/types.js';
