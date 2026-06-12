// ============================================================
// EVENT TYPES
// Events are the engine's output — structured facts about
// what happened in Schafweide at a given tick. They are
// not prose. Prose is the newspaper's job.
// The engine produces events. The LLM translates them.
// ============================================================

import type { SieveTag, SieveMagnitude } from './sieve';

export type EventOrigin =
  | 'DICE'             // triggered by random roll
  | 'THRESHOLD'        // metric pressure crossed a defined limit
  | 'CAUSAL'           // downstream consequence of a prior event
  | 'SEASONAL'         // calendar-driven (harvest, winter, market fair)
  | 'POI_ACTION'       // driven by a POI's metric state

export type EventStatus =
  | 'PENDING'          // rolled but not yet resolved
  | 'ACTIVE'           // currently propagating through the causal graph
  | 'RESOLVED'         // fully propagated; sieve entry created
  | 'SUPPRESSED'       // conditions changed before resolution

// The structured metric impact of an event
// before it is applied to the city metrics
export interface MetricImpact {
  metricPath: string;        // e.g. 'economic.tradeFlow'
  delta: number;             // the change to apply
  propagationDelay: number;  // ticks before this impact is felt
  decayRate: number;         // how quickly the impact fades (0 = permanent)
}

// A causal link between two events
export interface CausalLink {
  causingEventId: string;
  causedEventId: string;
  strength: number;          // 0-1; how directly one caused the other
  delay: number;             // ticks between cause and effect
}

export interface GameEvent {
  id: string;
  tick: number;
  inWorldDate: string;

  // Classification
  origin: EventOrigin;
  tags: SieveTag[];
  magnitude: SieveMagnitude;

  // Human-readable structured description
  // This is what gets passed to the LLM translation layer
  title: string;
  description: string;       // factual, engine-voice, no prose flourish

  // Metric consequences
  impacts: MetricImpact[];

  // Entity involvement
  institutionRefs: string[];
  poiRefs: string[];

  // Causal record
  causedBy: string[];        // event IDs
  causalLinks: CausalLink[];

  // Sieve
  status: EventStatus;
  sieveEntryId: string | null;   // populated when event is resolved

  // POI promotion check
  // If this event is specific enough to require a named individual,
  // the engine flags it here before running promotion logic
  requiresNamedActor: boolean;
  nominatedEntityId: string | null;
}

// The dice roll result — before event selection
export interface DiceRoll {
  tick: number;
  rawValue: number;          // 0-1
  weightedPool: DicePoolEntry[];
  selectedEventTemplateId: string | null;
}

// A possible event in the dice pool
// weighted by current metric state
export interface DicePoolEntry {
  templateId: string;
  baseWeight: number;
  contextualWeight: number;  // modified by current metrics
  finalWeight: number;
  requiresTags: SieveTag[];  // sieve tags that must exist for this to fire
  blockedByTags: SieveTag[]; // sieve tags that prevent this from firing
}

// Event templates — the pre-seeded catalog of possible dice outcomes
// Not the events themselves — the molds from which events are cast
export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  tags: SieveTag[];
  magnitude: SieveMagnitude;
  origin: EventOrigin;

  // Metric conditions that make this template available
  // All conditions must be met for template to enter the dice pool
  conditions: MetricCondition[];

  // Base impacts before contextual modification
  baseImpacts: MetricImpact[];

  // Whether this event requires a specific named actor (POI)
  requiresNamedActor: boolean;

  // Cooldown in ticks — prevents the same template firing repeatedly
  cooldownTicks: number;
  lastFiredTick: number | null;
}

export interface MetricCondition {
  metricPath: string;
  operator: 'GT' | 'LT' | 'GTE' | 'LTE' | 'BETWEEN';
  value: number;
  valueMax?: number;         // used for BETWEEN
}