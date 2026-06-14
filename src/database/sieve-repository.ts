import type { SieveEntry } from '../types';
import { getDb } from './connection';

// ============================================================
// SIEVE REPOSITORY
// Handles persistence of sieve entries to Postgres.
//
// The in-memory hot cache holds the most recent N entries.
// This repository is the source of truth for the full history.
// When entries age out of the hot cache they remain here,
// compressed to SUMMARY or FRAGMENT fidelity.
// ============================================================

// ============================================================
// UPSERT
// Inserts a new sieve entry or updates an existing one.
// Called when writeSieveEntry adds to the hot cache.
// ============================================================

export async function upsertSieveEntry(entry: SieveEntry): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO sieve_entries (
      id,
      tick,
      in_world_date,
      description,
      summary,
      fragment,
      current_fidelity,
      tags,
      magnitude,
      institution_refs,
      poi_refs,
      location_ref,
      caused_by,
      caused,
      embedding,
      updated_at
    ) VALUES (
      ${entry.id},
      ${entry.tick},
      ${entry.inWorldDate},
      ${entry.description},
      ${entry.summary},
      ${entry.fragment},
      ${entry.currentFidelity},
      ${entry.tags},
      ${entry.magnitude},
      ${entry.institutionRefs},
      ${entry.poiRefs},
      ${entry.locationRef ?? null},
      ${entry.causedBy},
      ${entry.caused},
      ${null},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      current_fidelity = EXCLUDED.current_fidelity,
      caused           = EXCLUDED.caused,
      caused_by        = EXCLUDED.caused_by,
      updated_at       = NOW()
  `;
}

// ============================================================
// BULK UPSERT
// Upserts multiple entries at once.
// Used when persisting the full hot cache.
// ============================================================

export async function bulkUpsertSieveEntries(
  entries: SieveEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  // Run upserts in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(upsertSieveEntry));
  }

  console.log(`[DB] Upserted ${entries.length} sieve entries`);
}

// ============================================================
// FETCH RECENT
// Loads the most recent N entries from Postgres.
// Used to repopulate the hot cache on startup.
// ============================================================

export async function fetchRecentSieveEntries(
  limit: number = 50
): Promise<SieveEntry[]> {
  const sql = getDb();

  const rows = await sql<{
    id: string;
    tick: number;
    in_world_date: string;
    description: string;
    summary: string;
    fragment: string;
    current_fidelity: string;
    tags: string[];
    magnitude: number;
    institution_refs: string[];
    poi_refs: string[];
    location_ref: string | null;
    caused_by: string[];
    caused: string[];
  }[]>`
    SELECT
      id,
      tick,
      in_world_date,
      description,
      summary,
      fragment,
      current_fidelity,
      tags,
      magnitude,
      institution_refs,
      poi_refs,
      location_ref,
      caused_by,
      caused
    FROM sieve_entries
    ORDER BY tick DESC
    LIMIT ${limit}
  `;

  // Return in chronological order (oldest first)
  return rows.reverse().map(row => ({
    id: row.id,
    tick: row.tick,
    inWorldDate: row.in_world_date,
    description: row.description,
    summary: row.summary,
    fragment: row.fragment,
    currentFidelity: row.current_fidelity as SieveEntry['currentFidelity'],
    tags: row.tags as SieveEntry['tags'],
    magnitude: row.magnitude as SieveEntry['magnitude'],
    institutionRefs: row.institution_refs,
    poiRefs: row.poi_refs,
    locationRef: row.location_ref ?? undefined,
    causedBy: row.caused_by,
    caused: row.caused,
    embedding: null,
  }));
}

// ============================================================
// FETCH BY TAGS
// Returns sieve entries matching any of the given tags.
// Used for historical context queries.
// ============================================================

export async function fetchSieveEntriesByTags(
  tags: string[],
  limit: number = 10
): Promise<SieveEntry[]> {
  const sql = getDb();

  const rows = await sql<{
    id: string;
    tick: number;
    in_world_date: string;
    description: string;
    summary: string;
    fragment: string;
    current_fidelity: string;
    tags: string[];
    magnitude: number;
    institution_refs: string[];
    poi_refs: string[];
    location_ref: string | null;
    caused_by: string[];
    caused: string[];
  }[]>`
    SELECT
      id,
      tick,
      in_world_date,
      description,
      summary,
      fragment,
      current_fidelity,
      tags,
      magnitude,
      institution_refs,
      poi_refs,
      location_ref,
      caused_by,
      caused
    FROM sieve_entries
    WHERE tags && ${tags}
    ORDER BY magnitude DESC, tick DESC
    LIMIT ${limit}
  `;

  return rows.map(row => ({
    id: row.id,
    tick: row.tick,
    inWorldDate: row.in_world_date,
    description: row.description,
    summary: row.summary,
    fragment: row.fragment,
    currentFidelity: row.current_fidelity as SieveEntry['currentFidelity'],
    tags: row.tags as SieveEntry['tags'],
    magnitude: row.magnitude as SieveEntry['magnitude'],
    institutionRefs: row.institution_refs,
    poiRefs: row.poi_refs,
    locationRef: row.location_ref ?? undefined,
    causedBy: row.caused_by,
    caused: row.caused,
    embedding: null,
  }));
}

// ============================================================
// COUNT
// Returns the total number of sieve entries in the database.
// ============================================================

export async function countSieveEntries(): Promise<number> {
  const sql = getDb();
  const result = await sql<{ count: string }[]>`
    SELECT COUNT(*) as count FROM sieve_entries
  `;
  return parseInt(result[0]!.count, 10);
}