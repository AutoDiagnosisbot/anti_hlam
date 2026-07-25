const crypto = require('crypto');
const express = require('express');
const db = require('../lib/db');

const router = express.Router();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanUsername(value) {
  return cleanText(value).toLowerCase();
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
}

function toIso(value) {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
  };
}

function mapPlace(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    qr_string: row.qr_string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    items: [],
  };
}

function mapItem(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    place_id: row.place_id,
    name: row.name,
    qr_string: row.qr_string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function error(res, statusCode, description) {
  res.status(statusCode).json({
    status: 'error',
    result: false,
    description: description,
  });
}

async function createSession(userId) {
  const sessionId = makeToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query('DELETE FROM sessions WHERE expires_at <= now() OR user_id = $1', [userId]);
  await db.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [sessionId, userId, expiresAt]
  );

  return {
    id: sessionId,
    expiresAt: expiresAt.toISOString(),
  };
}

async function authenticate(sessionId) {
  const id = cleanText(sessionId);
  if (!id) {
    return null;
  }

  const result = await db.query(
    `SELECT users.id, users.username
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = $1
        AND sessions.expires_at > now()
      LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function requireUser(req, res) {
  const user = await authenticate(req.body.session_id);
  if (!user) {
    error(res, 401, 'Session is invalid or expired.');
    return null;
  }
  return user;
}

async function getFullList(userId) {
  const placesResult = await db.query(
    `SELECT id, user_id, name, qr_string, created_at, updated_at
       FROM places
      WHERE user_id = $1
      ORDER BY lower(name), id`,
    [userId]
  );

  const itemsResult = await db.query(
    `SELECT id, user_id, place_id, name, qr_string, created_at, updated_at
       FROM items
      WHERE user_id = $1
      ORDER BY lower(name), id`,
    [userId]
  );

  const places = placesResult.rows.map(mapPlace);
  const items = itemsResult.rows.map(mapItem);
  const placesById = {};

  places.forEach(function indexPlace(place) {
    placesById[place.id] = place;
  });

  items.forEach(function attachItem(item) {
    if (item.place_id && placesById[item.place_id]) {
      placesById[item.place_id].items.push(item);
    }
  });

  const unplacedItems = items.filter(function withoutPlace(item) {
    return !item.place_id || !placesById[item.place_id];
  });

  const rows = items.map(function mapRow(item) {
    const place = item.place_id ? placesById[item.place_id] : null;
    return {
      place_name: place ? place.name : '',
      place_id: place ? place.id : null,
      item_name: item.name,
      item_id: item.id,
      item_qr_string: item.qr_string,
      place_qr_string: place ? place.qr_string : '',
    };
  });

  return {
    places: places,
    unplacedItems: unplacedItems,
    rows: rows,
  };
}

async function getPlaceWithItems(userId, placeRow) {
  const place = mapPlace(placeRow);
  const itemsResult = await db.query(
    `SELECT id, user_id, place_id, name, qr_string, created_at, updated_at
       FROM items
      WHERE user_id = $1 AND place_id = $2
      ORDER BY lower(name), id`,
    [userId, place.id]
  );
  place.items = itemsResult.rows.map(mapItem);
  return place;
}

async function getItemWithPlace(userId, itemRow) {
  const item = mapItem(itemRow);
  if (!item.place_id) {
    item.place = null;
    return item;
  }

  const placeResult = await db.query(
    `SELECT id, user_id, name, qr_string, created_at, updated_at
       FROM places
      WHERE user_id = $1 AND id = $2
      LIMIT 1`,
    [userId, item.place_id]
  );
  item.place = placeResult.rows[0] ? mapPlace(placeResult.rows[0]) : null;
  return item;
}

router.get('/health', asyncHandler(async function health(req, res) {
  await db.query('SELECT 1');
  res.json({ status: 'ok', app: 'anti-hlam-api', database: 'postgres' });
}));

router.post('/register', asyncHandler(async function register(req, res) {
  const username = cleanUsername(req.body.username);
  const password = cleanText(req.body.password);

  if (!username || !password) {
    error(res, 400, 'Username and password are required.');
    return;
  }

  if (username.length < 3 || password.length < 4) {
    error(res, 400, 'Username must be at least 3 characters and password at least 4 characters.');
    return;
  }

  const salt = makeToken();
  let insertResult;

  try {
    insertResult = await db.query(
      `INSERT INTO users (username, password_salt, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username`,
      [username, salt, hashPassword(password, salt)]
    );
  } catch (err) {
    if (err && err.code === '23505') {
      error(res, 409, 'User already exists.');
      return;
    }
    throw err;
  }

  const user = insertResult.rows[0];
  const session = await createSession(user.id);

  res.json({
    status: 'ok',
    result: true,
    session_id: session.id,
    user: mapUser(user),
  });
}));

router.post('/authorize', asyncHandler(async function authorize(req, res) {
  const username = cleanUsername(req.body.username);
  const password = cleanText(req.body.password);

  if (!username || !password) {
    error(res, 400, 'Username and password are required.');
    return;
  }

  const userResult = await db.query(
    `SELECT id, username, password_salt, password_hash
       FROM users
      WHERE username = $1
      LIMIT 1`,
    [username]
  );
  const user = userResult.rows[0];

  if (!user || hashPassword(password, user.password_salt) !== user.password_hash) {
    error(res, 401, 'Invalid username or password.');
    return;
  }

  const session = await createSession(user.id);

  res.json({
    status: 'ok',
    session_id: session.id,
    user: mapUser(user),
  });
}));

router.post('/logout', asyncHandler(async function logout(req, res) {
  await db.query('DELETE FROM sessions WHERE id = $1', [cleanText(req.body.session_id)]);
  res.json({ status: 'ok', result: true });
}));

router.post('/get_full_list', asyncHandler(async function fullList(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const list = await getFullList(user.id);
  res.json(Object.assign({
    status: 'ok',
    result: true,
  }, list));
}));

router.post('/resolve_qr', asyncHandler(async function resolveQr(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const qrString = cleanText(req.body.qr_string);
  if (!qrString) {
    error(res, 400, 'qr_string is required.');
    return;
  }

  const placeResult = await db.query(
    `SELECT id, user_id, name, qr_string, created_at, updated_at
       FROM places
      WHERE user_id = $1 AND qr_string = $2
      LIMIT 1`,
    [user.id, qrString]
  );
  if (placeResult.rows[0]) {
    res.json({
      status: 'ok',
      result: true,
      found: true,
      type: 'place',
      place: await getPlaceWithItems(user.id, placeResult.rows[0]),
    });
    return;
  }

  const itemResult = await db.query(
    `SELECT id, user_id, place_id, name, qr_string, created_at, updated_at
       FROM items
      WHERE user_id = $1 AND qr_string = $2
      LIMIT 1`,
    [user.id, qrString]
  );
  if (itemResult.rows[0]) {
    res.json({
      status: 'ok',
      result: true,
      found: true,
      type: 'item',
      item: await getItemWithPlace(user.id, itemResult.rows[0]),
    });
    return;
  }

  res.json({
    status: 'ok',
    result: true,
    found: false,
    type: qrString.indexOf('place:') === 0 ? 'place' : qrString.indexOf('item:') === 0 ? 'item' : 'unknown',
    qr_string: qrString,
  });
}));

router.post('/save_place', asyncHandler(async function savePlace(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const qrString = cleanText(req.body.qr_string);
  const name = cleanText(req.body.name);

  if (qrString.indexOf('place:') !== 0) {
    error(res, 400, 'Place QR must start with place:.');
    return;
  }

  if (!name) {
    error(res, 400, 'Place name is required.');
    return;
  }

  const placeResult = await db.query(
    `INSERT INTO places (user_id, name, qr_string)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, qr_string)
     DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id, user_id, name, qr_string, created_at, updated_at`,
    [user.id, name, qrString]
  );

  res.json({
    status: 'ok',
    result: true,
    place: await getPlaceWithItems(user.id, placeResult.rows[0]),
  });
}));

router.post('/save_item', asyncHandler(async function saveItem(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const qrString = cleanText(req.body.qr_string);
  const name = cleanText(req.body.name);
  const placeQrString = cleanText(req.body.place_qr_string);
  const placeId = Number(req.body.place_id || 0);

  if (qrString.indexOf('item:') !== 0) {
    error(res, 400, 'Item QR must start with item:.');
    return;
  }

  if (!name) {
    error(res, 400, 'Item name is required.');
    return;
  }

  let placeResult;
  if (placeId) {
    placeResult = await db.query(
      `SELECT id
         FROM places
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [user.id, placeId]
    );
  } else if (placeQrString) {
    placeResult = await db.query(
      `SELECT id
         FROM places
        WHERE user_id = $1 AND qr_string = $2
        LIMIT 1`,
      [user.id, placeQrString]
    );
  } else {
    placeResult = { rows: [] };
  }

  if (!placeResult.rows[0]) {
    error(res, 400, 'Select an existing place before saving an item.');
    return;
  }

  const itemResult = await db.query(
    `INSERT INTO items (user_id, place_id, name, qr_string)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, qr_string)
     DO UPDATE SET place_id = EXCLUDED.place_id, name = EXCLUDED.name, updated_at = now()
     RETURNING id, user_id, place_id, name, qr_string, created_at, updated_at`,
    [user.id, placeResult.rows[0].id, name, qrString]
  );

  res.json({
    status: 'ok',
    result: true,
    item: await getItemWithPlace(user.id, itemResult.rows[0]),
  });
}));

router.post('/delete_place', asyncHandler(async function deletePlace(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const placeId = Number(req.body.place_id || 0);
  const result = await db.query(
    `DELETE FROM places
      WHERE user_id = $1 AND id = $2
      RETURNING id`,
    [user.id, placeId]
  );

  if (!result.rows[0]) {
    error(res, 404, 'Place was not found.');
    return;
  }

  res.json({ status: 'ok', result: true });
}));

router.post('/delete_item', asyncHandler(async function deleteItem(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const itemId = Number(req.body.item_id || 0);
  const result = await db.query(
    `DELETE FROM items
      WHERE user_id = $1 AND id = $2
      RETURNING id`,
    [user.id, itemId]
  );

  if (!result.rows[0]) {
    error(res, 404, 'Item was not found.');
    return;
  }

  res.json({ status: 'ok', result: true });
}));

router.use(function apiErrorHandler(err, req, res, next) {
  console.error(err);
  error(res, 500, 'Internal server error.');
});

module.exports = router;
