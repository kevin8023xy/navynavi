const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
app.use(cors()); // 允许所有跨域请求

const CSV_PATH = path.join(__dirname, '..', 'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv');

// 内存存储所有数据
let allRecords = [];
let loaded = false;

function loadData() {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        const ts = parseInt(row['Timestamp (Unix)'], 10);
        if (!isNaN(ts)) {
          records.push({
            mmsi: parseInt(row['MMSI'], 10) || 0,
            lat: parseFloat(row['Latitude']) || 0,
            lng: parseFloat(row['Longitude']) || 0,
            sog: row['Speed Over Ground (SOG)'] ? parseFloat(row['Speed Over Ground (SOG)']) : null,
            cog: row['Course Over Ground (COG)'] ? parseFloat(row['Course Over Ground (COG)']) : null,
            heading: row['True Heading'] ? parseFloat(row['True Heading']) : null,
            status: row['Navigational Status'] ? parseInt(row['Navigational Status'], 10) : null,
            timestamp: ts,
            iso: row['Timestamp (ISO)'] || '',
          });
        }
      })
      .on('end', () => {
        records.sort((a, b) => a.timestamp - b.timestamp);
        allRecords = records;
        loaded = true;
        console.log(`[Server] Loaded ${allRecords.length} records, ${new Set(allRecords.map(r => r.mmsi)).size} ships`);
        resolve();
      })
      .on('error', reject);
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', total: allRecords.length, ships: new Set(allRecords.map(r => r.mmsi)).size });
});

app.get('/api/ships', (req, res) => {
  // 每艘船的最后一条记录
  const latestMap = new Map();
  for (const r of allRecords) {
    const existing = latestMap.get(r.mmsi);
    if (!existing || r.timestamp > existing.timestamp) {
      latestMap.set(r.mmsi, r);
    }
  }
  const result = Array.from(latestMap.values()).map(r => ({
    mmsi: r.mmsi,
    lat: r.lat,
    lng: r.lng,
    sog: r.sog,
    cog: r.cog,
    lastTimestamp: r.timestamp,
    lastIso: r.iso,
  }));
  res.json(result);
});

app.get('/api/tracks', (req, res) => {
  const mmsiRaw = req.query.mmsi || '';
  const start_time = req.query.start_time ? parseInt(req.query.start_time, 10) : null;
  const end_time = req.query.end_time ? parseInt(req.query.end_time, 10) : null;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const page_size = Math.min(Math.max(1, parseInt(req.query.page_size || '500', 10)), 500000);
  const bbox = req.query.bbox || '';

  let filtered = allRecords;

  if (mmsiRaw) {
    const mmsiList = mmsiRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (mmsiList.length) {
      const set = new Set(mmsiList);
      filtered = filtered.filter(r => set.has(r.mmsi));
    }
  }

  if (start_time !== null) {
    filtered = filtered.filter(r => r.timestamp >= start_time);
  }
  if (end_time !== null) {
    filtered = filtered.filter(r => r.timestamp <= end_time);
  }

  if (bbox) {
    const parts = bbox.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    if (parts.length === 4) {
      const [minLat, maxLat, minLng, maxLng] = parts;
      filtered = filtered.filter(r => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng);
    }
  }

  const total = filtered.length;
  const startIdx = (page - 1) * page_size;
  const data = filtered.slice(startIdx, startIdx + page_size);

  res.json({ total, page, page_size, data });
});

const PORT = 5000;
loadData().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[Server] Failed to load CSV:', err);
  process.exit(1);
});
