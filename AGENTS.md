# AGENTS.md

## Project Snapshot

This workspace looks like an old prototype for "AntiHlam": a personal inventory/catalog system for places and items, using QR codes to identify them.

Root folder: `D:\projects\ifmo`

Important folders:

- `hash-tag-routing-app/` - Angular 17 frontend tracked by the workspace root Git repository.
- `server/` - early Node/Express backend attempt.
- `description.txt` - empty.
- `test.js` - tiny JavaScript event-loop demo, not part of the app.

The workspace root is a Git repository with `origin` set to `git@github.com:AutoDiagnosisbot/anti_hlam.git`. The old nested Angular `.git` directory was removed from `hash-tag-routing-app/` so the frontend is tracked as normal source files in the root repository. A backup archive was saved outside the workspace as `D:\projects\ifmo_hash-tag-routing-app_git_backup_20260725_152830.zip`.

Current deployment target:

- Host: `olegpc`
- Path: `/home/oleg/anti_hlam`
- Runtime: Docker Compose
- Current mode: temporary plain HTTP without a domain, app published directly on port `8083`.
- App URL on the LAN: `http://192.168.0.109:8083` (check the host IP if DHCP changes it).
- Run `bash scripts/use-http.sh` to rebuild and switch from HTTPS; it backs up `.env` and stops nginx.
- HTTPS settings and certificates for `danechka.com` are preserved for switching back; certificate renewal skips runs while nginx is stopped.

## Frontend

Path: `hash-tag-routing-app/`

Stack:

- Angular 17.1
- Angular Material
- PWA/service worker config
- `angularx-qrcode` for QR generation
- ZXing through `WideCodeScanner` for QR, barcode, and Data Matrix scanning

Useful commands:

```powershell
cd D:\projects\ifmo\hash-tag-routing-app
npm start
npm run build
npm test
```

Observed validation:

- `npm run build` succeeds.
- Build warnings: initial bundle exceeds the configured 500 kB warning budget, and `angularx-qrcode` pulls a CommonJS `qrcode` dependency.

Current UI routes:

- `/login` - login screen.
- `/generator` - printable QR generator.
- `/binding` - QR scanner/binding screen.
- `/list-items` - catalog grouped by places.
- `/scan` - QR lookup/search workflow.

Implementation notes:

- Routing uses hash URLs via `RouterModule.forRoot(..., { useHash: true })`.
- `main.ts` bootstraps `AppModule`, while components are mostly standalone.
- `ApiService` uses `/api` in production and `http://localhost:8083/api` when Angular dev server runs on port `4200`.
- `LoginComponent` supports registration and authorization through the backend.
- Auth guard checks `localStorage.session_id` and redirects to `/login`.
- `GeneratorComponent` creates printable batches of `place:*` and `item:*` QR strings.
- `BindingComponent` can scan or manually accept QR payloads, detect places/items, and save them through the backend.
- `place:*` remains reserved for places; items can use either `item:*` labels or arbitrary factory QR payloads.
- Places and items have optional multiline descriptions, limited to 250 characters.
- Places can be nested inside other places through `parent_place_id`.
- Places and items can each have multiple photos; legacy `photo_url` fields still expose the first photo for compatibility.
- `ListItemsComponent` loads the catalog tree from the backend and supports inline editing of names/descriptions/locations, deleting places/items, moving items, and photo upload/removal.
- `ScanComponent` resolves a QR into a place/item lookup result, including descriptions, photos, direct child places, and direct items.

## Backend

Path: `server/`

Current stack:

- Node.js
- Express
- PostgreSQL through `pg`
- Docker Compose for app + database

Useful commands:

```powershell
cd D:\projects\ifmo
docker compose up -d --build
```

Native backend development can use `docker compose up -d postgres` and `DATABASE_URL=postgres://anti_hlam:anti_hlam_dev_password@127.0.0.1:5433/anti_hlam`.

Current state:

- `server/server.js` starts Express on `PORT` or `8083`.
- The server exposes `/api/*` endpoints and serves the built Angular app from `hash-tag-routing-app/dist/hash-tag-routing-app/browser`.
- The server creates the PostgreSQL schema on startup.
- Schema additions are currently handled in startup SQL, including `places.parent_place_id`, `description` columns, and `entity_photos` for multi-photo attachments.
- Docker Compose runs the app and PostgreSQL; the app is exposed on port `8083`.
- Uploaded photos are stored in the Docker volume `anti_hlam_uploads` and served from `/uploads/...`.
- The old `server/config/config.json` contains legacy secrets and is ignored by Git.

Original backend task:

- See `server/gpt_task.txt`.
- Intended endpoints:
  - `POST /authorize` with `username` and `password`, returns `session_id`.
  - `POST /register` with `username` and `password`, returns `result: true/false`.
  - `POST /get_full_list` with `session_id`, returns places/items for that user.
- Intended MySQL tables:
  - `users`
  - `places`
  - `items`

Implemented MVP endpoints:

- `POST /api/register`
- `POST /api/authorize`
- `POST /api/logout`
- `POST /api/get_full_list`
- `POST /api/resolve_qr`
- `POST /api/save_place`
- `POST /api/save_item`
- `POST /api/upload_photo`
- `POST /api/delete_photo`
- `POST /api/delete_place`
- `POST /api/delete_item`

## Security Notes

- `server/config/config.json` contains hardcoded database credentials and Telegram bot tokens from the legacy attempt.
- Do not copy those secrets into documentation, commits, logs, or chat output.
- Before publishing or continuing serious backend work, move secrets to environment variables and rotate any exposed tokens/passwords.
- The original task stored plain text passwords in `users.password`; the current backend stores PBKDF2 password hashes.

## Likely Next Work

Good future steps, in practical order:

1. Add versioned SQL migrations instead of startup `CREATE TABLE IF NOT EXISTS`.
2. Add editing/renaming flows directly in the catalog.
3. Add HTTPS or a reverse proxy for camera access from phones when not using localhost.
4. Add backend tests and a small frontend smoke test.
5. Rotate any legacy secrets that were ever exposed.

## Files To Avoid Editing Casually

- `hash-tag-routing-app/node_modules/`
- `hash-tag-routing-app/dist/`
- `.angular/`
- `.idea/`
- local `.env` files
- ZIP archives such as `hash-tag-routing-app.zip` and `src/app/binding.zip`
