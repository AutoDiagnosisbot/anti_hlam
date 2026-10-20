const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../lib/db');

const router = express.Router();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const DESCRIPTION_MAX_LENGTH = 250;
const uploadRoot = path.resolve(__dirname, '..', 'uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_SIZE,
    files: 1,
  },
  fileFilter: function imageOnly(req, file, cb) {
    if (!file.mimetype || file.mimetype.indexOf('image/') !== 0) {
      cb(new Error('Only image files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanDescription(value) {
  return cleanText(value);
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

function extensionFromMime(mimeType) {
  const knownTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  return knownTypes[mimeType] || '.img';
}

function photoUrl(userId, fileName) {
  if (!fileName) {
    return null;
  }
  return '/uploads/' + userId + '/' + fileName;
}

function emptyPhotoFields() {
  return {
    photos: [],
    photo_url: null,
    photo_mime: null,
    photo_original_name: null,
    photo_size: null,
    photo_uploaded_at: null,
  };
}

function mapPhoto(row) {
  return {
    id: row.id,
    photo_url: photoUrl(row.user_id, row.file_name),
    photo_mime: row.mime || null,
    photo_original_name: row.original_name || null,
    photo_size: row.size || null,
    photo_uploaded_at: toIso(row.uploaded_at) || null,
  };
}

function applyPhotos(entity, photos) {
  entity.photos = photos;
  const first = photos[0] || null;
  entity.photo_url = first ? first.photo_url : null;
  entity.photo_mime = first ? first.photo_mime : null;
  entity.photo_original_name = first ? first.photo_original_name : null;
  entity.photo_size = first ? first.photo_size : null;
  entity.photo_uploaded_at = first ? first.photo_uploaded_at : null;
  return entity;
}

async function ensureUserUploadDir(userId) {
  const userDir = path.join(uploadRoot, String(userId));
  await fs.promises.mkdir(userDir, { recursive: true });
  return userDir;
}

async function removePhotoFile(userId, fileName) {
  if (!fileName) {
    return;
  }

  const safeName = path.basename(fileName);
  const filePath = path.join(uploadRoot, String(userId), safeName);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      console.warn('Failed to remove photo file:', filePath, err);
    }
  }
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
  };
}

function mapPlace(row) {
  return Object.assign({
    id: row.id,
    user_id: row.user_id,
    parent_place_id: row.parent_place_id || null,
    name: row.name,
    description: row.description || '',
    qr_string: row.qr_string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    items: [],
    child_places: [],
  }, emptyPhotoFields());
}

function mapItem(row) {
  return Object.assign({
    id: row.id,
    user_id: row.user_id,
    place_id: row.place_id,
    name: row.name,
    description: row.description || '',
    qr_string: row.qr_string,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }, emptyPhotoFields());
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

function validateDescription(res, description) {
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    error(res, 400, 'Description must be 250 characters or shorter.');
    return false;
  }
  return true;
}

const PLACE_COLUMNS = `id, user_id, parent_place_id, name, description, qr_string,
                       created_at, updated_at`;
const ITEM_COLUMNS = `id, user_id, place_id, name, description, qr_string,
                      created_at, updated_at`;
const PHOTO_COLUMNS = `id, user_id, target_type, place_id, item_id, file_name, mime,
                       original_name, size, uploaded_at, sort_order, created_at`;

async function attachPhotos(userId, targetType, entities) {
  if (!entities.length) {
    return entities;
  }

  const idColumn = targetType === 'place' ? 'place_id' : 'item_id';
  const ids = entities.map(function mapId(entity) {
    return entity.id;
  });

  const photosResult = await db.query(
    `SELECT ${PHOTO_COLUMNS}
       FROM entity_photos
      WHERE user_id = $1
        AND target_type = $2
        AND deleted_at IS NULL
        AND ${idColumn} = ANY($3::int[])
      ORDER BY sort_order, id`,
    [userId, targetType, ids]
  );

  const photosByTarget = {};
  photosResult.rows.forEach(function groupPhoto(row) {
    const targetId = targetType === 'place' ? row.place_id : row.item_id;
    if (!photosByTarget[targetId]) {
      photosByTarget[targetId] = [];
    }
    photosByTarget[targetId].push(mapPhoto(row));
  });

  entities.forEach(function applyEntityPhotos(entity) {
    applyPhotos(entity, photosByTarget[entity.id] || []);
  });

  return entities;
}

async function placeParentWouldCreateCycle(userId, placeId, parentPlaceId) {
  if (!placeId || !parentPlaceId) {
    return false;
  }

  const result = await db.query(
    `WITH RECURSIVE descendants AS (
       SELECT id, parent_place_id
         FROM places
        WHERE user_id = $1 AND parent_place_id = $2
       UNION ALL
       SELECT p.id, p.parent_place_id
         FROM places p
         JOIN descendants d ON p.parent_place_id = d.id
        WHERE p.user_id = $1
     )
     SELECT 1
       FROM descendants
      WHERE id = $3
      LIMIT 1`,
    [userId, placeId, parentPlaceId]
  );

  return Boolean(result.rows[0]);
}

async function getFullList(userId) {
  const placesResult = await db.query(
    `SELECT ${PLACE_COLUMNS}
       FROM places
      WHERE user_id = $1
      ORDER BY lower(name), id`,
    [userId]
  );

  const itemsResult = await db.query(
    `SELECT ${ITEM_COLUMNS}
       FROM items
      WHERE user_id = $1
      ORDER BY lower(name), id`,
    [userId]
  );

  const places = placesResult.rows.map(mapPlace);
  const items = itemsResult.rows.map(mapItem);
  await attachPhotos(userId, 'place', places);
  await attachPhotos(userId, 'item', items);

  const placesById = {};

  places.forEach(function indexPlace(place) {
    placesById[place.id] = place;
  });

  const rootPlaces = [];
  places.forEach(function attachChildPlace(place) {
    const parent = place.parent_place_id ? placesById[place.parent_place_id] : null;
    if (parent && parent.id !== place.id) {
      parent.child_places.push(place);
      return;
    }
    rootPlaces.push(place);
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
    rootPlaces: rootPlaces,
    unplacedItems: unplacedItems,
    rows: rows,
  };
}

async function getPlaceWithItems(userId, placeRow) {
  const place = mapPlace(placeRow);
  await attachPhotos(userId, 'place', [place]);

  const childPlacesResult = await db.query(
    `SELECT ${PLACE_COLUMNS}
       FROM places
      WHERE user_id = $1 AND parent_place_id = $2
      ORDER BY lower(name), id`,
    [userId, place.id]
  );
  place.child_places = childPlacesResult.rows.map(mapPlace);
  await attachPhotos(userId, 'place', place.child_places);

  const itemsResult = await db.query(
    `SELECT ${ITEM_COLUMNS}
       FROM items
      WHERE user_id = $1 AND place_id = $2
      ORDER BY lower(name), id`,
    [userId, place.id]
  );
  place.items = itemsResult.rows.map(mapItem);
  await attachPhotos(userId, 'item', place.items);
  return place;
}

async function getItemWithPlace(userId, itemRow) {
  const item = mapItem(itemRow);
  await attachPhotos(userId, 'item', [item]);
  if (!item.place_id) {
    item.place = null;
    return item;
  }

  const placeResult = await db.query(
    `SELECT ${PLACE_COLUMNS}
       FROM places
      WHERE user_id = $1 AND id = $2
      LIMIT 1`,
    [userId, item.place_id]
  );
  item.place = placeResult.rows[0] ? mapPlace(placeResult.rows[0]) : null;
  if (item.place) {
    await attachPhotos(userId, 'place', [item.place]);
  }
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
    `SELECT ${PLACE_COLUMNS}
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
    `SELECT ${ITEM_COLUMNS}
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
    type: qrString.indexOf('place:') === 0 ? 'place' : 'item',
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
  const description = cleanDescription(req.body.description);
  const rawParentPlaceId = req.body.parent_place_id;
  const parentPlaceId = rawParentPlaceId === null || rawParentPlaceId === undefined || rawParentPlaceId === ''
    ? null
    : Number(rawParentPlaceId);

  if (qrString.indexOf('place:') !== 0) {
    error(res, 400, 'Place QR must start with place:.');
    return;
  }

  if (!name) {
    error(res, 400, 'Place name is required.');
    return;
  }

  if (!validateDescription(res, description)) {
    return;
  }

  if (parentPlaceId !== null && (!Number.isInteger(parentPlaceId) || parentPlaceId <= 0)) {
    error(res, 400, 'Parent place id is invalid.');
    return;
  }

  if (parentPlaceId !== null) {
    const parentResult = await db.query(
      `SELECT id
         FROM places
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [user.id, parentPlaceId]
    );

    if (!parentResult.rows[0]) {
      error(res, 400, 'Parent place was not found.');
      return;
    }
  }

  const existingPlaceResult = await db.query(
    `SELECT id
       FROM places
      WHERE user_id = $1 AND qr_string = $2
      LIMIT 1`,
    [user.id, qrString]
  );
  const existingPlace = existingPlaceResult.rows[0] || null;
  if (existingPlace && parentPlaceId === existingPlace.id) {
    error(res, 400, 'A place cannot be stored inside itself.');
    return;
  }

  if (existingPlace && await placeParentWouldCreateCycle(user.id, existingPlace.id, parentPlaceId)) {
    error(res, 400, 'A place cannot be stored inside one of its nested places.');
    return;
  }

  const placeResult = await db.query(
    `INSERT INTO places (user_id, parent_place_id, name, description, qr_string)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, qr_string)
     DO UPDATE SET parent_place_id = EXCLUDED.parent_place_id,
                   name = EXCLUDED.name,
                   description = EXCLUDED.description,
                   updated_at = now()
     RETURNING ${PLACE_COLUMNS}`,
    [user.id, parentPlaceId, name, description, qrString]
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
  const description = cleanDescription(req.body.description);
  const placeQrString = cleanText(req.body.place_qr_string);
  const rawPlaceId = req.body.place_id;
  const placeId = rawPlaceId === null || rawPlaceId === undefined || rawPlaceId === ''
    ? null
    : Number(rawPlaceId);

  if (!qrString) {
    error(res, 400, 'Item QR is required.');
    return;
  }

  if (qrString.indexOf('place:') === 0) {
    error(res, 400, 'QR codes that start with place: are reserved for places.');
    return;
  }

  if (!name) {
    error(res, 400, 'Item name is required.');
    return;
  }

  if (!validateDescription(res, description)) {
    return;
  }

  if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) {
    error(res, 400, 'Place id is invalid.');
    return;
  }

  let resolvedPlaceId = null;
  if (placeId !== null) {
    const placeResult = await db.query(
      `SELECT id
         FROM places
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [user.id, placeId]
    );

    if (!placeResult.rows[0]) {
      error(res, 400, 'Selected place was not found.');
      return;
    }

    resolvedPlaceId = placeResult.rows[0].id;
  } else if (placeQrString) {
    const placeResult = await db.query(
      `SELECT id
         FROM places
        WHERE user_id = $1 AND qr_string = $2
        LIMIT 1`,
      [user.id, placeQrString]
    );

    if (!placeResult.rows[0]) {
      error(res, 400, 'Selected place was not found.');
      return;
    }

    resolvedPlaceId = placeResult.rows[0].id;
  }

  const itemResult = await db.query(
    `INSERT INTO items (user_id, place_id, name, description, qr_string)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, qr_string)
     DO UPDATE SET place_id = EXCLUDED.place_id,
                   name = EXCLUDED.name,
                   description = EXCLUDED.description,
                   updated_at = now()
     RETURNING ${ITEM_COLUMNS}`,
    [user.id, resolvedPlaceId, name, description, qrString]
  );

  res.json({
    status: 'ok',
    result: true,
    item: await getItemWithPlace(user.id, itemResult.rows[0]),
  });
}));

router.post('/upload_photo', upload.single('photo'), asyncHandler(async function uploadPhoto(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const targetType = cleanText(req.body.target_type);
  const targetId = Number(req.body.target_id || 0);

  if (targetType !== 'place' && targetType !== 'item') {
    error(res, 400, 'target_type must be place or item.');
    return;
  }

  if (!targetId) {
    error(res, 400, 'target_id is required.');
    return;
  }

  if (!req.file) {
    error(res, 400, 'Photo file is required.');
    return;
  }

  const tableName = targetType === 'place' ? 'places' : 'items';
  const existingResult = await db.query(
    `SELECT id, user_id
       FROM ${tableName}
      WHERE user_id = $1 AND id = $2
      LIMIT 1`,
    [user.id, targetId]
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    error(res, 404, targetType === 'place' ? 'Place was not found.' : 'Item was not found.');
    return;
  }

  const userDir = await ensureUserUploadDir(user.id);
  const fileName = crypto.randomBytes(24).toString('hex') + extensionFromMime(req.file.mimetype);
  const filePath = path.join(userDir, fileName);

  await fs.promises.writeFile(filePath, req.file.buffer);

  try {
    await db.query(
      `INSERT INTO entity_photos (
         user_id, target_type, place_id, item_id, file_name, mime, original_name, size, uploaded_at, sort_order
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, now(),
         COALESCE((
           SELECT MAX(sort_order) + 1
             FROM entity_photos
            WHERE user_id = $1
              AND target_type = $2
              AND (($2 = 'place' AND place_id = $3) OR ($2 = 'item' AND item_id = $4))
         ), 0)
       )`,
      [
        user.id,
        targetType,
        targetType === 'place' ? targetId : null,
        targetType === 'item' ? targetId : null,
        fileName,
        req.file.mimetype,
        req.file.originalname,
        req.file.size,
      ]
    );

    await db.query(
      `UPDATE ${tableName}
          SET updated_at = now()
        WHERE user_id = $1 AND id = $2`,
      [user.id, targetId]
    );
  } catch (err) {
    await removePhotoFile(user.id, fileName);
    throw err;
  }

  if (targetType === 'place') {
    const updatedResult = await db.query(
      `SELECT ${PLACE_COLUMNS}
         FROM places
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [user.id, targetId]
    );
    res.json({
      status: 'ok',
      result: true,
      place: await getPlaceWithItems(user.id, updatedResult.rows[0]),
    });
    return;
  }

  const updatedResult = await db.query(
    `SELECT ${ITEM_COLUMNS}
       FROM items
      WHERE user_id = $1 AND id = $2
      LIMIT 1`,
    [user.id, targetId]
  );
  res.json({
    status: 'ok',
    result: true,
    item: await getItemWithPlace(user.id, updatedResult.rows[0]),
  });
}));

router.post('/delete_photo', asyncHandler(async function deletePhoto(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const targetType = cleanText(req.body.target_type);
  const targetId = Number(req.body.target_id || 0);
  const photoId = Number(req.body.photo_id || 0);

  if (targetType !== 'place' && targetType !== 'item') {
    error(res, 400, 'target_type must be place or item.');
    return;
  }

  if (!targetId) {
    error(res, 400, 'target_id is required.');
    return;
  }

  if (!photoId) {
    error(res, 400, 'photo_id is required.');
    return;
  }

  const idColumn = targetType === 'place' ? 'place_id' : 'item_id';
  const photoResult = await db.query(
    `SELECT ${PHOTO_COLUMNS}
       FROM entity_photos
      WHERE user_id = $1
        AND target_type = $2
        AND id = $3
        AND ${idColumn} = $4
        AND deleted_at IS NULL
      LIMIT 1`,
    [user.id, targetType, photoId, targetId]
  );
  const photo = photoResult.rows[0];

  if (!photo) {
    error(res, 404, 'Photo was not found.');
    return;
  }

  await db.query(
    `UPDATE entity_photos SET deleted_at = now()
      WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [user.id, photoId]
  );

  const tableName = targetType === 'place' ? 'places' : 'items';
  await db.query(
    `UPDATE ${tableName}
        SET updated_at = now()
      WHERE user_id = $1 AND id = $2`,
    [user.id, targetId]
  );

  if (targetType === 'place') {
    const updatedResult = await db.query(
      `SELECT ${PLACE_COLUMNS}
         FROM places
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [user.id, targetId]
    );
    res.json({
      status: 'ok',
      result: true,
      place: await getPlaceWithItems(user.id, updatedResult.rows[0]),
    });
    return;
  }

  const updatedResult = await db.query(
    `SELECT ${ITEM_COLUMNS}
       FROM items
      WHERE user_id = $1 AND id = $2
      LIMIT 1`,
    [user.id, targetId]
  );
  res.json({
    status: 'ok',
    result: true,
    item: await getItemWithPlace(user.id, updatedResult.rows[0]),
  });
}));

router.post('/delete_place', asyncHandler(async function deletePlace(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const placeId = Number(req.body.place_id || 0);
  const photosResult = await db.query(
    `SELECT file_name
       FROM entity_photos
      WHERE user_id = $1 AND target_type = 'place' AND place_id = $2`,
    [user.id, placeId]
  );
  const result = await db.query(
    `DELETE FROM places
      WHERE user_id = $1 AND id = $2
      RETURNING id, user_id`,
    [user.id, placeId]
  );

  if (!result.rows[0]) {
    error(res, 404, 'Place was not found.');
    return;
  }

  for (const row of photosResult.rows) {
    await removePhotoFile(user.id, row.file_name);
  }
  res.json({ status: 'ok', result: true });
}));

router.post('/delete_item', asyncHandler(async function deleteItem(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const itemId = Number(req.body.item_id || 0);
  const photosResult = await db.query(
    `SELECT file_name
       FROM entity_photos
      WHERE user_id = $1 AND target_type = 'item' AND item_id = $2`,
    [user.id, itemId]
  );
  const result = await db.query(
    `DELETE FROM items
      WHERE user_id = $1 AND id = $2
      RETURNING id, user_id`,
    [user.id, itemId]
  );

  if (!result.rows[0]) {
    error(res, 404, 'Item was not found.');
    return;
  }

  for (const row of photosResult.rows) {
    await removePhotoFile(user.id, row.file_name);
  }
  res.json({ status: 'ok', result: true });
}));

router.use(function apiErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    error(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 8 MB or smaller.' : err.message);
    return;
  }

  if (err && err.message === 'Only image files are allowed.') {
    error(res, 400, err.message);
    return;
  }

  console.error(err);
  error(res, 500, 'Internal server error.');
});

module.exports = router;
