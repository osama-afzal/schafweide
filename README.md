# Schafweide

A world simulator that doesn't care what story it tells.

**Urwerk** is a deterministic-but-emergent simulation engine modeling the macro-level life of a single Holy Roman Empire market town at the dawn of the printing press. It tracks economic, political, social, and infrastructure metrics; propagates causally-linked events through a weighted dice system; and writes its own long-term memory into a lossy, magnitude-weighted archive called **the sieve**. A local LLM, **Der Weidenbote**, reads that memory and the current state of the world and publishes a newspaper — the only window the outside observer gets into Schafweide's unfolding history.

The engine is indifferent to whether what it produces is a golden age or a collapse. It just propagates numbers according to the rules it's given. The newspaper, written by people *inside* the simulation, is not indifferent at all; rather, it has opinions, blind spots, and a Church looking over its shoulder.

## What this actually is

Three systems stacked on top of each other:

1. **The simulation layer** (`src/engine`, `src/dice`) — a tick-based engine that advances Schafweide's economic, political, social, and infrastructure metrics. A weighted dice rolls each tick against a pool of hand-authored event templates, conditioned on the town's current state. Crisis metrics get a guaranteed roll so the world can't get permanently stuck.

2. **The memory layer** (`src/sieve`) — every resolved event becomes a sieve entry: a tagged, magnitude-weighted, causally-linked record. Entries decay from full description to summary to a single-line fragment over time, depending on how significant they were. The sieve is deliberately lossy; it remembers the way a society remembers, not the way a database logs.

3. **The narrative layer** (`src/newspaper`) — a local LLM (via Ollama) reads the sieve, the current metrics, and Der Weidenbote's editorial constraints, and writes an actual newspaper edition in period-appropriate prose. The press has its own operational status, its own relationship with the Church and council, and its own incentive to occasionally suppress a story it can't safely print.

Persistence (`src/database`) is Postgres with pgvector pre-installed; world state, the full sieve, and every newspaper edition survive past a single process run. The sieve's hot cache (50 entries) is just a working set; the database is the actual long-term memory, and it's already wired for semantic search once tag-matching alone isn't enough.

## The setting

**Schafweide**, a wool market town of roughly 2,400 people in the foothills east of the Rhine, spring 1467. The Thursday market is its economic heartbeat. Three guild families — Brenner (wool), Kessler (tanners, carrying the social stigma of an *unehrlich* trade), and Hartmann (mill and river crossing) — govern through a council that performs unity while nursing real rivalries. A monastery on the hill controls most of the town's literacy. Six months before the simulation begins, a minor merchant named **Heinrich Voss** returned from an apprenticeship in Mainz with a printing press and founded ***Der Weidenbote*** — The Pasture Messenger.

Everything that happens afterward is the engine's unbiased prerogative.

## Architecture

```
src/
├── types/          Core data model — sieve, metrics, entities, events, world state
├── engine/          Urwerk itself — tick loop, config, seed loader, metric resolver, impact pipeline
├── dice/            Weighted event selection, crisis detection, named-actor resolution
├── sieve/           Memory writer, fidelity decay, causal ancestry, querying
├── newspaper/       Story selection, prompt construction, Ollama client, markdown rendering
├── database/        Postgres persistence — world snapshots, sieve entries, newspaper editions
└── index.ts         Entry point — orchestrates a full run

data/seed/           Schafweide's 1467 baseline + the hand-authored event template catalog
db/init.sql          Schema: world_snapshots, sieve_entries, newspaper_editions, simulation_runs
output/newspapers/   Published .md editions of Der Weidenbote
```

### Design principles this was built on

- **The engine is value-neutral.** It doesn't protect favorite outcomes or steer toward satisfying narratives. A plague is just a mortality variable propagating through dependent metrics.
- **POIs are earned.** Individuals start as anonymous population aggregates. The engine promotes someone to a named, tracked Person of Interest only when causal centrality (they sit at the intersection of multiple active causal chains) and external nomination (a specific event requires a named actor) converge. Most of Schafweide's history has no named protagonist, only characters that fade in and out of its emergent story.
- **Causality is entirely emergent.** Templates have conditions and impacts; the dice consults current state to weight probability. "The bridge toll dispute causes the labor walkout" is not a pre-coded crisis engineering by a user; the metrics get there on their own through paths unique to each run.
- **The sieve is lossy on purpose.** Significance determines longevity, not recency. A magnitude-5 event almost never decays. A magnitude-1 footnote fades to a fragment within months and may fall out of the hot cache entirely. Real institutional memory works the same way.
- **The newspaper is not the engine's mouthpiece.** Der Weidenbote has its own constraints — an operational status that can be damaged by Church pressure, an editorial voice that gets more cautious under scrutiny, topics it will obliquely avoid rather than print directly. What the reader sees is filtered through a institution with its own stakes.

## Getting started

### Prerequisites

- [Bun](https://bun.sh) — the runtime this project is built on
- [Docker](https://docker.com) — for Postgres with pgvector
- [Ollama](https://ollama.com) — for local LLM inference

### Setup

```bash
# install dependencies
bun install

# start the database
docker-compose up -d

# pull the model (one-time, ~4.7GB)
ollama pull llama3.1
```

### Running a simulation

```bash
# fresh start from the 1467 seed
bun run src/index.ts

# resume from the last saved snapshot
bun run src/index.ts --resume
```

A run advances 52 ticks (one in-world year, at one tick per week), persists the world state and sieve to Postgres, and publishes a newspaper edition to `output/newspapers/` covering the most recently significant events.

### What to expect

The console output is intentionally verbose during development to track every dice roll, every impact (immediate or scheduled), every sieve write. Watching a run tells you more about whether the causal graph is calibrated correctly than any summary would. Newspaper generation can take up to a minute depending on hardware, since it's running entirely local.

## Current state of the simulation

This is a working proof of concept, not a finished simulation. Calibration is ongoing; metric floors, recovery templates, and dice weighting have already been adjusted once after watching Schafweide collapse into a trade-less, Church-dominated husk in early test runs. Twenty event templates currently exist; richer dynamics (more POIs, more institutional drift, deeper sieve queries) are the natural next layer.

What already works end to end:

- Weighted dice rolls against conditional templates, with guaranteed recovery attempts when a metric hits crisis territory
- Multi-tick propagation delays and decay on metric impacts
- Sieve entries with inferred causal ancestry and institution references
- Fidelity decay (FULL → SUMMARY → FRAGMENT) based on event magnitude
- A local LLM writing in-character, period-appropriate newspaper editions with topic suppression under editorial pressure
- **Full Postgres persistence** — world snapshots, complete sieve history (beyond the in-memory hot cache), and every published edition are durably stored. `--resume` reloads the latest snapshot, repopulates the sieve hot cache from the database, and continues the simulation exactly where it left off. A run is no longer a one-shot process — Schafweide's history accumulates across sessions.

## Why "Urwerk"

German for something close to "original mechanism" — the clockwork running underneath, indifferent to what it produces. It doesn't know it's telling a story. That's the newspaper's job.