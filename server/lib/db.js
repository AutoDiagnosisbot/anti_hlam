const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://anti_hlam:anti_hlam_dev_password@127.0.0.1:5433/anti_hlam';

const pool = new Pool({
  connectionString: connectionString,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS places (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      qr_string TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, qr_string)
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      qr_string TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, qr_string)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_places_user_id ON places(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_place_id ON items(place_id);
  `);
}

async function close() {
  await pool.end();
}

module.exports = {
  close: close,
  ensureSchema: ensureSchema,
  query: query,
};
