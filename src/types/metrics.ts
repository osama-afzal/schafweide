// ============================================================
// CITY METRIC TYPES
// The numerical heartbeat of Schafweide. These are the
// variables the engine propagates each tick. Agents are
// blind to their own significance — they are just numbers.
// ============================================================

// All metric values are normalized 0-100 unless noted.
// 50 represents a stable, unremarkable baseline.
// Deviations in either direction are meaningful.

export interface EconomicMetrics {
  grainSupply: number;         // food security; seasonal fluctuation expected
  tradeFlow: number;           // volume of commerce through the market
  guildTension: number;        // labor friction; high = unrest risk
  woolMarketPrice: number;     // Schafweide's primary commodity; affects trade flow
}

export interface PoliticalMetrics {
  imperialAuthority: number;   // relationship with Holy Roman Empire structures
  churchInfluence: number;     // local diocese grip on civic life
  councilLegitimacy: number;   // the three guild families' standing with the population
  legalStability: number;      // reliability of local law and dispute resolution
}

export interface SocialMetrics {
  publicUnrest: number;        // population agitation; feeds political events
  literacyRate: number;        // starts very low (~5); grows slowly
  informationSpread: number;   // how quickly events propagate through population
  populationHealth: number;    // general health; affected by grain, season, disease events
}

export interface InfrastructureMetrics {
  pressOperationalStatus: number;  // 0 = destroyed, 50 = functional, 100 = thriving
  roadCondition: number;           // affects trade flow and event propagation speed
  riverCrossingIntegrity: number;  // the Hartmann family's chokehold on commerce
}

export interface CityMetrics {
  economic: EconomicMetrics;
  political: PoliticalMetrics;
  social: SocialMetrics;
  infrastructure: InfrastructureMetrics;
  tick: number;
  inWorldDate: string;
}

// A snapshot of metrics at a given tick — used for delta calculation
// and causal graph propagation
export interface MetricSnapshot {
  tick: number;
  metrics: CityMetrics;
}

// The delta between two snapshots — what the engine actually
// propagates through the causal graph
export type MetricDelta = {
  [K in keyof Omit<CityMetrics, 'tick' | 'inWorldDate'>]: {
    [M in keyof CityMetrics[K]]: number;
  };
};