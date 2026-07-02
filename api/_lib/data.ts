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
// 运行时数据源：优先读取 CSV（生产环境），本地构建后的 JSON 作为可选缓存
// ============================================================
const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';

function findRecordsJson(): string | null {
  const candidates = [
    path.join(process.cwd(), 'api', '_lib', 'records.json'),
    path.join('/var/task', 'api', '_lib', 'records.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findCsv(): string | null {
  const candidates = [
    path.join(process.cwd(), CSV_FILENAME),
    path.join('/var/task', CSV_FILENAME),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseCsv(csvPath: string): ShipRecord[] {
  const raw = fs.readFileSync(csvPath, 'utf-8');
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
      heading: cols[colIdx.heading] ? parseFloat(cols[colIdx.heading]) : null,
      status: cols[colIdx.status] ? parseInt(cols[colIdx.status], 10) : null,
      timestamp: ts,
      iso: new Date(ts * 1000).toISOString(),
    });
  }

  records.sort((a, b) => a.timestamp - b.timestamp);
  return records;
}

function loadRecords(): ShipRecord[] {
  const jsonPath = findRecordsJson();
  if (jsonPath) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const records = JSON.parse(raw) as any[];
      return records.map((r) => ({
        mmsi: r.mmsi,
        lat: r.lat,
        lng: r.lng,
        sog: r.sog,
        cog: r.cog,
        heading: r.heading,
        status: r.status,
        timestamp: r.timestamp,
        iso: new Date(r.timestamp * 1000).toISOString(),
      }));
    } catch {
      // fallback to CSV
    }
  }

  const csvPath = findCsv();
  if (!csvPath) {
    throw new Error(
      `Cannot find data source: neither records.json nor ${CSV_FILENAME}`,
    );
  }
  return parseCsv(csvPath);
}

// ============================================================
// 模块级缓存：数据在模块加载时解析一次，后续直接复用
// ============================================================
const cachedRecords: ShipRecord[] = loadRecords();

// ---- 公共 API ----

export function getAllRecords(): ShipRecord[] {
  return cachedRecords;
}

export function getShipsLatest(): ShipLatest[] {
  const latestMap = new Map<number, ShipRecord>();

  for (const r of cachedRecords) {
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
  let filtered = cachedRecords;

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
