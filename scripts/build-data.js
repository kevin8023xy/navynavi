import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CSV_PATH = path.resolve(
  projectRoot,
  'output',
  'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz',
);
const JSON_PATH = path.resolve(projectRoot, 'lib', 'api', 'record1.json');

function getLimit() {
  const env = process.env.RECORD_LIMIT;
  if (env === 'all') return Infinity;
  // 默认加载所有数据，不限制
  if (!env) return Infinity;
  const n = parseInt(env, 10);
  return isNaN(n) ? Infinity : n;
}

function main() {
  const limit = getLimit();
  console.log('[build-data] Reading CSV from:', CSV_PATH);
  console.log(`[build-data] RECORD_LIMIT=${limit === Infinity ? 'all' : limit}`);
  const raw = fs.readFileSync(CSV_PATH);
  const csvText = CSV_PATH.endsWith('.gz')
    ? zlib.gunzipSync(raw).toString('utf-8')
    : raw.toString('utf-8');
  const lines = csvText.trim().split(/\r?\n/);

  if (lines.length === 0) throw new Error('CSV is empty');

  const headers = lines[0].split(',').map((h) => h.trim());
  const colIdx = {
    mmsi: headers.indexOf('mmsi'),
    lat: headers.indexOf('lat'),
    lng: headers.indexOf('lon'),
    sog: headers.indexOf('sog'),
    cog: headers.indexOf('cog'),
    heading: headers.indexOf('heading'),
    status: headers.indexOf('status'),
    tsMs: headers.indexOf('timestamp_ms'),
  };

  const records = [];

  for (let i = 1; i < lines.length && records.length < limit; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(',');
    const ts = parseInt(cols[colIdx.tsMs], 10);
    if (isNaN(ts)) continue;

    records.push({
      mmsi: parseInt(cols[colIdx.mmsi], 10) || 0,
      lat: parseFloat(cols[colIdx.lat]) || 0,
      lng: parseFloat(cols[colIdx.lng]) || 0,
      sog: cols[colIdx.sog] ? parseFloat(cols[colIdx.sog]) : null,
      cog: cols[colIdx.cog] ? parseFloat(cols[colIdx.cog]) : null,
      heading: cols[colIdx.heading]
        ? parseFloat(cols[colIdx.heading])
        : null,
      status: cols[colIdx.status]
        ? parseInt(cols[colIdx.status], 10)
        : null,
      timestamp: Math.floor(ts / 1000),
    });
  }

  records.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`[build-data] Writing ${records.length} records to JSON...`);
  fs.writeFileSync(JSON_PATH, JSON.stringify(records));

  const jsonSize = fs.statSync(JSON_PATH).size / 1024 / 1024;
  console.log(
    `[build-data] Done. JSON size: ${jsonSize.toFixed(2)} MB at ${JSON_PATH}`,
  );
}

main();
