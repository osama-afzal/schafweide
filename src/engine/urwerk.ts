import type { WorldState } from '../types';
import { rollDice } from '../dice';
import {
  scheduleImpacts,
  processPendingImpacts,
  markEventResolved,
  updateTemplateCooldown,
  takeSnapshot,
} from './impact-pipeline';
import { tickToDate } from './seed-loader';
import { writeSieveEntry, ageSieve, logSieveSummary } from '../sieve';
import { DEFAULT_CONFIG } from './config';

// ============================================================
// URWERK TICK
// One tick of the simulation. Orchestrates:
//   1. Advance the clock
//   2. Process pending impacts from prior events
//   3. Roll the dice
//   4. If an event fires — schedule its impacts, log it
//   5. Take a metric snapshot
//   6. Return updated world state
//
// The engine does not care what it produces.
// It advances. That is all.
// ============================================================

export function tick(state: WorldState): WorldState {
  const nextTick = state.currentTick + 1;
  const { date, year, week } = tickToDate(
    nextTick,
    DEFAULT_CONFIG.startYear,
    14 // startWeek
  );

  // Advance the clock
  let updatedState: WorldState = {
    ...state,
    currentTick: nextTick,
    inWorldDate: date,
    inWorldYear: year,
    inWorldWeek: week,
    metrics: {
      ...state.metrics,
      tick: nextTick,
      inWorldDate: date,
    },
  };

  console.log(`\n[Urwerk] ── Tick ${nextTick} | ${date} ──`);

  // Step 1: process any pending impacts due this tick
  updatedState = processPendingImpacts(updatedState);

  // Step 2: roll the dice
  const { roll, event } = rollDice(updatedState);
  updatedState = { ...updatedState, lastDiceRoll: roll };

  if (!event) {
    console.log(`[Urwerk] Dice: no event this tick (raw: ${roll.rawValue.toFixed(3)})`);
  } else {
    console.log(`[Urwerk] Dice: "${event.title}" fired (magnitude ${event.magnitude})`);
    if (event.poiRefs.length > 0) {
      const poi = updatedState.personsOfInterest[event.poiRefs[0]!];
      if (poi) console.log(`[Urwerk] Named actor: ${poi.name}`);
    }

    // Step 3: add event to active list
    updatedState = {
      ...updatedState,
      activeEvents: [...updatedState.activeEvents, event],
    };

    // Step 4: schedule its impacts
    updatedState = scheduleImpacts(updatedState, event);

    // Step 5: update template cooldown
    const templateId = roll.selectedEventTemplateId;
    if (templateId) {
      updatedState = updateTemplateCooldown(updatedState, templateId);
    }

    // Step 6: mark resolved (impacts are now scheduled or applied)
    updatedState = markEventResolved(updatedState, event.id);

    // Step 7: write sieve entry for this event
    updatedState = writeSieveEntry(updatedState, event);
  }

  // Step 8: age the sieve — decay fidelity of older entries
  updatedState = ageSieve(updatedState);

  // Step 9: take metric snapshot
  updatedState = takeSnapshot(updatedState);

  return updatedState;
}

// ============================================================
// RUN
// Advances the simulation N ticks from the given state.
// Logs a metric summary after each tick.
// ============================================================

export function run(
  initialState: WorldState,
  ticks: number
): WorldState {
  let state = initialState;

  for (let i = 0; i < ticks; i++) {
    state = tick(state);
    logMetricSummary(state);
  }

  return state;
}

// ============================================================
// METRIC SUMMARY LOG
// Prints a compact view of current city metrics after each tick.
// ============================================================

function logMetricSummary(state: WorldState): void {
  const m = state.metrics;
  console.log(
    `[Metrics] ` +
    `Grain:${m.economic.grainSupply.toFixed(0)} ` +
    `Trade:${m.economic.tradeFlow.toFixed(0)} ` +
    `Guild±:${m.economic.guildTension.toFixed(0)} ` +
    `Wool:${m.economic.woolMarketPrice.toFixed(0)} | ` +
    `Imperial:${m.political.imperialAuthority.toFixed(0)} ` +
    `Church:${m.political.churchInfluence.toFixed(0)} ` +
    `Council:${m.political.councilLegitimacy.toFixed(0)} ` +
    `Law:${m.political.legalStability.toFixed(0)} | ` +
    `Unrest:${m.social.publicUnrest.toFixed(0)} ` +
    `Literacy:${m.social.literacyRate.toFixed(0)} ` +
    `Info:${m.social.informationSpread.toFixed(0)} ` +
    `Health:${m.social.populationHealth.toFixed(0)} | ` +
    `Press:${m.infrastructure.pressOperationalStatus.toFixed(0)} ` +
    `Road:${m.infrastructure.roadCondition.toFixed(0)} ` +
    `Bridge:${m.infrastructure.riverCrossingIntegrity.toFixed(0)}`
  );
}