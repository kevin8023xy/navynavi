import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzip } from 'pako';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CSV_PATH = path.resolve(
  projectRoot,
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv',
);
const OUT_DIR = path.resolve(projectRoot, 'public', 'data');
const OUT_PATH = path.resolve(OUT_DIR, 'ais.csv.gz');

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  console.log('[compress-csv] Reading CSV from:', CSV_PATH);
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');

  console.log('[compress-csv] Compressing with gzip...');
  const compressed = gzip(raw);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUT_PATH, Buffer.from(compressed));

  const rawSize = raw.length / 1024 / 1024;
  const compressedSize = compressed.length / 1024 / 1024;
  console.log(
    `[compress-csv] Done. Raw: ${rawSize.toFixed(2)} MB, Compressed: ${compressedSize.toFixed(2)} MB → ${OUT_PATH}`,
  );
}

main();
