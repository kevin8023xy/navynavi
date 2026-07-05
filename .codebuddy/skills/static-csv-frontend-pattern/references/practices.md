# Static CSV Frontend Pattern — Practices & Lessons

## 1. Decision tree

```
Dataset size?
├── < 1 MB, frequently updated
│   └── Use a normal REST API or fetch JSON directly.
├── 1–10 MB, static
│   └── Consider fetching the CSV/JSON raw and parsing in memory.
├── 10–50 MB, static, query by time/ID
│   └── Use gzip + streaming parse + IndexedDB (this pattern).
├── > 50 MB or complex SQL needed
│   └── Use SQLite/WASM or a real database backend.
└── Real-time or frequently updated
    └── Use a backend database or streaming API.
```

## 2. Backend rules (derived from this project)

### Rule 1: Do not put large static JSON inside a serverless function
A 20 MB CSV becomes ~23 MB JSON. Bundling it into a Vercel function:

- Pushes the package close to the 50 MB limit.
- Forces a cold start that loads the entire dataset into memory.
- Makes every query a memory-filter operation, which is slow and expensive.

### Rule 2: If you keep a backend API, make it optional and small
In this project the `/api/tracks` endpoint was kept as a fallback. It only loads a small default sample unless explicitly told to load everything. This preserves the backend without bloating the deployment.

```js
// build-data.js
function getLimit() {
  const env = process.env.RECORD_LIMIT;
  if (env === 'all') return Infinity;
  if (!env) return Infinity;  // default to full data for static deployments
  const n = parseInt(env, 10);
  return isNaN(n) ? 100 : n;
}
```

### Rule 3: Static assets beat API calls for read-only data
CDN edge caching, gzip/Brotli, and HTTP caching headers are far cheaper and faster than invoking a serverless function for every user.

## 3. Frontend rules (derived from this project)

### Rule 1: Compress the CSV at build time
Raw CSV: 19.99 MB. Gzip: 2.39 MB. The browser downloads the smaller file and inflates it locally.

```js
// scripts/compress-csv.js
import { gzip } from 'pako';
import fs from 'fs';

const raw = fs.readFileSync('ship_tracks_...csv', 'utf-8');
const compressed = gzip(raw);
fs.writeFileSync('public/data/ais.csv.gz', Buffer.from(compressed));
```

### Rule 2: Stream-parse, do not buffer the whole CSV in UI state
PapaParse with `step` lets you process rows as they arrive. Batch-write them into IndexedDB so memory usage stays flat.

```ts
Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  step: (results) => {
    const record = parseRecord(results.data as Record<string, string>);
    if (record) batch.push(record);
  },
  complete: () => writeBatchToIndexedDB(batch),
});
```

### Rule 3: Cache in IndexedDB with a time index
```ts
const db = await openDB('ais-db', 1, {
  upgrade(db) {
    const store = db.createObjectStore('records', {
      keyPath: 'id',
      autoIncrement: true,
    });
    store.createIndex('byTimestamp', 'timestamp');
  },
});

export async function queryTracks(start: number, end: number) {
  const db = await openDB('ais-db', 1);
  const tx = db.transaction('records', 'readonly');
  return tx.store.index('byTimestamp').getAll(IDBKeyRange.bound(start, end));
}
```

### Rule 4: Keep the progress UI honest
Expose a `progress` callback and update it during download, parse, and IndexedDB write phases. Fake spinners break trust on a 20 MB first load.

```ts
await loadAisData((percent) => setLoadProgress(percent));
```

### Rule 5: Query IndexedDB, not React state
When the playback time advances, query the time range from IndexedDB and hand the result to the renderer. Do not load all 200k rows into React state at once.

## 4. Pitfalls from this project

### Pitfall 1: pako v3 no longer has a default export
Old code:
```ts
import pako from 'pako';
const text = pako.inflate(buf, { to: 'string' });
```

Fixed code:
```ts
import { inflate } from 'pako';
const text = inflate(buf, { toText: true });
```

### Pitfall 2: Unix environment variables in npm scripts break on Windows
Original script:
```json
"prebuild": "RECORD_LIMIT=all node scripts/build-data.js"
```

This fails on Windows with `'RECORD_LIMIT' is not recognized`. Fix by moving the default into the script or using `cross-env`.

```json
"prebuild": "node scripts/build-data.js && node scripts/compress-csv.js"
```

```js
// build-data.js
if (!env) return Infinity;
```

### Pitfall 3: Maplibre basemap @2x tiles
If the raster tile URL contains `{y}@2x.png`, Maplibre will request that exact URL on high-DPI screens. CartoDB may fail or be blocked by CORS in some regions. Use `{y}.png` for a stable fallback.

```ts
tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png']
```

### Pitfall 4: PapaParse error callback needs an explicit type
TypeScript strict mode complains about the implicit `any` in:
```ts
error: (err) => reject(err)
```

Fix:
```ts
error: (err: any) => reject(err)
```

## 5. Key metrics from this project

| Item | Value |
|------|-------|
| Raw CSV | 19.99 MB |
| Gzip compressed | 2.39 MB (~88% reduction) |
| Records | 207,803 |
| Ships | 191 |
| First parse | ~1–3 seconds on modern browsers |
| Repeat visits | ~0 seconds (IndexedDB cache) |

## 6. Recommended folder structure

```
project/
├── scripts/
│   ├── build-data.js          # optional backend fallback
│   └── compress-csv.js        # gzip CSV → public/data/
├── src/
│   ├── lib/
│   │   └── aisData.ts         # fetch / inflate / parse / cache / query
│   └── components/
│       └── AisPlayback.tsx    # call loadAisData + queryTracks
├── public/
│   └── data/
│       └── ais.csv.gz
└── package.json
    "prebuild": "node scripts/build-data.js && node scripts/compress-csv.js"
```

## 7. When to choose SQLite/WASM instead

If you need any of the following, consider sql.js or DuckDB-WASM instead of this pattern:

- Complex SQL queries, joins, or aggregations.
- Frequent full-text search across text columns.
- Dataset larger than 100 MB decompressed.
- Need to share query logic between frontend and backend.

SQLite/WASM trades a slightly larger download (~5–8 MB) for full SQL power and much faster filtering.
