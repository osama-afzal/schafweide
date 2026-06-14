import { loadSeedData } from './engine/seed-loader';
import { computeStressScore } from './engine/metric-resolver';
import { run } from './engine/urwerk';
import { logSieveSummary } from './sieve';
import { publishEdition } from './newspaper';
import {
  checkDbHealth,
  closeDb,
  saveWorldSnapshot,
  loadLatestSnapshot,
  bulkUpsertSieveEntries,
  fetchRecentSieveEntries,
  countSnapshots,
} from './database';

// ============================================================
// MAIN ENTRY POINT
// Handles:
//   1. DB health check
//   2. Resume from snapshot OR fresh start from seed
//   3. Run simulation
//   4. Persist world state and sieve
//   5. Publish newspaper edition
//   6. Clean shutdown
// ============================================================

const TICKS_TO_RUN = 52;
const RESUME = process.argv.includes('--resume');

async function main() {
  // Step 1 — check database
  console.log('[Urwerk] Checking database connection...');
  const dbHealthy = await checkDbHealth();

  if (!dbHealthy) {
    console.warn(
      '[Urwerk] WARNING: Database unavailable. Running without persistence.\n' +
      '  To enable persistence, start the database with:\n' +
      '  docker-compose up -d'
    );
  } else {
    console.log('[Urwerk] Database connected.');
  }

  // Step 2 — load world state
  let state = null;

  if (RESUME && dbHealthy) {
    const snapshots = await countSnapshots();
    if (snapshots > 0) {
      console.log('[Urwerk] Resuming from latest snapshot...');
      state = await loadLatestSnapshot();

      if (state) {
        // Repopulate hot cache from DB
        const sieveEntries = await fetchRecentSieveEntries(50);
        state = { ...state, recentSieveEntries: sieveEntries };

        // Reload event templates from seed (always fresh)
        const { loadSeedData: loadFresh } = await import('./engine/seed-loader');
        const freshSeed = loadFresh();
        state = { ...state, eventTemplates: freshSeed.eventTemplates };

        console.log(`[Urwerk] Resumed at tick ${state.currentTick} (${state.inWorldDate})`);
      }
    } else {
      console.log('[Urwerk] No snapshots found — starting fresh.');
    }
  }

  if (!state) {
    state = loadSeedData();
    const stress = computeStressScore(state.metrics);
    console.log(`[Urwerk] Stress score at tick 0: ${(stress * 100).toFixed(1)}%`);
  }

  // Step 3 — run simulation
  console.log(`[Urwerk] Running ${TICKS_TO_RUN} ticks...\n`);
  const finalState = run(state, TICKS_TO_RUN);

  console.log(`\n[Urwerk] Simulation complete.`);
  console.log(`[Urwerk] Final date: ${finalState.inWorldDate}`);
  console.log(`[Urwerk] Active events: ${finalState.activeEvents.length}`);
  console.log(`[Urwerk] Pending impacts: ${finalState.pendingImpacts.length}`);

  logSieveSummary(finalState);

  // Step 4 — persist world state and sieve
  if (dbHealthy) {
    console.log('\n[Urwerk] Persisting world state...');
    await saveWorldSnapshot(finalState);
    await bulkUpsertSieveEntries(finalState.recentSieveEntries);
  }

  // Step 5 — publish newspaper
  console.log('\n[Urwerk] Publishing Der Weidenbote...');
  await publishEdition(finalState);

  // Step 6 — clean shutdown
  if (dbHealthy) {
    await closeDb();
  }

  console.log('\n[Urwerk] Done.');
}

main().catch(err => {
  console.error('[Urwerk] Fatal error:', err);
  process.exit(1);
});