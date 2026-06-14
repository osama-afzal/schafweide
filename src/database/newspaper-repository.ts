import type { WorldState } from '../types';
import type { EditionSelection } from '../newspaper/selector';
import { getDb } from './connection';

// ============================================================
// NEWSPAPER REPOSITORY
// Records published newspaper editions to Postgres.
// The markdown file is the primary artifact;
// this table enables historical queries.
// ============================================================

export async function saveEdition(
  state: WorldState,
  selection: EditionSelection,
  markdownFilename: string,
  markdownContent: string
): Promise<void> {
  const sql = getDb();
  const m = state.metrics;

  await sql`
    INSERT INTO newspaper_editions (
      edition_date,
      simulation_tick,
      coverage_from_tick,
      coverage_to_tick,
      coverage_from_date,
      coverage_to_date,
      trade_flow,
      wool_price,
      guild_tension,
      church_influence,
      council_legitimacy,
      public_unrest,
      press_status,
      editorial_pressure,
      suppressed_topics,
      lead_story_sieve_id,
      secondary_story_ids,
      brief_item_ids,
      markdown_filename,
      markdown_content
    ) VALUES (
      ${state.inWorldDate},
      ${state.currentTick},
      ${selection.coveragePeriod.fromTick},
      ${selection.coveragePeriod.toTick},
      ${selection.coveragePeriod.fromDate},
      ${selection.coveragePeriod.toDate},
      ${m.economic.tradeFlow},
      ${m.economic.woolMarketPrice},
      ${m.economic.guildTension},
      ${m.political.churchInfluence},
      ${m.political.councilLegitimacy},
      ${m.social.publicUnrest},
      ${m.infrastructure.pressOperationalStatus},
      ${selection.editorialPressure},
      ${selection.suppressedTopics},
      ${selection.leadStory.id},
      ${selection.secondaryStories.map(s => s.id)},
      ${selection.briefItems.map(b => b.id)},
      ${markdownFilename},
      ${markdownContent}
    )
  `;

  console.log(`[DB] Edition recorded: ${state.inWorldDate}`);
}

// ============================================================
// FETCH EDITIONS
// Returns a summary of all published editions.
// ============================================================

export async function listEditions(): Promise<{
  editionDate: string;
  simulationTick: number;
  markdownFilename: string;
  publishedAt: Date;
}[]> {
  const sql = getDb();

  const rows = await sql<{
    edition_date: string;
    simulation_tick: number;
    markdown_filename: string;
    published_at: Date;
  }[]>`
    SELECT edition_date, simulation_tick, markdown_filename, published_at
    FROM newspaper_editions
    ORDER BY simulation_tick ASC
  `;

  return rows.map(row => ({
    editionDate: row.edition_date,
    simulationTick: row.simulation_tick,
    markdownFilename: row.markdown_filename,
    publishedAt: row.published_at,
  }));
}