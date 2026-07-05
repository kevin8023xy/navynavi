'use strict';

const fs = require('fs');
const path = require('path');

// 直接 require JSON 数据，Vercel 打包时会将其包含在函数包中
const embeddedRecords = require('./record1.json');

const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';
const SMALL_CSV_FILENAME = 'data_small.csv';

let cachedRecords = null;

function findFile(filenames) {
  const dirs = [process.cwd(), '/var/task', path.join('/var/task', 'api')];
  for (const dir of dirs) {
    for (const filename of filenames) {
      const p = path.join(dir, filename);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function parseCsv(csvPath) {
  console.log('[data] reading CSV:', csvPath);
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

  const records = [];
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

function loadRecords() {
  if (cachedRecords !== null) return cachedRecords;

  const useSmall = process.env.USE_SMALL_DATA === '1';

  try {
    // 1. 优先使用内嵌的 record1.json（已通过 require 打包进函数）
    if (!useSmall && embeddedRecords && embeddedRecords.length > 0) {
      console.log('[data] using embedded record1.json:', embeddedRecords.length);
      cachedRecords = embeddedRecords.map((r) => ({
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
      return cachedRecords;
    }

    // 2. 尝试从文件系统读取（本地开发或备用）
    if (!useSmall) {
      const jsonCandidates = [
        path.join(process.cwd(), 'api', 'lib', 'record1.json'),
        path.join('/var/task', 'api', 'lib', 'record1.json'),
        path.join(__dirname, 'record1.json'),
        path.join(process.cwd(), 'api', 'lib', 'records.json'),
        path.join('/var/task', 'api', 'lib', 'records.json'),
      ];
      for (const p of jsonCandidates) {
        if (fs.existsSync(p)) {
          console.log('[data] loading json:', p);
          let raw = fs.readFileSync(p, 'utf-8');
          if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
          const records = JSON.parse(raw);
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
          console.log('[data] loaded from json:', cachedRecords.length);
          return cachedRecords;
        }
      }
    }

    // 3. 小数据集
    if (useSmall) {
      const smallPath = findFile([SMALL_CSV_FILENAME]);
      if (smallPath) {
        cachedRecords = parseCsv(smallPath);
        return cachedRecords;
      }
    }

    // 4. 完整 CSV
    const csvPath = findFile([CSV_FILENAME]);
    if (csvPath) {
      cachedRecords = parseCsv(csvPath);
      return cachedRecords;
    }

    throw new Error('Cannot find data source.');
  } catch (err) {
    console.error('[data] load failed:', err.message);
    throw err;
  }
}

function getAllRecords() {
  return loadRecords();
}

function getShipsLatest() {
  const records = loadRecords();
  const latestMap = new Map();
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

function queryTracks(q) {
  let filtered = loadRecords();

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

  if (q.start_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp >= q.start_time);
  }
  if (q.end_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp <= q.end_time);
  }

  if (q.bbox) {
    const parts = q.bbox
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    if (parts.length === 4) {
      const [minLat, maxLat, minLng, maxLng] = parts;
      filtered = filtered.filter(
        (r) => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng,
      );
    }
  }

  const total = filtered.length;
  const startIdx = (q.page - 1) * q.page_size;
  const data = filtered.slice(startIdx, startIdx + q.page_size);
  return { total, page: q.page, page_size: q.page_size, data };
}

module.exports = { getAllRecords, getShipsLatest, queryTracks };
