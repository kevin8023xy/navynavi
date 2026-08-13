// 从 output/merged_feichang_ships_2021-10-01_2021-11-30.csv.gz 重建 public/data/ais.csv.gz
// 问题：大 gz 的 `cog` 列被错误编码（整船锁死 128/-128/0 等），真实航向在 `rot` 列。
// 修复：用 `rot` 列作为 Course Over Ground (COG) 的来源，`heading` 列保持。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { inflate } = require('pako');

const SRC = path.resolve(__dirname, '..', 'output', 'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz');
const OUT = path.resolve(__dirname, '..', 'public', 'data', 'ais.csv.gz');

const buf = fs.readFileSync(SRC);
const txt = inflate(buf, { toText: true });
const lines = txt.split(/\r?\n/);
const header = lines[0].split(',');
const idx = {
  mmsi: header.indexOf('mmsi'),
  lon: header.indexOf('lon'),
  lat: header.indexOf('lat'),
  status: header.indexOf('status'),
  sog: header.indexOf('sog'),
  cog: header.indexOf('cog'), // 损坏列
  heading: header.indexOf('heading'),
  rot: header.indexOf('rot'), // 真实 COG
  tsMs: header.indexOf('timestamp_ms'),
};
if (idx.rot < 0) throw new Error('rot column not found in source');

// 输出列与前端现有 ais.csv.gz 完全一致
const OUT_COLS = [
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

function fmtDate(tsMs) {
  const d = new Date(tsMs);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
function fmtTime(tsMs) {
  const d = new Date(tsMs);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = d.getUTCSeconds();
  return `${h}:${m}.${s}`;
}

const outLines = [OUT_COLS.join(',')];
let fixed = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const c = line.split(',');
  const tsMs = parseInt(c[idx.tsMs], 10);
  if (isNaN(tsMs)) continue;

  let cog = parseFloat(c[idx.rot]); // 真实航向来自 rot 列
  const headingRaw = parseFloat(c[idx.heading]);
  const heading = !Number.isNaN(headingRaw) && headingRaw >= 0 && headingRaw < 360 ? headingRaw : 511;

  outLines.push(
    [
      c[idx.mmsi],
      c[idx.lat],
      c[idx.lon],
      c[idx.sog] || '',
      Number.isNaN(cog) ? '' : cog.toFixed(1),
      heading === 511 ? '511' : heading.toFixed(1),
      c[idx.status] || '',
      Math.floor(tsMs / 1000),
      new Date(tsMs).toISOString(),
      fmtDate(tsMs),
      fmtTime(tsMs),
    ].join(',')
  );
  fixed++;
}

const outText = outLines.join('\n');
const compressed = zlib.gzipSync(Buffer.from(outText, 'utf-8'));
fs.writeFileSync(OUT, compressed);

console.log(`Done. ${fixed} rows → ${OUT}`);
console.log(`Raw: ${(Buffer.byteLength(outText, 'utf-8') / 1024 / 1024).toFixed(2)} MB, gz: ${(compressed.byteLength / 1024 / 1024).toFixed(2)} MB`);
