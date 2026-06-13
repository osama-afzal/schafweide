import type {
  WorldState,
  GameEvent,
  EventTemplate,
  DiceRoll,
  DicePoolEntry,
  MetricImpact,
  MetricCondition,
} from '../types';
import { getMetric, computeStressScore } from '../engine/metric-resolver';
import { tickToDate } from '../engine/seed-loader';
import { DEFAULT_CONFIG } from '../engine/config';

// ============================================================
// DICE MODULE
// The engine's randomness layer. Rolls each tick to determine
// whether an event fires, which template it comes from, and
// who (if anyone) is attached to it.
//
// The dice does not care what story it tells.
// It consults the world's state to weight probabilities,
// then rolls. That is all.
// ============================================================

// ============================================================
// CONDITION EVALUATION
// Checks whether a template's conditions are met against
// current metrics. All conditions must pass.
// ============================================================

function evaluateCondition(
  condition: MetricCondition,
  state: WorldState
): boolean {
  let value: number;

  try {
    value = getMetric(state.metrics, condition.metricPath);
  } catch {
    // Unknown metric path in template — skip this template
    console.warn(`[Dice] Unknown metric path in condition: ${condition.metricPath}`);
    return false;
  }

  switch (condition.operator) {
    case 'GT':  return value > condition.value;
    case 'LT':  return value < condition.value;
    case 'GTE': return value >= condition.value;
    case 'LTE': return value <= condition.value;
    case 'BETWEEN':
      return condition.valueMax !== undefined
        ? value >= condition.value && value <= condition.valueMax
        : false;
    default:
      return false;
  }
}

function templateConditionsMet(template: EventTemplate, state: WorldState): boolean {
  return template.conditions.every(condition => evaluateCondition(condition, state));
}

// ============================================================
// COOLDOWN CHECK
// Prevents the same template from firing repeatedly.
// ============================================================

function templateOffCooldown(template: EventTemplate, currentTick: number): boolean {
  if (template.lastFiredTick === null) return true;
  return currentTick - template.lastFiredTick >= template.cooldownTicks;
}

// ============================================================
// CONTEXTUAL WEIGHT
// Modifies a template's base weight based on how stressed
// the metrics it touches actually are.
//
// A template that affects a metric already under pressure
// gets weighted higher — the world is primed for it.
// ============================================================

function computeContextualWeight(
  template: EventTemplate,
  state: WorldState,
  stressScore: number
): number {
  let weight = template.magnitude;
  let recoveryBoost = 0;

  for (const impact of template.baseImpacts) {
    try {
      const currentValue = getMetric(state.metrics, impact.metricPath);
      const deviation = Math.abs(currentValue - 50) / 50;

      // Base stress alignment boost
      weight += deviation * 0.5;

      // Recovery boost: if a metric is in crisis and this template
      // pushes it in the corrective direction, boost weight strongly.
      const isFloorCrisis = currentValue <= 15 && impact.delta > 0;
      const isCeilingCrisis = currentValue >= 85 && impact.delta < 0;

      if (isFloorCrisis || isCeilingCrisis) {
        const crisisDepth = isFloorCrisis
          ? (15 - currentValue) / 15
          : (currentValue - 85) / 15;
        recoveryBoost += 3 + crisisDepth * 4;
      }
    } catch {
      // Skip unknown paths
    }
  }

  weight += recoveryBoost;

  // Under high systemic stress, high-magnitude events get boosted further
  // but recovery templates are exempt
  if (stressScore > 0.6 && template.magnitude >= 3 && recoveryBoost === 0) {
    weight *= DEFAULT_CONFIG.catastropheMultiplier;
  }

  return weight;
}

// ============================================================
// POOL BUILDER
// Evaluates all templates and builds the weighted dice pool
// for this tick.
// ============================================================

function buildDicePool(state: WorldState, stressScore: number): DicePoolEntry[] {
  const pool: DicePoolEntry[] = [];

  for (const template of Object.values(state.eventTemplates)) {
    // Skip if conditions not met
    if (!templateConditionsMet(template, state)) continue;

    // Skip if on cooldown
    if (!templateOffCooldown(template, state.currentTick)) continue;

    const baseWeight = template.magnitude;
    const contextualWeight = computeContextualWeight(template, state, stressScore);
    const finalWeight = contextualWeight;

    pool.push({
      templateId: template.id,
      baseWeight,
      contextualWeight,
      finalWeight,
      requiresTags: [],
      blockedByTags: [],
    });
  }

  return pool;
}

// ============================================================
// WEIGHTED SELECTION
// Selects a template from the pool using weighted random.
// ============================================================

function selectFromPool(pool: DicePoolEntry[]): string | null {
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, entry) => sum + entry.finalWeight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of pool) {
    roll -= entry.finalWeight;
    if (roll <= 0) return entry.templateId;
  }

  // Fallback — return last entry if floating point drift
  return pool[pool.length - 1]!.templateId;
}

// ============================================================
// NAMED ACTOR RESOLUTION
// Option B: attach existing relevant POI if available,
// otherwise defer and log.
// ============================================================

function resolveNamedActor(
  template: EventTemplate,
  state: WorldState
): string | null {
  // Check if any active POI is affiliated with an institution
  // relevant to this template's tags
  for (const poi of Object.values(state.personsOfInterest)) {
    if (poi.status !== 'ACTIVE') continue;

    // Check if POI's affiliated institutions touch this template's tags
    for (const affiliation of poi.institutionalAffiliations) {
      const institution = state.institutions[affiliation];
      if (!institution) continue;

      // If the template has PRESS tag and POI runs the press — attach them
      if (
        template.tags.includes('PRESS') &&
        institution.type === 'PRESS'
      ) {
        return poi.id;
      }
    }
  }

  // No relevant POI found — defer, log for future promotion logic
  console.log(
    `[Dice] Event '${template.id}' requires named actor but none found. ` +
    `Flagged for POI promotion.`
  );
  return null;
}

// ============================================================
// EVENT CONSTRUCTION
// Builds a GameEvent from a selected template.
// ============================================================

function generateEventId(tick: number, templateId: string): string {
  return `evt_${tick}_${templateId}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildEvent(
  template: EventTemplate,
  state: WorldState,
  namedActorId: string | null
): GameEvent {
  const id = generateEventId(state.currentTick, template.id);
  const { date } = tickToDate(
    state.currentTick,
    DEFAULT_CONFIG.startYear,
    14 // startWeek from seed
  );

  // Deep copy impacts to avoid mutating the template
  const impacts: MetricImpact[] = template.baseImpacts.map(impact => ({ ...impact }));

  return {
    id,
    tick: state.currentTick,
    inWorldDate: date,
    origin: template.origin,
    tags: [...template.tags],
    magnitude: template.magnitude,
    title: template.name,
    description: template.description,
    impacts,
    institutionRefs: [],
    poiRefs: namedActorId ? [namedActorId] : [],
    causedBy: [],
    causalLinks: [],
    status: 'PENDING',
    sieveEntryId: null,
    requiresNamedActor: template.requiresNamedActor,
    nominatedEntityId: namedActorId,
  };
}

// ============================================================
// MAIN ROLL
// The single function Urwerk calls each tick.
// Returns a GameEvent if one fires, null otherwise.
// ============================================================

// ============================================================
// CRISIS DETECTION
// Returns true if any metric has been in floor or ceiling
// crisis territory — used to guarantee a recovery roll.
// ============================================================

function hasCrisisMetric(state: WorldState): boolean {
  const crisisMetrics = [
    { path: 'economic.tradeFlow', floor: 15 },
    { path: 'economic.guildTension', ceiling: 85 },
    { path: 'political.councilLegitimacy', floor: 25 },
    { path: 'social.publicUnrest', ceiling: 60 },
    { path: 'infrastructure.pressOperationalStatus', floor: 30 },
  ];

  for (const cm of crisisMetrics) {
    try {
      const value = getMetric(state.metrics, cm.path);
      if (cm.floor !== undefined && value <= cm.floor) return true;
      if (cm.ceiling !== undefined && value >= cm.ceiling) return true;
    } catch { /* skip */ }
  }
  return false;
}

export function rollDice(state: WorldState): {
  roll: DiceRoll;
  event: GameEvent | null;
} {
  const stressScore = computeStressScore(state.metrics);
  const pool = buildDicePool(state, stressScore);
  const rawValue = Math.random();

  // Guarantee a roll when any metric is in crisis territory,
  // regardless of baseEventProbability
  const inCrisis = hasCrisisMetric(state);
  const fires = inCrisis || rawValue < DEFAULT_CONFIG.baseEventProbability;

  if (!fires || pool.length === 0) {
    return {
      roll: {
        tick: state.currentTick,
        rawValue,
        weightedPool: pool,
        selectedEventTemplateId: null,
      },
      event: null,
    };
  }

  const selectedTemplateId = selectFromPool(pool);

  if (!selectedTemplateId) {
    return {
      roll: {
        tick: state.currentTick,
        rawValue,
        weightedPool: pool,
        selectedEventTemplateId: null,
      },
      event: null,
    };
  }

  const template = state.eventTemplates[selectedTemplateId]!;

  // Resolve named actor if required
  const namedActorId = template.requiresNamedActor
    ? resolveNamedActor(template, state)
    : null;

  const event = buildEvent(template, state, namedActorId);

  return {
    roll: {
      tick: state.currentTick,
      rawValue,
      weightedPool: pool,
      selectedEventTemplateId: selectedTemplateId,
    },
    event,
  };
}