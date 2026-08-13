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
const crossingsHandler = require(path.join(API_DIR, 'crossings.js'));
const spacingHandler = require(path.join(API_DIR, 'spacing.js'));
const injectHandler = require(path.join(API_DIR, 'inject.js'));
const zoneStatsHandler = require(path.join(API_DIR, 'zone-stats.js'));

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

app.get('/api/crossings.js', crossingsHandler);
app.get('/api/crossings', crossingsHandler);

app.get('/api/spacing.js', spacingHandler);
app.get('/api/spacing', spacingHandler);

app.get('/api/inject.js', injectHandler);
app.get('/api/inject', injectHandler);

app.get('/api/zone-stats.js', zoneStatsHandler);
app.get('/api/zone-stats', zoneStatsHandler);
app.post('/api/styles', stylesHandler);

// 处理 OPTIONS 请求
app.options('/api/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

const PORT = process.env.PORT || 5000;

// 启动前清理可能占用本端口的残留进程，避免 EADDRINUSE 连环失败
async function freePort(port) {
  const { execFile } = await import('child_process');
  const run = (cmd, args) =>
    new Promise((resolve) => {
      execFile(cmd, args, { windowsHide: true }, (err, out) => resolve(err ? '' : out));
    });
  const platform = process.platform;
  if (platform === 'win32') {
    const out = await run('netstat', ['-ano', '-p', 'TCP']);
    const pid = out
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .find((p) => p[1] && p[1].endsWith(`:${port}`) && (p[3] === 'LISTENING' || p[3] === 'LISTEN'))?.[4];
    if (pid) {
      await run('taskkill', ['/PID', pid, '/F']);
      console.log(`🧹 已清理占用端口 ${port} 的残留进程 (PID ${pid})`);
    }
  } else {
    const out = await run('lsof', ['-ti', `tcp:${port}`]);
    if (out.trim()) {
      for (const pid of out.trim().split('\n')) await run('kill', ['-9', pid]);
      console.log(`🧹 已清理占用端口 ${port} 的残留进程`);
    }
  }
}

await freePort(PORT);

app.listen(PORT, () => {
  console.log(`✅ API Server running on http://localhost:${PORT}`);
});
