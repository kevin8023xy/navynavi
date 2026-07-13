import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
app.use(express.json({ limit: '1gb' }));

const API_DIR = path.join(__dirname, 'api');

// 加载 CommonJS 模块
const uploadHandler = require(path.join(API_DIR, 'upload.js'));
const deleteHandler = require(path.join(API_DIR, 'delete.js'));
const rebuildHandler = require(path.join(API_DIR, 'rebuild.js'));
const statsHandler = require(path.join(API_DIR, 'stats.js'));
const shipsHandler = require(path.join(API_DIR, 'ships.js'));
const tracksHandler = require(path.join(API_DIR, 'tracks.js'));
const stylesHandler = require(path.join(API_DIR, 'styles.js'));

// 定义路由（支持带/不带 .js 后缀）
app.post('/api/upload.js', uploadHandler);
app.post('/api/upload', uploadHandler);

app.post('/api/delete.js', deleteHandler);
app.post('/api/delete', deleteHandler);

app.post('/api/rebuild.js', rebuildHandler);
app.post('/api/rebuild', rebuildHandler);

app.get('/api/stats.js', statsHandler);
app.get('/api/stats', statsHandler);

app.get('/api/ships.js', shipsHandler);
app.get('/api/ships', shipsHandler);

app.get('/api/tracks.js', tracksHandler);
app.get('/api/tracks', tracksHandler);

app.get('/api/styles', stylesHandler);
app.post('/api/styles', stylesHandler);

// 处理 OPTIONS 请求
app.options('/api/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ API Server running on http://localhost:${PORT}`);
});
