import { loadSeedData } from './engine/seed-loader';
import { computeStressScore } from './engine/metric-resolver';

const state = loadSeedData();

const stress = computeStressScore(state.metrics);
console.log(`[Urwerk] Stress score at tick 0: ${(stress * 100).toFixed(1)}%`);
console.log(`[Urwerk] Ready.`);