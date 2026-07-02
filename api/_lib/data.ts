import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const records = require('./records.json') as any[];


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
// 模块级缓存：JSON 在模块加载时由 Node 解析一次，后续直接复用
// ============================================================
const cachedRecords: ShipRecord[] = (records as any[]).map((r) => ({
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
