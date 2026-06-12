// ============================================================
// SIEVE TYPES
// The sieve is the engine's long-term memory — a lossy,
// magnitude-weighted catalog of past events that can be
// retrieved and integrated into future event generation.
// ============================================================

export type SieveTag =
  // Domain tags
  | 'AGRICULTURE'
  | 'TRADE'
  | 'METALLURGY'
  | 'TEXTILE'
  | 'RELIGION'
  | 'POLITICS'
  | 'MILITARY'
  | 'INFRASTRUCTURE'
  | 'PRESS'
  | 'LABOR'
  | 'LAW'
  | 'MEDICINE'
  // Sentiment tags
  | 'GRIEVANCE'
  | 'PRIDE'
  | 'SHAME'
  | 'SACRED'
  | 'FEAR'
  | 'HOPE'
  // Entity tags — references to institutions, POIs, locations
  | 'COUNCIL'
  | 'CHURCH'
  | 'GUILD'
  | 'DER_WEIDENBOTE'
  | 'MARKTPLATZ'
  | 'RIVER_CROSSING'
  // Causal tags
  | 'FOUNDING'
  | 'COLLAPSE'
  | 'REFORM'
  | 'CONFLICT'
  | 'DISCOVERY'
  | 'DISASTER'
  | 'RECOVERY'
  // Origin tags
  | 'EXOGENOUS'       // no causal ancestry in the simulation
  | 'THRESHOLD'       // pressure accumulated, then released
  | 'CATALYTIC'       // small event on a brittle system
  | 'NOMINATED'       // triggered by POI reference

// 1 = minor, fades quickly
// 2 = notable
// 3 = significant
// 4 = major
// 5 = epoch-defining, permanent
export type SieveMagnitude = 1 | 2 | 3 | 4 | 5;

export type FidelityLevel = 'FULL' | 'SUMMARY' | 'FRAGMENT';

export interface SieveEntry {
  id: string;
  tick: number;                    // simulation tick when event occurred
  inWorldDate: string;             // human-readable in-world date e.g. "March, 1467"

  // Core content
  description: string;             // full fidelity description
  summary: string;                 // compressed summary for aging entries
  fragment: string;                // single-line historical fact for very old entries

  currentFidelity: FidelityLevel;  // degrades over time based on magnitude

  // Tagging
  tags: SieveTag[];
  magnitude: SieveMagnitude;

  // Entity references
  institutionRefs: string[];       // institution IDs involved
  poiRefs: string[];               // POI IDs involved
  locationRef?: string;            // specific location if relevant

  // Causal linkage
  causedBy: string[];              // sieve entry IDs that contributed to this event
  caused: string[];                // sieve entry IDs this event contributed to (populated retroactively)

  // Semantic matching — nullable placeholder for pgvector integration later
  embedding: number[] | null;
}