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
      parent_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      qr_string TEXT NOT NULL,
      photo_file TEXT,
      photo_mime TEXT,
      photo_original_name TEXT,
      photo_size INTEGER,
      photo_uploaded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, qr_string)
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      qr_string TEXT NOT NULL,
      photo_file TEXT,
      photo_mime TEXT,
      photo_original_name TEXT,
      photo_size INTEGER,
      photo_uploaded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, qr_string)
    );

    CREATE TABLE IF NOT EXISTS entity_photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('place', 'item')),
      place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime TEXT,
      original_name TEXT,
      size INTEGER,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        (target_type = 'place' AND place_id IS NOT NULL AND item_id IS NULL)
        OR
        (target_type = 'item' AND item_id IS NOT NULL AND place_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_places_user_id ON places(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_items_place_id ON items(place_id);
    CREATE INDEX IF NOT EXISTS idx_entity_photos_place_id ON entity_photos(place_id);
    CREATE INDEX IF NOT EXISTS idx_entity_photos_item_id ON entity_photos(item_id);
    CREATE INDEX IF NOT EXISTS idx_entity_photos_user_target ON entity_photos(user_id, target_type);

    ALTER TABLE places ADD COLUMN IF NOT EXISTS parent_place_id INTEGER;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_file TEXT;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_mime TEXT;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_original_name TEXT;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_size INTEGER;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;

    ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_file TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_mime TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_original_name TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_size INTEGER;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;
    ALTER TABLE items ALTER COLUMN place_id DROP NOT NULL;
    ALTER TABLE entity_photos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_places_parent_place_id ON places(parent_place_id);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'places_parent_place_id_fkey'
      ) THEN
        ALTER TABLE places
          ADD CONSTRAINT places_parent_place_id_fkey
          FOREIGN KEY (parent_place_id) REFERENCES places(id) ON DELETE SET NULL;
      END IF;
    END $$;

    INSERT INTO entity_photos (
      user_id, target_type, place_id, file_name, mime, original_name, size, uploaded_at, sort_order
    )
    SELECT p.user_id, 'place', p.id, p.photo_file, p.photo_mime, p.photo_original_name,
           p.photo_size, COALESCE(p.photo_uploaded_at, p.updated_at, p.created_at, now()), 0
      FROM places p
     WHERE p.photo_file IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM entity_photos ep
          WHERE ep.user_id = p.user_id
            AND ep.target_type = 'place'
            AND ep.place_id = p.id
            AND ep.file_name = p.photo_file
       );

    INSERT INTO entity_photos (
      user_id, target_type, item_id, file_name, mime, original_name, size, uploaded_at, sort_order
    )
    SELECT i.user_id, 'item', i.id, i.photo_file, i.photo_mime, i.photo_original_name,
           i.photo_size, COALESCE(i.photo_uploaded_at, i.updated_at, i.created_at, now()), 0
      FROM items i
     WHERE i.photo_file IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM entity_photos ep
          WHERE ep.user_id = i.user_id
            AND ep.target_type = 'item'
            AND ep.item_id = i.id
            AND ep.file_name = i.photo_file
       );
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
