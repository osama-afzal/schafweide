// ============================================================
// INSTITUTION TYPES
// Institutions are the persistent, metric-bearing entities
// of Schafweide. They outlive individuals. They can be
// weakened, transformed, destroyed, or replaced — but they
// persist as entities even through radical change.
// ============================================================

export type InstitutionType =
  | 'PRESS'
  | 'RELIGIOUS_ORDER'
  | 'GUILD'
  | 'GOVERNING_COUNCIL'
  | 'TRADING_HOUSE'
  | 'INFRASTRUCTURE'

export type InstitutionStatus =
  | 'ACTIVE'
  | 'WEAKENED'       // functional but significantly degraded
  | 'DORMANT'        // exists but not exerting meaningful influence
  | 'DESTROYED'      // no longer functional; sieve entry created
  | 'TRANSFORMED'    // fundamentally changed character; new sieve entry

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  status: InstitutionStatus;
  foundedTick: number;
  foundingSieveEntryId: string;

  // Institutional metrics — separate from city metrics
  // These feed into city metrics as inputs
  influence: number;           // 0-100; how much this institution shapes city metrics
  stability: number;           // 0-100; resistance to disruption events
  publicTrust: number;         // 0-100; population's confidence in the institution
  resources: number;           // 0-100; financial and material capacity

  // Which city metrics this institution primarily affects
  // and the weight of that effect
  metricInfluences: MetricInfluence[];

  // Relational disposition toward other institutions and POIs
  // Positive = cooperative, negative = adversarial
  relationships: Record<string, number>;  // entityId -> disposition (-100 to 100)

  // Current POI affiliated with this institution, if any
  currentLeaderPoiId: string | null;

  // Sieve anchors
  significantSieveEntries: string[];
}

export interface MetricInfluence {
  metricPath: string;    // e.g. 'social.informationSpread'
  weight: number;        // how strongly this institution affects the metric (-1 to 1)
  propagationDelay: number;  // ticks before influence is felt
}

// ============================================================
// PERSON OF INTEREST TYPES
// POIs are not authored — they are promoted by the engine
// when causal centrality and external nomination converge.
// They are finite. They earn their names.
// ============================================================

export type POIStatus =
  | 'ACTIVE'
  | 'DECEASED'
  | 'DEPARTED'       // left Schafweide
  | 'DEMOTED'        // fell below significance threshold; compressed to sieve

export type PromotionTrigger =
  | 'CAUSAL_CENTRALITY'    // load-bearing node in 3+ simultaneous causal chains
  | 'EXTERNAL_NOMINATION'  // referenced specifically by existing POI event
  | 'HYBRID'               // both conditions met simultaneously

export interface PersonOfInterest {
  id: string;
  name: string;
  role: string;                        // their position in Schafweide's social fabric
  institutionalAffiliations: string[]; // institution IDs

  // Personal metrics — sparse, only what's causally relevant
  health: number;       // 0-100; declining with age, affected by events
  wealth: number;       // relative to population baseline (0-100)
  influence: number;    // reach within their institutional network (0-100)

  // Approximate lifespan — engine uses this for mortality events
  approximateBirthYear: number;
  approximateLifeExpectancy: number;   // in years; can be shortened by events

  // Relational weights
  // Positive = cooperative/favorable, negative = adversarial
  relationships: Record<string, number>;  // entityId -> disposition (-100 to 100)

  // Promotion record
  promotionTick: number;
  promotionTrigger: PromotionTrigger;
  promotionSieveEntryId: string;       // the event that crystallized them

  // Causal centrality score at time of promotion and current
  centralityScoreAtPromotion: number;
  currentCentralityScore: number;

  // Significance threshold — if centrality drops below this
  // for N consecutive ticks, demotion is triggered
  significanceThreshold: number;
  ticksBelowThreshold: number;

  // Lifecycle
  status: POIStatus;
  demotionTick: number | null;
  demotionSieveEntryId: string | null;

  // Running sieve record
  significantSieveEntries: string[];
}

// ============================================================
// CAUSAL CENTRALITY SCORING
// The engine scores every institutional role each tick.
// This is the nomination pool — not promotion itself.
// ============================================================

export interface CentralityScore {
  entityId: string;         // institution or population segment ID
  score: number;            // how many active causal chains pass through this entity
  activeChains: string[];   // IDs of causal chains currently involving this entity
  tick: number;
}