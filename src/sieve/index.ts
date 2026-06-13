import type {
  WorldState,
  GameEvent,
  SieveEntry,
  SieveMagnitude,
  FidelityLevel,
} from '../types';
import { DEFAULT_CONFIG } from '../engine/config';

// ============================================================
// SIEVE WRITER
// Converts resolved GameEvents into SieveEntries and manages
// the fidelity lifecycle of existing entries.
//
// The sieve is the engine's long-term memory. It is lossy
// by design — significance determines longevity, not recency.
// The engine does not remember everything. Neither does history.
// ============================================================

// ============================================================
// FIDELITY DECAY
// Determines how long an entry stays at full fidelity
// before being compressed to summary, then fragment.
// Based on magnitude — higher magnitude entries persist longer.
// ============================================================

function getDecayThreshold(magnitude: SieveMagnitude): {
  toSummary: number;
  toFragment: number;
} {
  const rates = DEFAULT_CONFIG.fidelityDecayRates;
  return {
    toSummary: rates[`magnitude${magnitude}` as keyof typeof rates] as number,
    toFragment: (rates[`magnitude${magnitude}` as keyof typeof rates] as number) * 3,
  };
}

function decayFidelity(
  entry: SieveEntry,
  currentTick: number
): SieveEntry {
  // Magnitude 5 entries never decay
  if (entry.magnitude === 5) return entry;

  const age = currentTick - entry.tick;
  const thresholds = getDecayThreshold(entry.magnitude);

  let newFidelity: FidelityLevel = entry.currentFidelity;

  if (age >= thresholds.toFragment) {
    newFidelity = 'FRAGMENT';
  } else if (age >= thresholds.toSummary) {
    newFidelity = 'SUMMARY';
  }

  if (newFidelity === entry.currentFidelity) return entry;

  return { ...entry, currentFidelity: newFidelity };
}

// ============================================================
// ENTRY GENERATION
// Converts a resolved GameEvent into a SieveEntry.
// The description, summary, and fragment are generated
// from the event's structured data — no LLM yet.
// These will be enriched by the translation layer later.
// ============================================================

function generateSieveId(eventId: string): string {
  return `sieve_${eventId}`;
}

function buildDescription(event: GameEvent, state: WorldState): string {
  // Build a structured factual description from event data
  const actorClause = event.poiRefs.length > 0
    ? (() => {
        const poi = state.personsOfInterest[event.poiRefs[0]!];
        return poi ? ` Directly involving ${poi.name} (${poi.role}).` : '';
      })()
    : '';

  const institutionClause = event.institutionRefs.length > 0
    ? ` Institutions involved: ${event.institutionRefs.join(', ')}.`
    : '';

  const impactClause = event.impacts.length > 0
    ? ` Primary consequences: ${event.impacts
        .slice(0, 3)
        .map(i => `${i.metricPath} ${i.delta >= 0 ? '+' : ''}${i.delta.toFixed(1)}`)
        .join(', ')}.`
    : '';

  return `[${event.inWorldDate}] ${event.description}${actorClause}${institutionClause}${impactClause}`;
}

function buildSummary(event: GameEvent, state: WorldState): string {
  const actorClause = event.poiRefs.length > 0
    ? (() => {
        const poi = state.personsOfInterest[event.poiRefs[0]!];
        return poi ? ` (${poi.name} involved)` : '';
      })()
    : '';

  return `${event.inWorldDate}: ${event.title}${actorClause}. Magnitude ${event.magnitude} event.`;
}

function buildFragment(event: GameEvent): string {
  return `${event.inWorldDate}: ${event.title}.`;
}

// ============================================================
// CAUSAL ANCESTRY
// Finds sieve entries that causally contributed to this event
// by checking if any recent sieve entries share tags with
// the event and occurred within a plausible causal window.
// ============================================================

const CAUSAL_WINDOW_TICKS = 16; // ~4 months
const MIN_TAG_OVERLAP = 1;

function findCausalAncestors(
  event: GameEvent,
  state: WorldState
): string[] {
  const ancestors: string[] = [];
  const eventTags = new Set(event.tags);

  for (const entry of state.recentSieveEntries) {
    // Only look back within the causal window
    if (event.tick - entry.tick > CAUSAL_WINDOW_TICKS) continue;
    if (entry.tick >= event.tick) continue;

    // Check tag overlap
    const overlap = entry.tags.filter(tag => eventTags.has(tag)).length;
    if (overlap >= MIN_TAG_OVERLAP) {
      ancestors.push(entry.id);
    }
  }

  return ancestors;
}

// ============================================================
// INSTITUTION REFS
// Infers which institutions are involved based on event tags
// and the institution registry.
// ============================================================

function inferInstitutionRefs(
  event: GameEvent,
  state: WorldState
): string[] {
  const refs = new Set<string>(event.institutionRefs);

  // Tag-to-institution inference
  for (const [id, institution] of Object.entries(state.institutions)) {
    if (event.tags.includes('PRESS') && institution.type === 'PRESS') {
      refs.add(id);
    }
    if (event.tags.includes('RELIGION') && institution.type === 'RELIGIOUS_ORDER') {
      refs.add(id);
    }
    if (
      (event.tags.includes('POLITICS') || event.tags.includes('LAW')) &&
      institution.type === 'GOVERNING_COUNCIL'
    ) {
      refs.add(id);
    }
    if (
      (event.tags.includes('GUILD') || event.tags.includes('LABOR') || event.tags.includes('TEXTILE')) &&
      institution.type === 'GUILD'
    ) {
      refs.add(id);
    }
    if (
      event.tags.includes('INFRASTRUCTURE') &&
      institution.type === 'INFRASTRUCTURE'
    ) {
      refs.add(id);
    }
  }

  return Array.from(refs);
}

// ============================================================
// WRITE ENTRY
// The main function — converts a resolved event to a sieve
// entry and appends it to the world state's sieve hot cache.
// ============================================================

export function writeSieveEntry(
  state: WorldState,
  event: GameEvent
): WorldState {
  const id = generateSieveId(event.id);

  // Don't duplicate entries
  if (state.recentSieveEntries.some(e => e.id === id)) {
    return state;
  }

  const causalAncestors = findCausalAncestors(event, state);
  const institutionRefs = inferInstitutionRefs(event, state);

  const entry: SieveEntry = {
    id,
    tick: event.tick,
    inWorldDate: event.inWorldDate,
    description: buildDescription(event, state),
    summary: buildSummary(event, state),
    fragment: buildFragment(event),
    currentFidelity: 'FULL',
    tags: event.tags,
    magnitude: event.magnitude,
    institutionRefs,
    poiRefs: event.poiRefs,
    causedBy: causalAncestors,
    caused: [],            // populated retroactively as future events reference this
    embedding: null,       // placeholder for pgvector integration
  };

  // Update causal ancestry — mark this event as a consequence
  // of its ancestors in their own sieve records
  const updatedEntries = state.recentSieveEntries.map(existing => {
    if (causalAncestors.includes(existing.id)) {
      return {
        ...existing,
        caused: [...existing.caused, id],
      };
    }
    return existing;
  });

  // Append new entry and trim hot cache to configured size
  const newEntries = [...updatedEntries, entry]
    .slice(-DEFAULT_CONFIG.sieveHotCacheSize);

  console.log(
    `[Sieve] Entry written: "${event.title}" ` +
    `(${event.inWorldDate}, magnitude ${event.magnitude}, ` +
    `${causalAncestors.length} ancestor(s))`
  );

  return {
    ...state,
    recentSieveEntries: newEntries,
  };
}

// ============================================================
// AGE SIEVE
// Called each tick to decay fidelity of existing entries.
// Entries that reach FRAGMENT stay there indefinitely
// (or until they fall off the hot cache).
// ============================================================

export function ageSieve(state: WorldState): WorldState {
  const agedEntries = state.recentSieveEntries.map(entry =>
    decayFidelity(entry, state.currentTick)
  );

  return {
    ...state,
    recentSieveEntries: agedEntries,
  };
}

// ============================================================
// QUERY SIEVE
// Returns sieve entries that match a set of tags.
// Used by the dice to check for historical context
// before generating events.
// Orders results by magnitude descending, then recency.
// ============================================================

export function querySieve(
  state: WorldState,
  tags: string[],
  limit: number = 5
): SieveEntry[] {
  const tagSet = new Set(tags);

  return state.recentSieveEntries
    .filter(entry => entry.tags.some(tag => tagSet.has(tag)))
    .sort((a, b) => {
      // Sort by magnitude first, then recency
      if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
      return b.tick - a.tick;
    })
    .slice(0, limit);
}

// ============================================================
// SIEVE SUMMARY LOG
// Prints the current hot cache state for debugging.
// ============================================================

export function logSieveSummary(state: WorldState): void {
  console.log(`\n[Sieve] Hot cache: ${state.recentSieveEntries.length} entries`);
  for (const entry of state.recentSieveEntries.slice(-10)) {
    console.log(
      `  [${entry.currentFidelity}] ${entry.fragment} ` +
      `(mag:${entry.magnitude}, ancestors:${entry.causedBy.length})`
    );
  }
}