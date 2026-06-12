import type { CityMetrics } from '../types';

// ============================================================
// METRIC RESOLVER
// The causal graph and institution influences reference metrics
// via dot-notation path strings e.g. 'economic.tradeFlow'.
// This module safely resolves those paths against a CityMetrics
// object without resorting to unsafe dynamic property access.
// ============================================================

// All valid metric paths in the system.
// If you add a metric to CityMetrics, add its path here.
export const VALID_METRIC_PATHS = [
  'economic.grainSupply',
  'economic.tradeFlow',
  'economic.guildTension',
  'economic.woolMarketPrice',
  'political.imperialAuthority',
  'political.churchInfluence',
  'political.councilLegitimacy',
  'political.legalStability',
  'social.publicUnrest',
  'social.literacyRate',
  'social.informationSpread',
  'social.populationHealth',
  'infrastructure.pressOperationalStatus',
  'infrastructure.roadCondition',
  'infrastructure.riverCrossingIntegrity',
] as const;

export type MetricPath = typeof VALID_METRIC_PATHS[number];

type MetricCategory = keyof Omit<CityMetrics, 'tick' | 'inWorldDate'>;

// ============================================================
// READ
// Returns the current value of a metric by path.
// Throws if the path is invalid.
// ============================================================

export function getMetric(metrics: CityMetrics, path: string): number {
  const [category, key] = path.split('.');

  if (!category || !key) {
    throw new Error(`Metric resolver: invalid path format '${path}'`);
  }

  const categoryData = metrics[category as MetricCategory];

  if (categoryData === undefined || typeof categoryData !== 'object') {
    throw new Error(`Metric resolver: unknown category '${category}' in path '${path}'`);
  }

  const value = (categoryData as unknown as Record<string, number>)[key];

  if (value === undefined) {
    throw new Error(`Metric resolver: unknown metric key '${key}' in category '${category}'`);
  }

  return value;
}

// ============================================================
// WRITE
// Returns a new CityMetrics object with the given metric
// updated by delta. Clamps to 0-100. Immutable — never
// mutates the original metrics object.
// ============================================================

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function applyDelta(
  metrics: CityMetrics,
  path: string,
  delta: number
): CityMetrics {
  const [category, key] = path.split('.');

  if (!category || !key) {
    throw new Error(`Metric resolver: invalid path format '${path}'`);
  }

  const categoryData = metrics[category as MetricCategory];

  if (categoryData === undefined || typeof categoryData !== 'object') {
    throw new Error(`Metric resolver: unknown category '${category}' in path '${path}'`);
  }

  const currentValue = (categoryData as unknown as Record<string, number>)[key];

  if (currentValue === undefined) {
    throw new Error(`Metric resolver: unknown metric key '${key}' in category '${category}'`);
  }

  const newValue = clamp(currentValue + delta);

  // Return new metrics object — never mutate
  return {
    ...metrics,
    [category]: {
      ...categoryData,
      [key]: newValue,
    },
  };
}

// ============================================================
// VALIDATE PATH
// Used by the seed loader and template validator to check
// that all metric paths in seed data are legitimate.
// ============================================================

export function isValidMetricPath(path: string): path is MetricPath {
  return (VALID_METRIC_PATHS as readonly string[]).includes(path);
}

// ============================================================
// SNAPSHOT DELTA
// Computes the numeric difference between two metric snapshots
// across all paths. Used by the causal graph to detect
// which metrics are under pressure.
// ============================================================

export function computeAllDeltas(
  previous: CityMetrics,
  current: CityMetrics
): Record<MetricPath, number> {
  const deltas = {} as Record<MetricPath, number>;

  for (const path of VALID_METRIC_PATHS) {
    const prev = getMetric(previous, path);
    const curr = getMetric(current, path);
    deltas[path] = curr - prev;
  }

  return deltas;
}

// ============================================================
// STRESS SCORE
// Returns a 0-1 score representing how much metric pressure
// the city is under. Used by the dice to weight catastrophic
// events upward during volatile periods.
//
// Stress is defined as the average absolute deviation of
// key destabilizing metrics from their stable baseline (50).
// ============================================================

const STRESS_METRICS: MetricPath[] = [
  'social.publicUnrest',
  'economic.guildTension',
  'economic.tradeFlow',
  'political.councilLegitimacy',
  'infrastructure.pressOperationalStatus',
];

export function computeStressScore(metrics: CityMetrics): number {
  let totalDeviation = 0;

  for (const path of STRESS_METRICS) {
    const value = getMetric(metrics, path);

    // publicUnrest and guildTension: high = stressed
    // tradeFlow, councilLegitimacy, pressOperationalStatus: low = stressed
    const isHighBad = path === 'social.publicUnrest' || path === 'economic.guildTension';
    const deviation = isHighBad
      ? Math.max(0, value - 50) / 50
      : Math.max(0, 50 - value) / 50;

    totalDeviation += deviation;
  }

  return Math.min(1, totalDeviation / STRESS_METRICS.length);
}