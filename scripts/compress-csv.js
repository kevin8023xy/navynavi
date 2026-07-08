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
const OUT_PATH = path.resolve(projectRoot, 'public', 'data', 'ais.csv.gz');

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`[compress-csv] Source CSV not found at ${CSV_PATH}, skipping.`);
    return;
  }

  console.log('[compress-csv] Reading CSV...');
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const compressed = gzip(raw);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, compressed);

  const originalSize = Buffer.byteLength(raw, 'utf-8');
  const compressedSize = compressed.byteLength;
  console.log(
    `[compress-csv] Done. ${originalSize} bytes → ${compressedSize} bytes (${(
      (compressedSize / originalSize) *
      100
    ).toFixed(1)}%) at ${OUT_PATH}`,
  );
}

main();
