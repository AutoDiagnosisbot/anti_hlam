const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');
const db = require('./lib/db');

const PORT = Number(process.env.PORT || 8083);
const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(function corsForLocalDevelopment(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', function health(req, res) {
  res.json({ status: 'ok', app: 'anti-hlam' });
});

const uploadsRoot = path.resolve(__dirname, 'uploads');

app.use('/uploads', express.static(uploadsRoot, {
  index: false,
  maxAge: '7d',
}));

app.use('/api', apiRouter);

const staticRoot = path.resolve(__dirname, '..', 'hash-tag-routing-app', 'dist', 'hash-tag-routing-app', 'browser');

app.use(express.static(staticRoot));
app.get('*', function spaFallback(req, res) {
  res.sendFile(path.join(staticRoot, 'index.html'), function onSendFileError(err) {
    if (err) {
      res.status(404).json({
        status: 'error',
        description: 'Frontend build was not found. Run npm run build in hash-tag-routing-app first.',
      });
    }
  });
});

async function start() {
  await db.ensureSchema();
  app.listen(PORT, function onListen() {
    console.log('AntiHlam server is running on port ' + PORT);
  });
}

start().catch(function onStartError(err) {
  console.error('Failed to start AntiHlam server');
  console.error(err);
  process.exit(1);
});

process.once('SIGINT', async function onSigint() {
  await db.close();
  process.exit(0);
});

process.once('SIGTERM', async function onSigterm() {
  await db.close();
  process.exit(0);
});
