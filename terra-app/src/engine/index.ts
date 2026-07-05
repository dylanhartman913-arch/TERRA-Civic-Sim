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
} from './types.js';

export {
  initializeState,
  applyAction,
  queueAction,
  advanceYear,
  injectDisturbance,
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
