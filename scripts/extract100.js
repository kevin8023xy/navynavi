import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_PATH = path.resolve(projectRoot, 'api', '_lib', 'records.json');
const TARGET_PATH = path.resolve(projectRoot, 'api', '_lib', 'record1.json');
const COUNT = 100;

function main() {
  console.log(`[extract100] Reading ${SOURCE_PATH}`);
  const raw = fs.readFileSync(SOURCE_PATH, 'utf-8');
  const records = JSON.parse(raw);

  if (!Array.isArray(records)) {
    throw new Error('records.json is not an array');
  }

  const first100 = records.slice(0, COUNT);
  console.log(`[extract100] Extracted ${first100.length} records`);

  fs.writeFileSync(TARGET_PATH, JSON.stringify(first100, null, 2));
  const size = fs.statSync(TARGET_PATH).size / 1024;
  console.log(
    `[extract100] Wrote ${TARGET_PATH} (${size.toFixed(2)} KB)`,
  );
}

main();
