import { loadSeedData } from './engine/seed-loader';
import { computeStressScore } from './engine/metric-resolver';
import { run } from './engine/urwerk';
import { logSieveSummary } from './sieve';

const state = loadSeedData();

const stress = computeStressScore(state.metrics);
console.log(`[Urwerk] Stress score at tick 0: ${(stress * 100).toFixed(1)}%`);
console.log(`[Urwerk] Beginning simulation...\n`);

const finalState = run(state, 52);

console.log(`\n[Urwerk] Simulation complete.`);
console.log(`[Urwerk] Final date: ${finalState.inWorldDate}`);
console.log(`[Urwerk] Active events: ${finalState.activeEvents.length}`);
console.log(`[Urwerk] Pending impacts: ${finalState.pendingImpacts.length}`);

logSieveSummary(finalState);