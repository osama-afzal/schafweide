import type { EngineConfig } from '../types';

// ============================================================
// URWERK ENGINE CONFIGURATION
// These are the calibration knobs. All values are defaults
// that will be tuned by watching the simulation run.
// Do not treat these as final — treat them as hypotheses.
// ============================================================

export const DEFAULT_CONFIG: EngineConfig = {

  // Tick settings
  startYear: 1467,
  weeksPerTick: 1,

  // Sieve settings
  sieveHotCacheSize: 50,
  fidelityDecayRates: {
    magnitude1: 26,    // ~6 months before FULL -> SUMMARY
    magnitude2: 52,    // ~1 year
    magnitude3: 156,   // ~3 years
    magnitude4: 520,   // ~10 years
    magnitude5: Infinity  // never decays
  },

  // POI settings
  // An entity must be load-bearing in this many simultaneous
  // causal chains to enter the candidacy pool
  centralityThreshold: 3,

  // If a POI's centrality drops below this for N consecutive
  // ticks, demotion begins
  significanceDropThreshold: 2,
  ticksBeforeDemotion: 8,

  // Dice settings
  // Base chance of any event firing per tick — 40% per week
  // feels right for a town with existing tensions
  baseEventProbability: 0.35,

  // Under severe metric stress, high-magnitude events get
  // this weight multiplier in the dice pool
  catastropheMultiplier: 2.5,

  // Causal graph settings
  maxPropagationDelay: 52,   // impacts can't be delayed more than a year
  defaultDecayRate: 0.01     // impacts fade slowly by default
};