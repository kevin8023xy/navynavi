import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CSV_PATH = path.resolve(
  projectRoot,
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv',
);
const JSON_PATH = path.resolve(projectRoot, 'api', '_lib', 'records.json');

function main() {
  console.log('[build-data] Reading CSV from:', CSV_PATH);
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);

  if (lines.length === 0) throw new Error('CSV is empty');

  const headers = lines[0].split(',').map((h) => h.trim());
  const colIdx = {
    mmsi: headers.indexOf('MMSI'),
    lat: headers.indexOf('Latitude'),
    lng: headers.indexOf('Longitude'),
    sog: headers.indexOf('Speed Over Ground (SOG)'),
    cog: headers.indexOf('Course Over Ground (COG)'),
    heading: headers.indexOf('True Heading'),
    status: headers.indexOf('Navigational Status'),
    tsUnix: headers.indexOf('Timestamp (Unix)'),
  };

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(',');
    const ts = parseInt(cols[colIdx.tsUnix], 10);
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
      timestamp: ts,
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
