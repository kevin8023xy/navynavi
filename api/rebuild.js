'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { invalidateCache } = require('./lib/data');

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const projectRoot = process.cwd();
    const outputDir = path.resolve(projectRoot, 'output');
    const csvPath = path.join(outputDir, 'merged_feichang_ships_2021-10-01_2021-11-30.csv.gz');
    const jsonPath = path.join(projectRoot, 'api', 'lib', 'record1.json');

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    // 读取并解压 CSV
    console.log('[rebuild] Reading CSV from:', csvPath);
    const raw = fs.readFileSync(csvPath);
    const csvText = zlib.gunzipSync(raw).toString('utf-8');
    const lines = csvText.trim().split(/\r?\n/);

    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const colIdx = {
      mmsi: headers.indexOf('mmsi'),
      lat: headers.indexOf('lat'),
      lng: headers.indexOf('lon'),
      sog: headers.indexOf('sog'),
      cog: headers.indexOf('cog'),
      heading: headers.indexOf('heading'),
      status: headers.indexOf('status'),
      tsMs: headers.indexOf('timestamp_ms'),
    };

    // 检查必要的列
    if (colIdx.mmsi === -1 || colIdx.lat === -1 || colIdx.lng === -1 || colIdx.tsMs === -1) {
      return res.status(400).json({
        error: 'CSV must have mmsi, lat, lon, timestamp_ms columns',
      });
    }

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = line.split(',');
      const ts = parseInt(cols[colIdx.tsMs], 10);
      if (isNaN(ts)) continue;

      records.push({
        mmsi: parseInt(cols[colIdx.mmsi], 10) || 0,
        lat: parseFloat(cols[colIdx.lat]) || 0,
        lng: parseFloat(cols[colIdx.lng]) || 0,
        sog: cols[colIdx.sog] ? parseFloat(cols[colIdx.sog]) : null,
        cog: cols[colIdx.cog] ? parseFloat(cols[colIdx.cog]) : null,
        heading: cols[colIdx.heading] ? parseFloat(cols[colIdx.heading]) : null,
        status: cols[colIdx.status] ? parseInt(cols[colIdx.status], 10) : null,
        timestamp: Math.floor(ts / 1000),
      });
    }

    records.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[rebuild] Writing ${records.length} records to JSON...`);
    fs.writeFileSync(jsonPath, JSON.stringify(records));

    const jsonSize = (fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2);
    const csvSize = (fs.statSync(csvPath).size / 1024 / 1024).toFixed(2);

    console.log(
      `[rebuild] Done. Records: ${records.length}, JSON: ${jsonSize}MB, CSV: ${csvSize}MB`,
    );

    invalidateCache();

    return res.json({
      success: true,
      recordCount: records.length,
      jsonSizeMb: parseFloat(jsonSize),
      csvSizeMb: parseFloat(csvSize),
      message: 'Data rebuilt successfully. You may need to restart your app to reload the data.',
    });
  } catch (err) {
    console.error('[rebuild] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
