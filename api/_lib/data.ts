import fs from 'fs';
import path from 'path';

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
// 模块级缓存
// ============================================================
let cachedRecords: ShipRecord[] | null = null;

const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';

function findCsvPath(): string {
  // 按优先级尝试多个可能路径
  const candidates = [
    // Vercel: CSV 在 api/ 目录下，CWD = /var/task
    path.join(process.cwd(), 'api', CSV_FILENAME),
    // 本地开发: CSV 在项目根目录下
    path.join(process.cwd(), CSV_FILENAME),
    // Vercel 备选
    path.join('/var/task', 'api', CSV_FILENAME),
    path.join('/var/task', CSV_FILENAME),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log('[Data] Found CSV at:', p);
      return p;
    }
  }

  console.error('[Data] CSV not found. CWD:', process.cwd());
  console.error('[Data] Tried:', candidates);
  throw new Error(
    `CSV file not found. CWD=${process.cwd()}. Tried: ${candidates.join(', ')}`,
  );
}

function parseCSV(): ShipRecord[] {
  const csvPath = findCsvPath();
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);

  if (lines.length === 0) throw new Error('CSV is empty');

  // 解析表头找到列索引
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
    tsIso: headers.indexOf('Timestamp (ISO)'),
  };

  const records: ShipRecord[] = [];

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
      iso: cols[colIdx.tsIso] || '',
    });
  }

  records.sort((a, b) => a.timestamp - b.timestamp);
  return records;
}

// ---- 公共 API ----

export function getAllRecords(): ShipRecord[] {
  if (!cachedRecords) {
    console.log('[Data] Loading CSV...');
    const start = Date.now();
    cachedRecords = parseCSV();
    const ships = new Set(cachedRecords.map((r) => r.mmsi)).size;
    console.log(
      `[Data] Loaded ${cachedRecords.length} records, ${ships} ships in ${Date.now() - start}ms`,
    );
  }
  return cachedRecords;
}

export function getShipsLatest(): ShipLatest[] {
  const records = getAllRecords();
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

export function queryTracks(q: TrackQuery): TrackResult {
  const records = getAllRecords();
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
