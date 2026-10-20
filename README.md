# AntiHlam

AntiHlam is a small inventory app for cataloging places and items with QR codes.

## Run With Docker

Create an optional `.env` from `.env.example`, then start the app and PostgreSQL:

```bash
docker compose up -d --build
```

Open `http://localhost:8083`.

## Current Deployment

On `olegpc`, the project is deployed in `/home/oleg/anti_hlam` and runs through Docker Compose:

```bash
cd /home/oleg/anti_hlam
docker compose ps
docker compose logs -f app
docker compose restart app
```

The current deployment temporarily uses plain HTTP without a domain at
`http://192.168.0.109:8083`. Use the host's current IP if its LAN address changes.

To switch an existing HTTPS deployment to HTTP on port `8083` and rebuild the app:

```bash
cd /home/oleg/anti_hlam
bash scripts/use-http.sh
```

The script backs up `.env` to `.env.before-http.<timestamp>`, sets
`APP_HTTP_BIND=8083`, stops nginx, and starts the app and PostgreSQL. Existing
database and photo volumes are kept. Scheduled certificate renewal skips runs
while nginx is stopped.

To return to the existing HTTPS setup, set `APP_HTTP_BIND=127.0.0.1:18083` in
`.env` and run `docker compose --profile https up -d app nginx`. The saved domain
and certificate settings remain available; renew the certificate if it expired.

Camera scanning on mobile browsers requires a secure context. `http://192.168...`
works for the app UI, but camera access needs `https://...` or a browser-specific
development override.

## HTTPS On Port 8083

For mobile camera scanning, run the public site through nginx with a real
Let's Encrypt certificate. The app can still be opened on external port `8083`;
nginx will listen on that host port and proxy to the app container.

DNS and router requirements:

- The domain `A` record points to the public IP of the router.
- The router forwards TCP `80` to `olegpc:80` for Let's Encrypt HTTP validation.
- The router forwards TCP `8083` to `olegpc:8083` for the HTTPS app.

On `olegpc`, set production HTTPS values in `.env`:

```env
APP_HTTP_BIND=127.0.0.1:18083
HTTP_BIND=80
HTTPS_BIND=8083
PUBLIC_HTTPS_PORT=8083
DOMAIN=your-domain.example
LETSENCRYPT_EMAIL=you@example.com
CERTBOT_STAGING=0
```

Then issue the certificate and start nginx:

```bash
cd /home/oleg/anti_hlam
bash scripts/init-letsencrypt.sh
```

For this deployment the domain is `danechka.com`, so after that the app should
be available at `https://danechka.com:8083`.

Certificate renewal can be run manually or from cron:

```bash
cd /home/oleg/anti_hlam
bash scripts/renew-letsencrypt.sh
```

## Native Development

You can also run PostgreSQL in Docker and run the Node server locally:

```powershell
docker compose up -d postgres
cd D:\projects\ifmo\server
npm install
$env:DATABASE_URL="postgres://anti_hlam:anti_hlam_dev_password@127.0.0.1:5433/anti_hlam"
npm start
```

Build the frontend separately:

```powershell
cd D:\projects\ifmo\hash-tag-routing-app
npm install
npm run build
```

## Data

Data is stored in PostgreSQL. The Docker volume is named `anti_hlam_pgdata`.
Uploaded photos are stored in the Docker volume `anti_hlam_uploads` and served from `/uploads/...`.

## Main Workflows

- Create an account on the login screen.
- Print QR codes in the QR section.
- Bind `place:*` codes as places.
- Bind `item:*` codes or factory QR codes as items and choose their place.
- Factory item codes can be QR, Data Matrix, or common 1D barcodes such as EAN/UPC/Code 128.
- Attach multiple photos from the binding screen or catalog and click a thumbnail to enlarge it.
- A separate photo-delete button requires confirmation. Individual deleted photos retain their files and metadata for recovery (`entity_photos.deleted_at`).
- Use the catalog and search screens to find items and places.
