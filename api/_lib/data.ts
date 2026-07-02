import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

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
  // 1) 优先使用当前文件相对路径（Vercel 打包后也能保持相对位置）
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '..', '..', CSV_FILENAME), // api/_lib -> project root
    path.resolve(currentDir, '..', CSV_FILENAME),        // 备选
    path.join(process.cwd(), CSV_FILENAME),              // 本地 dev 兜底
    path.join('/var/task', CSV_FILENAME),                // Vercel 运行时兜底
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 都尝试不到，返回最后一个候选路径，让后续报错信息里显示出来
  return candidates[candidates.length - 1];
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

