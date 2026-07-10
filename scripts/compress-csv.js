import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { gzip } from 'pako';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CSV_PATH = path.resolve(
  projectRoot,
  'output',
  'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz',
);
const OUT_PATH = path.resolve(projectRoot, 'public', 'data', 'ais.csv.gz');

const OUTPUT_COLUMNS = [
  'MMSI',
  'Latitude',
  'Longitude',
  'Speed Over Ground (SOG)',
  'Course Over Ground (COG)',
  'True Heading',
  'Navigational Status',
  'Timestamp (Unix)',
  'Timestamp (ISO)',
  'Date',
  'Time (UTC)',
];

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = d.getUTCSeconds();
  return `${h}:${m}.${s}`;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`[compress-csv] Source CSV not found at ${CSV_PATH}, skipping.`);
    return;
  }

  console.log('[compress-csv] Reading CSV...');
  const raw = fs.readFileSync(CSV_PATH);
  const csvText = CSV_PATH.endsWith('.gz')
    ? zlib.gunzipSync(raw).toString('utf-8')
    : raw.toString('utf-8');
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) {
    console.warn('[compress-csv] Source CSV is empty.');
    return;
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const colIdx = {
    mmsi: headers.indexOf('mmsi'),
    lat: headers.indexOf('lat'),
    lon: headers.indexOf('lon'),
    sog: headers.indexOf('sog'),
    cog: headers.indexOf('cog'),
    heading: headers.indexOf('heading'),
    status: headers.indexOf('status'),
    tsMs: headers.indexOf('timestamp_ms'),
  };

  const outLines = [OUTPUT_COLUMNS.join(',')];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(',');
    const tsMs = parseInt(cols[colIdx.tsMs], 10);
    if (isNaN(tsMs)) continue;

    const mmsi = cols[colIdx.mmsi];
    const lat = cols[colIdx.lat];
    const lon = cols[colIdx.lon];
    const sog = cols[colIdx.sog] || '';
    const cog = cols[colIdx.cog] || '';
    const heading = cols[colIdx.heading] || '';
    const status = cols[colIdx.status] || '';
    const tsUnix = Math.floor(tsMs / 1000);
    const iso = new Date(tsMs).toISOString();

    outLines.push(
      [
        mmsi,
        lat,
        lon,
        sog,
        cog,
        heading,
        status,
        tsUnix,
        iso,
        formatDate(tsMs),
        formatTime(tsMs),
      ].join(','),
    );
  }

  const transformed = outLines.join('\n');
  const compressed = gzip(transformed);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, compressed);

  const originalSize = Buffer.byteLength(transformed, 'utf-8');
  const compressedSize = compressed.byteLength;
  console.log(
    `[compress-csv] Done. ${originalSize} bytes → ${compressedSize} bytes (${(
      (compressedSize / originalSize) *
      100
    ).toFixed(1)}%) at ${OUT_PATH}`,
  );
}

main();

