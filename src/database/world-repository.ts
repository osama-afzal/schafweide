import type { WorldState } from '../types';
import { getDb } from './connection';

// ============================================================
// WORLD STATE REPOSITORY
// Saves and loads WorldState snapshots to Postgres.
//
// The full WorldState is serialized as JSONB — this is
// pragmatic for a PoC. In a production system you'd
// normalize more of it. For now, one blob per snapshot
// keeps the persistence layer simple while we iterate
// on the WorldState shape.
//
// We strip the eventTemplates from the snapshot since
// those are always loaded fresh from seed data on startup.
// ============================================================

interface SnapshotRow {
  id: number;
  city_name: string;
  tick: number;
  in_world_date: string;
  in_world_year: number;
  state_blob: WorldState;
  saved_at: Date;
}

// ============================================================
// SAVE SNAPSHOT
// Persists the current world state to Postgres.
// Upserts on tick — only one snapshot per tick.
// ============================================================

export async function saveWorldSnapshot(state: WorldState): Promise<void> {
  const sql = getDb();

  // Strip event templates — always reloaded from seed on startup
  const { eventTemplates: _, ...stateToSave } = state;

  await sql`
    INSERT INTO world_snapshots (
      city_name,
      tick,
      in_world_date,
      in_world_year,
      state_blob
    ) VALUES (
      ${state.cityName},
      ${state.currentTick},
      ${state.inWorldDate},
      ${state.inWorldYear},
      ${sql.json(stateToSave as unknown as Record<string, any>)}
    )
    ON CONFLICT (tick) DO UPDATE SET
      state_blob    = EXCLUDED.state_blob,
      in_world_date = EXCLUDED.in_world_date,
      saved_at      = NOW()
  `;

  console.log(`[DB] World snapshot saved at tick ${state.currentTick} (${state.inWorldDate})`);
}

// ============================================================
// LOAD LATEST SNAPSHOT
// Loads the most recent world snapshot from Postgres.
// Returns null if no snapshots exist (fresh start).
// ============================================================

export async function loadLatestSnapshot(): Promise<WorldState | null> {
  const sql = getDb();

  const rows = await sql<SnapshotRow[]>`
    SELECT *
    FROM world_snapshots
    ORDER BY tick DESC
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0]!;
  console.log(
    `[DB] Loaded snapshot: tick ${row.tick} (${row.in_world_date})`
  );

  return row.state_blob;
}

// ============================================================
// LOAD SNAPSHOT AT TICK
// Loads a specific snapshot by tick number.
// Used for historical replay or debugging.
// ============================================================

export async function loadSnapshotAtTick(
  tick: number
): Promise<WorldState | null> {
  const sql = getDb();

  const rows = await sql<SnapshotRow[]>`
    SELECT *
    FROM world_snapshots
    WHERE tick = ${tick}
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  return rows[0]!.state_blob;
}

// ============================================================
// LIST SNAPSHOTS
// Returns a summary of all saved snapshots.
// ============================================================

export async function listSnapshots(): Promise<{
  tick: number;
  inWorldDate: string;
  savedAt: Date;
}[]> {
  const sql = getDb();

  const rows = await sql<{
    tick: number;
    in_world_date: string;
    saved_at: Date;
  }[]>`
    SELECT tick, in_world_date, saved_at
    FROM world_snapshots
    ORDER BY tick ASC
  `;

  return rows.map(row => ({
    tick: row.tick,
    inWorldDate: row.in_world_date,
    savedAt: row.saved_at,
  }));
}

// ============================================================
// SNAPSHOT COUNT
// ============================================================

export async function countSnapshots(): Promise<number> {
  const sql = getDb();
  const result = await sql<{ count: string }[]>`
    SELECT COUNT(*) as count FROM world_snapshots
  `;
  return parseInt(result[0]!.count, 10);
}