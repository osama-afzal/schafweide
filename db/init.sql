-- ============================================================
-- SCHAFWEIDE DATABASE SCHEMA
-- Initialized on first container start.
-- pgvector extension enabled for future semantic sieve search.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- WORLD STATE SNAPSHOTS
-- Full world state serialized as JSONB.
-- Saved periodically and on demand.
-- Used to resume simulation from a known point.
-- ============================================================

CREATE TABLE IF NOT EXISTS world_snapshots (
  id              SERIAL PRIMARY KEY,
  city_name       TEXT NOT NULL DEFAULT 'Schafweide',
  tick            INTEGER NOT NULL,
  in_world_date   TEXT NOT NULL,
  in_world_year   INTEGER NOT NULL,
  state_blob      JSONB NOT NULL,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Quick lookup by tick
  CONSTRAINT unique_snapshot_tick UNIQUE (tick)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_tick
  ON world_snapshots (tick DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_year
  ON world_snapshots (in_world_year);

-- ============================================================
-- SIEVE ENTRIES
-- The engine's long-term memory.
-- Hot cache lives in memory; full history lives here.
-- Fidelity degrades over time based on magnitude.
-- ============================================================

CREATE TABLE IF NOT EXISTS sieve_entries (
  id                TEXT PRIMARY KEY,
  tick              INTEGER NOT NULL,
  in_world_date     TEXT NOT NULL,

  -- Content at different fidelity levels
  description       TEXT NOT NULL,
  summary           TEXT NOT NULL,
  fragment          TEXT NOT NULL,
  current_fidelity  TEXT NOT NULL DEFAULT 'FULL'
                    CHECK (current_fidelity IN ('FULL', 'SUMMARY', 'FRAGMENT')),

  -- Classification
  tags              TEXT[] NOT NULL DEFAULT '{}',
  magnitude         INTEGER NOT NULL CHECK (magnitude BETWEEN 1 AND 5),

  -- Entity references
  institution_refs  TEXT[] NOT NULL DEFAULT '{}',
  poi_refs          TEXT[] NOT NULL DEFAULT '{}',
  location_ref      TEXT,

  -- Causal linkage
  caused_by         TEXT[] NOT NULL DEFAULT '{}',
  caused            TEXT[] NOT NULL DEFAULT '{}',

  -- Semantic search placeholder — populated when pgvector
  -- integration is added
  embedding         vector(384),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sieve_tick
  ON sieve_entries (tick DESC);

CREATE INDEX IF NOT EXISTS idx_sieve_magnitude
  ON sieve_entries (magnitude DESC);

CREATE INDEX IF NOT EXISTS idx_sieve_tags
  ON sieve_entries USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_sieve_institution_refs
  ON sieve_entries USING GIN (institution_refs);

CREATE INDEX IF NOT EXISTS idx_sieve_poi_refs
  ON sieve_entries USING GIN (poi_refs);

-- Future: vector similarity index
-- CREATE INDEX ON sieve_entries
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- ============================================================
-- NEWSPAPER EDITIONS
-- Record of every published edition.
-- The markdown file is the primary artifact;
-- this table enables historical queries.
-- ============================================================

CREATE TABLE IF NOT EXISTS newspaper_editions (
  id                  SERIAL PRIMARY KEY,
  edition_date        TEXT NOT NULL,
  simulation_tick     INTEGER NOT NULL,
  coverage_from_tick  INTEGER NOT NULL,
  coverage_to_tick    INTEGER NOT NULL,
  coverage_from_date  TEXT NOT NULL,
  coverage_to_date    TEXT NOT NULL,

  -- Snapshot of world state at publication
  trade_flow          NUMERIC(5,1),
  wool_price          NUMERIC(5,1),
  guild_tension       NUMERIC(5,1),
  church_influence    NUMERIC(5,1),
  council_legitimacy  NUMERIC(5,1),
  public_unrest       NUMERIC(5,1),
  press_status        NUMERIC(5,1),

  -- Editorial context
  editorial_pressure  NUMERIC(4,2),
  suppressed_topics   TEXT[] DEFAULT '{}',

  -- Story references
  lead_story_sieve_id       TEXT REFERENCES sieve_entries(id),
  secondary_story_ids       TEXT[] DEFAULT '{}',
  brief_item_ids            TEXT[] DEFAULT '{}',

  -- File output
  markdown_filename   TEXT NOT NULL,
  markdown_content    TEXT,

  published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_editions_tick
  ON newspaper_editions (simulation_tick DESC);

CREATE INDEX IF NOT EXISTS idx_editions_year
  ON newspaper_editions (edition_date);

-- ============================================================
-- SIMULATION RUNS
-- Tracks distinct simulation runs for multi-run analysis.
-- ============================================================

CREATE TABLE IF NOT EXISTS simulation_runs (
  id          SERIAL PRIMARY KEY,
  city_name   TEXT NOT NULL DEFAULT 'Schafweide',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  total_ticks INTEGER,
  notes       TEXT
);