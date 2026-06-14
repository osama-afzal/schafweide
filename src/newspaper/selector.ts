import type { WorldState, SieveEntry, GameEvent } from '../types';
import { getMetric } from '../engine/metric-resolver';

// ============================================================
// NEWSPAPER SELECTOR
// Decides what Der Weidenbote covers in a given edition.
// Not everything makes the paper. The selector weighs
// magnitude, recency, causal significance, and whether
// the press would plausibly report it given its current
// relationship with the institutions involved.
// ============================================================

export interface EditionSelection {
  leadStory: SieveEntry;
  secondaryStories: SieveEntry[];
  briefItems: SieveEntry[];
  coveragePeriod: {
    fromTick: number;
    toTick: number;
    fromDate: string;
    toDate: string;
  };
  editorialPressure: number;    // 0-1; affects tone of coverage
  suppressedTopics: string[];   // tags the press avoids this edition
}

// ============================================================
// SUPPRESSION LOGIC
// When the Church or council has pressured the press recently,
// certain topics get soft-suppressed — covered obliquely or
// not at all.
// ============================================================

function computeSuppressedTopics(state: WorldState): string[] {
  const suppressed: string[] = [];
  const pressStatus = getMetric(state.metrics, 'infrastructure.pressOperationalStatus');
  const churchInfluence = getMetric(state.metrics, 'political.churchInfluence');
  const councilLegitimacy = getMetric(state.metrics, 'political.councilLegitimacy');

  // Under heavy Church pressure, religious criticism is avoided
  if (churchInfluence > 75 && pressStatus < 55) {
    suppressed.push('RELIGION');
  }

  // Under heavy Council pressure, political criticism is softened
  if (councilLegitimacy > 60 && pressStatus < 50) {
    suppressed.push('POLITICS');
  }

  // If press is barely operational, stick to commercial news only
  if (pressStatus < 35) {
    suppressed.push('CONFLICT');
    suppressed.push('GRIEVANCE');
  }

  return suppressed;
}

// ============================================================
// STORY SCORING
// Assigns a coverage score to each sieve entry.
// Higher = more likely to be covered, and more prominently.
// ============================================================

function scoreEntry(
  entry: SieveEntry,
  state: WorldState,
  suppressedTopics: string[]
): number {
  let score = 0;

  // Base score from magnitude
  score += entry.magnitude * 3;

  // Causal significance — entries with many ancestors
  // represent the culmination of ongoing stories
  score += Math.min(entry.causedBy.length * 0.5, 3);

  // Recency bonus — more recent events score higher
  const age = state.currentTick - entry.tick;
  score += Math.max(0, 5 - age * 0.3);

  // POI involvement — named actors make better stories
  if (entry.poiRefs.length > 0) score += 2;

  // Suppression penalty
  const suppressedOverlap = entry.tags.filter(t =>
    suppressedTopics.includes(t)
  ).length;
  score -= suppressedOverlap * 4;

  // Der Weidenbote's commercial DNA — trade and guild stories
  // always get a bump regardless of editorial pressure
  if (entry.tags.includes('TRADE') || entry.tags.includes('TEXTILE')) {
    score += 2;
  }
  if (entry.tags.includes('GUILD') || entry.tags.includes('LABOR')) {
    score += 1.5;
  }

  // Press stories about itself — Voss is self-aware
  if (entry.tags.includes('PRESS')) score += 1;

  return score;
}

// ============================================================
// EDITION WINDOW
// Determines which sieve entries fall within the coverage
// period for this edition (since last edition or last N ticks).
// ============================================================

const DEFAULT_COVERAGE_WINDOW = 12; // ~3 months of in-world time

export function selectEditionContent(
  state: WorldState,
  fromTick?: number
): EditionSelection | null {
  const coverageFromTick = fromTick ?? Math.max(0, state.currentTick - DEFAULT_COVERAGE_WINDOW);

  // Get entries within coverage window — exclude seed entries (negative ticks)
  const candidates = state.recentSieveEntries.filter(entry =>
    entry.tick >= coverageFromTick &&
    entry.tick <= state.currentTick &&
    entry.tick >= 0
  );

  if (candidates.length === 0) {
    console.log('[Newspaper] No eligible sieve entries in coverage window.');
    return null;
  }

  const suppressedTopics = computeSuppressedTopics(state);
  const pressStatus = getMetric(state.metrics, 'infrastructure.pressOperationalStatus');
  const editorialPressure = Math.max(0, Math.min(1, (60 - pressStatus) / 60));

  // Score all candidates
  const scored = candidates
    .map(entry => ({ entry, score: scoreEntry(entry, state, suppressedTopics) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    console.log('[Newspaper] All candidate entries suppressed or zero-scored.');
    return null;
  }

  // Assign to slots
  const leadStory = scored[0]!.entry;
  const secondaryStories = scored.slice(1, 3).map(s => s.entry);
  const briefItems = scored.slice(3, 6).map(s => s.entry);

  // Find earliest and latest dates in selection
  const allSelected = [leadStory, ...secondaryStories, ...briefItems];
  const fromDate = allSelected.reduce((earliest, e) =>
    e.tick < earliest.tick ? e : earliest
  ).inWorldDate;
  const toDate = allSelected.reduce((latest, e) =>
    e.tick > latest.tick ? e : latest
  ).inWorldDate;

  console.log(`[Newspaper] Edition selected:`);
  console.log(`  Lead: "${leadStory.fragment}" (score: ${scored[0]!.score.toFixed(1)})`);
  secondaryStories.forEach((s, i) =>
    console.log(`  Secondary ${i + 1}: "${s.fragment}" (score: ${scored[i + 1]!.score.toFixed(1)})`)
  );
  console.log(`  Briefs: ${briefItems.length}`);
  console.log(`  Suppressed topics: ${suppressedTopics.join(', ') || 'none'}`);
  console.log(`  Editorial pressure: ${(editorialPressure * 100).toFixed(0)}%`);

  return {
    leadStory,
    secondaryStories,
    briefItems,
    coveragePeriod: {
      fromTick: coverageFromTick,
      toTick: state.currentTick,
      fromDate,
      toDate,
    },
    editorialPressure,
    suppressedTopics,
  };
}