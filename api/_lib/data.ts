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
// 数据加载（懒加载）：模块加载时不读文件，第一次调用时再加载
// 这样 handler 里的 console.log 能先执行，错误也能被捕获并返回
// ============================================================
const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';
const SMALL_CSV_FILENAME = 'data_small.csv';

export interface DataLoadError {
  error: true;
  message: string;
  stack?: string;
  checkedPaths: string[];
  cwd: string;
  nodeVersion: string;
}

let cachedRecords: ShipRecord[] | DataLoadError | null = null;

function findFile(filenames: string[]): string | null {
  const dirs = [process.cwd(), '/var/task', path.join('/var/task', 'api')];
  for (const dir of dirs) {
    for (const filename of filenames) {
      const p = path.join(dir, filename);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function parseCsv(csvPath: string): ShipRecord[] {
  console.log('[data] reading CSV:', csvPath);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  console.log('[data] CSV size:', raw.length);

  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) throw new Error('CSV is empty');
  console.log('[data] lines:', lines.length);

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
  console.log('[data] parsed records:', records.length);
  return records;
}

function loadRecords(): ShipRecord[] {
  if (cachedRecords !== null) {
    if ('error' in cachedRecords) throw new Error(cachedRecords.message);
    return cachedRecords;
  }

  try {
    const useSmall = process.env.USE_SMALL_DATA === '1';
    const checkedPaths: string[] = [];

    // 1. 本地构建缓存
    if (!useSmall) {
      const jsonCandidates = [
        path.join(process.cwd(), 'api', '_lib', 'records.json'),
        path.join('/var/task', 'api', '_lib', 'records.json'),
      ];
      for (const p of jsonCandidates) {
        checkedPaths.push(p);
        if (fs.existsSync(p)) {
          console.log('[data] loading records.json:', p);
          const raw = fs.readFileSync(p, 'utf-8');
          const records = JSON.parse(raw) as any[];
          cachedRecords = records.map((r) => ({
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
          console.log('[data] loaded from records.json:', cachedRecords.length);
          return cachedRecords;
        }
      }
    }

    // 2. 小数据集（用于测试）
    if (useSmall) {
      const smallPath = findFile([SMALL_CSV_FILENAME]);
      checkedPaths.push('(small csv search)');
      if (smallPath) {
        cachedRecords = parseCsv(smallPath);
        return cachedRecords;
      }
    }

    // 3. 完整 CSV
    const csvPath = findFile([CSV_FILENAME]);
    checkedPaths.push('(full csv search)');
    if (csvPath) {
      cachedRecords = parseCsv(csvPath);
      return cachedRecords;
    }

    // 找不到数据源
    const checkedPaths2 = [
      path.join(process.cwd(), 'api', '_lib', 'records.json'),
      path.join('/var/task', 'api', '_lib', 'records.json'),
      path.join(process.cwd(), CSV_FILENAME),
      path.join('/var/task', CSV_FILENAME),
      path.join('/var/task', 'api', CSV_FILENAME),
    ];
    throw new Error(
      `Cannot find data source. Checked: ${checkedPaths2.join(', ')}`,
    );
  } catch (err: any) {
    console.error('[data] load failed:', err?.message, err?.stack);
    cachedRecords = {
      error: true,
      message: err?.message || String(err),
      stack: err?.stack,
      checkedPaths: [
        path.join(process.cwd(), 'api', '_lib', 'records.json'),
        path.join('/var/task', 'api', '_lib', 'records.json'),
        path.join(process.cwd(), CSV_FILENAME),
        path.join('/var/task', CSV_FILENAME),
        path.join('/var/task', 'api', CSV_FILENAME),
      ],
      cwd: process.cwd(),
      nodeVersion: process.version,
    };
    throw new Error(cachedRecords.message);
  }
}

function ensureRecords(): ShipRecord[] {
  const records = loadRecords();
  if ('error' in records) {
    throw new Error(records.message);
  }
  return records;
}

// ---- 公共 API ----

export function getAllRecords(): ShipRecord[] {
  return ensureRecords();
}

export function getShipsLatest(): ShipLatest[] {
  const records = ensureRecords();
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
  let filtered = ensureRecords();

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
