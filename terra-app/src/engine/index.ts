export type {
  CountyEES,
  EcoregionEES,
  BusState,
  Bus,
  Branch,
  ActiveCoupling,
  BuildQueueItem,
  ScPool,
  ScPools,
  ActionRecord,
  ActionLibrary,
  CrosswalkRow,
  CountyEESBaseline,
  InitialNetwork,
  EngineState,
  DeltaSummary,
  DisturbanceDeltaSummary,
  MaterialLedgerSummary,
  EESSummary,
  CountyCard,
  PathwayConditions,
  ScenarioProfile,
  IndicatorSnapshot,
  ClimateLens,
  ClimateContext,
  ClimateHazardEvent,
  ClimateConsequenceOutcome,
  ClimateAdaptationEffect,
} from './types.js';

export { EMPTY_CLIMATE_CONTEXT } from './types.js';

export {
  initializeState,
  applyAction,
  queueAction,
  advanceYear,
  injectDisturbance,
  applyHazardEventConsequences,
  sampleHazardEvents,
  CLIMATE_ADAPTATION_WRITABLE_FIELDS,
  computeEesSummary,
  getCountyCard,
  getMaterialLedger,
  getPathwayConditions,
  // v4.0 history + projection
  historyDigest,
  project,
  projectDelta,
} from './engine.js';

export {
  INDICATOR_CATALOG,
  POOL_UTILIZATION_IDS,
  computeIndicator,
  snapshotIndicators,
} from './indicators.js';

export { EES_DECOMPOSITION } from './decomposition.js';

export {
  EPOCH_MIDPOINTS,
  THERMAL_DERATE_FUELS,
  DEMAND_COEFFICIENTS,
  WATER_STRESS_DERATE,
  HEAT_DERATE,
  interpolateEpochValue,
  computeDemandModifier,
  computeWaterStressDerate,
  computeHeatDerate,
} from './climate_couplings.js';

export type {
  DemandModifierResult,
  WaterStressResult,
  HeatDerateResult,
} from './climate_couplings.js';
