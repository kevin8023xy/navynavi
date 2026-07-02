import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

// ESM 下补全 __dirname（Vercel 的 @vercel/nft 能正确追踪这种写法）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// 类型定义
// ============================================================
export interface ShipRecord {
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

export interface ShipLatest {
  mmsi: number;
  lat: number;
  lng: number;
  sog: number | null;
  cog: number | null;
  lastTimestamp: number;
  lastIso: string;
}

export interface TrackQuery {
  mmsi?: string;
  start_time?: number;
  end_time?: number;
  bbox?: string;
  page: number;
  page_size: number;
}

export interface TrackResult {
  total: number;
  page: number;
  page_size: number;
  data: ShipRecord[];
}

// ============================================================
// 模块级缓存 —— 冷启动只读一次 CSV，后续热请求直接复用
// 未来切换数据源时只需替换 loadFromCSV → loadFromSupabase
// ============================================================
let cachedRecords: ShipRecord[] | null = null;
let loadPromise: Promise<ShipRecord[]> | null = null;

const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';

function resolveCsvPath(): string {
  // CSV 在 api/ 目录下，data.ts 在 api/_lib/，往上跳一层就是 CSV 所在位置
  // Vercel 的 @vercel/nft 捆包器能静态分析 path.resolve(__dirname, '..', ...) 这种模式
  const primaryPath = path.resolve(__dirname, '..', CSV_FILENAME);
  if (fs.existsSync(primaryPath)) return primaryPath;

  // 兜底：本地运行时尝试项目根目录
  const fallback = path.resolve(__dirname, '..', '..', CSV_FILENAME);
  if (fs.existsSync(fallback)) return fallback;

  console.error('[Data] CSV not found. Tried:', primaryPath, fallback);
  throw new Error(`CSV file not found at ${primaryPath}`);
}

function loadFromCSV(): Promise<ShipRecord[]> {
  return new Promise((resolve, reject) => {
    const records: ShipRecord[] = [];
    const csvPath = resolveCsvPath();

    console.log('[Data] CSV path:', csvPath);
    console.log('[Data] CWD:', process.cwd());

    if (!fs.existsSync(csvPath)) {
      const err = new Error(
        `CSV not found: ${csvPath}. CWD=${process.cwd()}, ENV=${process.env.VERCEL_ENV || 'local'}`,
      );
      console.error(err.message);
      return reject(err);
    }

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row: Record<string, string>) => {
        const ts = parseInt(row['Timestamp (Unix)'], 10);
        if (!isNaN(ts)) {
          records.push({
            mmsi: parseInt(row['MMSI'], 10) || 0,
            lat: parseFloat(row['Latitude']) || 0,
            lng: parseFloat(row['Longitude']) || 0,
            sog: row['Speed Over Ground (SOG)']
              ? parseFloat(row['Speed Over Ground (SOG)'])
              : null,
            cog: row['Course Over Ground (COG)']
              ? parseFloat(row['Course Over Ground (COG)'])
              : null,
            heading: row['True Heading']
              ? parseFloat(row['True Heading'])
              : null,
            status: row['Navigational Status']
              ? parseInt(row['Navigational Status'], 10)
              : null,
            timestamp: ts,
            iso: row['Timestamp (ISO)'] || '',
          });
        }
      })
      .on('end', () => {
        records.sort((a, b) => a.timestamp - b.timestamp);
        cachedRecords = records;
        console.log(
          `[Data] Loaded ${records.length} records, ` +
            `${new Set(records.map((r) => r.mmsi)).size} ships`,
        );
        resolve(records);
      })
      .on('error', reject);
  });
}

// ---- 公共 API ----

export async function getAllRecords(): Promise<ShipRecord[]> {
  if (cachedRecords) return cachedRecords;
  if (!loadPromise) {
    loadPromise = loadFromCSV();
  }
  return loadPromise;
}

export async function getShipsLatest(): Promise<ShipLatest[]> {
  const records = await getAllRecords();
  const latestMap = new Map<number, ShipRecord>();

  for (const r of records) {
    const existing = latestMap.get(r.mmsi);
    if (!existing || r.timestamp > existing.timestamp) {
      latestMap.set(r.mmsi, r);
    }
  }

  return Array.from(latestMap.values()).map((r) => ({
    mmsi: r.mmsi,
    lat: r.lat,
    lng: r.lng,
    sog: r.sog,
    cog: r.cog,
    lastTimestamp: r.timestamp,
    lastIso: r.iso,
  }));
}

export async function queryTracks(q: TrackQuery): Promise<TrackResult> {
  const records = await getAllRecords();
  let filtered = records;

  // MMSI 筛选
  if (q.mmsi) {
    const mmsiList = q.mmsi
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (mmsiList.length > 0) {
      const set = new Set(mmsiList);
      filtered = filtered.filter((r) => set.has(r.mmsi));
    }
  }

  // 时间范围筛选
  if (q.start_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp >= q.start_time!);
  }
  if (q.end_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp <= q.end_time!);
  }

  // BBox 空间筛选
  if (q.bbox) {
    const parts = q.bbox
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    if (parts.length === 4) {
      const [minLat, maxLat, minLng, maxLng] = parts;
      filtered = filtered.filter(
        (r) =>
          r.lat >= minLat &&
          r.lat <= maxLat &&
          r.lng >= minLng &&
          r.lng <= maxLng,
      );
    }
  }

  // 分页
  const total = filtered.length;
  const startIdx = (q.page - 1) * q.page_size;
  const data = filtered.slice(startIdx, startIdx + q.page_size);

  return { total, page: q.page, page_size: q.page_size, data };
}

