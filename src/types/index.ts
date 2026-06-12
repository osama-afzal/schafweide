// ============================================================
// WORLD STATE
// The complete state of Schafweide at any given tick.
// This is what the engine reads and writes each update cycle.
// This is what gets persisted to Postgres between sessions.
// ============================================================

import type { CityMetrics, MetricSnapshot } from './metrics';
import type { Institution, PersonOfInterest, CentralityScore } from './entities';
import type { GameEvent, EventTemplate, DiceRoll } from './events';
import type { SieveEntry } from './sieve';

export interface WorldState {
  // Identity
  cityName: string;
  settingDescription: string;
  currentTick: number;
  inWorldDate: string;
  inWorldYear: number;
  inWorldWeek: number;        // 1-52

  // The numbers
  metrics: CityMetrics;

  // Recent metric history for delta calculation
  // Rolling window — only last N snapshots kept in memory
  // older ones compressed to Postgres
  recentSnapshots: MetricSnapshot[];

  // Living entities
  institutions: Record<string, Institution>;
  personsOfInterest: Record<string, PersonOfInterest>;

  // Engine state
  activeEvents: GameEvent[];
  pendingImpacts: PendingImpact[];  // impacts waiting on propagation delay
  eventTemplates: Record<string, EventTemplate>;
  lastDiceRoll: DiceRoll | null;

  // Causal tracking
  activeCausalChains: CausalChain[];
  centralityScores: CentralityScore[];

  // Sieve — in-memory working set
  // Full sieve lives in Postgres; this is the hot cache
  recentSieveEntries: SieveEntry[];    // last N entries at full fidelity
  sieveSummaries: SieveSummary[];      // compressed older entries
}

// An impact that has been calculated but not yet applied
// because its propagation delay hasn't elapsed
export interface PendingImpact {
  id: string;
  sourceEventId: string;
  metricPath: string;
  delta: number;
  decayRate: number;
  scheduledForTick: number;
}

// A chain of causally linked events being tracked
// by the engine for centrality scoring
export interface CausalChain {
  id: string;
  originEventId: string;
  currentEvents: string[];     // event IDs currently active in this chain
  involvedEntities: string[];  // institution and POI IDs touched by this chain
  startTick: number;
  lastActiveTick: number;
  resolved: boolean;
}

// Compressed sieve entry for older events
// Full entry lives in Postgres
export interface SieveSummary {
  id: string;
  tick: number;
  inWorldDate: string;
  fragment: string;            // single-line historical fact
  tags: string[];
  magnitude: number;
  embedding: number[] | null;
}

// ============================================================
// ENGINE CONFIGURATION
// Tunable parameters that affect simulation behavior.
// These are the knobs. Calibration lives here.
// ============================================================

export interface EngineConfig {
  // Tick settings
  startYear: number;
  weeksPerTick: number;        // default 1

  // Sieve settings
  sieveHotCacheSize: number;   // how many entries to keep in memory
  fidelityDecayRates: {
    magnitude1: number;        // ticks before FULL -> SUMMARY
    magnitude2: number;
    magnitude3: number;
    magnitude4: number;
    magnitude5: number;        // never decays
  };

  // POI settings
  centralityThreshold: number;         // minimum chains for centrality candidacy
  significanceDropThreshold: number;   // centrality below which demotion begins
  ticksBeforeDemotion: number;         // consecutive ticks below threshold before demotion

  // Dice settings
  baseEventProbability: number;        // 0-1; chance of any event firing per tick
  catastropheMultiplier: number;       // weight boost for high-magnitude events under stress

  // Causal graph settings
  maxPropagationDelay: number;         // maximum ticks an impact can be delayed
  defaultDecayRate: number;            // how quickly impacts fade if not specified
}

// ============================================================
// BARREL EXPORT
// ============================================================

export * from './sieve';
export * from './metrics';
export * from './entities';
export * from './events';