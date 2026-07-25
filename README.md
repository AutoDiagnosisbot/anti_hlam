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

The app is exposed on port `8083`.

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
- Bind `item:*` codes as items and choose their place.
- Attach or replace photos from the binding screen or catalog.
- Use the catalog and search screens to find items and places.
