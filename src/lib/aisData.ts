import Papa from 'papaparse';
import { inflate } from 'pako';
import { openDB } from 'idb';

const DB_NAME = 'ais-db';
const DB_VERSION = 2; // Increment to force cache refresh
const CSV_URL = '/data/ais.csv.gz';
const WRITE_BATCH_SIZE = 5000;

let loadPromise: Promise<void> | null = null;

export interface AisRecord {
  mmsi: number;
  lat: number;
  lng: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  status: number | null;
  timestamp: number;
  iso: string;
}

function openAisDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('records')) {
        const store = db.createObjectStore('records', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('byTimestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });
}

async function isCacheValid(db: any): Promise<boolean> {
  const tx = db.transaction('meta', 'readonly');
  const store = tx.objectStore('meta');
  const meta = await store.get('recordsCount');
  return typeof meta?.value === 'number' && meta.value > 0;
}

async function getFileMeta(): Promise<{
  lastModified: string | null;
  etag: string | null;
}> {
  try {
    const res = await fetch(CSV_URL, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return {
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
    };
  } catch (err) {
    console.warn('[aisData] Failed to fetch file meta:', err);
    return { lastModified: null, etag: null };
  }
}

async function isIndexedDBCacheValid(db: any): Promise<boolean> {
  const hasRecords = await isCacheValid(db);
  if (!hasRecords) return false;

  const fileMeta = await getFileMeta();
  const cachedMeta = await db.get('meta', 'fileMeta');

  // 如果拿不到服务器文件 meta，保守地认为缓存失效，重新拉取
  if (!fileMeta.lastModified && !fileMeta.etag) {
    return false;
  }

  return (
    cachedMeta?.lastModified === fileMeta.lastModified &&
    cachedMeta?.etag === fileMeta.etag
  );
}

async function clearRecords(db: any) {
  const tx = db.transaction('records', 'readwrite');
  await tx.objectStore('records').clear();
  await tx.done;
}

async function writeMeta(db: any, count: number) {
  const tx = db.transaction('meta', 'readwrite');
  await tx.objectStore('meta').put({ key: 'recordsCount', value: count });
  await tx.done;
}

async function writeFileMeta(
  db: any,
  fileMeta: { lastModified: string | null; etag: string | null },
) {
  await db.put('meta', {
    key: 'fileMeta',
    lastModified: fileMeta.lastModified,
    etag: fileMeta.etag,
  });
}

function parseValue(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function parseRecord(row: Record<string, string>): AisRecord | null {
  const timestamp = parseInt(row['Timestamp (Unix)'], 10);
  const mmsi = parseInt(row['MMSI'], 10);
  const lat = parseFloat(row['Latitude']);
  const lng = parseFloat(row['Longitude']);

  if (
    Number.isNaN(timestamp) ||
    Number.isNaN(mmsi) ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return null;
  }

  return {
    mmsi,
    lat,
    lng,
    sog: parseValue(row['Speed Over Ground (SOG)']),
    cog: parseValue(row['Course Over Ground (COG)']),
    heading: parseValue(row['True Heading']),
    status: parseValue(row['Navigational Status']),
    timestamp,
    iso: row['Timestamp (ISO)'] || '',
  };
}

async function loadCsv(progress?: (percent: number) => void): Promise<void> {
  const db = await openAisDB();

  await clearRecords(db);
  progress?.(5);

  const res = await fetch(CSV_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${CSV_URL}: ${res.status}`);
  }

  const fileMeta = {
    lastModified: res.headers.get('last-modified'),
    etag: res.headers.get('etag'),
  };

  progress?.(15);

  const compressed = new Uint8Array(await res.arrayBuffer());

  let csvText: string;
  try {
    csvText = inflate(compressed, { toText: true });
  } catch {
    // Browser/server may have already decompressed the .gz file via Content-Encoding
    csvText = new TextDecoder().decode(compressed);
  }

  progress?.(25);

  const records: AisRecord[] = [];
  const estimatedTotal = 1867775;

  await new Promise<void>((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      step: (results) => {
        const record = parseRecord(results.data as Record<string, string>);
        if (record) {
          records.push(record);
        }
        if (records.length % 5000 === 0) {
          const percent = Math.min(
            45,
            Math.round((records.length / estimatedTotal) * 20) + 25,
          );
          progress?.(percent);
        }
      },
      complete: () => resolve(),
      error: (err: any) => reject(err),
    });
  });

  progress?.(50);

  for (let i = 0; i < records.length; i += WRITE_BATCH_SIZE) {
    const batch = records.slice(i, i + WRITE_BATCH_SIZE);
    const tx = db.transaction('records', 'readwrite');
    for (const record of batch) {
      tx.store.add(record);
    }
    await tx.done;

    const percent = Math.min(
      99,
      Math.round((i / records.length) * 49) + 50,
    );
    progress?.(percent);
  }

  await writeMeta(db, records.length);
  await writeFileMeta(db, fileMeta);
  progress?.(100);
}

export async function loadAisData(
  progress?: (percent: number) => void,
): Promise<void> {
  // 如果已有进行中的加载，等待它完成
  if (loadPromise) return loadPromise;

  const db = await openAisDB();
  const cached = await isIndexedDBCacheValid(db);
  if (cached) {
    progress?.(100);
    return;
  }

  loadPromise = loadCsv(progress)
    .finally(() => {
      loadPromise = null;
    })
    .catch((err: unknown) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

export async function queryTracks(start: number, end: number): Promise<AisRecord[]> {
  const db = await openAisDB();
  const tx = db.transaction('records', 'readonly');
  const index = tx.store.index('byTimestamp');
  const range = IDBKeyRange.bound(start, end);
  return index.getAll(range);
}
