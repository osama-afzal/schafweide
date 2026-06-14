import postgres from 'postgres';

// ============================================================
// DATABASE CONNECTION
// Single shared connection pool for the entire application.
// Uses the postgres package — raw SQL, no ORM.
//
// Connection string reads from environment or falls back
// to the docker-compose defaults.
// ============================================================

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgres://urwerk:schafweide1467@localhost:5434/schafweide';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(CONNECTION_STRING, {
      max: 5,              // connection pool size
      idle_timeout: 30,    // close idle connections after 30s
      connect_timeout: 10, // fail fast if DB is unreachable
      onnotice: () => {},  // suppress NOTICE messages from init.sql
    });
  }
  return _sql;
}

// ============================================================
// HEALTH CHECK
// Verifies the database is reachable before running.
// ============================================================

export async function checkDbHealth(): Promise<boolean> {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// CLOSE
// Gracefully closes the connection pool.
// Call this when the process is shutting down.
// ============================================================

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}